import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:bluetooth_low_energy/bluetooth_low_energy.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

import 'physical.dart';

/// Nordic UART Service, as advertised by the OpenRook firmware.
final nusService = UUID.fromString('6E400001-B5A3-F393-E0A9-E50E24DCCA9E');
final nusRx = UUID.fromString('6E400002-B5A3-F393-E0A9-E50E24DCCA9E'); // we write
final nusTx = UUID.fromString('6E400003-B5A3-F393-E0A9-E50E24DCCA9E'); // board notifies

enum BoardState { disconnected, scanning, connecting, connected }

class FoundBoard {
  FoundBoard(this.id, this.name, this.rssi, this.peripheral);
  final String id, name;
  final int rssi;
  final Peripheral peripheral;
}

/// The physical board over Bluetooth LE. It reports which squares are occupied and drags
/// pieces on request; see firmware/PROTOCOL.md.
class BoardLink extends ChangeNotifier {
  BoardLink._();
  static final BoardLink shared = BoardLink._();

  CentralManager? _managerInstance;
  CentralManager get _manager => _managerInstance ??= CentralManager();

  BoardState state = BoardState.disconnected;
  String? error;
  String? firmware;
  String? boardName;
  Set<int>? occupied; // latest sensor reading
  bool busy = false; // the gantry is moving
  bool sensorsOk = true;
  String? calibration;
  final List<String> log = [];
  final Map<String, FoundBoard> found = {};

  Peripheral? _peripheral;
  GATTCharacteristic? _rx;
  int _chunk = 20;
  final List<StreamSubscription> _subs = [];
  final _lines = StreamController<String>.broadcast();
  final _occupancy = StreamController<Set<int>>.broadcast();
  String _buffer = '';
  Future<void> _sending = Future.value();
  Completer<String>? _pending;
  String? _pendingVerb;

  bool get supported => !kIsWeb && (Platform.isAndroid || Platform.isIOS || Platform.isMacOS || Platform.isWindows || Platform.isLinux);
  bool get connected => state == BoardState.connected;
  Stream<String> get lines => _lines.stream;
  Stream<Set<int>> get occupancyChanges => _occupancy.stream;

  void _set(BoardState s, [String? err]) {
    state = s;
    error = err;
    notifyListeners();
  }

  Future<void> _permissions() async {
    if (kIsWeb || !Platform.isAndroid) return;
    final r = await [Permission.bluetoothScan, Permission.bluetoothConnect, Permission.locationWhenInUse].request();
    final ble = (r[Permission.bluetoothScan]?.isGranted ?? false) && (r[Permission.bluetoothConnect]?.isGranted ?? false);
    final loc = r[Permission.locationWhenInUse]?.isGranted ?? false;
    if (!ble && !loc) throw StateError('Bluetooth permission refused. Allow "Nearby devices" for OpenRook in Settings.');
  }

  Future<void> _poweredOn() async {
    if (_manager.state == BluetoothLowEnergyState.poweredOn) return;
    await _manager.stateChanged
        .firstWhere((e) => e.state == BluetoothLowEnergyState.poweredOn)
        .timeout(const Duration(seconds: 8), onTimeout: () => throw StateError('Bluetooth is ${_manager.state.name}. Turn it on.'));
  }

  StreamSubscription? _scanSub;

  Future<void> startScan() async {
    found.clear();
    try {
      await _permissions();
      await _poweredOn();
      _set(BoardState.scanning);
      _scanSub ??= _manager.discovered.listen((e) {
        final name = e.advertisement.name ?? 'OpenRook';
        found[e.peripheral.uuid.toString()] = FoundBoard(e.peripheral.uuid.toString(), name, e.rssi, e.peripheral);
        notifyListeners();
      });
      await _manager.startDiscovery(serviceUUIDs: [nusService]);
      Timer(const Duration(seconds: 15), stopScan);
    } catch (e) {
      _set(BoardState.disconnected, e.toString().replaceFirst('Bad state: ', ''));
    }
  }

  Future<void> stopScan() async {
    try {
      await _manager.stopDiscovery();
    } catch (_) {}
    if (state == BoardState.scanning) _set(BoardState.disconnected, error);
  }

  Future<void> connect(FoundBoard b) async {
    await stopScan();
    _set(BoardState.connecting);
    try {
      await _manager.connect(b.peripheral);
      try {
        await _manager.requestMTU(b.peripheral, mtu: 185);
      } catch (_) {} // Android only; iOS negotiates by itself
      try {
        _chunk = await _manager.getMaximumWriteLength(b.peripheral, type: GATTCharacteristicWriteType.withResponse);
      } catch (_) {}
      final services = await _manager.discoverGATT(b.peripheral);
      GATTCharacteristic? rx, tx;
      for (final s in services) {
        if (s.uuid != nusService) continue;
        for (final c in s.characteristics) {
          if (c.uuid == nusRx) rx = c;
          if (c.uuid == nusTx) tx = c;
        }
      }
      if (rx == null || tx == null) {
        await _manager.disconnect(b.peripheral);
        throw StateError('${b.name} is not an OpenRook board');
      }
      _peripheral = b.peripheral;
      _rx = rx;
      boardName = b.name;
      for (final s in _subs) {
        await s.cancel();
      }
      _subs
        ..clear()
        ..add(_manager.characteristicNotified.listen((e) {
          if (e.peripheral.uuid != _peripheral?.uuid || e.characteristic.uuid != nusTx) return;
          _onBytes(e.value);
        }))
        ..add(_manager.connectionStateChanged.listen((e) {
          if (e.peripheral.uuid == _peripheral?.uuid && e.state == ConnectionState.disconnected) {
            _peripheral = null;
            busy = false;
            _pending?.completeError(StateError('Board disconnected'));
            _pending = null;
            _set(BoardState.disconnected, 'Board disconnected');
          }
        }));
      await _manager.setCharacteristicNotifyState(b.peripheral, tx, state: true);
      _set(BoardState.connected);
      await send('HELLO');
    } catch (e) {
      _set(BoardState.disconnected, e.toString().replaceFirst('Bad state: ', ''));
    }
  }

  Future<void> disconnect() async {
    final p = _peripheral;
    _peripheral = null;
    if (p != null) {
      try {
        await _manager.disconnect(p);
      } catch (_) {}
    }
    occupied = null;
    _set(BoardState.disconnected);
  }

  void _onBytes(List<int> bytes) {
    _buffer += utf8.decode(bytes, allowMalformed: true);
    while (true) {
      final i = _buffer.indexOf('\n');
      if (i < 0) break;
      final line = _buffer.substring(0, i).trim();
      _buffer = _buffer.substring(i + 1);
      if (line.isNotEmpty) _onLine(line);
    }
  }

  void _onLine(String line) {
    log.add('< $line');
    if (log.length > 300) log.removeAt(0);
    final parts = line.split(' ');
    switch (parts[0]) {
      case 'BOARD':
        if (parts.length > 1) {
          occupied = parseOccupancy(parts[1]);
          _occupancy.add(occupied!);
        }
      case 'HELLO':
        firmware = parts.length > 2 ? parts[2] : null;
        sensorsOk = !line.contains('sensors=missing');
      case 'CAL':
        calibration = parts.skip(1).join(' ');
      case 'BUSY':
        busy = true;
      case 'IDLE':
        busy = false;
      case 'OK':
      case 'ERR':
        if (_pending != null && parts.length > 1 && parts[1] == _pendingVerb) {
          final p = _pending!;
          _pending = null;
          parts[0] == 'OK' ? p.complete(line) : p.completeError(StateError(line.substring(4)));
        }
    }
    _lines.add(line);
    notifyListeners();
  }

  /// Sends one command line (no reply awaited).
  Future<void> send(String line) {
    final rx = _rx, p = _peripheral;
    if (rx == null || p == null) return Future.value();
    log.add('> $line');
    final bytes = utf8.encode('$line\n');
    _sending = _sending.then((_) async {
      for (var i = 0; i < bytes.length; i += _chunk) {
        await _manager.writeCharacteristic(p, rx,
            value: Uint8List.fromList(bytes.sublist(i, i + _chunk > bytes.length ? bytes.length : i + _chunk)),
            type: GATTCharacteristicWriteType.withResponse);
      }
    }).catchError((_) {});
    notifyListeners();
    return _sending;
  }

  /// Sends a command and waits for its OK/ERR line.
  Future<String> command(String line, {Duration timeout = const Duration(seconds: 90)}) async {
    if (!connected) throw StateError('No board connected');
    while (_pending != null) {
      try {
        await _pending!.future;
      } catch (_) {}
    }
    final verb = line.split(' ').first.toUpperCase();
    final c = Completer<String>();
    _pending = c;
    _pendingVerb = verb;
    await send(line);
    return c.future.timeout(timeout, onTimeout: () {
      if (identical(_pending, c)) _pending = null;
      throw StateError('The board did not answer $verb');
    });
  }

  /// Drags pieces: pairs of squares, e.g. ['d5', 'B0', 'e4', 'd5'].
  Future<void> drag(List<String> squares) async {
    if (squares.isEmpty) return;
    await command('MOVE ${squares.join(' ')}');
  }

  Future<void> stop() => send('STOP');
}

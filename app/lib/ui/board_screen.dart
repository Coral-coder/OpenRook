import 'package:flutter/material.dart';

import '../board/board_link.dart';
import '../board/physical.dart';
import '../chess/position.dart';
import 'board_view.dart';

/// Find and connect the board, check the sensors, home and calibrate the gantry.
class BoardScreen extends StatefulWidget {
  const BoardScreen({super.key});
  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> {
  final board = BoardLink.shared;
  final _console = TextEditingController();
  double _sq = 40, _ax = 100, _ay = 40, _up = 20, _down = 95;

  @override
  void initState() {
    super.initState();
    board.addListener(_changed);
    _readCal();
    if (!board.connected && board.supported) board.startScan();
  }

  void _readCal() {
    final parts = (board.calibration ?? '').split(' ');
    if (parts.length >= 5) {
      _sq = double.tryParse(parts[0]) ?? _sq;
      _ax = double.tryParse(parts[1]) ?? _ax;
      _ay = double.tryParse(parts[2]) ?? _ay;
      _up = double.tryParse(parts[3]) ?? _up;
      _down = double.tryParse(parts[4]) ?? _down;
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    board.removeListener(_changed);
    board.stopScan();
    super.dispose();
  }

  Future<void> _run(String cmd) async {
    try {
      await board.command(cmd);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Bad state: ', ''))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Board')),
      body: ListView(padding: const EdgeInsets.all(12), children: board.connected ? _connected(context) : _scanning(context)),
    );
  }

  List<Widget> _scanning(BuildContext context) => [
        if (!board.supported) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Bluetooth boards need the Android, iOS or desktop app.'))),
        if (board.error != null) Card(color: Colors.red.shade900, child: Padding(padding: const EdgeInsets.all(12), child: Text(board.error!))),
        ListTile(
          title: Text(board.state == BoardState.scanning
              ? 'Looking for boards…'
              : board.state == BoardState.connecting
                  ? 'Connecting…'
                  : 'Make sure the board is powered on'),
          trailing: board.state == BoardState.scanning || board.state == BoardState.connecting
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : FilledButton(onPressed: board.supported ? board.startScan : null, child: const Text('Scan')),
        ),
        for (final b in board.found.values)
          Card(
            child: ListTile(
              leading: const Icon(Icons.grid_on),
              title: Text(b.name),
              subtitle: Text('Signal ${b.rssi} dBm'),
              onTap: () => board.connect(b),
            ),
          ),
      ];

  List<Widget> _connected(BuildContext context) {
    final occ = board.occupied ?? {};
    // Show the sensor reading as a board of pawns so a dead switch is obvious.
    final sensed = Position.fromFen('8/8/8/8/8/8/8/8 w - - 0 1');
    for (final s in occ) {
      sensed.board[s] = white | pawn;
    }
    return [
      Card(
        child: ListTile(
          leading: const Icon(Icons.check_circle, color: Colors.green),
          title: Text('${board.boardName} · firmware ${board.firmware ?? '?'}'),
          subtitle: Text(board.busy ? 'Moving…' : (board.sensorsOk ? '${occ.length} pieces on the board' : 'Sensor board (MCP23017) not found!')),
          trailing: TextButton(onPressed: board.disconnect, child: const Text('Disconnect')),
        ),
      ),
      const Padding(padding: EdgeInsets.all(8), child: Text('What the sensors see (place and lift pieces to test every square):')),
      Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 360), child: ChessBoardView(position: sensed, interactive: false))),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        FilledButton.icon(onPressed: () => _run('HOME'), icon: const Icon(Icons.home), label: const Text('Home')),
        OutlinedButton(onPressed: () => _run('CELL a1'), child: const Text('Go to a1')),
        OutlinedButton(onPressed: () => _run('CELL h8'), child: const Text('Go to h8')),
        OutlinedButton(onPressed: () => _run('MAG UP'), child: const Text('Magnet up')),
        OutlinedButton(onPressed: () => _run('MAG DOWN'), child: const Text('Magnet down')),
        OutlinedButton(onPressed: () => _run('MOVE e2 e4'), child: const Text('Test: e2→e4')),
        OutlinedButton(onPressed: () => _run('MOVE e4 e2'), child: const Text('Test: e4→e2')),
        OutlinedButton(onPressed: () => board.send('SCAN'), child: const Text('Rescan')),
        OutlinedButton(onPressed: () => board.send('STOP'), style: OutlinedButton.styleFrom(foregroundColor: Colors.redAccent), child: const Text('STOP')),
      ]),
      const SizedBox(height: 16),
      ExpansionTile(
        title: const Text('Calibration'),
        subtitle: const Text('Home, then "Go to a1": adjust until the magnet is right under a1'),
        children: [
          _slider('Square size (mm)', _sq, 30, 60, (v) => _sq = v),
          _slider('a1 centre X from home (mm)', _ax, 0, 200, (v) => _ax = v),
          _slider('a1 centre Y from home (mm)', _ay, 0, 120, (v) => _ay = v),
          _slider('Servo angle: magnet up', _up, 0, 180, (v) => _up = v, preview: true),
          _slider('Servo angle: magnet down', _down, 0, 180, (v) => _down = v, preview: true),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: () => _run('CELL a1'), child: const Text('Check a1')),
            TextButton(onPressed: () => _run('CELL h8'), child: const Text('Check h8')),
            FilledButton(
              onPressed: () async {
                await board.send('CAL ${_sq.toStringAsFixed(1)} ${_ax.toStringAsFixed(1)} ${_ay.toStringAsFixed(1)} ${_up.round()} ${_down.round()}');
              },
              child: const Text('Save to board'),
            ),
          ]),
        ],
      ),
      ExpansionTile(
        title: const Text('Console'),
        children: [
          Container(
            height: 200,
            color: Colors.black,
            padding: const EdgeInsets.all(6),
            child: ListView(reverse: true, children: [
              for (final l in board.log.reversed.take(100)) Text(l, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
            ]),
          ),
          TextField(
            controller: _console,
            decoration: const InputDecoration(hintText: 'Command, e.g. MOVE e2 e4 or POS'),
            onSubmitted: (v) {
              board.send(v);
              _console.clear();
            },
          ),
        ],
      ),
      Padding(
        padding: const EdgeInsets.all(8),
        child: Text('Occupancy: ${formatOccupancy(occ)}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
      ),
    ];
  }

  Widget _slider(String label, double value, double min, double max, void Function(double) set, {bool preview = false}) => ListTile(
        title: Text('$label: ${value.toStringAsFixed(preview ? 0 : 1)}'),
        subtitle: Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          divisions: ((max - min) * (preview ? 1 : 2)).round(),
          onChanged: (v) => setState(() => set(v)),
          onChangeEnd: preview ? (v) => board.send('SERVO ${v.round()}') : null,
        ),
      );
}

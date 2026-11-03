import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../net/nostr_pool.dart';

/// A friend match saved so it can be resumed (the relays keep its moves).
class SavedRoom {
  SavedRoom({required this.code, required this.host, required this.opponent, required this.created, this.finished = false});
  final String code;
  final bool host;
  String opponent;
  final int created;
  bool finished;

  Map<String, dynamic> toJson() => {'code': code, 'host': host, 'opponent': opponent, 'created': created, 'finished': finished};
  static SavedRoom fromJson(Map<String, dynamic> j) => SavedRoom(
        code: j['code'] as String,
        host: j['host'] as bool? ?? false,
        opponent: j['opponent'] as String? ?? 'Friend',
        created: j['created'] as int? ?? 0,
        finished: j['finished'] as bool? ?? false,
      );
}

class Settings extends ChangeNotifier {
  Settings._();
  static final Settings shared = Settings._();
  late SharedPreferences _p;

  String name = 'Player';
  late String secretKey;
  List<String> relays = List.of(defaultRelays);
  int engineLevel = 2;
  String lichessToken = '';
  String lichessUser = '';
  String chessComUser = '';
  bool autoFlip = true;
  int captureSlots = 8; // per side: 8 standard build, 16 wide build
  bool moveSounds = true;
  bool battleView = true; // 3D board with fighting pieces
  bool announce = true; // say every move out loud
  bool haptics = true;
  bool cinematic = true; // close-up camera for fights
  String style = 'wizard'; // 'wizard' (living stone statues) or 'toon' (KayKit, for kids)
  String boardIteration = 'latest'; // which version of the 3D board (ui/board3d/iterations.dart)
  String room = 'apothecary'; // where the set stands: 'apothecary' (cabin) or 'tower' (astronomer's tower)
  bool topDown = false; // overhead view of the battle board
  bool announceOwn = true; // also say the moves made on this phone
  bool alwaysListen = false; // the mic stays on for the whole game
  String voiceName = ''; // chosen text-to-speech voice ('' = the best one on the device)
  String voiceLocale = '';
  String announcer = 'obadiah'; // the board's neural voice (see announcerVoices in neural_voice.dart)
  List<SavedRoom> rooms = [];
  String? savedComputerGame; // json: {fen, moves, color, level}

  NostrPool? _pool;
  NostrPool get pool => _pool ??= NostrPool(secretKey: secretKey, relays: relays);

  Future<void> load() async {
    _p = await SharedPreferences.getInstance();
    name = _p.getString('name') ?? 'Player ${DateTime.now().millisecond % 1000}';
    secretKey = _p.getString('secretKey') ?? newIdentity();
    await _p.setString('secretKey', secretKey);
    relays = _p.getStringList('relays') ?? List.of(defaultRelays);
    engineLevel = _p.getInt('engineLevel') ?? 2;
    lichessToken = _p.getString('lichessToken') ?? '';
    lichessUser = _p.getString('lichessUser') ?? '';
    chessComUser = _p.getString('chessComUser') ?? '';
    autoFlip = _p.getBool('autoFlip') ?? true;
    captureSlots = _p.getInt('captureSlots') ?? 8;
    moveSounds = _p.getBool('moveSounds') ?? true;
    battleView = _p.getBool('battleView') ?? true;
    announce = _p.getBool('announce') ?? true;
    haptics = _p.getBool('haptics') ?? true;
    cinematic = _p.getBool('cinematic') ?? true;
    style = _p.getString('style') ?? 'wizard';
    room = _p.getString('room') ?? 'apothecary';
    boardIteration = _p.getString('boardIteration') ?? 'latest';
    topDown = _p.getBool('topDown') ?? false;
    announceOwn = _p.getBool('announceOwn') ?? true;
    alwaysListen = _p.getBool('alwaysListen') ?? false;
    voiceName = _p.getString('voiceName') ?? '';
    voiceLocale = _p.getString('voiceLocale') ?? '';
    announcer = _p.getString('announcer') ?? 'obadiah';
    savedComputerGame = _p.getString('computerGame');
    try {
      rooms = [for (final r in jsonDecode(_p.getString('rooms') ?? '[]') as List) SavedRoom.fromJson(r as Map<String, dynamic>)];
    } catch (_) {
      rooms = [];
    }
  }

  Future<void> save() async {
    await _p.setString('name', name);
    await _p.setStringList('relays', relays);
    await _p.setInt('engineLevel', engineLevel);
    await _p.setString('lichessToken', lichessToken);
    await _p.setString('lichessUser', lichessUser);
    await _p.setString('chessComUser', chessComUser);
    await _p.setBool('autoFlip', autoFlip);
    await _p.setInt('captureSlots', captureSlots);
    await _p.setBool('moveSounds', moveSounds);
    await _p.setBool('battleView', battleView);
    await _p.setBool('announce', announce);
    await _p.setBool('haptics', haptics);
    await _p.setBool('cinematic', cinematic);
    await _p.setString('style', style);
    await _p.setString('room', room);
    await _p.setString('boardIteration', boardIteration);
    await _p.setBool('topDown', topDown);
    await _p.setBool('announceOwn', announceOwn);
    await _p.setBool('alwaysListen', alwaysListen);
    await _p.setString('voiceName', voiceName);
    await _p.setString('voiceLocale', voiceLocale);
    await _p.setString('announcer', announcer);
    await _p.setString('rooms', jsonEncode([for (final r in rooms) r.toJson()]));
    if (savedComputerGame == null) {
      await _p.remove('computerGame');
    } else {
      await _p.setString('computerGame', savedComputerGame!);
    }
    notifyListeners();
  }

  void rememberRoom(SavedRoom r) {
    rooms.removeWhere((x) => x.code == r.code);
    rooms.insert(0, r);
    if (rooms.length > 30) rooms.removeLast();
    save();
  }

  /// Reconnects to the relays after the list changed.
  void resetPool() {
    _pool?.close();
    _pool = null;
  }
}

import 'dart:convert';

import 'package:http/http.dart' as http;

/// Chess.com integration through its public API (read-only).
///
/// Chess.com does not offer an API for making moves, so OpenRook mirrors your Daily
/// (correspondence) games: the board plays your opponent's moves for you, you make yours on
/// the board, and the app tells you what to enter on chess.com (with a button that opens the
/// game). Ratings and profile come from the same public API.
class ChessComGame {
  ChessComGame(this.json);
  final Map<String, dynamic> json;

  String get url => json['url'] as String;
  String get pgn => json['pgn'] as String? ?? '';
  String get fen => json['fen'] as String? ?? '';
  String get turn => json['turn'] as String? ?? 'white';
  String get white => _name(json['white']);
  String get black => _name(json['black']);
  int get lastActivity => json['last_activity'] as int? ?? 0;
  String get id => url.split('/').last;

  static String _name(dynamic v) {
    final s = v is Map ? (v['username'] ?? v['@id'] ?? '').toString() : v.toString();
    return s.split('/').last;
  }

  /// 'white' or 'black' for [user], or null if they aren't playing in it.
  String? colorOf(String user) {
    if (white.toLowerCase() == user.toLowerCase()) return 'white';
    if (black.toLowerCase() == user.toLowerCase()) return 'black';
    return null;
  }
}

class ChessCom {
  static const _host = 'https://api.chess.com/pub';

  static Future<dynamic> _get(String path) async {
    final r = await http.get(Uri.parse('$_host$path'), headers: {'Accept': 'application/json'});
    if (r.statusCode == 404) throw StateError('Chess.com user not found');
    if (r.statusCode != 200) throw StateError('Chess.com answered ${r.statusCode}');
    return jsonDecode(r.body);
  }

  /// The player's ongoing Daily games.
  static Future<List<ChessComGame>> dailyGames(String user) async {
    final j = await _get('/player/${user.toLowerCase()}/games') as Map<String, dynamic>;
    return [for (final g in (j['games'] as List? ?? [])) ChessComGame(g as Map<String, dynamic>)];
  }

  /// Ratings by time control, e.g. {'Daily': 1450, 'Rapid': 1210}.
  static Future<Map<String, int>> ratings(String user) async {
    final j = await _get('/player/${user.toLowerCase()}/stats') as Map<String, dynamic>;
    final out = <String, int>{};
    for (final k in ['chess_daily', 'chess_rapid', 'chess_blitz', 'chess_bullet']) {
      final r = (j[k] as Map?)?['last']?['rating'];
      if (r is int) out[k.substring(6)[0].toUpperCase() + k.substring(7)] = r;
    }
    return out;
  }
}

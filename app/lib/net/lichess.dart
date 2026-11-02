import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// Lichess Board API: real games on lichess.org played from the physical board.
/// It's lichess's official API for exactly this (DGT-style boards); a personal API token with
/// the board:play and challenge:write scopes is all it needs. No server of ours involved.
class Lichess {
  Lichess(this.token);
  final String token;
  static const host = 'https://lichess.org';
  static const tokenUrl =
      '$host/account/oauth/token/create?scopes[]=board:play&scopes[]=challenge:write&description=OpenRook%20chess%20board';

  final _client = http.Client();
  Map<String, String> get _auth => {'Authorization': 'Bearer $token'};

  Future<Map<String, dynamic>> _get(String path) async {
    final r = await _client.get(Uri.parse('$host$path'), headers: _auth);
    if (r.statusCode != 200) throw StateError(_error(r));
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _post(String path, [Map<String, String>? form]) async {
    final r = await _client.post(Uri.parse('$host$path'), headers: _auth, body: form);
    if (r.statusCode != 200 && r.statusCode != 201) throw StateError(_error(r));
    try {
      return jsonDecode(r.body) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }

  static String _error(http.Response r) {
    try {
      final j = jsonDecode(r.body);
      if (j is Map && j['error'] != null) return 'Lichess: ${j['error']}';
    } catch (_) {}
    return 'Lichess answered ${r.statusCode}';
  }

  /// Newline-delimited JSON stream (lichess keeps these open and sends keep-alive blanks).
  Stream<Map<String, dynamic>> _ndjson(String path, {String method = 'GET', Map<String, String>? form}) async* {
    final req = http.Request(method, Uri.parse('$host$path'))..headers.addAll(_auth);
    if (form != null) req.bodyFields = form;
    final res = await _client.send(req);
    if (res.statusCode != 200) {
      final body = await res.stream.bytesToString();
      throw StateError(_error(http.Response(body, res.statusCode)));
    }
    await for (final line in res.stream.transform(utf8.decoder).transform(const LineSplitter())) {
      if (line.trim().isEmpty) continue;
      try {
        yield jsonDecode(line) as Map<String, dynamic>;
      } catch (_) {}
    }
  }

  Future<String> username() async => (await _get('/api/account'))['username'] as String;

  /// Games in progress for this account.
  Future<List<Map<String, dynamic>>> playing() async =>
      ((await _get('/api/account/playing'))['nowPlaying'] as List).cast<Map<String, dynamic>>();

  /// gameStart / gameFinish / challenge events for this account.
  Stream<Map<String, dynamic>> events() => _ndjson('/api/stream/event');

  /// Seeks a random opponent. The request stays open until someone accepts (a gameStart
  /// event follows on [events]); cancel it with [close].
  Future<void> seek({int minutes = 15, int increment = 10, bool rated = false}) async {
    await for (final _ in _ndjson('/api/board/seek', method: 'POST', form: {
      'rated': '$rated',
      'time': '$minutes',
      'increment': '$increment',
    })) {}
  }

  Future<String> challengeAi({int level = 3, int minutes = 15, int increment = 10, String color = 'random'}) async {
    final j = await _post('/api/challenge/ai', {
      'level': '$level',
      'clock.limit': '${minutes * 60}',
      'clock.increment': '$increment',
      'color': color,
    });
    return (j['id'] ?? (j['game'] as Map?)?['id']) as String;
  }

  Future<String> challengeUser(String user, {int minutes = 15, int increment = 10, bool rated = false, String color = 'random'}) async {
    final j = await _post('/api/challenge/$user', {
      'rated': '$rated',
      'clock.limit': '${minutes * 60}',
      'clock.increment': '$increment',
      'color': color,
    });
    return ((j['challenge'] as Map?)?['id'] ?? j['id']) as String;
  }

  Stream<Map<String, dynamic>> gameStream(String id) => _ndjson('/api/board/game/stream/$id');

  Future<void> move(String id, String uci) => _post('/api/board/game/$id/move/$uci');
  Future<void> resign(String id) => _post('/api/board/game/$id/resign');
  Future<void> draw(String id, bool yes) => _post('/api/board/game/$id/draw/${yes ? 'yes' : 'no'}');
  Future<void> abort(String id) => _post('/api/board/game/$id/abort');

  void close() => _client.close();
}

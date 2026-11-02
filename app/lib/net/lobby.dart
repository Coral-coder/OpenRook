import 'dart:async';
import 'dart:convert';

import 'nostr_pool.dart';

/// Finding a random opponent anywhere in the world, still with no server.
///
/// Everyone looking for a game posts a "seek" to a public lobby tag on the relays every few
/// seconds. When two seekers see each other, the one with the smaller public key offers a
/// fresh room code, the other accepts, and the offerer confirms. The three-step handshake
/// means neither player ends up alone in a room if a message is lost or someone gives up.
class Lobby {
  Lobby(this.pool, this.name);

  final NostrPool pool;
  final String name;
  static const _seekTag = 'openrook-seek-v1';

  final _found = Completer<({String code, bool host, String opponent})>();
  final List<StreamSubscription> _subs = [];
  Timer? _timer;
  ({String to, String code, int at})? _offered; // our outstanding offer
  ({String from, String code, int at})? _accepted; // offer we accepted, awaiting confirm
  final Map<String, String> seekers = {}; // pubkey -> name, for the "N players looking" line
  final _seekersChanged = StreamController<int>.broadcast();
  Stream<int> get seekersChanged => _seekersChanged.stream;

  static int _now() => DateTime.now().millisecondsSinceEpoch ~/ 1000;

  /// Seeks until paired (or cancelled). Returns the room code and whether we host it.
  Future<({String code, bool host, String opponent})> seek() {
    final since = _now() - 60;
    _subs.add(pool.subscribe(kinds: [kindLobby], tags: {'t': [_seekTag]}, since: since).listen(_onSeek));
    _subs.add(pool.subscribe(kinds: [kindLobby], tags: {'p': [pool.publicKey]}, since: since).listen(_onDirect));
    _post();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) {
      _post();
      final now = _now();
      if (_offered != null && now - _offered!.at > 12) _offered = null;
      if (_accepted != null && now - _accepted!.at > 12) _accepted = null;
    });
    return _found.future;
  }

  void _post() {
    if (_found.isCompleted) return;
    pool.publish(kind: kindLobby, content: jsonEncode({'type': 'seek', 'name': name}), tags: [
      ['t', _seekTag],
      ['expiration', '${_now() + 60}'],
    ]);
  }

  void _direct(String to, Map<String, dynamic> m) {
    pool.publish(kind: kindLobby, content: jsonEncode(m), tags: [
      ['p', to],
      ['expiration', '${_now() + 60}'],
    ]);
  }

  void _onSeek(NostrEvent e) {
    if (_found.isCompleted || e.pubkey == pool.publicKey) return;
    if (_now() - e.createdAt > 30) return; // stale seek
    Map<String, dynamic> m;
    try {
      m = jsonDecode(e.content) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    if (m['type'] == 'cancel') {
      seekers.remove(e.pubkey);
    } else {
      seekers[e.pubkey] = (m['name'] as String?) ?? 'Player';
    }
    _seekersChanged.add(seekers.length);
    if (m['type'] != 'seek') return;
    if (pool.publicKey.compareTo(e.pubkey) < 0 && _offered == null && _accepted == null) {
      final code = newMatchCode(8);
      _offered = (to: e.pubkey, code: code, at: _now());
      _direct(e.pubkey, {'type': 'offer', 'code': code, 'name': name});
    }
  }

  void _onDirect(NostrEvent e) {
    if (_found.isCompleted || _now() - e.createdAt > 30) return;
    Map<String, dynamic> m;
    try {
      m = jsonDecode(e.content) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final code = m['code'] as String?;
    if (code == null) return;
    switch (m['type']) {
      case 'offer':
        if (e.pubkey.compareTo(pool.publicKey) < 0 && _offered == null && _accepted == null) {
          _accepted = (from: e.pubkey, code: code, at: _now());
          _direct(e.pubkey, {'type': 'accept', 'code': code, 'name': name});
        }
      case 'accept':
        final o = _offered;
        if (o != null && o.to == e.pubkey && o.code == code) {
          _direct(e.pubkey, {'type': 'confirm', 'code': code});
          _finish((code: code, host: true, opponent: e.pubkey));
        }
      case 'confirm':
        final a = _accepted;
        if (a != null && a.from == e.pubkey && a.code == code) {
          _finish((code: code, host: false, opponent: e.pubkey));
        }
    }
  }

  void _finish(({String code, bool host, String opponent}) r) {
    if (_found.isCompleted) return;
    pool.publish(kind: kindLobby, content: jsonEncode({'type': 'cancel'}), tags: [
      ['t', _seekTag]
    ]);
    _found.complete(r);
    _stop();
  }

  void cancel() {
    if (!_found.isCompleted) {
      pool.publish(kind: kindLobby, content: jsonEncode({'type': 'cancel'}), tags: [
        ['t', _seekTag]
      ]);
    }
    _stop();
  }

  void _stop() {
    _timer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
  }
}

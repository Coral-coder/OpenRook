import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'nostr_pool.dart';

/// A game between two players in a room on the relays.
///
/// The room is named and encrypted by its code. Messages:
///   {t:'hi', name, pref}            a player arrived (pref: 'w', 'b' or 'r' for random)
///   {t:'start', white, black, names, fen}   the host fixes the colours (first start wins)
///   {t:'mv', ply, uci}              a move; ply is its index, so duplicates and replays are harmless
///   {t:'resign'} {t:'draw'} {t:'drawok'} {t:'drawno'}
/// Everything is idempotent: relays replay the whole room when it is reopened, and both
/// phones rebuild the same game from it.
class RoomMatch {
  RoomMatch({required this.pool, required this.code, required this.myName, required this.isHost, this.colorPref = 'r'})
      : _cipher = RoomCipher(code);

  final NostrPool pool;
  final String code;
  final String myName;
  final bool isHost;
  final String colorPref;
  final RoomCipher _cipher;

  String get me => pool.publicKey;
  String? white, black, fen;
  final Map<String, String> names = {};
  final List<String> moves = [];
  final Map<int, List<String>> _pendingMoves = {};
  // Relays replay history in any order (usually newest first), so nothing below may depend on
  // the order messages arrive in: senders are checked once the colours are known, and draw
  // offers are compared by timestamp.
  final Set<String> _resigners = {};
  ({String from, int at})? _drawOffer, _drawAccept;
  int _drawDeclinedAt = 0, _lastMoveAt = 0;
  bool opponentSeen = false;

  String? get resignedBy => _resigners.where(_isPlayer).firstOrNull;
  String? get drawOfferBy {
    final o = _drawOffer;
    if (o == null || !_isPlayer(o.from) || o.at < _drawDeclinedAt || o.at < _lastMoveAt) return null;
    return o.from;
  }

  bool get drawAgreed {
    final o = _drawOffer, a = _drawAccept;
    return o != null && a != null && _isPlayer(o.from) && _isPlayer(a.from) && o.from != a.from && a.at >= o.at;
  }
  int? _startAt;

  final _changes = StreamController<void>.broadcast();
  Stream<void> get changes => _changes.stream;
  StreamSubscription? _sub;
  Timer? _hiTimer;

  bool get started => white != null && black != null;
  bool get amPlayer => me == white || me == black;
  String? get myColor => me == white ? 'w' : (me == black ? 'b' : null);
  String? get opponent => me == white ? black : white;
  String get opponentName => names[opponent] ?? 'Opponent';

  void open() {
    _sub = pool.subscribe(kinds: [kindRoom], tags: {'t': [RoomCipher.roomTag(code)]}, limit: 2000).listen(_onEvent);
    _sayHi();
    // Keep saying hello until someone answers, in case the first one was missed.
    _hiTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!started || !opponentSeen) _sayHi();
    });
  }

  void _sayHi() => _send({'t': 'hi', 'name': myName, 'pref': colorPref});

  void _send(Map<String, dynamic> m) {
    pool.publish(kind: kindRoom, content: _cipher.encrypt(jsonEncode(m)), tags: [
      ['t', RoomCipher.roomTag(code)]
    ]);
    // Our own events come back from the relays too; apply right away for responsiveness.
    _handle(me, m, DateTime.now().millisecondsSinceEpoch ~/ 1000);
  }

  void _onEvent(NostrEvent e) {
    final plain = _cipher.decrypt(e.content);
    if (plain == null) return;
    try {
      _handle(e.pubkey, jsonDecode(plain) as Map<String, dynamic>, e.createdAt);
    } catch (_) {}
  }

  void _handle(String from, Map<String, dynamic> m, int at) {
    switch (m['t']) {
      case 'hi':
        names[from] = (m['name'] as String?) ?? names[from] ?? 'Player';
        if (from != me) opponentSeen = true;
        if (isHost && from != me && !started) _startWith(from, m['pref'] as String? ?? 'r');
      case 'start':
        // The earliest start wins, so two starts racing through different relays agree.
        if (started && (_startAt ?? 0) <= at) break;
        white = m['white'] as String?;
        black = m['black'] as String?;
        fen = m['fen'] as String?;
        _startAt = at;
        (m['names'] as Map?)?.forEach((k, v) => names[k as String] = v as String);
        if (from != me) opponentSeen = true;
        moves.clear(); // a different start means a different game: replay under it
        _drainMoves();
      case 'mv':
        // Buffered by ply; the sender is checked against the colours in _drainMoves, which may
        // only become known when the start message arrives later.
        final ply = m['ply'] as int, uci = m['uci'] as String;
        _pendingMoves.putIfAbsent(ply, () => <String>[]).add('$from|$uci');
        if (at > _lastMoveAt) _lastMoveAt = at;
        _drainMoves();
      case 'resign':
        _resigners.add(from);
      case 'draw':
        if (_drawOffer == null || at >= _drawOffer!.at) _drawOffer = (from: from, at: at);
      case 'drawok':
        if (_drawAccept == null || at >= _drawAccept!.at) _drawAccept = (from: from, at: at);
      case 'drawno':
        if (at > _drawDeclinedAt) _drawDeclinedAt = at;
    }
    if (from != me && _isPlayer(from)) opponentSeen = true;
    _changes.add(null);
  }

  bool _isPlayer(String id) => id == white || id == black;

  void _drainMoves() {
    if (!started) return;
    final startsWhite = fen == null || fen!.split(' ')[1] == 'w';
    while (true) {
      final ply = moves.length;
      final whiteToMove = ply.isEven == startsWhite;
      final mover = whiteToMove ? white : black;
      // Only the side to move may move at that ply; anything else is ignored.
      final entry = _pendingMoves[ply]?.where((e) => e.startsWith('$mover|')).firstOrNull;
      if (entry == null) break;
      moves.add(entry.substring(entry.indexOf('|') + 1));
    }
  }

  void _startWith(String guest, String guestPref) {
    // The host's preference wins; otherwise the guest's; otherwise a coin toss.
    bool hostWhite;
    if (colorPref == 'w' || colorPref == 'b') {
      hostWhite = colorPref == 'w';
    } else if (guestPref == 'w' || guestPref == 'b') {
      hostWhite = guestPref == 'b';
    } else {
      hostWhite = Random.secure().nextBool();
    }
    _send({
      't': 'start',
      'white': hostWhite ? me : guest,
      'black': hostWhite ? guest : me,
      'names': {me: myName, guest: names[guest] ?? 'Player'},
      'fen': null,
    });
  }

  void sendMove(String uci) {
    if (!started || !amPlayer) return;
    _send({'t': 'mv', 'ply': moves.length, 'uci': uci});
  }

  void resign() => _send({'t': 'resign'});
  void offerDraw() => _send({'t': 'draw'});
  void acceptDraw() => _send({'t': 'drawok'});
  void declineDraw() => _send({'t': 'drawno'});

  void close() {
    _hiTimer?.cancel();
    _sub?.cancel();
    _changes.close();
  }
}

import 'position.dart';

enum GameResult { ongoing, whiteWins, blackWins, draw }

/// A game: a start position plus the moves played, with result detection.
class Game {
  Game({String? fen}) : startFen = fen ?? Position.startFen {
    position = Position.fromFen(startFen);
    _hashes.add(position.hash);
  }

  /// Rebuilds a game from UCI moves (as relays and lichess send them).
  factory Game.fromUci(List<String> moves, {String? fen}) {
    final g = Game(fen: fen);
    for (final u in moves) {
      final m = g.position.parseUci(u);
      if (m == null) break;
      g.play(m);
    }
    return g;
  }

  final String startFen;
  late Position position;
  final List<Move> moves = [];
  final List<String> sans = [];
  final List<int> _hashes = [];
  GameResult _forced = GameResult.ongoing;
  String? _forcedReason;

  int get ply => moves.length;
  int get turn => position.turn;
  List<String> get uciMoves => [for (final m in moves) m.uci];
  Move? get lastMove => moves.isEmpty ? null : moves.last;

  /// Plays [m] if it is legal; returns false otherwise.
  bool play(Move m) {
    if (result != GameResult.ongoing) return false;
    final legal = position.legalMoves();
    final match = legal.where((l) => l == m).firstOrNull;
    if (match == null) return false;
    sans.add(position.san(match));
    position.make(match);
    moves.add(match);
    _hashes.add(position.hash);
    return true;
  }

  bool playUci(String uci) {
    final m = position.parseUci(uci);
    return m != null && play(m);
  }

  void undo() {
    if (moves.isEmpty) return;
    position.unmake();
    moves.removeLast();
    sans.removeLast();
    _hashes.removeLast();
    _forced = GameResult.ongoing;
    _forcedReason = null;
  }

  /// Ends the game by resignation, agreement, timeout or abort.
  void finish(GameResult r, String reason) {
    _forced = r;
    _forcedReason = reason;
  }

  bool get threefold => _hashes.where((h) => h == position.hash).length >= 3;

  GameResult get result {
    if (_forced != GameResult.ongoing) return _forced;
    if (position.legalMoves().isEmpty) {
      if (!position.inCheck) return GameResult.draw;
      return position.turn == white ? GameResult.blackWins : GameResult.whiteWins;
    }
    if (position.halfmove >= 100 || threefold || position.insufficientMaterial) return GameResult.draw;
    return GameResult.ongoing;
  }

  String get resultReason {
    if (_forcedReason != null) return _forcedReason!;
    if (result == GameResult.ongoing) return '';
    if (position.legalMoves().isEmpty) return position.inCheck ? 'checkmate' : 'stalemate';
    if (position.halfmove >= 100) return 'fifty-move rule';
    if (threefold) return 'threefold repetition';
    return 'insufficient material';
  }

  String get resultText => switch (result) {
        GameResult.whiteWins => 'White wins by $resultReason',
        GameResult.blackWins => 'Black wins by $resultReason',
        GameResult.draw => 'Draw by $resultReason',
        GameResult.ongoing => '',
      };

  String get pgnMoves {
    final b = StringBuffer();
    final start = Position.fromFen(startFen);
    var n = start.fullmove, side = start.turn;
    for (var i = 0; i < sans.length; i++) {
      if (side == white) {
        b.write('$n. ');
      } else if (i == 0) {
        b.write('$n... ');
      }
      b.write('${sans[i]} ');
      if (side == black) n++;
      side ^= 8;
    }
    return b.toString().trim();
  }

  /// Squares that changed with the last move (for highlighting).
  Set<int> get lastMoveSquares {
    final m = lastMove;
    return m == null ? {} : {m.from, m.to};
  }

  /// Pieces captured from each side so far: index 0 white pieces, 1 black pieces.
  List<List<int>> get captured {
    final w = <int>[], b = <int>[];
    for (final m in moves) {
      if (m.captured == empty) continue;
      (colorOf(m.captured) == white ? w : b).add(m.captured);
    }
    return [w, b];
  }
}

/// Parses a PGN's move text into a game (headers, comments and variations are skipped).
Game? gameFromPgn(String pgn) {
  String? fen;
  final fenMatch = RegExp(r'\[FEN "([^"]+)"\]').firstMatch(pgn);
  if (fenMatch != null) fen = fenMatch.group(1);
  var body = pgn.replaceAll(RegExp(r'\[[^\]]*\]'), ' ');
  body = body.replaceAll(RegExp(r'\{[^}]*\}'), ' ');
  while (body.contains('(')) {
    final before = body;
    body = body.replaceAll(RegExp(r'\([^()]*\)'), ' ');
    if (body == before) break;
  }
  body = body.replaceAll(RegExp(r'\$\d+'), ' ');
  final g = Game(fen: fen);
  for (final tok in body.split(RegExp(r'\s+'))) {
    final t = tok.replaceAll(RegExp(r'^\d+\.+'), '');
    if (t.isEmpty || RegExp(r'^(1-0|0-1|1/2-1/2|\*)$').hasMatch(t)) continue;
    final m = g.position.parseSan(t);
    if (m == null) return g.moves.isEmpty ? null : g;
    g.play(m);
  }
  return g;
}

/// Chess rules: positions, legal moves, FEN, SAN and UCI.
///
/// Squares are 0..63 with a1 = 0, b1 = 1 … h8 = 63, the same numbering the board firmware
/// uses for its occupancy bitmap. Pieces are small ints: [white] | type or [black] | type.
library;

const int empty = 0;
const int pawn = 1, knight = 2, bishop = 3, rook = 4, queen = 5, king = 6;
const int white = 0, black = 8;

int colorOf(int piece) => piece & 8;
int typeOf(int piece) => piece & 7;
int fileOf(int sq) => sq & 7;
int rankOf(int sq) => sq >> 3;

String squareName(int sq) => '${String.fromCharCode(97 + fileOf(sq))}${rankOf(sq) + 1}';

int parseSquare(String s) {
  if (s.length != 2) return -1;
  final f = s.codeUnitAt(0) - 97, r = s.codeUnitAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 8 + f;
}

const _pieceChars = ' pnbrqk';
String pieceChar(int piece) {
  final c = _pieceChars[typeOf(piece)];
  return colorOf(piece) == white ? c.toUpperCase() : c;
}

int pieceFromChar(String c) {
  final t = _pieceChars.indexOf(c.toLowerCase());
  if (t <= 0) return empty;
  return (c == c.toUpperCase() ? white : black) | t;
}

class Move {
  const Move(this.from, this.to, {this.promotion = 0, this.captured = 0, this.flags = 0});
  final int from, to;
  final int promotion; // piece type, 0 if none
  final int captured; // captured piece (with colour), 0 if none
  final int flags;

  static const int doublePush = 1, enPassant = 2, castleKing = 4, castleQueen = 8;

  bool get isCapture => captured != 0;
  bool get isEnPassant => flags & enPassant != 0;
  bool get isCastle => flags & (castleKing | castleQueen) != 0;

  /// The square the captured piece stood on (differs from [to] only for en passant).
  int get captureSquare => isEnPassant ? (to & 7) | (from & 56) : to;

  String get uci => '${squareName(from)}${squareName(to)}${promotion != 0 ? _pieceChars[promotion] : ''}';

  @override
  bool operator ==(Object other) => other is Move && other.from == from && other.to == to && other.promotion == promotion;
  @override
  int get hashCode => from | to << 6 | promotion << 12;
  @override
  String toString() => uci;
}

class _Undo {
  _Undo(this.move, this.castling, this.ep, this.halfmove, this.hash);
  final Move move;
  final int castling, ep, halfmove, hash;
}

const _knightSteps = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const _kingSteps = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const _rookDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const _bishopDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// Precomputed targets so move generation stays fast enough for the computer player.
final List<List<int>> _knightTargets = List.generate(64, (s) => _steps(s, _knightSteps));
final List<List<int>> _kingTargets = List.generate(64, (s) => _steps(s, _kingSteps));
final List<List<List<int>>> _rookRays = List.generate(64, (s) => _rays(s, _rookDirs));
final List<List<List<int>>> _bishopRays = List.generate(64, (s) => _rays(s, _bishopDirs));

List<int> _steps(int s, List<List<int>> steps) => [
      for (final d in steps)
        if (fileOf(s) + d[0] >= 0 && fileOf(s) + d[0] < 8 && rankOf(s) + d[1] >= 0 && rankOf(s) + d[1] < 8)
          s + d[0] + d[1] * 8,
    ];

List<List<int>> _rays(int s, List<List<int>> dirs) => [
      for (final d in dirs)
        [
          for (var f = fileOf(s) + d[0], r = rankOf(s) + d[1]; f >= 0 && f < 8 && r >= 0 && r < 8; f += d[0], r += d[1])
            r * 8 + f,
        ],
    ];

// Zobrist keys for repetition detection and the engine's transposition table.
final List<int> _zPiece = _zobrist(16 * 64, 1);
final List<int> _zCastle = _zobrist(16, 2);
final List<int> _zEp = _zobrist(8, 3);
final int _zSide = _zobrist(1, 4)[0];

List<int> _zobrist(int n, int seed) {
  // 32-bit xorshift: identical on the VM and the web.
  var x = 0x9E3779B9 ^ seed * 0x85EBCA6B;
  int next() {
    x ^= (x << 13) & 0xFFFFFFFF;
    x ^= x >> 17;
    x ^= (x << 5) & 0xFFFFFFFF;
    return x & 0xFFFFFFFF;
  }

  return List.generate(n, (_) => (next() << 20) ^ next());
}

class Position {
  Position._(this.board, this.turn, this.castling, this.ep, this.halfmove, this.fullmove) {
    hash = _computeHash();
  }

  factory Position.initial() => Position.fromFen(startFen);

  factory Position.fromFen(String fen) {
    final parts = fen.trim().split(RegExp(r'\s+'));
    if (parts.length < 4) throw FormatException('Bad FEN: $fen');
    final board = List<int>.filled(64, empty);
    final rows = parts[0].split('/');
    if (rows.length != 8) throw FormatException('Bad FEN board: $fen');
    for (var i = 0; i < 8; i++) {
      var f = 0;
      for (final ch in rows[i].split('')) {
        final n = int.tryParse(ch);
        if (n != null) {
          f += n;
        } else {
          final p = pieceFromChar(ch);
          if (p == empty || f > 7) throw FormatException('Bad FEN piece: $fen');
          board[(7 - i) * 8 + f] = p;
          f++;
        }
      }
      if (f != 8) throw FormatException('Bad FEN row: $fen');
    }
    var castling = 0;
    for (final ch in parts[2].split('')) {
      castling |= switch (ch) { 'K' => 1, 'Q' => 2, 'k' => 4, 'q' => 8, _ => 0 };
    }
    return Position._(
      board,
      parts[1] == 'b' ? black : white,
      castling,
      parts[3] == '-' ? -1 : parseSquare(parts[3]),
      parts.length > 4 ? int.tryParse(parts[4]) ?? 0 : 0,
      parts.length > 5 ? int.tryParse(parts[5]) ?? 1 : 1,
    );
  }

  static const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  final List<int> board;
  int turn;
  int castling; // 1 = K, 2 = Q, 4 = k, 8 = q
  int ep; // en-passant target square or -1
  int halfmove, fullmove;
  late int hash;
  final List<_Undo> _undo = [];

  Position copy() => Position._(List.of(board), turn, castling, ep, halfmove, fullmove);

  int _computeHash() {
    var h = 0;
    for (var s = 0; s < 64; s++) {
      if (board[s] != empty) h ^= _zPiece[board[s] * 64 + s];
    }
    h ^= _zCastle[castling];
    if (ep >= 0) h ^= _zEp[fileOf(ep)];
    if (turn == black) h ^= _zSide;
    return h;
  }

  /// Squares with a piece on them, as the board's sensors would see it.
  Set<int> get occupied => {
        for (var s = 0; s < 64; s++)
          if (board[s] != empty) s,
      };

  int kingSquare(int color) => board.indexOf(color | king);

  bool isAttacked(int sq, int byColor) {
    final pawnDir = byColor == white ? -1 : 1; // look back towards the attacking pawns
    final r = rankOf(sq) + pawnDir;
    if (r >= 0 && r < 8) {
      for (final df in const [-1, 1]) {
        final f = fileOf(sq) + df;
        if (f >= 0 && f < 8 && board[r * 8 + f] == (byColor | pawn)) return true;
      }
    }
    for (final t in _knightTargets[sq]) {
      if (board[t] == (byColor | knight)) return true;
    }
    for (final t in _kingTargets[sq]) {
      if (board[t] == (byColor | king)) return true;
    }
    for (final ray in _rookRays[sq]) {
      for (final t in ray) {
        final p = board[t];
        if (p == empty) continue;
        if (colorOf(p) == byColor && (typeOf(p) == rook || typeOf(p) == queen)) return true;
        break;
      }
    }
    for (final ray in _bishopRays[sq]) {
      for (final t in ray) {
        final p = board[t];
        if (p == empty) continue;
        if (colorOf(p) == byColor && (typeOf(p) == bishop || typeOf(p) == queen)) return true;
        break;
      }
    }
    return false;
  }

  bool get inCheck {
    final k = kingSquare(turn);
    return k >= 0 && isAttacked(k, turn ^ 8);
  }

  /// Moves that obey piece movement but may leave the king in check.
  List<Move> pseudoMoves({bool capturesOnly = false}) {
    final moves = <Move>[];
    final us = turn, them = turn ^ 8;
    for (var s = 0; s < 64; s++) {
      final p = board[s];
      if (p == empty || colorOf(p) != us) continue;
      switch (typeOf(p)) {
        case pawn:
          final dir = us == white ? 8 : -8;
          final startRank = us == white ? 1 : 6;
          final lastRank = us == white ? 7 : 0;
          final one = s + dir;
          void add(int to, int captured, int flags) {
            if (rankOf(to) == lastRank) {
              for (final pr in const [queen, rook, bishop, knight]) {
                moves.add(Move(s, to, promotion: pr, captured: captured, flags: flags));
              }
            } else {
              moves.add(Move(s, to, captured: captured, flags: flags));
            }
          }

          if (one >= 0 && one < 64 && board[one] == empty) {
            if (!capturesOnly || rankOf(one) == lastRank) add(one, 0, 0);
            final two = s + 2 * dir;
            if (!capturesOnly && rankOf(s) == startRank && board[two] == empty) {
              moves.add(Move(s, two, flags: Move.doublePush));
            }
          }
          for (final df in const [-1, 1]) {
            final f = fileOf(s) + df;
            if (f < 0 || f > 7) continue;
            final to = one + df;
            if (to < 0 || to > 63) continue;
            final q = board[to];
            if (q != empty && colorOf(q) == them) {
              add(to, q, 0);
            } else if (to == ep) {
              moves.add(Move(s, to, captured: them | pawn, flags: Move.enPassant));
            }
          }
        case knight:
          for (final t in _knightTargets[s]) {
            final q = board[t];
            if (q == empty ? !capturesOnly : colorOf(q) == them) moves.add(Move(s, t, captured: q));
          }
        case king:
          for (final t in _kingTargets[s]) {
            final q = board[t];
            if (q == empty ? !capturesOnly : colorOf(q) == them) moves.add(Move(s, t, captured: q));
          }
          if (!capturesOnly) _castles(s, us, moves);
        default:
          final t = typeOf(p);
          if (t == rook || t == queen) _slide(s, _rookRays[s], them, capturesOnly, moves);
          if (t == bishop || t == queen) _slide(s, _bishopRays[s], them, capturesOnly, moves);
      }
    }
    return moves;
  }

  void _slide(int s, List<List<int>> rays, int them, bool capturesOnly, List<Move> moves) {
    for (final ray in rays) {
      for (final t in ray) {
        final q = board[t];
        if (q == empty) {
          if (!capturesOnly) moves.add(Move(s, t));
          continue;
        }
        if (colorOf(q) == them) moves.add(Move(s, t, captured: q));
        break;
      }
    }
  }

  void _castles(int s, int us, List<Move> moves) {
    final home = us == white ? 4 : 60;
    if (s != home) return;
    final them = us ^ 8;
    final kBit = us == white ? 1 : 4, qBit = us == white ? 2 : 8;
    if (castling & kBit != 0 &&
        board[home + 1] == empty &&
        board[home + 2] == empty &&
        board[home + 3] == (us | rook) &&
        !isAttacked(home, them) &&
        !isAttacked(home + 1, them) &&
        !isAttacked(home + 2, them)) {
      moves.add(Move(home, home + 2, flags: Move.castleKing));
    }
    if (castling & qBit != 0 &&
        board[home - 1] == empty &&
        board[home - 2] == empty &&
        board[home - 3] == empty &&
        board[home - 4] == (us | rook) &&
        !isAttacked(home, them) &&
        !isAttacked(home - 1, them) &&
        !isAttacked(home - 2, them)) {
      moves.add(Move(home, home - 2, flags: Move.castleQueen));
    }
  }

  List<Move> legalMoves() {
    final out = <Move>[];
    for (final m in pseudoMoves()) {
      make(m);
      final k = kingSquare(turn ^ 8);
      if (k < 0 || !isAttacked(k, turn)) out.add(m);
      unmake();
    }
    return out;
  }

  static const _castleMask = {0: ~2, 7: ~1, 4: ~3, 56: ~8, 63: ~4, 60: ~12};

  void make(Move m) {
    _undo.add(_Undo(m, castling, ep, halfmove, hash));
    final p = board[m.from];
    hash ^= _zPiece[p * 64 + m.from];
    if (m.captured != empty) hash ^= _zPiece[m.captured * 64 + m.captureSquare];
    board[m.captureSquare] = empty;
    board[m.from] = empty;
    final placed = m.promotion != 0 ? colorOf(p) | m.promotion : p;
    board[m.to] = placed;
    hash ^= _zPiece[placed * 64 + m.to];
    if (m.isCastle) {
      final kingSide = m.flags & Move.castleKing != 0;
      final rf = kingSide ? m.from + 3 : m.from - 4, rt = kingSide ? m.from + 1 : m.from - 1;
      final r = board[rf];
      board[rf] = empty;
      board[rt] = r;
      hash ^= _zPiece[r * 64 + rf] ^ _zPiece[r * 64 + rt];
    }
    hash ^= _zCastle[castling];
    castling &= (_castleMask[m.from] ?? ~0) & (_castleMask[m.to] ?? ~0);
    hash ^= _zCastle[castling];
    if (ep >= 0) hash ^= _zEp[fileOf(ep)];
    ep = m.flags & Move.doublePush != 0 ? (m.from + m.to) >> 1 : -1;
    if (ep >= 0) hash ^= _zEp[fileOf(ep)];
    halfmove = (typeOf(p) == pawn || m.isCapture) ? 0 : halfmove + 1;
    if (turn == black) fullmove++;
    turn ^= 8;
    hash ^= _zSide;
  }

  void unmake() {
    final u = _undo.removeLast();
    final m = u.move;
    turn ^= 8;
    if (turn == black) fullmove--;
    final placed = board[m.to];
    final p = m.promotion != 0 ? colorOf(placed) | pawn : placed;
    board[m.to] = empty;
    board[m.from] = p;
    if (m.captured != empty) board[m.captureSquare] = m.captured;
    if (m.isCastle) {
      final kingSide = m.flags & Move.castleKing != 0;
      final rf = kingSide ? m.from + 3 : m.from - 4, rt = kingSide ? m.from + 1 : m.from - 1;
      board[rf] = board[rt];
      board[rt] = empty;
    }
    castling = u.castling;
    ep = u.ep;
    halfmove = u.halfmove;
    hash = u.hash;
  }

  /// Passes the turn (used by the engine's null-move search).
  void makeNull() {
    _undo.add(_Undo(const Move(0, 0), castling, ep, halfmove, hash));
    if (ep >= 0) hash ^= _zEp[fileOf(ep)];
    ep = -1;
    turn ^= 8;
    hash ^= _zSide;
  }

  void unmakeNull() {
    final u = _undo.removeLast();
    turn ^= 8;
    ep = u.ep;
    hash = u.hash;
  }

  String get fen {
    final rows = <String>[];
    for (var r = 7; r >= 0; r--) {
      var row = '', gap = 0;
      for (var f = 0; f < 8; f++) {
        final p = board[r * 8 + f];
        if (p == empty) {
          gap++;
        } else {
          if (gap > 0) row += '$gap';
          gap = 0;
          row += pieceChar(p);
        }
      }
      if (gap > 0) row += '$gap';
      rows.add(row);
    }
    var c = '';
    if (castling & 1 != 0) c += 'K';
    if (castling & 2 != 0) c += 'Q';
    if (castling & 4 != 0) c += 'k';
    if (castling & 8 != 0) c += 'q';
    // Only name the en-passant square when a capture there is actually possible, as most
    // tools do, so positions compare equal for repetition.
    var epStr = '-';
    if (ep >= 0 && legalMoves().any((m) => m.isEnPassant)) epStr = squareName(ep);
    return '${rows.join('/')} ${turn == white ? 'w' : 'b'} ${c.isEmpty ? '-' : c} $epStr $halfmove $fullmove';
  }

  Move? parseUci(String uci) {
    if (uci.length < 4) return null;
    final from = parseSquare(uci.substring(0, 2)), to = parseSquare(uci.substring(2, 4));
    final promo = uci.length > 4 ? _pieceChars.indexOf(uci[4].toLowerCase()) : 0;
    for (final m in legalMoves()) {
      if (m.from == from && m.to == to && m.promotion == (promo < 0 ? 0 : promo)) return m;
    }
    // Some sources write castling as king-takes-rook (e1h1); accept it.
    final p = from >= 0 ? board[from] : empty;
    if (typeOf(p) == king && to >= 0 && board[to] == (colorOf(p) | rook)) {
      for (final m in legalMoves()) {
        if (m.from == from && m.isCastle && (to > from) == (m.to > from)) return m;
      }
    }
    return null;
  }

  String san(Move m) {
    String s;
    if (m.isCastle) {
      s = m.flags & Move.castleKing != 0 ? 'O-O' : 'O-O-O';
    } else {
      final p = board[m.from];
      final t = typeOf(p);
      if (t == pawn) {
        s = m.isCapture ? '${squareName(m.from)[0]}x${squareName(m.to)}' : squareName(m.to);
        if (m.promotion != 0) s += '=${_pieceChars[m.promotion].toUpperCase()}';
      } else {
        s = _pieceChars[t].toUpperCase();
        final others = legalMoves().where((o) => o.to == m.to && o.from != m.from && board[o.from] == p).toList();
        if (others.isNotEmpty) {
          final sameFile = others.any((o) => fileOf(o.from) == fileOf(m.from));
          final sameRank = others.any((o) => rankOf(o.from) == rankOf(m.from));
          if (!sameFile) {
            s += squareName(m.from)[0];
          } else if (!sameRank) {
            s += squareName(m.from)[1];
          } else {
            s += squareName(m.from);
          }
        }
        if (m.isCapture) s += 'x';
        s += squareName(m.to);
      }
    }
    make(m);
    if (inCheck) s += legalMoves().isEmpty ? '#' : '+';
    unmake();
    return s;
  }

  Move? parseSan(String san) {
    final clean = san.replaceAll(RegExp(r'[+#!?]'), '').replaceAll('0', 'O').trim();
    for (final m in legalMoves()) {
      final s = this.san(m).replaceAll(RegExp(r'[+#]'), '');
      if (s == clean) return m;
    }
    // Tolerate over-disambiguated or "e8Q"-style input.
    for (final m in legalMoves()) {
      final full = '${pieceChar(board[m.from]).toUpperCase()}${squareName(m.from)}${m.isCapture ? 'x' : ''}${squareName(m.to)}';
      if (clean.replaceAll('=', '') == full || clean == m.uci) return m;
    }
    return null;
  }

  bool get insufficientMaterial {
    final pieces = <int>[];
    for (var s = 0; s < 64; s++) {
      final p = board[s];
      if (p == empty || typeOf(p) == king) continue;
      if (typeOf(p) == pawn || typeOf(p) == rook || typeOf(p) == queen) return false;
      pieces.add(s);
    }
    if (pieces.length <= 1) return true;
    // Only bishops, all on one colour of square.
    if (pieces.every((s) => typeOf(board[s]) == bishop)) {
      final c = (fileOf(pieces.first) + rankOf(pieces.first)) & 1;
      return pieces.every((s) => (fileOf(s) + rankOf(s)) & 1 == c);
    }
    return false;
  }
}

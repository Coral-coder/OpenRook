import '../chess/position.dart';

/// Translating between chess moves and what the physical board can sense and do.
///
/// The board only senses which squares are occupied. A move made by hand is recognised by
/// watching the occupancy change: every square lifted or set down since the last position is
/// remembered, and the legal moves that would leave exactly the current occupancy (and that
/// touched those squares) are the candidates.
class MoveDetector {
  MoveDetector(this.position) : _base = position.occupied;

  Position position;
  Set<int> _base;
  final Set<int> _touched = {};

  /// Call after the position changes (a move was applied by either side).
  void reset(Position p) {
    position = p;
    _base = p.occupied;
    _touched.clear();
  }

  /// Squares where the board differs from the position.
  Set<int> mismatch(Set<int> occupied) => occupied.difference(_base).union(_base.difference(occupied));

  /// Feeds a new (debounced) occupancy reading. Returns the moves it could be: empty while a
  /// move is still in progress or the board doesn't match anything, one when the move is
  /// clear, several when it is ambiguous (a promotion, or the player must say which).
  List<Move> feed(Set<int> occupied) {
    if (_sameSet(occupied, _base)) {
      _touched.clear(); // piece lifted and put back
      return const [];
    }
    _touched.addAll(mismatch(occupied));
    final candidates = <Move>[];
    for (final m in position.legalMoves()) {
      if (!_sameSet(occupancyAfter(m), occupied)) continue;
      // A capture leaves the same occupancy whichever piece was taken: the taken piece must
      // have been lifted, which is what tells two captures by the same piece apart.
      if (m.isCapture && !_touched.contains(m.captureSquare)) continue;
      candidates.add(m);
    }
    return candidates;
  }

  Set<int> occupancyAfter(Move m) {
    final occ = Set<int>.of(_base)
      ..remove(m.from)
      ..remove(m.captureSquare)
      ..add(m.to);
    if (m.isCastle) {
      final kingSide = m.flags & Move.castleKing != 0;
      occ
        ..remove(kingSide ? m.from + 3 : m.from - 4)
        ..add(kingSide ? m.from + 1 : m.from - 1);
    }
    return occ;
  }

  static bool _sameSet(Set<int> a, Set<int> b) => a.length == b.length && a.containsAll(b);
}

/// What the board must do to play a move.
class PhysicalPlan {
  PhysicalPlan(this.drags, this.removeByHand);

  /// Pairs of squares for the firmware's MOVE command, e.g. ["d5", "B0", "e4", "d5"]: take
  /// the black piece on d5 to capture slot B0, then move e4 to d5.
  final List<String> drags;

  /// A captured piece the player must lift off by hand first (capture slots full), or -1.
  final int removeByHand;
}

/// Plans a move for the board. Captured white pieces go to the slots left of the board
/// (W0, W1, ...) and black ones to the right (B0, ...), in the order they were taken.
/// [capturedSoFar] counts the pieces of each colour already taken: [white, black].
/// [slots] is how many capture slots each side has (8 on the standard build, 16 on the wide).
PhysicalPlan physicalPlan(Position before, Move m, List<int> capturedSoFar, {int slots = 8}) {
  final drags = <String>[];
  var byHand = -1;
  if (m.isCapture) {
    final isWhite = colorOf(m.captured) == white;
    final slot = isWhite ? capturedSoFar[0] : capturedSoFar[1];
    if (slot < slots) {
      drags.addAll([squareName(m.captureSquare), '${isWhite ? 'W' : 'B'}$slot']);
    } else {
      byHand = m.captureSquare;
    }
  }
  if (m.isCastle) {
    final kingSide = m.flags & Move.castleKing != 0;
    final rf = kingSide ? m.from + 3 : m.from - 4, rt = kingSide ? m.from + 1 : m.from - 1;
    // Rook first: its straight path is still clear, then the king steps around it.
    drags.addAll([squareName(rf), squareName(rt), squareName(m.from), squareName(m.to)]);
  } else {
    drags.addAll([squareName(m.from), squareName(m.to)]);
  }
  return PhysicalPlan(drags, byHand);
}

/// Parses the firmware's 16-hex-digit occupancy report (bit 0 = a1).
Set<int> parseOccupancy(String hex) {
  final out = <int>{};
  final h = hex.padLeft(16, '0');
  for (var i = 0; i < 16; i++) {
    final nibble = int.tryParse(h[15 - i], radix: 16) ?? 0;
    for (var b = 0; b < 4; b++) {
      if (nibble & (1 << b) != 0) out.add(i * 4 + b);
    }
  }
  return out;
}

String formatOccupancy(Set<int> occ) {
  final digits = List.filled(16, 0);
  for (final s in occ) {
    digits[15 - (s >> 2)] |= 1 << (s & 3);
  }
  return digits.map((d) => d.toRadixString(16)).join();
}

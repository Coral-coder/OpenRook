import 'dart:math';

import 'package:flutter/foundation.dart';

import 'position.dart';

/// The computer player: iterative-deepening alpha-beta with quiescence search, a small
/// transposition table, MVV-LVA and killer move ordering, and piece-square tables.
/// Runs entirely on the phone. Strength is set by search time, depth and a little randomness.
class EngineLevel {
  const EngineLevel(this.name, this.depth, this.millis, this.noise);
  final String name;
  final int depth; // maximum depth in plies
  final int millis; // time budget
  final int noise; // random centipawns added to root moves (weaker levels blunder more)

  static const levels = [
    EngineLevel('Beginner', 1, 200, 220),
    EngineLevel('Casual', 2, 400, 120),
    EngineLevel('Club', 3, 800, 50),
    EngineLevel('Strong', 5, 1500, 15),
    EngineLevel('Expert', 8, 3000, 0),
    EngineLevel('Master', 12, 6000, 0),
  ];
}

class _SearchRequest {
  _SearchRequest(this.fen, this.history, this.depth, this.millis, this.noise, this.seed);
  final String fen;
  final List<String> history; // UCI moves from fen, so repetitions are seen
  final int depth, millis, noise, seed;
}

/// Finds a move for the side to move. Runs in a background isolate where available.
Future<Move?> findBestMove(String startFen, List<String> uciHistory, EngineLevel level) async {
  final req = _SearchRequest(startFen, uciHistory, level.depth, level.millis, level.noise, Random().nextInt(1 << 30));
  final uci = await compute(_searchEntry, req);
  if (uci == null) return null;
  final p = Position.fromFen(startFen);
  for (final u in uciHistory) {
    final m = p.parseUci(u);
    if (m == null) break;
    p.make(m);
  }
  return p.parseUci(uci);
}

String? _searchEntry(_SearchRequest r) {
  final p = Position.fromFen(r.fen);
  final seen = <int>[p.hash];
  for (final u in r.history) {
    final m = p.parseUci(u);
    if (m == null) break;
    p.make(m);
    seen.add(p.hash);
  }
  return Searcher(p, seen, Random(r.seed)).search(r.depth, r.millis, r.noise)?.uci;
}

const _value = [0, 100, 320, 330, 500, 900, 0];

// Piece-square tables from white's point of view, index a1 = 0 (rank 1 first).
const _pst = <List<int>>[
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10, -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30, 5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5, 5, 5, 5, 5, 0, -10, 0, 0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20, -10, -20, -30, -30, -40, -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30],
];
const _kingEnd = [-50, -30, -30, -30, -30, -30, -30, -50, -30, -30, 0, 0, 0, 0, -30, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -20, -10, 0, 0, -10, -20, -30, -50, -40, -30, -20, -20, -30, -40, -50];

const _mate = 100000;
const _inf = 1000000;

class _TT {
  _TT(this.depth, this.score, this.flag, this.move);
  final int depth, score, flag; // flag 0 exact, 1 lower bound, 2 upper bound
  final Move? move;
}

class Searcher {
  Searcher(this.p, this.seen, this.rand);
  final Position p;
  final List<int> seen; // position hashes along the game and the search path
  final Random rand;
  final Map<int, _TT> _tt = {};
  final List<List<Move?>> _killers = List.generate(64, (_) => [null, null]);
  late int _deadline;
  int _nodes = 0;
  bool _stopped = false;
  final _clock = Stopwatch();

  int evaluate() {
    var score = 0, material = 0;
    for (var s = 0; s < 64; s++) {
      final pc = p.board[s];
      if (pc == empty) continue;
      final t = typeOf(pc);
      if (t != king && t != pawn) material += _value[t];
    }
    final endgame = material <= 2600;
    for (var s = 0; s < 64; s++) {
      final pc = p.board[s];
      if (pc == empty) continue;
      final t = typeOf(pc);
      final idx = colorOf(pc) == white ? s : (7 - rankOf(s)) * 8 + fileOf(s);
      final v = _value[t] + (t == king && endgame ? _kingEnd[idx] : _pst[t][idx]);
      score += colorOf(pc) == white ? v : -v;
    }
    return p.turn == white ? score : -score;
  }

  Move? search(int maxDepth, int millis, int noise) {
    _clock.start();
    _deadline = millis;
    final root = p.legalMoves();
    if (root.isEmpty) return null;
    if (root.length == 1) return root.first;
    Move? best = root[rand.nextInt(root.length)];
    for (var depth = 1; depth <= maxDepth; depth++) {
      var alpha = -_inf;
      Move? iterBest;
      final scored = <(Move, int)>[];
      _order(root, best, 0);
      for (final m in root) {
        p.make(m);
        seen.add(p.hash);
        var score = -_negamax(depth - 1, -_inf, -alpha, 1, true);
        seen.removeLast();
        p.unmake();
        if (_stopped) break;
        if (noise > 0) score += rand.nextInt(noise * 2 + 1) - noise;
        scored.add((m, score));
        if (score > alpha) {
          alpha = score;
          iterBest = m;
        }
      }
      if (_stopped) {
        if (iterBest != null && scored.length > root.length ~/ 2) best = iterBest;
        break;
      }
      best = iterBest ?? best;
      if (alpha.abs() > _mate - 100) break; // found a forced mate
      if (_clock.elapsedMilliseconds > _deadline / 2) break; // next depth won't finish
    }
    return best;
  }

  void _order(List<Move> moves, Move? first, int ply) {
    int key(Move m) {
      if (m == first) return 1 << 30;
      if (m.isCapture) return 1 << 20 | _value[typeOf(m.captured)] * 10 - _value[typeOf(p.board[m.from])] ~/ 10;
      if (m.promotion != 0) return 1 << 19;
      if (ply < 64 && (_killers[ply][0] == m || _killers[ply][1] == m)) return 1 << 18;
      return 0;
    }

    moves.sort((a, b) => key(b).compareTo(key(a)));
  }

  int _negamax(int depth, int alpha, int beta, int ply, bool allowNull) {
    if ((++_nodes & 1023) == 0 && _clock.elapsedMilliseconds > _deadline) _stopped = true;
    if (_stopped) return 0;
    // Repetition or fifty-move rule: a draw.
    if (p.halfmove >= 100) return 0;
    var reps = 0;
    for (var i = seen.length - 3; i >= 0 && i >= seen.length - 1 - p.halfmove; i -= 2) {
      if (seen[i] == p.hash && ++reps >= 1) return 0;
    }

    final inCheck = p.inCheck;
    if (inCheck) depth++;
    if (depth <= 0) return _quiesce(alpha, beta, 0);

    final entry = _tt[p.hash];
    if (entry != null && entry.depth >= depth) {
      if (entry.flag == 0) return entry.score;
      if (entry.flag == 1 && entry.score >= beta) return entry.score;
      if (entry.flag == 2 && entry.score <= alpha) return entry.score;
    }

    // Null move pruning: if passing still fails high, this node is good enough.
    if (allowNull && !inCheck && depth >= 3 && evaluate() >= beta) {
      p.makeNull();
      final score = -_negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      p.unmakeNull();
      if (score >= beta) return beta;
    }

    final moves = p.pseudoMoves();
    _order(moves, entry?.move, ply);
    var legal = 0, best = -_inf;
    Move? bestMove;
    final alpha0 = alpha;
    for (final m in moves) {
      p.make(m);
      final k = p.kingSquare(p.turn ^ 8);
      if (k >= 0 && p.isAttacked(k, p.turn)) {
        p.unmake();
        continue;
      }
      legal++;
      seen.add(p.hash);
      final score = -_negamax(depth - 1, -beta, -alpha, ply + 1, true);
      seen.removeLast();
      p.unmake();
      if (_stopped) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!m.isCapture && ply < 64) {
          _killers[ply][1] = _killers[ply][0];
          _killers[ply][0] = m;
        }
        break;
      }
    }
    if (legal == 0) return inCheck ? -_mate + ply : 0;
    if (_tt.length > 200000) _tt.clear();
    _tt[p.hash] = _TT(depth, best, best <= alpha0 ? 2 : (best >= beta ? 1 : 0), bestMove);
    return best;
  }

  int _quiesce(int alpha, int beta, int qply) {
    if ((++_nodes & 1023) == 0 && _clock.elapsedMilliseconds > _deadline) _stopped = true;
    if (_stopped) return 0;
    final stand = evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qply > 8) return stand;
    final moves = p.pseudoMoves(capturesOnly: true);
    _order(moves, null, 64);
    for (final m in moves) {
      p.make(m);
      final k = p.kingSquare(p.turn ^ 8);
      if (k >= 0 && p.isAttacked(k, p.turn)) {
        p.unmake();
        continue;
      }
      final score = -_quiesce(-beta, -alpha, qply + 1);
      p.unmake();
      if (_stopped) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
}

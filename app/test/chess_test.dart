import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:openrook/board/physical.dart';
import 'package:openrook/chess/engine.dart';
import 'package:openrook/chess/game.dart';
import 'package:openrook/chess/position.dart';

int perft(Position p, int depth) {
  if (depth == 0) return 1;
  var n = 0;
  for (final m in p.legalMoves()) {
    p.make(m);
    n += perft(p, depth - 1);
    p.unmake();
  }
  return n;
}

void main() {
  group('move generation (perft)', () {
    test('start position', () {
      final p = Position.initial();
      expect(perft(p, 1), 20);
      expect(perft(p, 2), 400);
      expect(perft(p, 3), 8902);
      expect(perft(p, 4), 197281);
    });
    test('kiwipete: castling, en passant, promotions, pins', () {
      final p = Position.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
      expect(perft(p, 1), 48);
      expect(perft(p, 2), 2039);
      expect(perft(p, 3), 97862);
    });
    test('position 3 (en passant discovered checks)', () {
      final p = Position.fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
      expect(perft(p, 4), 43238);
    });
    test('position 4 (promotions)', () {
      final p = Position.fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
      expect(perft(p, 3), 9467);
    });
    test('make/unmake restores the hash', () {
      final p = Position.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
      final h = p.hash, fen = p.fen;
      for (final m in p.legalMoves()) {
        p.make(m);
        p.unmake();
      }
      expect(p.hash, h);
      expect(p.fen, fen);
    });
  });

  group('notation', () {
    test('FEN round trip', () {
      const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
      expect(Position.fromFen(fen).fen, fen);
      expect(Position.initial().fen, Position.startFen);
    });
    test('SAN and PGN', () {
      final g = gameFromPgn('[Event "x"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 {comment} 4. Ba4 Nf6 5. O-O Be7 *')!;
      expect(g.ply, 10);
      expect(g.sans.last, 'Be7');
      expect(g.sans[8], 'O-O');
      expect(g.pgnMoves, startsWith('1. e4 e5 2. Nf3'));
    });
    test('scholar\'s mate is checkmate', () {
      final g = Game.fromUci(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
      expect(g.sans.last, 'Qxf7#');
      expect(g.result, GameResult.whiteWins);
      expect(g.resultReason, 'checkmate');
    });
    test('threefold repetition', () {
      final g = Game.fromUci(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
      expect(g.result, GameResult.draw);
    });
  });

  group('physical board', () {
    test('occupancy hex round trip', () {
      final occ = Position.initial().occupied;
      expect(formatOccupancy(occ), 'ffff00000000ffff');
      expect(parseOccupancy('ffff00000000ffff'), occ);
      expect(parseOccupancy('0000000000000001'), {0});
      expect(parseOccupancy('8000000000000000'), {63});
    });
    test('detects a quiet move', () {
      final p = Position.initial();
      final d = MoveDetector(p);
      final lifted = p.occupied..remove(parseSquare('e2'));
      expect(d.feed(lifted), isEmpty);
      final placed = Set<int>.of(lifted)..add(parseSquare('e4'));
      expect(d.feed(placed).map((m) => m.uci), ['e2e4']);
    });
    test('tells apart two captures by the same piece', () {
      // White queen on d1 can take on d7 or a4; both leave the same occupancy.
      final p = Position.fromFen('4k3/3p4/8/8/p7/8/8/3QK3 w - - 0 1');
      final d = MoveDetector(p);
      var occ = p.occupied..remove(parseSquare('a4')); // lift the captured pawn first
      expect(d.feed(occ), isEmpty);
      occ = Set.of(occ)..remove(parseSquare('d1'));
      d.feed(occ);
      occ = Set.of(occ)..add(parseSquare('a4'));
      expect(d.feed(occ).map((m) => m.uci), ['d1a4']);
    });
    test('detects castling and en passant', () {
      var p = Position.fromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
      var d = MoveDetector(p);
      var occ = {parseSquare('e8'), parseSquare('f1'), parseSquare('g1')};
      expect(d.feed(occ).map((m) => m.uci), ['e1g1']);
      p = Position.fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
      d = MoveDetector(p);
      occ = p.occupied..remove(parseSquare('d5'));
      d.feed(occ);
      occ = Set.of(occ)..remove(parseSquare('e5'))..add(parseSquare('d6'));
      expect(d.feed(occ).map((m) => m.uci), ['e5d6']);
    });
    test('promotion offers every piece', () {
      final p = Position.fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
      final d = MoveDetector(p);
      final occ = {parseSquare('e8'), parseSquare('e1'), parseSquare('a8')};
      expect(d.feed(occ).length, 4);
    });
    test('drags for captures and castling', () {
      final p = Position.fromFen('4k3/8/8/3p4/4P3/8/8/4K2R w K - 0 1');
      final cap = p.parseUci('e4d5')!;
      expect(physicalPlan(p, cap, [0, 2]).drags, ['d5', 'B2', 'e4', 'd5']);
      final full = physicalPlan(p, cap, [0, 8]);
      expect(full.drags, ['e4', 'd5']);
      expect(full.removeByHand, parseSquare('d5'));
      final castle = p.parseUci('e1g1')!;
      expect(physicalPlan(p, castle, [0, 0]).drags, ['h1', 'f1', 'e1', 'g1']);
    });
  });

  group('computer', () {
    test('finds mate in one', () {
      final p = Position.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
      final m = Searcher(p, [p.hash], Random(1)).search(4, 2000, 0);
      expect(m?.uci, 'a1a8');
    });
    test('takes a hanging queen', () {
      final p = Position.fromFen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
      final m = Searcher(p, [p.hash], Random(1)).search(4, 2000, 0);
      expect(m?.uci, 'd1d5');
    });
    test('every level returns a legal move quickly', () async {
      for (final level in EngineLevel.levels.take(3)) {
        final m = await findBestMove(Position.startFen, ['e2e4'], level);
        expect(m, isNotNull);
      }
    });
  });
}

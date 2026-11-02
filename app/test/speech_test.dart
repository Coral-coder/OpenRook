import 'package:flutter_test/flutter_test.dart';
import 'package:openrook/chess/game.dart';
import 'package:openrook/chess/position.dart';
import 'package:openrook/voice/speech_moves.dart';

List<String> said(String text, Position p) => movesFromSpeech(text, p).map((m) => m.uci).toList();

void main() {
  final start = Position.initial();
  test('plain squares mean the pawn', () {
    expect(said('e4', start), ['e2e4']);
    expect(said('E 4', start), ['e2e4']);
    expect(said('echo four', start), ['e2e4']);
    expect(said('pawn to d four', start), ['d2d4']);
  });
  test('pieces, misheard pieces and from-to', () {
    expect(said('knight to f3', start), ['g1f3']);
    expect(said('night to f three', start), ['g1f3']);
    expect(said('horse to c3', start), ['b1c3']);
    expect(said('e2 to e4', start), ['e2e4']);
    expect(said('g one to f three', start), ['g1f3']);
  });
  test('captures', () {
    final g = Game.fromUci(['e2e4', 'd7d5']);
    expect(said('e takes d5', g.position), ['e4d5']);
    expect(said('pawn takes d five', g.position), ['e4d5']);
    final g2 = Game.fromUci(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6']);
    expect(said('bishop takes c6', g2.position), ['b5c6']);
    expect(said('bishop takes knight on see six', g2.position), ['b5c6']);
  });
  test('castling', () {
    final g = Game.fromUci(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']);
    expect(said('castle kingside', g.position), ['e1g1']);
    expect(said('castles', g.position), ['e1g1']);
    expect(said('short castle', g.position), ['e1g1']);
  });
  test('promotion', () {
    final p = Position.fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(said('a8', p), ['a7a8q']);
    expect(said('a8 knight', p), ['a7a8n']);
    expect(said('pawn to a eight promote to rook', p), ['a7a8r']);
  });
  test('ambiguity is reported, nonsense gives nothing', () {
    final p = Position.fromFen('4k3/8/8/8/8/8/8/R3K2R w - - 0 1');
    expect(said('rook to d1', p), ['a1d1']);
    expect(said('rook to f1', p), ['h1f1']);
    final p2 = Position.fromFen('4k3/8/8/8/8/8/8/R6R w - - 0 1');
    expect(said('rook to d1', p2).length, 2);
    expect(said('hello there', start), isEmpty);
  });
  test('announcer', () {
    final g = Game.fromUci(['e2e4', 'd7d5']);
    expect(spokenMove(g.position, g.position.parseUci('e4d5')!), 'Pawn takes pawn on D 5');
    expect(spokenMove(start, start.parseUci('g1f3')!), 'Knight to F 3');
  });
}

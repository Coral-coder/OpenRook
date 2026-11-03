import 'package:flutter_test/flutter_test.dart';
import 'package:openrook/chess/position.dart';
import 'package:openrook/voice/phonemes.dart';
import 'package:openrook/voice/speech_moves.dart';

void main() {
  test('the neural voice can say every announcement', () {
    // positions with castling, promotion (with capture), en passant and checks
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'r3k2r/pPppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      'n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1',
      '4k3/8/8/3pP3/8/8/8/4K2Q w - d6 0 1',
    ];
    var n = 0;
    for (final fen in fens) {
      final p = Position.fromFen(fen);
      for (final m in p.legalMoves()) {
        for (final suffix in ['', '. Check!', '. Checkmate!', '. Check.', '. Checkmate.']) {
          final text = spokenMove(p, m) + suffix;
          expect(announcementPhonemes(text), isNotNull, reason: text);
          n++;
        }
      }
    }
    expect(n, greaterThan(100));
    expect(announcementPhonemes('Knight to F 3. Check!')!.length, 2);
    expect(announcementPhonemes('Knight to F 3. Check.')!.length, 2);
    expect(announcementPhonemes('Hello Steve'), isNull);
  });
}

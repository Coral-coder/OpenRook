import 'package:flutter_test/flutter_test.dart';
import 'package:openrook/net/nostr_pool.dart';

void main() {
  test('room cipher round trip and tamper detection', () {
    final a = RoomCipher('ABC234'), b = RoomCipher('abc234'), other = RoomCipher('ZZZ999');
    final msg = '{"t":"mv","ply":0,"uci":"e2e4"}' * 5;
    final enc = a.encrypt(msg);
    expect(b.decrypt(enc), msg);
    expect(other.decrypt(enc), isNull);
    final tampered = enc.substring(0, 20) + (enc[20] == 'A' ? 'B' : 'A') + enc.substring(21);
    expect(a.decrypt(tampered), isNull);
    expect(RoomCipher.roomTag('abc234'), RoomCipher.roomTag('ABC234'));
  });

  test('match codes avoid look-alike characters', () {
    for (var i = 0; i < 50; i++) {
      final c = newMatchCode();
      expect(c.length, 6);
      expect(c.contains(RegExp('[01IO]')), isFalse);
    }
  });

  test('identities are valid keys', () {
    final s = newIdentity();
    expect(publicKeyOf(s).length, 64);
  });
}

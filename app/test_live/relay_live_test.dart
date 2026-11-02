// Live test against real public relays (needs internet; not part of `flutter test`):
//   flutter test test_live/relay_live_test.dart
// ignore_for_file: avoid_print

import 'package:flutter_test/flutter_test.dart';
import 'package:openrook/net/lobby.dart';
import 'package:openrook/net/match.dart';
import 'package:openrook/net/nostr_pool.dart';

void main() {
  test('two players over public relays: lobby pairing, room, moves', () async {
    final a = NostrPool(secretKey: newIdentity()), b = NostrPool(secretKey: newIdentity());
    await Future.delayed(const Duration(seconds: 4));
    print('relays a=${a.connected} b=${b.connected}');
    final la = Lobby(a, 'Alice'), lb = Lobby(b, 'Bob');
    final results = await Future.wait([la.seek(), lb.seek()]).timeout(const Duration(seconds: 60));
    print('paired: ${results[0]} / ${results[1]}');
    expect(results[0].code, results[1].code);
    expect(results[0].host != results[1].host, isTrue);
    final code = results[0].code;
    final ra = RoomMatch(pool: a, code: code, myName: 'Alice', isHost: results[0].host);
    final rb = RoomMatch(pool: b, code: code, myName: 'Bob', isHost: results[1].host);
    ra.open();
    rb.open();
    Future<void> until(bool Function() f) async {
      for (var i = 0; i < 120 && !f(); i++) {
        await Future.delayed(const Duration(milliseconds: 250));
      }
      expect(f(), isTrue);
    }
    await until(() => ra.started && rb.started);
    expect(ra.white, rb.white);
    print('white=${ra.names[ra.white]} black=${ra.names[ra.black]}');
    final w = ra.myColor == 'w' ? ra : rb, bl = ra.myColor == 'w' ? rb : ra;
    w.sendMove('e2e4');
    await until(() => bl.moves.length == 1);
    print('step: black got e4');
    bl.sendMove('e7e5');
    await until(() => w.moves.length == 2);
    print('step: white got e5');
    expect(w.moves, ['e2e4', 'e7e5']);
    // A third party with the code can't move for a player.
    final c = NostrPool(secretKey: newIdentity());
    final rc = RoomMatch(pool: c, code: code, myName: 'Eve', isHost: false);
    rc.open();
    print('eve start=${rc.started} moves=${rc.moves}');
    await until(() => rc.moves.length == 2);
    print('step: eve sees 2');
    rc.sendMove('g1f3');
    await Future.delayed(const Duration(seconds: 3));
    expect(w.moves.length, 2);
    // Resume from history on a fresh connection with Bob's identity.
    final b2 = NostrPool(secretKey: b.secretKey);
    final rb2 = RoomMatch(pool: b2, code: code, myName: 'Bob', isHost: results[1].host);
    rb2.open();
    await until(() => rb2.moves.length == 2 && rb2.started);
    print('resumed from relay history: ${rb2.moves}');
    for (final p in [a, b, c, b2]) {
      p.close();
    }
  }, timeout: const Timeout(Duration(minutes: 3)));
}

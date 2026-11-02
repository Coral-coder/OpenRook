import 'dart:async';

import 'package:flutter/material.dart';

import '../app/game_controller.dart';
import '../app/settings.dart';
import '../net/lobby.dart';
import '../net/match.dart';
import '../net/nostr_pool.dart';
import 'game_screen.dart';

void _startRoom(BuildContext context, String code, {required bool host, String pref = 'r', bool random = false, String opponent = 'Friend'}) {
  final s = Settings.shared;
  s.rememberRoom(SavedRoom(code: code, host: host, opponent: opponent, created: DateTime.now().millisecondsSinceEpoch));
  final room = RoomMatch(pool: s.pool, code: code, myName: s.name, isHost: host, colorPref: pref);
  Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => GameScreen(controller: GameController.room(room, random: random))));
}

/// Create a code for a friend, or type the code a friend sent you.
class FriendScreen extends StatefulWidget {
  const FriendScreen({super.key});
  @override
  State<FriendScreen> createState() => _FriendScreenState();
}

class _FriendScreenState extends State<FriendScreen> {
  final _code = TextEditingController();
  String _pref = 'r';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Play a friend')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Start a game', style: theme.textTheme.titleLarge),
        const SizedBox(height: 8),
        const Text('You get a code to send your friend. They can join now or later: moves wait on the relays, '
            'so you can also play slowly over days.'),
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'w', label: Text('I play White')),
            ButtonSegment(value: 'r', label: Text('Random')),
            ButtonSegment(value: 'b', label: Text('I play Black')),
          ],
          selected: {_pref},
          onSelectionChanged: (s) => setState(() => _pref = s.first),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          icon: const Icon(Icons.add),
          label: const Text('Create game code'),
          onPressed: () => _startRoom(context, newMatchCode(), host: true, pref: _pref),
        ),
        const Divider(height: 48),
        Text('Join a friend', style: theme.textTheme.titleLarge),
        const SizedBox(height: 8),
        TextField(
          controller: _code,
          textCapitalization: TextCapitalization.characters,
          style: const TextStyle(fontSize: 24, letterSpacing: 4),
          decoration: const InputDecoration(labelText: 'Code', border: OutlineInputBorder()),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          icon: const Icon(Icons.login),
          label: const Text('Join'),
          onPressed: _code.text.trim().length < 4 ? null : () => _startRoom(context, _code.text.trim().toUpperCase(), host: false),
        ),
      ]),
    );
  }
}

/// Matchmaking with whoever else is looking right now.
class RandomScreen extends StatefulWidget {
  const RandomScreen({super.key});
  @override
  State<RandomScreen> createState() => _RandomScreenState();
}

class _RandomScreenState extends State<RandomScreen> {
  Lobby? _lobby;
  int _others = 0;
  int _relays = 0;
  StreamSubscription? _s1, _s2;
  final _started = DateTime.now();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    final s = Settings.shared;
    _relays = s.pool.connected;
    _s2 = s.pool.status.listen((n) => setState(() => _relays = n));
    _lobby = Lobby(s.pool, s.name);
    _s1 = _lobby!.seekersChanged.listen((n) => setState(() => _others = n));
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
    _lobby!.seek().then((r) {
      if (!mounted) return;
      _startRoom(context, r.code, host: r.host, random: true, opponent: _lobby!.seekers[r.opponent] ?? 'Online opponent');
    });
  }

  @override
  void dispose() {
    _lobby?.cancel();
    _s1?.cancel();
    _s2?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final secs = DateTime.now().difference(_started).inSeconds;
    return Scaffold(
      appBar: AppBar(title: const Text('Play someone random')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox(width: 64, height: 64, child: CircularProgressIndicator()),
            const SizedBox(height: 24),
            Text('Looking for an opponent… ${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text('$_others other player${_others == 1 ? '' : 's'} looking · $_relays relays connected'),
            const SizedBox(height: 24),
            const Text('Tip: nobody around? Lichess has players around the clock, and it works with your board too.', textAlign: TextAlign.center),
          ]),
        ),
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/game_controller.dart';
import '../app/settings.dart';
import '../net/chesscom.dart';
import '../net/lichess.dart';
import 'game_screen.dart';

/// Lichess: paste a personal token once, then seek, challenge a friend or the lichess AI,
/// or resume a game in progress. Games appear on your board through the Board API.
class LichessScreen extends StatefulWidget {
  const LichessScreen({super.key});
  @override
  State<LichessScreen> createState() => _LichessScreenState();
}

class _LichessScreenState extends State<LichessScreen> {
  final s = Settings.shared;
  final _token = TextEditingController();
  final _friend = TextEditingController();
  Lichess? api;
  String? error;
  bool busy = false, seeking = false;
  List<Map<String, dynamic>> playing = [];
  StreamSubscription? _events;
  int minutes = 15, increment = 10, aiLevel = 3;

  @override
  void initState() {
    super.initState();
    if (s.lichessToken.isNotEmpty) _login(s.lichessToken);
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  Future<void> _login(String token) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final a = Lichess(token);
      s.lichessUser = await a.username();
      s.lichessToken = token;
      await s.save();
      api = a;
      playing = await a.playing();
      _events = a.events().listen((e) {
        if (e['type'] == 'gameStart' && mounted) {
          final id = (e['game'] as Map)['gameId'] ?? (e['game'] as Map)['id'];
          _open(id as String);
        }
      }, onError: (_) {});
    } catch (e) {
      error = e.toString().replaceFirst('Bad state: ', '');
    }
    if (mounted) setState(() => busy = false);
  }

  bool _opened = false;
  void _open(String id) {
    if (_opened) return;
    _opened = true;
    seeking = false;
    Navigator.push(context, MaterialPageRoute(builder: (_) => GameScreen(controller: GameController.lichess(api!, id)))).then((_) async {
      _opened = false;
      try {
        playing = await api!.playing();
      } catch (_) {}
      if (mounted) setState(() {});
    });
  }

  Future<void> _do(Future<void> Function() f) async {
    setState(() => error = null);
    try {
      await f();
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Lichess')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (error != null) Card(color: Colors.red.shade900, child: Padding(padding: const EdgeInsets.all(12), child: Text(error!))),
        if (busy) const LinearProgressIndicator(),
        if (api == null) ...[
          const Text('OpenRook plays on lichess.org with lichess\'s Board API, made for physical boards. '
              'Create a personal API token (it needs "Play games with the board API" and "Create challenges"), then paste it here.'),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.open_in_new),
            label: const Text('Create a token on lichess.org'),
            onPressed: () => launchUrl(Uri.parse(Lichess.tokenUrl), mode: LaunchMode.externalApplication),
          ),
          const SizedBox(height: 12),
          TextField(controller: _token, decoration: const InputDecoration(labelText: 'API token (lip_…)', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          FilledButton(onPressed: busy ? null : () => _login(_token.text.trim()), child: const Text('Sign in')),
        ] else ...[
          ListTile(
            leading: const Icon(Icons.account_circle),
            title: Text(s.lichessUser),
            trailing: TextButton(
              onPressed: () async {
                s.lichessToken = '';
                s.lichessUser = '';
                await s.save();
                _events?.cancel();
                setState(() => api = null);
              },
              child: const Text('Sign out'),
            ),
          ),
          if (playing.isNotEmpty) ...[
            Text('In progress', style: theme.textTheme.titleMedium),
            for (final g in playing)
              Card(
                child: ListTile(
                  title: Text('vs ${(g['opponent'] as Map?)?['username'] ?? 'opponent'}'),
                  subtitle: Text(g['isMyTurn'] == true ? 'Your move' : 'Their move'),
                  onTap: () => _open(g['gameId'] as String),
                ),
              ),
            const SizedBox(height: 12),
          ],
          Text('Time control: $minutes+$increment', style: theme.textTheme.titleMedium),
          Text('The Board API allows rapid and slower games.', style: theme.textTheme.bodySmall),
          Wrap(spacing: 8, children: [
            for (final tc in const [(10, 0), (10, 5), (15, 10), (30, 0), (30, 20)])
              ChoiceChip(
                label: Text('${tc.$1}+${tc.$2}'),
                selected: minutes == tc.$1 && increment == tc.$2,
                onSelected: (_) => setState(() {
                  minutes = tc.$1;
                  increment = tc.$2;
                }),
              ),
          ]),
          const SizedBox(height: 16),
          FilledButton.icon(
            icon: seeking ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.public),
            label: Text(seeking ? 'Seeking an opponent…' : 'Play a random opponent'),
            onPressed: seeking
                ? null
                : () {
                    setState(() => seeking = true);
                    _do(() => api!.seek(minutes: minutes, increment: increment)).whenComplete(() {
                      if (mounted) setState(() => seeking = false);
                    });
                  },
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: Text('Lichess AI level $aiLevel')),
            Expanded(
              flex: 2,
              child: Slider(value: aiLevel.toDouble(), min: 1, max: 8, divisions: 7, onChanged: (v) => setState(() => aiLevel = v.round())),
            ),
          ]),
          OutlinedButton.icon(
            icon: const Icon(Icons.smart_toy),
            label: const Text('Play Stockfish on lichess'),
            onPressed: () => _do(() async {
              final id = await api!.challengeAi(level: aiLevel, minutes: minutes, increment: increment);
              _open(id);
            }),
          ),
          const SizedBox(height: 16),
          TextField(controller: _friend, decoration: const InputDecoration(labelText: 'Challenge a lichess user', border: OutlineInputBorder())),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            icon: const Icon(Icons.send),
            label: const Text('Send challenge'),
            onPressed: () => _do(() async {
              await api!.challengeUser(_friend.text.trim(), minutes: minutes, increment: increment);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Challenge sent. The game opens when they accept.')));
              }
            }),
          ),
        ],
      ]),
    );
  }
}

/// Chess.com Daily games, mirrored on the board.
class ChessComScreen extends StatefulWidget {
  const ChessComScreen({super.key});
  @override
  State<ChessComScreen> createState() => _ChessComScreenState();
}

class _ChessComScreenState extends State<ChessComScreen> {
  final s = Settings.shared;
  late final _user = TextEditingController(text: s.chessComUser);
  List<ChessComGame>? games;
  Map<String, int> ratings = {};
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    if (s.chessComUser.isNotEmpty) _load();
  }

  Future<void> _load() async {
    final u = _user.text.trim();
    if (u.isEmpty) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      games = await ChessCom.dailyGames(u);
      ratings = await ChessCom.ratings(u).catchError((_) => <String, int>{});
      s.chessComUser = u;
      await s.save();
    } catch (e) {
      error = e.toString().replaceFirst('Bad state: ', '');
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final u = s.chessComUser;
    return Scaffold(
      appBar: AppBar(title: const Text('Chess.com Daily')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Chess.com has no public API for making moves, so OpenRook mirrors your Daily games: '
              'the board plays your opponent\'s moves, you play yours on the board, and the app tells you what to enter on chess.com.'),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(controller: _user, decoration: const InputDecoration(labelText: 'Chess.com username', border: OutlineInputBorder()))),
            const SizedBox(width: 8),
            FilledButton(onPressed: busy ? null : _load, child: const Text('Load')),
          ]),
          if (busy) const LinearProgressIndicator(),
          if (error != null) Card(color: Colors.red.shade900, child: Padding(padding: const EdgeInsets.all(12), child: Text(error!))),
          if (ratings.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Wrap(spacing: 8, children: [for (final r in ratings.entries) Chip(label: Text('${r.key} ${r.value}'))]),
            ),
          if (games != null && games!.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No Daily games in progress.')),
          for (final g in games ?? <ChessComGame>[])
            Card(
              child: ListTile(
                title: Text('${g.white} vs ${g.black}'),
                subtitle: Text(g.turn == g.colorOf(u) ? 'Your move' : 'Their move'),
                trailing: IconButton(
                  icon: const Icon(Icons.open_in_new),
                  onPressed: () => launchUrl(Uri.parse(g.url), mode: LaunchMode.externalApplication),
                ),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => GameScreen(controller: GameController.chessCom(g, u)))),
              ),
            ),
        ]),
      ),
    );
  }
}

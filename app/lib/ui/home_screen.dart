import 'dart:convert';

import 'package:flutter/material.dart';

import '../app/game_controller.dart';
import '../app/settings.dart';
import '../voice/neural_voice.dart';
import '../board/board_link.dart';
import '../chess/engine.dart';
import '../chess/position.dart';
import '../net/match.dart';
import 'board_screen.dart';
import 'game_screen.dart';
import 'integrations_screen.dart';
import 'online_screens.dart';
import 'settings_screen.dart';

void openGame(BuildContext context, GameController c) {
  Navigator.push(context, MaterialPageRoute(builder: (_) => GameScreen(controller: c)));
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    final settings = Settings.shared;
    return Scaffold(
      appBar: AppBar(
        title: const Text('OpenRook'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
              setState(() {});
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // first run: the announcer's neural voice is being fetched
          ListenableBuilder(
            listenable: NeuralVoice.shared,
            builder: (context, _) {
              final n = NeuralVoice.shared;
              if (n.status != 'downloading' && n.status != 'unpacking') return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      n.status == 'downloading'
                          ? 'Summoning the announcer\'s voice… ${(n.progress * 100).round()}%'
                          : 'Installing the announcer\'s voice…',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(value: n.status == 'downloading' ? n.progress : null),
                  ],
                ),
              );
            },
          ),
          if (settings.savedComputerGame != null)
            _Tile(
              icon: Icons.play_circle,
              title: 'Resume game vs computer',
              subtitle: 'Pick up where you left off',
              onTap: () {
                final j = jsonDecode(settings.savedComputerGame!) as Map<String, dynamic>;
                openGame(
                  context,
                  GameController.computer(
                    color: j['color'] as int? ?? white,
                    level: j['level'] as int? ?? settings.engineLevel,
                    fen: j['fen'] as String?,
                    moves: (j['moves'] as List).cast<String>(),
                  ),
                );
              },
            ),
          _Tile(
            icon: Icons.smart_toy,
            title: 'Play the computer',
            subtitle: 'The engine runs on your phone, no internet needed',
            onTap: _computer,
          ),
          _Tile(
            icon: Icons.people,
            title: 'Two players, one board',
            subtitle: 'Over-the-board game; the app keeps score',
            onTap: () => openGame(context, GameController.sameBoard()),
          ),
          _Tile(
            icon: Icons.group_add,
            title: 'Play a friend',
            subtitle: 'Anywhere in the world, with a 6-letter code',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FriendScreen())).then((_) => setState(() {})),
          ),
          _Tile(
            icon: Icons.public,
            title: 'Play someone random',
            subtitle: 'Find an OpenRook player online right now',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RandomScreen())),
          ),
          _Tile(
            icon: Icons.bolt,
            title: 'Lichess',
            subtitle: 'Real lichess.org games from your board',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LichessScreen())),
          ),
          _Tile(
            icon: Icons.mail_outline,
            title: 'Chess.com Daily',
            subtitle: 'Mirror your daily games on the board',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChessComScreen())),
          ),
          const Padding(padding: EdgeInsets.fromLTRB(4, 16, 4, 4), child: Text('Smart board (optional)')),
          const _BoardCard(),
          if (settings.rooms.any((r) => !r.finished)) ...[
            const Padding(padding: EdgeInsets.fromLTRB(4, 16, 4, 4), child: Text('Games with friends')),
            for (final r in settings.rooms.where((r) => !r.finished))
              Card(
                child: ListTile(
                  leading: const Icon(Icons.history),
                  title: Text(r.opponent),
                  subtitle: Text('Code ${r.code}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.close),
                    tooltip: 'Forget',
                    onPressed: () {
                      settings.rooms.remove(r);
                      settings.save();
                      setState(() {});
                    },
                  ),
                  onTap: () => openGame(
                    context,
                    GameController.room(RoomMatch(pool: settings.pool, code: r.code, myName: settings.name, isHost: r.host)),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Future<void> _computer() async {
    final settings = Settings.shared;
    var level = settings.engineLevel;
    var color = 'w';
    final go = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, set) => AlertDialog(
          title: const Text('Play the computer'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Strength: ${EngineLevel.levels[level].name}'),
              Slider(
                value: level.toDouble(),
                min: 0,
                max: (EngineLevel.levels.length - 1).toDouble(),
                divisions: EngineLevel.levels.length - 1,
                onChanged: (v) => set(() => level = v.round()),
              ),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'w', label: Text('White')),
                  ButtonSegment(value: 'r', label: Text('Random')),
                  ButtonSegment(value: 'b', label: Text('Black')),
                ],
                selected: {color},
                onSelectionChanged: (s) => set(() => color = s.first),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Play')),
          ],
        ),
      ),
    );
    if (go != true || !mounted) return;
    settings.engineLevel = level;
    await settings.save();
    final c = color == 'r' ? (DateTime.now().microsecond.isEven ? white : black) : (color == 'w' ? white : black);
    if (!mounted) return;
    openGame(context, GameController.computer(color: c, level: level));
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: Icon(icon, size: 32, color: Theme.of(context).colorScheme.primary),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}

class _BoardCard extends StatelessWidget {
  const _BoardCard();
  @override
  Widget build(BuildContext context) {
    final board = BoardLink.shared;
    return ListenableBuilder(
      listenable: board,
      builder: (context, _) {
        final connected = board.connected;
        return Card(
          color: connected ? Colors.green.shade900 : const Color(0xFF221D18),
          child: ListTile(
            leading: Icon(connected ? Icons.grid_on : Icons.bluetooth_searching, size: 32),
            title: Text(connected ? '${board.boardName ?? 'Board'} connected' : 'Connect an OpenRook board'),
            subtitle: Text(
              connected
                  ? 'Firmware ${board.firmware ?? '?'}${board.sensorsOk ? '' : ' · sensor board missing!'}'
                  : 'Everything works on the phone. A built board adds real pieces that move by themselves.',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BoardScreen())),
          ),
        );
      },
    );
  }
}

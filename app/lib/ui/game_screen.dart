import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/game_controller.dart';
import '../app/settings.dart';
import '../board/board_link.dart';
import '../chess/position.dart';
import '../voice/voice.dart';
import 'battle_board.dart';
import 'board_view.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.controller});
  final GameController controller;
  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  GameController get c => widget.controller;
  Timer? _tick;
  bool _flip = false;

  @override
  void initState() {
    super.initState();
    c.addListener(_changed);
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (c.whiteMs != null && mounted) setState(() {});
    });
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  Future<void> _listen() async {
    final voice = Voice.shared;
    if (voice.listening) {
      await voice.stopListening();
      return;
    }
    await voice.listen((transcripts) {
      final msg = c.voiceMove(transcripts);
      if (msg.isNotEmpty && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    });
    if (voice.error != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(voice.error!)));
    }
  }

  void _impact(bool heavy) {
    if (!Settings.shared.haptics) return;
    heavy ? HapticFeedback.heavyImpact() : HapticFeedback.mediumImpact();
  }

  @override
  void dispose() {
    _tick?.cancel();
    c.removeListener(_changed);
    c.dispose();
    super.dispose();
  }

  String _clock(int? ms) {
    if (ms == null) return '';
    final s = ms ~/ 1000;
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  Widget _player(int color) {
    final name = color == white ? c.whiteName : c.blackName;
    final captured = c.game.captured[color == white ? 1 : 0]; // pieces this player took
    final toMove = !c.over && c.game.turn == color;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      child: Row(
        children: [
          Icon(Icons.circle, size: 14, color: color == white ? Colors.white : Colors.black, shadows: const [Shadow(blurRadius: 2)]),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              name,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontWeight: toMove ? FontWeight.bold : FontWeight.normal, fontSize: 16),
            ),
          ),
          Wrap(children: [for (final p in captured) PieceGlyph(p, size: 16)]),
          if (c.clockOf(color) != null)
            Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: toMove ? Colors.amber.shade700 : Colors.white10, borderRadius: BorderRadius.circular(4)),
              child: Text(_clock(c.clockOf(color)), style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()], fontSize: 16)),
            ),
        ],
      ),
    );
  }

  Future<void> _confirm(String title, Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Yes')),
        ],
      ),
    );
    if (ok == true) await action();
  }

  @override
  Widget build(BuildContext context) {
    final flipped = c.flipped ^ _flip;
    final board = BoardLink.shared;
    final top = flipped ? white : black, bottom = flipped ? black : white;
    final settings = Settings.shared;
    return Scaffold(
      floatingActionButton: c.over
          ? null
          : ListenableBuilder(
              listenable: Voice.shared,
              builder: (context, _) {
                final listening = Voice.shared.listening;
                return FloatingActionButton.extended(
                  onPressed: c.canPlay || listening ? _listen : null,
                  backgroundColor: listening ? Colors.redAccent : (c.canPlay ? null : Colors.grey.shade800),
                  icon: Icon(listening ? Icons.hearing : Icons.mic),
                  label: Text(listening ? (Voice.shared.heard.isEmpty ? 'Listening…' : Voice.shared.heard) : 'Say a move'),
                );
              },
            ),
      appBar: AppBar(
        title: Text(c.title),
        actions: [
          if (c.room != null)
            IconButton(
              tooltip: 'Share code',
              icon: const Icon(Icons.share),
              onPressed: () => SharePlus.instance.share(ShareParams(text: 'Play chess with me on OpenRook — code ${c.room!.code}')),
            ),
          IconButton(
            tooltip: settings.battleView ? 'Flat board' : 'Battle view',
            icon: Icon(settings.battleView ? Icons.grid_on : Icons.view_in_ar),
            onPressed: () {
              settings.battleView = !settings.battleView;
              settings.save();
              setState(() {});
            },
          ),
          IconButton(tooltip: 'Flip board', icon: const Icon(Icons.swap_vert), onPressed: () => setState(() => _flip = !_flip)),
          PopupMenuButton<String>(
            onSelected: (v) async {
              switch (v) {
                case 'resign':
                  await _confirm('Resign this game?', c.resign);
                case 'draw':
                  await c.offerDraw();
                case 'undo':
                  await c.takeBack();
                case 'pgn':
                  await Clipboard.setData(ClipboardData(text: c.game.pgnMoves));
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Moves copied')));
                case 'stop':
                  await board.stop();
              }
            },
            itemBuilder: (_) => [
              if (!c.over) const PopupMenuItem(value: 'resign', child: Text('Resign')),
              if (!c.over && c.opponent != Opponent.computer && c.opponent != Opponent.chessCom)
                const PopupMenuItem(value: 'draw', child: Text('Offer draw')),
              if (c.opponent == Opponent.computer || c.opponent == Opponent.sameBoard)
                const PopupMenuItem(value: 'undo', child: Text('Take back')),
              const PopupMenuItem(value: 'pgn', child: Text('Copy moves (PGN)')),
              if (board.connected) const PopupMenuItem(value: 'stop', child: Text('Emergency stop board')),
            ],
          ),
        ],
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(center: Alignment(0, -0.35), radius: 1.1, colors: [Color(0xFF3A3029), Color(0xFF120E0B)]),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth > constraints.maxHeight * 1.2;
              final boardWidget = ConstrainedBox(
                constraints: BoxConstraints(maxWidth: wide ? constraints.maxHeight - 110 : 640),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _player(top),
                    BattleBoard(
                      position: c.game.position,
                      ply: c.game.ply,
                      lastMove: c.game.lastMove,
                      flipped: flipped,
                      threeD: settings.battleView,
                      mismatch: board.connected ? c.mismatch : const {},
                      interactive: c.canPlay,
                      onMove: (m) => c.playLocal(m),
                      matedKing: c.matedKing,
                      onImpact: _impact,
                    ),
                    _player(bottom),
                  ],
                ),
              );
              final info = _info(context);
              return wide
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(padding: const EdgeInsets.all(8), child: boardWidget),
                        Expanded(child: info),
                      ],
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(8, 8, 8, 88),
                      children: [
                        Center(child: boardWidget),
                        info,
                      ],
                    );
            },
          ),
        ),
      ),
    );
  }

  Widget _info(BuildContext context) {
    final board = BoardLink.shared;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  if (c.thinking || c.boardMoving)
                    const Padding(
                      padding: EdgeInsets.only(right: 12),
                      child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    ),
                  Expanded(child: Text(c.boardMoving ? 'Board is moving the pieces…' : c.status, style: theme.textTheme.titleMedium)),
                ],
              ),
            ),
          ),
          if (c.error != null)
            Card(
              color: Colors.red.shade900,
              child: Padding(padding: const EdgeInsets.all(12), child: Text(c.error!)),
            ),
          if (c.room != null && !c.room!.started)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Text('Give your friend this code:'),
                    SelectableText(
                      c.room!.code,
                      style: theme.textTheme.displaySmall?.copyWith(letterSpacing: 6, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 6),
                    Text('Relays connected: ${c.room!.pool.connected}/${c.room!.pool.relays.length}', style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
            ),
          if (board.connected && c.mismatch.isNotEmpty && c.choices.isEmpty && !c.boardMoving)
            Card(
              color: Colors.orange.shade900,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  c.canPlay
                      ? 'Board: finish your move, or fix the squares outlined in red.'
                      : 'The physical board differs from the game on the squares outlined in red. Put those pieces where the screen shows.',
                ),
              ),
            ),
          if (c.choices.isNotEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.choicesFromBoard ? 'Which move did you make?' : 'Which move did you mean?'),
                    Wrap(
                      spacing: 8,
                      children: [for (final m in c.choices) ActionChip(label: Text(c.game.position.san(m)), onPressed: () => c.choose(m))],
                    ),
                  ],
                ),
              ),
            ),
          if (c.drawOfferFrom == 'them' && !c.over)
            Card(
              child: ListTile(
                title: const Text('Your opponent offers a draw'),
                trailing: Wrap(
                  children: [
                    TextButton(onPressed: c.declineDraw, child: const Text('Decline')),
                    FilledButton(onPressed: c.offerDraw, child: const Text('Accept')),
                  ],
                ),
              ),
            ),
          if (c.pendingExternalMove != null && c.chessComUrl != null)
            FilledButton.icon(
              icon: const Icon(Icons.open_in_new),
              label: Text('Play ${c.pendingExternalMove} on chess.com'),
              onPressed: () => launchUrl(Uri.parse(c.chessComUrl!), mode: LaunchMode.externalApplication),
            ),
          const SizedBox(height: 8),
          Text('Tap a piece and then its square, or press Say a move ("knight to f3", "e4", "castle").', style: theme.textTheme.bodySmall),
          const SizedBox(height: 8),
          Text(
            c.game.pgnMoves.isEmpty ? 'No moves yet' : c.game.pgnMoves,
            style: theme.textTheme.bodyMedium?.copyWith(fontFamily: 'monospace'),
          ),
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/foundation.dart';
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
import 'board3d/board3d.dart';
import 'board_view.dart';
import 'replay_screen.dart';

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

  String _voiceNote = '';
  Timer? _noteTimer;

  void _note(String msg) {
    _noteTimer?.cancel();
    setState(() => _voiceNote = msg);
    _noteTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) setState(() => _voiceNote = '');
    });
  }

  Future<void> _listen() async {
    final voice = Voice.shared;
    if (voice.listening || voice.session) {
      await voice.stopListening();
      return;
    }
    if (Settings.shared.alwaysListen) {
      // the mic stays on for the whole game
      await voice.startSession(_phrase);
    } else {
      await voice.listen((transcripts) {
        final msg = c.voiceMove(transcripts);
        if (msg.isNotEmpty && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      });
    }
    if (voice.error != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(voice.error!)));
    }
  }

  /// One phrase heard by the open mic: a view command, or a move when it's our turn.
  void _phrase(List<String> transcripts) {
    if (!mounted) return;
    final said = transcripts.isEmpty ? '' : transcripts.first.toLowerCase();
    final s = Settings.shared;
    if (said.contains('top view') || said.contains('overhead') || said.contains('from above')) {
      s.topDown = true;
      s.save();
      setState(() {});
      return;
    }
    if (said.contains('battle view') || said.contains('normal view')) {
      s.topDown = false;
      s.save();
      setState(() {});
      return;
    }
    if (said.contains('flip')) {
      setState(() => _flip = !_flip);
      return;
    }
    if (!c.canPlay) return; // chatter while the opponent thinks is ignored
    final msg = c.voiceMove(transcripts);
    if (msg.isNotEmpty) _note(msg);
  }

  void _openReplay() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ReplayScreen(
          startFen: c.game.startFen,
          moves: c.game.uciMoves,
          whiteName: c.whiteName,
          blackName: c.blackName,
          flipped: c.flipped,
        ),
      ),
    );
  }

  void _impact(bool heavy) {
    if (!Settings.shared.haptics) return;
    heavy ? HapticFeedback.heavyImpact() : HapticFeedback.mediumImpact();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _noteTimer?.cancel();
    if (Voice.shared.session || Voice.shared.listening) Voice.shared.stopListening();
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
    if (settings.battleView && supports3D && !kIsWeb) return _fullScreen(context, flipped, top, bottom);
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
          _menu(),
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
                    if (settings.battleView)
                      Board3D(
                        position: c.game.position,
                        ply: c.game.ply,
                        lastMove: c.game.lastMove,
                        flipped: flipped,
                        mismatch: board.connected ? c.mismatch : const {},
                        interactive: c.canPlay,
                        onMove: (m) => c.playLocal(m),
                        matedKing: c.matedKing,
                        onImpact: _impact,
                      )
                    else
                      BattleBoard(
                        position: c.game.position,
                        ply: c.game.ply,
                        lastMove: c.game.lastMove,
                        flipped: flipped,
                        threeD: false,
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

  Widget _menu() {
    final board = BoardLink.shared;
    return PopupMenuButton<String>(
      onSelected: (v) async {
        switch (v) {
          case 'resign':
            await _confirm('Resign this game?', c.resign);
          case 'draw':
            await c.offerDraw();
          case 'undo':
            await c.takeBack();
          case 'replay':
            _openReplay();
          case 'pgn':
            await Clipboard.setData(ClipboardData(text: c.game.pgnMoves));
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Moves copied')));
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
        if (c.game.ply > 0) const PopupMenuItem(value: 'replay', child: Text('Replay the battles')),
        const PopupMenuItem(value: 'pgn', child: Text('Copy moves (PGN)')),
        if (board.connected) const PopupMenuItem(value: 'stop', child: Text('Emergency stop board')),
      ],
    );
  }

  Widget _micButton() {
    return ListenableBuilder(
      listenable: Voice.shared,
      builder: (context, _) {
        final v = Voice.shared;
        final on = v.listening || v.session;
        final label = _voiceNote.isNotEmpty
            ? _voiceNote
            : on
            ? (v.heard.isEmpty ? (v.session ? 'Mic on: call your moves' : 'Listening…') : v.heard)
            : 'Say a move';
        return FloatingActionButton.extended(
          heroTag: 'mic',
          onPressed: c.canPlay || on || Settings.shared.alwaysListen ? _listen : null,
          backgroundColor: on ? Colors.redAccent.withValues(alpha: 0.9) : (c.canPlay ? null : Colors.grey.shade800),
          icon: Icon(on ? (v.session ? Icons.mic : Icons.hearing) : Icons.mic_none),
          label: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 220),
            child: Text(label, overflow: TextOverflow.ellipsis),
          ),
        );
      },
    );
  }

  Widget _chip(int color) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    padding: const EdgeInsets.symmetric(horizontal: 8),
    decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(10)),
    child: _player(color),
  );

  void _showMoves() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xEE15110E),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: SingleChildScrollView(
            child: Text(
              c.game.pgnMoves.isEmpty ? 'No moves yet' : c.game.pgnMoves,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 15),
            ),
          ),
        ),
      ),
    );
  }

  /// The battle fills the whole screen; everything else floats over it.
  Widget _fullScreen(BuildContext context, bool flipped, int top, int bottom) {
    final board = BoardLink.shared;
    final settings = Settings.shared;
    final theme = Theme.of(context);
    final cards = _cards(context);
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      floatingActionButton: c.over ? null : _micButton(),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        flexibleSpace: const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xCC000000), Color(0x00000000)],
            ),
          ),
        ),
        title: Text(c.title, style: const TextStyle(shadows: [Shadow(blurRadius: 6)])),
        actions: [
          if (c.room != null)
            IconButton(
              tooltip: 'Share code',
              icon: const Icon(Icons.share),
              onPressed: () => SharePlus.instance.share(ShareParams(text: 'Play chess with me on OpenRook — code ${c.room!.code}')),
            ),
          IconButton(
            tooltip: settings.topDown ? 'Battle view' : 'Top-down view',
            icon: Icon(settings.topDown ? Icons.threed_rotation : Icons.grid_view),
            onPressed: () {
              settings.topDown = !settings.topDown;
              settings.save();
              setState(() {});
            },
          ),
          IconButton(tooltip: 'Moves', icon: const Icon(Icons.list_alt), onPressed: _showMoves),
          IconButton(tooltip: 'Flip board', icon: const Icon(Icons.swap_vert), onPressed: () => setState(() => _flip = !_flip)),
          _menu(),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: Board3D(
              fill: true,
              position: c.game.position,
              ply: c.game.ply,
              lastMove: c.game.lastMove,
              flipped: flipped,
              mismatch: board.connected ? c.mismatch : const {},
              interactive: c.canPlay,
              onMove: (m) => c.playLocal(m),
              matedKing: c.matedKing,
              onImpact: _impact,
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(height: kToolbarHeight - 8),
                _chip(top),
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(20)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (c.thinking || c.boardMoving)
                        const Padding(
                          padding: EdgeInsets.only(right: 8),
                          child: SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2)),
                        ),
                      Text(c.boardMoving ? 'Board is moving the pieces…' : c.status, style: theme.textTheme.bodyMedium),
                    ],
                  ),
                ),
                const Spacer(),
                if (cards.isNotEmpty)
                  ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.4),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: cards),
                    ),
                  ),
                _chip(bottom),
                SizedBox(height: c.over ? 8 : 72),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _cards(BuildContext context) {
    final board = BoardLink.shared;
    final theme = Theme.of(context);
    return [
      if (c.over && c.game.ply > 0)
        Card(
          color: const Color(0xFF3A2E1F),
          child: ListTile(
            leading: const Icon(Icons.movie_filter, color: Color(0xFFE0B84A)),
            title: const Text('Watch the replay'),
            subtitle: const Text('The whole game, every battle, the camera in the thick of it'),
            onTap: _openReplay,
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
                SelectableText(c.room!.code, style: theme.textTheme.displaySmall?.copyWith(letterSpacing: 6, fontWeight: FontWeight.bold)),
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
    ];
  }

  Widget _info(BuildContext context) {
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
          ..._cards(context),
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

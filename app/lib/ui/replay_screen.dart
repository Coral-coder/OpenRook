import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/settings.dart';
import '../chess/game.dart';
import '../voice/speech_moves.dart';
import '../voice/voice.dart';
import 'battle_board.dart';
import 'board3d/board3d.dart';

/// Watch a game again with the board brought to life: every move is acted out, every
/// capture fought, with the camera following the action. Play, pause, step and change speed.
class ReplayScreen extends StatefulWidget {
  const ReplayScreen({super.key, required this.startFen, required this.moves, this.whiteName = 'White', this.blackName = 'Black', this.flipped = false});
  final String startFen;
  final List<String> moves; // UCI
  final String whiteName, blackName;
  final bool flipped;

  @override
  State<ReplayScreen> createState() => _ReplayScreenState();
}

class _ReplayScreenState extends State<ReplayScreen> {
  late Game _full; // the whole game, for the move list
  late Game _game; // the position being shown
  bool _playing = true;
  double _speed = 1;
  Timer? _next, _fallback;
  bool _announce = true;

  bool get _threeD => supports3D && Settings.shared.battleView;

  @override
  void initState() {
    super.initState();
    _full = Game.fromUci(widget.moves, fen: widget.startFen);
    _game = Game(fen: widget.startFen);
    _announce = Settings.shared.announce;
    _schedule(const Duration(milliseconds: 1200));
  }

  @override
  void dispose() {
    _next?.cancel();
    _fallback?.cancel();
    Voice.shared.stopSpeaking();
    super.dispose();
  }

  void _schedule(Duration after) {
    _next?.cancel();
    if (!_playing || _game.ply >= _full.ply) return;
    _next = Timer(after, _stepForward);
  }

  void _stepForward() {
    if (_game.ply >= _full.ply) {
      setState(() => _playing = false);
      return;
    }
    final m = _full.moves[_game.ply];
    final before = _game.position.copy();
    _game.play(m);
    if (_announce) {
      var text = spokenMove(before, m);
      if (_game.result != GameResult.ongoing && _game.resultReason == 'checkmate') {
        text += '. Checkmate!';
      } else if (_game.position.inCheck) {
        text += '. Check!';
      }
      Voice.shared.say(text);
    }
    setState(() {});
    // The 3D board says when it's done; this is only a safety net (and the timing for the
    // flat board, which never reports).
    _fallback?.cancel();
    final wait = _threeD ? (m.isCapture ? 16.0 : 6.0) : (m.isCapture ? 2.2 : 1.4);
    _fallback = Timer(Duration(milliseconds: (wait * 1000 / _speed).round()), _onIdle);
  }

  void _onIdle() {
    _fallback?.cancel();
    if (!mounted) return;
    if (_game.ply >= _full.ply) {
      setState(() => _playing = false);
      return;
    }
    _schedule(Duration(milliseconds: (700 / _speed).round()));
  }

  void _jumpTo(int ply) {
    _next?.cancel();
    _fallback?.cancel();
    setState(() {
      _playing = false;
      _game = Game.fromUci(widget.moves.take(ply.clamp(0, _full.ply)).toList(), fen: widget.startFen);
    });
  }

  void _togglePlay() {
    setState(() => _playing = !_playing);
    if (_playing) {
      if (_game.ply >= _full.ply) _game = Game(fen: widget.startFen);
      _schedule(const Duration(milliseconds: 300));
    } else {
      _next?.cancel();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final settings = Settings.shared;
    final mated = _game.result != GameResult.ongoing && _game.resultReason == 'checkmate' ? _game.position.kingSquare(_game.turn) : -1;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Replay'),
        actions: [
          IconButton(
            tooltip: _announce ? 'Mute the announcer' : 'Announce moves',
            icon: Icon(_announce ? Icons.record_voice_over : Icons.voice_over_off),
            onPressed: () => setState(() => _announce = !_announce),
          ),
        ],
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(center: Alignment(0, -0.35), radius: 1.1, colors: [Color(0xFF3A3029), Color(0xFF120E0B)]),
        ),
        child: SafeArea(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: Text('${widget.whiteName}  vs  ${widget.blackName}', style: theme.textTheme.titleMedium),
            ),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: _threeD
                      ? Board3D(
                          position: _game.position,
                          ply: _game.ply,
                          lastMove: _game.lastMove,
                          flipped: widget.flipped,
                          interactive: false,
                          matedKing: mated,
                          cinema: settings.cinematic ? 'all' : 'off',
                          speed: _speed,
                          onIdle: _onIdle,
                          onImpact: (heavy) {
                            if (settings.haptics) heavy ? HapticFeedback.heavyImpact() : HapticFeedback.mediumImpact();
                          },
                        )
                      : BattleBoard(
                          position: _game.position,
                          ply: _game.ply,
                          lastMove: _game.lastMove,
                          flipped: widget.flipped,
                          threeD: supports3D ? false : settings.battleView,
                          interactive: false,
                          matedKing: mated,
                        ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                _game.ply == 0
                    ? 'Starting position'
                    : 'Move ${(_game.ply + 1) ~/ 2}${_game.ply.isOdd ? '' : '…'} ${_full.sans[_game.ply - 1]}'
                        '${_game.result != GameResult.ongoing ? '  ·  ${_game.resultText}' : ''}',
                style: theme.textTheme.titleMedium,
              ),
            ),
            Slider(
              value: _game.ply.toDouble(),
              min: 0,
              max: _full.ply.toDouble().clamp(1, double.infinity),
              divisions: _full.ply > 0 ? _full.ply : 1,
              onChanged: _full.ply == 0 ? null : (v) => _jumpTo(v.round()),
            ),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              IconButton(tooltip: 'Start', icon: const Icon(Icons.skip_previous), onPressed: () => _jumpTo(0)),
              IconButton(tooltip: 'Back one move', icon: const Icon(Icons.chevron_left), onPressed: () => _jumpTo(_game.ply - 1)),
              IconButton.filled(
                iconSize: 36,
                tooltip: _playing ? 'Pause' : 'Play',
                icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
                onPressed: _togglePlay,
              ),
              IconButton(
                tooltip: 'Next move (with its battle)',
                icon: const Icon(Icons.chevron_right),
                onPressed: _game.ply >= _full.ply
                    ? null
                    : () {
                        _next?.cancel();
                        setState(() => _playing = false);
                        _stepForward();
                      },
              ),
              TextButton(
                onPressed: () => setState(() => _speed = _speed == 1 ? 2 : (_speed == 2 ? 0.5 : 1)),
                child: Text('${_speed == 0.5 ? '½' : _speed.toInt()}×', style: const TextStyle(fontSize: 18)),
              ),
            ]),
            const SizedBox(height: 8),
          ]),
        ),
      ),
    );
  }
}

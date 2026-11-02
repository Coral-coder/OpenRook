import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/settings.dart';
import '../../chess/position.dart';
import '../battle_board.dart';
import '../stone_pieces.dart';
import 'view_io.dart' if (dart.library.js_interop) 'view_web.dart';

/// Whether this platform can show the WebGL board (WebView or iframe).
bool get supports3D => kIsWeb || Platform.isAndroid || Platform.isIOS || Platform.isMacOS;

/// The real 3D battle board: sculpted figures that walk, gallop and fight, rendered with
/// three.js in an embedded page (assets/board3d/board3d.html, built from app/board3d/).
/// The chess stays here; the page only shows it and reports taps. Falls back to the 2.5D
/// [BattleBoard] where there's no WebView (Windows, Linux).
class Board3D extends StatefulWidget {
  const Board3D({
    super.key,
    required this.position,
    required this.ply,
    this.lastMove,
    this.flipped = false,
    this.mismatch = const {},
    this.interactive = true,
    this.onMove,
    this.matedKing = -1,
    this.onImpact,
    this.cinema,
    this.speed = 1,
    this.onIdle,
    this.onShown,
    this.fill = false,
  });

  /// Fill the space it's given (full-screen play) instead of a board-shaped box.
  final bool fill;

  final Position position;
  final int ply;
  final Move? lastMove;
  final bool flipped;
  final Set<int> mismatch;
  final bool interactive;
  final void Function(Move)? onMove;
  final int matedKing;
  final void Function(bool heavy)? onImpact;

  /// Camera: 'fights' (close-ups of captures), 'all' (follow every move: replays) or 'off'.
  /// Defaults to the player's setting.
  final String? cinema;

  /// Animation speed (replays: 0.5, 1 or 2).
  final double speed;

  /// Called when the board has finished acting out everything it was given.
  final VoidCallback? onIdle;

  /// The same, with the ply the board has now acted out up to.
  final void Function(int ply)? onShown;

  @override
  State<Board3D> createState() => _Board3DState();
}

String? _html;

class _Board3DState extends State<Board3D> {
  void Function(String)? _send;
  bool _ready = false;
  int? _selected;
  String? _lastSent;

  @override
  void initState() {
    super.initState();
    if (_html == null && supports3D) {
      rootBundle.loadString('assets/board3d/board3d.html').then((h) {
        _html = h;
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void didUpdateWidget(Board3D old) {
    super.didUpdateWidget(old);
    if (old.ply != widget.ply || old.position.fen != widget.position.fen) _selected = null;
    _push();
  }

  void _onMessage(String raw) {
    Map<String, dynamic> m;
    try {
      m = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    switch (m['type']) {
      case 'ready':
        _ready = true;
        _lastSent = null;
        _push();
      case 'tap':
        _tap(m['square'] as int);
      case 'impact':
        widget.onImpact?.call(m['heavy'] == true);
      case 'idle':
        widget.onIdle?.call();
      case 'shown':
        if (m['ply'] is int) widget.onShown?.call(m['ply'] as int);
    }
  }

  Future<void> _tap(int sq) async {
    if (!widget.interactive || widget.onMove == null) return;
    final p = widget.position;
    if (_selected != null) {
      final moves = p.legalMoves().where((m) => m.from == _selected && m.to == sq).toList();
      if (moves.isNotEmpty) {
        var move = moves.first;
        if (moves.length > 1) {
          final t = await _askPromotion(context, p.turn);
          if (t == null) return;
          move = moves.firstWhere((m) => m.promotion == t);
        }
        _selected = null;
        widget.onMove!(move);
        return;
      }
    }
    final piece = p.board[sq];
    _selected = (piece != empty && colorOf(piece) == p.turn && _selected != sq) ? sq : null;
    _push();
  }

  void _push() {
    if (!_ready || _send == null) return;
    final p = widget.position;
    final m = widget.lastMove;
    final legal = _selected == null ? const <Move>[] : p.legalMoves().where((x) => x.from == _selected).toList();
    Map<String, dynamic>? last;
    if (m != null) {
      List<int>? rook;
      if (m.isCastle) {
        final kingSide = m.flags & Move.castleKing != 0;
        rook = [kingSide ? m.from + 3 : m.from - 4, kingSide ? m.from + 1 : m.from - 1];
      }
      last = {
        'from': m.from,
        'to': m.to,
        'cap': m.isCapture ? m.captureSquare : -1,
        'castleRook': rook,
        'promo': m.promotion == 0 ? 0 : (colorOf(p.board[m.to]) | m.promotion),
      };
    }
    final msg = jsonEncode({
      'type': 'state',
      'board': p.board,
      'ply': widget.ply,
      'last': last,
      'flipped': widget.flipped,
      'selected': _selected ?? -1,
      'targets': [for (final x in legal) if (!x.isCapture) x.to],
      'captureTargets': [for (final x in legal) if (x.isCapture) x.to],
      'mismatch': widget.mismatch.toList(),
      'check': p.inCheck ? p.kingSquare(p.turn) : -1,
      'mated': widget.matedKing,
      'sound': Settings.shared.moveSounds,
      'cinema': widget.cinema ?? (Settings.shared.cinematic ? 'fights' : 'off'),
      'speed': widget.speed,
      'style': Settings.shared.style == 'toon' ? 'toon' : 'stone',
      'view': Settings.shared.topDown ? 'top' : 'battle',
    });
    if (msg == _lastSent) return;
    _lastSent = msg;
    _send!(msg);
  }

  @override
  Widget build(BuildContext context) {
    if (!supports3D) {
      return BattleBoard(
        position: widget.position,
        ply: widget.ply,
        lastMove: widget.lastMove,
        flipped: widget.flipped,
        mismatch: widget.mismatch,
        interactive: widget.interactive,
        onMove: widget.onMove,
        matedKing: widget.matedKing,
        onImpact: widget.onImpact,
      );
    }
    final view = _html == null
        ? const Center(child: CircularProgressIndicator())
        : Board3DView(
            html: _html!,
            onMessage: _onMessage,
            onSender: (send) => _send = send,
          );
    if (widget.fill) return SizedBox.expand(child: view);
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth;
      return SizedBox(
        width: w,
        height: w * 0.95,
        child: ClipRRect(borderRadius: BorderRadius.circular(6), child: view),
      );
    });
  }
}

Future<int?> _askPromotion(BuildContext context, int color) => showDialog<int>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Promote to'),
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            for (final t in const [queen, rook, bishop, knight])
              InkWell(
                onTap: () => Navigator.pop(context, t),
                child: Padding(padding: const EdgeInsets.all(8), child: StonePiece(color | t, size: 56)),
              ),
          ]),
        ],
      ),
    );

import 'package:flutter/material.dart';

import '../chess/position.dart';
import 'stone_pieces.dart';

const lightSquare = Color(0xFFEAD9B5);
const darkSquare = Color(0xFFB08560);

/// A piece icon (carved stone, same as the battle board).
class PieceGlyph extends StatelessWidget {
  const PieceGlyph(this.piece, {super.key, required this.size});
  final int piece;
  final double size;
  @override
  Widget build(BuildContext context) => StonePiece(piece, size: size);
}

/// The on-screen board: shows the game, highlights the last move and any squares where the
/// physical board disagrees, and lets the player move by tapping.
class ChessBoardView extends StatefulWidget {
  const ChessBoardView({
    super.key,
    required this.position,
    this.flipped = false,
    this.lastMove = const {},
    this.mismatch = const {},
    this.onMove,
    this.interactive = true,
  });
  final Position position;
  final bool flipped;
  final Set<int> lastMove;
  final Set<int> mismatch;
  final void Function(Move move)? onMove;
  final bool interactive;

  @override
  State<ChessBoardView> createState() => _ChessBoardViewState();
}

class _ChessBoardViewState extends State<ChessBoardView> {
  int? selected;

  @override
  void didUpdateWidget(ChessBoardView old) {
    super.didUpdateWidget(old);
    if (old.position.fen != widget.position.fen) selected = null;
  }

  List<Move> get _targets => selected == null ? const [] : widget.position.legalMoves().where((m) => m.from == selected).toList();

  Future<void> _tap(int sq) async {
    if (!widget.interactive || widget.onMove == null) return;
    final p = widget.position;
    final moves = _targets.where((m) => m.to == sq).toList();
    if (moves.isNotEmpty) {
      var move = moves.first;
      if (moves.length > 1) {
        final picked = await pickPromotion(context, p.turn);
        if (picked == null) return;
        move = moves.firstWhere((m) => m.promotion == picked);
      }
      setState(() => selected = null);
      widget.onMove!(move);
      return;
    }
    final piece = p.board[sq];
    setState(() => selected = (piece != empty && colorOf(piece) == p.turn && selected != sq) ? sq : null);
  }

  @override
  Widget build(BuildContext context) {
    final targets = {for (final m in _targets) m.to};
    final checkSq = widget.position.inCheck ? widget.position.kingSquare(widget.position.turn) : -1;
    return AspectRatio(
      aspectRatio: 1,
      child: LayoutBuilder(builder: (context, c) {
        final s = c.maxWidth / 8;
        return Container(
          decoration: BoxDecoration(boxShadow: const [BoxShadow(blurRadius: 12, color: Colors.black54)], borderRadius: BorderRadius.circular(4)),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (var row = 0; row < 8; row++)
              Row(children: [
                for (var col = 0; col < 8; col++) _square(widget.flipped ? row * 8 + 7 - col : (7 - row) * 8 + col, s, targets, checkSq, row, col),
              ]),
          ]),
        );
      }),
    );
  }

  Widget _square(int sq, double s, Set<int> targets, int checkSq, int row, int col) {
    final light = (fileOf(sq) + rankOf(sq)).isOdd;
    var color = light ? lightSquare : darkSquare;
    if (widget.lastMove.contains(sq)) color = Color.alphaBlend(const Color(0x88D7C34A), color);
    if (sq == selected) color = Color.alphaBlend(const Color(0xAA6DA34D), color);
    if (sq == checkSq) color = Color.alphaBlend(const Color(0xAAE04040), color);
    final piece = widget.position.board[sq];
    final label = TextStyle(fontSize: s * 0.18, fontWeight: FontWeight.w600, color: light ? darkSquare : lightSquare);
    return GestureDetector(
      onTap: () => _tap(sq),
      child: Container(
        width: s,
        height: s,
        color: color,
        child: Stack(children: [
          if (col == 0) Positioned(left: 2, top: 1, child: Text('${rankOf(sq) + 1}', style: label)),
          if (row == 7) Positioned(right: 3, bottom: 0, child: Text(String.fromCharCode(97 + fileOf(sq)), style: label)),
          if (piece != empty) Center(child: PieceGlyph(piece, size: s * 0.78)),
          if (targets.contains(sq))
            Center(
              child: Container(
                width: piece == empty ? s * 0.28 : s * 0.9,
                height: piece == empty ? s * 0.28 : s * 0.9,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: piece == empty ? const Color(0x55203020) : null,
                  border: piece == empty ? null : Border.all(color: const Color(0x77203020), width: s * 0.07),
                ),
              ),
            ),
          if (widget.mismatch.contains(sq))
            Positioned.fill(child: Container(decoration: BoxDecoration(border: Border.all(color: Colors.redAccent, width: s * 0.07)))),
        ]),
      ),
    );
  }
}

Future<int?> pickPromotion(BuildContext context, int color) => showDialog<int>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Promote to'),
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            for (final t in const [queen, rook, bishop, knight])
              InkWell(
                onTap: () => Navigator.pop(context, t),
                child: Padding(padding: const EdgeInsets.all(8), child: PieceGlyph(color | t, size: 44)),
              ),
          ]),
        ],
      ),
    );

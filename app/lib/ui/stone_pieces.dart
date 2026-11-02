import 'dart:math';

import 'package:flutter/material.dart';

import '../chess/position.dart';

/// Carved stone pieces, drawn as vector silhouettes (no fonts involved) with cylindrical
/// shading: pale marble for white, obsidian for black.
///
/// Coordinates are in "piece units": x from -0.5 to 0.5 around the centre, y = 0 at the bottom
/// of the base and growing upwards (up to about 1.2 for the king).

// Half-profiles from the base up, as (radius, height), turned like a lathe.
const _profiles = <int, List<(double, double)>>{
  pawn: [(0.31, 0), (0.31, 0.06), (0.25, 0.1), (0.19, 0.15), (0.12, 0.22), (0.09, 0.42), (0.17, 0.46), (0.17, 0.5), (0.09, 0.53)],
  rook: [(0.33, 0), (0.33, 0.07), (0.26, 0.11), (0.21, 0.16), (0.18, 0.58), (0.25, 0.63), (0.25, 0.82)],
  bishop: [(0.32, 0), (0.32, 0.07), (0.24, 0.11), (0.17, 0.17), (0.1, 0.52), (0.19, 0.56), (0.19, 0.6), (0.1, 0.62)],
  queen: [(0.34, 0), (0.34, 0.07), (0.26, 0.11), (0.18, 0.18), (0.1, 0.62), (0.2, 0.66), (0.2, 0.7), (0.12, 0.73), (0.24, 0.93)],
  king: [(0.35, 0), (0.35, 0.07), (0.27, 0.11), (0.19, 0.18), (0.11, 0.66), (0.21, 0.7), (0.21, 0.74), (0.13, 0.77), (0.23, 0.95), (0.15, 1.0)],
  knight: [(0.33, 0), (0.33, 0.07), (0.25, 0.11), (0.21, 0.16), (0.21, 0.2)],
};

Path _lathe(List<(double, double)> pts, {bool closeTop = true}) {
  final p = Path()..moveTo(-pts.first.$1, -pts.first.$2);
  for (final (r, y) in pts.skip(1)) {
    p.lineTo(-r, -y);
  }
  if (closeTop) p.lineTo(0, -pts.last.$2);
  for (final (r, y) in pts.reversed) {
    p.lineTo(r, -y);
  }
  return p..close();
}

final Map<int, Path> _paths = {};

Path stonePath(int type) => _paths.putIfAbsent(type, () {
      final base = _lathe(_profiles[type]!);
      switch (type) {
        case pawn:
          return Path.combine(PathOperation.union, base, Path()..addOval(Rect.fromCircle(center: const Offset(0, -0.64), radius: 0.135)));
        case rook:
          // Battlements: cut three notches into the top.
          var p = base;
          for (final x in [-0.125, 0.125]) {
            p = Path.combine(PathOperation.difference, p, Path()..addRect(Rect.fromLTRB(x - 0.045, -0.83, x + 0.045, -0.74)));
          }
          return p;
        case bishop:
          var p = Path.combine(PathOperation.union, base, Path()..addOval(Rect.fromCenter(center: const Offset(0, -0.77), width: 0.27, height: 0.38)));
          p = Path.combine(PathOperation.union, p, Path()..addOval(Rect.fromCircle(center: const Offset(0, -0.99), radius: 0.045)));
          // The mitre's slit.
          final slit = Path()
            ..moveTo(0.02, -0.86)
            ..lineTo(0.15, -0.74)
            ..lineTo(0.15, -0.69)
            ..lineTo(0.0, -0.82)
            ..close();
          return Path.combine(PathOperation.difference, p, slit);
        case queen:
          var p = base;
          // Crown points with a ball on each.
          final crown = Path()..moveTo(-0.24, -0.93);
          for (var i = 0; i < 5; i++) {
            final x0 = -0.24 + i * 0.12;
            crown
              ..lineTo(x0 + 0.06, -0.86)
              ..lineTo(x0 + 0.12, -0.93);
          }
          crown
            ..lineTo(0.24, -0.9)
            ..lineTo(-0.24, -0.9)
            ..close();
          p = Path.combine(PathOperation.difference, p, crown);
          for (var i = 0; i <= 4; i++) {
            p = Path.combine(PathOperation.union, p, Path()..addOval(Rect.fromCircle(center: Offset(-0.24 + i * 0.12, -0.95), radius: 0.035)));
          }
          return Path.combine(PathOperation.union, p, Path()..addOval(Rect.fromCircle(center: const Offset(0, -1.02), radius: 0.06)));
        case king:
          final cross = Path()
            ..addRect(const Rect.fromLTRB(-0.035, -1.22, 0.035, -0.98))
            ..addRect(const Rect.fromLTRB(-0.1, -1.15, 0.1, -1.08));
          return Path.combine(PathOperation.union, base, cross);
        case knight:
          final head = Path()
            ..moveTo(-0.2, -0.18)
            ..lineTo(0.22, -0.18)
            ..cubicTo(0.24, -0.4, 0.2, -0.62, 0.12, -0.8) // back of the neck
            ..lineTo(0.1, -0.86)
            ..lineTo(0.02, -0.93) // ear
            ..lineTo(-0.02, -0.84)
            ..cubicTo(-0.12, -0.82, -0.22, -0.74, -0.3, -0.62) // brow to muzzle
            ..lineTo(-0.34, -0.52)
            ..cubicTo(-0.33, -0.46, -0.27, -0.44, -0.22, -0.48) // nose and jaw
            ..lineTo(-0.1, -0.54)
            ..cubicTo(-0.16, -0.42, -0.22, -0.32, -0.2, -0.18)
            ..close();
          var p = Path.combine(PathOperation.union, base, head);
          // Eye and mane notches.
          p = Path.combine(PathOperation.difference, p, Path()..addOval(Rect.fromCircle(center: const Offset(-0.08, -0.72), radius: 0.028)));
          for (var i = 0; i < 3; i++) {
            final y = -0.72 + i * 0.13;
            p = Path.combine(
                PathOperation.difference,
                p,
                Path()
                  ..moveTo(0.21 - i * 0.005, y)
                  ..lineTo(0.13, y + 0.03)
                  ..lineTo(0.2 - i * 0.005, y + 0.06)
                  ..close());
          }
          return p;
      }
      return base;
    });

final _whiteFill = Paint()
  ..shader = const LinearGradient(
    colors: [Color(0xFF8F8372), Color(0xFFF2EBDD), Color(0xFFFFFDF8), Color(0xFFD9CEBB), Color(0xFF7D705F)],
    stops: [0, 0.3, 0.42, 0.68, 1],
  ).createShader(const Rect.fromLTRB(-0.4, -1.2, 0.4, 0));
final _blackFill = Paint()
  ..shader = const LinearGradient(
    colors: [Color(0xFF0B0908), Color(0xFF3E3733), Color(0xFF6B625B), Color(0xFF2A2421), Color(0xFF080606)],
    stops: [0, 0.3, 0.42, 0.68, 1],
  ).createShader(const Rect.fromLTRB(-0.4, -1.2, 0.4, 0));
final _shade = Paint()
  ..shader = const LinearGradient(
    begin: Alignment.bottomCenter,
    end: Alignment.topCenter,
    colors: [Color(0x55000000), Color(0x00000000)],
    stops: [0, 0.35],
  ).createShader(const Rect.fromLTRB(-0.4, -1.2, 0.4, 0));
final _whiteEdge = Paint()
  ..style = PaintingStyle.stroke
  ..strokeWidth = 0.022
  ..strokeJoin = StrokeJoin.round
  ..color = const Color(0xFF4A3D33);
final _blackEdge = Paint()
  ..style = PaintingStyle.stroke
  ..strokeWidth = 0.022
  ..strokeJoin = StrokeJoin.round
  ..color = const Color(0xFF9C8C7A);

/// Paints [piece] standing on [base] (the centre of the bottom of its base), [height] pixels
/// per piece unit, tilted by [lean] radians.
void paintStonePiece(Canvas canvas, int piece, Offset base, double height, {double lean = 0, Color? glow}) {
  final path = stonePath(typeOf(piece));
  final isWhite = colorOf(piece) == white;
  canvas.save();
  canvas.translate(base.dx, base.dy);
  canvas.rotate(lean);
  canvas.scale(height);
  if (glow != null) {
    canvas.drawOval(const Rect.fromLTRB(-0.55, -1.0, 0.55, 0.1), Paint()..color = glow..maskFilter = const MaskFilter.blur(BlurStyle.normal, 0.12));
  }
  // Knights are drawn facing left; black's are mirrored so the armies face each other.
  if (typeOf(piece) == knight && !isWhite) canvas.scale(-1, 1);
  canvas.drawPath(path, isWhite ? _whiteFill : _blackFill);
  canvas.drawPath(path, _shade);
  canvas.drawPath(path, isWhite ? _whiteEdge : _blackEdge);
  canvas.restore();
}

/// A single piece as a widget (captured-piece rows, promotion picker, sensor view).
class StonePiece extends StatelessWidget {
  const StonePiece(this.piece, {super.key, required this.size});
  final int piece;
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: size * 0.8,
        height: size,
        child: CustomPaint(painter: _OnePiece(piece)),
      );
}

class _OnePiece extends CustomPainter {
  _OnePiece(this.piece);
  final int piece;
  @override
  void paint(Canvas canvas, Size size) {
    final h = size.height / 1.25;
    paintStonePiece(canvas, piece, Offset(size.width / 2, size.height - max(1, size.height * 0.03)), h);
  }

  @override
  bool shouldRepaint(_OnePiece old) => old.piece != piece;
}

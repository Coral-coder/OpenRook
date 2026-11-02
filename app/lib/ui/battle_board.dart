import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../chess/position.dart';
import 'stone_pieces.dart';

/// The battle board: a tilted stone board whose pieces march, leap and smash each other.
///
/// Everything is painted by one CustomPainter driven by a single ticker. Moves are queued, so
/// a quick reply (the computer's) waits for the previous fight to finish. A capture is a
/// little fight: the attacker advances, rears back, strikes, and the victim bursts into stone
/// shards and dust while the board shakes. Knights jump, castling rooks vault the king, a
/// promoted pawn transforms in a burst of light, and a checkmated king crumbles.
class BattleBoard extends StatefulWidget {
  const BattleBoard({
    super.key,
    required this.position,
    required this.ply,
    this.lastMove,
    this.flipped = false,
    this.threeD = true,
    this.mismatch = const {},
    this.interactive = true,
    this.onMove,
    this.matedKing = -1,
    this.onImpact,
  });

  final Position position;
  final int ply; // moves played; +1 with a lastMove means "animate this move"
  final Move? lastMove;
  final bool flipped;
  final bool threeD;
  final Set<int> mismatch;
  final bool interactive;
  final void Function(Move)? onMove;
  final int matedKing; // square of a checkmated king, or -1
  final void Function(bool heavy)? onImpact; // for haptics

  @override
  State<BattleBoard> createState() => _BattleBoardState();
}

class _Anim {
  _Anim(this.before, this.after, this.move) {
    final t = typeOf(before.board[move.from]);
    duration = move.isCapture ? 1.45 : (move.isCastle ? 1.1 : (t == knight ? 0.8 : 0.7));
  }
  final Position before, after;
  final Move move;
  late final double duration;
  double start = -1;
  bool impacted = false;
}

class _Shard {
  _Shard(this.u, this.v, this.vu, this.vv, this.z, this.vz, this.rot, this.vrot, this.size, this.color, this.born,
      {this.kind = 0, this.gravity = 9.0});
  final double u, v, vu, vv, z, vz, rot, vrot, size, born, gravity;
  final Color color;
  final int kind; // 0 shard, 1 dust, 2 spark
}

class _BattleBoardState extends State<BattleBoard> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  final _frame = ValueNotifier<int>(0);
  double _now = 0;
  final List<_Anim> _queue = [];
  late Position _shown; // what's on the board when nothing is moving
  late Position _target; // the latest position we were given
  int _targetPly = 0;
  final List<_Shard> _shards = [];
  double _shakeAt = -10, _shakeAmp = 0;
  double _flashAt = -10;
  (double, double)? _flashCell;
  Color _flashColor = Colors.white;
  int? _selected;
  int _matedShattered = -1;
  double _matedAt = -1;
  final _rand = Random();

  @override
  void initState() {
    super.initState();
    _shown = widget.position.copy();
    _target = widget.position.copy();
    _targetPly = widget.ply;
    _ticker = createTicker(_tick);
    _ensureTicking();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _frame.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(BattleBoard old) {
    super.didUpdateWidget(old);
    if (widget.ply == _targetPly && widget.position.fen == _target.fen) {
      _ensureTicking();
      return;
    }
    final m = widget.lastMove;
    if (widget.ply == _targetPly + 1 && m != null && _target.board[m.from] != empty) {
      _queue.add(_Anim(_target.copy(), widget.position.copy(), m));
    } else {
      // Takeback, resync or a jump: no animation.
      _queue.clear();
      _shown = widget.position.copy();
      _matedShattered = -1;
    }
    _target = widget.position.copy();
    _targetPly = widget.ply;
    _selected = null;
    _ensureTicking();
  }

  bool get _busy => _queue.isNotEmpty;
  bool get _inCheck => !_busy && _shown.inCheck;

  void _ensureTicking() {
    final need = _busy || _shards.isNotEmpty || _inCheck || _now - _shakeAt < 0.6 || _now - _flashAt < 0.6 ||
        (widget.matedKing >= 0 && _matedShattered != widget.matedKing);
    if (need && !_ticker.isActive) {
      _ticker.start();
    }
    _frame.value++;
  }

  Duration _base = Duration.zero;
  void _tick(Duration elapsed) {
    if (_base == Duration.zero) _base = elapsed;
    _now = (elapsed - _base).inMicroseconds / 1e6 + _clockOffset;
    // Animations
    if (_queue.isNotEmpty) {
      final a = _queue.first;
      if (a.start < 0) a.start = _now;
      final p = (_now - a.start) / a.duration;
      if (a.move.isCapture && !a.impacted && p >= 0.72) {
        a.impacted = true;
        _impact(a);
      }
      if (p >= 1) {
        _queue.removeAt(0);
        _shown = a.after;
        if (a.move.promotion != 0) _promotionBurst(a);
      }
    }
    // Checkmate: the king crumbles a moment after the last move lands.
    if (!_busy && widget.matedKing >= 0 && _matedShattered != widget.matedKing) {
      if (_matedAt < 0) _matedAt = _now;
      if (_now - _matedAt > 0.45) {
        final k = widget.matedKing;
        final (u, v) = _cell(k);
        _burst(u + 0.5, v + 0.5, _shown.board[k], 46, 1.4);
        _shakeAt = _now;
        _shakeAmp = 0.16;
        _matedShattered = k;
        widget.onImpact?.call(true);
      }
    } else if (widget.matedKing < 0) {
      _matedAt = -1;
    }
    _shards.removeWhere((s) => _now - s.born > (s.kind == 1 ? 1.2 : 2.4));
    _frame.value++;
    final keep = _busy || _shards.isNotEmpty || _inCheck || _now - _shakeAt < 0.6 || _now - _flashAt < 0.6 ||
        (widget.matedKing >= 0 && _matedShattered != widget.matedKing);
    if (!keep) {
      _clockOffset = _now;
      _base = Duration.zero;
      _ticker.stop();
    }
  }

  double _clockOffset = 0;

  (int, int) _cell(int sq) {
    final f = fileOf(sq), r = rankOf(sq);
    return widget.flipped ? (7 - f, 7 - r) : (f, r);
  }

  void _impact(_Anim a) {
    final (u, v) = _cell(a.move.captureSquare);
    final heavy = typeOf(a.move.captured) >= rook;
    _burst(u + 0.5, v + 0.5, a.move.captured, heavy ? 52 : 36, heavy ? 1.3 : 1.0);
    _shakeAt = _now;
    _shakeAmp = heavy ? 0.12 : 0.08;
    _flashAt = _now;
    _flashCell = (u + 0.5, v + 0.5);
    _flashColor = const Color(0xFFFFE0A0);
    widget.onImpact?.call(heavy);
  }

  void _burst(double u, double v, int piece, int n, double power) {
    final white_ = colorOf(piece) == white;
    for (var i = 0; i < n; i++) {
      final ang = _rand.nextDouble() * pi * 2;
      final sp = (0.6 + _rand.nextDouble() * 2.2) * power;
      final shade = _rand.nextDouble();
      final color = white_
          ? Color.lerp(const Color(0xFFF6F1E7), const Color(0xFFA89C8A), shade)!
          : Color.lerp(const Color(0xFF4A4340), const Color(0xFF100D0C), shade)!;
      _shards.add(_Shard(u + (_rand.nextDouble() - 0.5) * 0.2, v + (_rand.nextDouble() - 0.5) * 0.2, cos(ang) * sp, sin(ang) * sp,
          0.15 + _rand.nextDouble() * 0.6, (1.5 + _rand.nextDouble() * 3.0) * power, _rand.nextDouble() * pi,
          (_rand.nextDouble() - 0.5) * 24, 0.06 + _rand.nextDouble() * 0.15, color, _now));
    }
    for (var i = 0; i < 9; i++) {
      final ang = _rand.nextDouble() * pi * 2;
      _shards.add(_Shard(u, v, cos(ang) * 0.5, sin(ang) * 0.5, 0.1, 0.4, 0, 0, 0.25 + _rand.nextDouble() * 0.25,
          const Color(0xFFB9AE9C), _now, kind: 1, gravity: 0));
    }
  }

  void _promotionBurst(_Anim a) {
    final (u, v) = _cell(a.move.to);
    for (var i = 0; i < 34; i++) {
      final ang = _rand.nextDouble() * pi * 2;
      final sp = 0.4 + _rand.nextDouble() * 1.3;
      _shards.add(_Shard(u + 0.5, v + 0.5, cos(ang) * sp, sin(ang) * sp, 0.3 + _rand.nextDouble() * 0.8, 1.5 + _rand.nextDouble() * 2,
          0, 0, 0.04 + _rand.nextDouble() * 0.05, Color.lerp(const Color(0xFFFFF3B0), const Color(0xFFFFB300), _rand.nextDouble())!, _now,
          kind: 2, gravity: 2.5));
    }
    _flashAt = _now;
    _flashCell = (u + 0.5, v + 0.5);
    _flashColor = const Color(0xFFFFF1A8);
    widget.onImpact?.call(false);
  }

  void _onTap(Offset pos, _Proj proj) {
    if (!widget.interactive || widget.onMove == null || _busy) return;
    final sq = proj.hit(pos, widget.flipped);
    if (sq < 0) return;
    final p = widget.position;
    if (_selected != null) {
      final moves = p.legalMoves().where((m) => m.from == _selected && m.to == sq).toList();
      if (moves.isNotEmpty) {
        _pick(moves);
        return;
      }
    }
    final piece = p.board[sq];
    setState(() => _selected = (piece != empty && colorOf(piece) == p.turn && _selected != sq) ? sq : null);
    _frame.value++;
  }

  Future<void> _pick(List<Move> moves) async {
    var move = moves.first;
    if (moves.length > 1) {
      final t = await _askPromotion(context, widget.position.turn);
      if (t == null) return;
      move = moves.firstWhere((m) => m.promotion == t);
    }
    setState(() => _selected = null);
    widget.onMove!(move);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final proj = _Proj(c.maxWidth, widget.threeD);
      return GestureDetector(
        onTapUp: (d) => _onTap(d.localPosition, proj),
        child: SizedBox(
          width: c.maxWidth,
          height: proj.height,
          child: CustomPaint(
            painter: _BattlePainter(this, proj),
          ),
        ),
      );
    });
  }
}

// ---------------------------------------------------------------------------- projection

/// Board cells (u across, v away from the viewer, both 0..8) to screen, with perspective in
/// 3D mode: far rows are smaller and closer together; heights rise straight up the screen.
class _Proj {
  _Proj(this.w, this.threeD) {
    a = threeD ? 0.45 : 0;
    tilt = threeD ? 0.58 : 1.0;
    sq = w * (threeD ? 0.9 : 0.98) / 8;
    cx = w / 2;
    s8 = 1 / (1 + a);
    hb = 8 * sq * tilt;
    top = threeD ? sq * 1.15 : sq * 0.04;
    yNear = top + hb;
    height = yNear + (threeD ? sq * 0.55 : sq * 0.04);
  }
  final double w;
  final bool threeD;
  late final double a, tilt, sq, cx, s8, hb, top, yNear, height;

  double s(double v) => 1 / (1 + a * v / 8);
  double y(double v) => threeD ? yNear - hb * (1 - s(v)) / (1 - s8) : yNear - v * sq;
  Offset p(double u, double v, [double z = 0]) {
    final sc = s(v);
    return Offset(cx + (u - 4) * sq * sc, y(v) - z * sq * sc * (threeD ? 1.0 : 0.5));
  }

  Path quad(double u0, double v0, double u1, double v1) => Path()
    ..moveTo(p(u0, v0).dx, p(u0, v0).dy)
    ..lineTo(p(u1, v0).dx, p(u1, v0).dy)
    ..lineTo(p(u1, v1).dx, p(u1, v1).dy)
    ..lineTo(p(u0, v1).dx, p(u0, v1).dy)
    ..close();

  int hit(Offset pos, bool flipped) {
    for (var u = 0; u < 8; u++) {
      for (var v = 0; v < 8; v++) {
        if (quad(u.toDouble(), v.toDouble(), u + 1.0, v + 1.0).contains(pos)) {
          final f = flipped ? 7 - u : u, r = flipped ? 7 - v : v;
          return r * 8 + f;
        }
      }
    }
    return -1;
  }
}

// ---------------------------------------------------------------------------- painting


class _Sprite {
  _Sprite(this.piece, this.u, this.v, {this.z = 0, this.scale = 1, this.lean = 0, this.glow});
  final int piece;
  final double u, v, z, scale, lean;
  final Color? glow;
}

class _BattlePainter extends CustomPainter {
  _BattlePainter(this.st, this.proj) : super(repaint: st._frame);
  final _BattleBoardState st;
  final _Proj proj;

  BattleBoard get w => st.widget;

  @override
  void paint(Canvas canvas, Size size) {
    final now = st._now;
    // Shake
    final shakeAge = now - st._shakeAt;
    if (shakeAge < 0.45) {
      final k = (1 - shakeAge / 0.45) * st._shakeAmp * proj.sq;
      canvas.translate(sin(now * 90) * k, cos(now * 77) * k * 0.6);
    }
    _board(canvas);
    final sprites = _sprites(now);
    // Shadows first, then pieces from the back row forward.
    for (final s in sprites) {
      _shadow(canvas, s);
    }
    sprites.sort((a, b) => b.v.compareTo(a.v));
    for (final s in sprites) {
      _piece(canvas, s);
    }
    _effects(canvas, now);
  }

  void _board(Canvas canvas) {
    final sq = proj.sq;
    // Carved frame, with a front edge in 3D.
    final frame = proj.quad(-0.35, -0.35, 8.35, 8.35);
    canvas.drawPath(
        frame,
        Paint()
          ..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF3B322B), Color(0xFF1F1915)])
              .createShader(Rect.fromLTWH(0, 0, proj.w, proj.height)));
    if (proj.threeD) {
      final l = proj.p(-0.35, -0.35), r = proj.p(8.35, -0.35);
      canvas.drawPath(
          Path()
            ..moveTo(l.dx, l.dy)
            ..lineTo(r.dx, r.dy)
            ..lineTo(r.dx, r.dy + sq * 0.32)
            ..lineTo(l.dx, l.dy + sq * 0.32)
            ..close(),
          Paint()..color = const Color(0xFF15110E));
    }
    canvas.drawPath(frame, Paint()..color = const Color(0x66C9A66B)..style = PaintingStyle.stroke..strokeWidth = 1.2);
    final last = w.lastMove;
    final lastSquares = (st._busy || last == null) ? <int>{} : {last.from, last.to};
    final targets = (st._selected == null || st._busy)
        ? <int, bool>{}
        : {for (final m in w.position.legalMoves().where((m) => m.from == st._selected)) m.to: m.isCapture};
    for (var u = 0; u < 8; u++) {
      for (var v = 0; v < 8; v++) {
        final f = w.flipped ? 7 - u : u, r = w.flipped ? 7 - v : v;
        final sqi = r * 8 + f;
        final light = (f + r).isOdd;
        final h = ((f * 73 + r * 151) % 13) / 13.0;
        var color = light
            ? Color.lerp(const Color(0xFFD8CFBD), const Color(0xFFC6BBA6), h)!
            : Color.lerp(const Color(0xFF4E433B), const Color(0xFF3B322C), h)!;
        if (lastSquares.contains(sqi)) color = Color.alphaBlend(const Color(0x66E0B84A), color);
        if (sqi == st._selected) color = Color.alphaBlend(const Color(0x8858B368), color);
        final path = proj.quad(u.toDouble(), v.toDouble(), u + 1.0, v + 1.0);
        canvas.drawPath(path, Paint()..color = color);
        // A faint bevel so the squares read as stone slabs.
        canvas.drawPath(path, Paint()..color = const Color(0x22000000)..style = PaintingStyle.stroke..strokeWidth = 0.8);
        if (targets.containsKey(sqi)) {
          final c = proj.p(u + 0.5, v + 0.5);
          final sc = proj.s(v + 0.5);
          final rect = Rect.fromCenter(center: c, width: sq * sc * (targets[sqi]! ? 0.86 : 0.3), height: sq * sc * proj.tilt * (targets[sqi]! ? 0.86 : 0.3));
          canvas.drawOval(
              rect,
              targets[sqi]!
                  ? (Paint()..color = const Color(0xAAE0503A)..style = PaintingStyle.stroke..strokeWidth = sq * sc * 0.07)
                  : (Paint()..color = const Color(0x8858B368)));
        }
        if (w.mismatch.contains(sqi)) {
          canvas.drawPath(path, Paint()..color = Colors.redAccent..style = PaintingStyle.stroke..strokeWidth = sq * 0.06);
        }
      }
    }
    // Coordinates on the frame.
    for (var i = 0; i < 8; i++) {
      final file = String.fromCharCode(97 + (w.flipped ? 7 - i : i));
      final rank = '${w.flipped ? 8 - i : i + 1}';
      _label(canvas, file, proj.p(i + 0.5, -0.18), proj.sq * 0.2 * proj.s(0));
      _label(canvas, rank, proj.p(-0.18, i + 0.5), proj.sq * 0.2 * proj.s(i + 0.5));
    }
  }

  void _label(Canvas canvas, String t, Offset c, double size) {
    final tp = TextPainter(
      text: TextSpan(text: t, style: TextStyle(fontSize: size, color: const Color(0xAAC9A66B), fontWeight: FontWeight.w600)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, c - Offset(tp.width / 2, tp.height / 2));
  }

  List<_Sprite> _sprites(double now) {
    final out = <_Sprite>[];
    final anim = st._queue.isEmpty ? null : st._queue.first;
    final board = (anim?.before ?? st._shown).board;
    final p = anim == null || anim.start < 0 ? 0.0 : ((now - anim.start) / anim.duration).clamp(0.0, 1.0);
    final moving = <int>{};
    if (anim != null) {
      moving.add(anim.move.from);
      if (anim.move.isCastle) moving.add(anim.move.flags & Move.castleKing != 0 ? anim.move.from + 3 : anim.move.from - 4);
    }
    final checkKing = st._inCheck ? st._shown.kingSquare(st._shown.turn) : -1;
    for (var sq = 0; sq < 64; sq++) {
      final pc = board[sq];
      if (pc == empty || moving.contains(sq)) continue;
      if (st._matedShattered == sq && w.matedKing == sq && anim == null) continue;
      final (u, v) = st._cell(sq);
      var du = 0.0, lean = 0.0;
      if (anim != null && anim.move.isCapture && sq == anim.move.captureSquare) {
        if (anim.impacted) continue; // smashed
        if (p > 0.4) {
          final k = ((p - 0.4) / 0.32).clamp(0.0, 1.0);
          du = sin(now * 55) * 0.035 * k; // trembling
          lean = -0.18 * k * _dirSign(anim);
        }
      }
      final selected = sq == st._selected && anim == null;
      out.add(_Sprite(pc, u + 0.5 + du, v + 0.5,
          z: selected ? 0.18 : 0, lean: lean, glow: sq == checkKing ? Color.fromRGBO(255, 40, 30, 0.35 + 0.25 * sin(now * 6)) : null));
    }
    if (anim != null) out.addAll(_moving(anim, p, now));
    return out;
  }

  double _dirSign(_Anim a) {
    final (fu, _) = st._cell(a.move.from);
    final (tu, _) = st._cell(a.move.captureSquare);
    return (tu - fu).sign == 0 ? 1 : (tu - fu).sign.toDouble();
  }

  List<_Sprite> _moving(_Anim a, double p, double now) {
    final m = a.move;
    final piece = a.before.board[m.from];
    final (fu0, fv0) = st._cell(m.from);
    final (tu0, tv0) = st._cell(m.to);
    final fu = fu0 + 0.5, fv = fv0 + 0.5, tu = tu0 + 0.5, tv = tv0 + 0.5;
    final isKnight = typeOf(piece) == knight;
    double ease(double x) => x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2;
    final out = <_Sprite>[];
    if (m.isCastle) {
      final kp = ease((p / 0.6).clamp(0.0, 1.0));
      out.add(_Sprite(piece, fu + (tu - fu) * kp, fv, z: 0.06 * sin(pi * kp)));
      final kingSide = m.flags & Move.castleKing != 0;
      final rf = kingSide ? m.from + 3 : m.from - 4, rt = kingSide ? m.from + 1 : m.from - 1;
      final (ru0, rv0) = st._cell(rf);
      final (rtu0, _) = st._cell(rt);
      final rp = ease(((p - 0.35) / 0.65).clamp(0.0, 1.0));
      out.add(_Sprite(a.before.board[rf], ru0 + 0.5 + (rtu0 - ru0) * rp, rv0 + 0.5, z: 0.9 * sin(pi * rp)));
      return out;
    }
    if (!m.isCapture) {
      final e = ease(p);
      final z = isKnight ? 1.1 * sin(pi * p) : 0.07 * (sin(pi * p * 4)).abs() * (1 - p);
      out.add(_Sprite(piece, fu + (tu - fu) * e, fv + (tv - fv) * e, z: z, scale: 1 + (isKnight ? 0.08 * sin(pi * p) : 0)));
      return out;
    }
    // A fight: advance, rear back, strike, then step into the square.
    final (cu0, cv0) = st._cell(m.captureSquare);
    final cu = cu0 + 0.5, cv = cv0 + 0.5;
    var du = cu - fu, dv = cv - fv;
    final len = sqrt(du * du + dv * dv);
    du /= len;
    dv /= len;
    final approachU = cu - du * 0.62, approachV = cv - dv * 0.62;
    double u, v, z = 0, scale = 1, lean = 0;
    if (p < 0.5) {
      final e = ease(p / 0.5);
      u = fu + (approachU - fu) * e;
      v = fv + (approachV - fv) * e;
      z = isKnight ? 1.0 * sin(pi * e) : 0.06 * (sin(pi * e * 4)).abs();
    } else if (p < 0.66) {
      final k = (p - 0.5) / 0.16;
      u = approachU - du * 0.16 * k;
      v = approachV - dv * 0.16 * k;
      z = 0.28 * k;
      lean = -0.22 * k * (du.sign == 0 ? 1 : du.sign);
      scale = 1 + 0.08 * k;
    } else if (p < 0.74) {
      final k = (p - 0.66) / 0.08;
      final sU = approachU - du * 0.16, sV = approachV - dv * 0.16;
      u = sU + (cu - du * 0.12 - sU) * k;
      v = sV + (cv - dv * 0.12 - sV) * k;
      z = 0.28 * (1 - k);
      lean = 0.3 * k * (du.sign == 0 ? 1 : du.sign);
      scale = 1.14;
    } else {
      final k = ease((p - 0.74) / 0.26);
      final sU = cu - du * 0.12, sV = cv - dv * 0.12;
      u = sU + (tu - sU) * k;
      v = sV + (tv - sV) * k;
      lean = 0.3 * (1 - k) * (du.sign == 0 ? 1 : du.sign);
      scale = 1.14 - 0.14 * k;
    }
    out.add(_Sprite(piece, u, v, z: z, scale: scale, lean: lean));
    return out;
  }

  void _shadow(Canvas canvas, _Sprite s) {
    final sc = proj.s(s.v);
    final c = proj.p(s.u, s.v);
    final shrink = 1 / (1 + s.z * 0.8);
    canvas.drawOval(
      Rect.fromCenter(center: c + Offset(proj.sq * sc * 0.05, proj.sq * sc * 0.04), width: proj.sq * sc * 0.72 * shrink, height: proj.sq * sc * 0.72 * proj.tilt * shrink * (proj.threeD ? 0.75 : 1)),
      Paint()
        ..color = Color.fromRGBO(0, 0, 0, 0.45 * shrink)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
  }

  void _piece(Canvas canvas, _Sprite s) {
    final sc = proj.s(s.v);
    final h = proj.sq * sc * (proj.threeD ? 1.08 : 0.72) * s.scale;
    var base = proj.p(s.u, s.v, s.z);
    if (!proj.threeD) base = base.translate(0, h * 0.5); // centre the piece on its square
    paintStonePiece(canvas, s.piece, base + Offset(0, proj.threeD ? proj.sq * sc * 0.12 : 0), h, lean: s.lean, glow: s.glow);
  }

  void _effects(Canvas canvas, double now) {
    // Impact flash
    final fa = now - st._flashAt;
    if (fa < 0.5 && st._flashCell != null) {
      final (u, v) = st._flashCell!;
      final c = proj.p(u, v, 0.3);
      final k = fa / 0.5;
      canvas.drawCircle(
          c,
          proj.sq * proj.s(v) * (0.3 + 1.4 * k),
          Paint()
            ..color = st._flashColor.withValues(alpha: (1 - k) * 0.75)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14));
    }
    for (final s in st._shards) {
      final age = now - s.born;
      if (s.kind == 1) {
        final k = age / 1.2;
        final c = proj.p(s.u + s.vu * age, s.v + s.vv * age, s.z + 0.3 * k);
        canvas.drawCircle(
            c,
            proj.sq * proj.s(s.v) * s.size * (1 + 2.2 * k),
            Paint()
              ..color = s.color.withValues(alpha: (1 - k) * 0.35)
              ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8));
        continue;
      }
      // Ballistic flight; once a shard lands it stays put and fades.
      final g = s.gravity;
      final tLand = g <= 0 ? 99.0 : (s.vz + sqrt(s.vz * s.vz + 2 * g * s.z)) / g;
      final t = min(age, tLand);
      final drag = 1 - 0.35 * t;
      final u = s.u + s.vu * t * drag, v = s.v + s.vv * t * drag;
      final z = max(0.0, s.z + s.vz * t - 0.5 * g * t * t);
      final fade = age < 1.4 ? 1.0 : max(0.0, 1 - (age - 1.4) / 1.0);
      if (fade <= 0) continue;
      final c = proj.p(u, v, z);
      final r = proj.sq * proj.s(v) * s.size;
      if (s.kind == 2) {
        canvas.drawCircle(c, r, Paint()..color = s.color.withValues(alpha: fade)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2));
        continue;
      }
      final rot = s.rot + s.vrot * t;
      final path = Path()
        ..moveTo(c.dx + cos(rot) * r, c.dy + sin(rot) * r)
        ..lineTo(c.dx + cos(rot + 2.3) * r * 0.8, c.dy + sin(rot + 2.3) * r * 0.8)
        ..lineTo(c.dx + cos(rot + 4.1) * r * 0.6, c.dy + sin(rot + 4.1) * r * 0.6)
        ..close();
      canvas.drawPath(path, Paint()..color = s.color.withValues(alpha: fade));
      canvas.drawPath(path, Paint()..color = Colors.black.withValues(alpha: 0.35 * fade)..style = PaintingStyle.stroke..strokeWidth = 0.6);
    }
  }

  @override
  bool shouldRepaint(_BattlePainter old) => true;
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
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: StonePiece(color | t, size: 56),
                ),
              ),
          ]),
        ],
      ),
    );

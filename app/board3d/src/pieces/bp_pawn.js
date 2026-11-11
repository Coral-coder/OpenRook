// The pawn's harness (third pass): plate with rolled, riveted and engraved edges (spaulders,
// couters, vambraces, poleyns), gauntlets whose plated fingers close round the grips, a
// visor with a vision slit and breaths under the kettle hat, and a tabard with corded edges
// and a device, split before so it rides on the thighs.
import * as THREE from 'three';
import { cord, faceOut, pearls, rope, setOn, slab } from './bp_fine.js';
export { arc };

const TAU = Math.PI * 2;

// interpolates a turned profile [[r, y]...] (y descending or ascending) at height y
export function radiusAt(prof, y) {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    if ((y - y0) * (y - y1) <= 0 && y0 !== y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  const a = prof[0], b = prof[prof.length - 1];
  return Math.abs(y - a[1]) < Math.abs(y - b[1]) ? a[0] : b[0];
}

/** A ring of points (an ellipse, radius r, z squashed by sz) at height y, from angle a0 to a1
 * (angle round y: 0 = +z, PI/2 = +x). */
function arc(r, y, a0, a1, n, sz = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * sz));
  }
  return out;
}

/** A spaulder of three lames over the shoulder (on the shoulder joint), each with a rolled
 * edge, an engraved line and rivets. */
export function spaulder(P, sh, H, s) {
  for (let k = 0; k < 3; k++) {
    const R = 0.056 * H - k * 0.003 * H, y = 0.006 * H - k * 0.02 * H, sy = 0.42, sz = 0.95;
    const th = Math.PI / 2.4;
    const g = new THREE.Group();
    g.position.set(0, y, 0);
    g.rotation.z = s * 0.1;
    sh.add(g);
    P.add(g, new THREE.SphereGeometry(R, 32, 8, 0, TAU, 0, th), 0, 0, 0, 0, 0, 0, [1, sy, sz]);
    const rimY = R * Math.cos(th) * sy, rimR = R * Math.sin(th);
    P.add(g, cord(arc(rimR, rimY, 0, TAU, 40, sz), 0.0042 * H, { closed: true, radial: 6, perPt: 1 }));
    // an engraved border just above the edge
    const th2 = th * 0.8;
    if (k === 0) P.add(g, cord(arc(R * Math.sin(th2) + 0.0008 * H, R * Math.cos(th2) * sy, 0, TAU, 36, sz), 0.0013 * H, { closed: true, radial: 4, perPt: 1 }));
    if (k === 0) {
      // a raised ridge over the top of the shoulder, front to back
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = -th * 0.9 + (i / 16) * th * 1.8;
        pts.push(new THREE.Vector3(0, Math.cos(t) * R * sy + 0.0008 * H, Math.sin(t) * R * sz));
      }
      P.add(g, cord(pts, 0.0028 * H, { radial: 6, perPt: 2 }));
    }
    const rv = [];
    if (k === 1) continue; // (the middle lame is plain)
    for (let i = 0; i < 9; i++) {
      const a = ((i + 0.5) / 9) * TAU;
      const r = R * Math.sin(th2 * 1.1) + 0.0012 * H;
      rv.push(new THREE.Vector3(Math.sin(a) * r, R * Math.cos(th2 * 1.1) * sy, Math.cos(a) * r * sz));
    }
    P.add(g, pearls(rv, 0.0028 * H, { w: 7, h: 4 }));
  }
}

/** A plate cop (couter or poleyn): a domed cup facing dir (+z or -z), with a rolled edge, a
 * rivet and a fan-shaped wing on the outer side. Placed on a joint at its pivot. */
export function cop(P, j, H, r, s, front, { y = 0, z = 0, wing = 1.45 } = {}) {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  if (!front) g.rotation.y = Math.PI;
  j.add(g);
  const cap = new THREE.SphereGeometry(r, 28, 12, 0, TAU, 0, Math.PI / 2);
  P.add(g, cap, 0, 0, 0, Math.PI / 2, 0, 0, [1, 0.85, 1]);
  // a medial ridge and an engraved ring
  const ridge = [];
  for (let i = 0; i <= 12; i++) {
    const t = -Math.PI / 2 + (i / 12) * Math.PI;
    ridge.push(new THREE.Vector3(0, Math.sin(t) * r * 1.0, Math.cos(t) * r * 0.85 + 0.0006 * H));
  }
  P.add(g, cord(ridge, 0.0022 * H, { radial: 6, perPt: 2 }));
  P.add(g, cord(arc(r * 0.62, 0, 0, TAU, 24).map((q) => new THREE.Vector3(q.x, q.z, Math.sqrt(Math.max(0, 1 - 0.62 * 0.62)) * r * 0.85 + 0.0004 * H)), 0.0011 * H, { closed: true, radial: 4, perPt: 1 }));
  P.add(g, new THREE.SphereGeometry(0.0048 * H, 10, 6), 0, 0, r * 0.85 + 0.001 * H, 0, 0, 0, [1, 1, 0.6]);
  // the wing: a fluted half-disc on the outer side, reaching back round the joint
  const wr = r * wing;
  const fan = new THREE.CylinderGeometry(wr, wr, 0.003 * H, 28, 1, false, Math.PI / 2, Math.PI);
  const fp = fan.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const a = Math.atan2(fp.getX(i), fp.getZ(i));
    const rr = Math.hypot(fp.getX(i), fp.getZ(i));
    fp.setY(i, fp.getY(i) + Math.cos(a * 7) * 0.0025 * H * (rr / wr));
  }
  fan.rotateZ(Math.PI / 2);
  fan.computeVertexNormals();
  const wx = (front ? s : -s) * r * 0.8;
  P.add(g, fan, wx, 0, 0);
  const rim = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI / 2 + (i / 20) * Math.PI;
    rim.push(new THREE.Vector3(wx, Math.sin(a) * wr, Math.cos(a) * wr));
  }
  P.add(g, cord(rim, 0.0022 * H, { radial: 5, perPt: 1.5 }));
  return g;
}

/** A plate vambrace round the forearm (el joint), y0..y1 (negative, down the arm). */
export function vambrace(P, el, H, y0, y1, r0, r1) {
  const prof = [[r0 * 0.94, y0 + 0.004 * H], [r0, y0], [r0 * 1.02, y0 - 0.006 * H], [r1 * 1.02, y1 + 0.006 * H], [r1, y1], [r1 * 0.94, y1 - 0.004 * H]];
  const g = faceOut(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40));
  P.add(el, g);
  for (const [r, y] of [[r0 * 1.0, y0 - 0.002 * H], [r1 * 1.0, y1 + 0.002 * H]]) P.add(el, cord(arc(r + 0.0012 * H, y, 0, TAU, 32), 0.0032 * H, { closed: true, radial: 5, perPt: 1.2 }));
  // engraved bands, and a row of rivets down the hinge
  for (const t of [0.22, 0.78]) {
    const r = r0 + (r1 - r0) * t, y = y0 + (y1 - y0) * t;
    P.add(el, cord(arc(r * 1.02 + 0.0006 * H, y, 0, TAU, 28), 0.0012 * H, { closed: true, radial: 5, perPt: 1.2 }));
  }
  const rv = [];
  for (let i = 0; i < 5; i++) {
    const t = 0.1 + i * 0.2, r = r0 + (r1 - r0) * t;
    rv.push(new THREE.Vector3(r * 1.03, y0 + (y1 - y0) * t, 0), new THREE.Vector3(-r * 1.03, y0 + (y1 - y0) * t, 0));
  }
  P.add(el, pearls(rv, 0.0028 * H, { w: 7, h: 4 }));
}

/**
 * A gauntlet closed round a grip (the hand hanging -y from the wrist, the grip on the hand's
 * axis as fineHand's 'grip' pose): an hourglass cuff with a rolled, riveted edge, the back of
 * the hand in two lames, a knuckle plate with gadlings, and each finger in jointed plates.
 */
export function gauntlet(P, wr, H, s, side) {
  const g = new THREE.Group();
  wr.add(g);
  const palm = new THREE.CapsuleGeometry(s * 0.25, s * 0.3, 4, 12);
  palm.scale(1, 1, 0.55);
  P.add(g, palm, 0, -s * 0.38, 0);
  P.sphere(g, s * 0.14, -side * s * 0.13, -s * 0.36, s * 0.05, [0.8, 1.2, 0.7], 10);
  // the cuff, flaring up the forearm: a solid turned shell
  const cuff = [[s * 0.27, -s * 0.14], [s * 0.31, 0.0], [s * 0.37, s * 0.2], [s * 0.44, s * 0.36], [s * 0.465, s * 0.4], [s * 0.44, s * 0.42], [s * 0.4, s * 0.38], [s * 0.33, s * 0.2], [s * 0.25, s * 0.0]];
  const cg = faceOut(new THREE.LatheGeometry(cuff.map(([r, y]) => new THREE.Vector2(r, y)), 36));
  P.add(g, cg, 0, 0, 0, 0, 0, 0, [1, 1, 0.82]);
  P.add(g, cord(arc(s * 0.465, s * 0.4, 0, TAU, 32, 0.82), s * 0.032, { closed: true, radial: 5, perPt: 1.2 }));
  P.add(g, cord(arc(s * 0.38, s * 0.2, 0, TAU, 28, 0.82), s * 0.014, { closed: true, radial: 5, perPt: 1.2 }));
  const rv = arc(s * 0.43, s * 0.33, 0, TAU, 8, 0.82).slice(0, 8);
  P.add(g, pearls(rv, s * 0.03, { w: 7, h: 4 }));
  // the back of the hand: two overlapping lames (on the -z side)
  for (const [y, h, rr] of [[-s * 0.2, s * 0.22, s * 0.3], [-s * 0.42, s * 0.24, s * 0.29]]) {
    const lame = new THREE.CylinderGeometry(rr, rr * 0.96, h, 18, 1, true, Math.PI / 2 - 0.2, Math.PI + 0.4);
    P.add(g, lame, 0, y, 0, 0, 0, 0, [1, 1, 0.62]);
    const rim = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI / 2 - 0.2 + (i / 14) * (Math.PI + 0.4);
      rim.push(new THREE.Vector3(Math.sin(a) * rr * 0.97, y - h / 2, Math.cos(a) * rr * 0.97 * 0.62));
    }
    P.add(g, cord(rim, s * 0.022, { radial: 5, perPt: 1.5 }));
  }
  // knuckle plate and gadlings
  P.add(g, new THREE.CapsuleGeometry(s * 0.07, s * 0.44, 3, 10), 0, -s * 0.64, -s * 0.06, 0, 0, Math.PI / 2, [1, 1, 0.9]);
  for (let i = 0; i < 4; i++) P.add(g, new THREE.ConeGeometry(s * 0.05, s * 0.09, 7), (i - 1.5) * s * 0.15, -s * 0.64, -s * 0.13, -Math.PI / 2, 0, 0);
  // the fingers, plated, curled round the grip
  const curl = [1.35, 1.5, 1.0];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set((i - 1.5) * s * 0.15, -s * 0.7, s * 0.03);
    g.add(f);
    const lens = [0.2, 0.14, 0.11].map((v) => s * v * (1 - Math.abs(i - 1.3) * 0.12));
    let pj = f;
    lens.forEach((l, k) => {
      const seg = new THREE.Group();
      if (k > 0) seg.position.y = -lens[k - 1];
      seg.rotation.x = -curl[k];
      pj.add(seg);
      const rr = s * (0.072 - k * 0.006);
      P.add(seg, new THREE.CapsuleGeometry(rr, l, 2, 7), 0, -l / 2, 0);
      // the plate over the back of the finger, flared at its upper edge
      const pl = new THREE.CylinderGeometry(rr * 1.3, rr * 1.18, l * 0.95, 6, 1, true, Math.PI / 2 + 0.1, Math.PI - 0.2);
      P.add(seg, pl, 0, -l * 0.48, 0);
      P.add(seg, new THREE.TorusGeometry(rr * 1.28, rr * 0.18, 3, 6, Math.PI - 0.2), 0, 0, 0, Math.PI / 2, 0, Math.PI + 0.1);
      pj = seg;
    });
  }
  // the thumb
  const t = new THREE.Group();
  t.position.set(-side * s * 0.2, -s * 0.32, s * 0.1);
  t.rotation.set(-1.0, 0, -side * 0.55);
  g.add(t);
  P.add(t, new THREE.CapsuleGeometry(s * 0.08, s * 0.15, 3, 10), 0, -s * 0.08, 0);
  P.add(t, new THREE.CylinderGeometry(s * 0.105, s * 0.1, s * 0.15, 9, 1, true, Math.PI / 2, Math.PI), 0, -s * 0.08, 0, 0, side > 0 ? 0 : 0, 0);
  const t2 = new THREE.Group();
  t2.position.y = -s * 0.17;
  t2.rotation.x = -0.6;
  t.add(t2);
  P.add(t2, new THREE.CapsuleGeometry(s * 0.072, s * 0.12, 3, 10), 0, -s * 0.07, 0);
  P.add(t2, new THREE.CylinderGeometry(s * 0.095, s * 0.09, s * 0.12, 9, 1, true, Math.PI / 2, Math.PI), 0, -s * 0.07, 0);
  return g;
}

/**
 * A visor under the kettle hat (on the head joint; the head's centre at y = cy): a brow plate
 * and a bevor with a vision slit between them, a medial ridge, breaths, a rolled lower edge,
 * and riveted pivots at the temples.
 */
export function visor(P, head, H, cy) {
  const g = new THREE.Group();
  g.position.y = cy;
  head.add(g);
  const A = 1.2; // half the angle it wraps round the face
  // the plate's surface: an egg round the face, coming to a ridge down the middle
  const surf = (th, y) => {
    const t = (y + 0.045 * H) / 0.1 / H; // 0 at the chin .. 1 at the brow
    const rz = 0.073 * H + 0.016 * H * Math.sin(Math.PI * Math.max(0, Math.min(1, t * 1.05))) - 0.008 * H * (1 - t) * (1 - t);
    const rx = 0.07 * H - 0.008 * H * (1 - t) * (1 - t);
    const ridge = 0.005 * H * Math.max(0, 1 - Math.abs(th) / 0.45);
    return new THREE.Vector3(Math.sin(th) * rx, y, Math.cos(th) * (rz + ridge) - 0.004 * H);
  };
  const yTop = 0.052 * H, ySlitT = 0.014 * H, ySlitB = 0.003 * H, yBot = -0.06 * H;
  const plate = (y0, y1, rows, a) => slab((u, v) => surf((u - 0.5) * 2 * a, y0 + (y1 - y0) * v), 24, rows, 0.0035 * H);
  P.add(g, plate(yTop, ySlitT, 6, A * 0.95));
  P.add(g, plate(ySlitB, yBot, 14, A));
  const line = (y, a, lift, n = 30) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const th = (i / n - 0.5) * 2 * a;
      const q = surf(th, y), nz = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
      out.push(q.addScaledVector(nz, lift));
    }
    return out;
  };
  // flanged edges at the slit, a rolled lower edge, and a band of rivets under the brim
  P.add(g, cord(line(ySlitT + 0.0012 * H, A * 0.95, 0.0022 * H), 0.0024 * H, { radial: 6, perPt: 1.5 }));
  P.add(g, cord(line(ySlitB - 0.0012 * H, A, 0.0022 * H), 0.0024 * H, { radial: 6, perPt: 1.5 }));
  P.add(g, cord(line(yBot + 0.002 * H, A, 0.0022 * H), 0.0034 * H, { radial: 7, perPt: 1.5 }));
  P.add(g, cord(line(-0.034 * H, A * 0.98, 0.002 * H), 0.0011 * H, { radial: 5, perPt: 1.2 })); // engraved
  P.add(g, pearls(line(yTop - 0.007 * H, A * 0.85, 0.0024 * H, 12), 0.0024 * H, { w: 7, h: 4 }));
  // the ridge down the bevor
  const ridge = [];
  for (let i = 0; i <= 12; i++) {
    const y = ySlitB - (i / 12) * (ySlitB - yBot - 0.004 * H);
    ridge.push(surf(0, y).add(new THREE.Vector3(0, 0, 0.0025 * H)));
  }
  P.add(g, cord(ridge, 0.0022 * H, { radial: 6, perPt: 2 }));
  // breaths: rows of pierced holes either side of the ridge, each with a raised rim
  for (const sx of [-1, 1]) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const th = sx * (0.28 + c * 0.17), y = -0.008 * H - r * 0.0085 * H;
      const q = surf(th, y);
      const n = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
      const hg = new THREE.Group();
      setOn(hg, q.addScaledVector(n, 0.0018 * H), n);
      g.add(hg);
      P.add(hg, new THREE.TorusGeometry(0.0022 * H, 0.0009 * H, 4, 8));
    }
  }
  // the pivots at the temples: a domed boss with a ring
  for (const sx of [-1, 1]) {
    const th = sx * (A + 0.08), q = surf(th, 0.008 * H);
    const n = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
    const pg = new THREE.Group();
    setOn(pg, q.addScaledVector(n, 0.002 * H), n);
    g.add(pg);
    P.add(pg, new THREE.SphereGeometry(0.0065 * H, 14, 8, 0, TAU, 0, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0, [1, 0.6, 1]);
    P.add(pg, new THREE.TorusGeometry(0.0075 * H, 0.0012 * H, 5, 16));
  }
  // a lifting peg on the right of the bevor
  const q = surf(-0.62, -0.03 * H), n = new THREE.Vector3(Math.sin(-0.62), 0, Math.cos(-0.62));
  const pg = new THREE.Group();
  setOn(pg, q, n);
  g.add(pg);
  P.add(pg, new THREE.CylinderGeometry(0.002 * H, 0.0025 * H, 0.008 * H, 8), 0, 0, 0.004 * H, Math.PI / 2, 0, 0);
  P.add(pg, new THREE.SphereGeometry(0.0032 * H, 8, 6), 0, 0, 0.0085 * H);
  return g;
}

/**
 * A tabard panel following a turned surface: prof is the surface's profile [[r, y]...] (in the
 * frame the panel is built in), sz its z squash; x0..x1 across, y0..y1 down; side +1 front, -1
 * back. off lifts it off the surface; folds ripple it more toward the hem. Returns the
 * geometry and a function giving points on it (u, v in 0..1, lifted by d).
 */
export function tabardPanel(prof, sz, x0, x1, y0, y1, side, off, { folds = 0, seed = 0, nu = 14, nv = 26, thick = 0.004 } = {}) {
  const at = (u, v, d = 0) => {
    const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * v;
    const R = radiusAt(prof, y);
    const zz = Math.sqrt(Math.max(0, R * R - x * x)) * sz;
    const f = folds * v * v * Math.sin(u * Math.PI * 3 + seed + v * 2) + folds * 0.4 * v * Math.sin(u * Math.PI * 7 + seed * 2);
    return new THREE.Vector3(x, y, side * (zz + off + f + d));
  };
  const g = slab((u, v) => at(u, v), nu, nv, thick);
  return { g, at };
}

/** Corded edges round a tabard panel (at, from tabardPanel) on the listed sides. */
export function tabardEdges(P, parent, at, H, sides, r = 0.0022) {
  const L = (fn, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(fn(i / n));
    return out;
  };
  const d = 0.0035 * H;
  if (sides.includes('l')) P.add(parent, rope(L((t) => at(0.03, t, d), 16), r * H, { twist: 60, radial: 6, perPt: 2 }));
  if (sides.includes('r')) P.add(parent, rope(L((t) => at(0.97, t, d), 16), r * H, { twist: 60, radial: 6, perPt: 2 }));
  if (sides.includes('b')) P.add(parent, rope(L((t) => at(t, 0.97, d), 14), r * H, { twist: 60, radial: 6, perPt: 2 }));
  if (sides.includes('t')) P.add(parent, rope(L((t) => at(t, 0.03, d), 14), r * H, { twist: 60, radial: 6, perPt: 2 }));
}

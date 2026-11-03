// Sculpting tools for the bishop and the pawn: a carved head with a real face, a flowing
// beard, hands with jointed fingers (gripping, blessing), robes whose folds fall in sharp
// creases and meander down to an uneven hem, quilted cloth, anatomical limbs, boots, and a
// lenticular arming sword with a fuller.
import * as THREE from 'three';
import { carve } from '../carving.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Turns a shape made round the y axis so its faces point outward (a profile drawn top to
 * bottom comes out inside-out). */
export function outward(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let dot = 0;
  for (let i = 0; i < p.count; i++) dot += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i);
  if (dot < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/** A turned shape on a joint, facing outward. */
export function lathe(P, parent, pts, y = 0, seg = 28, s = null) {
  const g = outward(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg));
  return P.add(parent, g, 0, y, 0, 0, 0, 0, s);
}


// a soft anisotropic bump on the unit sphere: c = centre, s = spread per axis
function bump(p, c, s) {
  const dx = (p.x - c[0]) / s[0], dy = (p.y - c[1]) / s[1], dz = (p.z - c[2]) / (s[2] || 0.35);
  return Math.exp(-(dx * dx + dy * dy + dz * dz));
}

/**
 * A carved head (radius r) facing +z: skull, brow ridge, eye sockets with lids, a nose
 * with nostrils, cheekbones and hollows, lips, chin and ears; the jaw narrows.
 */
export function sculptHead(r, { old = false, ears = true, seg = 48 } = {}) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const F = [
    // [centre, spread, amount]
    [[-0.33, 0.3, 0.93], [0.28, 0.08], 0.06], [[0.33, 0.3, 0.93], [0.28, 0.08], 0.06], // brow ridges
    [[0, 0.27, 0.98], [0.12, 0.08], 0.03], // glabella
    [[-0.32, 0.12, 0.93], [0.16, 0.1], -0.085], [[0.32, 0.12, 0.93], [0.16, 0.1], -0.085], // eye sockets
    [[-0.31, 0.11, 0.94], [0.09, 0.055], 0.045], [[0.31, 0.11, 0.94], [0.09, 0.055], 0.045], // eyelids
    [[0, 0.02, 1], [0.065, 0.28], 0.1], // nose bridge
    [[0, -0.2, 1], [0.1, 0.09], 0.17], // nose tip
    [[-0.09, -0.25, 0.97], [0.06, 0.05], 0.06], [[0.09, -0.25, 0.97], [0.06, 0.05], 0.06], // nostril wings
    [[-0.5, -0.04, 0.8], [0.2, 0.11], 0.055], [[0.5, -0.04, 0.8], [0.2, 0.11], 0.055], // cheekbones
    [[-0.44, -0.33, 0.8], [0.14, 0.14], old ? -0.06 : -0.03], [[0.44, -0.33, 0.8], [0.14, 0.14], old ? -0.06 : -0.03], // hollows
    [[0, -0.43, 0.96], [0.17, 0.045], 0.04], // upper lip
    [[0, -0.49, 0.96], [0.19, 0.022], -0.045], // the line of the mouth
    [[0, -0.55, 0.94], [0.14, 0.045], 0.035], // lower lip
    [[0, -0.77, 0.75], [0.2, 0.12], 0.08], // chin
  ];
  if (ears) {
    for (const s of [-1, 1]) {
      F.push([[s * 0.97, 0.02, 0.05], [0.06, 0.2, 0.14], 0.14]); // the ear
      F.push([[s * 0.99, 0.03, 0.08], [0.03, 0.12, 0.05], -0.05]); // its bowl
      F.push([[s * 0.98, -0.16, 0.06], [0.05, 0.06, 0.08], 0.05]); // the lobe
    }
  }
  for (const s of [-1, 1]) {
    F.push([[s * 0.2, -0.3, 0.94], [0.035, 0.15], -0.028]); // the folds from nose to mouth
    F.push([[s * 0.62, 0.2, 0.75], [0.12, 0.14], -0.025]); // temples
    F.push([[s * 0.22, -0.62, 0.9], [0.06, 0.07], -0.02]); // the corners of the mouth
  }
  F.push([[0, -0.34, 0.99], [0.03, 0.05], -0.025]); // the philtrum
  F.push([[0, -0.66, 0.92], [0.1, 0.03], -0.02]); // the groove above the chin
  if (old) {
    F.push([[-0.25, 0.42, 0.9], [0.4, 0.03], -0.016], [[0.25, 0.5, 0.86], [0.4, 0.03], -0.016], [[0, 0.58, 0.8], [0.35, 0.025], -0.012]); // furrows
    F.push([[0, 0.3, 0.99], [0.025, 0.08], -0.02], [[0.06, 0.3, 0.99], [0.02, 0.07], -0.012]); // frown lines
    for (const s of [-1, 1]) {
      F.push([[s * 0.3, -0.02, 0.92], [0.12, 0.035], 0.025]); // bags under the eyes
      for (let k = 0; k < 3; k++) F.push([[s * (0.58 + 0.02 * k), 0.16 - k * 0.07, 0.78], [0.08, 0.012], -0.012]); // crow's feet
      F.push([[s * 0.38, -0.52, 0.85], [0.08, 0.1], -0.02]); // jowls
    }
  }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 1;
    for (const [c, s, a] of F) d += a * 1.7 * bump(v, c, s);
    let x = v.x * d * 0.86, y = v.y * d * 1.12, z = v.z * d * 0.98;
    if (y < 0) x *= 1 - 0.22 * Math.pow(-v.y, 1.5); // the jaw narrows
    if (v.z < 0 && v.y > -0.2) z *= 1.06; // the back of the skull
    p.setXYZ(i, x * r, y * r, z * r);
  }
  g.computeVertexNormals();
  carve(g, r * 0.006, 9 / r);
  return g;
}

/** A long carved beard hanging from the jaw, combed into wavy strands, with a moustache. */
export function sculptBeard(r, len, ws = 30, hs = 22) {
  const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = clamp01((0.25 - y) / 1.25); // 0 at the jaw .. 1 at the point
    const a = Math.atan2(x, z);
    const strands = 1 - 0.08 * Math.abs(Math.sin(a * 9 + t * 3)) - 0.04 * Math.abs(Math.sin(a * 23 - t * 5));
    const w = (1 - Math.pow(t, 1.4) * 0.8) * strands;
    const front = z > 0 ? 1 : 0.35; // it hangs in front of the throat
    p.setXYZ(i, x * r * 0.95 * w, -0.1 * r - t * len, z * r * front * w * 0.9 + t * t * len * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

export function moustache(r) {
  const out = [];
  for (const s of [-1, 1]) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * r * 0.45, -r * 0.05, -r * 0.05), new THREE.Vector3(s * r * 0.55, -r * 0.45, -r * 0.18));
    const g = new THREE.TubeGeometry(c, 18, r * 0.085, 10);
    const p = g.attributes.position;
    // taper toward the ends
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 11) / 18;
      const k = 1 - 0.7 * t;
      const q = c.getPoint(t);
      p.setXYZ(i, q.x + (p.getX(i) - q.x) * k, q.y + (p.getY(i) - q.y) * k, q.z + (p.getZ(i) - q.z) * k);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

/**
 * A hand of size s (palm length) hanging from the wrist (-y), palm facing inward (toward the
 * body's centre line), fingers forward. pose: 'grip' (closed round a hilt on the hand's axis),
 * 'bless' (two fingers raised), 'open'.
 */
export function hand(P, parent, s, side, pose = 'grip') {
  const g = new THREE.Group();
  parent.add(g);
  const palm = new THREE.CapsuleGeometry(s * 0.24, s * 0.32, 3, 8);
  palm.scale(1, 1, 0.55);
  P.add(g, palm, 0, -s * 0.38, 0);
  P.sphere(g, s * 0.2, 0, -s * 0.06, 0, [1.1, 0.8, 0.7], 10); // wrist
  const curl = pose === 'grip' ? [1.5, 1.6] : pose === 'open' ? [0.25, 0.2] : [1.55, 1.7];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set((i - 1.5) * s * 0.15, -s * 0.72, s * 0.04);
    g.add(f);
    let c0 = curl[0], c1 = curl[1];
    if (pose === 'bless' && i < 2) (c0 = 0.05), (c1 = 0.05); // index and middle raised
    const l0 = s * (0.26 - Math.abs(i - 1.2) * 0.03), l1 = s * (0.2 - Math.abs(i - 1.2) * 0.02);
    f.rotation.x = pose === 'bless' && i < 2 ? 0 : -c0; // blessing: two fingers straight, two curled
    P.add(f, new THREE.CapsuleGeometry(s * 0.065, l0, 2, 6), 0, -l0 / 2, 0);
    const k = new THREE.Group();
    k.position.y = -l0;
    k.rotation.x = -c1;
    f.add(k);
    P.add(k, new THREE.CapsuleGeometry(s * 0.058, l1, 2, 6), 0, -l1 / 2, 0);
  }
  // the thumb
  const t = new THREE.Group();
  t.position.set(-side * s * 0.2, -s * 0.3, s * 0.1);
  t.rotation.set(pose === 'grip' ? -1.1 : -0.5, 0, -side * (pose === 'bless' ? 0.9 : 0.6));
  g.add(t);
  P.add(t, new THREE.CapsuleGeometry(s * 0.07, s * 0.24, 2, 6), 0, -s * 0.14, 0);
  // blessing: the hand turned up at the wrist, palm out, two fingers to the sky
  if (pose === 'bless') g.rotation.set(-Math.PI / 2 - 0.15, side * 0.3, 0);
  return g;
}

/**
 * A turned garment that hangs in folds: deep creases between rounded ridges that meander as
 * they fall, deeper toward the hem, and a hem that ripples. pts: [radius, y] down the profile.
 */
export function robe(pts, { folds = 12, depth = 0.08, seg = 96, rows = 36, seed = 1, hemWave = 0.01, flat = 0.8, soft = false } = {}) {
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    const n = Math.max(1, Math.round((rows * Math.abs(y1 - y0)) / Math.abs(pts[pts.length - 1][1] - pts[0][1])));
    for (let j = 0; j < n; j++) dense.push(new THREE.Vector2(r0 + ((r1 - r0) * j) / n, y0 + ((y1 - y0) * j) / n));
  }
  dense.push(new THREE.Vector2(...pts[pts.length - 1]));
  const g = new THREE.LatheGeometry(dense, seg);
  const p = g.attributes.position;
  const yTop = pts[0][1], yHem = pts[pts.length - 1][1];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const t = clamp01((yTop - y) / (yTop - yHem));
    const a = Math.atan2(z, x);
    const wander = 0.5 * Math.sin(y * 9 + a * 2 + seed) + 0.25 * Math.sin(y * 23 + seed * 3);
    let k;
    if (soft) {
      // heavy cloth: broad rounded folds with smaller ones riding on them
      const f = 0.65 * Math.sin(folds * a + wander) + 0.35 * Math.sin(folds * 2.2 * a + wander * 1.7 + seed);
      k = 1 + depth * (0.1 + 0.9 * t) * f;
    } else {
      const v = Math.abs(Math.sin((folds * a) / 2 + wander)); // 0 in the creases, 1 on the ridges
      k = 1 + depth * (0.15 + 0.85 * t) * (Math.pow(v, 0.55) - 0.55);
    }
    let yy = y;
    if (t > 0.97) yy += hemWave * Math.sin(folds * a + seed) * (yTop - yHem);
    p.setXYZ(i, x * k, yy, z * k * flat);
  }
  g.userData.grid = [dense.length, seg];
  return outward(g);
}

/** Quilted padding over a turned shape: vertical channels (n) and horizontal rows (every dy). */
export function quilt(geo, n, dy, depth) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const a = Math.atan2(z, x);
    const q = Math.min(n ? Math.abs(Math.sin((n * a) / 2)) : 1, dy ? Math.abs(Math.sin((y / dy) * Math.PI)) : 1);
    if (!depth) continue;
    const k = 1 + depth * (Math.pow(q, 0.4) - 0.6);
    p.setXYZ(i, x * k, y, z * k);
  }
  return geo.index ? outward(geo) : (geo.computeVertexNormals(), geo);
}

/** A limb (hanging -y from its joint) with a muscle swelling; back > 0 pushes it behind (calf). */
export function muscleLimb(len, r0, r1, { bulge = 0.15, at = 0.3, back = 0, seg = 16, rows = 10 } = {}) {
  const pts = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const r = r0 + (r1 - r0) * t + r0 * bulge * Math.exp(-(((t - at) / 0.22) ** 2));
    pts.push(new THREE.Vector2(r, -len * t));
  }
  // rounded ends, so a limb turns at its joint without a seam or a bead
  for (let k = 1; k <= 5; k++) {
    const a = (k / 5) * (Math.PI / 2);
    pts.unshift(new THREE.Vector2(Math.max(0.0001, r0 * Math.cos(a)), r0 * Math.sin(a) * 0.9));
  }
  for (let k = 1; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0001, r1 * Math.cos(a)), -len - r1 * Math.sin(a) * 0.6));
  }
  const g = outward(new THREE.LatheGeometry(pts, seg));
  if (back) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = -p.getY(i) / len;
      if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) * (1 + back * Math.exp(-(((t - at) / 0.2) ** 2))));
    }
  }
  outward(g);
  return g;
}

/** A boot from mid-shin down, with a turned-down cuff, and its foot (in the ankle's frame). */
export function boot(P, shinJoint, ankleJoint, H, shin) {
  lathe(P, shinJoint, [[0.05 * H, -shin * 0.42], [0.06 * H, -shin * 0.45], [0.061 * H, -shin * 0.52], [0.05 * H, -shin * 0.54], [0.047 * H, -shin * 0.62], [0.044 * H, -shin], [0, -shin]], 0, 24);
  const foot = new THREE.CapsuleGeometry(0.036 * H, 0.08 * H, 6, 14);
  foot.rotateX(Math.PI / 2);
  foot.scale(1.05, 0.75, 1);
  P.add(ankleJoint, foot, 0, -0.022 * H, 0.032 * H);
  P.box(ankleJoint, 0.07 * H, 0.012 * H, 0.15 * H, 0, -0.044 * H, 0.03 * H); // sole
  P.box(ankleJoint, 0.062 * H, 0.02 * H, 0.03 * H, 0, -0.03 * H, -0.03 * H); // heel
}

/**
 * An arming sword hanging from the hand (-y): a blade with bevelled edges and a deep fuller
 * running two thirds of its length, an inlaid inscription in the fuller, a straight guard with
 * a langet and quillons ending in turned knops, a grip bound with twisted wire between
 * ferrules, and a wheel pommel with a cross on each face and a peened button.
 */
export function sword(P, parent, H, len, name) {
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  const L = len * H, w = 0.03 * H, th = 0.008 * H;
  // blade: cross-sections along its length: a flattened diamond with a groove down the middle
  const N = 40, M = 16;
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const half = (t < 0.8 ? 1 - t * 0.25 : 0.8 * Math.sqrt(Math.max(0, 1 - (t - 0.8) / 0.2))) * w * 0.5 + 0.0003 * H;
    const thick = th * (1 - t * 0.55);
    const fuller = 0.62 * clamp01((0.68 - t) / 0.05) * clamp01((t - 0.01) / 0.03);
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      const groove = fuller * Math.exp(-((cx / 0.3) ** 4));
      // the body of the blade, then an edge bevel that takes it to a keen line
      const body = Math.min(1, (1 - Math.abs(cx)) * 3.2);
      pos.push(cx * half, -0.06 * H - t * L, sz * thick * Math.max(0.04, Math.sqrt(Math.max(0, 1 - cx * cx * 0.6)) * body) * (1 - groove));
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = a + M, d = b + M;
    idx.push(a, c, b, b, c, d);
  }
  pos.push(0, -0.06 * H - L - 0.0001, 0);
  const tip = pos.length / 3 - 1;
  for (let j = 0; j < M; j++) idx.push(N * M + j, tip, N * M + ((j + 1) % M));
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setIndex(idx);
  bg.computeVertexNormals();
  P.add(g, bg);
  // the inscription inlaid in the fuller: a run of little raised letters, both faces
  for (const zs of [1, -1]) {
    for (let i = 0; i < 9; i++) {
      const y = -0.09 * H - i * 0.016 * H;
      const k = i % 3;
      const geo = k === 0 ? new THREE.BoxGeometry(0.0022 * H, 0.008 * H, 0.0012 * H) : k === 1 ? new THREE.TorusGeometry(0.0028 * H, 0.0008 * H, 4, 10) : new THREE.BoxGeometry(0.006 * H, 0.0016 * H, 0.0012 * H);
      P.add(g, geo, 0, y, zs * th * 0.42);
    }
  }
  // the cross-guard: a chamfered block with a rivet, arms tapering to drooping turned knops
  const blk = new THREE.CylinderGeometry(0.016 * H, 0.016 * H, 0.016 * H, 8);
  blk.scale(0.85, 1, 0.62);
  P.add(g, blk, 0, -0.055 * H, 0, 0, Math.PI / 8, 0);
  for (const zs of [1, -1]) P.add(g, new THREE.SphereGeometry(0.0035 * H, 10, 6), 0, -0.055 * H, zs * 0.0095 * H, 0, 0, 0, [1, 1, 0.6]);
  for (const s of [-1, 1]) {
    const q = new THREE.CylinderGeometry(0.0052 * H, 0.0085 * H, 0.062 * H, 14, 8);
    const qp = q.attributes.position;
    for (let i = 0; i < qp.count; i++) {
      const t = (qp.getY(i) / (0.031 * H) + 1) / 2;
      qp.setX(i, qp.getX(i) - t * t * 0.006 * H);
      qp.setZ(i, qp.getZ(i) * (1 - 0.25 * t)); // flattening toward the ends
    }
    q.computeVertexNormals();
    P.add(g, q, s * 0.044 * H, -0.055 * H, 0, 0, 0, s * (Math.PI / 2 + 0.12));
    const kn = new THREE.LatheGeometry([[0.0001, -0.009], [0.006, -0.0085], [0.0095, -0.004], [0.0098, 0.0], [0.0075, 0.004], [0.004, 0.0065], [0.0055, 0.0085], [0.0001, 0.011]].map(([r, y]) => new THREE.Vector2(r * H, y * H)), 16);
    P.add(g, kn, s * 0.078 * H, -0.0595 * H, 0, 0, 0, -s * (Math.PI / 2 - 0.12));
  }
  // the langet down over the blade, and a ricasso shoulder
  const lg = new THREE.Shape();
  lg.moveTo(-0.011 * H, 0);
  lg.lineTo(0.011 * H, 0);
  lg.lineTo(0.004 * H, -0.022 * H);
  lg.quadraticCurveTo(0, -0.026 * H, -0.004 * H, -0.022 * H);
  lg.lineTo(-0.011 * H, 0);
  const lgg = new THREE.ExtrudeGeometry(lg, { depth: 0.011 * H, bevelEnabled: true, bevelThickness: 0.0012 * H, bevelSize: 0.001 * H, bevelSegments: 2, curveSegments: 6 });
  lgg.translate(0, -0.062 * H, -0.0055 * H);
  P.add(g, lgg);
  // a grip bound in twisted wire between two ferrules
  P.cyl(g, 0.0105 * H, 0.0122 * H, 0.085 * H, 0, -0.008 * H, 0, 0, 0, 0, 18);
  for (let i = 0; i < 11; i++) P.add(g, new THREE.TorusGeometry(0.0122 * H - Math.abs(i - 5) * 0.0002 * H, 0.0019 * H, 3, 10), 0, -0.042 * H + i * 0.0069 * H, 0, Math.PI / 2 + 0.2);
  for (const y of [-0.047, 0.031]) {
    P.add(g, new THREE.CylinderGeometry(0.0135 * H, 0.0135 * H, 0.006 * H, 20), 0, y * H, 0);
    for (const dy of [-0.003, 0.003]) P.add(g, new THREE.TorusGeometry(0.0135 * H, 0.0011 * H, 3, 16), 0, (y + dy) * H, 0, Math.PI / 2);
  }
  // a wheel pommel, its faces dished round a raised cross, and a peened button
  const wheel = new THREE.LatheGeometry([[0.0001, -0.006], [0.012, -0.0065], [0.018, -0.005], [0.0205, -0.0025], [0.0205, 0.0025], [0.018, 0.005], [0.012, 0.0065], [0.0001, 0.006]].map(([r, y]) => new THREE.Vector2(r * H, y * H)), 28);
  P.add(g, wheel, 0, 0.054 * H, 0, Math.PI / 2, 0, 0);
  for (const zs of [1, -1]) {
    P.add(g, new THREE.TorusGeometry(0.0135 * H, 0.0013 * H, 5, 24), 0, 0.054 * H, zs * 0.0064 * H);
    P.add(g, new THREE.BoxGeometry(0.003 * H, 0.016 * H, 0.0018 * H), 0, 0.054 * H, zs * 0.0068 * H);
    P.add(g, new THREE.BoxGeometry(0.016 * H, 0.003 * H, 0.0018 * H), 0, 0.054 * H, zs * 0.0068 * H);
  }
  P.cyl(g, 0.0075 * H, 0.009 * H, 0.008 * H, 0, 0.0365 * H, 0, 0, 0, 0, 14); // the neck
  P.add(g, new THREE.SphereGeometry(0.0045 * H, 12, 8), 0, 0.075 * H, 0);
  g.userData.tip = [0, -0.06 * H - L * 0.9, 0];
  return g;
}

// ------------------------------------------------------------------ fine detail (second pass)

/** Carved eyes for a sculptHead of radius r (placed at the head's centre): eyeballs with a
 * raised iris rim and a drilled pupil, sitting in the sockets under the lids. */
// the rim of an eyelid: a tube round a sphere of radius R at polar angle th, over the front
function lidRim(R, th, t) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const ph = Math.PI * (0.12 + 0.76 * (i / 16));
    pts.push(new THREE.Vector3(-R * Math.cos(ph) * Math.sin(th), R * Math.cos(th), R * Math.sin(ph) * Math.sin(th)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, t, 6, false);
}

export function eyes(P, parent, r, cx, cy, cz, { look = 0, lids = true } = {}) {
  for (const s of [-1, 1]) {
    const er = r * (lids ? 0.112 : 0.125);
    const g = new THREE.SphereGeometry(er, 26, 18);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.acos(Math.max(-1, Math.min(1, z / er))); // angle from straight ahead
      let k = 1;
      if (a < 0.24) k = 0.88; // drilled pupil
      else if (a < 0.3) k = 0.94 + (a - 0.24) * 1.5;
      else if (a < 0.52) k = 1.03; // the iris rim stands proud
      p.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    g.rotateY(look + s * 0.12);
    const ex = cx + s * r * 0.272, ey = cy + r * 0.13, ez = cz + r * (lids ? 0.79 : 0.78);
    P.add(parent, g, ex, ey, ez);
    if (!lids) continue;
    // the lids: a heavy upper lid with a crease above it, a thin lower one
    // (lid edges are tori lying along the shells' rims, so the lids read thick)
    const up = new THREE.SphereGeometry(er * 1.14, 22, 8, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.12, Math.PI * 0.3);
    P.add(parent, up, ex, ey, ez, 0, look + s * 0.12, 0);
    P.add(parent, lidRim(er * 1.14, Math.PI * 0.42, er * 0.12), ex, ey, ez, 0, look + s * 0.12, 0);
    const lo = new THREE.SphereGeometry(er * 1.08, 22, 5, Math.PI * 0.14, Math.PI * 0.72, Math.PI * 0.62, Math.PI * 0.14);
    P.add(parent, lo, ex, ey, ez, 0, look + s * 0.12, 0);
    P.add(parent, lidRim(er * 1.08, Math.PI * 0.62, er * 0.08), ex, ey, ez, 0, look + s * 0.12, 0);
  }
}

/** A beard of separate locks: tapering, twisting tubes that fall from the jaw and cheeks and
 * curl at their ends; dense in front, thinner at the sides. */
export function beardLocks(r, len, { n = 30, seed = 3, tub = 12, rad = 6, thin = 1 } = {}) {
  const out = [];
  const rnd = (i, k) => {
    const v = Math.sin(i * 12.9898 + k * 78.233 + seed) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5; // -0.5 .. 0.5 round the jaw
    const a = u * 2.4; // angle round the face
    const start = new THREE.Vector3(Math.sin(a) * r * 0.78, -r * (0.35 + 0.2 * Math.cos(a * 1.2)), Math.cos(a) * r * 0.72);
    const l = len * (1 - Math.abs(u) * 0.9) * (0.75 + 0.35 * rnd(i, 1));
    const sway = (rnd(i, 2) - 0.5) * r * 0.5;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(new THREE.Vector3(
        start.x * (1 - t * 0.55) + sway * t + Math.sin(t * 5 + i) * r * 0.06,
        start.y - l * t,
        start.z + r * 0.25 * t * (1 - t) + r * 0.2 * t - Math.abs(u) * r * 0.3 * t,
      ));
    }
    // the end curls
    const end = pts[pts.length - 1];
    pts.push(end.clone().add(new THREE.Vector3(Math.sign(sway || 1) * r * 0.08, -r * 0.04, r * 0.06)));
    const curve = new THREE.CatmullRomCurve3(pts);
    const thick = r * (0.11 + 0.05 * rnd(i, 3)) * (1 - Math.abs(u) * 0.5) * thin;
    const g = new THREE.TubeGeometry(curve, tub, thick, rad, false);
    const p = g.attributes.position;
    const c = new THREE.Vector3();
    for (let s = 0; s <= tub; s++) {
      const t = s / tub;
      curve.getPoint(t, c);
      const k = Math.max(0.12, 1 - t * 0.85) * (1 + 0.15 * Math.sin(t * 14 + i)); // tapering, twisted
      for (let j = 0; j <= rad; j++) {
        const idx = s * (rad + 1) + j;
        // a groove down each lock, so it reads as combed hair
        const gr = 1 - 0.1 * Math.max(0, Math.cos((j / rad) * Math.PI * 4));
        p.setXYZ(idx, c.x + (p.getX(idx) - c.x) * k * gr, c.y + (p.getY(idx) - c.y) * k * gr, c.z + (p.getZ(idx) - c.z) * k * gr);
      }
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

/** A cut gem: faceted, in a raised bezel; lies flat on a surface facing +z. */
export function gem(P, parent, size, x, y, z, ry = 0, rx = 0) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.set(rx, ry, 0);
  parent.add(grp);
  const stone = new THREE.OctahedronGeometry(size, 1);
  stone.scale(1, 1.25, 0.55);
  P.add(grp, stone, 0, 0, size * 0.25);
  P.add(grp, new THREE.TorusGeometry(size * 0.95, size * 0.22, 5, 12), 0, 0, size * 0.05, 0, 0, 0, [1, 1.25, 1]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P.add(grp, new THREE.SphereGeometry(size * 0.2, 5, 3), Math.cos(a) * size * 1.05, Math.sin(a) * size * 1.3, size * 0.25); // claws
  }
  return grp;
}

/**
 * Raised work set onto a carved surface: casts toward the axis at height y and angle a (round
 * the y axis, 0 = +x, PI/2 = +z) and places a motif on the surface it finds, facing outward.
 */
const _rc = new THREE.Raycaster();
export function onSurface(mesh, a, y, lift = 0) {
  mesh.updateMatrixWorld(true);
  const dir = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
  const from = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(5).setY(y);
  _rc.set(from, dir);
  const hit = _rc.intersectObject(mesh, false)[0];
  if (!hit) return null;
  const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
  return { p: hit.point.clone().addScaledVector(n, lift), n };
}

/** Orients a motif group so its +z points along normal n. */
export function face(grp, n) {
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return grp;
}

/** A small bead in relief (faces +z): cheap, for long rows of them. */
export function bead(P, parent, r, x = 0, y = 0, z = 0) {
  return P.add(parent, new THREE.SphereGeometry(r, 6, 4), x, y, z, 0, 0, 0, [1, 1, 0.6]);
}

/** Embroidered quatrefoil: four petals round a bead, in relief (faces +z). */
export function quatrefoil(P, parent, s) {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    P.add(parent, new THREE.SphereGeometry(s * 0.42, 7, 4), Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5, 0, 0, 0, 0, [1, 1, 0.38]);
  }
  P.add(parent, new THREE.SphereGeometry(s * 0.26, 6, 4), 0, 0, s * 0.12, 0, 0, 0, [1, 1, 0.6]);
}

/** A fringe of separate threads hanging from a line (faces +z), n threads across width w. */
export function fringe(P, parent, w, len, n, thick) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.CylinderGeometry(thick, thick * 0.6, len * (0.9 + 0.2 * Math.sin(i * 7.1)), 5);
    g.translate(0, -len / 2, 0);
    P.add(parent, g, (i / (n - 1) - 0.5) * w, 0, 0, 0, 0, Math.sin(i * 3.3) * 0.08);
  }
  P.cyl(parent, thick * 1.6, thick * 1.6, w * 1.02, 0, 0, 0, 0, 0, Math.PI / 2, 8);
}

/** A finer hand: rounder fingers with knuckles and nails, three phalanges, a fleshier palm. */
export function fineHand(P, parent, s, side, pose = 'grip', { ring = false } = {}) {
  const g = new THREE.Group();
  parent.add(g);
  const palm = new THREE.CapsuleGeometry(s * 0.25, s * 0.3, 6, 16);
  palm.scale(1, 1, 0.52);
  P.add(g, palm, 0, -s * 0.38, 0);
  P.sphere(g, s * 0.2, 0, -s * 0.06, 0, [1.1, 0.8, 0.7], 18); // wrist
  // the tendons and the knuckle row across the back of the hand
  for (let i = 0; i < 4; i++) P.add(g, new THREE.CapsuleGeometry(s * 0.024, s * 0.26, 2, 6), (i - 1.5) * s * 0.12, -s * 0.5, -s * 0.11, -0.05, 0, (i - 1.5) * 0.08, [1, 1, 0.45]);
  P.add(g, new THREE.CapsuleGeometry(s * 0.06, s * 0.42, 3, 10), 0, -s * 0.66, -s * 0.04, 0, 0, Math.PI / 2, [1, 1, 0.8]);
  P.sphere(g, s * 0.14, -side * s * 0.13, -s * 0.36, s * 0.05, [0.8, 1.2, 0.7], 10); // the ball of the thumb
  const curl = pose === 'grip' ? [1.35, 1.5, 1.0] : pose === 'open' ? [0.2, 0.2, 0.15] : [1.45, 1.6, 1.1];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set((i - 1.5) * s * 0.15, -s * 0.7, s * 0.03);
    g.add(f);
    const raised = pose === 'bless' && i < 2;
    const lens = [0.2, 0.14, 0.11].map((v) => s * v * (1 - Math.abs(i - 1.3) * 0.12));
    let parentJ = f;
    lens.forEach((l, k) => {
      const seg = new THREE.Group();
      if (k > 0) seg.position.y = -lens[k - 1];
      seg.rotation.x = raised ? (k ? 0.04 : 0) : -curl[k];
      parentJ.add(seg);
      const rr = s * (0.068 - k * 0.006);
      P.add(seg, new THREE.CapsuleGeometry(rr, l, 3, 9), 0, -l / 2, 0);
      P.add(seg, new THREE.SphereGeometry(rr * 1.12, 10, 7), 0, 0, 0); // knuckle
      if (k === 2) P.add(seg, new THREE.SphereGeometry(rr * 0.8, 8, 5), 0, -l * 0.7, rr * 0.55, 0, 0, 0, [0.9, 1.2, 0.35]); // nail
      parentJ = seg;
    });
    if (ring && i === 2) {
      const rg = new THREE.Group();
      rg.position.y = -lens[0] * 0.45;
      f.children[0].add(rg);
      P.add(rg, new THREE.TorusGeometry(s * 0.085, s * 0.022, 8, 18), 0, 0, 0, Math.PI / 2);
      gem(P, rg, s * 0.05, 0, 0, s * 0.09, 0, 0);
    }
  }
  // the thumb, two segments
  const t = new THREE.Group();
  t.position.set(-side * s * 0.2, -s * 0.32, s * 0.1);
  t.rotation.set(pose === 'grip' ? -1.0 : -0.5, 0, -side * (pose === 'bless' ? 0.9 : 0.55));
  g.add(t);
  P.add(t, new THREE.CapsuleGeometry(s * 0.075, s * 0.15, 4, 12), 0, -s * 0.08, 0);
  const t2 = new THREE.Group();
  t2.position.y = -s * 0.17;
  t2.rotation.x = pose === 'grip' ? -0.6 : -0.2;
  t.add(t2);
  P.add(t2, new THREE.CapsuleGeometry(s * 0.068, s * 0.12, 4, 12), 0, -s * 0.07, 0);
  P.sphere(t2, s * 0.05, 0, -s * 0.13, s * 0.04, [0.9, 1.2, 0.35], 8);
  if (pose === 'bless') g.rotation.set(-Math.PI / 2 - 0.15, side * 0.3, 0);
  return g;
}

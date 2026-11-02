// The carving: every piece of the Wizard Chess set sculpted from shapes, in detail. Plate armour
// in overlapping lames with fan-winged couters and poleyns, layered pauldrons, gauntlets with
// fingers, sabatons; robes and cloaks hanging in deep folds; faces, beards and braided hair;
// crowns with jewels and fleurs; a fullered sword with a wrapped grip; a war horse with muscle,
// bridle, saddle and caparison; a keep of single stones. A light chisel noise over the cloth
// and the horse gives it a hand-carved surface.
//
// Builders take (J, root, P) where J collects the joints, root is the figure's base (the top
// of the pedestal) and P is the parts kit bound to one stone material. Joint names and
// positions are what the moves in statues.js expect.
import * as THREE from 'three';

// ------------------------------------------------------------------ noise
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  zf = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf), yf),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf), yf),
    zf,
  );
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;

/** Chisel noise: pushes the surface in and out along its normals. */
export function carve(geo, amp, freq = 30) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (fbm(x * freq + 7, y * freq, z * freq) - 0.5) * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Folds hanging down a turned shape (around y): deeper toward the hem (lower y). */
function folds(geo, count, depth, yTop, yHem, seed = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.min(1, Math.max(0, (yTop - y) / (yTop - yHem)));
    const a = Math.atan2(z, x);
    const w = Math.sin(count * a + Math.sin(3 * a + seed) * 0.8) * 0.7 + Math.sin(count * 2.3 * a + seed) * 0.3;
    const k = 1 + depth * t * w;
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// a hanging sheet of cloth (cloak, tabard, caparison): bent and folded
function drape(w, h, { bend = 0.2, folds: nf = 5, depth = 0.04, seg = 24 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, seg, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (h / 2 - y) / h; // 0 top .. 1 hem
    const f = Math.sin((x / w) * Math.PI * 2 * nf + Math.sin(y * 7) * 0.6) * depth * (0.25 + t);
    const curl = -bend * (x / w) ** 2 * w;
    p.setXYZ(i, x * (1 + 0.15 * t), y, f + curl);
  }
  g.computeVertexNormals();
  return g;
}

const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));

// ------------------------------------------------------------------ the parts kit
export function kit(mat) {
  const add = (parent, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    if (s) m.scale.set(...s);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const P = {
    add,
    sphere: (parent, r, x, y, z, s = null, seg = 18) => add(parent, new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.66)), x, y, z, 0, 0, 0, s),
    cap: (parent, r, x, y, z, s = null, ang = Math.PI / 2) => add(parent, new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, ang), x, y, z, 0, 0, 0, s),
    cyl: (parent, r1, r2, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 18) => add(parent, new THREE.CylinderGeometry(r1, r2, h, seg), x, y, z, rx, ry, rz),
    box: (parent, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => add(parent, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz),
    torus: (parent, r, t, x, y, z, rx = Math.PI / 2, arc = Math.PI * 2, seg = 32) => add(parent, new THREE.TorusGeometry(r, t, 8, seg, arc), x, y, z, rx),
    lathe: (parent, pts, y = 0, seg = 28, s = null) => add(parent, new THREE.LatheGeometry(V2(pts), seg), 0, y, 0, 0, 0, 0, s),
    geo: (parent, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) => add(parent, g, x, y, z, rx, ry, rz, s),
    rivets(parent, ring, y, n, size, z0 = 0, from = 0, to = Math.PI * 2) {
      for (let i = 0; i < n; i++) {
        const a = from + ((to - from) * (i + 0.5)) / n;
        P.sphere(parent, size, Math.sin(a) * ring, y, Math.cos(a) * ring * 0.78 + z0, null, 6);
      }
    },
  };

  // a limb hanging from its joint (pointing -y), in overlapping plates of armour
  P.plateLimb = (parent, len, r1, r2, lames = 4) => {
    P.cyl(parent, r1 * 0.88, r2 * 0.86, len, 0, -len / 2, 0);
    const h = len / lames;
    for (let i = 0; i < lames; i++) {
      const t = i / lames, r = r1 + (r2 - r1) * t;
      P.lathe(parent, [[r * 1.0, 0], [r * 1.1, -h * 0.12], [r * 1.07, -h * 0.9], [r * 0.95, -h * 1.05]], -i * h, 22);
    }
    P.sphere(parent, r1 * 1.02, 0, 0, 0);
  };
  // a bare (cloth or flesh) limb: smooth taper, with chisel marks
  P.limb = (parent, len, r1, r2, amp = 0.004) => {
    const g = new THREE.CylinderGeometry(r1, r2, len, 16, 6);
    g.translate(0, -len / 2, 0);
    carve(g, amp, 40);
    P.add(parent, g);
    P.sphere(parent, r1, 0, 0, 0, null, 14);
  };
  // elbow / knee cop: a round boss with a fan-shaped wing on the outer side
  P.cop = (parent, r, side, forward = true) => {
    P.sphere(parent, r, 0, 0, forward ? r * 0.25 : -r * 0.25, [1, 1, 0.9]);
    const fan = new THREE.CylinderGeometry(r * 1.5, r * 1.5, r * 0.18, 20, 1, false, 0, Math.PI);
    P.add(parent, fan, side * r * 0.75, 0, 0, 0, side > 0 ? 0 : Math.PI, Math.PI / 2);
  };
  // pauldron: three stacked plates over the shoulder
  P.pauldron = (parent, r, side) => {
    for (let i = 0; i < 3; i++) P.cap(parent, r * (1 - i * 0.12), side * r * 0.08 * i, -r * 0.28 * i, 0, [1.08, 0.8, 1], Math.PI / 1.9);
    P.torus(parent, r * 1.02, r * 0.07, 0, 0.0, 0, Math.PI / 2);
  };
  // gauntlet: a flared cuff, the back of the hand, four curled fingers and a thumb
  P.gauntlet = (parent, s, side) => {
    P.lathe(parent, [[s * 0.42, 0.01 * s], [s * 0.6, -0.06 * s], [s * 0.55, -0.32 * s], [s * 0.4, -0.36 * s]], 0.02 * s, 18);
    P.box(parent, s * 0.68, s * 0.5, s * 0.42, 0, -s * 0.6, s * 0.03);
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * s * 0.16;
      P.add(parent, new THREE.CapsuleGeometry(s * 0.07, s * 0.24, 3, 8), fx, -s * 0.92, s * 0.12, 0.9, 0, 0);
    }
    P.add(parent, new THREE.CapsuleGeometry(s * 0.075, s * 0.22, 3, 8), -side * s * 0.36, -s * 0.66, s * 0.2, 0.6, 0, side * 0.6);
  };
  P.hand = (parent, s, side) => {
    P.box(parent, s * 0.6, s * 0.5, s * 0.36, 0, -s * 0.32, 0.02 * s);
    for (let i = 0; i < 4; i++) P.add(parent, new THREE.CapsuleGeometry(s * 0.06, s * 0.2, 3, 8), (i - 1.5) * s * 0.14, -s * 0.66, s * 0.1, 0.9, 0, 0);
    P.add(parent, new THREE.CapsuleGeometry(s * 0.065, s * 0.18, 3, 8), -side * s * 0.33, -s * 0.38, s * 0.17, 0.6, 0, side * 0.5);
  };
  // sabaton: the foot in overlapping plates
  P.sabaton = (parent, w, h, l, y) => {
    for (let i = 0; i < 4; i++) P.box(parent, w * (1 - i * 0.06), h * (1 - i * 0.15), l * 0.3, 0, y - i * h * 0.05, l * (0.05 + i * 0.22), -0.12 * i);
    P.sphere(parent, w * 0.42, 0, y - h * 0.2, l * 0.85, [1, 0.6, 1.3], 12);
  };
  P.belt = (parent, r, y, z = 0) => {
    P.torus(parent, r, r * 0.06, 0, y, 0, Math.PI / 2, Math.PI * 2, 40);
    P.box(parent, r * 0.32, r * 0.24, r * 0.06, 0, y, r * 0.8 + z);
    P.torus(parent, r * 0.1, r * 0.02, 0, y, r * 0.84 + z, 0);
  };
  // the kite shield, face perpendicular to the forearm holding it (local -y), point down
  P.kite = (parent, w, h, emblem = true) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, h * 0.42);
    sh.quadraticCurveTo(w * 0.52, h * 0.44, w * 0.5, h * 0.18);
    sh.quadraticCurveTo(w * 0.42, -h * 0.25, 0, -h * 0.58);
    sh.quadraticCurveTo(-w * 0.42, -h * 0.25, -w * 0.5, h * 0.18);
    sh.quadraticCurveTo(-w * 0.52, h * 0.44, 0, h * 0.42);
    const g = new THREE.ExtrudeGeometry(sh, { depth: w * 0.06, bevelEnabled: true, bevelThickness: w * 0.03, bevelSize: w * 0.04, bevelSegments: 2, curveSegments: 16 });
    // dish the face a little
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - ((p.getX(i) / w) ** 2) * w * 0.35);
    g.computeVertexNormals();
    g.rotateX(Math.PI / 2);
    P.add(parent, g);
    // rim and the raised cross
    if (emblem) {
      P.box(parent, w * 0.1, w * 0.04, h * 0.7, 0, -w * 0.07, -h * 0.05, 0, 0, 0);
      P.box(parent, w * 0.6, w * 0.04, h * 0.09, 0, -w * 0.07, h * 0.12, 0, 0, 0);
      P.sphere(parent, w * 0.08, 0, -w * 0.08, h * 0.12, [1, 0.6, 1], 10);
    }
  };
  P.sword = (parent, H, len = 0.55) => {
    const g = new THREE.Group();
    g.name = 'weapon';
    parent.add(g);
    // wrapped grip, flared quillons, disc pommel
    for (let i = 0; i < 6; i++) P.torus(g, 0.013 * H, 0.004 * H, 0, 0.035 * H - i * 0.014 * H, 0, Math.PI / 2, Math.PI * 2, 12);
    P.cyl(g, 0.012 * H, 0.012 * H, 0.09 * H, 0, 0, 0, 0, 0, 0, 10);
    P.cyl(g, 0.024 * H, 0.024 * H, 0.012 * H, 0, 0.056 * H, 0, 0, 0, Math.PI / 2, 14);
    P.sphere(g, 0.01 * H, 0, 0.07 * H, 0, null, 8);
    const q = new THREE.CylinderGeometry(0.008 * H, 0.014 * H, 0.18 * H, 8);
    const qp = q.attributes.position;
    for (let i = 0; i < qp.count; i++) qp.setX(i, qp.getX(i) + (qp.getY(i) / (0.09 * H)) ** 2 * 0.012 * H); // the quillons curve up
    q.computeVertexNormals();
    P.add(g, q, 0, -0.05 * H, 0, 0, 0, Math.PI / 2);
    P.sphere(g, 0.014 * H, 0, -0.05 * H, 0, null, 8);
    // blade with a fuller, tapering to a point
    const L = len * H, bw = 0.032 * H, bt = 0.008 * H;
    const bs = new THREE.Shape();
    bs.moveTo(-bw / 2, 0);
    bs.lineTo(bw / 2, 0);
    bs.lineTo(bw * 0.42, -L * 0.82);
    bs.lineTo(0, -L);
    bs.lineTo(-bw * 0.42, -L * 0.82);
    bs.lineTo(-bw / 2, 0);
    const bg = new THREE.ExtrudeGeometry(bs, { depth: bt, bevelEnabled: true, bevelThickness: bt * 0.5, bevelSize: bw * 0.18, bevelSegments: 1 });
    bg.translate(0, -0.056 * H, -bt / 2);
    P.add(g, bg);
    P.box(g, bw * 0.22, L * 0.6, bt * 2.2, 0, -0.056 * H - L * 0.32, 0); // the fuller's ridge
    g.userData.tip = [0, -0.056 * H - L * 0.9, 0];
    return g;
  };
  P.crown = (parent, r, y, h, points = 8, jewels = true) => {
    P.lathe(parent, [[r * 0.98, 0], [r * 1.06, 0], [r * 1.1, h * 0.12], [r * 1.06, h * 0.45], [r * 1.0, h * 0.45], [r * 0.95, h * 0.1]], y, 32);
    P.torus(parent, r * 1.07, h * 0.06, 0, y + h * 0.1, 0);
    P.torus(parent, r * 1.08, h * 0.05, 0, y + h * 0.42, 0);
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2;
      const x = Math.sin(a) * r * 1.04, z = Math.cos(a) * r * 1.04;
      // a fleur: a tall leaf and two side leaves, with a pearl
      P.add(parent, new THREE.ConeGeometry(h * 0.16, h * 0.7, 4), x, y + h * 0.75, z, 0, a + Math.PI / 4, 0, [1, 1, 0.45]);
      for (const s of [-1, 1]) P.add(parent, new THREE.ConeGeometry(h * 0.08, h * 0.32, 4), x + Math.cos(a) * s * h * 0.15, y + h * 0.58, z - Math.sin(a) * s * h * 0.15, 0, a, -s * 0.6, [1, 1, 0.5]);
      P.sphere(parent, h * 0.07, x * 1.0, y + h * 1.12, z * 1.0, null, 8);
      if (jewels) P.sphere(parent, h * 0.07, Math.sin(a + Math.PI / points) * r * 1.11, y + h * 0.27, Math.cos(a + Math.PI / points) * r * 1.11, [1, 1.3, 0.6], 8);
    }
  };
  return P;
}

// ------------------------------------------------------------------ pedestal
export function pedestal(parent, P) {
  const g = new THREE.Group();
  parent.add(g);
  const oct = (r1, r2, h, y) => P.add(g, new THREE.CylinderGeometry(r1, r2, h, 8), 0, y, 0, 0, Math.PI / 8, 0);
  oct(0.262, 0.274, 0.045, 0.0225); // foot
  oct(0.25, 0.262, 0.012, 0.051);
  P.torus(g, 0.235, 0.008, 0, 0.06, 0, Math.PI / 2, Math.PI * 2, 8).rotation.z = 0;
  oct(0.16, 0.16, 0.12, 0.128); // core
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.sin(a) * 0.196, z = Math.cos(a) * 0.196;
    const col = new THREE.CylinderGeometry(0.019, 0.022, 0.1, 12, 1);
    // fluting
    const p = col.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const ang = Math.atan2(p.getZ(k), p.getX(k));
      const f = 1 - 0.12 * Math.max(0, Math.cos(ang * 6));
      p.setX(k, p.getX(k) * f);
      p.setZ(k, p.getZ(k) * f);
    }
    col.computeVertexNormals();
    P.add(g, col, x, 0.125, z);
    P.lathe(g, [[0.03, 0], [0.032, 0.004], [0.024, 0.012], [0.02, 0.016]], 0.06, 12).position.set(x, 0.062, z); // base
    P.lathe(g, [[0.019, 0], [0.026, 0.008], [0.034, 0.014], [0.034, 0.02]], 0.0, 12).position.set(x, 0.172, z); // capital
  }
  oct(0.255, 0.244, 0.022, 0.199); // top slab
  oct(0.246, 0.252, 0.012, 0.21);
  return g;
}

// ------------------------------------------------------------------ figures
function joint(J, name, parent, x, y, z, rest = null) {
  const j = new THREE.Group();
  j.name = name;
  j.position.set(x, y, z);
  j.userData.rest = rest || [0, 0, 0];
  parent.add(j);
  J[name] = j;
  return j;
}

// A figure of height H standing on the pedestal: the shared skeleton, and its plain body.
function skeleton(J, root, H) {
  joint(J, 'hips', root, 0, 0.5 * H, 0);
  joint(J, 'spine', J.hips, 0, 0.05 * H, 0);
  joint(J, 'chest', J.spine, 0, 0.15 * H, 0);
  joint(J, 'neck', J.chest, 0, 0.12 * H, 0);
  joint(J, 'head', J.neck, 0, 0.045 * H, 0);
  const legs = [];
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    joint(J, 'sh' + side, J.chest, s * 0.135 * H, 0.1 * H, 0, [0, 0, s * 0.08]);
    joint(J, 'el' + side, J['sh' + side], 0, -0.18 * H, 0);
    joint(J, 'wr' + side, J['el' + side], 0, -0.155 * H, 0);
    joint(J, 'hip' + side, J.hips, s * 0.055 * H, -0.02 * H, 0);
    joint(J, 'knee' + side, J['hip' + side], 0, -0.225 * H, 0);
    joint(J, 'ankle' + side, J['knee' + side], 0, -0.215 * H, 0);
    legs.push({ hip: 'hip' + side, knee: 'knee' + side, ankle: 'ankle' + side, thigh: 0.225 * H, shin: 0.215 * H, foot: [s * 0.055 * H, 0.04 * H, 0] });
  }
  return legs;
}

// an armoured torso: breastplate with a ridge and a plackart, backplate, fauld lames, gorget
function cuirass(J, P, H) {
  const bp = new THREE.LatheGeometry(V2([[0.094 * H, 0], [0.108 * H, 0.05 * H], [0.134 * H, 0.12 * H], [0.132 * H, 0.17 * H], [0.11 * H, 0.2 * H], [0.06 * H, 0.215 * H], [0, 0.215 * H]]), 36);
  const p = bp.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // a medial ridge down the front, flatter back
    const x = p.getX(i), z = p.getZ(i);
    const front = z > 0 ? 1 : 0;
    const ridge = front * Math.exp(-((x / (0.03 * H)) ** 2)) * 0.012 * H;
    p.setZ(i, z * (z > 0 ? 0.82 : 0.68) + ridge);
  }
  bp.computeVertexNormals();
  P.add(J.spine, bp);
  // plackart over the belly, gorget at the throat
  P.lathe(J.spine, [[0.098 * H, 0], [0.104 * H, 0.03 * H], [0.1 * H, 0.07 * H], [0.09 * H, 0.08 * H]], 0, 32, [1, 1, 0.8]);
  for (let i = 0; i < 3; i++) P.lathe(J.neck, [[0.06 * H - i * 0.006 * H, -0.03 * H + i * 0.018 * H], [0.066 * H - i * 0.006 * H, -0.02 * H + i * 0.018 * H], [0.058 * H - i * 0.006 * H, -0.01 * H + i * 0.018 * H]], 0, 28);
  P.cyl(J.neck, 0.036 * H, 0.042 * H, 0.06 * H, 0, 0, 0);
  // fauld: lames over the hips
  for (let i = 0; i < 3; i++) P.lathe(J.hips, [[0.1 * H + i * 0.008 * H, 0.04 * H - i * 0.035 * H], [0.112 * H + i * 0.008 * H, 0.03 * H - i * 0.035 * H], [0.116 * H + i * 0.01 * H, -0.0 * H - i * 0.035 * H], [0.104 * H + i * 0.01 * H, -0.005 * H - i * 0.035 * H]], 0, 32, [1, 1, 0.82]);
  P.belt(J.hips, 0.104 * H, 0.04 * H);
  P.rivets(J.spine, 0.128 * H, 0.17 * H, 9, 0.006 * H, 0, -1.2, 1.2);
}

function armouredArms(J, P, H, { pauldrons = true, gauntlets = true } = {}) {
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    P.plateLimb(J['sh' + side], 0.18 * H, 0.05 * H, 0.042 * H, 3);
    if (pauldrons) P.pauldron(J['sh' + side], 0.07 * H, s);
    P.plateLimb(J['el' + side], 0.155 * H, 0.042 * H, 0.034 * H, 3);
    P.cop(J['el' + side], 0.04 * H, s, false);
    if (gauntlets) P.gauntlet(J['wr' + side], 0.1 * H, s);
    else P.hand(J['wr' + side], 0.09 * H, s);
  }
}

function armouredLegs(J, P, H) {
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    P.plateLimb(J['hip' + side], 0.225 * H, 0.066 * H, 0.05 * H, 4);
    P.plateLimb(J['knee' + side], 0.215 * H, 0.05 * H, 0.038 * H, 4);
    P.cop(J['knee' + side], 0.05 * H, s, true);
    P.sabaton(J['ankle' + side], 0.07 * H, 0.045 * H, 0.14 * H, -0.02 * H);
  }
}

// a great helm: riveted bands, a cross on the face, slits to see and holes to breathe
function greatHelm(head, P, H) {
  const hg = new THREE.LatheGeometry(V2([[0.07 * H, -0.02 * H], [0.072 * H, 0.05 * H], [0.07 * H, 0.1 * H], [0.06 * H, 0.13 * H], [0.03 * H, 0.15 * H], [0, 0.152 * H]]), 32);
  P.add(head, hg);
  P.box(head, 0.12 * H, 0.012 * H, 0.03 * H, 0, 0.07 * H, 0.066 * H); // eye slit band
  P.box(head, 0.016 * H, 0.1 * H, 0.016 * H, 0, 0.045 * H, 0.072 * H); // the cross
  P.box(head, 0.08 * H, 0.014 * H, 0.016 * H, 0, 0.03 * H, 0.072 * H);
  P.torus(head, 0.072 * H, 0.005 * H, 0, 0.1 * H, 0, Math.PI / 2, Math.PI * 2, 32);
  P.rivets(head, 0.073 * H, 0.1 * H, 12, 0.005 * H);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) P.sphere(head, 0.004 * H, s * (0.02 + 0.007 * (i % 3)) * H, 0.0 * H + Math.floor(i / 3) * 0.012 * H, 0.071 * H, null, 6);
}

// a face: brow, nose, cheekbones, the eyes deep under the brow, lips
function face(head, P, H, { beard = false } = {}) {
  const sk = new THREE.SphereGeometry(0.062 * H, 24, 18);
  carve(sk, 0.002 * H, 60);
  P.add(head, sk, 0, 0.05 * H, 0, 0, 0, 0, [0.92, 1.08, 1]);
  P.add(head, new THREE.CapsuleGeometry(0.03 * H, 0.03 * H, 4, 10), 0, 0.075 * H, 0.04 * H, 0, 0, Math.PI / 2, [1, 0.5, 0.6]); // brow
  P.add(head, new THREE.ConeGeometry(0.012 * H, 0.03 * H, 6), 0, 0.052 * H, 0.064 * H, -0.3, 0, 0, [1, 1, 0.8]); // nose
  for (const s of [-1, 1]) {
    P.sphere(head, 0.016 * H, s * 0.035 * H, 0.04 * H, 0.046 * H, [1, 0.7, 0.6], 10); // cheekbones
    P.sphere(head, 0.009 * H, s * 0.022 * H, 0.064 * H, 0.054 * H, [1.3, 0.8, 0.5], 8); // eyelids
  }
  P.add(head, new THREE.CapsuleGeometry(0.006 * H, 0.016 * H, 3, 8), 0, 0.027 * H, 0.058 * H, 0, 0, Math.PI / 2); // lips
  if (beard) {
    const b = new THREE.ConeGeometry(0.05 * H, 0.13 * H, 16, 6);
    b.rotateX(Math.PI);
    carve(b, 0.008 * H, 90);
    P.add(head, b, 0, -0.02 * H, 0.035 * H, 0.25, 0, 0, [1, 1, 0.6]);
    P.add(head, new THREE.CapsuleGeometry(0.008 * H, 0.04 * H, 3, 8), 0, 0.034 * H, 0.06 * H, 0, 0, Math.PI / 2, [1, 1, 0.8]); // moustache
  }
}

function robeSkirt(J, P, H, len, r0, r1, nfold, depth) {
  const pts = [[r0, 0.04 * H], [r0 * 1.15, -0.06 * H], [r1 * 0.75, -len * 0.45], [r1 * 0.92, -len * 0.85], [r1, -len], [r1 * 0.9, -len], [0, -len]];
  const g = new THREE.LatheGeometry(V2(pts), 64);
  g.translate(0, 0, 0);
  // subdivide the profile so the folds can run down it
  const dense = new THREE.LatheGeometry(V2(resample(pts, 24)), 72);
  folds(dense, nfold, depth, -0.05 * H, -len);
  carve(dense, 0.0025 * H, 35);
  P.add(J.hips, dense);
}
function resample(pts, n) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    const k = i === pts.length - 2 ? 1 : Math.max(1, Math.round(n * Math.abs(y1 - y0) / Math.abs(pts[pts.length - 1][1] - pts[0][1])));
    for (let j = 0; j < k; j++) out.push([r0 + ((r1 - r0) * j) / k, y0 + ((y1 - y0) * j) / k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const BUILD = {
  // ----------------------------------------------------------------- the king
  6(J, root, P) {
    const H = 1.18;
    const legs = skeleton(J, root, H);
    cuirass(J, P, H);
    armouredArms(J, P, H);
    armouredLegs(J, P, H);
    // a surcoat hanging from the belt, split front and back, with the royal cross
    for (const [z, ry] of [[0.06 * H, 0], [-0.06 * H, Math.PI]]) {
      const d = drape(0.18 * H, 0.26 * H, { bend: 0.6, folds: 3, depth: 0.012 * H });
      P.geo(J.hips, d, 0, -0.1 * H, z * 1.35, 0.08 * Math.sign(z), ry, 0);
    }
    P.box(J.hips, 0.016 * H, 0.14 * H, 0.008 * H, 0, -0.08 * H, 0.09 * H);
    P.box(J.hips, 0.09 * H, 0.016 * H, 0.008 * H, 0, -0.04 * H, 0.09 * H);
    greatHelm(J.head, P, H);
    P.crown(J.head, 0.072 * H, 0.125 * H, 0.06 * H, 8, true);
    // a royal mantle over the shoulders and his kite shield slung on his back
    const mantle = drape(0.3 * H, 0.42 * H, { bend: 0.8, folds: 4, depth: 0.014 * H });
    P.geo(J.chest, mantle, 0, -0.1 * H, -0.1 * H, 0.05, Math.PI, 0);
    const back = new THREE.Group();
    J.chest.add(back);
    back.position.set(0.035 * H, -0.04 * H, -0.125 * H);
    back.rotation.set(-Math.PI / 2, 0, 0.12);
    P.kite(back, 0.22 * H, 0.36 * H);
    // the greatsword, held point-down before him in both hands
    const sw = P.sword(J.wrR, H, 0.62);
    sw.position.set(0.035 * H, -0.06 * H, 0.02 * H);
    J.weapon = sw;
    return { H, legs, style: 'two' };
  },
  // ----------------------------------------------------------------- the queen
  5(J, root, P) {
    const H = 1.1;
    const legs = skeleton(J, root, H);
    // a fitted, laced bodice
    const bod = new THREE.LatheGeometry(V2([[0.078 * H, 0], [0.086 * H, 0.06 * H], [0.112 * H, 0.13 * H], [0.11 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]]), 36);
    bod.scale(1, 1, 0.78);
    P.add(J.spine, bod);
    for (let i = 0; i < 6; i++) P.torus(J.spine, 0.006 * H, 0.0018 * H, 0, 0.02 * H + i * 0.022 * H, 0.072 * H + i * 0.0035 * H, 0, Math.PI * 2, 10);
    P.belt(J.hips, 0.088 * H, 0.04 * H);
    // a long gown in deep folds, and a cloak from the shoulders
    robeSkirt(J, P, H, 0.47 * H, 0.09 * H, 0.19 * H, 11, 0.07);
    const cloak = drape(0.3 * H, 0.66 * H, { bend: 1.0, folds: 5, depth: 0.018 * H, seg: 32 });
    P.geo(J.chest, cloak, 0, -0.2 * H, -0.11 * H, 0.12, Math.PI, 0);
    P.lathe(J.chest, [[0.07 * H, 0.09 * H], [0.1 * H, 0.11 * H], [0.112 * H, 0.14 * H], [0.095 * H, 0.15 * H]], 0, 32, [1, 1, 0.75]); // standing collar
    P.torus(J.neck, 0.05 * H, 0.004 * H, 0, -0.01 * H, 0.01 * H, 1.3); // necklace
    P.sphere(J.neck, 0.012 * H, 0, -0.04 * H, 0.05 * H, [1, 1.3, 0.6], 8);
    // arms in bell sleeves, bare hands
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      P.limb(J['sh' + side], 0.18 * H, 0.046 * H, 0.04 * H);
      P.cap(J['sh' + side], 0.058 * H, 0, 0, 0, [1.05, 0.7, 1]);
      const sl = new THREE.LatheGeometry(V2(resample([[0.04 * H, 0], [0.055 * H, -0.09 * H], [0.085 * H, -0.15 * H], [0.07 * H, -0.16 * H]], 10)), 28);
      folds(sl, 7, 0.12, -0.02 * H, -0.16 * H);
      P.add(J['el' + side], sl);
      P.hand(J['wr' + side], 0.085 * H, s);
    }
    face(J.head, P, H);
    // hair braided round under a tall crown, and a veil behind
    for (const s of [1, -1]) P.add(J.head, new THREE.TorusGeometry(0.05 * H, 0.012 * H, 8, 20, Math.PI), s * 0.01 * H, 0.08 * H, -0.01 * H, Math.PI / 2, 0, s * 0.1, [1.2, 1, 1]);
    P.cap(J.head, 0.064 * H, 0, 0.075 * H, -0.02 * H, [1, 0.9, 0.95]); // hair, swept back from the face
    const veil = drape(0.14 * H, 0.2 * H, { bend: 0.5, folds: 4, depth: 0.008 * H });
    P.geo(J.head, veil, 0, -0.01 * H, -0.06 * H, 0.15, Math.PI, 0);
    P.crown(J.head, 0.064 * H, 0.1 * H, 0.08 * H, 7, true);
    for (let i = 0; i < 2; i++) P.torus(J.head, 0.07 * H, 0.004 * H, 0, 0.17 * H, 0, i * Math.PI / 2 + 0.0001, Math.PI, 24); // arches
    P.sphere(J.head, 0.014 * H, 0, 0.24 * H, 0, null, 10);
    // the staff: a long rod with rings, a caged orb finial
    const st = new THREE.Group();
    st.name = 'weapon';
    J.wrR.add(st);
    P.cyl(st, 0.011 * H, 0.012 * H, 0.75 * H, 0, -0.2 * H, 0, 0, 0, 0, 12);
    for (const y of [0.1, -0.05, -0.35, -0.55]) P.torus(st, 0.016 * H, 0.004 * H, 0, y * H, 0, Math.PI / 2, Math.PI * 2, 14);
    P.lathe(st, [[0.012 * H, 0], [0.026 * H, 0.02 * H], [0.018 * H, 0.04 * H], [0.03 * H, 0.06 * H], [0.012 * H, 0.08 * H]], 0.15 * H, 16);
    P.sphere(st, 0.028 * H, 0, 0.27 * H, 0, null, 14);
    for (let i = 0; i < 4; i++) P.torus(st, 0.04 * H, 0.003 * H, 0, 0.27 * H, 0, Math.PI / 2 + 0.0001, Math.PI * 2, 20).rotation.set(0, (i * Math.PI) / 4, 0);
    P.add(st, new THREE.ConeGeometry(0.01 * H, 0.05 * H, 6), 0, 0.33 * H, 0);
    st.position.set(0.03 * H, -0.04 * H, 0.03 * H);
    st.userData.tip = [0, -0.55 * H, 0];
    J.weapon = st;
    return { H, legs, style: 'two' };
  },
  // ----------------------------------------------------------------- the bishop
  3(J, root, P) {
    const H = 1.02;
    const legs = skeleton(J, root, H);
    const tor = new THREE.LatheGeometry(V2(resample([[0.09 * H, 0], [0.1 * H, 0.06 * H], [0.122 * H, 0.13 * H], [0.12 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]], 14)), 40);
    folds(tor, 9, 0.06, 0.2 * H, 0);
    tor.scale(1, 1, 0.78);
    P.add(J.spine, tor);
    P.belt(J.hips, 0.094 * H, 0.04 * H);
    robeSkirt(J, P, H, 0.47 * H, 0.094 * H, 0.165 * H, 13, 0.06);
    // the chasuble falling before and behind, with its embroidered orphrey cross
    for (const [z, ry, h] of [[0.088, 0, 0.36], [-0.088, Math.PI, 0.44]]) {
      const d = drape(0.17 * H, h * H, { bend: 0.5, folds: 3, depth: 0.01 * H });
      P.geo(J.chest, d, 0, -0.06 * H - (h - 0.36) * H * 0.5, z * H, 0.05 * Math.sign(z), ry, 0);
      P.box(J.chest, 0.026 * H, h * H, 0.006 * H, 0, -0.06 * H - (h - 0.36) * H * 0.5, (z + Math.sign(z) * 0.006) * H);
    }
    P.box(J.chest, 0.12 * H, 0.024 * H, 0.006 * H, 0, 0.05 * H, 0.095 * H);
    P.torus(J.neck, 0.05 * H, 0.006 * H, 0, -0.005 * H, 0, 1.4); // amice
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      P.limb(J['sh' + side], 0.18 * H, 0.05 * H, 0.044 * H);
      const sl = new THREE.LatheGeometry(V2(resample([[0.044 * H, 0], [0.058 * H, -0.08 * H], [0.07 * H, -0.15 * H], [0.06 * H, -0.155 * H]], 8)), 24);
      folds(sl, 6, 0.1, 0, -0.15 * H);
      P.add(J['el' + side], sl);
      P.hand(J['wr' + side], 0.085 * H, s);
    }
    P.cyl(J.neck, 0.034 * H, 0.04 * H, 0.06 * H, 0, 0, 0);
    face(J.head, P, H, { beard: true });
    // the mitre: two peaks, banded, with lappets hanging behind
    const mi = new THREE.Shape();
    mi.moveTo(-0.07 * H, 0);
    mi.lineTo(0.07 * H, 0);
    mi.quadraticCurveTo(0.08 * H, 0.09 * H, 0, 0.16 * H);
    mi.quadraticCurveTo(-0.08 * H, 0.09 * H, -0.07 * H, 0);
    const mg = new THREE.ExtrudeGeometry(mi, { depth: 0.07 * H, bevelEnabled: true, bevelThickness: 0.008 * H, bevelSize: 0.006 * H, bevelSegments: 2, curveSegments: 12 });
    mg.translate(0, 0, -0.035 * H);
    P.geo(J.head, mg, 0, 0.1 * H, 0);
    P.box(J.head, 0.016 * H, 0.12 * H, 0.084 * H, 0, 0.16 * H, 0); // the band up the middle
    P.box(J.head, 0.15 * H, 0.02 * H, 0.085 * H, 0, 0.11 * H, 0);
    for (const s of [-1, 1]) P.box(J.head, 0.022 * H, 0.16 * H, 0.004 * H, s * 0.03 * H, 0.03 * H, -0.06 * H, 0.15, 0, 0);
    // the crozier in his left hand: knopped staff, a spiral crook with crockets
    const cr = new THREE.Group();
    cr.name = 'weapon';
    J.wrL.add(cr);
    P.cyl(cr, 0.011 * H, 0.011 * H, 0.95 * H, 0, -0.2 * H, 0, 0, 0, 0, 12);
    P.lathe(cr, [[0.011 * H, 0], [0.026 * H, 0.02 * H], [0.03 * H, 0.04 * H], [0.02 * H, 0.06 * H], [0.012 * H, 0.07 * H]], 0.2 * H, 16); // knop
    // the crook rises from the staff, rolls over toward his side and curls inward
    const R0 = 0.065 * H;
    const spiral = new THREE.Curve();
    spiral.getPoint = (t, out = new THREE.Vector3()) => {
      const a = t * Math.PI * 1.8, r = R0 * (1 - t * 0.55);
      return out.set(-R0 + r * Math.cos(a), r * Math.sin(a), 0);
    };
    const tube = new THREE.TubeGeometry(spiral, 40, 0.011 * H, 8);
    P.geo(cr, tube, 0, 0.33 * H, 0);
    P.cyl(cr, 0.011 * H, 0.011 * H, 0.06 * H, 0, 0.3 * H, 0, 0, 0, 0, 10);
    for (let i = 0; i < 5; i++) {
      const p = spiral.getPoint(i / 6);
      P.add(cr, new THREE.ConeGeometry(0.008 * H, 0.025 * H, 5), p.x * 1.15 - R0 * 0.15, p.y * 1.15 + 0.33 * H, 0, 0, 0, -i * 0.6);
    }
    cr.position.set(0, -0.04 * H, 0.02 * H);
    cr.userData.tip = [0, 0.37 * H, 0];
    J.weapon = cr;
    return { H, legs, style: 'one', hand: 'L' };
  },
  // ----------------------------------------------------------------- the rook
  4(J, root, P) {
    const T = 0.62;
    const tower = joint(J, 'tower', root, 0, 0, 0);
    // a keep of single stones: courses of blocks, staggered, each a little different
    P.lathe(tower, [[0.205, 0], [0.205, 0.035], [0.18, 0.05], [0.165, 0.06], [0, 0.06]], 0, 24);
    P.cyl(tower, 0.145, 0.158, T * 0.86, 0, 0.06 + T * 0.43, 0, 0, 0, 0, 24);
    const courses = 11, ch = (T * 0.86) / courses;
    for (let c = 0; c < courses; c++) {
      const r = 0.158 - (0.013 * c) / courses;
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = ((i + (c % 2) * 0.5) / n) * Math.PI * 2;
        const w = ((2 * Math.PI * r) / n) * (0.9 + Math.random() * 0.06);
        const b = P.box(tower, w, ch * (0.86 + Math.random() * 0.08), 0.03, Math.sin(a) * r, 0.06 + ch * (c + 0.5), Math.cos(a) * r, 0, a, 0);
        b.rotation.y = a;
      }
    }
    // arrow slits
    for (const a of [0.4, 2.5, 4.4]) P.box(tower, 0.012, 0.09, 0.04, Math.sin(a) * 0.16, 0.3, Math.cos(a) * 0.16, 0, a, 0);
    // corbels and machicolation under a projecting parapet, then merlons
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      P.box(tower, 0.03, 0.045, 0.05, Math.sin(a) * 0.168, T * 0.9, Math.cos(a) * 0.168, 0, a, 0);
    }
    P.lathe(tower, [[0.19, T * 0.925], [0.205, T * 0.925], [0.205, T], [0.175, T], [0.175, T * 0.96], [0, T * 0.96]], 0, 32);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      P.box(tower, 0.072, 0.07, 0.045, Math.sin(a) * 0.185, T + 0.035, Math.cos(a) * 0.185, 0, a, 0);
    }
    // the soldier standing in the keep, from the waist up
    const H = 0.95;
    joint(J, 'hips', tower, 0, T - 0.06, 0);
    joint(J, 'spine', J.hips, 0, 0.02, 0);
    joint(J, 'chest', J.spine, 0, 0.12 * H, 0);
    joint(J, 'neck', J.chest, 0, 0.12 * H, 0);
    joint(J, 'head', J.neck, 0, 0.045 * H, 0);
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      joint(J, 'sh' + side, J.chest, s * 0.13 * H, 0.1 * H, 0);
      joint(J, 'el' + side, J['sh' + side], 0, -0.17 * H, 0);
      joint(J, 'wr' + side, J['el' + side], 0, -0.15 * H, 0);
    }
    soldierTop(J, P, H);
    // a crested sallet
    P.lathe(J.head, [[0.072 * H, 0.0], [0.08 * H, 0.02 * H], [0.07 * H, 0.09 * H], [0.04 * H, 0.13 * H], [0, 0.135 * H]], 0, 28);
    P.box(J.head, 0.11 * H, 0.012 * H, 0.03 * H, 0, 0.055 * H, 0.068 * H);
    P.lathe(J.head, [[0.072 * H, 0], [0.11 * H, -0.03 * H], [0.11 * H, -0.02 * H], [0.07 * H, 0.012 * H]], 0, 28, [1, 1, 1.2]);
    const crest = new THREE.Shape();
    crest.moveTo(-0.08 * H, 0);
    crest.quadraticCurveTo(0, 0.1 * H, 0.08 * H, 0);
    const cg = new THREE.ExtrudeGeometry(crest, { depth: 0.012 * H, bevelEnabled: false, curveSegments: 12 });
    cg.translate(0, 0, -0.006 * H);
    P.geo(J.head, cg, 0, 0.11 * H, 0, 0, Math.PI / 2, 0);
    const shield = new THREE.Group();
    shield.name = 'shield';
    J.elL.add(shield);
    P.kite(shield, 0.3 * H, 0.46 * H);
    shield.position.set(0, -0.09 * H, 0);
    J.shield = shield;
    const sw = P.sword(J.wrR, H, 0.42);
    sw.position.set(0, -0.05 * H, 0.02 * H);
    J.weapon = sw;
    return { H, legs: [], style: 'one', hand: 'R' };
  },
  // ----------------------------------------------------------------- the knight
  2(J, root, P) {
    horse(J, root, P);
    const H = 0.8;
    joint(J, 'hips', J.horse, 0, 0.17, 0.14, [0.8, 0, 0]);
    joint(J, 'spine', J.hips, 0, 0.02, 0);
    joint(J, 'chest', J.spine, 0, 0.12 * H, 0);
    joint(J, 'neck', J.chest, 0, 0.12 * H, 0);
    joint(J, 'head', J.neck, 0, 0.045 * H, 0);
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      joint(J, 'sh' + side, J.chest, s * 0.13 * H, 0.1 * H, 0);
      joint(J, 'el' + side, J['sh' + side], 0, -0.17 * H, 0);
      joint(J, 'wr' + side, J['el' + side], 0, -0.15 * H, 0);
      // legs astride, in armour, feet in the stirrups
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.1 * H, -0.02 * H, 0.02 * H);
      thigh.rotation.set(-1.25, 0, s * 0.35);
      J.hips.add(thigh);
      P.plateLimb(thigh, 0.2 * H, 0.06 * H, 0.05 * H, 3);
      const shin = new THREE.Group();
      shin.position.set(0, -0.2 * H, 0);
      shin.rotation.set(1.45, 0, -s * 0.15);
      thigh.add(shin);
      P.plateLimb(shin, 0.19 * H, 0.05 * H, 0.04 * H, 3);
      P.cop(shin, 0.05 * H, s, true);
      P.sabaton(shin, 0.065 * H, 0.04 * H, 0.12 * H, -0.2 * H);
      P.torus(shin, 0.045 * H, 0.006 * H, 0, -0.215 * H, 0.03 * H, 0); // stirrup
    }
    soldierTop(J, P, H);
    greatHelm(J.head, P, H);
    P.add(J.head, new THREE.ConeGeometry(0.022 * H, 0.1 * H, 8), 0, 0.19 * H, 0);
    for (let i = 0; i < 7; i++) {
      const plume = new THREE.CapsuleGeometry(0.008 * H, 0.1 * H, 3, 6);
      P.add(J.head, plume, 0, 0.16 * H + i * 0.004 * H, -0.02 * H - i * 0.016 * H, -0.6 - i * 0.18, 0, (i % 2 ? 1 : -1) * 0.1);
    }
    const shield = new THREE.Group();
    shield.name = 'shield';
    J.elL.add(shield);
    P.kite(shield, 0.28 * H, 0.42 * H);
    shield.position.set(0, -0.08 * H, 0);
    J.shield = shield;
    // a flanged mace
    const mace = new THREE.Group();
    mace.name = 'weapon';
    J.wrR.add(mace);
    P.cyl(mace, 0.012 * H, 0.013 * H, 0.32 * H, 0, -0.1 * H, 0, 0, 0, 0, 10);
    for (let i = 0; i < 4; i++) P.torus(mace, 0.015 * H, 0.004 * H, 0, 0.02 * H - i * 0.016 * H, 0, Math.PI / 2, Math.PI * 2, 12);
    P.sphere(mace, 0.03 * H, 0, -0.27 * H, 0, null, 14);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      P.box(mace, 0.006 * H, 0.08 * H, 0.04 * H, Math.sin(a) * 0.03 * H, -0.27 * H, Math.cos(a) * 0.03 * H, 0, a, 0);
    }
    P.add(mace, new THREE.ConeGeometry(0.014 * H, 0.04 * H, 6), 0, -0.32 * H, 0, Math.PI, 0, 0);
    mace.position.set(0, -0.06 * H, 0.02 * H);
    mace.userData.tip = [0, -0.27 * H, 0];
    J.weapon = mace;
    return { H, legs: [], style: 'one', hand: 'R' };
  },
  // ----------------------------------------------------------------- the pawn
  1(J, root, P) {
    const H = 0.6;
    const legs = skeleton(J, root, H);
    // a quilted gambeson, belted, over mail
    const gam = new THREE.LatheGeometry(V2(resample([[0.094 * H, 0], [0.106 * H, 0.06 * H], [0.13 * H, 0.13 * H], [0.128 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]], 16)), 36);
    const gp = gam.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const y = gp.getY(i), k = 1 + 0.035 * Math.abs(Math.sin((y / (0.021 * H)) * Math.PI)); // quilted bands
      gp.setXYZ(i, gp.getX(i) * k, y, gp.getZ(i) * k * 0.78);
    }
    gam.computeVertexNormals();
    P.add(J.spine, gam);
    P.belt(J.hips, 0.1 * H, 0.04 * H);
    const skirt = new THREE.LatheGeometry(V2(resample([[0.1 * H, 0.04 * H], [0.115 * H, -0.04 * H], [0.13 * H, -0.12 * H], [0.11 * H, -0.12 * H]], 8)), 36);
    folds(skirt, 8, 0.08, 0.0, -0.12 * H);
    P.add(J.hips, skirt);
    P.cyl(J.neck, 0.036 * H, 0.046 * H, 0.06 * H, 0, 0, 0);
    P.torus(J.neck, 0.05 * H, 0.012 * H, 0, -0.02 * H, 0, Math.PI / 2); // padded collar
    // a tabard with a cross
    const tab = drape(0.16 * H, 0.32 * H, { bend: 0.4, folds: 3, depth: 0.008 * H });
    P.geo(J.chest, tab, 0, -0.1 * H, 0.098 * H, 0.06, 0, 0);
    P.box(J.chest, 0.014 * H, 0.12 * H, 0.006 * H, 0, -0.02 * H, 0.104 * H);
    P.box(J.chest, 0.08 * H, 0.014 * H, 0.006 * H, 0, 0.01 * H, 0.104 * H);
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      P.limb(J['sh' + side], 0.18 * H, 0.054 * H, 0.044 * H, 0.002);
      for (let i = 0; i < 3; i++) P.torus(J['sh' + side], 0.05 * H - i * 0.003 * H, 0.006 * H, 0, -0.05 * H - i * 0.05 * H, 0); // quilting
      P.limb(J['el' + side], 0.155 * H, 0.044 * H, 0.034 * H, 0.002);
      P.lathe(J['el' + side], [[0.035 * H, -0.09 * H], [0.048 * H, -0.12 * H], [0.044 * H, -0.155 * H], [0.034 * H, -0.155 * H]], 0, 18); // leather bracer
      P.gauntlet(J['wr' + side], 0.1 * H, s);
      P.limb(J['hip' + side], 0.225 * H, 0.066 * H, 0.05 * H, 0.002);
      P.limb(J['knee' + side], 0.215 * H, 0.05 * H, 0.042 * H, 0.002);
      P.lathe(J['knee' + side], [[0.046 * H, -0.08 * H], [0.056 * H, -0.1 * H], [0.052 * H, -0.215 * H], [0.044 * H, -0.215 * H]], 0, 18); // boot
      P.sphere(J['knee' + side], 0.052 * H, 0, 0, 0.015 * H, [1, 1, 0.9], 12);
      P.sabaton(J['ankle' + side], 0.07 * H, 0.045 * H, 0.13 * H, -0.02 * H);
    }
    face(J.head, P, H);
    // a kettle hat: a riveted dome and a wide sloping brim
    P.cap(J.head, 0.074 * H, 0, 0.068 * H, 0, [1, 1.1, 1]);
    P.lathe(J.head, [[0.07 * H, 0], [0.13 * H, -0.03 * H], [0.132 * H, -0.022 * H], [0.07 * H, 0.012 * H]], 0.07 * H, 36);
    P.torus(J.head, 0.074 * H, 0.004 * H, 0, 0.072 * H, 0, Math.PI / 2, Math.PI * 2, 32);
    P.rivets(J.head, 0.075 * H, 0.075 * H, 10, 0.004 * H);
    P.box(J.head, 0.008 * H, 0.07 * H, 0.15 * H, 0, 0.11 * H, 0, 0, 0, 0);
    const bL = P.sword(J.wrL, H, 0.42);
    bL.name = 'weapon2';
    bL.position.set(0, -0.05 * H, 0.02 * H);
    const bR = P.sword(J.wrR, H, 0.42);
    bR.position.set(0, -0.05 * H, 0.02 * H);
    J.weapon = bR;
    J.weapon2 = bL;
    return { H, legs, style: 'dual' };
  },
};

// the armoured torso and arms of the rook's soldier and the knight's rider
function soldierTop(J, P, H) {
  const bp = new THREE.LatheGeometry(V2([[0.1 * H, 0], [0.12 * H, 0.06 * H], [0.134 * H, 0.12 * H], [0.13 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]]), 36);
  const p = bp.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setZ(i, z * (z > 0 ? 0.82 : 0.7) + (z > 0 ? Math.exp(-((x / (0.03 * H)) ** 2)) * 0.012 * H : 0));
  }
  bp.computeVertexNormals();
  P.add(J.spine, bp);
  for (let i = 0; i < 3; i++) P.lathe(J.spine, [[0.1 * H + i * 0.006 * H, 0.0 - i * 0.03 * H], [0.11 * H + i * 0.006 * H, -0.01 * H - i * 0.03 * H], [0.108 * H + i * 0.008 * H, -0.035 * H - i * 0.03 * H], [0.098 * H + i * 0.008 * H, -0.04 * H - i * 0.03 * H]], 0, 32, [1, 1, 0.8]);
  P.belt(J.spine, 0.1 * H, 0.0);
  P.rivets(J.spine, 0.128 * H, 0.17 * H, 9, 0.006 * H, 0, -1.2, 1.2);
  P.cyl(J.neck, 0.036 * H, 0.042 * H, 0.06 * H, 0, 0, 0);
  for (let i = 0; i < 3; i++) P.lathe(J.neck, [[0.06 * H - i * 0.006 * H, -0.03 * H + i * 0.018 * H], [0.066 * H - i * 0.006 * H, -0.02 * H + i * 0.018 * H], [0.058 * H - i * 0.006 * H, -0.01 * H + i * 0.018 * H]], 0, 28);
  P.sphere(J.head, 0.06 * H, 0, 0.05 * H, 0, null, 18);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    P.plateLimb(J['sh' + side], 0.17 * H, 0.052 * H, 0.042 * H, 3);
    P.pauldron(J['sh' + side], 0.068 * H, s);
    P.plateLimb(J['el' + side], 0.15 * H, 0.042 * H, 0.034 * H, 3);
    P.cop(J['el' + side], 0.04 * H, s, false);
    P.gauntlet(J['wr' + side], 0.1 * H, s);
  }
}

// ----------------------------------------------------------------- the war horse
function horse(J, root, P) {
  const hs = joint(J, 'horse', root, 0, 0.3, -0.1, [-0.8, 0, 0]); // pivot on the hind quarters, reared
  // the body: barrel, chest and haunches as overlapping masses, carved
  const mass = (r, x, y, z, s) => {
    const g = new THREE.SphereGeometry(r, 28, 20);
    carve(g, r * 0.05, 9 / r);
    return P.add(hs, g, x, y, z, 0, 0, 0, s);
  };
  const barrel = new THREE.CapsuleGeometry(0.135, 0.3, 10, 28);
  barrel.rotateX(Math.PI / 2);
  barrel.scale(0.8, 1, 1);
  carve(barrel, 0.006, 25);
  P.add(hs, barrel, 0, 0.02, 0.18);
  mass(0.15, 0, 0.04, 0.35, [0.82, 1.0, 0.85]); // chest
  for (const s of [-1, 1]) {
    mass(0.09, s * 0.07, 0.07, 0.36, [0.6, 1.0, 0.9]); // shoulders
    mass(0.11, s * 0.07, 0.04, 0.0, [0.55, 1.0, 1.0]); // haunches
  }
  mass(0.14, 0, 0.05, 0.0, [0.88, 0.95, 0.85]); // rump
  // a saddle with a high cantle, and a caparison falling from it in folds
  P.lathe(hs, [[0.0, 0.0], [0.11, 0.0], [0.12, 0.02], [0.1, 0.04], [0, 0.04]], 0.15, 28, [1, 1, 1.25]).position.set(0, 0.145, 0.15);
  P.box(hs, 0.16, 0.08, 0.025, 0, 0.19, 0.04, 0.3, 0, 0);
  for (const s of [-1, 1]) {
    const cap = drape(0.3, 0.14, { bend: 0.0, folds: 6, depth: 0.008, seg: 24 });
    P.geo(hs, cap, s * 0.112, -0.03, 0.17, 0, s * Math.PI / 2, s * 0.12, [1, 1, 1]);
  }
  // hind legs: gaskin, hock, cannon, fetlock, hoof; planted on the pedestal
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hip = joint(J, 'hh' + side, root, s * 0.085, 0.31, -0.12, [0.3, 0, 0]);
    const thigh = new THREE.CylinderGeometry(0.07, 0.04, 0.17, 18, 4);
    thigh.translate(0, -0.085, 0);
    carve(thigh, 0.004, 30);
    P.add(hip, thigh);
    P.sphere(hip, 0.065, 0, 0, 0, null, 16);
    const hock = joint(J, 'hk' + side, hip, 0, -0.17, 0, [-0.75, 0, 0]);
    P.sphere(hock, 0.036, 0, 0, -0.01, [1, 1, 1.2], 12);
    P.cyl(hock, 0.027, 0.024, 0.11, 0, -0.055, 0, 0, 0, 0, 12);
    P.sphere(hock, 0.03, 0, -0.11, 0.004, null, 10); // fetlock
    P.lathe(hock, [[0.026, 0], [0.034, -0.03], [0.036, -0.036], [0, -0.036]], -0.112, 14); // hoof
  }
  // forelegs, raised and pawing: forearm, knee, cannon, fetlock, hoof
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = joint(J, 'fl' + side, hs, s * 0.08, -0.03, 0.38, [-0.4, 0, 0]);
    const fa = new THREE.CylinderGeometry(0.052, 0.032, 0.16, 16, 4);
    fa.translate(0, -0.08, 0);
    carve(fa, 0.004, 30);
    P.add(sh, fa);
    P.sphere(sh, 0.05, 0, 0, 0, null, 14);
    const kn = joint(J, 'fk' + side, sh, 0, -0.16, 0, [1.5, 0, 0]);
    P.sphere(kn, 0.034, 0, 0, 0, null, 12);
    P.cyl(kn, 0.025, 0.023, 0.12, 0, -0.06, 0, 0, 0, 0, 12);
    P.sphere(kn, 0.028, 0, -0.125, 0.003, null, 10);
    P.lathe(kn, [[0.024, 0], [0.032, -0.03], [0.034, -0.035], [0, -0.035]], -0.128, 14);
  }
  // an arched, muscled neck with a mane of strands
  const neck = joint(J, 'hneck', hs, 0, 0.08, 0.4, [0.75, 0, 0]);
  const ng = new THREE.CylinderGeometry(0.058, 0.09, 0.28, 24, 8);
  ng.translate(0, 0.14, 0);
  ng.scale(1, 1, 1.3);
  carve(ng, 0.005, 25);
  P.add(neck, ng);
  for (let i = 0; i < 14; i++) {
    const strand = new THREE.ConeGeometry(0.014, 0.09, 5);
    P.add(neck, strand, (i % 2 ? 0.012 : -0.012), 0.02 + i * 0.02, -0.088 + i * 0.002, -2.2 + Math.sin(i) * 0.2, 0, (i % 2 ? 0.3 : -0.3), [1, 1, 0.5]);
  }
  // the head: cranium, long face, muzzle, jaw, nostrils, eyes, ears, forelock, bridle
  const hd = joint(J, 'hhead', neck, 0, 0.27, 0.0, [1.75, 0, 0]);
  const face = new THREE.CylinderGeometry(0.058, 0.036, 0.2, 20, 6);
  face.translate(0, 0.1, 0);
  face.scale(0.82, 1, 1.25);
  carve(face, 0.003, 40);
  P.add(hd, face);
  P.sphere(hd, 0.065, 0, 0.0, 0.0, [0.85, 0.9, 1.15], 18); // cranium
  P.sphere(hd, 0.045, 0, 0.19, 0.005, [0.8, 0.75, 1.15], 14); // muzzle
  P.sphere(hd, 0.05, 0, 0.04, -0.035, [0.75, 1.0, 0.9], 14); // jaw
  for (const s of [-1, 1]) {
    P.sphere(hd, 0.011, s * 0.024, 0.22, 0.03, [1, 1.4, 1], 8); // nostril
    P.sphere(hd, 0.014, s * 0.05, 0.035, 0.03, [0.6, 1, 1], 10); // eye
    P.sphere(hd, 0.02, s * 0.048, 0.04, 0.035, [0.4, 0.5, 1.2], 8); // brow
    P.add(hd, new THREE.ConeGeometry(0.018, 0.07, 5), s * 0.035, -0.03, -0.05, -2.0, 0, s * 0.2);
    // bridle: cheek strap
    P.box(hd, 0.006, 0.16, 0.014, s * 0.052, 0.09, 0.025, 0, 0, s * 0.08);
  }
  P.torus(hd, 0.05, 0.005, 0, 0.16, 0.0, Math.PI / 2, Math.PI * 2, 24); // noseband
  P.torus(hd, 0.058, 0.005, 0, 0.02, 0.0, Math.PI / 2 + 0.3, Math.PI * 2, 24); // browband
  for (let i = 0; i < 4; i++) P.add(hd, new THREE.ConeGeometry(0.012, 0.06, 5), (i - 1.5) * 0.012, 0.0, 0.06, 1.6, 0, 0, [1, 1, 0.5]); // forelock
  // a tail of long strands
  const tail = joint(J, 'tail', hs, 0, 0.05, -0.1, [1.25, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const tg = new THREE.CylinderGeometry(0.018, 0.006, 0.32 + (i % 3) * 0.03, 6);
    tg.translate(0, -0.16, 0);
    P.add(tail, tg, (i - 3) * 0.008, 0, (i % 2) * 0.008, 0, 0, (i - 3) * 0.05);
  }
}

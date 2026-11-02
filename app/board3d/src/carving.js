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
export function folds(geo, count, depth, yTop, yHem, seed = 0) {
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
export function drape(w, h, { bend = 0.2, folds: nf = 5, depth = 0.04, seg = 24 } = {}) {
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

// A turned shape faces inward when its profile runs top to bottom; turn it outward.
export function outward(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let dot = 0;
  for (let i = 0; i < p.count; i++) dot += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i);
  if (dot < 0 && g.index) {
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

export const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));

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
    lathe: (parent, pts, y = 0, seg = 28, s = null) => add(parent, outward(new THREE.LatheGeometry(V2(pts), seg)), 0, y, 0, 0, 0, 0, s),
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
export function joint(J, name, parent, x, y, z, rest = null) {
  const j = new THREE.Group();
  j.name = name;
  j.position.set(x, y, z);
  j.userData.rest = rest || [0, 0, 0];
  parent.add(j);
  J[name] = j;
  return j;
}

// A figure of height H standing on the pedestal: the shared skeleton, and its plain body.
export function skeleton(J, root, H) {
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
export function cuirass(J, P, H) {
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

export function armouredArms(J, P, H, { pauldrons = true, gauntlets = true } = {}) {
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

export function armouredLegs(J, P, H) {
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    P.plateLimb(J['hip' + side], 0.225 * H, 0.066 * H, 0.05 * H, 4);
    P.plateLimb(J['knee' + side], 0.215 * H, 0.05 * H, 0.038 * H, 4);
    P.cop(J['knee' + side], 0.05 * H, s, true);
    P.sabaton(J['ankle' + side], 0.07 * H, 0.045 * H, 0.14 * H, -0.02 * H);
  }
}

// a great helm: riveted bands, a cross on the face, slits to see and holes to breathe
export function greatHelm(head, P, H) {
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
export function face(head, P, H, { beard = false } = {}) {
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

export function robeSkirt(J, P, H, len, r0, r1, nfold, depth) {
  const pts = [[r0, 0.04 * H], [r0 * 1.15, -0.06 * H], [r1 * 0.75, -len * 0.45], [r1 * 0.92, -len * 0.85], [r1, -len], [r1 * 0.9, -len], [0, -len]];
  const g = new THREE.LatheGeometry(V2(pts), 64);
  g.translate(0, 0, 0);
  // subdivide the profile so the folds can run down it
  const dense = new THREE.LatheGeometry(V2(resample(pts, 24)), 72);
  folds(dense, nfold, depth, -0.05 * H, -len);
  carve(dense, 0.0025 * H, 35);
  P.add(J.hips, dense);
}
export function resample(pts, n) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    const k = i === pts.length - 2 ? 1 : Math.max(1, Math.round(n * Math.abs(y1 - y0) / Math.abs(pts[pts.length - 1][1] - pts[0][1])));
    for (let j = 0; j < k; j++) out.push([r0 + ((r1 - r0) * j) / k, y0 + ((y1 - y0) * j) / k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

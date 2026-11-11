// Sculpted plate armour for the knight's rider and the rook's soldier: a breastplate with a
// medial ridge and a waist, the plackart and fauld lames cut in as real grooves, a gorget,
// pauldrons of overlapping lames with rolled edges and rivets, articulated arms and legs,
// gauntlets with jointed fingers, sabatons, helms with slits and breaths cut through; and the
// arms they carry (a flanged mace, a fullered sword, a kite shield with rim, cross and boss).
//
// Anything that is the same shape for both pieces is carved once at unit size (H = 1), cached
// and scaled, and the right side is the mirror of the left, so the extra detail costs little.
import * as THREE from 'three';
import { blend, chisel, cone, roundBox, sculpt, sphere, smax, smin } from './kr_sculpt.js';
import { cached, loft, mirrorX, rivets, thickSheet, tube } from './kr_geo.js';

const S3 = (H) => [H, H, H];

// cut grooves across a surface where band(x, y, z) < 0, [depth] deep
export function grooved(f, bands, w, depth) {
  return (x, y, z) => {
    const d = f(x, y, z);
    let g = Infinity;
    for (const b of bands) g = Math.min(g, Math.abs(b(x, y, z)) - w);
    return smax(d, -Math.max(g, -d - depth), w * 0.6);
  };
}

/** Torso in the spine's frame (the spine joint at the waist, the chest joint 0.12H above). */
export function torso(P, spine, H) {
  const g = cached('torso', () => {
    const f = blend([
      [cone([0, -0.01, 0.0], [0, 0.1, 0.0], 0.094, 0.112, 1, 0.78)], // abdomen
      [sphere(0, 0.13, 0.012, 0.1, 1.32, 0.95, 0.94), 0.04], // the breastplate's swell
      [sphere(0, 0.12, -0.02, 0.1, 1.25, 1.0, 0.8), 0.04], // back
      [cone([0, 0.04, 0.084], [0, 0.2, 0.088], 0.008, 0.006), 0.012], // medial ridge
      [cone([0, 0.18, 0], [0, 0.235, 0], 0.05, 0.042), 0.03], // gorget
      [cone([0, -0.06, 0], [0, 0.0, 0], 0.112, 0.098, 1, 0.82), 0.02], // fauld
      // the arm holes' raised, roped edges
      [cone([0.105, 0.2, 0.03], [0.118, 0.13, 0.06], 0.006, 0.005), 0.008],
      [cone([-0.105, 0.2, 0.03], [-0.118, 0.13, 0.06], 0.006, 0.005), 0.008],
      // the backplate: a ridge down the spine, and the shoulder blades' plates
      [cone([0, 0.04, -0.075], [0, 0.2, -0.076], 0.006, 0.005), 0.01],
      [sphere(0.05, 0.16, -0.06, 0.04, 1.1, 1.0, 0.45), 0.02],
      [sphere(-0.05, 0.16, -0.06, 0.04, 1.1, 1.0, 0.45), 0.02],
      // the plackart's pointed top edge, raised over the breastplate
      [cone([-0.08, 0.07, 0.07], [0, 0.11, 0.09], 0.004, 0.004), 0.006],
      [cone([0.08, 0.07, 0.07], [0, 0.11, 0.09], 0.004, 0.004), 0.006],
    ]);
    const bands = [(x, y) => y - 0.045, (x, y) => y - 0.205, (x, y) => y + 0.02, (x, y) => y + 0.04, (x, y) => y + 0.0];
    return sculpt(chisel(grooved(f, bands, 0.0022, 0.004), 0.0008, 90), [-0.16, -0.08, -0.12], [0.16, 0.26, 0.12], 58, { keep: 0.4 });
  });
  P.add(spine, g, 0, 0, 0, 0, 0, 0, S3(H));
  // rivets along the plackart's edge and the gorget, a pair at each fauld lame
  const R = [];
  for (let i = 0; i < 7; i++) {
    const t = (i - 3) / 3.4;
    R.push([t * 0.082 * H, (0.075 + (1 - Math.abs(t)) * 0.035) * H, (0.084 - Math.abs(t) * 0.02) * H, [t * 0.5, 0.1, 1]]);
  }
  for (const s of [-1, 1]) for (const y of [-0.01, -0.03, -0.05]) R.push([s * 0.085 * H, y * H, 0.075 * H, [s * 0.6, 0, 1]]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    R.push([Math.sin(a) * 0.05 * H, 0.215 * H, Math.cos(a) * 0.045 * H]);
  }
  rivets(P, spine, R, 0.0045 * H);
}

/**
 * A pauldron over the shoulder joint, its outer side toward [s]: a main plate rolling over
 * the shoulder and two lames below it, each with a rolled edge, riveted front and back.
 */
function pauldronGeos() {
  const C = [0.014, 0.0, 0.0], RX = 0.072, RY = 0.05, RZ = 0.078;
  const geos = [];
  // the lames: [phi from, phi to, scale, drop, theta margin]
  const L = [[-0.75, 1.12, 1.0, 0, 0.32], [0.95, 1.55, 0.975, 0.006, 0.42], [1.38, 1.98, 0.95, 0.012, 0.52]];
  const pt = (th, ph, k, drop) => [C[0] + Math.sin(th) * Math.sin(ph) * RX * k + drop * 0.6, C[1] + Math.sin(th) * Math.cos(ph) * RY * k - drop, C[2] + Math.cos(th) * RZ * k];
  for (const [p0, p1, k, drop, m] of L) {
    // the lower edge flares out a little
    const fn = (u, v) => {
      const th = m + (Math.PI - 2 * m) * u, ph = p0 + (p1 - p0) * v;
      const q = pt(th, ph, k * (1 + 0.06 * v * v), drop);
      return q;
    };
    geos.push(thickSheet(fn, 22, 10, 0.0035, { out: C }));
    // the rolled lower edge
    const edge = [];
    for (let i = 0; i <= 24; i++) edge.push(pt(m + (Math.PI - 2 * m) * (i / 24), p1, k * 1.06 + 0.02, drop));
    geos.push(tube(edge, 0.0028, 26, 5));
  }
  // the rolled edge up the neck side of the main plate, and a raised ridge over the top
  const top = [];
  for (let i = 0; i <= 24; i++) top.push(pt(0.32 + (Math.PI - 0.64) * (i / 24), -0.75, 1.02, 0));
  geos.push(tube(top, 0.0032, 26, 5));
  const ridge = [];
  for (let i = 0; i <= 12; i++) ridge.push(pt(Math.PI / 2, -0.6 + (1.6 * i) / 12, 1.02, 0));
  geos.push(tube(ridge, 0.0026, 16, 5));
  // rivets front and back of each lame
  const riv = [];
  for (const [p0, p1, k, drop, m] of L) for (const th of [m + 0.12, Math.PI - m - 0.12]) {
    const q = pt(th, (p0 + p1) / 2 + 0.1, k * 1.02, drop);
    const n = [q[0] - C[0], q[1] - C[1], q[2] - C[2]];
    riv.push([...q, n]);
  }
  return { geos, riv };
}
export function pauldron(P, sh, H, s) {
  const L = cached('pauldron', pauldronGeos);
  const R = cached('pauldronR', () => L.geos.map(mirrorX));
  for (const g of s > 0 ? L.geos : R) P.add(sh, g, 0, 0, 0, 0, 0, 0, S3(H));
  rivets(P, sh, L.riv.map((q) => [s * q[0] * H, q[1] * H, q[2] * H, [s * q[3][0], q[3][1], q[3][2]]]), 0.004 * H);
}

/**
 * A limb hanging from its joint (pointing -y) in overlapping plates: each lame has a turned
 * edge and a rivet at either side; the joint is a ball. Replaces the parts kit's plateLimb.
 */
export function armLimb(P, parent, len, r1, r2, lames = 3) {
  const core = new THREE.CylinderGeometry(r1 * 0.9, r2 * 0.88, len, 20, 1, true);
  P.add(parent, core, 0, -len / 2, 0);
  const h = len / lames;
  const R = [];
  for (let i = 0; i < lames; i++) {
    const t = i / lames, r = r1 + (r2 - r1) * t;
    P.lathe(parent, [[r * 0.96, 0], [r * 1.06, -h * 0.04], [r * 1.1, -h * 0.14], [r * 1.09, -h * 0.5], [r * 1.11, -h * 0.8], [r * 1.15, -h * 0.9], [r * 1.16, -h * 0.97], [r * 1.12, -h * 1.03], [r * 0.97, -h * 1.06]], -i * h, 30);
    for (const a of [Math.PI / 2, -Math.PI / 2, 0]) R.push([Math.sin(a) * r * 1.1, -i * h - h * 0.5, Math.cos(a) * r * 1.1 * (a === 0 ? 1 : 0)]);
  }
  rivets(P, parent, R, r1 * 0.085);
  P.add(parent, new THREE.SphereGeometry(r1 * 1.02, 18, 12));
}

/** Elbow or knee cop: a domed boss and a fluted, shell-shaped wing on the outer side. */
export function cop(P, parent, r, side, forward = true) {
  const zc = forward ? r * 0.25 : -r * 0.25;
  P.add(parent, new THREE.SphereGeometry(r, 18, 12), 0, 0, zc, 0, 0, 0, [1, 1, 0.9]);
  P.torus(parent, r * 0.92, r * 0.07, 0, 0, zc + (forward ? 1 : -1) * r * 0.35, 0, Math.PI * 2, 32);
  // the wing: a fluted oval shell standing off the outer side
  const g = cached('copwing', () => thickSheet((u, v) => {
    const a = (u - 0.5) * Math.PI * 2, rr = v * (1.3 + 0.25 * Math.cos(2 * a)) * (1 + 0.12 * Math.cos(a));
    const flute = 0.06 * Math.cos(a * 9) * v;
    return [0.75 + 0.35 * rr * rr * 0.5 + flute, Math.cos(a) * rr * 0.95, Math.sin(a) * rr * 1.05];
  }, 36, 6, 0.1, { out: [0, 0, 0] }));
  const m = P.add(parent, side > 0 ? g : cached('copwingR', () => mirrorX(g)), 0, 0, -zc * 0.6, 0, 0, 0, [r, r, r]);
  m.rotation.y = side * (forward ? -0.25 : 0.25);
  rivets(P, parent, [[side * r * 0.95, 0, -zc * 0.6, [side, 0, 0]]], r * 0.14);
}

/**
 * A gauntlet on the wrist joint (the hand hangs along -y, the fingers curl toward +z): a
 * flared cuff in lames, a plated back of the hand with a knuckle ridge, and four fingers and a
 * thumb, each of three plates, curled into a fist.
 */
function gauntletGeos() {
  const u = 0.1;
  const parts = [
    [cone([0, 0.01 * u, 0], [0, -0.34 * u, 0.02 * u], 0.36 * u, 0.3 * u, 1, 0.85)], // cuff
    [cone([0, -0.26 * u, 0.02 * u], [0, -0.36 * u, 0.03 * u], 0.42 * u, 0.33 * u, 1, 0.85), 0.03 * u], // its flared rim
    [cone([0, -0.3 * u, -0.15 * u], [0, 0.0, -0.17 * u], 0.035 * u, 0.02 * u), 0.03 * u], // a ridge down the cuff
    [roundBox(0, -0.62 * u, 0.04 * u, 0.26 * u, 0.24 * u, 0.13 * u, 0.1 * u), 0.06 * u], // back of the hand
    [cone([-0.3 * u, -0.84 * u, 0.1 * u], [0.3 * u, -0.84 * u, 0.1 * u], 0.07 * u, 0.07 * u), 0.04 * u], // knuckles
    [cone([-0.2 * u, -0.64 * u, -0.07 * u], [0.2 * u, -0.64 * u, -0.07 * u], 0.03 * u, 0.03 * u), 0.03 * u], // a plate ridge
  ];
  const bands = [(x, y) => y + 0.12 * u, (x, y) => y + 0.2 * u, (x, y) => y + 0.48 * u, (x, y) => y + 0.74 * u];
  const geos = [sculpt(chisel(grooved(blend(parts), bands, 0.012 * u, 0.018 * u), 0.004 * u, 14 / u), [-0.5 * u, -0.95 * u, -0.4 * u], [0.5 * u, 0.12 * u, 0.4 * u], 40, { keep: 0.3 })];
  // the fingers: three plates each, the last curled in; a knuckle boss on each
  const seg = (a, b, r) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.CapsuleGeometry(r, len, 3, 7);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.applyQuaternion(q);
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    return g;
  };
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.165 * u, k = 1 - Math.abs(i - 1.2) * 0.06;
    const p0 = [x, -0.86 * u, 0.1 * u], p1 = [x * 1.02, -1.03 * u * k, 0.2 * u], p2 = [x * 1.02, -1.04 * u * k, 0.34 * u], p3 = [x, -0.92 * u * k, 0.4 * u];
    geos.push(seg(p0, p1, 0.068 * u), seg(p1, p2, 0.064 * u), seg(p2, p3, 0.058 * u));
    const kb = new THREE.SphereGeometry(0.055 * u, 8, 5);
    kb.translate(x, -0.87 * u, 0.15 * u);
    geos.push(kb);
  }
  geos.push(seg([0.34 * u, -0.5 * u, 0.12 * u], [0.3 * u, -0.66 * u, 0.3 * u], 0.08 * u), seg([0.3 * u, -0.66 * u, 0.3 * u], [0.14 * u, -0.8 * u, 0.4 * u], 0.07 * u)); // thumb (the left hand's, on +x)
  return geos;
}
export function gauntlet(P, wr, H, s) {
  const L = cached('gauntlet', gauntletGeos);
  // the thumb is carved on +x (the left hand's inner side is -x... the kit put the thumb at -side * x)
  const R = cached('gauntletR', () => L.map(mirrorX));
  for (const g of s > 0 ? R : L) P.add(wr, g, 0, 0, 0, 0, 0, 0, S3(H));
}

/** A sabaton on the foot: pointed, in overlapping lames, with an ankle cuff. In units of H. */
export function sabaton(P, parent, H, y) {
  const g = cached('sabaton', () => {
    const w = 0.065, h = 0.04, l = 0.12;
    const f = blend([
      [roundBox(0, 0, 0.3 * l, 0.48 * w, 0.48 * h, 0.42 * l, 0.42 * h)],
      [sphere(0, -0.15 * h, 0.78 * l, 0.42 * w, 1, 0.55, 1.3), 0.25 * h], // the toe, pointed
      [cone([0, -0.25 * h, 0.8 * l], [0, -0.32 * h, 1.15 * l], 0.22 * w, 0.03 * w), 0.2 * h],
      [cone([0, 0.2 * h, 0.0], [0, 1.4 * h, -0.02 * l], 0.52 * w, 0.48 * w), 0.25 * h], // ankle
      [sphere(0, 0.1 * h, -0.08 * l, 0.36 * w, 1, 1, 1.1), 0.2 * h], // heel
    ]);
    const bands = [0.12, 0.27, 0.42, 0.57].map((c) => (x, y, z) => z - c * l + y * 0.6);
    bands.push((x, y) => y - 0.9 * h);
    const cut = (x, y, z) => Math.max(grooved(f, bands, 0.004, 0.003)(x, y, z), -(y + 0.5 * h));
    return sculpt(chisel(cut, 0.0006, 300), [-0.06, -0.03, -0.04], [0.06, 0.07, 0.16], 44, { keep: 0.5 });
  });
  P.add(parent, g, 0, y, 0, 0, 0, 0, S3(H));
}

/** An iron stirrup under the foot (in the shin's frame): an arch, a grooved tread, an eye. */
export function stirrup(P, parent, H, y, z) {
  const arch = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    arch.push([Math.cos(a) * 0.05 * H, y + Math.sin(a) * 0.075 * H - 0.004 * H, z]);
  }
  P.add(parent, tube(arch, 0.005 * H, 32, 8));
  const tr = P.add(parent, new THREE.BoxGeometry(0.1 * H, 0.008 * H, 0.04 * H, 6, 1, 3), 0, y - 0.004 * H, z);
  tr.castShadow = true;
  for (let i = 0; i < 3; i++) P.box(parent, 0.096 * H, 0.003 * H, 0.004 * H, 0, y - 0.0 * H, z + (i - 1) * 0.012 * H);
  P.torus(parent, 0.012 * H, 0.004 * H, 0, y + 0.083 * H, z, 0, Math.PI * 2, 16);
}

/** A helm on the head joint: 'great' (flat-topped, cross, slits and breaths, riveted bands). */
export function helm(P, head, H) {
  const g = cached('helm', () => {
    const f0 = blend([
      [cone([0, -0.02, 0], [0, 0.12, 0], 0.074, 0.07, 1, 1.02)],
      [sphere(0, 0.12, 0, 0.07, 1, 0.45, 1.02), 0.02],
      [cone([0, 0.0, 0.075], [0, 0.11, 0.072], 0.008, 0.008), 0.008], // the cross: upright
      [cone([-0.05, 0.06, 0.072], [0.05, 0.06, 0.072], 0.007, 0.007), 0.008],
    ]);
    // raised bands: over the slits and round the crown
    const band = (x, y, z, yc, r) => Math.max(Math.hypot(x, z * 0.98) - r, Math.abs(y - yc) - 0.005);
    const shape = (x, y, z) => smin(smin(f0(x, y, z), band(x, y, z, 0.104, 0.0755), 0.002), band(x, y, z, 0.0, 0.0775), 0.002);
    const slits = (x, y, z) => z < 0.03 ? 1 : Math.max(Math.abs(y - 0.07) - 0.0055, Math.abs(x) - 0.056, 0.012 - Math.abs(x), -z);
    const breaths = (x, y, z) => {
      if (z < 0.03 || y > 0.045 || y < -0.002) return 1;
      let d = Infinity;
      for (let i = 0; i < 12; i++) {
        const bx = (i % 4) * 0.009 + 0.018, by = 0.03 - Math.floor(i / 4) * 0.012;
        for (const sx of [-1, 1]) d = Math.min(d, Math.hypot(x - sx * bx, y - by) - 0.0028);
      }
      return Math.max(d, -z);
    };
    const deep = (gg) => (x, y, z) => Math.max(gg(x, y, z), -(shape(x, y, z) + 0.008)); // cut 8 mm in, no deeper
    const cut = (x, y, z) => Math.max(shape(x, y, z), -deep(slits)(x, y, z), -deep(breaths)(x, y, z), -(y + 0.019));
    return sculpt(chisel(cut, 0.0006, 120), [-0.1, -0.05, -0.1], [0.1, 0.17, 0.1], 54, { keep: 0.34 });
  });
  P.add(head, g, 0, 0, 0, 0, 0, 0, S3(H));
  const R = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    R.push([Math.sin(a) * 0.0775 * H, 0.104 * H, Math.cos(a) * 0.0775 * H]);
    if (i % 2 === 0) R.push([Math.sin(a + 0.2) * 0.0765 * H, 0.0 * H, Math.cos(a + 0.2) * 0.0765 * H]);
  }
  rivets(P, head, R, 0.0042 * H);
  P.torus(head, 0.0745 * H, 0.0035 * H, 0, -0.012 * H, 0, Math.PI / 2, Math.PI * 2, 48); // the rolled lower edge
}

/** A plume of carved feathers on the helm's top, sweeping back, each with a quill. */
export function plume(P, head, H) {
  const g = cached('plume', () => {
    const parts = [];
    for (let i = 0; i < 17; i++) {
      const a = -0.3 - i * 0.095, l = 0.145 - i * 0.003;
      const x0 = (i % 2 ? 1 : -1) * (0.004 + 0.002 * (i % 3));
      const tip = [x0 * 3.5, 0.16 + Math.cos(a) * l, Math.sin(a) * l];
      const mid = [x0 * 2, 0.16 + Math.cos(a - 0.15) * l * 0.55, Math.sin(a - 0.15) * l * 0.55];
      parts.push(cone([x0, 0.16, -0.0], mid, 0.0095, 0.0085, 1.0, 1));
      parts.push(cone(mid, tip, 0.0085, 0.0015));
    }
    const fe = (x, y, z) => {
      let d = 1;
      for (const q of parts) d = Math.min(d, q(x, y, z));
      return d;
    };
    const f = blend([[sphere(0, 0.16, 0, 0.016)], [fe, 0.006]]);
    // the barbs: fine grooves across the feathers
    const barbs = (x, y, z) => f(x, y, z) + 0.0012 * Math.max(0, Math.sin((y * 0.7 - z * 0.7) * 900));
    return sculpt(chisel(barbs, 0.001, 160), [-0.05, 0.12, -0.18], [0.05, 0.32, 0.06], 50, { keep: 0.45 });
  });
  P.add(head, g, 0, 0, 0, 0, 0, 0, S3(H));
  // the socket that holds it
  P.lathe(head, [[0.012 * H, 0.14 * H], [0.016 * H, 0.15 * H], [0.014 * H, 0.165 * H], [0.01 * H, 0.168 * H]], 0, 18);
}

/** A kettle helm: a ridged dome over a wide, sloping, rolled brim, riveted at the band. */
export function kettle(P, head, H) {
  const g = cached('kettle', () => {
    const dome = blend([
      [sphere(0, 0.075, 0, 0.074, 1, 0.92, 1.02)],
      [cone([0, 0.06, 0.076], [0, 0.15, 0.0], 0.007, 0.009), 0.012], // the comb, front
      [cone([0, 0.15, 0.0], [0, 0.06, -0.076], 0.009, 0.007), 0.012], // and back
      [cone([0.076, 0.06, 0], [0, 0.15, 0.0], 0.004, 0.005), 0.006], // lesser ribs at the sides
      [cone([0, 0.15, 0.0], [-0.076, 0.06, 0], 0.005, 0.004), 0.006],
      [sphere(0, 0.155, 0, 0.012), 0.01], // the finial
    ]);
    // the dome's segments: shallow grooves either side of each rib
    const segs = (x, y, z) => {
      const a = Math.atan2(x, z);
      return dome(x, y, z) + 0.0012 * Math.max(0, Math.cos(a * 8)) * Math.max(0, (y - 0.07) / 0.08);
    };
    const cut = (x, y, z) => Math.max(segs(x, y, z), -(y - 0.06));
    return sculpt(chisel(cut, 0.0005, 150), [-0.09, 0.04, -0.09], [0.09, 0.175, 0.09], 52, { keep: 0.5 });
  });
  P.add(head, g, 0, 0, 0, 0, 0, 0, S3(H));
  // the brim: a sloping ring with a rolled edge
  P.lathe(head, [[0.072 * H, 0.068 * H], [0.1 * H, 0.056 * H], [0.135 * H, 0.04 * H], [0.14 * H, 0.032 * H], [0.135 * H, 0.03 * H], [0.07 * H, 0.06 * H]], 0, 72);
  P.torus(head, 0.138 * H, 0.0045 * H, 0, 0.034 * H, 0, Math.PI / 2, Math.PI * 2, 72);
  P.torus(head, 0.075 * H, 0.004 * H, 0, 0.066 * H, 0, Math.PI / 2, Math.PI * 2, 48); // the band
  const R = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    R.push([Math.sin(a) * 0.077 * H, 0.072 * H, Math.cos(a) * 0.077 * H]);
    R.push([Math.sin(a + 0.2) * 0.118 * H, 0.0495 * H, Math.cos(a + 0.2) * 0.118 * H, [0, 1, 0]]);
  }
  rivets(P, head, R, 0.0035 * H);
}

/**
 * A face under the helm: brow, eyes deep in their sockets with lids, a straight nose with
 * nostrils, cheekbones, a firm mouth, a cleft chin, the jaw and ears; and a mail coif round it.
 */
export function face(P, head, H) {
  const g = cached('face', () => {
    const f = blend([
      [sphere(0, 0.05, -0.004, 0.06, 0.92, 1.08, 1)], // the skull
      [cone([-0.03, 0.074, 0.05], [0.03, 0.074, 0.05], 0.011, 0.011, 1, 0.8), 0.012], // brow
      [cone([0, 0.07, 0.058], [0, 0.04, 0.071], 0.006, 0.009), 0.008], // nose
      [sphere(0, 0.038, 0.068, 0.009, 1.3, 0.8, 1), 0.006], // its tip and wings
      [sphere(0.03, 0.042, 0.047, 0.016, 1, 0.7, 0.7), 0.012], // cheekbones
      [sphere(-0.03, 0.042, 0.047, 0.016, 1, 0.7, 0.7), 0.012],
      [cone([-0.042, 0.03, 0.0], [0, 0.0, 0.05], 0.022, 0.016), 0.02], // the jaw
      [cone([0.042, 0.03, 0.0], [0, 0.0, 0.05], 0.022, 0.016), 0.02],
      [sphere(0, 0.004, 0.056, 0.014, 1.1, 0.9, 0.8), 0.01], // chin
      [sphere(0, 0.024, 0.062, 0.012, 1.4, 0.4, 0.6), 0.006], // the lips
      [sphere(0.022, 0.058, 0.05, 0.0078), 0.003], // the eyeballs
      [sphere(-0.022, 0.058, 0.05, 0.0078), 0.003],
      [cone([0.012, 0.062, 0.056], [0.032, 0.061, 0.052], 0.003, 0.0025), 0.003], // upper lids
      [cone([-0.012, 0.062, 0.056], [-0.032, 0.061, 0.052], 0.003, 0.0025), 0.003],
      [sphere(0.058, 0.05, -0.004, 0.012, 0.5, 1.2, 0.9), 0.006], // ears
      [sphere(-0.058, 0.05, -0.004, 0.012, 0.5, 1.2, 0.9), 0.006],
    ]);
    const cuts = [
      [sphere(0.022, 0.06, 0.06, 0.009, 1.3, 0.8, 0.7), 0.004], // the sockets above and below the eye
      [sphere(-0.022, 0.06, 0.06, 0.009, 1.3, 0.8, 0.7), 0.004],
      [sphere(0.007, 0.036, 0.072, 0.0028), 0.002], // nostrils
      [sphere(-0.007, 0.036, 0.072, 0.0028), 0.002],
      [cone([-0.012, 0.0245, 0.07], [0.012, 0.0245, 0.07], 0.0016, 0.0016), 0.002], // the mouth
      [cone([0, 0.03, 0.068], [0, 0.034, 0.068], 0.0018, 0.0018), 0.002], // the philtrum
      [cone([0.012, 0.045, 0.062], [0.017, 0.028, 0.06], 0.0015, 0.0015), 0.002], // smile lines
      [cone([-0.012, 0.045, 0.062], [-0.017, 0.028, 0.06], 0.0015, 0.0015), 0.002],
    ];
    const ff = (x, y, z) => {
      let d = f(x, y, z);
      for (const [c, k] of cuts) d = smax(d, -c(x, y, z), k);
      return d;
    };
    // keep the eyes: re-add the balls after the socket cut
    const eyes = (x, y, z) => Math.min(ff(x, y, z), sphere(0.022, 0.058, 0.05, 0.0078)(x, y, z), sphere(-0.022, 0.058, 0.05, 0.0078)(x, y, z));
    return sculpt(chisel(eyes, 0.0004, 200), [-0.07, -0.02, -0.02], [0.07, 0.085, 0.085], 46, { keep: 0.45 });
  });
  P.add(head, g, 0, 0, 0, 0, 0, 0, S3(H));
  // the mail coif round the face and over the throat: rings in rows
  const coif = cached('coif', () => thickSheet((u, v) => {
    // an aventail of mail: snug round the head, flaring over the neck to the shoulders in rows
    // of rings, its lower edge scalloped
    const a = -2.35 + 4.7 * u, y = 0.075 - 0.13 * v - 0.006 * Math.abs(Math.sin(a * 9)) * v * v;
    const rows = 0.0013 * Math.abs(Math.sin(v * Math.PI * 13));
    const r = 0.066 + 0.006 * v + 0.05 * Math.max(0, v - 0.55) ** 2 * 4 - rows;
    return [Math.sin(a) * r, y, Math.cos(a) * r * 0.98 - 0.004];
  }, 48, 26, 0.004, { out: [0, 0.03, 0] }));
  P.add(head, coif, 0, 0, 0, 0, Math.PI, 0, S3(H));
}

/** The kite shield, its face toward the forearm's -y, the point down; rim, cross, boss, rivets. */
export function kite(P, parent, w, h) {
  const outline = (t) => {
    // the kite's outline, t in [0, 1) round from the top centre
    const sh = new THREE.Shape();
    sh.moveTo(0, h * 0.42);
    sh.quadraticCurveTo(w * 0.52, h * 0.44, w * 0.5, h * 0.18);
    sh.quadraticCurveTo(w * 0.42, -h * 0.25, 0, -h * 0.58);
    sh.quadraticCurveTo(-w * 0.42, -h * 0.25, -w * 0.5, h * 0.18);
    sh.quadraticCurveTo(-w * 0.52, h * 0.44, 0, h * 0.42);
    return sh;
  };
  const sh = outline();
  const D = w * 0.06, BT = w * 0.03;
  const g = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: true, bevelThickness: BT, bevelSize: w * 0.04, bevelSegments: 3, curveSegments: 20 });
  const dish = (x) => ((x / w) ** 2) * w * 0.35;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - dish(p.getX(i)));
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2);
  P.add(parent, g);
  const face = -(D + BT); // the front, at x = 0 (y grows by the dish toward the edges)
  const at = (x, z, lift) => [x, face + dish(x) - lift, z];
  // the rim: a raised band just inside the edge
  const pts = sh.getSpacedPoints(90).slice(0, -1).map((q) => at(q.x * 0.9, q.y * 0.9, w * 0.012));
  // (the shape's y is the shield's -z after the turn)
  P.add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), true), 110, w * 0.022, 5, true));
  // the cross, following the dish, bevelled
  const bar = (x0, x1, z0, z1) => thickSheet((u, v) => {
    const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
    const e = Math.min(u, 1 - u, v, 1 - v);
    return at(x, z, w * (0.012 + 0.03 * Math.min(1, e * 12)));
  }, Math.max(4, Math.round(Math.abs(x1 - x0) / w * 30)), Math.max(4, Math.round(Math.abs(z1 - z0) / w * 30)), w * 0.04, { out: [0, 0, 0] });
  P.add(parent, bar(-w * 0.05, w * 0.05, -h * 0.4, h * 0.42));
  P.add(parent, bar(-w * 0.32, w * 0.32, h * 0.065, h * 0.16));
  // the boss, and rivets round the rim
  P.add(parent, new THREE.SphereGeometry(w * 0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, face - w * 0.04, h * 0.112, Math.PI, 0, 0, [1, 0.7, 1]);
  P.torus(parent, w * 0.075, w * 0.012, 0, face - w * 0.04, h * 0.112, Math.PI / 2, Math.PI * 2, 24);
  const R = [];
  const rp = sh.getSpacedPoints(24).slice(0, -1);
  for (const q of rp) R.push([...at(q.x * 0.8, q.y * 0.8, w * 0.012), [0, -1, 0]]);
  rivets(P, parent, R, w * 0.018);
}

/** A flanged mace in the hand (the head hangs toward -y); its striking point is [tip]. */
export function mace(P, parent, H) {
  const m = new THREE.Group();
  m.name = 'weapon';
  parent.add(m);
  // the haft: a pommel knob, a wrapped grip between ferrules, a collar under the head
  P.lathe(m, [[0.0, 0.075 * H], [0.012 * H, 0.072 * H], [0.017 * H, 0.062 * H], [0.014 * H, 0.052 * H], [0.016 * H, 0.046 * H], [0.013 * H, 0.04 * H], [0.012 * H, -0.06 * H], [0.014 * H, -0.065 * H], [0.012 * H, -0.075 * H], [0.0115 * H, -0.2 * H], [0.016 * H, -0.205 * H], [0.017 * H, -0.212 * H], [0.013 * H, -0.218 * H]], 0, 22);
  const hx = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80, a = t * Math.PI * 2 * 9;
    hx.push([Math.cos(a) * 0.0128 * H, 0.038 * H - t * 0.096 * H, Math.sin(a) * 0.0128 * H]);
  }
  P.add(m, tube(hx, 0.0022 * H, 150, 4));
  // the head: an ogival core with seven pointed flanges
  P.lathe(m, [[0.012 * H, -0.212 * H], [0.024 * H, -0.23 * H], [0.03 * H, -0.27 * H], [0.024 * H, -0.305 * H], [0.012 * H, -0.32 * H]], 0, 28);
  const fs = new THREE.Shape();
  const r0 = 0.018 * H;
  fs.moveTo(r0, -0.215 * H);
  fs.quadraticCurveTo(0.03 * H, -0.222 * H, 0.05 * H, -0.255 * H);
  fs.lineTo(0.053 * H, -0.268 * H);
  fs.quadraticCurveTo(0.044 * H, -0.278 * H, 0.046 * H, -0.29 * H);
  fs.quadraticCurveTo(0.036 * H, -0.31 * H, r0, -0.318 * H);
  fs.lineTo(r0, -0.215 * H);
  const hole = new THREE.Path();
  hole.absarc(0.032 * H, -0.262 * H, 0.0055 * H, 0, Math.PI * 2, true);
  fs.holes.push(hole);
  const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.004 * H, bevelEnabled: true, bevelThickness: 0.0015 * H, bevelSize: 0.0015 * H, bevelSegments: 1, curveSegments: 6 });
  fg.translate(0, 0, -0.002 * H);
  for (let i = 0; i < 7; i++) P.add(m, fg, 0, 0, 0, 0, (i / 7) * Math.PI * 2, 0);
  P.add(m, new THREE.ConeGeometry(0.012 * H, 0.04 * H, 14), 0, -0.335 * H, 0, Math.PI, 0, 0); // the spike
  P.torus(m, 0.016 * H, 0.003 * H, 0, -0.316 * H, 0, Math.PI / 2, Math.PI * 2, 20);
  m.userData.tip = [0, -0.27 * H, 0];
  return m;
}

/** A sword in the hand (the blade toward -y): wheel pommel, wrapped grip, quillons, fullered blade. */
export function sword(P, parent, H, len = 0.55) {
  const g = new THREE.Group();
  g.name = 'weapon';
  parent.add(g);
  // the wheel pommel, its face toward z
  const wheel = new THREE.LatheGeometry([[0, -0.0075], [0.016, -0.0075], [0.022, -0.0045], [0.024, 0], [0.022, 0.0045], [0.016, 0.0075], [0, 0.0075]].map(([r, y]) => new THREE.Vector2(r * H, y * H)), 32);
  P.add(g, wheel, 0, 0.064 * H, 0, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) P.add(g, new THREE.SphereGeometry(0.009 * H, 14, 8), 0, 0.064 * H, s * 0.0072 * H, 0, 0, 0, [1, 1, 0.45]);
  P.cyl(g, 0.007 * H, 0.009 * H, 0.012 * H, 0, 0.05 * H, 0, 0, 0, 0, 14); // tang button
  // the grip, swelling a little, bound with a spiral cord between two ferrules
  P.lathe(g, [[0.0105 * H, 0.046 * H], [0.0125 * H, 0.0 * H], [0.0105 * H, -0.044 * H]], 0, 20);
  const hx = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, a = t * Math.PI * 2 * 7, r = (0.0105 + 0.002 * Math.sin(t * Math.PI)) * H;
    hx.push([Math.cos(a) * r, 0.04 * H - t * 0.08 * H, Math.sin(a) * r]);
  }
  P.add(g, tube(hx, 0.0022 * H, 200, 5));
  for (const y of [0.044, -0.044]) P.torus(g, 0.0118 * H, 0.0026 * H, 0, y * H, 0, Math.PI / 2, Math.PI * 2, 20);
  // the cross-guard: a bar flaring to its ends, which turn toward the hand and end in knobs
  const rings = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24 * 2 - 1, x = t * 0.09 * H, bend = t * t * 0.012 * H;
    const hw = (0.007 + 0.004 * Math.abs(t)) * H, hd = (0.009 - 0.002 * Math.abs(t)) * H;
    const ring = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ring.push([x, -0.052 * H + bend + Math.sin(a) * hw, Math.cos(a) * hd]);
    }
    rings.push(ring);
  }
  P.add(g, loft(rings));
  for (const s of [-1, 1]) P.add(g, new THREE.SphereGeometry(0.011 * H, 14, 10), s * 0.092 * H, -0.04 * H, 0, 0, 0, 0, [0.9, 1.1, 0.9]);
  P.add(g, new THREE.SphereGeometry(0.014 * H, 14, 10), 0, -0.052 * H, 0, 0, 0, 0, [1, 1.1, 1.05]); // the centre block
  // the blade: lens-shaped, a fuller down two thirds of it, a ricasso and the point
  const L = len * H, bw = 0.032 * H, bt = 0.0085 * H, y0 = -0.056 * H;
  const M = 9; // points across each face
  const blade = [];
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = (t < 0.82 ? bw / 2 * (1 - 0.16 * t / 0.82) : bw / 2 * 0.84 * Math.sqrt(Math.max(0, (1 - t) / 0.18))) + 1e-5;
    const th = bt / 2 * (0.4 + 0.6 * Math.min(1, w / (bw / 2)));
    const fuller = t > 0.05 && t < 0.68 ? Math.min(1, (t - 0.05) / 0.04, (0.68 - t) / 0.06) : 0;
    const ring = [];
    const face = (x, sgn) => {
      const q = Math.abs(x) / w;
      let z = th * Math.pow(Math.max(0, 1 - q * q), 0.6);
      z -= fuller * th * 0.55 * Math.exp(-((q / 0.28) ** 2));
      return z * sgn;
    };
    for (let k = 0; k <= M; k++) { const x = -w + (2 * w * k) / M; ring.push([x, y0 - t * L, face(x, 1)]); }
    for (let k = M - 1; k >= 1; k--) { const x = -w + (2 * w * k) / M; ring.push([x, y0 - t * L, face(x, -1)]); }
    blade.push(ring);
  }
  P.add(g, loft(blade));
  g.userData.tip = [0, y0 - L * 0.9, 0];
  return g;
}

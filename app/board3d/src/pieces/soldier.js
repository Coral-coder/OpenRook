// The rook's soldier and the knight's rider (armoured torso and arms), and the knight's war horse.
import * as THREE from 'three';
import { V2, carve, drape, joint } from '../carving.js';
import { blend, chisel, cone, roundBox, sculpt, smin, sphere } from './kr_sculpt.js';
import { gauntlet, pauldron, torso } from './kr_armour.js';

// the armoured torso and arms of the rook's soldier and the knight's rider
export function soldierTop(J, P, H) {
  torso(P, J.spine, H);
  P.belt(J.spine, 0.1 * H, 0.0);
  P.cyl(J.neck, 0.034 * H, 0.04 * H, 0.06 * H, 0, 0, 0);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    P.plateLimb(J['sh' + side], 0.17 * H, 0.05 * H, 0.04 * H, 3);
    pauldron(P, J['sh' + side], H, s);
    P.plateLimb(J['el' + side], 0.15 * H, 0.04 * H, 0.033 * H, 3);
    P.cop(J['el' + side], 0.038 * H, s, false);
    gauntlet(P, J['wr' + side], H, s);
  }
}

// ----------------------------------------------------------------- the war horse
// Sculpted as continuous forms (kr_sculpt.js): one muscled body from chest to haunch, a crested
// neck with a carved mane, a head with cheek, jaw, muzzle, nostrils, eyes and ears, legs with
// knees, hocks, tendons and fetlocks on carved hooves, a flowing tail; then the tack.
const K = 0.035; // how softly the masses melt into each other

// a thin raised line (vein, tendon) or groove (rib, crease) along a polyline of points
function line(pts, r0, r1 = r0) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
    segs.push(cone(pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1));
  }
  return (x, y, z) => {
    let d = Infinity;
    for (const f of segs) d = Math.min(d, f(x, y, z));
    return d;
  };
}
const mirror = (f) => (x, y, z) => f(Math.abs(x), y, z); // every mirrored part sits on +x
// a plane cut: keep where (n . p) <= d
const keepBelow = (nx, ny, nz, d) => (x, y, z) => nx * x + ny * y + nz * z - d;

export function horse(J, root, P) {
  const hs = joint(J, 'horse', root, 0, 0.3, -0.1, [-0.8, 0, 0]); // pivot on the hind quarters, reared
  const mk = (sdf, min, max, res, parent, amp = 0.0012, freq = 60) => P.add(parent, sculpt(chisel(sdf, amp, freq), min, max, res));

  // ---- body: in the horse's frame, nose toward +z, back toward +y
  const body = blend([
    [cone([0, -0.005, 0.02], [0, 0.0, 0.33], 0.125, 0.13, 0.78, 1)], // barrel
    [sphere(0, -0.03, 0.18, 0.125, 0.8, 0.9, 1.25), 0.06], // belly
    [sphere(0, 0.04, -0.02, 0.125, 0.92, 0.95, 0.95), K], // rump
    [mirror(sphere(0.07, 0.02, -0.0, 0.105, 0.62, 1.0, 1.0)), K], // haunches
    [mirror(sphere(0.06, 0.06, -0.06, 0.06, 0.6, 0.8, 1.2)), 0.03], // the muscle over the croup
    [mirror(sphere(0.075, -0.07, 0.02, 0.07, 0.6, 1.2, 1.0)), K], // stifles, where the hind legs join
    [sphere(0, 0.0, 0.37, 0.125, 0.82, 1.0, 0.9), K], // chest
    [mirror(sphere(0.045, -0.02, 0.44, 0.06, 0.8, 1.1, 0.75)), 0.025], // the two pectorals
    [mirror(sphere(0.07, 0.03, 0.35, 0.085, 0.6, 1.15, 0.9)), K], // shoulders
    [mirror(cone([0.07, 0.13, 0.31], [0.088, -0.02, 0.42], 0.03, 0.022, 0.7, 1)), 0.02], // shoulder blades
    [mirror(sphere(0.07, -0.05, 0.31, 0.05, 0.6, 1.2, 0.9)), 0.025], // triceps, behind the elbow
    [mirror(sphere(0.06, -0.06, 0.4, 0.06, 0.8, 1.0, 1.0)), K], // forearm roots
    [cone([0, 0.08, 0.28], [0, 0.13, 0.42], 0.06, 0.07, 0.6, 1), K], // withers
    [cone([0, 0.06, 0.38], [0, 0.17, 0.47], 0.1, 0.075, 0.78, 1), 0.05], // neck root
    [cone([0, 0.07, -0.08], [0, 0.04, -0.14], 0.06, 0.035), K], // dock of the tail
    // veins over the belly and shoulder, raised
    [mirror(line([[0.09, -0.085, 0.06], [0.094, -0.07, 0.14], [0.088, -0.08, 0.22], [0.084, -0.06, 0.3]], 0.0035, 0.0025)), 0.006],
    [mirror(line([[0.098, -0.02, 0.33], [0.1, -0.05, 0.37], [0.09, -0.08, 0.4]], 0.003, 0.002)), 0.005],
    // the ribs and the flank crease, cut in shallow
    ...[0.12, 0.16, 0.2, 0.24].map((z) => [mirror(line([[0.104, 0.05, z - 0.01], [0.106, -0.01, z + 0.005], [0.096, -0.07, z + 0.02]], 0.004)), 0.006, 'cut']),
    [mirror(line([[0.1, 0.04, 0.04], [0.106, -0.02, 0.06], [0.096, -0.08, 0.08]], 0.005)), 0.008, 'cut'],
    [line([[0, -0.11, 0.41], [0, -0.04, 0.46]], 0.006), 0.008, 'cut'], // the groove between the pectorals
  ]);
  mk(body, [-0.16, -0.2, -0.2], [0.16, 0.28, 0.56], 72, hs, 0.0014, 55);

  // a saddle with pommel and cantle and seams, over a cloth with a scalloped edge
  const saddle = blend([
    [roundBox(0, 0.125, 0.15, 0.085, 0.022, 0.11, 0.02)],
    [cone([0, 0.13, 0.26], [0, 0.18, 0.27], 0.03, 0.025), 0.02], // pommel
    [cone([-0.07, 0.15, 0.05], [0.07, 0.15, 0.05], 0.028, 0.028), 0.03], // cantle
    [mirror(roundBox(0.09, 0.105, 0.16, 0.012, 0.03, 0.06, 0.01)), 0.015], // flaps
    [roundBox(0, 0.125, 0.15, 0.06, 0.03, 0.002, 0.001), 0.003, 'cut'], // the seat's seam
    [mirror(line([[0.075, 0.14, 0.07], [0.08, 0.135, 0.15], [0.075, 0.14, 0.24]], 0.0025)), 0.003, 'cut'],
  ]);
  mk(saddle, [-0.17, 0.06, -0.03], [0.17, 0.22, 0.33], 44, hs, 0.001, 90);
  const cloth = (x, y, z) => {
    // a draped cloth following the barrel down each side, its hem scalloped
    const r = Math.hypot(x / 0.78, y + 0.0) - 0.137;
    const shell = Math.abs(r) - 0.004;
    const hem = -y - 0.035 - 0.012 * Math.cos((z - 0.15) * 70);
    return Math.max(shell, hem, Math.abs(z - 0.15) - 0.13, -y - 0.09);
  };
  mk(cloth, [-0.17, -0.12, 0.0], [0.17, 0.16, 0.3], 52, hs, 0.0006, 140);
  // the girth under the barrel, and a breastplate across the chest with a medallion
  const loop = (fn, n, r, closed = true) => {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(fn(i / (closed ? n : n - 1)));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), n * 2, r, 6, closed);
  };
  P.add(hs, loop((t) => new THREE.Vector3(0.106 * Math.cos(t * Math.PI * 2), -0.008 + 0.128 * Math.sin(t * Math.PI * 2), 0.26), 24, 0.006));
  P.add(hs, loop((t) => {
    const a = Math.PI * (0.15 + 0.7 * t);
    return new THREE.Vector3(-Math.cos(a) * 0.11, -0.02 + Math.sin(a) * -0.07 + 0.07, 0.4 + Math.sin(a) * 0.075);
  }, 14, 0.005, false));
  P.cyl(hs, 0.018, 0.018, 0.006, 0, -0.045, 0.485, Math.PI / 2 - 0.3, 0, 0, 18); // medallion
  P.sphere(hs, 0.008, 0, -0.045, 0.49, [1, 1, 0.6], 10);

  // ---- hind legs: gaskin, hock, cannon, fetlock, hoof; on the root, planted
  const hoofSdf = (y0, z0) => (x, y, z) => {
    // a hoof: a truncated cone flaring to a flat sole, with a coronet band at the top
    const c = cone([0, y0, z0], [0, y0 - 0.032, z0 + 0.006], 0.022, 0.033, 1, 1.05)(x, y, z);
    const sole = y - (y0 - 0.034);
    return smin(Math.max(c, -sole), sphere(0, y0 - 0.002, z0, 0.026, 1, 0.35, 1.05)(x, y, z), 0.006);
  };
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hip = joint(J, 'hh' + side, root, s * 0.085, 0.31, -0.12, [0.3, 0, 0]);
    const gaskin = blend([
      [cone([0, 0.02, 0.0], [0, -0.17, -0.01], 0.07, 0.034, 0.75, 1)],
      [sphere(0, -0.07, -0.025, 0.05, 0.7, 1.4, 0.9), 0.03], // the muscle behind
      [sphere(0, -0.02, 0.025, 0.04, 0.7, 1.4, 0.9), 0.03], // and in front
      [line([[s * 0.02, -0.02, 0.03], [s * 0.022, -0.1, 0.02], [s * 0.018, -0.16, 0.012]], 0.0025), 0.004], // a vein
    ]);
    mk(gaskin, [-0.08, -0.2, -0.09], [0.08, 0.09, 0.08], 34, hip);
    const hock = joint(J, 'hk' + side, hip, 0, -0.17, 0, [-0.75, 0, 0]);
    const lower = blend([
      [sphere(0, 0, -0.008, 0.036, 0.8, 1.0, 1.2)], // hock joint
      [sphere(0, 0.01, -0.04, 0.02), 0.02], // point of hock
      [cone([0, 0, 0], [0, -0.105, 0.0], 0.026, 0.021, 0.8, 1), 0.015], // cannon
      [cone([0, -0.01, -0.02], [0, -0.1, -0.017], 0.009, 0.008), 0.008], // the tendon behind
      [sphere(0, -0.112, 0.006, 0.028, 0.85, 1, 1.1), 0.015], // fetlock
      [cone([0, -0.115, -0.022], [0, -0.135, -0.03], 0.008, 0.003), 0.006], // ergot
      [cone([0, -0.115, 0.01], [0, -0.13, 0.02], 0.022, 0.025), 0.01], // pastern
      [hoofSdf(-0.128, 0.02), 0.006],
    ]);
    mk(lower, [-0.05, -0.17, -0.07], [0.05, 0.05, 0.07], 38, hock, 0.0012, 100);
  }
  // ---- forelegs, raised and pawing
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = joint(J, 'fl' + side, hs, s * 0.08, -0.03, 0.38, [-0.4, 0, 0]);
    const fore = blend([
      [cone([0, 0.03, 0], [0, -0.16, 0.0], 0.055, 0.03, 0.8, 1)],
      [sphere(0, -0.04, 0.02, 0.045, 0.8, 1.5, 0.9), 0.03], // forearm muscle
      [sphere(-s * 0.03, -0.11, -0.004, 0.009, 0.6, 1.4, 1), 0.006], // chestnut
      [line([[-s * 0.03, 0.0, 0.02], [-s * 0.034, -0.08, 0.01], [-s * 0.026, -0.15, 0.006]], 0.0025), 0.004], // a vein
    ]);
    mk(fore, [-0.07, -0.19, -0.07], [0.07, 0.09, 0.08], 34, sh);
    const kn = joint(J, 'fk' + side, sh, 0, -0.16, 0, [1.5, 0, 0]);
    const lowerF = blend([
      [sphere(0, 0, 0, 0.034, 0.85, 1.0, 1.0)], // knee
      [cone([0, 0, 0], [0, -0.115, 0], 0.025, 0.02, 0.8, 1), 0.015],
      [cone([0, -0.01, -0.019], [0, -0.11, -0.016], 0.009, 0.008), 0.008], // tendon
      [sphere(0, -0.123, 0.004, 0.027, 0.85, 1, 1.1), 0.015],
      [cone([0, -0.125, -0.022], [0, -0.145, -0.03], 0.008, 0.003), 0.006], // ergot
      [cone([0, -0.125, 0.006], [0, -0.14, 0.014], 0.021, 0.024), 0.01],
      [hoofSdf(-0.138, 0.014), 0.006],
    ]);
    mk(lowerF, [-0.05, -0.18, -0.06], [0.05, 0.05, 0.06], 38, kn, 0.0012, 100);
  }

  // ---- the neck: arched, with a crest and a carved, wind-blown mane (neck frame: +y up the neck, +z its front)
  const neck = joint(J, 'hneck', hs, 0, 0.08, 0.4, [0.75, 0, 0]);
  const neckParts = [
    [cone([0, -0.02, 0.01], [0, 0.27, 0.0], 0.085, 0.045, 0.55, 1.15)], // deep, narrow, tapering
    [cone([0, 0.0, -0.05], [0, 0.25, -0.035], 0.04, 0.028, 0.6, 1), 0.05], // the crest
    [cone([0, 0.02, 0.06], [0, 0.22, 0.04], 0.025, 0.018, 0.8, 1), 0.04], // the throat's line
    [mirror(cone([0.025, 0.0, 0.03], [0.022, 0.24, 0.028], 0.022, 0.014, 0.8, 1)), 0.03], // muscles down the neck
    [mirror(line([[0.032, 0.02, 0.05], [0.03, 0.12, 0.045], [0.026, 0.22, 0.035]], 0.005)), 0.006, 'cut'], // the jugular groove
    [mirror(line([[0.036, 0.04, 0.035], [0.034, 0.1, 0.04], [0.03, 0.17, 0.033]], 0.0025)), 0.004], // a vein beside it
  ];
  // the mane: two rows of locks along the crest, each in an S, swept back and to the side
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 15; i++) {
      const y = -0.01 + i * 0.019 + row * 0.009, sd = (i + row) % 2 ? 1 : -1;
      const w = Math.sin(i * 1.7 + row) * 0.012;
      const a = [sd * 0.006, y, -0.058], b = [sd * (0.026 + row * 0.01), y - 0.03, -0.08 + w], c2 = [sd * (0.045 + row * 0.012), y - 0.06, -0.095 - w];
      neckParts.push([line([a, b, c2], 0.011 - row * 0.002, 0.003), 0.008]);
    }
  }
  mk(blend(neckParts), [-0.11, -0.12, -0.16], [0.11, 0.32, 0.13], 60, neck, 0.0016, 80);

  // ---- the head (head frame: +y toward the muzzle, +z the forehead/face side, -z the jaw)
  const hd0 = joint(J, 'hhead', neck, 0, 0.27, 0.0, [1.75, 0, 0]);
  // the carving sits tucked a little down, the way a rearing horse carries its head
  const hd = new THREE.Group();
  hd.rotation.x = 0.55;
  hd0.add(hd);
  const headParts = [
    [sphere(0, 0.0, 0.01, 0.062, 0.8, 1.0, 0.85)], // cranium, flat on top
    [cone([0, 0.02, 0.025], [0, 0.26, 0.012], 0.05, 0.036, 0.72, 0.95), 0.03], // the long, straight face
    [sphere(0, 0.06, -0.05, 0.068, 0.62, 0.95, 0.72), 0.04], // the great round jowl
    [cone([0, 0.07, -0.07], [0, 0.22, -0.03], 0.03, 0.022, 0.7, 1), 0.04], // the lower jaw line
    [sphere(0, 0.27, -0.004, 0.046, 0.86, 0.75, 0.95), 0.025], // a blunt muzzle
    [sphere(0, 0.272, -0.042, 0.028, 0.78, 0.8, 0.8), 0.02], // chin
    [sphere(0, 0.29, -0.02, 0.03, 0.95, 0.5, 0.6), 0.012], // the upper lip
    [mirror(sphere(0.048, 0.04, 0.03, 0.02, 1, 1.3, 1)), 0.012], // eye sockets and lids
    [mirror(line([[0.046, 0.022, 0.044], [0.054, 0.04, 0.046], [0.05, 0.06, 0.04]], 0.005, 0.003)), 0.006], // the upper lids
    [mirror(line([[0.04, 0.08, 0.04], [0.046, 0.13, 0.02], [0.042, 0.18, 0.0]], 0.0025, 0.0015)), 0.004], // face veins
    [mirror(cone([0.03, -0.03, 0.045], [0.04, -0.06, 0.125], 0.019, 0.005, 0.6, 1)), 0.012], // ears, pricked
    [mirror(sphere(0.036, -0.04, 0.082, 0.007, 0.5, 1.0, 2.2)), 0.003, 'cut'], // their hollows, on the front face only
    [mirror(sphere(0.032, 0.292, 0.02, 0.019, 1, 1.4, 1)), 0.006], // flared nostril rims
    [mirror(sphere(0.028, 0.298, 0.016, 0.014, 1, 1.4, 1)), 0.006, 'cut'], // nostrils
    [cone([-0.034, 0.3, -0.026], [0.034, 0.3, -0.026], 0.005, 0.005), 0.005, 'cut'], // the mouth line
    [cone([-0.02, 0.272, -0.06], [0.02, 0.272, -0.06], 0.004, 0.004), 0.005, 'cut'], // the chin groove
    [cone([0, 0.05, 0.05], [0, 0.22, 0.042], 0.012, 0.009), 0.02], // the bridge of the nose
    [mirror(sphere(0.04, 0.13, 0.0, 0.02, 1.0, 2.4, 1.1)), 0.03], // the facial crest
  ];
  for (let i = 0; i < 6; i++) headParts.push([line([[(i - 2.5) * 0.009, -0.03, 0.06], [(i - 2.5) * 0.013, 0.02, 0.085], [(i - 2.5) * 0.016, 0.06, 0.078]], 0.008, 0.003), 0.008]); // forelock
  const headSdf = blend(headParts);
  mk((x, y, z) => headSdf(x, y, -z), [-0.09, -0.14, -0.12], [0.09, 0.34, 0.12], 68, hd, 0.0009, 110);
  for (const s of [-1, 1]) {
    P.sphere(hd, 0.011, s * 0.05, 0.042, -0.034, [0.5, 1, 1], 14); // the eyeballs
    P.sphere(hd, 0.0035, s * 0.054, 0.04, -0.04, null, 8); // a glint carved as a pupil
  }
  // the bridle: crown piece, browband, cheek straps with buckles, noseband, throatlatch, bit, reins
  const strap = (pts, r) => P.add(hd, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], -q[2])), pts.length > 3), 32, r, 8, pts.length > 3));
  strap([[0.04, 0.215, 0.0], [0.0, 0.215, 0.05], [-0.04, 0.215, 0.0], [0.0, 0.21, -0.05]], 0.0045); // noseband
  strap([[0.048, 0.0, 0.035], [0.0, -0.005, 0.062], [-0.048, 0.0, 0.035]], 0.0045); // browband
  strap([[0.05, -0.02, 0.02], [0.03, 0.02, -0.07], [-0.03, 0.02, -0.07], [-0.05, -0.02, 0.02]], 0.004); // throatlatch
  for (const s of [-1, 1]) {
    strap([[s * 0.046, -0.02, 0.03], [s * 0.05, 0.08, 0.0], [s * 0.04, 0.21, -0.005], [s * 0.036, 0.28, -0.03]], 0.0042); // cheek strap to the bit
    const bk = P.box(hd, 0.004, 0.016, 0.012, s * 0.05, 0.12, 0.004); // its buckle
    bk.rotation.z = s * 0.05;
    P.box(hd, 0.002, 0.004, 0.012, s * 0.053, 0.12, 0.004);
    P.torus(hd, 0.012, 0.0032, s * 0.038, 0.285, 0.032, 0, Math.PI * 2, 16).rotation.y = Math.PI / 2; // bit rings
    // the reins falling from the bit in a loop under the jaw
    strap([[s * 0.038, 0.285, -0.032], [s * 0.05, 0.2, -0.085], [s * 0.04, 0.09, -0.11], [s * 0.025, -0.01, -0.105]], 0.0035);
  }

  // ---- the tail: a fall of carved strands, swept to one side
  const tail = joint(J, 'tail', hs, 0, 0.05, -0.1, [1.25, 0, 0]);
  const tailParts = [[cone([0, 0.02, 0], [0, -0.08, 0.01], 0.032, 0.03)]];
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const x0 = Math.cos(a) * 0.018, z0 = Math.sin(a) * 0.018;
    const w = Math.sin(i * 2.1) * 0.03, v = Math.cos(i * 1.3) * 0.03;
    tailParts.push([line([[x0, -0.06, z0], [x0 * 1.5 + w, -0.16, z0 * 1.5 - 0.015], [x0 * 1.9 - w * 0.5 + 0.02, -0.26, z0 * 1.8 + v], [x0 * 2.2 + w + 0.03, -0.35 - 0.03 * (i % 3), z0 * 2 + 0.03]], 0.012, 0.003), 0.012]);
  }
  mk(blend(tailParts), [-0.1, -0.42, -0.1], [0.1, 0.06, 0.1], 50, tail, 0.0018, 90);
}

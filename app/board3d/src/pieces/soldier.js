// The rook's soldier and the knight's rider (armoured torso and arms), and the knight's war horse.
import * as THREE from 'three';
import { V2, carve, drape, joint } from '../carving.js';
import { blend, chisel, cone, roundBox, sculpt, sphere } from './kr_sculpt.js';
import { pauldron, torso } from './kr_armour.js';

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
    P.gauntlet(J['wr' + side], 0.1 * H, s);
  }
}

// ----------------------------------------------------------------- the war horse
// Sculpted as continuous forms (kr_sculpt.js): one muscled body from chest to haunch, a crested
// neck with a carved mane, a head with cheek, jaw, muzzle, nostrils, eyes and ears, legs with
// knees, hocks and fetlocks, a flowing tail; then the tack.
const K = 0.035; // how softly the masses melt into each other

export function horse(J, root, P) {
  const hs = joint(J, 'horse', root, 0, 0.3, -0.1, [-0.8, 0, 0]); // pivot on the hind quarters, reared
  const mk = (sdf, min, max, res, parent, amp = 0.0012, freq = 60) => P.add(parent, sculpt(chisel(sdf, amp, freq), min, max, res));

  // ---- body: in the horse's frame, nose toward +z, back toward +y
  const body = blend([
    [cone([0, -0.005, 0.02], [0, 0.0, 0.33], 0.125, 0.13, 0.78, 1)], // barrel
    [sphere(0, -0.03, 0.18, 0.125, 0.8, 0.9, 1.25), 0.06], // belly
    [sphere(0, 0.04, -0.02, 0.125, 0.92, 0.95, 0.95), K], // rump
    [sphere(0.07, 0.02, -0.0, 0.105, 0.62, 1.0, 1.0), K], // haunches
    [sphere(-0.07, 0.02, -0.0, 0.105, 0.62, 1.0, 1.0), K],
    [sphere(0.075, -0.07, 0.02, 0.07, 0.6, 1.2, 1.0), K], // stifles, where the hind legs join
    [sphere(-0.075, -0.07, 0.02, 0.07, 0.6, 1.2, 1.0), K],
    [sphere(0, 0.0, 0.37, 0.125, 0.82, 1.0, 0.9), K], // chest
    [sphere(0.07, 0.03, 0.35, 0.085, 0.6, 1.15, 0.9), K], // shoulders
    [sphere(-0.07, 0.03, 0.35, 0.085, 0.6, 1.15, 0.9), K],
    [sphere(0.06, -0.06, 0.4, 0.06, 0.8, 1.0, 1.0), K], // forearm roots
    [sphere(-0.06, -0.06, 0.4, 0.06, 0.8, 1.0, 1.0), K],
    [cone([0, 0.08, 0.28], [0, 0.13, 0.42], 0.06, 0.07, 0.6, 1), K], // withers
    [cone([0, 0.06, 0.38], [0, 0.17, 0.47], 0.1, 0.075, 0.78, 1), 0.05], // neck root
    [cone([0, 0.07, -0.08], [0, 0.04, -0.14], 0.06, 0.035), K], // dock of the tail
  ]);
  mk(body, [-0.16, -0.2, -0.2], [0.16, 0.28, 0.56], 40, hs, 0.0018, 40);

  // a saddle with pommel and cantle, its blanket and girth; a breastplate strap
  const saddle = blend([
    [roundBox(0, 0.125, 0.15, 0.085, 0.022, 0.11, 0.02)],
    [cone([0, 0.13, 0.26], [0, 0.18, 0.27], 0.03, 0.025), 0.02], // pommel
    [cone([-0.07, 0.15, 0.05], [0.07, 0.15, 0.05], 0.028, 0.028), 0.03], // cantle
    [roundBox(0, 0.1, 0.15, 0.13, 0.008, 0.15, 0.006), 0.01], // blanket
  ]);
  mk(saddle, [-0.17, 0.06, -0.03], [0.17, 0.22, 0.33], 30, hs, 0.0015, 90);

  // ---- hind legs: gaskin, hock, cannon, fetlock, hoof; on the root, planted
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hip = joint(J, 'hh' + side, root, s * 0.085, 0.31, -0.12, [0.3, 0, 0]);
    const gaskin = blend([
      [cone([0, 0.02, 0.0], [0, -0.17, -0.01], 0.07, 0.034, 0.75, 1)],
      [sphere(0, -0.07, -0.025, 0.05, 0.7, 1.4, 0.9), 0.03], // the muscle behind
    ]);
    mk(gaskin, [-0.08, -0.2, -0.09], [0.08, 0.09, 0.08], 22, hip);
    const hock = joint(J, 'hk' + side, hip, 0, -0.17, 0, [-0.75, 0, 0]);
    const lower = blend([
      [sphere(0, 0, -0.008, 0.036, 0.8, 1.0, 1.2)], // hock joint
      [sphere(0, 0.01, -0.04, 0.02), 0.02], // point of hock
      [cone([0, 0, 0], [0, -0.105, 0.0], 0.026, 0.021, 0.8, 1), 0.015], // cannon
      [sphere(0, -0.112, 0.006, 0.028, 0.85, 1, 1.1), 0.015], // fetlock
      [cone([0, -0.115, 0.01], [0, -0.13, 0.02], 0.022, 0.025), 0.01], // pastern
    ]);
    mk(lower, [-0.05, -0.15, -0.07], [0.05, 0.05, 0.06], 22, hock, 0.0015, 90);
    P.lathe(hock, [[0.024, 0], [0.032, -0.024], [0.035, -0.032], [0, -0.032]], -0.128, 18).position.z = 0.02; // hoof
  }
  // ---- forelegs, raised and pawing
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = joint(J, 'fl' + side, hs, s * 0.08, -0.03, 0.38, [-0.4, 0, 0]);
    const fore = blend([
      [cone([0, 0.03, 0], [0, -0.16, 0.0], 0.055, 0.03, 0.8, 1)],
      [sphere(0, -0.04, 0.02, 0.045, 0.8, 1.5, 0.9), 0.03], // forearm muscle
    ]);
    mk(fore, [-0.07, -0.19, -0.07], [0.07, 0.09, 0.08], 22, sh);
    const kn = joint(J, 'fk' + side, sh, 0, -0.16, 0, [1.5, 0, 0]);
    const lowerF = blend([
      [sphere(0, 0, 0, 0.034, 0.85, 1.0, 1.0)], // knee
      [cone([0, 0, 0], [0, -0.115, 0], 0.025, 0.02, 0.8, 1), 0.015],
      [sphere(0, -0.123, 0.004, 0.027, 0.85, 1, 1.1), 0.015],
      [cone([0, -0.125, 0.006], [0, -0.14, 0.014], 0.021, 0.024), 0.01],
    ]);
    mk(lowerF, [-0.05, -0.16, -0.05], [0.05, 0.05, 0.05], 22, kn, 0.0015, 90);
    P.lathe(kn, [[0.023, 0], [0.031, -0.024], [0.033, -0.031], [0, -0.031]], -0.138, 18).position.z = 0.014;
  }

  // ---- the neck: arched, with a crest and a carved, wind-blown mane (neck frame: +y up the neck, +z its front)
  const neck = joint(J, 'hneck', hs, 0, 0.08, 0.4, [0.75, 0, 0]);
  const neckParts = [
    [cone([0, -0.02, 0.01], [0, 0.27, 0.0], 0.085, 0.045, 0.55, 1.15)], // deep, narrow, tapering
    [cone([0, 0.0, -0.05], [0, 0.25, -0.035], 0.04, 0.028, 0.6, 1), 0.05], // the crest
    [cone([0, 0.02, 0.06], [0, 0.22, 0.04], 0.025, 0.018, 0.8, 1), 0.04], // the throat's line
  ];
  // the mane: locks along the crest, each swept back and to one side
  for (let i = 0; i < 11; i++) {
    const y = 0.0 + i * 0.026, sd = i % 2 ? 1 : -1;
    neckParts.push([cone([sd * 0.008, y, -0.06], [sd * 0.04, y - 0.045, -0.09 - 0.015 * Math.sin(i)], 0.013, 0.004), 0.01]);
  }
  mk(blend(neckParts), [-0.1, -0.12, -0.16], [0.1, 0.32, 0.13], 34, neck, 0.002, 70);

  // ---- the head (head frame: +y toward the muzzle, +z the forehead/face side, -z the jaw)
  const hd0 = joint(J, 'hhead', neck, 0, 0.27, 0.0, [1.75, 0, 0]);
  // the carving sits tucked a little down, the way a rearing horse carries its head; in this
  // frame +y runs to the muzzle and -z is the forehead (up), +z the jaw
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
    [sphere(0.048, 0.04, 0.03, 0.02, 1, 1.3, 1), 0.012], // eye sockets and lids
    [sphere(-0.048, 0.04, 0.03, 0.02, 1, 1.3, 1), 0.012],
    [cone([0.03, -0.03, 0.045], [0.04, -0.06, 0.125], 0.019, 0.005, 0.6, 1), 0.012], // ears, pricked
    [cone([-0.03, -0.03, 0.045], [-0.04, -0.06, 0.125], 0.019, 0.005, 0.6, 1), 0.012],
    [sphere(0.028, 0.298, 0.016, 0.014, 1, 1.4, 1), 0.008, 'cut'], // nostrils
    [sphere(-0.028, 0.298, 0.016, 0.014, 1, 1.4, 1), 0.008, 'cut'],
    [cone([-0.034, 0.3, -0.026], [0.034, 0.3, -0.026], 0.005, 0.005), 0.005, 'cut'], // the mouth line
    [cone([0, 0.05, 0.05], [0, 0.22, 0.042], 0.012, 0.009), 0.02], // the bridge of the nose
    [sphere(0, 0.13, 0.0, 0.02, 2.4, 1, 1.1), 0.03], // the cheekbone's ridge
  ];
  for (let i = 0; i < 4; i++) headParts.push([cone([(i - 1.5) * 0.013, -0.03, 0.06], [(i - 1.5) * 0.018, 0.05, 0.085], 0.011, 0.004), 0.01]); // forelock
  const headSdf = blend(headParts);
  mk((x, y, z) => headSdf(x, y, -z), [-0.09, -0.14, -0.12], [0.09, 0.34, 0.12], 40, hd, 0.0012, 90);
  for (const s of [-1, 1]) P.sphere(hd, 0.011, s * 0.05, 0.042, -0.034, [0.5, 1, 1], 10); // the eyeballs
  // the bridle: crown piece, browband, cheek straps, noseband, bit and reins falling to the withers
  const strap = (pts, r) => P.add(hd, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], -q[2])), pts.length > 3), 24, r, 6, pts.length > 3));
  strap([[0.04, 0.215, 0.0], [0.0, 0.215, 0.05], [-0.04, 0.215, 0.0], [0.0, 0.21, -0.05]], 0.0045); // noseband
  strap([[0.048, 0.0, 0.035], [0.0, -0.005, 0.062], [-0.048, 0.0, 0.035]], 0.0045); // browband
  for (const s of [-1, 1]) {
    strap([[s * 0.046, -0.02, 0.03], [s * 0.05, 0.08, 0.0], [s * 0.04, 0.21, -0.005], [s * 0.036, 0.28, -0.03]], 0.0042); // cheek strap to the bit
    P.torus(hd, 0.012, 0.0032, s * 0.038, 0.285, 0.032, 0, Math.PI * 2, 14).rotation.y = Math.PI / 2; // bit rings
  }

  // ---- the tail: a fall of carved strands, swept to one side
  const tail = joint(J, 'tail', hs, 0, 0.05, -0.1, [1.25, 0, 0]);
  const tailParts = [[cone([0, 0.02, 0], [0, -0.08, 0.01], 0.032, 0.03)]];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const x0 = Math.cos(a) * 0.016, z0 = Math.sin(a) * 0.016;
    tailParts.push([cone([x0, -0.06, z0], [x0 * 1.6 + 0.03 * Math.sin(i * 2.1), -0.2, z0 * 1.6 - 0.02], 0.016, 0.012), 0.02]);
    tailParts.push([cone([x0 * 1.6 + 0.03 * Math.sin(i * 2.1), -0.2, z0 * 1.6 - 0.02], [x0 * 2.2 + 0.05 * Math.sin(i * 1.3), -0.34 - 0.03 * (i % 3), z0 * 2 + 0.03], 0.012, 0.004), 0.015]);
  }
  mk(blend(tailParts), [-0.09, -0.4, -0.09], [0.09, 0.06, 0.09], 30, tail, 0.002, 80);
}

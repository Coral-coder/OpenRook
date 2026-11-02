// The rook's soldier and the knight's rider (armoured torso and arms), and the knight's war horse.
import * as THREE from 'three';
import { V2, carve, drape, joint } from '../carving.js';

// the armoured torso and arms of the rook's soldier and the knight's rider
export function soldierTop(J, P, H) {
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
export function horse(J, root, P) {
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

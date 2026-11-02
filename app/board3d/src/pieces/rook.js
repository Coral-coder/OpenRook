// The rook: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { V2, armouredArms, armouredLegs, carve, cuirass, drape, face, folds, greatHelm, joint, resample, robeSkirt, skeleton } from '../carving.js';
import { horse, soldierTop } from './soldier.js';

export function rook(J, root, P) {
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
  }

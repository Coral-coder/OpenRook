// The knight: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { V2, armouredArms, armouredLegs, carve, cuirass, drape, face, folds, greatHelm, joint, resample, robeSkirt, skeleton } from '../carving.js';
import { horse, soldierTop } from './soldier.js';

export function knight(J, root, P) {
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
  }

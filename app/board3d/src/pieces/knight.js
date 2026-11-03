// The knight: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { joint } from '../carving.js';
import { horse, soldierTop } from './soldier.js';
import { armLimb, cop, helm, kite, mace, plume, sabaton, stirrup } from './kr_armour.js';

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
      armLimb(P, thigh, 0.2 * H, 0.06 * H, 0.05 * H, 3);
      const shin = new THREE.Group();
      shin.position.set(0, -0.2 * H, 0);
      shin.rotation.set(1.45, 0, -s * 0.15);
      thigh.add(shin);
      armLimb(P, shin, 0.19 * H, 0.05 * H, 0.04 * H, 3);
      cop(P, shin, 0.05 * H, s, true);
      sabaton(P, shin, H, -0.2 * H);
      stirrup(P, shin, H, -0.228 * H, 0.04 * H);
    }
    soldierTop(J, P, H);
    helm(P, J.head, H);
    plume(P, J.head, H);
    const shield = new THREE.Group();
    shield.name = 'shield';
    J.elL.add(shield);
    kite(P, shield, 0.28 * H, 0.42 * H);
    shield.position.set(0, -0.08 * H, 0);
    J.shield = shield;
    // a flanged mace
    const mc = mace(P, J.wrR, H);
    mc.position.set(0, -0.06 * H, 0.02 * H);
    J.weapon = mc;
    return { H, legs: [], style: 'one', hand: 'R' };
  }

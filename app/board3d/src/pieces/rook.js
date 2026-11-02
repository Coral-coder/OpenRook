// The rook: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { V2, armouredArms, armouredLegs, carve, cuirass, drape, face, folds, greatHelm, joint, resample, robeSkirt, skeleton } from '../carving.js';
import { horse, soldierTop } from './soldier.js';
import { kettle } from './kr_armour.js';
import { keep } from './kr_keep.js';

export function rook(J, root, P) {
    const T = 0.62;
    const tower = joint(J, 'tower', root, 0, 0, 0);
    // a keep of dressed stones: a battered plinth, courses of blocks laid with mortar joints
    // (each block bevelled, weathered and a little different), a round-arched door, slit
    // windows, corbels under a projecting parapet and capped merlons
    keep(tower, P, T);
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
    // a young face under a kettle helm
    face(J.head, P, H);
    kettle(P, J.head, H);
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

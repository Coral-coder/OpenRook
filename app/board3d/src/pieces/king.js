// The king: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { V2, armouredArms, armouredLegs, carve, cuirass, drape, face, folds, greatHelm, joint, resample, robeSkirt, skeleton } from '../carving.js';

export function king(J, root, P) {
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
  }

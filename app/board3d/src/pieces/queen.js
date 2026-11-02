// The queen: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { V2, armouredArms, armouredLegs, carve, cuirass, drape, face, folds, greatHelm, joint, resample, robeSkirt, skeleton } from '../carving.js';

export function queen(J, root, P) {
    const H = 1.1;
    const legs = skeleton(J, root, H);
    // a fitted, laced bodice
    const bod = new THREE.LatheGeometry(V2([[0.078 * H, 0], [0.086 * H, 0.06 * H], [0.112 * H, 0.13 * H], [0.11 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]]), 36);
    bod.scale(1, 1, 0.78);
    P.add(J.spine, bod);
    for (let i = 0; i < 6; i++) P.torus(J.spine, 0.006 * H, 0.0018 * H, 0, 0.02 * H + i * 0.022 * H, 0.072 * H + i * 0.0035 * H, 0, Math.PI * 2, 10);
    P.belt(J.hips, 0.088 * H, 0.04 * H);
    // a long gown in deep folds, and a cloak from the shoulders
    robeSkirt(J, P, H, 0.47 * H, 0.09 * H, 0.19 * H, 11, 0.07);
    const cloak = drape(0.3 * H, 0.66 * H, { bend: 1.0, folds: 5, depth: 0.018 * H, seg: 32 });
    P.geo(J.chest, cloak, 0, -0.2 * H, -0.11 * H, 0.12, Math.PI, 0);
    P.lathe(J.chest, [[0.07 * H, 0.09 * H], [0.1 * H, 0.11 * H], [0.112 * H, 0.14 * H], [0.095 * H, 0.15 * H]], 0, 32, [1, 1, 0.75]); // standing collar
    P.torus(J.neck, 0.05 * H, 0.004 * H, 0, -0.01 * H, 0.01 * H, 1.3); // necklace
    P.sphere(J.neck, 0.012 * H, 0, -0.04 * H, 0.05 * H, [1, 1.3, 0.6], 8);
    // arms in bell sleeves, bare hands
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      P.limb(J['sh' + side], 0.18 * H, 0.046 * H, 0.04 * H);
      P.cap(J['sh' + side], 0.058 * H, 0, 0, 0, [1.05, 0.7, 1]);
      const sl = new THREE.LatheGeometry(V2(resample([[0.04 * H, 0], [0.055 * H, -0.09 * H], [0.085 * H, -0.15 * H], [0.07 * H, -0.16 * H]], 10)), 28);
      folds(sl, 7, 0.12, -0.02 * H, -0.16 * H);
      P.add(J['el' + side], sl);
      P.hand(J['wr' + side], 0.085 * H, s);
    }
    face(J.head, P, H);
    // hair braided round under a tall crown, and a veil behind
    for (const s of [1, -1]) P.add(J.head, new THREE.TorusGeometry(0.05 * H, 0.012 * H, 8, 20, Math.PI), s * 0.01 * H, 0.08 * H, -0.01 * H, Math.PI / 2, 0, s * 0.1, [1.2, 1, 1]);
    P.cap(J.head, 0.064 * H, 0, 0.075 * H, -0.02 * H, [1, 0.9, 0.95]); // hair, swept back from the face
    const veil = drape(0.14 * H, 0.2 * H, { bend: 0.5, folds: 4, depth: 0.008 * H });
    P.geo(J.head, veil, 0, -0.01 * H, -0.06 * H, 0.15, Math.PI, 0);
    P.crown(J.head, 0.064 * H, 0.1 * H, 0.08 * H, 7, true);
    for (let i = 0; i < 2; i++) P.torus(J.head, 0.07 * H, 0.004 * H, 0, 0.17 * H, 0, i * Math.PI / 2 + 0.0001, Math.PI, 24); // arches
    P.sphere(J.head, 0.014 * H, 0, 0.24 * H, 0, null, 10);
    // the staff: a long rod with rings, a caged orb finial
    const st = new THREE.Group();
    st.name = 'weapon';
    J.wrR.add(st);
    P.cyl(st, 0.011 * H, 0.012 * H, 0.75 * H, 0, -0.2 * H, 0, 0, 0, 0, 12);
    for (const y of [0.1, -0.05, -0.35, -0.55]) P.torus(st, 0.016 * H, 0.004 * H, 0, y * H, 0, Math.PI / 2, Math.PI * 2, 14);
    P.lathe(st, [[0.012 * H, 0], [0.026 * H, 0.02 * H], [0.018 * H, 0.04 * H], [0.03 * H, 0.06 * H], [0.012 * H, 0.08 * H]], 0.15 * H, 16);
    P.sphere(st, 0.028 * H, 0, 0.27 * H, 0, null, 14);
    for (let i = 0; i < 4; i++) P.torus(st, 0.04 * H, 0.003 * H, 0, 0.27 * H, 0, Math.PI / 2 + 0.0001, Math.PI * 2, 20).rotation.set(0, (i * Math.PI) / 4, 0);
    P.add(st, new THREE.ConeGeometry(0.01 * H, 0.05 * H, 6), 0, 0.33 * H, 0);
    st.position.set(0.03 * H, -0.04 * H, 0.03 * H);
    st.userData.tip = [0, -0.55 * H, 0];
    J.weapon = st;
    return { H, legs, style: 'two' };
  }

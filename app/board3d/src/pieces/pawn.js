// The pawn: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { V2, armouredArms, armouredLegs, carve, cuirass, drape, face, folds, greatHelm, joint, resample, robeSkirt, skeleton } from '../carving.js';

export function pawn(J, root, P) {
    const H = 0.6;
    const legs = skeleton(J, root, H);
    // a quilted gambeson, belted, over mail
    const gam = new THREE.LatheGeometry(V2(resample([[0.094 * H, 0], [0.106 * H, 0.06 * H], [0.13 * H, 0.13 * H], [0.128 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]], 16)), 36);
    const gp = gam.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const y = gp.getY(i), k = 1 + 0.035 * Math.abs(Math.sin((y / (0.021 * H)) * Math.PI)); // quilted bands
      gp.setXYZ(i, gp.getX(i) * k, y, gp.getZ(i) * k * 0.78);
    }
    gam.computeVertexNormals();
    P.add(J.spine, gam);
    P.belt(J.hips, 0.1 * H, 0.04 * H);
    const skirt = new THREE.LatheGeometry(V2(resample([[0.1 * H, 0.04 * H], [0.115 * H, -0.04 * H], [0.13 * H, -0.12 * H], [0.11 * H, -0.12 * H]], 8)), 36);
    folds(skirt, 8, 0.08, 0.0, -0.12 * H);
    P.add(J.hips, skirt);
    P.cyl(J.neck, 0.036 * H, 0.046 * H, 0.06 * H, 0, 0, 0);
    P.torus(J.neck, 0.05 * H, 0.012 * H, 0, -0.02 * H, 0, Math.PI / 2); // padded collar
    // a tabard with a cross
    const tab = drape(0.16 * H, 0.32 * H, { bend: 0.4, folds: 3, depth: 0.008 * H });
    P.geo(J.chest, tab, 0, -0.1 * H, 0.098 * H, 0.06, 0, 0);
    P.box(J.chest, 0.014 * H, 0.12 * H, 0.006 * H, 0, -0.02 * H, 0.104 * H);
    P.box(J.chest, 0.08 * H, 0.014 * H, 0.006 * H, 0, 0.01 * H, 0.104 * H);
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      P.limb(J['sh' + side], 0.18 * H, 0.054 * H, 0.044 * H, 0.002);
      for (let i = 0; i < 3; i++) P.torus(J['sh' + side], 0.05 * H - i * 0.003 * H, 0.006 * H, 0, -0.05 * H - i * 0.05 * H, 0); // quilting
      P.limb(J['el' + side], 0.155 * H, 0.044 * H, 0.034 * H, 0.002);
      P.lathe(J['el' + side], [[0.035 * H, -0.09 * H], [0.048 * H, -0.12 * H], [0.044 * H, -0.155 * H], [0.034 * H, -0.155 * H]], 0, 18); // leather bracer
      P.gauntlet(J['wr' + side], 0.1 * H, s);
      P.limb(J['hip' + side], 0.225 * H, 0.066 * H, 0.05 * H, 0.002);
      P.limb(J['knee' + side], 0.215 * H, 0.05 * H, 0.042 * H, 0.002);
      P.lathe(J['knee' + side], [[0.046 * H, -0.08 * H], [0.056 * H, -0.1 * H], [0.052 * H, -0.215 * H], [0.044 * H, -0.215 * H]], 0, 18); // boot
      P.sphere(J['knee' + side], 0.052 * H, 0, 0, 0.015 * H, [1, 1, 0.9], 12);
      P.sabaton(J['ankle' + side], 0.07 * H, 0.045 * H, 0.13 * H, -0.02 * H);
    }
    face(J.head, P, H);
    // a kettle hat: a riveted dome and a wide sloping brim
    P.cap(J.head, 0.074 * H, 0, 0.068 * H, 0, [1, 1.1, 1]);
    P.lathe(J.head, [[0.07 * H, 0], [0.13 * H, -0.03 * H], [0.132 * H, -0.022 * H], [0.07 * H, 0.012 * H]], 0.07 * H, 36);
    P.torus(J.head, 0.074 * H, 0.004 * H, 0, 0.072 * H, 0, Math.PI / 2, Math.PI * 2, 32);
    P.rivets(J.head, 0.075 * H, 0.075 * H, 10, 0.004 * H);
    P.box(J.head, 0.008 * H, 0.07 * H, 0.15 * H, 0, 0.11 * H, 0, 0, 0, 0);
    const bL = P.sword(J.wrL, H, 0.42);
    bL.name = 'weapon2';
    bL.position.set(0, -0.05 * H, 0.02 * H);
    const bR = P.sword(J.wrR, H, 0.42);
    bR.position.set(0, -0.05 * H, 0.02 * H);
    J.weapon = bR;
    J.weapon2 = bL;
    return { H, legs, style: 'dual' };
  }

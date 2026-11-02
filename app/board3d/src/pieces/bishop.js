// The bishop: carved on the shared skeleton (joint names and positions are what statues.js animates).
import * as THREE from 'three';
import { V2, armouredArms, armouredLegs, carve, cuirass, drape, face, folds, greatHelm, joint, resample, robeSkirt, skeleton } from '../carving.js';

export function bishop(J, root, P) {
    const H = 1.02;
    const legs = skeleton(J, root, H);
    const tor = new THREE.LatheGeometry(V2(resample([[0.09 * H, 0], [0.1 * H, 0.06 * H], [0.122 * H, 0.13 * H], [0.12 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]], 14)), 40);
    folds(tor, 9, 0.06, 0.2 * H, 0);
    tor.scale(1, 1, 0.78);
    P.add(J.spine, tor);
    P.belt(J.hips, 0.094 * H, 0.04 * H);
    robeSkirt(J, P, H, 0.47 * H, 0.094 * H, 0.165 * H, 13, 0.06);
    // the chasuble falling before and behind, with its embroidered orphrey cross
    for (const [z, ry, h] of [[0.088, 0, 0.36], [-0.088, Math.PI, 0.44]]) {
      const d = drape(0.17 * H, h * H, { bend: 0.5, folds: 3, depth: 0.01 * H });
      P.geo(J.chest, d, 0, -0.06 * H - (h - 0.36) * H * 0.5, z * H, 0.05 * Math.sign(z), ry, 0);
      P.box(J.chest, 0.026 * H, h * H, 0.006 * H, 0, -0.06 * H - (h - 0.36) * H * 0.5, (z + Math.sign(z) * 0.006) * H);
    }
    P.box(J.chest, 0.12 * H, 0.024 * H, 0.006 * H, 0, 0.05 * H, 0.095 * H);
    P.torus(J.neck, 0.05 * H, 0.006 * H, 0, -0.005 * H, 0, 1.4); // amice
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      P.limb(J['sh' + side], 0.18 * H, 0.05 * H, 0.044 * H);
      const sl = new THREE.LatheGeometry(V2(resample([[0.044 * H, 0], [0.058 * H, -0.08 * H], [0.07 * H, -0.15 * H], [0.06 * H, -0.155 * H]], 8)), 24);
      folds(sl, 6, 0.1, 0, -0.15 * H);
      P.add(J['el' + side], sl);
      P.hand(J['wr' + side], 0.085 * H, s);
    }
    P.cyl(J.neck, 0.034 * H, 0.04 * H, 0.06 * H, 0, 0, 0);
    face(J.head, P, H, { beard: true });
    // the mitre: two peaks, banded, with lappets hanging behind
    const mi = new THREE.Shape();
    mi.moveTo(-0.07 * H, 0);
    mi.lineTo(0.07 * H, 0);
    mi.quadraticCurveTo(0.08 * H, 0.09 * H, 0, 0.16 * H);
    mi.quadraticCurveTo(-0.08 * H, 0.09 * H, -0.07 * H, 0);
    const mg = new THREE.ExtrudeGeometry(mi, { depth: 0.07 * H, bevelEnabled: true, bevelThickness: 0.008 * H, bevelSize: 0.006 * H, bevelSegments: 2, curveSegments: 12 });
    mg.translate(0, 0, -0.035 * H);
    P.geo(J.head, mg, 0, 0.1 * H, 0);
    P.box(J.head, 0.016 * H, 0.12 * H, 0.084 * H, 0, 0.16 * H, 0); // the band up the middle
    P.box(J.head, 0.15 * H, 0.02 * H, 0.085 * H, 0, 0.11 * H, 0);
    for (const s of [-1, 1]) P.box(J.head, 0.022 * H, 0.16 * H, 0.004 * H, s * 0.03 * H, 0.03 * H, -0.06 * H, 0.15, 0, 0);
    // the crozier in his left hand: knopped staff, a spiral crook with crockets
    const cr = new THREE.Group();
    cr.name = 'weapon';
    J.wrL.add(cr);
    P.cyl(cr, 0.011 * H, 0.011 * H, 0.95 * H, 0, -0.2 * H, 0, 0, 0, 0, 12);
    P.lathe(cr, [[0.011 * H, 0], [0.026 * H, 0.02 * H], [0.03 * H, 0.04 * H], [0.02 * H, 0.06 * H], [0.012 * H, 0.07 * H]], 0.2 * H, 16); // knop
    // the crook rises from the staff, rolls over toward his side and curls inward
    const R0 = 0.065 * H;
    const spiral = new THREE.Curve();
    spiral.getPoint = (t, out = new THREE.Vector3()) => {
      const a = t * Math.PI * 1.8, r = R0 * (1 - t * 0.55);
      return out.set(-R0 + r * Math.cos(a), r * Math.sin(a), 0);
    };
    const tube = new THREE.TubeGeometry(spiral, 40, 0.011 * H, 8);
    P.geo(cr, tube, 0, 0.33 * H, 0);
    P.cyl(cr, 0.011 * H, 0.011 * H, 0.06 * H, 0, 0.3 * H, 0, 0, 0, 0, 10);
    for (let i = 0; i < 5; i++) {
      const p = spiral.getPoint(i / 6);
      P.add(cr, new THREE.ConeGeometry(0.008 * H, 0.025 * H, 5), p.x * 1.15 - R0 * 0.15, p.y * 1.15 + 0.33 * H, 0, 0, 0, -i * 0.6);
    }
    cr.position.set(0, -0.04 * H, 0.02 * H);
    cr.userData.tip = [0, 0.37 * H, 0];
    J.weapon = cr;
    return { H, legs, style: 'one', hand: 'L' };
  }

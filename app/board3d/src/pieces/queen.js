// The queen: tall and severe in a fitted bodice and a sweeping gown, a fan collar standing
// behind her head, braided hair under an arched crown, her staff held upright before her
// face in both hands. Carved on the shared skeleton (joint names and positions are what
// statues.js animates).
import * as THREE from 'three';
import { V2, carve, folds, resample, skeleton } from '../carving.js';
import { bellSleeve, bodice, braid, cloak, crownGeos, gown, headShape, limbShape, locks, profile, sculpt } from './kq_shapes.js';

export function queen(J, root, P) {
  const H = 1.1;
  const legs = skeleton(J, root, H);
  const g = (parent, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => P.geo(parent, geo, x, y, z, rx, ry, rz);
  const all = (parent, geos, ...rest) => geos.forEach((geo) => g(parent, geo, ...rest));

  // ---- bodice, laced stomacher, jewelled girdle
  g(J.spine, bodice(H));
  for (let i = 0; i < 7; i++) {
    for (const s of [-1, 1]) P.add(J.spine, new THREE.CapsuleGeometry(0.0022 * H, 0.03 * H, 2, 6), s * 0.008 * H, 0.025 * H + i * 0.019 * H, 0.068 * H + i * 0.0026 * H, 0, 0, s * 1.15);
  }
  g(J.hips, sculpt(0, 0.022 * H, () => 0.084 * H, { rad: 40, rings: 2, capTop: false, capBottom: false, shape: (x, y, z, a) => [x, y - (Math.cos(a) > 0 ? Math.cos(a) * 0.03 * H : 0), z * 0.8] }), 0, 0.03 * H, 0);
  // a chain falling from the girdle down the front of the gown
  for (let i = 0; i < 9; i++) {
    const l = new THREE.TorusGeometry(0.009 * H, 0.0025 * H, 5, 10);
    P.add(J.hips, l, 0, 0.0 * H - i * 0.022 * H, 0.1 * H + i * 0.0075 * H, 0, i % 2 ? Math.PI / 2 : 0, 0);
  }
  P.sphere(J.hips, 0.014 * H, 0, -0.205 * H, 0.17 * H, [1, 1.4, 0.7], 10);

  // ---- the gown: deep gravity folds, a flared hem and a train behind
  g(J.hips, gown(H, 0.48 * H, 0.088 * H, 0.21 * H, { folds: 13, depth: 0.085, train: 0.18, seed: 2, rad: 72, rings: 24 }), 0, 0.035 * H, 0);

  // ---- a cloak from the shoulders, and the standing fan collar behind her head
  all(J.chest, cloak(H, 0.62 * H, 0.118 * H, 0.25 * H, { span: 1.6, folds: 10, depth: 0.17, rad: 34, rings: 18 }), 0, 0.17 * H, 0);
  const fan = [[0.06, 0.12], [0.09, 0.16], [0.115, 0.2], [0.13, 0.24], [0.122, 0.244], [0.106, 0.2], [0.082, 0.16], [0.052, 0.122]].map(([r, y]) => [r * H, y * H]);
  const fg = new THREE.LatheGeometry(V2(fan), 40, Math.PI - 1.35, 2.7);
  folds(fg, 14, 0.07, 0.15 * H, 0.27 * H, 1);
  fg.scale(1, 1, 0.8);
  g(J.chest, fg, 0, -0.04 * H, -0.01 * H);
  // necklace with a pendant
  g(J.neck, new THREE.TorusGeometry(0.046 * H, 0.004 * H, 6, 32).rotateX(1.35), 0, -0.045 * H, 0.01 * H);
  P.sphere(J.neck, 0.012 * H, 0, -0.07 * H, 0.05 * H, [1, 1.35, 0.6], 10);
  P.cyl(J.neck, 0.031 * H, 0.037 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 16);

  // ---- arms: puffed upper sleeves, long bell sleeves falling from the elbow, slender hands
  const upper = profile([[0, 0.046], [0.2, 0.052], [0.5, 0.048], [0.8, 0.04], [1, 0.037]].map(([t, v]) => [t, v * H]));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const puff = limbShape(0.18 * H, upper, { rad: 24, rings: 12 });
    folds(puff, 9, 0.06, 0, -0.18 * H, s);
    g(J['sh' + side], puff);
    P.sphere(J['sh' + side], 0.05 * H, 0, 0, 0, [1.05, 0.85, 1], 16);
    g(J['el' + side], bellSleeve(H, 0.17 * H, 0.04 * H, 0.085 * H, 0.09 * H));
    g(J['el' + side], limbShape(0.155 * H, (t) => (0.036 - 0.01 * t) * H, { rad: 16, rings: 6 }));
    P.hand(J['wr' + side], 0.08 * H, s);
  }

  // ---- the face, the hair, the crown
  all(J.head, headShape(H, { female: true }));
  // hair drawn back under the crown, a braid wound round, locks down her back
  g(J.head, sculpt(0.0, 0.095 * H, (t) => 0.068 * H * Math.sqrt(Math.max(0, 1 - t * t * 0.9)), {
    rad: 36, rings: 10,
    shape: (x, y, z, a) => {
      // only over the top and back; the face stays bare
      const front = Math.cos(a);
      return [x * 0.98, y, front > 0.35 ? z * 0.9 - 0.012 * H : z * 1.04 - 0.004 * H];
    },
  }), 0, 0.075 * H, -0.006 * H);
  const ring = new THREE.Curve();
  ring.getPoint = (t, v = new THREE.Vector3()) => v.set(Math.sin(t * Math.PI * 2) * 0.064 * H, 0, Math.cos(t * Math.PI * 2) * 0.06 * H - 0.008 * H);
  all(J.head, braid(ring, 0.009 * H, 9, H, 36), 0, 0.105 * H, 0);
  all(J.head, locks(H, 6, { from: 0.06, len: 0.2, spread: 0.06, wave: 0.008 }));
  all(J.head, crownGeos(0.062 * H, 0.08 * H, { points: 7, arches: true }), 0, 0.11 * H, 0);

  // ---- the staff: a long fluted rod with bands, a knop, and a caged orb
  const st = new THREE.Group();
  st.name = 'weapon';
  J.wrR.add(st);
  const rod = new THREE.CylinderGeometry(0.011 * H, 0.012 * H, 0.75 * H, 12, 1);
  const rp = rod.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const a = Math.atan2(rp.getZ(i), rp.getX(i)), k = 1 - 0.1 * Math.max(0, Math.cos(a * 6));
    rp.setX(i, rp.getX(i) * k);
    rp.setZ(i, rp.getZ(i) * k);
  }
  rod.computeVertexNormals();
  g(st, rod, 0, -0.2 * H, 0);
  for (const y of [0.1, -0.05, -0.32, -0.56]) g(st, new THREE.TorusGeometry(0.016 * H, 0.004 * H, 6, 16).rotateX(Math.PI / 2), 0, y * H, 0);
  P.lathe(st, [[0.012 * H, 0], [0.028 * H, 0.016 * H], [0.03 * H, 0.03 * H], [0.018 * H, 0.045 * H], [0.024 * H, 0.06 * H], [0.034 * H, 0.072 * H], [0.012 * H, 0.09 * H]], 0.145 * H, 20);
  P.sphere(st, 0.026 * H, 0, 0.275 * H, 0, null, 16);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.TorusGeometry(0.042 * H, 0.0035 * H, 6, 28);
    t.rotateY((i * Math.PI) / 4);
    g(st, t, 0, 0.275 * H, 0);
  }
  g(st, new THREE.TorusGeometry(0.042 * H, 0.0035 * H, 6, 28).rotateX(Math.PI / 2), 0, 0.275 * H, 0);
  P.add(st, new THREE.ConeGeometry(0.012 * H, 0.06 * H, 6), 0, 0.345 * H, 0);
  st.position.set(0.03 * H, -0.045 * H, 0.03 * H);
  st.userData.tip = [0, -0.55 * H, 0];
  J.weapon = st;
  return { H, legs, style: 'two' };
}

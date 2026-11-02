// The queen: tall and severe in a fitted bodice and a sweeping gown, a fan collar standing
// behind her head, braided hair under an arched crown, her staff held upright before her
// face in both hands. Carved on the shared skeleton (joint names and positions are what
// statues.js animates).
import * as THREE from 'three';
import { V2, carve, folds, resample, skeleton } from '../carving.js';
import { bellSleeve, bodice, braid, cloak, crownGeos, gown, headShape, limbShape, locks, profile, sculpt } from './kq_shapes.js';
import { beadRing, combed, crownFiligree, flowingLocks, ladyHand, line, lockAlong, relief, ropeRing, vine } from './kq_detail.js';

export function queen(J, root, P) {
  const H = 1.1;
  const legs = skeleton(J, root, H);
  const g = (parent, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => P.geo(parent, geo, x, y, z, rx, ry, rz);
  const all = (parent, geos, ...rest) => geos.forEach((geo) => g(parent, geo, ...rest));

  // ---- bodice, laced stomacher, jewelled girdle
  const bod = relief(bodice(H), (x, y, z, a) => {
    const t = (y + 0.01 * H) / (0.225 * H);
    // embroidered scrolls either side of the stomacher, and a band round the neckline
    const ax = Math.abs(x), v = (ax - 0.05 * H) / (0.016 * H);
    let d = z > 0 && Math.abs(v) < 1 ? 0.0013 * H * vine(t * Math.PI * 2, v, 2.5) : 0;
    d += z > 0 ? 0.001 * H * line(ax - 0.035 * H * Math.min(1, t * 1.6 + 0.05), 0.0025 * H) * (t < 0.85 ? 1 : 0) : 0;
    return d;
  });
  g(J.spine, bod);
  all(J.spine, beadRing(0.07 * H, 0.2 * H, 40, 0.0028 * H, 0.75, 5));
  for (let i = 0; i < 7; i++) {
    for (const s of [-1, 1]) P.add(J.spine, new THREE.CapsuleGeometry(0.0022 * H, 0.03 * H, 2, 6), s * 0.008 * H, 0.025 * H + i * 0.019 * H, 0.068 * H + i * 0.0026 * H, 0, 0, s * 1.15);
  }
  // the girdle: a jewelled belt dipping to a point at the front, where bodice meets gown
  const dip = (a) => (Math.cos(a) > 0 ? Math.cos(a) ** 2 * 0.03 * H : 0);
  g(J.hips, sculpt(0, 0.016 * H, () => 0.079 * H, { rad: 72, rings: 3, capTop: false, capBottom: false, shape: (x, y, z, a) => [x, y - dip(a), z * 0.81] }), 0, 0.034 * H, 0);
  {
    const c = new THREE.Curve();
    c.getPoint = (t, v = new THREE.Vector3()) => { const a = t * Math.PI * 2; return v.set(Math.sin(a) * 0.081 * H, 0.034 * H - dip(a), Math.cos(a) * 0.081 * H * 0.81); };
    g(J.hips, new THREE.TubeGeometry(c, 96, 0.0028 * H, 6, true));
    const c2 = new THREE.Curve();
    c2.getPoint = (t, v = new THREE.Vector3()) => { const a = t * Math.PI * 2; return v.set(Math.sin(a) * 0.081 * H, 0.05 * H - dip(a), Math.cos(a) * 0.081 * H * 0.81); };
    g(J.hips, new THREE.TubeGeometry(c2, 96, 0.0028 * H, 6, true));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const j = new THREE.OctahedronGeometry(0.006 * H, 1);
    j.scale(1, 1.2, 0.6);
    j.rotateY(a);
    g(J.hips, j, Math.sin(a) * 0.082 * H, 0.042 * H - dip(a), Math.cos(a) * 0.082 * H * 0.82);
  }
  // a chain falling from the girdle down the front of the gown
  for (let i = 0; i < 9; i++) {
    const l = new THREE.TorusGeometry(0.009 * H, 0.0025 * H, 5, 10);
    P.add(J.hips, l, 0, 0.0 * H - i * 0.022 * H, 0.1 * H + i * 0.0075 * H, 0, i % 2 ? Math.PI / 2 : 0, 0);
  }
  P.sphere(J.hips, 0.014 * H, 0, -0.205 * H, 0.17 * H, [1, 1.4, 0.7], 10);

  // ---- the gown: deep gravity folds, a flared hem and a train behind
  const gw = gown(H, 0.48 * H, 0.074 * H, 0.21 * H, { folds: 13, depth: 0.085, train: 0.18, seed: 2, rad: 132, rings: 46, hip: 0.018 * H, zs: 0.8 });
  relief(gw, (x, y, z, a) => {
    // a deep embroidered border of vines above the hem, and lines down the front
    const v = (y + 0.43 * H) / (0.03 * H);
    let d = Math.abs(v) < 1 ? 0.0018 * H * (vine(a, v, 22) * 0.85 + line(Math.abs(v) - 1, 0.12)) : 0;
    return d;
  });
  g(J.hips, gw, 0, 0.035 * H, 0);

  // ---- a cloak from the shoulders, and the standing fan collar behind her head
  const ck = cloak(H, 0.62 * H, 0.118 * H, 0.25 * H, { span: 1.6, folds: 10, depth: 0.17, rad: 52, rings: 28 });
  relief(ck[0], (x, y, z, a) => {
    const v = (y + 0.58 * H) / (0.022 * H);
    return Math.abs(v) < 1 ? 0.0016 * H * (vine(a, v, 16) * 0.8 + line(Math.abs(v) - 1, 0.15)) : 0;
  });
  all(J.chest, ck, 0, 0.17 * H, 0);
  const fan = [[0.06, 0.12], [0.09, 0.16], [0.115, 0.2], [0.13, 0.24], [0.122, 0.244], [0.106, 0.2], [0.082, 0.16], [0.052, 0.122]].map(([r, y]) => [r * H, y * H]);
  const fanDense = [];
  for (let i = 0; i < fan.length - 1; i++) for (let k = 0; k < 5; k++) fanDense.push([fan[i][0] + ((fan[i + 1][0] - fan[i][0]) * k) / 5, fan[i][1] + ((fan[i + 1][1] - fan[i][1]) * k) / 5]);
  fanDense.push(fan[fan.length - 1]);
  const fg = new THREE.LatheGeometry(V2(fanDense), 90, Math.PI - 1.35, 2.7);
  folds(fg, 14, 0.07, 0.15 * H, 0.27 * H, 1);
  fg.scale(1, 1, 0.8);
  relief(fg, (x, y, z, a) => {
    // lace: a pattern of little rings and a scalloped edge band
    const yy = y / H, u = a * 30;
    const ring = line(Math.hypot(u - Math.round(u), (yy * 120) - Math.round(yy * 120)) - 0.32, 0.12);
    return 0.0008 * H * ring * (yy > 0.13 ? 1 : 0);
  });
  g(J.chest, fg, 0, -0.04 * H, -0.01 * H);
  // necklace with a pendant
  g(J.neck, ropeRing(0.046 * H, 0, 0.0035 * H, 40, 1, 64).rotateX(1.35 - Math.PI / 2), 0, -0.045 * H, 0.01 * H);
  P.sphere(J.neck, 0.012 * H, 0, -0.07 * H, 0.05 * H, [1, 1.35, 0.6], 10);
  P.cyl(J.neck, 0.031 * H, 0.037 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 16);

  // ---- arms: puffed upper sleeves, long bell sleeves falling from the elbow, slender hands
  const upper = profile([[0, 0.046], [0.2, 0.052], [0.5, 0.048], [0.8, 0.04], [1, 0.037]].map(([t, v]) => [t, v * H]));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const puff = limbShape(0.18 * H, upper, { rad: 40, rings: 24 });
    folds(puff, 9, 0.06, 0, -0.18 * H, s);
    g(J['sh' + side], puff);
    P.sphere(J['sh' + side], 0.05 * H, 0, 0, 0, [1.05, 0.85, 1], 16);
    const bs = bellSleeve(H, 0.15 * H, 0.04 * H, 0.054 * H, 0.032 * H, 9);
    g(J['el' + side], bs);
    g(J['el' + side], limbShape(0.155 * H, (t) => (0.036 - 0.01 * t) * H, { rad: 16, rings: 6 }));
    all(J['wr' + side], ladyHand(0.08 * H, s));
  }

  // ---- the face, the hair, the crown
  all(J.head, headShape(H, { female: true }));
  // hair drawn back under the crown, a braid wound round, locks down her back
  const hairCap = (geo) => combed(geo, H, 40);
  g(J.head, hairCap(sculpt(0.0, 0.095 * H, (t) => 0.068 * H * Math.sqrt(Math.max(0, 1 - t * t * 0.9)), {
    rad: 72, rings: 24,
    shape: (x, y, z, a) => {
      // only over the top and back; the face stays bare
      const front = Math.cos(a);
      return [x * 0.98, y, front > 0.35 ? z * 0.9 - 0.012 * H : z * 1.04 - 0.004 * H];
    },
  })), 0, 0.075 * H, -0.006 * H);
  const ring = new THREE.Curve();
  ring.getPoint = (t, v = new THREE.Vector3()) => v.set(Math.sin(t * Math.PI * 2) * 0.064 * H, 0, Math.cos(t * Math.PI * 2) * 0.06 * H - 0.008 * H);
  all(J.head, braid(ring, 0.009 * H, 12, H, 72), 0, 0.105 * H, 0);
  all(J.head, flowingLocks(H, 5, { top: 0.075, len: 0.3, spread: 0.06 }));
  // two locks each side fall forward over her shoulders onto the bodice
  for (const s of [-1, 1]) {
    for (const k of [0, 1]) {
      const o = k * 0.016;
      g(J.head, lockAlong([[s * (0.05 + o), 0.075, -0.01 + o], [s * (0.072 + o), 0.0, 0.0 + o], [s * (0.088 + o * 0.6), -0.07, 0.055 + o], [s * (0.08 + o * 0.5), -0.15, 0.112 + o * 0.3], [s * (0.074 + o * 0.4), -0.24, 0.104]], H, 0.0105 - k * 0.002, new THREE.Vector3(s * 0.3, 0, 1)));
    }
  }
  all(J.head, crownGeos(0.062 * H, 0.08 * H, { points: 7, arches: true }), 0, 0.11 * H, 0);
  all(J.head, crownFiligree(0.062 * H, 0.08 * H, 7), 0, 0.11 * H, 0);

  // ---- the staff: a long fluted rod with bands, a knop, and a caged orb
  const st = new THREE.Group();
  st.name = 'weapon';
  J.wrR.add(st);
  const rod = new THREE.CylinderGeometry(0.011 * H, 0.012 * H, 0.75 * H, 18, 60);
  const rp = rod.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const a = Math.atan2(rp.getZ(i), rp.getX(i)) + rp.getY(i) / (0.05 * H), k = 1 - 0.12 * Math.max(0, Math.cos(a * 6));
    rp.setX(i, rp.getX(i) * k);
    rp.setZ(i, rp.getZ(i) * k);
  }
  rod.computeVertexNormals();
  g(st, rod, 0, -0.2 * H, 0);
  for (const y of [0.1, -0.05, -0.32, -0.56]) all(st, beadRing(0.0145 * H, y * H, 14, 0.0038 * H, 1, 5));
  P.lathe(st, [[0.012 * H, 0], [0.028 * H, 0.016 * H], [0.03 * H, 0.03 * H], [0.018 * H, 0.045 * H], [0.024 * H, 0.06 * H], [0.034 * H, 0.072 * H], [0.012 * H, 0.09 * H]], 0.145 * H, 40);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.add(st, new THREE.ConeGeometry(0.006 * H, 0.03 * H, 6), Math.sin(a) * 0.03 * H, 0.215 * H, Math.cos(a) * 0.03 * H, Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7); }
  P.sphere(st, 0.026 * H, 0, 0.275 * H, 0, null, 28);
  for (let i = 0; i < 6; i++) {
    const t = new THREE.TorusGeometry(0.042 * H, 0.0032 * H, 6, 40);
    t.rotateY((i * Math.PI) / 6);
    g(st, t, 0, 0.275 * H, 0);
  }
  g(st, new THREE.TorusGeometry(0.042 * H, 0.0035 * H, 6, 28).rotateX(Math.PI / 2), 0, 0.275 * H, 0);
  P.add(st, new THREE.ConeGeometry(0.012 * H, 0.06 * H, 6), 0, 0.345 * H, 0);
  st.position.set(0.03 * H, -0.045 * H, 0.03 * H);
  st.userData.tip = [0, -0.55 * H, 0];
  J.weapon = st;
  return { H, legs, style: 'two' };
}

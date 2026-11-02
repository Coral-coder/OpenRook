// The king: a crowned knight in full plate under a royal mantle with an ermine collar,
// holding his greatsword point-down before him. Carved on the shared skeleton (joint names and
// positions are what statues.js animates).
import * as THREE from 'three';
import { carve, skeleton } from '../carving.js';
import { cloak, crownGeos, cuirassShell, gown, limbShape, plateLames, profile, sculpt } from './kq_shapes.js';
import { beadRing, couter, crownFiligree, gauntletHand, line, mailBand, ornateSword, relief, rivets, ropeRing, vine } from './kq_detail.js';

export function king(J, root, P) {
  const H = 1.18;
  const legs = skeleton(J, root, H);
  const g = (parent, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => P.geo(parent, geo, x, y, z, rx, ry, rz);
  const all = (parent, geos, ...rest) => geos.forEach((geo) => g(parent, geo, ...rest));

  // ---- the cuirass, faulds and belt
  const cu = relief(cuirassShell(H), (x, y, z, a) => {
    if (z <= 0) return 0;
    const t = (y + 0.01 * H) / (0.235 * H);
    // two etched bands of scrolling vine down the breast, either side of the ridge
    const ax = Math.abs(x), v = (ax - 0.045 * H) / (0.014 * H);
    let d = Math.abs(v) < 1 ? 0.0016 * H * vine(t * Math.PI * 2, v, 3) : 0;
    d += 0.0012 * H * (line(Math.abs(v) - 1, 0.12)); // the bands' borders
    // an engraved border round the plackart lip and the bottom edge
    d += 0.0014 * H * line(t - 0.47, 0.012) + 0.0018 * H * line(t - 0.03, 0.015);
    return d;
  });
  g(J.spine, cu);
  g(J.spine, ropeRing(0.093 * H, -0.008 * H, 0.0035 * H, 60, 0.8, 96, 0.66));
  all(J.spine, rivets(0.137 * H, 0.17 * H, 12, 0.0045 * H, 0.8, -1.2, 1.2));
  all(J.spine, rivets(0.124 * H, 0.105 * H, 10, 0.004 * H, 0.8, -1.0, 1.0));
  for (let i = 0; i < 3; i++) {
    const r0 = (0.094 + i * 0.006) * H;
    g(J.hips, sculpt(-0.04 * H, 0, (t) => r0 + 0.008 * H * t, { rad: 40, rings: 3, capTop: false, capBottom: false, shape: (x, y, z) => [x, y, z * 0.8] }), 0, 0.045 * H - i * 0.034 * H, 0);
  }
  P.belt(J.hips, 0.1 * H, 0.05 * H);
  for (let i = 0; i < 3; i++) g(J.hips, ropeRing((0.103 + i * 0.006) * H, 0.045 * H - i * 0.034 * H - 0.04 * H, 0.0026 * H, 50, 0.8, 48));
  g(J.neck, mailBand(0.046 * H, 0.06 * H, 0.0, -0.035 * H, 0.014 * H));
  // the gorget: overlapping rings at the throat
  for (let i = 0; i < 3; i++) g(J.neck, sculpt(-0.018 * H, 0, (t) => (0.064 - i * 0.007 + 0.006 * t) * H, { rad: 32, rings: 2, capTop: false, capBottom: false }), 0, -0.02 * H + i * 0.017 * H, 0);
  P.cyl(J.neck, 0.036 * H, 0.042 * H, 0.06 * H, 0, 0, 0);

  // ---- arms in plate: rerebrace, couter, vambrace, gauntlets
  const upper = profile([[0, 0.05], [0.25, 0.054], [0.5, 0.05], [0.85, 0.042], [1, 0.038]].map(([t, v]) => [t, v * H]));
  const lower = profile([[0, 0.04], [0.2, 0.044], [0.6, 0.038], [1, 0.032]].map(([t, v]) => [t, v * H]));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = J['sh' + side], el = J['el' + side], wr = J['wr' + side];
    g(sh, limbShape(0.18 * H, (t) => upper(t) * 0.86, { flat: 0.92, rad: 32, rings: 16 }));
    g(sh, mailBand(0.05 * H, 0.048 * H, -0.01 * H, -0.05 * H, 0.016 * H));
    all(sh, plateLames(0.18 * H, upper, 3, 1.05));
    // a great pauldron of four lames, with a raised haute-piece at the neck
    // a pauldron of overlapping plates: shallow shells, each stepping down the arm
    for (let i = 0; i < 4; i++) {
      const R = (0.074 - i * 0.004) * H;
      g(sh, sculpt(0, R * 0.42, (t) => R * Math.sqrt(Math.max(0, 1 - t * t)), {
        rad: 36, rings: 8, capBottom: true,
        shape: (x, y, z) => [x * 1.05 + s * 0.01 * H, y, z * 0.95],
      }), s * i * 0.004 * H, 0.004 * H - i * 0.022 * H, 0);
      {
        const c = new THREE.Curve();
        c.getPoint = (t, v = new THREE.Vector3()) => v.set(Math.sin(t * Math.PI * 2) * R * 1.05 + s * 0.01 * H, 0, Math.cos(t * Math.PI * 2) * R * 0.95);
        g(sh, new THREE.TubeGeometry(c, 40, 0.004 * H, 6, true), s * i * 0.004 * H, 0.004 * H - i * 0.022 * H, 0);
      }
      all(sh, rivets(R * 1.04, 0.004 * H - i * 0.022 * H + R * 0.05, 5, 0.0032 * H, 0.95, -Math.PI * 0.8, Math.PI * 0.8));
    }
    all(el, couter(0.046 * H, s, false));
    all(el, plateLames(0.155 * H, lower, 3, 1.05));
    g(el, limbShape(0.155 * H, (t) => lower(t) * 0.85, { rad: 28, rings: 12 }));
    all(wr, gauntletHand(0.11 * H, s));
  }

  // ---- legs in plate: cuisse, poleyn, greave with a shaped calf, sabatons
  const thigh = profile([[0, 0.07], [0.3, 0.068], [0.7, 0.056], [1, 0.05]].map(([t, v]) => [t, v * H]));
  const shin = profile([[0, 0.05], [0.25, 0.056], [0.55, 0.048], [1, 0.036]].map(([t, v]) => [t, v * H]));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hp = J['hip' + side], kn = J['knee' + side], an = J['ankle' + side];
    all(hp, plateLames(0.225 * H, thigh, 4, 1.08));
    g(hp, limbShape(0.225 * H, (t) => thigh(t) * 0.9, { rad: 32, rings: 16 }));
    P.sphere(hp, 0.068 * H, 0, 0, 0, null, 16);
    all(kn, couter(0.056 * H, s, true));
    // the greave: the calf swells behind, the shin a ridge in front
    g(kn, sculpt(-0.215 * H, 0, (u) => shin(1 - u), {
      rad: 48, rings: 28,
      shape: (x, y, z, a, u) => {
        const t = 1 - u;
        if (Math.cos(a) < 0) z *= 1 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6));
        else z += Math.exp(-((x / (0.012 * H)) ** 2)) * 0.006 * H;
        return [x * 0.9, y, z];
      },
    }));
    P.sabaton(an, 0.075 * H, 0.05 * H, 0.15 * H, -0.02 * H);
  }

  // ---- a surcoat from the belt over the thighs, parted at the front, with the royal cross
  const sur = gown(H, 0.25 * H, 0.104 * H, 0.15 * H, { folds: 10, depth: 0.07, open: 0.28, seed: 4, rad: 108, rings: 26 });
  relief(sur, (x, y, z, a) => {
    const v = (y + 0.225 * H) / (0.016 * H); // a band of vine just above the hem
    let d = Math.abs(v) < 1 ? 0.0014 * H * (vine(a, v, 14) * 0.8 + line(Math.abs(v) - 1, 0.15)) : 0;
    // the royal cross worked into the cloth over his left thigh, following its folds
    const da = a - 0.5, yy = y + 0.12 * H;
    const bar = (Math.abs(da) < 0.075 && Math.abs(yy) < 0.075 * H) || (Math.abs(yy - 0.035 * H) < 0.011 * H && Math.abs(da) < 0.24);
    if (bar) d += 0.003 * H;
    return d;
  });
  g(J.hips, sur, 0, 0.04 * H, 0);

  // ---- the royal mantle falling from the shoulders, and an ermine collar
  const man = cloak(H, 0.66 * H, 0.13 * H, 0.22 * H, { span: 1.5, folds: 12, depth: 0.22, rad: 46, rings: 22 });
  relief(man[0], (x, y, z, a) => {
    const v = (y + 0.62 * H) / (0.022 * H);
    return Math.abs(v) < 1 ? 0.0018 * H * (vine(a, v, 18) * 0.8 + line(Math.abs(v) - 1, 0.15)) : 0;
  });
  all(J.chest, man, 0, 0.2 * H, 0);
  // an ermine capelet over the shoulders: thick fur falling from the neck
  const collar = sculpt(-0.075 * H, 0.0, (u) => {
    const t = 1 - u; // 0 at the neck .. 1 at the edge
    return (0.06 + 0.11 * Math.sqrt(t)) * H;
  }, { rad: 60, rings: 14, capTop: false, capBottom: false, shape: (x, y, z, a) => [x, y, z * (Math.cos(a) > 0 ? 0.78 : 0.9)] });
  carve(collar, 0.006 * H, 90);
  g(J.chest, collar, 0, 0.215 * H, -0.004 * H);
  for (let i = 0; i < 9; i++) {
    // ermine tails
    const a = Math.PI + ((i / 8) * 2 - 1) * 1.4;
    P.add(J.chest, new THREE.CapsuleGeometry(0.008 * H, 0.02 * H, 4, 10), Math.sin(a) * 0.12 * H, 0.17 * H, Math.cos(a) * 0.104 * H);
  }

  // ---- the great helm, crowned
  g(J.head, sculpt(-0.03 * H, 0.155 * H, profile([[0, 0.068], [0.35, 0.074], [0.7, 0.072], [0.88, 0.06], [1, 0.0]].map(([t, v]) => [t, v * H])), {
    rad: 48, rings: 34,
    shape: (x, y, z, a, t) => {
      const front = Math.cos(a) > 0;
      // a flat-fronted face plate with a vertical ridge, an eye slit and breaths
      if (front) {
        z = Math.min(z, 0.06 * H + Math.cos(a) * 0.012 * H);
        z += Math.exp(-((x / (0.008 * H)) ** 2)) * 0.008 * H * (t < 0.85 ? 1 : 0);
        const yy = y;
        if (Math.abs(yy - 0.07 * H) < 0.007 * H && Math.abs(x) > 0.009 * H && Math.abs(x) < 0.052 * H) z -= 0.014 * H;
        if (Math.abs(yy - 0.07 * H) < 0.014 * H && Math.abs(yy - 0.07 * H) > 0.007 * H && Math.abs(x) < 0.054 * H) z += 0.004 * H; // the sight's raised rim
        if (yy < 0.035 * H && yy > -0.01 * H && Math.abs(x) > 0.012 * H && Math.abs(x) < 0.045 * H && Math.sin(x * 900 / H) > 0.4 && Math.sin(yy * 700 / H) > 0.2) z -= 0.005 * H;
      }
      return [x, y, z];
    },
  }));
  g(J.head, ropeRing(0.073 * H, 0.09 * H, 0.004 * H, 40, 0.9, 80));
  all(J.head, rivets(0.0745 * H, 0.03 * H, 14, 0.0035 * H, 1, Math.PI * 0.35, Math.PI * 1.65));
  all(J.head, crownGeos(0.07 * H, 0.07 * H, { points: 8 }), 0, 0.11 * H, 0);
  all(J.head, crownFiligree(0.07 * H, 0.07 * H, 8), 0, 0.11 * H, 0);

  // ---- the greatsword, held point-down before him in both hands
  const sw = new THREE.Group();
  sw.name = 'weapon';
  J.wrR.add(sw);
  const blade = ornateSword(H, 0.62);
  all(sw, blade.geos);
  sw.userData.tip = blade.tip;
  sw.position.set(0.035 * H, -0.07 * H, 0.02 * H);
  J.weapon = sw;
  return { H, legs, style: 'two' };
}

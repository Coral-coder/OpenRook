// The king: a crowned knight in full plate under a royal mantle with an ermine collar,
// holding his greatsword point-down before him. Carved on the shared skeleton (joint names and
// positions are what statues.js animates).
import * as THREE from 'three';
import { carve, skeleton } from '../carving.js';
import { cloak, crownGeos, cuirassShell, gown, limbShape, plateLames, profile, sculpt } from './kq_shapes.js';
import { couter, gauntletHand, line, ornateSword, relief, rivets, ropeRing, vine } from './kq_detail.js';
import { beltFine, crownFine, ermineCape, fingerPlates, furTube, mailFine, rollTube, rowOf, sabaton } from './kq_fine.js';

export function king(J, root, P) {
  const H = 1.18;
  const legs = skeleton(J, root, H);
  const g = (parent, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => P.geo(parent, geo, x, y, z, rx, ry, rz);
  const all = (parent, geos, ...rest) => geos.forEach((geo) => g(parent, geo, ...rest));

  // ---- the cuirass, faulds and belt
  const cu = relief(cuirassShell(H, { rad: 72, rings: 48 }), (x, y, z, a) => {
    if (z <= 0) return 0;
    const t = (y + 0.01 * H) / (0.235 * H);
    // two etched bands of scrolling vine down the breast, either side of the ridge
    const ax = Math.abs(x), v = (ax - 0.045 * H) / (0.014 * H);
    let d = Math.abs(v) < 1 ? 0.0016 * H * vine(t * Math.PI * 2, v, 3) : 0;
    d += 0.0012 * H * (line(Math.abs(v) - 1, 0.12)); // the bands' borders
    // an engraved border round the plackart lip and the bottom edge
    d += 0.0014 * H * line(t - 0.47, 0.012) + 0.0018 * H * line(t - 0.03, 0.015);
    // a second, finer engraved line inside each border, and a row of punched dots between
    d += 0.0008 * H * line(t - 0.445, 0.006) + 0.0008 * H * line(t - 0.06, 0.006);
    d += 0.0009 * H * line(t - 0.455, 0.005) * (0.5 + 0.5 * Math.cos(a * 60));
    // a cross etched on the breast between the vine bands
    if (Math.abs(x) < 0.006 * H && t > 0.58 && t < 0.86) d += 0.0012 * H;
    if (Math.abs(t - 0.77) < 0.022 && Math.abs(x) < 0.026 * H) d += 0.0012 * H;
    return d;
  });
  g(J.spine, cu);
  // a rolled edge round the neck opening of the breastplate
  g(J.spine, rollTube(rowOf(cu, 72, 48, 2).map((v) => v.multiplyScalar(1.02)), 0.0035 * H, { closed: true, seg: 80, rs: 6, twist: 24 }));
  g(J.spine, ropeRing(0.093 * H, -0.008 * H, 0.0035 * H, 60, 0.8, 96, 0.66));
  all(J.spine, rivets(0.137 * H, 0.17 * H, 12, 0.0045 * H, 0.8, -1.2, 1.2));
  all(J.spine, rivets(0.124 * H, 0.105 * H, 10, 0.004 * H, 0.8, -1.0, 1.0));
  for (let i = 0; i < 3; i++) {
    const r0 = (0.094 + i * 0.006) * H;
    g(J.hips, sculpt(-0.04 * H, 0, (t) => r0 + 0.008 * H * t, { rad: 64, rings: 3, capTop: false, capBottom: false, shape: (x, y, z) => [x, y, z * 0.8] }), 0, 0.045 * H - i * 0.034 * H, 0);
    all(J.hips, rivets(r0 + 0.007 * H, 0.045 * H - i * 0.034 * H - 0.008 * H, 12, 0.0028 * H, 0.8));
  }
  all(J.hips, beltFine(0.1 * H, 0.05 * H, 0.85, H));
  // a skirt of fine mail below the faulds, showing where the surcoat parts
  g(J.hips, mailFine(0.1 * H, 0.106 * H, -0.04 * H, -0.14 * H, 0.009 * H, { zs: 0.8, arc: 0.55, res: 0.33 }));
  for (let i = 0; i < 3; i++) g(J.hips, ropeRing((0.103 + i * 0.006) * H, 0.045 * H - i * 0.034 * H - 0.04 * H, 0.0026 * H, 50, 0.8, 40));
  // the gorget: overlapping rings at the throat, each with a rolled, riveted edge
  for (let i = 0; i < 3; i++) {
    g(J.neck, sculpt(-0.018 * H, 0, (t) => (0.064 - i * 0.007 + 0.006 * t) * H, { rad: 48, rings: 2, capTop: false, capBottom: false }), 0, -0.02 * H + i * 0.017 * H, 0);
    g(J.neck, ropeRing((0.0705 - i * 0.007) * H, -0.02 * H + i * 0.017 * H, 0.0022 * H, 30, 1, 48));
    all(J.neck, rivets((0.068 - i * 0.007) * H, -0.028 * H + i * 0.017 * H, 10, 0.0024 * H));
  }
  P.cyl(J.neck, 0.036 * H, 0.042 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 32);
  // close the gorget's open lower edge down onto the breastplate
  g(J.neck, sculpt(-0.05 * H, -0.02 * H, (t) => (0.042 + 0.023 * t) * H, { rad: 48, rings: 2, capTop: false, capBottom: false, shape: (x, y, z, a) => [x, y, z * (Math.cos(a) > 0 ? 0.85 : 0.75)] }));

  // ---- arms in plate: rerebrace, couter, vambrace, gauntlets
  const upper = profile([[0, 0.05], [0.25, 0.054], [0.5, 0.05], [0.85, 0.042], [1, 0.038]].map(([t, v]) => [t, v * H]));
  const lower = profile([[0, 0.04], [0.2, 0.044], [0.6, 0.038], [1, 0.032]].map(([t, v]) => [t, v * H]));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = J['sh' + side], el = J['el' + side], wr = J['wr' + side];
    g(sh, limbShape(0.18 * H, (t) => upper(t) * 0.86, { flat: 0.92, rad: 40, rings: 16 }));
    g(sh, mailFine(0.05 * H, 0.048 * H, -0.01 * H, -0.05 * H, 0.012 * H, { res: 0.6, arc: 1.2 }));
    all(sh, plateLames(0.18 * H, upper, 3, 1.05, { rad: 48, rings: 6 }));
    for (let i = 0; i < 3; i++) all(sh, rivets(upper(i / 3) * 1.06, -i * 0.06 * H - 0.006 * H, 6, 0.0025 * H, 1, 0, Math.PI * 2));
    // a great pauldron of four lames, with a raised haute-piece at the neck
    // a pauldron of overlapping plates: shallow shells, each stepping down the arm
    for (let i = 0; i < 4; i++) {
      const R = (0.074 - i * 0.004) * H;
      g(sh, sculpt(0, R * 0.42, (t) => R * Math.sqrt(Math.max(0, 1 - t * t)), {
        rad: 48, rings: 7, capBottom: true,
        shape: (x, y, z) => [x * 1.05 + s * 0.01 * H, y, z * 0.95],
      }), s * i * 0.004 * H, 0.004 * H - i * 0.022 * H, 0);
      {
        // a roped, turned edge round each lame
        const pts = [];
        for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * R * 1.05 + s * 0.01 * H, 0, Math.cos(a) * R * 0.95)); }
        g(sh, rollTube(pts, 0.0042 * H, { closed: true, seg: 48, rs: 5, twist: 30 }), s * i * 0.004 * H, 0.004 * H - i * 0.022 * H, 0);
      }
      all(sh, rivets(R * 1.04, 0.004 * H - i * 0.022 * H + R * 0.05, 5, 0.0032 * H, 0.95, -Math.PI * 0.8, Math.PI * 0.8));
    }
    all(el, couter(0.046 * H, s, false));
    all(el, plateLames(0.155 * H, lower, 3, 1.05, { rad: 40, rings: 6 }));
    g(el, limbShape(0.155 * H, (t) => lower(t) * 0.85, { rad: 36, rings: 12 }));
    all(wr, gauntletHand(0.11 * H, s));
    all(wr, fingerPlates(0.11 * H, s));
  }

  // ---- legs in plate: cuisse, poleyn, greave with a shaped calf, sabatons
  const thigh = profile([[0, 0.07], [0.3, 0.068], [0.7, 0.056], [1, 0.05]].map(([t, v]) => [t, v * H]));
  const shin = profile([[0, 0.05], [0.25, 0.056], [0.55, 0.048], [1, 0.036]].map(([t, v]) => [t, v * H]));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hp = J['hip' + side], kn = J['knee' + side], an = J['ankle' + side];
    all(hp, plateLames(0.225 * H, thigh, 4, 1.08, { rad: 40, rings: 6 }));
    g(hp, limbShape(0.225 * H, (t) => thigh(t) * 0.9, { rad: 32, rings: 12 }));
    P.sphere(hp, 0.068 * H, 0, 0, 0, null, 28);
    all(kn, couter(0.056 * H, s, true));
    // the greave: the calf swells behind, the shin a ridge in front
    g(kn, sculpt(-0.215 * H, 0, (u) => shin(1 - u), {
      rad: 48, rings: 32,
      shape: (x, y, z, a, u) => {
        const t = 1 - u;
        // an engraved border round the top of the greave
        if (t > 0.04 && t < 0.1) { const k = 1 + 0.025 * Math.exp(-(((t - 0.07) / 0.012) ** 2)); x *= k; z *= k; }
        if (Math.cos(a) < 0) z *= 1 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6));
        else z += Math.exp(-((x / (0.012 * H)) ** 2)) * 0.006 * H;
        return [x * 0.9, y, z];
      },
    }));
    all(an, sabaton(0.075 * H, 0.05 * H, 0.15 * H, -0.02 * H));
  }

  // ---- a surcoat from the belt over the thighs, parted at the front, with the royal cross
  const sur = gown(H, 0.25 * H, 0.104 * H, 0.15 * H, { folds: 10, depth: 0.07, open: 0.28, seed: 4, rad: 104, rings: 28 });
  relief(sur, (x, y, z, a) => {
    const v = (y + 0.225 * H) / (0.016 * H); // a band of vine just above the hem
    let d = Math.abs(v) < 1 ? 0.0014 * H * (vine(a, v, 14) * 0.8 + line(Math.abs(v) - 1, 0.15)) : 0;
    // a row of embroidered stitches along each border of the band
    const v2 = Math.abs(v) - 1.35;
    if (Math.abs(v2) < 0.3) d += 0.0008 * H * (0.5 + 0.5 * Math.cos(a * 140)) * line(v2, 0.18);
    // the parted front edges are hemmed: a raised band either side of the opening
    const dfr = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    d += 0.0016 * H * line(dfr - 0.3, 0.03) * (y < -0.04 * H ? 1 : 0);
    // the royal cross worked into the cloth over his left thigh, following its folds
    const da = a - 0.5, yy = y + 0.12 * H;
    const bar = (Math.abs(da) < 0.075 && Math.abs(yy) < 0.075 * H) || (Math.abs(yy - 0.035 * H) < 0.011 * H && Math.abs(da) < 0.24);
    if (bar) d += 0.003 * H;
    return d;
  });
  g(J.hips, sur, 0, 0.04 * H, 0);
  // a rolled hem
  g(J.hips, rollTube(rowOf(sur, 104, 0, 1, 0.001 * H), 0.0035 * H, { closed: true, seg: 168, rs: 5 }), 0, 0.04 * H, 0);

  // ---- the royal mantle falling from the shoulders, and an ermine collar
  const MR = 56, MG = 26;
  const man = cloak(H, 0.66 * H, 0.13 * H, 0.22 * H, { span: 1.5, folds: 12, depth: 0.22, rad: MR, rings: MG });
  relief(man[0], (x, y, z, a) => {
    const v = (y + 0.6 * H) / (0.022 * H);
    let d = Math.abs(v) < 1 ? 0.0018 * H * (vine(a, v, 18) * 0.8 + line(Math.abs(v) - 1, 0.15)) : 0;
    // a powdering of small crowns and crosses over the velvet
    const u = (a / (Math.PI * 2)) * 34, w = y / (0.05 * H);
    const ri = Math.floor(w), fu = u - Math.floor(u + (ri % 2 ? 0.5 : 0)) - (ri % 2 ? 0.5 : 0) - 0.5, fw = w - ri - 0.5;
    if (y < -0.08 * H && y > -0.55 * H) {
      const cr = (Math.abs(fu) < 0.06 && Math.abs(fw) < 0.22) || (Math.abs(fw + 0.05) < 0.06 && Math.abs(fu) < 0.18);
      if (cr) d += 0.0012 * H;
    }
    return d;
  });
  all(J.chest, man, 0, 0.2 * H, 0);
  // the mantle's edges turned back in ermine down the fronts, and a corded hem
  {
    const p = man[0].attributes.position;
    const at = (k) => new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
    for (const side of [0, MR]) {
      const pts = [];
      for (let i = 3; i <= MG; i += 2) pts.push(at(i * (MR + 1) + side));
      g(J.chest, furTube(pts, 0.012 * H, H, { seg: 64, rs: 10 }), 0, 0.2 * H, 0);
    }
    const hem = [];
    for (let j = 0; j <= MR; j += 1) hem.push(at(MG * (MR + 1) + j));
    g(J.chest, rollTube(hem, 0.004 * H, { seg: 144, rs: 5, twist: 70 }), 0, 0.2 * H, 0);
  }
  // an ermine capelet over the shoulders: thick fur falling from the neck
  const collar = ermineCape(H);
  g(J.chest, collar, 0, 0.215 * H, -0.004 * H);
  // a roll of fur at the throat
  {
    const pts = [];
    for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * 0.063 * H, 0.002 * H, Math.cos(a) * 0.063 * H * (Math.cos(a) > 0 ? 0.8 : 0.9))); }
    g(J.chest, furTube(pts, 0.011 * H, H, { seg: 80, rs: 10, closed: true }), 0, 0.215 * H, -0.004 * H);
  }
  // a collar of state over the fur: linked esses hanging in a curve, a jewelled pendant
  {
    const surf = (a, t, lift = 0.0075) => {
      const R = (0.06 + 0.11 * Math.sqrt(t)) * H + lift * H;
      return new THREE.Vector3(Math.sin(a) * R, 0.215 * H - 0.075 * H * t, Math.cos(a) * R * (Math.cos(a) > 0 ? 0.78 : 0.9) - 0.004 * H);
    };
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const a = ((i / n) * 2 - 1) * 1.25;
      const t = 0.42 + 0.4 * Math.cos(a * 1.2) ** 2;
      const p0 = surf(a, t), p1 = surf(a + 0.02, t);
      const lk = new THREE.TorusGeometry(0.0055 * H, 0.0017 * H, 5, 8);
      lk.scale(1, 0.75, 1);
      if (i % 2) lk.rotateY(Math.PI / 2);
      lk.rotateZ(Math.atan2(p1.y - p0.y, p1.x - p0.x));
      lk.translate(p0.x, p0.y, p0.z);
      g(J.chest, lk);
    }
    const pc = surf(0, 0.86, 0.012);
    const pend = new THREE.OctahedronGeometry(0.009 * H, 1);
    pend.scale(1, 1.3, 0.55);
    g(J.chest, pend, pc.x, pc.y - 0.012 * H, pc.z + 0.002 * H);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const lf = new THREE.SphereGeometry(0.0055 * H, 10, 8);
      lf.scale(1, 1, 0.45);
      g(J.chest, lf, pc.x + Math.cos(a) * 0.011 * H, pc.y - 0.012 * H + Math.sin(a) * 0.011 * H, pc.z - 0.001 * H);
    }
  }

  // ---- the great helm, crowned
  g(J.head, sculpt(-0.03 * H, 0.155 * H, profile([[0, 0.068], [0.35, 0.074], [0.7, 0.072], [0.88, 0.06], [1, 0.0]].map(([t, v]) => [t, v * H])), {
    rad: 72, rings: 42,
    shape: (x, y, z, a, t) => {
      const front = Math.cos(a) > 0;
      // a raised band round the brow and an engraved line along the bottom edge
      { const k = 1 + 0.035 * Math.exp(-(((y - 0.095 * H) / (0.006 * H)) ** 2)) - 0.012 * Math.exp(-(((y + 0.018 * H) / (0.0018 * H)) ** 2)); x *= k; z *= k; }
      // a flat-fronted face plate with a vertical ridge, an eye slit and breaths
      if (front) {
        z = Math.min(z, 0.06 * H + Math.cos(a) * 0.012 * H);
        z += Math.exp(-((x / (0.008 * H)) ** 2)) * 0.008 * H * (t < 0.85 ? 1 : 0);
        const yy = y;
        if (Math.abs(yy - 0.07 * H) < 0.007 * H && Math.abs(x) > 0.009 * H && Math.abs(x) < 0.052 * H) z -= 0.014 * H;
        if (Math.abs(yy - 0.07 * H) < 0.014 * H && Math.abs(yy - 0.07 * H) > 0.007 * H && Math.abs(x) < 0.054 * H) z += 0.004 * H; // the sight's raised rim
        // breaths: round holes pierced in a cross on each cheek
        for (const sx of [-1, 1]) {
          const cx = sx * 0.03 * H, cy = 0.018 * H, st = 0.0085 * H;
          for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0, -2]]) {
            const d = Math.hypot(x - cx - ox * st, yy - cy - oy * st) / (0.0034 * H);
            if (d < 1.5) z -= 0.0045 * H * (d < 1 ? 1 : (1.5 - d) / 0.5);
          }
        }
        // a raised border framing the face plate
        z += 0.0022 * H * Math.exp(-(((Math.abs(x) - 0.054 * H) / (0.0028 * H)) ** 2)) * (yy < 0.085 * H ? 1 : 0);
      }
      return [x, y, z];
    },
  }));
  g(J.head, ropeRing(0.073 * H, 0.09 * H, 0.004 * H, 60, 0.9, 96));
  all(J.head, rivets(0.0745 * H, 0.03 * H, 14, 0.0035 * H, 1, Math.PI * 0.35, Math.PI * 1.65));
  all(J.head, rivets(0.0752 * H, 0.074 * H, 12, 0.003 * H, 1, Math.PI * 0.4, Math.PI * 1.6));
  // the hinge plates and pivot bosses where the face plate meets the skull
  for (const sx of [-1, 1]) {
    const b = new THREE.SphereGeometry(0.008 * H, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    b.rotateZ(-sx * Math.PI / 2);
    g(J.head, b, sx * 0.071 * H, 0.06 * H, 0.005 * H);
    g(J.head, new THREE.TorusGeometry(0.0085 * H, 0.0018 * H, 6, 20).rotateY(Math.PI / 2), sx * 0.071 * H, 0.06 * H, 0.005 * H);
  }
  all(J.head, crownFine(0.07 * H, 0.07 * H, { points: 8 }), 0, 0.11 * H, 0);

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

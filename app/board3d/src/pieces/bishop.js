// The bishop: an old churchman in full vestments. A long alb falls in fine creases to the
// pedestal; over it a gothic chasuble hangs from his shoulders in deep folds, longer before and
// behind, with embroidered orphrey bands and jewels; a stole's fringed ends show below it. He
// has a lined, bearded face under a two-peaked mitre with its band, jewels and lappets, raises
// his right hand in blessing and holds an ornate crozier: knopped staff, a little gothic shrine
// for a node, and a crook curling in on itself, crocketed, ending in a rosette.
// (Carved on the shared skeleton: joint names and positions are what statues.js animates.)
import * as THREE from 'three';
import { V2, carve, joint, skeleton } from '../carving.js';
import { hand, lathe, moustache, outward, robe, sculptBeard, sculptHead } from './bp_kit.js';

export function bishop(J, root, P) {
  const H = 1.02;
  const legs = skeleton(J, root, H);

  // ---- the alb, from the waist to the pedestal
  const alb = robe([[0.095 * H, 0.05 * H], [0.108 * H, -0.05 * H], [0.14 * H, -0.24 * H], [0.18 * H, -0.44 * H], [0.19 * H, -0.5 * H], [0.0001, -0.505 * H]], { folds: 17, depth: 0.07, seg: 64, rows: 16, seed: 2, flat: 0.86, soft: true });
  P.add(J.hips, alb);
  // the body under the vestments
  lathe(P, J.spine, [[0.09 * H, 0], [0.1 * H, 0.06 * H], [0.118 * H, 0.13 * H], [0.11 * H, 0.18 * H], [0.06 * H, 0.21 * H], [0, 0.21 * H]], 0, 24, [1, 1, 0.8]);

  // ---- the chasuble: a bell from the shoulders, dipping long in front and behind
  const ch = robe([[0.05 * H, 0.135 * H], [0.11 * H, 0.126 * H], [0.165 * H, 0.095 * H], [0.185 * H, 0.04 * H], [0.178 * H, -0.12 * H], [0.168 * H, -0.3 * H], [0.164 * H, -0.4 * H], [0.152 * H, -0.405 * H], [0.156 * H, -0.3 * H]], { folds: 15, depth: 0.075, seg: 80, rows: 22, seed: 5, flat: 0.8, hemWave: 0.01, soft: true });
  {
    const p = ch.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const t = Math.max(0, Math.min(1, (0.05 * H - y) / (0.45 * H)));
      const fb = Math.sin(a) ** 2; // 1 in front and behind, 0 at the sides
      let yy = y - 0.04 * H * fb * t * t; // a little longer before and behind
      yy += 0.02 * H * (1 - fb) * t * t;
      // orphrey bands: raised embroidered strips down the front and back, and a yoke
      const band = Math.abs(Math.cos(a)) < 0.11 && y < 0.11 * H ? 1 : 0;
      const yoke = Math.abs(y - 0.04 * H) < 0.012 * H && fb > 0.35 ? 1 : 0;
      const k = 1 + 0.045 * Math.max(band, yoke) * (y < 0.115 * H ? 1 : 0);
      p.setXYZ(i, x * k, yy, z * k);
    }
    ch.computeVertexNormals();
  }
  P.add(J.chest, ch);
  // jewels set in the orphrey
  for (const y of [0.03, -0.06, -0.16, -0.26]) {
    P.sphere(J.chest, 0.008 * H, 0, y * H, 0.142 * H, [1, 1, 0.6], 10);
    P.sphere(J.chest, 0.008 * H, 0, y * H, -0.142 * H, [1, 1, 0.6], 10);
  }
  // the amice, folded round the neck
  lathe(P, J.neck, [[0.042 * H, -0.03 * H], [0.062 * H, -0.02 * H], [0.064 * H, 0.0], [0.05 * H, 0.012 * H], [0.04 * H, 0.008 * H]], 0, 32);
  P.cyl(J.neck, 0.034 * H, 0.04 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 16);
  // the stole's fringed ends hanging below the chasuble
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.position.set(s * 0.04 * H, -0.27 * H, 0.118 * H);
    st.rotation.set(0.12, 0, s * 0.03);
    J.hips.add(st);
    P.box(st, 0.034 * H, 0.17 * H, 0.006 * H, 0, -0.06 * H, 0);
    P.box(st, 0.04 * H, 0.016 * H, 0.008 * H, 0, -0.14 * H, 0);
    P.box(st, 0.014 * H, 0.014 * H, 0.009 * H, 0, -0.02 * H, 0.001 * H); // embroidered cross
    P.box(st, 0.005 * H, 0.032 * H, 0.009 * H, 0, -0.02 * H, 0.001 * H);
    for (let i = 0; i < 6; i++) P.box(st, 0.004 * H, 0.022 * H, 0.004 * H, (i - 2.5) * 0.0065 * H, -0.158 * H, 0);
  }

  // ---- arms in alb sleeves; a hand raised in blessing, the other on the crozier
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    lathe(P, J['sh' + side], [[0.05 * H, 0.01 * H], [0.054 * H, -0.06 * H], [0.052 * H, -0.18 * H], [0.044 * H, -0.19 * H]], 0, 20);
    const sl = robe([[0.046 * H, 0.0], [0.052 * H, -0.08 * H], [0.058 * H, -0.135 * H], [0.054 * H, -0.15 * H], [0.034 * H, -0.15 * H], [0.034 * H, -0.12 * H]], { folds: 8, depth: 0.12, seg: 32, rows: 10, seed: s + 3, flat: 1 });
    P.add(J['el' + side], sl);
    lathe(P, J['el' + side], [[0.034 * H, -0.143 * H], [0.04 * H, -0.148 * H], [0.038 * H, -0.158 * H], [0.03 * H, -0.158 * H]], 0, 20); // cuff
    hand(P, J['wr' + side], 0.1 * H, s, s > 0 ? 'grip' : 'bless');
  }
  // a ring on the blessing hand
  P.torus(J.wrR, 0.012 * H, 0.003 * H, 0.0, -0.02 * H, 0.0, Math.PI / 2, Math.PI * 2, 12);

  // ---- the head: an old, lined face with a long beard
  const r = 0.062 * H;
  P.add(J.head, sculptHead(r, { old: true, seg: 40 }), 0, 0.05 * H, 0);
  const beard = sculptBeard(r * 0.78, 0.12 * H);
  carve(beard, r * 0.025, 30 / r);
  P.add(J.head, beard, 0, 0.05 * H - r * 0.55, r * 0.2);
  for (const m of moustache(r)) P.add(J.head, m, 0, 0.05 * H - r * 0.4, r * 1.0);
  // hair at the back and sides, below the mitre
  const hair = new THREE.SphereGeometry(r * 1.04, 24, 12, (Math.PI * 5) / 6, (Math.PI * 4) / 3, Math.PI * 0.3, Math.PI * 0.45);
  {
    const p = hair.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getX(i), p.getZ(i));
      const k = 1 - 0.06 * Math.abs(Math.sin(a * 14 + p.getY(i) * 60));
      p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
    }
    hair.computeVertexNormals();
  }
  P.add(J.head, hair, 0, 0.05 * H, 0, 0, 0, 0, [0.9, 1.1, 1]);

  // ---- the mitre: two pointed panels front and back, banded, jewelled, with lappets
  const mi = new THREE.Shape();
  const mw = 0.058 * H, mh = 0.15 * H;
  mi.moveTo(-mw, 0);
  mi.lineTo(mw, 0);
  mi.bezierCurveTo(mw * 1.08, mh * 0.45, mw * 0.55, mh * 0.8, 0, mh);
  mi.bezierCurveTo(-mw * 0.55, mh * 0.8, -mw * 1.08, mh * 0.45, -mw, 0);
  const mg = new THREE.ExtrudeGeometry(mi, { depth: 0.07 * H, bevelEnabled: true, bevelThickness: 0.006 * H, bevelSize: 0.005 * H, bevelSegments: 3, curveSegments: 20, steps: 4 });
  mg.translate(0, 0, -0.035 * H);
  {
    // it thins toward the peak (two panels leaning together) and curves round the head
    const p = mg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = y / mh;
      p.setXYZ(i, x, y, z * (1 - 0.75 * t * t) - Math.sign(z) * (x / mw) ** 2 * 0.012 * H);
    }
    mg.computeVertexNormals();
  }
  const mitre = new THREE.Group();
  mitre.position.set(0, 0.098 * H, -0.006 * H);
  mitre.rotation.x = -0.08;
  J.head.add(mitre);
  P.add(mitre, mg);
  // the circulus round the brow, and the titulus up each face, set with jewels
  lathe(P, mitre, [[0.06 * H, -0.004 * H], [0.065 * H, 0.0], [0.065 * H, 0.024 * H], [0.06 * H, 0.028 * H]], 0, 40, [1, 1, 0.66]);
  for (const zs of [1, -1]) {
    const tit = new THREE.Shape();
    tit.moveTo(-0.011 * H, 0);
    tit.lineTo(0.011 * H, 0);
    tit.lineTo(0.006 * H, mh * 0.93);
    tit.lineTo(-0.006 * H, mh * 0.93);
    const tg = new THREE.ExtrudeGeometry(tit, { depth: 0.004 * H, bevelEnabled: false, steps: 6 });
    const p = tg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / mh;
      p.setZ(i, (0.0385 * H + 0.006 * H) * (1 - 0.75 * t * t) + p.getZ(i) - 0.002 * H);
    }
    tg.computeVertexNormals();
    P.add(mitre, tg, 0, 0, 0, 0, zs > 0 ? 0 : Math.PI, 0);
    for (const y of [0.05, 0.1, 0.145]) {
      const t = y * H / mh;
      if (y * H < mh * 0.9) P.sphere(mitre, 0.005 * H, 0, y * H, zs * ((0.047 * H) * (1 - 0.75 * t * t)), [1, 1, 0.6], 8);
    }
    P.sphere(mitre, 0.007 * H, 0, 0.013 * H, zs * 0.044 * H, [1, 1, 0.6], 10);
  }
  P.sphere(mitre, 0.01 * H, 0, mh + 0.006 * H, 0, null, 10); // the knop on the peak
  // lappets hanging behind
  for (const s of [-1, 1]) {
    const lp = new THREE.PlaneGeometry(0.024 * H, 0.17 * H, 2, 10);
    const p = lp.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -((p.getY(i) / (0.17 * H) - 0.5) ** 2) * 0.03 * H + Math.sin(p.getY(i) * 90) * 0.002 * H);
    lp.computeVertexNormals();
    P.add(mitre, lp, s * 0.032 * H, -0.07 * H, -0.06 * H, 0.12, Math.PI, s * 0.05);
    P.box(mitre, 0.026 * H, 0.014 * H, 0.006 * H, s * 0.032 * H, -0.15 * H, -0.075 * H, 0.12, 0, 0);
    for (let i = 0; i < 4; i++) P.box(mitre, 0.004 * H, 0.016 * H, 0.004 * H, s * 0.032 * H + (i - 1.5) * 0.006 * H, -0.165 * H, -0.077 * H);
  }

  // ---- the crozier in his left hand
  const cr = new THREE.Group();
  cr.name = 'weapon';
  J.wrL.add(cr);
  P.cyl(cr, 0.011 * H, 0.012 * H, 0.95 * H, 0, -0.2 * H, 0, 0, 0, 0, 14);
  P.add(cr, new THREE.ConeGeometry(0.012 * H, 0.03 * H, 10), 0, -0.69 * H, 0, Math.PI, 0, 0); // ferrule
  for (const y of [-0.45, -0.1]) lathe(P, cr, [[0.012 * H, -0.012 * H], [0.02 * H, -0.004 * H], [0.02 * H, 0.004 * H], [0.012 * H, 0.012 * H]], y * H, 18);
  lathe(P, cr, [[0.012 * H, 0], [0.024 * H, 0.012 * H], [0.03 * H, 0.03 * H], [0.024 * H, 0.05 * H], [0.014 * H, 0.06 * H]], 0.17 * H, 20); // knop
  // the node: a little six-sided shrine with gabled niches and pinnacles
  const node = new THREE.Group();
  node.position.y = 0.245 * H;
  cr.add(node);
  P.cyl(node, 0.026 * H, 0.026 * H, 0.05 * H, 0, 0, 0, 0, Math.PI / 6, 0, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.sin(a) * 0.026 * H, z = Math.cos(a) * 0.026 * H;
    P.add(node, new THREE.ConeGeometry(0.009 * H, 0.016 * H, 4), x * 0.95, 0.032 * H, z * 0.95, 0, a + Math.PI / 4, 0, [1, 1, 0.4]); // gable
    P.add(node, new THREE.ConeGeometry(0.0035 * H, 0.022 * H, 4), Math.sin(a + 0.52) * 0.028 * H, 0.032 * H, Math.cos(a + 0.52) * 0.028 * H); // pinnacle
    P.box(node, 0.008 * H, 0.028 * H, 0.003 * H, x * 1.02, -0.002 * H, z * 1.02, 0, a, 0); // niche frame
  }
  lathe(P, node, [[0.03 * H, -0.03 * H], [0.03 * H, -0.024 * H], [0.012 * H, -0.02 * H]], 0, 6);
  P.cyl(cr, 0.011 * H, 0.011 * H, 0.06 * H, 0, 0.3 * H, 0, 0, 0, 0, 12);
  // the crook: rising, rolling over toward his side and curling in, crocketed
  const R0 = 0.066 * H;
  const spiral = new THREE.Curve();
  spiral.getPoint = (t, out = new THREE.Vector3()) => {
    const a = t * Math.PI * 1.85, rr = R0 * (1 - t * 0.6);
    return out.set(-R0 + rr * Math.cos(a), rr * Math.sin(a), 0);
  };
  const tube = new THREE.TubeGeometry(spiral, 48, 0.0115 * H, 8);
  {
    // the crook thins as it curls
    const p = tube.attributes.position;
    const segs = 48, rad = 8;
    const c = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      spiral.getPoint(i / segs, c);
      const k = 1 - 0.45 * (i / segs);
      for (let j = 0; j <= rad; j++) {
        const idx = i * (rad + 1) + j;
        p.setXYZ(idx, c.x + (p.getX(idx) - c.x) * k, c.y + (p.getY(idx) - c.y) * k, c.z + (p.getZ(idx) - c.z) * k);
      }
    }
    tube.computeVertexNormals();
  }
  P.geo(cr, tube, 0, 0.33 * H, 0);
  const cp = new THREE.Vector3();
  for (let i = 1; i < 9; i++) {
    const t = i / 10;
    spiral.getPoint(t, cp);
    // a curled leaf on the outer edge of the crook
    const a = t * Math.PI * 1.85;
    const leaf = new THREE.SphereGeometry(0.012 * H * (1 - t * 0.5), 8, 6);
    leaf.scale(0.7, 1.4, 0.45);
    P.add(cr, leaf, cp.x + Math.cos(a) * 0.016 * H, cp.y + 0.33 * H + Math.sin(a) * 0.016 * H, 0, 0, 0, a - Math.PI / 2);
  }
  // the rosette in the curl
  spiral.getPoint(1, cp);
  const ctr = new THREE.Vector3(cp.x, cp.y + 0.33 * H, 0);
  P.sphere(cr, 0.009 * H, ctr.x, ctr.y, ctr.z, null, 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P.sphere(cr, 0.006 * H, ctr.x + Math.cos(a) * 0.012 * H, ctr.y + Math.sin(a) * 0.012 * H, 0, [1, 1, 0.5], 8);
  }
  cr.position.set(0, -0.035 * H, 0.025 * H);
  cr.userData.tip = [0, 0.37 * H, 0];
  J.weapon = cr;
  return { H, legs, style: 'one', hand: 'L' };
}

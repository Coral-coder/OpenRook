// The bishop: an old churchman in full vestments. A long alb falls in fine creases to the
// pedestal; over it a gothic chasuble hangs from his shoulders in deep folds, longer before and
// behind, with embroidered orphrey bands and jewels; a stole's fringed ends show below it. He
// is faceless (a stern stone mask, in the manner of the great wizard's chess set) under a two-peaked mitre with its band, jewels and lappets, raises
// his right hand in blessing and holds an ornate crozier: knopped staff, a little gothic shrine
// for a node, and a crook curling in on itself, crocketed, ending in a rosette.
// (Carved on the shared skeleton: joint names and positions are what statues.js animates.)
import * as THREE from 'three';
import { V2, carve, joint, skeleton } from '../carving.js';
import { bead, face, fineHand, fringe, gem, lathe, outward, quatrefoil, robe, sculptHead } from './bp_kit.js';
import { cord, latheGrid, pearls, rope, setOn, slab, spaced } from './bp_fine.js';
import { crozierFine, mitreFine, pectoral } from './bp_bishop.js';

export function bishop(J, root, P) {
  const H = 1.02;
  const legs = skeleton(J, root, H);

  // ---- the alb, from the waist to the pedestal
  const alb = robe([[0.095 * H, 0.05 * H], [0.108 * H, -0.05 * H], [0.14 * H, -0.24 * H], [0.18 * H, -0.44 * H], [0.19 * H, -0.5 * H], [0.0001, -0.505 * H]], { folds: 23, depth: 0.065, seg: 96, rows: 30, seed: 2, flat: 0.86, soft: true, hemWave: 0 });
  const albMesh = P.add(J.hips, alb);
  // the body under the vestments
  lathe(P, J.spine, [[0.09 * H, 0], [0.1 * H, 0.06 * H], [0.118 * H, 0.13 * H], [0.11 * H, 0.18 * H], [0.06 * H, 0.21 * H], [0, 0.21 * H]], 0, 24, [1, 1, 0.8]);

  // ---- the chasuble: a bell from the shoulders, dipping long in front and behind
  const ch = robe([[0.05 * H, 0.135 * H], [0.11 * H, 0.126 * H], [0.165 * H, 0.095 * H], [0.185 * H, 0.04 * H], [0.178 * H, -0.12 * H], [0.168 * H, -0.3 * H], [0.164 * H, -0.4 * H], [0.152 * H, -0.405 * H], [0.156 * H, -0.3 * H]], { folds: 17, depth: 0.075, seg: 100, rows: 40, seed: 5, flat: 0.8, hemWave: 0, soft: true });
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
  // the orphreys embroidered in relief: corded edges, quatrefoils and set jewels down the
  // front and back bands, a Y-cross on the back, a corded yoke and a braided, corded hem
  const CG = latheGrid(ch, ...ch.userData.grid);
  const motif = (G, j, a, y, lift, make, up) => {
    const { p: q, n } = G.at(a, y);
    const g = new THREE.Group();
    setOn(g, q.addScaledVector(n, lift), n, up);
    j.add(g);
    make(g);
  };
  const path = (G, fa, y0, y1, n, lift) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = y0 + (y1 - y0) * t;
      const { p: q } = G.at(fa(t), y);
      // lifted straight out from the axis, so a cord crossing folds doesn't zigzag
      q.addScaledVector(new THREE.Vector3(q.x, 0, q.z).normalize(), lift * 1.4);
      if (!out.length || out[out.length - 1].distanceTo(q) > 0.002 * H) out.push(q);
    }
    return out;
  };
  {
    const cr = 0.0032 * H, lift = 0.0045 * H;
    const hemY = -0.62 * H; // below every hem: paths stop at the cloth's edge
    for (const a0 of [Math.PI / 2, -Math.PI / 2]) {
      for (const da of [-0.112, 0.112]) P.add(J.chest, rope(path(CG, () => a0 + da, 0.108 * H, hemY, 70, lift), cr, { twist: 160, radial: 6, perPt: 1.3 }));
      let k = 0;
      for (let y = 0.08; y > -0.42; y -= 0.05, k++) {
        if (a0 > 0 && y > 0.04) continue; // the pectoral cross hangs there
        if (k % 2) motif(CG, J.chest, a0, y * H, 0.003 * H, (g) => gem(P, g, 0.0065 * H, 0, 0, 0));
        else motif(CG, J.chest, a0, y * H, 0.003 * H, (g) => quatrefoil(P, g, 0.012 * H));
        // little pearls between the motifs
        for (const dy of [0.0125, 0.0375]) {
          const { p: q, n } = CG.at(a0, (y - dy) * H);
          P.add(J.chest, pearls([q.addScaledVector(n, 0.004 * H)], 0.0026 * H));
        }
      }
    }
    // the Y on the back, from the shoulders to the pillar
    for (const sg of [-1, 1]) {
      for (const da of [-0.07, 0.07]) {
        P.add(J.chest, rope(path(CG, (t) => -Math.PI / 2 + sg * (0.75 - 0.6 * t) + da * (1 - t * 0.4), 0.105 * H, -0.04 * H, 8, lift), cr, { twist: 60, radial: 6, perPt: 5 }));
      }
      for (let t = 0.12; t < 0.9; t += 0.19) motif(CG, J.chest, -Math.PI / 2 + sg * (0.75 - 0.6 * t), (0.105 - 0.145 * t) * H, 0.003 * H, (g) => (Math.round(t * 10) % 4 ? gem(P, g, 0.005 * H, 0, 0, 0) : quatrefoil(P, g, 0.01 * H)));
    }
    // the yoke across the shoulders, front and back
    for (const sg of [1, -1]) {
      for (const yy of [0.028, 0.052]) P.add(J.chest, rope(path(CG, (t) => sg * (0.62 + t * (Math.PI - 1.24)), yy * H, yy * H, 40, lift * 0.8), cr * 0.9, { twist: 120, radial: 6, perPt: 1.2 }));
      for (let a = 0.7; a < Math.PI - 0.68; a += 0.11) {
        if (Math.abs(Math.cos(a)) < 0.16) continue;
        const { p: q, n } = CG.at(sg * a, 0.04 * H);
        P.add(J.chest, pearls([q.addScaledVector(n, 0.003 * H)], 0.0034 * H));
      }
    }
    // the hem: a braid at the edge, a cord above it, pearls between
    P.add(J.chest, rope(CG.hem(0.0025 * H), 0.0042 * H, { closed: true, twist: 420, radial: 6, perPt: 1.3 }));
    P.add(J.chest, cord(CG.aboveHem(0.028 * H, 0.002 * H), 0.0026 * H, { closed: true, radial: 5, perPt: 1 }));
    const ph = CG.aboveHem(0.015 * H, 0.0028 * H);
    P.add(J.chest, pearls(ph.filter((_, i) => i % 2 === 0), 0.0028 * H, { w: 7, h: 5 }));
  }
  // the alb: a deep embroidered border at the hem, a scalloped lace edge, and an apparel before him
  {
    const AG = latheGrid(alb, ...alb.userData.grid);
    const N = 96;
    P.add(J.hips, cord(AG.ring(-0.492 * H, N, 0.0015 * H), 0.0025 * H, { closed: true, radial: 5, perPt: 1.3 }));
    P.add(J.hips, rope(AG.ring(-0.452 * H, N, 0.0015 * H), 0.003 * H, { closed: true, twist: 260, radial: 6, perPt: 2 }));
    P.add(J.hips, cord(AG.ring(-0.44 * H, N, 0.0012 * H), 0.002 * H, { closed: true, radial: 5, perPt: 1.3 }));
    // lace: a row of round arches standing on the hem cord, each with a pearl in it
    const lo = AG.ring(-0.49 * H, N, 0.0018 * H), hi = AG.ring(-0.468 * H, N, 0.0018 * H), md = AG.ring(-0.478 * H, N, 0.0024 * H);
    const drops = [];
    for (let i = 0; i < N; i += 2) {
      const i2 = (i + 2) % N, m = (i + 1) % N;
      const up = (k) => lo[k].clone().lerp(hi[k], 0.75);
      P.add(J.hips, cord([lo[i], up(i), hi[m], up(i2), lo[i2]], 0.0015 * H, { radial: 4, perPt: 1.2 }));
      drops.push(md[m]);
    }
    P.add(J.hips, pearls(drops, 0.0024 * H, { w: 6, h: 4 }));
    for (let i = -3; i <= 3; i++) {
      motif(AG, J.hips, Math.PI / 2 + i * 0.07, -0.43 * H, 0.002 * H, (g) => {
        if (i % 2 === 0) quatrefoil(P, g, 0.011 * H);
        else gem(P, g, 0.005 * H, 0, 0, 0);
      });
    }
    // the apparel's frame
    const fr = (y) => path(AG, (t) => Math.PI / 2 - 0.26 + t * 0.52, y * H, y * H, 20, 0.003 * H);
    P.add(J.hips, rope(fr(-0.405), 0.0026 * H, { twist: 80, radial: 6 }));
    for (const sa of [-1, 1]) P.add(J.hips, rope(path(AG, () => Math.PI / 2 + sa * 0.26, -0.405 * H, -0.452 * H, 6, 0.003 * H), 0.0026 * H, { twist: 30, radial: 6 }));
  }
  // the amice, folded round the neck
  lathe(P, J.neck, [[0.042 * H, -0.03 * H], [0.062 * H, -0.02 * H], [0.066 * H, -0.008 * H], [0.064 * H, 0.0], [0.05 * H, 0.012 * H], [0.04 * H, 0.008 * H]], 0, 56);
  P.cyl(J.neck, 0.034 * H, 0.04 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 24);
  {
    const ring = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push(new THREE.Vector3(Math.sin(a) * 0.0655 * H, -0.009 * H, Math.cos(a) * 0.0655 * H));
    }
    P.add(J.neck, rope(ring, 0.003 * H, { closed: true, twist: 200, radial: 7, perPt: 2 }));
    P.add(J.neck, pearls(ring.filter((_, i) => i % 2 === 0).map((q) => q.clone().setY(-0.0205 * H).multiplyScalar(1)), 0.0026 * H));
  }
  pectoral(P, J.chest, H, ch);
  // the stole's ends hanging below the chasuble: spade ends, corded borders, a cross, fringe
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.position.set(s * 0.04 * H, -0.27 * H, 0.118 * H);
    st.rotation.set(0.12, 0, s * 0.03);
    J.hips.add(st);
    const L = 0.165 * H;
    const wd = (v) => 0.034 * H + 0.014 * H * Math.pow(Math.max(0, (v - 0.55) / 0.45), 1.5);
    const surf = (u, v) => new THREE.Vector3((u - 0.5) * wd(v), 0.02 * H - v * L, Math.sin(u * Math.PI * 2 + v * 3 + s) * 0.0018 * H + Math.sin(v * 9) * 0.0015 * H - (u - 0.5) ** 2 * 0.006 * H);
    P.add(st, slab(surf, 8, 30, 0.006 * H));
    // the borders, corded, and an embroidered cross
    for (const u of [0.07, 0.93]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) pts.push(surf(u, 0.25 + 0.73 * (k / 16)).add(new THREE.Vector3(0, 0, 0.0035 * H)));
      P.add(st, rope(pts, 0.0018 * H, { twist: 70, radial: 6 }));
    }
    const bot = [];
    for (let k = 0; k <= 10; k++) bot.push(surf(0.07 + 0.86 * (k / 10), 0.98).add(new THREE.Vector3(0, 0, 0.0035 * H)));
    P.add(st, rope(bot, 0.0018 * H, { twist: 50, radial: 6 }));
    const cy = 0.72, c0 = surf(0.5, cy);
    const cz = c0.z + 0.0035 * H;
    P.add(st, cord([new THREE.Vector3(0, c0.y + 0.022 * H, cz), new THREE.Vector3(0, c0.y - 0.022 * H, cz)], 0.0024 * H, { radial: 6 }));
    P.add(st, cord([new THREE.Vector3(-0.014 * H, c0.y + 0.006 * H, cz), new THREE.Vector3(0.014 * H, c0.y + 0.006 * H, cz)], 0.0024 * H, { radial: 6 }));
    P.add(st, pearls([new THREE.Vector3(0, c0.y + 0.006 * H, cz + 0.002 * H)], 0.004 * H, { w: 8, h: 6 }));
    const fr = new THREE.Group();
    fr.position.copy(surf(0.5, 1));
    st.add(fr);
    fringe(P, fr, 0.046 * H, 0.03 * H, 17, 0.0015 * H);
  }

  // ---- arms in alb sleeves; a hand raised in blessing, the other on the crozier
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    lathe(P, J['sh' + side], [[0.05 * H, 0.01 * H], [0.054 * H, -0.06 * H], [0.052 * H, -0.18 * H], [0.044 * H, -0.19 * H]], 0, 20);
    const sl = robe([[0.046 * H, 0.0], [0.052 * H, -0.08 * H], [0.058 * H, -0.135 * H], [0.054 * H, -0.15 * H], [0.034 * H, -0.15 * H], [0.034 * H, -0.12 * H]], { folds: 9, depth: 0.12, seg: 48, rows: 18, seed: s + 3, flat: 1 });
    P.add(J['el' + side], sl);
    lathe(P, J['el' + side], [[0.034 * H, -0.141 * H], [0.041 * H, -0.146 * H], [0.042 * H, -0.152 * H], [0.039 * H, -0.159 * H], [0.03 * H, -0.159 * H]], 0, 40); // cuff
    {
      const ring = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        ring.push(new THREE.Vector3(Math.sin(a) * 0.0425 * H, -0.149 * H, Math.cos(a) * 0.0425 * H));
      }
      P.add(J['el' + side], rope(ring, 0.0022 * H, { closed: true, twist: 120, radial: 6 }));
    }
    fineHand(P, J['wr' + side], 0.1 * H, s, s > 0 ? 'grip' : 'bless', { ring: s < 0 });
  }

  // ---- the head: a faceless stone mask, stern under the mitre
  const r = 0.062 * H;
  P.add(J.head, sculptHead(r, { seg: 60, blank: true }), 0, 0.05 * H, 0, 0, 0, 0, [0.94, 1.06, 1]);
  // a high, stiff amice collar standing round the neck and jaw
  P.add(J.head, outward(new THREE.LatheGeometry(V2([[0.05 * H, -0.035 * H], [0.07 * H, -0.03 * H], [0.078 * H, 0.0], [0.076 * H, 0.03 * H], [0.07 * H, 0.032 * H], [0.07 * H, 0.0], [0.055 * H, -0.03 * H]]), 48, 1.1, Math.PI * 2 - 2.2)), 0, 0.0, 0);
  // hair at the back and sides, below the mitre
  const hair = new THREE.SphereGeometry(r * 1.04, 56, 22, (Math.PI * 5) / 6, (Math.PI * 4) / 3, Math.PI * 0.3, Math.PI * 0.45);
  {
    const p = hair.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getX(i), p.getZ(i));
      const k = 1 - 0.06 * Math.abs(Math.sin(a * 14 + p.getY(i) * 60)) - 0.02 * Math.abs(Math.sin(a * 41 + p.getY(i) * 90));
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
  const mg = new THREE.ExtrudeGeometry(mi, { depth: 0.07 * H, bevelEnabled: true, bevelThickness: 0.006 * H, bevelSize: 0.005 * H, bevelSegments: 4, curveSegments: 40, steps: 10 });
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
  mitre.position.set(0, 0.091 * H, -0.006 * H);
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
    for (const y of [0.05, 0.1]) {
      const t = (y * H) / mh;
      gem(P, mitre, 0.005 * H, 0, y * H, zs * (0.047 * H * (1 - 0.75 * t * t)), zs > 0 ? 0 : Math.PI, -zs * 0.5 * t);
    }
    // corded edges up the titulus
    for (const dx of [-0.0095, 0.0095]) {
      const pts = [];
      for (let y = 0.03; y < 0.136; y += 0.008) {
        const t = (y * H) / mh;
        pts.push(new THREE.Vector3(dx * H * (1 - t * 0.45), y * H, zs * (0.0455 * H * (1 - 0.75 * t * t))));
      }
      P.add(mitre, rope(pts, 0.0019 * H, { twist: 90, radial: 6, perPt: 2 }));
    }
    gem(P, mitre, 0.007 * H, 0, 0.013 * H, zs * 0.044 * H, zs > 0 ? 0 : Math.PI);
    // and gems round the circulus
    for (const dx of [-0.032, 0.032]) gem(P, mitre, 0.0045 * H, dx * H, 0.013 * H, zs * 0.04 * H, zs > 0 ? 0 : Math.PI);
  }
  P.sphere(mitre, 0.01 * H, 0, mh + 0.006 * H, 0, null, 18); // the knop on the peak
  mitreFine(P, mitre, H, mw, mh);
  // lappets hanging behind
  for (const s of [-1, 1]) {
    const lp = new THREE.BoxGeometry(0.024 * H, 0.17 * H, 0.003 * H, 3, 28, 1);
    const p = lp.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - ((p.getY(i) / (0.17 * H) - 0.5) ** 2) * 0.03 * H + Math.sin(p.getY(i) * 90) * 0.002 * H);
    lp.computeVertexNormals();
    P.add(mitre, lp, s * 0.032 * H, -0.07 * H, -0.06 * H, 0.12, Math.PI, s * 0.05);
    P.box(mitre, 0.026 * H, 0.014 * H, 0.006 * H, s * 0.032 * H, -0.15 * H, -0.075 * H, 0.12, 0, 0);
    const fr = new THREE.Group();
    fr.position.set(s * 0.032 * H, -0.157 * H, -0.077 * H);
    fr.rotation.x = 0.12;
    mitre.add(fr);
    fringe(P, fr, 0.026 * H, 0.022 * H, 9, 0.0014 * H);
    // a little cross embroidered on each lappet
    P.box(mitre, 0.004 * H, 0.03 * H, 0.004 * H, s * 0.032 * H, -0.1 * H, -0.071 * H, 0.12, 0, 0);
    P.box(mitre, 0.018 * H, 0.004 * H, 0.004 * H, s * 0.032 * H, -0.095 * H, -0.0715 * H, 0.12, 0, 0);
  }

  // ---- the crozier in his left hand
  const cr = new THREE.Group();
  cr.name = 'weapon';
  J.wrL.add(cr);
  P.cyl(cr, 0.011 * H, 0.012 * H, 0.95 * H, 0, -0.2 * H, 0, 0, 0, 0, 20);
  for (let y = -0.6; y < 0.12; y += 0.075) P.torus(cr, 0.0118 * H, 0.0012 * H, 0, y * H, 0, Math.PI / 2 + 0.35, Math.PI * 2, 14); // a spiral binding
  P.add(cr, new THREE.ConeGeometry(0.012 * H, 0.03 * H, 10), 0, -0.69 * H, 0, Math.PI, 0, 0); // ferrule
  for (const y of [-0.45, -0.1]) lathe(P, cr, [[0.012 * H, -0.012 * H], [0.02 * H, -0.004 * H], [0.02 * H, 0.004 * H], [0.012 * H, 0.012 * H]], y * H, 18);
  // the knop, gadrooned
  {
    const kg = outward(new THREE.LatheGeometry(V2([[0.012 * H, 0], [0.018 * H, 0.004 * H], [0.025 * H, 0.013 * H], [0.03 * H, 0.025 * H], [0.03 * H, 0.034 * H], [0.025 * H, 0.046 * H], [0.018 * H, 0.055 * H], [0.014 * H, 0.06 * H]]), 64));
    const p = kg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x), t = y / (0.06 * H);
      const k = 1 + 0.09 * Math.sin(Math.PI * t) * (Math.abs(Math.sin(a * 6 + t * 1.5)) * 2 - 1);
      p.setXYZ(i, x * k, y, z * k);
    }
    kg.computeVertexNormals();
    P.add(cr, kg, 0, 0.17 * H, 0);
    for (const y of [0.17, 0.23]) P.add(cr, rope(Array.from({ length: 24 }, (_, i) => new THREE.Vector3(Math.sin((i / 24) * Math.PI * 2) * 0.0135 * H, y * H, Math.cos((i / 24) * Math.PI * 2) * 0.0135 * H)), 0.0022 * H, { closed: true, twist: 90, radial: 6 }));
  }
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
  const tube = new THREE.TubeGeometry(spiral, 120, 0.0115 * H, 16);
  {
    // the crook thins as it curls
    const p = tube.attributes.position;
    const segs = 120, rad = 16;
    const c = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      spiral.getPoint(i / segs, c);
      const k = (1 - 0.45 * (i / segs));
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
    // a crocket: three curled lobes of a leaf on the outer edge of the crook
    const lg = new THREE.Group();
    lg.position.set(cp.x + Math.cos(a) * 0.016 * H, cp.y + 0.33 * H + Math.sin(a) * 0.016 * H, 0);
    lg.rotation.z = a - Math.PI / 2;
    cr.add(lg);
    const ls = 0.012 * H * (1 - t * 0.5);
    for (const [dx, dy, k] of [[0, 0.3, 1], [-0.55, -0.1, 0.75], [0.55, -0.1, 0.75]]) {
      const leaf = new THREE.SphereGeometry(ls * k, 10, 7);
      leaf.scale(0.6, 1.3, 0.45);
      P.add(lg, leaf, dx * ls, dy * ls, 0, 0, 0, -dx * 0.6);
    }
  }
  // the rosette in the curl
  spiral.getPoint(1, cp);
  const ctr = new THREE.Vector3(cp.x, cp.y + 0.33 * H, 0);
  P.sphere(cr, 0.009 * H, ctr.x, ctr.y, ctr.z, null, 16);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P.sphere(cr, 0.006 * H, ctr.x + Math.cos(a) * 0.012 * H, ctr.y + Math.sin(a) * 0.012 * H, 0, [1, 1, 0.5], 12);
  }
  crozierFine(P, cr, H, spiral, R0);
  cr.position.set(0, -0.035 * H, 0.025 * H);
  cr.userData.tip = [0, 0.37 * H, 0];
  J.weapon = cr;
  return { H, legs, style: 'one', hand: 'L' };
}

// The pawn: a stern foot soldier, faceless in a closed helm, a short sword in his right hand and
// a round shield on his left arm. A
// coat of scales under a tabard with corded edges and a device, split before and behind; a
// mail collar, mail sleeves and a mail skirt; spaulders, couters, vambraces and poleyns of
// plate with rolled, riveted and engraved edges; gauntlets closed round the grips; a belt
// with a buckle, a pouch and a dagger; hose over muscled legs and turned-down boots. A combed,
// close helm with a riveted band over a visor with a narrow vision slit and breaths. A short arming
// sword with a fullered blade; a dished, riveted shield with a boss.
// (Carved on the shared skeleton: joint names and positions are what statues.js animates.)
import * as THREE from 'three';
import { carve, skeleton } from '../carving.js';
import { bead, boot, lathe, muscleLimb, outward, robe, sculptHead, sword } from './bp_kit.js';
import { cord, denseProfile, pearls, rope, rivetRing, scaleCoat, turnedSurface } from './bp_fine.js';
import { arc, cop, gauntlet, spaulder, tabardEdges, tabardPanel, vambrace, visor } from './bp_pawn.js';

export function pawn(J, root, P) {
  const H = 0.6;
  const legs = skeleton(J, root, H);

  // ---- the coat of scales
  const TP = [[0.0001, -0.005], [0.096, -0.005], [0.106, 0.05], [0.124, 0.11], [0.136, 0.16], [0.14, 0.19], [0.122, 0.218], [0.08, 0.245], [0.052, 0.27], [0.0001, 0.272]];
  const body = outward(new THREE.LatheGeometry(denseProfile(TP.map(([r, y]) => [r * H, y * H]), 26), 40));
  body.scale(1, 1, 0.8);
  P.add(J.spine, body);
  // the scales, in staggered rows, each overlapping the one below (left out under the tabard)
  P.add(J.spine, scaleCoat(turnedSurface(TP.slice(1, 8).map(([r, y]) => [r * H, y * H]), 0.8, -0.005 * H), { y0: 0.19 * H, rows: 10, pitch: 0.02 * H, cols: 24, skip: (q) => Math.abs(q.x) < 0.056 * H }));
  // the tabard over it, before and behind, with a device on the breast
  const TPs = TP.slice(1, 8).map(([r, y]) => [r * H, y * H]);
  for (const side of [1, -1]) {
    const { g, at } = tabardPanel(TPs, 0.8, -0.068 * H, 0.068 * H, 0.232 * H, -0.02 * H, side, 0.007 * H, { folds: 0.0025 * H, seed: side, nu: 12, nv: 18 });
    P.add(J.spine, g);
    tabardEdges(P, J.spine, at, H, 'lrt');
    if (side > 0) {
      // the device: a cross within a corded roundel, pearls in the quarters
      const c = at(0.5, 0.38, 0.003 * H);
      const ring = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const u = 0.5 + Math.cos(a) * 0.24, v = 0.38 + Math.sin(a) * 0.13;
        ring.push(at(u, v, 0.003 * H));
      }
      P.add(J.spine, rope(ring, 0.0026 * H, { closed: true, twist: 90, radial: 6, perPt: 2 }));
      const L = (u0, v0, u1, v1) => [at(u0, v0, 0.0034 * H), at((u0 + u1) / 2, (v0 + v1) / 2, 0.0034 * H), at(u1, v1, 0.0034 * H)];
      P.add(J.spine, cord(L(0.5, 0.27, 0.5, 0.49), 0.004 * H, { radial: 6, perPt: 2 }));
      P.add(J.spine, cord(L(0.3, 0.38, 0.7, 0.38), 0.004 * H, { radial: 6, perPt: 2 }));
      P.add(J.spine, pearls([[0.38, 0.32], [0.62, 0.32], [0.38, 0.44], [0.62, 0.44]].map(([u, v]) => at(u, v, 0.003 * H)), 0.0032 * H, { w: 8, h: 5 }));
      void c;
    }
  }
  // the lower tabard: split before (each half rides on its thigh), whole behind
  const SK = [[0.1 * H, 0.05 * H], [0.112 * H, -0.02 * H], [0.13 * H, -0.1 * H], [0.142 * H, -0.15 * H], [0.146 * H, -0.2 * H]];
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hipX = s * 0.055 * H, hipY = -0.02 * H;
    const x0 = s > 0 ? 0.006 * H : -0.07 * H, x1 = s > 0 ? 0.07 * H : -0.006 * H;
    const { g, at } = tabardPanel(SK, 0.86, x0, x1, 0.035 * H, -0.168 * H, 1, 0.012 * H, { folds: 0.004 * H, seed: s * 2, nu: 10, nv: 18 });
    g.translate(-hipX, -hipY, 0);
    P.add(J['hip' + side], g);
    const sh = (q) => q.add(new THREE.Vector3(-hipX, -hipY, 0));
    tabardEdges(P, J['hip' + side], (u, v, d) => sh(at(u, v, d)), H, s > 0 ? 'lb' : 'rb');
  }
  {
    const { g, at } = tabardPanel(SK, 0.86, -0.07 * H, 0.07 * H, 0.035 * H, -0.168 * H, -1, 0.012 * H, { folds: 0.004 * H, seed: 5, nu: 12, nv: 16 });
    P.add(J.hips, g);
    tabardEdges(P, J.hips, at, H, 'lrb');
  }
  // shoulders: a mail mass on the body, so a raised arm never opens a gap, and the spaulders
  for (const s of [-1, 1]) {
    const side = s > 0 ? 'L' : 'R';
    P.add(J.chest, new THREE.SphereGeometry(0.056 * H, 24, 16), s * 0.125 * H, 0.09 * H, 0, 0, 0, 0, [0.9, 0.95, 0.85]);
    spaulder(P, J['sh' + side], H, s);
  }
  // a standing collar of scales, its top edge bound with a riveted band
  const CP = [[0.04, -0.03], [0.058, -0.025], [0.062, 0.0], [0.056, 0.02], [0.044, 0.024]].map(([r, y]) => [r * H, y * H]);
  P.add(J.neck, outward(new THREE.LatheGeometry(denseProfile(CP, 8), 32)));
  P.add(J.neck, scaleCoat(turnedSurface(CP.slice(1, 4), 1, -0.002 * H), { y0: 0.018 * H, rows: 2, pitch: 0.017 * H, cols: 16 }));
  P.add(J.neck, cord(arc(0.05 * H, 0.022 * H, 0, Math.PI * 2, 40), 0.004 * H, { closed: true, radial: 6, perPt: 1.2 }));
  P.add(J.neck, rivetRing(0.054 * H, 0.022 * H, 14, 0.0028 * H));
  P.cyl(J.neck, 0.036 * H, 0.044 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 16);
  // the skirt of scales from the belt, flaring, over a lining (left out under the back tabard)
  const skirt = outward(new THREE.LatheGeometry(denseProfile([[0.1, 0.05], [0.112, -0.02], [0.13, -0.1], [0.138, -0.15], [0.124, -0.152], [0.114, -0.1]].map(([r, y]) => [r * H, y * H]), 18), 40));
  skirt.scale(1, 1, 0.86);
  P.add(J.hips, skirt);
  P.add(J.hips, scaleCoat(turnedSurface([[0.1 * H, 0.05 * H], [0.112 * H, -0.02 * H], [0.13 * H, -0.1 * H], [0.142 * H, -0.15 * H]], 0.86, -0.005 * H), { y0: 0.03 * H, rows: 8, pitch: 0.021 * H, cols: 24, skip: (q) => q.z < 0 && Math.abs(q.x) < 0.058 * H }));
  // belt, buckle, pouch, dagger
  P.belt(J.hips, 0.104 * H, 0.03 * H);
  // the belt's tongue hanging from the buckle, with its strap end and studs
  P.box(J.hips, 0.014 * H, 0.05 * H, 0.004 * H, 0.012 * H, 0.0, 0.087 * H, 0.15, 0, 0.1);
  P.box(J.hips, 0.016 * H, 0.012 * H, 0.006 * H, 0.014 * H, -0.026 * H, 0.091 * H, 0.15, 0, 0.1);
  for (let i = 0; i < 8; i++) {
    const a = 0.5 + i * 0.32;
    bead(P, J.hips, 0.0035 * H, Math.cos(a) * 0.107 * H, 0.03 * H, Math.sin(a) * 0.107 * H * 0.8 + 0.0);
  }
  const pouch = new THREE.CapsuleGeometry(0.022 * H, 0.02 * H, 4, 10);
  pouch.scale(1, 1, 0.6);
  P.add(J.hips, pouch, 0.085 * H, -0.0 * H, 0.06 * H, 0, -0.6, 0);
  for (let i = 0; i < 5; i++) bead(P, J.hips, 0.0025 * H, 0.085 * H + Math.cos(-0.6) * (i - 2) * 0.008 * H, 0.012 * H, 0.06 * H + 0.014 * H + Math.sin(0.6) * (i - 2) * 0.008 * H); // stitching
  P.box(J.hips, 0.04 * H, 0.012 * H, 0.03 * H, 0.085 * H, 0.025 * H, 0.06 * H, 0, -0.6, 0); // its flap
  const dg = new THREE.Group();
  dg.position.set(-0.1 * H, 0.0, 0.03 * H);
  dg.rotation.set(0.2, 0.3, -0.15);
  J.hips.add(dg);
  P.cyl(dg, 0.009 * H, 0.006 * H, 0.09 * H, 0, -0.05 * H, 0, 0, 0, 0, 8); // scabbard
  P.cyl(dg, 0.007 * H, 0.007 * H, 0.03 * H, 0, 0.012 * H, 0, 0, 0, 0, 8);
  P.sphere(dg, 0.009 * H, 0, 0.03 * H, 0, null, 8);
  P.box(dg, 0.04 * H, 0.008 * H, 0.01 * H, 0, -0.004 * H, 0);

  // ---- arms: mail sleeves, plate couters and vambraces, gauntlets round the hilts
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const ua = muscleLimb(0.18 * H, 0.056 * H, 0.046 * H, { bulge: 0.16, at: 0.35, seg: 20, rows: 12 });
    P.add(J['sh' + side], ua);
    P.add(J['sh' + side], scaleCoat(limbSurface(0.18 * H, 0.056 * H, 0.046 * H, 0.16, 0.35, -0.005 * H), { y0: -0.004 * H, rows: 9, pitch: 0.018 * H, cols: 10 }));
    const fa = muscleLimb(0.155 * H, 0.046 * H, 0.036 * H, { bulge: 0.2, at: 0.2, seg: 20, rows: 12 });
    P.add(J['el' + side], fa);
    P.add(J['el' + side], scaleCoat(limbSurface(0.155 * H, 0.046 * H, 0.036 * H, 0.2, 0.2, -0.004 * H), { y0: 0.0, rows: 3, pitch: 0.019 * H, cols: 8 }));
    cop(P, J['el' + side], H, 0.046 * H, s, false, { z: -0.012 * H, wing: 1.2 });
    vambrace(P, J['el' + side], H, -0.062 * H, -0.15 * H, 0.047 * H, 0.04 * H);
    gauntlet(P, J['wr' + side], H, 0.1 * H, s);
  }

  // ---- legs: hose over muscled thighs and calves, knee cops, boots
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const th = muscleLimb(0.225 * H, 0.066 * H, 0.048 * H, { bulge: 0.14, at: 0.28, seg: 24, rows: 14 });
    carve(th, 0.0025 * H, 50 / H);
    P.add(J['hip' + side], th);
    const sh = muscleLimb(0.215 * H, 0.05 * H, 0.038 * H, { bulge: 0.08, at: 0.3, back: 0.3, seg: 24, rows: 14 });
    P.add(J['knee' + side], sh);
    // a plate poleyn with a fluted wing, strapped behind the knee
    cop(P, J['knee' + side], H, 0.052 * H, s, true, { z: 0.012 * H, wing: 1.2 });
    P.add(J['knee' + side], cord(arc(0.052 * H, -0.03 * H, 0, Math.PI * 2, 28), 0.0035 * H, { closed: true, radial: 6, perPt: 1.2 }));
    P.add(J['knee' + side], cord(arc(0.051 * H, 0.03 * H, 0, Math.PI * 2, 28), 0.0035 * H, { closed: true, radial: 6, perPt: 1.2 }));
    boot(P, J['knee' + side], J['ankle' + side], H, 0.215 * H);
    // the boot laced up the front, with a buckled strap round the cuff
    for (let i = 0; i < 6; i++) {
      for (const sg of [-1, 1]) P.box(J['knee' + side], 0.026 * H, 0.0025 * H, 0.003 * H, 0, -0.215 * H * 0.62 - i * 0.012 * H, 0.046 * H - i * 0.0005 * H, 0, 0, sg * 0.5);
    }
    P.torus(J['knee' + side], 0.062 * H, 0.004 * H, 0, -0.215 * H * 0.49, 0, Math.PI / 2, Math.PI * 2, 24);
    P.box(J['knee' + side], 0.012 * H, 0.012 * H, 0.004 * H, s * 0.055 * H, -0.215 * H * 0.49, 0.022 * H, 0, s * 1.1, 0);
  }

  // ---- no face: a closed helm. A tall, faintly pointed skull with a raised comb, coming down
  // over the sides and the nape, the visor before it with only a narrow slit to see through
  const r = 0.062 * H;
  P.add(J.head, new THREE.SphereGeometry(r * 0.92, 20, 14), 0, 0.05 * H, 0, 0, 0, 0, [0.9, 1.1, 0.95]); // the dark inside of the helm
  visor(P, J.head, H, 0.05 * H);
  const helm = new THREE.Group();
  helm.position.set(0, 0.05 * H, -0.004 * H);
  J.head.add(helm);
  // the skull: whole above the visor, open in front below it (where the visor closes it)
  const top = [[0.0001, 0.142 * H], [0.012 * H, 0.138 * H], [0.034 * H, 0.122 * H], [0.056 * H, 0.098 * H], [0.07 * H, 0.074 * H], [0.077 * H, 0.052 * H]];
  P.add(helm, outward(new THREE.LatheGeometry(top.map(([x, y]) => new THREE.Vector2(x, y)), 56)));
  const sides = [[0.077 * H, 0.054 * H], [0.079 * H, 0.03 * H], [0.08 * H, 0.0], [0.078 * H, -0.03 * H], [0.074 * H, -0.058 * H], [0.08 * H, -0.07 * H], [0.084 * H, -0.074 * H]];
  P.add(helm, outward(new THREE.LatheGeometry(sides.map(([x, y]) => new THREE.Vector2(x, y)), 48, 1.05, Math.PI * 2 - 2.1)));
  // a band round the brow with rivets, and a flared, rolled lower edge
  P.add(helm, cord(arc(0.0785 * H, 0.052 * H, 0, Math.PI * 2, 56), 0.0026 * H, { closed: true, radial: 6, perPt: 1.2 }));
  P.add(helm, rivetRing(0.0795 * H, 0.04 * H, 18, 0.0026 * H, { from: 1.15, to: Math.PI * 2 - 1.15 }));
  P.add(helm, cord(arc(0.084 * H, -0.074 * H, 1.05, Math.PI * 2 - 1.05, 48), 0.0032 * H, { radial: 6, perPt: 1.2 }));
  // the comb: a low ridge from brow to nape
  {
    const comb = new THREE.Shape();
    comb.moveTo(-0.07 * H, 0);
    comb.bezierCurveTo(-0.05 * H, 0.04 * H, 0.04 * H, 0.05 * H, 0.07 * H, 0);
    const cg = new THREE.ExtrudeGeometry(comb, { depth: 0.006 * H, bevelEnabled: true, bevelThickness: 0.002 * H, bevelSize: 0.0018 * H, bevelSegments: 2, curveSegments: 24 });
    cg.translate(0, 0, -0.003 * H);
    P.add(helm, cg, 0, 0.095 * H, 0, 0, Math.PI / 2, 0);
  }

  // ---- a short sword in the right hand, a round shield strapped to the left forearm
  const bR = sword(P, J.wrR, H, 0.32, 'weapon');
  bR.position.set(0, -0.032 * H, 0.03 * H);
  const sh = new THREE.Group();
  sh.name = 'weapon2';
  sh.position.set(0.034 * H, 0.05 * H, 0.0);
  J.wrL.add(sh);
  {
    const R = 0.15 * H;
    // dished, with a raised rim, a boss and a ring of rivets; its face looks outward (+x)
    const face = outward(new THREE.LatheGeometry([[0.0001, 0.022], [0.12, 0.021], [0.3, 0.017], [0.6, 0.011], [0.86, 0.006], [0.9, 0.012], [0.97, 0.014], [1.0, 0.006], [1.0, 0.0], [0.0001, 0.0]].map(([x, y]) => new THREE.Vector2(x * R, y * H * 0.9)), 56));
    face.rotateZ(-Math.PI / 2);
    P.add(sh, face);
    const boss = new THREE.SphereGeometry(0.045 * H, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    boss.rotateZ(-Math.PI / 2);
    P.add(sh, boss, 0.018 * H, 0, 0, 0, 0, 0, [0.7, 1, 1]);
    const ring = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ring.push(new THREE.Vector3(0.012 * H, Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78));
    }
    P.add(sh, pearls(ring, 0.004 * H, { w: 7, h: 4 }));
    // a cross of iron bands from the boss to the rim
    for (const a of [0, Math.PI / 2]) P.box(sh, 0.004 * H, Math.cos(a) * R * 1.7 + 0.008 * H, Math.sin(a) * R * 1.7 + 0.008 * H, 0.013 * H, 0, 0);
  }
  J.weapon = bR;
  J.weapon2 = sh;
  return { H, legs, style: 'dual' };
}

// the surface of a muscleLimb (hanging -y from its joint), for laying scales on it
function limbSurface(len, r0, r1, bulge, at, grow) {
  return (a, y) => {
    const t = Math.max(0, Math.min(1, -y / len));
    const r = r0 + (r1 - r0) * t + r0 * bulge * Math.exp(-(((t - at) / 0.22) ** 2)) + grow;
    return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  };
}

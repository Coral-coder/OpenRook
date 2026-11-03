// The pawn: a sturdy foot soldier who waits crouched behind his blades and rises to fight. A
// coat of scales under a tabard with corded edges and a device, split before and behind; a
// mail collar, mail sleeves and a mail skirt; spaulders, couters, vambraces and poleyns of
// plate with rolled, riveted and engraved edges; gauntlets closed round the grips; a belt
// with a buckle, a pouch and a dagger; hose over muscled legs and turned-down boots. A combed
// kettle hat with a riveted band over a visor with a vision slit and breaths. Two arming
// swords with fullered, inscribed blades.
// (Carved on the shared skeleton: joint names and positions are what statues.js animates.)
import * as THREE from 'three';
import { carve, skeleton } from '../carving.js';
import { bead, boot, lathe, muscleLimb, outward, robe, sculptHead, sword } from './bp_kit.js';
import { chain, cord, denseProfile, pearls, rope, rivetRing } from './bp_fine.js';
import { arc, cop, gauntlet, spaulder, tabardEdges, tabardPanel, vambrace, visor } from './bp_pawn.js';

export function pawn(J, root, P) {
  const H = 0.6;
  const legs = skeleton(J, root, H);

  // ---- the coat of scales
  const TP = [[0.0001, -0.005], [0.096, -0.005], [0.106, 0.05], [0.124, 0.11], [0.136, 0.16], [0.14, 0.19], [0.122, 0.218], [0.08, 0.245], [0.052, 0.27], [0.0001, 0.272]];
  const body = outward(new THREE.LatheGeometry(denseProfile(TP.map(([r, y]) => [r * H, y * H]), 46), 80));
  chain(body, 20, 0.024 * H, 0.009 * H, { kind: 'scale', y0: 0.255 * H, y1: 0.0 });
  body.scale(1, 1, 0.8);
  P.add(J.spine, body);
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
    P.add(J.chest, chain(new THREE.SphereGeometry(0.056 * H, 32, 18), 8, 0.017 * H, 0.006 * H, { kind: 'scale', y0: 0.02 * H }), s * 0.125 * H, 0.09 * H, 0, 0, 0, 0, [0.9, 0.95, 0.85]);
    spaulder(P, J['sh' + side], H, s);
  }
  // a standing mail collar, its top edge bound with a riveted band
  const collar = outward(new THREE.LatheGeometry(denseProfile([[0.04, -0.03], [0.058, -0.025], [0.062, 0.0], [0.056, 0.02], [0.044, 0.024]].map(([r, y]) => [r * H, y * H]), 16), 48));
  chain(collar, 12, 0.012 * H, 0.006 * H, { y0: 0.019 * H });
  P.add(J.neck, collar);
  P.add(J.neck, cord(arc(0.05 * H, 0.022 * H, 0, Math.PI * 2, 40), 0.004 * H, { closed: true, radial: 6, perPt: 1.2 }));
  P.add(J.neck, rivetRing(0.054 * H, 0.022 * H, 14, 0.0028 * H));
  P.cyl(J.neck, 0.036 * H, 0.044 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 16);
  // the mail skirt from the belt, flaring, with a dagged hem of brass links
  const skirt = robe([[0.1 * H, 0.05 * H], [0.112 * H, -0.02 * H], [0.13 * H, -0.1 * H], [0.142 * H, -0.15 * H], [0.13 * H, -0.152 * H], [0.118 * H, -0.1 * H]], { folds: 10, depth: 0.05, seg: 96, rows: 27, seed: 7, flat: 0.86, hemWave: 0 });
  chain(skirt, 24, 0.02 * H, 0.007 * H, { y0: 0.03 * H, y1: -0.149 * H });
  P.add(J.hips, skirt);
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
    const ua = muscleLimb(0.18 * H, 0.056 * H, 0.046 * H, { bulge: 0.16, at: 0.35, seg: 48, rows: 30 });
    chain(ua, 12, 0.017 * H, 0.0075 * H, { kind: 'scale', y0: 0.0 });
    P.add(J['sh' + side], ua);
    const fa = muscleLimb(0.155 * H, 0.046 * H, 0.036 * H, { bulge: 0.2, at: 0.2, seg: 32, rows: 16 });
    chain(fa, 8, 0.017 * H, 0.006 * H, { kind: 'scale', y0: 0.0, y1: -0.07 * H });
    P.add(J['el' + side], fa);
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

  // ---- the head under a kettle hat, the face behind a visor
  const r = 0.062 * H;
  P.add(J.head, sculptHead(r, { seg: 32 }), 0, 0.05 * H, 0);
  // hair at the nape
  const hair = new THREE.SphereGeometry(r * 1.03, 28, 10, (Math.PI * 5) / 6, (Math.PI * 4) / 3, Math.PI * 0.35, Math.PI * 0.3);
  carve(hair, r * 0.06, 20 / r);
  P.add(J.head, hair, 0, 0.05 * H, 0);
  visor(P, J.head, H, 0.05 * H);
  const hat = new THREE.Group();
  hat.position.set(0, 0.05 * H, -0.004 * H);
  hat.rotation.x = -0.42; // tipped well back, so the visor shows under the brim
  hat.position.y += 0.006 * H;
  J.head.add(hat);
  // the dome, the band with its rivets, the wide sloping brim with a rolled edge, the comb
  lathe(P, hat, [[0.0001, 0.115 * H], [0.03 * H, 0.112 * H], [0.058 * H, 0.096 * H], [0.074 * H, 0.066 * H], [0.078 * H, 0.04 * H], [0.077 * H, 0.03 * H]], 0, 56);
  lathe(P, hat, [[0.079 * H, 0.026 * H], [0.081 * H, 0.03 * H], [0.081 * H, 0.046 * H], [0.078 * H, 0.05 * H]], 0, 64);
  P.add(hat, rivetRing(0.0818 * H, 0.038 * H, 20, 0.0038 * H));
  // engraved lines round the band and the dome
  for (const [rr, y] of [[0.0815, 0.0285], [0.0815, 0.0475]]) P.add(hat, cord(arc(rr * H, y * H, 0, Math.PI * 2, 48), 0.0011 * H, { closed: true, radial: 5, perPt: 1.2 }));
  // the dome's riveted seams, front to back and side to side, each a raised strap
  for (const [cx, cz] of [[1, 0], [0, 1]]) {
    const seam = [], rv = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI - Math.PI / 2;
      const y = 0.04 * H + Math.cos(t) * 0.075 * H;
      const rr = Math.sin(t) * (0.0772 + 0.0012 * Math.cos(t)) * H;
      seam.push(new THREE.Vector3(cx * rr, y + Math.cos(t) * 0.001 * H, cz * rr));
      if (i % 3 === 0 && i > 0 && i < 24) rv.push(new THREE.Vector3(cx * rr * 1.02, y + 0.0015 * H, cz * rr * 1.02));
    }
    if (cz) P.add(hat, cord(seam, 0.0026 * H, { radial: 6, perPt: 2 })); // (the side seam is under the comb)
    P.add(hat, pearls(rv, 0.003 * H, { w: 7, h: 4 }));
  }
  lathe(P, hat, [[0.077 * H, 0.03 * H], [0.098 * H, 0.016 * H], [0.11 * H, 0.007 * H], [0.114 * H, 0.0], [0.11 * H, 0.001 * H], [0.098 * H, 0.008 * H], [0.077 * H, 0.022 * H]], 0, 64);
  P.add(hat, cord(arc(0.1135 * H, 0.0025 * H, 0, Math.PI * 2, 64), 0.0032 * H, { closed: true, radial: 6, perPt: 1.2 })); // the rolled edge
  P.add(hat, rivetRing(0.1 * H, 0.0145 * H, 24, 0.0026 * H));
  // the comb: a tall ridge from brow to nape, with a roped crest and rivets along its foot
  const comb = new THREE.Shape();
  comb.moveTo(-0.075 * H, 0);
  comb.bezierCurveTo(-0.05 * H, 0.06 * H, 0.04 * H, 0.08 * H, 0.075 * H, 0);
  const cg = new THREE.ExtrudeGeometry(comb, { depth: 0.008 * H, bevelEnabled: true, bevelThickness: 0.0025 * H, bevelSize: 0.002 * H, bevelSegments: 3, curveSegments: 28 });
  cg.translate(0, 0, -0.004 * H);
  P.add(hat, cg, 0, 0.058 * H, 0, 0, Math.PI / 2, 0);
  {
    const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.058 * H, 0.075 * H), new THREE.Vector3(0, 0.118 * H, 0.05 * H), new THREE.Vector3(0, 0.138 * H, -0.04 * H), new THREE.Vector3(0, 0.058 * H, -0.075 * H));
    const pts = cv.getPoints(30).map((q) => q.clone().setY(q.y + 0.0016 * H));
    P.add(hat, rope(pts, 0.0034 * H, { twist: 90, radial: 6, perPt: 2 }));
    const rv = [];
    for (let i = 1; i < 8; i++) {
      const t = (i / 8) * Math.PI - Math.PI / 2;
      for (const sx of [-1, 1]) rv.push(new THREE.Vector3(sx * 0.0072 * H, 0.04 * H + Math.cos(t) * 0.0755 * H, Math.sin(t) * 0.0755 * H));
    }
    P.add(hat, pearls(rv, 0.0026 * H, { w: 7, h: 4 }));
  }
  // chin strap
  P.add(hat, new THREE.TorusGeometry(0.066 * H, 0.0035 * H, 6, 32, Math.PI), 0, 0.03 * H, 0.004 * H, Math.PI, Math.PI / 2, 0, [1, 1.35, 1]);

  // ---- two arming swords
  const bL = sword(P, J.wrL, H, 0.42, 'weapon2');
  bL.position.set(0, -0.032 * H, 0.03 * H);
  const bR = sword(P, J.wrR, H, 0.42, 'weapon');
  bR.position.set(0, -0.032 * H, 0.03 * H);
  J.weapon = bR;
  J.weapon2 = bL;
  return { H, legs, style: 'dual' };
}

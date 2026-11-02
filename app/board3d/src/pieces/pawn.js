// The pawn: a sturdy foot soldier who waits crouched behind his blades and rises to fight. A
// quilted gambeson buttoned down the front, with a padded collar, quilted sleeves and a
// quilted skirt; a belt with a buckle, a pouch and a dagger; leather bracers; hose over
// muscled legs, leather knee cops, turned-down boots. A young face under a combed kettle hat
// with a riveted band and a chin strap. Two arming swords with fullered blades.
// (Carved on the shared skeleton: joint names and positions are what statues.js animates.)
import * as THREE from 'three';
import { carve, skeleton } from '../carving.js';
import { bead, boot, eyes, fineHand, lathe, muscleLimb, outward, quilt, robe, sculptHead, sword } from './bp_kit.js';

export function pawn(J, root, P) {
  const H = 0.6;
  const legs = skeleton(J, root, H);

  // ---- the gambeson
  const body = new THREE.LatheGeometry(
    [[0.0001, -0.005], [0.096, -0.005], [0.106, 0.05], [0.124, 0.11], [0.136, 0.16], [0.14, 0.19], [0.122, 0.218], [0.08, 0.245], [0.052, 0.27], [0.0001, 0.272]]
      .flatMap(([r, y], i, a) => {
        if (i === a.length - 1) return [new THREE.Vector2(r * H, y * H)];
        const [r1, y1] = a[i + 1];
        return [0, 1, 2, 3, 4, 5].map((k) => new THREE.Vector2((r + ((r1 - r) * k) / 6) * H, (y + ((y1 - y) * k) / 6) * H));
      }),
    56,
  );
  outward(body);
  quilt(body, 24, 0.0, 0.045); // vertical channels
  quilt(body, 0, 0.034 * H, 0.025); // and rows
  body.scale(1, 1, 0.8);
  P.add(J.spine, body);
  for (let i = 0; i < 6; i++) P.sphere(J.spine, 0.006 * H, 0, 0.03 * H + i * 0.03 * H, (0.106 + (i > 1 ? 0.014 : 0) + (i > 3 ? 0.006 : 0)) * H * 0.8 + 0.006 * H, [1, 1, 0.6], 8); // buttons
  // padded shoulders
  for (const s of [-1, 1]) {
    const side = s > 0 ? 'L' : 'R';
    // the shoulder's padded mass, on the body, so a raised arm never opens a gap
    P.add(J.chest, quilt(new THREE.SphereGeometry(0.056 * H, 20, 14), 10, 0, 0.03), s * 0.125 * H, 0.09 * H, 0, 0, 0, 0, [0.9, 0.95, 0.85]);
    for (let k = 0; k < 3; k++) {
      const lame = quilt(new THREE.SphereGeometry(0.054 * H - k * 0.003 * H, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), 14, 0, 0.03);
      P.add(J['sh' + side], lame, 0, 0.006 * H - k * 0.02 * H, 0, 0, 0, s * 0.1, [1.0, 0.42, 0.95]);
    }
    for (let i = 0; i < 5; i++) bead(P, J['sh' + side], 0.004 * H, s * 0.01 * H, 0.005 * H, -0.03 * H + i * 0.015 * H); // stitched seam
  }
  // padded collar
  const collar = new THREE.LatheGeometry([[0.04, -0.03], [0.058, -0.025], [0.062, 0.0], [0.056, 0.02], [0.044, 0.024]].map(([r, y]) => new THREE.Vector2(r * H, y * H)), 32);
  outward(collar);
  quilt(collar, 18, 0, 0.06);
  P.add(J.neck, collar);
  P.cyl(J.neck, 0.036 * H, 0.044 * H, 0.06 * H, 0, 0, 0, 0, 0, 0, 16);
  // quilted skirt from the belt (open at the hem, flaring, split a little at the front)
  const skirt = robe([[0.1 * H, 0.05 * H], [0.112 * H, -0.02 * H], [0.13 * H, -0.1 * H], [0.142 * H, -0.15 * H], [0.13 * H, -0.152 * H], [0.118 * H, -0.1 * H]], { folds: 10, depth: 0.05, seg: 56, rows: 14, seed: 7, flat: 0.86 });
  quilt(skirt, 18, 0.045 * H, 0.04);
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

  // ---- arms: quilted sleeves, leather bracers, fists round the hilts
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const ua = muscleLimb(0.18 * H, 0.056 * H, 0.046 * H, { bulge: 0.16, at: 0.35, seg: 24, rows: 14 });
    quilt(ua, 12, 0, 0.035);
    P.add(J['sh' + side], ua);
    const fa = muscleLimb(0.155 * H, 0.046 * H, 0.036 * H, { bulge: 0.2, at: 0.2, seg: 24, rows: 14 });
    carve(fa, 0.002 * H, 60 / H);
    P.add(J['el' + side], fa);
    // leather bracer, laced
    lathe(P, J['el' + side], [[0.04 * H, -0.075 * H], [0.047 * H, -0.08 * H], [0.044 * H, -0.15 * H], [0.038 * H, -0.156 * H], [0.034 * H, -0.15 * H]], 0, 22);
    for (let i = 0; i < 4; i++) P.box(J['el' + side], 0.03 * H, 0.003 * H, 0.004 * H, 0, -0.09 * H - i * 0.016 * H, -0.046 * H, 0, 0, (i % 2 ? 1 : -1) * 0.5);
    fineHand(P, J['wr' + side], 0.1 * H, s, 'grip');
  }

  // ---- legs: hose over muscled thighs and calves, knee cops, boots
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const th = muscleLimb(0.225 * H, 0.066 * H, 0.048 * H, { bulge: 0.14, at: 0.28, seg: 24, rows: 14 });
    carve(th, 0.0025 * H, 50 / H);
    P.add(J['hip' + side], th);
    const sh = muscleLimb(0.215 * H, 0.05 * H, 0.038 * H, { bulge: 0.08, at: 0.3, back: 0.3, seg: 24, rows: 14 });
    P.add(J['knee' + side], sh);
    // a hardened-leather knee cop with a strap
    const cop = new THREE.SphereGeometry(0.05 * H, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    P.add(J['knee' + side], cop, 0, 0, 0.014 * H, Math.PI / 2, 0, 0, [1, 1, 0.75]);
    P.torus(J['knee' + side], 0.052 * H, 0.004 * H, 0, -0.03 * H, 0, Math.PI / 2, Math.PI * 2, 20);
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.36; // rivets round the cop
      bead(P, J['knee' + side], 0.0035 * H, Math.sin(a) * 0.046 * H, 0.0, Math.cos(a) * 0.046 * H * 0.75 + 0.014 * H);
    }
    boot(P, J['knee' + side], J['ankle' + side], H, 0.215 * H);
    // the boot laced up the front, with a buckled strap round the cuff
    for (let i = 0; i < 6; i++) {
      for (const sg of [-1, 1]) P.box(J['knee' + side], 0.026 * H, 0.0025 * H, 0.003 * H, 0, -0.215 * H * 0.62 - i * 0.012 * H, 0.046 * H - i * 0.0005 * H, 0, 0, sg * 0.5);
    }
    P.torus(J['knee' + side], 0.062 * H, 0.004 * H, 0, -0.215 * H * 0.49, 0, Math.PI / 2, Math.PI * 2, 24);
    P.box(J['knee' + side], 0.012 * H, 0.012 * H, 0.004 * H, s * 0.055 * H, -0.215 * H * 0.49, 0.022 * H, 0, s * 1.1, 0);
  }

  // ---- the head under a kettle hat
  const r = 0.062 * H;
  P.add(J.head, sculptHead(r, { seg: 44 }), 0, 0.05 * H, 0);
  eyes(P, J.head, r, 0, 0.05 * H, 0, { look: 0 });
  // a stern brow and a set jaw
  P.add(J.head, new THREE.CapsuleGeometry(0.008 * H, 0.04 * H, 4, 10), 0, 0.05 * H + r * 0.36, r * 0.86, 0.15, 0, Math.PI / 2, [1, 1, 0.55]);
  // hair at the nape
  const hair = new THREE.SphereGeometry(r * 1.03, 24, 12, (Math.PI * 5) / 6, (Math.PI * 4) / 3, Math.PI * 0.35, Math.PI * 0.3);
  carve(hair, r * 0.06, 20 / r);
  P.add(J.head, hair, 0, 0.05 * H, 0);
  const hat = new THREE.Group();
  hat.position.set(0, 0.05 * H, -0.004 * H);
  hat.rotation.x = -0.42; // tipped well back, so the face shows under the brim
  hat.position.y += 0.006 * H;
  J.head.add(hat);
  // the dome, the band with its rivets, the wide sloping brim with a rolled edge, the comb
  lathe(P, hat, [[0.0001, 0.115 * H], [0.03 * H, 0.112 * H], [0.058 * H, 0.096 * H], [0.074 * H, 0.066 * H], [0.078 * H, 0.04 * H], [0.077 * H, 0.03 * H]], 0, 48);
  lathe(P, hat, [[0.079 * H, 0.026 * H], [0.081 * H, 0.03 * H], [0.081 * H, 0.046 * H], [0.078 * H, 0.05 * H]], 0, 32);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    P.add(hat, new THREE.SphereGeometry(0.0038 * H, 6, 4), Math.sin(a) * 0.0818 * H, 0.038 * H, Math.cos(a) * 0.0818 * H);
  }
  // the dome's riveted seams, front to back and side to side
  for (let i = 1; i < 8; i++) {
    const t = (i / 8) * Math.PI - Math.PI / 2;
    for (const [cx, cz] of [[Math.sin(t), 0], [0, Math.sin(t)]]) {
      const y = 0.04 * H + Math.cos(t) * 0.075 * H;
      P.add(hat, new THREE.SphereGeometry(0.003 * H, 6, 4), cx * 0.077 * H, y, cz * 0.077 * H);
    }
  }
  lathe(P, hat, [[0.077 * H, 0.03 * H], [0.098 * H, 0.016 * H], [0.11 * H, 0.007 * H], [0.114 * H, 0.0], [0.11 * H, 0.001 * H], [0.098 * H, 0.008 * H], [0.077 * H, 0.022 * H]], 0, 56);
  const comb = new THREE.Shape();
  comb.moveTo(-0.07 * H, 0);
  comb.quadraticCurveTo(0, 0.07 * H, 0.07 * H, 0);
  const cg = new THREE.ExtrudeGeometry(comb, { depth: 0.008 * H, bevelEnabled: true, bevelThickness: 0.002 * H, bevelSize: 0.002 * H, bevelSegments: 1, curveSegments: 14 });
  cg.translate(0, 0, -0.004 * H);
  P.add(hat, cg, 0, 0.06 * H, 0, 0, Math.PI / 2, 0);
  // chin strap
  P.add(hat, new THREE.TorusGeometry(0.066 * H, 0.0035 * H, 6, 24, Math.PI), 0, 0.03 * H, 0.004 * H, Math.PI, Math.PI / 2, 0, [1, 1.35, 1]);

  // ---- two arming swords
  const bL = sword(P, J.wrL, H, 0.42, 'weapon2');
  bL.position.set(0, -0.032 * H, 0.03 * H);
  const bR = sword(P, J.wrR, H, 0.42, 'weapon');
  bR.position.set(0, -0.032 * H, 0.03 * H);
  J.weapon = bR;
  J.weapon2 = bL;
  return { H, legs, style: 'dual' };
}

// The knight's war horse, sculpted as continuous forms (kr_sculpt.js): one muscled body from
// chest to haunch with ribs, veins and the flank crease; a crested neck under a mane of many
// S-curved locks; a head with cheek, jaw, muzzle, flared nostrils, lidded eyes and pricked
// ears, armoured with a riveted chamfron and its spike; legs with knees, hocks, tendons, veins,
// feathered fetlocks and ringed hooves, shod with nailed shoes; a tail of many strands. Then
// the tack: a saddle with pommel, cantle, seams and stirrup leathers; a caparison draped over
// the hindquarters in folds, with a raised border, a cross on each flank and tasselled, dagged
// hem; the girth, a studded peytral with pendants; the bridle with buckles, the bit and reins.
//
// Joint names, pivots and rest angles are what statues.js animates: horse, hh*/hk* (hind),
// fl*/fk* (fore), hneck, hhead, tail.
import * as THREE from 'three';
import { joint } from '../carving.js';
import { blend, boxOf, chisel, cone, roundBox, sculpt, smin, smax, sphere, union } from './kr_sculpt.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cached, mirrorX, rivets, thickSheet, tube } from './kr_geo.js';

const K = 0.035; // how softly the masses melt into each other

// a thin raised line (vein, tendon, lock of hair) or groove along a polyline of points
function line(pts, r0, r1 = r0) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
    segs.push(cone(pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1));
  }
  const [lx, ly, lz, hx, hy, hz] = boxOf(pts, Math.max(r0, r1) + 0.02);
  return (x, y, z) => {
    if (x < lx || x > hx || y < ly || y > hy || z < lz || z > hz) return 1;
    let d = Infinity;
    for (const f of segs) d = Math.min(d, f(x, y, z));
    return d;
  };
}
const mirror = (f) => (x, y, z) => f(Math.abs(x), y, z); // every mirrored part sits on +x

// A vein or tendon laid on a carved surface: a fine tube pressed onto the stone (each point
// pulled onto sdf = 0 along the gradient), swelling in the middle and sinking in at its ends.
// Finer than the sculpting grid could carve.
function surfaceTube(sdf, pts, r, seg = 18) {
  const e = 0.0008;
  const c0 = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const N = 8, proj = [];
  for (let i = 0; i <= N; i++) {
    const p = c0.getPoint(i / N);
    let gx = 0, gy = 1, gz = 0;
    for (let it = 0; it < 4; it++) {
      const d = sdf(p.x, p.y, p.z);
      gx = sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z);
      gy = sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z);
      gz = sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      p.x -= gx * d;
      p.y -= gy * d;
      p.z -= gz * d;
    }
    const sink = i === 0 || i === N ? -r * 1.2 : -r * 0.15;
    proj.push(p.set(p.x + gx * sink, p.y + gy * sink, p.z + gz * sink));
  }
  const curve = new THREE.CatmullRomCurve3(proj);
  r *= 1.5; // (half sunk: a soft ridge)
  const g = new THREE.TubeGeometry(curve, seg, r, 5, false);
  const pos = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c);
    const f = 0.05 + 0.95 * Math.sqrt(Math.sin((Math.PI * i) / seg));
    for (let j = 0; j <= 5; j++) {
      const k = i * 6 + j;
      pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * f, c.y + (pos.getY(k) - c.y) * f, c.z + (pos.getZ(k) - c.z) * f);
    }
  }
  g.computeVertexNormals();
  return g;
}
const flipZ = (pts) => pts.map((p) => [p[0], p[1], -p[2]]);
const mirrorPts = (pts, s) => pts.map((p) => [s * p[0], p[1], p[2]]);

export function horse(J, root, P) {
  const hs = joint(J, 'horse', root, 0, 0.3, -0.1, [-0.8, 0, 0]); // pivot on the hind quarters, reared
  const mk = (sdf, min, max, res, parent, amp = 0.0008, freq = 90, opts) => P.add(parent, sculpt(chisel(sdf, amp, freq), min, max, res, opts));

  // ---- body: in the horse's frame, nose toward +z, back toward +y
  const bodyParts = [
    [cone([0, -0.005, 0.02], [0, 0.0, 0.33], 0.125, 0.13, 0.78, 1)], // barrel
    [sphere(0, -0.03, 0.18, 0.125, 0.8, 0.9, 1.25), 0.06], // belly
    [sphere(0, 0.04, -0.02, 0.125, 0.92, 0.95, 0.95), K], // rump
    [mirror(sphere(0.07, 0.02, -0.0, 0.105, 0.62, 1.0, 1.0)), K], // haunches
    [mirror(sphere(0.06, 0.06, -0.06, 0.06, 0.6, 0.8, 1.2)), 0.03], // the muscle over the croup
    [mirror(sphere(0.075, -0.07, 0.02, 0.07, 0.6, 1.2, 1.0)), K], // stifles, where the hind legs join
    [sphere(0, 0.0, 0.37, 0.125, 0.82, 1.0, 0.9), K], // chest
    [mirror(sphere(0.045, -0.02, 0.44, 0.06, 0.8, 1.1, 0.75)), 0.025], // the two pectorals
    [mirror(sphere(0.07, 0.03, 0.35, 0.085, 0.6, 1.15, 0.9)), K], // shoulders
    [mirror(cone([0.07, 0.13, 0.31], [0.088, -0.02, 0.42], 0.03, 0.022, 0.7, 1)), 0.02], // shoulder blades
    [mirror(sphere(0.07, -0.05, 0.31, 0.05, 0.6, 1.2, 0.9)), 0.025], // triceps, behind the elbow
    [mirror(sphere(0.06, -0.06, 0.4, 0.06, 0.8, 1.0, 1.0)), K], // forearm roots
    [cone([0, 0.08, 0.28], [0, 0.13, 0.42], 0.06, 0.07, 0.6, 1), K], // withers
    [cone([0, 0.06, 0.38], [0, 0.17, 0.47], 0.1, 0.075, 0.78, 1), 0.05], // neck root
    [cone([0, 0.07, -0.08], [0, 0.04, -0.14], 0.06, 0.035), K], // dock of the tail
  ];
  const detail = [
    // the long muscle along the flank, the edge of the shoulder (triceps line), the hamstring
    [mirror(line([[0.102, 0.06, 0.06], [0.11, 0.03, 0.18], [0.104, -0.02, 0.29]], 0.008, 0.005)), 0.02],
    [mirror(line([[0.098, 0.1, 0.33], [0.104, 0.02, 0.32], [0.096, -0.06, 0.3]], 0.006, 0.004)), 0.014],
    [mirror(line([[0.08, 0.08, -0.08], [0.1, 0.0, -0.08], [0.1, -0.08, -0.05]], 0.012, 0.009)), 0.02],
  ];
  const cuts = [
    // the ribs and the flank crease, cut in shallow
    ...[0.12, 0.15, 0.18, 0.21, 0.24].map((z) => [mirror(line([[0.104, 0.05, z - 0.01], [0.106, -0.01, z + 0.005], [0.096, -0.07, z + 0.02]], 0.0035)), 0.005, 'cut']),
    [mirror(line([[0.1, 0.04, 0.04], [0.106, -0.02, 0.06], [0.096, -0.08, 0.08]], 0.005)), 0.008, 'cut'],
    [line([[0, -0.11, 0.41], [0, -0.04, 0.46]], 0.006), 0.008, 'cut'], // the groove between the pectorals
    [mirror(line([[0.092, 0.06, 0.29], [0.1, 0.0, 0.3], [0.094, -0.06, 0.27]], 0.0035)), 0.006, 'cut'], // behind the shoulder
    [mirror(line([[0.06, 0.1, -0.08], [0.09, 0.02, -0.1], [0.09, -0.06, -0.08]], 0.004)), 0.007, 'cut'], // the buttock's seam
  ];
  const body = blend([...bodyParts, ...detail, ...cuts]);
  mk(body, [-0.16, -0.2, -0.2], [0.16, 0.28, 0.56], 78, hs, 0.0007, 90, { keep: 0.4 });
  // veins over the belly, the girth and the shoulder, branching
  const bodyVeins = [
    [[[0.092, -0.08, 0.08], [0.094, -0.07, 0.14], [0.088, -0.08, 0.22], [0.084, -0.06, 0.3]], 0.0028],
    [[[0.094, -0.07, 0.14], [0.1, -0.04, 0.17], [0.102, -0.02, 0.21]], 0.002],
    [[[0.088, -0.08, 0.22], [0.08, -0.1, 0.25], [0.07, -0.115, 0.27]], 0.0018],
    [[[0.09, 0.1, 0.31], [0.1, 0.06, 0.325], [0.104, 0.025, 0.335]], 0.0024], // over the shoulder
    [[[0.1, 0.06, 0.325], [0.1, 0.08, 0.36], [0.094, 0.1, 0.39]], 0.0017],
  ];
  for (const [pts, r] of bodyVeins) for (const s of [1, -1]) P.add(hs, surfaceTube(body, mirrorPts(pts, s), r));

  // a saddle with pommel and cantle, seat seams and stitched panels
  const saddle = blend([
    [roundBox(0, 0.125, 0.15, 0.085, 0.022, 0.11, 0.02)],
    [cone([0, 0.13, 0.26], [0, 0.18, 0.27], 0.03, 0.025), 0.02], // pommel
    [sphere(0, 0.185, 0.272, 0.022, 1.3, 0.7, 1), 0.01], // its cap
    [cone([-0.07, 0.15, 0.05], [0.07, 0.15, 0.05], 0.028, 0.028), 0.03], // cantle
    [cone([-0.072, 0.168, 0.045], [0.072, 0.168, 0.045], 0.012, 0.012), 0.008], // its rolled top
    [mirror(roundBox(0.09, 0.105, 0.16, 0.012, 0.03, 0.06, 0.01)), 0.015], // flaps
    [mirror(roundBox(0.095, 0.11, 0.165, 0.004, 0.022, 0.05, 0.004)), 0.004], // the knee rolls on the flaps
    [roundBox(0, 0.125, 0.15, 0.06, 0.03, 0.002, 0.001), 0.003, 'cut'], // the seat's seam
    [mirror(line([[0.075, 0.14, 0.07], [0.08, 0.135, 0.15], [0.075, 0.14, 0.24]], 0.0025)), 0.003, 'cut'],
    [mirror(line([[0.098, 0.13, 0.11], [0.1, 0.085, 0.11], [0.1, 0.085, 0.215], [0.098, 0.13, 0.215]], 0.0016)), 0.002, 'cut'], // stitched panel
  ]);
  mk(saddle, [-0.15, 0.06, -0.0], [0.15, 0.22, 0.31], 50, hs, 0.0005, 160);
  // stirrup leathers from the saddle, and the girth's buckles
  for (const s of [-1, 1]) {
    P.add(hs, tube([[s * 0.104, 0.12, 0.16], [s * 0.112, 0.07, 0.165], [s * 0.116, 0.02, 0.17]], 0.0035, 12, 6));
    P.add(hs, new THREE.SphereGeometry(0.0045, 8, 6), s * 0.116, 0.02, 0.17);
    P.box(hs, 0.004, 0.014, 0.012, s * 0.112, 0.085, 0.164);
  }

  caparison(P, hs, body);

  // the girth under the barrel, and the peytral across the chest: studded, with pendants
  const loopT = (fn, n, r, closed = true, radial = 6) => {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(fn(i / (closed ? n : n - 1)));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), n * 3, r, radial, closed);
  };
  P.add(hs, loopT((t) => new THREE.Vector3(0.112 * Math.cos(t * Math.PI * 2), -0.008 + 0.134 * Math.sin(t * Math.PI * 2), 0.27), 24, 0.006));
  const pey = (t) => {
    const a = Math.PI * (0.15 + 0.7 * t);
    return new THREE.Vector3(-Math.cos(a) * 0.112, -0.02 + Math.sin(a) * -0.07 + 0.07, 0.4 + Math.sin(a) * 0.078);
  };
  P.add(hs, loopT(pey, 18, 0.0065, false, 8));
  for (const t of [0, 1]) {
    const p = pey(t); // a rosette where it buckles to the saddle's straps
    P.add(hs, new THREE.SphereGeometry(0.0066, 10, 6), p.x, p.y, p.z);
  }
  const studs = [];
  for (let i = 1; i < 14; i++) {
    const p = pey(i / 14);
    studs.push([p.x * 1.03, p.y, p.z + 0.004, [p.x, 0, 0.6]]);
  }
  rivets(P, hs, studs, 0.0042);
  for (const t of [0.3, 0.5, 0.7]) {
    const p = pey(t);
    // a pendant: a ring and a small shield hanging from it
    P.torus(hs, 0.005, 0.0015, p.x, p.y - 0.008, p.z + 0.006, 0, Math.PI * 2, 12);
    const sh = new THREE.Shape();
    sh.moveTo(-0.01, 0);
    sh.lineTo(0.01, 0);
    sh.quadraticCurveTo(0.01, -0.016, 0, -0.022);
    sh.quadraticCurveTo(-0.01, -0.016, -0.01, 0);
    const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, curveSegments: 6 });
    P.add(hs, pg, p.x, p.y - 0.013, p.z + 0.004, 0.2, Math.atan2(p.x, 0.6) * 0.6, 0);
  }
  const boss = P.lathe(hs, [[0, 0.007], [0.012, 0.005], [0.019, 0.002], [0.02, 0], [0.0, 0]], 0, 24);
  boss.position.set(0, -0.045, 0.488);
  boss.rotation.x = Math.PI / 2 - 0.3;

  // ---- legs, each sculpted once and mirrored for the other side
  const hoofSdf = (y0, z0) => (x, y, z) => {
    // a hoof: a truncated cone flaring to a flat sole, a coronet band, growth rings
    const c = cone([0, y0, z0], [0, y0 - 0.032, z0 + 0.006], 0.022, 0.033, 1, 1.05)(x, y, z);
    const sole = y - (y0 - 0.034);
    const rings = 0.0006 * Math.sin((y - y0) * 900);
    return smin(Math.max(c + rings, -sole), sphere(0, y0 - 0.002, z0, 0.026, 1, 0.35, 1.05)(x, y, z), 0.006);
  };
  // feathering: locks of hair falling from behind the fetlock over the heel
  const feather = (yf, zf) => {
    const L = [];
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.008;
      L.push([line([[x, yf + 0.012, zf - 0.02], [x * 1.3, yf - 0.012, zf - 0.03], [x * 1.5, yf - 0.03, zf - 0.024]], 0.0055, 0.0015), 0.005]);
    }
    return L;
  };
  const shoe = (parent, y, z) => {
    // a nailed shoe under the hoof, open at the heel
    P.add(parent, new THREE.TorusGeometry(0.026, 0.0042, 6, 28, Math.PI * 1.6), 0, y, z, -Math.PI / 2, 0, Math.PI * 0.7, [1, 1.08, 0.7]);
    const R = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.7 + Math.PI * (0.25 + i * 0.22);
      R.push([Math.cos(a) * 0.026, y - 0.0025, -Math.sin(a) * 0.026 * 1.08 + z, [0, -1, 0]]);
    }
    rivets(P, parent, R, 0.0022, 5);
  };
  // a leg part: sculpted, its veins laid on, once; the other side is its mirror
  const legGeo = (key, sdf, min, max, res, veins) => {
    const g = cached(key, () => mergeGeometries([sculpt(chisel(sdf, 0.0008, 110), min, max, res, { keep: 0.4 }), ...veins.map(([pts, r]) => surfaceTube(sdf, pts, r, 14))].map((x) => (x.index ? x.toNonIndexed() : x))));
    return { L: g, R: cached(key + 'R', () => mirrorX(g)) };
  };
  // hind legs: gaskin, hock, cannon, fetlock, hoof; on the root, planted
  const gaskin = legGeo('hgaskin', blend([
    [cone([0, 0.02, 0.0], [0, -0.17, -0.01], 0.07, 0.034, 0.75, 1)],
    [sphere(0, -0.07, -0.025, 0.05, 0.7, 1.4, 0.9), 0.03], // the muscle behind
    [sphere(0, -0.02, 0.025, 0.04, 0.7, 1.4, 0.9), 0.03], // and in front
    [line([[0, -0.08, -0.05], [0, -0.16, -0.035]], 0.008, 0.01), 0.01], // the hamstring to the hock
  ]), [-0.08, -0.2, -0.09], [0.08, 0.09, 0.08], 44, [
    [[[0.03, -0.075, 0.026], [0.03, -0.12, 0.018], [0.026, -0.165, 0.012]], 0.0024], // a vein
    [[[0.03, -0.1, 0.022], [0.04, -0.12, 0.0], [0.034, -0.15, -0.02]], 0.0017], // its branch
  ]);
  const lowerHind = legGeo('hlower', blend([
    [sphere(0, 0, -0.008, 0.036, 0.8, 1.0, 1.2)], // hock joint
    [sphere(0, 0.01, -0.04, 0.02), 0.02], // point of hock
    [cone([0, 0, 0], [0, -0.105, 0.0], 0.026, 0.021, 0.8, 1), 0.015], // cannon
    [cone([0, -0.01, -0.02], [0, -0.1, -0.017], 0.009, 0.008), 0.008], // the tendon behind
    [sphere(0, -0.112, 0.006, 0.028, 0.85, 1, 1.1), 0.015], // fetlock
    [cone([0, -0.115, -0.022], [0, -0.135, -0.03], 0.008, 0.003), 0.006], // ergot
    [cone([0, -0.115, 0.01], [0, -0.13, 0.02], 0.022, 0.025), 0.01], // pastern
    ...feather(-0.118, 0.0),
    [hoofSdf(-0.128, 0.02), 0.006],
    [line([[-0.02, -0.055, -0.019], [0.02, -0.055, -0.019]], 0.0018), 0.003, 'cut'], // tendon groove
  ]), [-0.05, -0.17, -0.07], [0.05, 0.05, 0.07], 48, [
    [[[0.02, -0.015, 0.008], [0.02, -0.05, 0.004], [0.019, -0.09, 0.006]], 0.0018], // splint vein
    [[[0.0, -0.01, -0.024], [0.0, -0.05, -0.024], [0.0, -0.095, -0.022]], 0.0026], // the tendon's edge
  ]);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hip = joint(J, 'hh' + side, root, s * 0.085, 0.31, -0.12, [0.3, 0, 0]);
    P.add(hip, s > 0 ? gaskin.L : gaskin.R);
    const hock = joint(J, 'hk' + side, hip, 0, -0.17, 0, [-0.75, 0, 0]);
    P.add(hock, s > 0 ? lowerHind.L : lowerHind.R);
    shoe(hock, -0.163, 0.024);
  }
  // forelegs, raised and pawing
  const fore = legGeo('fupper', blend([
    [cone([0, 0.03, 0], [0, -0.16, 0.0], 0.055, 0.03, 0.8, 1)],
    [sphere(0, -0.04, 0.02, 0.045, 0.8, 1.5, 0.9), 0.03], // forearm muscle
    [sphere(0.02, -0.03, -0.015, 0.03, 0.7, 1.6, 0.9), 0.02], // and behind
    [sphere(-0.03, -0.11, -0.004, 0.009, 0.6, 1.4, 1), 0.006], // chestnut
  ]), [-0.07, -0.19, -0.07], [0.07, 0.09, 0.08], 44, [
    [[[-0.04, -0.06, 0.02], [-0.042, -0.1, 0.01], [-0.034, -0.15, 0.006]], 0.0024], // a vein
    [[[-0.042, -0.085, 0.014], [-0.036, -0.11, 0.03], [-0.026, -0.145, 0.024]], 0.0017],
  ]);
  const lowerFore = legGeo('flower', blend([
    [sphere(0, 0, 0, 0.034, 0.85, 1.0, 1.0)], // knee
    [sphere(0, 0.005, 0.02, 0.022, 1.0, 0.9, 0.8), 0.012], // its cap
    [cone([0, 0, 0], [0, -0.115, 0], 0.025, 0.02, 0.8, 1), 0.015],
    [cone([0, -0.01, -0.019], [0, -0.11, -0.016], 0.009, 0.008), 0.008], // tendon
    [sphere(0, -0.123, 0.004, 0.027, 0.85, 1, 1.1), 0.015],
    [cone([0, -0.125, -0.022], [0, -0.145, -0.03], 0.008, 0.003), 0.006], // ergot
    [cone([0, -0.125, 0.006], [0, -0.14, 0.014], 0.021, 0.024), 0.01],
    ...feather(-0.128, -0.002),
    [hoofSdf(-0.138, 0.014), 0.006],
    [line([[-0.02, -0.06, -0.017], [0.02, -0.06, -0.017]], 0.0018), 0.003, 'cut'],
  ]), [-0.05, -0.18, -0.06], [0.05, 0.05, 0.06], 48, [
    [[[0.02, -0.02, 0.006], [0.02, -0.06, 0.003], [0.019, -0.1, 0.004]], 0.0018],
    [[[0.0, -0.012, -0.024], [0.0, -0.06, -0.024], [0.0, -0.105, -0.022]], 0.0026],
  ]);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = joint(J, 'fl' + side, hs, s * 0.08, -0.03, 0.38, [-0.4, 0, 0]);
    // (the chestnut and veins sit on the inner side: -x on the left leg)
    P.add(sh, s > 0 ? fore.L : fore.R);
    const kn = joint(J, 'fk' + side, sh, 0, -0.16, 0, [1.5, 0, 0]);
    P.add(kn, s > 0 ? lowerFore.L : lowerFore.R);
    shoe(kn, -0.173, 0.018);
  }

  // ---- the neck: arched, with a crest and a carved, wind-blown mane (neck frame: +y up the neck, +z its front)
  const neck = joint(J, 'hneck', hs, 0, 0.08, 0.4, [0.75, 0, 0]);
  const neckParts = [
    [cone([0, -0.02, 0.01], [0, 0.27, 0.0], 0.085, 0.045, 0.55, 1.15)], // deep, narrow, tapering
    [cone([0, 0.0, -0.05], [0, 0.25, -0.035], 0.04, 0.028, 0.6, 1), 0.05], // the crest
    [cone([0, 0.02, 0.06], [0, 0.22, 0.04], 0.025, 0.018, 0.8, 1), 0.04], // the throat's line
    [mirror(cone([0.025, 0.0, 0.03], [0.022, 0.24, 0.028], 0.022, 0.014, 0.8, 1)), 0.03], // muscles down the neck
    [mirror(cone([0.028, 0.02, -0.02], [0.02, 0.2, -0.02], 0.016, 0.01, 0.8, 1)), 0.03], // and under the crest
    [mirror(line([[0.032, 0.02, 0.05], [0.03, 0.12, 0.045], [0.026, 0.22, 0.035]], 0.005)), 0.006, 'cut'], // the jugular groove
  ];
  // the mane: three rows of locks from the crest, lying down the neck's off side in S-curves
  // (a few thrown to the near side), finer toward the tips
  const locks = [], lockPts = [];
  for (let row = 0; row < 3; row++) {
    const n = 22 - row * 3;
    for (let i = 0; i < n; i++) {
      const y = -0.015 + (i + row * 0.37) * (0.29 / n);
      const sd = (i * 7 + row * 3) % 5 === 0 ? 1 : -1;
      const w = Math.sin(i * 1.7 + row * 2.1) * 0.006, lw = 1 - row * 0.2;
      const pts = [
        [sd * (0.002 + row * 0.008), y + 0.004, -0.094 + row * 0.004],
        [sd * (0.026 + row * 0.008) + w, y - 0.016 * lw, -0.088 + row * 0.004],
        [sd * (0.046 + row * 0.004) - w, y - 0.034 * lw, -0.066 + row * 0.004],
        [sd * (0.054 + row * 0.002) + w * 0.5, y - 0.05 * lw, -0.04 + row * 0.006 + w],
      ];
      locks.push(line(pts, 0.011 - row * 0.0015, 0.0025));
      lockPts.push(...pts);
    }
  }
  neckParts.push([union(locks, boxOf(lockPts, 0.012)), 0.005]);
  const neckSdf = blend(neckParts);
  mk(neckSdf, [-0.11, -0.12, -0.16], [0.11, 0.32, 0.13], 70, neck, 0.0012, 110, { keep: 0.4 });
  for (const s of [1, -1]) {
    P.add(neck, surfaceTube(neckSdf, mirrorPts([[0.04, 0.03, 0.035], [0.038, 0.1, 0.04], [0.034, 0.17, 0.033]], s), 0.0024)); // a vein by the jugular groove
    P.add(neck, surfaceTube(neckSdf, mirrorPts([[0.038, 0.1, 0.04], [0.04, 0.13, 0.02], [0.036, 0.17, 0.0]], s), 0.0017));
  }

  // ---- the head (head frame: +y toward the muzzle, +z the forehead/face side, -z the jaw)
  const hd0 = joint(J, 'hhead', neck, 0, 0.27, 0.0, [1.75, 0, 0]);
  // the carving sits tucked a little down, the way a rearing horse carries its head
  const hd = new THREE.Group();
  hd.rotation.x = 0.55;
  hd0.add(hd);
  const skull = [
    [sphere(0, 0.0, 0.01, 0.062, 0.8, 1.0, 0.85)], // cranium, flat on top
    [cone([0, 0.02, 0.025], [0, 0.26, 0.012], 0.05, 0.036, 0.72, 0.95), 0.03], // the long, straight face
    [sphere(0, 0.06, -0.05, 0.068, 0.62, 0.95, 0.72), 0.04], // the great round jowl
    [cone([0, 0.07, -0.07], [0, 0.22, -0.03], 0.03, 0.022, 0.7, 1), 0.04], // the lower jaw line
    [sphere(0, 0.27, -0.004, 0.046, 0.86, 0.75, 0.95), 0.025], // a blunt muzzle
    [sphere(0, 0.272, -0.042, 0.028, 0.78, 0.8, 0.8), 0.02], // chin
    [sphere(0, 0.29, -0.02, 0.03, 0.95, 0.5, 0.6), 0.012], // the upper lip
    [mirror(sphere(0.048, 0.04, 0.03, 0.02, 1, 1.3, 1)), 0.012], // eye sockets and lids
    [cone([0, 0.05, 0.05], [0, 0.22, 0.042], 0.012, 0.009), 0.02], // the bridge of the nose
    [mirror(sphere(0.04, 0.13, 0.0, 0.02, 1.0, 2.4, 1.1)), 0.03], // the facial crest
  ];
  const headParts = [
    ...skull,
    [mirror(line([[0.046, 0.022, 0.044], [0.054, 0.04, 0.046], [0.05, 0.06, 0.04]], 0.005, 0.003)), 0.006], // the upper lids
    [mirror(line([[0.044, 0.03, 0.026], [0.052, 0.045, 0.024], [0.047, 0.06, 0.028]], 0.003, 0.002)), 0.004], // the lower lids
    [mirror(cone([0.03, -0.03, 0.045], [0.04, -0.06, 0.125], 0.019, 0.005, 0.6, 1)), 0.012], // ears, pricked
    [mirror(sphere(0.036, -0.04, 0.082, 0.007, 0.5, 1.0, 2.2)), 0.003, 'cut'], // their hollows, on the front face only
    [mirror(line([[0.034, -0.035, 0.06], [0.038, -0.048, 0.1]], 0.0015)), 0.002], // the ridge inside
    [mirror(sphere(0.032, 0.292, 0.02, 0.019, 1, 1.4, 1)), 0.006], // flared nostril rims
    [mirror(sphere(0.028, 0.298, 0.016, 0.014, 1, 1.4, 1)), 0.006, 'cut'], // nostrils
    [mirror(line([[0.03, 0.275, 0.03], [0.04, 0.25, 0.022]], 0.0016)), 0.002, 'cut'], // the nostril's false fold
    [cone([-0.034, 0.3, -0.026], [0.034, 0.3, -0.026], 0.005, 0.005), 0.005, 'cut'], // the mouth line
    [mirror(line([[0.034, 0.3, -0.026], [0.042, 0.28, -0.028]], 0.003)), 0.004, 'cut'], // its corners
    [cone([-0.02, 0.272, -0.06], [0.02, 0.272, -0.06], 0.004, 0.004), 0.005, 'cut'], // the chin groove
    [mirror(line([[0.03, 0.08, -0.07], [0.045, 0.06, -0.04], [0.048, 0.04, -0.01]], 0.002)), 0.003, 'cut'], // the jowl's edge
  ];
  for (let i = 0; i < 8; i++) headParts.push([line([[(i - 3.5) * 0.007, -0.03, 0.06], [(i - 3.5) * 0.01, 0.0, 0.088], [(i - 3.5) * 0.013 + 0.004 * Math.sin(i * 2), 0.03, 0.094]], 0.0065, 0.0022), 0.006]); // forelock, over the chamfron
  const headSdf = blend(headParts);
  const headF = (x, y, z) => headSdf(x, y, -z);
  for (const s of [1, -1]) {
    // the face veins, under the chamfron's edge and over the cheek
    P.add(hd, surfaceTube(headF, flipZ(mirrorPts([[0.046, 0.09, 0.03], [0.05, 0.13, 0.012], [0.046, 0.18, 0.0]], s)), 0.0019));
    P.add(hd, surfaceTube(headF, flipZ(mirrorPts([[0.05, 0.13, 0.012], [0.054, 0.1, -0.02], [0.05, 0.07, -0.05]], s)), 0.0016));
  }
  mk(headF, [-0.09, -0.14, -0.12], [0.09, 0.34, 0.12], 78, hd, 0.0005, 140, { keep: 0.3 });
  for (const s of [-1, 1]) {
    P.sphere(hd, 0.011, s * 0.05, 0.042, -0.034, [0.5, 1, 1], 16); // the eyeballs
    P.sphere(hd, 0.0035, s * 0.054, 0.04, -0.04, null, 8); // a glint carved as a pupil
  }
  chamfron(P, hd, blend(skull));

  // the bridle: crown piece, browband, cheek straps with buckles, noseband, throatlatch, bit, reins
  const strap = (pts, r) => P.add(hd, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], -q[2])), pts.length > 3), 30, r, 6, pts.length > 3));
  strap([[0.042, 0.215, 0.0], [0.0, 0.215, 0.054], [-0.042, 0.215, 0.0], [0.0, 0.21, -0.05]], 0.0045); // noseband
  strap([[0.05, 0.0, 0.035], [0.0, -0.005, 0.066], [-0.05, 0.0, 0.035]], 0.0045); // browband
  strap([[0.05, -0.02, 0.02], [0.03, 0.02, -0.07], [-0.03, 0.02, -0.07], [-0.05, -0.02, 0.02]], 0.004); // throatlatch
  const bstuds = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.1 + 0.8 * (i / 6));
    bstuds.push([Math.cos(a) * 0.05, -0.002 - Math.sin(a) * 0.004, -(0.035 + Math.sin(a) * 0.033), [Math.cos(a), 0, -Math.sin(a)]]);
  }
  rivets(P, hd, bstuds, 0.0035);
  for (const s of [-1, 1]) {
    strap([[s * 0.046, -0.02, 0.03], [s * 0.05, 0.08, 0.0], [s * 0.04, 0.21, -0.005], [s * 0.036, 0.28, -0.03]], 0.0042); // cheek strap to the bit
    const bk = P.box(hd, 0.004, 0.016, 0.012, s * 0.05, 0.12, 0.004); // its buckle
    bk.rotation.z = s * 0.05;
    P.box(hd, 0.002, 0.004, 0.012, s * 0.053, 0.12, 0.004);
    P.torus(hd, 0.012, 0.0032, s * 0.038, 0.285, 0.032, 0, Math.PI * 2, 20).rotation.y = Math.PI / 2; // bit rings
    P.add(hd, new THREE.CylinderGeometry(0.006, 0.006, 0.003, 12), s * 0.04, 0.285, 0.032, 0, 0, Math.PI / 2); // their bosses
    // the reins falling from the bit in a loop under the jaw
    strap([[s * 0.038, 0.285, -0.032], [s * 0.05, 0.2, -0.085], [s * 0.04, 0.09, -0.11], [s * 0.025, -0.01, -0.105]], 0.0035);
  }
  P.add(hd, new THREE.CylinderGeometry(0.0035, 0.0035, 0.076, 10), 0, 0.287, 0.03, 0, 0, Math.PI / 2); // the bit

  // ---- the tail: a fall of carved strands, swept to one side
  const tail = joint(J, 'tail', hs, 0, 0.05, -0.1, [1.25, 0, 0]);
  const tailParts = [[cone([0, 0.02, 0], [0, -0.08, 0.01], 0.032, 0.03)]];
  const strands = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + (i % 2) * 0.13;
    const rr = 0.012 + (i % 3) * 0.004;
    const x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr;
    const w = Math.sin(i * 2.1) * 0.03, v = Math.cos(i * 1.3) * 0.03;
    strands.push(line([[x0, -0.05, z0], [x0 * 1.5 + w, -0.16, z0 * 1.5 - 0.015], [x0 * 1.9 - w * 0.5 + 0.02, -0.26, z0 * 1.8 + v], [x0 * 2.2 + w + 0.03, -0.35 - 0.03 * (i % 4), z0 * 2 + 0.03 + v * 0.3]], 0.0095, 0.0022));
  }
  tailParts.push([union(strands, [-0.1, -0.42, -0.1, 0.1, 0.0, 0.1]), 0.008]);
  P.torus(tail, 0.031, 0.004, 0, -0.035, 0.002, Math.PI / 2, Math.PI * 2, 28); // a binding round the dock
  mk(blend(tailParts), [-0.1, -0.42, -0.1], [0.1, 0.06, 0.1], 56, tail, 0.0012, 120, { keep: 0.4 });
}

// ------------------------------------------------------------------ the caparison
// Laid over the hindquarters: each cross-section follows the body (found by searching out from
// its axis) over the back, then falls from the widest point toward the hem, in folds that
// deepen as they fall. A raised border runs round it, a cross is raised on each flank, the hem
// is cut in scallops with a tassel at each point.
function caparison(P, parent, body) {
  const z0 = -0.095, z1 = 0.255; // rear and front edges
  const NS = 12, NA = 9; // coarse stations along the body, angles over the back
  const out = 0.007; // how far it stands off the body
  const sections = [];
  for (let k = 0; k <= NS; k++) {
    const z = z0 + ((z1 - z0) * k) / NS, yc = 0.0;
    // over the back from the spine to the widest point (one side; the body is symmetric)
    const arc = [];
    let wide = 0, wx = 0;
    for (let a = 0; a <= NA; a++) {
      const phi = (a / NA) * Math.PI * 0.62;
      const dx = Math.sin(phi), dy = Math.cos(phi);
      let lo = 0.0, hi = 0.3;
      for (let it = 0; it < 12; it++) {
        const m = (lo + hi) / 2;
        if (body(dx * m, yc + dy * m, z) < 0) lo = m;
        else hi = m;
      }
      const r = lo + out;
      const p = [dx * r, yc + dy * r, z];
      arc.push(p);
      if (p[0] > wx) {
        wx = p[0];
        wide = a;
      }
    }
    sections.push({ z, arc: arc.slice(0, wide + 1) });
  }
  // the fall: from the widest point toward the hem, leaning back as a cloth hangs on a horse
  // that rears (gravity in the horse's frame is down and toward the tail)
  const M = 30; // points down one side
  const fold = (z, t, s) => 0.008 * t * (Math.sin(z * 90 + s * 1.3 + Math.sin(z * 31) * 1.5) * 0.8 + Math.sin(z * 170 + s) * 0.2);
  const sideProfile = (sec, s) => {
    // polyline from the spine down, then resampled by length
    const pts = sec.arc.map((p) => [p[0], p[1], p[2], 0]);
    const last = sec.arc[sec.arc.length - 1];
    const zf = (sec.z - z0) / (z1 - z0);
    const hemY = -0.085 - 0.03 * (1 - zf); // longer over the haunch
    const drop = last[1] - hemY;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      pts.push([last[0] + 0.012 * t * t, last[1] - drop * t, last[2] - 0.05 * drop * t * t, t]);
    }
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const L = len[len.length - 1];
    const res = [];
    let j = 0;
    for (let i = 0; i <= M; i++) {
      const d = (L * i) / M;
      while (j < pts.length - 2 && len[j + 1] < d) j++;
      const f = (d - len[j]) / Math.max(1e-9, len[j + 1] - len[j]);
      const q = pts[j].map((v, c) => v + (pts[j + 1][c] - v) * f);
      q.push(L - d); // distance from the hem
      res.push(q);
    }
    return res.map((q) => [s * q[0], q[1], q[2], q[3], q[4]]);
  };
  // fine stations, the profiles blended between the coarse ones
  const profiles = { 1: sections.map((sec) => sideProfile(sec, 1)), [-1]: sections.map((sec) => sideProfile(sec, -1)) };
  const NV = 34;
  const point = (u, v) => {
    // u: 0 left hem .. 0.5 spine .. 1 right hem; v: rear .. front
    const iu = Math.round(u * 2 * M), s = iu <= M ? 1 : -1, m = Math.abs(iu - M);
    const f = v * NS, k = Math.min(NS - 1, Math.floor(f)), t = f - k;
    const a = profiles[s][k][m], B = profiles[s][k + 1][m];
    const q = a.map((c, i) => c + (B[i] - c) * t);
    const z = q[2];
    // folds as it falls; the raised border near the hem and along the front and back edges
    const hang = q[3];
    const dx = fold(z, hang, s);
    q[1] -= hang * 0.009 * Math.abs(Math.sin(z * 60)); // the dagged hem
    const dHem = q[4], dEdge = Math.min(v, 1 - v) * (z1 - z0);
    const border = (x) => (x > 0.004 && x < 0.014 ? 0.0022 : 0) + (x < 0.003 ? 0.0012 : 0);
    let lift = Math.max(border(dHem), border(dEdge));
    // a cross on each flank
    const cz = (z0 + z1) / 2 - 0.06, cy = -0.035;
    const ax = Math.abs(z - cz), ay = Math.abs(q[1] - cy);
    if (hang > 0 && ((ax < 0.006 && ay < 0.032) || (ay < 0.006 && ax < 0.024))) lift = Math.max(lift, 0.002);
    const nx = s * Math.max(0.3, Math.abs(q[0]) / Math.hypot(q[0], q[1] - 0.0)), ny = q[3] > 0 ? 0 : q[1] / Math.hypot(q[0], q[1]);
    return [q[0] + s * dx + nx * lift, q[1] + ny * lift, z];
  };
  const g = thickSheet(point, 2 * M, NV, 0.0035, { out: [0, 0.0, 0.08] });
  P.add(parent, g);
  // tassels at the hem's points
  for (const s of [-1, 1]) {
    for (let k = Math.ceil((z0 * 60 - Math.PI / 2) / Math.PI); (Math.PI / 2 + k * Math.PI) / 60 < z1; k++) {
      const v = ((Math.PI / 2 + k * Math.PI) / 60 - z0) / (z1 - z0);
      const p = point(s > 0 ? 0 : 1, v);
      // a knob, a binding, and the tassel's fall of threads flaring out
      P.add(parent, new THREE.SphereGeometry(0.0035, 8, 6), p[0], p[1] - 0.002, p[2]);
      P.add(parent, new THREE.CylinderGeometry(0.0022, 0.0042, 0.011, 8, 1), p[0], p[1] - 0.01, p[2]);
      P.add(parent, new THREE.CylinderGeometry(0.0042, 0.0042, 0.0012, 8, 1), p[0], p[1] - 0.0157, p[2]);
    }
  }
}

// ------------------------------------------------------------------ the chamfron
// A plate over the face from the poll to above the nostrils, laid on the skull (found by
// searching in from the front): a medial ridge, flared eye guards, riveted edges, and a spike
// on the brow. In the head carving's own frame (+z the face), mirrored into the head group.
function chamfron(P, hd, skull) {
  const y0 = -0.005, y1 = 0.215;
  const hw = (y) => {
    const t = (y - y0) / (y1 - y0);
    return 0.05 - 0.022 * t + 0.008 * Math.exp(-(((y - 0.04) / 0.02) ** 2));
  };
  const surf = (x, y) => {
    let lo = -0.02, hi = 0.13;
    for (let it = 0; it < 13; it++) {
      const m = (lo + hi) / 2;
      if (skull(x, y, m) < 0) lo = m;
      else hi = m;
    }
    return lo;
  };
  const NU = 22, NV = 34;
  const grid = [];
  for (let j = 0; j <= NV; j++) {
    const row = [];
    const y = y0 + ((y1 - y0) * j) / NV;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      // rounded top and bottom ends
      const e = Math.min(1, Math.min(j, NV - j) / 3);
      const x = (u - 0.5) * 2 * hw(y) * (0.55 + 0.45 * Math.sqrt(e));
      row.push([x, y, surf(x, y)]);
    }
    grid.push(row);
  }
  const fn = (u, v) => {
    const i = Math.round(u * NU), j = Math.round(v * NV);
    const [x, y, z] = grid[j][i];
    const ridge = 0.0035 * Math.exp(-((x / 0.006) ** 2)); // the medial ridge
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const roll = edge < 0.05 ? 0.0015 : 0; // a turned edge
    return [x, y, -(z + 0.004 + ridge + roll)];
  };
  P.add(hd, thickSheet(fn, NU, NV, 0.003, { out: [0, 0.1, 0] }));
  // eye guards: flared rings round the eyes
  for (const s of [-1, 1]) {
    const g = new THREE.TorusGeometry(0.019, 0.0032, 8, 28, Math.PI * 1.25);
    const m = P.add(hd, g, s * 0.05, 0.042, -0.032);
    m.rotation.set(0, s * (Math.PI / 2 - 0.35), s > 0 ? -2.0 : 2.0 + Math.PI * 0.75, 'YXZ');
  }
  // rivets down both edges, and the spike on the brow with its rosette
  const R = [];
  for (let j = 2; j < NV - 1; j += 4) for (const i of [1, NU - 1]) {
    const [x, y, z] = grid[j][i];
    R.push([x, y, -(z + 0.0075), [x * 4, 0, -1]]);
  }
  rivets(P, hd, R, 0.003);
  const [, , zb] = grid[5][NU / 2];
  const sp = new THREE.LatheGeometry([[0, 0.06], [0.004, 0.04], [0.009, 0.012], [0.013, 0.004], [0.016, 0.0], [0, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const spike = P.add(hd, sp, 0, grid[5][0][1], -(zb + 0.006));
  spike.rotation.set(-Math.PI / 2 - 0.5, 0, 0);
  const ros = new THREE.TorusGeometry(0.017, 0.0025, 6, 24);
  P.add(hd, ros, 0, grid[5][0][1], -(zb + 0.006), 0.5, 0, 0);
}

export { line, mirror, smax };

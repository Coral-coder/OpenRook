// The rook's keep, stone by stone: a battered plinth, courses of dressed blocks curved to the
// round of the tower, each pillowed with rolled arrises, its face tooled and a little uneven,
// laid in recessed mortar; corners chipped, a crack running through a few courses and a
// battle-scarred patch where stones are spalled, knocked loose or gone. A round-arched door,
// slit windows with sills and lintels, moulded corbels and little arches under a parapet of
// stones, and merlons built of blocks with arrow loops, caps, and one broken by a blow.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { carve } from '../carving.js';
import { rng, thickSheet } from './kr_geo.js';

let rnd = rng(7);

// cheap lattice noise for the tooled faces
function n2(x, y) {
  const h = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) + h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
}

const cheb = (s) => 0.5 - 0.5 * Math.cos(Math.PI * s); // grid lines crowd toward the arrises

/**
 * One curved block: from angle a0 to a1 (around +y, 0 toward +z), y0 to y1, its back at radius
 * r and its face [depth] out. dmg: { chips: [[cu, cv, size]], crack: [[a, y], [a, y]] | null,
 * spall: depth of a broken face, broken: jagged top }.
 */
function block(r, a0, a1, y0, y1, depth, dmg = {}, nu = 8, nv = 4) {
  const b = Math.min(0.003, (y1 - y0) * 0.2, (a1 - a0) * r * 0.15); // the chamfered arris
  const seed = rnd() * 100;
  const roll = (e) => (e >= b ? 0 : (b - e) * 0.9);
  const bulge = 0.0003 + rnd() * 0.0006;
  const brk = (u) => (dmg.broken || 0) * (0.3 + 0.7 * n2(u * 7 + seed, 3));
  const fn = (u, v) => {
    const U = cheb(u), Vv = cheb(v);
    const a = a0 + (a1 - a0) * U, y = y0 + (y1 - y0) * Vv;
    const ex = Math.min(a - a0, a1 - a) * r, ey = Math.min(y - y0, y1 - y);
    let off = roll(ex) + roll(ey);
    // the face: a slight pillow, tooled and uneven
    off -= bulge * Math.sin(Math.PI * U) * Math.sin(Math.PI * Vv);
    off += (n2(a * r * 200 + seed, y * 200) - 0.5) * 0.0018 + (n2(a * r * 600, y * 600 + seed) - 0.5) * 0.0008;
    off += 0.0006 * Math.max(0, Math.sin((a * r + y * 0.35) * 2600 + seed)); // tooling: fine diagonal claw marks
    for (const [cu, cv, c] of dmg.chips || []) {
      // a chip off a corner: a flat, sloping break
      const dx = Math.abs(a - (cu ? a1 : a0)) * r, dy = Math.abs(y - (cv ? y1 : y0));
      off += Math.max(0, c - (dx + dy) * 0.75) * 0.9;
    }
    if (dmg.crack) {
      const [[ca0, cy0], [ca1, cy1]] = dmg.crack;
      const px = (a - ca0) * r, py = y - cy0, qx = (ca1 - ca0) * r, qy = cy1 - cy0;
      const t = Math.max(0, Math.min(1, (px * qx + py * qy) / (qx * qx + qy * qy)));
      const d = Math.hypot(px - qx * t, py - qy * t);
      off += 0.006 * Math.exp(-((d / 0.0018) ** 2));
    }
    if (dmg.spall) off += dmg.spall * Math.max(0, 1 - Math.hypot((U - 0.5) * 2.2, (Vv - 0.45) * 2.4)) ** 0.6 * (0.7 + 0.6 * n2(u * 9 + seed, v * 9));
    let top = y;
    if (dmg.broken && v > 0.99) top = y - brk(u);
    const R = r + Math.max(depth * 0.3, depth - off);
    return [Math.sin(a) * R, top, Math.cos(a) * R];
  };
  const back = (u, v) => {
    const a = a0 + (a1 - a0) * cheb(u), R = r + depth * 0.15;
    let y = y0 + (y1 - y0) * cheb(v);
    if (dmg.broken && v > 0.99) y -= brk(1 - u);
    return [Math.sin(a) * R, y, Math.cos(a) * R];
  };
  return thickSheet(fn, nu, nv, 0, { out: [0, (y0 + y1) / 2, 0], back });
}

export function keep(tower, P, T) {
  rnd = rng(7);
  const base = 0.06, top = T * 0.9;
  // battered plinth
  P.lathe(tower, [[0.214, 0], [0.214, 0.022], [0.2, 0.03], [0.176, base], [0, base]], 0, 64);
  P.torus(tower, 0.19, 0.008, 0, 0.026, 0, Math.PI / 2, Math.PI * 2, 64);
  // the mortar: a core just inside the stones
  P.cyl(tower, 0.146, 0.156, top - base, 0, base + (top - base) / 2, 0, 0, 0, 0, 48);
  const courses = 14, ch = (top - base) / courses;
  const door = { a: 0, w: 0.085, h: 0.17 }; // the door faces +z (angle 0)
  const slits = [1.9, 4.2];
  // the battle damage: a patch round the back-left, and a crack down the right side
  const scar = { a: 2.7, y: 0.3 };
  const crackA = [-1.15, -0.95], crackY = [0.46, 0.2];
  for (let c = 0; c < courses; c++) {
    const r = 0.158 - (0.012 * c) / courses - 0.015, y0 = base + ch * c + 0.003, y1 = base + ch * (c + 1) - 0.003;
    const R = r + 0.015;
    let a = (c % 2) * 0.24 + rnd() * 0.1;
    while (a < Math.PI * 2 + (c % 2) * 0.24) {
      const w = 0.07 + rnd() * 0.05;
      const da = w / R;
      const mid = a + da / 2;
      const dep = 0.03 + rnd() * 0.008;
      // leave the doorway and the slit windows open
      const dx = Math.sin(mid) * R;
      const y = (y0 + y1) / 2;
      const inDoor = Math.cos(mid) > 0.8 && Math.abs(dx) < door.w / 2 + 0.01 && y < base + door.h;
      const inSlit = slits.some((sa) => Math.abs(((mid - sa + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.1) && y > 0.28 && y < 0.42;
      // how near the scar
      const ds = Math.hypot(((mid - scar.a + Math.PI * 3) % (Math.PI * 2) - Math.PI) * R, y - scar.y);
      const gone = ds < 0.045 || (ds < 0.075 && rnd() < 0.4);
      if (!inDoor && !inSlit && !gone) {
        const dmg = { chips: [] };
        const k = ds < 0.12 ? 3 : 1; // more chips near the scar
        for (let i = 0; i < 4; i++) if (rnd() < 0.18 * k) dmg.chips.push([rnd() < 0.5 ? 0 : 1, rnd() < 0.5 ? 0 : 1, 0.004 + rnd() * 0.008 * k]);
        if (ds < 0.12) dmg.spall = 0.006 + rnd() * 0.008;
        // the crack, where it crosses this block
        const ty = (y - crackY[0]) / (crackY[1] - crackY[0]);
        if (ty > -0.05 && ty < 1.05) {
          const ca = crackA[0] + (crackA[1] - crackA[0]) * ty + Math.sin(c * 2.3) * 0.04;
          const am = ((mid - ca + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(am) < da / 2 + 0.02) dmg.crack = [[ca + Math.sin(c * 3.1) * 0.03, y1 + 0.003], [ca - Math.sin(c * 1.7) * 0.03, y0 - 0.003]].map(([aa, yy]) => [mid + ((aa - mid + Math.PI * 3) % (Math.PI * 2)) - Math.PI, yy]);
        }
        const loose = ds < 0.09 && !dmg.spall ? 0.004 : 0;
        const m = P.add(tower, block(r + loose, a + 0.002, a + da - 0.002, y0, y1, dep, dmg, 9, 4));
        m.rotation.z = (rnd() - 0.5) * 0.012;
      }
      a += da + 0.004;
    }
  }
  // in the scar, shattered stone fragments wedged in the gap
  for (let i = 0; i < 9; i++) {
    const a = scar.a + (rnd() - 0.5) * 0.4, y = scar.y + (rnd() - 0.5) * 0.08;
    const g = new THREE.DodecahedronGeometry(0.006 + rnd() * 0.006, 0);
    carve(g, 0.002, 90);
    P.add(tower, g, Math.sin(a) * 0.15, y, Math.cos(a) * 0.15, rnd() * 3, rnd() * 3, 0);
  }
  // the door: an arch of wedge stones over a recessed plank door with iron straps
  const dz = 0.15;
  for (let i = 0; i < 9; i++) {
    const t = (i / 8) * Math.PI;
    const g = new RoundedBoxGeometry(0.02, 0.034, 0.038, 2, 0.004);
    carve(g, 0.0012, 120);
    P.add(tower, g, Math.cos(t) * (door.w / 2 + 0.01), base + door.h - door.w / 2 + Math.sin(t) * (door.w / 2 + 0.01), dz + 0.012, 0, 0, t - Math.PI / 2);
  }
  // the planks, each with its grain
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BoxGeometry(door.w / 5 - 0.003, door.h - 0.01, 0.01, 1, 12, 1);
    carve(g, 0.0012, 160);
    P.add(tower, g, -door.w / 2 + (i + 0.5) * (door.w / 5), base + (door.h - 0.01) / 2, dz - 0.002);
  }
  for (const y of [0.05, 0.12]) P.box(tower, door.w, 0.008, 0.006, 0, base + y, dz + 0.005);
  // ironwork: strap hinges ending in scrolls, nail studs, a lock plate and a ring pull
  for (const y of [0.05, 0.12]) {
    for (const s of [-1, 1]) {
      const sc = new THREE.Curve();
      sc.getPoint = (t, o = new THREE.Vector3()) => {
        const a = t * Math.PI * 1.6, r = 0.012 * (1 - t * 0.6);
        return o.set(s * (door.w / 2 - 0.004 + Math.sin(a) * r * 0.2), base + y + Math.cos(a) * r - r, dz + 0.007);
      };
      P.add(tower, new THREE.TubeGeometry(sc, 16, 0.0018, 5));
    }
    for (let i = 0; i < 5; i++) P.sphere(tower, 0.0022, -door.w / 2 + 0.008 + i * (door.w - 0.016) / 4, base + y, dz + 0.009, null, 6);
  }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) P.sphere(tower, 0.0018, -door.w * 0.3 + c * door.w * 0.3, base + 0.03 + r * 0.035, dz + 0.004, null, 6);
  P.box(tower, 0.016, 0.022, 0.004, door.w * 0.28, base + door.h * 0.45, dz + 0.006); // lock plate
  P.torus(tower, 0.008, 0.0016, door.w * 0.28, base + door.h * 0.4, dz + 0.01, 0, Math.PI * 2, 16); // ring pull
  // slit windows: a sill and a lintel stone, splayed jambs, the dark slit behind
  for (const sa of slits) {
    const R = 0.146;
    P.add(tower, block(R, sa - 0.17, sa + 0.17, 0.262, 0.278, 0.042, { chips: [[0, 1, 0.006]] }, 10, 3));
    P.add(tower, block(R, sa - 0.17, sa + 0.17, 0.422, 0.44, 0.042, {}, 10, 3));
    P.add(tower, new THREE.BoxGeometry(0.012, 0.14, 0.01), Math.sin(sa) * 0.142, 0.35, Math.cos(sa) * 0.142, 0, sa, 0);
  }
  // corbels stepped out under the parapet, moulded; a little round arch between each pair
  const cs = new THREE.Shape();
  cs.moveTo(0, -0.05);
  cs.lineTo(0.006, -0.05);
  cs.quadraticCurveTo(0.016, -0.05, 0.017, -0.036);
  cs.lineTo(0.021, -0.034);
  cs.quadraticCurveTo(0.033, -0.03, 0.034, -0.014);
  cs.lineTo(0.038, -0.012);
  cs.lineTo(0.038, 0);
  cs.lineTo(0, 0);
  const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 6 });
  cg.translate(0, 0, -0.013);
  carve(cg, 0.0008, 160);
  const NC = 18;
  for (let i = 0; i < NC; i++) {
    const a = (i / NC) * Math.PI * 2;
    P.add(tower, cg, Math.sin(a) * 0.166, top + 0.042, Math.cos(a) * 0.166, 0, a - Math.PI / 2, 0);
    const am = a + Math.PI / NC;
    const arch = new THREE.TorusGeometry(0.022, 0.0035, 6, 14, Math.PI);
    P.add(tower, arch, Math.sin(am) * 0.198, top + 0.042 - 0.006, Math.cos(am) * 0.198, Math.PI, am, 0, [1, 0.7, 1]);
  }
  // the parapet: its floor, and a course of stones round its face
  P.lathe(tower, [[0.19, top + 0.042], [0.207, top + 0.042], [0.207, top + 0.046], [0.18, T], [0.18, T * 0.97], [0, T * 0.97]], 0, 64);
  P.torus(tower, 0.207, 0.003, 0, top + 0.043, 0, Math.PI / 2, Math.PI * 2, 96); // a moulded string course
  {
    let a = 0.1;
    while (a < Math.PI * 2 + 0.1 - 0.05) {
      const da = Math.min((0.06 + rnd() * 0.04) / 0.21, Math.PI * 2 + 0.1 - a);
      P.add(tower, block(0.19, a + 0.002, a + da - 0.002, top + 0.046, T, 0.018, { chips: rnd() < 0.3 ? [[rnd() < 0.5 ? 0 : 1, 1, 0.006]] : [] }, 8, 3));
      a += da;
    }
  }
  // the merlons, of blocks: two courses, an arrow loop through the lower, a cap; one broken
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const hw = 0.0375 / 0.19, broken = i === 5;
    const y0 = T, y1 = T + 0.034, y2 = T + 0.068;
    const loop = i % 2 === 0;
    const gap = 0.0045 / 0.19;
    if (loop) {
      P.add(tower, block(0.17, a - hw, a - gap, y0 + 0.002, y1, 0.04, { chips: [[1, 0, 0.004]] }, 6, 4));
      P.add(tower, block(0.17, a + gap, a + hw, y0 + 0.002, y1, 0.04, {}, 6, 4));
    } else {
      P.add(tower, block(0.17, a - hw, a + hw, y0 + 0.002, y1, 0.04, { chips: rnd() < 0.5 ? [[1, 1, 0.006]] : [] }, 10, 4));
    }
    if (broken) {
      // knocked half away: a jagged top, no cap
      P.add(tower, block(0.17, a - hw, a + 0.01, y1 + 0.003, y2 - 0.012, 0.04, { broken: 0.012, chips: [[1, 1, 0.012], [0, 1, 0.006]], spall: 0.003 }, 10, 6));
      continue;
    }
    // the upper course: two stones, a cross-slit between them over a loop
    if (loop) {
      P.add(tower, block(0.17, a - hw, a - gap * 0.9, y1 + 0.003, y2 - 0.003, 0.04, {}, 6, 4));
      P.add(tower, block(0.17, a + gap * 0.9, a + hw, y1 + 0.003, y2 - 0.003, 0.04, {}, 6, 4));
      P.add(tower, block(0.17, a - gap * 0.9, a + gap * 0.9, y1 + 0.016, y2 - 0.003, 0.04, {}, 2, 3));
    } else P.add(tower, block(0.17, a - hw, a + hw, y1 + 0.003, y2 - 0.003, 0.04, {}, 10, 4));
    // the cap: overhanging, its top weathered to a slope
    const cap = block(0.166, a - hw * 1.12, a + hw * 1.12, y2, y2 + 0.012, 0.048, { chips: rnd() < 0.4 ? [[rnd() < 0.5 ? 0 : 1, 1, 0.006]] : [] }, 10, 3);
    P.add(tower, cap);
  }
}

// The rook's keep, stone by stone.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { carve } from '../carving.js';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function keep(tower, P, T) {
  seed = 7;
  const base = 0.06, top = T * 0.9;
  // battered plinth
  P.lathe(tower, [[0.214, 0], [0.214, 0.022], [0.2, 0.03], [0.176, base], [0, base]], 0, 40);
  P.torus(tower, 0.19, 0.008, 0, 0.026, 0, Math.PI / 2, Math.PI * 2, 40);
  // the mortar: a core just inside the stones
  P.cyl(tower, 0.146, 0.156, top - base, 0, base + (top - base) / 2, 0, 0, 0, 0, 32);
  const courses = 12, ch = (top - base) / courses;
  const door = { a: 0, w: 0.085, h: 0.17 }; // the door faces +z (angle 0)
  for (let c = 0; c < courses; c++) {
    const r = 0.158 - (0.012 * c) / courses, y = base + ch * (c + 0.5);
    let a = (c % 2) * 0.24 + rnd() * 0.1;
    while (a < Math.PI * 2 + (c % 2) * 0.24) {
      const w = 0.07 + rnd() * 0.05;
      const da = w / r;
      const mid = a + da / 2;
      // leave the doorway and the slit windows open
      const dx = Math.sin(mid) * r;
      const inDoor = Math.cos(mid) > 0.8 && Math.abs(dx) < door.w / 2 + 0.01 && y < base + door.h;
      const inSlit = [1.9, 4.2].some((sa) => Math.abs(((mid - sa + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.1) && y > 0.28 && y < 0.42;
      if (!inDoor && !inSlit) {
        const g = new THREE.BoxGeometry(w - 0.006, ch - 0.006, 0.03 + rnd() * 0.008);
        const m = P.add(tower, g, Math.sin(mid) * r, y, Math.cos(mid) * r, 0, mid, 0);
        m.rotation.z = (rnd() - 0.5) * 0.03;
      }
      a += da + 0.004;
    }
  }
  // the door: an arch of wedge stones over a recessed plank door with iron straps
  const dz = 0.15;
  for (let i = 0; i < 9; i++) {
    const t = (i / 8) * Math.PI;
    const g = new RoundedBoxGeometry(0.02, 0.034, 0.038, 1, 0.004);
    P.add(tower, g, Math.cos(t) * (door.w / 2 + 0.01), base + door.h - door.w / 2 + Math.sin(t) * (door.w / 2 + 0.01), dz + 0.012, 0, 0, t - Math.PI / 2);
  }
  for (let i = 0; i < 5; i++) P.box(tower, door.w / 5 - 0.003, door.h - 0.01, 0.01, -door.w / 2 + (i + 0.5) * (door.w / 5), base + (door.h - 0.01) / 2, dz - 0.002);
  for (const y of [0.05, 0.12]) P.box(tower, door.w, 0.008, 0.006, 0, base + y, dz + 0.005);
  P.sphere(tower, 0.007, door.w * 0.3, base + door.h * 0.45, dz + 0.01, null, 8); // ring pull
  // slit windows, with a sill and lintel stone
  for (const sa of [1.9, 4.2]) {
    const x = Math.sin(sa) * 0.15, z = Math.cos(sa) * 0.15;
    P.box(tower, 0.05, 0.016, 0.04, x, 0.27, z, 0, sa, 0);
    P.box(tower, 0.05, 0.016, 0.04, x, 0.43, z, 0, sa, 0);
  }
  // corbels stepped out under the parapet
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const g = new THREE.BoxGeometry(0.03, 0.022, 0.03 + k * 0.012);
      P.add(tower, g, Math.sin(a) * (0.158 + k * 0.006), top - 0.012 + k * 0.02, Math.cos(a) * (0.158 + k * 0.006), 0, a, 0);
    }
  }
  // the parapet and the merlons, capped
  P.lathe(tower, [[0.19, top + 0.042], [0.207, top + 0.042], [0.207, T], [0.18, T], [0.18, T * 0.97], [0, T * 0.97]], 0, 40);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const g = new RoundedBoxGeometry(0.075, 0.07, 0.04, 1, 0.006);
    carve(g, 0.002, 70);
    P.add(tower, g, Math.sin(a) * 0.19, T + 0.035, Math.cos(a) * 0.19, 0, a, 0);
    P.add(tower, new RoundedBoxGeometry(0.084, 0.012, 0.048, 1, 0.004), Math.sin(a) * 0.19, T + 0.074, Math.cos(a) * 0.19, 0, a, 0);
  }
}

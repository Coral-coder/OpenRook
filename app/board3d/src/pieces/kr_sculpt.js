// Sculpting with signed distance fields: a part is described as round cones, ellipsoids and
// spheres melted into each other (smooth union) or cut away (smooth subtraction), with a fine
// chisel noise, and turned into one continuous surface with marching cubes. This gives real
// sculpted forms (a muscled horse, a crested neck, a head with cheek, jaw and muzzle) instead
// of shapes stuck together.
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

const _v = new THREE.Vector3();

export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

// --- primitives: each returns a function (x, y, z) => signed distance
export function sphere(cx, cy, cz, r, sx = 1, sy = 1, sz = 1) {
  const m = Math.min(sx, sy, sz);
  return (x, y, z) => {
    const dx = (x - cx) / sx, dy = (y - cy) / sy, dz = (z - cz) / sz;
    return (Math.sqrt(dx * dx + dy * dy + dz * dz) - r) * m;
  };
}
// a cone with rounded ends, from a (radius ra) to b (radius rb); optional squash of x / z
export function cone(a, b, ra, rb, sx = 1, sz = 1) {
  const m = Math.min(sx, sz, 1);
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    // squash about the segment's start
    const px = (x - a[0]) / sx, py = y - a[1], pz = (z - a[2]) / sz;
    const bx = bax / sx, by = bay, bz = baz / sz;
    const bl2 = bx * bx + by * by + bz * bz;
    let t = (px * bx + py * by + pz * bz) / bl2;
    t = Math.max(0, Math.min(1, t));
    const qx = px - bx * t, qy = py - by * t, qz = pz - bz * t;
    return (Math.sqrt(qx * qx + qy * qy + qz * qz) - (ra + (rb - ra) * t)) * m;
  };
}
export function roundBox(cx, cy, cz, hx, hy, hz, r) {
  return (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}
/** Smooth union of parts: [[sdf, k], ...] (k = how softly it melts into what came before). */
export function blend(parts) {
  return (x, y, z) => {
    let d = parts[0][0](x, y, z);
    for (let i = 1; i < parts.length; i++) {
      const [f, k = 0.02, op = 'add'] = parts[i];
      const e = f(x, y, z);
      d = op === 'cut' ? smax(d, -e, k) : smin(d, e, k);
    }
    return d;
  };
}

// value noise for the chisel marks
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  zf = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf), yf),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf), yf),
    zf,
  );
}
export const chisel = (f, amp, freq) => (x, y, z) => f(x, y, z) + (vnoise(x * freq, y * freq, z * freq) * 0.65 + vnoise(x * freq * 2.3, y * freq * 2.3, z * freq * 2.3) * 0.35 - 0.5) * amp;

/**
 * Meshes the surface sdf = 0 inside the box [min, max] at [res] cells along its longest side.
 * Returns a non-indexed BufferGeometry with smooth normals.
 */
export function sculpt(sdf, min, max, res = 48) {
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const h = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 * 1.12;
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 120000);
  mc.isolation = 0;
  const half = res / 2;
  const K = 200 / h; // field units per distance: steep, so the surface lands where sdf = 0
  for (let z = 0; z < res; z++) {
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const wx = c[0] + ((x - half) / half) * h, wy = c[1] + ((y - half) / half) * h, wz = c[2] + ((z - half) / half) * h;
        mc.field[x + y * res + z * res * res] = -sdf(wx, wy, wz) * K;
      }
    }
  }
  mc.update();
  const n = mc.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = mc.positionArray[i * 3] * h + c[0];
    pos[i * 3 + 1] = mc.positionArray[i * 3 + 1] * h + c[1];
    pos[i * 3 + 2] = mc.positionArray[i * 3 + 2] * h + c[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // normals from the field's gradient (smooth, and true to the sculpted form)
  const e = h / res;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    _v.set(sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)).normalize();
    nor[i * 3] = _v.x;
    nor[i * 3 + 1] = _v.y;
    nor[i * 3 + 2] = _v.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  mc.geometry.dispose();
  return g;
}

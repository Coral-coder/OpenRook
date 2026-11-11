// Sculpting with signed distance fields: a part is described as round cones, ellipsoids and
// spheres melted into each other (smooth union) or cut away (smooth subtraction), with a fine
// chisel noise, and turned into one continuous surface with marching cubes. This gives real
// sculpted forms (a muscled horse, a crested neck, a head with cheek, jaw and muzzle) instead
// of shapes stuck together.
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { MeshoptSimplifier } from 'meshoptimizer';

// the simplifier is WebAssembly and starts asynchronously; it is ready long before the first
// statue is carved (the models decode first). Until then sculpts come out unsimplified.
let simplifierReady = false;
MeshoptSimplifier.ready.then(() => (simplifierReady = MeshoptSimplifier.supported)).catch(() => {});

const _v = new THREE.Vector3();

export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

// --- primitives: each returns a function (x, y, z) => signed distance
export function sphere(cx, cy, cz, r, sx = 1, sy = 1, sz = 1) {
  const m = Math.min(sx, sy, sz);
  // far outside its box the answer is simply "far" (see cone)
  const pad = r * Math.max(sx, sy, sz) + 0.05;
  return (x, y, z) => {
    if (x < cx - pad || x > cx + pad || y < cy - pad || y > cy + pad || z < cz - pad || z > cz + pad) return 1;
    const dx = (x - cx) / sx, dy = (y - cy) / sy, dz = (z - cz) / sz;
    return (Math.sqrt(dx * dx + dy * dy + dz * dz) - r) * m;
  };
}
// a cone with rounded ends, from a (radius ra) to b (radius rb); optional squash of x / z
export function cone(a, b, ra, rb, sx = 1, sz = 1) {
  const m = Math.min(sx, sz, 1);
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  // far outside a box around the cone the answer is simply "far": a large value never makes
  // a surface and leaves unions and cuts alone, and lets the coarse pass skip the point
  const pad = Math.max(ra, rb) * Math.max(1, sx, sz) + 0.05;
  const lx = Math.min(a[0], b[0]) - pad, ly = Math.min(a[1], b[1]) - pad, lz = Math.min(a[2], b[2]) - pad;
  const hx = Math.max(a[0], b[0]) + pad, hy = Math.max(a[1], b[1]) + pad, hz = Math.max(a[2], b[2]) + pad;
  return (x, y, z) => {
    if (x < lx || x > hx || y < ly || y > hy || z < lz || z > hz) return 1;
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
/** A hard union of many small parts (locks of hair, strands), skipped as a whole far from their box. */
export function union(fs, box) {
  const [lx, ly, lz, hx, hy, hz] = box;
  return (x, y, z) => {
    if (x < lx || x > hx || y < ly || y > hy || z < lz || z > hz) return 1;
    let d = 1;
    for (const f of fs) {
      const e = f(x, y, z);
      if (e < d) d = e;
    }
    return d;
  };
}
/** The box round a set of points, padded. */
export function boxOf(pts, pad) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) {
    b[i] = Math.min(b[i], p[i] - pad);
    b[i + 3] = Math.max(b[i + 3], p[i] + pad);
  }
  return b;
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
 *
 * Only the shell around the surface is evaluated exactly: the field is first sampled on a
 * grid four times coarser, and fine points well away from the surface take the coarse value
 * (they only need the right sign), so a fine sculpt costs little more than a coarse one.
 */
export const SCULPT_LOG = [];
export function sculpt(sdf, min, max, res = 48, { keep = 0.4, error = 0.0012 } = {}) {
  const t0 = performance.now();
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const h = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 * 1.12;
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, Math.max(60000, res * res * 40));
  mc.isolation = 0;
  const half = res / 2;
  const cell = h / half;
  const K = 200 / h; // field units per distance: steep, so the surface lands where sdf = 0
  const W = (i) => (i - half) * cell;
  // coarse pass
  const S = 4, cr = Math.ceil(res / S) + 1;
  const coarse = new Float32Array(cr * cr * cr);
  for (let z = 0; z < cr; z++) for (let y = 0; y < cr; y++) for (let x = 0; x < cr; x++) {
    coarse[x + y * cr + z * cr * cr] = sdf(c[0] + W(x * S), c[1] + W(y * S), c[2] + W(z * S));
  }
  const band = S * cell * 1.4; // closer than this to the surface: evaluate exactly
  const f = mc.field;
  for (let z = 0; z < res; z++) {
    const z0 = Math.min(cr - 2, (z / S) | 0), tz = z / S - z0;
    for (let y = 0; y < res; y++) {
      const y0 = Math.min(cr - 2, (y / S) | 0), ty = y / S - y0;
      for (let x = 0; x < res; x++) {
        const x0 = Math.min(cr - 2, (x / S) | 0), tx = x / S - x0;
        const i0 = x0 + y0 * cr + z0 * cr * cr;
        const L = (a, b, t) => a + (b - a) * t;
        const v = L(
          L(L(coarse[i0], coarse[i0 + 1], tx), L(coarse[i0 + cr], coarse[i0 + cr + 1], tx), ty),
          L(L(coarse[i0 + cr * cr], coarse[i0 + cr * cr + 1], tx), L(coarse[i0 + cr * cr + cr], coarse[i0 + cr * cr + cr + 1], tx), ty),
          tz,
        );
        const d = Math.abs(v) > band ? v : sdf(c[0] + W(x), c[1] + W(y), c[2] + W(z));
        f[x + y * res + z * res * res] = -d * K;
      }
    }
  }
  mc.update();
  const n = mc.count;
  // weld the triangle soup into shared vertices
  const key = new Map(), remap = new Uint32Array(n), wp = [];
  for (let i = 0; i < n; i++) {
    const x = mc.positionArray[i * 3] * h + c[0], y = mc.positionArray[i * 3 + 1] * h + c[1], z = mc.positionArray[i * 3 + 2] * h + c[2];
    const k = Math.round(x * 2e5) + ',' + Math.round(y * 2e5) + ',' + Math.round(z * 2e5);
    let v = key.get(k);
    if (v === undefined) {
      v = wp.length / 3;
      key.set(k, v);
      wp.push(x, y, z);
    }
    remap[i] = v;
  }
  mc.geometry.dispose();
  let idx = [];
  for (let i = 0; i < n; i += 3) {
    const a = remap[i], b = remap[i + 1], d = remap[i + 2];
    if (a !== b && b !== d && a !== d) idx.push(a, b, d);
  }
  let pos = new Float32Array(wp);
  idx = new Uint32Array(idx);
  // keep the triangles where the carving has shape, thin them where it is flat
  if (simplifierReady && keep < 1 && idx.length > 3000) {
    const [out] = MeshoptSimplifier.simplify(idx, pos, 3, Math.floor((idx.length * keep) / 3) * 3, error);
    const map = new Int32Array(pos.length / 3).fill(-1), np = [];
    const ni = new Uint32Array(out.length);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (map[v] < 0) {
        map[v] = np.length / 3;
        np.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      }
      ni[i] = map[v];
    }
    pos = new Float32Array(np);
    idx = ni;
  }
  // normals from the field's true gradient (smooth, and true to the sculpted form)
  const nv = pos.length / 3, nor = new Float32Array(nv * 3), e = cell * 0.5;
  for (let i = 0; i < nv; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    _v.set(sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)).normalize();
    nor[i * 3] = _v.x;
    nor[i * 3 + 1] = _v.y;
    nor[i * 3 + 2] = _v.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  SCULPT_LOG.push([res, Math.round(performance.now() - t0)]);
  return g;
}

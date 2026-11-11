// Geometry helpers for the knight and the rook: sheets with thickness (cloth, plates), lofts
// (blades, guards, flanges), mirroring, and a cache so a carving made once at unit size can be
// reused (scaled, mirrored) by every piece that needs it.
import * as THREE from 'three';

const v3 = (a) => (Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a.clone());

/**
 * A sheet with thickness: fn(u, v) -> [x, y, z] over [0,1]^2, nu x nv cells. The face normal is
 * d/du x d/dv (flip swaps it); the back is [thick] behind it (a number or (u, v) => number).
 */
export function thickSheet(fn, nu, nv, thick, { flip = false, out = null, back = null } = {}) {
  const W = nu + 1, Hn = nv + 1;
  const P = [];
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) P.push(v3(fn(i / nu, j / nv)));
  const N = [];
  const at = (i, j) => P[Math.min(Hn - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
  const du = new THREE.Vector3(), dv = new THREE.Vector3();
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
    du.subVectors(at(i + 1, j), at(i - 1, j));
    dv.subVectors(at(i, j + 1), at(i, j - 1));
    const n = new THREE.Vector3().crossVectors(du, dv).normalize();
    if (flip) n.negate();
    N.push(n);
  }
  if (out) {
    // face away from the point [out]
    let d = 0;
    for (let k = 0; k < P.length; k++) d += N[k].x * (P[k].x - out[0]) + N[k].y * (P[k].y - out[1]) + N[k].z * (P[k].z - out[2]);
    if (d < 0) {
      flip = !flip;
      for (const n of N) n.negate();
    }
  }
  const pos = [];
  const idx = [];
  const T = typeof thick === 'function' ? thick : () => thick;
  // front
  for (const p of P) pos.push(p.x, p.y, p.z);
  // back
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (back) {
      // the back given point by point (so it cannot fold out past the edges)
      const q = back(i / nu, j / nv);
      pos.push(q[0], q[1], q[2]);
      continue;
    }
    const t = T(i / nu, j / nv);
    pos.push(P[k].x - N[k].x * t, P[k].y - N[k].y * t, P[k].z - N[k].z * t);
  }
  const off = W * Hn;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (!flip) {
      idx.push(a, b, d, a, d, c);
      idx.push(off + a, off + d, off + b, off + a, off + c, off + d);
    } else {
      idx.push(a, d, b, a, c, d);
      idx.push(off + a, off + b, off + d, off + a, off + d, off + c);
    }
  }
  // the edges: their own vertices so they stay crisp
  const ring = [];
  for (let i = 0; i < nu; i++) ring.push(i);
  for (let j = 0; j < nv; j++) ring.push(j * W + nu);
  for (let i = nu; i > 0; i--) ring.push(nv * W + i);
  for (let j = nv; j > 0; j--) ring.push(j * W);
  const base = pos.length / 3;
  for (const k of ring) pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], pos[(off + k) * 3], pos[(off + k) * 3 + 1], pos[(off + k) * 3 + 2]);
  const R = ring.length;
  for (let r = 0; r < R; r++) {
    const a = base + r * 2, b = base + ((r + 1) % R) * 2;
    if (!flip) idx.push(a, a + 1, b + 1, a, b + 1, b);
    else idx.push(a, b + 1, a + 1, a, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A loft through closed rings of points (each ring the same count), capped at both ends. */
export function loft(rings, { capStart = true, capEnd = true } = {}) {
  const n = rings[0].length;
  const pos = [], idx = [];
  for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i, b = j * n + ((i + 1) % n), c = a + n, d = b + n;
    idx.push(a, b, d, a, d, c);
  }
  const cap = (r, rev) => {
    const ring = rings[r];
    const c = [0, 0, 0];
    for (const p of ring) for (let k = 0; k < 3; k++) c[k] += p[k] / n;
    const ci = pos.length / 3;
    pos.push(...c);
    const s = pos.length / 3;
    for (const p of ring) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < n; i++) {
      const a = s + i, b = s + ((i + 1) % n);
      if (rev) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orientOut(g);
}

// make a closed shape's triangles face outward (by the sign of its volume)
export function orientOut(g) {
  const p = g.attributes.position, ix = g.index.array;
  let vol = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]);
    b.fromBufferAttribute(p, ix[i + 1]);
    c.fromBufferAttribute(p, ix[i + 2]);
    vol += a.dot(b.cross(c));
  }
  if (vol < 0) {
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  return g;
}

/** The mirror image across x = 0 (winding fixed so it still faces out). */
export function mirrorX(g) {
  const m = g.clone();
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const n = m.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  if (m.index) {
    const ix = m.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  } else {
    for (const k of Object.keys(m.attributes)) {
      const at = m.attributes[k], s = at.itemSize, arr = at.array;
      for (let i = 0; i < at.count; i += 3) for (let c = 0; c < s; c++) {
        const t = arr[(i + 1) * s + c];
        arr[(i + 1) * s + c] = arr[(i + 2) * s + c];
        arr[(i + 2) * s + c] = t;
      }
    }
  }
  return m;
}

const CACHE = new Map();
/** Builds once (at unit size, say), then hands out the same geometry: callers scale the mesh. */
export function cached(key, build) {
  if (!CACHE.has(key)) CACHE.set(key, build());
  return CACHE.get(key);
}

/** Small domed rivet heads, at points [x, y, z]. */
export function rivets(P, parent, pts, r, seg = 6) {
  const g = cached('rivet' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(3, Math.round(seg * 0.5)), 0, Math.PI * 2, 0, Math.PI * 0.55));
  for (const p of pts) {
    const m = P.add(parent, g, p[0], p[1], p[2], 0, 0, 0, [r, r, r]);
    // dome facing along the given normal (default: away from the y axis)
    const n = p[3] ? new THREE.Vector3(...p[3]) : new THREE.Vector3(p[0], 0, p[2]);
    if (n.lengthSq() > 1e-12) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.normalize());
  }
}

/** A tube along points (CatmullRom), with its own radial/length segments. */
export function tube(pts, r, seg = 32, radial = 8, closed = false) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v3), closed), seg, r, radial, closed);
}

// seeded random
export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

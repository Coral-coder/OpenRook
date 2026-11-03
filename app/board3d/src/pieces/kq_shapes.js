// Sculpting tools for the king and queen: bodies shaped from dense surfaces rather than
// stacked primitives. Every generator returns geometry in the local frame of the joint it
// hangs on (limbs hang down -y from their joint; figures face +z).
import * as THREE from 'three';
import { carve } from '../carving.js';

const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (d2, s) => Math.exp(-d2 / (s * s));

// interpolate a profile [[t, r], ...] (t ascending) smoothly (Catmull-Rom)
export function profile(pts) {
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 0;
    while (pts[i + 1][0] < t) i++;
    const p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(pts.length - 1, i + 2)][1];
    const u = (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  };
}

/**
 * A closed surface of revolution around y from y0 to y1, radius r(t) (t 0..1 along y), then
 * shaped by shape(x, y, z, a, t) -> [x, y, z] where a is the angle (0 = front, +z).
 */
export function sculpt(y0, y1, r, { rad = 48, rings = 40, shape = null, capTop = true, capBottom = true } = {}) {
  const pos = [], idx = [];
  const ring = (t) => {
    const y = y0 + (y1 - y0) * t, R = Math.max(0, r(t));
    const base = pos.length / 3;
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      let x = Math.sin(a) * R, z = Math.cos(a) * R, yy = y;
      if (shape) [x, yy, z] = shape(x, y, z, a, t, R);
      pos.push(x, yy, z);
    }
    return base;
  };
  const bases = [];
  for (let i = 0; i <= rings; i++) bases.push(ring(i / rings));
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < rad; j++) {
      const a = bases[i] + j, b = bases[i + 1] + j;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const cap = (b, top) => {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < rad; j++) {
      cx += pos[(b + j) * 3];
      cy += pos[(b + j) * 3 + 1];
      cz += pos[(b + j) * 3 + 2];
    }
    const c = pos.length / 3;
    pos.push(cx / rad, cy / rad, cz / rad);
    for (let j = 0; j < rad; j++) top ? idx.push(b + j, b + j + 1, c) : idx.push(b + j, c, b + j + 1);
  };
  if (capBottom) cap(bases[0], false);
  if (capTop) cap(bases[rings], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // make sure the faces point outward
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ armoured male torso
/** The king's cuirass: a globose breastplate with a medial ridge and flaring plackart,
 * shoulder blades behind, a waist, from spine (y=0) to the base of the neck. */
export function cuirassShell(H, { rad = 40, rings = 30 } = {}) {
  const r = profile([[0, 0.092], [0.12, 0.088], [0.3, 0.1], [0.5, 0.124], [0.68, 0.136], [0.8, 0.13], [0.9, 0.105], [0.97, 0.07], [1, 0.045]].map(([t, v]) => [t, v * H]));
  return sculpt(-0.01 * H, 0.225 * H, r, {
    rad,
    rings,
    shape: (x, y, z, a, t, R) => {
      const front = Math.cos(a) > 0;
      // deeper front (barrel chest), flatter back
      z *= front ? 0.8 : 0.66;
      x *= 1.0 + 0.06 * sm(0.6, 0.85, t); // broad at the shoulders
      // the medial ridge, strongest over the chest
      if (front) z += Math.exp(-((x / (0.028 * H)) ** 2)) * 0.012 * H * sm(0.2, 0.6, t) * (1 - sm(0.85, 1, t));
      // the plackart's upper edge: a raised lip at about 45% height
      if (front) z += 0.004 * H * Math.exp(-(((t - 0.44) / 0.025) ** 2)) * Math.cos(x / (0.12 * H));
      // shoulder blades
      if (!front) {
        for (const s of [-1, 1]) z -= 0.012 * H * gauss((x - s * 0.05 * H) ** 2 / (H * H) + ((t - 0.72) * 0.2) ** 2, 0.035);
      }
      // the neck opening dips at the front
      if (front && t > 0.9) y -= 0.015 * H * Math.cos(a) * sm(0.9, 1, t);
      return [x, y, z];
    },
  });
}

// ------------------------------------------------------------------ female bodice
export function bodice(H, { rad = 48, rings = 36 } = {}) {
  const r = profile([[0, 0.072], [0.18, 0.07], [0.42, 0.088], [0.6, 0.106], [0.76, 0.108], [0.88, 0.09], [0.96, 0.062], [1, 0.04]].map(([t, v]) => [t, v * H]));
  const g = sculpt(-0.01 * H, 0.215 * H, r, {
    rad,
    rings,
    shape: (x, y, z, a, t) => {
      const front = Math.cos(a) > 0;
      z *= front ? 0.8 : 0.7;
      // the bust
      if (front) for (const s of [-1, 1]) z += 0.022 * H * gauss((x - s * 0.042 * H) ** 2 + ((t - 0.66) * 0.21 * H) ** 2, 0.032 * H);
      // the stomacher: a pointed panel down the front
      if (front) z += 0.003 * H * sm(0.03 * H, 0.0, Math.abs(x) - (0.035 * H) * sm(0.05, 0.6, t)) * (1 - sm(0.75, 0.85, t));
      // shoulder blades and a gentle spine
      if (!front) {
        for (const s of [-1, 1]) z -= 0.008 * H * gauss((x - s * 0.048 * H) ** 2 + ((t - 0.72) * 0.21 * H) ** 2, 0.03 * H);
        z += 0.004 * H * gauss(x * x, 0.008 * H);
      }
      return [x, y, z];
    },
  });
  carve(g, 0.0012 * H, 70);
  return g;
}

// ------------------------------------------------------------------ limbs
/** An arm or leg segment with muscle: r(t) along the length (t 0 at the joint). */
export function limbShape(len, r, { flat = 0.9, rad = 16, rings = 8, forward = 0 } = {}) {
  return sculpt(-len, 0, (t) => r(1 - t), {
    rad,
    rings,
    shape: (x, y, z, a, t) => [x * flat, y, z + forward * Math.sin(Math.PI * t) * len],
  });
}

/** A bell sleeve hanging from the elbow: it opens toward the wrist and its hem sags (local -z
 * is down while the forearm is held forward). */
export function bellSleeve(H, len, r0, r1, sag, folds_ = 8, { rad = 36, rings = 18 } = {}) {
  // a sleeve fitted at the elbow that widens toward the wrist; the cloth below the arm (local
  // -z while the forearm is held forward) hangs down in a long lip, the top stays close
  return sculpt(-len, 0, (u) => {
    const t = 1 - u;
    return r0 + (r1 - r0) * t * t;
  }, {
    rad, rings, capTop: false, capBottom: false,
    shape: (x, y, z, a, u) => {
      const t = 1 - u;
      const under = Math.max(0, -Math.cos(a));
      const k = 1 + 0.1 * t * Math.sin(folds_ * a + 1.3 * Math.sin(2 * a)) * (0.4 + under);
      return [x * k * (1 - 0.25 * under * t), y + sag * 0.6 * under * t * t, z * k * (1 - 0.15 * (1 - under) * t) - sag * under * t * t];
    },
  });
}

/** Plate over a limb: lames that follow the limb's profile, each overlapping the next. */
export function plateLames(len, r, n, flare = 1.12, { rad = 28, rings = 6 } = {}) {
  const geos = [];
  const h = len / n;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const R = (t) => r(t0 + (t1 - t0) * t);
    const g = sculpt(-h * 1.08, 0, (u) => {
      const t = 1 - u; // 0 at the top of the lame
      return R(t) * (1.02 + (flare - 1) * (t < 0.12 ? t / 0.12 : 1 - 0.4 * (t - 0.12))) * (t > 0.92 ? 1 - (t - 0.92) * 1.2 : 1);
    }, { rad, rings, capTop: false, capBottom: false });
    g.translate(0, -i * h, 0);
    geos.push(g);
  }
  return geos;
}

// ------------------------------------------------------------------ faces
/** A carved head (face forward, +z): skull, brow, sockets, cheekbones, nose, lips, jaw, chin,
 * ears. Centred on the head joint, crown at about +0.12H. */
export function headShape(H, { female = false, beard = false, blank = false } = {}) {
  const S = (female ? 0.066 : 0.064) * H;
  const G = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
  const W = female ? 0.8 : 0.86;
  const width = (y) => W * (1 - 0.24 * sm(-0.25, -1.0, y / 1.08));
  // the surface of the head at (x, y): an egg, the face a mask plane, carved into
  const surf = (x, y) => {
    const u = x / width(y), v = y / 1.08;
    let z = Math.sqrt(Math.max(0, 1 - u * u - v * v)) * 0.94;
    if (z > 0.72) z = 0.72 + (z - 0.72) * 0.5;
    return z;
  };
  // blank: a faceless mask of severe planes (a hard brow over shadowed hollows, a blade of a
  // nose, a narrow chin), with no eyes, lips or brows
  const blankRelief = (x, y) => {
    let d = 0.1 * G(x, y, 0, 0.26, 0.6, 0.05);
    for (const s of [-1, 1]) {
      d -= 0.14 * G(x, y, s * 0.29, 0.08, 0.2, 0.11);
      d += 0.05 * G(x, y, s * 0.42, -0.22, 0.18, 0.16);
    }
    const ny = sm(0.24, -0.3, y) * (1 - sm(-0.3, -0.36, y));
    d += 0.17 * ny * Math.exp(-((x / 0.07) ** 2));
    d += 0.07 * G(x, y, 0, -0.8, 0.18, 0.12);
    return d;
  };
  const relief = (x, y) => {
    if (blank) return blankRelief(x, y);
    let d = 0;
    d += 0.09 * G(x, y, 0, 0.27, 0.55, 0.055) * (female ? 0.6 : 1); // brow line
    for (const s of [-1, 1]) {
      d -= 0.19 * G(x, y, s * 0.29, 0.1, 0.16, 0.1); // eye sockets
      d += 0.13 * G(x, y, s * 0.29, 0.09, 0.075, 0.055); // eyeballs
      d += 0.05 * G(x, y, s * 0.29, 0.15, 0.09, 0.022); // upper lids
      d += 0.025 * G(x, y, s * 0.29, 0.035, 0.08, 0.018); // lower lids
      d += 0.07 * G(x, y, s * 0.42, -0.18, 0.15, 0.13); // cheekbones
      d -= 0.04 * G(x, y, s * 0.3, -0.45, 0.1, 0.12); // the hollow beside the mouth
      d += 0.09 * G(x, y, s * 0.11, -0.33, 0.055, 0.045); // nostril wings
      d -= 0.05 * G(x, y, s * 0.075, -0.37, 0.025, 0.02); // nostrils
      d += 0.03 * G(x, y, s * 0.2, -0.53, 0.04, 0.03); // corners of the mouth
    }
    const ny = sm(0.22, -0.3, y) * (1 - sm(-0.3, -0.37, y));
    d += 0.2 * ny * ny * Math.exp(-((x / (0.06 + 0.05 * ny)) ** 2)); // the nose
    d -= 0.04 * G(x, y, 0, -0.42, 0.045, 0.04); // philtrum
    d += 0.08 * G(x, y, 0, -0.49, 0.2, 0.04) * (female ? 1.2 : 1); // upper lip
    d -= 0.07 * G(x, y, 0, -0.54, 0.19, 0.013); // the line of the mouth
    d += 0.07 * G(x, y, 0, -0.6, 0.16, 0.045) * (female ? 1.2 : 1); // lower lip
    d -= 0.03 * G(x, y, 0, -0.68, 0.15, 0.03); // under the lip
    d += 0.09 * G(x, y, 0, -0.82, 0.17, 0.11) * (female ? 0.7 : 1); // chin
    for (const s of [-1, 1]) {
      const ex = x - s * 0.29, ey = y - 0.09;
      d -= 0.022 * G(x, y, s * 0.29, 0.09, 0.03, 0.03); // the drilled pupil
      d -= 0.012 * Math.exp(-(((Math.hypot(ex, ey * 1.1) - 0.055) / 0.012) ** 2)) * (Math.hypot(ex, ey) < 0.08 ? 1 : 0); // the iris's edge
      d -= 0.035 * Math.exp(-(((ey - 0.085 + 0.25 * ex * ex) / 0.016) ** 2)) * Math.exp(-((ex / 0.13) ** 2)); // the crease above the lid
      d -= 0.02 * Math.exp(-(((ey + 0.075 - 0.3 * ex * ex) / 0.012) ** 2)) * Math.exp(-((ex / 0.1) ** 2)); // under the lower lid
      // a fine arched brow
      const by = 0.255 + 0.06 * Math.cos((x - s * 0.3) * 3.5) - (female ? 0 : 0.02);
      d += (female ? 0.035 : 0.05) * Math.exp(-(((y - by) / 0.022) ** 2)) * Math.exp(-(((x - s * 0.3) / 0.17) ** 2));
      d += 0.025 * G(x, y, s * 0.36, -0.28, 0.12, 0.1) * (female ? 1 : 0); // soft cheeks
    }
    d -= 0.02 * Math.exp(-(((y + 0.488 - 0.05 * Math.exp(-((x / 0.035) ** 2))) / 0.012) ** 2)) * Math.exp(-((x / 0.17) ** 2)); // the cupid's bow
    d += 0.035 * G(x, y, 0, -0.31, 0.055, 0.045); // the tip of the nose
    return d;
  };
  // the skull: a light egg
  const g = new THREE.SphereGeometry(1, 48, 32);
  const sp = g.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) * 1.08, x = sp.getX(i) * width(y);
    let z = sp.getZ(i) * 0.94;
    if (z > 0.72) z = 0.72 + (z - 0.72) * 0.5;
    sp.setXYZ(i, x * S * 0.995, y * S + 0.05 * H, z * S * 0.985);
  }
  g.computeVertexNormals();
  // the face: a dense patch laid on the front, carved
  const nx = 64, ny_ = 76, x0 = -0.62, x1 = 0.62, y0 = -0.94, y1 = 0.5;
  const pos = [], idx = [];
  for (let j = 0; j <= ny_; j++) {
    for (let i = 0; i <= nx; i++) {
      const y = y0 + ((y1 - y0) * j) / ny_;
      const xs = width(y) * 0.9;
      const x = (x0 + ((x1 - x0) * i) / nx) * xs / 0.62 * 0.62 / W;
      // feather the carving out toward the patch edge so it meets the skull
      const e = Math.min(i, nx - i, j, ny_ - j) / 16;
      const z = surf(x, y) + relief(x, y) * Math.min(1, e);
      pos.push(x * S, y * S + 0.05 * H, z * S);
    }
  }
  for (let j = 0; j < ny_; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + nx + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  face.setIndex(idx);
  face.computeVertexNormals();
  const out = [g, face];
  if (beard) {
    const b = sculpt(-0.11 * H, 0.0, (t) => (0.012 + 0.036 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * H, {
      rad: 28, rings: 16,
      shape: (x, y, z, a) => [x, y, z * 0.55 + 0.035 * H],
    });
    carve(b, 0.006 * H, 110);
    b.translate(0, 0.03 * H, 0);
    out.push(b);
  }
  return out;
}

// ------------------------------------------------------------------ cloth
/**
 * A skirt or gown hanging from y=0 down to -len: radius from r0 at the waist to r1 at the hem,
 * with gravity folds (deeper and wider toward the hem), a flared hem and a train behind.
 */
export function gown(H, len, r0, r1, { folds = 12, depth = 0.08, train = 0.0, open = 0, seed = 1, rad = 96, rings = 36, hip = 0, zs = 1 } = {}) {
  const r = (t) => {
    const k = t; // 0 waist .. 1 hem
    // over the hips the cloth swells, then falls and flares to the hem
    return r0 + (r1 - r0) * (0.15 * k + 0.85 * k * k) + 0.012 * H * sm(0.92, 1, k) + hip * Math.sin(Math.PI * Math.min(1, k / 0.32)) * (1 - k);
  };
  const g = sculpt(-len, 0, (u) => r(1 - u), {
    rad,
    rings,
    capTop: true,
    capBottom: true,
    shape: (x, y, z, a, u, R) => {
      const t = 1 - u;
      z *= zs + (1 - zs) * t; // oval at the waist, round at the hem
      // folds: big ones from the waist, with smaller ones between, swaying with depth
      const w = Math.sin(folds * a + Math.sin(2 * a + seed) * 1.2 + t * 0.6) * 0.65 + Math.sin(folds * 2.17 * a + seed * 3) * 0.25 + Math.sin(folds * 3.9 * a + seed) * 0.1;
      let k = 1 + depth * (0.04 + 0.96 * t * t) * w;
      // the hem rolls and the train sweeps behind
      if (Math.cos(a) < 0) k *= 1 + train * t * t * -Math.cos(a);
      let nx = x * k, nz = z * k;
      if (open) {
        const d = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
        if (d < open) nz -= 0.02 * H * (1 - d / open) * t; // a parted front
      }
      return [nx, y + (t > 0.97 ? 0.003 * H * Math.sin(a * folds) : 0), nz];
    },
  });
  carve(g, 0.0018 * H, 45);
  return g;
}

/**
 * A cloak: an open shell around the back of the body from the shoulders down, falling in
 * folds. Spans angles (around y, 0 = front) from -span to span measured from the back.
 */
export function cloak(H, len, r0, r1, { span = 1.9, folds = 7, depth = 0.1, seed = 2, rad = 44, rings = 24 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = -len * t;
    const R = r0 + (r1 - r0) * Math.sqrt(t);
    for (let j = 0; j <= rad; j++) {
      const u = j / rad;
      const a = Math.PI + (u * 2 - 1) * span * (0.85 + 0.15 * t);
      const w = Math.sin(folds * a + Math.sin(3 * a + seed) + t) * 0.7 + Math.sin(folds * 2.3 * a + seed) * 0.3;
      const k = 1 + depth * (0.3 + 0.7 * t) * w;
      // the edges curl in toward the body
      const edge = Math.min(u, 1 - u);
      const rr = R * k * (1 - 0.18 * Math.exp(-edge * 22));
      // the hem rises and falls with the folds
      pos.push(Math.sin(a) * rr, y + 0.02 * H * w * t ** 4, Math.cos(a) * rr * 0.85);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j, b = a + rad + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  carve(g, 0.0015 * H, 50);
  // give it thickness: a second, slightly smaller shell facing in, joined at the edges
  const inner = g.clone();
  const ip = inner.attributes.position;
  for (let k = 0; k < ip.count; k++) {
    const x = ip.getX(k), z = ip.getZ(k);
    const l = Math.hypot(x, z) || 1;
    ip.setXYZ(k, x - (x / l) * 0.011 * H, ip.getY(k), z - (z / l) * 0.011 * H);
  }
  const ii = inner.index.array;
  for (let k = 0; k < ii.length; k += 3) [ii[k + 1], ii[k + 2]] = [ii[k + 2], ii[k + 1]];
  inner.computeVertexNormals();
  // the edges: a strip joining the outer and inner shells all round the border
  const op = g.attributes.position;
  const ep = [], ei = [];
  const border = [];
  for (let j = 0; j <= rad; j++) border.push(j); // top
  for (let i = 1; i <= rings; i++) border.push(i * (rad + 1) + rad); // right side
  for (let j = rad - 1; j >= 0; j--) border.push(rings * (rad + 1) + j); // hem
  for (let i = rings - 1; i >= 0; i--) border.push(i * (rad + 1)); // left side
  for (let k = 0; k < border.length; k++) {
    const v = border[k];
    ep.push(op.getX(v), op.getY(v), op.getZ(v), ip.getX(v), ip.getY(v), ip.getZ(v));
  }
  for (let k = 0; k < border.length - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    ei.push(a, c, b, b, c, d);
  }
  const edge = new THREE.BufferGeometry();
  edge.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
  edge.setIndex(ei);
  edge.computeVertexNormals();
  const edge2 = edge.clone();
  const e2 = edge2.index.array;
  for (let k = 0; k < e2.length; k += 3) [e2[k + 1], e2[k + 2]] = [e2[k + 2], e2[k + 1]];
  edge2.computeVertexNormals();
  return [g, inner, edge, edge2];
}

// ------------------------------------------------------------------ hair
/** A braid along a path: three strands twisted around it. */
export function braid(curve, r, turns, H, seg = 64) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Curve();
    c.getPoint = (t, v = new THREE.Vector3()) => {
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const n = new THREE.Vector3(0, 1, 0).cross(tan).normalize();
      if (n.lengthSq() < 0.5) n.set(1, 0, 0);
      const b = tan.clone().cross(n).normalize();
      const a = t * turns * Math.PI * 2 + (k * Math.PI * 2) / 3;
      return v.copy(p).addScaledVector(n, Math.cos(a) * r * 0.9).addScaledVector(b, Math.sin(a) * r * 0.9);
    };
    out.push(new THREE.TubeGeometry(c, seg, r * 0.75, 8, false));
  }
  return out;
}

/** Hanging locks of hair from points on the head down the back. */
export function locks(H, n, { from = 0.06, len = 0.2, spread = 0.06, wave = 0.01 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + ((i / (n - 1)) * 2 - 1) * 1.1;
    const c = new THREE.Curve();
    const x0 = Math.sin(a) * spread * H, z0 = Math.cos(a) * spread * H * 0.95;
    c.getPoint = (t, v = new THREE.Vector3()) =>
      v.set(x0 * (1 + 0.5 * t) + Math.sin(t * 9 + i) * wave * H * t, from * H - t * len * H, z0 * (1 + 0.6 * t) - 0.02 * H * t + Math.cos(t * 7 + i) * wave * H * 0.5 * t);
    const g = new THREE.TubeGeometry(c, 16, 0.009 * H, 6, false);
    // taper
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = Math.floor(k / 7) / 16;
      const ctr = c.getPoint(Math.min(1, t));
      const s = 1 - 0.7 * t;
      p.setXYZ(k, ctr.x + (p.getX(k) - ctr.x) * s, ctr.y + (p.getY(k) - ctr.y) * s, ctr.z + (p.getZ(k) - ctr.z) * s);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

// ------------------------------------------------------------------ crowns
/** A crown that reads at a small size: a deep band, big fleurs, pearls, and jewels. */
export function crownGeos(r, h, { points = 8, arches = false } = {}) {
  const out = [];
  out.push(sculpt(0, h * 0.42, () => r, { rad: 96, rings: 6, capTop: false, capBottom: false, shape: (x, y, z, a, t) => [x * (1 + 0.04 * t), y, z * (1 + 0.04 * t)] }));
  const lip = (y, t) => {
    const g = new THREE.TorusGeometry(r * 1.03, t, 8, 64);
    g.rotateX(Math.PI / 2);
    g.translate(0, y, 0);
    return g;
  };
  out.push(lip(0.02 * h, h * 0.06), lip(0.42 * h, h * 0.055));
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const x = Math.sin(a) * r * 1.03, z = Math.cos(a) * r * 1.03;
    const fleur = new THREE.Shape();
    fleur.moveTo(-h * 0.2, 0);
    fleur.quadraticCurveTo(-h * 0.35, h * 0.3, -h * 0.12, h * 0.35);
    fleur.quadraticCurveTo(-h * 0.14, h * 0.6, 0, h * 0.85);
    fleur.quadraticCurveTo(h * 0.14, h * 0.6, h * 0.12, h * 0.35);
    fleur.quadraticCurveTo(h * 0.35, h * 0.3, h * 0.2, 0);
    const fg = new THREE.ExtrudeGeometry(fleur, { depth: h * 0.06, bevelEnabled: true, bevelThickness: h * 0.03, bevelSize: h * 0.03, bevelSegments: 1, curveSegments: 8 });
    fg.translate(0, 0, -h * 0.03);
    fg.rotateY(a);
    fg.translate(x, h * 0.42, z);
    out.push(fg);
    const pearl = new THREE.SphereGeometry(h * 0.07, 10, 8);
    pearl.translate(x, h * 1.3, z);
    out.push(pearl);
    const jewel = new THREE.OctahedronGeometry(h * 0.08, 1);
    jewel.scale(1, 1.3, 0.6);
    jewel.rotateY(a);
    const b = a + Math.PI / points;
    jewel.translate(Math.sin(b) * r * 1.07, h * 0.22, Math.cos(b) * r * 1.07);
    out.push(jewel);
  }
  if (arches) {
    for (let i = 0; i < 2; i++) {
      const g = new THREE.TorusGeometry(r * 0.98, h * 0.05, 10, 64, Math.PI);
      g.rotateY((i * Math.PI) / 2);
      g.scale(1, 0.9, 1);
      g.translate(0, h * 0.45, 0);
      out.push(g);
    }
    const orb = new THREE.SphereGeometry(h * 0.16, 24, 16);
    orb.translate(0, h * 0.45 + r * 0.9 + h * 0.1, 0);
    out.push(orb);
    const cross = new THREE.BoxGeometry(h * 0.06, h * 0.32, h * 0.06);
    cross.translate(0, h * 0.45 + r * 0.9 + h * 0.38, 0);
    out.push(cross);
    const bar = new THREE.BoxGeometry(h * 0.2, h * 0.06, h * 0.06);
    bar.translate(0, h * 0.45 + r * 0.9 + h * 0.42, 0);
    out.push(bar);
  }
  return out;
}

// ------------------------------------------------------------------ hands
/** A hand closed round a grip (the grip runs along local z through the palm). */
export function fist(s, side, { gauntlet = false } = {}) {
  const out = [];
  const palm = sculpt(-0.55 * s, 0, profile([[0, 0.22 * s], [0.3, 0.3 * s], [0.7, 0.3 * s], [1, 0.26 * s]]), { rad: 32, rings: 14, shape: (x, y, z) => [x * 1.15, y, z * 0.75] });
  out.push(palm);
  for (let i = 0; i < 4; i++) {
    // each finger curls round: three phalanges
    const fx = (i - 1.5) * 0.15 * s;
    const c = new THREE.Curve();
    const L = (0.36 - Math.abs(i - 1.2) * 0.04) * s;
    c.getPoint = (t, v = new THREE.Vector3()) => {
      const a = t * Math.PI * 1.1;
      return v.set(fx, -0.5 * s - Math.sin(a) * L * 0.55, Math.cos(a) * L * 0.55 - L * 0.55 + 0.18 * s);
    };
    out.push(new THREE.TubeGeometry(c, 20, (gauntlet ? 0.075 : 0.062) * s, 10, false));
    if (!gauntlet) {
      // knuckles and a fingernail at the tip
      for (let k = 1; k < 3; k++) {
        const kn = new THREE.SphereGeometry(0.066 * s, 10, 8);
        kn.translate(...c.getPoint(k / 3).toArray());
        out.push(kn);
      }
      const tipP = c.getPoint(1), tipT = c.getTangent(1);
      const nail = new THREE.SphereGeometry(0.06 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      nail.scale(0.9, 0.35, 1.2);
      nail.lookAt(tipT);
      nail.translate(tipP.x, tipP.y, tipP.z);
      out.push(nail);
    }
    if (gauntlet) for (let k = 1; k < 3; k++) {
      const knuckle = new THREE.SphereGeometry(0.08 * s, 10, 6);
      knuckle.translate(...c.getPoint(k / 3).toArray());
      out.push(knuckle);
    }
  }
  const th = new THREE.CapsuleGeometry(0.07 * s, 0.26 * s, 4, 12);
  th.rotateZ(side * 0.9);
  th.rotateX(0.7);
  th.translate(-side * 0.28 * s, -0.42 * s, 0.22 * s);
  out.push(th);
  return out;
}

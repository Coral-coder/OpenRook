// Fine carving for the bishop and the pawn (third pass): work that follows a carved surface
// (cords, braid and pearls along a hem or an orphrey, motifs set on a fold), mail and scale
// worked into a surface, cloth panels with thickness, plate with rolled and riveted edges,
// gauntleted fingers, a better blade.
//
// Surfaces made by robe() (and any LatheGeometry) are sampled through their lathe grid rather
// than by ray casting: exact, and cheap enough to set hundreds of motifs.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ------------------------------------------------------------------ the lathe grid

/** Wraps a (deformed) LatheGeometry made from np profile points and ns segments so points on
 * it can be found by angle a (atan2(z, x), as robe() uses) and height y. */
export function latheGrid(geo, np, ns) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  // the descending (outer) run of each column: rows until the profile turns back up
  const cols = [];
  for (let i = 0; i <= ns; i++) {
    let end = np - 1;
    for (let j = 1; j < np; j++) {
      if (p.getY(i * np + j) > p.getY(i * np + j - 1) + 1e-9) {
        end = j - 1;
        break;
      }
    }
    cols.push(end);
  }
  const vtx = (k, out) => out.set(p.getX(k), p.getY(k), p.getZ(k));
  const nrm = (k, out) => out.set(n.getX(k), n.getY(k), n.getZ(k));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), NA = new THREE.Vector3(), NB = new THREE.Vector3();
  const colAt = (i, y, P, N) => {
    const end = cols[i];
    let j = 0;
    while (j < end - 1 && p.getY(i * np + j + 1) > y) j++;
    const k0 = i * np + j, k1 = k0 + 1;
    const y0 = p.getY(k0), y1 = p.getY(k1);
    const t = y0 === y1 ? 0 : clamp01((y0 - y) / (y0 - y1));
    vtx(k0, P).lerp(vtx(k1, A), t);
    nrm(k0, N).lerp(nrm(k1, NA), t);
  };
  return {
    geo,
    np,
    ns,
    /** point and outward normal at angle a, height y */
    at(a, y) {
      let phi = Math.PI / 2 - a;
      phi = ((phi % TAU) + TAU) % TAU;
      const f = (phi / TAU) * ns;
      const i0 = Math.min(ns - 1, Math.floor(f)), t = f - i0;
      const P0 = new THREE.Vector3(), N0 = new THREE.Vector3();
      colAt(i0, y, P0, N0);
      colAt(i0 + 1, y, B, NB);
      P0.lerp(B, t);
      N0.lerp(NB, t).normalize();
      // the true angle may differ (flattened robes): good enough for motifs
      return { p: P0, n: N0 };
    },
    /** a level ring of points at height y, n round, lifted off the surface */
    ring(y, n, lift = 0) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const { p: q, n: nn } = this.at((i / n) * TAU, y);
        out.push(q.addScaledVector(nn, lift));
      }
      return out;
    },
    /** the lowest point of each column (the hem), and its normal */
    hem(lift = 0) {
      const out = [];
      for (let i = 0; i < ns; i++) {
        const k = i * np + cols[i];
        const P = vtx(k, new THREE.Vector3()), N = nrm(k, new THREE.Vector3());
        N.y = 0;
        N.normalize();
        out.push(P.addScaledVector(N, lift));
      }
      return out;
    },
    /** a ring of points a fixed distance above the hem, following its rise and fall */
    aboveHem(dy, lift = 0, smooth = 5) {
      const out = [];
      const hy = [];
      for (let i = 0; i < ns; i++) hy.push(p.getY(i * np + cols[i]));
      for (let i = 0; i < ns; i++) {
        let y = 0;
        for (let k = -smooth; k <= smooth; k++) y += hy[(i + k + ns) % ns];
        y = y / (2 * smooth + 1) + dy;
        const P = new THREE.Vector3(), N = new THREE.Vector3();
        colAt(i, y, P, N);
        out.push(P.addScaledVector(N, lift));
      }
      return out;
    },
  };
}

// ------------------------------------------------------------------ cords, braid, pearls

/** A round cord through the points (closed or open), radius r. */
export function cord(pts, r, { closed = false, radial = 6, perPt = 2, taper = 0 } = {}) {
  const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const segs = Math.max(4, Math.round(pts.length * perPt));
  c.arcLengthDivisions = Math.max(16, segs * 2);
  const g = new THREE.TubeGeometry(c, segs, r, radial, closed);
  if (taper) {
    const p = g.attributes.position, q = new THREE.Vector3();
    for (let s = 0; s <= segs; s++) {
      c.getPointAt(s / segs, q);
      const k = 1 - taper * (s / segs);
      for (let j = 0; j <= radial; j++) {
        const i = s * (radial + 1) + j;
        p.setXYZ(i, q.x + (p.getX(i) - q.x) * k, q.y + (p.getY(i) - q.y) * k, q.z + (p.getZ(i) - q.z) * k);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

/** A twisted (rope) cord: the radius ripples round the tube in a spiral. */
export function rope(pts, r, { closed = false, twist = 40, radial = 8, perPt = 3 } = {}) {
  const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const segs = Math.max(8, Math.round(pts.length * perPt));
  c.arcLengthDivisions = Math.max(16, segs * 2);
  const g = new THREE.TubeGeometry(c, segs, r, radial, closed);
  const p = g.attributes.position, q = new THREE.Vector3();
  for (let s = 0; s <= segs; s++) {
    c.getPointAt(s / segs, q);
    for (let j = 0; j <= radial; j++) {
      const i = s * (radial + 1) + j;
      const k = 1 + 0.28 * Math.sin((j / radial) * TAU * 2 + (s / segs) * twist);
      p.setXYZ(i, q.x + (p.getX(i) - q.x) * k, q.y + (p.getY(i) - q.y) * k, q.z + (p.getZ(i) - q.z) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Many small pearls merged into one geometry, set at the given points. */
export function pearls(pts, r, { w = 6, h = 4 } = {}) {
  const base = new THREE.SphereGeometry(r, w, h);
  const bp = base.attributes.position.array, bn = base.attributes.normal.array, bi = base.index.array;
  const pos = new Float32Array(bp.length * pts.length), nor = new Float32Array(bn.length * pts.length);
  const idx = new Uint32Array(bi.length * pts.length);
  const nv = bp.length / 3;
  pts.forEach((q, k) => {
    for (let i = 0; i < bp.length; i += 3) {
      pos[k * bp.length + i] = bp[i] + q.x;
      pos[k * bp.length + i + 1] = bp[i + 1] + q.y;
      pos[k * bp.length + i + 2] = bp[i + 2] + q.z;
    }
    nor.set(bn, k * bn.length);
    for (let i = 0; i < bi.length; i++) idx[k * bi.length + i] = bi[i] + k * nv;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Evenly spaced points along a polyline (by arc length). */
export function spaced(pts, n, closed = false) {
  const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  c.arcLengthDivisions = Math.max(16, n * 3);
  const out = [];
  for (let i = 0; i < n; i++) out.push(c.getPointAt(closed ? i / n : i / Math.max(1, n - 1)));
  return out;
}

// ------------------------------------------------------------------ worked surfaces

/**
 * Mail or scale worked into a surface turned round the y axis: n links round, rows every dy.
 * kind 'mail': rows of domed rings, staggered; 'scale': overlapping scales with rounded lower
 * edges, each standing proud of the one below. Vertices move along their normals.
 */
export function chain(geo, n, dy, amp, { kind = 'mail', y0 = 1e9, y1 = -1e9, axis = 'y' } = {}) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, nr = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > y0 || y < y1) continue;
    const a = Math.atan2(z, x);
    const v = -y / dy;
    const row = Math.floor(v);
    let u = (a / TAU) * n + (row & 1 ? 0.5 : 0);
    const fu = u - Math.floor(u), fv = v - row;
    let d;
    if (kind === 'scale') {
      // the scale's lower edge bows down at its middle; it swells toward that edge
      const cx = (fu - 0.5) * 2;
      const edge = 0.62 + 0.38 * Math.sqrt(Math.max(0, 1 - cx * cx));
      const s = fv / edge;
      d = s <= 1 ? Math.pow(s, 0.8) * (1 - 0.35 * cx * cx) : 0.15 * (1 - (fv - edge) / (1 - edge + 1e-6));
    } else {
      // a ring: a raised annulus round each link, the hole a little sunk
      const cx = (fu - 0.5) * 2, cy = (fv - 0.5) * 2;
      const rr = Math.sqrt(cx * cx + cy * cy * 1.2);
      d = Math.max(0, 1 - Math.abs(rr - 0.55) / 0.45) * 0.9 + (rr < 0.3 ? 0.15 : 0);
    }
    d = (d - 0.4) * amp;
    p.setXYZ(i, x + nr.getX(i) * d, y + nr.getY(i) * d, z + nr.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Densifies a turned profile: rows evenly spaced along its length. */
export function denseProfile(pts, rows) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [];
  for (let k = 0; k <= rows; k++) {
    const s = (k / rows) * L[L.length - 1];
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    const t = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
    out.push(new THREE.Vector2(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t));
  }
  return out;
}

/** A turned shape facing outward, from a profile (any direction). */
export function turned(pts, seg, rows = 0) {
  const prof = rows ? denseProfile(pts, rows) : pts.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, seg);
  return faceOut(g);
}
export function faceOut(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let dot = 0;
  for (let i = 0; i < p.count; i++) dot += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i);
  if (dot < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/**
 * A sheet of cloth with thickness: f(u, v) gives the mid-surface point for u, v in 0..1
 * (u across, v down); the sheet is thickened along its normal and its edges closed.
 */
export function slab(f, nu, nv, thick) {
  const N = (nu + 1) * (nv + 1);
  const mid = new Float32Array(N * 3);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const q = f(i / nu, j / nv);
    mid.set([q.x, q.y, q.z], (j * (nu + 1) + i) * 3);
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), du = new THREE.Vector3(), dv = new THREE.Vector3(), nn = new THREE.Vector3(), c = new THREE.Vector3();
  const at = (i, j, v) => v.fromArray(mid, (Math.min(nv, Math.max(0, j)) * (nu + 1) + Math.min(nu, Math.max(0, i))) * 3);
  const pos = new Float32Array(N * 6);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    du.subVectors(at(i + 1, j, _a), at(i - 1, j, _b));
    dv.subVectors(at(i, j + 1, _a), at(i, j - 1, _b));
    nn.crossVectors(dv, du).normalize(); // +z side for a sheet in x (u) and -y (v)
    at(i, j, c);
    const k = j * (nu + 1) + i;
    pos.set([c.x + nn.x * thick / 2, c.y + nn.y * thick / 2, c.z + nn.z * thick / 2], k * 3);
    pos.set([c.x - nn.x * thick / 2, c.y - nn.y * thick / 2, c.z - nn.z * thick / 2], (N + k) * 3);
  }
  const idx = [];
  const F = (i, j) => j * (nu + 1) + i, Bk = (i, j) => N + j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    idx.push(F(i, j), F(i, j + 1), F(i + 1, j), F(i + 1, j), F(i, j + 1), F(i + 1, j + 1));
    idx.push(Bk(i, j), Bk(i + 1, j), Bk(i, j + 1), Bk(i + 1, j), Bk(i + 1, j + 1), Bk(i, j + 1));
  }
  const edge = (a, b) => idx.push(F(...a), Bk(...a), F(...b), F(...b), Bk(...a), Bk(...b));
  for (let i = 0; i < nu; i++) {
    edge([i + 1, 0], [i, 0]);
    edge([i, nv], [i + 1, nv]);
  }
  for (let j = 0; j < nv; j++) {
    edge([0, j], [0, j + 1]);
    edge([nu, j + 1], [nu, j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the front faces point out (+z of the sheet at its middle)
  return g;
}

/** Orients a motif group so its +z points along normal n, keeping its +y as near up as can be. */
export function setOn(grp, p, n, up = new THREE.Vector3(0, 1, 0)) {
  grp.position.copy(p);
  const z = n.clone().normalize();
  const x = up.clone().cross(z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x);
  grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return grp;
}

/** A spray of rivets (domed heads) round a ring in the xz plane at height y, merged. */
export function rivetRing(r, y, n, size, { from = 0, to = TAU, sz = 1 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * (i + 0.5)) / n;
    pts.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * sz));
  }
  return pearls(pts, size, { w: 6, h: 4 });
}

/**
 * A coat of separate scales laid over a surface S(a, y) (a: angle round the y axis, 0 = +z,
 * PI/2 = +x; y: height), in staggered rows from y0 downward, every `pitch`, `cols` round.
 * Each scale is a flat, slightly cupped lame with a rounded lower edge, a ridge down its
 * middle and a rivet near its top; it hangs down the surface, its lower edge standing out
 * over the row below with a thickness strip (a crisp shadow line). skip(p) leaves out scales
 * that would be hidden. Returns one geometry.
 */
export function scaleCoat(S, { y0, rows, pitch, cols, tilt = 0.3, lift = 0.0015, thick = 0.0028, cup = 0.16, overlapW = 1.22, overlapH = 1.65, skip = null, aFrom = 0, aTo = TAU } = {}) {
  const NS = [-1, -0.5, 0, 0.5, 1], NT = [0, 0.34, 0.67, 1];
  const pos = [], idx = [];
  const P0 = new THREE.Vector3(), Pa = new THREE.Vector3(), Pb = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), q = new THREE.Vector3();
  const full = aTo - aFrom >= TAU - 1e-6;
  for (let r = 0; r < rows; r++) {
    const y = y0 - r * pitch;
    for (let c = 0; c < cols; c++) {
      const a = aFrom + ((c + (r & 1 ? 0.5 : 0) + (full ? 0 : 0.5)) / cols) * (aTo - aFrom);
      P0.copy(S(a, y));
      if (skip && skip(P0, a, y)) continue;
      const da = 0.01, dy = pitch * 0.25;
      X.copy(S(a + da, y)).sub(Pa.copy(S(a - da, y))).divideScalar(2 * da); // d/da
      const arc = X.length();
      X.normalize();
      Y.copy(S(a, y + dy)).sub(Pb.copy(S(a, y - dy))).normalize();
      Z.crossVectors(X, Y).normalize();
      Y.crossVectors(Z, X).normalize();
      const w = ((arc * (aTo - aFrom)) / cols) * overlapW, h = pitch * overlapH;
      const R = Math.max(arc, 1e-4); // the surface's radius here: bend the scale round it
      const base = pos.length / 3;
      const put = (x, yy, z) => {
        q.copy(P0).addScaledVector(X, x).addScaledVector(Y, yy).addScaledVector(Z, z + lift - (x * x) / (2 * R));
        pos.push(q.x, q.y, q.z);
      };
      const shape = (s, t) => {
        const wf = t < 0.5 ? 1 : 1 - 0.3 * ((t - 0.5) / 0.5) ** 2;
        const x = s * (w / 2) * wf;
        const yy = -h * (t + 0.22 * t * t * (1 - s * s));
        let z = tilt * h * t * t * 0.8 + tilt * h * t * 0.2;
        z += cup * h * (1 - s * s) * Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.35; // cupped
        if (s === 0) z += 0.05 * h * (t > 0.2 ? 1 : 0); // the ridge
        if (s === 0 && t === NT[1]) z += 0.09 * h; // the rivet
        return [x, yy, z];
      };
      for (const t of NT) for (const s of NS) put(...shape(s, t));
      const cw = NS.length;
      for (let j = 0; j < NT.length - 1; j++) for (let i = 0; i < cw - 1; i++) {
        const k = base + j * cw + i;
        idx.push(k, k + cw, k + 1, k + 1, k + cw, k + cw + 1);
      }
      // the lower edge's thickness, so it throws a crisp line onto the row below
      const eb = pos.length / 3;
      const rim = [[-1, NT[2]], ...NS.map((s) => [s, 1]), [1, NT[2]]];
      for (const [s, t] of rim) {
        const [x, yy, z] = shape(s, t);
        put(x, yy, z);
        put(x, yy + thick * 0.4, z - thick * 2.2);
      }
      for (let i = 0; i < rim.length - 1; i++) {
        const a0 = eb + i * 2, b0 = a0 + 2;
        idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A surface S(a, y) for scaleCoat from a turned profile [[r, y]...] squashed in z by sz. */
export function turnedSurface(prof, sz = 1, grow = 0) {
  const R = (y) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      if ((y - y0) * (y - y1) <= 0 && y0 !== y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    const A = prof[0], B = prof[prof.length - 1];
    return Math.abs(y - A[1]) < Math.abs(y - B[1]) ? A[0] : B[0];
  };
  return (a, y) => {
    const r = R(y) + grow;
    return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * sz);
  };
}

// Stone rubble with real rigid-body physics.
//
// When a statue is struck down it cracks: every part (head, arms, weapon, torso, robe, the
// horse's body and legs, the rook's keep) becomes a solid body, and the big ones are split
// along planes into two to four chunks with capped faces. The blow drives the break: an
// impulse at the point where the weapon landed, along the swing, falling off with distance,
// so the parts nearest the blow fly and spin while the far ones only tip over.
//
// Each body is an oriented box of stone (mass from its volume, inertia from its sides) with a
// few spheres along its long axis for colliding with other fragments. Contacts (the board,
// the frame and table beyond it, the statues still standing, and
// other fragments) are solved with impulses: restitution only for hard hits, Coulomb friction,
// positional correction, and sleeping once still, so heaps settle without jitter. Fixed
// 120 Hz steps, a cap on substeps and on live bodies keep it cheap on a phone. Stone chips are
// cheaper spheres. Pieces can be glued into one compound (a torso carrying its arms and head)
// and let go one by one, so a statue comes apart in stages (see breakup.js). Once a piece has
// settled it leaves the physics and melts away (melt.js).
import * as THREE from 'three';

const G = 9.81;
const HZ = 120, H = 1 / HZ, MAX_STEPS = 5;
const DENSITY = 140; // stone, in board units: a king's torso weighs about 1
const FILL = 0.45; // a carved part fills about half of its box
const MAX_BODIES = 70, MAX_CHIPS = 140;
const MU = 0.6; // stone on stone
const SLOP = 0.002;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _n = new THREE.Vector3(), _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const chipGeos = [new THREE.DodecahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0)];

// the ground under a point: the board, the frame and plinth around it, then the table
export function groundAt(x, z) {
  const e = Math.max(Math.abs(x), Math.abs(z));
  return e < 4.5 ? 0 : e < 4.8 ? -0.25 : -0.65;
}

// ------------------------------------------------------------------ cutting stone
// Splits a triangle soup (position + normal) by a plane (n . p = d) into two closed pieces;
// the cut faces are capped. Returns null when the plane misses. Written on flat arrays: a
// statue part can run to tens of thousands of triangles and the cut must not stall a frame.
export function cutGeometry(geo, n, d) {
  const it = cutSteps(geo, n, d);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
// the same, a slice of the triangles at a time (yields between them)
export function* cutSteps(geo, n, d) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array;
  const count = P.length / 3;
  const nx = n.x, ny = n.y, nz = n.z;
  // which side each vertex is on; a part the plane misses is left whole
  const D = new Float32Array(count);
  let pos = 0, neg = 0;
  for (let i = 0; i < count; i++) {
    if (i && i % 20000 === 0) yield;
    const v = P[i * 3] * nx + P[i * 3 + 1] * ny + P[i * 3 + 2] * nz - d;
    D[i] = v;
    if (v > 0) pos++;
    else if (v < 0) neg++;
  }
  if (!pos || !neg) return null;
  // size the two halves exactly (a crossing triangle makes at most two on a side, and one
  // cap triangle), so there's no growing and copying
  let w0 = 0, w1 = 0, cross = 0;
  for (let t = 0; t < count; t += 3) {
    if (t && t % 30000 === 0) yield;
    const d0 = D[t], d1 = D[t + 1], d2 = D[t + 2];
    if (d0 >= 0 && d1 >= 0 && d2 >= 0) w0++;
    else if (d0 <= 0 && d1 <= 0 && d2 <= 0) w1++;
    else cross++;
  }
  const mk = (w) => ({ p: new Float32Array((w + cross * 3) * 9 + 9), n: new Float32Array((w + cross * 3) * 9 + 9), k: 0 });
  const out = [mk(w0), mk(w1)];
  const grow = (o, need) => {
    if (o.k + need <= o.p.length) return;
    const size = Math.max(o.p.length * 2, o.k + need);
    const p2 = new Float32Array(size), n2 = new Float32Array(size);
    p2.set(o.p.subarray(0, o.k));
    n2.set(o.n.subarray(0, o.k));
    o.p = p2;
    o.n = n2;
  };
  const put = (o, x, y, z, a, b, c) => {
    const k = o.k;
    o.p[k] = x; o.p[k + 1] = y; o.p[k + 2] = z;
    o.n[k] = a; o.n[k + 1] = b; o.n[k + 2] = c;
    o.k = k + 3;
  };
  const seg = []; // the cut's edge, as pairs of points
  const poly = [[], []]; // clipped polygons, each vertex 6 numbers
  for (let t = 0; t < count; t += 3) {
    if (t && t % 3000 === 0) yield;
    const d0 = D[t], d1 = D[t + 1], d2 = D[t + 2];
    const side = d0 >= 0 && d1 >= 0 && d2 >= 0 ? 0 : d0 <= 0 && d1 <= 0 && d2 <= 0 ? 1 : -1;
    if (side >= 0) {
      const o = out[side];
      grow(o, 9);
      const op = o.p, on = o.n, k = o.k, j = t * 3;
      for (let c = 0; c < 9; c++) {
        op[k + c] = P[j + c];
        on[k + c] = N[j + c];
      }
      o.k = k + 9;
      continue;
    }
    poly[0].length = poly[1].length = 0;
    let cut0 = null;
    for (let i = 0; i < 3; i++) {
      const a = t + i, b = t + ((i + 1) % 3), da = D[a], db = D[b];
      const va = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2], N[a * 3], N[a * 3 + 1], N[a * 3 + 2]];
      if (da >= 0) poly[0].push(va);
      if (da <= 0) poly[1].push(va);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const u = da / (da - db);
        const m = new Array(6);
        for (let c = 0; c < 3; c++) {
          m[c] = P[a * 3 + c] + (P[b * 3 + c] - P[a * 3 + c]) * u;
          m[c + 3] = N[a * 3 + c] + (N[b * 3 + c] - N[a * 3 + c]) * u;
        }
        poly[0].push(m);
        poly[1].push(m);
        if (cut0) seg.push(cut0[0], cut0[1], cut0[2], m[0], m[1], m[2]);
        else cut0 = m;
      }
    }
    for (let s = 0; s < 2; s++) {
      const q = poly[s], o = out[s];
      if (q.length < 3) continue;
      grow(o, (q.length - 2) * 9);
      for (let k = 1; k + 1 < q.length; k++) for (const v of [q[0], q[k], q[k + 1]]) put(o, v[0], v[1], v[2], v[3], v[4], v[5]);
    }
  }
  // cap the cut: a fan around the middle of the section, its points sorted round it
  const ns = seg.length / 3;
  if (ns >= 6) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < ns; i++) {
      cx += seg[i * 3] / ns;
      cy += seg[i * 3 + 1] / ns;
      cz += seg[i * 3 + 2] / ns;
    }
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(nx) > 0.9) u.set(0, 1, 0);
    u.cross(n).normalize();
    const w = n.clone().cross(u);
    const idx = [];
    for (let i = 0; i < ns; i++) {
      const x = seg[i * 3] - cx, y = seg[i * 3 + 1] - cy, z = seg[i * 3 + 2] - cz;
      idx.push([i, Math.atan2(x * w.x + y * w.y + z * w.z, x * u.x + y * u.y + z * u.z)]);
    }
    idx.sort((a, b) => a[1] - b[1]);
    for (let s = 0; s < 2; s++) {
      const o = out[s], sn = s === 0 ? -1 : 1;
      grow(o, idx.length * 9);
      for (let k = 0; k < idx.length; k++) {
        const a = idx[k][0], b = idx[(k + 1) % idx.length][0];
        const A = [seg[a * 3], seg[a * 3 + 1], seg[a * 3 + 2]], B = [seg[b * 3], seg[b * 3 + 1], seg[b * 3 + 2]];
        const tri = s === 0 ? [[cx, cy, cz], B, A] : [[cx, cy, cz], A, B];
        for (const q of tri) put(o, q[0], q[1], q[2], nx * sn, ny * sn, nz * sn);
      }
    }
  }
  if (out[0].k < 9 || out[1].k < 9) return null;
  return out.map((o) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(o.p.subarray(0, o.k), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(o.n.subarray(0, o.k), 3));
    g.userData.own = true;
    return g;
  });
}

export function soup(geo) {
  if (!geo.index && geo.attributes.normal) {
    // the template's own arrays, only ever read (cutting writes new ones)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geo.attributes.position);
    g.setAttribute('normal', geo.attributes.normal);
    return g;
  }
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); // never touch the shared template
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the world
const UP = new THREE.Vector3(0, 1, 0);
const _gat = new THREE.Vector3(), _gr = new THREE.Vector3(), _gr2 = new THREE.Vector3(), _gn = new THREE.Vector3();
export class Rubble {
  constructor(scene) {
    this.scene = scene;
    this.bodies = [];
    this.chipsList = [];
    this.acc = 0;
    this.obstacles = () => [];
    this.ms = 0; // time spent in update() last frame, for measuring
    this.prepMs = 0;
    this.tasks = []; // stone being cut ahead of a blow, a little each frame
    this.breaks = 0;
    this.onImpact = null; // (point, speed, body): a heavy piece hit the ground hard
    this.onMelt = null; // (object3d, white, volume): a settled piece is handed over to melt away
  }

  /** [fn] returns the statues still standing: [{ x, z, h, moving }] (h: the figure's height). */
  setObstacles(fn) {
    this.obstacles = fn;
  }

  /** Runs a generator a little each frame (within the frame budget); finish() completes it. */
  task(gen) {
    const t = { gen, done: false, value: null };
    this.tasks.push(t);
    return t;
  }
  finish(t) {
    while (t && !t.done) this._run(t);
    return t ? t.value : null;
  }
  _run(t) {
    const r = t.gen.next();
    if (r.done) {
      t.done = true;
      t.value = r.value;
      this.tasks = this.tasks.filter((x) => x !== t);
    }
  }

  /**
   * A solid piece of stone made of one or more meshes, kept exactly where they are now.
   * items: [{ geo, m }] (m: the mesh's world matrix); [quat] the piece's own frame.
   * The geometries are shared, never changed (a cut makes new ones).
   */
  compound(items, material, quat, ply = 0, { shadow = true, white = material?.userData?.side !== 'black', round = false } = {}) {
    if (!items.length) return null;
    const R = new THREE.Matrix4().makeRotationFromQuaternion(quat);
    const Rinv = R.clone().transpose();
    const box = new THREE.Box3();
    const rels = [];
    for (const it of items) {
      const rel = Rinv.clone().multiply(it.m);
      if (!it.geo.boundingBox) it.geo.computeBoundingBox();
      if (it.geo.boundingBox.isEmpty()) continue;
      box.union(it.geo.boundingBox.clone().applyMatrix4(rel));
      rels.push([it, rel]);
    }
    if (box.isEmpty()) return null;
    const cf = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * 0.92);
    // slivers left by a cut are too small to see and would only buzz about: drop them
    if (Math.max(half.x, half.y, half.z) < 0.012) return null;
    half.max(new THREE.Vector3(0.008, 0.008, 0.008));
    const group = new THREE.Group();
    group.position.copy(cf).applyQuaternion(quat);
    group.quaternion.copy(quat);
    const T = new THREE.Matrix4().makeTranslation(-cf.x, -cf.y, -cf.z);
    for (const [it, rel] of rels) {
      const mesh = new THREE.Mesh(it.geo, it.mat || material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.multiplyMatrices(T, rel);
      mesh.castShadow = shadow && half.length() > 0.03 && !it.mat;
      mesh.receiveShadow = true;
      if (it.mat) mesh.userData.decal = true;
      group.add(mesh);
    }
    this.scene.add(group);
    const vol = 8 * half.x * half.y * half.z * FILL;
    const m = Math.max(0.003, DENSITY * vol);
    const I = new THREE.Vector3((m / 3) * (half.y * half.y + half.z * half.z), (m / 3) * (half.x * half.x + half.z * half.z), (m / 3) * (half.x * half.x + half.y * half.y));
    // spheres along the longest side for colliding with other pieces
    const axis = half.x >= half.y && half.x >= half.z ? 'x' : half.y >= half.z ? 'y' : 'z';
    const long = half[axis];
    const thick = Math.max(0.006, axis === 'x' ? Math.max(half.y, half.z) : axis === 'y' ? Math.max(half.x, half.z) : Math.max(half.x, half.y));
    const sr = round ? (half.x + half.y + half.z) / 3 : Math.max(0.006, Math.min(long, thick * 0.85));
    const ns = round ? 1 : Math.min(4, Math.max(1, Math.round(long / sr)));
    const spheres = [];
    for (let i = 0; i < ns; i++) {
      const t = ns === 1 ? 0 : (i / (ns - 1)) * 2 - 1;
      const o = new THREE.Vector3();
      o[axis] = t * (long - sr);
      spheres.push(o);
    }
    const corners = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(new THREE.Vector3(x * half.x, y * half.y, z * half.z));
    const b = {
      g: group, p: group.position, q: group.quaternion, v: new THREE.Vector3(), w: new THREE.Vector3(),
      m, m0: m, I0: I, invM: 1 / m, invI: new THREE.Vector3(1 / I.x, 1 / I.y, 1 / I.z), half, corners, spheres, sr, round,
      rad: half.length(), sleep: false, still: 0, rest: 0, ply, age: 0, white, vol,
      parent: null, kids: [], off: null, offq: null, lastImp: -1,
    };
    this.bodies.push(b);
    this._trim();
    return b;
  }

  _body(geo, material, pos, quat, scale, ply, shadow) {
    const m = new THREE.Matrix4().compose(pos, quat, scale);
    return this.compound([{ geo, m }], material, quat, ply, { shadow: shadow !== false });
  }

  // ---- pieces stuck together: a glued piece rides on its root until it is let go
  _mass(r) {
    let m = r.m0;
    const I = r.I0.clone();
    for (const k of r.kids) {
      m += k.m0;
      const o = k.off;
      I.x += k.I0.x + k.m0 * (o.y * o.y + o.z * o.z);
      I.y += k.I0.y + k.m0 * (o.x * o.x + o.z * o.z);
      I.z += k.I0.z + k.m0 * (o.x * o.x + o.y * o.y);
    }
    r.m = m;
    r.invM = 1 / m;
    r.invI.set(1 / I.x, 1 / I.y, 1 / I.z);
  }
  /** Glues [kid] to [root] as they are now; it is let go at the root's age [at] (or when it hits hard). */
  glue(kid, root, at = Infinity, dv = null, dw = null) {
    if (!kid || !root || kid === root) return;
    kid.parent = root;
    _qi.copy(root.q).invert();
    kid.off = kid.p.clone().sub(root.p).applyQuaternion(_qi);
    kid.offq = _qi.clone().multiply(kid.q);
    kid.releaseAt = at;
    kid.releaseDv = dv;
    kid.releaseDw = dw;
    root.kids.push(kid);
    this._mass(root);
  }
  release(kid, dv = null, dw = null) {
    const r = kid.parent;
    if (!r) return;
    kid.parent = null;
    r.kids = r.kids.filter((k) => k !== kid);
    this._mass(r);
    kid.v.copy(r.w).cross(_a.copy(kid.p).sub(r.p)).add(r.v);
    kid.w.copy(r.w);
    if (dv) kid.v.add(dv);
    if (dw) kid.w.add(dw);
    kid.sleep = false;
    kid.still = 0;
    kid.age = Math.max(kid.age, 0.07);
    if (r.slide) {
      kid.v.addScaledVector(r.slide.dir, r.slide.speed);
    }
  }

  /** A flake of stone knocked off by a glancing blow: it falls and stays on the board. */
  flake(at, dir, material, size = 0.04, ply = 0) {
    const geo = new THREE.DodecahedronGeometry(size, 0);
    geo.scale(1, 0.55 + Math.random() * 0.3, 0.7 + Math.random() * 0.3);
    geo.userData.own = true;
    const b = this._body(soup(geo), material, at.clone(), new THREE.Quaternion().random(), new THREE.Vector3(1, 1, 1), ply, true);
    if (!b) return null;
    b.v.copy(dir).multiplyScalar(1.1 + Math.random() * 0.8).add(_a.set((Math.random() - 0.5) * 0.8, 1.2 + Math.random(), (Math.random() - 0.5) * 0.8));
    b.w.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    return b;
  }

  /** Chips of stone blasted off at the point of impact. */
  chips(at, dir, material, n = 18, power = 1, ply = 0) {
    const white = material?.userData?.side !== 'black';
    for (let i = 0; i < n; i++) {
      const s = 0.01 + Math.random() * 0.03;
      const m = new THREE.Mesh(chipGeos[(Math.random() * 3) | 0], material);
      m.scale.set(s * (0.6 + Math.random() * 0.8), s * (0.6 + Math.random() * 0.8), s);
      m.position.copy(at).add(_a.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.castShadow = s > 0.028;
      this.scene.add(m);
      const v = dir.clone().multiplyScalar(power * (0.8 + Math.random() * 2.2));
      v.x += (Math.random() - 0.5) * 2.6 * power;
      v.z += (Math.random() - 0.5) * 2.6 * power;
      v.y += 0.8 + Math.random() * 2.6 * power;
      this.chipsList.push({ m, r: s, v, w: new THREE.Vector3(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15), ply, age: 0, sleep: false, white });
    }
    while (this.chipsList.length > MAX_CHIPS) this._meltChip(this.chipsList.shift());
  }

  _trim() {
    // too many pieces about: the oldest settled ones start melting now
    while (this.bodies.length > MAX_BODIES) {
      const b = this.bodies.find((x) => !x.parent && !x.kids.length) || this.bodies[0];
      this._meltBody(b);
    }
  }

  // inverse inertia in world space applied to a vector
  _invI(b, v, out) {
    _qi.copy(b.q).invert();
    out.copy(v).applyQuaternion(_qi);
    out.set(out.x * b.invI.x, out.y * b.invI.y, out.z * b.invI.z).applyQuaternion(b.q);
    return out;
  }

  _impulse(b, J, r) {
    b.v.addScaledVector(J, b.invM);
    b.w.add(this._invI(b, _n.copy(r).cross(J), _c));
  }

  // velocity of a point at offset r from the centre
  _vel(b, r, out) {
    return out.copy(b.w).cross(r).add(b.v);
  }

  // a contact against something that doesn't move: normal n points out of it, toward the body.
  // Returns the speed it came in at (negative: into the surface).
  _contactStatic(b, r, n, depth, e) {
    const vp = this._vel(b, r, _a);
    const vn = vp.dot(n);
    if (vn < 0) {
      const rn = _b.copy(r).cross(n);
      const k = b.invM + n.dot(this._invI(b, rn, _c).cross(r));
      const restitution = vn < -0.9 ? e : 0;
      const jn = (-(1 + restitution) * vn) / k;
      this._impulse(b, _d.copy(n).multiplyScalar(jn), r);
      // friction
      const vp2 = this._vel(b, r, _a);
      const vt = vp2.addScaledVector(n, -vp2.dot(n));
      const lt = vt.length();
      if (lt > 1e-5) {
        const t = vt.divideScalar(lt);
        const rt = _b.copy(r).cross(t);
        const kt = b.invM + t.dot(this._invI(b, rt, _c).cross(r));
        const jt = Math.min(lt / kt, MU * jn);
        this._impulse(b, _d.copy(t).multiplyScalar(-jt), r);
      }
      if (jn * b.invM > 0.5) b.sleep = false;
    }
    if (depth > SLOP) b.p.addScaledVector(n, (depth - SLOP) * 0.8);
    return vn;
  }

  _contactPair(A, B, ra, rb, n, depth) {
    // n points from B to A
    const va = this._vel(A, ra, _a), vb = this._vel(B, rb, _b);
    const vn = va.sub(vb).dot(n);
    if (vn < 0) {
      const ka = n.dot(this._invI(A, _c.copy(ra).cross(n), _d).cross(ra));
      const kb = n.dot(this._invI(B, _c.copy(rb).cross(n), _d).cross(rb));
      const k = A.invM + B.invM + ka + kb;
      const e = vn < -1.2 ? 0.2 : 0;
      const jn = (-(1 + e) * vn) / k;
      const J = _r2.copy(n).multiplyScalar(jn);
      this._impulse(A, J, ra);
      this._impulse(B, J.negate(), rb);
      const va2 = this._vel(A, ra, _a), vb2 = this._vel(B, rb, _b);
      const rel = va2.sub(vb2);
      const vt = rel.addScaledVector(n, -rel.dot(n));
      const lt = vt.length();
      if (lt > 1e-5) {
        const t = vt.divideScalar(lt);
        const kta = t.dot(this._invI(A, _c.copy(ra).cross(t), _d).cross(ra));
        const ktb = t.dot(this._invI(B, _c.copy(rb).cross(t), _d).cross(rb));
        const jt = Math.min(lt / (A.invM + B.invM + kta + ktb), MU * jn);
        const Jt = _r2.copy(t).multiplyScalar(-jt);
        this._impulse(A, Jt, ra);
        this._impulse(B, Jt.negate(), rb);
      }
      if (Math.abs(jn) * Math.max(A.invM, B.invM) > 0.3) A.sleep = B.sleep = false;
    }
    if (depth > SLOP) {
      const s = (depth - SLOP) * 0.6, wa = A.invM / (A.invM + B.invM);
      if (!A.sleep) A.p.addScaledVector(n, s * wa);
      if (!B.sleep) B.p.addScaledVector(n, -s * (1 - wa));
    }
  }

  _step(obst) {
    const all = this.bodies;
    for (const b of all) {
      if (b.parent || b.sleep) continue;
      if (b.slide) {
        // carried along a cut face by the blade (kinematic): sliding, tipping, then let go
        const s = b.slide;
        s.speed += s.acc * H;
        b.p.addScaledVector(s.dir, s.speed * H);
        b.p.y -= s.drop * H;
        _q.setFromAxisAngle(s.axis, s.spin * H);
        b.q.premultiply(_q).normalize();
        s.spin += s.spinAcc * H;
        s.t += H;
        if (s.t >= s.until) {
          b.v.copy(s.dir).multiplyScalar(s.speed).y -= s.drop;
          b.w.copy(s.axis).multiplyScalar(s.spin);
          b.slide = null;
        }
        continue;
      }
      b.v.y -= G * H;
      b.p.addScaledVector(b.v, H);
      const wl = b.w.length();
      if (wl > 1e-6) {
        _q.setFromAxisAngle(_a.copy(b.w).divideScalar(wl), wl * H);
        b.q.premultiply(_q).normalize();
      }
    }
    // glued pieces ride on their roots
    for (const b of all) {
      if (!b.parent) continue;
      const r = b.parent;
      b.p.copy(b.off).applyQuaternion(r.q).add(r.p);
      b.q.copy(r.q).multiply(b.offq);
    }
    // fragments against fragments (a glued piece's contacts act on its root)
    for (let i = 0; i < all.length; i++) {
      const A = all[i], RA = A.parent || A;
      for (let j = i + 1; j < all.length; j++) {
        const B = all[j], RB = B.parent || B;
        if (RA === RB || (RA.sleep && RB.sleep) || RA.slide || RB.slide) continue;
        if (A.brk && A.brk === B.brk && RA.age < 0.06 && RB.age < 0.06) continue;
        const rr = A.rad + B.rad;
        if (A.p.distanceToSquared(B.p) > rr * rr) continue;
        for (const sa of A.spheres) {
          const pa = _r1.copy(sa).applyQuaternion(A.q).add(A.p);
          for (const sb of B.spheres) {
            const pb = _r2.copy(sb).applyQuaternion(B.q).add(B.p);
            const d = pa.distanceTo(pb), min = A.sr + B.sr;
            if (d >= min || d < 1e-6) continue;
            const n = _gn.copy(pa).sub(pb).divideScalar(d);
            const cp = _gat.copy(pb).addScaledVector(n, B.sr - (min - d) / 2);
            if (RA.sleep) RA.sleep = false;
            if (RB.sleep) RB.sleep = false;
            this._contactPair(RA, RB, _gr.copy(cp).sub(RA.p), _gr2.copy(cp).sub(RB.p), n, min - d);
          }
        }
      }
    }
    for (const b of all) {
      if (b.parent || b.sleep || b.slide) continue;
      const members = b.kids.length ? [b, ...b.kids] : [b];
      // the ground: every corner of each box below the surface is a contact (solved twice so a
      // piece resting on several corners settles instead of rocking); a round piece rolls on it
      let touching = false;
      for (let it = 0; it < 2; it++) {
        for (const mb of members) {
          const pts = mb.round ? ROUND : mb.corners;
          for (const k of pts) {
            const wp = mb.round ? _r1.set(0, -mb.sr, 0).add(mb.p) : _r1.copy(k).applyQuaternion(mb.q).add(mb.p);
            const gy = groundAt(wp.x, wp.z);
            if (wp.y < gy + 0.001) {
              touching = true;
              const at = _gat.copy(wp);
              const vn = this._contactStatic(b, _gr.copy(wp).sub(b.p), UP, gy - at.y, it === 0 ? 0.25 : 0);
              if (it === 0 && vn < -0.9) {
                if (mb !== b) mb.breakOff = true; // a glued piece that hits hard breaks off
                if (vn < -1.3 && b.age - b.lastImp > 0.18 && this.onImpact) {
                  b.lastImp = b.age;
                  this.onImpact(at.clone(), -vn, b);
                }
              }
            }
          }
        }
      }
      if (touching) {
        // rolling resistance and grit: stone doesn't roll for long (a head rolls a little more)
        b.w.multiplyScalar(b.round ? 0.993 : 0.975);
        b.v.x *= 0.996;
        b.v.z *= 0.996;
      }
      // the statues still standing: an upright cylinder each (a broad foot, a body above it)
      for (const o of obst) {
        const dx = b.p.x - o.x, dz = b.p.z - o.z;
        if (dx * dx + dz * dz > (0.4 + b.rad) * (0.4 + b.rad)) continue;
        for (const mb of members) {
          for (const s of mb.spheres) {
            const c = _r1.copy(s).applyQuaternion(mb.q).add(mb.p);
            for (const [R, top] of [[0.18, o.h * 0.12], [0.14, o.h * 0.85]]) {
              if (c.y - mb.sr > top) continue;
              const ex = c.x - o.x, ez = c.z - o.z, dd = Math.hypot(ex, ez);
              const pen = R + mb.sr - dd;
              if (pen <= 0) continue;
              if (top - (c.y - mb.sr) < pen && c.y > top - 0.05) {
                this._contactStatic(b, _gr.copy(c).sub(b.p).setY(c.y - mb.sr - b.p.y), UP, top - (c.y - mb.sr), 0.15);
              } else {
                const n = _gn.set(ex / (dd || 1), 0, ez / (dd || 1));
                this._contactStatic(b, _gr.copy(c).addScaledVector(n, -mb.sr).sub(b.p), n, pen, 0.2);
              }
            }
          }
        }
      }
      // asleep once even its outermost point has stayed nearly still for a moment
      if (b.v.length() + b.w.length() * b.rad < 0.09) {
        b.still += H;
        if (touching) b.w.multiplyScalar(0.92);
        if (b.still > 0.25) {
          b.sleep = true;
          b.v.set(0, 0, 0);
          b.w.set(0, 0, 0);
        }
      } else b.still = 0;
      b.w.multiplyScalar(0.9985);
    }
    // chips: little spheres on the ground and against the statues' feet
    for (const c of this.chipsList) {
      if (c.sleep) continue;
      c.v.y -= G * H;
      c.m.position.addScaledVector(c.v, H);
      c.m.rotation.x += c.w.x * H;
      c.m.rotation.y += c.w.y * H;
      c.m.rotation.z += c.w.z * H;
      const p = c.m.position, gy = groundAt(p.x, p.z) + c.r * 0.6;
      if (p.y < gy) {
        p.y = gy;
        if (c.v.y < -0.6) c.v.y *= -0.3;
        else c.v.y = 0;
        c.v.x *= 0.8;
        c.v.z *= 0.8;
        c.w.multiplyScalar(0.7);
        if (c.v.lengthSq() < 0.004) c.sleep = true;
      }
      for (const o of obst) {
        const ex = p.x - o.x, ez = p.z - o.z, dd = Math.hypot(ex, ez);
        if (dd < 0.17 + c.r && p.y < o.h * 0.6) {
          p.x = o.x + (ex / (dd || 1)) * (0.17 + c.r);
          p.z = o.z + (ez / (dd || 1)) * (0.17 + c.r);
          const vn = (c.v.x * ex + c.v.z * ez) / (dd || 1);
          if (vn < 0) {
            c.v.x -= 1.3 * vn * (ex / (dd || 1));
            c.v.z -= 1.3 * vn * (ez / (dd || 1));
          }
        }
      }
    }
  }

  // a settled piece leaves the physics and melts away (see melt.js)
  _meltBody(b) {
    for (const k of b.kids.slice()) {
      this.release(k);
      k.sleep = true;
    }
    if (b.parent) this.release(b);
    this.bodies = this.bodies.filter((x) => x !== b);
    // whatever rested on it falls
    for (const o of this.bodies) if (o.sleep && o.p.distanceTo(b.p) < o.rad + b.rad + 0.05) (o.sleep = false), (o.still = 0);
    if (this.onMelt) this.onMelt(b.g, b.white, b.vol);
    else {
      this.scene.remove(b.g);
      disposeOwn(b.g);
    }
  }
  _meltChip(c) {
    if (this.onMelt) this.onMelt(c.m, c.white, c.r * c.r * c.r * 4);
    else this.scene.remove(c.m);
  }

  /** Steps the simulation. */
  update(dt) {
    const t0 = performance.now();
    this.acc = Math.min(this.acc + dt, MAX_STEPS * H);
    const obst = this.obstacles();
    // cutting ahead of a blow, a little each frame
    const tp = performance.now();
    while (this.tasks.length && performance.now() - tp < 2.5) this._run(this.tasks[0]);
    this.prepMs = performance.now() - tp;
    for (const b of this.bodies) {
      // glued pieces let go on time, or when they hit hard
      if (b.parent && (b.breakOff || b.parent.age >= b.releaseAt)) {
        this.release(b, b.breakOff ? null : b.releaseDv, b.breakOff ? null : b.releaseDw);
        b.breakOff = false;
      }
      // what's left standing slumps a moment later
      if (b.kick && b.age >= b.kick.t) {
        b.v.add(b.kick.dv);
        b.w.add(_a.set(Math.random() * 4 - 2, Math.random() * 2 - 1, Math.random() * 4 - 2));
        b.kick = null;
        b.sleep = false;
      }
    }
    // a statue that walks into a heap wakes it
    for (const b of this.bodies) {
      if (!b.sleep) continue;
      for (const o of obst) if (o.moving && (b.p.x - o.x) ** 2 + (b.p.z - o.z) ** 2 < (0.3 + b.rad) ** 2) b.sleep = false;
    }
    while (this.acc >= H) {
      this._step(obst);
      this.acc -= H;
    }
    // settled rubble melts (a piece that never settles melts anyway)
    for (const b of this.bodies.slice()) {
      b.age += dt;
      if (b.parent) continue;
      b.rest = b.sleep ? b.rest + dt : 0;
      if (b.rest > REST_MELT || b.age > MAX_AGE) this._meltBody(b);
    }
    for (let i = this.chipsList.length - 1; i >= 0; i--) {
      const c = this.chipsList[i];
      c.age += dt;
      if ((c.sleep && c.age > 3) || c.age > 10) {
        this.chipsList.splice(i, 1);
        this._meltChip(c);
      }
    }
    this.ms = performance.now() - t0 - this.prepMs;
  }

  get awake() {
    return this.bodies.filter((b) => !b.sleep && !b.parent).length;
  }

  clear() {
    this.tasks.length = 0;
    for (const b of this.bodies) {
      this.scene.remove(b.g);
      disposeOwn(b.g);
    }
    for (const c of this.chipsList) this.scene.remove(c.m);
    this.bodies.length = 0;
    this.chipsList.length = 0;
  }
}
const ROUND = [null];
const REST_MELT = 2.5, MAX_AGE = 16;

/** Frees the geometry a cut made (never a statue's shared template). */
export function disposeOwn(o) {
  o.traverse((x) => {
    if (x.isMesh && x.geometry?.userData.own) x.geometry.dispose();
  });
}

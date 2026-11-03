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
// cheaper spheres. Old rubble sinks away a few moves later.
import * as THREE from 'three';

const G = 9.81;
const HZ = 120, H = 1 / HZ, MAX_STEPS = 5;
const DENSITY = 140; // stone, in board units: a king's torso weighs about 1
const FILL = 0.45; // a carved part fills about half of its box
const MAX_BODIES = 90, MAX_CHIPS = 160;
const MU = 0.6; // stone on stone
const SLOP = 0.002;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _n = new THREE.Vector3(), _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const chipGeos = [new THREE.DodecahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0)];

// the ground under a point: the board, the frame and plinth around it, then the table
function groundAt(x, z) {
  const e = Math.max(Math.abs(x), Math.abs(z));
  return e < 4.5 ? 0 : e < 4.8 ? -0.25 : -0.65;
}

// ------------------------------------------------------------------ cutting stone
// Splits a triangle soup (position + normal) by a plane (n . p = d) into two closed pieces;
// the cut faces are capped. Returns null when the plane misses. Written on flat arrays: a
// statue part can run to tens of thousands of triangles and the cut must not stall a frame.
function cutGeometry(geo, n, d) {
  const it = cutSteps(geo, n, d);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
// the same, a slice of the triangles at a time (yields between them)
function* cutSteps(geo, n, d) {
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
    return g;
  });
}

function soup(geo) {
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
export class Rubble {
  constructor(scene) {
    this.scene = scene;
    this.bodies = [];
    this.chipsList = [];
    this.acc = 0;
    this.obstacles = () => [];
    this.ms = 0; // time spent in update() last frame, for measuring
    this.jobs = []; // statues being cracked ahead of the blow
    this.breaks = 0;
  }

  /** [fn] returns the statues still standing: [{ x, z, h, moving }] (h: the figure's height). */
  setObstacles(fn) {
    this.obstacles = fn;
  }

  /**
   * Starts cracking a statue ahead of the blow (the cutting is spread over the frames before
   * it lands, so the moment of the kill doesn't stall). [opts] as for breakApart.
   */
  prepare(meshes, opts = {}) {
    const job = { opts: { ...opts }, items: [], i: 0 };
    if (opts.normal) job.opts.normal = opts.normal.clone().normalize();
    if (opts.point) job.opts.point = opts.point.clone();
    if (opts.axis) job.opts.axis = opts.axis.clone().normalize();
    for (const o of meshes) if (o.visible && o.geometry) job.items.push({ o, chunks: null });
    this.jobs.push(job);
    return job;
  }

  _work(job, budget) {
    const t0 = performance.now();
    while (job.i < job.items.length && performance.now() - t0 < budget) {
      job.gen = job.gen || this._cutPart(job, job.items[job.i]);
      if (job.gen.next().done) {
        job.gen = null;
        job.i++;
      }
    }
    if (job.i >= job.items.length) this.jobs = this.jobs.filter((j) => j !== job);
  }

  // one part: the blow's own cut first (along the blade's path), then cracks
  *_cutPart(job, it) {
    const { o } = it, { kind = 'smash', normal, point, axis } = job.opts;
    o.updateWorldMatrix(true, false);
    const wPos = new THREE.Vector3(), wQuat = new THREE.Quaternion(), wScale = new THREE.Vector3();
    o.matrixWorld.decompose(wPos, wQuat, wScale);
    const qi = wQuat.clone().invert();
    const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    const geo = soup(o.geometry);
    geo.computeBoundingBox();
    yield;
    let chunks = [{ g: geo, side: 0 }];
    if (normal && (kind === 'slice' || kind === 'cleave')) {
      const ln = normal.clone().applyQuaternion(qi).divide(wScale).normalize();
      const d = ln.dot(point.clone().applyMatrix4(inv));
      const r = yield* cutSteps(geo, ln, d);
      if (r) chunks = [{ g: r[0], side: 1 }, { g: r[1], side: -1 }];
      else chunks[0].side = ln.dot(geo.boundingBox.getCenter(_c)) >= d ? 1 : -1;
    }
    // the cracks: big parts break into two to four chunks
    const crack = function* (c, n, through) {
      const parts = yield* cutSteps(c.g, n, n.dot(through));
      return parts ? parts.map((g) => ({ g, side: c.side })) : [c];
    };
    const randomCut = function* (c, bias) {
      c.g.computeBoundingBox();
      const ctr = c.g.boundingBox.getCenter(new THREE.Vector3());
      const wn = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 1.6, Math.random() - 0.5);
      if (bias) wn.addScaledVector(bias, 0.8);
      const ln = wn.normalize().applyQuaternion(qi).normalize();
      ctr.addScaledVector(ln, (Math.random() - 0.5) * 0.25 * c.g.boundingBox.getSize(_c).length());
      return yield* crack(c, ln, ctr);
    };
    const near = point ? geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld).distanceTo(point) : 1;
    const next = [];
    for (const c of chunks) {
      c.g.computeBoundingBox();
      yield;
      const size = c.g.boundingBox.getSize(_b).multiply(wScale);
      const big = size.length();
      let cuts = big > 0.62 ? 2 : big > 0.3 && size.x * size.y * size.z > 0.0015 ? 1 : 0;
      if (kind === 'slice') cuts = c.side > 0 ? (big > 0.7 ? 1 : 0) : Math.min(cuts, 1); // the cut-off part stays one clean piece
      else if (kind === 'cleave') cuts = Math.min(cuts, job.opts.heavy ? 2 : 1);
      if (kind === 'stab' && axis && near < 0.4 && big > 0.12) {
        // cracks running out radially from where the point went in
        let list = [c];
        const a0 = Math.random() * Math.PI;
        for (let k = 0; k < 2; k++) {
          const perp = new THREE.Vector3(0, 1, 0).applyAxisAngle(axis, a0 + (k * Math.PI) / 2);
          const wn = perp.cross(axis).normalize();
          const ln = wn.applyQuaternion(qi).divide(wScale).normalize();
          const lp = point.clone().applyMatrix4(inv);
          const nl = [];
          for (const x of list) nl.push(...(yield* crack(x, ln, lp)));
          list = nl;
        }
        next.push(...list);
        continue;
      }
      let list = [c];
      for (let k = 0; k < cuts; k++) {
        const nl = [];
        for (const x of list) nl.push(...(yield* randomCut(x, k ? job.opts.swing : null)));
        list = nl;
      }
      next.push(...list);
    }
    it.chunks = next;
  }

  /**
   * Cracks a struck statue. [meshes] are its parts still in place; [at] is where the blow
   * landed, [dir] the direction of the swing, [power] how hard (the attacker's weight).
   * opts.kind: 'slice' (cut through along the blade's path: the part above slides off with
   * the swing), 'stab' (cracks burst out from the point, the pieces are driven on through),
   * 'cleave' (split top to bottom, the halves fall apart), or 'smash'; opts.normal and
   * opts.point give the cut's plane (world), opts.axis the thrust, opts.job a prepare()d break.
   */
  breakApart(meshes, at, dir, power = 1, ply = 0, opts = {}) {
    const swing = dir.clone().normalize();
    const job = opts.job || this.prepare(meshes, { ...opts, swing });
    job.opts.swing = swing;
    this._work(job, Infinity);
    const kind = job.opts.kind || 'smash';
    const brk = ++this.breaks;
    const pieces = [];
    const keep = new Set(meshes);
    for (const it of job.items) {
      const { o } = it;
      if (!keep.has(o) || !it.chunks) continue;
      o.updateWorldMatrix(true, false);
      const wPos = new THREE.Vector3(), wQuat = new THREE.Quaternion(), wScale = new THREE.Vector3();
      o.matrixWorld.decompose(wPos, wQuat, wScale);
      for (const c of it.chunks) {
        if (c.g.attributes.position.count < 3) continue;
        const b = this._body(c.g, o.material, wPos, wQuat, wScale, ply, o.castShadow);
        if (b) {
          b.side = c.side;
          b.brk = brk;
          pieces.push(b);
        }
      }
      o.parent?.remove(o);
    }
    const S = 2.0 * power;
    const up = _a.set(0, 1, 0).clone();
    const n = job.opts.normal ? job.opts.normal.clone() : up.clone();
    // which way the cut-off part goes: with the swing, and up off the cut
    const tilt = up.clone().cross(swing).normalize(); // turning about this tips the top along the swing
    let base = null;
    for (const b of pieces) if (!base || b.p.y < base.p.y) base = b;
    for (const b of pieces) {
      const toward = _c.copy(b.p).sub(at);
      const dist = toward.length();
      const fall = Math.exp(-dist / 0.42);
      const light = Math.min(1.7, Math.max(0.75, Math.pow(0.06 / b.m, 0.18)));
      const dv = new THREE.Vector3();
      if (kind === 'slice') {
        if (b.side > 0) {
          // the part above the cut slides off along it, carried by the blade, and topples
          dv.copy(swing).multiplyScalar((0.7 + 0.25 * power) * (0.9 + Math.random() * 0.2)).addScaledVector(n, 0.3).add(_b.set(0, 0.25, 0));
          b.w.addScaledVector(tilt, 1.4 + Math.random() * 0.6);
        } else {
          // the part below the cut stands a moment...
          dv.set((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1);
          // ... and a moment later what's left cracks and slumps
          b.kick = { t: 0.25 + Math.random() * 0.35, dv: new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.2, (Math.random() - 0.5) * 0.9).addScaledVector(swing, 0.4) };
        }
      } else if (kind === 'cleave') {
        // split down the middle: the halves fall away from each other
        const s = b.side || (toward.dot(n) >= 0 ? 1 : -1);
        dv.copy(n).multiplyScalar(s * S * (0.3 + 0.25 * fall) * light).addScaledVector(swing, S * 0.25 * fall).add(_b.set(0, S * 0.12 * fall, 0));
        b.w.addScaledVector(up.clone().cross(n).normalize(), s * (1.8 + Math.random()));
        if (job.opts.heavy) {
          // a crushing blow: everything blasts out along the floor
          const out = _b.copy(b.p).sub(at).setY(0);
          if (out.lengthSq() > 1e-6) dv.addScaledVector(out.normalize(), S * 0.35 * light);
        }
      } else if (kind === 'stab') {
        // driven through: the far side bursts out along the thrust, the rest is shoved back
        const ax = job.opts.axis || swing;
        const ahead = toward.dot(ax);
        const radial = _b.copy(toward).addScaledVector(ax, -ahead);
        if (radial.lengthSq() > 1e-6) radial.normalize();
        dv.copy(ax).multiplyScalar(S * (0.35 + (ahead > 0 ? 0.9 : 0.4) * fall) * light).addScaledVector(radial, S * 0.45 * fall * light).add(_a.set(0, S * 0.18 * fall, 0));
        if (b === base) dv.copy(ax).multiplyScalar(S * 0.45); // the feet skid back
      } else {
        toward.y = Math.max(0.05, toward.y);
        toward.normalize();
        dv.copy(swing).multiplyScalar(S * fall * light * (0.8 + Math.random() * 0.5))
          .addScaledVector(toward, S * (0.25 + 0.35 * fall) * light * Math.random())
          .add(_b.set(0, S * (0.15 + 0.55 * fall) * light, 0));
      }
      // applied at the contact (clamped to the piece) so it spins as well as flies
      const r = _r1.copy(at).sub(b.p);
      if (r.length() > b.rad) r.setLength(b.rad);
      this._impulse(b, dv.multiplyScalar(b.m), kind === 'smash' ? r : r.multiplyScalar(0.3));
      if (b.w.length() > 16) b.w.setLength(16);
      b.sleep = false;
    }
    this._trim();
    return pieces;
  }

  /** A flake of stone knocked off by a glancing blow: it falls and stays on the board. */
  flake(at, dir, material, size = 0.04, ply = 0) {
    const geo = new THREE.DodecahedronGeometry(size, 0);
    geo.scale(1, 0.55 + Math.random() * 0.3, 0.7 + Math.random() * 0.3);
    const b = this._body(soup(geo), material, at.clone(), new THREE.Quaternion().random(), new THREE.Vector3(1, 1, 1), ply, true);
    if (!b) return null;
    b.v.copy(dir).multiplyScalar(1.1 + Math.random() * 0.8).add(_a.set((Math.random() - 0.5) * 0.8, 1.2 + Math.random(), (Math.random() - 0.5) * 0.8));
    b.w.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    this._trim();
    return b;
  }

  /** Chips of stone blasted off at the point of impact. */
  chips(at, dir, material, n = 18, power = 1, ply = 0) {
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
      this.chipsList.push({ m, r: s, v, w: new THREE.Vector3(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15), ply, age: 0, sleep: false, sink: 0 });
    }
    while (this.chipsList.length > MAX_CHIPS) this.scene.remove(this.chipsList.shift().m);
  }

  _body(geo, material, pos, quat, scale, ply, shadow) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cLocal = bb.getCenter(new THREE.Vector3());
    const half = bb.getSize(new THREE.Vector3()).multiply(scale).multiplyScalar(0.5);
    // slivers left by a cut are too small to see and would only buzz about: drop them
    if (Math.max(half.x, half.y, half.z) < 0.014) return null;
    half.max(new THREE.Vector3(0.008, 0.008, 0.008));
    // the body sits at the chunk's centre; the mesh hangs inside it untouched, so the stone's
    // grain (computed from the geometry's own coordinates) doesn't jump when it breaks
    const group = new THREE.Group();
    group.position.copy(cLocal).multiply(scale).applyQuaternion(quat).add(pos);
    group.quaternion.copy(quat);
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.copy(scale);
    mesh.position.copy(cLocal).multiply(scale).negate();
    mesh.castShadow = shadow !== false && half.length() > 0.03;
    mesh.receiveShadow = true;
    group.add(mesh);
    this.scene.add(group);
    const vol = 8 * half.x * half.y * half.z * FILL;
    const m = Math.max(0.003, DENSITY * vol);
    const I = new THREE.Vector3(
      (m / 3) * (half.y * half.y + half.z * half.z),
      (m / 3) * (half.x * half.x + half.z * half.z),
      (m / 3) * (half.x * half.x + half.y * half.y),
    );
    // spheres along the longest side for colliding with other pieces
    const axis = half.x >= half.y && half.x >= half.z ? 'x' : half.y >= half.z ? 'y' : 'z';
    const long = half[axis];
    const thick = Math.max(0.006, axis === 'x' ? Math.max(half.y, half.z) : axis === 'y' ? Math.max(half.x, half.z) : Math.max(half.x, half.y));
    const sr = Math.max(0.006, Math.min(long, thick * 0.85));
    const ns = Math.min(4, Math.max(1, Math.round(long / sr)));
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
      m, invM: 1 / m, invI: new THREE.Vector3(1 / I.x, 1 / I.y, 1 / I.z), half, corners, spheres, sr,
      rad: half.length(), sleep: false, still: 0, ply, age: 0, sink: 0,
    };
    this.bodies.push(b);
    return b;
  }

  _trim() {
    while (this.bodies.length > MAX_BODIES) {
      const b = this.bodies.shift();
      this.scene.remove(b.g);
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

  // a contact against something that doesn't move: normal n points out of it, toward the body
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
      // friction along the sliding
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
    const live = this.bodies.filter((b) => !b.sleep && !b.sink);
    for (const b of live) {
      b.v.y -= G * H;
      b.p.addScaledVector(b.v, H);
      const wl = b.w.length();
      if (wl > 1e-6) {
        _q.setFromAxisAngle(_a.copy(b.w).divideScalar(wl), wl * H);
        b.q.premultiply(_q).normalize();
      }
    }
    // fragments against fragments (awake against anything)
    for (let i = 0; i < this.bodies.length; i++) {
      const A = this.bodies[i];
      if (A.sink) continue;
      for (let j = i + 1; j < this.bodies.length; j++) {
        const B = this.bodies[j];
        if (B.sink || (A.sleep && B.sleep)) continue;
        // pieces of one break start out touching: let them part before they collide
        if (A.brk && A.brk === B.brk && A.age < 0.06 && B.age < 0.06) continue;
        const rr = A.rad + B.rad;
        if (A.p.distanceToSquared(B.p) > rr * rr) continue;
        for (const sa of A.spheres) {
          const pa = _r1.copy(sa).applyQuaternion(A.q).add(A.p);
          for (const sb of B.spheres) {
            const pb = _r2.copy(sb).applyQuaternion(B.q).add(B.p);
            const d = pa.distanceTo(pb), min = A.sr + B.sr;
            if (d >= min || d < 1e-6) continue;
            const n = pa.clone().sub(pb).divideScalar(d);
            const cp = pb.clone().addScaledVector(n, B.sr - (min - d) / 2);
            this._contactPair(A, B, cp.clone().sub(A.p), cp.clone().sub(B.p), n, min - d);
          }
        }
      }
    }
    for (const b of live) {
      // the ground: every corner of the box below the surface is a contact (solved twice so
      // a piece resting on several corners settles instead of rocking)
      let touching = false;
      for (let it = 0; it < 2; it++) {
        for (const k of b.corners) {
          const wp = _r1.copy(k).applyQuaternion(b.q).add(b.p);
          const gy = groundAt(wp.x, wp.z);
          if (wp.y < gy + 0.001) {
            touching = true;
            this._contactStatic(b, wp.sub(b.p).clone(), new THREE.Vector3(0, 1, 0), gy - (wp.y + b.p.y), it === 0 ? 0.25 : 0);
          }
        }
      }
      if (touching) {
        // rolling resistance and grit: stone doesn't roll for long
        b.w.multiplyScalar(0.975);
        b.v.x *= 0.996;
        b.v.z *= 0.996;
      }
      // the statues still standing: an upright cylinder each (a broad foot, a body above it)
      for (const o of obst) {
        const dx = b.p.x - o.x, dz = b.p.z - o.z;
        if (dx * dx + dz * dz > (0.22 + b.rad) * (0.22 + b.rad)) continue;
        for (const s of b.spheres) {
          const c = _r1.copy(s).applyQuaternion(b.q).add(b.p);
          for (const [R, top] of [[0.18, o.h * 0.12], [0.14, o.h * 0.85]]) {
            if (c.y - b.sr > top) continue;
            const ex = c.x - o.x, ez = c.z - o.z, dd = Math.hypot(ex, ez);
            const pen = R + b.sr - dd;
            if (pen <= 0) continue;
            // on top of it: pushed up; against its side: pushed out
            if (top - (c.y - b.sr) < pen && c.y > top - 0.05) {
              this._contactStatic(b, c.clone().sub(b.p).setY(c.y - b.sr - b.p.y), new THREE.Vector3(0, 1, 0), top - (c.y - b.sr), 0.15);
            } else {
              const n = new THREE.Vector3(ex / (dd || 1), 0, ez / (dd || 1));
              this._contactStatic(b, c.clone().addScaledVector(n, -b.sr).sub(b.p), n, pen, 0.2);
            }
          }
        }
      }
      // asleep once it has stayed still for a moment
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
      // air drag on the spin keeps it from rolling forever
      b.w.multiplyScalar(0.9985);
    }
    // chips: little spheres on the ground and against the statues' feet
    for (const c of this.chipsList) {
      if (c.sleep || c.sink) continue;
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

  /** Steps the simulation; [ply] lets old rubble sink away a few moves later. */
  update(dt, ply) {
    const t0 = performance.now();
    this.acc = Math.min(this.acc + dt, MAX_STEPS * H);
    const obst = this.obstacles();
    // cracking ahead of a blow, a little each frame
    const tp = performance.now();
    for (const job of this.jobs.slice()) this._work(job, 2.5 / this.jobs.length);
    this.prepMs = performance.now() - tp;
    // what's left standing after a cut slumps a moment later
    for (const b of this.bodies) {
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
    // old rubble sinks into the board and goes
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.age += dt;
      if (ply - b.ply >= 3 && b.age > 4) b.sink += dt;
      if (b.sink) {
        b.p.y -= dt * 0.1;
        if (b.sink > 2.5) {
          this.scene.remove(b.g);
          this.bodies.splice(i, 1);
        }
      }
    }
    for (let i = this.chipsList.length - 1; i >= 0; i--) {
      const c = this.chipsList[i];
      c.age += dt;
      if (ply - c.ply >= 3 && c.age > 4) c.sink += dt;
      if (c.sink) {
        c.m.position.y -= dt * 0.05;
        if (c.sink > 2) {
          this.scene.remove(c.m);
          this.chipsList.splice(i, 1);
        }
      }
    }
    this.ms = performance.now() - t0 - this.prepMs;
  }

  get awake() {
    return this.bodies.filter((b) => !b.sleep && !b.sink).length;
  }

  clear() {
    this.jobs.length = 0;
    for (const b of this.bodies) this.scene.remove(b.g);
    for (const c of this.chipsList) this.scene.remove(c.m);
    this.bodies.length = 0;
    this.chipsList.length = 0;
  }
}

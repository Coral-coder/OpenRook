// Stone rubble with real rigid-body physics.
//
// When a statue is struck down it cracks: every part (head, arms, weapon, torso, robe, the
// horse's body and legs, the pedestal) becomes a solid body, and the big ones are split
// along planes into two to four chunks with capped faces. The blow drives the break: an
// impulse at the point where the weapon landed, along the swing, falling off with distance,
// so the parts nearest the blow fly and spin while the far ones only tip over.
//
// Each body is an oriented box of stone (mass from its volume, inertia from its sides) with a
// few spheres along its long axis for colliding with other fragments. Contacts (the board,
// the frame and table beyond it, the pedestals and bodies of the statues still standing, and
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
// the cut faces are capped. Returns null when the plane misses.
function cutGeometry(geo, n, d) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array;
  const out = [{ p: [], n: [] }, { p: [], n: [] }];
  const seg = [];
  const v = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
  const dist = (a) => a[0] * n.x + a[1] * n.y + a[2] * n.z - d;
  const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const emit = (side, poly) => {
    for (let k = 1; k + 1 < poly.length; k++) {
      for (const q of [poly[0], poly[k], poly[k + 1]]) {
        out[side].p.push(q[0], q[1], q[2]);
        out[side].n.push(q[3], q[4], q[5]);
      }
    }
  };
  const count = P.length / 3;
  for (let t = 0; t < count; t += 3) {
    const tri = [v(t), v(t + 1), v(t + 2)];
    const ds = tri.map(dist);
    if (ds[0] >= 0 && ds[1] >= 0 && ds[2] >= 0) {
      emit(0, tri);
      continue;
    }
    if (ds[0] <= 0 && ds[1] <= 0 && ds[2] <= 0) {
      emit(1, tri);
      continue;
    }
    const pos = [], neg = [], cut = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3], da = ds[i], db = ds[(i + 1) % 3];
      if (da >= 0) pos.push(a);
      if (da <= 0) neg.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const m = lerp(a, b, da / (da - db));
        pos.push(m);
        neg.push(m);
        cut.push(m);
      }
    }
    if (pos.length >= 3) emit(0, pos);
    if (neg.length >= 3) emit(1, neg);
    if (cut.length === 2) seg.push(cut[0], cut[1]);
  }
  if (!out[0].p.length || !out[1].p.length) return null;
  // cap the cut: a fan around the middle of the section, its points sorted round it
  if (seg.length >= 6) {
    const c = [0, 0, 0];
    for (const s of seg) for (let i = 0; i < 3; i++) c[i] += s[i] / seg.length;
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.x) > 0.9) u.set(0, 1, 0);
    u.cross(n).normalize();
    const w = n.clone().cross(u);
    const ang = (s) => Math.atan2((s[0] - c[0]) * w.x + (s[1] - c[1]) * w.y + (s[2] - c[2]) * w.z, (s[0] - c[0]) * u.x + (s[1] - c[1]) * u.y + (s[2] - c[2]) * u.z);
    const ring = seg.map((s) => [s, ang(s)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    for (let side = 0; side < 2; side++) {
      const sn = side === 0 ? [-n.x, -n.y, -n.z] : [n.x, n.y, n.z];
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], b = ring[(k + 1) % ring.length];
        const tri = side === 0 ? [c, b, a] : [c, a, b];
        // keep the winding facing out of the piece
        for (const q of tri) {
          out[side].p.push(q[0], q[1], q[2]);
          out[side].n.push(...sn);
        }
      }
    }
  }
  return out.map((o) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    return g;
  });
}

function soup(geo) {
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
  }

  /** [fn] returns the statues still standing: [{ x, z, h, moving }] (h: the figure's height). */
  setObstacles(fn) {
    this.obstacles = fn;
  }

  /**
   * Cracks a struck statue. [meshes] are its parts still in place; [at] is where the blow
   * landed, [dir] the direction of the swing, [power] how hard (the attacker's weight).
   */
  breakApart(meshes, at, dir, power = 1, ply = 0) {
    const swing = dir.clone().normalize();
    const pieces = [];
    for (const o of meshes) {
      if (!o.visible || !o.geometry) continue;
      o.updateWorldMatrix(true, false);
      const wPos = new THREE.Vector3(), wQuat = new THREE.Quaternion(), wScale = new THREE.Vector3();
      o.matrixWorld.decompose(wPos, wQuat, wScale);
      const geo = soup(o.geometry);
      geo.computeBoundingBox();
      const size = geo.boundingBox.getSize(_b).multiply(wScale);
      let chunks = [geo];
      // big parts crack along planes roughly across the blow, two to four chunks
      const big = size.length();
      const cuts = big > 0.62 ? 2 : big > 0.3 && size.x * size.y * size.z > 0.0015 ? 1 : 0;
      for (let c = 0; c < cuts; c++) {
        const next = [];
        for (const g of chunks) {
          g.computeBoundingBox();
          const ctr = g.boundingBox.getCenter(new THREE.Vector3());
          // a plane through the middle, tilted at random; in the part's own frame
          const wn = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 1.6, Math.random() - 0.5);
          wn.addScaledVector(swing, c === 0 ? 0.0 : 0.8).normalize();
          const ln = wn.clone().applyQuaternion(wQuat.clone().invert()).normalize();
          ctr.addScaledVector(ln, (Math.random() - 0.5) * 0.25 * g.boundingBox.getSize(_c).length());
          const parts = cutGeometry(g, ln, ln.dot(ctr));
          if (parts) next.push(...parts);
          else next.push(g);
        }
        chunks = next;
      }
      for (const g of chunks) {
        if (g.attributes.position.count < 3) continue;
        const b = this._body(g, o.material, wPos, wQuat, wScale, ply, o.castShadow);
        if (b) pieces.push(b);
      }
      o.parent?.remove(o);
    }
    // the blow: each piece takes an impulse at the contact point, strongest nearest it
    const S = 2.0 * power;
    for (const b of pieces) {
      const toward = _c.copy(b.p).sub(at);
      const dist = toward.length();
      const fall = Math.exp(-dist / 0.42);
      toward.y = Math.max(0.05, toward.y);
      toward.normalize();
      const light = Math.min(1.7, Math.max(0.75, Math.pow(0.06 / b.m, 0.18)));
      const dv = _d.copy(swing).multiplyScalar(S * fall * light * (0.8 + Math.random() * 0.5))
        .addScaledVector(toward, S * (0.25 + 0.35 * fall) * light * Math.random())
        .add(_b.set(0, S * (0.15 + 0.55 * fall) * light, 0));
      // applied at the contact (clamped to the piece) so it spins as well as flies
      const r = _r1.copy(at).sub(b.p);
      if (r.length() > b.rad) r.setLength(b.rad);
      this._impulse(b, dv.multiplyScalar(b.m), r);
      if (b.w.length() > 16) b.w.setLength(16);
      b.sleep = false;
    }
    this._trim();
    return pieces;
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
      // the statues still standing: pedestal and body as upright cylinders
      for (const o of obst) {
        const dx = b.p.x - o.x, dz = b.p.z - o.z;
        if (dx * dx + dz * dz > (0.3 + b.rad) * (0.3 + b.rad)) continue;
        for (const s of b.spheres) {
          const c = _r1.copy(s).applyQuaternion(b.q).add(b.p);
          for (const [R, top] of [[0.27, 0.215], [0.15, 0.215 + o.h * 0.75]]) {
            if (c.y - b.sr > top) continue;
            const ex = c.x - o.x, ez = c.z - o.z, dd = Math.hypot(ex, ez);
            const pen = R + b.sr - dd;
            if (pen <= 0) continue;
            // on top of the pedestal: pushed up; against its side: pushed out
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
    // chips: little spheres on the ground and against the pedestals
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
        if (dd < 0.27 + c.r && p.y < 0.215) {
          p.x = o.x + (ex / (dd || 1)) * (0.27 + c.r);
          p.z = o.z + (ez / (dd || 1)) * (0.27 + c.r);
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
    this.ms = performance.now() - t0;
  }

  get awake() {
    return this.bodies.filter((b) => !b.sleep && !b.sink).length;
  }

  clear() {
    for (const b of this.bodies) this.scene.remove(b.g);
    for (const c of this.chipsList) this.scene.remove(c.m);
    this.bodies.length = 0;
    this.chipsList.length = 0;
  }
}

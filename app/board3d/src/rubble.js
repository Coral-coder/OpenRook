// Rigid-body rubble: when a statue is struck down it breaks apart into its real stone parts
// (head, arms, the weapon, the torso, the horse's legs ...) plus chips knocked off at the point
// of impact, and they fly, tumble, bounce and come to rest on the board under gravity.
//
// Each body is a solid with a box of corners taken from its geometry. Every step it falls,
// spins and, when a corner goes below the board (or the floor around it), takes an impulse at
// that corner: it bounces with some restitution, rubs to a stop with friction and is tipped
// over by the off-centre contact, so long pieces topple and roll and come to lie flat.
import * as THREE from 'three';

const G = 9.8;
const BOARD = 4.5; // the board's half width; beyond it the pieces drop to the floor
const FLOOR = -0.65;

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Quaternion();
const _vp = new THREE.Vector3(), _imp = new THREE.Vector3(), _t = new THREE.Vector3();
const chipGeos = [new THREE.DodecahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0)];

export class Rubble {
  constructor(scene) {
    this.scene = scene;
    this.bodies = [];
    this.max = 240;
  }

  /**
   * Breaks [meshes] (the parts of a statue, still in place) off and sends them flying from
   * [at] along [dir] with [power]. Each part keeps its world pose and becomes a free body.
   */
  breakApart(meshes, at, dir, power = 1, ply = 0) {
    const out = [];
    for (const o of meshes) {
      if (!o.visible || !o.geometry) continue;
      o.updateWorldMatrix(true, false);
      this.scene.attach(o); // keep the world pose, lose the skeleton
      const b = this._body(o, ply);
      // a shove away from the blow, stronger the nearer the part was to it, and a kick up
      const away = o.getWorldPosition(_p).clone().sub(at);
      const near = Math.max(0.25, 1.2 - away.length());
      away.y = Math.max(0.1, away.y);
      away.normalize();
      // heavy stone: knocked back and up, but it falls in a heap around where it stood
      b.v.copy(dir).multiplyScalar(power * (0.7 + Math.random() * 0.7) * near).addScaledVector(away, power * (0.3 + Math.random() * 0.6) * near);
      b.v.y += power * (0.4 + Math.random() * 1.1) * near;
      b.w.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9).multiplyScalar(power * near);
      out.push(b);
    }
    return out;
  }

  /** Chips of stone blasted off at the point of impact. */
  chips(at, dir, material, n = 18, power = 1, ply = 0) {
    for (let i = 0; i < n; i++) {
      const s = 0.012 + Math.random() * 0.035;
      const m = new THREE.Mesh(chipGeos[(Math.random() * 3) | 0], material);
      m.scale.set(s * (0.6 + Math.random() * 0.8), s * (0.6 + Math.random() * 0.8), s);
      m.position.copy(at).add(_p.set((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.castShadow = s > 0.03;
      this.scene.add(m);
      const b = this._body(m, ply);
      b.v.copy(dir).multiplyScalar(power * (1 + Math.random() * 2.5));
      b.v.x += (Math.random() - 0.5) * 3 * power;
      b.v.z += (Math.random() - 0.5) * 3 * power;
      b.v.y += 1 + Math.random() * 3 * power;
      b.w.set(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
    }
  }

  _body(o, ply) {
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const corners = [];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const c = bb.getCenter(new THREE.Vector3());
    // the body turns about its centre of mass, not its joint
    o.geometry.translate(-c.x, -c.y, -c.z);
    for (const k of corners) k.sub(c);
    o.position.add(c.clone().multiply(o.scale).applyQuaternion(o.quaternion));
    o.matrixAutoUpdate = true;
    const size = bb.getSize(new THREE.Vector3()).multiply(o.scale);
    const r = Math.max(0.01, size.length() / 2);
    const b = { o, corners, v: new THREE.Vector3(), w: new THREE.Vector3(), r, rest: 0, ply, age: 0, sink: 0 };
    this.bodies.push(b);
    while (this.bodies.length > this.max) this._remove(this.bodies.shift());
    return b;
  }

  _remove(b) {
    this.scene.remove(b.o);
  }

  /** Steps the simulation; [ply] lets old rubble sink away a couple of moves later. */
  update(dt, ply) {
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) for (const b of this.bodies) if (b.rest < 1 && !b.sink) this._step(b, h);
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.age += dt;
      if (ply - b.ply >= 3 && b.age > 4) b.sink += dt;
      if (b.sink) {
        b.o.position.y -= dt * 0.12;
        if (b.sink > 2) {
          this._remove(b);
          this.bodies.splice(i, 1);
        }
      }
    }
  }

  _step(b, h) {
    const o = b.o;
    b.v.y -= G * h;
    o.position.addScaledVector(b.v, h);
    const wl = b.w.length();
    if (wl > 1e-6) {
      _q.setFromAxisAngle(_t.copy(b.w).divideScalar(wl), wl * h);
      o.quaternion.premultiply(_q);
    }
    // contacts: the deepest corner below the ground pushes back
    const ground = Math.abs(o.position.x) < BOARD && Math.abs(o.position.z) < BOARD ? 0 : FLOOR;
    o.updateMatrix();
    let deepest = null, depth = 0;
    for (const k of b.corners) {
      _p.copy(k).applyMatrix4(o.matrix);
      const d = ground - _p.y;
      if (d > depth) {
        depth = d;
        deepest = _r.copy(_p).sub(o.position);
      }
    }
    if (!deepest) return;
    o.position.y += depth;
    // velocity of the contact point
    _vp.copy(b.w).cross(deepest).add(b.v);
    if (_vp.y < 0) {
      const e = Math.abs(_vp.y) > 1 ? 0.28 : 0; // bounce only off hard landings
      // treat the body as a solid with inertia ~ m r^2 / 3 (unit mass)
      const I = (b.r * b.r) / 3;
      const rn = _t.copy(deepest).cross(_imp.set(0, 1, 0));
      const jn = (-(1 + e) * _vp.y) / (1 + rn.lengthSq() / I);
      _imp.set(0, jn, 0);
      // friction against the sliding
      const slide = _t.set(_vp.x, 0, _vp.z);
      const sl = slide.length();
      if (sl > 1e-5) _imp.addScaledVector(slide, -Math.min(0.6 * jn, sl / (1 + 1)) / sl);
      b.v.add(_imp);
      b.w.addScaledVector(_t.copy(deepest).cross(_imp), 1 / I);
      b.w.multiplyScalar(0.985);
    }
    // settled: still and touching
    if (b.v.lengthSq() < 0.004 && b.w.lengthSq() < 0.05) {
      b.rest += h * 4;
      if (b.rest >= 1) {
        b.v.set(0, 0, 0);
        b.w.set(0, 0, 0);
      }
    } else b.rest = 0;
  }

  clear() {
    for (const b of this.bodies) this._remove(b);
    this.bodies.length = 0;
  }
}

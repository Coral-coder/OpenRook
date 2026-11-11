// What becomes of the rubble: once a broken piece has settled it melts. Over about a minute the
// stone goes wet and glossy, slumps and spreads into a pool of liquid stone (pale for White,
// black for Black); then the pool runs across the board to the nearest edge and off it, and
// drains into a puddle on the table beside the board: White's on one side, Black's on the
// other, growing with every piece lost. Small chips just melt and seep away where they lie.
//
// All of it is transforms on a few meshes (no physics, no new geometry): a piece is hung under
// a wrapper standing on the ground below it, and the wrapper is squashed toward the ground.
// It runs on its own clock while play goes on, and never holds up a move.
import * as THREE from 'three';
import { granite } from './granite.js';
import { groundAt, disposeOwn } from './rubble.js';

const TABLE = -0.65;
const MELT = 20; // seconds to melt down
const SPEED = 0.9; // how fast a pool runs off the board
const PUDDLE = { white: new THREE.Vector3(5.75, TABLE + 0.004, 1.9), black: new THREE.Vector3(-5.75, TABLE + 0.004, -1.9) };

// a blob outline: a disc with a wobbly edge
function blobGeo(seed) {
  const n = 28, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * 5 + seed * 2.3) + 0.05 * Math.sin(a * 9 + seed * 0.7);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  g.rotateX(-Math.PI / 2);
  return g;
}
const BLOBS = [blobGeo(0.3), blobGeo(1.7), blobGeo(4.1)];
const ease = (x) => x * x * (3 - 2 * x);
// the way off the board: out over the nearest edge, then along the table round the board
// (never back across it) to the side's puddle
const OUT = 5.15;
function offPath(from, dir, to) {
  const pts = [];
  const sx = Math.sign(to.x) || 1, sz = Math.sign(to.z) || 1;
  if (dir.x) {
    const o = new THREE.Vector3(Math.sign(dir.x) * OUT, 0, from.z);
    pts.push(o);
    if (Math.sign(dir.x) !== sx) pts.push(new THREE.Vector3(o.x, 0, sz * OUT), new THREE.Vector3(sx * OUT, 0, sz * OUT));
  } else {
    const o = new THREE.Vector3(from.x, 0, Math.sign(dir.z) * OUT);
    pts.push(o, new THREE.Vector3(sx * OUT, 0, o.z));
  }
  pts.push(to.clone());
  return pts;
}

export class Melter {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const wet = (side) => {
      const m = granite(side);
      m.roughness = 0.16;
      m.metalness = 0.08;
      return m;
    };
    this.wet = { white: wet('white'), black: wet('black') };
    const pool = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.poolMat = { white: pool(0xbdb6a8), black: pool(0x2b2a2f) };
    this.puddles = {};
    this.layer = 0;
    this.ms = 0;
  }

  /** Hands a settled piece over to melt: [obj] is in the scene, as it lies. */
  add(obj, white, vol = 0.001) {
    const side = white ? 'white' : 'black';
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) {
      this.scene.remove(obj);
      return;
    }
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const W = new THREE.Group();
    W.position.set(c.x, Math.max(groundAt(c.x, c.z), box.min.y), c.z);
    this.scene.add(W);
    W.updateMatrixWorld(true);
    W.attach(obj);
    obj.traverse((o) => {
      if (o.isMesh) {
        if (o.userData.decal) o.visible = false;
        else o.material = this.wet[side];
      }
    });
    const small = vol < 0.0004;
    const pool = new THREE.Mesh(BLOBS[(Math.random() * 3) | 0], this.poolMat[side]);
    pool.rotation.y = Math.random() * 6.28;
    pool.receiveShadow = true;
    pool.scale.setScalar(0.001);
    this.layer = (this.layer + 1) % 40;
    pool.position.set(c.x, groundAt(c.x, c.z) + 0.003 + this.layer * 0.00015, c.z);
    this.scene.add(pool);
    const r = Math.max(size.x, size.z) * 0.5;
    this.items.push({ W, obj, pool, side, vol, r: Math.min(0.3, Math.max(0.025, r)), small, t: 0, dur: small ? 7 + Math.random() * 4 : MELT * (0.85 + Math.random() * 0.3), phase: 'melt', spin: (Math.random() - 0.5) * 0.3 });
  }

  update(dt) {
    const t0 = performance.now();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.phase === 'melt') {
        const k = Math.min(1, it.t / it.dur);
        const e = ease(k);
        // it softens and slumps (fastest at first), spreading into its pool
        const s = 1 - 0.95 * (1 - Math.pow(1 - k, 1.6));
        it.W.scale.set(1 + 0.55 * e, Math.max(0.04, s), 1 + 0.55 * e);
        it.W.rotation.y = it.spin * e;
        it.pool.scale.setScalar(it.r * (0.25 + 0.8 * Math.min(1, k * 1.3)));
        if (k >= 1) {
          this.scene.remove(it.W);
          disposeOwn(it.W);
          it.phase = it.small ? 'seep' : 'run';
          it.t = 0;
          // the nearest edge of the board
          const p = it.pool.position;
          it.dir = Math.abs(p.x) > Math.abs(p.z) ? new THREE.Vector3(Math.sign(p.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(p.z) || 1);
          it.r0 = it.pool.scale.x;
        }
      } else if (it.phase === 'seep') {
        // a chip's little pool soaks away where it lies
        const k = Math.min(1, it.t / 4);
        it.pool.scale.setScalar(it.r0 * (1 - k));
        if (k >= 1) this._drained(i, it);
      } else if (it.phase === 'run') {
        // the pool runs off across the board, stretched along its way
        const p = it.pool.position;
        p.addScaledVector(it.dir, SPEED * dt * Math.min(1, it.t * 0.8));
        p.y = groundAt(p.x, p.z) + 0.003 + this.layer * 0.00015;
        const along = 1 + Math.min(0.8, it.t * 0.5);
        it.pool.rotation.y = Math.atan2(it.dir.x, it.dir.z);
        it.pool.scale.set(it.r0 * 0.85, 1, it.r0 * along);
        if (Math.max(Math.abs(p.x), Math.abs(p.z)) > 4.55) {
          it.phase = 'off';
          it.t = 0;
          it.from = p.clone();
        }
      } else if (it.phase === 'off') {
        // over the edge, down onto the table, and along beside the board to the side's puddle
        if (!it.path) it.path = offPath(it.from, it.dir, PUDDLE[it.side]);
        const p = it.pool.position;
        let step = 1.4 * dt;
        while (step > 0 && it.path.length) {
          const q = it.path[0];
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d <= step) {
            p.x = q.x;
            p.z = q.z;
            step -= d;
            it.path.shift();
          } else {
            p.x += ((q.x - p.x) / d) * step;
            p.z += ((q.z - p.z) / d) * step;
            it.pool.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
            step = 0;
          }
        }
        p.y = groundAt(p.x, p.z) + 0.004;
        it.pool.scale.multiplyScalar(Math.pow(0.85, dt));
        if (!it.path.length) this._drained(i, it);
      }
    }
    for (const pd of Object.values(this.puddles)) {
      const s = pd.g.scale.x + (pd.want - pd.g.scale.x) * Math.min(1, dt * 1.5);
      pd.g.scale.set(s, 1, s);
    }
    this.ms = performance.now() - t0;
  }

  _drained(i, it) {
    this.scene.remove(it.pool);
    this.items.splice(i, 1);
    this._puddle(it.side, it.vol);
  }

  // the side's puddle grows: a new lobe now and then, the whole of it spreading a little
  _puddle(side, vol) {
    let pd = this.puddles[side];
    if (!pd) {
      const g = new THREE.Group();
      g.position.copy(PUDDLE[side]);
      g.scale.set(0.01, 1, 0.01);
      this.scene.add(g);
      const m = new THREE.Mesh(BLOBS[0], this.poolMat[side]);
      m.receiveShadow = true;
      g.add(m);
      pd = this.puddles[side] = { g, total: 0, want: 0.01, lobes: 1 };
    }
    pd.total += vol;
    pd.want = Math.min(1.3, 0.12 + 1.6 * Math.sqrt(pd.total));
    if (vol > 0.002 && pd.lobes < 14) {
      pd.lobes++;
      const m = new THREE.Mesh(BLOBS[pd.lobes % 3], this.poolMat[side]);
      const a = Math.random() * 6.28, d = 0.45 + Math.random() * 0.45;
      m.position.set(Math.cos(a) * d, pd.lobes * 0.0004, Math.sin(a) * d);
      m.scale.setScalar(0.35 + Math.random() * 0.35);
      m.rotation.y = Math.random() * 6;
      m.receiveShadow = true;
      pd.g.add(m);
    }
  }

  /** How much is still melting or running (for tests). */
  get count() {
    return this.items.length;
  }

  /** A new game: the board and the table are wiped clean. */
  clear() {
    for (const it of this.items) {
      this.scene.remove(it.W);
      this.scene.remove(it.pool);
      disposeOwn(it.W);
    }
    this.items.length = 0;
    for (const pd of Object.values(this.puddles)) this.scene.remove(pd.g);
    this.puddles = {};
  }
}

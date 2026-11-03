// A statue struck down comes apart: not a burst of shards, but the figure breaking into its big,
// recognisable pieces, along its joints and along the actual cut, over a second or two.
//
//   slice  - the blade's path is cut clean through the body. What's above it slides off along
//            the cut, carried by the swing, and topples; the weapon drops from the hand and
//            clatters, the arms come away, the head rolls. The legs stand a beat on their own,
//            then buckle, and what's left collapses.
//   stab   - cracks run out across the stone from the wound; the figure seizes; the weapon falls;
//            then it breaks at the waist and the upper body crumbles section by section as it
//            goes over backwards, and the legs fold under it.
//   cleave - split down the middle: the halves fall away from each other and break up as they land.
//   smash  - (no blade: a mate, a test) the figure topples whole and breaks up where it lands.
//   burst  - a blow or a spell that blasts it apart where it stands (or lies): every piece flies
//            off at once, away from the point of impact.
//   crumble- petrified, crushed or bound in chains: it falls in on itself, in many small pieces
//            (cut ahead along a few random planes), in a heap where it stood.
//   shatter- frozen solid: it bursts into many pieces like a dropped ice sculpture.
//   crush  - flattened (a tower toppled onto it, a horse trampling it): the pieces splay out
//            low across the board.
//
// The pieces are rigid bodies (rubble.js) glued into compounds and let go one by one; what
// still stands is the statue itself, its skeleton posed until it gives way.
import * as THREE from 'three';
import { cutSteps, soup } from './rubble.js';
import { ownMeshes, subtreeMeshes, crackSteps, attachCrack, toLocal } from './damage.js';
import { playMove } from './statues.js';

const SEG = { neck: 'head', head: 'head', shL: 'armL', shR: 'armR', weapon: 'weapon', weapon2: 'weapon2', chest: 'torso', spine: 'torso', hips: 'pelvis', tower: 'pelvis', hipL: 'legL', hipR: 'legR', horse: 'horse', hneck: 'hneck', flL: 'flL', flR: 'flR', hhL: 'hhL', hhR: 'hhR', tail: 'tail' };
const UPPER = ['head', 'armL', 'armR', 'weapon', 'weapon2', 'torso'];
const LOWER = ['pelvis', 'legL', 'legR', 'horse', 'hneck', 'flL', 'flR', 'hhL', 'hhR', 'tail'];
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

// which piece of the statue a mesh belongs to, and the joint that piece turns with
function segmentOf(mesh, model) {
  for (let o = mesh.parent; o && o !== model; o = o.parent) if (SEG[o.name]) return [SEG[o.name], o];
  return ['pelvis', model];
}

function* cutAll(meshes, planes) {
  // each mesh cut by each plane in turn (world planes, as the statue stands now)
  const out = [];
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    let parts = [{ g: soup(mesh.geometry), side: 0 }];
    for (let i = 0; i < planes.length; i++) {
      const pl = new THREE.Plane(planes[i][0].clone(), -planes[i][0].dot(planes[i][1])).applyMatrix4(inv);
      const next = [];
      for (const p of parts) {
        const r = yield* cutSteps(p.g, pl.normal, -pl.constant);
        if (r) next.push({ g: r[0], side: p.side | (1 << i), cut: true }, { g: r[1], side: p.side, cut: true });
        else {
          // wholly on one side
          p.g.computeBoundingBox();
          const c = p.g.boundingBox.getCenter(new THREE.Vector3());
          next.push({ g: p.g, side: pl.distanceToPoint(c) > 0 ? p.side | (1 << i) : p.side, cut: p.cut });
        }
      }
      parts = next;
    }
    out.push({ mesh, parts });
    yield;
  }
  return out;
}

/**
 * Starts cutting the victim ahead of the killing blow (spread over the frames before it lands).
 * cut: { kind, normal, point, axis, swing } in the world, as worked out from the blow.
 */
export function prepareBreakup(rubble, fig, cut) {
  fig.group.updateMatrixWorld(true);
  const J = fig.J;
  const kind = cut.kind;
  let meshes = [], planes = [];
  if (kind === 'slice') {
    for (const n of ['chest', 'spine', 'hips']) meshes.push(...ownMeshes(J[n]));
    planes = [[cut.normal.clone(), cut.point.clone()]];
  } else if (kind === 'stab') {
    for (const n of ['chest', 'spine']) meshes.push(...ownMeshes(J[n]));
    const ax = (cut.axis || cut.swing).clone().normalize();
    const a0 = Math.random() * Math.PI;
    for (let k = 0; k < 2; k++) {
      const perp = new THREE.Vector3(0, 1, 0).applyAxisAngle(ax, a0 + (k * Math.PI) / 2);
      planes.push([perp.cross(ax).normalize(), cut.point.clone()]);
    }
  } else if (kind === 'cleave') {
    meshes = subtreeMeshes(fig.model).filter((m) => !m.userData.decal);
    planes = [[cut.normal.clone(), cut.point.clone()]];
  } else if (kind === 'crumble' || kind === 'shatter') {
    // the torso in four or eight, along random planes through its middle
    for (const n of ['chest', 'spine', 'tower']) if (J[n]) meshes.push(...ownMeshes(J[n]));
    const c = fig.group.position.clone().setY((fig.height || 1) * 0.5);
    const a = Math.random() * Math.PI;
    planes = [[new THREE.Vector3(Math.cos(a), rnd(-0.3, 0.3), Math.sin(a)).normalize(), c.clone()], [new THREE.Vector3(rnd(-0.3, 0.3), 1, rnd(-0.3, 0.3)).normalize(), c.clone().setY(c.y * rnd(0.6, 1.2))]];
  }
  // the rook's keep crumbles when it goes: cracked ahead across and down through
  let towerTask = null;
  if (J.tower && kind !== 'cleave') {
    const tm = ownMeshes(J.tower);
    const box = new THREE.Box3();
    for (const m of tm) box.expandByObject(m);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      const h = box.max.y - box.min.y;
      const a = Math.random() * Math.PI;
      const tp = [
        [new THREE.Vector3(rnd(-0.3, 0.3), 1, rnd(-0.3, 0.3)).normalize(), c.clone().setY(box.min.y + h * rnd(0.4, 0.55))],
        [new THREE.Vector3(Math.cos(a), rnd(-0.2, 0.2), Math.sin(a)).normalize(), c.clone()],
      ];
      towerTask = rubble.task(cutAll(tm, tp));
    }
  }
  // a thrust: the cracks that will run out from the wound
  let crackTask = null;
  if (kind === 'stab') {
    const ax = (cut.axis || cut.swing).clone().setY(0).normalize().negate();
    const big = (j) => ownMeshes(J[j]).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
    const list = [[big('chest'), cut.point.clone(), fig.height * 0.75], [big('spine'), cut.point.clone().setY(cut.point.y - fig.height * 0.12), fig.height * 0.6]].filter((x) => x[0]);
    crackTask = rubble.task((function* () {
      const out = [];
      for (const [mesh, at, size] of list) {
        const L = toLocal(mesh, at, ax, size);
        out.push({ mesh, geo: yield* crackSteps(mesh.geometry, L.c, L.n, L.size) });
      }
      return out;
    })());
  }
  return { kind, task: meshes.length && planes.length ? rubble.task(cutAll(meshes, planes)) : null, towerTask, crackTask };
}

/**
 * The statue comes apart. ctx: { rubble, scene, dust(pos, size, n, color), chips(at, dir, n, power),
 * crash(v) }. update(dt) returns true once nothing of it stands.
 */
export class Breakup {
  constructor(ctx, fig, cut, prep, power = 1, ply = 0) {
    this.ctx = ctx;
    this.fig = fig;
    this.kind = cut?.kind || 'smash';
    this.cut = cut;
    this.power = power;
    this.ply = ply;
    this.t = 0;
    this.mat = fig.materials[0];
    this.standing = null; // what still stands: { x, z, h } for the rubble to fall against
    this.prep = prep;
    this.res = prep?.task ? ctx.rubble.finish(prep.task) : null;
    this.towerRes = prep?.towerTask ? ctx.rubble.finish(prep.towerTask) : null;
    this.swing = (cut?.swing || cut?.dir || new THREE.Vector3(0, 0, 1)).clone().setY(0);
    if (this.swing.lengthSq() < 1e-6) this.swing.set(0, 0, 1);
    this.swing.normalize();
    fig.group.updateMatrixWorld(true);
    this.events = [];
    const ways = ['slice', 'stab', 'cleave', 'burst', 'crumble', 'shatter', 'crush'];
    this[ways.includes(this.kind) ? this.kind : 'smash']();
  }

  at(t, fn) {
    this.events.push({ t, fn });
  }

  // a piece of the statue as one solid body (its meshes kept as they are); hidden on the figure
  body(segMeshes, frame, opts = {}) {
    const items = [];
    for (const m of segMeshes) {
      if (m.isMesh) {
        items.push({ geo: m.geometry, m: m.matrixWorld.clone(), mat: m.userData.decal ? m.material : undefined });
        m.visible = false;
      } else items.push(m); // { geo, m } already
    }
    const q = frame.getWorldQuaternion ? frame.getWorldQuaternion(new THREE.Quaternion()) : frame;
    const b = this.ctx.rubble.compound(items, this.mat, q, this.ply, opts);
    if (b) b.brk = this.brk;
    return b;
  }

  // the statue's meshes, piece by piece: { seg: { frame, meshes } }
  segments(filter = null) {
    const S = {};
    this.fig.model.updateMatrixWorld(true);
    for (const m of subtreeMeshes(this.fig.model)) {
      const [s, frame] = segmentOf(m, this.fig.model);
      if (filter && !filter.includes(s)) continue;
      const e = S[s] || (S[s] = { frame, meshes: [] });
      e.meshes.push(m);
    }
    return S;
  }

  // ---- slice: cut through along the blade's path; the top slides off
  slice() {
    const { rubble } = this.ctx;
    this.brk = ++rubble.breaks;
    const n = this.cut.normal.clone();
    if (n.y < 0) n.negate();
    const P = this.cut.point.clone();
    const above = (v) => n.dot(_v.copy(v).sub(P)) > 0;
    const coreUp = [];
    const cutMeshes = new Set();
    for (const r of this.res || []) {
      cutMeshes.add(r.mesh);
      const up = r.parts.filter((p) => p.side & 1), down = r.parts.filter((p) => !(p.side & 1));
      for (const p of up) coreUp.push({ geo: p.g, m: r.mesh.matrixWorld.clone() });
      decalsOf(r.mesh, up.length ? coreUp : null);
      if (up.length) {
        if (down.length) r.mesh.geometry = down[0].g;
        else r.mesh.visible = false;
      }
    }
    const S = this.segments();
    const chestY = this.fig.J.chest ? this.fig.J.chest.getWorldPosition(new THREE.Vector3()) : P;
    const torsoUp = above(chestY) || coreUp.length > 0;
    let root = coreUp.length ? this.body(coreUp, this.fig.J.chest || this.fig.model) : null;
    const upper = [];
    for (const [s, e] of Object.entries(S)) {
      if (s === 'torso') {
        // (core meshes the cut missed go with their side)
        const rest = e.meshes.filter((m) => !cutMeshes.has(m) && !m.userData.decal && above(m.getWorldPosition(_v)));
        if (rest.length) {
          const b = this.body(rest, e.frame);
          if (b) upper.push(['torso', b]);
        }
        continue;
      }
      if (!UPPER.includes(s)) continue;
      const jp = e.frame.getWorldPosition(new THREE.Vector3());
      if (!torsoUp && !above(jp)) continue;
      const b = this.body(e.meshes, e.frame, { round: s === 'head' });
      if (b) upper.push([s, b]);
    }
    if (!root) {
      upper.sort((a, b) => b[1].m - a[1].m);
      root = upper.length ? upper.shift()[1] : null;
    }
    if (root) {
      const dir = this.swing.clone().addScaledVector(n, -this.swing.dot(n)).normalize();
      const axis = UP.clone().cross(dir).normalize();
      for (const [s, b] of upper) {
        if (s === 'weapon' || s === 'weapon2') rubble.glue(b, root, rnd(0.1, 0.22), _d(rnd(-0.3, 0.3), -0.2, rnd(-0.3, 0.3)), _d(rnd(-6, 6), rnd(-3, 3), rnd(-6, 6)));
        else if (s === 'head') {
          const roll = axis.clone().multiplyScalar(rnd(6, 9) * (Math.random() < 0.5 ? 1 : -1));
          rubble.glue(b, root, rnd(0.45, 0.7), dir.clone().multiplyScalar(0.45).setY(0.25), roll);
        } else {
          const out = b.p.clone().sub(root.p).setY(0).normalize().multiplyScalar(0.45).setY(-0.1);
          rubble.glue(b, root, rnd(0.3, 0.55), out, _d(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3)));
        }
      }
      // carried off along the cut by the blade, tipping over its edge
      root.slide = { dir, speed: 0.3 + 0.15 * this.power, acc: 1.4, drop: 0, axis, spin: 0.4, spinAcc: 7, t: 0, until: 0.3 };
      this.root = root;
    }
    // the lower part stands a beat, then buckles
    this.standing = { h: Math.max(0.2, P.y) / 0.85 };
    this.at(0.32, () => playMove(this.fig, 'collapse', { fade: 0.3 }));
    this.at(1.2, () => this.topple());
    this.endAt = 1.3;
  }

  // ---- stab: cracks spread from the wound, the figure seizes, then breaks at the waist
  stab() {
    const { rubble } = this.ctx;
    this.brk = ++rubble.breaks;
    const fig = this.fig;
    const ax = (this.cut.axis || this.swing).clone().setY(0).normalize();
    const P = this.cut.point.clone();
    // the cracks run out from the point
    const cracks = this.prep?.crackTask ? rubble.finish(this.prep.crackTask) : [];
    cracks.forEach((c, i) => attachCrack(c.mesh, c.geo, fig.isWhite, i ? 0.7 : 0.55));
    playMove(fig, 'seize', { fade: 0.06 });
    // the weapon falls from the hand
    this.at(0.28, () => {
      const S = this.segments(['weapon', 'weapon2']);
      for (const e of Object.values(S)) {
        const b = this.body(e.meshes, e.frame);
        if (b) b.v.set(rnd(-0.3, 0.3), -0.1, rnd(-0.3, 0.3)), b.w.set(rnd(-4, 4), rnd(-2, 2), rnd(-4, 4));
      }
    });
    // ... and it breaks at the waist, crumbling as it goes over
    this.at(0.62, () => {
      const chunks = [];
      const cutMeshes = new Set();
      for (const r of this.res || []) {
        cutMeshes.add(r.mesh);
        const first = chunks.length;
        for (const p of r.parts) chunks.push([{ geo: p.g, m: r.mesh.matrixWorld.clone() }]);
        // (the cracks go with the biggest piece)
        if (chunks.length > first) decalsOf(r.mesh, chunks.slice(first).sort((a, b) => b[0].geo.attributes.position.count - a[0].geo.attributes.position.count)[0]);
        r.mesh.visible = false;
      }
      const S = this.segments(['torso', 'head', 'armL', 'armR']);
      const bodies = [];
      for (const c of chunks) {
        const b = this.body(c, fig.J.chest);
        if (b) bodies.push(['chunk', b]);
      }
      for (const [s, e] of Object.entries(S)) {
        const ms = e.meshes.filter((m) => !cutMeshes.has(m));
        if (!ms.length) continue;
        const b = this.body(ms, e.frame, { round: s === 'head' });
        if (b) bodies.push([s, b]);
      }
      bodies.sort((a, b) => (a[0] === 'chunk' ? 0 : 1) - (b[0] === 'chunk' ? 0 : 1) || b[1].m - a[1].m);
      const root = bodies.length ? bodies.shift()[1] : null;
      if (!root) return;
      let k = 0;
      for (const [s, b] of bodies) {
        const out = b.p.clone().sub(root.p).normalize().multiplyScalar(0.35);
        const t = s === 'chunk' ? 0.12 + 0.12 * k++ : s === 'head' ? 0.42 : rnd(0.2, 0.34);
        rubble.glue(b, root, t, out, _d(rnd(-4, 4), rnd(-3, 3), rnd(-4, 4)));
      }
      // over backwards, along the thrust
      root.v.copy(ax).multiplyScalar(0.55 * this.power).setY(0.15);
      root.w.copy(UP.clone().cross(ax)).multiplyScalar(2.2);
      this.ctx.crash?.(0.4);
      this.ctx.dust?.(P.clone().setY(P.y - 0.12), 0.25, 5);
      this.standing = { h: Math.max(0.2, (fig.J.hips ? fig.J.hips.getWorldPosition(_v).y : 0.3) + 0.04) / 0.85 };
      playMove(fig, 'collapse', { fade: 0.2 });
    });
    this.standing = { h: fig.height };
    this.at(1.35, () => this.topple());
    this.endAt = 1.45;
  }

  // ---- cleave: split top to bottom; the halves fall apart
  cleave() {
    const { rubble } = this.ctx;
    this.brk = ++rubble.breaks;
    const n = this.cut.normal.clone().setY(0);
    if (n.lengthSq() < 1e-6) n.set(this.swing.z, 0, -this.swing.x);
    n.normalize();
    const P = this.cut.point.clone();
    const by = { 1: {}, 0: {} };
    const cutMeshes = new Set();
    for (const r of this.res || []) {
      cutMeshes.add(r.mesh);
      const [s, frame] = segmentOf(r.mesh, this.fig.model);
      for (const p of r.parts) {
        const e = by[p.side & 1][s] || (by[p.side & 1][s] = { frame, items: [] });
        e.items.push({ geo: p.g, m: r.mesh.matrixWorld.clone() });
      }
      r.mesh.visible = false;
    }
    for (const m of subtreeMeshes(this.fig.model)) {
      if (cutMeshes.has(m)) continue;
      const [s, frame] = segmentOf(m, this.fig.model);
      const side = n.dot(m.getWorldPosition(_v).sub(P)) > 0 ? 1 : 0;
      const e = by[side][s] || (by[side][s] = { frame, items: [] });
      e.items.push({ geo: m.geometry, m: m.matrixWorld.clone(), mat: m.userData.decal ? m.material : undefined });
    }
    for (const side of [1, 0]) {
      const sg = side ? 1 : -1;
      const list = [];
      for (const [s, e] of Object.entries(by[side])) {
        const b = this.body(e.items, e.frame, { round: s === 'head' });
        if (b) list.push([s, b]);
      }
      list.sort((a, b) => (a[0] === 'torso' ? 0 : 1) - (b[0] === 'torso' ? 0 : 1) || b[1].m - a[1].m);
      const root = list.length ? list.shift()[1] : null;
      if (!root) continue;
      for (const [s, b] of list) {
        const t = s === 'weapon' || s === 'weapon2' ? rnd(0.1, 0.2) : LOWER.includes(s) ? rnd(0.8, 1.1) : rnd(0.4, 0.75);
        rubble.glue(b, root, t, n.clone().multiplyScalar(sg * 0.3), _d(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3)));
      }
      root.v.copy(n).multiplyScalar(sg * 0.4 * this.power).addScaledVector(this.swing, 0.25).setY(0.1);
      root.w.copy(UP.clone().cross(n)).multiplyScalar(sg * 1.9);
    }
    this.fig.group.parent?.remove(this.fig.group);
    this.endAt = 0.9;
  }

  // ---- no blade: the whole statue goes over and breaks up as it lands
  smash() {
    const { rubble } = this.ctx;
    this.brk = ++rubble.breaks;
    const S = this.segments();
    const list = [];
    for (const [s, e] of Object.entries(S)) {
      const b = this.body(e.meshes, e.frame, { round: s === 'head' });
      if (b) list.push([s, b]);
    }
    list.sort((a, b) => (a[0] === 'torso' ? 0 : 1) - (b[0] === 'torso' ? 0 : 1) || b[1].m - a[1].m);
    const root = list.length ? list.shift()[1] : null;
    if (root) {
      for (const [, b] of list) rubble.glue(b, root, rnd(0.6, 1.1), null, _d(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3)));
      root.w.copy(UP.clone().cross(this.swing)).multiplyScalar(1.6);
      root.v.copy(this.swing).multiplyScalar(0.3);
    }
    this.fig.group.parent?.remove(this.fig.group);
    this.endAt = 0.9;
  }

  // ---- every piece of it at once, cut pieces included: { seg: [items] } (what was cut ahead
  // replaces its mesh)
  pieces() {
    const out = [];
    const cutMeshes = new Set();
    for (const r of [...(this.res || []), ...(this.towerRes || [])]) {
      if (!r.mesh.visible) continue;
      cutMeshes.add(r.mesh);
      const [s] = segmentOf(r.mesh, this.fig.model);
      for (const p of r.parts) out.push([s, [{ geo: p.g, m: r.mesh.matrixWorld.clone() }], r.mesh.parent]);
      decalsOf(r.mesh, null);
      r.mesh.visible = false;
    }
    for (const [s, e] of Object.entries(this.segments())) {
      const ms = e.meshes.filter((m) => !cutMeshes.has(m) && m.visible);
      if (ms.length) out.push([s, ms, e.frame]);
    }
    return out;
  }
  // all of it flies apart from [P]: speed, how much up, how much spin, spread along the ground
  scatter(speed, up, spin, flat = 0) {
    const { rubble } = this.ctx;
    this.brk = ++rubble.breaks;
    const P = (this.cut?.point || this.fig.group.position.clone().setY((this.fig.height || 1) * 0.55)).clone();
    for (const [s, items, frame] of this.pieces()) {
      const b = this.body(items, frame, { round: s === 'head' });
      if (!b) continue;
      const out = b.p.clone().sub(P);
      out.y *= 1 - flat;
      if (out.lengthSq() < 1e-6) out.set(rnd(-1, 1), 0.3, rnd(-1, 1));
      out.normalize();
      const sp = speed * Math.min(1.5, this.power) * rnd(0.6, 1.25);
      b.v.copy(out).multiplyScalar(sp).addScaledVector(this.swing, speed * 0.35 * this.power);
      b.v.y += up * rnd(0.5, 1.2) * (1 - flat);
      b.w.set(rnd(-spin, spin), rnd(-spin, spin), rnd(-spin, spin));
      // what it stood on (the robes, the keep, the horse) goes over too: tipped along the blow
      if (LOWER.includes(s) || s === 'pelvis') {
        b.w.copy(UP.clone().cross(this.swing)).multiplyScalar(rnd(2.2, 3.2) * (1 - flat * 0.3));
        b.v.copy(this.swing).multiplyScalar(0.5 + 0.3 * speed).setY(0.25);
      }
      b.sleep = false;
    }
    this.ctx.dust?.(P.clone().setY(Math.max(0.05, P.y * 0.5)), 0.35, 7, this.fig.isWhite);
    rubble.chips(P, this.swing.clone().setY(0.3), this.mat, 16, this.power, this.ply);
    this.standing = null;
    this.fig.group.parent?.remove(this.fig.group);
    this.endAt = 0.9;
  }
  burst() {
    this.scatter(0.95, 0.75, 6);
  }
  crumble() {
    this.scatter(0.35, 0.15, 2.5);
    const P = this.fig.group.position;
    for (let i = 0; i < 3; i++) this.ctx.rubble.chips(P.clone().setY(0.2 + i * 0.25), new THREE.Vector3(0, -0.2, 0), this.mat, 10, 0.35, this.ply);
  }
  shatter() {
    this.scatter(1.35, 0.95, 8);
  }
  crush() {
    this.scatter(1.0, 0.2, 4, 0.85);
  }

  // what's left standing gives way: its pieces fall on as they were moving
  topple() {
    const fig = this.fig;
    if (!fig.group.parent) return;
    const { rubble } = this.ctx;
    // (the keep in its cracked pieces: the lowest stays as the base, the rest fall off it)
    const tower = [];
    for (const r of this.towerRes || []) {
      if (!r.mesh.visible) continue;
      for (const p of r.parts) {
        const b = this.body([{ geo: p.g, m: r.mesh.matrixWorld.clone() }], fig.J.tower);
        if (b) tower.push(['keep', b, fig.J.tower]);
      }
      decalsOf(r.mesh, null);
      r.mesh.visible = false;
    }
    tower.sort((a, b) => a[1].p.y - b[1].p.y);
    const S = this.segments();
    const list = [];
    for (const [s, e] of Object.entries(S)) {
      const b = this.body(e.meshes, e.frame);
      if (b) list.push([s, b, e.frame]);
    }
    list.sort((a, b) => (a[0] === 'pelvis' || a[0] === 'horse' ? 0 : 1) - (b[0] === 'pelvis' || b[0] === 'horse' ? 0 : 1) || b[1].m - a[1].m);
    if (tower.length) {
      const base = tower.shift();
      list.unshift(base, ...tower.map((t, i) => ['chunk' + (tower.length - 1 - i), t[1], t[2]]));
    }
    const first = list.shift();
    if (first) {
      const [, root] = first;
      // carry on with the motion of the collapse
      if (this.prev2 && this.dt > 0) {
        const vf = this.vframe;
        const p = vf.getWorldPosition(new THREE.Vector3()), q = vf.getWorldQuaternion(new THREE.Quaternion());
        root.v.copy(p).sub(this.prev2.p).divideScalar(this.dt).clampLength(0, 2);
        const dq = q.clone().multiply(this.prev2.q.clone().invert());
        const ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
        if (ang > 1e-4) root.w.set(dq.x, dq.y, dq.z).normalize().multiplyScalar((Math.sign(dq.w) || 1) * Math.min(5, ang / this.dt));
        // (the piece's own middle moves with the turn about the joint)
        root.v.add(root.w.clone().cross(root.p.clone().sub(p)));
      }
      // and on over, the way it was leaning
      const lean = fig.model.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      const wl = UP.clone().cross(lean).multiplyScalar(1.1);
      root.w.add(wl);
      root.v.add(wl.cross(_v.set(0, root.p.y, 0))); // (tipping over about its foot)
      for (const [s, b] of list) {
        if (s.startsWith('chunk')) {
          // the keep crumbles from the top down
          const out = b.p.clone().sub(root.p).setY(0).normalize().multiplyScalar(0.5).setY(-0.1);
          rubble.glue(b, root, 0.08 + 0.12 * Number(s.slice(5)) + rnd(0, 0.08), out, _d(rnd(-3, 3), rnd(-1, 1), rnd(-3, 3)));
        } else rubble.glue(b, root, s.startsWith('leg') || s.startsWith('f') || s.startsWith('hh') ? rnd(0.3, 0.55) : rnd(0.35, 0.8), null, _d(rnd(-2, 2), rnd(-1, 1), rnd(-2, 2)));
      }
    }
    this.standing = null;
    fig.group.parent.remove(fig.group);
  }

  update(dt) {
    this.t += dt;
    for (const e of this.events.slice()) {
      if (this.t >= e.t) {
        this.events = this.events.filter((x) => x !== e);
        e.fn();
      }
    }
    if (this.fig.group.parent) {
      // the legs still standing move with the statue's own skeleton
      this.fig.mixer.update(dt);
      const frame = (this.vframe = this.fig.J.tower || this.fig.J.horse || this.fig.J.hips || this.fig.model);
      if (frame) {
        frame.updateWorldMatrix(true, false);
        // (the last two frames: how it was moving when it gives way, see topple)
        this.prev2 = this.prev;
        this.prev = { p: frame.getWorldPosition(new THREE.Vector3()), q: frame.getWorldQuaternion(new THREE.Quaternion()) };
        this.dt = dt;
      }
    }
    return this.t >= this.endAt && !this.events.length;
  }
}
// a cut mesh's cracks: carried on by [into] (a list of body items), or just gone
function decalsOf(mesh, into) {
  for (const c of mesh.children) {
    if (!c.userData.decal || !c.visible) continue;
    if (into) into.push({ geo: c.geometry, m: c.matrixWorld.clone(), mat: c.material });
    c.visible = false;
  }
}
const _v = new THREE.Vector3();
const _d = (x, y, z) => new THREE.Vector3(x, y, z);

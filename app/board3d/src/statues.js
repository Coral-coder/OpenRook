// The Wizard Chess statues, carved in detail (carving.js) on real skeletons.
//
// Every piece stands on the same octagonal, columned pedestal. Above it the figure is a
// hierarchy of joints (pelvis, spine, chest, neck, head; shoulder, elbow, wrist; hip, knee,
// ankle; the horse's shoulders, knees, neck and tail), and each body part is solid stone hung
// on its joint: nothing bends or stretches, the stone turns at the joint like a jointed
// statue. The legs are solved with two-bone IK so the feet stay planted on the pedestal while
// the body crouches, lunges or rises.
//
// Units are board squares (a square is 1; the real board's squares are 40 mm). Figures face
// +z; their right hand is on -x. Each piece type is carved once; its parts are merged per
// joint (one draw per limb) and shared by every statue of that type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { granite } from './granite.js';
import { kit, pedestal } from './carving.js';
import { BUILD } from './pieces/index.js';

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const PED = 0.215; // pedestal height

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// merge every mesh hanging directly on the same joint into one
function consolidate(root) {
  const groups = new Map();
  root.traverse((o) => {
    if (o.isMesh) {
      if (!groups.has(o.parent)) groups.set(o.parent, []);
      groups.get(o.parent).push(o);
    }
  });
  for (const [parent, meshes] of groups) {
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    for (const m of meshes) parent.remove(m);
    const mm = new THREE.Mesh(merged, meshes[0].material);
    mm.castShadow = mm.receiveShadow = true;
    parent.add(mm);
  }
}

const TEMPLATES = {};
function template(type) {
  if (TEMPLATES[type]) return TEMPLATES[type];
  const P = kit(new THREE.MeshStandardMaterial());
  const model = new THREE.Group();
  pedestal(model, P);
  const body = new THREE.Group();
  body.name = 'body';
  body.position.y = PED;
  model.add(body);
  const J = {};
  const info = BUILD[type](J, body, P);
  consolidate(model);
  return (TEMPLATES[type] = { model, info });
}

// ------------------------------------------------------------------ poses and moves
// A pose is { joint: [rx, ry, rz] } plus '$hips': [dy, dz] (the pelvis moves; the legs follow
// by IK) and '$root': [dx, dy, dz, rx] (the whole statue on its pedestal). Moves are keyframes
// [t (0..1), pose, ease]; the blow lands at `at`.
const H_ = { two: {}, one: {}, dual: {} };

// two-handed (king's greatsword, queen's staff)
const TWO = {
  rest: { shL: [-0.55, 0, 0.35], elL: [-1.05, 0, 0], shR: [-0.55, 0, -0.35], elR: [-1.05, 0, 0], wrR: [1.5, 0, 0], wrL: [1.5, 0, 0] },
  ready: { shL: [-1.05, 0.3, 0.3], elL: [-0.9, 0, 0], shR: [-1.05, -0.3, -0.3], elR: [-0.9, 0, 0], wrR: [-0.3, 0, 0], wrL: [-0.3, 0, 0], spine: [0.05, 0.25, 0], $hips: [-0.03, 0] },
  wind: { shL: [-2.9, 0.2, 0.15], elL: [-0.7, 0, 0], shR: [-2.9, -0.2, -0.15], elR: [-0.7, 0, 0], wrR: [-0.6, 0, 0], wrL: [-0.6, 0, 0], spine: [-0.28, 0.2, 0], chest: [-0.12, 0, 0], head: [-0.2, 0, 0], $hips: [-0.01, -0.04] },
  strike: { shL: [-0.85, 0, 0.25], elL: [-0.1, 0, 0], shR: [-0.85, 0, -0.25], elR: [-0.1, 0, 0], wrR: [-0.2, 0, 0], wrL: [-0.2, 0, 0], spine: [0.42, -0.1, 0], chest: [0.15, 0, 0], head: [0.15, 0, 0], $hips: [-0.09, 0.07], $root: [0, 0, 0.12, 0] },
  follow: { shL: [-0.35, 0, 0.3], elL: [-0.1, 0, 0], shR: [-0.35, 0, -0.3], elR: [-0.1, 0, 0], wrR: [-0.1, 0, 0], wrL: [-0.1, 0, 0], spine: [0.5, -0.15, 0], chest: [0.15, 0, 0], head: [0.1, 0, 0], $hips: [-0.11, 0.08], $root: [0, 0, 0.12, 0] },
  block: { shL: [-1.9, 0.5, 0.2], elL: [-1.2, 0, 0], shR: [-1.9, -0.5, -0.2], elR: [-1.2, 0, 0], wrR: [0.9, 0, 1.2], wrL: [0.9, 0, 0], spine: [-0.15, 0, 0], head: [-0.1, 0, 0], $hips: [-0.05, -0.03] },
  cheer: { shL: [-3.0, 0, 0.1], elL: [-0.1, 0, 0], shR: [-3.0, 0, -0.1], elR: [-0.1, 0, 0], wrR: [0.2, 0, 0], wrL: [0.2, 0, 0], spine: [-0.15, 0, 0], head: [-0.35, 0, 0] },
};
// one weapon arm (rook's sword, knight's mace on R; bishop's crozier on L), the other guards
function oneHanded(h) {
  const W = h === 'R' ? 'R' : 'L', O = h === 'R' ? 'L' : 'R', s = h === 'R' ? -1 : 1;
  const p = (wsh, wel, wwr, osh, oel, extra = {}) => ({ ['sh' + W]: wsh, ['el' + W]: wel, ['wr' + W]: wwr, ['sh' + O]: osh, ['el' + O]: oel, ...extra });
  return {
    rest: p([-0.2, 0, s * 0.15], [-0.6, 0, 0], [0.8, 0, 0], [-0.4, 0, -s * 0.2], [-1.2, 0, 0]),
    ready: p([-0.9, 0, s * 0.4], [-1.1, 0, 0], [-0.4, 0, 0], [-0.9, 0, -s * 0.5], [-1.4, 0, 0], { spine: [0.08, -s * 0.2, 0], $hips: [-0.03, 0] }),
    wind: p([-2.8, s * 0.3, s * 0.6], [-1.6, 0, 0], [-0.7, 0, 0], [-1.0, 0, -s * 0.4], [-1.5, 0, 0], { spine: [-0.2, -s * 0.5, 0], chest: [-0.1, -s * 0.2, 0], head: [-0.15, s * 0.3, 0], $hips: [-0.02, -0.04] }),
    strike: p([-0.6, -s * 0.3, -s * 0.2], [-0.15, 0, 0], [0.1, 0, 0], [-0.6, 0, -s * 0.6], [-1.2, 0, 0], { spine: [0.38, s * 0.45, 0], chest: [0.12, s * 0.2, 0], head: [0.1, 0, 0], $hips: [-0.08, 0.07], $root: [0, 0, 0.12, 0] }),
    follow: p([-0.2, -s * 0.4, -s * 0.4], [-0.15, 0, 0], [0.2, 0, 0], [-0.5, 0, -s * 0.5], [-1.1, 0, 0], { spine: [0.42, s * 0.6, 0], chest: [0.12, s * 0.25, 0], $hips: [-0.1, 0.08], $root: [0, 0, 0.12, 0] }),
    block: p([-1.4, 0, s * 0.3], [-1.3, 0, 0], [0.3, 0, 0], [-1.6, -s * 0.6, -s * 0.2], [-1.0, 0, 0], { spine: [-0.15, -s * 0.15, 0], head: [-0.1, 0, 0], $hips: [-0.05, -0.03] }),
    cheer: p([-3.0, 0, s * 0.2], [-0.2, 0, 0], [0.3, 0, 0], [-0.4, 0, -s * 0.3], [-0.6, 0, 0], { spine: [-0.15, 0, 0], head: [-0.3, 0, 0] }),
  };
}
// the pawn: crouched, then up on his feet with a blade in each hand
const DUAL = {
  rest: { $hips: [-0.13, 0.02], spine: [0.85, 0, 0], chest: [0.25, 0, 0], head: [-0.75, 0, 0], shL: [-0.9, 0, -0.55], elL: [-1.5, 0, 0], shR: [-0.9, 0, 0.55], elR: [-1.5, 0, 0], wrL: [1.1, 0, 0], wrR: [1.1, 0, 0] },
  ready: { $hips: [-0.04, 0], spine: [0.25, 0, 0], head: [-0.15, 0, 0], shL: [-0.7, 0, 0.5], elL: [-1.0, 0, 0], shR: [-0.7, 0, -0.5], elR: [-1.0, 0, 0], wrL: [0.2, 0, 0], wrR: [0.2, 0, 0] },
  // rising, the arms fly out wide, blades flat
  wind: { $hips: [0, -0.02], spine: [-0.15, 0.3, 0], chest: [-0.05, 0.15, 0], head: [-0.1, -0.3, 0], shL: [-0.5, -0.6, 1.5], elL: [-0.2, 0, 0], shR: [-0.6, 0.4, -1.6], elR: [-0.3, 0, 0], wrL: [-1.3, 0, 0], wrR: [-1.3, 0, 0] },
  // the cut: both blades sweep in across the body
  strike: { $hips: [-0.06, 0.06], spine: [0.35, -0.35, 0], chest: [0.1, -0.2, 0], head: [0.1, 0.2, 0], shL: [-1.3, 0.9, -0.4], elL: [-0.2, 0, 0], shR: [-1.2, -0.7, 0.5], elR: [-0.3, 0, 0], wrL: [-1.4, 0, 0], wrR: [-1.4, 0, 0], $root: [0, 0, 0.14, 0] },
  follow: { $hips: [-0.07, 0.07], spine: [0.4, -0.45, 0], chest: [0.12, -0.25, 0], shL: [-1.0, 1.1, -0.7], elL: [-0.3, 0, 0], shR: [-0.9, -0.9, 0.8], elR: [-0.3, 0, 0], wrL: [-1.2, 0, 0], wrR: [-1.2, 0, 0], $root: [0, 0, 0.14, 0] },
  block: { $hips: [-0.06, -0.02], spine: [0.15, 0, 0], shL: [-1.6, 0.6, 0.3], elL: [-1.3, 0, 0], shR: [-1.6, -0.6, -0.3], elR: [-1.3, 0, 0], wrL: [0.6, 0, 0.9], wrR: [0.6, 0, -0.9] },
  cheer: { $hips: [0, 0], spine: [-0.15, 0, 0], head: [-0.3, 0, 0], shL: [-2.9, 0, 0.3], elL: [-0.2, 0, 0], shR: [-2.9, 0, -0.3], elR: [-0.2, 0, 0] },
};
// (written with the arms' z the wrong way round: inward is -z for the left arm, +z for the right)
for (const p of Object.values(TWO)) for (const n of ['shL', 'shR']) if (p[n]) p[n] = [p[n][0], p[n][1], -p[n][2]];
H_.two = TWO;
H_.dual = DUAL;
H_.oneR = oneHanded('R');
H_.oneL = oneHanded('L');

// the horse's own poses (layered on the rider's)
const HORSE = {
  rest: {},
  rear: { horse: [-0.35, 0, 0], flL: [-0.9, 0, 0], fkL: [0.4, 0, 0], flR: [-0.6, 0, 0], fkR: [0.8, 0, 0], hneck: [-0.3, 0, 0], hhead: [0.2, 0, 0], tail: [0.5, 0, 0], hhL: [-0.2, 0, 0], hhR: [-0.2, 0, 0], hkL: [0.25, 0, 0], hkR: [0.25, 0, 0] },
  stamp: { horse: [0.45, 0, 0], flL: [0.9, 0, 0], fkL: [-1.3, 0, 0], flR: [1.0, 0, 0], fkR: [-1.3, 0, 0], hneck: [0.25, 0, 0], hhead: [-0.2, 0, 0], tail: [-0.4, 0, 0], hhL: [0.2, 0, 0], hhR: [0.2, 0, 0], hkL: [-0.2, 0, 0], hkR: [-0.2, 0, 0], $root: [0, 0, 0.14, 0] },
  hit: { horse: [-0.4, 0, 0.15], flL: [-0.6, 0, 0], flR: [-0.3, 0, 0], hneck: [-0.5, 0.3, 0], hhead: [0.4, 0, 0] },
};

function clips(kind) {
  const P = H_[kind];
  return {
    idle: { d: 3.2, loop: true, keys: [[0, P.rest], [1, P.rest]] },
    guard: { d: 1.6, loop: true, keys: [[0, P.ready], [1, P.ready]] },
    walk: { d: 1, loop: true, keys: [[0, P.ready], [1, P.ready]] },
    run: { d: 1, loop: true, keys: [[0, P.ready], [1, P.ready]] },
    leap: { d: 1, keys: [[0, P.ready], [0.2, P.wind], [0.8, P.wind], [1, P.ready]] },
    attack: { d: 1.25, at: 0.58, keys: [[0, P.ready], [0.42, P.wind, 'out'], [0.58, P.strike, 'in'], [0.78, P.follow], [1, P.ready]] },
    attack2: { d: 1.25, at: 0.58, keys: [[0, P.ready], [0.42, P.wind, 'out'], [0.58, P.strike, 'in'], [0.78, P.follow], [1, P.ready]] },
    finish: { d: 1.7, at: 0.6, keys: [[0, P.rest], [0.12, P.ready], [0.46, P.wind, 'out'], [0.6, P.strike, 'in'], [0.82, P.follow], [1, P.follow]] },
    block: { d: 0.7, keys: [[0, P.ready], [0.25, P.block, 'out'], [0.7, P.block], [1, P.ready]] },
    hit: { d: 0.6, keys: [[0, P.ready], [0.15, P.block], [1, P.ready]] },
    hit2: { d: 0.7, keys: [[0, P.ready], [0.15, P.block], [1, P.ready]] },
    dodgeL: { d: 0.6, keys: [[0, P.ready], [0.3, { ...P.ready, $root: [0.25, 0, -0.05, 0] }, 'out'], [1, P.ready]] },
    dodgeR: { d: 0.6, keys: [[0, P.ready], [0.3, { ...P.ready, $root: [-0.25, 0, -0.05, 0] }, 'out'], [1, P.ready]] },
    cheer: { d: 1.3, keys: [[0, P.follow], [0.3, P.cheer, 'out'], [0.75, P.cheer], [1, P.rest]] },
    fidget: { d: 2, keys: [[0, P.rest], [0.3, P.ready], [0.7, P.ready], [1, P.rest]] },
    death: { d: 1.2, keys: [[0, P.block], [1, P.block]] },
  };
}
const HORSE_CLIPS = {
  attack: [[0, HORSE.rest], [0.42, HORSE.rear, 'out'], [0.58, HORSE.stamp, 'in'], [0.8, HORSE.stamp], [1, HORSE.rest]],
  finish: [[0, HORSE.rest], [0.46, HORSE.rear, 'out'], [0.6, HORSE.stamp, 'in'], [0.85, HORSE.stamp], [1, HORSE.stamp]],
  leap: [[0, HORSE.rest], [0.25, HORSE.rear], [0.75, HORSE.rear], [1, HORSE.stamp]],
  hit: [[0, HORSE.rest], [0.15, HORSE.hit], [1, HORSE.rest]],
  cheer: [[0, HORSE.rest], [0.35, HORSE.rear, 'out'], [0.75, HORSE.rear], [1, HORSE.rest]],
};
HORSE_CLIPS.attack2 = HORSE_CLIPS.attack;
HORSE_CLIPS.hit2 = HORSE_CLIPS.hit;
HORSE_CLIPS.block = HORSE_CLIPS.hit;

const CLIP_CACHE = {};
function clipSet(kind) {
  return CLIP_CACHE[kind] || (CLIP_CACHE[kind] = clips(kind));
}

const smooth = (x) => x * x * (3 - 2 * x);
const EASE = { out: (x) => 1 - (1 - x) ** 3, in: (x) => x ** 2.6, s: smooth };

// sample a keyframe track at k (0..1)
function sample(keys, k) {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1, e] = keys[i];
    const [t0, p0] = keys[i - 1];
    if (k <= t1) {
      const u = (EASE[e] || smooth)((k - t0) / Math.max(1e-6, t1 - t0));
      return blend(p0, p1, u);
    }
  }
  return keys[keys.length - 1][1];
}
function blend(a, b, u) {
  const out = {};
  for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[n], y = b[n];
    const len = (x || y).length;
    out[n] = [];
    for (let i = 0; i < len; i++) out[n].push((x ? x[i] : 0) * (1 - u) + (y ? y[i] : 0) * u);
  }
  return out;
}

// ------------------------------------------------------------------ the statue
export function buildStatue(code) {
  const type = code & 7, isWhite = (code & 8) === 0;
  const mat = granite(isWhite ? 'white' : 'black');
  const t = template(type);
  const group = new THREE.Group();
  const inner = new THREE.Group(); // effects move this
  group.add(inner);
  const model = t.model.clone(true); // the statue: glides and tilts on its pedestal
  inner.add(model);
  const J = {};
  model.traverse((o) => {
    if (o.isMesh) o.material = mat;
    else if (o.userData.rest || ['weapon', 'weapon2', 'shield'].includes(o.name)) J[o.name] = o;
  });
  const body = model.getObjectByName('body');
  const info = {
    ...t.info,
    legs: t.info.legs.map((l) => ({ hip: J[l.hip], knee: J[l.knee], ankle: J[l.ankle], thigh: l.thigh, shin: l.shin, foot: V(...l.foot) })),
  };
  // sparks fly from the weapon's striking end
  const hand = new THREE.Object3D();
  hand.name = 'handslotr';
  if (J.weapon) {
    hand.position.fromArray(J.weapon.userData.tip || [0, -0.3, 0]);
    J.weapon.add(hand);
  }
  const kind = info.style === 'one' ? (info.hand === 'L' ? 'oneL' : 'oneR') : info.style;
  const box3 = new THREE.Box3().setFromObject(model);
  const fig = {
    group, type, isWhite, code, spec: {}, model, materials: [mat], stone: false, statue: true,
    parts: { inner }, current: null, J, info, kind, body,
    height: box3.max.y - box3.min.y, radius: 0.26,
    move: { name: 'idle', t: 0, d: 3.2, loop: true }, from: null, blendT: 1, seed: Math.random() * 10,
  };
  fig.mixer = { update: (dt) => animate(fig, dt) };
  animate(fig, 0);
  return fig;
}

const ALIAS = { Blocking: 'guard', '2H_Melee_Idle': 'guard', Idle: 'idle' };
export const MOVES = clipSet('two');

/** Starts a move; returns its duration. */
export function playMove(fig, name, { loop, speed = 1, duration = 0 } = {}) {
  let key = name.startsWith('S_') ? name.slice(2) : ALIAS[name] || name;
  const C = clipSet(fig.kind);
  if (!C[key]) key = 'idle';
  const c = C[key];
  const d = duration > 0 ? duration : c.d / (speed || 1);
  if (fig.move.name === 'death') return d; // the fallen stay down
  if (fig.move.name === key && c.loop) return d;
  fig.from = fig.pose || null; // cross-fade from wherever the body is now
  fig.blendT = 0;
  fig.move = { name: key, t: 0, d, loop: loop || !!c.loop, at: c.at || 0.5 };
  return d;
}
export const strikeAt = (name) => clipSet('two')[name.replace(/^S_/, '')]?.at;

const _q = new THREE.Vector3(), _a = new THREE.Vector3();
function animate(fig, dt) {
  const m = fig.move;
  m.t += dt;
  if (!m.loop && m.t >= m.d && m.name !== 'death' && m.name !== 'finish') playMove(fig, 'idle');
  const k = m.loop ? (m.t % m.d) / m.d : Math.min(1, m.t / m.d);
  const C = clipSet(fig.kind);
  let pose = sample(C[fig.move.name].keys, k);
  // life: breathing, glancing round; the march sways
  const T = fig.move.t + fig.seed;
  const live = { spine: [Math.sin(T * 1.7) * 0.02, Math.sin(T * 0.4) * 0.05, 0], head: [Math.sin(T * 0.6) * 0.04, Math.sin(T * 0.45) * 0.3, 0] };
  if (m.name === 'walk' || m.name === 'run') {
    live.spine = [0.06, Math.sin(T * 6) * 0.08, Math.sin(T * 6) * 0.04];
    live.head = [0, -Math.sin(T * 6) * 0.06, 0];
  }
  pose = add(pose, live);
  if (fig.type === KNIGHT) {
    const hk = HORSE_CLIPS[m.name];
    let hp = hk ? sample(hk, k) : {};
    if (m.name === 'walk' || m.name === 'run' || m.name === 'guard') {
      const g = T * 9;
      hp = { horse: [-0.12 * Math.sin(g), 0, 0], flL: [0.5 * Math.sin(g), 0, 0], flR: [0.5 * Math.sin(g + 1.3), 0, 0], fkL: [-0.6 * Math.max(0, Math.sin(g + 0.8)), 0, 0], fkR: [-0.6 * Math.max(0, Math.sin(g + 2.1)), 0, 0], hneck: [0.15 * Math.sin(g + 0.5), 0, 0], tail: [0.2 * Math.sin(g), 0, 0.3 * Math.sin(g * 0.5)] };
    } else if (m.name === 'idle') {
      hp = { hneck: [0.08 * Math.sin(T * 1.1), 0.12 * Math.sin(T * 0.4), 0], fkL: [0.25 * Math.max(0, Math.sin(T * 1.7)), 0, 0], tail: [0, 0, 0.3 * Math.sin(T * 2.3)] };
    }
    pose = add(pose, hp);
  }
  // cross-fade from the previous move's pose
  fig.blendT = Math.min(1, fig.blendT + dt / 0.18);
  if (fig.from && fig.blendT < 1) pose = blend(fig.from, pose, smooth(fig.blendT));
  fig.pose = pose;
  const J = fig.J;
  for (const [n, j] of Object.entries(J)) {
    if (!j.userData.rest) continue;
    const r = j.userData.rest, p = pose[n];
    j.rotation.set(r[0] + (p ? p[0] : 0), r[1] + (p ? p[1] : 0), r[2] + (p ? p[2] : 0));
  }
  const H = fig.info.H;
  // the pelvis moves; legs follow by IK, feet stay on the pedestal
  if (J.hips && fig.info.legs.length) {
    const hp = pose.$hips || [0, 0];
    J.hips.position.set(0, 0.5 * H + hp[0] * H, hp[1] * H);
    solveLegs(fig);
  }
  // the statue itself glides and tilts on the board
  const rp = pose.$root || [0, 0, 0, 0];
  fig.model.position.set(rp[0], rp[1], rp[2]);
  fig.model.rotation.x = rp[3];
  if (m.name === 'death') fall(fig, m.t, m.d);
  else fig.body.rotation.set(0, 0, 0);
  return fig.mixer;
}
function add(a, b) {
  const out = { ...a };
  for (const [n, v] of Object.entries(b)) {
    const x = out[n];
    out[n] = x ? x.map((e, i) => e + (v[i] || 0)) : v;
  }
  return out;
}

// two-bone IK in the leg's sagittal plane: knee bends forward, foot stays flat
function solveLegs(fig) {
  const { J, info } = fig;
  fig.body.updateMatrixWorld(true);
  for (const L of info.legs) {
    const target = fig.body.localToWorld(L.foot.clone());
    const hipW = L.hip.getWorldPosition(_q);
    L.hip.parent.worldToLocal(target);
    L.hip.parent.worldToLocal(hipW);
    const dy = target.y - hipW.y, dz = target.z - hipW.z;
    const a = L.thigh, b = L.shin;
    const len = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, Math.hypot(dy, dz)));
    const phi = Math.atan2(dz, -dy);
    const alpha = Math.acos(Math.min(1, Math.max(-1, (a * a + len * len - b * b) / (2 * a * len))));
    const beta = Math.PI - Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - len * len) / (2 * a * b))));
    L.hip.rotation.set(-(phi + alpha), 0, 0);
    L.knee.rotation.set(beta, 0, 0);
    // keep the foot flat on the slab
    let tilt = 0;
    for (let o = L.hip.parent; o && o !== fig.body; o = o.parent) tilt += o.rotation.x;
    L.ankle.rotation.set(-(L.hip.rotation.x + beta) - tilt, 0, 0);
  }
}

// struck down: the figure topples off its pedestal backwards, stiff as stone
function fall(fig, t, d) {
  const k = Math.min(1, t / d);
  const a = k * k * 1.45;
  fig.body.rotation.set(-a, 0, 0.2 * k);
}

/** For the rubble: the solid stone parts of a statue, one per joint. */
export function statueParts(fig) {
  const out = [];
  fig.model.traverse((o) => {
    if (o.isMesh) out.push(o);
  });
  return out;
}

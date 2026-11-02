// The armies. The default ('stone') look is the Wizard Chess set of carved statues (see the end
// of this file); the 'toon' look, and the fallback when the statues aren't built in, are
// rigged, textured, animated characters from KayKit's Adventurers and Skeletons
// packs (CC0, Kay Lousberg, www.kaylousberg.com), packed by tools/pack-models.mjs.
//
// White are the living: hooded rogues (pawns), the armoured knight, the mage (bishop), the
// barbarian (rook), a crowned rogue (queen) and the crowned knight with a greatsword (king).
// Black are the dead: skeleton minions, skeleton rogues, the skeleton mage, a hulking minion
// with an axe and shield (rook), a crowned mage (queen) and the crowned warrior (king).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIGS, posture } from './rigs.js';
import MODELS from './models_data.gen.js';
import { stoneMaterial } from './stone.js';

// 'stone': living chess statues with heroic proportions (default). 'toon': the original KayKit look.
let style = 'stone';
export function setStyle(s) {
  style = s === 'toon' ? 'toon' : 'stone';
}
export function getStyle() {
  return style;
}

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

// model, weapons to show (names inside the model), extra weapon files, size, idle clip, crown
const ROSTER = {
  white: {
    [PAWN]: { model: 'rogue_hooded', show: ['Knife'], height: 1.05, style: '1h' },
    [KNIGHT]: { model: 'knight', show: ['1H_Sword', 'Badge_Shield'], height: 1.2, style: 'shield' },
    [BISHOP]: { model: 'mage', show: ['2H_Staff', 'Spellbook'], height: 1.22, style: 'caster' },
    [ROOK]: { model: 'barbarian', show: ['2H_Axe'], height: 1.28, style: '2h' },
    [QUEEN]: { model: 'rogue', show: ['Knife', 'Knife_Offhand'], height: 1.25, style: 'dual', crown: true, caster: true },
    [KING]: { model: 'knight', show: ['2H_Sword'], height: 1.38, style: '2h', crown: true },
  },
  black: {
    [PAWN]: { model: 'skeleton_minion', weapons: { r: 'skeleton_blade' }, height: 1.05, style: '1h' },
    [KNIGHT]: { model: 'skeleton_rogue', weapons: { r: 'skeleton_blade', l: 'skeleton_shield_small_a' }, height: 1.2, style: 'shield' },
    [BISHOP]: { model: 'skeleton_mage', weapons: { r: 'skeleton_staff' }, height: 1.22, style: 'caster' },
    [ROOK]: { model: 'skeleton_minion', weapons: { r: 'skeleton_axe', l: 'skeleton_shield_large_b' }, height: 1.32, style: 'shield' },
    [QUEEN]: { model: 'skeleton_mage', weapons: { r: 'skeleton_staff' }, height: 1.3, style: 'caster', crown: true },
    [KING]: { model: 'skeleton_warrior', weapons: { r: 'skeleton_axe' }, height: 1.38, style: '2h', crown: true },
  },
};

let loaded = null;

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Decodes the embedded models once. */
export async function loadFigures() {
  if (loaded) return loaded;
  const loader = new GLTFLoader();
  const parse = (name) => new Promise((res, rej) => loader.parse(b64ToBuffer(MODELS[name]), '', res, rej));
  const names = Object.keys(MODELS);
  const gltfs = await Promise.all(names.map(parse));
  const byName = {};
  names.forEach((n, i) => (byName[n] = gltfs[i]));
  const clips = {};
  for (const c of byName.anims.animations) clips[c.name] = c;
  loaded = { byName, clips };
  return loaded;
}

// a small gold crown for the royals, parented to the head bone
function crown(isWhite) {
  const g = new THREE.Group();
  g.name = 'crown';
  const gold = new THREE.MeshStandardMaterial({ color: isWhite ? 0xe2b33c : 0x9b6bd1, roughness: 0.25, metalness: 0.9, emissive: isWhite ? 0x000000 : 0x2a0f40 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.12, 20, 1, true), gold));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const pt = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), gold);
    pt.position.set(Math.cos(a) * 0.23, 0.12, Math.sin(a) * 0.23);
    g.add(pt);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: isWhite ? 0xc0172f : 0x39ff8a, emissive: isWhite ? 0x400008 : 0x0a6030, roughness: 0.2 }));
    gem.position.set(Math.cos(a) * 0.235, 0.0, Math.sin(a) * 0.235);
    g.add(gem);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Builds a figure for a piece code (Dart's: white 1..6, black 9..14). */
export function buildFigure(code) {
  if (style === 'stone' && hasStatues()) return buildStatue(code);
  const type = code & 7, isWhite = (code & 8) === 0;
  const spec = ROSTER[isWhite ? 'white' : 'black'][type];
  const group = new THREE.Group();
  // the figure stands right on its square: no base
  const inner = new THREE.Group(); // the figure itself (moved by effects)
  group.add(inner);
  const src = loaded.byName[spec.model];
  const model = SkeletonUtils.clone(src.scene);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned meshes move outside their bind-pose bounds
    }
  });
  // show only the props this piece carries
  const slots = {};
  model.traverse((o) => {
    if (/^handslot[lr]$/i.test(o.name.replace('.', ''))) slots[o.name.replace('.', '').slice(-1).toLowerCase()] = o;
  });
  for (const s of Object.values(slots)) {
    for (const c of [...s.children]) c.visible = !spec.show || spec.show.includes(c.name);
  }
  for (const [side, w] of Object.entries(spec.weapons || {})) {
    const wm = loaded.byName[w].scene.clone();
    wm.traverse((o) => (o.castShadow = true));
    slots[side]?.add(wm);
  }
  let head = null;
  model.traverse((o) => {
    if (o.isBone && o.name === 'head') head = o;
  });
  if (spec.crown && head) {
    // royals take off their helmet or hat and wear the crown on their head
    const off = [];
    model.traverse((o) => {
      if (/_(Helmet|Hat)$/.test(o.name)) off.push(o);
    });
    for (const o of off) o.parent.remove(o);
    model.updateMatrixWorld(true);
    let skull = null;
    model.traverse((o) => {
      if (o.isMesh && /_(Head|Skull)$/.test(o.name)) skull = o;
    });
    const top = skull ? new THREE.Box3().setFromObject(skull).max.y : 0;
    const headY = head.getWorldPosition(new THREE.Vector3()).y;
    const c = crown(isWhite);
    c.scale.setScalar(1.6);
    c.position.y = top - headY - 0.12;
    head.add(c);
  }
  // normalise the height so each piece towers over its square by its rank
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y || 1;
  const stone = style === 'stone';
  // the stone statues are lengthened to heroic proportions, so start them a little smaller
  model.scale.setScalar((spec.height / h) * (stone ? 0.86 : 1));
  inner.add(model);

  const materials = [];
  if (stone) {
    const side = isWhite ? 'white' : 'black';
    model.traverse((o) => {
      if (!o.isMesh) return;
      let held = false;
      for (let q = o.parent; q; q = q.parent) if (/^handslot|^crown$/.test(q.name)) held = true;
      const kind = o.material?.name === 'Glow' || /_Eyes$/.test(o.name) ? 2 : held || /crown/.test(o.name) ? 1 : 0;
      o.material = stoneMaterial(o.material, side, kind);
      materials.push(o.material);
    });
  } else {
    model.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        materials.push(o.material);
      }
    });
  }

  const mixer = new THREE.AnimationMixer(model);
  if (stone) {
    // heroic proportions: a smaller head, longer legs and arms, a taller torso. The clips
    // key every bone's scale, so this is re-applied after each update.
    const bones = {};
    model.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
    });
    const update = mixer.update.bind(mixer);
    mixer.update = (dt) => {
      update(dt);
      bones.head?.scale.setScalar(0.62);
      bones.spine?.scale.set(1, 1.18, 1);
      for (const s2 of ['l', 'r']) {
        bones['upperleg' + s2]?.scale.set(1, 1.32, 1);
        bones['upperarm' + s2]?.scale.set(1, 1.18, 1);
      }
      if (bones.hips) bones.hips.position.y += 0.17; // keep the longer legs on the ground
      return mixer;
    };
  }
  const fig = { group, type, isWhite, code, spec, model, mixer, current: null, parts: { inner }, materials, stone };
  return fig;
}

/** Fades a figure (0 invisible .. 1 solid), for pieces in the camera's way and for deaths. */
export function setOpacity(fig, o) {
  if (fig.opacity === o) return;
  fig.opacity = o;
  for (const m of fig.materials) {
    m.transparent = o < 0.999;
    m.opacity = o;
    m.depthWrite = o > 0.6;
  }
}

/** Rots a stone figure (0 alive .. 1 crumbling); toon figures darken. */
export function setRot(fig, r) {
  for (const m of fig.materials) {
    if (m.userData.uniforms) m.userData.uniforms.uRot.value = r;
    else m.color.setScalar(1 - 0.75 * r);
  }
}

/** Name of the clip a piece uses for an action ('idle', 'walk', 'attack', 'finish' ...). */
export function clipFor(fig, action) {
  if (fig.statue) return 'S_' + action;
  const s = fig.spec.style, white = fig.isWhite, t = fig.type;
  switch (action) {
    case 'idle':
      return s === '2h' ? '2H_Melee_Idle' : white ? 'Idle' : 'Idle_B';
    case 'walk':
      return white ? 'Walking_A' : 'Walking_D_Skeletons';
    case 'run':
      return 'Running_A';
    case 'leap':
      return 'Jump_Full_Long';
    case 'attack':
      return s === '2h' ? '2H_Melee_Attack_Slice' : s === 'caster' ? 'Spellcast_Shoot' : s === 'dual' ? '1H_Melee_Attack_Stab' : '1H_Melee_Attack_Slice_Diagonal';
    case 'attack2':
      return s === '2h' ? '2H_Melee_Attack_Chop' : s === 'caster' ? 'Spellcast_Shoot' : '1H_Melee_Attack_Chop';
    case 'finish':
      if (t === KING) return '2H_Melee_Attack_Spin';
      if (t === KNIGHT) return '1H_Melee_Attack_Jump_Chop';
      if (t === ROOK) return white ? '2H_Melee_Attack_Chop' : '1H_Melee_Attack_Chop';
      if (t === BISHOP) return 'Spellcast_Long';
      if (t === QUEEN) return fig.spec.caster && white ? 'Spellcast_Raise' : 'Spellcast_Raise';
      return '1H_Melee_Attack_Stab';
    case 'block':
      return 'Block_Hit';
    case 'dodgeL':
      return 'Dodge_Left';
    case 'dodgeR':
      return 'Dodge_Right';
    case 'hit':
      return 'Hit_A';
    case 'hit2':
      return 'Hit_B';
    case 'death':
      return white ? (Math.random() < 0.5 ? 'Death_A' : 'Death_B') : 'Death_C_Skeletons';
    case 'cheer':
      return white ? 'Cheer' : 'Taunt';
    case 'fidget':
      return white ? (s === 'caster' ? 'Spellcast_Raise' : 'Use_Item') : 'Taunt';
  }
  return 'Idle';
}

// When in a clip (0..1) the blow lands.
export const STRIKE_AT = {
  '1H_Melee_Attack_Slice_Diagonal': 0.42, '1H_Melee_Attack_Chop': 0.45, '1H_Melee_Attack_Stab': 0.42,
  '1H_Melee_Attack_Jump_Chop': 0.6, '2H_Melee_Attack_Slice': 0.45, '2H_Melee_Attack_Chop': 0.52,
  '2H_Melee_Attack_Spin': 0.55, Spellcast_Shoot: 0.45, Spellcast_Long: 0.7, Spellcast_Raise: 0.62,
};

/** Plays a clip on a figure, cross-fading from whatever it was doing. */
export function play(fig, name, { loop = false, fade = 0.18, speed = 1, duration = 0 } = {}) {
  if (fig.statue) return playStatue(fig, name, { loop, speed, duration });
  const clip = loaded.clips[name];
  if (!clip) return 0;
  const action = fig.mixer.clipAction(clip);
  if (fig.current === action && loop) return clip.duration;
  action.reset();
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = !loop;
  action.timeScale = duration > 0 ? clip.duration / duration : speed;
  if (fig.current && fig.current !== action) {
    action.crossFadeFrom(fig.current, fade, false);
  }
  action.play();
  fig.current = action;
  return clip.duration / action.timeScale;
}

export function hasClip(name) {
  return !!loaded?.clips[name];
}

export function clipDuration(name) {
  if (name.startsWith('S_')) return STATUE_MOVES[name.slice(2)]?.d || 1;
  return loaded.clips[name]?.duration || 1;
}

/**
 * The bare skeleton left when a statue rots away: a bone-white skeleton in exactly the
 * dying figure's pose (both rigs share bone names), placed where the figure lies.
 */
export function buildRemains(fig) {
  const model = SkeletonUtils.clone(loaded.byName.skeleton_minion.scene);
  const bonesFrom = {};
  fig.model.traverse((o) => {
    if (o.isBone) bonesFrom[o.name] = o;
  });
  const materials = [];
  const bone = new THREE.MeshStandardMaterial({ color: 0xcdbf9c, roughness: 0.85, metalness: 0 });
  model.traverse((o) => {
    if (/^handslot/i.test(o.name.replace('.', ''))) for (const c of o.children) c.visible = false;
    if (o.isBone && bonesFrom[o.name]) o.quaternion.copy(bonesFrom[o.name].quaternion); // the same pose
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      o.material = /_Eyes$/.test(o.name) || o.material?.name === 'Glow' ? new THREE.MeshBasicMaterial({ color: 0x000000 }) : bone.clone();
      materials.push(o.material);
    }
  });
  model.scale.copy(fig.model.scale);
  model.position.copy(fig.model.position);
  model.quaternion.copy(fig.model.quaternion);
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.copy(fig.parts.inner.position);
  inner.quaternion.copy(fig.parts.inner.quaternion);
  inner.add(model);
  group.add(inner);
  group.position.copy(fig.group.position);
  group.quaternion.copy(fig.group.quaternion);
  // the same pose puts the bones where the body lies; just rest them on the board
  group.updateMatrixWorld(true);
  group.position.y -= new THREE.Box3().setFromObject(group, true).min.y - 0.01;
  return { group, model, materials, isWhite: fig.isWhite, parts: { inner }, opacity: 1 };
}

// ================================================================== the wizard's chess statues
//
// The carved set (models/wizard_*.glb, from tools/import-wizard.mjs): solid stone figures on
// columned pedestals. Like the pieces in the film they don't walk; they grind across the board,
// rear back and smash their victims to rubble. They are rigid, so every move is the whole statue
// rocking, lunging, leaping and toppling, driven by playStatue() / the fake mixer below.

const STATUE_FILES = { [PAWN]: 'pawn', [KNIGHT]: 'knight', [BISHOP]: 'bishop', [ROOK]: 'rook', [QUEEN]: 'queen', [KING]: 'king' };
const MM = 1.0 / 40; // true to the 40 mm squares, so the back rows stay visible over the front // the real board has 40 mm squares; the statues are a touch larger on screen
// where each statue holds its weapon (mm, facing +z): sparks fly from here
const WEAPON = {
  [PAWN]: [0, 17, 7], [KNIGHT]: [0, 42, 6], [BISHOP]: [7, 47, 1],
  [ROOK]: [0, 44, 0], [QUEEN]: [0, 36, 4], [KING]: [0, 34, 5],
};
// the moves: duration (s), when the blow lands (0..1), and whether they loop
export const STATUE_MOVES = {
  idle: { d: 2, loop: true }, walk: { d: 1, loop: true }, run: { d: 1, loop: true }, guard: { d: 1.4, loop: true },
  leap: { d: 1 }, attack: { d: 1.0, at: 0.5 }, attack2: { d: 1.0, at: 0.5 }, finish: { d: 1.5, at: 0.62 },
  block: { d: 0.6 }, dodgeL: { d: 0.6 }, dodgeR: { d: 0.6 }, hit: { d: 0.5 }, hit2: { d: 0.6 },
  death: { d: 1.1 }, cheer: { d: 1.0 }, fidget: { d: 1.8 },
};
for (const [k, v] of Object.entries(STATUE_MOVES)) if (v.at) STRIKE_AT['S_' + k] = v.at;
const RAW = { Blocking: 'guard', '2H_Melee_Idle': 'guard', Idle: 'idle' };

export function hasStatues() {
  return !!(MODELS.wizard_king && loaded?.byName.wizard_king);
}

const statueGeo = {};
function statueGeometry(type) {
  if (statueGeo[type]) return statueGeo[type];
  const scene = loaded.byName['wizard_' + STATUE_FILES[type]].scene;
  scene.updateMatrixWorld(true);
  let src = null;
  scene.traverse((o) => {
    if (o.isMesh && !src) src = o;
  });
  // bake the quantisation transform into plain floats, then shade with creased normals so
  // the carved edges stay crisp and the curved robes stay smooth
  const a = src.geometry.attributes.position;
  const pos = new Float32Array(a.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i).applyMatrix4(src.matrixWorld);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(src.geometry.index.clone());
  const out = toCreasedNormals(g, (35 * Math.PI) / 180);
  out.computeBoundingBox();
  // bind every vertex to the joints of the body part it belongs to (rigs.js)
  const rig = RIGS[type];
  const names = Object.keys(rig.bones);
  const p = out.attributes.position;
  const n = p.count;
  // weld the corners (the geometry is unindexed) so limbs can be grown over the surface
  const key = new Map(), id = new Int32Array(n), vx = [];
  for (let i = 0; i < n; i++) {
    const k = Math.round(p.getX(i) * 200) + ',' + Math.round(p.getY(i) * 200) + ',' + Math.round(p.getZ(i) * 200);
    let v = key.get(k);
    if (v === undefined) {
      v = vx.length / 3;
      key.set(k, v);
      vx.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    id[i] = v;
  }
  const nv = vx.length / 3;
  const nbr = Array.from({ length: nv }, () => []);
  for (let t = 0; t < n; t += 3) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      nbr[id[t + a]].push(id[t + b]);
      nbr[id[t + b]].push(id[t + a]);
    }
  }
  // pieces modelled as many loose shells (the king's sword, hands, armour plates) touch rather
  // than join: link vertices of different shells that lie within 0.4 mm of each other
  const shell = new Int32Array(nv).fill(-1);
  for (let s0 = 0, ns = 0; s0 < nv; s0++) {
    if (shell[s0] >= 0) continue;
    const q = [s0];
    shell[s0] = ns;
    for (let h = 0; h < q.length; h++) for (const w of nbr[q[h]]) if (shell[w] < 0) { shell[w] = ns; q.push(w); }
    ns++;
  }
  const cell = new Map(), C = 0.4;
  const ck = (x, y, z) => Math.floor(x / C) + ',' + Math.floor(y / C) + ',' + Math.floor(z / C);
  for (let v = 0; v < nv; v++) {
    const k = ck(vx[v * 3], vx[v * 3 + 1], vx[v * 3 + 2]);
    (cell.get(k) || cell.set(k, []).get(k)).push(v);
  }
  for (let v = 0; v < nv; v++) {
    const x = vx[v * 3], y = vx[v * 3 + 1], z = vx[v * 3 + 2];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) {
      for (const w of cell.get(ck(x + i * C, y + j * C, z + l * C)) || []) {
        if (w > v && shell[w] !== shell[v] && (vx[w * 3] - x) ** 2 + (vx[w * 3 + 1] - y) ** 2 + (vx[w * 3 + 2] - z) ** 2 < C * C) {
          nbr[v].push(w);
          nbr[w].push(v);
        }
      }
    }
  }
  const owner = new Int32Array(nv).fill(-1); // part index
  const ring = new Float32Array(nv); // how far inside its part (edge rings, for a soft seam)
  rig.parts.forEach((part, pi) => {
    const ok = (v) => owner[v] < 0 && part.allow(vx[v * 3], vx[v * 3 + 1], vx[v * 3 + 2]);
    // start from the allowed vertex nearest each seed (a limb can be several loose pieces:
    // two arms, a hand, a sword)
    const region = [];
    for (const sd of Array.isArray(part.seed[0]) ? part.seed : [part.seed]) {
      let seed = -1, best = 2.5 * 2.5; // within 2.5 mm
      for (let v = 0; v < nv; v++) {
        if (!ok(v)) continue;
        const d = (vx[v * 3] - sd[0]) ** 2 + (vx[v * 3 + 1] - sd[1]) ** 2 + (vx[v * 3 + 2] - sd[2]) ** 2;
        if (d < best) {
          best = d;
          seed = v;
        }
      }
      if (seed >= 0) {
        owner[seed] = pi;
        region.push(seed);
      }
    }
    if (!region.length) return;
    for (let h = 0; h < region.length; h++) {
      for (const w of nbr[region[h]]) {
        if (ok(w)) {
          owner[w] = pi;
          region.push(w);
        }
      }
    }
    // rings in from the edge of the part
    const dist = new Int32Array(nv).fill(-1), q = [];
    const near = (v, w) => (vx[v * 3] - vx[w * 3]) ** 2 + (vx[v * 3 + 1] - vx[w * 3 + 1]) ** 2 + (vx[v * 3 + 2] - vx[w * 3 + 2]) ** 2 < 1.6 * 1.6;
    for (const v of region) {
      // soften only real joints (short edges to the body), not long slivers that happen to
      // touch it: a sword blade or a staff is all slivers and must move whole
      if (nbr[v].some((w) => owner[w] !== pi && near(v, w))) {
        dist[v] = 0;
        q.push(v);
      }
    }
    for (let h = 0; h < q.length; h++) {
      for (const w of nbr[q[h]]) {
        if (owner[w] === pi && dist[w] < 0) {
          dist[w] = dist[q[h]] + 1;
          q.push(w);
        }
      }
    }
    for (const v of region) ring[v] = Math.min(1, (dist[v] < 0 ? 3 : dist[v]) / 2);
  });
  const weights = (v) => {
    const w = new Float32Array(names.length);
    const x = vx[v * 3], y = vx[v * 3 + 1], z = vx[v * 3 + 2];
    let k = 0;
    if (owner[v] >= 0) {
      // soften the seam only at the joint itself (a shoulder, a hip), never where the limb
      // merely touches something far from it (a sword tip resting by a foot)
      const pv = rig.bones[rig.parts[owner[v]].bone][1];
      const atJoint = (x - pv[0]) ** 2 + (y - pv[1]) ** 2 + (z - pv[2]) ** 2 < 6 * 6;
      k = atJoint ? 0.5 + 0.5 * ring[v] : 1;
    }
    if (k > 0) w[names.indexOf(rig.parts[owner[v]].bone)] += k;
    const base = rig.base(x, y, z);
    let total = 0;
    for (const [, bw] of base) total += bw;
    for (const [bn, bw] of base) w[names.indexOf(bn)] += ((1 - k) * bw) / total;
    return w;
  };
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const put = (i, v) => {
    let j = 0;
    v.forEach((w, b) => {
      if (w > 0.001 && j < 4) {
        si[i * 4 + j] = b;
        sw[i * 4 + j++] = w;
      }
    });
  };
  // a triangle whose corners belong to unrelated parts would stretch into a sheet when they
  // move apart, so it moves whole, with the part most of it belongs to
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((c) => weights(id[t + c]));
    let far = 0;
    for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) far = Math.max(far, v[a].reduce((d, w, i) => d + Math.abs(w - v[b][i]), 0));
    // ... and so does any long sliver that would bend across a joint
    let long = 0;
    for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) long = Math.max(long, (p.getX(t + a) - p.getX(t + b)) ** 2 + (p.getY(t + a) - p.getY(t + b)) ** 2 + (p.getZ(t + a) - p.getZ(t + b)) ** 2);
    if (far > 1.2 || (far > 0.15 && long > 9)) {
      const sum = v[0].map((w, i) => w + v[1][i] + v[2][i]);
      const m = new Float32Array(names.length);
      m[sum.indexOf(Math.max(...sum))] = 1;
      v[0] = v[1] = v[2] = m;
    }
    for (let c = 0; c < 3; c++) put(t + c, v[c]);
  }
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  if (rig.unfold) return (statueGeo[type] = withLegs(out, rig, names));
  return (statueGeo[type] = out);
}

// The pawn's legs (and lids for the pedestal and his underside), folded away inside his crouch
// and drawn out as he stands: each leg is a tapered column whose foot is bound to the pedestal
// and whose hip is bound to his body, so it stretches as the body rises.
function withLegs(geo, rig, names) {
  const { unfold: legs, caps } = rig;
  const root = names.indexOf('root'), body = names.indexOf('spine');
  const parts = [];
  const skin = (g, fn) => {
    const p = g.attributes.position, si = [], sw = [];
    for (let i = 0; i < p.count; i++) {
      const t = fn(p.getX(i), p.getY(i), p.getZ(i));
      si.push(root, body, 0, 0);
      sw.push(1 - t, t, 0, 0);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    parts.push(g);
  };
  legs.foot.forEach((f, i) => {
    const h = legs.hip[i];
    const g = new THREE.CylinderGeometry(legs.r[1], legs.r[0], 1, 12, 6, false).toNonIndexed();
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const t = p.getY(v);
      p.setXYZ(v, p.getX(v) + f[0] + (h[0] - f[0]) * t, legs.footY + (legs.hipY - legs.footY) * t, p.getZ(v) + f[1] + (h[1] - f[1]) * t);
    }
    g.computeVertexNormals();
    skin(g, (x, y) => (y - legs.footY) / (legs.hipY - legs.footY));
  });
  for (const [name, [x, y, z, r]] of Object.entries(caps)) {
    const g = new THREE.CircleGeometry(r, 24).toNonIndexed();
    g.rotateX(name === 'body' ? Math.PI / 2 : -Math.PI / 2); // the body's lid faces down
    g.translate(x, y, z);
    skin(g, () => (name === 'body' ? 1 : 0));
  }
  for (const g of parts) {
    g.deleteAttribute('uv');
    if (g.index) throw new Error('indexed');
  }
  const merged = mergeGeometries([geo, ...parts]);
  merged.computeBoundingBox();
  return merged;
}

function buildStatue(code) {
  const type = code & 7, isWhite = (code & 8) === 0;
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const model = new THREE.Group(); // the pose: rocked, lunged and toppled by the moves
  inner.add(model);
  const geo = statueGeometry(type);
  const mat = stoneMaterial(null, isWhite ? 'white' : 'black', 0, { scale: 0.2 });
  // the stone shader brightens by the base colour: tone the marble down so the carving reads
  mat.color.set(isWhite ? 0x9c968c : 0xb0b0b0);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.scale.setScalar(MM);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // the posed limbs leave the bind-pose bounds
  model.add(mesh);
  // the skeleton, in the model's millimetres
  const rig = RIGS[type];
  const bones = {}, list = [];
  for (const [name, [parent, pivot]] of Object.entries(rig.bones)) {
    const b = new THREE.Bone();
    b.name = name;
    b.userData.pivot = pivot;
    const pp = parent ? rig.bones[parent][1] : [0, 0, 0];
    b.position.set(pivot[0] - pp[0], pivot[1] - pp[1], pivot[2] - pp[2]);
    (parent ? bones[parent] : mesh).add(b);
    bones[name] = b;
    list.push(b);
  }
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  // sparks fly from the weapon, wherever the arm swings it
  const hand = new THREE.Object3D();
  hand.name = 'handslotr';
  const wb = bones.weapon || bones.spine;
  hand.position.fromArray(WEAPON[type]).sub(new THREE.Vector3().fromArray(wb.userData.pivot));
  wb.add(hand);
  const bb = geo.boundingBox;
  const fig = {
    group, type, isWhite, code, spec: {}, model, materials: [mat], stone: false, statue: true,
    parts: { inner }, current: null, move: { name: 'idle', t: 0, d: 2, loop: true },
    height: (bb.max.y - bb.min.y) * MM, radius: 10 * MM,
    pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    bones, joints: {}, seed: Math.random() * 10,
  };
  fig.mixer = { update: (dt) => animateStatue(fig, dt) };
  return fig;
}

function playStatue(fig, name, { loop, speed, duration }) {
  let key = name.startsWith('S_') ? name.slice(2) : RAW[name] || name;
  if (!STATUE_MOVES[key]) key = 'idle';
  const m = STATUE_MOVES[key];
  const d = duration > 0 ? duration : m.d / (speed || 1);
  // the victim lying in rubble stays down
  if (fig.move.name === 'death' && key !== 'death') return d;
  fig.move = { name: key, t: 0, d, loop: loop || !!m.loop, at: m.at || 0.5, side: Math.random() < 0.5 ? 1 : -1 };
  return d;
}

const ZERO = [0, 0, 0];
const smooth = (x) => x * x * (3 - 2 * x);
const c01 = (x) => Math.max(0, Math.min(1, x));
// rise from 0 to 1 between a and b, then fall back to 0 between c and d
const bump = (k, a, b, c, d) => (k < a ? 0 : k < b ? smooth((k - a) / (b - a)) : k < c ? 1 : k < d ? 1 - smooth((k - c) / (d - c)) : 0);

function strikePose(fig, k, at, big) {
  // rear back, then hurl the whole statue at the victim and slam down
  const P = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const wind = bump(k, 0.05, at - 0.12, at - 0.12, at - 0.02);
  const lunge = bump(k, at - 0.12, at, at + 0.12, 0.98);
  const s = big ? 1.4 : 1;
  switch (fig.type) {
    case KNIGHT: // the horse rears (its joints) and the whole statue lunges as it stamps down
      P.y = 0.06 * wind;
      P.z = -0.08 * wind + 0.4 * lunge * s;
      break;
    case ROOK: // the tower jumps and comes down like a hammer
      P.y = 0.55 * wind * s;
      P.rx = -0.12 * wind + 0.18 * lunge;
      P.z = 0.38 * lunge;
      break;
    case PAWN: // springs at the victim
      P.y = 0.08 * lunge;
      P.z = -0.04 * wind + 0.45 * lunge;
      break;
    default: // bishop, queen, king: step in behind the blow
      P.rx = -0.08 * wind + 0.15 * lunge;
      P.y = 0.04 * wind * s;
      P.z = -0.08 * wind + 0.4 * lunge * s;
  }
  return P;
}

function animateStatue(fig, dt) {
  const m = fig.move;
  m.t += dt;
  if (!m.loop && m.t >= m.d && m.name !== 'death') fig.move = { name: 'idle', t: 0, d: 2, loop: true };
  const k = m.loop ? (m.t % m.d) / m.d : c01(m.t / m.d);
  const T = m.t;
  let P = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  let snap = 14; // how fast the statue follows its pose
  switch (m.name) {
    case 'walk':
    case 'run': {
      // marching: a bob with every stride and a roll from foot to foot (the legs are in rigs.js)
      const w = m.name === 'run' ? 11 : 7.5;
      P.y = Math.abs(Math.sin(T * w)) * 0.03;
      P.rz = Math.sin(T * w) * 0.03;
      P.rx = 0.04 * c01(T * 3);
      break;
    }
    case 'leap':
      // crouch, spring, sail rearing back, land leaning in
      P.rx = -0.45 * Math.sin(Math.PI * c01((k - 0.1) / 0.75)) + 0.15 * bump(k, 0.8, 0.9, 0.9, 1);
      P.y = -0.03 * bump(k, 0, 0.08, 0.08, 0.15);
      snap = 22;
      break;
    case 'attack':
    case 'attack2':
      P = strikePose(fig, k, m.at, false);
      snap = 30;
      break;
    case 'finish':
      P = strikePose(fig, k, m.at, true);
      snap = 30;
      break;
    case 'block':
    case 'hit':
    case 'hit2': {
      const jolt = bump(k, 0, 0.12, 0.25, 1);
      P.rx = -(m.name === 'hit2' ? 0.35 : m.name === 'hit' ? 0.25 : 0.12) * jolt;
      P.z = -0.1 * jolt;
      P.rz = 0.05 * m.side * jolt;
      P.x = Math.sin(T * 70) * 0.012 * (1 - k);
      snap = 35;
      break;
    }
    case 'dodgeL':
    case 'dodgeR': {
      const s = m.name === 'dodgeL' ? 1 : -1;
      const j = bump(k, 0, 0.25, 0.55, 1);
      P.x = 0.3 * s * j;
      P.rz = -0.2 * s * j;
      snap = 30;
      break;
    }
    case 'guard':
      P.rx = -0.06 + Math.sin(T * 2) * 0.015;
      P.rz = Math.sin(T * 1.3) * 0.02;
      break;
    case 'death': {
      // topples backwards like a felled statue, bounces once and lies still
      const f = c01(T / (m.d * 0.7));
      let a = f * f * (Math.PI / 2);
      if (T > m.d * 0.7) a = Math.PI / 2 - Math.abs(Math.sin((T - m.d * 0.7) * 14)) * 0.12 * Math.exp(-(T - m.d * 0.7) * 6);
      // pivot on the back edge of the base
      const r = fig.radius;
      P.rx = -a;
      P.z = -r + r * Math.cos(a);
      P.y = r * Math.sin(a) * 0.9;
      P.rz = 0.15 * m.side * f;
      snap = 60;
      break;
    }
    case 'cheer':
      P.y = 0.14 * Math.sin(Math.PI * c01(k / 0.6));
      P.rx = -0.12 * Math.sin(Math.PI * c01(k / 0.6));
      P.ry = 0.5 * m.side * bump(k, 0.1, 0.4, 0.6, 1);
      break;
    case 'fidget':
      P.ry = 0.2 * m.side * Math.sin(Math.PI * 2 * k);
      break;
  }
  const q = fig.pose, f = 1 - Math.exp(-dt * snap);
  for (const key in q) q[key] += (P[key] - q[key]) * f;
  fig.model.position.set(q.x, q.y, q.z);
  fig.model.rotation.set(q.rx, q.ry, q.rz, 'YXZ');
  // and the limbs: every joint eases toward this move's pose
  const J = posture(fig.type, m.name, k, T, m.at, m.side, fig.seed);
  const jf = 1 - Math.exp(-dt * Math.max(snap, 16));
  const lift = J.$pos || {};
  for (const [name, bone] of Object.entries(fig.bones)) {
    const want = J[name] || ZERO;
    const cur = fig.joints[name] || (fig.joints[name] = [0, 0, 0, 0, 0, 0]);
    for (let i = 0; i < 3; i++) cur[i] += (want[i] - cur[i]) * jf;
    bone.rotation.set(cur[0], cur[1], cur[2]);
    // joints that also move (the pawn rising out of his crouch)
    const wp = lift[name] || ZERO;
    for (let i = 0; i < 3; i++) cur[3 + i] += (wp[i] - cur[3 + i]) * jf;
    const bind = bone.userData.bind || (bone.userData.bind = bone.position.clone());
    bone.position.set(bind.x + cur[3], bind.y + cur[4], bind.z + cur[5]);
  }
  return fig.mixer;
}

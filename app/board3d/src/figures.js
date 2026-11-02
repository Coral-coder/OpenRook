// The armies: rigged, textured, animated characters from KayKit's Adventurers and Skeletons
// packs (CC0, Kay Lousberg, www.kaylousberg.com), packed by tools/pack-models.mjs.
//
// White are the living: hooded rogues (pawns), the armoured knight, the mage (bishop), the
// barbarian (rook), a crowned rogue (queen) and the crowned knight with a greatsword (king).
// Black are the dead: skeleton minions, skeleton rogues, the skeleton mage, a hulking minion
// with an axe and shield (rook), a crowned mage (queen) and the crowned warrior (king).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
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

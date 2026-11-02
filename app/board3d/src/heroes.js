// The Wizard armies: life-size statues carved from realistic-proportioned characters
// (Quaternius's Universal Base Characters and Fantasy outfits, CC0, quaternius.com), animated
// with the Universal Animation Library and packed by tools/pack-heroes.mjs.
//
// Both armies are the same sculpts, as in a real chess set: White carved in gold-veined marble,
// Black in obsidian whose cracks glow with sickly green magic.
//   pawn    a peasant footman with a short sword
//   knight  a hooded ranger with sword and shield
//   bishop  a hooded sorceress with a staff
//   rook    a hulking bare-chested titan with a great axe
//   queen   a crowned queen with a sceptre
//   king    a bearded, crowned warrior king with a greatsword
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { stoneMaterial } from './stone.js';

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

const ROSTER = {
  [PAWN]: { body: 'h_male_peasant', head: 'h_head_male', hair: ['h_hair_buzzed'], height: 1.02, right: 'sword', style: 'melee' },
  [KNIGHT]: { body: 'h_male_ranger', head: 'h_head_male', hair: ['h_hair_beard'], height: 1.16, right: 'sword', left: 'shield', style: 'melee' },
  [BISHOP]: { body: 'h_female_ranger', head: 'h_head_female', hair: [], height: 1.18, right: 'staff', style: 'caster' },
  [ROOK]: { body: 'h_hero_male', head: null, hair: ['h_hair_buzzed', 'h_hair_beard'], height: 1.3, right: 'axe', style: 'melee', bulk: 1.18 },
  [QUEEN]: { body: 'h_female_peasant', head: 'h_head_female', hair: ['h_hair_long'], height: 1.26, right: 'sceptre', style: 'caster', crown: true },
  [KING]: { body: 'h_hero_male', head: null, hair: ['h_hair_simpleparted', 'h_hair_beard'], height: 1.38, right: 'greatsword', style: 'melee', crown: true },
};

export const HERO_MODELS = ['h_anims', ...new Set(Object.values(ROSTER).flatMap((r) => [r.body, r.head, ...r.hair]).filter(Boolean))];

// ------------------------------------------------------------------ weapons, carved too
function swordGeo(len, width) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(width, len, width * 0.22), null);
  blade.position.y = len / 2 + 0.06;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, width * 1.6, 4), null);
  tip.position.y = len + 0.06 + width * 0.8;
  tip.rotation.y = Math.PI / 4;
  tip.scale.z = 0.3;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(width * 4.2, width * 0.5, width * 0.6), null);
  guard.position.y = 0.06;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.32, width * 0.32, 0.16, 8), null);
  grip.position.y = -0.02;
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(width * 0.55, 10, 8), null);
  pommel.position.y = -0.11;
  g.add(blade, tip, guard, grip, pommel);
  return g;
}
function weapon(kind) {
  let g;
  switch (kind) {
    case 'sword':
      g = swordGeo(0.62, 0.07);
      break;
    case 'greatsword':
      g = swordGeo(1.05, 0.09);
      break;
    case 'axe': {
      g = new THREE.Group();
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.25, 10), null);
      haft.position.y = 0.35;
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.12);
      shape.quadraticCurveTo(0.34, -0.3, 0.42, -0.02);
      shape.quadraticCurveTo(0.44, 0.22, 0.36, 0.42);
      shape.quadraticCurveTo(0.2, 0.18, 0, 0.14);
      const head = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }), null);
      head.position.set(0.02, 0.78, -0.02);
      const head2 = head.clone();
      head2.scale.x = -0.8;
      head2.position.x = -0.02;
      g.add(haft, head, head2);
      break;
    }
    case 'staff': {
      g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.7, 8), null);
      shaft.position.y = 0.3;
      const claw = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 12), null);
      claw.position.y = 1.2;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 2), null);
      orb.position.y = 1.2;
      orb.name = 'orb';
      g.add(shaft, claw, orb);
      break;
    }
    case 'sceptre': {
      g = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.72, 8), null);
      rod.position.y = 0.2;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 2), null);
      orb.position.y = 0.6;
      orb.name = 'orb';
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 14), null);
      ring.position.y = 0.6;
      g.add(rod, orb, ring);
      break;
    }
    case 'shield': {
      g = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 6), null);
      face.rotation.x = Math.PI / 2;
      face.scale.set(1, 1, 1.25);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), null);
      boss.position.z = 0.03;
      g.add(face, boss);
      break;
    }
  }
  g.name = 'weapon';
  return g;
}

function crown() {
  const g = new THREE.Group();
  g.name = 'crown';
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.26, 24, 1, true), null));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pt = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 6), null);
    pt.position.set(Math.cos(a) * 0.48, 0.26, Math.sin(a) * 0.48);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), null);
    gem.position.set(Math.cos(a) * 0.5, 0.0, Math.sin(a) * 0.5);
    gem.name = 'gem';
    g.add(pt, gem);
  }
  return g;
}

// ------------------------------------------------------------------ assembly
// A head or hair mesh from another file, bound to this body's skeleton by bone name.
function rebind(src, bones, parent) {
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const sk = o.skeleton;
    const mapped = sk.bones.map((b) => bones[b.name]);
    if (mapped.some((b) => !b)) return;
    const m = new THREE.SkinnedMesh(o.geometry, o.material);
    m.name = o.name;
    m.bind(new THREE.Skeleton(mapped, sk.boneInverses), o.bindMatrix);
    parent.add(m);
  });
}

// Attach a held thing to a hand so it sits in the fist: its +Y along the thumb side of the
// fist, worked out from where the fingers and thumb are in the bind pose.
function holdIn(model, bones, side, obj, size) {
  const hand = bones['hand_' + side], mid = bones['middle_01_' + side], thumb = bones['thumb_01_' + side];
  if (!hand || !mid || !thumb) return;
  model.updateMatrixWorld(true);
  const hp = hand.getWorldPosition(new THREE.Vector3());
  const fingers = mid.getWorldPosition(new THREE.Vector3()).sub(hp);
  const along = fingers.clone().normalize();
  const th = thumb.getWorldPosition(new THREE.Vector3()).sub(hp);
  const up = th.sub(along.clone().multiplyScalar(th.dot(along))).normalize(); // thumb direction, across the fist
  const side3 = new THREE.Vector3().crossVectors(along, up).normalize();
  const worldBasis = new THREE.Matrix4().makeBasis(side3, up, along.clone().negate());
  const handRot = new THREE.Quaternion();
  const handScale = new THREE.Vector3();
  hand.matrixWorld.decompose(new THREE.Vector3(), handRot, handScale);
  const local = new THREE.Quaternion().setFromRotationMatrix(worldBasis).premultiply(handRot.clone().invert());
  obj.quaternion.copy(local);
  obj.scale.setScalar(size / handScale.x);
  // grip in the middle of the palm
  const gripWorld = hp.clone().addScaledVector(fingers, 0.55);
  obj.position.copy(hand.worldToLocal(gripWorld));
  hand.add(obj);
}

export function buildHero(code, gltfs) {
  const type = code & 7, isWhite = (code & 8) === 0;
  const spec = ROSTER[type];
  const model = SkeletonUtils.clone(gltfs[spec.body].scene);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const skinParent = (() => {
    let p = null;
    model.traverse((o) => {
      if (!p && o.isSkinnedMesh) p = o.parent;
    });
    return p || model;
  })();
  if (spec.head) rebind(gltfs[spec.head].scene, bones, skinParent);
  for (const h of spec.hair) rebind(gltfs[h].scene, bones, skinParent);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  // stand it up to its rank's height
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const h = box.max.y - box.min.y || 1;
  const k = spec.height / h;
  model.scale.multiplyScalar(k);
  model.position.y -= box.min.y * k;
  if (spec.bulk) model.scale.x *= spec.bulk, model.scale.z *= spec.bulk;
  model.updateMatrixWorld(true);

  // what it holds, at the size of the statue
  const pieceH = spec.height;
  if (spec.right) holdIn(model, bones, 'r', weapon(spec.right), pieceH / 1.8);
  if (spec.left) holdIn(model, bones, 'l', weapon(spec.left), pieceH / 1.8);
  if (spec.crown && bones.Head) {
    const head = bones.Head;
    const top = new THREE.Box3().setFromObject(model, true).max.y;
    const c = crown();
    const hs = head.getWorldScale(new THREE.Vector3()).x;
    c.scale.setScalar((pieceH * 0.075) / hs);
    const hp = head.getWorldPosition(new THREE.Vector3());
    const at = new THREE.Vector3(hp.x, top - pieceH * 0.03, hp.z);
    c.position.copy(head.worldToLocal(at));
    // crowns sit level whatever way the head bone points
    const q = new THREE.Quaternion();
    head.getWorldQuaternion(q);
    c.quaternion.copy(q.invert());
    head.add(c);
  }

  // carve it
  const side = isWhite ? 'white' : 'black';
  const materials = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    let held = false;
    for (let q = o.parent; q; q = q.parent) if (q.name === 'weapon' || q.name === 'crown') held = true;
    const glow = /Eyes$|^Face\.001$/.test(o.name) || o.name === 'orb' || o.name === 'gem';
    const kind = glow ? 2 : held ? 1 : 0;
    o.material = stoneMaterial(o.material, side, kind, { scale: 7 });
    materials.push(o.material);
  });
  return { model, bones, spec, type, isWhite, materials };
}

// ------------------------------------------------------------------ animation
export function heroClipFor(fig, action) {
  const s = fig.spec.style, t = fig.type, royal = !!fig.spec.crown;
  switch (action) {
    case 'idle':
      return s === 'caster' ? 'Spell_Simple_Idle_Loop' : t === PAWN ? 'Idle_Loop' : 'Sword_Idle';
    case 'walk':
      return royal ? 'Walk_Formal_Loop' : 'Walk_Loop';
    case 'run':
      return t === KNIGHT ? 'Sprint_Loop' : 'Jog_Fwd_Loop';
    case 'leap':
      return 'Jump_Loop';
    case 'attack':
      return s === 'caster' ? 'Spell_Simple_Shoot' : 'Sword_Attack';
    case 'attack2':
      return s === 'caster' ? 'Spell_Simple_Shoot' : t === ROOK ? 'Punch_Cross' : 'Punch_Jab';
    case 'finish':
      return s === 'caster' ? 'Spell_Simple_Shoot' : 'Sword_Attack';
    case 'block':
    case 'Blocking':
    case '2H_Melee_Idle':
      return 'Sword_Idle';
    case 'dodgeL':
    case 'dodgeR':
      return 'Roll';
    case 'hit':
      return 'Hit_Chest';
    case 'hit2':
      return 'Hit_Head';
    case 'death':
      return 'Death01';
    case 'cheer':
      return 'Spell_Simple_Enter';
    case 'fidget':
      return s === 'caster' ? 'Spell_Simple_Enter' : Math.random() < 0.5 ? 'Interact' : 'Idle_Talking_Loop';
  }
  return 'Idle_Loop';
}

export const HERO_STRIKE_AT = { Sword_Attack: 0.42, Punch_Cross: 0.4, Punch_Jab: 0.35, Spell_Simple_Shoot: 0.4 };

// Packs the KayKit character models (CC0, Kay Lousberg, www.kaylousberg.com) into the small
// files the 3D board embeds: models/*.glb.
//
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 adv
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 skel
//   node tools/pack-models.mjs <dir containing adv/ and skel/>
//
// Every character shares one skeleton, so the animations are stored once (models/anims.glb)
// and the characters carry only their meshes, their texture and the weapons they hold.
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample } from '@gltf-transform/functions';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage: node tools/pack-models.mjs <dir with adv/ and skel/>');
const ADV = join(SRC, 'adv/addons/kaykit_character_pack_adventures');
const SKEL = join(SRC, 'skel/addons/kaykit_character_pack_skeletons');
const OUT = new URL('../models/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

// The clips the battles use.
const CLIPS = [
  'Idle', 'Idle_B', '2H_Melee_Idle', 'Walking_A', 'Walking_D_Skeletons', 'Running_A',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '1H_Melee_Attack_Jump_Chop', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin',
  'Block', 'Blocking', 'Block_Hit', 'Dodge_Left', 'Dodge_Right', 'Dodge_Backward', 'Hit_A', 'Hit_B',
  'Death_A', 'Death_B', 'Death_C_Skeletons', 'Spellcast_Shoot', 'Spellcast_Long', 'Spellcast_Raise',
  'Cheer', 'Taunt', 'Jump_Full_Short', 'Jump_Full_Long', 'Unarmed_Melee_Attack_Kick', 'Use_Item',
];

// Removing an animation must also free its channels and samplers, or their data stays in.
function dropAnimation(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

const size = (f) => (statSync(f).size / 1024).toFixed(0) + ' KB';

async function finish(doc, name) {
  await doc.transform(prune(), dedup(), resample(), quantize({ quantizeTexcoord: 12, quantizeNormal: 8, quantizePosition: 14 }));
  const f = join(OUT, name);
  await io.write(f, doc);
  console.log(name.padEnd(22), size(f));
}

// 1. animations only (from a skeleton, which has every clip including the skeleton-only ones)
{
  const doc = await io.read(join(SKEL, 'Characters/gltf/Skeleton_Minion.glb'));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!CLIPS.includes(a.getName())) dropAnimation(a);
  for (const n of root.listNodes()) if (n.getMesh()) n.getMesh().dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const t of root.listTextures()) t.dispose();
  await finish(doc, 'anims.glb');
}

// 2. characters: meshes, texture and the chosen weapons, no animations
const CHARACTERS = [
  ['Knight', ADV, ['1H_Sword', 'Badge_Shield', '2H_Sword']],
  ['Mage', ADV, ['2H_Staff', '1H_Wand', 'Spellbook']],
  ['Barbarian', ADV, ['2H_Axe']],
  ['Rogue', ADV, ['Knife', 'Knife_Offhand']],
  ['Rogue_Hooded', ADV, ['1H_Crossbow', 'Knife']],
  ['Skeleton_Warrior', SKEL, []],
  ['Skeleton_Mage', SKEL, []],
  ['Skeleton_Minion', SKEL, []],
  ['Skeleton_Rogue', SKEL, []],
];
for (const [name, dir, keep] of CHARACTERS) {
  const doc = await io.read(join(dir, `Characters/gltf/${name}.glb`));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) dropAnimation(a);
  // drop the props in the hand slots that this piece doesn't carry
  for (const n of root.listNodes()) {
    const parent = n.getParentNode();
    if (parent && /^handslot/.test(parent.getName()) && !keep.includes(n.getName())) n.dispose();
  }
  await finish(doc, `${name.toLowerCase()}.glb`);
}

// 3. the skeletons' weapons (separate files in their pack)
for (const w of ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_B']) {
  const doc = await io.read(join(SKEL, `Assets/gltf/${w}.gltf`));
  await finish(doc, `${w.toLowerCase()}.glb`);
}

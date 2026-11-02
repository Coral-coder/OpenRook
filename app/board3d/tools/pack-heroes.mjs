// Packs Quaternius's realistic-proportioned characters (CC0, quaternius.com) into the small
// files the 3D board embeds for the default "Wizard" armies: models/h_*.glb.
//
// Get the free [Standard] downloads of these four itch.io packs and unzip each into <dir>:
//   https://quaternius.itch.io/universal-base-characters
//   https://quaternius.itch.io/modular-character-outfits-fantasy
//   https://quaternius.itch.io/universal-animation-library
// Then shrink the textures to 512 px JPEGs into <dir>/small/<name>.jpg (any image tool), and:
//   node tools/pack-heroes.mjs <dir>
//
// Every character shares Quaternius's universal humanoid rig, so the animations are stored
// once (h_anims.glb). Outfits come without heads: the head (face, eyes, brows) is cut from
// the base character and bound to the same rig at runtime, like the hair.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage: node tools/pack-heroes.mjs <dir>');
const find = (pattern) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (pattern.test(p)) out.push(p);
    }
  };
  walk(SRC);
  if (!out.length) throw new Error('not found: ' + pattern);
  return out[0];
};
const OUT = new URL('../models/', import.meta.url).pathname;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const size = (f) => (statSync(f).size / 1024).toFixed(0) + ' KB';

// The clips the battles use (Universal Animation Library).
const CLIPS = [
  'Idle_Loop', 'Sword_Idle', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sword_Attack',
  'Punch_Cross', 'Punch_Jab', 'Spell_Simple_Shoot', 'Spell_Simple_Enter', 'Spell_Simple_Idle_Loop', 'Hit_Chest',
  'Hit_Head', 'Death01', 'Roll', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Idle_Talking_Loop', 'Interact', 'Crouch_Idle_Loop',
];

function dropAnimation(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

// Small textures; the stone shader needs only the colour (for carved detail) and the normals.
function shrinkTextures(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicRoughnessTexture(null);
    m.setOcclusionTexture(null);
    m.setEmissiveTexture(null);
  }
  for (const t of doc.getRoot().listTextures()) {
    const name = basename(t.getURI() || t.getName() || '').replace(/\.png$/i, '');
    try {
      t.setImage(readFileSync(join(SRC, 'small', name + '.jpg'))).setMimeType('image/jpeg').setURI(name + '.jpg');
    } catch {
      t.dispose();
    }
  }
}

async function finish(doc, name) {
  shrinkTextures(doc);
  await doc.transform(prune(), dedup(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const f = join(OUT, name);
  await io.write(f, doc);
  console.log(name.padEnd(22), size(f));
}

// 1. the animations, without the mannequin
{
  const doc = await io.read(find(/UAL1_Standard\.glb$/));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!CLIPS.includes(a.getName())) dropAnimation(a);
  for (const n of root.listNodes()) if (n.getMesh()) n.getMesh().dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const t of root.listTextures()) t.dispose();
  await finish(doc, 'h_anims.glb');
}

// 2. the outfits (bodies)
for (const o of ['Male_Peasant', 'Male_Ranger', 'Female_Peasant', 'Female_Ranger']) {
  await finish(await io.read(find(new RegExp(`Outfits/${o}\\.gltf$`))), `h_${o.toLowerCase()}.glb`);
}

// 3. the bare-chested heroes (titan, king) and the heads cut from them
for (const sex of ['Male', 'Female']) {
  const path = find(new RegExp(`Superhero_${sex}_FullBody\\.gltf$`));
  if (sex === 'Male') await finish(await io.read(path), 'h_hero_male.glb');
  // head: keep only the triangles bound to the head and neck
  const doc = await io.read(path);
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints().map((j) => j.getName());
  const headJ = new Set(['Head', 'neck_01'].map((n) => joints.indexOf(n)));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), idx = prim.getIndices();
      if (!J || !W || !idx) continue;
      const headness = (v) => {
        const j = J.getElement(v, []), w = W.getElement(v, []);
        let s = 0;
        for (let k = 0; k < 4; k++) if (headJ.has(j[k])) s += w[k];
        return s;
      };
      const keep = [];
      const a = idx.getArray();
      for (let i = 0; i < a.length; i += 3) {
        if (headness(a[i]) > 0.5 && headness(a[i + 1]) > 0.5 && headness(a[i + 2]) > 0.5) keep.push(a[i], a[i + 1], a[i + 2]);
      }
      idx.setArray(new Uint32Array(keep));
      compactPrimitive(prim);
    }
  }
  await finish(doc, `h_head_${sex.toLowerCase()}.glb`);
}

// 4. hair and beards
for (const h of ['Hair_Beard', 'Hair_SimpleParted', 'Hair_Long', 'Hair_Buzzed']) {
  await finish(await io.read(find(new RegExp(`Rigged to Head Bone.*/${h}\\.gltf$`))), `h_${h.toLowerCase()}.glb`);
}

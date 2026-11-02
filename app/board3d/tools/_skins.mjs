import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
for (const f of process.argv.slice(2)) { const d = await io.read(f); const r = d.getRoot();
 console.log(f.split('/').pop(), 'skins', r.listSkins().map(s=>s.listJoints().length), 'meshes', r.listMeshes().map(m=>m.getName()+':'+m.listPrimitives().map(p=>p.getAttribute('POSITION').getCount()+'/'+(p.getIndices()?.getCount()/3)).join('+')).join(' '), 'nodesWithSkin', r.listNodes().filter(n=>n.getSkin()).length, 'anims', r.listAnimations().length); }

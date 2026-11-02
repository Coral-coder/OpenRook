// Imports a Wizard Chess piece set from a Bambu Studio / MakerWorld .3mf into the game and the
// printer:
//
//   node tools/import-wizard.mjs ~/Downloads/WizardChess.zip      (the .zip or the .3mf in it)
//
// It writes
//   models/wizard_<piece>.glb        simplified meshes the 3D board embeds (npm run build)
//   ../../3d-prints/wizard-chess/*.3mf        the designer's file, byte for byte
//   ../../3d-prints/stl/piece_*.stl           the original models, exactly as published
//   ../../3d-prints/stl/board-fit/piece_*.stl the same full detail scaled to OpenRook's 20 mm
//                                             base, with the 10x3 mm magnet pocket cut in
//
// The set is the "Wizard Chess" remix by Meyerhouse on MakerWorld; see LICENSE-wizard-chess.md.
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { unzipSync } from 'fflate';
import { MeshoptSimplifier } from 'meshoptimizer';
import Module from 'manifold-3d';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE_MM = 20; // PIECE_BASE in 3d-prints/src/common.scad
const MAG_D = 10.3, MAG_H = 3.2; // PIECE_MAG_D / PIECE_MAG_H (the magnet + clearance)
// triangles kept in the game per piece (there are 32 figures on the board)
const GAME_TRIS = { pawn: 5000, rook: 9000, knight: 12000, bishop: 9000, queen: 10000, king: 12000 };

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/import-wizard.mjs <WizardChess.zip | set.3mf>');
  process.exit(1);
}

// ---- unpack (a .zip holding a .3mf, or the .3mf itself; both are zips)
let files = unzipSync(readFileSync(src));
const inner = Object.keys(files).find((f) => f.toLowerCase().endsWith('.3mf'));
const original3mf = inner ? files[inner] : readFileSync(src);
if (inner) files = unzipSync(files[inner]);

const pieceOf = (name) => {
  const n = name.toLowerCase();
  for (const p of ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king']) if (n.includes(p)) return p;
  return null;
};

// ---- read the meshes: the biggest object file of each piece
const meshes = {};
const dec = new TextDecoder();
for (const [name, data] of Object.entries(files)) {
  if (!/^3D\/.*\.model$/i.test(name) || data.length < 2000) continue;
  const piece = pieceOf(name.split('/').pop());
  if (!piece || (meshes[piece] && meshes[piece].bytes >= data.length)) continue;
  const text = dec.decode(data);
  const pos = [], idx = [];
  const vre = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;
  for (let m; (m = vre.exec(text)); ) pos.push(+m[1], +m[2], +m[3]);
  const tre = /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g;
  for (let m; (m = tre.exec(text)); ) idx.push(+m[1], +m[2], +m[3]);
  if (!idx.length) continue;
  // `raw` is the designer's mesh exactly as published; the rest works on a welded copy
  meshes[piece] = { bytes: data.length, raw: { pos: new Float32Array(pos), idx: new Uint32Array(idx) }, ...weld(pos, idx) };
}
const missing = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'].filter((p) => !meshes[p]);
if (missing.length) {
  console.error('no mesh found for: ' + missing.join(', '));
  process.exit(1);
}

// Merges vertices at the same spot (to 1 µm) and drops collapsed triangles; some exports
// repeat each vertex per triangle, which stops the simplifier from collapsing anything.
function weld(pos, idx) {
  const key = new Map();
  const remap = new Uint32Array(pos.length / 3);
  const out = [];
  for (let i = 0; i < remap.length; i++) {
    const k = Math.round(pos[i * 3] * 1000) + ',' + Math.round(pos[i * 3 + 1] * 1000) + ',' + Math.round(pos[i * 3 + 2] * 1000);
    let v = key.get(k);
    if (v === undefined) {
      v = out.length / 3;
      key.set(k, v);
      out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    remap[i] = v;
  }
  const tri = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  return { pos: new Float32Array(out), idx: new Uint32Array(tri) };
}

// ---- normalise: base centred on the origin, standing on z = 0, in millimetres
for (const m of Object.values(meshes)) {
  const p = m.pos;
  let zmin = Infinity;
  for (let i = 2; i < p.length; i += 3) zmin = Math.min(zmin, p[i]);
  // the footprint (vertices near the floor) gives the centre and the base width
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 2] > zmin + 0.6) continue;
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] -= cx;
    p[i + 1] -= cy;
    p[i + 2] -= zmin;
  }
  m.base = Math.max(x1 - x0, y1 - y0);
}
// one scale for the whole set, so the widest base (king, queen) is 20 mm and the pieces keep
// their heights relative to each other
const SCALE = BASE_MM / Math.max(...Object.values(meshes).map((m) => m.base));

for (const m of Object.values(meshes)) for (let i = 0; i < m.pos.length; i++) m.pos[i] *= SCALE;

// ---- clean solids: welded, repaired by manifold, and thinned to what a 0.4 mm nozzle can show
const wasm = await Module();
wasm.setup();
const { Manifold, Mesh } = wasm;
await MeshoptSimplifier.ready;

function compact(posIn, idx) {
  const map = new Int32Array(posIn.length / 3).fill(-1);
  const pos = [];
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    if (map[v] < 0) {
      map[v] = pos.length / 3;
      pos.push(posIn[v * 3], posIn[v * 3 + 1], posIn[v * 3 + 2]);
    }
    out[i] = map[v];
  }
  return { pos: new Float32Array(pos), idx: out };
}

const STL = new URL('../../../3d-prints/stl/', import.meta.url).pathname;
const MODELS = new URL('../models/', import.meta.url).pathname;
mkdirSync(STL + 'board-fit', { recursive: true });
// and the designer's own project file, untouched (their plates and print settings)
const ORIG = new URL('../../../3d-prints/wizard-chess/', import.meta.url).pathname;
mkdirSync(ORIG, { recursive: true });
writeFileSync(ORIG + 'Harry_Potter_chess_set_.3mf', original3mf);
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

for (const [piece, m] of Object.entries(meshes)) {
  const mesh = new Mesh({ numProp: 3, vertProperties: m.pos, triVerts: m.idx });
  mesh.merge();
  let solid = new Manifold(mesh);
  if (solid.volume() < 0) throw new Error(piece + ' is inside out');
  // some pieces (the king) are a thousand overlapping shells: fuse them into one body to print
  const shells = solid.decompose();

  // the printer, 1: the original model, every triangle exactly as the designer published it
  writeStl(STL + `piece_${piece}.stl`, m.raw.pos, m.raw.idx, 3);

  // the printer, 2: the very same triangles, only scaled to OpenRook's 20 mm base. The designer
  // already hollowed the underside (3.5 mm deep at this scale), so the 10x3 mm magnet fits as is;
  // check that, rather than cutting anything
  const pocket = Manifold.cylinder(MAG_H, MAG_D / 2, MAG_D / 2, 64);
  const clash = solid.intersect(pocket).volume();
  const fit = m.raw.pos.map((v) => v * SCALE);
  writeStl(STL + `board-fit/piece_${piece}.stl`, fit, m.raw.idx, 3);

  // the game: the shells fused into one solid (specks under 2 mm³ dropped) and simplified, so
  // the surface is one connected skin the skeleton can follow (rigs.js); y-up
  const kept = shells.filter((p) => p.volume() > 2);
  const fused = (kept.length > 1 ? Manifold.union(kept) : kept[0]).getMesh();
  const w = weld(fused.vertProperties, fused.triVerts); // manifold splits vertices along seams
  const [idx] = MeshoptSimplifier.simplify(w.idx, w.pos, 3, GAME_TRIS[piece] * 3, 0.006); // ~0.3 mm
  const c = compact(w.pos, idx);
  const ps = c.pos, is = c.idx;
  const s = { pos: ps, idx: is };
  const pos = new Float32Array(s.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    // 3MF is z-up; glTF is y-up (the figures face +z either way)
    pos[i] = s.pos[i];
    pos[i + 1] = s.pos[i + 2];
    pos[i + 2] = -s.pos[i + 1];
  }
  const doc = new Document();
  const buf = doc.createBuffer();
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(pos.length / 3 < 65536 ? Uint16Array.from(s.idx) : s.idx).setBuffer(buf));
  doc.createScene().addChild(doc.createNode('wizard_' + piece).setMesh(doc.createMesh('wizard_' + piece).addPrimitive(prim)));
  await doc.transform(quantize({ quantizePosition: 14 }));
  await io.write(MODELS + 'wizard_' + piece + '.glb', doc);
  console.log(`${piece.padEnd(6)} original ${m.raw.idx.length / 3} triangles (board-fit x${SCALE.toFixed(4)}, magnet ${clash < 0.5 ? 'fits the base recess' : 'DOES NOT FIT: ' + clash.toFixed(1) + ' mm³ in the way'}), game ${s.idx.length / 3} (${kept.length} shells fused)`);
}

function writeStl(path, v, t, np) {
  const n = t.length / 3;
  const b = Buffer.alloc(84 + n * 50);
  b.write('OpenRook wizard piece', 0);
  b.writeUInt32LE(n, 80);
  let o = 84;
  for (let i = 0; i < n; i++) {
    const a = t[i * 3] * np, c = t[i * 3 + 1] * np, d = t[i * 3 + 2] * np;
    const ux = v[c] - v[a], uy = v[c + 1] - v[a + 1], uz = v[c + 2] - v[a + 2];
    const wx = v[d] - v[a], wy = v[d + 1] - v[a + 1], wz = v[d + 2] - v[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    b.writeFloatLE(nx / l, o); b.writeFloatLE(ny / l, o + 4); b.writeFloatLE(nz / l, o + 8);
    o += 12;
    for (const q of [a, c, d]) {
      b.writeFloatLE(v[q], o); b.writeFloatLE(v[q + 1], o + 4); b.writeFloatLE(v[q + 2], o + 8);
      o += 12;
    }
    o += 2;
  }
  writeFileSync(path, b);
}

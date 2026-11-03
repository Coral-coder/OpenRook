// Where the chess set stands: a small board left on a table in one of two rooms, seen up close
// (a board square is 1 unit, about 5 cm, so the room is huge around it). The tilt-shift blur in
// post.js turns all of this into a soft, colourful, moody backdrop.
//
//   apothecary: a log cabin; shelves of jars and bottles, herbs drying from the beams, a
//               mortar and pestle, scales, candles, a fire glowing somewhere behind
//   tower:      a wizard's astronomy room at the top of a stone tower; arched windows full of
//               stars and a great moon, brass telescopes, books stacked in leaning piles,
//               an armillary sphere, star charts, a crystal ball, candles floating in the air
import * as THREE from 'three';
import { granite } from './granite.js';

const TABLE = -0.65; // the table top: the board's base stands on it

function soft(inner, outer, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// wood grain from the part's own coordinates: rings across, streaks along [axis]
function wood(c1, c2, { scale = 0.6, axis = 'x', rough = 0.7 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough });
  const u = { uA: { value: new THREE.Color(c1) }, uB: { value: new THREE.Color(c2) }, uS: { value: scale } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vW = position;');
    sh.fragmentShader = `varying vec3 vW; uniform vec3 uA, uB; uniform float uS;
      float wh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float wn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(wh(i),wh(i+vec3(1,0,0)),f.x),mix(wh(i+vec3(0,1,0)),wh(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(wh(i+vec3(0,0,1)),wh(i+vec3(1,0,1)),f.x),mix(wh(i+vec3(0,1,1)),wh(i+vec3(1,1,1)),f.x),f.y),f.z); }
      ` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec3 q = vW * uS;
        vec3 a = ${axis === 'x' ? 'q.yzx' : axis === 'y' ? 'q.xzy' : 'q'};
        float r = length(a.xy * vec2(1.0, 1.0) + vec2(wn(a * vec3(0.4,0.4,0.08)) * 3.0));
        float g = fract(r * 2.2 + wn(a * vec3(1.5,1.5,0.2)) * 0.8);
        float streak = wn(a * vec3(6.0, 6.0, 0.15));
        vec3 col = mix(uA, uB, smoothstep(0.2, 0.9, g) * 0.7 + streak * 0.3);
        diffuseColor.rgb = col;`);
  };
  m.customProgramCacheKey = () => 'openrook-wood-' + axis;
  return m;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const glow = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 });

function put(parent, geo, mat, x, y, z, ry = 0, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ------------------------------------------------------------------ props
function candle(g, x, z, h, flames, lights, light = true) {
  const wax = std(0xe9dcc2, { roughness: 0.5, emissive: 0x3a2008, emissiveIntensity: 0.4 });
  put(g, new THREE.CylinderGeometry(0.42, 0.46, h, 14), wax, x, TABLE + h / 2, z, 0, true);
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * 6.28;
    const d = put(g, new THREE.CapsuleGeometry(0.09, 0.4 + Math.random() * h * 0.4, 3, 6), wax, x + Math.cos(a) * 0.42, TABLE + h - 0.4 - Math.random() * 0.6, z + Math.sin(a) * 0.42);
    d.scale.z = 0.6;
  }
  put(g, new THREE.CylinderGeometry(0.75, 0.85, 0.15, 16), std(0x6b5a3a, { metalness: 0.7, roughness: 0.35 }), x, TABLE + 0.075, z);
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLAME, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  f.position.set(x, TABLE + h + 0.45, z);
  f.scale.set(0.55, 1.1, 1);
  g.add(f);
  flames.push({ s: f, seed: Math.random() * 10, base: 1 });
  if (light) {
    const l = new THREE.PointLight(0xffa248, 7, 26, 1.6);
    l.position.set(x, TABLE + h + 1.0, z);
    g.add(l);
    lights.push({ l, seed: Math.random() * 10, base: 7 });
  }
}
let FLAME;

function bottle(g, x, z, h, color, kind = 0) {
  const r = h * (kind === 1 ? 0.32 : 0.22);
  const pts = kind === 1
    ? [[0, 0], [r, 0], [r * 1.05, h * 0.35], [r * 0.9, h * 0.6], [r * 0.3, h * 0.75], [r * 0.25, h * 0.95], [r * 0.32, h]]
    : [[0, 0], [r, 0], [r, h * 0.62], [r * 0.4, h * 0.75], [r * 0.3, h * 0.92], [r * 0.38, h]];
  const glass = new THREE.MeshStandardMaterial({ color: 0xb8c6c4, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.1, depthWrite: false });
  put(g, new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 16), glass, x, TABLE, z);
  const fill = 0.35 + Math.random() * 0.3;
  put(g, new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * fill, 14), glow(color, 0.55), x, TABLE + (h * fill) / 2 + 0.02, z);
  put(g, new THREE.CylinderGeometry(r * 0.3, r * 0.26, h * 0.14, 8), std(0x8a6a44), x, TABLE + h + 0.02, z);
}

function book(g, x, y, z, w, h, d, color, ry = 0, rz = 0) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.set(0, ry, rz);
  g.add(b);
  put(b, new THREE.BoxGeometry(w, h, d), std(0xe6dcc0, { roughness: 0.9 }), 0, 0, 0); // pages
  const cover = std(color, { roughness: 0.75 });
  put(b, new THREE.BoxGeometry(w + 0.12, 0.1, d + 0.1), cover, 0, h / 2, 0, 0, true);
  put(b, new THREE.BoxGeometry(w + 0.12, 0.1, d + 0.1), cover, 0, -h / 2, 0);
  put(b, new THREE.BoxGeometry(0.1, h + 0.1, d + 0.1), cover, -w / 2 - 0.05, 0, 0);
  for (const s of [-0.3, 0.3]) put(b, new THREE.BoxGeometry(0.12, h + 0.14, 0.12), std(0xb48a3a, { metalness: 0.8, roughness: 0.3 }), -w / 2 - 0.06, 0, s * d);
  return b;
}
const BOOK_COLORS = [0x6b1a1a, 0x1d3b2a, 0x223a5e, 0x5a3a18, 0x3e1f4a, 0x7a5a20, 0x2d2d35, 0x8a3020];
function bookPile(g, x, z, n, ry = 0) {
  let y = TABLE;
  for (let i = 0; i < n; i++) {
    const h = 0.5 + Math.random() * 0.5;
    const w = 4 + Math.random() * 1.6, d = 5.4 + Math.random() * 1.6;
    book(g, x + (Math.random() - 0.5) * 0.6, y + h / 2 + 0.1, z + (Math.random() - 0.5) * 0.6, w, h, d, BOOK_COLORS[(Math.random() * 8) | 0], ry + (Math.random() - 0.5) * 0.5, 0);
    y += h + 0.2;
  }
}
// a shelf of books standing upright, of every height and colour
function shelfBooks(g, x0, x1, y, z, ry = 0) {
  const row = new THREE.Group();
  row.position.set(0, 0, 0);
  g.add(row);
  let x = x0;
  while (x < x1) {
    const w = 0.7 + Math.random() * 0.9, h = 4 + Math.random() * 2.6, d = 3.4 + Math.random() * 0.8;
    const lean = Math.random() < 0.12 ? (Math.random() - 0.5) * 0.4 : 0;
    const b = book(row, 0, 0, 0, d, h, w, BOOK_COLORS[(Math.random() * 8) | 0], Math.PI / 2, lean);
    b.position.set(x + w / 2, y + h / 2, z);
    x += w + 0.08;
    if (Math.random() < 0.08) x += 1.5;
  }
  row.rotation.y = ry;
  return row;
}

function plankTable(g, mat, w, d) {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const z = -d / 2 + (d / n) * (i + 0.5);
    const p = put(g, new THREE.BoxGeometry(w, 1.4, d / n - 0.12), mat, 0, TABLE - 0.7, z);
    p.rotation.x = (Math.random() - 0.5) * 0.004;
  }
}

// ------------------------------------------------------------------ the apothecary cabin
function apothecary() {
  const g = new THREE.Group();
  const flames = [], lights = [];
  const oak = wood(0x5a3a22, 0x2e1c10, { scale: 2.2 });
  const logs = wood(0x4a2e1a, 0x24160c, { scale: 1.6, axis: 'x' });
  const logsZ = wood(0x4a2e1a, 0x24160c, { scale: 1.6, axis: 'z' });
  plankTable(g, oak, 90, 60);
  // log walls
  for (let i = 0; i < 14; i++) {
    const y = TABLE - 18 + i * 3.4;
    put(g, new THREE.CylinderGeometry(1.75, 1.75, 110, 12).rotateZ(Math.PI / 2), logs, 0, y, -40);
    put(g, new THREE.CylinderGeometry(1.75, 1.75, 110, 12).rotateZ(Math.PI / 2), logs, 0, y, 46);
    put(g, new THREE.CylinderGeometry(1.75, 1.75, 90, 12).rotateX(Math.PI / 2), logsZ, -50, y, 3);
    put(g, new THREE.CylinderGeometry(1.75, 1.75, 90, 12).rotateX(Math.PI / 2), logsZ, 50, y, 3);
  }
  // beams overhead, with bundles of herbs drying
  for (const z of [-24, 24]) put(g, new THREE.BoxGeometry(110, 2.4, 2.4), logs, 0, 26, z);
  const herbCols = [0x4a6a2a, 0x6a7a30, 0x7a5a30, 0x5a3a5a, 0x3a5a2a];
  for (let i = 0; i < 26; i++) {
    const x = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 30), z = i % 2 ? -24 : 24; // never over the board
    const len = 3 + Math.random() * 4;
    put(g, new THREE.CylinderGeometry(0.03, 0.03, 26 - TABLE - len - 6, 4), std(0x8a7a5a), x, 26 - (26 - TABLE - len - 6) / 2 - 1, z);
    const h = put(g, new THREE.ConeGeometry(0.9 + Math.random() * 0.6, len, 7), std(herbCols[i % 5], { roughness: 0.95 }), x, TABLE + 6 + len / 2 + Math.random() * 4, z);
    h.rotation.x = Math.PI;
  }
  // shelves of jars and bottles on the far wall, and on the near wall for the other side
  for (const [z, ry] of [[-37.5, 0], [43.5, Math.PI]]) {
    for (let r = 0; r < 4; r++) {
      const y = TABLE + 3 + r * 7.5;
      put(g, new THREE.BoxGeometry(80, 0.6, 5), oak, 0, y, z);
      for (let i = 0; i < 18; i++) {
        const x = -38 + i * 4.4 + Math.random();
        const c = [0x8a1a1a, 0x1a7a3a, 0x2a4a9a, 0xb07a18, 0x6a2a8a, 0x2a8a8a][(Math.random() * 6) | 0];
        const jar = new THREE.Group();
        jar.position.set(x, y + 0.3 - TABLE, z);
        g.add(jar);
        if (Math.random() < 0.3) shelfBooks(jar, 0, 3.6, TABLE, 0, ry);
        else bottle(jar, 0, 0, 2.5 + Math.random() * 2.5, c, (Math.random() * 2) | 0);
      }
    }
  }
  // an apothecary's cabinet of little drawers
  const cab = new THREE.Group();
  cab.position.set(-34, 0, -12);
  g.add(cab);
  put(cab, new THREE.BoxGeometry(10, 22, 7), oak, 0, TABLE + 11, 0);
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 3; c++) {
      put(cab, new THREE.BoxGeometry(2.8, 3.1, 0.3), wood(0x6a4428, 0x3a2414, { scale: 0.9 }), -3.1 + c * 3.1, TABLE + 2.4 + r * 3.4, 3.6);
      put(cab, new THREE.SphereGeometry(0.22, 8, 6), std(0xb48a3a, { metalness: 0.8, roughness: 0.3 }), -3.1 + c * 3.1, TABLE + 2.4 + r * 3.4, 3.85);
    }
  }
  // the bench: mortar and pestle, scales, bottles, an open herbal, candles
  const stoneMat = granite('white', { grain: 2 });
  put(g, new THREE.LatheGeometry([[0, 0], [2.2, 0], [2.6, 1.6], [2.4, 2.4], [2.0, 2.4], [1.9, 1.0], [0, 0.8]].map(([a, b]) => new THREE.Vector2(a, b)), 20), stoneMat, 11, TABLE, -9, 0, true);
  const pestle = put(g, new THREE.CapsuleGeometry(0.35, 3.6, 4, 10), stoneMat, 11.6, TABLE + 3, -9, 0, true);
  pestle.rotation.z = 0.7;
  const brass = std(0xb08a40, { metalness: 0.85, roughness: 0.3 });
  const sc = new THREE.Group();
  sc.position.set(-12, TABLE, -10);
  g.add(sc);
  put(sc, new THREE.CylinderGeometry(1.2, 1.5, 0.4, 16), brass, 0, 0.2, 0, 0, true);
  put(sc, new THREE.CylinderGeometry(0.12, 0.12, 6, 8), brass, 0, 3.2, 0, 0, true);
  put(sc, new THREE.BoxGeometry(7, 0.18, 0.18), brass, 0, 6.2, 0, 0, true);
  for (const s of [-3.3, 3.3]) {
    put(sc, new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4), brass, s, 4.9, 0);
    put(sc, new THREE.SphereGeometry(1.3, 16, 8, 0, 6.28, Math.PI / 2, Math.PI / 2), brass, s, 4.0, 0, 0, true);
  }
  for (const [x, z, h, c, k] of [[8, 7, 3.4, 0x8a1a1a, 1], [9.6, 9, 2.4, 0x1a8a4a, 0], [-9, 8, 4, 0x3a5aba, 0], [-10.5, 6, 2.6, 0xc08a20, 1], [13, -3, 2.8, 0x8a3ab0, 1]]) bottle(g, x, z, h, c, k);
  const herbal = book(g, -1, TABLE + 0.25, -11, 9, 0.4, 6.5, 0x5a2a14, 0.15);
  herbal.scale.y = 0.8;
  for (const [x, z, h] of [[-8, -6, 4.5], [-6.6, -7.6, 3.2], [9, 4, 5.5], [7.6, 5.4, 3.8], [6, -10, 3]]) candle(g, x, z, h, flames, lights, h > 3.4);
  // scattered leaves on the table
  for (let i = 0; i < 30; i++) {
    const l = put(g, new THREE.CircleGeometry(0.35, 5), std(herbCols[i % 5], { side: THREE.DoubleSide }), (Math.random() - 0.5) * 24, TABLE + 0.02, 6 + Math.random() * 8);
    l.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    l.scale.set(1, 2.2, 1);
  }
  // a fire glowing somewhere off to the side, and moonlight through a small window
  const fire = new THREE.PointLight(0xff6a20, 120, 80, 1.5);
  fire.position.set(45, 2, 20);
  g.add(fire);
  lights.push({ l: fire, seed: 3, base: 120 });
  const moon = new THREE.DirectionalLight(0x6f86c8, 0.5);
  moon.position.set(-20, 30, -30);
  g.add(moon);
  return { g, flames, lights, fog: [0x1a120c, 0.012], bg: 0x120c08, hemi: [0xffd6a0, 0x2a1a10, 0.45], key: 0xffe8cc };
}

// ------------------------------------------------------------------ the astronomy tower
function tower() {
  const g = new THREE.Group();
  const flames = [], lights = [];
  const mahogany = wood(0x5a2418, 0x2a0e08, { scale: 2.4 });
  plankTable(g, mahogany, 90, 60);
  // round stone walls
  const wallMat = granite('black', { grain: 0.25 });
  wallMat.userData.uniforms.uTint.value.setRGB(0.2, 0.2, 0.24);
  wallMat.userData.uniforms.uTint2.value.setRGB(0.32, 0.31, 0.36);
  const R = 52;
  const wall = new THREE.CylinderGeometry(R, R, 120, 48, 1, true);
  put(g, wall, new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.9, side: THREE.BackSide }), 0, 30, 0);
  // block courses
  for (let i = 0; i < 18; i++) put(g, new THREE.TorusGeometry(R - 0.3, 0.25, 4, 64).rotateX(Math.PI / 2), wallMat, 0, TABLE - 20 + i * 5, 0);
  // tall arched windows full of stars, and the moon
  const starTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#0a0f2e');
    gr.addColorStop(1, '#2a1a4a');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(255,255,${200 + Math.random() * 55},${0.4 + Math.random() * 0.6})`;
      const s = Math.random() < 0.08 ? 2.2 : 1.1;
      x.fillRect(Math.random() * 256, Math.random() * 512, s, s);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const winShape = new THREE.Shape();
  winShape.moveTo(-6, 0);
  winShape.lineTo(-6, 18);
  winShape.absarc(0, 18, 6, Math.PI, 0, true);
  winShape.lineTo(6, 0);
  const winGeo = new THREE.ShapeGeometry(winShape, 12);
  const pos = winGeo.attributes.position, uv = winGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 6) / 12, pos.getY(i) / 24);
  for (const a of [-2.3, -1.3, -0.3, 0.7, 1.7, 2.7]) {
    const w = put(g, winGeo, new THREE.MeshBasicMaterial({ map: starTex, fog: false }), Math.sin(a) * (R - 0.5), TABLE + 6, -Math.cos(a) * (R - 0.5), -a);
    w.rotation.y = Math.PI - a;
    w.lookAt(0, TABLE + 6, 0);
    // mullion and frame
    for (const dx of [-6, 0, 6]) {
      const f = put(g, new THREE.BoxGeometry(0.8, 24, 1.2), wallMat, 0, 0, 0);
      f.position.copy(w.position).add(new THREE.Vector3(Math.cos(a) * dx, 12, Math.sin(a) * dx));
      f.lookAt(0, f.position.y, 0);
    }
  }
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf3ecd4, fog: false }));
  moonMesh.position.set(Math.sin(0.7) * (R + 30), TABLE + 26, -Math.cos(0.7) * (R + 30));
  g.add(moonMesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft('rgba(200,210,255,0.6)', 'rgba(120,140,255,0)'), transparent: true, depthWrite: false, fog: false }));
  halo.position.copy(moonMesh.position);
  halo.scale.setScalar(34);
  g.add(halo);
  const moonLight = new THREE.DirectionalLight(0x8aa0ff, 1.1);
  moonLight.position.set(moonMesh.position.x, 40, moonMesh.position.z);
  g.add(moonLight);
  // a great brass telescope on a tripod, aimed at the window
  const brass = std(0xc0943c, { metalness: 0.9, roughness: 0.28 });
  const dark = std(0x2a2018, { metalness: 0.5, roughness: 0.4 });
  const scope = new THREE.Group();
  scope.position.set(24, TABLE, -26);
  g.add(scope);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28;
    const leg = put(scope, new THREE.CylinderGeometry(0.35, 0.45, 26, 8), mahogany, Math.cos(a) * 4, 12, Math.sin(a) * 4, 0, true);
    leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
  }
  const tube = new THREE.Group();
  tube.position.set(0, 25, 0);
  tube.rotation.set(-0.55, 0.4, 0);
  scope.add(tube);
  const segs = [[1.6, 1.4, 8], [1.4, 1.25, 7], [1.25, 1.1, 6], [1.1, 0.9, 4]];
  let z = -6;
  for (const [r1, r2, l] of segs) {
    put(tube, new THREE.CylinderGeometry(r2, r1, l, 20).rotateX(Math.PI / 2), brass, 0, 0, z + l / 2, 0, true);
    put(tube, new THREE.TorusGeometry(r1 + 0.08, 0.18, 6, 20), dark, 0, 0, z, 0);
    z += l;
  }
  // a small one on the table, and the books, charts and instruments
  const small = new THREE.Group();
  small.position.set(-13, TABLE + 2.2, 7);
  small.rotation.set(0, 0.8, -0.25);
  g.add(small);
  put(small, new THREE.CylinderGeometry(0.5, 0.65, 9, 14).rotateZ(Math.PI / 2), brass, 0, 0, 0, 0, true);
  put(small, new THREE.CylinderGeometry(0.15, 0.2, 2.4, 6), mahogany, -1.5, -1.2, 0);
  put(small, new THREE.CylinderGeometry(0.15, 0.2, 2.4, 6), mahogany, 1.5, -1.2, 0);
  bookPile(g, -12, -9, 6, 0.3);
  bookPile(g, -16, -2, 4, -0.2);
  bookPile(g, 14, -11, 7, 0.9);
  bookPile(g, 16, 8, 3, 0.1);
  // armillary sphere
  const arm = new THREE.Group();
  arm.position.set(11, TABLE, 9);
  g.add(arm);
  put(arm, new THREE.CylinderGeometry(1.0, 1.6, 0.6, 16), brass, 0, 0.3, 0, 0, true);
  put(arm, new THREE.CylinderGeometry(0.15, 0.15, 3, 8), brass, 0, 2, 0);
  const rings = new THREE.Group();
  rings.position.y = 6;
  arm.add(rings);
  for (const [rx, rz, r] of [[0, 0, 3], [Math.PI / 2, 0, 3], [Math.PI / 2, 0.41, 2.7], [0.4, Math.PI / 2, 2.4]]) {
    const ring = put(rings, new THREE.TorusGeometry(r, 0.09, 6, 48), brass, 0, 0, 0, 0, true);
    ring.rotation.set(rx, 0, rz);
  }
  put(rings, new THREE.SphereGeometry(0.7, 16, 12), glow(0xffb040, 0.6), 0, 0, 0);
  // a crystal ball on a stand, glowing
  put(g, new THREE.CylinderGeometry(1.4, 1.9, 1.0, 16), dark, -10, TABLE + 0.5, 12, 0, true);
  const ball = put(g, new THREE.SphereGeometry(2, 24, 18), new THREE.MeshStandardMaterial({ color: 0x8a6aff, emissive: 0x5a30ff, emissiveIntensity: 0.7, transparent: true, opacity: 0.75, roughness: 0.05 }), -10, TABLE + 3, 12);
  const ballLight = new THREE.PointLight(0x7a5aff, 14, 20, 1.6);
  ballLight.position.copy(ball.position);
  g.add(ballLight);
  lights.push({ l: ballLight, seed: 7, base: 14, slow: true });
  // star charts spread on the table
  const chartTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#d9c9a0';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#5a3a1a';
    x.lineWidth = 2;
    for (const r of [40, 80, 115]) {
      x.beginPath();
      x.arc(128, 128, r, 0, 6.28);
      x.stroke();
    }
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.moveTo(128, 128);
      x.lineTo(128 + Math.cos(i * 0.52) * 120, 128 + Math.sin(i * 0.52) * 120);
      x.stroke();
    }
    x.fillStyle = '#2a1a0a';
    for (let i = 0; i < 70; i++) x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const [x, z, r] of [[-3, 10.5, 0.2], [5, -10.5, -0.3], [-15, 12, 1.1]]) {
    const p = put(g, new THREE.PlaneGeometry(9, 7), std(0xffffff, { map: chartTex, roughness: 0.9 }), x, TABLE + 0.03, z);
    p.rotation.set(-Math.PI / 2, 0, r);
  }
  // candles on the table, and candles floating in the air above
  for (const [x, z, h] of [[-8, -7, 4], [8, -6, 5.5], [9.5, 4.5, 3.4], [-7.5, 6, 3.6]]) candle(g, x, z, h, flames, lights, h > 3.5);
  const floating = [];
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const a = Math.random() * 6.28, r = 24 + Math.random() * 18; // around the room, never over the board
    c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(c);
    const fl = [];
    candle(c, 0, 0, 3 + Math.random() * 2, fl, lights, i % 4 === 0);
    flames.push(...fl);
    floating.push({ c, base: 14 + Math.random() * 16, seed: Math.random() * 10 });
  }
  return { g, flames, lights, floating, fog: [0x14122a, 0.01], bg: 0x0a0a1a, hemi: [0x9aa8ff, 0x24140c, 0.55], key: 0xc8d4ff };
}

// ------------------------------------------------------------------ the rooms
export function setupAtmosphere(scene) {
  FLAME = soft('rgba(255,236,190,1)', 'rgba(255,110,20,0)');
  const rooms = { apothecary: apothecary(), tower: tower() };
  let room = null;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
  scene.add(hemi);
  // dust motes drifting in the candlelight
  const N = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const drift = [];
  for (let i = 0; i < N; i++) {
    pos.set([(Math.random() - 0.5) * 30, Math.random() * 14, (Math.random() - 0.5) * 30], i * 3);
    drift.push([Math.random() * 6, 0.05 + Math.random() * 0.12]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.08, map: soft('rgba(255,240,210,0.9)', 'rgba(255,240,210,0)'), color: 0xffe0b0,
    transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);

  const api = {
    setRoom(name) {
      const r = rooms[name] || rooms.apothecary;
      if (r === room) return;
      if (room) scene.remove(room.g);
      room = r;
      scene.add(r.g);
      scene.background = new THREE.Color(r.bg);
      scene.fog = new THREE.FogExp2(r.fog[0], r.fog[1]);
      hemi.color.set(r.hemi[0]);
      hemi.groundColor.set(r.hemi[1]);
      hemi.intensity = r.hemi[2];
      api.key = r.key;
    },
    update(dt, t) {
      if (!room) return;
      for (const f of room.flames) {
        const k = 0.85 + 0.25 * Math.sin(t * 11 + f.seed) * Math.sin(t * 6.7 + f.seed * 2);
        f.s.scale.set(0.55 * k, 1.1 * k, 1);
      }
      for (const L of room.lights) {
        const k = L.slow ? 0.8 + 0.2 * Math.sin(t * 1.3) : 0.82 + 0.18 * Math.sin(t * 13 + L.seed) * Math.sin(t * 7.3 + L.seed * 2);
        L.l.intensity = L.base * k;
      }
      for (const c of room.floating || []) c.c.position.y = c.base + Math.sin(t * 0.6 + c.seed) * 0.8;
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const [ph, sp] = drift[i];
        p[i * 3] += Math.sin(t * 0.2 + ph) * sp * dt;
        p[i * 3 + 1] += Math.sin(t * 0.13 + ph * 2) * sp * dt * 0.5 + sp * dt * 0.2;
        p[i * 3 + 2] += Math.cos(t * 0.17 + ph) * sp * dt;
        if (p[i * 3 + 1] > 14) p[i * 3 + 1] = 0;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
  api.setRoom('apothecary');
  return api;
}

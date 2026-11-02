// OpenRook 3D battle board.
//
// The app (Flutter) owns the chess: it sends the position, the last move, the selection and the
// legal targets; this page only shows them. When a move arrives it is acted out: the piece
// turns, walks (or gallops and leaps), and a capture is a fight that ends with the victim
// shattering into stone rubble. Taps on squares go back to the app.
//
// Bridge: the app calls window.openrook.receive(json). This page posts JSON strings back
// through window.OpenRook.postMessage (WebView channel) or window.parent.postMessage (web).
import * as THREE from 'three';
import { buildFigure, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './figures.js';

// ------------------------------------------------------------------ bridge
function send(msg) {
  const s = JSON.stringify(msg);
  if (window.OpenRook && window.OpenRook.postMessage) window.OpenRook.postMessage(s);
  else if (window.parent !== window) window.parent.postMessage({ openrook: s }, '*');
}

// ------------------------------------------------------------------ renderer and scene
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15110e);
scene.fog = new THREE.Fog(0x15110e, 14, 30);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2018, 0.75));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
sun.position.set(-5, 11, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -6;
sun.shadow.camera.right = 6;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -6;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9db8ff, 0.9);
rim.position.set(6, 6, -8);
scene.add(rim);
const flash = new THREE.PointLight(0xffd59a, 0, 6, 1.6);
scene.add(flash);
const checkLight = new THREE.PointLight(0xff3020, 0, 2.5, 2);
scene.add(checkLight);

// ------------------------------------------------------------------ the board
const SQ_TOP = 0.0; // pieces stand on y = 0
const squareMeshes = [];
const sqLight = new THREE.MeshStandardMaterial({ color: 0xd8cfbe, roughness: 0.35 });
const sqDark = new THREE.MeshStandardMaterial({ color: 0x4b4038, roughness: 0.32 });
{
  const g = new THREE.BoxGeometry(1, 0.16, 1);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 1;
      const m = new THREE.Mesh(g, (light ? sqLight : sqDark).clone());
      const tone = 0.94 + (((f * 73 + r * 151) % 13) / 13) * 0.1;
      m.material.color.multiplyScalar(tone);
      m.position.set(f - 3.5, SQ_TOP - 0.08, 3.5 - r);
      m.receiveShadow = true;
      m.userData.square = r * 8 + f;
      scene.add(m);
      squareMeshes.push(m);
    }
  }
  // carved frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2d241d, roughness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.35, metalness: 0.7 });
  const side = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), frameMat);
    m.position.set(x, -0.1, z);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
  };
  side(9.0, 0.5, 0, 4.25);
  side(9.0, 0.5, 0, -4.25);
  side(0.5, 8.0, 4.25, 0);
  side(0.5, 8.0, -4.25, 0);
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(8.12, 0.02, 8.12), trimMat);
  inlay.position.y = -0.165;
  scene.add(inlay);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.4, 9.6), frameMat);
  plinth.position.y = -0.45;
  plinth.receiveShadow = true;
  scene.add(plinth);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x1c1612, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.65;
  floor.receiveShadow = true;
  scene.add(floor);
  // coordinates on the frame
  const label = (text, x, z) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c9a66b';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.055, z);
    scene.add(m);
    return m;
  };
  window.__labels = [];
  for (let i = 0; i < 8; i++) {
    window.__labels.push(label('abcdefgh'[i], i - 3.5, 4.25), label('abcdefgh'[i], i - 3.5, -4.25));
    window.__labels.push(label(String(i + 1), -4.25, 3.5 - i), label(String(i + 1), 4.25, 3.5 - i));
  }
}

const sqPos = (sq) => new THREE.Vector3((sq & 7) - 3.5, SQ_TOP, 3.5 - (sq >> 3));

// highlight overlays
const overlayGeo = new THREE.PlaneGeometry(0.98, 0.98);
const dotGeo = new THREE.CircleGeometry(0.14, 24);
const ringGeo = new THREE.RingGeometry(0.36, 0.46, 32);
const overlays = new THREE.Group();
scene.add(overlays);
const omat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
const MAT_LAST = omat(0xe0b84a, 0.38), MAT_SEL = omat(0x58b368, 0.55), MAT_DOT = omat(0x58b368, 0.75),
  MAT_CAP = omat(0xe0503a, 0.8), MAT_BAD = omat(0xff2a2a, 0.5);
function flat(geo, mat, sq, y = 0.004) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.copy(sqPos(sq)).setY(y);
  overlays.add(m);
}

// ------------------------------------------------------------------ pieces
const pieces = new Map(); // square -> piece {fig, code, sq, facing}
const homeFacing = (code) => ((code & 8) === 0 ? Math.PI : 0); // white faces -z (towards black)

function place(code, sq) {
  const fig = buildFigure(code);
  fig.group.position.copy(sqPos(sq));
  fig.group.rotation.y = homeFacing(code);
  scene.add(fig.group);
  const p = { fig, code, sq, seed: Math.random() * 100, walk: 0, moving: false };
  pieces.set(sq, p);
  return p;
}

function removePiece(p) {
  scene.remove(p.fig.group);
}

// ------------------------------------------------------------------ state from the app
let state = { board: new Array(64).fill(0), ply: -1, flipped: false, selected: -1, targets: [], captureTargets: [], mismatch: [], check: -1, mated: -1 };
let shown = new Array(64).fill(0); // codes of the pieces currently on the 3D board (after animations)
const queue = []; // moves waiting to be acted out
let current = null; // the move being acted out

function syncTo(board) {
  // Make the 3D board match `board` instantly (no animation).
  for (let sq = 0; sq < 64; sq++) {
    const p = pieces.get(sq);
    if (p && p.code !== board[sq]) {
      removePiece(p);
      pieces.delete(sq);
    }
    if (board[sq] && !pieces.get(sq)) place(board[sq], sq);
  }
  shown = board.slice();
}

function receive(json) {
  const msg = typeof json === 'string' ? JSON.parse(json) : json;
  if (msg.type !== 'state') return;
  const prevPly = state.ply;
  const prev = state.board;
  state = msg;
  if (prevPly >= 0 && msg.ply === prevPly + 1 && msg.last && prev[msg.last.from]) {
    queue.push({ before: prev.slice(), after: msg.board.slice(), m: msg.last });
  } else if (msg.ply !== prevPly || prevPly < 0) {
    queue.length = 0;
    if (current) finishCurrent();
    syncTo(msg.board);
    matedDone = -1;
  }
  setCamera(msg.flipped);
  drawOverlays();
}
window.openrook = { receive };
// On the web the app is the parent page and talks through postMessage.
window.addEventListener('message', (e) => {
  if (e.data && typeof e.data.openrookIn === 'string') receive(e.data.openrookIn);
});

function drawOverlays() {
  while (overlays.children.length) overlays.remove(overlays.children[0]);
  if (current || queue.length) return;
  const l = state.last;
  if (l) {
    flat(overlayGeo, MAT_LAST, l.from);
    flat(overlayGeo, MAT_LAST, l.to);
  }
  if (state.selected >= 0) flat(overlayGeo, MAT_SEL, state.selected);
  for (const t of state.targets || []) flat(dotGeo, MAT_DOT, t, 0.006);
  for (const t of state.captureTargets || []) flat(ringGeo, MAT_CAP, t, 0.006);
  for (const t of state.mismatch || []) flat(overlayGeo, MAT_BAD, t, 0.008);
}

// ------------------------------------------------------------------ camera
let azimuth = 0, elevation = 0.82, azTarget = 0, userAz = 0, userEl = 0, flippedNow = false;
function setCamera(flipped) {
  if (flipped !== flippedNow) {
    flippedNow = flipped;
    azTarget = flipped ? Math.PI : 0;
  }
}
function fitCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fitCamera);
fitCamera();

let shake = 0;
function updateCamera(dt) {
  azimuth += (azTarget + userAz - azimuth) * Math.min(1, dt * 4);
  const el = Math.min(1.35, Math.max(0.45, elevation + userEl));
  // distance so the whole board fits, whatever the aspect ratio
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const needH = 4.75 / Math.tan(halfFov);
  const needW = 4.75 / (Math.tan(halfFov) * camera.aspect);
  const dist = Math.max(needH, needW) * 0.98;
  const target = new THREE.Vector3(0, -0.2, 0.25 * Math.cos(azimuth));
  camera.position.set(Math.sin(azimuth) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(azimuth) * Math.cos(el) * dist);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 0.9);
  }
  camera.lookAt(target);
  // labels always read the right way up for the player
  for (const l of window.__labels) l.rotation.z = azimuth;
}

// ------------------------------------------------------------------ input: tap a square, drag to look around
let down = null;
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, az: userAz, el: userEl, moved: false };
});
window.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (Math.abs(dx) + Math.abs(dy) > 8) down.moved = true;
  if (down.moved) {
    userAz = Math.max(-1.0, Math.min(1.0, down.az - dx * 0.006));
    userEl = Math.max(-0.45, Math.min(0.4, down.el + dy * 0.004));
  }
});
window.addEventListener('pointerup', (e) => {
  if (!down) return;
  const wasTap = !down.moved;
  down = null;
  if (!wasTap) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // pieces first (they stand above their squares), then the squares
  const figs = [];
  for (const p of pieces.values()) figs.push(p.fig.group);
  const hitFig = ray.intersectObjects(figs, true)[0];
  if (hitFig) {
    for (const p of pieces.values()) {
      let o = hitFig.object;
      while (o && o !== p.fig.group) o = o.parent;
      if (o) return send({ type: 'tap', square: p.sq });
    }
  }
  const hit = ray.intersectObjects(squareMeshes)[0];
  if (hit) send({ type: 'tap', square: hit.object.userData.square });
});
renderer.domElement.addEventListener('dblclick', () => {
  userAz = 0;
  userEl = 0;
});

// ------------------------------------------------------------------ rubble
const shards = [];
const shardGeos = [new THREE.TetrahedronGeometry(1), new THREE.DodecahedronGeometry(1, 0), new THREE.BoxGeometry(1.2, 0.8, 1)];
const dustTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const puffs = [];

function shatter(p, from, power = 1) {
  // Every visible part of the figure bursts into chunks of its own material.
  const fig = p.fig;
  fig.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  fig.group.traverse((o) => {
    if (!o.isMesh) return;
    box.setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const vol = Math.max(0.0005, size.x * size.y * size.z);
    const n = Math.min(14, Math.max(2, Math.round(vol * 900)));
    box.getCenter(center);
    for (let i = 0; i < n; i++) {
      const s = 0.025 + Math.random() * 0.05;
      const m = new THREE.Mesh(shardGeos[(Math.random() * 3) | 0], o.material);
      m.scale.setScalar(s);
      m.castShadow = true;
      m.position.set(
        box.min.x + Math.random() * size.x,
        box.min.y + Math.random() * size.y,
        box.min.z + Math.random() * size.z);
      const out = m.position.clone().sub(from).setY(0).normalize();
      const sp = (0.8 + Math.random() * 2.2) * power;
      scene.add(m);
      shards.push({
        m, s,
        v: new THREE.Vector3(out.x * sp + (Math.random() - 0.5), 1.5 + Math.random() * 3 * power, out.z * sp + (Math.random() - 0.5)),
        w: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7),
        age: 0,
      });
    }
  });
  removePiece(p);
  // dust
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0xcfc3ae, transparent: true, opacity: 0.55, depthWrite: false }));
    sp.position.copy(fig.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4));
    sp.scale.setScalar(0.3);
    scene.add(sp);
    puffs.push({ sp, v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2), age: 0 });
  }
  flash.position.copy(fig.group.position).setY(0.7);
  flash.intensity = 30 * power;
  shake = 0.12 * power;
  send({ type: 'impact', heavy: power > 1.05 });
}

function updateRubble(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.age += dt;
    s.v.y -= 11 * dt;
    s.m.position.addScaledVector(s.v, dt);
    const floor = s.s * 0.6;
    const onBoard = Math.abs(s.m.position.x) < 4.5 && Math.abs(s.m.position.z) < 4.5;
    const groundY = onBoard ? floor : -0.6 + floor;
    if (s.m.position.y < groundY) {
      s.m.position.y = groundY;
      if (s.v.y < -0.5) {
        s.v.y *= -0.3;
      } else {
        s.v.y = 0;
      }
      s.v.x *= 0.6;
      s.v.z *= 0.6;
      s.w.multiplyScalar(0.6);
    }
    s.m.rotation.x += s.w.x * dt;
    s.m.rotation.y += s.w.y * dt;
    s.m.rotation.z += s.w.z * dt;
    if (s.age > 2.6) s.m.scale.setScalar(s.s * Math.max(0, 1 - (s.age - 2.6) / 0.8));
    if (s.age > 3.4) {
      scene.remove(s.m);
      shards.splice(i, 1);
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.age += dt;
    p.sp.position.addScaledVector(p.v, dt);
    p.sp.scale.setScalar(0.3 + p.age * 1.4);
    p.sp.material.opacity = Math.max(0, 0.55 * (1 - p.age / 1.3));
    if (p.age > 1.3) {
      scene.remove(p.sp);
      puffs.splice(i, 1);
    }
  }
  flash.intensity = Math.max(0, flash.intensity - dt * 90);
}

// sparkles for promotion
const sparks = [];
function sparkle(pos, color = 0xffe08a) {
  for (let i = 0; i < 40; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(pos).add(new THREE.Vector3(0, 0.2 + Math.random() * 0.6, 0));
    sp.scale.setScalar(0.08 + Math.random() * 0.08);
    scene.add(sp);
    const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.8;
    sparks.push({ sp, v: new THREE.Vector3(Math.cos(a) * r, 0.6 + Math.random() * 1.5, Math.sin(a) * r), age: 0 });
  }
  flash.position.copy(pos).setY(0.8);
  flash.color.set(color);
  flash.intensity = 25;
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.age += dt;
    s.v.y -= 1.5 * dt;
    s.sp.position.addScaledVector(s.v, dt);
    s.sp.material.opacity = Math.max(0, 1 - s.age / 1.4);
    if (s.age > 1.4) {
      scene.remove(s.sp);
      sparks.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------ animation of the figures
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
function turnToward(cur, target, k) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * k;
}

// Idle and walking poses. walk: 0 = standing, >0 = walking with phase p.walkPhase.
function pose(p, t, walk, attack) {
  const parts = p.fig.parts;
  const type = p.fig.type;
  const ph = p.walkPhase || 0;
  const breathe = Math.sin(t * 1.6 + p.seed) * 0.5 + 0.5;
  if (type === KNIGHT) {
    // gallop: front and back legs in alternating pairs, body pitching
    const g = Math.sin(ph * 2);
    parts.legs[0].rotation.x = walk * g * 0.9 + 0.05 * Math.sin(t + p.seed);
    parts.legs[1].rotation.x = walk * Math.sin(ph * 2 + 0.6) * 0.9;
    parts.legs[2].rotation.x = walk * -g * 0.8;
    parts.legs[3].rotation.x = walk * -Math.sin(ph * 2 + 0.6) * 0.8;
    parts.body.rotation.x = walk * Math.sin(ph * 2) * 0.12 - attack * 0.6;
    parts.body.position.y = 0.36 + walk * Math.abs(Math.sin(ph * 2)) * 0.05 + attack * 0.12;
    parts.neck.rotation.x = Math.sin(t * 1.3 + p.seed) * 0.05 - walk * 0.15 + attack * 0.3;
    parts.tail.rotation.x = Math.sin(t * 2 + p.seed) * 0.15 + walk * 0.5;
    parts.tail.rotation.z = Math.sin(t * 1.7 + p.seed) * 0.25;
    parts.armR.rotation.x = -attack * 0.9;
    return;
  }
  if (type === ROOK) {
    parts.legL.rotation.x = walk * Math.sin(ph) * 0.7;
    parts.legR.rotation.x = -walk * Math.sin(ph) * 0.7;
    parts.body.rotation.z = walk * Math.sin(ph) * 0.12;
    parts.body.position.y = 0.17 + walk * Math.abs(Math.cos(ph)) * 0.03 + breathe * 0.005;
    // slam: both fists up, then down
    const up = attack < 0.6 ? attack / 0.6 : 1 - (attack - 0.6) / 0.4;
    parts.armL.rotation.x = -up * 2.6 + walk * Math.sin(ph) * 0.4;
    parts.armR.rotation.x = -up * 2.6 - walk * Math.sin(ph) * 0.4;
    parts.armL.rotation.z = -0.15;
    parts.armR.rotation.z = 0.15;
    return;
  }
  // humans
  const robed = !!parts.robe;
  if (!robed) {
    parts.legL.rotation.x = walk * Math.sin(ph) * 0.65;
    parts.legR.rotation.x = -walk * Math.sin(ph) * 0.65;
  } else {
    parts.body.rotation.z = walk * Math.sin(ph) * 0.05;
    if (parts.robe) parts.robe.rotation.z = walk * Math.sin(ph) * 0.04;
  }
  parts.body.position.y = (robed ? 0.075 + 0.3 * (type === KING ? 1.12 : type === QUEEN ? 1.05 : 1) : 0.075 + 0.3 * 0.92) +
    walk * Math.abs(Math.cos(ph)) * 0.025 + breathe * 0.006;
  parts.body.rotation.x = walk * 0.08 - (attack > 0 && attack < 0.5 ? attack * 0.3 : 0) + (attack >= 0.5 ? (1 - attack) * 0.25 : 0);
  parts.head.rotation.y = Math.sin(t * 0.5 + p.seed) * 0.25 * (1 - walk);
  parts.armL.rotation.x = -walk * Math.sin(ph) * 0.45 + Math.sin(t * 1.6 + p.seed) * 0.03;
  parts.armL.rotation.z = -0.12;
  // weapon arm: carried, raised for the wind-up, brought down hard
  let rx;
  if (attack <= 0) rx = walk * Math.sin(ph) * 0.3 - 0.35;
  else if (attack < 0.5) rx = lerp(-0.35, -2.7, ease(attack / 0.5));
  else if (attack < 0.65) rx = lerp(-2.7, 0.3, (attack - 0.5) / 0.15);
  else rx = lerp(0.3, -0.35, (attack - 0.65) / 0.35);
  if (type === PAWN) {
    // spear: a thrust rather than a chop
    const k = attack <= 0 ? 0 : attack < 0.5 ? -ease(attack / 0.5) : attack < 0.65 ? lerp(-1, 1.2, (attack - 0.5) / 0.15) : lerp(1.2, 0, (attack - 0.65) / 0.35);
    parts.armR.rotation.x = -1.1 + walk * Math.sin(ph) * 0.15 - k * 0.5;
    if (parts.weapon) parts.weapon.rotation.x = 1.25;
    parts.armR.position.z = k * 0.06;
  } else {
    parts.armR.rotation.x = rx;
  }
  parts.armR.rotation.z = 0.12;
  if (parts.cape) parts.cape.rotation.x = walk * 0.25 + Math.sin(t * 2 + p.seed) * 0.02;
}

function recoil(p, k, t) {
  // the victim braces and trembles before the blow lands
  const parts = p.fig.parts;
  parts.inner.rotation.x = -k * 0.25;
  parts.inner.position.x = Math.sin(t * 60) * 0.012 * k;
}

// ------------------------------------------------------------------ acting out a move
function startMove(job) {
  const { m } = job;
  const mover = pieces.get(m.from);
  if (!mover) {
    syncTo(job.after);
    return null;
  }
  const from = sqPos(m.from), to = sqPos(m.to);
  const cap = m.cap >= 0 ? pieces.get(m.cap) : null;
  const capPos = m.cap >= 0 ? sqPos(m.cap) : null;
  const dist = from.distanceTo(capPos || to);
  const walkTime = Math.max(0.75, dist * 0.42);
  const act = {
    job, mover, from, to, cap, capPos, t: 0,
    knight: mover.fig.type === KNIGHT,
    phases: [],
    rook: null,
  };
  pieces.delete(m.from);
  const face = angleTo(from, capPos || to);
  act.phases.push({ name: 'turn', d: 0.25, face });
  if (cap) {
    const dir = capPos.clone().sub(from).normalize();
    act.approach = capPos.clone().addScaledVector(dir, -0.55);
    act.phases.push({ name: 'walk', d: walkTime, a: from, b: act.approach });
    act.phases.push({ name: 'attack', d: 0.85 });
    act.phases.push({ name: 'walk', d: 0.5, a: act.approach, b: to, settle: true });
  } else {
    act.phases.push({ name: 'walk', d: walkTime, a: from, b: to });
  }
  act.phases.push({ name: 'turnback', d: 0.3 });
  if (m.castleRook) {
    const r = pieces.get(m.castleRook[0]);
    if (r) {
      pieces.delete(m.castleRook[0]);
      act.rook = { p: r, a: sqPos(m.castleRook[0]), b: sqPos(m.castleRook[1]), t0: 0.45, d: 1.1 };
    }
  }
  act.total = act.phases.reduce((s, ph) => s + ph.d, 0);
  if (act.rook) act.total = Math.max(act.total, act.rook.t0 + act.rook.d + 0.3);
  return act;
}

function finishCurrent() {
  const a = current;
  current = null;
  if (!a) return;
  const { job } = a;
  // put the mover where it belongs, facing home
  if (a.cap && pieces.get(a.job.m.cap) === a.cap) {
    removePiece(a.cap);
    pieces.delete(a.job.m.cap);
  }
  a.mover.fig.group.position.copy(a.to);
  a.mover.fig.group.rotation.y = homeFacing(a.mover.code);
  a.mover.sq = job.m.to;
  a.mover.walkPhase = 0;
  pieces.set(job.m.to, a.mover);
  if (a.rook) {
    a.rook.p.fig.group.position.copy(a.rook.b);
    a.rook.p.fig.group.rotation.y = homeFacing(a.rook.p.code);
    a.rook.p.sq = job.m.castleRook[1];
    pieces.set(job.m.castleRook[1], a.rook.p);
  }
  if (job.m.promo) {
    // the pawn transforms
    removePiece(a.mover);
    pieces.delete(job.m.to);
    const np = place(job.m.promo, job.m.to);
    np.grow = 0.001;
    sparkle(a.to);
  }
  syncTo(job.after);
  drawOverlays();
}

function stepMove(a, dt, t) {
  a.t += dt;
  let tt = a.t, phase = null;
  for (const ph of a.phases) {
    if (tt <= ph.d) {
      phase = ph;
      break;
    }
    tt -= ph.d;
  }
  const g = a.mover.fig.group;
  let walk = 0, attack = 0;
  if (phase) {
    const k = Math.min(1, tt / phase.d);
    switch (phase.name) {
      case 'turn':
        g.rotation.y = turnToward(g.rotation.y, phase.face, Math.min(1, dt * 14));
        walk = 0.3;
        break;
      case 'walk': {
        const e = phase.settle ? ease(k) : ease(k);
        g.position.lerpVectors(phase.a, phase.b, e);
        if (a.knight && !phase.settle) g.position.y = Math.sin(Math.PI * k) * Math.min(1.2, 0.5 + phase.a.distanceTo(phase.b) * 0.25);
        walk = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.9 + 0.1;
        a.mover.walkPhase = (a.mover.walkPhase || 0) + dt * (a.knight ? 9 : 11);
        g.rotation.y = turnToward(g.rotation.y, angleTo(phase.a, phase.b), Math.min(1, dt * 10));
        break;
      }
      case 'attack':
        attack = k;
        if (!a.struck && k >= 0.58) {
          a.struck = true;
          if (a.cap) {
            const heavy = a.cap.fig.type >= ROOK || a.mover.fig.type === ROOK;
            shatter(a.cap, g.position.clone(), heavy ? 1.3 : 1);
            pieces.delete(a.job.m.cap);
            a.cap = null;
          }
        }
        break;
      case 'turnback':
        g.rotation.y = turnToward(g.rotation.y, homeFacing(a.mover.code), Math.min(1, dt * 10));
        break;
    }
  }
  pose(a.mover, t, walk, attack);
  if (a.cap) {
    // the victim watches the attacker come
    const cg = a.cap.fig.group;
    cg.rotation.y = turnToward(cg.rotation.y, angleTo(a.capPos, g.position), Math.min(1, dt * 4));
    const attPhaseStart = a.phases[0].d + a.phases[1].d;
    const k = Math.max(0, Math.min(1, (a.t - attPhaseStart + 0.3) / 0.8));
    recoil(a.cap, k, t);
  }
  if (a.rook) {
    const r = a.rook;
    const k = Math.max(0, Math.min(1, (a.t - r.t0) / r.d));
    const rg = r.p.fig.group;
    rg.position.lerpVectors(r.a, r.b, ease(k));
    rg.position.y = Math.sin(Math.PI * k) * 0.9; // the rook vaults the king
    r.p.walkPhase = (r.p.walkPhase || 0) + dt * 10;
    pose(r.p, t, k > 0 && k < 1 ? 1 : 0, 0);
  }
  if (a.t >= a.total) finishCurrent();
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let matedDone = -1, matedAt = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (!current && queue.length) {
    current = startMove(queue.shift());
    drawOverlays();
  }
  if (current) stepMove(current, dt, t);
  for (const p of pieces.values()) {
    if (current && (p === current.mover || (current.rook && p === current.rook.p))) continue;
    pose(p, t, 0, 0);
    if (p.grow !== undefined) {
      p.grow = Math.min(1, p.grow + dt * 1.6);
      p.fig.group.scale.setScalar(ease(p.grow));
      if (p.grow >= 1) delete p.grow;
    }
  }
  // check: a red glow at the king in danger
  if (!current && !queue.length && state.check >= 0) {
    checkLight.position.copy(sqPos(state.check)).setY(0.6);
    checkLight.intensity = 6 + 4 * Math.sin(t * 6);
  } else {
    checkLight.intensity = 0;
  }
  // checkmate: the beaten king topples and crumbles
  if (!current && !queue.length && state.mated >= 0 && matedDone !== state.mated) {
    const k = pieces.get(state.mated);
    if (k) {
      if (!matedAt) matedAt = t;
      const e = Math.min(1, (t - matedAt - 0.4) / 0.9);
      if (e > 0) k.fig.parts.inner.rotation.z = ease(e) * 1.4;
      if (e >= 1) {
        shatter(k, k.fig.group.position.clone().add(new THREE.Vector3(0.3, 0, 0)), 1.5);
        pieces.delete(state.mated);
        matedDone = state.mated;
        matedAt = 0;
      }
    }
  }
  updateRubble(dt);
  updateSparks(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Standalone preview (open the page directly): set up a position so there's something to see.
if (!window.OpenRook && window.parent === window) {
  const start = [4, 2, 3, 5, 6, 3, 2, 4, 1, 1, 1, 1, 1, 1, 1, 1, ...new Array(32).fill(0), 9, 9, 9, 9, 9, 9, 9, 9, 12, 10, 11, 13, 14, 11, 10, 12];
  receive({ type: 'state', board: start, ply: 0, flipped: false, selected: -1, targets: [], captureTargets: [], mismatch: [], check: -1, mated: -1, last: null });
  window.__demo = (from, to, cap = -1) => {
    const b = state.board.slice();
    const code = b[from];
    if (cap >= 0) b[cap] = 0;
    b[to] = code;
    b[from] = 0;
    receive({ ...state, board: b, ply: state.ply + 1, last: { from, to, cap: cap >= 0 ? cap : -1, castleRook: null, promo: 0 } });
  };
}
send({ type: 'ready' });

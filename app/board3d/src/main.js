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
import { buildFigure, buildRemains, getStyle, setOpacity, setRot, setStyle, clipDuration, clipFor, hasClip, loadFigures, play, STRIKE_AT, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, arsenal, moveInfo, probeMove, aimAt, setAim, weaponNow } from './figures.js';
import { setupAtmosphere } from './atmosphere.js';
import { setupPost } from './post.js';
import { stoneTime } from './stone.js';
import { granite } from './granite.js';
import { Rubble } from './rubble.js';
import { Particles, chime, clang, crash, glowSprite, grind, setSound, step, unlockAudio, whoosh, zap } from './battle.js';

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
renderer.toneMappingExposure = 1.1; // gloomy, but the pieces must stay readable on a phone
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const atmosphere = setupAtmosphere(scene);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 260);
const post = setupPost(renderer);
// what the tilt-shift keeps sharp: the board and everything standing on it
const FOCUS_PTS = [];
for (const x of [-4.3, 4.3]) for (const z of [-4.3, 4.3]) for (const y of [-0.2, 1.5]) FOCUS_PTS.push(new THREE.Vector3(x, y, z));

scene.add(new THREE.HemisphereLight(0xb9c3d2, 0x1c1a18, 0.3));
// cold daylight falling from high windows
const sun = new THREE.DirectionalLight(0xe2e8f0, 2.3);
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
const rim = new THREE.DirectionalLight(0x8fa0b8, 0.9);
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
const sqDark = new THREE.MeshStandardMaterial({ color: 0x2c2522, roughness: 0.3 });
{
  const g = new THREE.BoxGeometry(1, 0.16, 1);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 1;
      // each square a slab of pale limestone or dark slate, the grain running on between them
      const m = new THREE.Mesh(g, granite(light ? 'white' : 'black', { grain: 16, offset: [f - 3.5, 0, 3.5 - r] }));
      m.material.roughness = light ? 0.55 : 0.4;
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
  if (!ready) {
    pendingState = json; // the models are still loading
    return;
  }
  const msg = typeof json === 'string' ? JSON.parse(json) : json;
  if (msg.type !== 'state') return;
  setSound(msg.sound !== false);
  atmosphere.setRoom(msg.room || 'apothecary');
  sun.color.set(atmosphere.key);
  if ((msg.style || 'stone') !== getStyle()) {
    // a different look: rebuild every figure
    setStyle(msg.style);
    for (const p of pieces.values()) removePiece(p);
    pieces.clear();
    if (state.ply >= 0) syncTo(state.board);
  }
  const prevPly = state.ply;
  const prev = state.board;
  state = msg;
  if (prevPly >= 0 && msg.ply === prevPly + 1 && msg.last && prev[msg.last.from]) {
    queue.push({ before: prev.slice(), after: msg.board.slice(), m: msg.last });
  } else if (msg.ply !== prevPly || prevPly < 0) {
    queue.length = 0;
    if (current) finishCurrent();
    clearWreckage();
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
// The player's view (orbit, zoom, pan) plus cinematic shots that the battles blend over it.
let azimuth = 0, azTarget = 0, flippedNow = false;
const BASE_EL = 0.98; // high enough to see over the front rows of statues to the back ones
const user = { az: 0, el: 0, zoom: 1, pan: new THREE.Vector3() };
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
  const dpr = renderer.getPixelRatio();
  post.setSize(Math.round(w * dpr), Math.round(h * dpr));
}
window.addEventListener('resize', fitCamera);
fitCamera();

function boardDist() {
  // far enough that the whole board fits, whatever the aspect ratio
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  return Math.max(4.9 / Math.tan(halfFov), 4.9 / (Math.tan(halfFov) * camera.aspect)) * 0.98;
}

// A cinematic shot: where the camera wants to be and what it looks at. The battle code
// updates it every frame while `want` is 1; it blends in and out smoothly.
const shot = { want: 0, k: 0, pos: new THREE.Vector3(), target: new THREE.Vector3() };
function releaseShot() {
  shot.want = 0;
}
// A player who grabs the camera during a shot keeps it until the next move.
let shotsSuppressed = false;

let shake = 0;
const _v = new THREE.Vector3();
const topDown = () => state.view === 'top';
function playerView() {
  const az = azimuth + user.az;
  // the top-down view looks almost straight down, so every piece is easy to read
  const baseEl = camera.aspect < 0.8 ? 0.98 : BASE_EL; // tall phone screens look down more, so the board fills them
  const el = topDown() ? Math.min(1.53, Math.max(1.0, 1.5 + user.el)) : Math.min(1.4, Math.max(0.22, baseEl + user.el));
  const dist = boardDist() * user.zoom * (topDown() ? 0.86 : 1);
  const target = new THREE.Vector3(0, -0.2, 0.25 * Math.cos(azimuth)).add(user.pan);
  const pos = target.clone().add(_v.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
  return { pos, target, az };
}
function updateCamera(dt) {
  azimuth += (azTarget - azimuth) * Math.min(1, dt * 4);
  const view = playerView();
  const want = shotsSuppressed ? 0 : shot.want;
  shot.k += (want - shot.k) * Math.min(1, dt * (want ? 2.6 : 1.8));
  const f = ease(clamp01(shot.k));
  camera.position.lerpVectors(view.pos, shot.pos, f);
  const look = view.target.lerp(shot.target, f);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 0.9);
  }
  camera.lookAt(look);
  // the fog hangs around the edges of the hall, never over the board itself
  if (scene.fog) scene.fog.density = 0.22 / Math.max(3, camera.position.distanceTo(look));
  for (const l of window.__labels) l.rotation.z = view.az; // coordinates read the right way up
}

// Any piece standing between the camera and the action turns to glass for the moment.
const _look = new THREE.Vector3();
function fadeBlockers(dt) {
  const k = clamp01(shot.k);
  camera.getWorldDirection(_look);
  const look = shot.target.clone();
  const seg = look.clone().sub(camera.position);
  const len2 = seg.lengthSq();
  for (const p of pieces.values()) {
    let want = 1;
    if (k > 0.05 && !(current && (p === current.mover || p === current.cap))) {
      const c = p.fig.group.position.clone().setY(0.6);
      const t = c.clone().sub(camera.position).dot(seg) / len2;
      if (t > 0 && t < 0.92) {
        const d = camera.position.clone().addScaledVector(seg, t).distanceTo(c);
        if (d < 0.7) want = 1 - 0.8 * k;
      }
    }
    p.fade = p.fade ?? 1;
    p.fade += (want - p.fade) * Math.min(1, dt * 8);
    if (Math.abs(p.fade - 1) < 0.01) p.fade = 1;
    setOpacity(p.fig, p.fade);
  }
}

// ------------------------------------------------------------------ input
// One finger: tap a square, or drag to orbit. Two fingers: pinch to zoom, drag to pan.
// Mouse: drag orbits, wheel zooms, right-drag pans. Double-tap resets the view.
const ray = new THREE.Raycaster();
const pointers = new Map();
let gesture = null;
let lastTap = 0;

function resetView() {
  user.az = 0;
  user.el = 0;
  user.zoom = 1;
  user.pan.set(0, 0, 0);
}

// For recording previews: aim the camera (pan to x/z, zoom, orbit).
window.__high = () => {
  const out = [];
  for (const p of pieces.values()) p.fig.group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const b = new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    if (b.max.y > 3) out.push(p.code + ' ' + o.parent.name + ' local ' + o.geometry.boundingBox.min.toArray().map((v) => v.toFixed(2)) + ' / ' + o.geometry.boundingBox.max.toArray().map((v) => v.toFixed(2)));
  });
  return [...new Set(out)];
};
window.__probe = (x, y) => {
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(x, y), camera);
  return rc.intersectObjects(scene.children, true).slice(0, 4).map((h) => { const c = []; for (let o = h.object; o; o = o.parent) c.push(o.type + ':' + (o.name || '') + (o.geometry ? '/' + o.geometry.type : '')); return h.distance.toFixed(1) + ' ' + h.point.toArray().map((v) => v.toFixed(1)).join(',') + ' ' + c.join(' < '); });
};
window.__view = (x, z, zoom = 1, az = 0, el = 0) => {
  user.pan.set(x, 0, z);
  user.zoom = zoom;
  user.az = az;
  user.el = el;
};

function panBy(dx, dy) {
  const scale = ((boardDist() * user.zoom) / window.innerHeight) * 1.1;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const fwd = new THREE.Vector3(-right.z, 0, right.x);
  user.pan.addScaledVector(right, -dx * scale).addScaledVector(fwd, -dy * scale);
  user.pan.x = Math.max(-4, Math.min(4, user.pan.x));
  user.pan.z = Math.max(-4, Math.min(4, user.pan.z));
}

function touched() {
  if (shot.want) shotsSuppressed = true;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  unlockAudio(); // browsers only allow sound after a touch
  try {
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch (_) {}
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    gesture = { kind: e.button === 2 ? 'pan' : 'one', x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, az: user.az, el: user.el, moved: false };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'two', d: Math.hypot(a.x - b.x, a.y - b.y), zoom: user.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, moved: true };
  }
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.kind === 'two' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    user.zoom = Math.max(0.3, Math.min(1.3, gesture.zoom * (gesture.d / Math.max(10, d))));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    panBy(mx - gesture.mx, my - gesture.my);
    gesture.mx = mx;
    gesture.my = my;
    touched();
    return;
  }
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  if (Math.abs(dx) + Math.abs(dy) > 8) gesture.moved = true;
  if (!gesture.moved) return;
  touched();
  if (gesture.kind === 'pan') {
    panBy(e.clientX - gesture.lx, e.clientY - gesture.ly);
  } else {
    user.az = Math.max(-1.6, Math.min(1.6, gesture.az - dx * 0.006));
    user.el = Math.max(-0.6, Math.min(0.55, gesture.el + dy * 0.004));
  }
  gesture.lx = e.clientX;
  gesture.ly = e.clientY;
});
function pointerEnd(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  const g = gesture;
  if (pointers.size > 0) {
    // lifting one finger of a pinch: carry on with the other one as a drag
    const [p] = [...pointers.values()];
    gesture = { kind: 'one', x: p.x, y: p.y, lx: p.x, ly: p.y, az: user.az, el: user.el, moved: true };
    return;
  }
  gesture = null;
  if (!g || g.moved || g.kind !== 'one' || e.type === 'pointercancel') return;
  const now = performance.now();
  if (now - lastTap < 280) {
    resetView();
    lastTap = 0;
    return;
  }
  lastTap = now;
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
}
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  user.zoom = Math.max(0.3, Math.min(1.3, user.zoom * Math.exp(e.deltaY * 0.0012)));
  touched();
}, { passive: false });

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

// Wreckage stays where it falls and litters the board, then rots away over the next moves.
const MAX_SHARDS = 360;
const stains = [];
const stainTex = {};
function splatterTexture(color) {
  if (stainTex[color]) return stainTex[color];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = color;
  for (let i = 0; i < 26; i++) {
    const r = 6 + Math.random() * 22, a = Math.random() * Math.PI * 2, d = Math.random() * 38;
    x.globalAlpha = 0.35 + Math.random() * 0.5;
    x.beginPath();
    x.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, r * (0.4 + Math.random() * 0.6), a, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return (stainTex[color] = t);
}
// a dark stain soaks into the squares where a piece fell
function stain(pos, isWhite, size = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3 * size, 1.3 * size),
    new THREE.MeshStandardMaterial({ map: splatterTexture(isWhite ? '#2a0202' : '#06180a'), transparent: true, opacity: 0.9, roughness: 0.2, metalness: 0.1, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI * 2;
  m.position.set(pos.x, 0.007 + stains.length * 0.0002, pos.z);
  scene.add(m);
  stains.push({ m, ply: state.ply });
}

function shatter(p, from, power = 1, { chunk = 1, dustColor = 0xcfc3ae, rot = 0.85, splat = true } = {}) {
  // Every visible part of the figure bursts into chunks of its own (now rotting) stone.
  const fig = p.fig;
  if (rot) setRot(fig, rot);
  fig.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  fig.group.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    box.setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const vol = Math.max(0.0005, size.x * size.y * size.z);
    const n = fig.statue ? 34 : Math.min(16, Math.max(3, Math.round(vol * 1400)));
    for (let i = 0; i < n; i++) {
      const sz = (0.02 + Math.random() * 0.055) * chunk * (fig.statue ? 1.35 : 1);
      const m = new THREE.Mesh(shardGeos[(Math.random() * 3) | 0], o.material);
      m.scale.setScalar(sz);
      m.castShadow = sz > 0.045; // only the big chunks: shadows cost a draw each
      m.position.set(box.min.x + Math.random() * size.x, box.min.y + Math.random() * size.y, box.min.z + Math.random() * size.z);
      const out = m.position.clone().sub(from).setY(0).normalize();
      const sp = (0.7 + Math.random() * 2.2) * power;
      scene.add(m);
      shards.push({
        m, s: sz, ply: state.ply,
        v: new THREE.Vector3(out.x * sp + (Math.random() - 0.5), 1.2 + Math.random() * 3 * power, out.z * sp + (Math.random() - 0.5)),
        w: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7),
        age: 0, rot: 0,
      });
    }
  });
  while (shards.length > MAX_SHARDS) scene.remove(shards.shift().m);
  removePiece(p);
  if (splat && !fig.statue) stain(fig.group.position, fig.isWhite, 1 + 0.3 * power);
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: dustColor, transparent: true, opacity: 0.6, depthWrite: false }));
    sp.position.copy(fig.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5));
    sp.scale.setScalar(0.35);
    scene.add(sp);
    puffs.push({ sp, v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2), age: 0 });
  }
  flash.position.copy(fig.group.position).setY(0.7);
  flash.intensity = 30 * power;
  shake = 0.12 * power;
  send({ type: 'impact', heavy: power > 1.05 });
}

// a new game or a jump in the replay: sweep the board clean
// a statue rocked back by a blow it parried: its body jolts away and settles back
const recoils = [];
function recoil(p, dir, amount) {
  recoils.push({ inner: p.fig.parts.inner, dir: dir.clone(), amount, t: 0 });
}
function updateRecoils(dt) {
  for (let i = recoils.length - 1; i >= 0; i--) {
    const r = recoils[i];
    r.t += dt;
    const k = r.t < 0.05 ? r.t / 0.05 : Math.exp(-(r.t - 0.05) * 9) * Math.cos((r.t - 0.05) * 14);
    r.inner.position.copy(r.dir).multiplyScalar(r.amount * k);
    r.inner.rotation.x = 0;
    if (r.t > 0.6) {
      r.inner.position.set(0, 0, 0);
      recoils.splice(i, 1);
    }
  }
}

function clearWreckage() {
  rubble.clear();
  for (const sh of shards) scene.remove(sh.m);
  shards.length = 0;
  for (const st of stains) scene.remove(st.m);
  stains.length = 0;
  for (const d of deaths) {
    scene.remove(d.p.fig.group);
    if (d.remains) scene.remove(d.remains.group);
  }
  deaths.length = 0;
}

function updateRubble(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.age += dt;
    if (!s.rest) {
      s.v.y -= 11 * dt;
      s.m.position.addScaledVector(s.v, dt);
      const floor = s.s * 0.55;
      const onBoard = Math.abs(s.m.position.x) < 4.5 && Math.abs(s.m.position.z) < 4.5;
      const groundY = onBoard ? floor : -0.6 + floor;
      if (s.m.position.y < groundY) {
        s.m.position.y = groundY;
        if (s.v.y < -0.6) s.v.y *= -0.28;
        else s.v.y = 0;
        s.v.x *= 0.55;
        s.v.z *= 0.55;
        s.w.multiplyScalar(0.5);
        if (s.v.lengthSq() < 0.01) s.rest = true; // settled: it lies there now
      }
      s.m.rotation.x += s.w.x * dt;
      s.m.rotation.y += s.w.y * dt;
      s.m.rotation.z += s.w.z * dt;
    }
    // after a few more moves the wreckage rots and sinks into the board
    const movesSince = state.ply - s.ply;
    if (movesSince >= 4 || s.age > 120) {
      s.rot = Math.min(1, s.rot + dt * 0.12);
      s.m.scale.setScalar(s.s * (1 - 0.7 * s.rot));
      s.m.position.y -= dt * 0.01;
      if (s.rot >= 1) {
        scene.remove(s.m);
        shards.splice(i, 1);
      }
    }
  }
  for (let i = stains.length - 1; i >= 0; i--) {
    const st = stains[i];
    if (state.ply - st.ply >= 6) {
      st.m.material.opacity -= dt * 0.08;
      if (st.m.material.opacity <= 0) {
        scene.remove(st.m);
        stains.splice(i, 1);
      }
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

// ------------------------------------------------------------------ animation helpers
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
function turnToward(cur, target, k) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * k;
}

// Each piece plays one named action at a time; one-shots fall back to idle when they end.
function act(p, action, opts = {}) {
  const name = hasClip(action) ? action : clipFor(p.fig, action);
  p.anim = action;
  const d = play(p.fig, name, opts);
  p.until = opts.loop ? 0 : simT + d;
  return d;
}
function idle(p) {
  if (p.anim === 'idle') return;
  act(p, 'idle', { loop: true, fade: 0.3 });
}

// ------------------------------------------------------------------ cinematic shots
const cinema = () => (topDown() ? 'off' : state.cinema || 'fights');

// How many bystanders stand between a camera at `cam` and the point it looks at.
function blockers(cam, look, skip) {
  let n = 0;
  const seg = look.clone().sub(cam);
  const len2 = seg.lengthSq();
  for (const p of pieces.values()) {
    if (skip.includes(p)) continue;
    const c = p.fig.group.position.clone().setY(0.6);
    const k = clamp01(c.clone().sub(cam).dot(seg) / len2);
    const d = cam.clone().addScaledVector(seg, k).distanceTo(c);
    if (d < 0.55) n += 1 + (0.55 - d) * 3;
  }
  return n;
}

// Pick the side to film a fight from: the clearest line of sight, preferring the
// player's own side of the board, and a little higher when the board is crowded.
function chooseDuelAngle(a, mid, dist) {
  const view = playerView();
  const toPlayer = view.pos.clone().sub(mid).setY(0).normalize();
  const skip = [a.mover, a.cap];
  let best = null;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    // a side-on view of the duel reads best; head-on is fine if it's the only clear one
    const across = Math.abs(dir.dot(a.dir));
    for (const h of [1.6, 2.4]) {
      const cam = mid.clone().addScaledVector(dir, dist).setY(h);
      const score = blockers(cam, mid.clone().setY(0.6), skip) * 3 + across * 1.2 - dir.dot(toPlayer) * 0.8 + (h > 2 ? 0.6 : 0) +
        (Math.abs(cam.x) > 7 || Math.abs(cam.z) > 7 ? 2 : 0);
      if (!best || score < best.score) best = { score, dir, h };
    }
  }
  return best;
}

function duelShot(a) {
  // frame the attacker, the victim, and wherever the victim's body is flying
  const mid = a.capPos.clone().lerp(a.approach, 0.5);
  let spread = 0;
  const dg = a.death?.p.fig.group;
  if (dg && dg.parent) {
    const vp = dg.position.clone();
    spread = Math.min(4, vp.distanceTo(mid) + Math.max(0, vp.y) * 0.6);
    mid.lerp(vp.setY(0), 0.45);
  }
  const close = a.slowed ? 0.92 : 1;
  const aspect = Math.max(0.6, Math.min(1.4, camera.aspect));
  const dist = (3.1 / Math.sqrt(aspect)) * close + spread * 0.9 + Math.max(0, a.approach.distanceTo(a.capPos) - 0.9) * 1.6; // both fighters fully in frame, even on a tall phone
  if (!a.angle) a.angle = chooseDuelAngle(a, mid, dist);
  // a slow dolly around the fight, never swinging far from the clear side
  const orbit = Math.sin((a.t - a.shotStart) * 0.35) * 0.35 * a.shotSpin;
  const off = a.angle.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit).multiplyScalar(dist);
  shot.pos.copy(mid).add(off).setY(a.angle.h * close + spread * 0.5);
  shot.target.copy(mid).setY(0.6 + (dg && dg.parent ? Math.max(0, dg.position.y) * 0.5 : 0));
  shot.want = 1;
}

function followShot(p) {
  const g = p.fig.group;
  const fwd = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  shot.pos.copy(g.position).addScaledVector(fwd, -2.8).addScaledVector(side, 1.0).setY(2.3);
  shot.target.copy(g.position).addScaledVector(fwd, 1.2).setY(0.5);
  shot.want = 1;
}

// ------------------------------------------------------------------ effects
const particles = new Particles(scene);
const fx = [];

function launchBolt(from, to, color) {
  const s = glowSprite(color, 0.35);
  s.add(new THREE.PointLight(color, 8, 3, 2));
  s.position.copy(from);
  scene.add(s);
  zap();
  let t = 0;
  fx.push({
    update(dt) {
      t += dt;
      const k = clamp01(t / 0.32);
      s.position.lerpVectors(from, to, k);
      s.position.y += Math.sin(Math.PI * k) * 0.35;
      s.scale.setScalar(0.3 + Math.sin(t * 40) * 0.05);
      particles.burst(s.position, { color, n: 2, speed: 0.4, up: 0.2, size: 0.06, life: 0.35, gravity: 0 });
      if (k >= 1) scene.remove(s);
      return k < 1;
    },
  });
}

function shockwave(pos, color = 0xffd9a0) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(pos).setY(0.05);
  scene.add(ring);
  dustRing(pos, 14, 0.6);
  let t = 0;
  fx.push({
    update(dt) {
      t += dt;
      const k = clamp01(t / 0.55);
      ring.scale.setScalar(0.3 + easeOut(k) * 4.5);
      ring.material.opacity = 1 - k;
      if (k >= 1) scene.remove(ring);
      return k < 1;
    },
  });
}

function lightning(to) {
  const pts = [];
  const top = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 8, (Math.random() - 0.5) * 2));
  for (let i = 0; i <= 26; i++) {
    const p = top.clone().lerp(to, i / 26);
    if (i > 0 && i < 26) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.45, 0, (Math.random() - 0.5) * 0.45));
    pts.push(p);
  }
  const group = new THREE.Group();
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < 3; j++) {
      const s = glowSprite(0xbfe4ff, 0.22);
      s.position.lerpVectors(pts[i], pts[i + 1], j / 3);
      group.add(s);
    }
  }
  const light = new THREE.PointLight(0xa8d4ff, 60, 9, 1.5);
  light.position.copy(to).setY(2);
  group.add(light);
  scene.add(group);
  crash(0.5);
  zap(0.35);
  let t = 0;
  fx.push({
    update(dt) {
      t += dt;
      group.visible = Math.sin(t * 90) > -0.3;
      light.intensity = 60 * Math.max(0, 1 - t / 0.35);
      if (t > 0.35) scene.remove(group);
      return t <= 0.35;
    },
  });
}

function dustRing(pos, n = 10, size = 0.4) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0xcfc3ae, transparent: true, opacity: 0.5, depthWrite: false }));
    sp.position.copy(pos).add(new THREE.Vector3(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15));
    sp.scale.setScalar(size * 0.4);
    scene.add(sp);
    puffs.push({ sp, v: new THREE.Vector3(Math.cos(a) * 1.4, 0.15, Math.sin(a) * 1.4), age: 0 });
  }
}

function footDust(pos) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0xb9ad98, transparent: true, opacity: 0.3, depthWrite: false }));
  sp.position.copy(pos).setY(0.06);
  sp.scale.setScalar(0.12);
  scene.add(sp);
  puffs.push({ sp, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.12, (Math.random() - 0.5) * 0.3), age: 0.6 });
}

const charred = new THREE.MeshStandardMaterial({ color: 0x18120e, roughness: 0.95, emissive: 0x3a1204, emissiveIntensity: 1 });

// ------------------------------------------------------------------ deaths
const deaths = [];
const rubble = new Rubble(scene);
// the statues still standing (and the ones moving), for the rubble to pile up against
rubble.setObstacles(() => {
  const out = [];
  const add = (p, moving = false) => p && p.fig.group.parent && out.push({ x: p.fig.group.position.x, z: p.fig.group.position.z, h: p.fig.height || 1, moving });
  for (const p of pieces.values()) add(p);
  if (current) {
    add(current.mover, true);
    add(current.cap);
    if (current.rook) add(current.rook.p, true);
  }
  return out;
});
function kill(p, style, from, power = 1, blow = null) {
  const g = p.fig.group;
  const away = g.position.clone().sub(from).setY(0).normalize();
  const d = { p, style, t: 0, away, power, v: null, deathLen: 0 };
  if (p.fig.statue) {
    // stone on stone: the statue breaks at its joints and the pieces fly, chips burst from
    // where the blow landed, and dust rolls out across the board
    const fig = p.fig;
    // where the weapon landed (on the victim, at the height of the blow) and which way it swung
    const top = 0.25 + fig.height * 0.85;
    const hit = blow
      ? g.position.clone().addScaledVector(away, -0.12).setY(Math.min(top, Math.max(0.3, blow.at.y)))
      : g.position.clone().addScaledVector(away, -0.14).setY(0.55 + 0.25 * Math.min(1, fig.height / 1.2));
    const swing = blow ? blow.dir.clone() : away.clone();
    swing.y = Math.max(-0.45, Math.min(0.3, swing.y));
    swing.normalize();
    rubble.chips(hit, swing, fig.materials[0], 30, power, state.ply);
    const parts = [];
    fig.group.traverse((o) => {
      if (o.isMesh) parts.push(o);
    });
    setRot(fig, 0.35);
    fig.group.updateMatrixWorld(true);
    rubble.breakApart(parts, hit, swing, power, state.ply);
    scene.remove(g);
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: fig.isWhite ? 0xcfc8ba : 0x55555a, transparent: true, opacity: 0.55, depthWrite: false }));
      sp.position.copy(g.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.08 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5));
      sp.scale.setScalar(0.3 + Math.random() * 0.25);
      scene.add(sp);
      puffs.push({ sp, v: new THREE.Vector3((Math.random() - 0.5) * 1.6 + away.x * 0.8, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 1.6 + away.z * 0.8), age: 0 });
    }
    crash(0.9);
    clang(0.25);
    shake = 0.14 * power;
    send({ type: 'impact', heavy: true });
    return d;
  }
  // the blow lands: blood for the living army, black-green ichor for the dead one
  const gore = p.fig.statue ? (p.fig.isWhite ? [0xd8d2c4, 0xa39b8c] : [0x2a2830, 0x55505a]) : p.fig.isWhite ? [0x7a0606, 0xb01010] : [0x0f3a18, 0x3dbb5a];
  for (const c of gore) particles.burst(g.position.clone().add(away.clone().multiplyScalar(-0.15)).setY(0.75), { color: c, n: 22, speed: 2.2 * power, up: 1.6, size: 0.055, life: 0.9, gravity: 9, solid: true });
  if (style === 'launch') {
    d.v = away.clone().multiplyScalar(1.8).setY(5.2);
    act(p, 'hit2');
  } else if (style === 'lightning') {
    lightning(g.position.clone().setY(1.0));
    g.traverse((o) => {
      if (o.isMesh && o.parent !== g) o.material = charred;
    });
    d.deathLen = act(p, 'death');
  } else if (style === 'fall' || style === 'topple') {
    d.deathLen = act(p, 'death');
  } else {
    act(p, 'hit');
  }
  deaths.push(d);
  return d;
}

// The slow death: the body falls, the stone rots and its cracks burn out, the flesh of the
// statue falls away to a bare skeleton, and the skeleton crumbles into dust on the board.
function decay(d, dt) {
  const fig = d.p.fig;
  const T = d.t - d.deathLen - 0.3; // time since the body came to rest
  if (T < 0) return false;
  d.lingering = true; // the game can go on while the corpse rots
  if (!d.stained) {
    d.stained = true;
    stain(fig.group.position, fig.isWhite, 1.2);
  }
  if (T < 1.6) {
    setRot(fig, T / 1.6);
    if (Math.random() < 0.3) particles.burst(fig.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.15, (Math.random() - 0.5) * 0.6)), { color: fig.isWhite ? 0x6a1010 : 0x1d6b33, n: 1, speed: 0.2, up: 0.3, size: 0.05, life: 0.7, gravity: 3, solid: true });
    return false;
  }
  if (fig.isWhite && !d.remains && fig.stone) {
    // the rotten stone flesh bursts off the statue, leaving the skeleton beneath
    fig.group.updateMatrixWorld(true);
    d.remains = buildRemains(fig);
    scene.add(d.remains.group);
    d.remainsAt = T;
    shatter(d.p, fig.group.position.clone().add(new THREE.Vector3(0, -0.3, 0)), 0.45, { chunk: 0.8, rot: 1, splat: false });
    return false;
  }
  if (d.remains) {
    if (T - d.remainsAt < 2.4) return false;
    // ... and the bones crumble to dust
    shatter({ fig: d.remains }, d.remains.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.25, { chunk: 0.55, rot: 0, splat: false, dustColor: 0xb8ad94 });
    return true;
  }
  if (T < 2.6) return false;
  shatter(d.p, fig.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.25, { chunk: 0.55, rot: 0, splat: false, dustColor: 0x6f6a62 });
  return true;
}

function updateDeaths(dt, t) {
  for (let i = deaths.length - 1; i >= 0; i--) {
    const d = deaths[i];
    const g = d.p.fig.group, inner = d.p.fig.parts.inner;
    d.t += dt;
    d.p.fig.mixer.update(dt);
    let done = false;
    switch (d.style) {
      case 'shatter':
        if (d.t > 0.12) {
          shatter(d.p, g.position.clone().sub(d.away), d.power);
          done = true;
        }
        break;
      case 'fall':
        done = decay(d, dt);
        break;
      case 'topple':
        // a statue knocked flat cracks apart where it lands
        if (d.t > d.deathLen + 0.25) {
          crash(0.5);
          shatter(d.p, g.position.clone().setY(-0.4), 0.55, { splat: false });
          done = true;
        }
        break;
      case 'launch':
        d.v.y -= 11 * dt;
        g.position.addScaledVector(d.v, dt);
        inner.rotation.x -= dt * 8;
        inner.rotation.z += dt * 3;
        if (g.position.y <= 0 && d.t > 0.15) {
          g.position.y = 0;
          crash(0.8);
          shake = 0.12;
          shatter(d.p, g.position.clone().sub(d.away), d.power * 1.2);
          done = true;
        }
        break;
      case 'lightning':
        inner.position.x = Math.sin(t * 80) * 0.012 * Math.max(0, 1 - d.t);
        if (Math.random() < 0.5) particles.burst(g.position.clone().setY(0.4 + Math.random() * 0.8), { color: 0xff6a20, n: 1, speed: 0.3, up: 0.8, size: 0.05, life: 0.5, gravity: -1 });
        if (d.t >= Math.max(1.1, d.deathLen + 0.2)) {
          shatter(d.p, g.position.clone().sub(d.away), 0.7);
          done = true;
        }
        break;
      case 'vortex': {
        const k = clamp01(d.t / 1.1);
        g.position.y = easeOut(k) * 1.3;
        g.rotation.y += dt * (5 + 18 * k);
        for (let j = 0; j < 3; j++) {
          const a = t * 9 + j * 2.1;
          const r = 0.55 - 0.25 * k;
          particles.burst(g.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.2 + j * 0.35, Math.sin(a) * r)), { color: d.p.code & 8 ? 0x9fd8ff : 0xc77dff, n: 1, speed: 0.1, up: 0, size: 0.09, life: 0.4, gravity: 0 });
        }
        if (d.t >= 1.15) {
          particles.burst(g.position.clone().setY(g.position.y + 0.5), { color: 0xe8c5ff, n: 60, speed: 4, up: 1, size: 0.1, life: 0.8, gravity: 2 });
          crash(0.7);
          flash.position.copy(g.position).setY(g.position.y + 0.5);
          flash.color.set(0xd9a8ff);
          flash.intensity = 40;
          shatter(d.p, g.position.clone().setY(g.position.y + 0.3), 1.4);
          done = true;
        }
        break;
      }
    }
    if (done) deaths.splice(i, 1);
  }
}

// ------------------------------------------------------------------ choreography
// Every piece has its own finishing move, and the victim dies to match.
function finisherFor(att, statue) {
  if (statue) return { style: 'smash', pound: att === ROOK || att === KNIGHT }; // stone smashing stone
  switch (att) {
    case PAWN:
      return { style: 'fall' };
    case KNIGHT:
      return { style: 'launch' }; // the leaping chop sends the victim flying
    case BISHOP:
      return { style: 'lightning', cast: true };
    case ROOK:
      return { style: 'launch', pound: true };
    case QUEEN:
      return { style: 'vortex', cast: true };
    case KING:
      return { style: 'shatter' };
  }
  return { style: 'fall' };
}

const _w = new THREE.Vector3();
function weaponPoint(p) {
  // the right hand slot, where the weapon is held
  let hand = p.handSlot;
  if (hand === undefined) {
    hand = null;
    p.fig.model.traverse((o) => {
      if (o.name === 'handslotr') hand = o;
    });
    p.handSlot = hand;
  }
  if (!hand) return p.fig.group.position.clone().setY(0.8);
  hand.updateWorldMatrix(true, false);
  return hand.getWorldPosition(_w).clone();
}

// ------------------------------------------------------------------ the statues' sword fight
// A capture between statues is a real fight: they close to sword's reach, trade two to four
// blows (each parried blade on blade, taken on the shield, sidestepped, or driving the
// defender back a step), and then the attacker's finishing move lands in the victim's body:
// it reels from the blow, and only then cracks apart. Every blow is aimed: the striker steps
// in or back so the weapon reaches, the defender's guard is bent into the blade's path, and
// the sparks fly where the two actually meet.
const pick = (list, not) => {
  const l = list.length > 1 ? list.filter((x) => x !== not) : list;
  return l[(Math.random() * l.length) | 0];
};
function planDuel(a, walkTime) {
  const A = a.mover, V = a.cap;
  const armA = arsenal(A.fig), armV = arsenal(V.fig);
  // stand off at the attacker's reach: where its blows land (with their own lunge), a step short
  const g = A.fig.group;
  let reach = 0;
  for (const m of armA.blows) {
    const info = moveInfo(A.fig, m);
    reach += g.worldToLocal(probeMove(A.fig, 'S_' + m, info.at, null).tip).z / armA.blows.length;
  }
  reach = Math.max(0.64, Math.min(1.3, reach + 0.24 + 0.08));
  a.approach = a.capPos.clone().addScaledVector(a.dir, -reach);
  a.phases.push({ name: 'walk', d: walkTime, a: a.from, b: a.approach });
  a.phases.push({ name: 'square', d: 0.3 }); // on guard, eye to eye
  const n = Math.random() < 0.45 ? 2 : 3;
  let lastA = null, lastV = null, total = 0;
  for (let i = 0; i < n; i++) {
    const att = i % 2 === 0; // the attacker opens, the victim answers
    const fig = att ? A.fig : V.fig;
    const move = att ? (lastA = pick(armA.blows, lastA)) : (lastV = pick(armV.blows, lastV));
    const info = moveInfo(fig, move);
    const defFig = att ? V.fig : A.fig;
    const r = Math.random();
    const react = r < 0.2 ? (Math.random() < 0.5 ? 'dodgeL' : 'dodgeR') : info.heavy && r < 0.65 ? (info.line === 'high' ? 'staggerHigh' : 'stagger') : info.line === 'high' ? 'parryHigh' : 'parry';
    // the next blow comes as this one recovers
    const d = info.d * (react.startsWith('stagger') ? 0.98 : 0.84);
    total += d;
    a.phases.push({ name: 'blow', d, who: att ? 'A' : 'V', move, info, react, shield: !!defFig.shieldAt && !react.startsWith('dodge') });
    if (total > 2.9) break;
  }
  const fin = pick(armA.finishers);
  const fi = moveInfo(A.fig, fin);
  const killAt = fi.hits[fi.hits.length - 1] * fi.d;
  a.phases.push({ name: 'kill', d: killAt + 0.32, move: fin, info: fi, killAt });
  a.phases.push({ name: 'wait', d: 1.05 });
  a.phases.push({ name: 'walk', d: 0.7, a: null, b: a.to, settle: true, fromHere: true });
  a.phases.push({ name: 'turnback', d: 0.35 });
}

// where a fighter stands when not stepping in: the attacker at its approach, the victim on its square
const homeOf = (a, p) => (p === a.mover ? a.approach : a.capPos);
const heightOf = (p, line) => {
  const h = Math.max(0.6, p.fig.height || 1);
  return 0.24 + (h - 0.24) * (line === 'high' ? 0.78 : line === 'low' ? 0.3 : 0.55);
};
// Set a blow up: how far the striker steps in so the weapon reaches, and its aim.
function aimBlow(a, striker, defender, move, k, target, minGap) {
  const g = striker.fig.group;
  const home = homeOf(a, striker);
  const dir = defender.fig.group.position.clone().sub(home).setY(0).normalize();
  g.position.copy(home);
  setAim(striker.fig, null);
  let pr = probeMove(striker.fig, move, k, null);
  const gap = defender.fig.group.position.clone().sub(pr.root).setY(0).length();
  let shift = target.clone().sub(pr.tip).dot(dir);
  shift = Math.max(-0.35, Math.min(0.45, shift, gap - minGap));
  g.position.copy(home).addScaledVector(dir, shift);
  const { aim, err } = aimAt(striker.fig, move, k, target, 'strike');
  setAim(striker.fig, aim);
  pr = probeMove(striker.fig, move, k, aim);
  g.position.copy(home);
  return { shift, dir, tip: pr.tip, grip: pr.grip, err };
}
// the stepping-in, as a fraction: rises to the blow, holds through it, falls back in recovery
function stepEnvelope(t, impact, d) {
  if (t < impact) return ease(clamp01((t - impact * 0.25) / (impact * 0.75)));
  return 1 - ease(clamp01((t - impact - 0.12) / Math.max(0.1, d - impact - 0.12)));
}
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
// the closest points between two segments (where two blades cross)
function contactPoint(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a < 1e-9 && e < 1e-9) return p1.clone().lerp(p2, 0.5);
  if (a < 1e-9) t = clamp01(f / e);
  else {
    const c = d1.dot(r);
    if (e < 1e-9) s = clamp01(-c / a);
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-9 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  _c1.copy(p1).addScaledVector(d1, s);
  _c2.copy(p2).addScaledVector(d2, t);
  return { at: _c1.clone().lerp(_c2, 0.5), gap: _c1.distanceTo(_c2) };
}
function sparksAt(at, push, defender, heavy) {
  particles.burst(at, { color: 0xffe2a0, n: heavy ? 40 : 26, speed: heavy ? 3.4 : 2.6, up: 1, size: 0.07, life: 0.45 });
  particles.burst(at, { color: 0xfff6e0, n: 10, speed: 5, up: 0.4, size: 0.04, life: 0.18, gravity: 0 });
  rubble.chips(at, push.clone().setY(0.3), defender.fig.materials[0], heavy ? 14 : 8, heavy ? 0.8 : 0.55, state.ply);
  flash.position.copy(at);
  flash.color.set(0xffd59a);
  flash.intensity = heavy ? 22 : 14;
  clang(heavy ? 1 : 0.8);
  send({ type: 'impact', heavy: false });
  shake = Math.max(shake, heavy ? 0.06 : 0.035);
}

function stepBlow(a, phase, idx, tt, dt, once) {
  const striker = phase.who === 'A' ? a.mover : a.cap;
  const defender = phase.who === 'A' ? a.cap : a.mover;
  const { info, move } = phase;
  const impact = info.hits[info.hits.length - 1] * info.d;
  const kI = impact / info.d;
  if (once('blow' + idx)) {
    defender.fig.group.position.copy(homeOf(a, defender));
    act(striker, move, { fade: 0.14 });
    const target = defender.fig.group.position.clone().addScaledVector(defender.fig.group.position.clone().sub(striker.fig.group.position).setY(0).normalize(), -0.24);
    target.y = heightOf(defender, info.line);
    phase.plan = aimBlow(a, striker, defender, 'S_' + move, kI, target, 0.56);
    if (info.cast) phase.plan.tip = target.clone();
  }
  const plan = phase.plan;
  // time by the striker's own clip (a hit-stop holds it back from the phase's clock)
  tt = striker.fig.move.name === move ? striker.fig.move.t : phase.d;
  const home = homeOf(a, striker);
  striker.fig.group.position.copy(home).addScaledVector(plan.dir, plan.shift * stepEnvelope(tt, impact, phase.d));
  // the defender's answer, timed so its guard (or its sidestep) meets the blow
  const rInfo = moveInfo(defender.fig, phase.react);
  const rHit = rInfo.hits[0] * rInfo.d;
  if (tt >= impact - rHit && once('def' + idx)) {
    act(defender, phase.react, { fade: 0.1 });
    if (!phase.react.startsWith('dodge')) {
      // the guard goes where the blade will be: across it, a little short of its point
      const q = info.cast ? plan.tip : plan.grip.clone().lerp(plan.tip, 0.8);
      const r = aimAt(defender.fig, 'S_' + phase.react, rInfo.hits[0], q, phase.shield ? 'shield' : 'parry');
      setAim(defender.fig, r.aim);
      phase.defErr = r.err;
    }
  }
  if (info.cast && tt >= impact - 0.32 && once('bolt' + idx)) {
    const w = weaponNow(striker.fig);
    launchBolt(w.butt, plan.tip, striker.fig.isWhite ? 0x9fd8ff : 0xc77dff);
  }
  if (!info.cast && tt > impact - 0.16 && tt < impact + 0.06) particles.burst(weaponNow(striker.fig).tip, { color: 0xfff2d0, n: 1, speed: 0.05, up: 0, size: 0.07, life: 0.22, gravity: 0 });
  if (!info.cast && tt > impact - 0.2 && once('whoosh' + idx)) whoosh(info.heavy ? 0.9 : 0.7);
  if (tt >= impact && once('clash' + idx)) {
    if (phase.react.startsWith('dodge')) {
      whoosh(0.35);
      window.__duelLog?.push({ blow: move, by: striker.fig.type, react: phase.react, aimErr: +plan.err.toFixed(3), shift: +plan.shift.toFixed(2) });
      return;
    }
    const sw = weaponNow(striker.fig), dw = weaponNow(defender.fig);
    let c;
    if (info.cast) c = { at: plan.tip.clone(), gap: 0 };
    else if (phase.shield && dw.shield) c = contactPoint(sw.grip, sw.tip, dw.shield, dw.shield);
    else c = contactPoint(sw.grip, sw.tip, dw.butt.distanceTo(dw.grip) > 0.15 ? dw.butt : dw.grip, dw.tip);
    const push = defender.fig.group.position.clone().sub(striker.fig.group.position).setY(0).normalize();
    const heavy = phase.react.startsWith('stagger');
    sparksAt(c.at, push, defender, heavy);
    recoil(striker, push.clone().negate(), 0.03);
    a.hitStop = 0.07; // the blades bite: a beat of stillness
    window.__duelLog?.push({ blow: move, by: striker.fig.type, react: phase.react, gap: +c.gap.toFixed(3), aimErr: +plan.err.toFixed(3), defErr: phase.defErr !== undefined ? +phase.defErr.toFixed(3) : null, shift: +plan.shift.toFixed(2) });
  }
}

function stepKill(a, phase, tt, dt, once) {
  const mover = a.mover, g = mover.fig.group;
  const { info, move } = phase;
  if (once('fin')) {
    act(mover, move, { fade: 0.14 });
    const v = a.cap;
    v.fig.group.position.copy(a.capPos);
    const target = v.fig.group.position.clone().addScaledVector(a.dir, -0.04);
    target.y = heightOf(v, info.line === 'high' ? 'high' : 'mid') - 0.04;
    // the killing blow lands where the swing passes closest to the victim
    if (!info.cast) {
      let best = null;
      g.position.copy(a.approach);
      for (let j = -6; j <= 6; j++) {
        const t = phase.killAt + j * 0.03;
        const pr = probeMove(mover.fig, 'S_' + move, t / info.d, null);
        const gap = a.capPos.clone().sub(pr.root).setY(0).length();
        const shift = Math.max(-0.35, Math.min(0.45, target.clone().sub(pr.tip).dot(a.dir), gap - 0.48));
        const e = pr.tip.addScaledVector(a.dir, shift).distanceTo(target) + Math.abs(j) * 0.004;
        if (!best || e < best.e) best = { e, t };
      }
      const delta = best.t - phase.killAt;
      phase.killAt = best.t;
      phase.d += delta;
      a.total += delta;
    }
    phase.plan = aimBlow(a, mover, v, 'S_' + move, phase.killAt / info.d, target, 0.48);
    phase.target = target;
    if (info.cast) phase.plan.tip = target.clone();
  }
  const plan = phase.plan;
  const killAt = phase.killAt;
  const pt = tt; // the phase's clock (the kill follows the hit by a moment of it)
  tt = mover.fig.move.name === move ? mover.fig.move.t : phase.d;
  // after the blow the attacker stays where it struck (the victim is gone): no stepping back
  const env = tt < killAt ? stepEnvelope(tt, killAt, phase.d) : 1;
  g.position.copy(a.approach).addScaledVector(plan.dir, plan.shift * env);
  const cap = a.cap;
  // a combo's earlier blows: the victim still parries those
  for (let h = 0; h < info.hits.length - 1; h++) {
    const hT = info.hits[h] * info.d;
    if (!cap) break;
    const pr = moveInfo(cap.fig, 'parry');
    if (tt >= hT - pr.hits[0] * pr.d && once('cparry' + h)) {
      act(cap, 'parry', { fade: 0.1 });
      const pw = probeMove(mover.fig, 'S_' + move, info.hits[h]);
      const r = aimAt(cap.fig, 'S_parry', pr.hits[0], pw.grip.clone().lerp(pw.tip, 0.8), cap.fig.shieldAt ? 'shield' : 'parry');
      setAim(cap.fig, r.aim);
    }
    if (tt >= hT && once('chit' + h)) {
      const sw = weaponNow(mover.fig), dw = weaponNow(cap.fig);
      const c = cap.fig.shieldAt ? contactPoint(sw.grip, sw.tip, dw.shield, dw.shield) : contactPoint(sw.grip, sw.tip, dw.butt.distanceTo(dw.grip) > 0.15 ? dw.butt : dw.grip, dw.tip);
      sparksAt(c.at, a.dir, cap, true);
      a.hitStop = 0.08;
      whoosh(0.5);
    }
  }
  // too late, the victim's guard comes up
  if (cap && tt >= killAt - 0.3 && once('late')) act(cap, (info.line === 'high' ? 'parryHigh' : 'parry'), { fade: 0.12 });
  if (!info.cast && tt > killAt - 0.2 && tt < killAt + 0.08) particles.burst(weaponNow(mover.fig).tip, { color: 0xfff2d0, n: 1, speed: 0.05, up: 0, size: 0.1, life: 0.28, gravity: 0 });
  if (tt > killAt - 0.24 && once('whooshF')) info.cast ? zap(0.4) : whoosh(1);
  if (info.cast && tt >= killAt - 0.32 && once('bolt')) launchBolt(weaponNow(mover.fig).butt, phase.target, mover.fig.isWhite ? 0x9fd8ff : 0xc77dff);
  if (tt >= killAt - 0.06 && once('slow')) {
    a.slowed = true;
    slowLeft = 0.8; // slow motion around the killing blow
  }
  const tip = weaponNow(mover.fig).tip;
  // the blow lands: the victim reels with the weapon in it ...
  if (cap && tt >= killAt && once('hit')) {
    phase.hitPt = pt;
    act(cap, 'reel', { fade: 0.03 });
    setRot(cap.fig, 0.15);
    a.hitStop = 0.14;
    a.stopMoverOnly = true; // the weapon bites and holds; the victim reels from it
    phase.swing = a.prevTip ? tip.clone().sub(a.prevTip) : a.dir.clone();
    const at = tip.clone();
    flash.position.copy(at);
    flash.color.set(0xffe0a0);
    flash.intensity = 10;
    shake = 0.08;
    crash(0.35);
    particles.burst(at, { color: 0xfff0c0, n: 18, speed: 2, up: 0.6, size: 0.06, life: 0.4 });
    if (mover.fig.type === KNIGHT || mover.fig.type === ROOK) shockwave(g.position.clone().addScaledVector(a.dir, 0.4));
  }
  if (cap && phase.hitPt !== undefined) setRot(cap.fig, 0.15 + clamp01((pt - phase.hitPt) / 0.14) * 0.25);
  // ... and cracks apart
  if (cap && phase.hitPt !== undefined && pt >= phase.hitPt + 0.14 && once('kill')) {
    const swingDir = phase.swing && phase.swing.lengthSq() > 1e-6 ? phase.swing.clone() : a.dir.clone();
    swingDir.normalize().lerp(a.dir.clone().setY(swingDir.y), 0.35).normalize();
    const blow = { at: tip.clone(), dir: swingDir };
    const vc = cap.fig.group.position;
    window.__duelLog?.push({ kill: move, by: mover.fig.type, victim: cap.fig.type, tipToBody: +Math.hypot(tip.x - vc.x, tip.z - vc.z).toFixed(3), tipY: +tip.y.toFixed(2), victimH: +cap.fig.height.toFixed(2), aimErr: +plan.err.toFixed(3), shift: +plan.shift.toFixed(2) });
    send({ type: 'impact', heavy: true });
    const weight = { [PAWN]: 0.9, [KNIGHT]: 1.2, [BISHOP]: 1.0, [ROOK]: 1.5, [QUEEN]: 1.3, [KING]: 1.4 }[mover.fig.type] || 1;
    a.death = kill(cap, a.fin.style, g.position.clone(), weight * (cap.fig.type >= ROOK ? 1.1 : 1), blow);
    pieces.delete(a.job.m.cap);
    a.cap = null;
  }
  if (tt >= killAt - 0.1) a.prevTip = tip;
}

function startMove(job) {
  const { m } = job;
  const mover = pieces.get(m.from);
  if (!mover) {
    syncTo(job.after);
    return null;
  }
  shotsSuppressed = false;
  const from = sqPos(m.from), to = sqPos(m.to);
  const cap = m.cap >= 0 ? pieces.get(m.cap) : null;
  const capPos = m.cap >= 0 ? sqPos(m.cap) : null;
  const dist = from.distanceTo(capPos || to);
  const knight = mover.fig.type === KNIGHT;
  const walkTime = Math.max(0.9, dist * (knight ? 0.38 : 0.55));
  const a = { job, mover, from, to, cap, capPos, t: 0, knight, phases: [], rook: null, events: {}, shotStart: 0, shotSpin: Math.random() < 0.5 ? 1 : -1 };
  pieces.delete(m.from);
  a.phases.push({ name: 'turn', d: 0.3, face: angleTo(from, capPos || to) });
  if (cap) {
    const dir = capPos.clone().sub(from).normalize();
    a.dir = dir;
    a.fin = finisherFor(mover.fig.type, mover.fig.statue);
    if (mover.fig.statue && cap.fig.statue) {
      planDuel(a, walkTime);
      a.total = a.phases.reduce((s, ph) => s + ph.d, 0);
      return a;
    }
    a.approach = capPos.clone().addScaledVector(dir, -0.85);
    a.phases.push({ name: 'walk', d: walkTime, a: from, b: a.approach });
    // the duel: an attack each way, parried or dodged, then the finisher
    // the duel: a blow each way, parried (sparks, a ringing clang) or dodged, then the finisher
    const atk = clipFor(mover.fig, 'attack'), vatk = clipFor(cap.fig, 'attack');
    a.phases.push({ name: 'clash', d: clipDuration(atk) * 0.95, who: 'A', clip: atk, dodge: Math.random() < 0.25 });
    a.phases.push({ name: 'clash', d: clipDuration(vatk) * 0.95, who: 'V', clip: vatk, dodge: Math.random() < 0.25 });
    const fin = clipFor(mover.fig, 'finish');
    const finSpeed = fin === '2H_Melee_Attack_Spin' ? 1.4 : 1;
    a.phases.push({ name: 'final', d: clipDuration(fin) / finSpeed, clip: fin, speed: finSpeed });
    a.phases.push({ name: 'wait', d: { launch: 1.3, vortex: 1.35, lightning: 1.5, fall: 2.6, shatter: 0.6, topple: 1.6, smash: 1.6 }[a.fin.style] || 0.6 });
    a.phases.push({ name: 'walk', d: 0.7, a: a.approach, b: to, settle: true });
  } else {
    a.phases.push({ name: 'walk', d: walkTime, a: from, b: to });
  }
  a.phases.push({ name: 'turnback', d: 0.35 });
  if (m.castleRook) {
    const r = pieces.get(m.castleRook[0]);
    if (r) {
      pieces.delete(m.castleRook[0]);
      a.rook = { p: r, a: sqPos(m.castleRook[0]), b: sqPos(m.castleRook[1]), t0: 0.5, d: 1.2 };
    }
  }
  a.total = a.phases.reduce((s, ph) => s + ph.d, 0);
  if (a.rook) a.total = Math.max(a.total, a.rook.t0 + a.rook.d + 0.4);
  return a;
}

function finishCurrent() {
  const a = current;
  current = null;
  if (!a) return;
  const { job } = a;
  if (a.cap && pieces.get(job.m.cap) === a.cap) {
    removePiece(a.cap);
    pieces.delete(job.m.cap);
  }
  const g = a.mover.fig.group;
  g.position.copy(a.to);
  g.rotation.y = homeFacing(a.mover.code);
  a.mover.fig.parts.inner.position.set(0, 0, 0);
  a.mover.sq = job.m.to;
  pieces.set(job.m.to, a.mover);
  idle(a.mover);
  if (a.rook) {
    a.rook.p.fig.group.position.copy(a.rook.b);
    a.rook.p.fig.group.rotation.y = homeFacing(a.rook.p.code);
    a.rook.p.sq = job.m.castleRook[1];
    pieces.set(job.m.castleRook[1], a.rook.p);
    idle(a.rook.p);
  }
  if (job.m.promo) {
    removePiece(a.mover);
    pieces.delete(job.m.to);
    const np = place(job.m.promo, job.m.to);
    np.grow = 0.001;
    sparkle(a.to);
    chime();
  }
  releaseShot();
  syncTo(job.after);
  drawOverlays();
}

function stepMove(a, dt) {
  a.t += dt;
  let tt = a.t, phase = null, idx = -1;
  for (let i = 0; i < a.phases.length; i++) {
    if (tt <= a.phases[i].d) {
      phase = a.phases[i];
      idx = i;
      break;
    }
    tt -= a.phases[i].d;
  }
  const mover = a.mover, g = mover.fig.group;
  const once = (key) => (a.events[key] ? false : (a.events[key] = true));
  if (phase) {
    const k = Math.min(1, tt / phase.d);
    switch (phase.name) {
      case 'turn':
        if (once('turn')) act(mover, a.knight ? 'run' : 'walk', { loop: true });
        g.rotation.y = turnToward(g.rotation.y, phase.face, Math.min(1, dt * 12));
        break;
      case 'walk': {
        if (phase.fromHere && !phase.a) phase.a = g.position.clone().setY(0);
        const leap = a.knight && !phase.settle && phase.a.distanceTo(phase.b) > 1.2;
        if (once('walk' + idx)) {
          if (leap) act(mover, 'leap', { duration: phase.d });
          else act(mover, a.knight && !phase.settle ? 'run' : 'walk', { loop: true });
          if (mover.fig.statue && !leap) grind(phase.d, mover.fig.type >= ROOK ? 0.5 : 0.35);
        }
        g.position.lerpVectors(phase.a, phase.b, leap ? k : ease(k));
        if (leap) g.position.y = Math.sin(Math.PI * clamp01((k - 0.15) / 0.75)) * Math.min(1.3, 0.6 + phase.a.distanceTo(phase.b) * 0.25);
        // (backing off to sword's reach, a fighter keeps its eyes on the foe)
        const back = a.dir && !phase.settle && phase.b.clone().sub(phase.a).dot(a.dir) < 0;
        g.rotation.y = turnToward(g.rotation.y, back ? angleTo(a.from, a.capPos) : angleTo(phase.a, phase.b), Math.min(1, dt * 10));
        // footsteps
        const step2 = Math.floor(a.t / 0.27);
        if (!leap && step2 !== a.lastStep) {
          a.lastStep = step2;
          if (!mover.fig.statue) step(0.1, mover.fig.type === ROOK);
          footDust(g.position); // statues leave a trail of grit
        }
        if (leap && k > 0.92 && once('land' + idx)) {
          step(0.3, true);
          dustRing(g.position, 8, 0.4);
        }
        break;
      }
      case 'square':
        if (once('square')) {
          act(mover, 'guard', { loop: true, fade: 0.25 });
          act(a.cap, 'guard', { loop: true, fade: 0.25 });
        }
        break;
      case 'blow':
        stepBlow(a, phase, idx, tt, dt, once);
        break;
      case 'kill':
        stepKill(a, phase, tt, dt, once);
        break;
      case 'clash': {
        // one side strikes; the other parries (sparks and a clang) or dodges aside
        const striker = phase.who === 'A' ? mover : a.cap;
        const defender = phase.who === 'A' ? a.cap : mover;
        const strikeAt = STRIKE_AT[phase.clip] || 0.45;
        if (once('atk' + idx)) act(striker, phase.clip, { fade: 0.12 });
        if (k > strikeAt - 0.22 && once('def' + idx)) {
          if (phase.dodge) act(defender, Math.random() < 0.5 ? 'dodgeL' : 'dodgeR', { fade: 0.08 });
          else act(defender, 'block', { fade: 0.08 });
        }
        if (k > strikeAt - 0.15 && k < strikeAt + 0.1) particles.burst(weaponPoint(striker), { color: 0xfff2d0, n: 1, speed: 0.05, up: 0, size: 0.08, life: 0.25, gravity: 0 });
        if (k > strikeAt - 0.15 && once('whoosh' + idx)) whoosh();
        if (k >= strikeAt && once('clash' + idx)) {
          if (phase.dodge) {
            whoosh(0.35);
          } else {
            const at = weaponPoint(striker).lerp(defender.fig.group.position.clone().setY(0.8), 0.3);
            particles.burst(at, { color: 0xffe2a0, n: 26, speed: 2.6, up: 1, size: 0.07, life: 0.45 });
            if (defender.fig.statue) {
              // stone on stone: chips fly from the parry, and both statues rock back from it
              const push = defender.fig.group.position.clone().sub(striker.fig.group.position).setY(0).normalize();
              rubble.chips(at, push.clone().setY(0.3), defender.fig.materials[0], 9, 0.55, state.ply);
              recoil(defender, push, 0.07);
              recoil(striker, push.clone().negate(), 0.035);
            }
            flash.position.copy(at);
            flash.color.set(0xffd59a);
            flash.intensity = 14;
            clang();
            send({ type: 'impact', heavy: false });
            shake = Math.max(shake, 0.03);
          }
        }
        break;
      }
      case 'final': {
        const fin = a.fin;
        const strikeAt = STRIKE_AT[phase.clip] || 0.55;
        if (once('fin')) {
          act(mover, phase.clip, { speed: phase.speed, fade: 0.12 });
          act(a.cap, 'Blocking', { loop: true, fade: 0.2 });
        }
        if (k > strikeAt - 0.2 && k < strikeAt + 0.1) particles.burst(weaponPoint(mover), { color: 0xfff2d0, n: 1, speed: 0.05, up: 0, size: 0.1, life: 0.28, gravity: 0 });
        if (fin.cast && k >= strikeAt - 0.12 && once('cast')) {
          if (mover.fig.type === QUEEN) launchBolt(weaponPoint(mover), a.cap.fig.group.position.clone().setY(0.7), mover.fig.isWhite ? 0x9fd8ff : 0xc77dff);
          else particles.burst(weaponPoint(mover), { color: 0xbfe4ff, n: 24, speed: 1.2, up: 1, size: 0.08, life: 0.5, gravity: 0 });
        }
        if (k > strikeAt - 0.25 && once('whooshF')) whoosh(0.35);
        if (k >= strikeAt - 0.05 && once('slow')) {
          a.slowed = true;
          slowLeft = 0.75; // slow motion around the killing blow
        }
        const tipNow = weaponPoint(mover);
        if (k >= strikeAt && once('hit')) {
          const swingDir = a.prevTip ? tipNow.clone().sub(a.prevTip) : new THREE.Vector3();
          if (swingDir.lengthSq() < 1e-6) swingDir.copy(a.dir);
          swingDir.normalize().lerp(a.dir.clone().setY(swingDir.y), 0.35).normalize();
          const blow = { at: tipNow.clone(), dir: swingDir };
          const at = a.cap.fig.group.position.clone().setY(0.8);
          if (!a.cap.fig.statue) particles.burst(at, { color: 0xfff0c0, n: 36, speed: 3.4, up: 1.4, size: 0.09, life: 0.6 });
          flash.position.copy(at);
          flash.color.set(0xffe0a0);
          flash.intensity = a.cap.fig.statue ? 8 : 35;
          shake = 0.1;
          crash(0.35);
          send({ type: 'impact', heavy: true });
          if (fin.pound) shockwave(g.position.clone().addScaledVector(a.dir, 0.4));
          // the heavier the attacker, the harder the blow
          const weight = { [PAWN]: 0.9, [KNIGHT]: 1.2, [BISHOP]: 1.0, [ROOK]: 1.5, [QUEEN]: 1.3, [KING]: 1.4 }[mover.fig.type] || 1;
          a.death = kill(a.cap, fin.style, g.position.clone(), weight * (a.cap.fig.type >= ROOK ? 1.1 : 1), blow);
          pieces.delete(a.job.m.cap);
          a.cap = null;
        }
        a.prevTip = tipNow;
        break;
      }
      case 'wait':
        if (tt > 0.5 && once('cheer')) act(mover, 'cheer');
        break;
      case 'turnback':
        if (once('back')) idle(mover);
        g.rotation.y = turnToward(g.rotation.y, homeFacing(mover.code), Math.min(1, dt * 10));
        break;
    }
    // camera work
    const fighting = a.dir && (phase.name === 'clash' || phase.name === 'final' || phase.name === 'wait' || phase.name === 'blow' || phase.name === 'kill' || phase.name === 'square' ||
      (phase.name === 'walk' && !phase.settle && k > 0.35));
    if (fighting && cinema() !== 'off') {
      if (!a.shotStart) a.shotStart = a.t;
      duelShot(a);
    } else if (cinema() === 'all' && phase.name !== 'turnback') {
      followShot(mover);
    } else if (shot.want && (!a.dir || phase.name === 'turnback' || (phase.name === 'walk' && phase.settle && k > 0.5))) {
      releaseShot();
    }
  }
  // hit-stop: when weapons bite, the fighters freeze for a beat (the world runs on)
  let fdt = dt;
  if (a.hitStop > 0) {
    a.hitStop -= dt;
    fdt = dt * (a.stopMoverOnly ? 0.02 : 0.15);
  } else a.stopMoverOnly = false;
  mover.fig.mixer.update(fdt);
  if (a.cap) {
    const cg = a.cap.fig.group;
    cg.rotation.y = turnToward(cg.rotation.y, angleTo(a.capPos, g.position), Math.min(1, dt * 5));
    if (!a.events.vIdle) {
      a.events.vIdle = true;
      act(a.cap, '2H_Melee_Idle', { loop: true }); // on guard
    }
    a.cap.fig.mixer.update(a.stopMoverOnly ? dt : fdt);
  }
  if (a.rook) {
    const r = a.rook;
    const k = clamp01((a.t - r.t0) / r.d);
    const rg = r.p.fig.group;
    if (k > 0 && !a.events.rookGo) {
      a.events.rookGo = true;
      act(r.p, 'leap', { duration: r.d });
    }
    rg.position.lerpVectors(r.a, r.b, ease(k));
    rg.position.y = Math.sin(Math.PI * k) * 0.9; // the rook vaults the king
    r.p.fig.mixer.update(dt);
    if (k >= 1 && !a.events.rookLand) {
      a.events.rookLand = true;
      step(0.4, true);
      dustRing(r.b, 8, 0.4);
    }
  }
  if (a.t >= a.total) finishCurrent();
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let matedDone = -1, matedAt = 0, releaseAt = 0;
let slowLeft = 0;
let wasBusy = false;
let shownPly = null;
let manual = false, simT = 0;
let nextFidget = 3;
function frame(now) {
  if (manual) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}
window.__room = (r) => {
  atmosphere.setRoom(r);
  sun.color.set(atmosphere.key);
};
window.__manual = () => {
  manual = true;
};
window.__advance = (dt) => tick(dt);
window.__dbg = () => ({ shards: shards.length, stains: stains.length, deaths: deaths.map((d) => ({ style: d.style, t: +d.t.toFixed(2), len: d.deathLen, remains: !!d.remains, lingering: !!d.lingering })) });
window.__isIdle = () => !wasBusy && !current && !queue.length && !deaths.length;

function tick(realDt) {
  if (!ready) {
    post.render(scene, camera);
    return;
  }
  let dt = realDt * (state.speed || 1);
  if (slowLeft > 0) {
    slowLeft -= realDt;
    dt *= 0.3;
  }
  simT += dt;
  const t = simT;
  if (!current && queue.length) {
    current = startMove(queue.shift());
    drawOverlays();
  }
  if (current) stepMove(current, dt);
  const fighting = current && current.dir;
  // an idle piece now and then does something: taunts, checks its weapon, raises its staff
  if (!current && t > nextFidget && pieces.size) {
    const all = [...pieces.values()];
    const p = all[(Math.random() * all.length) | 0];
    if (p.anim === 'idle') act(p, 'fidget', { fade: 0.25 });
    nextFidget = t + 2.5 + Math.random() * 4;
  }
  for (const p of pieces.values()) {
    if (current && (p === current.mover || p === current.cap || (current.rook && p === current.rook.p))) continue;
    if (fighting) {
      // bystanders turn to watch a fight nearby
      if (p.fig.group.position.distanceTo(current.capPos) < 2.6) {
        p.fig.group.rotation.y = turnToward(p.fig.group.rotation.y, angleTo(p.fig.group.position, current.capPos), Math.min(1, dt * 2));
        p.watching = true;
      }
    } else if (p.watching) {
      p.fig.group.rotation.y = turnToward(p.fig.group.rotation.y, homeFacing(p.code), Math.min(1, dt * 3));
      if (Math.abs(p.fig.group.rotation.y - homeFacing(p.code)) < 0.01) p.watching = false;
    }
    if (!p.anim) {
      act(p, 'idle', { loop: true });
      p.fig.mixer.update(Math.random() * 2); // don't all breathe in step
    } else if (p.until && t > p.until) {
      idle(p);
    }
    // a king in check raises his guard
    if (!current && state.check === p.sq && p.anim === 'idle') act(p, 'Blocking', { loop: true, fade: 0.3 });
    if (state.check !== p.sq && p.anim === 'Blocking') idle(p);
    p.fig.mixer.update(dt);
    if (p.grow !== undefined) {
      p.grow = Math.min(1, p.grow + dt * 1.6);
      p.fig.group.scale.setScalar(ease(p.grow));
      if (p.grow >= 1) delete p.grow;
    }
  }
  const busy = !!current || queue.length > 0 || deaths.some((d) => !d.lingering);
  if (!busy && state.check >= 0) {
    checkLight.position.copy(sqPos(state.check)).setY(0.6);
    checkLight.intensity = 6 + 4 * Math.sin(t * 6);
  } else {
    checkLight.intensity = 0;
  }
  // checkmate: the beaten king falls, filmed up close, and is swallowed by the board
  if (!busy && state.mated >= 0 && matedDone !== state.mated) {
    const k = pieces.get(state.mated);
    if (k) {
      if (!matedAt) {
        matedAt = t;
        shot.pos.copy(k.fig.group.position).add(new THREE.Vector3(1.6, 1.2, 1.6));
        shot.target.copy(k.fig.group.position).setY(0.6);
        if (cinema() !== 'off') shot.want = 1;
      }
      if (t - matedAt > 0.6) {
        pieces.delete(state.mated);
        kill(k, 'fall', k.fig.group.position.clone().add(new THREE.Vector3(0, 0, 1)), 1.5);
        crash(0.6);
        matedDone = state.mated;
        matedAt = 0;
        releaseAt = t + 3.5;
      }
    }
  }
  if (releaseAt && t > releaseAt) {
    releaseAt = 0;
    releaseShot();
  }
  stoneTime.value = t;
  atmosphere.update(dt, t);
  updateDeaths(dt, t);
  for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].update(dt)) fx.splice(i, 1);
  updateRubble(dt);
  updateRecoils(dt);
  rubble.update(dt, state.ply);
  window.__physMs = rubble.ms;
  window.__rubble = rubble;
  window.__physAwake = rubble.awake;
  window.__physBodies = rubble.bodies.length;
  updateSparks(dt);
  particles.update(dt);
  updateCamera(realDt);
  fadeBlockers(realDt);
  post.focusOn(camera, FOCUS_PTS);
  if (!window.__noRender) post.render(scene, camera);
  const nowBusy = busy || slowLeft > 0;
  if (wasBusy && !nowBusy) send({ type: 'idle', ply: state.ply });
  // the app waits for this before the computer replies: the board shows this position and
  // has nothing left to act out (sent after an animation, or straight after a jump)
  if (!nowBusy && state.ply !== shownPly) {
    shownPly = state.ply;
    send({ type: 'shown', ply: state.ply });
  }
  wasBusy = nowBusy;
}
requestAnimationFrame(frame);

// The models are decoded first; the app's state waits for them.
let ready = false;
let pendingState = null;
loadFigures().then(() => {
  ready = true;
  window.__ready = true;
  if (pendingState) receive(pendingState);
  send({ type: 'ready' });
});

// Standalone preview (open the page directly): set up a position so there's something to see.
if (!window.OpenRook && window.parent === window) {
  const start = [4, 2, 3, 5, 6, 3, 2, 4, 1, 1, 1, 1, 1, 1, 1, 1, ...new Array(32).fill(0), 9, 9, 9, 9, 9, 9, 9, 9, 12, 10, 11, 13, 14, 11, 10, 12];
  receive({ type: 'state', board: start, ply: 0, flipped: false, selected: -1, targets: [], captureTargets: [], mismatch: [], check: -1, mated: -1, last: null, sound: true });
  // physics test: smash the piece on [sq] as if struck from [fromSq] (standalone page only)
  window.__smash = (sq, fromSq, power = 1.3) => {
    const p = pieces.get(sq);
    if (!p) return false;
    const from = sqPos(fromSq), to = sqPos(sq);
    const dir = to.clone().sub(from).normalize().setY(-0.25).normalize();
    pieces.delete(sq);
    kill(p, 'smash', from, power, { at: to.clone().addScaledVector(dir, -0.15).setY(0.75), dir });
    return true;
  };
  window.__demo = (from, to, cap = -1) => {
    const b = state.board.slice();
    const code = b[from];
    if (cap >= 0) b[cap] = 0;
    b[to] = code;
    b[from] = 0;
    receive({ ...state, board: b, ply: state.ply + 1, last: { from, to, cap: cap >= 0 ? cap : -1, castleRook: null, promo: 0 } });
  };
}

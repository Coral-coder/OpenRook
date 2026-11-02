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
import { Particles, chime, clang, crash, glowSprite, setSound, step, unlockAudio, whoosh, zap } from './battle.js';

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
  setSound(msg.sound !== false);
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
// The player's view (orbit, zoom, pan) plus cinematic shots that the battles blend over it.
let azimuth = 0, azTarget = 0, flippedNow = false;
const BASE_EL = 0.82;
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
}
window.addEventListener('resize', fitCamera);
fitCamera();

function boardDist() {
  // far enough that the whole board fits, whatever the aspect ratio
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  return Math.max(4.75 / Math.tan(halfFov), 4.75 / (Math.tan(halfFov) * camera.aspect)) * 0.98;
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
function playerView() {
  const az = azimuth + user.az;
  const el = Math.min(1.4, Math.max(0.22, BASE_EL + user.el));
  const dist = boardDist() * user.zoom;
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
  for (const l of window.__labels) l.rotation.z = view.az; // coordinates read the right way up
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
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
function turnToward(cur, target, k) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * k;
}

// The weapon arm through one blow, attack 0..1: wind up (to 0.5), strike (to 0.65), recover.
function swing(attack, rest = -0.35) {
  if (attack <= 0) return rest;
  if (attack < 0.5) return lerp(rest, -2.8, ease(attack / 0.5));
  if (attack < 0.65) return lerp(-2.8, 0.45, (attack - 0.5) / 0.15);
  return lerp(0.45, rest, (attack - 0.65) / 0.35);
}

// Sets every joint of a figure. walk: 0 standing .. 1 striding (phase p.walkPhase);
// attack: 0..1 through a blow; block: 0..1 guard raised; gesture: 0..1 idle flourish.
function pose(p, t, walk, attack, block = 0, gesture = 0) {
  const parts = p.fig.parts;
  const type = p.fig.type;
  const ph = p.walkPhase || 0;
  const breathe = Math.sin(t * 1.6 + p.seed) * 0.5 + 0.5;
  const gest = Math.sin(Math.PI * gesture);
  if (type === KNIGHT) {
    const g = Math.sin(ph * 2);
    // rearing for an attack: body tips back, front legs kick
    const rear = attack > 0 ? (attack < 0.55 ? ease(attack / 0.55) : attack < 0.7 ? 1 - (attack - 0.55) / 0.15 : 0) : block * 0.4;
    const kick = Math.sin(t * 22) * 0.6 * rear;
    parts.legs[0].rotation.x = walk * g * 0.9 - rear * 1.3 + kick - gest * 0.9 * Math.max(0, Math.sin(t * 12));
    parts.legs[1].rotation.x = walk * Math.sin(ph * 2 + 0.6) * 0.9 - rear * 1.1 - kick;
    parts.legs[2].rotation.x = walk * -g * 0.8 + rear * 0.3;
    parts.legs[3].rotation.x = walk * -Math.sin(ph * 2 + 0.6) * 0.8 + rear * 0.3;
    parts.body.rotation.x = walk * Math.sin(ph * 2) * 0.12 - rear * 0.75;
    parts.body.position.y = 0.36 + walk * Math.abs(Math.sin(ph * 2)) * 0.05 + rear * 0.12;
    parts.neck.rotation.x = Math.sin(t * 1.3 + p.seed) * 0.06 - walk * 0.15 + rear * 0.45 + gest * 0.3;
    parts.head.rotation.x = Math.sin(t * 0.9 + p.seed) * 0.1;
    parts.tail.rotation.x = Math.sin(t * 2 + p.seed) * 0.15 + walk * 0.5 + rear * 0.6;
    parts.tail.rotation.z = Math.sin(t * 1.7 + p.seed) * 0.3;
    // the rider's lance: couched, raised to guard, driven forward on the strike
    const strike = attack >= 0.55 && attack < 0.8 ? Math.sin(Math.PI * (attack - 0.55) / 0.25) : 0;
    parts.armR.rotation.x = -rear * 0.5 - block * 1.2 + strike * 0.7;
    parts.armR.position.z = strike * 0.06;
    parts.rider.rotation.x = rear * 0.4 - strike * 0.25;
    return;
  }
  if (type === ROOK) {
    parts.legL.rotation.x = walk * Math.sin(ph) * 0.7 - gest * 0.6;
    parts.legR.rotation.x = -walk * Math.sin(ph) * 0.7;
    parts.body.rotation.z = walk * Math.sin(ph) * 0.14 + gest * 0.08;
    parts.body.rotation.x = attack > 0.5 && attack < 0.75 ? 0.35 * Math.sin(Math.PI * (attack - 0.5) / 0.25) : -block * 0.1;
    parts.body.position.y = 0.17 + walk * Math.abs(Math.cos(ph)) * 0.03 + breathe * 0.005;
    const up = attack > 0 ? (attack < 0.5 ? ease(attack / 0.5) : attack < 0.62 ? 1 - (attack - 0.5) / 0.12 : 0) : block * 0.7;
    parts.armL.rotation.x = -up * 2.8 + walk * Math.sin(ph) * 0.4;
    parts.armR.rotation.x = -up * 2.8 - walk * Math.sin(ph) * 0.4;
    parts.armL.rotation.z = -0.15 - block * 0.5;
    parts.armR.rotation.z = 0.15 + block * 0.5;
    return;
  }
  // humans
  const robed = !!parts.robe;
  if (!robed) {
    parts.legL.rotation.x = walk * Math.sin(ph) * 0.7 + (attack > 0.5 && attack < 0.8 ? -0.5 : 0);
    parts.legR.rotation.x = -walk * Math.sin(ph) * 0.7;
  } else {
    parts.body.rotation.z = walk * Math.sin(ph) * 0.05;
    parts.robe.rotation.z = walk * Math.sin(ph) * 0.04;
  }
  const baseY = robed ? 0.075 + 0.3 * (type === KING ? 1.12 : type === QUEEN ? 1.05 : 1) : 0.075 + 0.3 * 0.92;
  parts.body.position.y = baseY + walk * Math.abs(Math.cos(ph)) * 0.025 + breathe * 0.006;
  // lean into the blow, back for the wind-up, behind the guard when blocking
  const lean = attack <= 0 ? 0 : attack < 0.5 ? -0.25 * ease(attack / 0.5) : attack < 0.65 ? lerp(-0.25, 0.35, (attack - 0.5) / 0.15) : lerp(0.35, 0, (attack - 0.65) / 0.35);
  parts.body.rotation.x = walk * 0.1 + lean - block * 0.15;
  parts.body.rotation.y = attack > 0 ? Math.sin(Math.PI * attack) * 0.35 : 0;
  parts.head.rotation.y = Math.sin(t * 0.5 + p.seed) * 0.3 * (1 - walk) * (1 - block) + gest * 0.5;
  // shield / free arm: forward when guarding
  parts.armL.rotation.x = -walk * Math.sin(ph) * 0.45 + Math.sin(t * 1.6 + p.seed) * 0.03 - block * 1.3;
  parts.armL.rotation.z = -0.12 + block * 0.4;
  if (type === PAWN) {
    // spear: a thrust rather than a chop
    const k = attack <= 0 ? 0 : attack < 0.5 ? -ease(attack / 0.5) : attack < 0.65 ? lerp(-1, 1.3, (attack - 0.5) / 0.15) : lerp(1.3, 0, (attack - 0.65) / 0.35);
    parts.armR.rotation.x = -1.1 + walk * Math.sin(ph) * 0.15 - k * 0.55 - gest * 1.0;
    parts.weapon.rotation.x = 1.25 - gest * 1.2;
    parts.armR.position.z = k * 0.07;
  } else if (type === BISHOP || type === QUEEN) {
    // casting: staff or scepter raised high, then thrust at the target
    const cast = attack <= 0 ? 0 : attack < 0.5 ? ease(attack / 0.5) : attack < 0.62 ? 1 : lerp(1, 0, (attack - 0.62) / 0.38);
    parts.armR.rotation.x = -0.35 - cast * 2.3 + (attack > 0.5 && attack < 0.7 ? 1.4 : 0) - block * 1.2 - gest * 0.8 + walk * Math.sin(ph) * 0.25;
  } else {
    parts.armR.rotation.x = swing(attack) + walk * Math.sin(ph) * 0.3 * (attack ? 0 : 1) - block * 1.6 - gest * 0.9;
  }
  parts.armR.rotation.z = 0.12 + block * 0.3;
  if (parts.cape) parts.cape.rotation.x = walk * 0.3 + Math.sin(t * 2 + p.seed) * 0.03 + attack * 0.2;
}

// ------------------------------------------------------------------ cinematic shots
// Fights are filmed side-on, low, slowly circling the two fighters, pushing in for the kill.
// With cinema 'all' (replays) the camera also follows every ordinary move.
const cinema = () => state.cinema || 'fights';

function duelShot(a, dt) {
  const mid = a.capPos.clone().lerp(a.approach, 0.5);
  const side = new THREE.Vector3(a.dir.z, 0, -a.dir.x);
  // stay on the player's side of the fight
  const view = playerView();
  if (side.dot(view.pos.clone().sub(mid)) < 0) side.negate();
  const orbit = (a.t - a.shotStart) * 0.18 * a.shotSpin;
  const close = a.slowed ? 0.86 : 1;
  const aspect = Math.max(0.6, Math.min(1.4, camera.aspect));
  const dist = (3.4 / Math.sqrt(aspect)) * close;
  const off = side.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit).multiplyScalar(dist);
  // high enough to look over the pieces standing around the fight
  shot.pos.copy(mid).add(off).add(new THREE.Vector3(0, 1.9 * close, 0)).addScaledVector(a.dir, -0.4);
  shot.target.copy(mid).setY(0.5);
  shot.want = 1;
}

function followShot(p) {
  // over the shoulder of a marching piece
  const g = p.fig.group;
  const fwd = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  shot.pos.copy(g.position).addScaledVector(fwd, -2.8).addScaledVector(side, 1.0).setY(2.4);
  shot.target.copy(g.position).addScaledVector(fwd, 1.2).setY(0.35);
  shot.want = 1;
}

// ------------------------------------------------------------------ effects: bolts, shockwaves, lightning
const particles = new Particles(scene);
const fx = []; // short-lived effect objects with update(dt) -> false when finished

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
  // a jagged bolt from the sky, drawn as a chain of glowing beads, flickering
  const pts = [];
  const top = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 8, (Math.random() - 0.5) * 2));
  for (let i = 0; i <= 26; i++) {
    const k = i / 26;
    const p = top.clone().lerp(to, k);
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
// How a beaten piece goes: each attacker has its own finisher, and the victim dies to match.
const deaths = [];
function kill(p, style, from, power = 1) {
  const g = p.fig.group;
  const away = g.position.clone().sub(from).setY(0).normalize();
  const d = { p, style, t: 0, away, power, v: null };
  if (style === 'launch') d.v = away.clone().multiplyScalar(1.8).setY(5.2);
  if (style === 'lightning') {
    lightning(g.position.clone().setY(0.9));
    g.traverse((o) => {
      if (o.isMesh) o.material = charred;
    });
  }
  if (style === 'stomp') {
    crash(0.5);
    dustRing(g.position, 12, 0.5);
  }
  deaths.push(d);
}

function updateDeaths(dt, t) {
  for (let i = deaths.length - 1; i >= 0; i--) {
    const d = deaths[i];
    const g = d.p.fig.group, inner = d.p.fig.parts.inner;
    d.t += dt;
    let done = false;
    switch (d.style) {
      case 'shatter':
        shatter(d.p, g.position.clone().sub(d.away), d.power);
        done = true;
        break;
      case 'topple': {
        // falls flat on its back, then breaks on the ground
        const k = clamp01(d.t / 0.55);
        inner.rotation.x = -(k * k) * 1.5;
        if (d.t >= 0.6) {
          crash(0.5);
          shatter(d.p, g.position.clone().sub(d.away), d.power);
          done = true;
        }
        break;
      }
      case 'stomp': {
        // crushed flat under the hooves
        inner.scale.y = Math.max(0.22, 1 - d.t * 7) * 1.42;
        inner.scale.x = inner.scale.z = (1 + Math.min(0.35, d.t * 2)) * 1.42;
        if (d.t >= 0.4) {
          shatter(d.p, g.position.clone().setY(1), d.power * 0.8);
          done = true;
        }
        break;
      }
      case 'launch': {
        // thrown into the air, tumbling, smashed on landing
        d.v.y -= 11 * dt;
        g.position.addScaledVector(d.v, dt);
        inner.rotation.x -= dt * 9;
        inner.rotation.z += dt * 4;
        if (g.position.y <= 0 && d.t > 0.15) {
          g.position.y = 0;
          crash(0.8);
          shake = 0.12;
          shatter(d.p, g.position.clone().sub(d.away), d.power * 1.2);
          done = true;
        }
        break;
      }
      case 'lightning': {
        // charred black, smoking and trembling, then it collapses into ash
        inner.position.x = Math.sin(t * 80) * 0.015;
        if (Math.random() < 0.5) particles.burst(g.position.clone().setY(0.4 + Math.random() * 0.8), { color: 0xff6a20, n: 1, speed: 0.3, up: 0.8, size: 0.05, life: 0.5, gravity: -1 });
        if (d.t >= 0.85) {
          shatter(d.p, g.position.clone().sub(d.away), 0.7);
          done = true;
        }
        break;
      }
      case 'vortex': {
        // lifted in a spinning whirl of light, then it bursts in mid-air
        const k = clamp01(d.t / 1.1);
        g.position.y = easeOut(k) * 1.3;
        g.rotation.y += dt * (5 + 18 * k);
        for (let j = 0; j < 3; j++) {
          const a = t * 9 + j * 2.1;
          const r = 0.55 - 0.25 * k;
          particles.burst(g.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.2 + j * 0.3, Math.sin(a) * r)), { color: 0xc77dff, n: 1, speed: 0.1, up: 0, size: 0.09, life: 0.4, gravity: 0 });
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
      case 'sink': {
        // swallowed by the board in a swirl of dust
        g.position.y = -d.t * 0.95;
        g.rotation.y += dt * 3;
        if (Math.random() < 0.4) dustRing(g.position.clone().setY(0), 3, 0.35);
        if (d.t >= 1.1) {
          removePiece(d.p);
          done = true;
        }
        break;
      }
    }
    if (done) deaths.splice(i, 1);
  }
}

// ------------------------------------------------------------------ choreography
const STRIKE = 0.6; // point in a blow (0..1) where the weapon lands

function blowTime(type) {
  return type === ROOK ? 0.75 : type === KNIGHT ? 0.8 : 0.62;
}

// The finishing move of each kind of piece, and how its victim dies.
function finisherFor(att, vic) {
  switch (att) {
    case PAWN:
      return { style: vic === ROOK ? 'sink' : 'topple', hitAt: STRIKE };
    case KNIGHT:
      return { style: vic === KNIGHT ? 'launch' : 'stomp', hitAt: 0.66, charge: true };
    case BISHOP:
      return { style: 'lightning', hitAt: 0.6, cast: true };
    case ROOK:
      return { style: 'launch', hitAt: 0.6, pound: true };
    case QUEEN:
      return { style: 'vortex', hitAt: 0.55, cast: true };
    case KING:
      return { style: vic === QUEEN || vic === KING ? 'topple' : 'shatter', hitAt: 0.62, spin: true };
  }
  return { style: 'shatter', hitAt: STRIKE };
}

// world position of a piece's weapon (or fist), for trails and sparks
const _w = new THREE.Vector3();
function weaponPoint(p) {
  const parts = p.fig.parts;
  const o = parts.weapon || parts.armR;
  if (!o) return p.fig.group.position.clone().setY(0.7);
  o.updateWorldMatrix(true, false);
  return o.localToWorld(_w.set(0, p.fig.type === PAWN ? 0.6 : p.fig.type === KING ? 0.45 : 0.3, 0)).clone();
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
  const walkTime = Math.max(0.8, dist * 0.45);
  const act = { job, mover, from, to, cap, capPos, t: 0, knight: mover.fig.type === KNIGHT, phases: [], rook: null, events: {}, shotStart: 0, shotSpin: Math.random() < 0.5 ? 1 : -1 };
  pieces.delete(m.from);
  act.phases.push({ name: 'turn', d: 0.25, face: angleTo(from, capPos || to) });
  if (cap) {
    const dir = capPos.clone().sub(from).normalize();
    act.dir = dir;
    act.fin = finisherFor(mover.fig.type, cap.fig.type);
    act.approach = capPos.clone().addScaledVector(dir, mover.fig.type === KNIGHT || cap.fig.type === KNIGHT ? -0.95 : -0.82);
    act.phases.push({ name: 'walk', d: walkTime, a: from, b: act.approach });
    const ta = blowTime(mover.fig.type), tv = blowTime(cap.fig.type);
    // the duel: an attack and a parry each way (or a dodge), then the finisher
    act.phases.push({ name: 'clash', d: ta, who: 'A', dodge: Math.random() < 0.3 });
    act.phases.push({ name: 'clash', d: tv, who: 'V', dodge: Math.random() < 0.3 });
    act.phases.push({ name: 'final', d: ta * 1.5 });
    act.phases.push({ name: 'wait', d: { launch: 1.2, vortex: 1.3, sink: 1.1, lightning: 0.95, topple: 0.7, stomp: 0.45 }[act.fin.style] || 0.3 });
    act.phases.push({ name: 'walk', d: 0.6, a: act.approach, b: to, settle: true });
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
  if (a.cap && pieces.get(job.m.cap) === a.cap) {
    removePiece(a.cap);
    pieces.delete(job.m.cap);
  }
  const g = a.mover.fig.group;
  g.position.copy(a.to);
  g.rotation.y = homeFacing(a.mover.code);
  a.mover.fig.parts.inner.rotation.set(0, 0, 0);
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

function stepMove(a, dt, t) {
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
  let walk = 0, attack = 0, block = 0, vAttack = 0, vBlock = 0;
  const once = (key) => (a.events[key] ? false : (a.events[key] = true));
  if (phase) {
    const k = Math.min(1, tt / phase.d);
    switch (phase.name) {
      case 'turn':
        g.rotation.y = turnToward(g.rotation.y, phase.face, Math.min(1, dt * 14));
        walk = 0.3;
        break;
      case 'walk': {
        g.position.lerpVectors(phase.a, phase.b, ease(k));
        const leap = a.knight && !phase.settle;
        if (leap) g.position.y = Math.sin(Math.PI * k) * Math.min(1.2, 0.5 + phase.a.distanceTo(phase.b) * 0.25);
        walk = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.9 + 0.1;
        const before = mover.walkPhase || 0;
        mover.walkPhase = before + dt * (a.knight ? 9 : 11);
        if (Math.floor(mover.walkPhase / Math.PI) !== Math.floor(before / Math.PI) && !leap) {
          step(0.12, mover.fig.type === ROOK);
          footDust(g.position);
        }
        g.rotation.y = turnToward(g.rotation.y, angleTo(phase.a, phase.b), Math.min(1, dt * 10));
        if (leap && k > 0.97 && once('land' + idx)) {
          step(0.3, true);
          dustRing(g.position, 8, 0.4);
        }
        break;
      }
      case 'clash': {
        // one side strikes; the other parries (sparks and a clang) or dodges aside
        const striker = phase.who === 'A' ? mover : a.cap;
        const defender = phase.who === 'A' ? a.cap : mover;
        if (phase.who === 'A') attack = k;
        else vAttack = k;
        const guard = clamp01(k * 3) * (k < 0.85 ? 1 : (1 - k) / 0.15);
        if (phase.dodge) {
          // step aside from the blow and back
          const side = new THREE.Vector3(a.dir.z, 0, -a.dir.x).multiplyScalar(Math.sin(Math.PI * clamp01((k - 0.35) / 0.5)) * 0.32);
          defender.fig.parts.inner.position.x = side.length() * (phase.who === 'A' ? 1 : -1);
          defender.fig.parts.inner.rotation.z = -side.length() * 0.6;
        } else if (phase.who === 'A') vBlock = guard;
        else block = guard;
        if (k > 0.45 && k < 0.7) particles.burst(weaponPoint(striker), { color: 0xfff2d0, n: 1, speed: 0.05, up: 0, size: 0.07, life: 0.22, gravity: 0 });
        if (k > 0.35 && once('whoosh' + idx)) whoosh();
        if (k >= STRIKE && once('clash' + idx)) {
          if (phase.dodge) {
            whoosh(0.35);
          } else {
            const at = weaponPoint(striker).lerp(defender.fig.group.position.clone().setY(0.7), 0.3);
            particles.burst(at, { color: 0xffe2a0, n: 24, speed: 2.6, up: 1, size: 0.07, life: 0.45 });
            flash.position.copy(at);
            flash.color.set(0xffd59a);
            flash.intensity = 12;
            clang();
            send({ type: 'impact', heavy: false });
            shake = Math.max(shake, 0.03);
            a.stagger = { who: defender, t: 0 };
          }
        }
        if (k >= 0.95) {
          defender.fig.parts.inner.position.x = 0;
          defender.fig.parts.inner.rotation.z = 0;
        }
        break;
      }
      case 'final': {
        // the finisher: a slower, bigger wind-up, slow motion on the blow
        const fin = a.fin;
        attack = k < 0.6 ? (k / 0.6) * 0.5 : 0.5 + ((k - 0.6) / 0.4) * 0.5;
        vBlock = k < 0.5 ? clamp01(k * 3) : 0;
        if (fin.charge) {
          // the knight charges home and rears over its victim
          const p = clamp01((k - 0.15) / 0.5);
          g.position.copy(a.approach).addScaledVector(a.dir, easeOut(p) * 0.5);
          mover.walkPhase = (mover.walkPhase || 0) + dt * 12;
          walk = p > 0 && p < 1 ? 0.8 : 0;
        }
        if (fin.spin && attack > 0.5 && attack < 0.7) g.rotation.y += dt * 26; // the king's spinning slash
        if (fin.cast && attack >= 0.5 && once('cast')) {
          if (mover.fig.type === QUEEN) launchBolt(weaponPoint(mover), a.cap.fig.group.position.clone().setY(0.6), 0xc77dff);
          else particles.burst(weaponPoint(mover), { color: 0xbfe4ff, n: 20, speed: 1.2, up: 1, size: 0.08, life: 0.5, gravity: 0 });
        }
        if (attack > 0.4 && attack < 0.75) particles.burst(weaponPoint(mover), { color: 0xfff2d0, n: 1, speed: 0.05, up: 0, size: 0.09, life: 0.25, gravity: 0 });
        if (attack > 0.45 && once('whooshF')) whoosh(0.35);
        if (attack >= fin.hitAt - 0.06 && once('slow')) {
          a.slowed = true;
          slowLeft = 0.75; // real seconds of slow motion around the killing blow
        }
        if (attack >= fin.hitAt && once('hit')) {
          const at = a.cap.fig.group.position.clone().setY(0.65);
          particles.burst(at, { color: 0xfff0c0, n: 36, speed: 3.4, up: 1.4, size: 0.09, life: 0.6 });
          flash.position.copy(at);
          flash.color.set(0xffe0a0);
          flash.intensity = 35;
          shake = 0.1;
          crash(0.35);
          send({ type: 'impact', heavy: true });
          if (fin.pound) shockwave(g.position.clone().addScaledVector(a.dir, 0.3));
          kill(a.cap, fin.style, g.position.clone(), a.cap.fig.type >= ROOK ? 1.35 : 1.1);
          pieces.delete(a.job.m.cap);
          a.cap = null;
        }
        break;
      }
      case 'wait':
        break; // the victim's death plays out
      case 'turnback':
        g.rotation.y = turnToward(g.rotation.y, homeFacing(mover.code), Math.min(1, dt * 10));
        break;
    }
    // camera work
    const fighting = a.dir && (phase.name === 'clash' || phase.name === 'final' || phase.name === 'wait' ||
      (phase.name === 'walk' && !phase.settle && k > 0.35));
    if (fighting && cinema() !== 'off') {
      if (!a.shotStart) a.shotStart = a.t;
      duelShot(a, dt);
    } else if (cinema() === 'all' && phase.name !== 'turnback') {
      followShot(mover);
    } else if (shot.want && (!a.dir || phase.name === 'turnback' || (phase.name === 'walk' && phase.settle && k > 0.5))) {
      releaseShot();
    }
  }
  // a parried fighter is pushed back a little
  if (a.stagger) {
    a.stagger.t += dt;
    const s = Math.sin(Math.PI * clamp01(a.stagger.t / 0.35)) * 0.08;
    a.stagger.who.fig.parts.inner.position.z = -s;
    if (a.stagger.t > 0.35) a.stagger = null;
  }
  pose(mover, t, walk, attack, block);
  if (a.cap) {
    const cg = a.cap.fig.group;
    cg.rotation.y = turnToward(cg.rotation.y, angleTo(a.capPos, g.position), Math.min(1, dt * 5));
    pose(a.cap, t, 0, vAttack, vBlock, 0);
  }
  if (a.rook) {
    const r = a.rook;
    const k = clamp01((a.t - r.t0) / r.d);
    const rg = r.p.fig.group;
    rg.position.lerpVectors(r.a, r.b, ease(k));
    rg.position.y = Math.sin(Math.PI * k) * 0.9; // the rook vaults the king
    r.p.walkPhase = (r.p.walkPhase || 0) + dt * 10;
    pose(r.p, t, k > 0 && k < 1 ? 1 : 0, 0);
    if (k >= 1 && !a.events.rookLand) {
      a.events.rookLand = true;
      step(0.4, true);
      dustRing(r.b, 8, 0.4);
    }
  }
  if (a.t >= a.total) finishCurrent();
}

// ------------------------------------------------------------------ idle life
function idleGesture(p, t) {
  if (p.nextGesture === undefined) p.nextGesture = t + 2 + Math.random() * 8;
  if (p.gestureAt === undefined && t > p.nextGesture) p.gestureAt = t;
  if (p.gestureAt === undefined) return 0;
  const g = (t - p.gestureAt) / 1.4;
  if (g >= 1) {
    p.gestureAt = undefined;
    p.nextGesture = t + 4 + Math.random() * 10;
    return 0;
  }
  return g;
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let matedDone = -1, matedAt = 0, releaseAt = 0;
let slowLeft = 0; // real seconds of slow motion remaining
let wasBusy = false;
let manual = false, simT = 0; // manual: frames stepped by __advance (for recording videos)
function frame(now) {
  if (manual) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}
window.__manual = () => {
  manual = true;
};
window.__advance = (dt) => tick(dt);
window.__isIdle = () => !wasBusy && !current && !queue.length && !deaths.length;

function tick(realDt) {
  // game time runs at the replay speed, and slower around a killing blow
  let dt = realDt * (state.speed || 1);
  if (slowLeft > 0) {
    slowLeft -= realDt;
    dt *= 0.28;
  }
  simT += dt;
  const t = simT;
  if (!current && queue.length) {
    current = startMove(queue.shift());
    drawOverlays();
  }
  if (current) stepMove(current, dt, t);
  const fighting = current && current.dir;
  for (const p of pieces.values()) {
    if (current && (p === current.mover || p === current.cap || (current.rook && p === current.rook.p))) continue;
    // bystanders turn to watch a fight nearby
    if (fighting) {
      if (p.fig.group.position.distanceTo(current.capPos) < 2.6) {
        p.fig.group.rotation.y = turnToward(p.fig.group.rotation.y, angleTo(p.fig.group.position, current.capPos), Math.min(1, dt * 2));
        p.watching = true;
      }
    } else if (p.watching) {
      p.fig.group.rotation.y = turnToward(p.fig.group.rotation.y, homeFacing(p.code), Math.min(1, dt * 3));
      if (Math.abs(p.fig.group.rotation.y - homeFacing(p.code)) < 0.01) p.watching = false;
    }
    pose(p, t, 0, 0, 0, current ? 0 : idleGesture(p, t));
    if (p.grow !== undefined) {
      p.grow = Math.min(1, p.grow + dt * 1.6);
      p.fig.group.scale.setScalar(ease(p.grow));
      if (p.grow >= 1) delete p.grow;
    }
  }
  const busy = !!current || queue.length > 0 || deaths.length > 0;
  if (!busy && state.check >= 0) {
    checkLight.position.copy(sqPos(state.check)).setY(0.6);
    checkLight.intensity = 6 + 4 * Math.sin(t * 6);
  } else {
    checkLight.intensity = 0;
  }
  // checkmate: the beaten king topples and crumbles, filmed up close
  if (!busy && state.mated >= 0 && matedDone !== state.mated) {
    const k = pieces.get(state.mated);
    if (k) {
      if (!matedAt) matedAt = t;
      const g = k.fig.group;
      shot.pos.copy(g.position).add(new THREE.Vector3(1.6, 1.1, 1.6));
      shot.target.copy(g.position).setY(0.5);
      if (cinema() !== 'off') shot.want = 1;
      const e = Math.min(1, (t - matedAt - 0.6) / 1.1);
      if (e > 0) k.fig.parts.inner.rotation.z = ease(e) * 1.45;
      if (e >= 1) {
        shatter(k, g.position.clone().add(new THREE.Vector3(0.3, 0, 0)), 1.6);
        crash(0.9);
        pieces.delete(state.mated);
        matedDone = state.mated;
        matedAt = 0;
        releaseAt = t + 1.6;
      }
    }
  }
  if (releaseAt && t > releaseAt) {
    releaseAt = 0;
    releaseShot();
  }
  updateDeaths(dt, t);
  for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].update(dt)) fx.splice(i, 1);
  updateRubble(dt);
  updateSparks(dt);
  particles.update(dt);
  updateCamera(realDt);
  renderer.render(scene, camera);
  // tell the app when everything has settled (replays wait for this)
  const nowBusy = busy || slowLeft > 0;
  if (wasBusy && !nowBusy) send({ type: 'idle', ply: state.ply });
  wasBusy = nowBusy;
}
requestAnimationFrame(frame);

// Standalone preview (open the page directly): set up a position so there's something to see.
if (!window.OpenRook && window.parent === window) {
  const start = [4, 2, 3, 5, 6, 3, 2, 4, 1, 1, 1, 1, 1, 1, 1, 1, ...new Array(32).fill(0), 9, 9, 9, 9, 9, 9, 9, 9, 12, 10, 11, 13, 14, 11, 10, 12];
  receive({ type: 'state', board: start, ply: 0, flipped: false, selected: -1, targets: [], captureTargets: [], mismatch: [], check: -1, mated: -1, last: null, sound: true });
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

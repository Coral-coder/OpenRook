// OpenRook 3D battle board.
//
// The app (Flutter) owns the chess: it sends the position, the last move, the selection and the
// legal targets; this page only shows them. When a move arrives it is acted out: the piece
// turns, walks (or gallops and leaps), and a capture is a fight that ends with the victim
// coming apart into stone rubble (breakup.js), which later melts away and drains off the board
// (melt.js). Blows that get past the guard leave wounds that stay (damage.js). Taps on squares
// go back to the app.
//
// Bridge: the app calls window.openrook.receive(json). This page posts JSON strings back
// through window.OpenRook.postMessage (WebView channel) or window.parent.postMessage (web).
// Besides the position, the state message carries the settings: room, style, cinema, speed,
// sound, view, and battle ('quick' | 'standard' | 'epic': how long a fight between statues
// runs; 'standard' when absent). 'shown' is sent once a move has been acted out, whatever its length.
import * as THREE from 'three';
import { buildFigure, buildRemains, getStyle, setOpacity, setRot, setStyle, clipDuration, clipFor, hasClip, loadFigures, play, STRIKE_AT, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, arsenal, moveInfo, parryFor, probeMove, aimAt, setAim, weaponNow, knock, rebound } from './figures.js';
import { setupAtmosphere } from './atmosphere.js';
import { setupPost } from './post.js';
import { stoneTime } from './stone.js';
import { granite } from './granite.js';
import { Rubble } from './rubble.js';
import { Melter } from './melt.js';
import { Breakup, prepareBreakup } from './breakup.js';
import { prepareDamage, applyDamage, updateCracks } from './damage.js';
import { Particles, chime, clang, crash, glowSprite, setSound, step, unlockAudio, whoosh, zap } from './battle.js';
import { clap as clapSound, boom, implode, wormHum } from './battle.js';
import { WORM, Wormhole, castTrail, clapBurst, plantStaff, prepareWormhole } from './wormhole.js';
import { sfx } from './sfx.js';
import { SPELL, SPELLS_OF, castSpell, makeWard, prepareSpells, tickSpells } from './spells.js';

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
// neutral tone mapping keeps the limestone white and the basalt black (ACES greyed both)
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const atmosphere = setupAtmosphere(scene);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 260);
const post = setupPost(renderer);
// what the tilt-shift keeps sharp: the board and everything standing on it
const FOCUS_PTS = [];
for (const x of [-4.3, 4.3]) for (const z of [-4.3, 4.3]) for (const y of [-0.2, 1.5]) FOCUS_PTS.push(new THREE.Vector3(x, y, z));

scene.add(new THREE.HemisphereLight(0xb9c3d2, 0x1c1a18, 0.22));
// the key: daylight falling from a high window, casting soft but real shadows
const sun = new THREE.DirectionalLight(0xe2e8f0, 2.9);
sun.position.set(-5, 11, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -5.4;
sun.shadow.camera.right = 5.4;
sun.shadow.camera.top = 5.4;
sun.shadow.camera.bottom = -5.4;
sun.shadow.camera.near = 4;
sun.shadow.camera.far = 24;
sun.shadow.radius = 3;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.015;
scene.add(sun);
// a cool back light, always on the far side of the camera, that outlines every statue (the
// basalt army stands out from the dark squares by its lit edges)
const rim = new THREE.DirectionalLight(0xc4d2ff, 1.6);
rim.position.set(6, 6, -8);
scene.add(rim);
// contact shadows: a soft dark pool under each statue's feet, so it stands on the board
const contact = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const SIZE = { 1: [0.5, 0.5], 2: [0.62, 0.85], 3: [0.56, 0.56], 4: [0.74, 0.74], 5: [0.62, 0.62], 6: [0.66, 0.66] };
  const pool = [];
  const _d = new THREE.Vector3();
  return function update() {
    let n = 0;
    for (const p of pieces.values()) {
      const g = p.fig.group;
      if (!g.parent || g.visible === false) continue;
      let m = pool[n];
      if (!m) {
        m = pool[n] = new THREE.Mesh(geo, mat);
        m.renderOrder = -1;
        scene.add(m);
      }
      n++;
      const lift = Math.max(0, g.position.y);
      const [w, l] = SIZE[p.code & 7] || [0.55, 0.55];
      const k = Math.max(0, 1 - lift * 2.5);
      m.visible = k > 0.02 && (p.fig.opacity === undefined || p.fig.opacity > 0.5);
      m.position.set(g.position.x, 0.0015, g.position.z);
      m.rotation.y = g.rotation.y;
      m.scale.set(w * (1 + lift), 1, l * (1 + lift)).multiplyScalar(0.5 + 0.5 * k);
    }
    for (let i = n; i < pool.length; i++) pool[i].visible = false;
    // the back light stays behind the statues, whichever way the camera looks
    _d.copy(camera.position).setY(0);
    if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1);
    _d.normalize();
    rim.position.set(-_d.x * 8, 5, -_d.z * 8);
  };
})();
const flash = new THREE.PointLight(0xffd59a, 0, 6, 1.6);
scene.add(flash);
const checkLight = new THREE.PointLight(0xff3020, 0, 2.5, 2);
scene.add(checkLight);

// ------------------------------------------------------------------ the board
const SQ_TOP = 0.0; // pieces stand on y = 0
const squareMeshes = [];
{
  const g = new THREE.BoxGeometry(1, 0.16, 1);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 1;
      // each square a matte slab of honey sandstone or brown slate, the grain running on between
      // them: mid tones, so the pale army stands out on both and so does the black one
      const mat = granite(light ? 'white' : 'black', { grain: 7, offset: [f - 3.5, 0, 3.5 - r] });
      const u = mat.userData.uniforms;
      if (light) {
        u.uTint.value.setRGB(0.36, 0.26, 0.15);
        u.uTint2.value.setRGB(0.45, 0.34, 0.21);
      } else {
        u.uTint.value.setRGB(0.1, 0.07, 0.05);
        u.uTint2.value.setRGB(0.14, 0.1, 0.07);
      }
      u.uBump.value = 0.3;
      mat.roughness = 0.95;
      const m = new THREE.Mesh(g, mat);
      m.position.set(f - 3.5, SQ_TOP - 0.08, 3.5 - r);
      m.receiveShadow = true;
      m.userData.square = r * 8 + f;
      scene.add(m);
      squareMeshes.push(m);
    }
  }
  // carved frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2d241d, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9a7a48, roughness: 0.7, metalness: 0.2 });
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

// ------------------------------------------------------------------ coming to life
// The statues stand perfectly still, upright, like carved chessmen. A piece comes to life when
// it is selected (the stone cracks, grit trickles off it, it shifts its weight, looks out over
// the board and raises its weapon to the ready), stays alive through its move and its fight,
// and once it has arrived settles back into stillness with a puff of dust. A defender wakes as
// its attacker closes in.
const rnd = (a, b) => a + Math.random() * (b - a);
function lookAt(p, target) {
  if (!target) {
    p.fig.look = 0;
    return;
  }
  let d = angleTo(p.fig.group.position, target) - p.fig.group.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  p.fig.look = Math.max(-0.75, Math.min(0.75, d));
}
function wake(p, look = null) {
  if (!p) return;
  const fig = p.fig;
  p.settleAt = 0;
  if (fig.alive) {
    if (look) lookAt(p, look);
    return;
  }
  fig.alive = true;
  if (fig.statue) {
    act(p, 'wake', { fade: 0.06 });
    const h = fig.height || 1, c = fig.group.position;
    // grit trickles off the waking stone, a chip or two falls
    for (let i = 0; i < 4; i++) particles.burst(c.clone().add(new THREE.Vector3(rnd(-0.14, 0.14), h * rnd(0.35, 0.95), rnd(-0.14, 0.14))), { color: fig.isWhite ? 0xd8d0c0 : 0x5a5860, n: 3, speed: 0.15, up: 0, size: 0.022, life: 0.9, gravity: 2.5, solid: true });
    dustPuff(c.clone().setY(h * 0.6), 0.16, 2, fig.isWhite);
    rubble.chips(c.clone().setY(h * 0.75), new THREE.Vector3(0, -0.4, 0), fig.materials[0], 3, 0.2, state.ply);
    sfx('wake', { vol: 0.7 });
    sfx('stone_crack', { vol: 0.35, delay: 0.06 });
  } else {
    p.froze = false;
    act(p, 'idle', { loop: true, fade: 0.3 });
  }
  lookAt(p, look);
}
function settle(p) {
  if (!p) return;
  const fig = p.fig;
  if (!fig.alive) return;
  fig.alive = false;
  fig.look = 0;
  if (fig.statue) {
    act(p, 'settle', { fade: 0.22 });
    p.settleAt = simT + 0.62;
  } else idle(p);
}
// the settling statue's weight comes down on the board: a puff of dust round its feet
function settled(p) {
  p.settleAt = 0;
  if (!p.fig.group.parent) return;
  const c = p.fig.group.position;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    dustPuff(c.clone().add(new THREE.Vector3(Math.cos(a) * 0.16, 0.03, Math.sin(a) * 0.16)), 0.14, 1, p.fig.isWhite);
  }
  sfx('settle', { vol: 0.6 });
  sfx('dust', { vol: 0.5 });
}
// the selection changed: the newly selected piece comes to life, the one let go settles
function select(prev, sel) {
  const moving = (sq) => queue.some((j) => j.m.from === sq) || (current && current.job.m.from === sq);
  if (prev >= 0 && !moving(prev)) {
    const p = pieces.get(prev);
    if (p && !(current && (p === current.mover || p === current.cap))) settle(p);
  }
  if (sel >= 0) {
    const p = pieces.get(sel);
    if (p) {
      // it looks out towards where it can go
      let look = new THREE.Vector3(0, 0, 0);
      const ts = [...(state.targets || []), ...(state.captureTargets || [])];
      if (ts.length) {
        look = new THREE.Vector3();
        for (const t of ts) look.add(sqPos(t));
        look.divideScalar(ts.length);
      }
      if (look.distanceTo(p.fig.group.position) < 0.3) look = null;
      wake(p, look);
    }
  }
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
  const prevSel = state.selected ?? -1;
  state = msg;
  if (prevPly >= 0 && msg.ply === prevPly + 1 && msg.last && prev[msg.last.from]) {
    queue.push({ before: prev.slice(), after: msg.board.slice(), m: msg.last });
  } else if (msg.ply !== prevPly || prevPly < 0) {
    queue.length = 0;
    if (current) finishCurrent();
    clearWreckage();
    // (a new game, or a jump: the wounded are carved afresh)
    for (const [sq, p] of pieces) {
      if (p.fig.damage) {
        removePiece(p);
        pieces.delete(sq);
      }
    }
    syncTo(msg.board);
    matedDone = -1;
  }
  if ((msg.selected ?? -1) !== prevSel) select(prevSel, msg.selected ?? -1);
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
// The play view's distance: as close as it can be with the whole board (every square, and
// the tops of the statues on the far rank) still in the picture, so the pieces are as big as the
// screen allows. Solved once per angle and screen shape.
const _fitCam = new THREE.PerspectiveCamera();
const _fitP = new THREE.Vector3();
const FIT_PTS = [];
for (const x of [-4.1, 4.1]) for (const z of [-4.1, 4.1]) FIT_PTS.push(new THREE.Vector3(x, 0, z));
for (const x of [-3.5, 3.5]) for (const z of [-3.5, 3.5]) FIT_PTS.push(new THREE.Vector3(x, 1.5, z));
const fitCache = new Map();
function fitDist(el, az, target) {
  const key = [camera.aspect, el, az, target.z].map((v) => v.toFixed(3)).join();
  let d = fitCache.get(key);
  if (d) return d;
  _fitCam.fov = camera.fov;
  _fitCam.aspect = camera.aspect;
  _fitCam.updateProjectionMatrix();
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const fits = (dist) => {
    _fitCam.position.copy(target).addScaledVector(dir, dist);
    _fitCam.lookAt(target);
    _fitCam.updateMatrixWorld();
    return FIT_PTS.every((q) => {
      _fitP.copy(q).project(_fitCam);
      return Math.abs(_fitP.x) < 0.985 && Math.abs(_fitP.y) < 0.95 && _fitP.z < 1;
    });
  };
  let lo = 4, hi = 80;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  d = hi;
  if (fitCache.size > 200) fitCache.clear();
  fitCache.set(key, d);
  return d;
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
let duelLit = false;
const camKick = new THREE.Vector3(); // a blow's jolt to the camera, along the swing
const _v = new THREE.Vector3();
const topDown = () => state.view === 'top';
function playerView() {
  const az = azimuth + user.az;
  // the top-down view looks almost straight down, so every piece is easy to read
  // a three-quarter view: low enough that the statues stand tall, high enough to see over the
  // front ranks to the back ones
  const baseEl = camera.aspect < 0.8 ? 0.86 : BASE_EL;
  const el = topDown() ? Math.min(1.53, Math.max(1.0, 1.5 + user.el)) : Math.min(1.4, Math.max(0.22, baseEl + user.el));
  const base = new THREE.Vector3(0, -0.2, 0.25 * Math.cos(azimuth));
  const dist = (topDown() ? boardDist() * 0.86 : fitDist(el, az, base)) * user.zoom;
  const target = base.add(user.pan);
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
  camera.position.add(camKick);
  camKick.multiplyScalar(Math.exp(-dt * 9));
  camPunch *= Math.exp(-dt * 7);
  // the fight's own light: a soft key from the camera's side, so the dark stone reads against
  // the dark hall (out when no fight is being filmed)
  // (the light that glows on a king in check does this duty: there's no check to show while a
  // fight is on, and no extra light for the phone to shade)
  const lit = !!current && f > 0.01;
  if (lit !== duelLit) {
    duelLit = lit;
    checkLight.color.set(lit ? 0xfff0dc : 0xff3020);
    checkLight.distance = lit ? 9 : 2.5;
    checkLight.decay = lit ? 1.4 : 2;
    if (!lit) checkLight.intensity = 0;
  }
  if (lit) {
    checkLight.intensity = 20 * f * f;
    checkLight.position.copy(look).lerp(camera.position, 0.5).add(_v.set(0, 1.3, 0)).addScaledVector(_v.setFromMatrixColumn(camera.matrixWorld, 0), 0.9);
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
      if (t > -0.3 && t < 0.92) {
        const d = camera.position.clone().addScaledVector(seg, Math.max(0, t)).setY(0.6).distanceTo(c);
        if (d < 0.7) want = 1 - 0.85 * k;
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
  melter.clear();
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
    p.sp.scale.setScalar(p.s ? p.s * (1 + p.age * 2.2) : 0.3 + p.age * 1.4);
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
  p.idleAt = simT;
}

// ------------------------------------------------------------------ the blade's arc
// A blow takes a tenth of a second: the eye (and a still) reads it by the arc the blade leaves
// in the air. Two ribbons (one per fighter), fed the blade's position while it is swinging and
// fading out behind it.
const TRAIL_N = 14;
function makeTrail() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3));
  const idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  return { mesh, n: 0, heat: 0, pts: [] };
}
const trails = [makeTrail(), makeTrail()];
function updateTrail(tr, p, on, dt) {
  if (on && p) {
    const w = weaponNow(p.fig);
    const l = tr.pts[0];
    // (held in a hit-stop the blade adds nothing to its arc)
    if (!l || Math.abs(l[0] - w.tip.x) + Math.abs(l[1] - w.tip.y) + Math.abs(l[2] - w.tip.z) > 0.006) tr.pts.unshift([w.tip.x, w.tip.y, w.tip.z, w.grip.x + (w.tip.x - w.grip.x) * 0.3, w.grip.y + (w.tip.y - w.grip.y) * 0.3, w.grip.z + (w.tip.z - w.grip.z) * 0.3]);
    if (tr.pts.length > TRAIL_N) tr.pts.length = TRAIL_N;
    tr.heat = 1;
  } else if (tr.heat > 0) {
    tr.heat = Math.max(0, tr.heat - dt * 5);
    if (tr.heat <= 0) tr.pts.length = 0;
  }
  const n = tr.pts.length;
  tr.mesh.visible = n > 1 && tr.heat > 0;
  if (!tr.mesh.visible) return;
  const pos = tr.mesh.geometry.attributes.position, col = tr.mesh.geometry.attributes.color;
  for (let i = 0; i < TRAIL_N; i++) {
    const q = tr.pts[Math.min(i, n - 1)];
    pos.setXYZ(i * 2, q[0], q[1], q[2]);
    pos.setXYZ(i * 2 + 1, q[3], q[4], q[5]);
    const k = i < n ? Math.pow(1 - i / (n - 1 || 1), 1.6) * tr.heat * 0.55 : 0;
    col.setXYZ(i * 2, k, k * 0.93, k * 0.78);
    col.setXYZ(i * 2 + 1, k * 0.25, k * 0.22, k * 0.18);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
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
function chooseDuelAngle(a, mid, dist, lowH = 1, prefer = null) {
  const view = playerView();
  const toPlayer = view.pos.clone().sub(mid).setY(0).normalize();
  const skip = [a.mover, a.cap];
  let best = null;
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    // a three-quarter view reads best: the two overlap a little in depth (so both fill a tall
    // phone screen) but neither hides the other; head-on only if nothing else is clear
    const across = Math.abs(dir.dot(a.dir));
    for (const h of [lowH, lowH + 0.75]) {
      const cam = mid.clone().addScaledVector(dir, dist).setY(h);
      // off the board is fine (the room is empty air there) until the eye is far out over the table
      const out = Math.max(Math.abs(cam.x), Math.abs(cam.z));
      const vh = a.vHome || a.capPos;
      let near = 0;
      for (const p of pieces.values()) if (!skip.includes(p) && Math.hypot(p.fig.group.position.x - cam.x, p.fig.group.position.z - cam.z) < 0.85) near++;
      const score = (blockers(cam, a.approach.clone().setY(0.6), skip) + blockers(cam, vh.clone().setY(0.6), skip)) * 2.2 + near * 3 + Math.abs(across - 0.38) * 2.0 + (across > 0.8 ? 1.5 : 0) - dir.dot(a.dir) * 0.35 -
        dir.dot(toPlayer) * 0.45 + (h > lowH ? 0.9 : 0) + (out > 6.4 ? 2 + (out - 6.4) : 0) - (prefer ? dir.dot(prefer) * 1.6 : 0);
      if (!best || score < best.score) best = { score, dir, h };
    }
  }
  return best;
}

// An epic's camera: over a fighter's shoulder, or low on the board looking up at the two (a hero
// shot); null where a statue stands in the way.
function epicShot(a, type) {
  const A = a.mover.fig.group.position, V = a.cap ? a.cap.fig.group.position : a.vHome;
  const dir = V.clone().sub(A).setY(0).normalize();
  const side = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(a.shotSpin);
  let pos, target;
  if (type === 'otsA' || type === 'otsV') {
    const fromA = type === 'otsA' || !a.cap;
    const X = fromA ? A : V, Y = fromA ? V : A;
    const hX = (fromA ? a.mover : a.cap).fig.height || 1, hY = (fromA ? (a.cap || a.mover) : a.mover).fig.height || 1;
    const d = fromA ? dir : dir.clone().negate();
    pos = X.clone().addScaledVector(d, -0.85).addScaledVector(side, fromA ? 0.5 : -0.5).setY(hX * 0.95 + 0.2);
    target = Y.clone().setY(hY * 0.55);
  } else if (type === 'low') {
    // a hero shot: the eye almost on the board, looking up at the two of them, both in frame
    // whatever the screen's shape (from whichever side is clear)
    const M = A.clone().lerp(V, 0.5).setY(0);
    const size = Math.max(a.mover.fig.height || 1, a.vH || 1), sep = Math.hypot(A.x - V.x, A.z - V.z);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanW = tanV * camera.aspect;
    const across = 0.55;
    const d = Math.max(2, (sep * 0.5 * Math.sqrt(1 - across * across) + 0.3 + 0.16 * size) / tanW, (size * 0.72 + 0.3) / tanV) + sep * 0.4 * across;
    const skip = [a.mover, a.cap];
    let best = null;
    // (the side is chosen when the shot is cut to, and kept while it runs)
    const held = a.camPos && a.lowSide;
    for (const sgn of held ? [a.lowSide.sgn] : [1, -1]) for (const back of held ? [a.lowSide.back] : [-1, 1]) {
      const c = M.clone().addScaledVector(side, sgn * d * Math.sqrt(1 - across * across)).addScaledVector(dir, back * d * across).setY(0.24);
      const sc = blockers(c, A.clone().setY(0.6), skip) + blockers(c, V.clone().setY(0.6), skip) + (sgn < 0 ? 0.2 : 0) + (back > 0 ? 0.3 : 0) + (Math.max(Math.abs(c.x), Math.abs(c.z)) > 6.6 ? 3 : 0);
      if (!best || sc < best.sc) best = { sc, c, sgn, back };
    }
    if (!held && best.sc > 1.2) return null;
    a.lowSide = best;
    pos = best.c;
    target = M.clone().setY(size * 0.52 + Math.max(0, V.y) * 0.5);
  } else return null;
  for (const p of pieces.values()) {
    if (p === a.mover || p === a.cap) continue;
    const q = p.fig.group.position;
    if (Math.hypot(q.x - pos.x, q.z - pos.z) < 0.5) return null;
  }
  return { pos, target };
}

function duelShot(a, phase) {
  // an epic cuts between angles (a hard cut, no glide); the kill is held a moment, then eases out
  let type = a.epic && phase?.cam ? phase.cam : 'wide';
  if (a.killT && a.t - a.killT > 0.9) type = 'wide';
  if (type !== a.camType) {
    if (a.epic && !(a.killT && type === 'wide')) a.camPos = null;
    a.camType = type;
  }
  if (type !== 'wide') {
    const s = epicShot(a, type);
    if (s) {
      if (!a.camPos) {
        a.camPos = s.pos.clone();
        a.camLook = s.target.clone();
      } else {
        a.camPos.lerp(s.pos, 0.08);
        a.camLook.lerp(s.target, 0.08);
      }
      shot.pos.copy(a.camPos);
      shot.target.copy(a.camLook);
      shot.want = 1;
      punchIn();
      return;
    }
  }
  // frame the attacker, the victim, and wherever the victim's body is flying
  const vh = a.vHome || a.capPos;
  const mid = vh.clone().lerp(a.approach, 0.5);
  let spread = 0;
  const dg = a.death?.p.fig.group;
  if (dg && dg.parent) {
    const vp = dg.position.clone();
    spread = Math.min(4, vp.distanceTo(mid) + Math.max(0, vp.y) * 0.6);
    mid.lerp(vp.setY(0), 0.3);
  }
  // as close as the two allow: they fill the frame, whatever their size and the screen's shape
  // (a pawn fight is filmed closer and lower than a king's)
  const size = Math.max(a.mover.fig.height || 1, a.vH || 1);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanW = tanV * camera.aspect;
  const sep = a.approach.distanceTo(vh);
  const lowH = 0.42 + 0.5 * size;
  const wide = 0.26 + 0.14 * size + (a.mover.fig.type === KNIGHT || a.vType === KNIGHT ? 0.3 : 0);
  const frame = (across) => Math.max(2.1, (sep * 0.5 * Math.sqrt(1 - across * across) + wide) / tanW, (size * 0.7 + 0.3) / tanV) + sep * 0.4 * across;
  if (!a.angle) a.angle = chooseDuelAngle(a, mid, frame(0.4), lowH);
  else if (a.reangle) {
    // the fight has moved: is this still the clear side? (it only swings round if it must, and
    // then along an arc about the two, never through them; an epic cuts)
    const n = chooseDuelAngle(a, mid, frame(0.4), lowH, a.angle.dir);
    if (a.epic && !a.camPos) a.angle = n;
    else a.angleGoal = n;
  }
  a.reangle = false;
  if (a.angleGoal) {
    const cur = Math.atan2(a.angle.dir.x, a.angle.dir.z), goal = Math.atan2(a.angleGoal.dir.x, a.angleGoal.dir.z);
    const nx = turnToward(cur, goal, 0.05);
    a.angle.dir.set(Math.sin(nx), 0, Math.cos(nx));
    a.angle.h += (a.angleGoal.h - a.angle.h) * 0.05;
  }
  a.angle.across = Math.min(0.9, Math.abs(a.angle.dir.dot(a.dir)));
  let dist = frame(a.angle.across) + spread * 0.9;
  const closeUp = a.slowed && (!a.killT || a.t - a.killT < 0.7);
  if (closeUp) {
    // the killing blow: in close on the victim, until the pieces scatter
    mid.copy(vh).lerp(a.approach, 0.3);
    dist *= 0.88;
  }
  // a slow dolly around the fight, never swinging far from the clear side
  const orbit = Math.sin((a.t - a.shotStart) * 0.35) * 0.3 * a.shotSpin;
  const off = a.angle.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit).multiplyScalar(dist);
  shot.pos.copy(mid).add(off).setY((closeUp ? a.angle.h * 0.85 : a.angle.h) + spread * 0.5);
  shot.target.copy(mid).setY(size * 0.46 + (dg && dg.parent ? Math.max(0, dg.position.y) * 0.5 : 0));
  if (a.wormUp) {
    // the queen's wormhole hangs over the victim: back off a little, drop the eye and look up to it
    const toHole = vh.clone().sub(mid).setY(0).multiplyScalar(0.35 * a.wormUp);
    shot.pos.addScaledVector(off, (1.1 * a.wormUp) / dist).add(toHole);
    shot.pos.y += (1.35 - shot.pos.y) * 0.5 * a.wormUp;
    shot.target.add(toHole).y += 0.6 * a.wormUp;
  }
  // moving in close for the kill and back out again: a quick glide, not a cut
  if (a.camPos) {
    shot.pos.copy(a.camPos.lerp(shot.pos, 0.14));
    shot.target.copy(a.camLook.lerp(shot.target, 0.14));
  } else {
    a.camPos = shot.pos.clone();
    a.camLook = shot.target.clone();
  }
  shot.want = 1;
  punchIn();
}
// every blow that lands jolts the camera in towards it for a moment
let camPunch = 0;
function punchIn() {
  if (camPunch > 0.002) shot.pos.lerp(shot.target, 0.09 * camPunch);
}
const punch = (x) => {
  camPunch = Math.max(camPunch, x);
};

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
const wormLight = prepareWormhole(scene);
prepareSpells(scene, camera, particles, squareMeshes);
const fx = [];

function launchBolt(from, to, color) {
  const s = glowSprite(color, 0.35);
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
  flash.position.copy(to).setY(2);
  flash.color.set(0xa8d4ff);
  scene.add(group);
  crash(0.5);
  zap(0.35);
  let t = 0;
  fx.push({
    update(dt) {
      t += dt;
      group.visible = Math.sin(t * 90) > -0.3;
      flash.intensity = Math.max(flash.intensity, 40 * Math.max(0, 1 - t / 0.35));
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
  // what's still standing of a statue coming apart
  for (const d of deaths) if (d.breakup?.standing && d.p.fig.group.parent) out.push({ x: d.p.fig.group.position.x, z: d.p.fig.group.position.z, h: d.breakup.standing.h, moving: false });
  return out;
});
// dust (and a few chips) where a heavy piece lands; settled rubble melts away
const melter = new Melter(scene);
let thudAt = 0;
rubble.onImpact = (pos, speed, b) => {
  if (b.m < 0.01) return;
  dustPuff(pos, Math.min(0.35, 0.1 + b.rad * 0.5), speed > 2 ? 3 : 1, b.white);
  if (speed > 2.2 && b.m > 0.05) rubble.chips(pos.clone().setY(pos.y + 0.03), new THREE.Vector3(0, 0.3, 0), b.g.children[0]?.material, 2, 0.4, state.ply);
  if (simT - thudAt > 0.09) {
    thudAt = simT;
    step(Math.min(0.35, 0.08 + speed * 0.05 * Math.min(1, b.m * 3)), b.m > 0.1);
  }
};
rubble.onMelt = (obj, white, vol) => melter.add(obj, white, vol);
const breakCtx = { rubble, scene, dust: (p, s, n, white) => dustPuff(p, s, n, white), crash: (v) => crash(v) };
function dustPuff(pos, size = 0.3, n = 4, white = true) {
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: white ? 0xcfc8ba : 0x6a6a70, transparent: true, opacity: 0.45, depthWrite: false }));
    sp.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * size * 0.4, (Math.random() - 0.5) * size));
    sp.position.y = Math.max(0.03, sp.position.y);
    sp.scale.setScalar(size * (0.6 + Math.random() * 0.5));
    scene.add(sp);
    puffs.push({ sp, s: sp.scale.x, v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.12 + Math.random() * 0.25, (Math.random() - 0.5) * 0.8), age: 0 });
  }
}
function kill(p, style, from, power = 1, blow = null) {
  const g = p.fig.group;
  const away = g.position.clone().sub(from).setY(0).normalize();
  const d = { p, style, t: 0, away, power, v: null, deathLen: 0 };
  if (p.fig.statue) {
    // stone on stone: the statue breaks at its joints and the pieces fly, chips burst from
    // where the blow landed, and dust rolls out across the board
    const fig = p.fig;
    // where the weapon landed (on the victim, at the height of the blow) and which way it swung
    const top = fig.height * 0.92;
    const hit = blow
      ? g.position.clone().addScaledVector(away, -0.12).setY(Math.min(top, Math.max(0.12, blow.at.y)))
      : g.position.clone().addScaledVector(away, -0.14).setY(fig.height * 0.56);
    const swing = blow ? blow.dir.clone() : away.clone();
    swing.y = Math.max(-0.45, Math.min(0.3, swing.y));
    swing.normalize();
    const cut = blow && blow.kind ? blow : null;
    if (cut?.kind === 'slice' || cut?.kind === 'cleave') {
      // chips spray from the line of the cut
      const along = cut.swing || swing;
      for (let i = -3; i <= 3; i++) rubble.chips(cut.point.clone().addScaledVector(along, i * 0.05), along.clone().addScaledVector(cut.normal, 0.3), fig.materials[0], 2, power * 0.7, state.ply);
    } else if (cut?.kind === 'stab') {
      // ... or burst out of the far side along the thrust
      rubble.chips(hit.clone().addScaledVector(cut.axis, 0.18), cut.axis, fig.materials[0], 14, power, state.ply);
      rubble.chips(hit, cut.axis.clone().negate().setY(0.4), fig.materials[0], 8, power * 0.6, state.ply);
    } else rubble.chips(hit, swing, fig.materials[0], 14, power * 0.8, state.ply);
    setRot(fig, 0.2);
    fig.group.updateMatrixWorld(true);
    // ... and it comes apart (breakup.js): along the cut, at its joints, over a second or two
    const how = cut ? { ...cut, swing: cut.swing || swing } : { kind: 'smash', swing, point: hit };
    d.breakup = new Breakup(breakCtx, fig, how, cut?.job, power, state.ply);
    dustPuff(cut?.point || hit, 0.3, 6, fig.isWhite);
    crash(0.9);
    clang(0.25);
    shake = 0.14 * power;
    send({ type: 'impact', heavy: true });
    deaths.push(d);
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
    if (d.breakup) {
      if (d.breakup.update(dt)) deaths.splice(i, 1);
      continue;
    }
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
// a sword fight is mostly flat cuts, a good share of thrusts, and now and then something else:
// pick the kind of blow by those odds, then a blow of that kind (never the same one twice running)
const ODDS = { cut: 0.55, thrust: 0.3, other: 0.15 };
function pickBlow(fig, list, not) {
  const l = list.length > 1 ? list.filter((x) => x !== not) : list;
  const by = {};
  for (const m of l) {
    const c = moveInfo(fig, m).cat;
    (by[c] = by[c] || []).push(m);
  }
  const cats = Object.keys(by);
  let r = Math.random() * cats.reduce((s, c) => s + (ODDS[c] || 0.1), 0);
  for (const c of cats) {
    r -= ODDS[c] || 0.1;
    if (r <= 0) return pick(by[c]);
  }
  return pick(l);
}
// How long a fight runs: 'quick' (one exchange, then the finisher), 'standard', or 'epic' (a long
// duel: footwork round the square, combos, wounds, a broken blade, the tables turned, and the
// decisive blow in slow motion with the camera cutting between angles). The app sends `battle`.
const battleLen = () => {
  const b = window.__forceBattle || state.battle;
  return b === 'quick' || b === 'epic' ? b : 'standard';
};
const chance = (p) => Math.random() < p;
// the wounds a blow that gets through can do
const WOUNDS = { cut: ['groove', 'chunk', 'crest'], thrust: ['chunk', 'chunk', 'groove'], other: ['chunk', 'crest'] };
// ---- the fight, composed. A fight is a script of beats (an exchange of blows, a feint, the
// blades bound, a pommel or a shoulder or a shield in the face, footwork, a spell, a ward) and an
// ending (the finishing blow; knocked down, crawling, finished on the ground; disarmed and cut
// down; a spell; the rook toppling onto its foe or crushing it; the knight's horse trampling it;
// the queen's wormhole). Each is chosen at random, weighted by who is fighting whom, and the same
// pairing never fights the same fight twice running.
const CASTERS = [BISHOP, ROOK, QUEEN, KING];
const lastFight = {};
let lastEnd = '';
const pickW = (opts) => {
  let r = Math.random() * opts.reduce((s, o) => s + o[1], 0);
  for (const o of opts) if ((r -= o[1]) <= 0) return o[0];
  return opts[0][0];
};
// how a piece likes to finish a fight
const ENDINGS = {
  [PAWN]: [['strike', 0.45], ['down', 0.35], ['disarm', 0.2]],
  [KNIGHT]: [['strike', 0.35], ['trample', 0.35], ['down', 0.3]],
  [BISHOP]: [['strike', 0.5], ['down', 0.3], ['disarm', 0.2]],
  [ROOK]: [['strike', 0.08], ['topple', 0.32], ['hop', 0.25], ['ram', 0.2], ['down', 0.15]],
  [QUEEN]: [['strike', 0.5], ['disarm', 0.25], ['down', 0.25]],
  [KING]: [['strike', 0.5], ['down', 0.3], ['disarm', 0.2]],
};
function composeFight(A, V, len) {
  const tA = A.fig.type, tV = V.fig.type;
  const armA = arsenal(A.fig), armV = arsenal(V.fig);
  const beats = [];
  const force = window.__forceSpell || null; // (testing)
  const forceEnd = window.__forceEnd || null;
  // the queen and a pawn: most often she claps up a wormhole for it
  if (tA === QUEEN && tV === PAWN && !force && !forceEnd && (window.__forceFin ? window.__forceFin === 'clap' : Math.random() < 0.6)) {
    if (len !== 'quick') beats.push({ t: 'blow', who: 'A' });
    if (len === 'epic') beats.push({ t: 'circle', cam: 'low' }, { t: 'blow', who: 'V', cam: 'otsV' }, { t: 'blow', who: 'A', hit: true, react: 'kneel', cam: 'wide' }, { t: 'step', mode: 'press', cam: 'otsA' });
    return { beats, end: { t: 'wormhole' } };
  }
  // a spell in this fight? (about half the fights of a caster: to open, mid-fight or to finish)
  const casts = CASTERS.includes(tA) && (force ? SPELL[force]?.who === tA : Math.random() < 0.48);
  let spellAt = casts ? (force && window.__forceSpellAt) || pickW([['open', 0.3], ['mid', 0.25], ['end', 0.45]]) : null;
  const mySpell = casts ? (force && SPELL[force]?.who === tA ? force : pick(SPELLS_OF[tA])) : null;
  const canWard = CASTERS.includes(tV);
  // a spell that doesn't kill: warded off, or it hurts (or throws him down, and he gets up again)
  const spellBeat = (who, s) => {
    const def = who === 'A' ? tV : tA;
    const ward = CASTERS.includes(def) && Math.random() < 0.5;
    const knocks = s === 'shockwave' || s === 'quake' || s === 'levitate';
    return { t: 'spell', who, spell: s, outcome: ward ? 'ward' : knocks && len === 'epic' ? 'down' : 'wound' };
  };
  const exchange = (n, o = {}) => {
    // n beats of the exchange, the defender answering now and then
    for (let i = 0; i < n; i++) {
      const who = i % 2 && Math.random() < 0.75 ? 'V' : 'A';
      // (a castle tower fights with its mass more than with its stone arms' sword)
      const tower = (who === 'A' ? tA : tV) === ROOK;
      // (a quick fight has no time for footwork or a feint: blows, and a body blow now and then)
      const q = len === 'quick' ? 0 : 1;
      const kind = pickW([['blow', tower ? 0.25 : 0.45], ['feint', (tower ? 0.04 : 0.14) * q], ['bind', (tower ? 0.04 : 0.12) * q], ['special', tower ? 0.5 : 0.17], ['step', (o.circles ? 0.08 : 0.04) * q], ['circle', o.circles ? 0.08 : 0]]);
      const n0 = beats.length;
      if (kind === 'blow') beats.push({ t: 'blow', who, hit: (o.hits || len !== 'quick') && Math.random() < (who === 'A' ? 0.3 : 0.14) });
      else if (kind === 'feint') beats.push({ t: 'feint', who }, { t: 'blow', who, late: true, hit: Math.random() < 0.5 });
      else if (kind === 'bind') beats.push({ t: 'bind', win: Math.random() < 0.65 ? 'A' : 'V' });
      else if (kind === 'special') {
        const arm = who === 'A' ? armA : armV;
        const mv = pick(arm.specials.filter((m) => m !== 'trample' || who === 'A'));
        beats.push({ t: 'special', who, move: mv, outcome: mv === 'disarm' ? 'stagger' : pickW([['stagger', 0.55], ['hurt', 0.3], ['block', 0.15]]) });
      } else if (kind === 'step') beats.push({ t: 'step', mode: pick(['press', 'retreat', 'side']) });
      else beats.push({ t: 'circle' });
      for (let j = n0; j < beats.length; j++) beats[j].fill = true;
    }
  };
  // the ending
  let end;
  if (forceEnd) end = { t: forceEnd };
  else if (spellAt === 'end') end = { t: 'spellKill', spell: mySpell };
  else end = { t: pickW(ENDINGS[tA]) };
  if (end.t === 'spellKill' && !end.spell) end.spell = force || pick(SPELLS_OF[tA] || ['lightning']);
  if (end.t === 'spellKill' && SPELL[end.spell]?.who !== tA) end = { t: 'strike' };
  if (['topple', 'hop', 'ram'].includes(end.t) && tA !== ROOK) end = { t: 'strike' };
  if (end.t === 'trample' && tA !== KNIGHT) end = { t: 'strike' };
  // (the long endings leave less time for the exchange before them)
  const long = ['down', 'disarm', 'spellKill', 'topple'].includes(end.t);
  if (spellAt === 'open') beats.push(spellBeat('A', mySpell));
  if (len === 'quick') {
    if (spellAt !== 'open') exchange(long ? 1 : 2);
  } else if (len === 'standard') {
    if (spellAt === 'mid') {
      exchange(2);
      beats.push(spellBeat('A', mySpell));
      exchange(1);
    } else exchange((spellAt === 'open' ? 3 : 5) - (long ? 1 : 0));
  } else {
    // an epic: circling, a flurry each way, first blood, the defender turning the tables (a
    // spell of his own, if he has one), a near miss, a broken blade, an arm lost, then the end
    beats.push({ t: 'circle', cam: 'low' });
    exchange(5, { circles: true });
    beats.push({ t: 'blow', who: 'A', hit: true, react: 'kneel', cam: 'low' });
    if (spellAt === 'mid') beats.push(spellBeat('A', mySpell));
    beats.push({ t: 'blow', who: 'V', heavy: true, cam: 'otsV' });
    if (CASTERS.includes(tV) && Math.random() < 0.5) beats.push(spellBeat('V', pick(SPELLS_OF[tV])));
    else beats.push({ t: 'special', who: 'V', move: pick(armV.specials.filter((m) => m !== 'trample')), outcome: 'stagger', cam: 'wide' });
    beats.push({ t: 'step', mode: 'press', cam: 'otsV', who: 'V' });
    exchange(4, { circles: true });
    beats.push({ t: 'blow', who: 'V', dodge: true, cam: 'low' });
    const snapV = chance(0.65);
    beats.push({ t: 'blow', who: 'A', heavy: true, snap: snapV ? 'V' : null, cam: 'otsA' });
    if (!snapV) beats.push({ t: 'blow', who: 'V', heavy: true, snap: 'A', cam: 'wide' });
    beats.push({ t: 'bind', win: 'A', cam: 'otsA' });
    beats.push({ t: 'blow', who: 'A', hit: 'sever', cam: 'wide' });
    if (chance(0.6)) beats.push({ t: 'blow', who: 'V', cam: 'otsV', dodge: chance(0.5) });
  }
  return { beats, end };
}

function planDuel(a, walkTime) {
  const A = a.mover, V = a.cap;
  const armA = arsenal(A.fig), armV = arsenal(V.fig);
  const len = battleLen();
  a.len = len;
  a.epic = len === 'epic';
  // stand off at the attacker's reach: where its blows land (with their own lunge), a step short
  const g = A.fig.group;
  let reach = 0;
  for (const m of armA.blows) {
    const info = moveInfo(A.fig, m);
    reach += g.worldToLocal(probeMove(A.fig, 'S_' + m, info.at, null).tip).z / armA.blows.length;
  }
  reach = Math.max(0.64, Math.min(1.3, reach + 0.24 + 0.08));
  a.vHome = a.capPos.clone();
  a.vH = V.fig.height || 1;
  a.vType = V.fig.type;
  a.approach = a.capPos.clone().addScaledVector(a.dir, -reach);
  a.reach = reach;
  // (a long way to come is covered at a run: the time is for the fight)
  a.phases.push({ name: 'walk', d: Math.min(walkTime, a.epic ? 2.4 : 1.7), a: a.from, b: a.approach });
  a.phases.push({ name: 'square', d: len === 'quick' ? 0.12 : a.epic ? 0.5 : 0.2, cam: 'wide' }); // on guard, eye to eye
  // compose it (never the same fight twice running for this pairing)
  const key = A.fig.type + '-' + V.fig.type + '-' + len;
  let fight, sig;
  for (let i = 0; i < 10; i++) {
    fight = composeFight(A, V, len);
    sig = fight.beats.map((b) => b.t + (b.move || b.spell || '') + (b.who || '')).join() + '|' + fight.end.t + (fight.end.spell || '');
    // (nor does a fight end the way the one before it did, whoever fought that)
    if (sig !== lastFight[key] && fight.end.t + (fight.end.spell || '') !== lastEnd) break;
  }
  lastEnd = fight.end.t + (fight.end.spell || '');
  lastFight[key] = sig;
  a.fightSig = sig;
  let lastA = null, lastV = null;
  const quick = len === 'quick';
  const first = a.phases.length;
  let group = 0, mark = a.phases.length;
  // (each beat's phases carry its number, so a beat can be dropped whole)
  const markGroup = () => {
    for (let i = mark; i < a.phases.length; i++) a.phases[i].group = group;
    mark = a.phases.length;
  };
  for (const b of fight.beats) {
    markGroup();
    group++;
    if (b.t === 'circle') {
      a.phases.push({ name: 'circle', d: 0.9 + Math.random() * 0.4, drive: b.drive, cam: b.cam, fill: b.fill });
      continue;
    }
    if (b.t === 'step') {
      a.phases.push({ name: 'step', d: 0.55 + Math.random() * 0.2, mode: b.mode, who: b.who || 'A', cam: b.cam, fill: b.fill });
      continue;
    }
    if (b.t === 'feint') {
      const fig = b.who === 'A' ? A.fig : V.fig;
      a.phases.push({ name: 'feint', d: moveInfo(fig, 'feint').d * 0.8, who: b.who, cam: b.cam, fill: b.fill });
      continue;
    }
    if (b.t === 'bind') {
      a.phases.push({ name: 'bind', d: (quick ? 0.8 : 1.0) + Math.random() * 0.25, win: b.win, cam: b.cam, fill: b.fill });
      a.phases.push({ name: 'shove', d: 0.7, who: b.win, cam: b.cam, fill: b.fill });
      continue;
    }
    if (b.t === 'special') {
      const fig = b.who === 'A' ? A.fig : V.fig, def = b.who === 'A' ? V.fig : A.fig;
      const info = moveInfo(fig, b.move);
      let outcome = b.outcome;
      if (b.move === 'disarm') outcome = 'stagger'; // (in the exchange he holds on to it: a disarm ends a fight)
      if (outcome === 'block' && !def.shieldAt) outcome = 'stagger';
      const react = outcome === 'stagger' ? 'stagger' : outcome === 'hurt' ? 'hurt' : outcome === 'disarmed' ? 'disarmed' : outcome === 'down' ? 'down' : 'parry';
      const rd = moveInfo(def, react).d;
      a.phases.push({ name: 'special', d: Math.max(info.d * 0.74, info.hits[0] * info.d + rd * 0.7), who: b.who, move: b.move, info, outcome, react, cam: b.cam, fill: b.fill });
      continue;
    }
    if (b.t === 'spell') {
      const caster = b.who === 'A' ? A.fig : V.fig;
      const sp = SPELL[b.spell];
      const info = moveInfo(caster, sp.move);
      const release = info.hits[0] * info.d;
      const after = b.outcome === 'down' ? 2.6 : b.outcome === 'ward' ? 1.2 : 1.1;
      a.phases.push({ name: 'spell', d: release + sp.impact + after, who: b.who, spell: b.spell, info, release, outcome: b.outcome, cam: b.cam || 'wide' });
      continue;
    }
    // a blow
    const att = b.who === 'A';
    const fig = att ? A.fig : V.fig;
    const move = att ? (lastA = pickBlow(fig, armA.blows, lastA)) : (lastV = pickBlow(fig, armV.blows, lastV));
    const info = moveInfo(fig, move);
    const defFig = att ? V.fig : A.fig;
    const r = Math.random();
    let hit = null;
    if (b.hit && (b.hit === 'sever' || !b.fill || canWound(att ? V : A))) {
      hit = b.hit === 'sever' ? 'sever' : WOUNDS[info.cat][(Math.random() * WOUNDS[info.cat].length) | 0];
      if (window.__forceHit && window.__forceHit !== true && !a.epic) hit = window.__forceHit; // (for testing)
      if (hit === 'crest' && defFig.damage?.crest) hit = 'chunk';
    }
    // dodged, or met with the blade (upright on the side the cut comes from, or beating a
    // thrust aside), or a heavy blow that drives the guard back; or it gets through
    let react = window.__forceReact && !hit ? window.__forceReact : b.dodge ? (chance(0.5) ? 'dodgeL' : 'dodgeR') : b.heavy || b.snap || b.late ? parryFor(info, undefined, true)
      : r < 0.15 && !a.epic ? (chance(0.5) ? 'dodgeL' : 'dodgeR') : parryFor(info, undefined, info.heavy && r < 0.65);
    if (hit) react = b.react || (hit === 'sever' ? 'hurt' : ['hurt', 'clutch', 'kneel', 'hurt'][(Math.random() * 4) | 0]);
    if (react === 'clutch' && defFig.damage?.severed) react = 'hurt';
    // the next blow comes as this one recovers (a wounded fighter takes a moment longer)
    const impact = info.hits[info.hits.length - 1] * info.d;
    // (the answer comes while this blow is still recovering: a riposte, not a turn taken)
    // (and in the thick of it a blow is thrown from wherever the last one left the blade: no going back to guard first)
    const lead = Math.min(0.2, impact * 0.3);
    let d = impact - lead + (react.startsWith('stagger') ? 0.5 : react.startsWith('dodge') ? 0.36 : 0.32);
    if (b.snap) d += 0.25;
    if (hit) d = impact - lead + { hurt: 0.72, clutch: 0.95, kneel: 1.35 }[react];
    a.phases.push({ name: 'blow', d, lead, who: b.who, move, info, react, hit, snap: b.snap, cam: b.cam, late: b.late, fill: b.fill, shield: !!defFig.shieldAt && !react.startsWith('dodge') && !react.endsWith('R') && !hit });
  }
  markGroup();
  planEnding(a, fight.end, lastA);
  a.phases.push({ name: 'walk', d: 0.6, a: null, b: a.to, settle: true, fromHere: true });
  a.phases.push({ name: 'turnback', d: 0.35 });
  // keep to the length asked for: drop beats of the exchange (from the end of it) while the fight
  // runs long; a standard fight keeps at least one
  const budget = { quick: 6.1, standard: 8.7, epic: 23.5 }[len] - (a.wakeD || 0) - 0.3;
  const total = () => a.phases.reduce((s, ph) => s + ph.d, 0);
  const keep = len === 'quick' ? 0 : 1;
  for (let guard = 0; guard < 40 && total() > budget; guard++) {
    const groups = [...new Set(a.phases.filter((ph) => ph.group).map((ph) => ph.group))];
    if (groups.length <= keep) break;
    // (a spell beat is the last to go)
    const rev = [...groups].reverse();
    // (of the exchange's beats, the shortest one whose going is enough; else the last of them)
    const over = total() - budget;
    const durOf = (x) => a.phases.reduce((s, ph) => s + (ph.group === x ? ph.d : 0), 0);
    const fills = rev.filter((x) => a.phases.some((ph) => ph.group === x && ph.fill));
    const enough = fills.filter((x) => durOf(x) >= over).sort((x, y) => durOf(x) - durOf(y))[0];
    const g = enough ?? fills[0] ?? rev.find((x) => !a.phases.some((ph) => ph.group === x && ph.name === 'spell')) ?? groups[groups.length - 1];
    a.phases = a.phases.filter((ph) => ph.group !== g);
  }
  // the downed foe's struggle and the wait after the kill give a little, too
  for (const ph of a.phases) if (total() > budget && (ph.name === 'downed' || ph.name === 'wait')) ph.d = Math.max(ph.name === 'wait' ? 0.6 : 0.7, ph.d - (total() - budget));
  // (for testing: the fight as it will be fought, after the cuts)
  window.__lastFight = a.phases.filter((ph) => ph.group || ['kill', 'body', 'downed'].includes(ph.name) || ph.kill).map((ph) => ph.name + (ph.move || ph.spell || '') + (ph.who && ph.group ? ph.who : '')).join() + '|' + a.endKind;
  void first;
}

// the ending's phases
function planEnding(a, end, lastA) {
  const A = a.mover, V = a.cap;
  const armA = arsenal(A.fig);
  const len = a.len;
  const waitD = len === 'quick' ? 0.6 : a.epic ? 1.4 : 0.8;
  a.endKind = end.t;
  if (end.t === 'wormhole') {
    // (see stepWormhole: the wormhole flashes WORM.flash after her cast, then she takes her staff back)
    const fi = moveInfo(A.fig, 'clap');
    a.phases.push({ name: 'kill', wormhole: true, d: fi.hits[2] * fi.d + WORM.flash + 0.5, move: 'clap', info: fi, cam: 'wide' });
    a.phases.push({ name: 'wait', d: 0.45 });
    return;
  }
  if (end.t === 'spellKill') {
    const sp = SPELL[end.spell];
    const info = moveInfo(A.fig, sp.move);
    const release = info.hits[0] * info.d;
    a.phases.push({ name: 'spell', kill: true, d: release + sp.kill + 0.35, who: 'A', spell: end.spell, info, release, outcome: 'kill', cam: a.epic ? 'low' : 'wide' });
    a.phases.push({ name: 'wait', d: waitD * 0.75 });
    return;
  }
  if (end.t === 'down') {
    // knocked off his feet (a body blow, or a heavy cut he can't hold), he crawls back or tries
    // to rise, and is finished on the ground
    const opts = armA.specials.filter((m) => m !== 'disarm');
    const mv = pick(opts.length ? opts : ['charge']);
    const info = moveInfo(A.fig, mv);
    const rd = moveInfo(V.fig, 'down').d;
    a.phases.push({ name: 'special', d: info.hits[0] * info.d + rd + 0.15, who: 'A', move: mv, info, outcome: 'down', react: 'down', cam: a.epic ? 'low' : null });
    a.phases.push({ name: 'downed', d: (len === 'quick' ? 0.8 : 1.15) + Math.random() * 0.4, how: Math.random() < 0.5 ? 'crawl' : 'rise' });
    const fin = A.fig.type === KNIGHT ? 'trample' : A.fig.type === ROOK ? 'hop' : 'execute';
    const fi = moveInfo(A.fig, fin);
    const killAt = fi.hits[fi.hits.length - 1] * fi.d;
    a.phases.push({ name: 'body', d: killAt + 0.4, move: fin, info: fi, killAt, onGround: true, cam: a.epic ? 'low' : null });
    a.phases.push({ name: 'wait', d: waitD });
    return;
  }
  if (end.t === 'disarm') {
    const info = moveInfo(A.fig, 'disarm');
    a.phases.push({ name: 'special', d: info.hits[0] * info.d + 0.75, who: 'A', move: 'disarm', info, outcome: 'disarmed', react: 'disarmed' });
    V.fig.disarmed = true;
  }
  if (['topple', 'hop', 'ram', 'trample'].includes(end.t)) {
    const fi = moveInfo(A.fig, end.t);
    const killAt = fi.hits[fi.hits.length - 1] * fi.d;
    a.phases.push({ name: 'body', d: (end.t === 'topple' ? fi.d : killAt + 0.4), move: end.t, info: fi, killAt, cam: a.epic ? 'low' : null });
    a.phases.push({ name: 'wait', d: waitD * 0.8 });
    return;
  }
  // the finishing blow
  const fin = armA.finishers.includes(window.__forceFin) ? window.__forceFin : pickBlow(A.fig, armA.finishers, lastA); // (__forceFin: for testing)
  const fi = moveInfo(A.fig, fin);
  const killAt = fi.hits[fi.hits.length - 1] * fi.d;
  a.phases.push({ name: 'kill', d: killAt + 0.32, move: fin, info: fi, killAt, cam: a.epic ? 'low' : null });
  a.phases.push({ name: 'wait', d: waitD });
}

// where a fighter stands when not stepping in: the attacker at its approach, the victim at its own
// spot (its square, until the footwork moves the fight about)
const homeOf = (a, p) => (p === a.mover ? a.approach : a.vHome);
// a spot a fighter can stand on: on the board, clear of every other statue
function clearSpot(a, p) {
  if (Math.abs(p.x) > 3.62 || Math.abs(p.z) > 3.62) return false;
  for (const q of pieces.values()) {
    if (q === a.mover || q === a.cap) continue;
    if (q.fig.group.position.distanceTo(_v2.set(p.x, q.fig.group.position.y, p.z)) < 0.74) return false;
  }
  return true;
}
const _v2 = new THREE.Vector3();
// Footwork: the two circle each other (turning about the point between them), and the fight
// drifts about the square and onto the ones beside it, wherever there's room.
function planCircle(a, phase) {
  const a0 = a.approach.clone(), v0 = a.vHome.clone();
  const M0 = a0.clone().lerp(v0, 0.5);
  const cands = [];
  for (const th of [0.5, 0.8, 1.1, 1.4, 0.35]) {
    for (const s of [1, -1]) {
      const shifts = phase.drive ? [a.dir.clone().multiplyScalar(-0.45), a.dir.clone().multiplyScalar(-0.25), new THREE.Vector3()] : [new THREE.Vector3(), new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).setLength(0.4), new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).setLength(0.25)];
      for (const sh of shifts) {
        let ok = true;
        for (let i = 1; i <= 6 && ok; i++) {
          const k = i / 6;
          const M = M0.clone().addScaledVector(sh, k);
          for (const p0 of [a0, v0]) if (!clearSpot(a, p0.clone().sub(M0).applyAxisAngle(UPV, s * th * k).add(M))) ok = false;
        }
        if (ok) cands.push({ th: s * th, sh });
      }
    }
  }
  const c = cands.length ? cands[(Math.random() * Math.min(cands.length, 8)) | 0] : { th: 0, sh: new THREE.Vector3() };
  phase.a0 = a0;
  phase.v0 = v0;
  phase.M0 = M0;
  phase.th = c.th;
  phase.sh = c.sh;
}
const UPV = new THREE.Vector3(0, 1, 0);
function stepCircle(a, phase, idx, k, once) {
  const A = a.mover, V = a.cap;
  if (once('circle' + idx)) {
    planCircle(a, phase);
    act(A, 'shuffle', { loop: true, fade: 0.2 });
    if (V) act(V, 'shuffle', { loop: true, fade: 0.2 });
  }
  const e = ease(k);
  const M = phase.M0.clone().addScaledVector(phase.sh, e);
  const pa = phase.a0.clone().sub(phase.M0).applyAxisAngle(UPV, phase.th * e).add(M);
  const pv = phase.v0.clone().sub(phase.M0).applyAxisAngle(UPV, phase.th * e).add(M);
  A.fig.group.position.copy(pa);
  if (V) V.fig.group.position.copy(pv);
  a.approach.copy(pa);
  a.vHome.copy(pv);
  a.dir.copy(pv).sub(pa).setY(0).normalize();
  const step2 = Math.floor(a.t / 0.25);
  if (step2 !== a.lastStep) {
    a.lastStep = step2;
    footDust(step2 % 2 ? pa : pv);
  }
  if (k >= 1 && once('circled' + idx)) {
    // (the fight has turned: the camera finds its side again)
    if (a.epic) a.camPos = null;
    a.reangle = true;
    act(A, 'guard', { loop: true, fade: 0.2 });
    if (V) act(V, 'guard', { loop: true, fade: 0.2 });
  }
}

// (the statues stand on the board: a cut goes in at the chest, a high one at the shoulders)
const heightOf = (p, line) => {
  const h = Math.max(0.45, p.fig.height || 1);
  return 0.02 + h * (line === 'high' ? 0.76 : line === 'low' ? 0.3 : 0.56);
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
// the instant of contact: a hard white star for a frame or two, and sparks thrown along the blow
function impactFlash(at, push, size = 0.5) {
  particles.burst(at, { color: 0xfffbf0, n: 1, speed: 0, up: 0, size, life: 0.11, gravity: 0 });
  particles.burst(at, { color: 0xffd890, n: 1, speed: 0, up: 0, size: size * 1.35, life: 0.07, gravity: 0 });
  if (push) for (let i = 0; i < 7; i++) particles.burst(at.clone().addScaledVector(push, 0.03 * i), { color: 0xffeeb8, n: 1, speed: 1.6 + i * 0.5, up: 0.5, size: 0.035, life: 0.3, gravity: 5 });
}
function sparksAt(at, push, defender, heavy, shield = false) {
  impactFlash(at, push, heavy ? 0.62 : 0.42);
  if (heavy) dustPuff(defender.fig.group.position.clone().setY(0.04), 0.22, 3, defender.fig.isWhite);
  particles.burst(at, { color: 0xffe2a0, n: heavy ? 40 : 26, speed: heavy ? 3.4 : 2.6, up: 1, size: 0.07, life: 0.45 });
  particles.burst(at, { color: 0xfff6e0, n: 10, speed: 5, up: 0.4, size: 0.04, life: 0.18, gravity: 0 });
  rubble.chips(at, push.clone().setY(0.3), defender.fig.materials[0], heavy ? 14 : 8, heavy ? 0.8 : 0.55, state.ply);
  flash.position.copy(at);
  flash.color.set(0xffd59a);
  flash.intensity = heavy ? 22 : 14;
  sfx(shield ? 'shield_block' : 'sword_clash', { vol: heavy ? 1 : 0.8 });
  send({ type: 'impact', heavy: false });
  shake = Math.max(shake, heavy ? 0.06 : 0.035);
  punch(heavy ? 0.8 : 0.45);
}

// A parried blow still carries its weight: the defender is knocked back (feet skidding and
// rocking, body whipping, head snapping) and settles; the striker's blade rebounds off the guard
// the way it came; a glancing edge knocks a flake of stone off the defender; the camera jolts.
function blowLands(striker, defender, at, push, power) {
  knock(defender.fig, push, power);
  knock(striker.fig, push.clone().negate(), power * 0.25);
  rebound(striker.fig, 0.45 + 0.2 * Math.random());
  if (power > 1 || Math.random() < 0.5) rubble.flake(at, push.clone().setY(0.2), defender.fig.materials[0], 0.025 + 0.025 * Math.random() * power, state.ply);
  camKick.addScaledVector(push, 0.05 * power).add(new THREE.Vector3(0, -0.025 * power, 0));
}

// where on the defender a blow that gets through is aimed, for the wound it does
function woundTarget(defender, striker, kind) {
  const dg = defender.fig.group;
  const toward = striker.fig.group.position.clone().sub(dg.position).setY(0).normalize();
  const h = Math.max(0.45, defender.fig.height || 1);
  const t = dg.position.clone().addScaledVector(toward, 0.07);
  t.y = 0.02 + h * ({ crest: 0.9, chunk: 0.66, groove: 0.56, sever: 0.58 }[kind] || 0.6);
  if (kind === 'sever') {
    // out at the off arm's elbow (the figure's left is its +x)
    const ry = dg.rotation.y, s = defender.fig.kind === 'oneL' ? -1 : 1;
    t.add(new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)).multiplyScalar(0.13 * s * h));
  }
  return t;
}

function stepBlow(a, phase, idx, tt, dt, once) {
  const striker = phase.who === 'A' ? a.mover : a.cap;
  const defender = phase.who === 'A' ? a.cap : a.mover;
  const { info, move } = phase;
  const impact = info.hits[info.hits.length - 1] * info.d;
  const kI = impact / info.d;
  if (once('blow' + idx)) {
    defender.fig.group.position.copy(homeOf(a, defender));
    a.dir.copy(a.vHome).sub(a.approach).setY(0).normalize();
    a.reangle = true;
    // squarely face to face (the footwork may have left them a little off)
    striker.fig.group.rotation.y = angleTo(homeOf(a, striker), homeOf(a, defender));
    defender.fig.group.rotation.y = angleTo(homeOf(a, defender), homeOf(a, striker));
    act(striker, move, { fade: 0.16 });
    striker.fig.move.t = phase.lead || 0;
    let target;
    if (phase.hit) target = woundTarget(defender, striker, phase.hit);
    else {
      target = defender.fig.group.position.clone().addScaledVector(defender.fig.group.position.clone().sub(striker.fig.group.position).setY(0).normalize(), -0.24);
      target.y = heightOf(defender, info.line);
    }
    phase.plan = aimBlow(a, striker, defender, 'S_' + move, kI, target, phase.hit ? 0.5 : 0.56);
    if (info.cast) phase.plan.tip = target.clone();
    // the wound is cut ahead of the blow (where the stone will be struck)
    const push = defender.fig.group.position.clone().sub(striker.fig.group.position).setY(0).normalize();
    if (phase.hit) phase.dmg = prepareDamage(rubble, defender.fig, phase.hit, phase.plan.tip.clone().lerp(target, 0.5), push, new THREE.Vector3(push.z, 0, -push.x));
    if (phase.snap) {
      const who = phase.snap === 'A' ? a.mover : a.cap;
      phase.snapPlan = prepareDamage(rubble, who.fig, 'snap', target, push);
    }
  }
  const plan = phase.plan;
  // time by the striker's own clip (a hit-stop holds it back from the phase's clock)
  tt = striker.fig.move.name === move ? striker.fig.move.t : phase.d;
  const home = homeOf(a, striker);
  striker.fig.group.position.copy(home).addScaledVector(plan.dir, plan.shift * stepEnvelope(tt, impact, phase.d));
  // a blow he had to take on his guard drives the defender back across the board
  if (phase.drive) {
    const dh = homeOf(a, defender);
    const k = smooth01((a.t - phase.driveAt) / 0.3) * phase.drive;
    if (k > phase.driven) {
      dh.addScaledVector(plan.dir, k - phase.driven);
      phase.driven = k;
      defender.fig.group.position.copy(dh);
    }
  }
  // the defender's answer, timed so its guard (or its sidestep) meets the blow
  if (!phase.hit) {
    const rInfo = moveInfo(defender.fig, phase.react);
    const rHit = rInfo.hits[0] * rInfo.d * (phase.late ? 0.55 : 1); // (fooled by a feint: late)
    if (tt >= impact - rHit && once('def' + idx)) {
      act(defender, phase.react, { fade: 0.1 });
      if (!phase.react.startsWith('dodge')) {
        // the guard goes where the blade will be: across it, a little short of its point
        const q = info.cast ? plan.tip : plan.grip.clone().lerp(plan.tip, 0.8);
        const r = aimAt(defender.fig, 'S_' + phase.react, rInfo.hits[0], q, phase.shield && defender.fig.shieldAt ? 'shield' : 'parry');
        setAim(defender.fig, r.aim);
        phase.defErr = r.err;
      }
    }
  } else if (tt >= impact - 0.3 && once('late' + idx)) act(defender, parryFor(info), { fade: 0.25 }); // too late, the guard comes up
  if (info.cast && tt >= impact - 0.32 && once('bolt' + idx)) {
    const w = weaponNow(striker.fig);
    launchBolt(w.butt, plan.tip, striker.fig.isWhite ? 0x9fd8ff : 0xc77dff);
  }
  // the blade checked by the guard (or bitten into the stone) springs back off it
  if (phase.recoilAt && a.t >= phase.recoilAt && once('recoil' + idx)) act(striker, 'recoil', { fade: 0.12 });
  if (!info.cast && tt > impact - 0.17 && tt < impact + 0.07) striker.swinging = true;
  if (!info.cast && tt > impact - 0.2 && once('whoosh' + idx)) sfx('sword_swing', { vol: info.heavy ? 0.9 : 0.7 });
  if (tt >= impact && once('clash' + idx)) {
    const push = defender.fig.group.position.clone().sub(striker.fig.group.position).setY(0).normalize();
    // the striker stays where the blow carried him (the fight moves about the board) ...
    plan.shift0 = plan.shift;
    if (clearSpot(a, home.clone().addScaledVector(plan.dir, plan.shift))) {
      home.addScaledVector(plan.dir, plan.shift);
      plan.shift = 0;
    }
    // ... and the defender gives ground under it: a step for a parry, more for a heavy blow or a wound
    if (!phase.react.startsWith('dodge')) {
      const want = phase.hit ? 0.18 : phase.react.startsWith('stagger') ? 0.15 : 0.1;
      const dh = homeOf(a, defender);
      for (const w of [want, want * 0.5]) {
        if (clearSpot(a, dh.clone().addScaledVector(plan.dir, w + 0.04))) {
          phase.drive = w;
          phase.driven = 0;
          phase.driveAt = a.t;
          break;
        }
      }
      if (phase.drive) footDust(dh);
    }
    if (phase.hit) {
      // it gets through: the stone is struck, and the wound stays
      act(defender, phase.react, { fade: 0.05 });
      setAim(defender.fig, null);
      const r = phase.dmg ? applyDamage(rubble, phase.dmg, push.clone().setY(0.2), state.ply, 1) : { at: plan.tip.clone() };
      rubble.chips(r.at, push.clone().setY(0.4), defender.fig.materials[0], 14, 0.8, state.ply);
      dustPuff(r.at, 0.3, 5, defender.fig.isWhite);
      impactFlash(r.at, push, 0.7);
      knock(defender.fig, push, 1.25);
      knock(striker.fig, push.clone().negate(), 0.2);
      flash.position.copy(r.at);
      flash.color.set(0xffe0b0);
      flash.intensity = 10;
      crash(0.45);
      clang(0.25);
      shake = Math.max(shake, 0.07);
      camKick.addScaledVector(push, 0.06).add(new THREE.Vector3(0, -0.03, 0));
      punch(1);
      a.hitStop = 0.16;
      phase.recoilAt = a.t + 0.1;
      sfx('sword_hit_stone');
      send({ type: 'impact', heavy: true });
      window.__duelLog?.push({ blow: move, by: striker.fig.type, hit: phase.hit, react: phase.react, aimErr: +plan.err.toFixed(3) });
      return;
    }
    if (phase.react.startsWith('dodge')) {
      whoosh(0.35);
      window.__duelLog?.push({ blow: move, by: striker.fig.type, react: phase.react, aimErr: +plan.err.toFixed(3), shift: +plan.shift0.toFixed(2) });
      return;
    }
    const sw = weaponNow(striker.fig);
    // the guard meets the blade where it really is (a last small correction), and the two stop
    // dead against each other
    const shieldUse = !!(phase.shield && defender.fig.shieldAt);
    if (!info.cast) snapGuard(defender, phase.react, sw, shieldUse);
    let dw = weaponNow(defender.fig);
    const meet = (s, d) => (shieldUse && d.shield ? contactPoint(s.grip, s.tip, d.shield, d.shield) : contactPoint(s.grip, s.tip, d.butt.distanceTo(d.grip) > 0.15 ? d.butt : d.grip, d.tip));
    let c;
    if (info.cast) c = { at: plan.tip.clone(), gap: 0 };
    else {
      c = meet(sw, dw);
      // still apart (the guard can't reach that far): the blade is brought onto the guard instead
      if (c.gap > 0.035) {
        const m2 = striker.fig.move;
        if (m2.name === move) {
          const target = _c2.clone();
          const r = aimAt(striker.fig, 'S_' + move, Math.min(1, m2.t / m2.d), target, 'parry', { from: striker.fig.aim?.$x, step: 0.12, iters: 14 });
          setAim(striker.fig, r.aim);
          striker.fig.mixer.update(0);
          dw = weaponNow(defender.fig);
          c = meet(weaponNow(striker.fig), dw);
          // (and the guard once more onto the blade where that has left it)
          if (c.gap > 0.035) {
            snapGuard(defender, phase.react, weaponNow(striker.fig), shieldUse);
            dw = weaponNow(defender.fig);
            c = meet(weaponNow(striker.fig), dw);
          }
        }
      }
    }
    const heavy = phase.react.startsWith('stagger');
    sparksAt(c.at, push, defender, heavy, shieldUse);
    blowLands(striker, defender, c.at, push, heavy ? 1.15 : 0.6);
    a.hitStop = heavy ? 0.13 : 0.08; // the blades bite: a beat of stillness
    phase.recoilAt = a.t + a.hitStop * 0.6;
    if (phase.snapPlan) {
      // the blade snaps: the broken end spins away
      applyDamage(rubble, phase.snapPlan, push.clone().multiplyScalar(phase.snap === 'A' ? -0.6 : 0.6).setY(0.5), state.ply, 1);
      crash(0.35);
      a.hitStop = 0.16;
    }
    window.__duelLog?.push({ blow: move, by: striker.fig.type, react: phase.react, snap: phase.snap || undefined, gap: +c.gap.toFixed(3), aimErr: +plan.err.toFixed(3), defErr: phase.defErr !== undefined ? +phase.defErr.toFixed(3) : null, shift: +plan.shift0.toFixed(2) });
  }
}

// The guard is brought onto the blade where the blade actually is at the moment they meet (the
// plan made at the start of the blow is a little off by then: the footwork, the knocks, the
// cross-fades). Two quick passes of the aim solver, from the aim it already has.
function snapGuard(def, react, sw, shield) {
  const fig = def.fig;
  const m = fig.move;
  if (m.name !== react) return;
  const k = Math.min(1, m.t / m.d);
  let target = sw.grip.clone().lerp(sw.tip, 0.72);
  for (let pass = 0; pass < 2; pass++) {
    const r = aimAt(fig, 'S_' + react, k, target, shield ? 'shield' : 'parry', { from: fig.aim?.$x, step: 0.12, iters: 14 });
    setAim(fig, r.aim);
    fig.mixer.update(0);
    // what's left over: aim at the striker's blade point plus the miss
    const dw = weaponNow(fig);
    const c = shield && dw.shield ? contactPoint(sw.grip, sw.tip, dw.shield, dw.shield) : contactPoint(sw.grip, sw.tip, dw.butt.distanceTo(dw.grip) > 0.15 ? dw.butt : dw.grip, dw.tip);
    if (c.gap < 0.025) break;
    target = target.clone().add(_c1.clone().sub(_c2).multiplyScalar(0.9));
  }
}

const faceOff = (a, p, q) => {
  p.fig.group.rotation.y = angleTo(homeOf(a, p), homeOf(a, q));
  q.fig.group.rotation.y = angleTo(homeOf(a, q), homeOf(a, p));
};
// how far forward of its feet a move carries the statue at time k (its lunge, its charge)
function lungeOf(fig, move, k) {
  const g = fig.group;
  const pr = probeMove(fig, 'S_' + move, k, null);
  return g.worldToLocal(pr.root.clone()).z;
}
// where on a statue to strike its body (chest, head)
const bodyPoint = (p, frac = 0.55) => p.fig.group.position.clone().setY((p.fig.height || 1) * frac);
// the castle tower and the horse are wider than a man
const bulk = (p) => (p.fig.type === ROOK ? 0.27 : p.fig.type === KNIGHT ? 0.3 : 0.17);

// ---- a feint: the big wind-up, checked; the defender bites (his guard comes up for nothing)
function stepFeint(a, phase, idx, tt, once) {
  const striker = phase.who === 'A' ? a.mover : a.cap, defender = phase.who === 'A' ? a.cap : a.mover;
  if (once('feint' + idx)) {
    faceOff(a, striker, defender);
    act(striker, 'feint', { fade: 0.12 });
  }
  if (tt >= 0.14 && once('bite' + idx)) act(defender, pick(['parryL', 'parryHigh', 'parryR']), { fade: 0.1 });
  if (tt >= 0.16 && once('fw' + idx)) sfx('sword_swing', { vol: 0.35 });
  const home = homeOf(a, striker);
  const dir = homeOf(a, defender).clone().sub(home).setY(0).normalize();
  striker.fig.group.position.copy(home).addScaledVector(dir, 0.1 * Math.sin(Math.PI * clamp01(tt / phase.d)));
  // the step it gives makes the dust skitter
  if (tt >= 0.36 && once('fd' + idx)) footDust(striker.fig.group.position);
}

// ---- the bind: the blades meet and lock between them, grinding, until one heaves the other off
function stepBind(a, phase, idx, tt, once) {
  const A = a.mover, V = a.cap;
  const dir = a.vHome.clone().sub(a.approach).setY(0).normalize();
  const dist = a.vHome.distanceTo(a.approach);
  if (once('bind' + idx)) {
    faceOff(a, A, V);
    act(A, 'bind', { fade: 0.14 });
    act(V, 'bind', { fade: 0.14 });
    // each steps in until the blades can cross, and both aim them at one point between them
    phase.sh = Math.max(0, Math.min(0.3, (dist - 0.78) / 2));
    const h = Math.min(heightOf(A, 'mid'), heightOf(V, 'mid')) + 0.06;
    const lift = A.fig.type === KNIGHT || V.fig.type === KNIGHT ? 0.12 : 0;
    phase.meet = a.approach.clone().lerp(a.vHome, 0.5).setY(h + lift);
    const k = moveInfo(A.fig, 'bind').hits[0];
    for (const [p, s] of [[A, 1], [V, -1]]) {
      const g = p.fig.group;
      g.position.copy(homeOf(a, p)).addScaledVector(dir, s * phase.sh);
      const r = aimAt(p.fig, 'S_bind', k, phase.meet, 'parry');
      setAim(p.fig, r.aim);
      g.position.copy(homeOf(a, p));
    }
  }
  const env = smooth01(tt / 0.3);
  A.fig.group.position.copy(a.approach).addScaledVector(dir, phase.sh * env);
  V.fig.group.position.copy(a.vHome).addScaledVector(dir, -phase.sh * env);
  if (tt >= 0.3 && once('lock' + idx)) {
    const sa = weaponNow(A.fig);
    snapGuard(V, 'bind', sa, false);
    const sv = weaponNow(V.fig);
    const c = contactPoint(sa.grip, sa.tip, sv.butt.distanceTo(sv.grip) > 0.15 ? sv.butt : sv.grip, sv.tip);
    phase.at = c.at;
    sparksAt(c.at, dir, V, true);
    knock(A.fig, dir.clone().negate(), 0.35);
    knock(V.fig, dir, 0.35);
    a.hitStop = 0.08;
    window.__duelLog?.push({ bind: true, gap: +c.gap.toFixed(3) });
  }
  // grinding, blade on blade
  if (phase.at && tt > 0.4) {
    const sa = weaponNow(A.fig), sv = weaponNow(V.fig);
    const c = contactPoint(sa.grip, sa.tip, sv.butt.distanceTo(sv.grip) > 0.15 ? sv.butt : sv.grip, sv.tip);
    phase.at.copy(c.at);
    if (Math.random() < 0.35) particles.burst(c.at, { color: 0xffd9a0, n: 2, speed: 1.2, up: 0.6, size: 0.04, life: 0.3 });
    const step2 = Math.floor(tt / 0.32);
    if (step2 !== phase.grind) {
      phase.grind = step2;
      sfx('sword_clash', { vol: 0.18, rate: 0.7 });
    }
  }
  if (tt >= 1.18 && once('hold' + idx)) {
    act(A, 'bindHold', { fade: 0.2 });
    act(V, 'bindHold', { fade: 0.2 });
  }
}
function stepShove(a, phase, idx, tt, once) {
  const win = phase.who === 'A' ? a.mover : a.cap, lose = phase.who === 'A' ? a.cap : a.mover;
  const prev = a.phases[idx - 1];
  const sh = prev?.sh || 0;
  const dir = homeOf(a, lose).clone().sub(homeOf(a, win)).setY(0).normalize();
  if (once('shove' + idx)) {
    act(win, 'shove', { fade: 0.08 });
    phase.back = 0;
    // room to be driven back?
    const to = homeOf(a, lose).clone().addScaledVector(dir, 0.28);
    phase.room = clearSpot(a, to) ? 0.28 : 0;
  }
  const k = smooth01(tt / 0.5);
  const lh = homeOf(a, lose), wh = homeOf(a, win);
  if (tt >= 0.14 && once('heave' + idx)) {
    act(lose, 'stagger', { fade: 0.05 });
    knock(lose.fig, dir, 1.3);
    const at = phase.at || prev?.at || bodyPoint(lose, 0.6);
    sparksAt(at, dir, lose, true);
    sfx('shield_bash', { vol: 0.5 });
    camKick.addScaledVector(dir, 0.05);
    dustPuff(lose.fig.group.position.clone().setY(0.03), 0.2, 3, lose.fig.isWhite);
  }
  const back = tt >= 0.14 ? smooth01((tt - 0.14) / 0.45) * phase.room : 0;
  if (back > phase.back) {
    lh.addScaledVector(dir, back - phase.back);
    phase.back = back;
  }
  // (the bind had each stepped in towards the other)
  lose.fig.group.position.copy(lh).addScaledVector(dir, -sh * (1 - k));
  win.fig.group.position.copy(wh).addScaledVector(dir, sh * (1 - k) + 0.12 * Math.sin(Math.PI * clamp01(tt / 0.6)));
}

// ---- a body blow (pommel, shoulder charge, shield bash, the rook's ram, the horse rearing)
function stepSpecial(a, phase, idx, tt, once) {
  const striker = phase.who === 'A' ? a.mover : a.cap, defender = phase.who === 'A' ? a.cap : a.mover;
  const { info, move } = phase;
  const impact = info.hits[0] * info.d;
  const home = homeOf(a, striker);
  const dir = homeOf(a, defender).clone().sub(home).setY(0).normalize();
  if (once('sp' + idx)) {
    faceOff(a, striker, defender);
    act(striker, move, { fade: 0.12 });
    const dist = homeOf(a, defender).distanceTo(home);
    if (move === 'disarm') {
      // the blade goes for his: the middle of the foe's weapon
      const dw = weaponNow(defender.fig);
      const t = dw.grip.clone().lerp(dw.tip, 0.5);
      phase.plan = aimBlow(a, striker, defender, 'S_disarm', info.hits[0], t, 0.5);
    } else {
      const fwd = lungeOf(striker.fig, move, info.hits[0]);
      const contact = info.pommel ? 0.42 : move === 'trample' ? 0.5 : bulk(striker) + bulk(defender) + (move === 'shieldbash' ? 0.12 : 0.02);
      phase.plan = { shift: Math.max(-0.3, Math.min(0.75, dist - contact - fwd)), dir };
    }
    if (phase.outcome === 'hurt' && canWound(defender)) phase.dmg = prepareDamage(rubble, defender.fig, 'chunk', bodyPoint(defender, 0.6).addScaledVector(dir, -0.1), dir);
  }
  striker.fig.group.position.copy(home).addScaledVector(phase.plan.dir || dir, phase.plan.shift * stepEnvelope(tt, impact, phase.d));
  // a shield bearer takes a shield bash (or a charge) on his own shield
  if (phase.outcome === 'block' && tt >= impact - 0.3 && once('blk' + idx)) act(defender, 'parry', { fade: 0.1 });
  if (phase.outcome === 'stagger' && move === 'disarm' && tt >= impact - 0.25 && once('blk' + idx)) act(defender, 'parryR', { fade: 0.1 });
  if (tt >= impact - 0.18 && once('sw' + idx)) sfx(info.body ? 'footstep_heavy' : 'sword_swing', { vol: 0.6 });
  if (tt >= impact && once('spHit' + idx)) {
    const push = dir.clone();
    let at;
    if (move === 'disarm') {
      const dw = weaponNow(defender.fig);
      at = dw.grip.clone().lerp(dw.tip, 0.45);
      sparksAt(at, push, defender, true);
    } else if (info.pommel) {
      at = weaponNow(striker.fig).butt;
      at = bodyPoint(defender, 0.85).lerp(at, 0.4);
      rubble.chips(at, push.clone().setY(0.4), defender.fig.materials[0], 8, 0.6, state.ply);
      sfx('shield_bash', { vol: 0.7 });
      flash.position.copy(at);
      flash.color.set(0xffe0b0);
      flash.intensity = 6;
    } else {
      at = bodyPoint(defender, move === 'trample' ? 0.7 : 0.5).addScaledVector(push, -bulk(defender));
      dustPuff(at.clone().setY(0.05), 0.3, 4, defender.fig.isWhite);
      rubble.chips(at, push.clone().setY(0.3), defender.fig.materials[0], 10, 0.7, state.ply);
      sfx(move === 'trample' ? 'hoof' : 'shield_bash', { vol: 1 });
      if (move === 'trample' || move === 'ram') sfx('footstep_heavy', { vol: 0.8 });
      if (striker.fig.type === KNIGHT) sfx('horse_neigh', { vol: 0.5, delay: 0.05 });
      shake = Math.max(shake, 0.06);
    }
    const o = phase.outcome;
    if (o === 'block') {
      sparksAt(at, push, defender, true, true);
      knock(defender.fig, push, 1.0);
    } else {
      setAim(defender.fig, null);
      act(defender, phase.react, { fade: 0.05 });
      knock(defender.fig, push, o === 'down' ? 1.6 : info.body ? 1.35 : 1.0);
      if (o === 'hurt' && phase.dmg) applyDamage(rubble, phase.dmg, push.clone().setY(0.2), state.ply, 1);
      if (o === 'disarmed') disarmFig(defender, push);
      if (o === 'down') {
        sfx('body_fall', { vol: 0.9, delay: 0.45 });
        a.downAt = a.t;
      }
    }
    knock(striker.fig, push.clone().negate(), 0.3);
    camKick.addScaledVector(push, 0.06).add(new THREE.Vector3(0, -0.03, 0));
    a.hitStop = 0.1;
    send({ type: 'impact', heavy: true });
    window.__duelLog?.push({ special: move, by: striker.fig.type, outcome: o });
  }
  // knocked down: he hits the board
  if (phase.outcome === 'down' && a.downAt && a.t - a.downAt > 0.5 && once('thud' + idx)) {
    dustPuff(defender.fig.group.position.clone().setY(0.03), 0.35, 6, defender.fig.isWhite);
    shake = Math.max(shake, 0.05);
  }
  // driven back off his spot
  if ((phase.outcome === 'down' || phase.outcome === 'stagger') && tt > impact) {
    const dh = homeOf(a, defender);
    const want = phase.outcome === 'down' ? 0.22 : 0.12;
    phase.pushed = phase.pushed || 0;
    const k = smooth01((tt - impact) / 0.5) * want;
    if (k > phase.pushed && clearSpot(a, dh.clone().addScaledVector(dir, k - phase.pushed + 0.05))) {
      dh.addScaledVector(dir, k - phase.pushed);
      phase.pushed = k;
    }
    defender.fig.group.position.copy(dh);
  }
}
const canWound = (p) => p.fig.J?.chest && (p.fig.damage?.wounds || 0) < 6;
// the weapon torn out of his hand: it spins away and clatters onto the board
function disarmFig(p, push) {
  const fig = p.fig;
  const w = fig.J?.weapon;
  if (!w || !w.visible) return;
  fig.group.updateMatrixWorld(true);
  const items = [];
  w.traverse((o) => {
    if (o.isMesh && o.visible) items.push({ geo: o.geometry, m: o.matrixWorld.clone(), mat: o.userData.decal ? o.material : undefined });
  });
  const b = rubble.compound(items, fig.materials[0], w.getWorldQuaternion(new THREE.Quaternion()), state.ply);
  w.visible = false;
  fig.disarmed = true;
  if (b) {
    b.v.copy(push).multiplyScalar(0.9).add(new THREE.Vector3(rnd(-0.4, 0.4), 2.4, rnd(-0.4, 0.4)));
    b.w.set(rnd(-14, 14), rnd(-4, 4), rnd(-14, 14));
  }
  sfx('sword_clash', { vol: 0.9 });
}

// ---- footwork: the attacker presses him back, gives ground, or they sidestep round each other
function stepStep(a, phase, idx, tt, once) {
  const A = a.mover, V = a.cap;
  if (once('step' + idx)) {
    const dir = a.vHome.clone().sub(a.approach).setY(0).normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    const tries = phase.mode === 'press' ? [dir.clone().multiplyScalar(0.4), dir.clone().multiplyScalar(0.25), side.clone().multiplyScalar(0.35)]
      : phase.mode === 'retreat' ? [dir.clone().multiplyScalar(-0.35), dir.clone().multiplyScalar(-0.2), side.clone().multiplyScalar(-0.35)]
        : [side.clone().multiplyScalar(0.4), side.clone().multiplyScalar(-0.4), dir.clone().multiplyScalar(0.2)];
    phase.d0 = new THREE.Vector3();
    for (const t of tries) {
      if (clearSpot(a, a.approach.clone().add(t)) && clearSpot(a, a.vHome.clone().add(t))) {
        phase.d0 = t;
        break;
      }
    }
    phase.a0 = a.approach.clone();
    phase.v0 = a.vHome.clone();
    const fwd = phase.d0.dot(dir) >= 0;
    // the one pressing walks in; the other gives ground, still facing him
    act(A, fwd ? 'walk' : 'shuffle', { loop: true, fade: 0.15 });
    act(V, fwd ? 'shuffle' : 'walk', { loop: true, fade: 0.15 });
  }
  const k = smooth01(tt / phase.d);
  // the pressed one lags a little behind the one pressing
  const lead = phase.d0.dot(a.dir) >= 0 ? [k, smooth01((tt - 0.1) / phase.d)] : [smooth01((tt - 0.1) / phase.d), k];
  a.approach.copy(phase.a0).addScaledVector(phase.d0, lead[0]);
  a.vHome.copy(phase.v0).addScaledVector(phase.d0, lead[1]);
  A.fig.group.position.copy(a.approach);
  V.fig.group.position.copy(a.vHome);
  const step2 = Math.floor(tt / 0.27);
  if (step2 !== phase.lastStep) {
    phase.lastStep = step2;
    footDust(step2 % 2 ? a.approach : a.vHome);
    sfx('footstep_stone', { vol: 0.4 });
  }
  if (tt >= phase.d - 0.12 && once('stepEnd' + idx)) {
    a.reangle = true;
    act(A, 'guard', { loop: true, fade: 0.2 });
    act(V, 'guard', { loop: true, fade: 0.2 });
  }
}

// ---- a spell (its look is in spells.js): the caster's move, the spell loosed at the move's
// blow, and what it does: a ward takes it, it wounds, it throws him down, or it kills
function castFrom(fig, spell) {
  const w = weaponNow(fig);
  if (SPELL[spell].move === 'stomp') return fig.group.position.clone().setY(0.05);
  return fig.type === QUEEN || fig.type === BISHOP ? w.butt : w.tip;
}
function stepSpell(a, phase, idx, tt, once) {
  const caster = phase.who === 'A' ? a.mover : a.cap, target = phase.who === 'A' ? a.cap : a.mover;
  const sp = SPELL[phase.spell];
  const white = caster.fig.isWhite, color = sp.color[white ? 0 : 1];
  if (once('spell' + idx)) {
    faceOff(a, caster, target);
    act(caster, sp.move, { fade: 0.15 });
    // (the wound it will leave is cut ahead, a little each frame)
    if (phase.outcome === 'wound' && canWound(target)) {
      const push = target.fig.group.position.clone().sub(caster.fig.group.position).setY(0).normalize();
      phase.dmg = prepareDamage(rubble, target.fig, 'chunk', bodyPoint(target, 0.6).addScaledVector(push, -0.1), push);
    }
    if (phase.outcome === 'kill') phase.prep = prepareBreakup(rubble, target.fig, { kind: sp.how, normal: new THREE.Vector3(0, 1, 0), point: bodyPoint(target) });
    sfx('spell_charge', { vol: 0.6 });
  }
  // the power gathering at the staff, the sword, the hand
  if (tt > 0.12 && tt < phase.release && Math.random() < 0.6) {
    const at = castFrom(caster.fig, phase.spell);
    particles.burst(at, { color, n: 1, speed: 0.5, up: 0.2, size: 0.07, life: 0.3, gravity: 0 });
    flash.position.copy(at);
    flash.color.set(color);
    flash.intensity = Math.max(flash.intensity, 3 + 6 * (tt / phase.release));
  }
  // a ward goes up as he sees it coming
  if (phase.outcome === 'ward' && tt >= phase.release - 0.32 && once('ward' + idx)) {
    act(target, 'ward', { fade: 0.1 });
    phase.ward = makeWard(target.fig, target.fig.isWhite);
    fx.push(phase.ward);
  }
  if (phase.outcome !== 'ward' && phase.outcome !== 'kill' && tt >= phase.release - 0.1 && once('brace' + idx)) act(target, 'parryHigh', { fade: 0.12 });
  if (tt >= phase.release && once('cast' + idx)) {
    const victim = target;
    const toPt = () => bodyPoint(victim, sp.move === 'stomp' ? 0.25 : 0.55).addScaledVector(caster.fig.group.position.clone().sub(victim.fig.group.position).setY(0).normalize(), 0.12);
    const o = {
      from: () => castFrom(caster.fig, phase.spell),
      to: toPt(),
      victim: victim.fig,
      caster: caster.fig,
      white,
      kill: phase.outcome === 'kill',
      ward: phase.ward || null,
      onImpact: (at) => spellLands(a, phase, caster, victim, at),
      onKill: (how, at) => spellKills(a, phase, caster, victim, how, at),
      onHold: (how) => {
        if (how === 'bound') act(victim, 'bound', { loop: true, fade: 0.1 });
        else if (how === 'frozen') victim.fig.frozen = true;
      },
      onSlam: (at) => {
        dustPuff(at.clone().setY(0.04), 0.4, 8, victim.fig.isWhite);
        shake = Math.max(shake, 0.12);
        if (phase.outcome !== 'kill' && phase.outcome !== 'ward') act(victim, 'down', { fade: 0.05 });
      },
      onChip: (at) => rubble.chips(at, new THREE.Vector3(rnd(-0.5, 0.5), 0.2, rnd(-0.5, 0.5)), victim.fig.materials[0], 1, 0.3, state.ply),
    };
    if (phase.spell === 'levitate' && phase.outcome !== 'ward') act(victim, 'flail', { loop: true, fade: 0.2 });
    if (phase.spell === 'crush' && phase.outcome === 'kill') act(victim, 'bound', { loop: true, fade: 0.2 });
    fx.push(castSpell(phase.spell, o));
    window.__duelLog?.push({ spell: phase.spell, by: caster.fig.type, outcome: phase.outcome });
  }
  // thrown down by the spell: up again
  if (phase.outcome === 'down' && phase.landT !== undefined && a.t - phase.landT > 1.0 && once('up' + idx)) act(target, 'rise', { fade: 0.2 });
  if (phase.outcome === 'down' && phase.landT !== undefined && a.t - phase.landT > 2.05 && once('up2' + idx)) act(target, 'guard', { loop: true, fade: 0.35 });
  if (phase.ward && tt >= phase.d - 0.25 && once('wardDrop' + idx)) phase.ward.drop();
}
function spellLands(a, phase, caster, victim, at) {
  const push = victim.fig.group.position.clone().sub(caster.fig.group.position).setY(0).normalize();
  shake = Math.max(shake, 0.05);
  send({ type: 'impact', heavy: phase.outcome === 'kill' });
  if (phase.outcome === 'ward') {
    knock(victim.fig, push, 0.6);
    if (Math.random() < 0.45) setTimeoutSim(0.5, () => phase.ward?.shatter());
    return;
  }
  if (phase.outcome === 'kill') {
    knock(victim.fig, push, 0.5);
    if (phase.spell === 'lightning' || phase.spell === 'whip' || phase.spell === 'bolts' || phase.spell === 'swords') act(victim, 'seize', { fade: 0.05 });
    if (phase.spell === 'shockwave' || phase.spell === 'quake') act(victim, 'down', { fade: 0.05 });
    if (phase.spell === 'spikes') act(victim, 'seize', { fade: 0.03 });
    return;
  }
  if (phase.outcome === 'down') {
    if (phase.spell !== 'levitate') act(victim, 'down', { fade: 0.05 });
    knock(victim.fig, push, 1.2);
    phase.landT = a.t + (phase.spell === 'levitate' ? 1.1 : 0.5);
    sfx('body_fall', { vol: 0.8, delay: phase.spell === 'levitate' ? 1.1 : 0.45 });
    return;
  }
  // it hurts: a wound in the stone where it struck, and he reels
  setAim(victim.fig, null);
  act(victim, pick(['hurt', 'clutch']), { fade: 0.05 });
  knock(victim.fig, push, 1.0);
  if (phase.dmg) applyDamage(rubble, phase.dmg, push.clone().setY(0.25), state.ply, 1);
  victim.fig.frozen = false;
  sfx('magic_impact');
}
function spellKills(a, phase, caster, victim, how, at) {
  if (a.cap !== victim) return;
  victim.fig.frozen = false;
  // (the frost shell melts into the ice it shatters into: not a part of the stone)
  const frost = [];
  victim.fig.model.traverse((o) => o.userData.frost && frost.push(o));
  for (const f of frost) f.parent.remove(f);
  const dir = victim.fig.group.position.clone().sub(caster.fig.group.position).setY(0).normalize();
  const point = how === 'crush' ? victim.fig.group.position.clone().setY(0.25) : bodyPoint(victim);
  const blow = { at: point.clone(), dir, kind: how, point, swing: dir, job: phase.prep };
  const weight = { [BISHOP]: 1.0, [ROOK]: 1.3, [QUEEN]: 1.2, [KING]: 1.3 }[caster.fig.type] || 1;
  a.death = kill(victim, 'smash', caster.fig.group.position.clone(), weight, blow);
  sfx(how === 'shatter' ? 'ice_shatter' : how === 'crumble' ? 'stone_crumble' : 'stone_break_large');
  a.killT = a.t;
  a.slowed = true;
  slowLeft = a.epic ? 1.2 : 0.6;
  slowRate = a.epic ? 0.3 : 0.4;
  window.__duelLog?.push({ kill: phase.spell, by: caster.fig.type, victim: victim.fig.type, how });
  pieces.delete(a.job.m.cap);
  a.cap = null;
}
// (a callback on the simulation's clock)
const simTimers = [];
function setTimeoutSim(dt, fn) {
  simTimers.push({ at: simT + dt, fn });
}

// ---- knocked down: he crawls back from the attacker, or tries to get up; the attacker closes in
function stepDowned(a, phase, idx, tt, once) {
  const A = a.mover, V = a.cap;
  if (!V) return;
  const next = a.phases[idx + 1];
  if (once('downed' + idx)) {
    act(V, phase.how === 'crawl' ? 'crawl' : 'rise', { loop: phase.how === 'crawl', fade: 0.25 });
    phase.v0 = a.vHome.clone();
    phase.a0 = a.approach.clone();
    const dir = a.vHome.clone().sub(a.approach).setY(0).normalize();
    phase.dir = dir;
    // he drags himself away (if there's room)
    phase.crawl = phase.how === 'crawl' && clearSpot(a, a.vHome.clone().addScaledVector(dir, 0.3)) ? 0.25 : 0;
    // where the attacker will stand to finish him: over his body, wherever it lies
    const stand = next?.move === 'hop' ? a.reach : next?.move === 'trample' ? 0.55 : 0.62;
    phase.stand = stand;
    V.fig.group.updateMatrixWorld(true);
    const chest = (V.fig.J.chest || V.fig.J.spine || V.fig.model).getWorldPosition(new THREE.Vector3()).setY(0);
    phase.bodyOff = chest.clone().lerp(a.vHome.clone().setY(0), 0.35).sub(a.vHome.clone().setY(0));
    act(A, 'walk', { loop: true, fade: 0.2 });
    sfx('stone_crack', { vol: 0.3 });
  }
  const k = smooth01(tt / phase.d);
  a.vHome.copy(phase.v0).addScaledVector(phase.dir, phase.crawl * k);
  V.fig.group.position.copy(a.vHome);
  const goal = a.vHome.clone().add(phase.bodyOff).addScaledVector(phase.dir, -phase.stand);
  a.bodyAt = a.vHome.clone().add(phase.bodyOff);
  a.approach.copy(phase.a0).lerp(goal, smooth01(tt / (phase.d * 0.85)));
  A.fig.group.position.copy(a.approach);
  const step2 = Math.floor(tt / 0.3);
  if (step2 !== phase.lastStep && tt < phase.d * 0.85) {
    phase.lastStep = step2;
    footDust(A.fig.group.position);
    sfx(A.fig.type === KNIGHT ? 'hoof' : A.fig.type === ROOK ? 'footstep_heavy' : 'footstep_stone', { vol: 0.5 });
  }
  if (phase.crawl && Math.random() < 0.15) dustPuff(V.fig.group.position.clone().setY(0.03), 0.12, 1, V.fig.isWhite);
  if (tt >= phase.d * 0.85 && once('dstop' + idx)) act(A, 'guard', { loop: true, fade: 0.2 });
}

// ---- killed with the body or on the ground: the rook topples onto him, hops onto him or rams
// him; the horse tramples him; a fallen foe is run through where he lies
function stepBody(a, phase, idx, tt, once) {
  const A = a.mover, V = a.cap, g = A.fig.group;
  const { info, move, killAt } = phase;
  const dir = a.vHome.clone().sub(a.approach).setY(0).normalize();
  if (once('body' + idx)) {
    g.rotation.y = angleTo(a.approach, a.vHome);
    act(A, move, { fade: 0.14 });
    const dist = (phase.onGround && a.bodyAt ? a.bodyAt : a.vHome).distanceTo(a.approach);
    const fwd = lungeOf(A.fig, move, info.hits[info.hits.length - 1]);
    if (move === 'execute') {
      // the point goes into his chest, wherever it is as he lies there
      const J = V.fig.J;
      const target = (J.chest || J.spine || V.fig.model).getWorldPosition(new THREE.Vector3());
      target.y = Math.max(0.08, target.y);
      phase.plan = aimBlow(a, A, V, 'S_execute', killAt / info.d, target, 0.3);
    } else if (move === 'topple') {
      // where the top of the tower comes down: on him
      phase.plan = { dir, shift: Math.max(-0.4, Math.min(0.5, dist - 0.24 - (A.fig.height || 1) * 0.72)) };
    } else if (move === 'hop') {
      phase.plan = { dir, shift: dist - 0.12 };
    } else {
      const contact = move === 'trample' ? (phase.onGround ? 0.42 : 0.5) : bulk(A) + bulk(V);
      phase.plan = { dir, shift: Math.max(-0.3, Math.min(0.8, dist - contact - fwd)) };
    }
    if (V) {
      V.fig.group.position.copy(a.vHome);
      // (the keep is cracked ahead of time, so it can come down in pieces)
      if (V.fig.statue) phase.prep = prepareBreakup(rubble, V.fig, { kind: info.cut === 'smash' ? 'burst' : info.cut, normal: new THREE.Vector3(0, 1, 0), point: bodyPoint(V) });
    }
  }
  const plan = phase.plan;
  const tc = A.fig.move.name === move ? A.fig.move.t : phase.d;
  if (move === 'hop') {
    // up and across, onto him
    const k = smooth01((tc - 0.3) / (killAt - 0.3));
    g.position.copy(a.approach).addScaledVector(plan.dir, plan.shift * k);
    g.position.y = Math.sin(Math.PI * k) * 0.55;
  } else {
    const env = tc < killAt ? stepEnvelope(tc, killAt, phase.d) : 1;
    g.position.copy(a.approach).addScaledVector(plan.dir, plan.shift * env);
  }
  if (V && tc >= killAt - 0.32 && !phase.onGround && once('cower' + idx)) act(V, move === 'topple' || move === 'hop' ? 'parryHigh' : 'stagger', { fade: 0.1 });
  if (move === 'execute' && tc > killAt - 0.18 && tc < killAt + 0.08) A.swinging = true;
  if (tc > killAt - 0.2 && once('bw' + idx)) sfx(move === 'execute' ? 'sword_swing' : 'footstep_heavy', { vol: 0.8 });
  if (tc >= killAt - 0.06 && once('slow' + idx)) {
    a.slowed = true;
    slowLeft = a.epic ? 1.4 : 0.7;
    slowRate = a.epic ? 0.25 : 0.35;
  }
  if (V && tc >= killAt && once('bhit' + idx)) {
    const how = info.cut === 'smash' ? 'burst' : info.cut;
    const point = move === 'execute' ? weaponNow(A.fig).tip : V.fig.group.position.clone().setY(move === 'topple' || move === 'hop' ? 0.35 : 0.45);
    const blow = { at: point.clone(), dir: dir.clone().setY(move === 'topple' || move === 'hop' || move === 'trample' ? -0.6 : 0).normalize(), kind: how, point, swing: dir, job: phase.prep };
    const weight = { [PAWN]: 0.9, [KNIGHT]: 1.3, [BISHOP]: 1.0, [ROOK]: 1.5, [QUEEN]: 1.2, [KING]: 1.4 }[A.fig.type] || 1;
    knock(A.fig, dir.clone().negate(), 0.4);
    a.death = kill(V, 'smash', g.position.clone(), weight, blow);
    const heavy = move !== 'execute';
    if (heavy) {
      dustRing(V.fig.group.position, 12, 0.5);
      shake = Math.max(shake, 0.16);
      sfx('stone_break_large');
      sfx('body_fall', { delay: 0.05 });
    } else sfx('stab');
    camKick.add(new THREE.Vector3(0, -0.07, 0));
    a.hitStop = 0.12;
    a.stopMoverOnly = true;
    a.killT = a.t;
    window.__duelLog?.push({ kill: move, by: A.fig.type, victim: V.fig.type, how });
    pieces.delete(a.job.m.cap);
    a.cap = null;
  }
  // the topple: dust where the tower lands
  if (move === 'topple' && tc >= killAt + 0.02 && once('tdust' + idx)) dustRing(g.position.clone().addScaledVector(dir, (A.fig.height || 1) * 0.7), 10, 0.5);
}
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// The killing blow's break, worked out as the blow is coming (and the stone cut ahead of time,
// a little each frame): a slice is cut along the blade's real path through the body, a thrust
// cracks out radially from the point, a cleave splits the statue top to bottom.
function prepareBreak(a, phase, v) {
  const mover = a.mover, g = mover.fig.group, { info, move } = phase;
  const kT = phase.killAt / info.d;
  g.position.copy(a.approach).addScaledVector(phase.plan.dir, phase.plan.shift);
  const p1 = probeMove(mover.fig, 'S_' + move, kT), p0 = probeMove(mover.fig, 'S_' + move, Math.max(0, kT - 0.04 / info.d));
  g.position.copy(a.approach);
  const blade = p1.tip.clone().sub(p1.grip).normalize(), swing = p1.tip.clone().sub(p0.tip);
  if (swing.lengthSq() < 1e-6) swing.copy(a.dir);
  swing.normalize();
  const kind = info.cut || 'smash';
  let normal = blade.clone().cross(swing);
  if (kind === 'cleave') normal.y = 0;
  if (normal.lengthSq() < 0.04) normal = kind === 'cleave' ? new THREE.Vector3(a.dir.z, 0, -a.dir.x) : new THREE.Vector3(0, 1, 0);
  normal.normalize();
  if (normal.y < 0) normal.negate();
  const heavy = mover.fig.type === KING || mover.fig.type === ROOK || mover.fig.type === KNIGHT;
  v.fig.group.updateMatrixWorld(true);
  let point = p1.tip.clone();
  if (kind === 'slice' || kind === 'cleave') {
    // the plane through the victim's own middle (a slice at a height between its hips and shoulders)
    const c = v.fig.group.position, h = v.fig.height || 1;
    let y = point.y;
    if (kind === 'slice' && Math.abs(normal.y) > 0.2) y = point.y - (normal.x * (c.x - point.x) + normal.z * (c.z - point.z)) / normal.y;
    point = new THREE.Vector3(c.x, Math.max(0.42 * h, Math.min(0.74 * h, y)), c.z);
  }
  phase.cut = { kind, normal, point, axis: kind === 'stab' ? blade : null, swing, heavy };
  phase.cut.job = prepareBreakup(rubble, v.fig, phase.cut);
}

function stepKill(a, phase, tt, dt, once) {
  const mover = a.mover, g = mover.fig.group;
  const { info, move } = phase;
  if (once('fin')) {
    act(mover, move, { fade: 0.14 });
    const v = a.cap;
    v.fig.group.position.copy(a.vHome);
    a.dir.copy(a.vHome).sub(a.approach).setY(0).normalize();
    g.rotation.y = angleTo(a.approach, a.vHome);
    v.fig.group.rotation.y = angleTo(a.vHome, a.approach);
    const target = v.fig.group.position.clone().addScaledVector(a.dir, -0.04);
    target.y = heightOf(v, info.line === 'high' ? 'high' : 'mid') - 0.04;
    // the killing blow lands where the swing passes closest to the victim
    if (!info.cast) {
      let best = null;
      g.position.copy(a.approach);
      for (let j = -6; j <= 6; j++) {
        const t = phase.killAt + j * 0.03;
        const pr = probeMove(mover.fig, 'S_' + move, t / info.d, null);
        const gap = a.vHome.clone().sub(pr.root).setY(0).length();
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
    else prepareBreak(a, phase, v);
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
    const pm = parryFor(info, h);
    const pr = moveInfo(cap.fig, pm);
    if (tt >= hT - pr.hits[0] * pr.d && once('cparry' + h)) {
      act(cap, pm, { fade: 0.1 });
      const pw = probeMove(mover.fig, 'S_' + move, info.hits[h]);
      const r = aimAt(cap.fig, 'S_' + pm, pr.hits[0], pw.grip.clone().lerp(pw.tip, 0.8), cap.fig.shieldAt && !pm.endsWith('R') ? 'shield' : 'parry');
      setAim(cap.fig, r.aim);
    }
    if (tt >= hT && once('chit' + h)) {
      const sw = weaponNow(mover.fig), dw = weaponNow(cap.fig);
      const c = cap.fig.shieldAt && !parryFor(info, h).endsWith('R') ? contactPoint(sw.grip, sw.tip, dw.shield, dw.shield) : contactPoint(sw.grip, sw.tip, dw.butt.distanceTo(dw.grip) > 0.15 ? dw.butt : dw.grip, dw.tip);
      sparksAt(c.at, a.dir, cap, true);
      blowLands(mover, cap, c.at, a.dir, 0.9);
      a.hitStop = 0.08;
      whoosh(0.5);
    }
  }
  // too late, the victim's guard comes up
  if (cap && tt >= killAt - 0.3 && once('late')) act(cap, parryFor(info), { fade: 0.12 });
  if (!info.cast && tt > killAt - 0.18 && tt < killAt + 0.1) mover.swinging = true;
  if (tt > killAt - 0.24 && once('whooshF')) info.cast ? zap(0.4) : whoosh(1);
  if (info.cast && tt >= killAt - 0.32 && once('bolt')) launchBolt(weaponNow(mover.fig).butt, phase.target, mover.fig.isWhite ? 0x9fd8ff : 0xc77dff);
  if (tt >= killAt - (a.epic ? 0.18 : 0.12) && once('slow')) {
    a.slowed = true;
    slowLeft = a.epic ? 1.8 : 1.0; // slow motion around the killing blow (longer, slower in an epic)
    slowRate = a.epic ? 0.22 : 0.3;
  }
  const tip = weaponNow(mover.fig).tip;
  // the blow lands: the victim reels with the weapon in it ...
  if (cap && tt >= killAt && once('hit')) {
    phase.hitPt = pt;
    act(cap, 'reel', { fade: 0.03 });
    knock(cap.fig, a.dir, 0.7);
    camKick.addScaledVector(a.dir, 0.08).add(new THREE.Vector3(0, -0.05, 0));
    setRot(cap.fig, 0.15);
    a.hitStop = 0.16;
    punch(1);
    a.stopMoverOnly = true; // the weapon bites and holds; the victim reels from it
    phase.swing = a.prevTip ? tip.clone().sub(a.prevTip) : a.dir.clone();
    const at = tip.clone();
    flash.position.copy(at);
    flash.color.set(0xffe0a0);
    flash.intensity = 10;
    shake = 0.08;
    crash(0.35);
    particles.burst(at, { color: 0xfff0c0, n: 18, speed: 2, up: 0.6, size: 0.06, life: 0.4 });
    impactFlash(at, a.dir, 0.7);
    if ((phase.cut?.heavy && phase.cut.kind === 'cleave') || mover.fig.type === KNIGHT || mover.fig.type === ROOK) shockwave(g.position.clone().addScaledVector(a.dir, 0.4));
  }
  if (cap && phase.hitPt !== undefined) setRot(cap.fig, 0.15 + clamp01((pt - phase.hitPt) / 0.14) * 0.25);
  // ... and cracks apart
  if (cap && phase.hitPt !== undefined && pt >= phase.hitPt + 0.14 && once('kill')) {
    const swingDir = phase.swing && phase.swing.lengthSq() > 1e-6 ? phase.swing.clone() : a.dir.clone();
    swingDir.normalize().lerp(a.dir.clone().setY(swingDir.y), 0.35).normalize();
    const blow = { at: tip.clone(), dir: swingDir, ...(phase.cut || {}) };
    const vc = cap.fig.group.position;
    window.__duelLog?.push({ kill: move, by: mover.fig.type, victim: cap.fig.type, tipToBody: +Math.hypot(tip.x - vc.x, tip.z - vc.z).toFixed(3), tipY: +tip.y.toFixed(2), victimH: +cap.fig.height.toFixed(2), aimErr: +plan.err.toFixed(3), shift: +plan.shift.toFixed(2) });
    send({ type: 'impact', heavy: true });
    const weight = { [PAWN]: 0.9, [KNIGHT]: 1.2, [BISHOP]: 1.0, [ROOK]: 1.5, [QUEEN]: 1.3, [KING]: 1.4 }[mover.fig.type] || 1;
    a.death = kill(cap, a.fin.style, g.position.clone(), weight * (cap.fig.type >= ROOK ? 1.1 : 1), blow);
    a.killT = a.t;
    pieces.delete(a.job.m.cap);
    a.cap = null;
  }
  if (tt >= killAt - 0.1) a.prevTip = tip;
}

// The queen's wormhole, her finisher against a pawn (the effect is in wormhole.js): she plants
// her staff, claps twice over her head and sweeps her arm down at the pawn; a wormhole opens over
// it, draws it up and snaps shut in a flash of light. The pawn leaves the board as kill() takes a
// victim off it, but leaves no rubble behind.
const handOf = (fig, side) => fig.J['wr' + side].localToWorld(new THREE.Vector3(0, -0.045, 0));
function stepWormhole(a, phase, tt, dt, once) {
  const mover = a.mover, fig = mover.fig;
  const { info, move } = phase;
  const white = fig.isWhite, tint = white ? 0x9fd8ff : 0xc77dff;
  if (once('fin')) {
    act(mover, move, { fade: 0.14 });
    fig.group.position.copy(a.approach);
    if (a.cap) a.cap.fig.group.position.copy(a.vHome);
  }
  const ct = fig.move.name === move ? fig.move.t : phase.d; // the clip's own clock
  const castT = info.hits[2] * info.d;
  // she lets go of the staff: it stands on the board at her side until she takes it back
  if (ct >= info.plant && once('plant')) fx.push(plantStaff(fig, move, info.grab));
  // two claps: the hands meet in a ring of light
  for (const k of [0, 1]) {
    if (ct >= info.hits[k] * info.d && once('clap' + k)) {
      fig.group.updateMatrixWorld(true);
      const at = handOf(fig, 'L').lerp(handOf(fig, 'R'), 0.5);
      fx.push(clapBurst(scene, particles, at, white, camera));
      clapSound(0.6);
      flash.position.copy(at);
      flash.color.set(tint);
      flash.intensity = 7;
      shake = Math.max(shake, 0.015);
      if (k === 0 && a.cap) act(a.cap, 'guard', { loop: true, fade: 0.2 }); // the pawn looks up, uneasy
    }
  }
  // the cast: a streak of light from her hand up into the air over the pawn, where it opens
  if (ct >= castT - 0.12 && once('cast')) {
    fig.group.updateMatrixWorld(true);
    a.worm = new Wormhole(scene, particles, wormLight, a.vHome, a.cap ? a.cap.fig : null, white);
    a.worm.t = -0.12;
    fx.push(a.worm);
    fx.push(castTrail(scene, particles, handOf(fig, 'L'), a.worm.center, white));
    zap(0.3);
    whoosh(0.6);
    wormHum(WORM.flash + 0.25, 0.3);
  }
  const w = a.worm;
  if (!w) {
    a.wormUp = 0.5 * clamp01(ct / 0.5); // up to her hands for the claps
    return;
  }
  // the camera looks up to it, and back down once it is gone
  a.wormUp = Math.min(0.5 + 0.5 * clamp01((w.t + 0.12) / 0.45), 1 - 0.6 * clamp01((w.t - WORM.flash - 0.15) / 0.4));
  if (a.cap && w.t >= 0.08 && once('cower')) act(a.cap, 'parryHigh', { fade: 0.15 });
  if (a.cap && w.t >= WORM.lift && once('lifted')) act(a.cap, 'reel', { fade: 0.1 }); // torn off its square, flailing
  if (w.t >= WORM.gone && once('gone')) {
    // swallowed: off the board, as kill() takes a victim off it
    const cap = a.cap;
    if (cap) {
      scene.remove(cap.fig.group);
      if (pieces.get(a.job.m.cap) === cap) pieces.delete(a.job.m.cap);
      a.cap = null;
    }
  }
  if (w.t >= WORM.flash - 0.14 && once('slow')) {
    a.slowed = true;
    slowLeft = 0.8;
    slowRate = 0.3; // slow motion as it snaps shut
  }
  if (w.t >= WORM.flash - 0.3 && once('implode')) implode(0.3, 0.5); // the air rushes in ...
  if (w.t >= WORM.flash && once('flash')) {
    boom(0.95); // ... and it collapses with a boom
    camKick.add(new THREE.Vector3(0, -0.09, 0));
    flash.position.copy(w.center);
    flash.color.set(white ? 0xe6f4ff : 0xf6e6ff);
    flash.intensity = 18;
    shake = Math.max(shake, 0.26);
    send({ type: 'impact', heavy: true });
  }
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
  // a statue that wasn't selected (the other side's move) comes to life first
  if (!mover.fig.alive && mover.fig.statue) {
    a.phases.push({ name: 'wake', d: 0.42 });
    a.wakeD = 0.42;
  }
  mover.settleAt = 0;
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
  a.mover.fig.frozen = false;
  a.mover.fig.plant = false;
  if (a.mover.fig.statue && a.mover.fig.J?.weapon && a.mover.fig.disarmed) a.mover.fig.J.weapon.visible = true;
  // arrived: it settles back into a still statue (keeping whatever wounds it took)
  if (a.mover.fig.alive) settle(a.mover);
  else if (!a.mover.fig.statue) idle(a.mover);
  if (a.rook) {
    a.rook.p.fig.group.position.copy(a.rook.b);
    a.rook.p.fig.group.rotation.y = homeFacing(a.rook.p.code);
    a.rook.p.sq = job.m.castleRook[1];
    pieces.set(job.m.castleRook[1], a.rook.p);
    if (a.rook.p.fig.alive) settle(a.rook.p);
    else if (!a.rook.p.fig.statue) idle(a.rook.p);
  }
  if (job.m.promo) {
    removePiece(a.mover);
    pieces.delete(job.m.to);
    const np = place(job.m.promo, job.m.to);
    np.grow = 0.001;
    sparkle(a.to);
    chime();
  }
  for (const tr of trails) {
    tr.heat = 0;
    tr.pts.length = 0;
    tr.mesh.visible = false;
  }
  releaseShot();
  syncTo(job.after);
  drawOverlays();
}

const FIGHT_PHASES = new Set(['clash', 'final', 'wait', 'blow', 'kill', 'square', 'circle', 'feint', 'bind', 'shove', 'special', 'step', 'spell', 'downed', 'body']);
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
      case 'wake':
        if (once('wake')) wake(mover, a.capPos || a.to);
        break;
      case 'turn':
        if (once('turn')) {
          mover.fig.alive = true;
          mover.fig.look = 0;
          act(mover, a.knight ? 'run' : 'walk', { loop: true });
        }
        g.rotation.y = turnToward(g.rotation.y, phase.face, Math.min(1, dt * 12));
        break;
      case 'walk': {
        if (phase.fromHere && !phase.a) phase.a = g.position.clone().setY(0);
        const leap = a.knight && !phase.settle && phase.a.distanceTo(phase.b) > 1.2;
        if (once('walk' + idx)) {
          if (leap) act(mover, 'leap', { duration: phase.d });
          else act(mover, a.knight && !phase.settle ? 'run' : 'walk', { loop: true });
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
          else sfx(mover.fig.type === KNIGHT ? 'hoof' : mover.fig.type === ROOK ? 'footstep_heavy' : 'footstep_stone', { vol: 0.35 });
          footDust(g.position); // statues leave a trail of grit
        }
        // the defender comes to life as the attacker closes in
        if (a.cap && !phase.settle && k > 0.25 && once('vwake')) {
          if (a.cap.fig.statue) wake(a.cap);
          else act(a.cap, '2H_Melee_Idle', { loop: true });
        }
        if (leap && k > 0.92 && once('land' + idx)) {
          step(0.3, true);
          dustRing(g.position, 8, 0.4);
        }
        break;
      }
      case 'square':
        if (once('square')) {
          mover.fig.look = 0;
          if (a.cap) a.cap.fig.look = 0;
          act(mover, 'guard', { loop: true, fade: 0.25 });
          act(a.cap, 'guard', { loop: true, fade: 0.25 });
        }
        break;
      case 'blow':
        stepBlow(a, phase, idx, tt, dt, once);
        break;
      case 'circle':
        stepCircle(a, phase, idx, k, once);
        break;
      case 'kill':
        if (phase.wormhole) stepWormhole(a, phase, tt, dt, once);
        else stepKill(a, phase, tt, dt, once);
        break;
      case 'feint':
        stepFeint(a, phase, idx, tt, once);
        break;
      case 'bind':
        stepBind(a, phase, idx, tt, once);
        break;
      case 'shove':
        stepShove(a, phase, idx, tt, once);
        break;
      case 'special':
        if (a.cap) stepSpecial(a, phase, idx, tt, once);
        break;
      case 'step':
        stepStep(a, phase, idx, tt, once);
        break;
      case 'spell':
        if (a.cap || phase.kill) stepSpell(a, phase, idx, tt, once);
        break;
      case 'downed':
        stepDowned(a, phase, idx, tt, once);
        break;
      case 'body':
        stepBody(a, phase, idx, tt, once);
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
          slowLeft = 0.75;
          slowRate = 0.3; // slow motion around the killing blow
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
        // the victor: a raised weapon, or just back on guard, looking down at what's left
        if (tt > 0.5 && once('cheer')) {
          if (!mover.fig.statue || Math.random() < 0.45) act(mover, 'cheer');
          else act(mover, 'guard', { loop: true, fade: 0.3 });
        }
        break;
      case 'turnback':
        if (once('back')) {
          if (mover.fig.statue) settle(mover);
          else idle(mover);
        }
        g.rotation.y = turnToward(g.rotation.y, homeFacing(mover.code), Math.min(1, dt * 10));
        break;
    }
    // in the fight the feet are planted on the board, and step when the body is carried off them
    const planted = !!a.vHome && FIGHT_PHASES.has(phase.name) && phase.name !== 'wait';
    mover.fig.plant = planted;
    if (a.cap) a.cap.fig.plant = planted;
    // camera work
    const fighting = a.dir && (FIGHT_PHASES.has(phase.name) ||
      (phase.name === 'walk' && !phase.settle && k > 0.35));
    if (fighting && cinema() !== 'off') {
      if (!a.shotStart) a.shotStart = a.t;
      duelShot(a, phase);
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
  updateTrail(trails[0], mover, mover.swinging, dt);
  mover.swinging = false;
  if (a.cap) {
    const cg = a.cap.fig.group;
    // (a statue that is awake keeps facing its attacker; one held by a spell can't)
    if (a.cap.fig.alive && phase?.name !== 'spell' && !a.cap.fig.frozen) cg.rotation.y = turnToward(cg.rotation.y, angleTo(cg.position, g.position), Math.min(1, dt * 5));
    // (and the attacker keeps its eyes on the victim as they move about)
    if (a.vHome && (phase?.name === 'circle' || phase?.name === 'blow' || phase?.name === 'square' || phase?.name === 'step' || phase?.name === 'downed')) g.rotation.y = turnToward(g.rotation.y, angleTo(g.position, cg.position), Math.min(1, dt * 6));
    if (!a.cap.fig.frozen) a.cap.fig.mixer.update(a.stopMoverOnly ? dt : fdt);
    updateTrail(trails[1], a.cap, a.cap.swinging, dt);
    a.cap.swinging = false;
  } else updateTrail(trails[1], null, false, dt);
  if (a.rook) {
    const r = a.rook;
    const k = clamp01((a.t - r.t0) / r.d);
    const rg = r.p.fig.group;
    if (k > 0 && !a.events.rookGo) {
      a.events.rookGo = true;
      r.p.fig.alive = true;
      act(r.p, 'leap', { duration: r.d });
      sfx('wake', { vol: 0.5 });
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
let slowLeft = 0, slowRate = 0.3;
let wasBusy = false;
let shownPly = null;
let manual = false, simT = 0;
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
// (testing: every joint of every piece on the board, to check that statues at rest are still)
window.__jointSnap = (sq = -1) => {
  const out = {};
  for (const [k, p] of pieces) {
    if (sq >= 0 && k !== sq) continue;
    const v = [];
    p.fig.group.traverse((o) => {
      if (o.isMesh) return;
      v.push(o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x);
    });
    out[k] = v;
  }
  return out;
};
window.__alive = () => [...pieces.entries()].filter(([, p]) => p.fig.alive).map(([k]) => k);
// (testing: every piece plays a move; alive=true keeps it alive afterwards)
window.__poseAll = (name, alive = false) => {
  for (const p of pieces.values()) {
    p.fig.alive = alive;
    act(p, name, { loop: false, fade: 0.2 });
  }
};

function tick(realDt) {
  if (!ready) {
    post.render(scene, camera);
    return;
  }
  let dt = realDt * (state.speed || 1);
  if (slowLeft > 0) {
    slowLeft -= realDt;
    dt *= slowRate;
  }
  simT += dt;
  const t = simT;
  if (!current && queue.length) {
    current = startMove(queue.shift());
    drawOverlays();
  }
  if (current) stepMove(current, dt);
  for (let i = simTimers.length - 1; i >= 0; i--) {
    if (simT >= simTimers[i].at) {
      const f = simTimers[i].fn;
      simTimers.splice(i, 1);
      f();
    }
  }
  // the pieces not in the move: still statues (unless selected, or a king in check)
  for (const p of pieces.values()) {
    if (current && (p === current.mover || p === current.cap || (current.rook && p === current.rook.p))) continue;
    if (p.fig.statue) {
      // a king in check comes to life, on his guard
      const inCheck = !current && state.check === p.sq;
      if (inCheck && !p.fig.alive) {
        wake(p);
        p.checkWake = true;
      } else if (!inCheck && p.checkWake) {
        p.checkWake = false;
        if (state.selected !== p.sq) settle(p);
      }
      if (p.settleAt && simT >= p.settleAt) settled(p);
      p.fig.mixer.update(dt); // (a statue gone still doesn't move a joint)
    } else {
      if (!p.anim) idle(p);
      else if (p.until && t > p.until) idle(p);
      // a king in check raises his guard
      if (!current && state.check === p.sq && p.anim === 'idle') act(p, 'Blocking', { loop: true, fade: 0.3 });
      if (state.check !== p.sq && p.anim === 'Blocking') idle(p);
      // (and at rest the figure holds still: its idle pose, frozen once the cross-fade is done)
      if (!(p.anim === 'idle' && !p.fig.alive && simT - (p.idleAt || 0) > 0.45)) p.fig.mixer.update(dt);
    }
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
  tickSpells();
  for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].update(dt)) fx.splice(i, 1);
  updateRubble(dt);
  updateRecoils(dt);
  rubble.update(dt);
  melter.update(dt);
  updateCracks(dt);
  window.__melter = melter;
  window.__physMs = rubble.ms;
  window.__physPeak = Math.max(window.__physPeak || 0, rubble.ms);
  window.__prepPeak = Math.max(window.__prepPeak || 0, rubble.prepMs || 0);
  window.__rubble = rubble;
  window.__physAwake = rubble.awake;
  window.__physBodies = rubble.bodies.length;
  updateSparks(dt);
  particles.update(dt);
  updateCamera(realDt);
  fadeBlockers(realDt);
  contact();
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

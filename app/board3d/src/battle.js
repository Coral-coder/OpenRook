// Sound effects and spell visuals for the battles. All sounds are synthesised with WebAudio
// (no audio files): steel clangs, stone crashes, footsteps, whooshes and magic zaps.
import * as THREE from 'three';

let actx = null;
let enabled = true;
let noise = null;

export function setSound(on) {
  enabled = on;
}

export function unlockAudio() {
  if (!enabled) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (_) {
    actx = null;
  }
}

function ctx() {
  if (!enabled || !actx || actx.state !== 'running') return null;
  if (!noise) {
    noise = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return actx;
}

function env(c, node, peak, attack, decay, when = 0) {
  const g = c.createGain();
  const t = c.currentTime + when;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  node.connect(g);
  g.connect(c.destination);
  return t;
}

function noiseSource(c, filterType, freq, q = 1) {
  const s = c.createBufferSource();
  s.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  s.connect(f);
  return { s, f };
}

/** Steel on steel. */
export function clang(vol = 0.35) {
  const c = ctx();
  if (!c) return;
  for (const [f, v] of [[540, 1], [1290, 0.6], [1960, 0.45], [3120, 0.3]]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * (0.97 + Math.random() * 0.06);
    const t = env(c, o, vol * v, 0.003, 0.5 + Math.random() * 0.3);
    o.start(t);
    o.stop(t + 1);
  }
  const { s, f } = noiseSource(c, 'highpass', 3000);
  const t = env(c, f, vol * 0.6, 0.001, 0.06);
  s.start(t);
  s.stop(t + 0.1);
}

/** Stone breaking: a thump and a crumbling rumble. */
export function crash(vol = 0.6) {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.3);
  const t = env(c, o, vol, 0.005, 0.35);
  o.start(t);
  o.stop(t + 0.5);
  const n = noiseSource(c, 'lowpass', 1400, 0.7);
  const t2 = env(c, n.f, vol * 0.9, 0.004, 0.9);
  n.s.start(t2);
  n.s.stop(t2 + 1);
  // a few late pebbles
  for (let i = 0; i < 5; i++) {
    const p = noiseSource(c, 'bandpass', 1500 + Math.random() * 2500, 4);
    const tp = env(c, p.f, vol * 0.25, 0.002, 0.05, 0.25 + Math.random() * 0.7);
    p.s.start(tp);
    p.s.stop(tp + 0.1);
  }
}

export function step(vol = 0.12, heavy = false) {
  const c = ctx();
  if (!c) return;
  const n = noiseSource(c, 'lowpass', heavy ? 180 : 420, 1);
  const t = env(c, n.f, vol * (heavy ? 2.2 : 1), 0.004, heavy ? 0.16 : 0.07);
  n.s.start(t);
  n.s.stop(t + 0.25);
}

/** Stone grinding over stone for `dur` seconds: a statue sliding across the board. */
export function grind(dur = 1, vol = 0.35) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  // a low rumble, roughened by a fast wobble, plus a gritty scrape on top
  const rumble = noiseSource(c, 'lowpass', 260, 2);
  const scrape = noiseSource(c, 'bandpass', 1100, 1.5);
  const wob = c.createOscillator();
  wob.frequency.value = 17 + Math.random() * 6;
  const wobGain = c.createGain();
  wobGain.gain.value = 0.35;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
  g.gain.setValueAtTime(vol, t + Math.max(0.15, dur - 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const sg = c.createGain();
  sg.gain.value = 0.35;
  wob.connect(wobGain);
  wobGain.connect(g.gain);
  rumble.f.connect(g);
  scrape.f.connect(sg);
  sg.connect(g);
  g.connect(c.destination);
  for (const n of [rumble.s, scrape.s]) {
    n.loop = true;
    n.start(t);
    n.stop(t + dur + 0.05);
  }
  wob.start(t);
  wob.stop(t + dur + 0.05);
}

export function whoosh(vol = 0.2) {
  const c = ctx();
  if (!c) return;
  const n = noiseSource(c, 'bandpass', 500, 2);
  n.f.frequency.exponentialRampToValueAtTime(2600, c.currentTime + 0.25);
  const t = env(c, n.f, vol, 0.08, 0.2);
  n.s.start(t);
  n.s.stop(t + 0.4);
}

export function zap(vol = 0.25) {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(1400, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.35);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  o.connect(f);
  const t = env(c, f, vol, 0.01, 0.35);
  o.start(t);
  o.stop(t + 0.5);
}

export function chime(vol = 0.25) {
  const c = ctx();
  if (!c) return;
  [784, 988, 1175, 1568].forEach((f, i) => {
    const o = c.createOscillator();
    o.frequency.value = f;
    const t = env(c, o, vol, 0.01, 0.6, i * 0.08);
    o.start(t);
    o.stop(t + 0.8);
  });
}

// ------------------------------------------------------------------ glowing things
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const x = c.getContext('2d');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

export function glowSprite(color, size, solid = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/** Short-lived additive particles (sparks, embers, magic trails). */
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }
  burst(pos, { color = 0xffd27a, n = 18, speed = 2.2, up = 1.2, size = 0.07, life = 0.5, gravity = 6, solid = false } = {}) {
    for (let i = 0; i < n; i++) {
      const s = glowSprite(color, size * (0.6 + Math.random() * 0.8), solid);
      s.position.copy(pos);
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.6;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.list.push({ s, v: new THREE.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + up * Math.random(), Math.sin(a) * Math.cos(e) * sp), age: 0, life: life * (0.6 + Math.random() * 0.8), gravity, size: s.scale.x });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      p.v.y -= p.gravity * dt;
      p.s.position.addScaledVector(p.v, dt);
      const k = p.age / p.life;
      p.s.material.opacity = Math.max(0, 1 - k);
      p.s.scale.setScalar(p.size * (1 - k * 0.5));
      if (k >= 1) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}

// ------------------------------------------------------------------ the queen's wormhole
/** Two stone hands clapped together: a sharp slap with a short ringing tail. */
export function clap(vol = 0.5) {
  const c = ctx();
  if (!c) return;
  const n = noiseSource(c, 'bandpass', 1300 + Math.random() * 300, 1.2);
  const t = env(c, n.f, vol, 0.001, 0.07);
  n.s.start(t);
  n.s.stop(t + 0.12);
  const h = noiseSource(c, 'highpass', 4200, 0.7);
  const t2 = env(c, h.f, vol * 0.35, 0.001, 0.03);
  h.s.start(t2);
  h.s.stop(t2 + 0.06);
  // and a faint magical shimmer
  const o = c.createOscillator();
  o.frequency.value = 1760 + Math.random() * 200;
  const t3 = env(c, o, vol * 0.08, 0.005, 0.35);
  o.start(t3);
  o.stop(t3 + 0.45);
}

/** The wormhole's hum: a low throb and a rushing wind that rise together for `dur` seconds. */
export function wormHum(dur = 2, vol = 0.35) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
  g.gain.setValueAtTime(vol, t + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(c.destination);
  // the throb: two detuned saws, rising, through a low filter that opens as it grows
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(220, t);
  lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
  lp.Q.value = 3;
  const tg = c.createGain();
  tg.gain.value = 0.5;
  lp.connect(tg);
  tg.connect(g);
  const oscs = [];
  for (const d of [1, 1.013]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55 * d, t);
    o.frequency.exponentialRampToValueAtTime(190 * d, t + dur);
    o.connect(lp);
    oscs.push(o);
  }
  // the wind being drawn in: noise swept upward
  const w = noiseSource(c, 'bandpass', 300, 2.5);
  w.f.frequency.setValueAtTime(300, t);
  w.f.frequency.exponentialRampToValueAtTime(3200, t + dur);
  w.f.connect(g);
  w.s.loop = true;
  for (const s of [...oscs, w.s]) {
    s.start(t);
    s.stop(t + dur + 0.05);
  }
}

/** The wormhole snapping shut: a bright pop and a deep thump under it. */
export function flashPop(vol = 0.6) {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(1500, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(90, c.currentTime + 0.18);
  const t = env(c, o, vol * 0.7, 0.002, 0.2);
  o.start(t);
  o.stop(t + 0.3);
  const b = c.createOscillator();
  b.frequency.setValueAtTime(80, c.currentTime);
  b.frequency.exponentialRampToValueAtTime(32, c.currentTime + 0.5);
  const t2 = env(c, b, vol, 0.004, 0.55);
  b.start(t2);
  b.stop(t2 + 0.7);
  const n = noiseSource(c, 'highpass', 2500, 0.7);
  const t3 = env(c, n.f, vol * 0.5, 0.001, 0.12);
  n.s.start(t3);
  n.s.stop(t3 + 0.2);
  chime(vol * 0.25);
}

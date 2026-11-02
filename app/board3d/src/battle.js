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

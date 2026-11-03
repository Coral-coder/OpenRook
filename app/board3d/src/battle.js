// Sound effects and spell visuals for the battles. The sounds are recorded samples (see sfx.js and
// sounds/CREDITS.md): steel on steel, breaking stone, footsteps, whooshes and magic. The WebAudio
// synthesis below is kept only as a stand-in for any sample the browser fails to decode.
import * as THREE from 'three';
import { audioContext, setSfxEnabled, sfx, sfxStatus, unlockSfx } from './sfx.js';

let actx = null;
let enabled = true;
let noise = null;

export function setSound(on) {
  enabled = on;
  setSfxEnabled(on);
}

/** Call from a touch: browsers (iOS above all) only allow sound after a user gesture. */
export function unlockAudio() {
  if (!enabled) return;
  actx = unlockSfx();
}

/** Plays the recorded cue; falls back to the synthesised `synth` only if the cue can't be decoded. */
function play(name, opts, synth) {
  if (sfxStatus(name) === 'failed') return synth();
  return sfx(name, opts);
}

/** Old volume -> sfx volume, where `ref` was the old default (so a default call plays at vol 1). */
const rel = (vol, ref, max = 2) => Math.min(max, Math.max(0, vol / ref));

function ctx() {
  actx = audioContext();
  if (!actx) return null;
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
function synthClang(vol = 0.35) {
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
function synthCrash(vol = 0.6) {
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

function synthStep(vol = 0.12, heavy = false) {
  const c = ctx();
  if (!c) return;
  const n = noiseSource(c, 'lowpass', heavy ? 180 : 420, 1);
  const t = env(c, n.f, vol * (heavy ? 2.2 : 1), 0.004, heavy ? 0.16 : 0.07);
  n.s.start(t);
  n.s.stop(t + 0.25);
}

function synthWhoosh(vol = 0.2) {
  const c = ctx();
  if (!c) return;
  const n = noiseSource(c, 'bandpass', 500, 2);
  n.f.frequency.exponentialRampToValueAtTime(2600, c.currentTime + 0.25);
  const t = env(c, n.f, vol, 0.08, 0.2);
  n.s.start(t);
  n.s.stop(t + 0.4);
}

function synthZap(vol = 0.25) {
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

function synthChime(vol = 0.25) {
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
/** Two stone hands clapped together: a sharp slap, and the knock of stone in it. */
function synthClap(vol = 0.5) {
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
  const k = noiseSource(c, 'lowpass', 420, 1);
  const t3 = env(c, k.f, vol * 0.6, 0.001, 0.06);
  k.s.start(t3);
  k.s.stop(t3 + 0.1);
}

/** The wormhole's hum: a low throb and a rushing wind that rise together for `dur` seconds. */
function synthWormHum(dur = 2, vol = 0.35) {
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
  lp.frequency.setValueAtTime(150, t);
  lp.frequency.exponentialRampToValueAtTime(520, t + dur);
  lp.Q.value = 3;
  const tg = c.createGain();
  tg.gain.value = 0.5;
  lp.connect(tg);
  tg.connect(g);
  const oscs = [];
  for (const d of [1, 1.013]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(36 * d, t);
    o.frequency.exponentialRampToValueAtTime(62 * d, t + dur);
    o.connect(lp);
    oscs.push(o);
  }
  // the wind being drawn in: noise swept upward
  const w = noiseSource(c, 'bandpass', 180, 2.5);
  w.f.frequency.setValueAtTime(180, t);
  w.f.frequency.exponentialRampToValueAtTime(900, t + dur);
  w.f.connect(g);
  w.s.loop = true;
  for (const s of [...oscs, w.s]) {
    s.start(t);
    s.stop(t + dur + 0.05);
  }
}

/** The air rushing in as the wormhole collapses ([dur] seconds before the boom). */
function synthImplode(dur = 0.3, vol = 0.45) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  const n = noiseSource(c, 'lowpass', 300, 1.5);
  n.f.frequency.setValueAtTime(300, t);
  n.f.frequency.exponentialRampToValueAtTime(2400, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
  n.f.connect(g);
  g.connect(c.destination);
  n.s.loop = true;
  n.s.start(t);
  n.s.stop(t + dur + 0.05);
}

/** The wormhole collapsing: a deep, heavy boom, a sub-bass thump with a long rumbling tail. */
function synthBoom(vol = 0.9) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  // the thump: a sine dropping from a low punch into the sub-bass
  for (const [f0, f1, v, d] of [[70, 24, 1, 1.5], [46, 20, 0.7, 2.0], [120, 40, 0.35, 0.35]]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.8);
    const tt = env(c, o, vol * v, 0.006, d);
    o.start(tt);
    o.stop(tt + d + 0.1);
  }
  // the crack of it, dull and low
  const k = noiseSource(c, 'lowpass', 900, 0.8);
  const t2 = env(c, k.f, vol * 0.55, 0.002, 0.18);
  k.s.start(t2);
  k.s.stop(t2 + 0.25);
  // and the rumble rolling away
  const r = noiseSource(c, 'lowpass', 140, 1.2);
  r.f.frequency.setValueAtTime(220, t);
  r.f.frequency.exponentialRampToValueAtTime(60, t + 2.6);
  r.s.loop = true;
  const t3 = env(c, r.f, vol * 0.8, 0.03, 2.6);
  r.s.start(t3);
  r.s.stop(t3 + 2.8);
}

// ------------------------------------------------------------------ the sounds, as samples
/** Steel on steel. */
export function clang(vol = 0.35) {
  return play('sword_clash', { vol: rel(vol, 0.35) }, () => synthClang(vol));
}

/** Stone breaking: a big break for the loud ones, a smaller one for knocks. */
export function crash(vol = 0.6) {
  const name = vol >= 0.65 ? 'stone_break_large' : 'stone_break_small';
  return play(name, { vol: rel(vol, 0.6) }, () => synthCrash(vol));
}

/** A footstep on the stone board; `heavy` for rooks and statues. */
export function step(vol = 0.12, heavy = false) {
  return play(heavy ? 'footstep_heavy' : 'footstep_stone', { vol: rel(vol, heavy ? 0.25 : 0.12) }, () => synthStep(vol, heavy));
}

/** A blade cutting the air. */
export function whoosh(vol = 0.2) {
  return play('sword_swing', { vol: rel(vol, 0.2) }, () => synthWhoosh(vol));
}

/** A spell striking. */
export function zap(vol = 0.25) {
  return play('magic_impact', { vol: rel(vol, 0.25) }, () => synthZap(vol));
}

/** A piece promoted: no chime any more, but stone transformed by magic (a rumble and a shimmer). */
export function chime(vol = 0.25) {
  return play('promotion', { vol: rel(vol, 0.25) }, () => synthChime(vol));
}

/** Two stone hands clapped together. */
export function clap(vol = 0.5) {
  return play('clap', { vol: rel(vol, 0.5) }, () => synthClap(vol));
}

/** The wormhole's hum, rising in and held for `dur` seconds. */
export function wormHum(dur = 2, vol = 0.35) {
  return play('wormhole_hum', { vol: rel(vol, 0.35), loop: true, dur, fadeIn: dur * 0.35 }, () => synthWormHum(dur, vol));
}

/** The air rushing in as the wormhole collapses (`dur` seconds before the boom): a shockwave played backwards. */
export function implode(dur = 0.3, vol = 0.45) {
  return play('shockwave', { vol: rel(vol, 0.45), reverse: true, tail: Math.max(0.1, dur), fadeIn: dur * 0.6 },
    () => synthImplode(dur, vol));
}

/** The wormhole collapsing: a deep, heavy boom with a long rumbling tail. */
export function boom(vol = 0.9) {
  return play('wormhole_boom', { vol: rel(vol, 0.9, 1.5) }, () => synthBoom(vol));
}

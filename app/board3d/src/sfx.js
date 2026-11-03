// Recorded sound effects for the battles: steel, stone, hooves and magic in a stone hall.
//
// The samples (sounds/*.mp3, built by sounds/make_sounds.py from CC0 / public-domain recordings,
// see sounds/CREDITS.md) are embedded in the page as base64 by build.mjs, so nothing is loaded
// from the network. They are decoded in the background once audio is unlocked by a touch (iOS
// will not start audio otherwise), so page load is not slowed.
//
//   sfx(name, { vol = 1, rate = 1, delay = 0 })
//
// plays one of a cue's variants (never the same one twice running, when it has several) at a
// slightly varied pitch and level, so repeated blows don't sound mechanical. vol 1 is the cue's
// natural level in the mix. Unknown names, or sound switched off, are a silent no-op.
import SOUNDS from './sounds_data.gen.js';

// How loud each cue sits in the mix at vol 1 (the files themselves are all normalised to one level).
const GAIN = {
  sword_swing: 0.55, sword_clash: 0.75, sword_hit_stone: 0.75, stab: 0.75, shield_block: 0.75, shield_bash: 0.8,
  stone_crack: 0.65, stone_break_small: 0.75, stone_break_large: 0.95, stone_crumble: 0.6, body_fall: 0.85,
  dust: 0.35, footstep_stone: 0.4, footstep_heavy: 0.65, hoof: 0.45, horse_neigh: 0.6, clap: 0.8,
  spell_charge: 0.55, lightning: 0.95, fire_whoosh: 0.7, ice_form: 0.55, ice_shatter: 0.75, magic_shield: 0.6,
  magic_impact: 0.8, telekinesis: 0.55, shockwave: 0.85, earthquake: 0.85, wormhole_hum: 0.8, wormhole_boom: 1,
  wake: 0.65, settle: 0.5, promotion: 0.75, ooze: 0.55,
};
// how far pitch (playback rate) and level wander between repeats
const RATE_JITTER = 0.07;
const VOL_JITTER = 0.15;

let actx = null;
let master = null;
let enabled = true;
const buffers = {}; // name -> AudioBuffer[] once decoded
const pending = {}; // name -> Promise while decoding
const failed = {}; // name -> true if the browser could not decode it
const reversed = new Map(); // AudioBuffer -> reversed copy
const last = {}; // name -> index of the variant played last
let bgStarted = false;

/** Turns all sound on or off (the app's sound setting). */
export function setSfxEnabled(on) {
  enabled = on;
}

/** The shared AudioContext, once a touch has unlocked audio (null before, or when sound is off). */
export function audioContext() {
  return enabled && actx && actx.state === 'running' ? actx : null;
}

/** Call from a user gesture (a touch): creates/resumes the AudioContext and starts decoding. */
export function unlockSfx() {
  if (!enabled) return null;
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      // one gentle bus compressor so piles of simultaneous hits can't clip
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master = actx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
    // iOS: playing a silent buffer inside the gesture is what really unlocks output
    const b = actx.createBuffer(1, 1, actx.sampleRate);
    const s = actx.createBufferSource();
    s.buffer = b;
    s.connect(actx.destination);
    s.start(0);
  } catch (_) {
    actx = null;
    return null;
  }
  if (!bgStarted) {
    bgStarted = true;
    setTimeout(decodeAllInBackground, 50);
  }
  return actx;
}

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function decodeOne(ab) {
  // the callback form also works on older WebKit, where decodeAudioData returns no promise
  return new Promise((resolve, reject) => {
    try {
      const p = actx.decodeAudioData(ab, resolve, reject);
      if (p && p.catch) p.catch(reject);
    } catch (e) {
      reject(e);
    }
  });
}

/** Decodes all of a cue's variants (once). Resolves to the buffers, or null if it can't. */
export function loadCue(name) {
  if (buffers[name]) return Promise.resolve(buffers[name]);
  if (failed[name] || !SOUNDS[name] || !actx) return Promise.resolve(null);
  if (!pending[name]) {
    pending[name] = Promise.all(SOUNDS[name].map((b64) => decodeOne(b64ToArrayBuffer(b64)).catch(() => null)))
      .then((list) => {
        const ok = list.filter(Boolean);
        if (ok.length) buffers[name] = ok;
        else failed[name] = true;
        delete pending[name];
        return buffers[name] || null;
      });
  }
  return pending[name];
}

async function decodeAllInBackground() {
  for (const name of Object.keys(SOUNDS)) {
    await loadCue(name);
    await new Promise((r) => setTimeout(r, 0)); // let frames render between cues
  }
}

/** 'ready', 'loading', 'failed' or 'unknown' — lets the old synth sounds stand in if decoding failed. */
export function sfxStatus(name) {
  if (!SOUNDS[name]) return 'unknown';
  if (buffers[name]) return 'ready';
  if (failed[name]) return 'failed';
  return 'loading';
}

/** Names of all the cues. */
export const SFX_NAMES = Object.keys(SOUNDS);

function reverse(buf) {
  let r = reversed.get(buf);
  if (!r) {
    r = actx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = r.getChannelData(c);
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    reversed.set(buf, r);
  }
  return r;
}

function pick(name, list) {
  if (list.length === 1) return 0;
  let i = Math.floor(Math.random() * list.length);
  if (i === last[name]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  last[name] = i;
  return i;
}

function start(name, list, opts, when) {
  const { vol = 1, rate = 1 } = opts;
  const c = actx;
  const buf0 = list[pick(name, list)];
  const buf = opts.reverse ? reverse(buf0) : buf0;
  const src = c.createBufferSource();
  src.buffer = buf;
  const r = rate * (1 + (Math.random() * 2 - 1) * RATE_JITTER * 0.5);
  src.playbackRate.value = r;
  const g = c.createGain();
  const level = Math.max(0, vol) * (GAIN[name] ?? 0.7) * (1 + (Math.random() * 2 - 1) * VOL_JITTER * 0.5);
  src.connect(g);
  g.connect(master);
  const t = Math.max(c.currentTime, when);
  // `tail`: play only the last `tail` seconds (e.g. the end of a reversed boom, sucked in)
  const offset = opts.tail ? Math.max(0, buf.duration - opts.tail * r) : 0;
  const fadeIn = opts.fadeIn || 0;
  if (fadeIn > 0 || offset > 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), t + Math.max(fadeIn, 0.005));
  } else {
    g.gain.setValueAtTime(level, t);
  }
  if (opts.dur) {
    // loop the bed for `dur` seconds, then fade it out over its last 15%
    src.loop = !!opts.loop;
    const end = t + opts.dur;
    const fo = Math.max(0.05, opts.dur * 0.15);
    g.gain.setValueAtTime(Math.max(level, 0.0002), Math.max(t + fadeIn, end - fo));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    src.start(t, offset);
    src.stop(end + 0.05);
  } else {
    src.start(t, offset);
  }
  return {
    stop(fade = 0.08) {
      try {
        const n = c.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(g.gain.value, n);
        g.gain.exponentialRampToValueAtTime(0.0001, n + fade);
        src.stop(n + fade + 0.02);
      } catch (_) {}
    },
  };
}

/**
 * Plays the cue `name`. opts: vol (1 = natural level), rate (pitch/speed, 1 = as recorded), delay
 * (seconds from now). Returns a handle with stop(), or null if it can't play (unknown name, sound
 * off or locked, or undecodable). A cue still decoding plays as soon as it is ready, unless that
 * would be noticeably late.
 * (Also understood, for the long beds: loop + dur, fadeIn, reverse, tail.)
 */
export function sfx(name, opts = {}) {
  try {
    if (!enabled || !SOUNDS[name] || failed[name]) return null;
    const c = audioContext();
    if (!c) return null;
    const when = c.currentTime + Math.max(0, opts.delay || 0);
    if (buffers[name]) return start(name, buffers[name], opts, when);
    // not decoded yet: decode now and play if it comes in time
    let handle = null;
    let cancelled = false;
    loadCue(name).then((list) => {
      if (!list || cancelled || !audioContext()) return;
      if (c.currentTime - when > 0.25) return; // too late to still belong to what happened
      handle = start(name, list, opts, when);
    });
    return {
      stop(f) {
        cancelled = true;
        if (handle) handle.stop(f);
      },
    };
  } catch (_) {
    return null;
  }
}

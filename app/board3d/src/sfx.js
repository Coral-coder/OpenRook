// Sound effects by name. STUB: routes every name to the synthesised sounds in battle.js. The real
// module (recorded samples) replaces this file wholesale; keep the API exactly:
//   sfx(name, { vol, rate, delay })   vol 0..1 (default 1), rate playback speed (default 1),
//                                     delay seconds before it plays (default 0)
import { boom, chime, clang, clap, crash, implode, step, whoosh, wormHum, zap } from './battle.js';

const MAP = {
  sword_swing: (v) => whoosh(0.7 * v),
  sword_clash: (v) => clang(0.9 * v),
  sword_hit_stone: (v) => (crash(0.4 * v), clang(0.25 * v)),
  stab: (v) => (crash(0.35 * v), whoosh(0.3 * v)),
  shield_block: (v) => (crash(0.35 * v), clang(0.45 * v)),
  shield_bash: (v) => (crash(0.55 * v), step(0.3 * v, true)),
  stone_crack: (v) => crash(0.25 * v),
  stone_break_small: (v) => crash(0.45 * v),
  stone_break_large: (v) => (crash(0.9 * v), step(0.4 * v, true)),
  stone_crumble: (v) => crash(0.6 * v),
  body_fall: (v) => (step(0.45 * v, true), crash(0.35 * v)),
  dust: (v) => step(0.08 * v),
  footstep_stone: (v) => step(0.12 * v),
  footstep_heavy: (v) => step(0.3 * v, true),
  hoof: (v) => step(0.18 * v, true),
  horse_neigh: (v) => zap(0.12 * v),
  clap: (v) => clap(0.6 * v),
  spell_charge: (v) => zap(0.2 * v),
  lightning: (v) => (crash(0.5 * v), zap(0.35 * v)),
  fire_whoosh: (v) => whoosh(0.8 * v),
  ice_form: (v) => chime(0.15 * v),
  ice_shatter: (v) => (crash(0.6 * v), chime(0.2 * v)),
  magic_shield: (v) => chime(0.2 * v),
  magic_impact: (v) => (zap(0.35 * v), crash(0.3 * v)),
  telekinesis: (v) => implode(0.6, 0.3 * v),
  shockwave: (v) => boom(0.6 * v),
  earthquake: (v) => (boom(0.7 * v), crash(0.6 * v)),
  wormhole_hum: (v, o) => wormHum(o.dur || 2.3, 0.3 * v),
  wormhole_boom: (v) => boom(0.95 * v),
  wake: (v) => crash(0.12 * v),
  settle: (v) => step(0.15 * v, true),
  promotion: (v) => chime(0.25 * v),
  ooze: (v) => step(0.06 * v),
};

/** Plays the named sound: sfx('sword_clash', { vol: 0.8, rate: 1, delay: 0 }). Unknown names are ignored. */
export function sfx(name, opts = {}) {
  const f = MAP[name];
  if (!f) return;
  const vol = opts.vol === undefined ? 1 : opts.vol;
  const go = () => {
    try {
      f(vol, opts);
    } catch (_) {}
  };
  if (opts.delay > 0) setTimeout(go, opts.delay * 1000);
  else go();
}

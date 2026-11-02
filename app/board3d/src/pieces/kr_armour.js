// Sculpted plate armour for the knight's rider and the rook's soldier: a breastplate with a
// medial ridge and a waist, the plackart and fauld lames cut in as real grooves, a gorget,
// layered pauldrons, and helms with slits and breaths cut through.
import { blend, chisel, cone, sculpt, sphere, smax } from './kr_sculpt.js';

// cut grooves across a surface where band(x, y, z) < 0, [depth] deep
export function grooved(f, bands, w, depth) {
  return (x, y, z) => {
    const d = f(x, y, z);
    let g = Infinity;
    for (const b of bands) g = Math.min(g, Math.abs(b(x, y, z)) - w);
    return smax(d, -Math.max(g, -d - depth), w * 0.6);
  };
}

/** Torso in the spine's frame (the spine joint at the waist, the chest joint 0.12H above). */
export function torso(P, spine, H, { fauld = true } = {}) {
  const f = blend([
    [cone([0, -0.01 * H, 0.0], [0, 0.1 * H, 0.0], 0.094 * H, 0.112 * H, 1, 0.78)], // abdomen
    [sphere(0, 0.13 * H, 0.012 * H, 0.1 * H, 1.32, 0.95, 0.94), 0.04 * H], // the breastplate's swell
    [sphere(0, 0.12 * H, -0.02 * H, 0.1 * H, 1.25, 1.0, 0.8), 0.04 * H], // back
    [cone([0, 0.04 * H, 0.084 * H], [0, 0.2 * H, 0.088 * H], 0.008 * H, 0.006 * H), 0.012 * H], // medial ridge
    [cone([0, 0.18 * H, 0], [0, 0.235 * H, 0], 0.05 * H, 0.042 * H), 0.03 * H], // gorget
    ...(fauld ? [[cone([0, -0.06 * H, 0], [0, 0.0, 0], 0.112 * H, 0.098 * H, 1, 0.82), 0.02 * H]] : []),
  ]);
  const bands = [(x, y) => y - 0.045 * H, (x, y) => y - 0.075 * H, (x, y) => y - 0.205 * H];
  if (fauld) bands.push((x, y) => y + 0.02 * H, (x, y) => y + 0.04 * H);
  const g = sculpt(chisel(grooved(f, bands, 0.0025 * H, 0.004 * H), 0.0015 * H, 70 / H), [-0.16 * H, -0.08 * H, -0.12 * H], [0.16 * H, 0.26 * H, 0.12 * H], 32);
  return P.add(spine, g);
}

/** A pauldron of three lames over the shoulder joint, its outer side toward [s]. */
export function pauldron(P, sh, H, s) {
  // one smooth plate rolling over the shoulder, a lame below it, a raised rolled edge
  const f = blend([
    [sphere(s * 0.012 * H, 0.0, 0, 0.066 * H, 1.0, 0.62, 1.08)],
    [sphere(s * 0.026 * H, -0.03 * H, 0, 0.058 * H, 0.95, 0.42, 1.0), 0.016 * H],
  ]);
  const g = sculpt(grooved(f, [(x, y) => y + 0.018 * H], 0.0022 * H, 0.0035 * H), [-0.1 * H, -0.08 * H, -0.09 * H], [0.1 * H, 0.08 * H, 0.09 * H], 26);
  return P.add(sh, g);
}

/** A helm on the head joint: 'great' (flat-topped, cross and slits) or 'sallet' (round, brimmed, visor). */
export function helm(P, head, H, kind = 'great') {
  let f;
  if (kind === 'great') {
    f = blend([
      [cone([0, -0.02 * H, 0], [0, 0.12 * H, 0], 0.074 * H, 0.07 * H, 1, 1.02)],
      [sphere(0, 0.12 * H, 0, 0.07 * H, 1, 0.45, 1.02), 0.02 * H],
      [cone([0, 0.0, 0.075 * H], [0, 0.11 * H, 0.072 * H], 0.008 * H, 0.008 * H), 0.008 * H], // the cross: upright
      [cone([-0.05 * H, 0.06 * H, 0.072 * H], [0.05 * H, 0.06 * H, 0.072 * H], 0.007 * H, 0.007 * H), 0.008 * H],
    ]);
    const slits = (x, y, z) => Math.max(Math.abs(y - 0.07 * H) - 0.005 * H, Math.abs(x) - 0.055 * H, 0.012 * H - Math.abs(x), -z);
    const breaths = (x, y, z) => {
      let d = Infinity;
      for (let i = 0; i < 6; i++) {
        const bx = (i % 3) * 0.01 * H + 0.02 * H, by = 0.02 * H - Math.floor(i / 3) * 0.014 * H;
        for (const sx of [-1, 1]) d = Math.min(d, Math.hypot(x - sx * bx, y - by) - 0.0032 * H);
      }
      return Math.max(d, -z);
    };
    const deep = (g) => (x, y, z) => Math.max(g(x, y, z), -(f(x, y, z) + 0.008 * H)); // cut 8 mm in, no deeper
    const cut = (x, y, z) => Math.max(f(x, y, z), -deep(slits)(x, y, z), -deep(breaths)(x, y, z), -(y + 0.019 * H));
    return P.add(head, sculpt(cut, [-0.1 * H, -0.05 * H, -0.1 * H], [0.1 * H, 0.17 * H, 0.1 * H], 30));
  }
  // sallet: a round skull tapering to a tail behind, a visor with a slit, a crest
  f = blend([
    [sphere(0, 0.06 * H, 0, 0.075 * H, 1, 0.95, 1.05)],
    [cone([0, 0.03 * H, -0.04 * H], [0, -0.01 * H, -0.13 * H], 0.05 * H, 0.012 * H, 1.4, 1), 0.03 * H], // the tail
    [sphere(0, 0.04 * H, 0.03 * H, 0.072 * H, 1, 0.75, 1.0), 0.01 * H], // visor
    [cone([0, 0.08 * H, -0.09 * H], [0, 0.15 * H, 0.03 * H], 0.008 * H, 0.008 * H, 0.6, 1), 0.02 * H], // crest
  ]);
  const slit = (x, y, z) => Math.max(Math.abs(y - 0.055 * H) - 0.005 * H, Math.abs(x) - 0.045 * H, -z, -(f(x, y, z) + 0.008 * H));
  const cut = (x, y, z) => Math.max(f(x, y, z), -slit(x, y, z), -(y + 0.005 * H - Math.max(0, -z) * 0.25));
  return P.add(head, sculpt(cut, [-0.1 * H, -0.05 * H, -0.17 * H], [0.1 * H, 0.18 * H, 0.12 * H], 32));
}

/** A plume of carved feathers on the helm's top, sweeping back. */
export function plume(P, head, H) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = -0.4 - i * 0.16, l = 0.13 * H - i * 0.004 * H;
    const x0 = (i % 2 ? 1 : -1) * 0.006 * H;
    parts.push([cone([x0, 0.16 * H, -0.0], [x0 * 3, 0.16 * H + Math.cos(a) * l, Math.sin(a) * l], 0.012 * H, 0.004 * H), 0.008 * H]);
  }
  parts.unshift([sphere(0, 0.16 * H, 0, 0.016 * H)]);
  return P.add(head, sculpt(chisel(blend(parts), 0.002 * H, 160 / H), [-0.05 * H, 0.12 * H, -0.18 * H], [0.05 * H, 0.32 * H, 0.06 * H], 22));
}

// The rook: a castle tower that walks by itself, like the great stone rooks of the wizard's chess
// set. No soldier stands in it: a round keep of dressed stones, and rising from its parapet a
// narrower turret of the same stones crowned with its own battlements. Only a pair of stone
// arms, grown from the turret's sides, swing its sword.
// (Carved on the shared skeleton: joint names and positions are what statues.js animates; the
// turret is hung on the spine, chest and head joints so it leans and turns as the rook fights.)
import { joint } from '../carving.js';
import { armLimb, gauntlet, sword } from './kr_armour.js';
import { crenels, drum, keep } from './kr_keep.js';

export function rook(J, root, P) {
  const T = 0.62;
  const tower = joint(J, 'tower', root, 0, 0, 0);
  // a keep of dressed stones: a battered plinth, courses of blocks laid with mortar joints
  // (each block bevelled, weathered and a little different), a round-arched door, slit
  // windows, corbels under a projecting parapet and capped merlons
  keep(tower, P, T);
  const H = 0.95;
  joint(J, 'hips', tower, 0, T - 0.06, 0);
  joint(J, 'spine', J.hips, 0, 0.02, 0);
  joint(J, 'chest', J.spine, 0, 0.12 * H, 0);
  joint(J, 'neck', J.chest, 0, 0.12 * H, 0);
  joint(J, 'head', J.neck, 0, 0.045 * H, 0);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    joint(J, 'sh' + side, J.chest, s * 0.13 * H, 0.1 * H, 0);
    joint(J, 'el' + side, J['sh' + side], 0, -0.17 * H, 0);
    joint(J, 'wr' + side, J['el' + side], 0, -0.15 * H, 0);
  }
  // the turret: its lower drum rises out of the keep's parapet (on the spine), its upper drum
  // (on the chest) and its crown of battlements (on the head) above
  drum(J.spine, P, { r: 0.112, rTop: 0.108, y0: -0.06, y1: 0.12 * H, courses: 5, seed: 21 });
  drum(J.chest, P, { r: 0.108, rTop: 0.104, y0: 0.0, y1: 0.15 * H, courses: 4, seed: 23 });
  // corbels stepping the crown out over the drum
  P.lathe(J.head, [[0.098, -0.05], [0.112, -0.046], [0.118, -0.036], [0.126, -0.03], [0.128, -0.024], [0.1, -0.024]], 0, 48);
  crenels(J.head, P, { r: 0.13, y: -0.02, n: 6, h: 0.06, depth: 0.028, seed: 29 });
  // a slit window in the drum, facing forward, and a pointed cap rising behind the battlements
  P.box(J.chest, 0.014, 0.07, 0.01, 0, 0.07 * H, 0.104, 0, 0, 0);
  P.lathe(J.head, [[0.1, -0.022], [0.1, 0.0], [0.0001, 0.02]], 0, 32);
  // stone arms grown from the turret: lames of stone like stacked rings, stone fists
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    P.sphere(J['sh' + side], 0.058 * H, 0, 0, 0, [1, 1, 1], 20);
    armLimb(P, J['sh' + side], 0.17 * H, 0.05 * H, 0.042 * H, 3);
    armLimb(P, J['el' + side], 0.15 * H, 0.042 * H, 0.034 * H, 3);
    P.sphere(J['el' + side], 0.045 * H, 0, 0, 0, null, 16);
    gauntlet(P, J['wr' + side], H, s);
  }
  const sw = sword(P, J.wrR, H, 0.42);
  sw.position.set(0, -0.05 * H, 0.02 * H);
  J.weapon = sw;
  return { H, legs: [], style: 'one', hand: 'R' };
}

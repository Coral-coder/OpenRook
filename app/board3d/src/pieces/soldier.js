// The rook's soldier and the knight's rider (armoured torso and arms), and the knight's war horse.
import { armLimb, cop, gauntlet, pauldron, torso } from './kr_armour.js';

// the armoured torso and arms of the rook's soldier and the knight's rider
export function soldierTop(J, P, H) {
  torso(P, J.spine, H);
  P.belt(J.spine, 0.1 * H, 0.0);
  P.cyl(J.neck, 0.034 * H, 0.04 * H, 0.06 * H, 0, 0, 0);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    armLimb(P, J['sh' + side], 0.17 * H, 0.05 * H, 0.04 * H, 3);
    pauldron(P, J['sh' + side], H, s);
    armLimb(P, J['el' + side], 0.15 * H, 0.04 * H, 0.033 * H, 3);
    cop(P, J['el' + side], 0.038 * H, s, false);
    gauntlet(P, J['wr' + side], H, s);
  }
}

export { horse } from './kr_horse.js';

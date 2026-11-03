// Skeletons for the Wizard Chess statues, and how they move.
//
// The statues are single carved meshes, so each gets a hand-built skeleton: joints placed on
// the figure (in the model's millimetres, the figure facing +z), and every vertex bound to the
// joint(s) of the body part it belongs to, chosen by where it sits on that figure. The moves are
// then poses of those joints, played over time: the king heaves his sword over his head and
// brings it down, the queen raises her staff in both hands and smashes it down, the bishop
// swings his crozier, the knight's horse rears and stamps while the rider swings his mace, the
// soldier on the rook twists and slashes, and the pawn springs out of his crouch to stab.
//
// Joint names shared by the moves:
//   hips, spine, head, weapon (the striking arm and what it holds), off (the other arm or the
//   shield), legL, legR; the knight adds horse, front, neck, tail, rider.
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6; // as in figures.js

const sm = (v, a, b) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// two joints sharing a vertex: `t` of the way from a to b
const mix = (a, b, t) => (t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]]);

// Each rig: the joints ([parent, pivot]); `parts`, the moving limbs, each grown over the mesh
// surface from a seed point through the vertices `allow` admits (so a limb takes only what is
// actually attached to it, not whatever happens to lie nearby); and `base`, the body the rest
// belongs to. `swing` / `off` turn a raise (0 rest .. 1 overhead) and a strike follow-through
// into the weapon arm's and the other arm's rotation.
export const RIGS = {
  [KING]: {
    // his armour is long slivers from belt to feet, so his body stays one piece that leans from
    // the ankles; the arms with the sword, and the head, move on their own
    bones: {
      root: [null, [0, 0, 0]], spine: ['root', [0, 10.5, 0]], head: ['spine', [0, 46.5, 0]],
      weapon: ['spine', [0, 45.5, 0.5]],
    },
    parts: [
      // both arms reach down to the sword hilt: arms, hands and sword lift together
      { bone: 'weapon', seed: [[-1.5, 43, 5.5], [1.5, 43, 5.5], [-8, 39.5, 1], [8, 39.5, 1], [0, 39, 5.2], [0, 34.5, 4.8], [0, 10, 2.7]], allow: (x, y, z) =>
        (y > 36 && y < 47.5 && (Math.abs(x) > 4.4 || z > 1.8) && !(x > 3.4 && z < -2.2)) ||
        (Math.abs(x) < 1.6 && Math.abs(z - (2.6 + (y - 12) * 0.095)) < 2.1 && y > 9.9 && y < 45) },
      { bone: 'head', seed: [0, 51, 0], allow: (x, y, z) => y > 46 && Math.abs(x) < 3.8 },
    ],
    base(x, y, z) {
      return y < 10.2 ? [['root', 1]] : [['spine', 1]];
    },
    swing: (a, b) => [-2.5 * a - 1.05 * b, 0, 0], // overhead, then down to arms-out, blade forward
    legs: false,
  },
  [QUEEN]: {
    bones: {
      root: [null, [0, 0, 0]], hips: ['root', [0, 22, 0]], spine: ['hips', [0, 31, 0]], head: ['spine', [0, 45, 0.5]],
      weapon: ['spine', [0, 43, 0.5]],
    },
    parts: [
      // her arms, the hands crossed before her face, and the staff standing in front of her
      { bone: 'weapon', seed: [[-2, 42, 6.5], [2, 42, 6.5], [-7.5, 37, 1], [7.5, 37, 1], [0, 30, 6.5], [0, 15, 6.2]], allow: (x, y, z) =>
        (y > 34 && y < 46.8 && !(y > 45 && z < 5.2) && (z > 3.8 || Math.abs(x) > 4.8) && !(x > 4 && z < -1.5)) ||
        (Math.abs(x) < 1.5 && z > 4.2 && y > 10.45 && y < 41) },
      { bone: 'head', seed: [0, 50, 0], allow: (x, y, z) => y > 45 && Math.abs(x) < 3.8 && !(y < 47.5 && z > 4.6) },
    ],
    base(x, y, z) {
      if (y < 10.4) return [['root', 1]];
      if (y < 22) return mix('root', 'hips', sm(y, 10.4, 20)); // the hem stays on the pedestal
      return mix('hips', 'spine', sm(y, 28, 33));
    },
    swing: (a, b) => [-2.3 * a - 1.25 * b, 0, 0],
    legs: false,
  },
  [BISHOP]: {
    bones: {
      root: [null, [0, 0, 0]], hips: ['root', [0, 23, 0]], spine: ['hips', [0, 24, 0]], head: ['spine', [0, 37.5, 0]],
      weapon: ['spine', [5.5, 34.5, 0]], off: ['spine', [-5.5, 34.5, 0]], legL: ['hips', [2.2, 22.5, 0]], legR: ['hips', [-2.2, 22.5, 0]],
    },
    parts: [
      // his left arm and the crozier it holds, curled head and all
      { bone: 'weapon', seed: [[6.8, 40, 2.5], [8.5, 32, 1], [6.1, 20, 3.4], [5, 47, 2]], allow: (x, y, z) =>
        (x > 4.6 && y > 28 && y < 44) || (x > 5.2 && x < 7 && z > 2.3 && z < 4.5 && y > 8.8) || (x > 2.6 && y > 43 && z > -0.5) },
      // the right hand raised in blessing
      { bone: 'off', seed: [-7.5, 41, 2], allow: (x, y, z) => x < -4.6 && y > 28.5 && y < 45 },
      { bone: 'head', seed: [0, 44, 0], allow: (x, y, z) => y > 37 && Math.abs(x) < 3.2 },
    ],
    base(x, y, z) {
      if (y < 9) return [['root', 1]];
      if (z < -1.6) return mix('hips', 'spine', sm(y, 20, 27)); // the cape on his back
      if (y < 23.5 && Math.abs(x) > 1.4) return mix(x < 0 ? 'legR' : 'legL', 'hips', sm(y, 20, 23.5));
      return mix('hips', 'spine', sm(y, 22, 26));
    },
    swing: (a, b) => [-2 * a - 1.1 * b, 0, 0.35 * a],
    off: (a) => [-1.1 * a, 0, -0.4 * a],
    legs: true,
  },
  [KNIGHT]: {
    bones: {
      root: [null, [0, 0, 0]], horse: ['root', [0, 21, -5]], front: ['horse', [0, 32, 7]], neck: ['horse', [0, 35, 4.5]],
      tail: ['horse', [0, 24, -8.5]], rider: ['horse', [0, 29, -2]], head: ['rider', [0, 38.5, -5]], weapon: ['rider', [-3.5, 37.5, -3]],
    },
    parts: [
      { bone: 'weapon', seed: [-4.2, 41.5, -3], allow: (x, y, z) => x < -2.2 && y > 31 && z < 4 && z > -9.6 },
      { bone: 'rider', seed: [0, 35, -4], allow: (x, y, z) =>
        (y > 29.5 && z < 3.2 && z > -9.6 && Math.abs(x) < 7) || (Math.abs(x) > 4.6 && y > 20.5 && y < 31 && z > -6.5 && z < 3) },
      { bone: 'front', seed: [[-2, 30, 19], [2, 27, 15]], allow: (x, y, z) => z > 8.5 && y > 22 && y < 33.5 },
      { bone: 'neck', seed: [0, 44, 9], allow: (x, y, z) => z > 2 && y > 34.5 },
      { bone: 'tail', seed: [0, 15, -10], allow: (x, y, z) => z < -8.3 && y < 26 },
    ],
    base(x, y, z) {
      if (y < 9) return [['root', 1]];
      if (y < 21 && z < 3.5) return mix('root', 'horse', sm(y, 10, 20)); // hind legs bend as he rears
      return [['horse', 1]];
    },
    swing: (a, b) => [-0.9 * a + 1.6 * b, 0, 0],
    legs: false,
  },
  [ROOK]: {
    // a soldier on the battlements, facing -x: shield arm to +z, sword arm to -z
    bones: {
      root: [null, [0, 0, 0]], spine: ['root', [0, 33, 0]], head: ['spine', [0, 41, 0]],
      weapon: ['spine', [0, 39, -3.5]], off: ['spine', [0, 39, 3.5]],
    },
    parts: [
      { bone: 'off', seed: [-1, 32, 9.5], allow: (x, y, z) => (z > 6.3 && y > 21) || (z > 3.2 && y > 35) },
      { bone: 'weapon', seed: [-6, 38, -7.5], allow: (x, y, z) => (z < -3.2 && y > 35) || (x < -4.3 && y > 34.8) },
      { bone: 'head', seed: [0, 44, 0], allow: (x, y, z) => y > 41 && Math.hypot(x, z) < 3.8 },
    ],
    base(x, y, z) {
      if (y < 32 || (y < 35 && Math.hypot(x, z) > 5.2)) return [['root', 1]]; // the tower and battlements
      return mix('root', 'spine', sm(y, 32, 34.5));
    },
    // a flat slash: sweep the sword arm round in front of him (about y), lifting it first
    swing: (a, b) => [0.8 * a - 0.2 * b, -0.6 * a + 1.5 * b, 0],
    off: (a) => [-0.7 * a, 0.3 * a, 0],
    legs: false,
  },
  [PAWN]: {
    // crouched on his heels, blade tucked under his crossed arms. To fight he stands up: the
    // whole body rises off the pedestal on a pair of legs that are folded away inside the crouch
    // (`legs` below), and his back straightens
    bones: {
      root: [null, [0, 0, 0]], spine: ['root', [0, 10.5, -1]], head: ['spine', [0, 17.5, 6.5]],
      weapon: ['spine', [0, 15.5, 3]],
    },
    // [x, z] of each leg: foot on the pedestal (root), hip up inside the body (spine)
    unfold: { foot: [[-2.4, 1.2], [2.4, 1.2]], hip: [[-2.3, 0], [2.3, 0]], footY: 9.45, hipY: 12, r: [1.9, 1.5] },
    caps: { pedestal: [0, 9.46, -1, 6.6], body: [0, 9.5, -1, 6.2] }, // [x, y, z, radius]
    parts: [
      { bone: 'head', seed: [0, 20, 9], allow: (x, y, z) => z > 5.8 && y > 16.2 },
      // the crossed arms and the dagger they hold
      { bone: 'weapon', seed: [0, 13, 5.5], allow: (x, y, z) => y > 10.8 && y < 17 && z > 2.5 },
    ],
    base(x, y, z) {
      // the seam where he sat on the pedestal goes with him (inside his footprint), the
      // pedestal's rim stays
      const under = (x / 6.4) ** 2 + ((z + 1) / 6.8) ** 2 < 1;
      return y < 9.25 || (y < 9.6 && !under) ? [['root', 1]] : [['spine', 1]];
    },
    // a flat slash: the blade comes out from under his arms, swings wide, then cuts across
    swing: (a, b) => [-0.9 * a - 0.6 * b, 1.6 * a - 2.4 * b, 0.5 * a - 0.3 * b],
    legs: false,
  },
};

const S = Math.sin;
const bump = (k, a, b, c, d) => (k < a ? 0 : k < b ? sm(k, a, b) : k < c ? 1 : k < d ? 1 - sm(k, c, d) : 0);

/**
 * Joint rotations for a move at time T (s), progress k (0..1), blow landing at `at`.
 * Returns { joint: [rx, ry, rz] } and adds body offsets into P (the whole statue).
 */
export function posture(type, move, k, T, at, side, seed) {
  const rig = RIGS[type];
  const J = {};
  const add = (n, r) => {
    if (!rig.bones[n]) return;
    const o = J[n] || (J[n] = [0, 0, 0]);
    o[0] += r[0]; o[1] += r[1]; o[2] += r[2];
  };
  const weapon = (a, b) => add('weapon', rig.swing(a, b));
  // the pawn unfolding: 0 crouched .. 1 standing tall (joint offsets in J.$pos, in mm)
  const stand = (u) => {
    if (type !== PAWN || u <= 0) return;
    J.$pos = { spine: [0, 8 * u, 0.5 * u] };
    add('spine', [-0.8 * u, 0, 0]);
    add('head', [0.5 * u, 0, 0]);
  };
  const off = (a) => rig.off && add('off', rig.off(a));
  const knight = type === KNIGHT;
  switch (move) {
    case 'idle': {
      // statues come alive: breathing, glancing round, shifting their grip
      const b = S(T * 1.6 + seed) * 0.025;
      add('spine', [b, S(T * 0.35 + seed) * 0.06, 0]);
      add('head', [S(T * 0.5 + seed * 2) * 0.05, S(T * 0.42 + seed) * 0.35, 0]);
      weapon(0.04 + 0.03 * S(T * 0.9 + seed), 0);
      if (knight) {
        add('horse', [-0.03 + S(T * 1.3 + seed) * 0.02, 0, 0]);
        add('neck', [S(T * 1.1 + seed) * 0.12, S(T * 0.4 + seed) * 0.15, 0]);
        add('front', [S(T * 2.2 + seed) * 0.12, 0, 0]);
        add('tail', [0, 0, S(T * 2.7 + seed) * 0.25]);
      }
      break;
    }
    case 'walk':
    case 'run': {
      // marching: legs stride, arms swing, the body rolls; the horse gallops
      const w = move === 'run' ? 11 : 7.5;
      const st = S(T * w);
      if (rig.legs) {
        add('legL', [0.5 * st, 0, 0]);
        add('legR', [-0.5 * st, 0, 0]);
        add('spine', [0.06, 0.1 * st, 0]);
      } else {
        add('spine', [0.08, 0.08 * st, 0.06 * S(T * w * 0.5)]);
        add('hips', [0, 0, 0.05 * S(T * w * 0.5)]);
      }
      add('head', [0.05, -0.08 * st, 0]);
      weapon(0.12 + 0.08 * st, 0);
      off(0.25 + 0.1 * st);
      if (knight) {
        const g = T * 9;
        add('horse', [-0.14 - 0.12 * S(g), 0, 0]);
        add('front', [0.55 * S(g + 1.2), 0, 0]);
        add('neck', [0.18 * S(g + 0.6), 0, 0]);
        add('tail', [0.2, 0, 0.25 * S(g)]);
        add('rider', [0.12 + 0.08 * S(g + 2), 0, 0]);
      }
      if (type === ROOK) add('spine', [0, 0.45 * S(T * 1.7), 0]); // the lookout scans the field
      if (type === PAWN) {
        stand(0.6); // half up out of his crouch to scurry
        add('spine', [0, 0, 0.1 * st]);
      }
      break;
    }
    case 'leap':
      // the knight's horse springs: rearing on take-off, legs tucked, stretching for the landing
      add('horse', [-0.5 * S(Math.PI * Math.min(1, k * 1.4)), 0, 0]);
      add('front', [-0.7 * bump(k, 0, 0.3, 0.6, 0.85) + 0.4 * bump(k, 0.7, 0.85, 0.9, 1), 0, 0]);
      add('neck', [-0.3 * bump(k, 0, 0.3, 0.5, 0.9), 0, 0]);
      add('tail', [0.5 * bump(k, 0.1, 0.4, 0.6, 1), 0, 0]);
      add('rider', [0.3 * bump(k, 0, 0.3, 0.6, 1), 0, 0]);
      if (rig.legs) {
        add('legL', [-0.6 * bump(k, 0, 0.3, 0.7, 1), 0, 0]);
        add('legR', [0.4 * bump(k, 0, 0.3, 0.7, 1), 0, 0]);
      }
      weapon(0.5 * bump(k, 0, 0.3, 0.7, 1), 0);
      break;
    case 'attack':
    case 'attack2':
    case 'finish': {
      // wind up: heave the weapon back; then bring it down hard through the target
      const big = move === 'finish' ? 1.25 : 1;
      const a = bump(k, 0.04, at - 0.14, at - 0.1, at);
      const b = bump(k, at - 0.09, at, at + 0.14, 0.97);
      weapon(a * big, b);
      off(a * 0.8);
      add('spine', [(-0.22 * a + 0.35 * b) * big, (0.2 * a - 0.15 * b) * big, 0]);
      add('head', [-0.25 * a + 0.25 * b, -0.2 * a, 0]);
      if (rig.legs) {
        add('legL', [-0.45 * b - 0.15 * a, 0, 0]);
        add('legR', [0.35 * b + 0.1 * a, 0, 0]);
      }
      if (type === PAWN) stand(bump(k, 0, at * 0.45, 0.85, 1)); // unfolds to his full height to cut
      if (knight) {
        // the horse rears, forelegs pawing, and crashes down on the victim
        add('horse', [(-0.42 * a + 0.15 * b) * big, 0, 0]);
        add('front', [-0.5 * a + 0.5 * b, 0, 0]);
        add('neck', [-0.35 * a + 0.35 * b, 0, 0]);
        add('tail', [0.4 * a, 0, 0]);
        add('rider', [-0.2 * a + 0.3 * b, 0, 0]);
      }
      break;
    }
    case 'block': {
      const j = bump(k, 0, 0.15, 0.55, 1);
      weapon(0.55 * j, 0);
      off(1 * j);
      add('spine', [-0.18 * j, 0.25 * side * j, 0]);
      add('head', [-0.15 * j, 0, 0]);
      if (knight) add('horse', [-0.25 * j, 0, 0]);
      break;
    }
    case 'guard':
      stand(0.7);
      weapon(0.38 + 0.04 * S(T * 2), 0);
      off(0.6);
      add('spine', [-0.05, 0.12 * S(T * 0.9), 0]);
      add('head', [0, 0.2 * S(T * 0.7), 0]);
      if (rig.legs) {
        add('legL', [-0.2, 0, 0.08]);
        add('legR', [0.15, 0, -0.08]);
      }
      if (knight) {
        add('horse', [-0.1 + 0.05 * S(T * 3), 0, 0]);
        add('front', [0.3 * S(T * 5), 0, 0]);
        add('neck', [0.15 * S(T * 3), 0, 0]);
      }
      break;
    case 'hit':
    case 'hit2': {
      const j = bump(k, 0, 0.1, 0.25, 1) * (move === 'hit2' ? 1.4 : 1);
      add('spine', [-0.35 * j, 0.2 * side * j, 0.15 * side * j]);
      add('head', [-0.5 * j, 0.3 * side * j, 0]);
      weapon(0.35 * j, 0);
      off(0.5 * j);
      if (knight) {
        add('horse', [-0.35 * j, 0, 0]);
        add('front', [-0.5 * j, 0, 0]);
        add('neck', [-0.4 * j, 0, 0]);
      }
      break;
    }
    case 'dodgeL':
    case 'dodgeR': {
      const s = move === 'dodgeL' ? 1 : -1;
      const j = bump(k, 0, 0.25, 0.55, 1);
      add('spine', [0, 0.3 * s * j, 0.35 * s * j]);
      add('head', [0, -0.3 * s * j, 0]);
      if (rig.legs) add(s > 0 ? 'legL' : 'legR', [0, 0, 0.3 * s * j]);
      break;
    }
    case 'death': {
      // the blow lands: arms fly up, head snaps back, and he goes over stiff as a board
      const j = Math.min(1, T / 0.25);
      const limp = sm(T, 0.6, 1.1);
      weapon(0.9 * j * (1 - limp) + 0.3 * limp, 0);
      off(1 * j);
      add('spine', [-0.4 * j, 0, 0.2 * side * j]);
      add('head', [-0.7 * j, 0.4 * side, 0]);
      if (rig.legs) add('legL', [-0.4 * j, 0, 0]);
      if (knight) {
        add('horse', [-0.6 * j, 0, 0]);
        add('front', [-0.9 * j, 0, 0]);
        add('neck', [-0.6 * j, 0, 0]);
      }
      break;
    }
    case 'cheer': {
      const j = bump(k, 0, 0.25, 0.7, 1);
      stand(j);
      weapon(1.05 * j, 0);
      add('spine', [-0.15 * j, 0, 0]);
      add('head', [-0.35 * j, 0, 0]);
      if (knight) {
        add('horse', [-0.6 * j, 0, 0]);
        add('front', [-0.6 * j + 0.3 * S(T * 12) * j, 0, 0]);
        add('neck', [-0.3 * j, 0, 0]);
      }
      break;
    }
    case 'fidget': {
      const j = bump(k, 0, 0.2, 0.8, 1);
      add('head', [0.1 * j, 0.6 * side * S(Math.PI * k), 0]);
      add('spine', [0, 0.2 * side * j, 0]);
      weapon(0.25 * j, 0);
      if (knight) add('front', [0.5 * S(k * Math.PI * 4) * j, 0, 0]);
      break;
    }
  }
  return J;
}

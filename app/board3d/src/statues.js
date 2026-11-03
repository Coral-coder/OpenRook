// The Wizard Chess statues, carved in detail (carving.js) on real skeletons.
//
// Every piece stands on the same octagonal, columned pedestal. Above it the figure is a
// hierarchy of joints (pelvis, spine, chest, neck, head; shoulder, elbow, wrist; hip, knee,
// ankle; the horse's shoulders, knees, neck and tail), and each body part is solid stone hung
// on its joint: nothing bends or stretches, the stone turns at the joint like a jointed
// statue. The legs are solved with two-bone IK so the feet stay planted on the pedestal while
// the body crouches, lunges or rises.
//
// Units are board squares (a square is 1; the real board's squares are 40 mm). Figures face
// +z; their right hand is on -x. Each piece type is carved once; its parts are merged per
// joint (one draw per limb) and shared by every statue of that type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { granite } from './granite.js';
import { kit, pedestal } from './carving.js';
import { BUILD } from './pieces/index.js';

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const PED = 0.215; // pedestal height

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// merge every mesh hanging directly on the same joint into one
function consolidate(root) {
  const groups = new Map();
  root.traverse((o) => {
    if (o.isMesh) {
      if (!groups.has(o.parent)) groups.set(o.parent, []);
      groups.get(o.parent).push(o);
    }
  });
  for (const [parent, meshes] of groups) {
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    for (const m of meshes) parent.remove(m);
    const mm = new THREE.Mesh(merged, meshes[0].material);
    mm.castShadow = mm.receiveShadow = true;
    parent.add(mm);
  }
}

const TEMPLATES = {};
function template(type) {
  if (TEMPLATES[type]) return TEMPLATES[type];
  const P = kit(new THREE.MeshStandardMaterial());
  const model = new THREE.Group();
  pedestal(model, P);
  const body = new THREE.Group();
  body.name = 'body';
  body.position.y = PED;
  model.add(body);
  const J = {};
  const info = BUILD[type](J, body, P);
  consolidate(model);
  return (TEMPLATES[type] = { model, info });
}

// ------------------------------------------------------------------ poses and moves
// A pose is { joint: [rx, ry, rz] } plus
//   '$hips': [dy, dz]      the pelvis (in figure heights); the legs follow by IK
//   '$fL', '$fR': [dx, dy, dz]  a foot lifting and stepping on the pedestal top (figure heights)
//   '$root': [dx, dy, dz, rx, ry, rz]  the whole statue sliding, hopping, tilting, turning
//   '$aim': [w]            how much of the fight's aiming correction (see aimAt) applies
// A move is a list of keys [seconds, pose, 'h'?] played as a smooth spline through them (with
// 'h' the motion comes to rest at that key: the top of a wind-up, a held guard). Joints follow
// one another with a little lag (feet and hips lead, the wrist trails), so a blow travels up
// the body like the crack of a whip. `hits` are the moments (seconds) blows land.
//
// Arms: a shoulder's rx < 0 swings the arm forward and up (-PI/2 level, -PI overhead), rz
// spreads it (outward is +z for the left arm, -z for the right); an elbow's rx < 0 bends it.
// A weapon runs down the hand (-y), so its angle in the swing plane is the sum of the arm's
// rx's: the helpers take that angle (phi) and work out the wrist. phi: -PI/2 points ahead,
// -PI straight up, -3PI/2 straight back (a sword laid behind the head), 0 straight down.
const PI = Math.PI;

// two hands on one hilt (king's greatsword, queen's staff); zc swings both arms to one side
// (> 0 towards the figure's left)
const IN2 = 0.34;
// (phi is the weapon's angle in the world: the body's own lean is taken off the wrist)
const pitch = (x) => (x.spine ? x.spine[0] : 0) + (x.chest ? x.chest[0] : 0) + (x.$root ? x.$root[3] || 0 : 0);
function two(sx, zc, el, phi, x = {}) {
  const w = phi - sx - el - pitch(x);
  return { shR: [sx, 0, zc + IN2], shL: [sx, 0, zc - IN2], elR: [el, 0, 0], elL: [el, 0, 0], wrR: [w, 0, 0], wrL: [w, 0, 0], ...x };
}
// one weapon in the right hand (rook's sword, knight's mace; mirrored for the bishop), the
// other arm on guard (the rook's and knight's shield is on that forearm). out: spread outward.
function one(sx, out, el, phi, off, x = {}) {
  return { shR: [sx, 0, -out], elR: [el, 0, 0], wrR: [phi - sx - el - pitch(x), 0, 0], shL: [off[0], 0, -off[1]], elL: [off[2], 0, 0], ...x };
}
// a blade in each hand (the pawn): [sx, out, el, phi] per arm
function dual(l, r, x = {}) {
  const p = pitch(x);
  return { shL: [l[0], 0, l[1]], elL: [l[2], 0, 0], wrL: [l[3] - l[0] - l[2] - p, 0, 0], shR: [r[0], 0, -r[1]], elR: [r[2], 0, 0], wrR: [r[3] - r[0] - r[2] - p, 0, 0], ...x };
}
const lerpPose = (a, b, u) => blend(a, b, u);

// how far each joint trails the move (seconds): the legs and hips lead, the hand follows last
const LAG = {
  $fL: -0.07, $fR: -0.07, $root: -0.04, $hips: -0.05, hips: -0.05, tower: -0.04, spine: -0.035, chest: -0.02, neck: -0.03, head: -0.05,
  shL: 0, shR: 0, elL: 0.025, elR: 0.025, wrL: 0.045, wrR: 0.045,
  horse: -0.05, hneck: -0.02, hhead: 0.02, flL: -0.03, flR: -0.01, fkL: 0, fkR: 0.02, tail: 0.08,
};

// ---- the two-handed fighter: king (greatsword) and queen (staff)
function twoHanded() {
  const guard = two(-1.0, -0.12, -0.95, -2.3, { spine: [0.06, 0.18, 0], head: [0.04, -0.12, 0], $hips: [-0.05, 0], $fL: [0, 0, 0.07], $fR: [0, 0, -0.06] });
  const rest = { shL: [-0.55, 0, -0.35], elL: [-1.05, 0, 0], shR: [-0.55, 0, 0.35], elR: [-1.05, 0, 0], wrR: [1.5, 0, 0], wrL: [1.5, 0, 0] };
  const recover = (p) => lerpPose(p, guard, 0.6);
  const P = { rest, guard };
  const M = {};
  // overhead cleave: up and back behind the head, then straight down through the target
  {
    const wind = two(-2.85, 0.0, -1.1, -4.45, { spine: [-0.18, -0.1, 0], chest: [-0.08, 0, 0], head: [-0.05, 0.1, 0], $hips: [-0.02, -0.05], $fL: [0, 0.05, 0.03], $fR: [0, 0, -0.06], $root: [0, 0.015, -0.05, -0.05, 0, 0] });
    const imp = two(-1.5, 0.05, -0.12, -1.72, { spine: [0.45, 0.02, 0], chest: [0.18, 0, 0], head: [-0.3, 0, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: [0, 0, 0.18, 0.06, 0, 0], $aim: [1] });
    M.cleave = { line: 'high', heavy: true, hits: [0.7], keys: [
      [0, guard],
      [0.22, two(-0.75, -0.1, -1.45, -1.9, { spine: [0.16, 0.1, 0], chest: [0.05, 0, 0], $hips: [-0.09, -0.02], $fL: [0, 0, 0.06], $fR: [0, 0, -0.06] })],
      [0.48, wind, 'h'],
      [0.6, two(-2.95, 0.0, -0.35, -3.45, { spine: [-0.05, 0, 0], chest: [-0.05, 0, 0], head: [-0.15, 0, 0], $hips: [-0.05, 0.02], $fL: [0, 0.06, 0.12], $fR: [0, 0, -0.07], $root: [0, 0.05, 0.1, 0, 0, 0], $aim: [0.7] })],
      [0.7, imp],
      [0.82, two(-1.0, 0.1, -0.1, -1.25, { spine: [0.55, 0.05, 0], chest: [0.2, 0, 0], head: [-0.45, 0, 0], $hips: [-0.14, 0.1], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: [0, 0, 0.19, 0.09, 0, 0], $aim: [0.6] })],
      [1.05, recover(two(-1.0, 0.1, -0.1, -1.25, { spine: [0.6, 0.05, 0], $hips: [-0.14, 0.1], $fL: [0, 0, 0.15], $root: [0, 0, 0.19, 0.05, 0, 0] }))],
      [1.35, guard],
    ] };
  }
  // diagonal slash: from high over the right shoulder down across to the left hip
  const slashKeys = (t0) => {
    const wind = two(-2.55, -0.8, -1.2, -4.25, { spine: [-0.15, -0.6, -0.1], chest: [-0.08, -0.3, 0], head: [0, 0.55, 0], $hips: [-0.03, -0.04], $fL: [0, 0.04, 0.02], $fR: [0, 0, -0.06], $root: [0, 0.01, -0.03, -0.03, -0.25, 0] });
    return [
      [t0 + 0.18, two(-1.2, -0.45, -1.1, -2.6, { spine: [0.1, -0.25, 0], chest: [0, -0.1, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.06] })],
      [t0 + 0.44, wind, 'h'],
      [t0 + 0.56, two(-2.3, -0.3, -0.4, -3.2, { spine: [0.1, -0.2, 0], chest: [0, -0.1, 0], head: [0, 0.2, 0], $hips: [-0.06, 0.03], $fL: [0, 0.05, 0.11], $fR: [0, 0, -0.06], $root: [0, 0.04, 0.08, 0, -0.1, 0], $aim: [0.7] })],
      [t0 + 0.64, two(-1.45, 0.4, -0.15, -1.8, { spine: [0.35, 0.35, 0.1], chest: [0.12, 0.2, 0], head: [-0.2, -0.3, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.16, 0.05, 0.15, 0], $aim: [1] })],
      [t0 + 0.76, two(-0.8, 0.8, -0.15, -1.0, { spine: [0.5, 0.6, 0.15], chest: [0.15, 0.3, 0], head: [-0.3, -0.4, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.17, 0.07, 0.25, 0], $aim: [0.5] })],
    ];
  };
  M.slash = { line: 'mid', hits: [0.64], keys: [[0, guard], ...slashKeys(0), [1.0, recover(two(-0.8, 0.8, -0.15, -1.0, { spine: [0.5, 0.6, 0.15], $root: [0, 0, 0.17, 0.04, 0.2, 0] }))], [1.25, guard]] };
  // horizontal sweep: wound round to the right, the whole body unwinds, blade level
  {
    const wind = two(-1.5, -1.45, -0.7, -2.0, { spine: [0.05, -0.75, 0], chest: [0, -0.35, 0], head: [0, 0.75, 0], $hips: [-0.07, -0.03], $fL: [0, 0.04, 0.03], $fR: [0, 0, -0.07], $root: [0, 0, -0.04, 0, -0.35, 0] });
    M.sweep = { line: 'mid', hits: [0.66], keys: [
      [0, guard],
      [0.2, two(-1.1, -0.5, -1.2, -2.2, { spine: [0.1, -0.3, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.06] })],
      [0.46, wind, 'h'],
      [0.58, two(-1.5, -0.7, -0.3, -1.7, { spine: [0.1, -0.3, 0], chest: [0, -0.1, 0], head: [0, 0.3, 0], $hips: [-0.08, 0.03], $fL: [0, 0.05, 0.1], $fR: [0, 0, -0.07], $root: [0, 0.03, 0.08, 0, -0.15, 0], $aim: [0.7] })],
      [0.66, two(-1.5, 0.1, -0.1, -1.6, { spine: [0.15, 0.15, 0], chest: [0.05, 0.1, 0], head: [-0.1, -0.15, 0], $hips: [-0.1, 0.05], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.15, 0, 0.05, 0], $aim: [1] })],
      [0.78, two(-1.45, 0.95, -0.2, -1.6, { spine: [0.15, 0.6, 0], chest: [0.05, 0.35, 0], head: [0, -0.35, 0], $hips: [-0.1, 0.05], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.16, 0, 0.35, 0], $aim: [0.4] })],
      [1.02, recover(two(-1.45, 0.95, -0.2, -1.6, { spine: [0.15, 0.6, 0], $root: [0, 0, 0.12, 0, 0.3, 0] }))],
      [1.3, guard],
    ] };
  }
  // the thrust: drawn back to the right hip, then driven straight in with a long lunge
  M.thrust = { line: 'mid', hits: [0.62], keys: [
    [0, guard],
    [0.4, two(0.25, -0.55, -1.75, -1.65, { spine: [-0.05, -0.5, 0], chest: [0, -0.2, 0], head: [0, 0.4, 0], $hips: [-0.11, -0.04], $fL: [0, 0.03, 0.04], $fR: [0, 0, -0.07], $root: [0, 0, -0.08, -0.04, -0.25, 0] }), 'h'],
    [0.54, two(-0.9, -0.45, -0.9, -1.6, { spine: [0.2, -0.1, 0], head: [0, 0.1, 0], $hips: [-0.08, 0.04], $fL: [0, 0.05, 0.12], $fR: [0, 0, -0.08], $root: [0, 0.03, 0.1, 0.02, -0.1, 0], $aim: [0.8] })],
    [0.62, two(-1.52, -0.3, -0.05, -1.6, { spine: [0.35, 0.1, 0], chest: [0.1, 0.1, 0], head: [-0.2, 0, 0], $hips: [-0.13, 0.09], $fL: [0, 0, 0.17], $fR: [0, 0, -0.09], $root: [0, 0, 0.24, 0.06, 0.05, 0], $aim: [1] })],
    [0.74, two(-1.5, -0.3, -0.05, -1.55, { spine: [0.38, 0.12, 0], chest: [0.1, 0.1, 0], head: [-0.2, 0, 0], $hips: [-0.13, 0.09], $fL: [0, 0, 0.17], $fR: [0, 0, -0.09], $root: [0, 0, 0.25, 0.06, 0.05, 0], $aim: [0.8] })],
    [0.92, recover(two(-1.2, 0.0, -0.5, -1.9, { spine: [0.3, 0.1, 0], $hips: [-0.1, 0.05], $root: [0, 0, 0.12, 0.03, 0, 0] }))],
    [1.15, guard],
  ] };
  // the finisher: a diagonal slash, then the blade carried right round in a full spin
  {
    const s = slashKeys(0);
    const sp = (ry, p) => ({ ...p, $root: [0, 0.03, 0.18, 0.02, ry, 0] });
    M.spin = { line: 'mid', heavy: true, hits: [0.64, 1.34], keys: [
      [0, guard], ...s.slice(0, 4),
      [0.8, sp(0.9, two(-1.3, 0.9, -0.2, -1.5, { spine: [0.3, 0.6, 0.1], chest: [0.1, 0.3, 0], head: [-0.1, -0.5, 0], $hips: [-0.1, 0.05], $fL: [0, 0.04, 0.1] }))],
      [0.98, sp(PI * 0.75, two(-1.6, -1.2, -0.3, -1.9, { spine: [0.1, -0.5, 0], chest: [0, -0.3, 0], head: [0, 0.6, 0], $hips: [-0.06, 0.02], $fR: [0, 0.04, 0] }))],
      [1.16, sp(PI * 1.5, two(-1.55, -1.3, -0.4, -1.95, { spine: [0.05, -0.7, 0], chest: [0, -0.35, 0], head: [0, 0.8, 0], $hips: [-0.07, 0.0], $fL: [0, 0.05, 0.06] }))],
      [1.34, { ...two(-1.5, 0.15, -0.1, -1.6, { spine: [0.2, 0.15, 0], chest: [0.05, 0.1, 0], head: [-0.15, -0.15, 0], $hips: [-0.12, 0.06], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $aim: [1] }), $root: [0, 0, 0.24, 0.03, PI * 2 + 0.05, 0] }],
      [1.46, { ...two(-1.45, 0.9, -0.2, -1.6, { spine: [0.2, 0.55, 0], chest: [0.05, 0.3, 0], head: [0, -0.3, 0], $hips: [-0.12, 0.06], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $aim: [0.5] }), $root: [0, 0, 0.25, 0.03, PI * 2 + 0.35, 0] }],
      [1.85, { ...guard, $root: [0, 0, 0.05, 0, PI * 2, 0] }],
      [2.05, { ...guard, $root: [0, 0, 0, 0, PI * 2, 0] }],
    ] };
  }
  // the staff raised, the orb levelled at the foe: a bolt (the queen's spell)
  M.cast = { line: 'mid', cast: true, hits: [0.72], keys: [
    [0, guard],
    [0.3, two(-2.7, 0.0, -0.5, -3.3, { spine: [-0.25, 0, 0], chest: [-0.1, 0, 0], head: [-0.3, 0, 0], $hips: [-0.02, -0.02], $root: [0, 0.03, 0, -0.04, 0, 0] })],
    [0.52, two(-2.95, 0.0, -0.2, -3.25, { spine: [-0.3, 0, 0], chest: [-0.12, 0, 0], head: [-0.35, 0, 0], $hips: [0, -0.03], $root: [0, 0.05, -0.02, -0.06, 0, 0] }), 'h'],
    [0.66, two(-1.7, 0.0, -0.1, -1.2, { spine: [0.35, 0, 0], chest: [0.12, 0, 0], head: [-0.15, 0, 0], $hips: [-0.1, 0.06], $fL: [0, 0, 0.12], $fR: [0, 0, -0.06], $root: [0, 0, 0.12, 0.05, 0, 0] })],
    [0.82, two(-1.6, 0.0, -0.1, -1.1, { spine: [0.4, 0, 0], chest: [0.12, 0, 0], head: [-0.15, 0, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.12], $fR: [0, 0, -0.06], $root: [0, 0, 0.13, 0.06, 0, 0] })],
    [1.3, guard],
  ] };
  // guards: blade upright across the body, or held flat over the head
  P.blockMid = two(-1.25, -0.25, -1.15, -3.0, { spine: [0.0, 0.25, 0], head: [-0.05, -0.2, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockHigh = { ...two(-2.25, 0.05, -1.05, -4.0, { spine: [-0.12, 0.1, 0], head: [-0.15, 0, 0], $hips: [-0.09, -0.03], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] }), wrR: [-4.0 + 2.25 + 1.05, 0, 1.2], wrL: [-4.0 + 2.25 + 1.05, 0, 1.2] };
  P.fling = two(-2.4, 0.4, -0.3, -3.0, { spine: [-0.4, 0.3, 0.15], chest: [-0.2, 0.1, 0], head: [-0.5, 0.3, 0.3] });
  P.cheer = two(-3.0, 0, -0.1, -3.2, { spine: [-0.15, 0, 0], head: [-0.35, 0, 0] });
  return { P, M };
}

// ---- one weapon arm: rook (sword and shield), knight (mace and shield), bishop (crozier, left)
function oneHanded() {
  const shieldUp = [-1.05, 0.4, -1.35];
  const guard = one(-0.85, 0.35, -1.15, -2.35, shieldUp, { spine: [0.08, 0.15, 0], head: [0.04, -0.1, 0], $hips: [-0.04, 0], $fL: [0, 0, 0.06], $fR: [0, 0, -0.05] });
  const rest = one(-0.2, 0.15, -0.6, -0.0, [-0.4, 0.2, -1.2]);
  const recover = (p) => lerpPose(p, guard, 0.6);
  const P = { rest, guard };
  const M = {};
  const cleaveKeys = (t0, d = 1) => {
    const wind = one(-2.75, 0.35, -1.5, -4.6, [-1.3, 0.2, -0.9], { spine: [-0.25, -0.4, 0], chest: [-0.12, -0.2, 0], head: [0.05, 0.45, 0], $hips: [-0.02, -0.05], $fL: [0, 0.05, 0.03], $fR: [0, 0, -0.06], $root: [0, 0.015, -0.04, -0.05, -0.12, 0] });
    return [
      [t0 + 0.2 * d, one(-0.6, 0.3, -1.5, -2.0, [-1.1, 0.4, -1.2], { spine: [0.15, 0.05, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.05] })],
      [t0 + 0.44 * d, wind, 'h'],
      [t0 + 0.55 * d, one(-2.95, 0.15, -0.45, -3.5, [-1.0, 0.0, -1.1], { spine: [-0.02, -0.1, 0], head: [-0.1, 0.1, 0], $hips: [-0.05, 0.02], $fL: [0, 0.06, 0.11], $fR: [0, 0, -0.06], $root: [0, 0.05, 0.09, 0, -0.04, 0], $aim: [0.7] })],
      [t0 + 0.64 * d, one(-1.5, -0.05, -0.15, -1.75, [-0.4, -0.3, -1.2], { spine: [0.42, 0.25, 0], chest: [0.15, 0.1, 0], head: [-0.28, -0.2, 0], $hips: [-0.1, 0.07], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.17, 0.07, 0.1, 0], $aim: [1] })],
      [t0 + 0.76 * d, one(-0.7, -0.35, -0.1, -0.75, [-0.3, -0.4, -1.1], { spine: [0.55, 0.35, 0], chest: [0.18, 0.15, 0], head: [-0.4, -0.25, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.18, 0.1, 0.15, 0], $aim: [0.5] })],
    ];
  };
  M.cleave = { line: 'high', heavy: true, hits: [0.64], keys: [[0, guard], ...cleaveKeys(0), [1.0, recover(one(-0.7, -0.35, -0.1, -0.75, [-0.3, -0.4, -1.1], { spine: [0.55, 0.35, 0], $hips: [-0.12, 0.08], $root: [0, 0, 0.18, 0.06, 0.12, 0] }))], [1.25, guard]] };
  // diagonal slash, high right to low left, the shield swung back for balance
  M.slash = { line: 'mid', hits: [0.62], keys: [
    [0, guard],
    [0.18, one(-1.1, 0.5, -1.2, -2.5, shieldUp, { spine: [0.1, -0.2, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.05] })],
    [0.42, one(-2.5, 1.0, -1.3, -4.2, [-1.4, 0.1, -0.8], { spine: [-0.15, -0.65, -0.12], chest: [-0.08, -0.3, 0], head: [0, 0.6, 0], $hips: [-0.03, -0.04], $fL: [0, 0.04, 0.02], $fR: [0, 0, -0.06], $root: [0, 0.01, -0.03, -0.03, -0.28, 0] }), 'h'],
    [0.54, one(-2.3, 0.5, -0.45, -3.2, [-1.1, 0.0, -1.0], { spine: [0.1, -0.2, 0], head: [0, 0.2, 0], $hips: [-0.06, 0.03], $fL: [0, 0.05, 0.11], $fR: [0, 0, -0.06], $root: [0, 0.04, 0.08, 0, -0.1, 0], $aim: [0.7] })],
    [0.62, one(-1.45, -0.45, -0.15, -1.8, [-0.4, -0.4, -1.2], { spine: [0.35, 0.4, 0.1], chest: [0.12, 0.2, 0], head: [-0.2, -0.3, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.16, 0.05, 0.18, 0], $aim: [1] })],
    [0.74, one(-0.8, -0.9, -0.15, -1.0, [-0.3, -0.5, -1.1], { spine: [0.5, 0.65, 0.15], chest: [0.15, 0.3, 0], head: [-0.3, -0.45, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.17, 0.07, 0.28, 0], $aim: [0.5] })],
    [0.98, recover(one(-0.8, -0.9, -0.15, -1.0, [-0.3, -0.5, -1.1], { spine: [0.5, 0.65, 0.15], $root: [0, 0, 0.15, 0.04, 0.22, 0] }))],
    [1.22, guard],
  ] };
  // backhand-forehand sweep: wound round to the right, the body unwinds, the blade level
  M.sweep = { line: 'mid', hits: [0.64], keys: [
    [0, guard],
    [0.2, one(-1.1, 0.7, -1.3, -2.2, shieldUp, { spine: [0.1, -0.3, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.05] })],
    [0.44, one(-1.45, 1.45, -0.9, -2.0, [-1.3, 0.1, -1.0], { spine: [0.05, -0.75, 0], chest: [0, -0.35, 0], head: [0, 0.75, 0], $hips: [-0.07, -0.03], $fL: [0, 0.04, 0.03], $fR: [0, 0, -0.07], $root: [0, 0, -0.04, 0, -0.35, 0] }), 'h'],
    [0.56, one(-1.5, 0.8, -0.3, -1.7, [-1.0, -0.1, -1.1], { spine: [0.1, -0.3, 0], head: [0, 0.3, 0], $hips: [-0.08, 0.03], $fL: [0, 0.05, 0.1], $fR: [0, 0, -0.07], $root: [0, 0.03, 0.08, 0, -0.15, 0], $aim: [0.7] })],
    [0.64, one(-1.5, -0.1, -0.1, -1.6, [-0.5, -0.4, -1.1], { spine: [0.15, 0.2, 0], chest: [0.05, 0.1, 0], head: [-0.1, -0.15, 0], $hips: [-0.1, 0.05], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.15, 0, 0.08, 0], $aim: [1] })],
    [0.76, one(-1.45, -1.0, -0.2, -1.6, [-0.4, -0.5, -1.0], { spine: [0.15, 0.65, 0], chest: [0.05, 0.35, 0], head: [0, -0.35, 0], $hips: [-0.1, 0.05], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.16, 0, 0.38, 0], $aim: [0.4] })],
    [1.0, recover(one(-1.45, -1.0, -0.2, -1.6, [-0.4, -0.5, -1.0], { spine: [0.15, 0.65, 0], $root: [0, 0, 0.12, 0, 0.3, 0] }))],
    [1.28, guard],
  ] };
  // a lunging thrust, shield tucked in
  M.thrust = { line: 'mid', hits: [0.6], keys: [
    [0, guard],
    [0.38, one(0.35, 0.3, -1.85, -1.6, [-1.2, 0.5, -1.4], { spine: [-0.05, -0.55, 0], chest: [0, -0.2, 0], head: [0, 0.45, 0], $hips: [-0.11, -0.04], $fL: [0, 0.03, 0.04], $fR: [0, 0, -0.07], $root: [0, 0, -0.08, -0.04, -0.28, 0] }), 'h'],
    [0.52, one(-0.8, 0.1, -1.0, -1.6, [-1.0, 0.3, -1.3], { spine: [0.2, -0.1, 0], head: [0, 0.1, 0], $hips: [-0.08, 0.04], $fL: [0, 0.05, 0.12], $fR: [0, 0, -0.08], $root: [0, 0.03, 0.1, 0.02, -0.1, 0], $aim: [0.8] })],
    [0.6, one(-1.55, -0.1, -0.05, -1.6, [-0.4, -0.2, -1.3], { spine: [0.35, 0.25, 0], chest: [0.1, 0.12, 0], head: [-0.2, -0.1, 0], $hips: [-0.13, 0.09], $fL: [0, 0, 0.17], $fR: [0, 0, -0.09], $root: [0, 0, 0.25, 0.06, 0.12, 0], $aim: [1] })],
    [0.72, one(-1.52, -0.1, -0.05, -1.55, [-0.4, -0.2, -1.3], { spine: [0.38, 0.27, 0], chest: [0.1, 0.12, 0], head: [-0.2, -0.1, 0], $hips: [-0.13, 0.09], $fL: [0, 0, 0.17], $fR: [0, 0, -0.09], $root: [0, 0, 0.26, 0.06, 0.12, 0], $aim: [0.8] })],
    [0.9, recover(one(-1.2, 0.1, -0.5, -1.9, shieldUp, { spine: [0.3, 0.1, 0], $hips: [-0.1, 0.05], $root: [0, 0, 0.12, 0.03, 0.05, 0] }))],
    [1.12, guard],
  ] };
  // the finisher: a shield-bash (or off-hand shove) that rocks the foe, then the cleave
  {
    const c = cleaveKeys(0.42, 1.1);
    M.bash = { line: 'high', heavy: true, hits: [0.32, 0.42 + 0.64 * 1.1], keys: [
      [0, guard],
      [0.16, one(-0.6, 0.3, -1.3, -2.1, [-0.6, 0.7, -1.9], { spine: [0.0, 0.35, 0], chest: [0, 0.15, 0], $hips: [-0.09, -0.03], $fL: [0, 0.04, 0.03], $fR: [0, 0, -0.06], $root: [0, 0, -0.04, 0, 0.25, 0] }), 'h'],
      [0.32, one(-0.6, 0.4, -1.4, -2.0, [-1.55, -0.1, -0.15], { spine: [0.3, -0.45, 0], chest: [0.1, -0.2, 0], head: [-0.1, 0.3, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $root: [0, 0.02, 0.2, 0.05, -0.3, 0] })],
      ...c.slice(1).map(([t, p, h]) => [t, { ...p, $root: p.$root ? [p.$root[0], p.$root[1], p.$root[2] + 0.08, p.$root[3], p.$root[4], p.$root[5]] : [0, 0, 0.08, 0, 0, 0] }, h]),
      [0.42 + 1.0 * 1.1, recover(one(-0.7, -0.35, -0.1, -0.75, [-0.3, -0.4, -1.1], { spine: [0.55, 0.35, 0], $root: [0, 0, 0.2, 0.06, 0.12, 0] }))],
      [0.42 + 1.25 * 1.1, guard],
    ] };
  }
  P.blockMid = one(-1.2, 0.2, -1.35, -3.0, [-1.45, 0.5, -1.25], { spine: [0.0, 0.2, 0], head: [-0.05, -0.15, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockHigh = { ...one(-2.3, 0.3, -1.0, -4.0, [-2.2, 0.35, -1.0], { spine: [-0.12, 0.1, 0], head: [-0.15, 0, 0], $hips: [-0.09, -0.03], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] }) };
  P.blockHigh.wrR = [P.blockHigh.wrR[0], 0, 1.2];
  P.fling = one(-2.2, 0.8, -0.3, -2.8, [-1.6, -0.6, -0.4], { spine: [-0.4, 0.3, 0.15], chest: [-0.2, 0.1, 0], head: [-0.5, 0.3, 0.3] });
  P.cheer = one(-3.0, 0.2, -0.2, -3.3, [-0.4, 0.3, -0.6], { spine: [-0.15, 0, 0], head: [-0.3, 0, 0] });
  return { P, M };
}

// ---- the pawn: crouched at rest, up on his feet with a blade in each hand to fight
function dualBlades() {
  const rest = { $hips: [-0.13, 0.02], spine: [0.85, 0, 0], chest: [0.25, 0, 0], head: [-0.75, 0, 0], shL: [-0.9, 0, -0.55], elL: [-1.5, 0, 0], shR: [-0.9, 0, 0.55], elR: [-1.5, 0, 0], wrL: [1.1, 0, 0], wrR: [1.1, 0, 0] };
  const guard = dual([-0.95, 0.35, -1.15, -2.4], [-1.1, 0.3, -1.0, -2.25], { spine: [0.18, 0.1, 0], chest: [0.05, 0, 0], head: [-0.15, -0.08, 0], $hips: [-0.07, 0], $fL: [0, 0, 0.07], $fR: [0, 0, -0.06] });
  const recover = (p) => lerpPose(p, guard, 0.6);
  const P = { rest, guard };
  const M = {};
  // the X: rise up tall with both blades flung wide and high, then cut them in across each other
  M.cross = { line: 'high', hits: [0.62], keys: [
    [0, guard],
    [0.2, dual([-0.6, 0.15, -1.7, -2.5], [-0.6, 0.15, -1.7, -2.5], { spine: [0.45, 0, 0], chest: [0.1, 0, 0], head: [-0.35, 0, 0], $hips: [-0.15, 0], $fL: [0, 0, 0.06], $fR: [0, 0, -0.06] })],
    [0.46, dual([-2.6, 0.9, -0.6, -3.95], [-2.6, 0.9, -0.6, -3.95], { spine: [-0.22, 0, 0], chest: [-0.12, 0, 0], head: [-0.2, 0, 0], $hips: [0, -0.02], $fL: [0, 0.05, 0.04], $fR: [0, 0, -0.05], $root: [0, 0.04, -0.03, -0.05, 0, 0] }), 'h'],
    [0.55, dual([-2.3, 0.45, -0.3, -3.0], [-2.3, 0.45, -0.3, -3.0], { spine: [0.05, 0, 0], $hips: [-0.03, 0.02], $fL: [0, 0.06, 0.11], $fR: [0, 0, -0.06], $root: [0, 0.07, 0.09, 0, 0, 0], $aim: [0.7] })],
    [0.62, dual([-1.4, -0.45, -0.15, -1.65], [-1.5, -0.35, -0.15, -1.7], { spine: [0.45, 0, 0], chest: [0.15, 0, 0], head: [-0.3, 0, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $root: [0, 0, 0.17, 0.06, 0, 0], $aim: [1] })],
    [0.75, dual([-0.8, -0.75, -0.2, -0.9], [-0.8, -0.65, -0.2, -0.9], { spine: [0.6, 0, 0], chest: [0.18, 0, 0], head: [-0.45, 0, 0], $hips: [-0.14, 0.09], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $root: [0, 0, 0.18, 0.08, 0, 0], $aim: [0.5] })],
    [0.96, recover(dual([-0.8, -0.75, -0.2, -0.9], [-0.8, -0.65, -0.2, -0.9], { spine: [0.6, 0, 0], $hips: [-0.14, 0.09], $root: [0, 0, 0.15, 0.04, 0, 0] }))],
    [1.2, guard],
  ] };
  // right forehand, then the left blade backhanded through
  M.double = { line: 'mid', hits: [0.56, 0.92], keys: [
    [0, guard],
    [0.36, dual([-1.0, 0.3, -1.2, -2.4], [-2.4, 1.0, -1.1, -4.1], { spine: [-0.1, -0.55, -0.1], chest: [-0.05, -0.25, 0], head: [0, 0.5, 0], $hips: [-0.04, -0.03], $fL: [0, 0.04, 0.03], $fR: [0, 0, -0.06], $root: [0, 0.02, -0.03, -0.03, -0.25, 0] }), 'h'],
    [0.48, dual([-1.1, 0.2, -1.2, -2.4], [-2.1, 0.4, -0.4, -3.0], { spine: [0.15, -0.2, 0], $hips: [-0.06, 0.03], $fL: [0, 0.05, 0.1], $root: [0, 0.04, 0.08, 0, -0.1, 0], $aim: [0.7] })],
    [0.56, dual([-1.6, 1.2, -0.6, -2.0], [-1.45, -0.45, -0.15, -1.75], { spine: [0.35, 0.4, 0.1], chest: [0.1, 0.2, 0], head: [-0.2, -0.3, 0], $hips: [-0.1, 0.06], $fL: [0, 0, 0.12], $fR: [0, 0, -0.07], $root: [0, 0, 0.14, 0.04, 0.2, 0], $aim: [1] })],
    [0.7, dual([-2.0, 1.4, -0.9, -3.6], [-0.9, -0.85, -0.2, -1.0], { spine: [0.3, 0.6, 0.12], chest: [0.08, 0.3, 0], head: [-0.15, -0.5, 0], $hips: [-0.1, 0.06], $fL: [0, 0.03, 0.12], $root: [0, 0.02, 0.15, 0.03, 0.4, 0], $aim: [0.3] }), 'h'],
    [0.84, dual([-1.9, 0.6, -0.3, -2.6], [-1.0, -0.4, -0.6, -1.6], { spine: [0.3, 0.2, 0], head: [-0.2, -0.1, 0], $hips: [-0.11, 0.07], $fR: [0, 0.04, 0.06], $root: [0, 0.03, 0.18, 0.03, 0.15, 0], $aim: [0.7] })],
    [0.92, dual([-1.45, -0.45, -0.15, -1.7], [-1.2, 0.2, -0.9, -2.0], { spine: [0.4, -0.35, -0.1], chest: [0.12, -0.2, 0], head: [-0.25, 0.25, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.1], $fR: [0, 0, 0.0], $root: [0, 0, 0.2, 0.05, -0.2, 0], $aim: [1] })],
    [1.04, dual([-0.8, -0.8, -0.2, -0.9], [-1.1, 0.4, -1.0, -2.1], { spine: [0.5, -0.55, -0.12], chest: [0.15, -0.25, 0], head: [-0.35, 0.4, 0], $hips: [-0.12, 0.08], $root: [0, 0, 0.2, 0.06, -0.35, 0], $aim: [0.5] })],
    [1.26, recover(dual([-0.8, -0.8, -0.2, -0.9], [-1.1, 0.4, -1.0, -2.1], { spine: [0.5, -0.55, -0.12], $root: [0, 0, 0.14, 0.03, -0.25, 0] }))],
    [1.5, guard],
  ] };
  // a whirl: arms out, blades level, spun right round on the pedestal
  {
    const out = (ry, x = {}) => ({ ...dual([-1.5, 1.2, -0.1, -1.6], [-1.5, 1.2, -0.1, -1.6], { spine: [0.15, 0, 0], head: [-0.1, 0, 0], $hips: [-0.08, 0.03], ...x }), $root: [0, 0.05, 0.12, 0, ry, 0] });
    M.whirl = { line: 'mid', hits: [0.86], keys: [
      [0, guard],
      [0.22, { ...dual([-0.8, 0.2, -1.6, -2.4], [-0.8, 0.2, -1.6, -2.4], { spine: [0.35, 0.3, 0], $hips: [-0.13, 0], $fL: [0, 0, 0.05], $fR: [0, 0, -0.06] }), $root: [0, 0, -0.03, 0, 0.45, 0] }, 'h'],
      [0.42, out(-0.6, { $fL: [0, 0.05, 0.05] })],
      [0.6, out(-PI * 0.8)],
      [0.76, out(-PI * 1.45, { $fR: [0, 0.05, 0] })],
      [0.86, { ...dual([-1.5, 0.2, -0.1, -1.6], [-1.5, 1.4, -0.1, -1.6], { spine: [0.3, 0, 0], head: [-0.2, 0, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.12], $fR: [0, 0, -0.07], $aim: [1] }), $root: [0, 0, 0.2, 0.04, -PI * 2 + 0.1, 0] }],
      [0.98, { ...dual([-1.45, -0.6, -0.1, -1.6], [-1.45, 1.4, -0.1, -1.6], { spine: [0.3, -0.3, 0], head: [-0.2, 0.2, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.12], $fR: [0, 0, -0.07], $aim: [0.5] }), $root: [0, 0, 0.2, 0.04, -PI * 2 - 0.25, 0] }],
      [1.2, { ...recover(dual([-1.45, -0.6, -0.1, -1.6], [-1.45, 1.4, -0.1, -1.6], { spine: [0.3, -0.3, 0] })), $root: [0, 0, 0.1, 0, -PI * 2, 0] }],
      [1.42, { ...guard, $root: [0, 0, 0, 0, -PI * 2, 0] }],
    ] };
  }
  // both blades driven straight in, a long low lunge
  M.lunge = { line: 'mid', hits: [0.58], keys: [
    [0, guard],
    [0.36, dual([0.3, 0.25, -1.8, -1.6], [0.3, 0.25, -1.8, -1.6], { spine: [0.1, 0, 0], head: [-0.1, 0, 0], $hips: [-0.15, -0.04], $fL: [0, 0.03, 0.04], $fR: [0, 0, -0.07], $root: [0, 0, -0.08, -0.04, 0, 0] }), 'h'],
    [0.5, dual([-0.9, 0.1, -0.9, -1.6], [-0.9, 0.1, -0.9, -1.6], { spine: [0.3, 0, 0], $hips: [-0.1, 0.04], $fL: [0, 0.05, 0.12], $fR: [0, 0, -0.08], $root: [0, 0.04, 0.12, 0.02, 0, 0], $aim: [0.8] })],
    [0.58, dual([-1.55, -0.12, -0.05, -1.6], [-1.55, -0.12, -0.05, -1.6], { spine: [0.42, 0, 0], chest: [0.12, 0, 0], head: [-0.3, 0, 0], $hips: [-0.15, 0.1], $fL: [0, 0, 0.17], $fR: [0, 0, -0.1], $root: [0, 0, 0.27, 0.07, 0, 0], $aim: [1] })],
    [0.7, dual([-1.5, -0.12, -0.05, -1.55], [-1.5, -0.12, -0.05, -1.55], { spine: [0.45, 0, 0], chest: [0.12, 0, 0], head: [-0.3, 0, 0], $hips: [-0.15, 0.1], $fL: [0, 0, 0.17], $fR: [0, 0, -0.1], $root: [0, 0, 0.28, 0.07, 0, 0], $aim: [0.8] })],
    [0.88, recover(dual([-1.2, 0.2, -0.6, -1.9], [-1.2, 0.2, -0.6, -1.9], { spine: [0.35, 0, 0], $hips: [-0.12, 0.06], $root: [0, 0, 0.14, 0.03, 0, 0] }))],
    [1.1, guard],
  ] };
  // the finisher: a leap, both blades high, brought down together as he lands
  M.leap = { line: 'high', heavy: true, hits: [0.78], keys: [
    [0, guard],
    [0.26, dual([-0.4, 0.3, -1.8, -2.3], [-0.4, 0.3, -1.8, -2.3], { spine: [0.5, 0, 0], chest: [0.12, 0, 0], head: [-0.4, 0, 0], $hips: [-0.17, 0], $fL: [0, 0, 0.05], $fR: [0, 0, -0.05] }), 'h'],
    [0.5, dual([-2.9, 0.35, -0.7, -4.4], [-2.9, 0.35, -0.7, -4.4], { spine: [-0.3, 0, 0], chest: [-0.12, 0, 0], head: [-0.25, 0, 0], $hips: [0.0, -0.02], $fL: [0, 0.08, 0.05], $fR: [0, 0.06, -0.04], $root: [0, 0.32, 0.12, -0.08, 0, 0] })],
    [0.66, dual([-2.95, 0.2, -0.3, -3.6], [-2.95, 0.2, -0.3, -3.6], { spine: [-0.15, 0, 0], head: [-0.2, 0, 0], $hips: [-0.02, 0.0], $fL: [0, 0.06, 0.1], $fR: [0, 0.05, -0.02], $root: [0, 0.26, 0.24, -0.02, 0, 0], $aim: [0.6] })],
    [0.78, dual([-1.45, 0.05, -0.1, -1.75], [-1.45, 0.05, -0.1, -1.75], { spine: [0.5, 0, 0], chest: [0.16, 0, 0], head: [-0.35, 0, 0], $hips: [-0.15, 0.09], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $root: [0, 0, 0.3, 0.08, 0, 0], $aim: [1] })],
    [0.92, dual([-0.8, -0.1, -0.15, -0.85], [-0.8, -0.1, -0.15, -0.85], { spine: [0.65, 0, 0], chest: [0.2, 0, 0], head: [-0.5, 0, 0], $hips: [-0.17, 0.1], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $root: [0, 0, 0.3, 0.1, 0, 0], $aim: [0.5] })],
    [1.2, recover(dual([-0.8, -0.1, -0.15, -0.85], [-0.8, -0.1, -0.15, -0.85], { spine: [0.65, 0, 0], $hips: [-0.15, 0.09], $root: [0, 0, 0.25, 0.05, 0, 0] }))],
    [1.45, { ...guard, $root: [0, 0, 0.1, 0, 0, 0] }],
  ] };
  P.blockMid = dual([-1.5, -0.2, -1.4, -3.05], [-1.5, -0.25, -1.4, -3.05], { spine: [0.1, 0.1, 0], head: [-0.1, -0.1, 0], $hips: [-0.09, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockMid.wrL = [P.blockMid.wrL[0], 0, -0.6];
  P.blockMid.wrR = [P.blockMid.wrR[0], 0, 0.6];
  P.blockHigh = { ...P.blockMid, shL: [-2.3, 0, -0.1], shR: [-2.3, 0, 0.1], elL: [-0.9, 0, 0], elR: [-0.9, 0, 0], wrL: [-4.0 + 3.2, 0, -1.0], wrR: [-4.0 + 3.2, 0, 1.0], spine: [-0.1, 0, 0], head: [-0.2, 0, 0] };
  P.fling = dual([-2.0, 1.1, -0.3, -2.6], [-2.2, 1.0, -0.3, -2.8], { spine: [-0.4, 0.3, 0.15], chest: [-0.2, 0.1, 0], head: [-0.5, 0.3, 0.3] });
  P.cheer = { $hips: [0, 0], spine: [-0.15, 0, 0], head: [-0.3, 0, 0], shL: [-2.9, 0, 0.3], elL: [-0.2, 0, 0], shR: [-2.9, 0, -0.3], elR: [-0.2, 0, 0] };
  return { P, M };
}

// mirror a pose left for right (the bishop fights left-handed)
const SWAP = (n) => (/^(sh|el|wr|\$f|fl|fk|hh|hk)[LR]$/.test(n) ? n.slice(0, -1) + (n.endsWith('L') ? 'R' : 'L') : n);
function mirror(p) {
  const out = {};
  for (const [n, v] of Object.entries(p)) {
    if (n === '$root') out[n] = [-v[0], v[1], v[2], v[3], -(v[4] || 0), -(v[5] || 0)];
    else if (n === '$fL' || n === '$fR') out[SWAP(n)] = [-v[0], v[1], v[2]];
    else if (n[0] === '$') out[n] = v;
    else out[SWAP(n)] = [v[0], -v[1], -v[2]];
  }
  return out;
}

// the horse under the knight: rears on the wind-up, stamps down on the blow
const HORSE = {
  rest: {},
  rear: { horse: [-0.4, 0, 0], flL: [-1.0, 0, 0], fkL: [0.5, 0, 0], flR: [-0.7, 0, 0], fkR: [0.9, 0, 0], hneck: [-0.35, 0, 0], hhead: [0.25, 0, 0], tail: [0.55, 0, 0], hhL: [-0.25, 0, 0], hhR: [-0.25, 0, 0], hkL: [0.3, 0, 0], hkR: [0.3, 0, 0] },
  high: { horse: [-0.55, 0, 0], flL: [-1.3, 0, 0], fkL: [1.2, 0, 0], flR: [-0.9, 0, 0], fkR: [1.5, 0, 0], hneck: [-0.45, 0, 0], hhead: [0.35, 0, 0], tail: [0.7, 0, 0], hhL: [-0.35, 0, 0], hhR: [-0.35, 0, 0], hkL: [0.4, 0, 0], hkR: [0.4, 0, 0] },
  stamp: { horse: [0.4, 0, 0], flL: [0.9, 0, 0], fkL: [-1.2, 0, 0], flR: [1.0, 0, 0], fkR: [-1.2, 0, 0], hneck: [0.3, 0, 0], hhead: [-0.25, 0, 0], tail: [-0.4, 0, 0], hhL: [0.2, 0, 0], hhR: [0.2, 0, 0], hkL: [-0.2, 0, 0], hkR: [-0.2, 0, 0] },
  pivotR: { horse: [-0.15, -0.45, 0.1], flL: [-0.5, 0, 0], flR: [-0.3, 0, 0], hneck: [-0.2, -0.4, 0], tail: [0.3, 0, 0.5] },
  pivotL: { horse: [0.1, 0.4, -0.08], flL: [0.3, 0, 0], flR: [0.4, 0, 0], hneck: [0.15, 0.4, 0], tail: [-0.2, 0, -0.5] },
  hit: { horse: [-0.4, 0, 0.15], flL: [-0.6, 0, 0], flR: [-0.3, 0, 0], hneck: [-0.5, 0.3, 0], hhead: [0.4, 0, 0] },
  shy: { horse: [-0.2, 0, 0.1], flL: [-0.5, 0, 0], fkL: [0.6, 0, 0], hneck: [-0.3, 0.4, 0], hhead: [0.2, 0, 0], tail: [0.3, 0, 0.4] },
};

// the reactions every fighter has: parries (high and level), being knocked back off a heavy
// blow, a sidestep out of the way, and reeling from the blow that kills
function reactions(P) {
  const g = P.guard;
  const R = (dz, rx, ry = 0, rz = 0, dx = 0, dy = 0) => [dx, dy, dz, rx, ry, rz];
  const M = {};
  for (const [name, blk] of [['parry', P.blockMid], ['parryHigh', P.blockHigh]]) {
    const hit = add(blk, { spine: [-0.14, 0.05, 0], chest: [-0.06, 0, 0], head: [-0.12, 0, 0] });
    M[name] = { react: true, hits: [0.42], keys: [
      [0, g],
      [0.27, { ...blk, $aim: [1] }, 'h'],
      [0.42, { ...blk, $aim: [1] }],
      [0.5, { ...hit, $aim: [1], $root: R(-0.07, -0.07) }],
      [0.68, { ...blk, $aim: [0.6], $root: R(-0.03, -0.02) }],
      [0.98, g],
    ] };
    // a heavy blow: the guard holds, but it drives the defender back a step, reeling
    M[name === 'parry' ? 'stagger' : 'staggerHigh'] = { react: true, hits: [0.42], keys: [
      [0, g],
      [0.27, { ...blk, $aim: [1] }, 'h'],
      [0.42, { ...blk, $aim: [1] }],
      [0.56, { ...add(lerpPose(blk, P.fling, 0.45), { spine: [-0.2, 0.15, 0.08], head: [-0.25, 0.2, 0.1] }), $aim: [0.5], $root: R(-0.22, -0.2, 0.15, 0.06, 0, 0.04), $fR: [0, 0.08, -0.08], $fL: [0, 0, 0.04], $hips: [-0.03, -0.04] }],
      [0.8, { ...lerpPose(blk, g, 0.5), $root: R(-0.26, -0.05, 0.06), $fR: [0, 0, -0.12], $fL: [0, 0, 0.05], $hips: [-0.13, -0.03] }, 'h'],
      [1.08, { ...g, $root: R(-0.1, 0, 0, 0, 0, 0.03), $fL: [0, 0.05, 0.08] }],
      [1.4, g],
    ] };
  }
  // a sidestep (to the figure's left, +x, or right)
  for (const [name, s] of [['dodgeL', 1], ['dodgeR', -1]]) {
    M[name] = { react: true, hits: [0.45], keys: [
      [0, g],
      [0.18, { ...g, $hips: [-0.13, 0], spine: [0.25, 0, 0], $root: R(0, 0, 0, 0, 0, 0) }],
      [0.36, { ...add(g, { spine: [0.1, -s * 0.3, s * 0.25], head: [0, s * 0.3, 0] }), $hips: [-0.04, 0], $fL: [0, 0.06, 0], $fR: [0, 0.06, 0], $root: R(-0.06, 0, -s * 0.3, -s * 0.12, s * 0.3, 0.08) }],
      [0.45, { ...add(g, { spine: [0.25, -s * 0.35, s * 0.15], head: [-0.1, s * 0.35, 0] }), $hips: [-0.14, 0], $root: R(-0.08, 0, -s * 0.35, -s * 0.06, s * 0.38, 0) }, 'h'],
      [0.66, { ...add(g, { spine: [0.2, -s * 0.3, s * 0.1] }), $hips: [-0.12, 0], $root: R(-0.08, 0, -s * 0.3, -s * 0.04, s * 0.37, 0) }],
      [1.0, g],
    ] };
  }
  // the death blow lands: the body jolts back, arms flung, head snapped round
  M.reel = { react: true, hits: [0], keys: [
    [0, g],
    [0.06, { ...lerpPose(g, P.fling, 0.7), $root: R(-0.06, -0.16, 0.12, 0.06, 0, 0.02), $hips: [-0.04, -0.03] }],
    [0.18, { ...P.fling, $root: R(-0.11, -0.27, 0.2, 0.1, 0, 0.03), $hips: [-0.02, -0.05], $fL: [0, 0.05, 0.03] }],
    [0.7, { ...P.fling, $root: R(-0.12, -0.3, 0.22, 0.11, 0, 0.03), $hips: [-0.02, -0.05] }],
  ] };
  return M;
}

// the horse's part in each of the knight's moves
const HORSE_TRACK = {
  cleave: [[0, HORSE.rest], [0.2, HORSE.rest], [0.44, HORSE.rear, 'h'], [0.64, HORSE.stamp], [0.8, HORSE.stamp], [1.25, HORSE.rest]],
  slash: [[0, HORSE.rest], [0.42, HORSE.pivotR, 'h'], [0.62, HORSE.stamp], [0.8, HORSE.stamp], [1.22, HORSE.rest]],
  sweep: [[0, HORSE.rest], [0.44, HORSE.pivotR, 'h'], [0.64, HORSE.pivotL], [0.8, HORSE.pivotL], [1.28, HORSE.rest]],
  thrust: [[0, HORSE.rest], [0.38, HORSE.rear, 'h'], [0.6, HORSE.stamp], [0.75, HORSE.stamp], [1.12, HORSE.rest]],
  bash: [[0, HORSE.rest], [0.16, HORSE.rear], [0.32, HORSE.stamp], [0.42 + 0.2 * 1.1, HORSE.rest], [0.42 + 0.44 * 1.1, HORSE.high, 'h'], [0.42 + 0.64 * 1.1, HORSE.stamp], [0.42 + 0.8 * 1.1, HORSE.stamp], [0.42 + 1.25 * 1.1, HORSE.rest]],
  parry: [[0, HORSE.rest], [0.27, HORSE.shy], [0.42, HORSE.shy], [0.5, HORSE.hit], [0.98, HORSE.rest]],
  stagger: [[0, HORSE.rest], [0.42, HORSE.shy], [0.56, HORSE.hit], [0.8, HORSE.rear], [1.4, HORSE.rest]],
  dodgeL: [[0, HORSE.rest], [0.36, HORSE.pivotL], [0.66, HORSE.pivotL], [1.0, HORSE.rest]],
  dodgeR: [[0, HORSE.rest], [0.36, HORSE.pivotR], [0.66, HORSE.pivotR], [1.0, HORSE.rest]],
  reel: [[0, HORSE.rest], [0.06, HORSE.hit], [0.18, HORSE.rear], [0.7, HORSE.rear]],
  leap: [[0, HORSE.rest], [0.25, HORSE.rear], [0.75, HORSE.rear], [1, HORSE.stamp]],
  cheer: [[0, HORSE.rest], [0.45, HORSE.high, 'h'], [0.95, HORSE.high], [1.3, HORSE.rest]],
};
HORSE_TRACK.parryHigh = HORSE_TRACK.parry;
HORSE_TRACK.staggerHigh = HORSE_TRACK.stagger;
HORSE_TRACK.hit = HORSE_TRACK.parry;

// what each kind of fighter does: the blows of an exchange and the finishing moves
const ARSENAL = {
  two: { blows: ['cleave', 'slash', 'sweep', 'thrust'], finishers: ['cleave', 'spin', 'thrust', 'spin'] },
  oneR: { blows: ['cleave', 'slash', 'sweep', 'thrust'], finishers: ['bash', 'cleave', 'slash'] },
  oneL: { blows: ['cleave', 'slash', 'sweep', 'thrust'], finishers: ['bash', 'cleave', 'thrust'] },
  mounted: { blows: ['cleave', 'slash', 'sweep', 'thrust'], finishers: ['bash', 'cleave', 'bash'] },
  dual: { blows: ['cross', 'whirl', 'lunge'], finishers: ['leap', 'double', 'cross'] },
};

function lib(kind) {
  if (kind === 'two') return twoHanded();
  if (kind === 'dual') return dualBlades();
  const L = oneHanded();
  if (kind !== 'oneL') return L;
  const P = {}, M = {};
  for (const [k, v] of Object.entries(L.P)) P[k] = mirror(v);
  for (const [k, v] of Object.entries(L.M)) M[k] = { ...v, keys: v.keys.map(([t, p, h]) => [t, mirror(p), h]) };
  return { P, M };
}

function clips(kind) {
  const { P, M } = lib(kind);
  const g = P.guard;
  const C = {
    idle: { keys: [[0, P.rest], [3.2, P.rest]], loop: true },
    guard: { keys: [[0, g], [1.6, g]], loop: true },
    walk: { keys: [[0, g], [1, g]], loop: true },
    run: { keys: [[0, g], [1, g]], loop: true },
    leap: { keys: [[0, g], [0.2, lerpPose(g, P.cheer, 0.6)], [0.8, lerpPose(g, P.cheer, 0.6)], [1, g]] },
    cheer: { keys: [[0, g], [0.4, P.cheer, 'h'], [0.95, P.cheer], [1.3, P.rest]] },
    fidget: { keys: [[0, P.rest], [0.6, g], [1.4, g], [2, P.rest]] },
    death: { keys: [[0, P.blockMid], [1.2, P.blockMid]] },
    hit: { keys: [[0, g], [0.1, lerpPose(g, P.fling, 0.4)], [0.6, g]] },
    ...reactions(P),
    ...M,
  };
  C.hit2 = C.hit;
  C.block = C.parry;
  // the old names
  C.attack = C.attack2 = C[ARSENAL[kind].blows[0]];
  C.finish = C[ARSENAL[kind].finishers[0]];
  for (const [name, c] of Object.entries(C)) {
    c.name = name;
    c.d = c.keys[c.keys.length - 1][0];
    c.hits = c.hits || [];
    c.at = c.hits.length ? c.hits[c.hits.length - 1] / c.d : 0.5;
    c.track = compile(c.keys);
    if (kind === 'mounted' && HORSE_TRACK[name]) c.horse = compile(HORSE_TRACK[name]);
  }
  return C;
}

// ------------------------------------------------------------------ sampling
// Each channel is a spline through its keys: Catmull-Rom tangents, flattened where the motion
// turns back (so a wind-up eases into its top and nothing overshoots) and at held keys.
const WIDTH = (n) => (n === '$root' ? 6 : n === '$hips' ? 2 : n === '$aim' ? 1 : 3);
function compile(keys) {
  const names = new Set();
  for (const [, p] of keys) for (const n of Object.keys(p)) names.add(n);
  const ts = keys.map((k) => k[0]);
  const ch = [];
  for (const n of names) {
    const w = WIDTH(n);
    const vals = keys.map(([, p]) => {
      const v = p[n] || [];
      const o = new Array(w);
      for (let i = 0; i < w; i++) o[i] = v[i] || 0;
      return o;
    });
    const tan = vals.map((v, i) => v.map((x, c) => {
      if (i === 0 || i === vals.length - 1 || keys[i][2] === 'h') return 0;
      const a = vals[i - 1][c], b = vals[i + 1][c];
      if ((x - a) * (b - x) <= 0) return 0;
      return (b - a) / (ts[i + 1] - ts[i - 1]);
    }));
    ch.push({ n, w, vals, tan, lag: LAG[n] || 0 });
  }
  return { ts, ch };
}
function sampleTrack(tr, t, lagged) {
  const out = {};
  const { ts } = tr;
  const last = ts.length - 1;
  for (const c of tr.ch) {
    const tt = lagged ? t - c.lag : t;
    let i = 0;
    while (i < last - 1 && tt > ts[i + 1]) i++;
    let v;
    if (tt <= ts[0]) v = c.vals[0];
    else if (tt >= ts[last]) v = c.vals[last];
    else {
      const h = ts[i + 1] - ts[i], u = (tt - ts[i]) / h;
      const u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const a = c.vals[i], b = c.vals[i + 1], ma = c.tan[i], mb = c.tan[i + 1];
      v = new Array(c.w);
      for (let k = 0; k < c.w; k++) v[k] = h00 * a[k] + h10 * h * ma[k] + h01 * b[k] + h11 * h * mb[k];
    }
    out[c.n] = v;
  }
  return out;
}
const scaleP = (p, s) => {
  const o = {};
  for (const [n, v] of Object.entries(p)) o[n] = v.map((x) => x * s);
  return o;
};

const CLIP_CACHE = {};
function clipSet(kind) {
  return CLIP_CACHE[kind] || (CLIP_CACHE[kind] = clips(kind));
}
const smooth = (x) => x * x * (3 - 2 * x);

function blend(a, b, u) {
  const out = {};
  for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[n], y = b[n];
    const len = Math.max(x ? x.length : 0, y ? y.length : 0);
    out[n] = [];
    for (let i = 0; i < len; i++) out[n].push((x && x[i] !== undefined ? x[i] : 0) * (1 - u) + (y && y[i] !== undefined ? y[i] : 0) * u);
  }
  return out;
}
function add(a, b) {
  const out = { ...a };
  for (const [n, v] of Object.entries(b)) {
    const x = out[n];
    if (!x) out[n] = v;
    else {
      const len = Math.max(x.length, v.length);
      out[n] = [];
      for (let i = 0; i < len; i++) out[n].push((x[i] || 0) + (v[i] || 0));
    }
  }
  return out;
}

// ------------------------------------------------------------------ the statue
// the striking end of a weapon (its long end) and its other end, in the weapon's own frame
function weaponEnds(w) {
  const box = new THREE.Box3();
  w.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(w.matrixWorld).invert();
  w.traverse((o) => {
    if (o.isMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
    }
  });
  if (box.isEmpty()) return { tip: V(...(w.userData.tip || [0, -0.3, 0])), butt: V(0, 0.05, 0) };
  const down = -box.min.y >= box.max.y;
  const t = w.userData.tip;
  const tip = t && t[1] < 0 === down ? V(...t) : V(0, down ? box.min.y * 0.95 : box.max.y * 0.95, 0);
  return { tip, butt: V(0, down ? box.max.y : box.min.y, 0) };
}

export function buildStatue(code) {
  const type = code & 7, isWhite = (code & 8) === 0;
  const mat = granite(isWhite ? 'white' : 'black');
  const t = template(type);
  const group = new THREE.Group();
  const inner = new THREE.Group(); // effects move this
  group.add(inner);
  const model = t.model.clone(true); // the statue: glides and tilts on its pedestal
  model.rotation.order = 'YXZ';
  inner.add(model);
  const J = {};
  model.traverse((o) => {
    if (o.isMesh) o.material = mat;
    else if (o.userData.rest || ['weapon', 'weapon2', 'shield'].includes(o.name)) J[o.name] = o;
  });
  const body = model.getObjectByName('body');
  const info = {
    ...t.info,
    legs: t.info.legs.map((l) => ({ hip: J[l.hip], knee: J[l.knee], ankle: J[l.ankle], thigh: l.thigh, shin: l.shin, foot: V(...l.foot), side: l.hip.endsWith('L') ? 'L' : 'R' })),
  };
  // the weapon's striking end (sparks fly from it; it is what lands the blow) and its far end
  const hand = new THREE.Object3D();
  hand.name = 'handslotr';
  const butt = new THREE.Object3D();
  if (J.weapon) {
    const ends = weaponEnds(J.weapon);
    hand.position.copy(ends.tip);
    butt.position.copy(ends.butt);
    J.weapon.add(hand, butt);
  }
  // the shield's face
  let shieldAt = null;
  if (J.shield) {
    shieldAt = new THREE.Object3D();
    const box = new THREE.Box3();
    J.shield.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(J.shield.matrixWorld).invert();
    J.shield.traverse((o) => {
      if (o.isMesh) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
      }
    });
    if (!box.isEmpty()) box.getCenter(shieldAt.position);
    J.shield.add(shieldAt);
  }
  const kind = type === KNIGHT ? 'mounted' : info.style === 'one' ? (info.hand === 'L' ? 'oneL' : 'oneR') : info.style;
  const box3 = new THREE.Box3().setFromObject(model);
  const fig = {
    group, type, isWhite, code, spec: {}, model, materials: [mat], stone: false, statue: true,
    parts: { inner }, current: null, J, info, kind, body, hand, butt, shieldAt,
    height: box3.max.y - box3.min.y, radius: 0.26,
    move: { name: 'idle', t: 0, d: 3.2, loop: true }, from: null, blendT: 1, fade: 0.18, aim: null, seed: Math.random() * 10,
  };
  fig.mixer = { update: (dt) => animate(fig, dt) };
  animate(fig, 0);
  return fig;
}

const ALIAS = { Blocking: 'guard', '2H_Melee_Idle': 'guard', Idle: 'idle' };
export const MOVES = clipSet('two');
const key = (fig, name) => {
  const k = name.startsWith('S_') ? name.slice(2) : ALIAS[name] || name;
  return clipSet(fig.kind)[k] ? k : 'idle';
};

/** Starts a move; returns its duration. */
export function playMove(fig, name, { loop, speed = 1, duration = 0, fade = 0.18 } = {}) {
  const k = key(fig, name);
  const c = clipSet(fig.kind)[k];
  const d = duration > 0 ? duration : c.d / (speed || 1);
  if (fig.move.name === 'death') return d; // the fallen stay down
  if (fig.move.name === k && c.loop) return d;
  // cross-fade from wherever the body is now (a spin ends a full turn round: that's no turn)
  fig.from = fig.pose ? { ...fig.pose } : null;
  if (fig.from?.$root) {
    const r = fig.from.$root.slice();
    r[4] = Math.atan2(Math.sin(r[4] || 0), Math.cos(r[4] || 0));
    fig.from.$root = r;
  }
  fig.blendT = 0;
  fig.fade = Math.max(0.04, fade);
  fig.aim = null;
  fig.move = { name: k, t: 0, d, loop: loop || !!c.loop, at: c.at };
  return d;
}
export const strikeAt = (name) => clipSet('two')[name.replace(/^S_/, '')]?.at;

/** A move's timing for this figure: duration (s), when its blows land (0..1), and its nature. */
export function moveInfo(fig, name) {
  const c = clipSet(fig.kind)[key(fig, name)];
  return { d: c.d, at: c.at, hits: c.hits.map((h) => h / c.d), line: c.line || 'mid', heavy: !!c.heavy, cast: !!c.cast };
}

/** The blows this figure throws in an exchange, and its finishing moves. */
export function arsenal(fig) {
  const A = ARSENAL[fig.kind];
  const blows = [...A.blows], finishers = [...A.finishers];
  if (fig.type === QUEEN) {
    blows.push('cast');
    finishers.push('cast');
  }
  return { blows, finishers };
}

/** An aiming correction, layered over the move wherever its keys ask for one ($aim). */
export function setAim(fig, aim) {
  fig.aim = aim;
}

// the pose of a move at time t (seconds of the clip), the horse's part and the aim included
function movePose(fig, c, t, lagged) {
  let pose = sampleTrack(c.track, t, lagged);
  if (c.horse) pose = add(pose, sampleTrack(c.horse, t, lagged));
  return pose;
}

function animate(fig, dt) {
  const m = fig.move;
  m.t += dt;
  if (!m.loop && m.t >= m.d && m.name !== 'death' && m.name !== 'reel') playMove(fig, 'idle', { fade: 0.35 });
  const C = clipSet(fig.kind);
  const c = C[fig.move.name];
  const ct = (m.loop ? m.t % m.d : Math.min(m.t, m.d)) * (c.d / m.d);
  let pose = movePose(fig, c, ct, !m.loop);
  // life: breathing, glancing round; the march sways. Quieter in the heat of a fight.
  const T = fig.move.t + fig.seed;
  const calm = m.loop ? 1 : 0.25;
  const live = { spine: [Math.sin(T * 1.7) * 0.02 * calm, Math.sin(T * 0.4) * 0.05 * calm, 0], head: [Math.sin(T * 0.6) * 0.04 * calm, Math.sin(T * 0.45) * 0.3 * calm, 0] };
  if (m.name === 'walk' || m.name === 'run') {
    live.spine = [0.06, Math.sin(T * 6) * 0.08, Math.sin(T * 6) * 0.04];
    live.head = [0, -Math.sin(T * 6) * 0.06, 0];
  } else if (m.name === 'guard') {
    // on guard: light on the feet, weight shifting, the weapon never still
    live.spine = [Math.sin(T * 2.1) * 0.03, Math.sin(T * 1.3) * 0.08, 0];
    live.$hips = [Math.sin(T * 4.2) * 0.008, 0];
    live.$root = [0, 0, 0, 0, Math.sin(T * 0.9) * 0.05, 0];
  }
  pose = add(pose, live);
  if (fig.type === KNIGHT && !c.horse) {
    let hp = {};
    if (m.name === 'walk' || m.name === 'run' || m.name === 'guard') {
      const g = T * (m.name === 'guard' ? 4 : 9), a = m.name === 'guard' ? 0.5 : 1;
      hp = { horse: [-0.12 * a * Math.sin(g), 0, 0], flL: [0.5 * a * Math.sin(g), 0, 0], flR: [0.5 * a * Math.sin(g + 1.3), 0, 0], fkL: [-0.6 * a * Math.max(0, Math.sin(g + 0.8)), 0, 0], fkR: [-0.6 * a * Math.max(0, Math.sin(g + 2.1)), 0, 0], hneck: [0.15 * Math.sin(g + 0.5), 0, 0], tail: [0.2 * Math.sin(g), 0, 0.3 * Math.sin(g * 0.5)] };
    } else if (m.name === 'idle') {
      hp = { hneck: [0.08 * Math.sin(T * 1.1), 0.12 * Math.sin(T * 0.4), 0], fkL: [0.25 * Math.max(0, Math.sin(T * 1.7)), 0, 0], tail: [0, 0, 0.3 * Math.sin(T * 2.3)] };
    }
    pose = add(pose, hp);
  }
  if (fig.aim && pose.$aim) pose = add(pose, scaleP(fig.aim, pose.$aim[0]));
  // cross-fade from the previous move's pose
  fig.blendT = Math.min(1, fig.blendT + dt / (fig.fade || 0.18));
  if (fig.from && fig.blendT < 1) pose = blend(fig.from, pose, smooth(fig.blendT));
  fig.pose = pose;
  applyPose(fig, pose);
  if (m.name === 'death') fall(fig, m.t, m.d);
  else fig.body.rotation.set(0, 0, 0);
  return fig.mixer;
}

function applyPose(fig, pose) {
  const J = fig.J;
  for (const [n, j] of Object.entries(J)) {
    if (!j.userData.rest) continue;
    const r = j.userData.rest, p = pose[n];
    j.rotation.set(r[0] + (p ? p[0] : 0), r[1] + (p ? p[1] : 0), r[2] + (p ? p[2] : 0));
  }
  const H = fig.info.H;
  // the statue itself slides, hops, tilts and turns on the board
  const rp = pose.$root || [0, 0, 0, 0, 0, 0];
  fig.model.position.set(rp[0] || 0, rp[1] || 0, rp[2] || 0);
  fig.model.rotation.set(rp[3] || 0, rp[4] || 0, rp[5] || 0);
  // the pelvis moves; legs follow by IK, feet stay on the pedestal (or step about on it)
  if (J.hips && fig.info.legs.length) {
    const hp = pose.$hips || [0, 0];
    J.hips.position.set(0, 0.5 * H + hp[0] * H, hp[1] * H);
    solveLegs(fig, pose);
  }
}

// two-bone IK in the leg's sagittal plane: knee bends forward, foot stays flat
function solveLegs(fig, pose) {
  const { info } = fig;
  const H = info.H;
  fig.body.updateMatrixWorld(true);
  for (const L of info.legs) {
    const off = pose['$f' + L.side];
    const target = L.foot.clone();
    if (off) target.add(_a.set(off[0] * H, Math.max(0, off[1]) * H, off[2] * H));
    fig.body.localToWorld(target);
    const hipW = L.hip.getWorldPosition(_q);
    L.hip.parent.worldToLocal(target);
    L.hip.parent.worldToLocal(hipW);
    const dy = target.y - hipW.y, dz = target.z - hipW.z;
    const a = L.thigh, b = L.shin;
    const len = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, Math.hypot(dy, dz)));
    const phi = Math.atan2(dz, -dy);
    const alpha = Math.acos(Math.min(1, Math.max(-1, (a * a + len * len - b * b) / (2 * a * len))));
    const beta = Math.PI - Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - len * len) / (2 * a * b))));
    L.hip.rotation.set(-(phi + alpha), 0, 0);
    L.knee.rotation.set(beta, 0, 0);
    // keep the foot flat on the slab
    let tilt = 0;
    for (let o = L.hip.parent; o && o !== fig.body; o = o.parent) tilt += o.rotation.x;
    L.ankle.rotation.set(-(L.hip.rotation.x + beta) - tilt, 0, 0);
  }
}
const _q = new THREE.Vector3(), _a = new THREE.Vector3();

// struck down: the figure topples off its pedestal backwards, stiff as stone
function fall(fig, t, d) {
  const k = Math.min(1, t / d);
  const a = k * k * 1.45;
  fig.body.rotation.set(-a, 0, 0.2 * k);
}

// ------------------------------------------------------------------ aiming
// Where the weapon is (world): its striking end, its far end, the hand, and the shield's face.
function readWeapon(fig) {
  fig.group.updateMatrixWorld(true);
  const w = fig.J.weapon;
  return {
    tip: fig.hand.getWorldPosition(new THREE.Vector3()),
    butt: fig.butt.getWorldPosition(new THREE.Vector3()),
    grip: w ? w.getWorldPosition(new THREE.Vector3()) : fig.hand.getWorldPosition(new THREE.Vector3()),
    shield: fig.shieldAt ? fig.shieldAt.getWorldPosition(new THREE.Vector3()) : null,
    root: fig.model.getWorldPosition(new THREE.Vector3()),
  };
}

/** Where the weapon (and shield) would be at time k (0..1) of a move, with an aim layer. */
export function probeMove(fig, name, k, aim = fig.aim) {
  const c = clipSet(fig.kind)[key(fig, name)];
  let pose = movePose(fig, c, k * c.d, true);
  if (aim && pose.$aim) pose = add(pose, scaleP(aim, pose.$aim[0]));
  applyPose(fig, pose);
  const r = readWeapon(fig);
  if (fig.pose) applyPose(fig, fig.pose);
  fig.group.updateMatrixWorld(true);
  return r;
}
/** Where the weapon is now. */
export function weaponNow(fig) {
  return readWeapon(fig);
}

const _s = new THREE.Vector3(), _t = new THREE.Vector3();
// distance from p to the segment a..b, between fractions f0 and f1 of the way along it
function segDist(p, a, b, f0 = 0, f1 = 1) {
  _s.subVectors(b, a);
  const l2 = _s.lengthSq() || 1e-9;
  const f = Math.min(f1, Math.max(f0, _t.subVectors(p, a).dot(_s) / l2));
  return _t.copy(a).addScaledVector(_s, f).distanceTo(p);
}

/**
 * Bend the figure's move so that, at time k (0..1), its weapon meets `target` (world):
 * mode 'strike' brings the striking end there, 'parry' puts the blade (or the staff, the
 * crossed blades) across it, 'shield' the shield's face. Returns { aim, err }; the aim is a
 * small offset to the shoulders, elbows and chest, applied with setAim.
 */
export function aimAt(fig, name, k, target, mode = 'strike') {
  const W = fig.kind === 'oneL' ? 'L' : 'R', O = W === 'R' ? 'L' : 'R';
  const both = fig.kind === 'two' || fig.kind === 'dual';
  const mirrorZ = fig.kind === 'dual' ? -1 : 1;
  const shield = mode === 'shield' && fig.shieldAt;
  const arm = shield ? O : W;
  const make = (x) => {
    const a = { ['sh' + arm]: [x[0], 0, x[1]], ['el' + arm]: [x[2], 0, 0], chest: [x[4] || 0, x[3], 0] };
    if (both && !shield) {
      a['sh' + O] = [x[0], 0, x[1] * mirrorZ];
      a['el' + O] = [x[2], 0, 0];
    }
    if (mode === 'strike') a.spine = [x[4] || 0, 0, 0];
    return a;
  };
  const cost = (x) => {
    const r = probeMove(fig, name, k, make(x));
    let e;
    if (mode === 'strike') e = r.tip.distanceTo(target);
    else if (shield) e = Math.max(0, r.shield.distanceTo(target) - 0.03);
    else if (fig.butt && fig.kind !== 'dual' && r.butt.distanceTo(r.grip) > 0.15) e = segDist(target, r.butt, r.tip, 0.12, 0.92); // a staff: anywhere along it
    else e = segDist(target, r.grip, r.tip, 0.3, 0.9);
    return e + 0.02 * (Math.abs(x[0]) + Math.abs(x[1]) + Math.abs(x[2]) + Math.abs(x[3]) + Math.abs(x[4] || 0));
  };
  const lim = [1.1, 0.9, 0.9, 0.6, 0.35];
  const x = [0, 0, 0, 0, 0];
  const n = mode === 'strike' ? 5 : 4;
  let best = cost(x), step = 0.3;
  for (let it = 0; it < 40 && step > 0.012; it++) {
    let better = false;
    for (let i = 0; i < n; i++) {
      for (const s of [1, -1]) {
        const y = x.slice();
        y[i] = Math.max(-lim[i], Math.min(lim[i], y[i] + s * step));
        const c = cost(y);
        if (c < best - 1e-5) {
          best = c;
          x[i] = y[i];
          better = true;
        }
      }
    }
    if (!better) step *= 0.5;
  }
  const aim = make(x);
  const r = probeMove(fig, name, k, aim);
  const err = mode === 'strike' ? r.tip.distanceTo(target) : shield ? r.shield.distanceTo(target) : segDist(target, r.grip, r.tip, 0, 1);
  return { aim, err };
}

/** For the rubble: the solid stone parts of a statue, one per joint. */
export function statueParts(fig) {
  const out = [];
  fig.model.traverse((o) => {
    if (o.isMesh) out.push(o);
  });
  return out;
}

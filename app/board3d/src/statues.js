// The Wizard Chess statues, carved in detail (carving.js) on real skeletons.
//
// Every piece stands directly on the board, on its own feet (the horse on its hooves, the keep
// on its own footing, the robes on their hems). The figure is a
// hierarchy of joints (pelvis, spine, chest, neck, head; shoulder, elbow, wrist; hip, knee,
// ankle; the horse's shoulders, knees, neck and tail), and each body part is solid stone hung
// on its joint: nothing bends or stretches, the stone turns at the joint like a jointed
// statue. The legs are solved with two-bone IK so the feet stay planted on the board while
// the body crouches, lunges or rises.
//
// Units are board squares (a square is 1; the real board's squares are 40 mm). Figures face
// +z; their right hand is on -x. Each piece type is carved once; its parts are merged per
// joint (one draw per limb) and shared by every statue of that type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { granite } from './granite.js';
import { kit } from './carving.js';
import { BUILD } from './pieces/index.js';

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const PED = 0; // (the pedestal is gone: the statues stand on the board)
const SCALE = 1.12;

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
  const body = new THREE.Group();
  body.name = 'body';
  body.position.y = PED;
  body.scale.setScalar(SCALE); // (off their pedestals they're carved a little larger)
  model.add(body);
  const J = {};
  const info = BUILD[type](J, body, P);
  consolidate(model);
  return (TEMPLATES[type] = { model, info });
}

// ------------------------------------------------------------------ poses and moves
// A pose is { joint: [rx, ry, rz] } plus
//   '$hips': [dy, dz]      the pelvis (in figure heights); the legs follow by IK
//   '$fL', '$fR': [dx, dy, dz]  a foot lifting and stepping on the board (figure heights)
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
// a blade turned edge-on (rolled about its own length by the wrist): a flat cut leads with its
// edge, not the flat
const EDGE = 1.57;
// the wrist cocked (the blade trailing the hand in a flat swing): + back for either hand
function cock(p, side, a) {
  const w = p['wr' + side];
  if (w) p['wr' + side] = [w[0], w[1] || 0, (side === 'L' ? -1 : 1) * a];
  return p;
}
function edge(p, side, a = EDGE) {
  const w = p['wr' + side];
  if (w) p['wr' + side] = [w[0], (side === 'L' ? -1 : 1) * a, w[2] || 0];
  return p;
}

// how far each joint trails the move (seconds): the legs and hips lead, the hand follows last
const LAG = {
  $fL: -0.07, $fR: -0.07, $root: -0.04, $hips: -0.05, hips: -0.05, tower: -0.04, spine: -0.035, chest: -0.02, neck: -0.03, head: -0.05,
  shL: 0, shR: 0, elL: 0.025, elR: 0.025, wrL: 0.045, wrR: 0.045,
  horse: -0.05, hneck: -0.02, hhead: 0.02, flL: -0.03, flR: -0.01, fkL: 0, fkR: 0.02, tail: 0.08,
};

// the whole statue tipping over on one edge of its footprint (not through the board): rx about
// the edge at z = e (e > 0 the front), rz about the edge at x = e
const tipX = (rx, e, dz = 0, dy = 0) => [0, e * Math.sin(rx) + dy, e * (1 - Math.cos(rx)) + dz, rx, 0, 0];
const tipZ = (rz, e, dx = 0, dy = 0) => [e - e * Math.cos(rz) + dx, -e * Math.sin(rz) + dy, 0, 0, 0, rz];

// ---- what every fighter does, written once through its own arm helper:
// A(sx, out, el, phi, extra, off) is a pose with the weapon arm(s) set (see two/one/dual) and the
// other arm at [off] (shield or off blade; ignored when both hands hold the weapon).
// Coming to life and going still again; the moves of a real fight besides the blows (a feint,
// the blades bound together, a pommel to the face, a shoulder charge, a disarm, knocking the foe
// down and finishing him on the ground); and the casters' spells.
function common(P, A, tag) {
  const g = P.guard, r = P.rest;
  const R = (dx, dy, dz, rx = 0, ry = 0, rz = 0) => [dx, dy, dz, rx, ry, rz];
  const recover = (p) => lerpPose(p, g, 0.6);
  const OFF = tag === 'one' ? { up: [-2.75, 0.3, -0.25], fwd: [-1.55, 0.05, -0.25], tuck: [-1.1, 0.45, -1.45], fling: [-1.6, -0.6, -0.4] }
    : tag === 'dual' ? { up: [-2.75, 0.3, -0.25, -3.0], fwd: [-1.55, 0.05, -0.2, -1.6], tuck: [-0.95, 0.35, -1.15, -2.4], fling: [-2.0, 1.1, -0.3, -2.6] } : {};
  const M = {};
  // ---- coming to life: a crack runs through the stone, the weight shifts onto one foot, the head
  // comes up and round, the weapon rises to the ready
  M.wake = { keys: [
    [0, r],
    [0.07, add(r, { spine: [-0.035, 0, 0.01], head: [-0.04, 0, 0], $root: R(0, 0.005, 0) })],
    [0.2, r],
    [0.5, { ...lerpPose(r, g, 0.3), $root: R(0.014, 0, 0, 0, 0, -0.03), $fR: [0, 0.05, 0.02] }],
    [0.82, { ...lerpPose(r, g, 0.85), $root: R(-0.006, 0, 0.01, 0, 0, 0.012) }],
    [1.08, g],
  ] };
  // ... and settling back into the statue's pose: the weapon grounded, the body squared up
  M.settle = { keys: [[0, g], [0.32, lerpPose(g, r, 0.6)], [0.6, add(r, { $root: R(0, -0.004, 0) })], [0.9, r]] };
  M.ready = { loop: true, keys: [[0, g], [1.6, g]] };
  M.statue = { loop: true, keys: [[0, r], [3.2, r]] };
  // the blade checked against the foe's (a parry, or a blow that bit): it springs back off it
  M.recoil = { keys: [[0, add(g, { spine: [-0.1, 0, 0], head: [-0.08, 0, 0], $root: R(0, 0, -0.06, -0.04) })], [0.22, add(g, { spine: [-0.03, 0, 0], $root: R(0, 0, -0.02) })], [0.5, g]] };
  // ---- a feint: the wind-up of a big cut, checked half-way; then back on guard to strike for real
  M.feint = { hits: [], keys: [
    [0, g],
    [0.22, A(-2.4, 0.8, -1.2, -4.1, { spine: [-0.12, -0.45, 0], chest: [-0.06, -0.2, 0], head: [0, 0.4, 0], $hips: [-0.05, -0.02], $fL: [0, 0.04, 0.03], $fR: [0, 0, -0.06], $root: R(0, 0.01, -0.02, -0.03, -0.22) }, OFF.tuck), 'h'],
    [0.36, A(-1.9, 0.55, -0.7, -3.1, { spine: [0.06, -0.2, 0], $hips: [-0.08, 0.03], $fL: [0, 0, 0.1], $fR: [0, 0, -0.06], $root: R(0, 0, 0.06, 0.01, -0.08) }, OFF.tuck)],
    [0.5, add(g, { $root: R(0, 0, -0.03), $fL: [0, 0.04, 0.02] })],
    [0.66, g],
  ] };
  // ---- the bind: blades crossed and locked between the two, each bearing down on the other
  const bindP = A(-1.45, 0.05, -0.75, -2.75, { spine: [0.2, 0.05, 0], chest: [0.06, 0, 0], head: [-0.1, 0, 0], $hips: [-0.1, 0.04], $fL: [0, 0, 0.13], $fR: [0, 0, -0.1], $root: R(0, 0, 0.07, 0.04) }, OFF.tuck);
  M.bind = { line: 'mid', hits: [0.3], keys: [
    [0, g],
    [0.3, { ...bindP, $aim: [1] }, 'h'],
    [0.62, { ...add(bindP, { spine: [0.05, 0.04, 0], $root: R(0, 0, 0.025, 0.01) }), $aim: [1] }],
    [0.95, { ...add(bindP, { spine: [-0.02, -0.04, 0] }), $aim: [1] }],
    [1.25, { ...add(bindP, { spine: [0.06, 0, 0], $root: R(0, 0, 0.03, 0.015) }), $aim: [1] }],
  ] };
  M.bindHold = { loop: true, keys: [[0, { ...bindP, $aim: [1] }], [0.3, { ...add(bindP, { spine: [0.05, 0.05, 0], $root: R(0, 0, 0.02) }), $aim: [1] }], [0.6, { ...bindP, $aim: [1] }]] };
  // ... and the one who wins it heaves the other off, body behind the blade
  M.shove = { hits: [0.14], keys: [
    [0, { ...bindP, $aim: [1] }],
    [0.14, { ...add(bindP, { spine: [0.15, 0.2, 0], chest: [0.06, 0.1, 0], $hips: [-0.04, 0.06], $fL: [0, 0, 0.2], $root: R(0, 0.01, 0.2, 0.07, 0.15) }), $aim: [0.5] }],
    [0.45, recover(add(bindP, { $root: R(0, 0, 0.12, 0.03) }))],
    [0.75, g],
  ] };
  // ---- the pommel driven into the face, the blade carried back over the shoulder
  M.pommel = { line: 'high', pommel: true, hits: [0.38], keys: [
    [0, g],
    [0.22, A(-0.9, 0.1, -1.7, -3.3, { spine: [0.0, -0.35, 0], chest: [0, -0.15, 0], head: [0, 0.2, 0], $hips: [-0.07, -0.02], $root: R(0, 0, -0.02, 0, -0.22) }, OFF.tuck), 'h'],
    [0.38, A(-1.75, -0.15, -0.55, -4.3, { spine: [0.25, 0.15, 0], chest: [0.08, 0.1, 0], head: [-0.1, -0.1, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.16], $fR: [0, 0, -0.08], $root: R(0, 0, 0.16, 0.05, 0.12) }, OFF.tuck)],
    [0.5, A(-1.7, -0.1, -0.6, -4.2, { spine: [0.27, 0.18, 0], chest: [0.08, 0.1, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.16], $fR: [0, 0, -0.08], $root: R(0, 0, 0.16, 0.05, 0.14) }, OFF.tuck)],
    [0.78, recover(A(-1.5, 0, -0.8, -3.5, { spine: [0.2, 0.1, 0], $root: R(0, 0, 0.1, 0.02, 0.08) }, OFF.tuck))],
    [1.02, g],
  ] };
  // ---- a shoulder charge: dropped low, shoulder turned in, and driven off the back foot into him
  M.charge = { line: 'mid', body: true, hits: [0.48], keys: [
    [0, g],
    [0.26, add(g, { spine: [0.3, -0.45, 0], chest: [0.1, -0.2, 0], head: [-0.25, 0.4, 0], $hips: [-0.14, -0.04], $fL: [0, 0, 0.05], $fR: [0, 0, -0.1], $root: R(0, 0, -0.06, 0.05, -0.5) }), 'h'],
    [0.48, add(g, { spine: [0.35, -0.6, 0], chest: [0.12, -0.25, 0], head: [-0.28, 0.5, 0], $hips: [-0.1, 0.08], $fL: [0, 0.05, 0.22], $fR: [0, 0, -0.05], $root: R(0, 0.02, 0.36, 0.1, -0.75) })],
    [0.6, add(g, { spine: [0.33, -0.55, 0], chest: [0.1, -0.2, 0], $hips: [-0.11, 0.08], $fL: [0, 0, 0.22], $root: R(0, 0.01, 0.38, 0.08, -0.7) })],
    [0.88, add(g, { spine: [0.15, -0.2, 0], $hips: [-0.06, 0.04], $root: R(0, 0, 0.2, 0.03, -0.3) })],
    [1.12, g],
  ] };
  // ---- the disarm: the blade bound round the foe's and flicked up, tearing it from his grip
  M.disarm = { line: 'mid', hits: [0.4], keys: [
    [0, g],
    [0.22, A(-1.35, 0.35, -0.8, -2.6, { spine: [0.1, -0.2, 0], $hips: [-0.08, 0], $root: R(0, 0, 0, 0, -0.1) }, OFF.tuck), 'h'],
    [0.4, A(-1.55, -0.35, -0.25, -1.85, { spine: [0.25, 0.2, 0], $hips: [-0.11, 0.06], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: R(0, 0, 0.1, 0.03, 0.15), $aim: [1] }, OFF.tuck)],
    [0.56, A(-2.45, -0.5, -0.5, -3.5, { spine: [0.08, 0.25, 0], head: [-0.15, 0, 0], $hips: [-0.08, 0.05], $fL: [0, 0, 0.12], $root: R(0, 0.01, 0.08, 0, 0.2) }, OFF.tuck)],
    [0.85, recover(A(-2.0, -0.3, -0.7, -3.0, { $root: R(0, 0, 0.05, 0, 0.1) }, OFF.tuck))],
    [1.1, g],
  ] };
  // ... and the one disarmed: the hand torn open, the body flung back a step, then empty-handed
  M.disarmed = { react: true, hits: [0], keys: [
    [0, g],
    [0.08, { ...lerpPose(g, P.fling, 0.75), $root: R(0, 0.01, -0.09, -0.08, 0.15) }],
    [0.45, { ...lerpPose(g, P.fling, 0.3), $root: R(0, 0, -0.12, -0.03, 0.1), $fR: [0, 0, -0.12] }],
    [0.85, { ...g, $root: R(0, 0, -0.08) }],
    [1.05, g],
  ] };
  // ---- knocked down: flung back off his feet onto his back on the board
  const lie = { ...lerpPose(g, P.fling, 0.55), spine: [0.25, 0, 0.05], chest: [0.1, 0, 0], head: [0.5, 0.1, 0], $hips: [0, 0], $fL: [0, 0.02, 0.05], $fR: [0, 0.07, 0.12], $root: tipX(-1.46, -0.09, -0.16, 0.015) };
  M.down = { react: true, hits: [0], keys: [
    [0, g],
    [0.09, { ...lerpPose(g, P.fling, 0.75), $root: R(0, 0.01, -0.1, -0.14) }],
    [0.36, { ...lerpPose(g, P.fling, 0.85), spine: [0.1, 0, 0], head: [0.1, 0, 0], $root: tipX(-0.85, -0.09, -0.12, 0.03) }],
    [0.56, { ...lie, $root: tipX(-1.52, -0.09, -0.15, 0.035) }],
    [0.7, lie],
    [0.8, lie],
  ] };
  M.downed = { loop: true, keys: [[0, lie], [0.9, add(lie, { head: [0.12, 0.15, 0], spine: [0.05, 0, 0] })], [1.8, lie]] };
  // ... dragging himself back across the board on his elbows
  const elbows = add(lie, { spine: [0.35, 0, 0], head: [0.25, 0, 0], $root: R(0, 0.02, 0, 0.12) });
  M.crawl = { loop: true, keys: [[0, elbows], [0.35, add(elbows, { spine: [0.1, 0.15, 0], $root: R(0, 0.01, -0.03, 0.04, 0.05) })], [0.7, add(elbows, { spine: [0.1, -0.15, 0], $root: R(0, 0.01, -0.05, 0.04, -0.05) })], [1.05, elbows]] };
  // ... trying to rise: up onto an elbow, then a knee
    // (he gets as far as sitting up, a hand on the board, before he is finished)
  const sit = { ...lerpPose(lie, g, 0.45), spine: [0.75, 0, 0.05], chest: [0.2, 0, 0], head: [0.1, 0, 0], $fL: [0, 0.03, 0.08], $fR: [0, 0.08, 0.16], $root: tipX(-1.25, -0.09, -0.16, 0.04) };
  M.rise = { react: true, hits: [0], keys: [[0, elbows], [0.5, sit], [0.85, add(sit, { spine: [0.12, 0.1, 0], $root: R(0, 0.01, 0.02, 0.06) }), 'h'], [1.3, add(sit, { spine: [0.05, -0.05, 0] })]] };
  // ---- finishing a fallen foe: the hilt raised high, the point driven down into him
  M.execute = { line: 'low', hits: [0.54], keys: [
    [0, g],
    [0.36, A(-2.6, 0.0, -0.7, -1.2, { spine: [-0.1, 0, 0], head: [0.3, 0, 0], $hips: [-0.04, 0], $fL: [0, 0, 0.06], $root: R(0, 0.012, 0.02, -0.04) }, OFF.up), 'h'],
    [0.54, A(-1.25, 0.0, -0.15, -0.45, { spine: [0.55, 0, 0], chest: [0.15, 0, 0], head: [0.35, 0, 0], $hips: [-0.18, 0.06], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: R(0, 0, 0.14, 0.08), $aim: [1] }, OFF.fwd)],
    [0.9, A(-1.2, 0.0, -0.12, -0.42, { spine: [0.58, 0, 0], chest: [0.15, 0, 0], head: [0.35, 0, 0], $hips: [-0.18, 0.06], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: R(0, 0, 0.14, 0.08), $aim: [1] }, OFF.fwd)],
    [1.2, recover(A(-1.4, 0, -0.4, -1.2, { spine: [0.35, 0, 0], $root: R(0, 0, 0.1, 0.04) }, OFF.tuck))],
    [1.5, g],
  ] };
  // ---- spells. Levelled at the foe: the weapon raised high, gathering, then thrust out at him
  const gather = A(-2.75, 0.1, -0.45, -3.4, { spine: [-0.22, 0, 0], chest: [-0.08, 0, 0], head: [-0.25, 0, 0], $hips: [-0.03, -0.02], $root: R(0, 0.02, -0.02, -0.04) }, OFF.up);
  const loose = A(-1.65, 0, -0.1, -1.25, { spine: [0.32, 0, 0], chest: [0.1, 0, 0], head: [-0.12, 0, 0], $hips: [-0.1, 0.05], $fL: [0, 0, 0.13], $fR: [0, 0, -0.06], $root: R(0, 0, 0.1, 0.05) }, OFF.fwd);
  M.castFwd = { line: 'mid', cast: true, hits: [0.62], keys: [[0, g], [0.32, gather], [0.5, add(gather, { spine: [-0.04, 0, 0], $root: R(0, 0.006, 0) }), 'h'], [0.62, loose], [1.0, add(loose, { spine: [0.03, 0, 0] })], [1.35, g]] };
  // summoning: both arms (and the weapon) raised to the sky, held there
  const summon = A(-2.95, 0.15, -0.15, -3.15, { spine: [-0.18, 0, 0], chest: [-0.08, 0, 0], head: [-0.45, 0, 0], $hips: [-0.02, 0], $root: R(0, 0.015, 0, -0.05) }, OFF.up);
  M.castUp = { line: 'high', cast: true, hits: [0.5], keys: [[0, g], [0.36, summon], [0.5, add(summon, { spine: [-0.03, 0, 0] }), 'h'], [1.5, add(summon, { spine: [-0.06, 0, 0], head: [-0.05, 0, 0] })], [1.85, g]] };
  // a stamp of the foot that shakes the board
  const footUp = A(-2.2, 0.2, -0.8, -3.6, { $fR: [0, 0.17, 0.05], $hips: [-0.02, 0], spine: [-0.12, 0.1, 0], head: [-0.2, 0, 0], $root: R(0, 0.02, 0, -0.04, 0, 0.03) }, OFF.up);
  const footDown = A(-1.3, 0.2, -0.4, -2.2, { $fR: [0, 0, 0.08], $hips: [-0.15, 0.04], spine: [0.32, 0, 0], head: [0.1, 0, 0], $root: R(0, -0.004, 0.04, 0.05) }, OFF.fwd);
  M.stomp = { line: 'low', cast: true, hits: [0.48], keys: [[0, g], [0.34, footUp, 'h'], [0.48, footDown], [0.95, add(footDown, { spine: [-0.05, 0, 0] })], [1.3, g]] };
  // the arm drawn back and cracked forward like a whip
  M.whip = { line: 'mid', cast: true, hits: [0.48], keys: [
    [0, g],
    [0.3, A(-2.5, -1.0, -1.1, -4.4, { spine: [-0.1, -0.55, 0], chest: [-0.05, -0.25, 0], head: [0, 0.45, 0], $hips: [-0.05, -0.02], $root: R(0, 0, -0.03, 0, -0.3) }, OFF.up), 'h'],
    [0.48, A(-1.5, 0.3, -0.1, -1.5, { spine: [0.3, 0.25, 0], chest: [0.1, 0.1, 0], $hips: [-0.1, 0.06], $fL: [0, 0, 0.14], $fR: [0, 0, -0.06], $root: R(0, 0, 0.1, 0.04, 0.15) }, OFF.fwd)],
    [0.64, A(-0.9, 0.8, -0.15, -0.9, { spine: [0.35, 0.45, 0], $hips: [-0.1, 0.06], $fL: [0, 0, 0.14], $root: R(0, 0, 0.12, 0.05, 0.3) }, OFF.fwd)],
    [1.05, g],
  ] };
  // a ward: braced behind the raised weapon (a shimmering shield hangs before him)
  const wardP = add(lerpPose(P.blockMid, P.cheer, 0.25), { spine: [-0.1, 0, 0], $hips: [-0.08, 0], $fL: [0, 0, 0.08], $fR: [0, 0, -0.08] });
  M.ward = { react: true, hits: [0.24], keys: [[0, g], [0.24, wardP, 'h'], [1.2, add(wardP, { spine: [0.03, 0, 0] })], [1.36, { ...add(wardP, { spine: [-0.14, 0, 0], head: [-0.12, 0, 0] }), $root: R(0, 0, -0.07, -0.07) }], [1.75, g]] };
  // held by a spell: struggling against chains, or flailing in the air
  const strain = lerpPose(g, P.fling, 0.35);
  M.bound = { loop: true, keys: [[0, strain], [0.3, add(strain, { spine: [0.05, 0.3, 0.1], head: [0, -0.35, 0] })], [0.6, add(strain, { spine: [0.05, -0.3, -0.1], head: [0, 0.35, 0] })], [0.9, strain]] };
  M.flail = { loop: true, keys: [[0, P.fling], [0.25, add(P.fling, { spine: [0.15, 0.2, 0.15], head: [0.2, -0.2, 0] })], [0.5, add(P.fling, { spine: [-0.1, -0.2, -0.15] })], [0.75, P.fling]] };
  // marching: a quick step, feet lifted and set down on the board, the weapon carried at the ready
  const st = (fl, fr, hy) => ({ ...g, $fL: fl, $fR: fr, $hips: [hy, 0.01] });
  M.walk = { loop: true, keys: [
    [0, st([0, 0, 0.16], [0, 0, -0.14], -0.07)],
    [0.13, st([0, 0, 0.02], [0, 0.09, 0.0], -0.035)],
    [0.27, st([0, 0, -0.14], [0, 0, 0.16], -0.07)],
    [0.4, st([0, 0.09, 0.0], [0, 0, 0.02], -0.035)],
    [0.54, st([0, 0, 0.16], [0, 0, -0.14], -0.07)],
  ] };
  M.run = M.walk;
  return M;
}

// ---- the two-handed fighter: king (greatsword) and queen (staff)
function twoHanded() {
  const guard = two(-1.0, -0.12, -0.95, -2.3, { spine: [0.06, 0.18, 0], head: [0.04, -0.12, 0], $hips: [-0.05, 0], $fL: [0, 0, 0.07], $fR: [0, 0, -0.06] });
  // at rest: upright, both hands on the hilt before the chest, the weapon standing point-down
  // on the board in front of the feet (the greatsword on its point, the staff on its foot)
  const rest = two(-0.42, 0, -1.05, -0.02, { head: [0.05, 0, 0] });
  const recover = (p) => lerpPose(p, guard, 0.6);
  const P = { rest, guard };
  const M = {};
  // overhead cleave: up and back behind the head, then straight down through the target
  {
    const wind = two(-2.85, 0.0, -1.1, -4.45, { spine: [-0.18, -0.1, 0], chest: [-0.08, 0, 0], head: [-0.05, 0.1, 0], $hips: [-0.02, -0.05], $fL: [0, 0.05, 0.03], $fR: [0, 0, -0.06], $root: [0, 0.015, -0.05, -0.05, 0, 0] });
    const imp = two(-1.5, 0.05, -0.12, -1.72, { spine: [0.45, 0.02, 0], chest: [0.18, 0, 0], head: [-0.3, 0, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: [0, 0, 0.18, 0.06, 0, 0], $aim: [1] });
    M.cleave = { line: 'high', from: 'C', heavy: true, hits: [0.7], keys: [
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
  M.slash = { line: 'mid', from: 'R', hits: [0.64], keys: [[0, guard], ...slashKeys(0), [1.0, recover(two(-0.8, 0.8, -0.15, -1.0, { spine: [0.5, 0.6, 0.15], $root: [0, 0, 0.17, 0.04, 0.2, 0] }))], [1.25, guard]] };
  // the forehand: wound round to the right, the whole body unwinds and the blade, edge
  // leading, travels flat through the target at chest height
  const E2 = (p) => edge(p, 'R');
  const foreKeys2 = (t0) => [
    [t0 + 0.2, two(-1.1, -0.5, -1.2, -2.2, { spine: [0.1, -0.3, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.06] })],
    [t0 + 0.44, E2(two(-1.45, -1.3, -0.55, -1.75, { spine: [0.05, -0.55, 0], chest: [0, -0.25, 0], head: [0, 0.6, 0], $hips: [-0.08, -0.03], $fL: [0, 0, 0.05], $fR: [0, 0, -0.07], $root: [0, 0, -0.04, 0, -0.3, 0] })), 'h'],
    [t0 + 0.56, E2(two(-1.52, -0.75, -0.2, -1.62, { spine: [0.1, -0.25, 0], chest: [0, -0.1, 0], head: [0, 0.3, 0], $hips: [-0.09, 0.03], $fL: [0, 0.06, 0.11], $fR: [0, 0, -0.07], $root: [0, 0.01, 0.07, 0, -0.14, 0], $aim: [0.7] }))],
    [t0 + 0.64, E2(two(-1.55, 0.05, -0.06, -1.57, { spine: [0.15, 0.12, 0], chest: [0.05, 0.08, 0], head: [-0.1, -0.15, 0], $hips: [-0.11, 0.05], $fL: [0, 0, 0.14], $fR: [0, 0, -0.07], $root: [0, 0, 0.14, 0.02, 0.05, 0], $aim: [1] }))],
    [t0 + 0.76, E2(two(-1.48, 0.9, -0.15, -1.57, { spine: [0.15, 0.5, 0], chest: [0.05, 0.25, 0], head: [0, -0.35, 0], $hips: [-0.11, 0.05], $fL: [0, 0, 0.14], $fR: [0, 0, -0.07], $root: [0, 0, 0.15, 0.02, 0.3, 0], $aim: [0.4] }))],
  ];
  M.sweep = { line: 'mid', from: 'R', hits: [0.64], keys: [[0, guard], ...foreKeys2(0), [1.02, recover(two(-1.48, 0.9, -0.15, -1.57, { spine: [0.15, 0.5, 0], $root: [0, 0, 0.11, 0, 0.25, 0] }))], [1.28, guard]] };
  // the backhand: the blade carried across to the left shoulder, then swept flat out to the right
  M.back = { line: 'mid', from: 'L', hits: [0.62], keys: [
    [0, guard],
    [0.2, two(-1.15, 0.45, -1.25, -2.4, { spine: [0.1, 0.3, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.06] })],
    [0.42, E2(two(-1.4, 1.2, -0.75, -1.85, { spine: [0.05, 0.55, 0], chest: [0, 0.25, 0], head: [0, -0.55, 0], $hips: [-0.08, -0.03], $fL: [0, 0, 0.05], $fR: [0, 0, -0.07], $root: [0, 0, -0.04, 0, 0.3, 0] })), 'h'],
    [0.54, E2(two(-1.52, 0.65, -0.25, -1.62, { spine: [0.1, 0.25, 0], chest: [0, 0.1, 0], head: [0, -0.3, 0], $hips: [-0.09, 0.03], $fR: [0, 0.06, -0.02], $fL: [0, 0, 0.08], $root: [0, 0.01, 0.07, 0, 0.14, 0], $aim: [0.7] }))],
    [0.62, E2(two(-1.55, -0.15, -0.06, -1.57, { spine: [0.15, -0.1, 0], chest: [0.05, -0.06, 0], head: [-0.1, 0.12, 0], $hips: [-0.11, 0.05], $fR: [0, 0, 0.05], $fL: [0, 0, 0.08], $root: [0, 0, 0.13, 0.02, -0.05, 0], $aim: [1] }))],
    [0.74, E2(two(-1.48, -1.05, -0.15, -1.57, { spine: [0.15, -0.5, 0], chest: [0.05, -0.25, 0], head: [0, 0.35, 0], $hips: [-0.11, 0.05], $fR: [0, 0, 0.05], $fL: [0, 0, 0.08], $root: [0, 0, 0.14, 0.02, -0.3, 0], $aim: [0.4] }))],
    [1.0, recover(two(-1.48, -1.05, -0.15, -1.57, { spine: [0.15, -0.5, 0], $root: [0, 0, 0.1, 0, -0.25, 0] }))],
    [1.26, guard],
  ] };
  // the thrust: drawn back to the right hip, then driven straight in with a long lunge
  M.thrust = { line: 'mid', from: 'C', hits: [0.62], keys: [
    [0, guard],
    [0.4, two(0.25, -0.55, -1.75, -1.65, { spine: [-0.05, -0.5, 0], chest: [0, -0.2, 0], head: [0, 0.4, 0], $hips: [-0.12, -0.04], $fL: [0, 0, 0.05], $fR: [0, 0, -0.08], $root: [0, 0, -0.06, -0.04, -0.25, 0] }), 'h'],
    [0.54, two(-0.9, -0.45, -0.9, -1.6, { spine: [0.2, -0.1, 0], head: [0, 0.1, 0], $hips: [-0.1, 0.05], $fL: [0, 0.08, 0.15], $fR: [0, 0, -0.09], $root: [0, 0.01, 0.08, 0.02, -0.1, 0], $aim: [0.8] })],
    [0.62, two(-1.52, -0.3, -0.05, -1.6, { spine: [0.35, 0.1, 0], chest: [0.1, 0.1, 0], head: [-0.2, 0, 0], $hips: [-0.16, 0.11], $fL: [0, 0, 0.22], $fR: [0, 0, -0.11], $root: [0, 0, 0.18, 0.05, 0.05, 0], $aim: [1] })],
    [0.74, two(-1.5, -0.3, -0.05, -1.55, { spine: [0.38, 0.12, 0], chest: [0.1, 0.1, 0], head: [-0.2, 0, 0], $hips: [-0.16, 0.11], $fL: [0, 0, 0.22], $fR: [0, 0, -0.11], $root: [0, 0, 0.19, 0.05, 0.05, 0], $aim: [0.8] })],
    [0.92, recover(two(-1.2, 0.0, -0.5, -1.9, { spine: [0.3, 0.1, 0], $hips: [-0.1, 0.05], $root: [0, 0, 0.12, 0.03, 0, 0] }))],
    [1.15, guard],
  ] };
  // the finisher: a flat forehand, then the blade carried right round in a full turn and back
  // through the foe, flat, at the same height
  {
    const s = foreKeys2(0);
    const sp = (ry, p) => ({ ...p, $root: [0, 0.02, 0.14, 0.02, ry, 0] });
    M.spin = { line: 'mid', from: ['R', 'R'], heavy: true, hits: [0.64, 1.34], keys: [
      [0, guard], ...s.slice(0, 4),
      [0.8, sp(0.9, E2(two(-1.45, 0.9, -0.15, -1.57, { spine: [0.2, 0.5, 0.05], chest: [0.05, 0.25, 0], head: [-0.1, -0.5, 0], $hips: [-0.1, 0.05], $fL: [0, 0.05, 0.1] })))],
      [0.98, sp(PI * 0.75, E2(two(-1.5, -1.2, -0.2, -1.6, { spine: [0.1, -0.5, 0], chest: [0, -0.3, 0], head: [0, 0.6, 0], $hips: [-0.07, 0.02], $fR: [0, 0.05, 0] })))],
      [1.16, sp(PI * 1.5, E2(two(-1.5, -1.3, -0.3, -1.65, { spine: [0.05, -0.6, 0], chest: [0, -0.3, 0], head: [0, 0.7, 0], $hips: [-0.08, 0.0], $fL: [0, 0.06, 0.06] })))],
      [1.34, { ...E2(two(-1.55, 0.1, -0.06, -1.57, { spine: [0.18, 0.12, 0], chest: [0.05, 0.08, 0], head: [-0.15, -0.15, 0], $hips: [-0.12, 0.06], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $aim: [1] })), $root: [0, 0, 0.18, 0.03, PI * 2 + 0.05, 0] }],
      [1.46, { ...E2(two(-1.48, 0.9, -0.15, -1.57, { spine: [0.18, 0.5, 0], chest: [0.05, 0.25, 0], head: [0, -0.3, 0], $hips: [-0.12, 0.06], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $aim: [0.4] })), $root: [0, 0, 0.19, 0.03, PI * 2 + 0.35, 0] }],
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
  // the queen's spell for a pawn: the staff planted upright at her right side (main.js lets go
  // of it at `plant` and takes it back at `grab`), two claps high over her head, then the left
  // arm swept down at the foe; she raises her hand as the wormhole draws it up, and shies from
  // the flash. hits: the two claps and the cast.
  {
    const plant = { shR: [-0.3, 0, -0.42], elR: [-1.25, 0, 0], wrR: [1.55, 0, 0.42], shL: [-0.25, 0, 0.14], elL: [-0.55, 0, 0], wrL: [0.2, 0, 0], spine: [0.04, -0.12, 0], head: [0.06, 0.2, 0], $hips: [-0.04, 0], $fL: [0, 0, 0.04], $fR: [0, 0, -0.04] };
    const high = (sp, el, x = {}) => ({ ...plant, shL: [-2.78, 0, sp], shR: [-2.78, 0, -sp], elL: [el, 0, 0], elR: [el, 0, 0], wrL: [0.05, 0, 0], wrR: [0.05, 0, 0], spine: [-0.1, 0, 0], chest: [-0.05, 0, 0], head: [-0.38, 0, 0], $hips: [-0.01, 0], $fL: [0, 0, 0.04], $fR: [0, 0, -0.04], ...x });
    const lift = (sx, x = {}) => ({ ...plant, shL: [sx, 0, -0.06], elL: [-0.15, 0, 0], wrL: [-0.45, 0, 0], shR: [-0.45, 0, -0.55], elR: [-0.7, 0, 0], wrR: [0.3, 0, 0], spine: [0.12, -0.1, 0], chest: [0.04, 0, 0], head: [-0.4, -0.05, 0], $hips: [-0.08, 0.04], $fL: [0, 0, 0.1], $fR: [0, 0, -0.05], $root: [0, 0, 0.06, 0.02, 0, 0], ...x });
    M.clap = { line: 'high', cast: true, hits: [0.6, 0.82, 1.18], plant: 0.3, grab: 3.57, keys: [
      [0, guard],
      [0.3, plant, 'h'],
      [0.5, high(0.5, -0.85, { $root: [0, 0.01, 0, -0.02, 0, 0] })],
      [0.6, high(-0.3, -0.32, { $root: [0, 0.02, 0, -0.03, 0, 0] })],
      [0.71, high(0.42, -0.8, { $root: [0, 0.01, 0, -0.02, 0, 0] })],
      [0.82, high(-0.3, -0.32, { $root: [0, 0.025, 0, -0.03, 0, 0] })],
      [0.95, high(-0.3, -0.3, { spine: [-0.14, 0, 0], head: [-0.45, 0, 0], $root: [0, 0.03, 0, -0.04, 0, 0] }), 'h'],
      [1.06, lift(-3.05, { shR: [-0.5, 0, -0.5], spine: [-0.16, 0.2, 0], chest: [-0.06, 0.1, 0], head: [-0.3, -0.15, 0], wrL: [0.3, 0, 0], $hips: [-0.02, -0.02], $root: [0, 0.02, -0.03, -0.04, 0.1, 0] }), 'h'],
      [1.18, lift(-1.5, { wrL: [0.15, 0, 0], spine: [0.34, -0.2, 0], chest: [0.1, -0.05, 0], head: [-0.2, 0.05, 0], $hips: [-0.1, 0.06], $fL: [0, 0, 0.14], $root: [0, 0, 0.1, 0.05, -0.12, 0] })],
      [1.4, lift(-1.6, { wrL: [-0.1, 0, 0], spine: [0.3, -0.18, 0], head: [-0.3, 0.05, 0], $root: [0, 0, 0.1, 0.04, -0.1, 0] }), 'h'],
      [3.0, lift(-2.25, { head: [-0.55, 0.05, 0], spine: [0.05, -0.15, 0], $root: [0, 0.01, 0.07, -0.01, -0.08, 0] })],
      [3.17, lift(-2.3, { head: [-0.6, 0.05, 0], spine: [0.0, -0.15, 0], $root: [0, 0.01, 0.07, -0.02, -0.08, 0] }), 'h'],
      [3.31, { ...lift(-1.9, { shL: [-1.9, 0, 0.45], elL: [-0.9, 0, 0], spine: [-0.12, 0.15, 0.06], chest: [-0.06, 0.08, 0], head: [0.15, 0.45, 0.1], $hips: [-0.04, -0.03], $root: [0, 0, 0.0, -0.05, 0.05, 0] }) }],
      [3.47, plant],
      [3.57, plant, 'h'],
      [3.9, guard],
    ] };
  }
  // guards: blade upright across the body, or held flat over the head
  P.blockMid = two(-1.25, -0.25, -1.15, -3.0, { spine: [0.0, 0.25, 0], head: [-0.05, -0.2, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  // a cut from the side: the blade held upright out on that side
  P.blockL = two(-1.25, 0.55, -1.1, -3.05, { spine: [0.0, 0.45, 0], chest: [0, 0.15, 0], head: [-0.05, -0.4, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockR = two(-1.25, -0.8, -1.1, -3.05, { spine: [0.0, -0.35, 0], chest: [0, -0.15, 0], head: [-0.05, 0.35, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockHigh = { ...two(-2.25, 0.05, -1.05, -4.0, { spine: [-0.12, 0.1, 0], head: [-0.15, 0, 0], $hips: [-0.09, -0.03], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] }), wrR: [-4.0 + 2.25 + 1.05, 0, 1.2], wrL: [-4.0 + 2.25 + 1.05, 0, 1.2] };
  P.fling = two(-2.4, 0.4, -0.3, -3.0, { spine: [-0.4, 0.3, 0.15], chest: [-0.2, 0.1, 0], head: [-0.5, 0.3, 0.3] });
  P.cheer = two(-3.0, 0, -0.1, -3.2, { spine: [-0.15, 0, 0], head: [-0.35, 0, 0] });
  Object.assign(M, common(P, (sx, out, el, phi, x = {}) => two(sx, out, el, phi, x), 'two'));
  return { P, M };
}

// ---- one weapon arm: rook (sword and shield), knight (mace and shield), bishop (crozier, left)
function oneHanded(bishop = false) {
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
  M.cleave = { line: 'high', from: 'C', heavy: true, hits: [0.64], keys: [[0, guard], ...cleaveKeys(0), [1.0, recover(one(-0.7, -0.35, -0.1, -0.75, [-0.3, -0.4, -1.1], { spine: [0.55, 0.35, 0], $hips: [-0.12, 0.08], $root: [0, 0, 0.18, 0.06, 0.12, 0] }))], [1.25, guard]] };
  // diagonal slash, high right to low left, the shield swung back for balance
  M.slash = { line: 'mid', from: 'R', hits: [0.62], keys: [
    [0, guard],
    [0.18, one(-1.1, 0.5, -1.2, -2.5, shieldUp, { spine: [0.1, -0.2, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.05] })],
    [0.42, one(-2.5, 1.0, -1.3, -4.2, [-1.4, 0.1, -0.8], { spine: [-0.15, -0.65, -0.12], chest: [-0.08, -0.3, 0], head: [0, 0.6, 0], $hips: [-0.03, -0.04], $fL: [0, 0.04, 0.02], $fR: [0, 0, -0.06], $root: [0, 0.01, -0.03, -0.03, -0.28, 0] }), 'h'],
    [0.54, one(-2.3, 0.5, -0.45, -3.2, [-1.1, 0.0, -1.0], { spine: [0.1, -0.2, 0], head: [0, 0.2, 0], $hips: [-0.06, 0.03], $fL: [0, 0.05, 0.11], $fR: [0, 0, -0.06], $root: [0, 0.04, 0.08, 0, -0.1, 0], $aim: [0.7] })],
    [0.62, one(-1.45, -0.45, -0.15, -1.8, [-0.4, -0.4, -1.2], { spine: [0.35, 0.4, 0.1], chest: [0.12, 0.2, 0], head: [-0.2, -0.3, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.16, 0.05, 0.18, 0], $aim: [1] })],
    [0.74, one(-0.8, -0.9, -0.15, -1.0, [-0.3, -0.5, -1.1], { spine: [0.5, 0.65, 0.15], chest: [0.15, 0.3, 0], head: [-0.3, -0.45, 0], $hips: [-0.12, 0.08], $fL: [0, 0, 0.13], $fR: [0, 0, -0.07], $root: [0, 0, 0.17, 0.07, 0.28, 0], $aim: [0.5] })],
    [0.98, recover(one(-0.8, -0.9, -0.15, -1.0, [-0.3, -0.5, -1.1], { spine: [0.5, 0.65, 0.15], $root: [0, 0, 0.15, 0.04, 0.22, 0] }))],
    [1.22, guard],
  ] };
  // the forehand: wound round to the right, the body unwinds, the blade flat and edge-on
  const E1 = (p) => edge(p, 'R');
  M.sweep = { line: 'mid', from: 'R', hits: [0.64], keys: [
    [0, guard],
    [0.2, one(-1.1, 0.7, -1.3, -2.2, shieldUp, { spine: [0.1, -0.3, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.05] })],
    [0.44, cock(E1(one(-1.45, 1.3, -0.4, -1.75, [-1.3, 0.1, -1.0], { spine: [0.05, -0.55, 0], chest: [0, -0.25, 0], head: [0, 0.6, 0], $hips: [-0.07, -0.03], $fL: [0, 0, 0.05], $fR: [0, 0, -0.07], $root: [0, 0, -0.04, 0, -0.3, 0] })), 'R', 0.6), 'h'],
    [0.56, E1(one(-1.52, 0.75, -0.15, -1.62, [-1.0, -0.1, -1.1], { spine: [0.1, -0.25, 0], head: [0, 0.3, 0], $hips: [-0.08, 0.03], $fL: [0, 0.06, 0.11], $fR: [0, 0, -0.07], $root: [0, 0.01, 0.07, 0, -0.14, 0], $aim: [0.7] }))],
    [0.64, E1(one(-1.55, -0.05, -0.05, -1.57, [-0.5, -0.4, -1.1], { spine: [0.15, 0.15, 0], chest: [0.05, 0.08, 0], head: [-0.1, -0.15, 0], $hips: [-0.1, 0.05], $fL: [0, 0, 0.14], $fR: [0, 0, -0.07], $root: [0, 0, 0.14, 0.02, 0.06, 0], $aim: [1] }))],
    [0.76, E1(one(-1.48, -0.95, -0.15, -1.57, [-0.4, -0.5, -1.0], { spine: [0.15, 0.5, 0], chest: [0.05, 0.25, 0], head: [0, -0.35, 0], $hips: [-0.1, 0.05], $fL: [0, 0, 0.14], $fR: [0, 0, -0.07], $root: [0, 0, 0.15, 0.02, 0.3, 0], $aim: [0.4] }))],
    [1.0, recover(one(-1.48, -0.95, -0.15, -1.57, [-0.4, -0.5, -1.0], { spine: [0.15, 0.5, 0], $root: [0, 0, 0.11, 0, 0.25, 0] }))],
    [1.26, guard],
  ] };
  // the backhand: the blade carried across in front of the shield (swung wide out of its way)
  // to the left hip, then whipped out flat to the right
  M.back = { line: 'mid', from: 'L', hits: [0.6], keys: [
    [0, guard],
    [0.2, one(-1.05, -0.4, -1.3, -2.3, [-0.6, -0.4, -1.2], { spine: [0.1, 0.3, 0], $hips: [-0.08, -0.01], $fL: [0, 0, 0.06], $fR: [0, 0, -0.05] })],
    [0.42, E1(one(-1.25, -1.05, -0.95, -1.75, [-0.3, -0.9, -0.7], { spine: [0.05, 0.55, 0], chest: [0, 0.25, 0], head: [0, -0.55, 0], $hips: [-0.08, -0.03], $fL: [0, 0, 0.05], $fR: [0, 0, -0.07], $root: [0, 0, -0.04, 0, 0.3, 0] })), 'h'],
    [0.53, E1(one(-1.5, -0.55, -0.3, -1.62, [-0.3, -0.9, -0.7], { spine: [0.1, 0.25, 0], head: [0, -0.3, 0], $hips: [-0.09, 0.03], $fR: [0, 0.06, -0.02], $fL: [0, 0, 0.08], $root: [0, 0.01, 0.07, 0, 0.14, 0], $aim: [0.7] }))],
    [0.6, E1(one(-1.55, 0.25, -0.05, -1.57, [-0.5, -0.6, -1.0], { spine: [0.15, -0.1, 0], chest: [0.05, -0.06, 0], head: [-0.1, 0.12, 0], $hips: [-0.1, 0.05], $fR: [0, 0, 0.05], $fL: [0, 0, 0.08], $root: [0, 0, 0.13, 0.02, -0.05, 0], $aim: [1] }))],
    [0.72, E1(one(-1.48, 1.25, -0.12, -1.57, [-0.9, -0.2, -1.2], { spine: [0.15, -0.5, 0], chest: [0.05, -0.25, 0], head: [0, 0.35, 0], $hips: [-0.1, 0.05], $fR: [0, 0, 0.05], $fL: [0, 0, 0.08], $root: [0, 0, 0.14, 0.02, -0.3, 0], $aim: [0.4] }))],
    [0.98, recover(one(-1.48, 1.25, -0.12, -1.57, [-0.9, -0.2, -1.2], { spine: [0.15, -0.5, 0], $root: [0, 0, 0.1, 0, -0.25, 0] }))],
    [1.24, guard],
  ] };
  // a lunging thrust, shield tucked in
  M.thrust = { line: 'mid', from: 'C', hits: [0.6], keys: [
    [0, guard],
    [0.38, one(0.35, 0.3, -1.85, -1.6, [-1.2, 0.5, -1.4], { spine: [-0.05, -0.55, 0], chest: [0, -0.2, 0], head: [0, 0.45, 0], $hips: [-0.12, -0.04], $fL: [0, 0, 0.05], $fR: [0, 0, -0.08], $root: [0, 0, -0.06, -0.04, -0.28, 0] }), 'h'],
    [0.52, one(-0.8, 0.1, -1.0, -1.6, [-1.0, 0.3, -1.3], { spine: [0.2, -0.1, 0], head: [0, 0.1, 0], $hips: [-0.1, 0.05], $fL: [0, 0.08, 0.15], $fR: [0, 0, -0.09], $root: [0, 0.01, 0.08, 0.02, -0.1, 0], $aim: [0.8] })],
    [0.6, one(-1.55, -0.1, -0.05, -1.6, [-0.4, -0.2, -1.3], { spine: [0.35, 0.25, 0], chest: [0.1, 0.12, 0], head: [-0.2, -0.1, 0], $hips: [-0.16, 0.11], $fL: [0, 0, 0.22], $fR: [0, 0, -0.11], $root: [0, 0, 0.19, 0.05, 0.12, 0], $aim: [1] })],
    [0.72, one(-1.52, -0.1, -0.05, -1.55, [-0.4, -0.2, -1.3], { spine: [0.38, 0.27, 0], chest: [0.1, 0.12, 0], head: [-0.2, -0.1, 0], $hips: [-0.16, 0.11], $fL: [0, 0, 0.22], $fR: [0, 0, -0.11], $root: [0, 0, 0.2, 0.05, 0.12, 0], $aim: [0.8] })],
    [0.9, recover(one(-1.2, 0.1, -0.5, -1.9, shieldUp, { spine: [0.3, 0.1, 0], $hips: [-0.1, 0.05], $root: [0, 0, 0.12, 0.03, 0.05, 0] }))],
    [1.12, guard],
  ] };
  // the finisher: a shield-bash (or off-hand shove) that rocks the foe, then the cleave
  {
    const c = cleaveKeys(0.42, 1.1);
    M.bash = { line: 'high', from: ['C', 'C'], heavy: true, hits: [0.32, 0.42 + 0.64 * 1.1], keys: [
      [0, guard],
      [0.16, one(-0.6, 0.3, -1.3, -2.1, [-0.6, 0.7, -1.9], { spine: [0.0, 0.35, 0], chest: [0, 0.15, 0], $hips: [-0.09, -0.03], $fL: [0, 0.04, 0.03], $fR: [0, 0, -0.06], $root: [0, 0, -0.04, 0, 0.25, 0] }), 'h'],
      [0.32, one(-0.6, 0.4, -1.4, -2.0, [-1.55, -0.1, -0.15], { spine: [0.3, -0.45, 0], chest: [0.1, -0.2, 0], head: [-0.1, 0.3, 0], $hips: [-0.11, 0.07], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $root: [0, 0.02, 0.2, 0.05, -0.3, 0] })],
      ...c.slice(1).map(([t, p, h]) => [t, { ...p, $root: p.$root ? [p.$root[0], p.$root[1], p.$root[2] + 0.08, p.$root[3], p.$root[4], p.$root[5]] : [0, 0, 0.08, 0, 0, 0] }, h]),
      [0.42 + 1.0 * 1.1, recover(one(-0.7, -0.35, -0.1, -0.75, [-0.3, -0.4, -1.1], { spine: [0.55, 0.35, 0], $root: [0, 0, 0.2, 0.06, 0.12, 0] }))],
      [0.42 + 1.25 * 1.1, guard],
    ] };
  }
  P.blockMid = one(-1.2, 0.2, -1.35, -3.0, [-1.45, 0.5, -1.25], { spine: [0.0, 0.2, 0], head: [-0.05, -0.15, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockL = one(-1.2, -0.45, -1.35, -3.05, [-1.45, 0.6, -1.25], { spine: [0.0, 0.4, 0], chest: [0, 0.15, 0], head: [-0.05, -0.35, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockR = one(-1.2, 0.75, -1.3, -3.05, [-1.3, 0.3, -1.3], { spine: [0.0, -0.4, 0], chest: [0, -0.15, 0], head: [-0.05, 0.35, 0], $hips: [-0.08, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockHigh = { ...one(-2.3, 0.3, -1.0, -4.0, [-2.2, 0.35, -1.0], { spine: [-0.12, 0.1, 0], head: [-0.15, 0, 0], $hips: [-0.09, -0.03], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] }) };
  P.blockHigh.wrR = [P.blockHigh.wrR[0], 0, 1.2];
  P.fling = one(-2.2, 0.8, -0.3, -2.8, [-1.6, -0.6, -0.4], { spine: [-0.4, 0.3, 0.15], chest: [-0.2, 0.1, 0], head: [-0.5, 0.3, 0.3] });
  P.cheer = one(-3.0, 0.2, -0.2, -3.3, [-0.4, 0.3, -0.6], { spine: [-0.15, 0, 0], head: [-0.3, 0, 0] });
  // at rest: upright, the blade point-down at the side, the shield held square before the body
  P.rest = one(-0.18, 0.12, -0.35, -0.02, [-0.75, 0.25, -1.45], { head: [0.04, 0, 0] });
  // (the bishop at rest holds his crozier upright at his side, its foot on the board)
  if (bishop) P.rest = one(-0.6, 0.22, -1.5, 0.0, [-0.4, 0.2, -1.2]);
  Object.assign(M, common(P, (sx, out, el, phi, x = {}, off = shieldUp) => one(sx, out, el, phi, off, x), 'one'));
  return { P, M };
}

// ---- the pawn: crouched at rest, up on his feet with a blade in each hand to fight. A sword
// fighter: flat cuts swung round the body at chest height (forehand, backhand, both blades
// scissoring in, a spinning cut), and the point driven in on a lunge. No hacking from above.
function dualBlades() {
  // at rest he stands tall: a sword in each hand, both points down on the board before his feet
  const rest = dual([-0.42, -0.12, -0.95, -0.12], [-0.42, -0.12, -0.95, -0.12], { head: [0.04, 0, 0] });
  const guard = dual([-0.95, 0.35, -1.15, -2.4], [-1.1, 0.3, -1.0, -2.25], { spine: [0.1, 0.1, 0], chest: [0.03, 0, 0], head: [-0.08, -0.08, 0], $hips: [-0.05, 0], $fL: [0, 0, 0.07], $fR: [0, 0, -0.06] });
  const recover = (p) => lerpPose(p, guard, 0.6);
  const P = { rest, guard };
  const M = {};
  const D = (l, r, x, rl = EDGE, rr = EDGE) => edge(edge(dual(l, r, x), 'L', rl), 'R', rr);
  // the off blade, held up out of the way of a cut across the body
  const offHigh = [-1.35, 0.55, -1.3, -2.75], offBack = [-0.35, 0.7, -0.9, -1.6];
  // forehand: the right blade wound back round the right side, then swung flat through the
  // target at chest height, the hips and shoulders unwinding behind it
  const foreKeys = (t0) => [
    [t0 + 0.24, cock(D(offHigh, [-1.45, 1.25, -0.3, -1.62], { spine: [0.1, -0.42, 0], chest: [0.04, -0.18, 0], head: [-0.1, 0.5, 0], $hips: [-0.1, -0.02], $fL: [0, 0, 0.06], $fR: [0, 0, -0.08], $root: [0, 0, -0.03, 0, -0.28, 0] }), 'R', 0.8), 'h'],
    [t0 + 0.42, D(offHigh, [-1.5, 0.85, -0.12, -1.6], { spine: [0.14, -0.25, 0], chest: [0.05, -0.12, 0], head: [-0.12, 0.25, 0], $hips: [-0.11, 0.03], $fL: [0, 0.07, 0.12], $fR: [0, 0, -0.08], $root: [0, 0.01, 0.05, 0, -0.2, 0], $aim: [0.7] })],
    [t0 + 0.5, D(offHigh, [-1.53, 0.0, -0.04, -1.57], { spine: [0.18, 0.12, 0], chest: [0.06, 0.08, 0], head: [-0.15, -0.12, 0], $hips: [-0.13, 0.06], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: [0, 0, 0.1, 0.03, 0.04, 0], $aim: [1] })],
    [t0 + 0.62, D(offBack, [-1.45, -0.95, -0.12, -1.57], { spine: [0.18, 0.45, 0], chest: [0.06, 0.2, 0], head: [-0.15, -0.45, 0], $hips: [-0.13, 0.06], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: [0, 0, 0.11, 0.03, 0.3, 0], $aim: [0.35] })],
  ];
  M.fore = { line: 'mid', from: 'R', hits: [0.5], keys: [[0, guard], ...foreKeys(0), [0.86, recover(D(offBack, [-1.45, -1.1, -0.12, -1.57], { spine: [0.18, 0.62, 0], $root: [0, 0, 0.08, 0, 0.35, 0] }))], [1.1, guard]] };
  // backhand: the right blade drawn across to the left hip, then whipped out flat to the right
  M.back = { line: 'mid', from: 'L', hits: [0.52], keys: [
    [0, guard],
    [0.26, D(offBack, [-1.15, -1.05, -1.0, -1.75], { spine: [0.12, 0.65, 0], chest: [0.05, 0.3, 0], head: [-0.12, -0.6, 0], $hips: [-0.1, -0.02], $fL: [0, 0, 0.05], $fR: [0, 0, -0.08], $root: [0, 0, -0.03, 0, 0.45, 0] }), 'h'],
    [0.44, D(offBack, [-1.45, -0.6, -0.35, -1.6], { spine: [0.15, 0.3, 0], chest: [0.05, 0.12, 0], head: [-0.12, -0.25, 0], $hips: [-0.11, 0.03], $fR: [0, 0.07, -0.02], $fL: [0, 0, 0.07], $root: [0, 0.01, 0.05, 0, 0.2, 0], $aim: [0.7] })],
    [0.52, D(offBack, [-1.53, 0.2, -0.04, -1.57], { spine: [0.18, -0.1, 0], chest: [0.06, -0.06, 0], head: [-0.15, 0.1, 0], $hips: [-0.13, 0.05], $fR: [0, 0, 0.06], $fL: [0, 0, 0.06], $root: [0, 0, 0.1, 0.03, -0.04, 0], $aim: [1] })],
    [0.64, D(offHigh, [-1.45, 1.45, -0.1, -1.57], { spine: [0.18, -0.6, 0], chest: [0.06, -0.3, 0], head: [-0.15, 0.55, 0], $hips: [-0.13, 0.05], $fR: [0, 0, 0.06], $fL: [0, 0, 0.06], $root: [0, 0, 0.11, 0.03, -0.42, 0], $aim: [0.35] })],
    [0.88, recover(D(offHigh, [-1.45, 1.45, -0.1, -1.57], { spine: [0.18, -0.6, 0], $root: [0, 0, 0.08, 0, -0.35, 0] }))],
    [1.12, guard],
  ] };
  // the scissors: both arms flung wide, then both blades swept in flat, crossing in the foe
  {
    const wide = D([-1.4, 1.45, -0.35, -1.8], [-1.4, 1.45, -0.35, -1.8], { spine: [-0.05, 0, 0], chest: [-0.08, 0, 0], head: [-0.15, 0, 0], $hips: [-0.06, -0.02], $fL: [0, 0, 0.05], $fR: [0, 0, -0.07], $root: [0, 0.01, -0.04, -0.03, 0, 0] });
    M.scissor = { line: 'mid', from: 'C', hits: [0.52], keys: [
      [0, guard],
      [0.28, wide, 'h'],
      [0.44, D([-1.55, 0.6, -0.1, -1.62], [-1.42, 0.6, -0.1, -1.55], { spine: [0.12, 0, 0], $hips: [-0.1, 0.04], $fL: [0, 0.07, 0.13], $fR: [0, 0, -0.08], $root: [0, 0.01, 0.06, 0.01, 0, 0], $aim: [0.7] })],
      [0.52, D([-1.58, -0.12, -0.03, -1.6], [-1.42, -0.12, -0.03, -1.52], { spine: [0.2, 0, 0], chest: [0.06, 0, 0], head: [-0.15, 0, 0], $hips: [-0.13, 0.07], $fL: [0, 0, 0.16], $fR: [0, 0, -0.08], $root: [0, 0, 0.11, 0.03, 0, 0], $aim: [1] })],
      [0.64, D([-1.6, -0.75, -0.08, -1.62], [-1.38, -0.7, -0.08, -1.5], { spine: [0.22, 0, 0], chest: [0.06, 0, 0], head: [-0.15, 0, 0], $hips: [-0.13, 0.07], $fL: [0, 0, 0.16], $fR: [0, 0, -0.08], $root: [0, 0, 0.12, 0.03, 0, 0], $aim: [0.4] })],
      [0.9, recover(D([-1.6, -0.75, -0.08, -1.62], [-1.38, -0.7, -0.08, -1.5], { spine: [0.22, 0, 0], $root: [0, 0, 0.08, 0, 0, 0] }))],
      [1.14, guard],
    ] };
  }
  // forehand with the right, then the left blade brought round flat the other way
  M.double = { line: 'mid', from: ['R', 'L'], hits: [0.5, 0.86], keys: [
    [0, guard], ...foreKeys(0).slice(0, 3),
    [0.62, D([-1.25, 1.35, -0.5, -1.85], [-1.45, -1.1, -0.12, -1.57], { spine: [0.18, 0.62, 0], chest: [0.06, 0.3, 0], head: [-0.15, -0.55, 0], $hips: [-0.13, 0.06], $fL: [0, 0, 0.15], $fR: [0, 0, -0.08], $root: [0, 0, 0.11, 0.03, 0.42, 0], $aim: [0.35] }), 'h'],
    [0.78, D([-1.5, 0.75, -0.12, -1.6], [-1.0, -0.6, -0.9, -1.9], { spine: [0.16, 0.3, 0], chest: [0.05, 0.12, 0], head: [-0.12, -0.25, 0], $hips: [-0.12, 0.08], $fR: [0, 0.07, 0.04], $fL: [0, 0, 0.15], $root: [0, 0.01, 0.14, 0.02, 0.2, 0], $aim: [0.7] })],
    [0.86, D([-1.53, 0.0, -0.04, -1.57], [-0.6, 0.6, -1.0, -1.7], { spine: [0.18, -0.12, 0], chest: [0.06, -0.08, 0], head: [-0.15, 0.12, 0], $hips: [-0.13, 0.08], $fR: [0, 0, 0.1], $fL: [0, 0, 0.15], $root: [0, 0, 0.17, 0.03, -0.04, 0], $aim: [1] })],
    [0.98, D([-1.45, -1.1, -0.12, -1.57], [-0.4, 0.7, -0.9, -1.6], { spine: [0.18, -0.6, 0], chest: [0.06, -0.3, 0], head: [-0.15, 0.55, 0], $hips: [-0.13, 0.08], $fR: [0, 0, 0.1], $fL: [0, 0, 0.15], $root: [0, 0, 0.18, 0.03, -0.42, 0], $aim: [0.35] })],
    [1.22, recover(D([-1.45, -1.1, -0.12, -1.57], [-0.4, 0.7, -0.9, -1.6], { spine: [0.18, -0.6, 0], $root: [0, 0, 0.12, 0, -0.35, 0] }))],
    [1.46, guard],
  ] };
  // the spinning cut: wound up, then round on the spot with both blades out flat, the left one
  // coming round through the foe at the end of the turn
  {
    const out = (ry, x = {}) => ({ ...D([-1.5, 1.3, -0.08, -1.57], [-1.5, 1.3, -0.08, -1.57], { spine: [0.12, 0, 0], head: [-0.1, 0, 0], $hips: [-0.09, 0.03], ...x }), $root: [0, 0.02, 0.08, 0, ry, 0] });
    M.spin = { line: 'mid', from: 'L', hits: [0.86], keys: [
      [0, guard],
      [0.24, { ...D([-1.3, -0.4, -0.6, -1.8], [-1.0, 0.9, -1.0, -1.8], { spine: [0.25, 0.45, 0], chest: [0.06, 0.2, 0], head: [-0.15, -0.3, 0], $hips: [-0.13, 0], $fL: [0, 0, 0.05], $fR: [0, 0, -0.07] }), $root: [0, 0, -0.03, 0, 0.5, 0] }, 'h'],
      [0.42, out(-0.55, { $fL: [0, 0.06, 0.05] })],
      [0.6, out(-PI * 0.8)],
      [0.76, out(-PI * 1.45, { $fR: [0, 0.06, 0] })],
      [0.86, { ...D([-1.53, 0.0, -0.04, -1.57], [-1.5, 1.4, -0.08, -1.57], { spine: [0.2, 0, 0], head: [-0.15, 0, 0], $hips: [-0.12, 0.07], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $aim: [1] }), $root: [0, 0, 0.14, 0.03, -PI * 2 + 0.08, 0] }],
      [0.98, { ...D([-1.45, -0.95, -0.1, -1.57], [-1.45, 1.4, -0.1, -1.57], { spine: [0.2, -0.35, 0], head: [-0.15, 0.25, 0], $hips: [-0.12, 0.07], $fL: [0, 0, 0.14], $fR: [0, 0, -0.08], $aim: [0.4] }), $root: [0, 0, 0.15, 0.03, -PI * 2 - 0.3, 0] }],
      [1.22, { ...recover(D([-1.45, -0.95, -0.1, -1.57], [-1.45, 1.4, -0.1, -1.57], { spine: [0.2, -0.35, 0] })), $root: [0, 0, 0.08, 0, -PI * 2, 0] }],
      [1.44, { ...guard, $root: [0, 0, 0, 0, -PI * 2, 0] }],
    ] };
  }
  // the lunge: the right blade drawn back to the hip, then the front foot steps out long and
  // the point is driven straight into the chest; the left arm swings back for balance
  M.lunge = { line: 'mid', from: 'C', hits: [0.54], keys: [
    [0, guard],
    [0.32, dual([-1.3, -0.05, -1.25, -2.6], [0.25, 0.3, -1.8, -1.6], { spine: [0.1, -0.4, 0], chest: [0.03, -0.15, 0], head: [-0.1, 0.4, 0], $hips: [-0.13, -0.04], $fL: [0, 0, 0.06], $fR: [0, 0, -0.08], $root: [0, 0, -0.04, -0.02, -0.3, 0] }), 'h'],
    [0.46, dual([-0.9, 0.3, -1.0, -2.0], [-0.95, 0.1, -0.85, -1.6], { spine: [0.25, -0.1, 0], head: [-0.15, 0.1, 0], $hips: [-0.13, 0.05], $fL: [0, 0.08, 0.15], $fR: [0, 0, -0.09], $root: [0, 0.01, 0.05, 0.02, -0.1, 0], $aim: [0.8] })],
    [0.54, dual([0.25, 0.55, -0.25, -0.2], [-1.56, -0.06, -0.02, -1.58], { spine: [0.38, 0.22, 0], chest: [0.1, 0.1, 0], head: [-0.3, -0.12, 0], $hips: [-0.17, 0.12], $fL: [0, 0, 0.23], $fR: [0, 0, -0.12], $root: [0, 0, 0.13, 0.04, 0.12, 0], $aim: [1] })],
    [0.68, dual([0.3, 0.6, -0.25, -0.2], [-1.54, -0.06, -0.02, -1.56], { spine: [0.4, 0.24, 0], chest: [0.1, 0.1, 0], head: [-0.3, -0.12, 0], $hips: [-0.17, 0.12], $fL: [0, 0, 0.23], $fR: [0, 0, -0.12], $root: [0, 0, 0.14, 0.04, 0.12, 0], $aim: [0.8] })],
    [0.88, recover(dual([-0.9, 0.3, -1.0, -2.0], [-1.0, 0.2, -0.8, -1.8], { spine: [0.3, 0.1, 0], $hips: [-0.13, 0.06], $fL: [0, 0.05, 0.12], $root: [0, 0, 0.07, 0.02, 0.05, 0] }))],
    [1.12, guard],
  ] };
  // both points driven in together off a long low lunge
  M.twin = { line: 'mid', from: 'C', hits: [0.58], keys: [
    [0, guard],
    [0.36, dual([0.3, 0.25, -1.8, -1.6], [0.3, 0.25, -1.8, -1.6], { spine: [0.1, 0, 0], head: [-0.1, 0, 0], $hips: [-0.15, -0.04], $fL: [0, 0, 0.05], $fR: [0, 0, -0.08], $root: [0, 0, -0.06, -0.04, 0, 0] }), 'h'],
    [0.5, dual([-0.9, 0.1, -0.9, -1.6], [-0.9, 0.1, -0.9, -1.6], { spine: [0.3, 0, 0], $hips: [-0.12, 0.05], $fL: [0, 0.08, 0.15], $fR: [0, 0, -0.09], $root: [0, 0.01, 0.06, 0.02, 0, 0], $aim: [0.8] })],
    [0.58, dual([-1.55, -0.12, -0.05, -1.6], [-1.55, -0.12, -0.05, -1.6], { spine: [0.42, 0, 0], chest: [0.12, 0, 0], head: [-0.3, 0, 0], $hips: [-0.17, 0.12], $fL: [0, 0, 0.23], $fR: [0, 0, -0.12], $root: [0, 0, 0.13, 0.05, 0, 0], $aim: [1] })],
    [0.7, dual([-1.5, -0.12, -0.05, -1.55], [-1.5, -0.12, -0.05, -1.55], { spine: [0.45, 0, 0], chest: [0.12, 0, 0], head: [-0.3, 0, 0], $hips: [-0.17, 0.12], $fL: [0, 0, 0.23], $fR: [0, 0, -0.12], $root: [0, 0, 0.14, 0.05, 0, 0], $aim: [0.8] })],
    [0.9, recover(dual([-1.2, 0.2, -0.6, -1.9], [-1.2, 0.2, -0.6, -1.9], { spine: [0.35, 0, 0], $hips: [-0.13, 0.06], $fL: [0, 0.05, 0.12], $root: [0, 0, 0.07, 0.03, 0, 0] }))],
    [1.12, guard],
  ] };
  // guards: blades crossed upright before him, one upright out to a side, or held flat overhead
  P.blockMid = dual([-1.5, -0.2, -1.4, -3.05], [-1.5, -0.25, -1.4, -3.05], { spine: [0.1, 0.1, 0], head: [-0.1, -0.1, 0], $hips: [-0.09, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockMid.wrL = [P.blockMid.wrL[0], 0, -0.6];
  P.blockMid.wrR = [P.blockMid.wrR[0], 0, 0.6];
  P.blockL = dual([-1.3, 0.5, -1.35, -3.05], [-1.0, 0.2, -1.2, -2.4], { spine: [0.1, 0.35, 0], chest: [0.03, 0.15, 0], head: [-0.1, -0.35, 0], $hips: [-0.1, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockR = dual([-1.0, 0.2, -1.2, -2.4], [-1.3, 0.5, -1.35, -3.05], { spine: [0.1, -0.35, 0], chest: [0.03, -0.15, 0], head: [-0.1, 0.35, 0], $hips: [-0.1, -0.02], $fL: [0, 0, 0.07], $fR: [0, 0, -0.08] });
  P.blockHigh = { ...P.blockMid, shL: [-2.3, 0, -0.1], shR: [-2.3, 0, 0.1], elL: [-0.9, 0, 0], elR: [-0.9, 0, 0], wrL: [-4.0 + 3.2, 0, -1.0], wrR: [-4.0 + 3.2, 0, 1.0], spine: [-0.1, 0, 0], head: [-0.2, 0, 0] };
  P.fling = dual([-2.0, 1.1, -0.3, -2.6], [-2.2, 1.0, -0.3, -2.8], { spine: [-0.4, 0.3, 0.15], chest: [-0.2, 0.1, 0], head: [-0.5, 0.3, 0.3] });
  P.cheer = { $hips: [0, 0], spine: [-0.15, 0, 0], head: [-0.3, 0, 0], shL: [-2.9, 0, 0.3], elL: [-0.2, 0, 0], shR: [-2.9, 0, -0.3], elR: [-0.2, 0, 0] };
  Object.assign(M, common(P, (sx, out, el, phi, x = {}, off = offHigh) => dual(off, [sx, out, el, phi], x), 'dual'));
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
function reactions(P, kind) {
  const g = P.guard;
  const R = (dz, rx, ry = 0, rz = 0, dx = 0, dy = 0) => [dx, dy, dz, rx, ry, rz];
  const M = {};
  const STAG = { parry: 'stagger', parryHigh: 'staggerHigh', parryL: 'staggerL', parryR: 'staggerR' };
  for (const [name, blk] of [['parry', P.blockMid], ['parryHigh', P.blockHigh], ['parryL', P.blockL], ['parryR', P.blockR]]) {
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
    M[STAG[name]] = { react: true, hits: [0.42], keys: [
      [0, g],
      [0.27, { ...blk, $aim: [1] }, 'h'],
      [0.42, { ...blk, $aim: [1] }],
      [0.56, { ...add(lerpPose(blk, P.fling, 0.45), { spine: [-0.2, 0.15, 0.08], head: [-0.25, 0.2, 0.1] }), $aim: [0.5], $root: R(-0.22, -0.2, 0.15, 0.06, 0, 0.04), $fR: [0, 0.08, -0.08], $fL: [0, 0, 0.04], $hips: [-0.03, -0.04] }],
      [0.8, { ...lerpPose(blk, g, 0.5), $root: R(-0.26, -0.05, 0.06), $fR: [0, 0, -0.12], $fL: [0, 0, 0.05], $hips: [-0.13, -0.03] }, 'h'],
      [1.08, { ...g, $root: R(-0.1, 0, 0, 0, 0, 0.03), $fL: [0, 0.05, 0.08] }],
      [1.4, g],
    ] };
  }
  // against a thrust: the blade beats the point aside, sweeping across from right to left
  {
    const a = P.blockR, b = P.blockL;
    M.deflect = { react: true, hits: [0.4], keys: [
      [0, g],
      [0.24, { ...a, $aim: [1] }, 'h'],
      [0.4, { ...lerpPose(a, b, 0.5), $aim: [1] }],
      [0.5, { ...add(b, { spine: [-0.1, 0.1, 0], head: [-0.1, 0, 0] }), $aim: [0.8], $root: R(-0.05, -0.05, 0.1) }],
      [0.68, { ...b, $aim: [0.4], $root: R(-0.02, -0.02, 0.05) }],
      [0.98, g],
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
  // wounded: a blow that got through. Doubled over, or driven down onto a knee, or the off
  // hand clutched to the wound; then back up on guard
  const oh = kind === 'oneL' ? 'R' : 'L', os = oh === 'L' ? 1 : -1;
  const jolt = { ...lerpPose(g, P.fling, 0.55), $root: R(-0.07, -0.12, 0.1, 0.04, 0, 0.03), $hips: [-0.05, -0.03] };
  const bent = { ...g, spine: [0.55, 0.2, 0.1], chest: [0.15, 0, 0], head: [0.1, -0.1, 0], $hips: [-0.12, -0.02], $root: R(-0.1, 0.05, 0.1) };
  M.hurt = { react: true, hits: [0], keys: [[0, g], [0.07, jolt], [0.3, bent, 'h'], [0.75, add(bent, { spine: [-0.1, 0, 0] })], [1.15, g]] };
  const knee = { ...g, $hips: [-0.34, -0.05], $fL: [0, 0, 0.14], $fR: [0, 0, -0.17], spine: [0.45, 0.1, 0.05], chest: [0.12, 0, 0], head: [-0.25, 0, 0], $root: R(-0.12, 0.08, 0.05, 0, -0.03, 0) };
  M.kneel = { react: true, hits: [0], keys: [[0, g], [0.07, jolt], [0.38, knee, 'h'], [1.05, add(knee, { spine: [-0.08, 0, 0], head: [-0.1, 0, 0] })], [1.5, lerpPose(knee, g, 0.6)], [1.85, g]] };
  const hold = { ...bent, ['sh' + oh]: [-1.0, 0, -0.55 * os], ['el' + oh]: [-2.1, 0, 0], ['wr' + oh]: [0.3, 0, 0] };
  M.clutch = { react: true, hits: [0], keys: [[0, g], [0.07, jolt], [0.32, hold, 'h'], [0.95, add(hold, { spine: [-0.15, 0, 0] })], [1.35, g]] };
  // run through: the stone seizes, arched and rigid
  const arch = { ...P.fling, spine: [-0.38, 0, 0.06], chest: [-0.16, 0, 0], head: [-0.6, 0.1, 0.1], $hips: [-0.04, 0], $root: R(-0.04, -0.06) };
  M.seize = { react: true, hits: [0], keys: [[0, g], [0.08, arch], [0.2, add(arch, { spine: [0.04, 0, -0.03] })], [0.4, arch], [2.5, arch]] };
  // what's left standing gives way: the knees buckle and it goes over
  M.collapse = { react: true, hits: [0], keys: [
    [0, { ...g, $hips: [-0.06, 0] }],
    [0.32, { ...g, $hips: [-0.12, 0.02], spine: [0.3, 0, 0.1], head: [0.2, 0, 0], $root: R(0, 0.04, 0, 0, 0, 0.03) }],
    [0.75, { ...g, $hips: [-0.32, 0.06], spine: [0.5, 0, 0.2], $fL: [0, 0, 0.1], $fR: [0, 0, -0.12], $root: R(0.03, 0.25, 0, 0.12, 0, -0.01) }],
    [1.3, { ...g, $hips: [-0.42, 0.1], spine: [0.6, 0, 0.3], $fL: [0, 0, 0.12], $fR: [0, 0, -0.14], $root: R(0.06, 0.7, 0, 0.3, 0, -0.04) }],
  ] };
  // the death blow lands: the body jolts back, arms flung, head snapped round
  M.reel = { react: true, hits: [0], keys: [
    [0, g],
    [0.06, { ...lerpPose(g, P.fling, 0.7), $root: R(-0.04, -0.09, 0.1, 0.05, 0, 0.02), $hips: [-0.04, -0.03] }],
    [0.18, { ...P.fling, $root: R(-0.07, -0.14, 0.16, 0.08, 0, 0.03), $hips: [-0.02, -0.05], $fL: [0, 0.05, 0.03] }],
    [0.7, { ...P.fling, $root: R(-0.08, -0.16, 0.18, 0.09, 0, 0.03), $hips: [-0.02, -0.05] }],
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
HORSE_TRACK.back = [[0, HORSE.rest], [0.42, HORSE.pivotL, 'h'], [0.6, HORSE.pivotR], [0.76, HORSE.pivotR], [1.24, HORSE.rest]];
HORSE_TRACK.parryHigh = HORSE_TRACK.parryL = HORSE_TRACK.parryR = HORSE_TRACK.deflect = HORSE_TRACK.parry;
HORSE_TRACK.staggerL = HORSE_TRACK.staggerR = HORSE_TRACK.stagger;
HORSE_TRACK.staggerHigh = HORSE_TRACK.stagger;
HORSE_TRACK.hit = HORSE_TRACK.parry;
HORSE_TRACK.hurt = HORSE_TRACK.kneel = HORSE_TRACK.clutch = HORSE_TRACK.stagger;
HORSE_TRACK.seize = HORSE_TRACK.reel;
HORSE_TRACK.collapse = [[0, HORSE.rest], [0.32, HORSE.hit], [0.8, { horse: [0.3, 0, 0.25], flL: [0.8, 0, 0], fkL: [-1.6, 0, 0], flR: [0.6, 0, 0], fkR: [-1.4, 0, 0], hneck: [0.5, 0.2, 0], hhead: [-0.2, 0, 0], tail: [-0.3, 0, 0] }], [1.3, { horse: [0.45, 0, 0.5], flL: [1.1, 0, 0], fkL: [-2.0, 0, 0], flR: [0.9, 0, 0], fkR: [-1.9, 0, 0], hneck: [0.7, 0.3, 0], hhead: [-0.3, 0, 0], tail: [-0.4, 0, 0] }]];

// the horse in the new moves: tossing its head as it wakes, surging into a charge, rearing high
// and trampling, going down on its side
{
  const H = HORSE;
  const down1 = { horse: [0.3, 0, 0.25], flL: [0.8, 0, 0], fkL: [-1.6, 0, 0], flR: [0.6, 0, 0], fkR: [-1.4, 0, 0], hneck: [0.5, 0.2, 0], hhead: [-0.2, 0, 0], tail: [-0.3, 0, 0] };
  const down2 = { horse: [0.2, 0, 0.1], flL: [0.9, 0, 0], fkL: [-1.7, 0, 0], flR: [0.5, 0, 0], fkR: [-1.2, 0, 0], hhL: [0.5, 0, 0], hhR: [0.3, 0, 0], hkL: [-0.6, 0, 0], hkR: [-0.4, 0, 0], hneck: [-0.3, 0.3, 0], hhead: [0.3, 0, 0], tail: [0.2, 0, 0] };
  Object.assign(HORSE_TRACK, {
    wake: [[0, H.rest], [0.3, { hneck: [-0.3, 0.25, 0], hhead: [0.25, 0, 0], flL: [-0.5, 0, 0], fkL: [0.9, 0, 0], tail: [0.3, 0, 0.3] }], [0.6, { flL: [0.3, 0, 0], hneck: [0.1, -0.1, 0] }], [1.0, H.rest]],
    settle: [[0, H.rest], [0.35, { hneck: [0.15, 0, 0], hhead: [-0.1, 0, 0] }], [0.9, H.rest]],
    feint: [[0, H.rest], [0.22, H.pivotR, 'h'], [0.36, H.pivotL], [0.66, H.rest]],
    bind: [[0, H.rest], [0.3, { horse: [-0.12, 0, 0], flL: [-0.4, 0, 0], fkL: [0.6, 0, 0] }], [1.25, { horse: [-0.1, 0, 0] }]],
    shove: [[0, H.rest], [0.14, H.stamp], [0.75, H.rest]],
    charge: [[0, H.rest], [0.26, H.rear, 'h'], [0.48, H.stamp], [0.6, H.stamp], [1.12, H.rest]],
    disarm: [[0, H.rest], [0.22, H.pivotR], [0.4, H.pivotL], [1.1, H.rest]],
    disarmed: [[0, H.rest], [0.08, H.hit], [0.45, H.shy], [1.05, H.rest]],
    recoil: [[0, H.shy], [0.5, H.rest]],
    down: [[0, H.rest], [0.09, H.hit], [0.36, down1], [0.8, down2]],
    downed: [[0, down2], [0.9, { ...down2, hneck: [-0.45, 0.4, 0] }], [1.8, down2]],
    rise: [[0, down2], [0.6, down1], [1.4, { ...down1, hneck: [0.2, 0.1, 0] }]],
    castFwd: [[0, H.rest], [0.5, H.rear, 'h'], [0.62, H.stamp], [1.35, H.rest]],
    castUp: [[0, H.rest], [0.5, H.rear, 'h'], [1.5, H.rear], [1.85, H.rest]],
    stomp: [[0, H.rest], [0.34, H.high, 'h'], [0.48, H.stamp], [1.3, H.rest]],
    whip: [[0, H.rest], [0.3, H.pivotR, 'h'], [0.48, H.pivotL], [1.05, H.rest]],
    ward: [[0, H.rest], [0.24, H.shy, 'h'], [1.36, H.hit], [1.75, H.rest]],
    bound: [[0, H.shy], [0.45, H.hit], [0.9, H.shy]],
    flail: [[0, H.hit], [0.4, H.rear], [0.75, H.hit]],
    trample: [[0, H.rest], [0.42, H.high, 'h'], [0.62, H.stamp], [0.8, H.rear], [0.98, H.stamp], [1.5, H.rest]],
    execute: [[0, H.rest], [0.36, H.high, 'h'], [0.54, H.stamp], [1.5, H.rest]],
  });
}

// The rook is a castle tower with a soldier in it: it has no legs. It walks by rocking from one
// edge of its footing to the other; it rams with its whole mass, hops up and comes down on a
// foe, or topples onto him like a felled tree and heaves itself upright again.
function rookMoves(P) {
  const g = P.guard;
  const E = 0.24; // half its footing
  const R = (dx, dy, dz, rx = 0, ry = 0, rz = 0) => [dx, dy, dz, rx, ry, rz];
  const M = {};
  const w = (rz, dz = 0) => ({ ...g, $root: tipZ(rz, rz > 0 ? -E : E, 0, 0) });
  M.walk = { loop: true, keys: [[0, w(0.09)], [0.14, { ...g, $root: R(0, 0.025, 0, 0.04) }], [0.28, w(-0.09)], [0.42, { ...g, $root: R(0, 0.025, 0, 0.04) }], [0.56, w(0.09)]] };
  M.run = M.walk;
  M.shuffle = { loop: true, keys: [[0, w(0.06)], [0.25, w(-0.06)], [0.5, w(0.06)]] };
  const braced = one(-1.3, 0.2, -1.2, -2.6, [-1.3, 0.1, -1.0], { spine: [-0.1, 0, 0] });
  M.ram = { line: 'mid', body: true, heavy: true, hits: [0.56], keys: [
    [0, g],
    [0.36, { ...braced, $root: tipX(-0.17, -E, -0.06) }, 'h'],
    [0.56, { ...braced, spine: [0.2, 0, 0], $root: tipX(0.2, E, 0.34, 0.02) }],
    [0.7, { ...braced, spine: [0.15, 0, 0], $root: tipX(0.12, E, 0.3) }],
    [0.95, { ...g, $root: tipX(0.04, E, 0.12) }],
    [1.2, g],
  ] };
  M.charge = M.ram;
  // up off the board in a heavy hop, and down onto him (main.js carries it across)
  M.hop = { line: 'high', body: true, heavy: true, hits: [0.62], keys: [
    [0, g],
    [0.24, { ...braced, $root: tipX(-0.1, -E, 0, -0.01) }, 'h'],
    [0.45, { ...P.cheer, $root: R(0, 0, 0, 0.12) }],
    [0.62, { ...braced, $root: tipX(0.05, E) }],
    [0.72, { ...braced, $root: R(0, -0.01, 0, 0.02) }],
    [1.25, g],
  ] };
  // the tower topples onto the foe like a felled tree, lies a beat, then heaves itself back up
  M.topple = { line: 'high', body: true, heavy: true, hits: [0.86], keys: [
    [0, g],
    [0.42, { ...P.cheer, $root: tipX(-0.2, -E) }, 'h'],
    [0.86, { ...braced, spine: [0.3, 0, 0], $root: tipX(1.32, E) }],
    [0.98, { ...braced, spine: [0.35, 0, 0], $root: tipX(1.22, E) }],
    [1.1, { ...braced, spine: [0.3, 0, 0], $root: tipX(1.3, E) }],
    [1.7, { ...braced, $root: tipX(1.28, E) }],
    [2.3, { ...g, $root: tipX(0.12, E) }],
    [2.45, { ...g, $root: tipX(-0.05, -E) }],
    [2.7, g],
  ] };
  // knocked flat onto its back, struggling, heaving itself half up
  const lie = { ...lerpPose(g, P.fling, 0.6), $root: tipX(-1.42, -E, -0.05) };
  M.down = { react: true, hits: [0], keys: [[0, g], [0.1, { ...lerpPose(g, P.fling, 0.7), $root: tipX(-0.2, -E) }], [0.5, { ...lie, $root: tipX(-1.5, -E, -0.05) }], [0.62, lie], [0.75, lie]] };
  M.downed = { loop: true, keys: [[0, lie], [0.8, { ...lie, spine: [0.2, 0.2, 0], $root: tipX(-1.38, -E, -0.05) }], [1.6, lie]] };
  M.crawl = M.downed;
  M.rise = { react: true, hits: [0], keys: [[0, lie], [0.7, { ...lerpPose(lie, g, 0.5), $root: tipX(-0.75, -E, -0.04) }], [0.95, { ...lerpPose(lie, g, 0.5), $root: tipX(-0.85, -E, -0.04) }, 'h'], [1.4, { ...lerpPose(lie, g, 0.5), $root: tipX(-0.8, -E, -0.04) }]] };
  M.stomp = { line: 'low', cast: true, hits: [0.5], keys: [[0, g], [0.32, { ...P.cheer, $root: R(0, 0.18, 0, -0.05) }, 'h'], [0.5, { ...braced, $root: R(0, 0, 0, 0.03) }], [0.6, { ...braced, $root: R(0, 0.012, 0, 0.0) }], [1.2, g]] };
  return M;
}

// The knight's horse fights too: it rears high and brings its forefeet down on the foe.
function knightMoves(P) {
  const g = P.guard;
  const R = (dx, dy, dz, rx = 0, ry = 0, rz = 0) => [dx, dy, dz, rx, ry, rz];
  const M = {};
  const up = one(-2.6, 0.3, -0.9, -3.6, [-1.1, 0.4, -1.3], { spine: [-0.15, 0, 0], head: [-0.1, 0, 0] });
  const down = one(-1.2, -0.1, -0.2, -1.0, [-0.6, 0.2, -1.2], { spine: [0.3, 0.1, 0] });
  M.trample = { line: 'low', body: true, heavy: true, hits: [0.62, 0.98], keys: [
    [0, g], [0.42, { ...up, $root: R(0, 0.02, -0.04) }, 'h'], [0.62, { ...down, $root: R(0, 0, 0.16) }], [0.8, { ...up, $root: R(0, 0.01, 0.14) }], [0.98, { ...down, $root: R(0, 0, 0.24) }], [1.5, g],
  ] };
  M.execute = { ...M.trample, hits: [0.98] };
  M.charge = { line: 'mid', body: true, heavy: true, hits: [0.48], keys: [[0, g], [0.26, { ...up, $root: R(0, 0.01, -0.06) }, 'h'], [0.48, { ...down, $root: R(0, 0, 0.36) }], [0.6, { ...down, $root: R(0, 0, 0.38) }], [1.12, g]] };
  // over on its side, horse and rider
  const lie = { ...lerpPose(g, P.fling, 0.5), $root: tipZ(1.3, -0.22) };
  M.down = { react: true, hits: [0], keys: [[0, g], [0.09, { ...lerpPose(g, P.fling, 0.6), $root: R(0, 0, -0.06, -0.12) }], [0.5, { ...lie, $root: tipZ(1.38, -0.22) }], [0.62, lie], [0.8, lie]] };
  M.downed = { loop: true, keys: [[0, lie], [0.9, { ...lie, spine: [0.15, 0.2, 0] }], [1.8, lie]] };
  M.crawl = M.downed;
  M.rise = { react: true, hits: [0], keys: [[0, lie], [0.6, { ...lie, $root: tipZ(0.8, -0.22) }], [1.4, { ...lie, $root: tipZ(0.85, -0.22) }]] };
  return M;
}

// what each kind of fighter does: the blows of an exchange and the finishing moves. Swords
// fight with flat cuts round the body (forehand and backhand) and the point; the occasional
// diagonal; only the knight's mace (and the rook, after a shield-bash) still comes down from above.
const ARSENAL = {
  two: { blows: ['sweep', 'back', 'thrust', 'slash'], finishers: ['sweep', 'spin', 'thrust', 'back'], specials: ['pommel', 'charge', 'disarm'] },
  oneR: { blows: ['sweep', 'back', 'thrust', 'slash'], finishers: ['sweep', 'back', 'thrust', 'bash'], specials: ['shieldbash', 'ram', 'disarm'] },
  oneL: { blows: ['sweep', 'back', 'thrust', 'slash'], finishers: ['sweep', 'thrust', 'back'], specials: ['pommel', 'charge', 'disarm'] },
  mounted: { blows: ['sweep', 'back', 'thrust', 'cleave'], finishers: ['bash', 'cleave', 'sweep', 'thrust'], specials: ['shieldbash', 'charge', 'trample'] },
  dual: { blows: ['fore', 'back', 'scissor', 'lunge', 'twin', 'double'], finishers: ['fore', 'spin', 'lunge', 'scissor', 'back', 'twin'], specials: ['pommel', 'charge', 'disarm'] },
};
// what kind of blow each move is: a flat cut, a thrust, a blow with the body, or anything else
const CAT = { cleave: 'cut', sweep: 'cut', back: 'cut', fore: 'cut', scissor: 'cut', double: 'cut', spin: 'cut', thrust: 'thrust', lunge: 'thrust', twin: 'thrust', charge: 'body', ram: 'body', shieldbash: 'body', trample: 'body', hop: 'body', topple: 'body', pommel: 'body' };

function lib(kind) {
  if (kind === 'two') return twoHanded();
  if (kind === 'dual') return dualBlades();
  const L = oneHanded(kind === 'oneL');
  if (kind !== 'oneL') return L;
  const P = {}, M = {};
  for (const [k, v] of Object.entries(L.P)) P[k] = mirror(v);
  const flip = (f) => (Array.isArray(f) ? f.map(flip) : f === 'L' ? 'R' : f === 'R' ? 'L' : f);
  for (const [k, v] of Object.entries(L.M)) M[k] = { ...v, from: flip(v.from), keys: v.keys.map(([t, p, h]) => [t, mirror(p), h]) };
  // (mirrored, the guard on the right is on the left)
  [P.blockL, P.blockR] = [P.blockR, P.blockL];
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
    ...reactions(P, kind),
    shuffle: { loop: true, keys: [[0, add(g, { $fL: [0, 0.06, 0.03] })], [0.25, add(g, { $fR: [0, 0.06, -0.03] })], [0.5, add(g, { $fL: [0, 0.06, 0.03] })]] },
    ...M,
  };
  if (kind === 'oneR') Object.assign(C, rookMoves(P));
  if (kind === 'mounted') Object.assign(C, knightMoves(P));
  // a shield punched into the foe (the first half of the bash)
  if (C.bash) C.shieldbash = { line: 'mid', body: true, hits: [0.32], keys: [...C.bash.keys.slice(0, 3), [0.62, lerpPose(C.bash.keys[2][1], g, 0.6)], [0.85, g]] };
  if (kind === 'mounted') HORSE_TRACK.shieldbash = [[0, HORSE.rest], [0.16, HORSE.rear], [0.32, HORSE.stamp], [0.85, HORSE.rest]];
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
  const model = t.model.clone(true); // the statue: glides, hops and tilts on the board
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
  // the horse's tail, a strut that reaches down to the board: where its end is
  let tailTip = null;
  if (J.tail) {
    tailTip = new THREE.Object3D();
    tailTip.position.set(0, -0.4, 0);
    J.tail.add(tailTip);
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
  const fig = {
    group, type, isWhite, code, spec: {}, model, materials: [mat], stone: false, statue: true,
    parts: { inner }, current: null, J, info, kind, body, hand, butt, shieldAt, tailTip,
    robe: type === QUEEN || type === BISHOP,
    height: 1, radius: 0.26,
    move: { name: 'statue', t: 0, d: 3.2, loop: true }, from: null, alive: false, blendT: 1, fade: 0.18, aim: null, seed: Math.random() * 10,
  };
  fig.mixer = { update: (dt) => animate(fig, dt) };
  // its height (where blows land, how high rubble piles against it): standing on guard, the
  // figure itself without the weapon held up over it
  fig.move = { name: 'guard', t: 0, d: 1.6, loop: true };
  animate(fig, 0);
  fig.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p && p !== model; p = p.parent) if (p.name === 'weapon' || p.name === 'weapon2') return;
    box.expandByObject(o);
  });
  fig.height = box.max.y;
  fig.move = { name: 'statue', t: 0, d: 3.2, loop: true };
  fig.from = null;
  animate(fig, 0);
  return fig;
}

const HOLD = new Set(['death', 'reel', 'seize', 'collapse', 'down', 'rise']); // moves that end held, never back to the rest pose
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
  fig.from = fig.basePose || fig.pose ? { ...(fig.basePose || fig.pose) } : null;
  if (fig.from?.$root) {
    const r = fig.from.$root.slice();
    r[4] = Math.atan2(Math.sin(r[4] || 0), Math.cos(r[4] || 0));
    fig.from.$root = r;
  }
  fig.blendT = 0;
  fig.fade = Math.max(0.04, fade);
  fig.aim = null;
  fig.still = false;
  fig.move = { name: k, t: 0, d, loop: loop || !!c.loop, at: c.at };
  return d;
}
export const strikeAt = (name) => clipSet('two')[name.replace(/^S_/, '')]?.at;

/** A move's timing for this figure: duration (s), when its blows land (0..1), and its nature. */
// how each killing blow breaks the victim: cut through along the blade's path, run through, or
// split top to bottom
const CUT = { slash: 'slice', sweep: 'slice', back: 'slice', fore: 'slice', scissor: 'slice', spin: 'slice', double: 'slice', thrust: 'stab', lunge: 'stab', twin: 'stab', cleave: 'cleave', bash: 'cleave', execute: 'crumble', trample: 'crush', topple: 'crush', hop: 'crush', ram: 'burst', charge: 'burst' };
export function moveInfo(fig, name) {
  const k = key(fig, name);
  const c = clipSet(fig.kind)[k];
  // the side each blow comes in from (the striker's own right or left, or straight in, 'C')
  const from = c.hits.map((_, i) => (Array.isArray(c.from) ? c.from[i] || c.from[c.from.length - 1] : c.from || 'C'));
  return { d: c.d, at: c.at, hits: c.hits.map((h) => h / c.d), line: c.line || 'mid', heavy: !!c.heavy, cast: !!c.cast, plant: c.plant, grab: c.grab, cut: CUT[k] || 'smash', cat: CAT[k] || 'other', from, body: !!c.body, pommel: !!c.pommel, name: k };
}

/** The guard that meets a blow coming in from the striker's [from] side (or a thrust). */
export function parryFor(info, i = info.hits.length - 1, heavy = false) {
  if (info.line === 'high') return heavy ? 'staggerHigh' : 'parryHigh';
  const f = info.from[i];
  // the striker's right is the defender's left
  const side = f === 'R' ? 'L' : f === 'L' ? 'R' : '';
  if (heavy) return 'stagger' + side;
  if (!side && info.cat === 'thrust') return 'deflect';
  return 'parry' + side;
}

/** The blows this figure throws in an exchange, and its finishing moves. */
export function arsenal(fig) {
  const A = ARSENAL[fig.kind];
  const blows = [...A.blows], finishers = [...A.finishers], specials = [...(A.specials || [])];
  // the king's greatsword comes down from on high too: the heaviest blows on the board
  if (fig.type === KING) {
    blows.push('cleave');
    finishers.push('cleave', 'cleave');
  }
  return { blows, finishers, specials };
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

// the poses of a statue at rest: nothing moves, not a breath
const STILL = new Set(['statue', 'idle']);
const LIVELY = new Set(['guard', 'ready', 'shuffle', 'bindHold']);
function animate(fig, dt) {
  let m = fig.move;
  // a statue that has gone still stays exactly as it is, frame after frame
  if (fig.still) {
    m.t += dt;
    return fig.mixer;
  }
  m.t += dt;
  if (!m.loop && m.t >= m.d && !HOLD.has(m.name)) {
    playMove(fig, fig.alive ? 'ready' : 'statue', { fade: fig.alive ? 0.3 : 0.4 });
    m = fig.move;
  }
  const C = clipSet(fig.kind);
  const c = C[m.name];
  const ct = (m.loop ? m.t % m.d : Math.min(m.t, m.d)) * (c.d / m.d);
  let pose = movePose(fig, c, ct, !m.loop);
  // life, only while it is alive (selected, moving, fighting): breathing, the weight shifting,
  // the weapon never quite still. Quieter in the heat of a move.
  const T = m.t + fig.seed;
  const lv = fig.lively = Math.max(0, Math.min(1, (fig.lively || 0) + (fig.alive && !STILL.has(m.name) ? dt : -dt) * 2.5));
  if (lv > 0) {
    const calm = (LIVELY.has(m.name) ? 1 : 0.3) * lv;
    const live = { spine: [Math.sin(T * 1.7) * 0.02 * calm, Math.sin(T * 0.4) * 0.05 * calm, 0], head: [Math.sin(T * 0.6) * 0.03 * calm, Math.sin(T * 0.45) * 0.12 * calm, 0] };
    if (m.name === 'guard' || m.name === 'ready') {
      // on guard: light on the feet, weight shifting, the weapon never still
      live.spine = [Math.sin(T * 2.1) * 0.03 * lv, Math.sin(T * 1.3) * 0.08 * lv, 0];
      live.$hips = [Math.sin(T * 4.2) * 0.008 * lv, 0];
      live.$root = [0, 0, 0, 0, Math.sin(T * 0.9) * 0.05 * lv, 0];
    }
    pose = add(pose, live);
  }
  // the head turned to look (at the board, at the foe) while alive
  const want = fig.alive ? fig.look || 0 : 0;
  fig.lookNow = (fig.lookNow || 0) + (want - (fig.lookNow || 0)) * Math.min(1, dt * 4);
  if (Math.abs(fig.lookNow) < 1e-4 && !want) fig.lookNow = 0;
  if (fig.lookNow) pose = add(pose, { head: [0, fig.lookNow * 0.65, 0], chest: [0, fig.lookNow * 0.2, 0], neck: [0, fig.lookNow * 0.15, 0] });
  if (fig.type === KNIGHT && !c.horse && fig.alive) {
    let hp = {};
    if (m.name === 'walk' || m.name === 'run' || m.name === 'guard' || m.name === 'shuffle' || m.name === 'ready') {
      const g = T * (m.name === 'guard' || m.name === 'ready' ? 4 : 9), a = m.name === 'guard' || m.name === 'ready' ? 0.5 : 1;
      hp = { horse: [-0.12 * a * Math.sin(g), 0, 0], flL: [0.5 * a * Math.sin(g), 0, 0], flR: [0.5 * a * Math.sin(g + 1.3), 0, 0], fkL: [-0.6 * a * Math.max(0, Math.sin(g + 0.8)), 0, 0], fkR: [-0.6 * a * Math.max(0, Math.sin(g + 2.1)), 0, 0], hneck: [0.15 * Math.sin(g + 0.5), 0, 0], tail: [0.2 * Math.sin(g), 0, 0.3 * Math.sin(g * 0.5)] };
    }
    pose = add(pose, hp);
  }
  if (fig.aim && pose.$aim) pose = add(pose, scaleP(fig.aim, pose.$aim[0]));
  // cross-fade from the previous move's pose
  fig.blendT = Math.min(1, fig.blendT + dt / (fig.fade || 0.18));
  if (fig.from && fig.blendT < 1) pose = blend(fig.from, pose, smooth(fig.blendT));
  // how the arms are moving (for a blade rebounding off a parry)
  if (dt > 0) {
    fig.armVel = {};
    for (const n of ARMS) if (pose[n] && fig.basePose?.[n]) fig.armVel[n] = pose[n].map((x, i) => (x - fig.basePose[n][i]) / dt);
  }
  fig.basePose = pose;
  pose = springs(fig, pose, dt);
  fig.pose = pose;
  applyPose(fig, pose);
  if (m.name === 'death') fall(fig, m.t, m.d);
  else fig.body.rotation.set(0, 0, 0);
  // settled into the statue's pose: from now on nothing moves until it wakes
  if (STILL.has(m.name) && fig.blendT >= 1 && !fig.springs && !fig.lookNow && !fig.lively) fig.still = true;
  return fig.mixer;
}

// ------------------------------------------------------------------ being hit
// Blows carry momentum: a struck statue is knocked (it skids and rocks on its feet, the body
// whips back, the head snaps) by damped springs layered over whatever move it is playing, and
// a blade that meets another rebounds off it. They settle back on their own.
const ARMS = ['shL', 'elL', 'wrL', 'shR', 'elR', 'wrR'];
function springs(fig, pose, dt) {
  const S = fig.springs;
  if (!S) return pose;
  const off = {};
  let live = false;
  const h = Math.min(dt, 1 / 30) / 2;
  for (const [n, s] of Object.entries(S)) {
    const K = n === '$root' ? 70 : 170, C = n === '$root' ? 11 : 12;
    let e = 0;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < s.x.length; i++) {
        s.v[i] += (-K * s.x[i] - C * s.v[i]) * h;
        s.x[i] += s.v[i] * h;
      }
    }
    for (let i = 0; i < s.x.length; i++) e += Math.abs(s.x[i]) + Math.abs(s.v[i]) * 0.05;
    if (e < 1e-4) delete S[n];
    else {
      off[n] = s.x.slice();
      live = true;
    }
  }
  if (!live) fig.springs = null;
  return add(pose, off);
}
function kick(fig, n, v) {
  fig.still = false;
  fig.springs = fig.springs || {};
  const s = fig.springs[n] || (fig.springs[n] = { x: v.map(() => 0), v: v.map(() => 0) });
  for (let i = 0; i < v.length; i++) s.v[i] += v[i];
}
/** A blow's momentum knocks the statue: [dir] (world) the way it's pushed, [amount] ~0.3..1.5. */
export function knock(fig, dir, amount = 1) {
  const ry = fig.group.rotation.y, c = Math.cos(ry), s = Math.sin(ry);
  const lx = dir.x * c - dir.z * s, lz = dir.x * s + dir.z * c, a = amount;
  kick(fig, '$root', [lx * 0.9 * a, 0.12 * a, lz * 0.9 * a, lz * 2.4 * a, (Math.random() - 0.5) * 1.5 * a, -lx * 2.4 * a]);
  kick(fig, 'spine', [lz * 4 * a, lx * 2 * a, -lx * 3 * a]);
  kick(fig, 'chest', [lz * 3 * a, 0, -lx * 2 * a]);
  kick(fig, 'head', [lz * 6 * a, (Math.random() - 0.5) * 4 * a, -lx * 5 * a]);
  if (fig.J.horse) kick(fig, 'horse', [lz * 2.5 * a, 0, -lx * 1.5 * a]);
}
/** The weapon arm bounces back the way it came (a blade meeting a blade). */
export function rebound(fig, amount = 0.5) {
  for (const n of ARMS) {
    const v = fig.armVel?.[n];
    if (!v) continue;
    kick(fig, n, v.map((x) => Math.max(-14, Math.min(14, -x * amount))));
  }
}

function applyPose(fig, pose, legs = true) {
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
  // the pelvis moves; legs follow by IK, feet stay on the board (or step about on it)
  if (J.hips && fig.info.legs.length) {
    const hp = pose.$hips || [0, 0];
    // (a gown or an alb hangs from the hips to the board: the hips don't sink, or the hem would
    // sink into the board; the robed lean and twist from the waist instead)
    J.hips.position.set(0, 0.5 * H + (fig.robe ? 0 : hp[0]) * H, hp[1] * H);
    if (legs) solveLegs(fig, pose);
  }
  // the horse's tail rests on the board, it never goes through it
  if (fig.tailTip && legs) {
    // (the marker is on the tail's axis; its strands spread a little lower)
    for (let i = 0; i < 3; i++) {
      fig.group.updateMatrixWorld(true);
      const y = fig.group.worldToLocal(fig.tailTip.getWorldPosition(_a)).y;
      if (y >= 0.062) break;
      J.tail.rotation.x += Math.min(0.8, (0.066 - y) / 0.4);
    }
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

// struck down: the figure topples over backwards, stiff as stone
function fall(fig, t, d) {
  const k = Math.min(1, t / d);
  const a = k * k * 1.45;
  fig.body.rotation.set(-a, 0, 0.2 * k);
}

// ------------------------------------------------------------------ aiming
// Where the weapon is (world): its striking end, its far end, the hand, and the shield's face.
function readWeapon(fig, chain = false) {
  if (chain) {
    // (only the joints from the board up to the weapon and the shield: a probe is done often)
    fig.hand.updateWorldMatrix(true, false);
    fig.butt.updateWorldMatrix(false, false);
    fig.shieldAt?.updateWorldMatrix(true, false);
  } else fig.group.updateMatrixWorld(true);
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
  const r = probeRaw(fig, name, k, aim);
  restorePose(fig);
  return r;
}
// (the legs don't move the weapon: no IK for a probe; the pose is put back once, after)
function probeRaw(fig, name, k, aim) {
  const c = clipSet(fig.kind)[key(fig, name)];
  let pose = movePose(fig, c, k * c.d, true);
  if (aim && pose.$aim) pose = add(pose, scaleP(aim, pose.$aim[0]));
  applyPose(fig, pose, false);
  return readWeapon(fig, true);
}
function restorePose(fig) {
  if (fig.pose) applyPose(fig, fig.pose);
  fig.group.updateMatrixWorld(true);
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
export function aimAt(fig, name, k, target, mode = 'strike', { from = null, step: step0 = 0.3, iters = 40 } = {}) {
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
    const r = probeRaw(fig, name, k, make(x));
    let e;
    if (mode === 'strike') e = r.tip.distanceTo(target);
    else if (shield) e = Math.max(0, r.shield.distanceTo(target) - 0.03);
    else if (fig.butt && fig.kind !== 'dual' && r.butt.distanceTo(r.grip) > 0.15) e = segDist(target, r.butt, r.tip, 0.12, 0.92); // a staff: anywhere along it
    else e = segDist(target, r.grip, r.tip, 0.3, 0.9);
    return e + 0.02 * (Math.abs(x[0]) + Math.abs(x[1]) + Math.abs(x[2]) + Math.abs(x[3]) + Math.abs(x[4] || 0));
  };
  const lim = [1.1, 0.9, 0.9, 0.6, 0.35];
  const x = from ? from.slice() : [0, 0, 0, 0, 0];
  const n = mode === 'strike' ? 5 : 4;
  let best = cost(x), step = step0;
  for (let it = 0; it < iters && step > 0.012; it++) {
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
  Object.defineProperty(aim, '$x', { value: x.slice(), enumerable: false });
  const r = probeRaw(fig, name, k, aim);
  restorePose(fig);
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

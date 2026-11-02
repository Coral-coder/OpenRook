// The Wizard Chess statues, built from scratch with real skeletons.
//
// Every piece stands on the same octagonal, columned pedestal. Above it the figure is a
// hierarchy of joints (pelvis, spine, chest, neck, head; shoulder, elbow, wrist; hip, knee,
// ankle; the horse's shoulders, knees, neck and tail), and each body part is a solid stone
// shape hung on its joint: nothing bends or stretches, the stone turns at the joint like a
// jointed statue. The legs are solved with two-bone IK so the feet stay planted on the
// pedestal while the body crouches, lunges or rises.
//
// Units are board squares (a square is 1; the real board's squares are 40 mm). Figures face
// +z; their right hand is on -x.
import * as THREE from 'three';
import { granite } from './granite.js';

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const PED = 0.215; // pedestal height

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ shapes
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
// a limb hanging down from its joint: a tapered round with a ball at the joint
function limb(parent, mat, len, r1, r2, { ball = true, seg = 10 } = {}) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1);
  g.translate(0, -len / 2, 0);
  mesh(g, mat, parent);
  if (ball) mesh(new THREE.SphereGeometry(r1 * 1.05, seg, 8), mat, parent);
}
function box(parent, mat, w, h, d, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
}
// a turned (lathe) shape from [radius, y] pairs
function lathe(parent, mat, pts, seg = 16, y = 0) {
  return mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat, parent, 0, y, 0);
}
function joint(J, name, parent, x, y, z) {
  const j = new THREE.Group();
  j.name = name;
  j.position.set(x, y, z);
  j.userData.rest = new THREE.Euler();
  parent.add(j);
  J[name] = j;
  return j;
}

function pedestal(parent, mat) {
  const g = new THREE.Group();
  parent.add(g);
  const oct = (r1, r2, h, y) => {
    const m = mesh(new THREE.CylinderGeometry(r1, r2, h, 8), mat, g, 0, y, 0);
    m.rotation.y = Math.PI / 8;
  };
  oct(0.262, 0.272, 0.05, 0.025); // foot
  oct(0.24, 0.262, 0.018, 0.059);
  oct(0.16, 0.16, 0.12, 0.128); // core
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.sin(a) * 0.195, z = Math.cos(a) * 0.195;
    mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.11, 8), mat, g, x, 0.125, z);
    mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.016, 8), mat, g, x, 0.178, z); // capital
    mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.014, 8), mat, g, x, 0.074, z); // base
  }
  oct(0.255, 0.24, 0.03, 0.2); // top slab
  return g;
}

// ------------------------------------------------------------------ figures
// Proportions for a figure of height H standing on the pedestal.
function humanoid(J, root, mat, H, o = {}) {
  const hipY = 0.5 * H;
  const hips = joint(J, 'hips', root, 0, hipY, 0);
  const spine = joint(J, 'spine', hips, 0, 0.05 * H, 0);
  const chest = joint(J, 'chest', spine, 0, 0.15 * H, 0);
  const neck = joint(J, 'neck', chest, 0, 0.12 * H, 0);
  const head = joint(J, 'head', neck, 0, 0.045 * H, 0);
  // pelvis and torso
  lathe(hips, mat, [[0, -0.05 * H], [0.1 * H, -0.05 * H], [0.11 * H, 0.0], [0.095 * H, 0.06 * H], [0, 0.06 * H]], 14);
  const torso = lathe(spine, mat, [[0, 0], [0.092 * H, 0], [0.104 * H, 0.06 * H], [0.13 * H, 0.13 * H], [0.128 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]], 16);
  torso.scale.z = 0.76;
  mesh(new THREE.CylinderGeometry(0.036 * H, 0.042 * H, 0.06 * H, 10), mat, neck, 0, 0.0, 0);
  mesh(new THREE.SphereGeometry(0.062 * H, 14, 12), mat, head, 0, 0.05 * H, 0.004 * H);
  // arms
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = joint(J, 'sh' + side, chest, s * 0.135 * H, 0.1 * H, 0);
    sh.userData.rest = new THREE.Euler(0, 0, s * 0.08);
    limb(sh, mat, 0.18 * H, 0.052 * H, 0.042 * H);
    if (o.pauldrons) mesh(new THREE.SphereGeometry(0.072 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, sh, s * 0.008 * H, 0.008 * H, 0);
    const el = joint(J, 'el' + side, sh, 0, -0.18 * H, 0);
    limb(el, mat, 0.155 * H, 0.042 * H, 0.034 * H);
    if (o.gauntlets) mesh(new THREE.CylinderGeometry(0.048 * H, 0.04 * H, 0.065 * H, 10), mat, el, 0, -0.12 * H, 0);
    const wr = joint(J, 'wr' + side, el, 0, -0.155 * H, 0);
    box(wr, mat, 0.055 * H, 0.065 * H, 0.05 * H, 0, -0.03 * H, 0.005 * H);
  }
  // legs (hidden under a robe on robed figures, but present: the IK keeps them planted)
  const legs = [];
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const hp = joint(J, 'hip' + side, hips, s * 0.055 * H, -0.02 * H, 0);
    const thigh = 0.225 * H, shin = 0.215 * H;
    if (!o.robe) limb(hp, mat, thigh, 0.066 * H, 0.05 * H);
    const kn = joint(J, 'knee' + side, hp, 0, -thigh, 0);
    if (!o.robe) {
      limb(kn, mat, shin, 0.05 * H, 0.04 * H);
      if (o.greaves) {
        mesh(new THREE.SphereGeometry(0.056 * H, 10, 8), mat, kn, 0, 0, 0.014 * H);
        mesh(new THREE.CylinderGeometry(0.056 * H, 0.046 * H, 0.13 * H, 10), mat, kn, 0, -0.1 * H, 0.004 * H);
      }
    }
    const an = joint(J, 'ankle' + side, kn, 0, -shin, 0);
    if (!o.robe) box(an, mat, 0.07 * H, 0.045 * H, 0.13 * H, 0, -0.02 * H, 0.03 * H);
    legs.push({ hip: hp, knee: kn, ankle: an, thigh, shin, foot: V(s * 0.055 * H, 0.04 * H, 0) });
  }
  return { hips, spine, chest, head, legs };
}

function helm(parent, mat, H, crown) {
  // a great helm with a slit visor, and a crown on the royals
  mesh(new THREE.CylinderGeometry(0.066 * H, 0.07 * H, 0.11 * H, 12), mat, parent, 0, 0.045 * H, 0);
  mesh(new THREE.SphereGeometry(0.066 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, parent, 0, 0.1 * H, 0);
  box(parent, mat, 0.1 * H, 0.008 * H, 0.02 * H, 0, 0.06 * H, 0.066 * H);
  box(parent, mat, 0.012 * H, 0.06 * H, 0.012 * H, 0, 0.035 * H, 0.071 * H);
  if (crown) {
    lathe(parent, mat, [[0.06 * H, 0], [0.072 * H, 0], [0.072 * H, 0.03 * H], [0.06 * H, 0.03 * H]], 12, 0.13 * H);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = mesh(new THREE.ConeGeometry(0.014 * H, 0.05 * H, 4), mat, parent, Math.sin(a) * 0.066 * H, 0.18 * H, Math.cos(a) * 0.066 * H);
      c.rotation.y = a;
    }
  }
}

// a kite shield whose face is perpendicular to the forearm holding it (local -y), point down
function kite(parent, mat, w, h) {
  const sh = new THREE.Shape();
  sh.moveTo(0, h * 0.42);
  sh.quadraticCurveTo(w * 0.52, h * 0.44, w * 0.5, h * 0.18);
  sh.quadraticCurveTo(w * 0.42, -h * 0.25, 0, -h * 0.58);
  sh.quadraticCurveTo(-w * 0.42, -h * 0.25, -w * 0.5, h * 0.18);
  sh.quadraticCurveTo(-w * 0.52, h * 0.44, 0, h * 0.42);
  const g = new THREE.ExtrudeGeometry(sh, { depth: w * 0.08, bevelEnabled: true, bevelThickness: w * 0.03, bevelSize: w * 0.03, bevelSegments: 1 });
  g.rotateX(Math.PI / 2);
  const m = mesh(g, mat, parent);
  // the boss and the cross carved on its face
  const boss = mesh(new THREE.SphereGeometry(w * 0.09, 8, 6), mat, parent, 0, -w * 0.1, h * 0.05);
  boss.scale.y = 0.5;
  return m;
}

function sword(parent, mat, H, len = 0.55) {
  // hilt in the hand, blade pointing down the forearm's continuation
  const g = new THREE.Group();
  parent.add(g);
  mesh(new THREE.CylinderGeometry(0.012 * H, 0.012 * H, 0.09 * H, 8), mat, g, 0, 0, 0); // grip
  mesh(new THREE.SphereGeometry(0.02 * H, 8, 6), mat, g, 0, 0.05 * H, 0); // pommel
  box(g, mat, 0.16 * H, 0.016 * H, 0.025 * H, 0, -0.05 * H, 0); // guard
  const blade = new THREE.CylinderGeometry(0.03 * H, 0.004 * H, len * H, 4, 1);
  blade.rotateY(Math.PI / 4);
  blade.scale(1, 1, 0.25);
  blade.translate(0, -0.05 * H - (len * H) / 2, 0);
  mesh(blade, mat, g);
  g.userData.tip = V(0, -0.05 * H - len * H, 0);
  return g;
}

// ------------------------------------------------------------------ the six pieces
const BUILD = {
  [KING](J, root, mat, dark) {
    const H = 1.18;
    const b = humanoid(J, root, mat, H, { pauldrons: true, gauntlets: true, greaves: true });
    // armour skirt (tassets) and belt
    lathe(J.hips, mat, [[0.097 * H, 0.02 * H], [0.12 * H, -0.06 * H], [0.13 * H, -0.12 * H], [0.11 * H, -0.12 * H], [0.09 * H, 0.02 * H]], 12);
    lathe(J.spine, mat, [[0.088 * H, 0.0], [0.096 * H, 0.0], [0.096 * H, 0.025 * H], [0.088 * H, 0.025 * H]], 14);
    helm(J.head, mat, H, true);
    // kite shield slung on his back
    const back = new THREE.Group();
    J.chest.add(back);
    back.position.set(0.03 * H, 0.03 * H, -0.12 * H);
    back.rotation.set(-Math.PI / 2, 0, 0.12);
    kite(back, mat, 0.22 * H, 0.36 * H);
    // greatsword held point-down before him in both hands
    J.weapon = sword(J.wrR, mat, H, 0.62);
    J.weapon.position.set(0.035 * H, -0.04 * H, 0.02 * H);
    return { H, ...b, style: 'two', reach: 0.95 };
  },
  [QUEEN](J, root, mat) {
    const H = 1.1;
    const b = humanoid(J, root, mat, H, { robe: true, pauldrons: true });
    // a long gown falling to the pedestal, and a train of a cloak behind
    lathe(J.hips, mat, [[0.088 * H, 0.04 * H], [0.11 * H, -0.08 * H], [0.15 * H, -0.3 * H], [0.18 * H, -0.47 * H], [0, -0.47 * H]], 18);
    const cloak = box(J.chest, mat, 0.24 * H, 0.5 * H, 0.02 * H, 0, -0.14 * H, -0.09 * H);
    cloak.rotation.x = 0.12;
    lathe(J.chest, mat, [[0.06 * H, 0.1 * H], [0.11 * H, 0.14 * H], [0.08 * H, 0.2 * H]], 14); // high collar
    // crown
    lathe(J.head, mat, [[0.058 * H, 0.08 * H], [0.07 * H, 0.08 * H], [0.08 * H, 0.15 * H], [0.074 * H, 0.15 * H], [0.06 * H, 0.1 * H]], 14);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      mesh(new THREE.SphereGeometry(0.012 * H, 6, 4), mat, J.head, Math.sin(a) * 0.08 * H, 0.16 * H, Math.cos(a) * 0.08 * H);
    }
    // staff: a long rod with a finial, in both hands before her face
    const st = new THREE.Group();
    J.wrR.add(st);
    mesh(new THREE.CylinderGeometry(0.012 * H, 0.012 * H, 0.75 * H, 8), mat, st, 0, -0.2 * H, 0);
    lathe(st, mat, [[0.02 * H, 0], [0.035 * H, 0.03 * H], [0.02 * H, 0.07 * H], [0.03 * H, 0.1 * H], [0, 0.13 * H]], 10, 0.17 * H);
    st.position.set(0.03 * H, -0.03 * H, 0.03 * H);
    st.userData.tip = V(0, -0.55 * H, 0);
    J.weapon = st;
    return { H, ...b, style: 'two', reach: 0.95 };
  },
  [BISHOP](J, root, mat) {
    const H = 1.02;
    const b = humanoid(J, root, mat, H, { robe: true });
    lathe(J.hips, mat, [[0.09 * H, 0.04 * H], [0.11 * H, -0.1 * H], [0.13 * H, -0.3 * H], [0.15 * H, -0.47 * H], [0, -0.47 * H]], 16);
    // chasuble falling front and back
    box(J.chest, mat, 0.16 * H, 0.34 * H, 0.012 * H, 0, -0.06 * H, 0.085 * H);
    box(J.chest, mat, 0.2 * H, 0.42 * H, 0.012 * H, 0, -0.1 * H, -0.085 * H);
    // mitre
    const mi = new THREE.CylinderGeometry(0.0, 0.07 * H, 0.2 * H, 4, 1);
    mi.rotateY(Math.PI / 4);
    mi.scale(1, 1, 0.7);
    mesh(mi, mat, J.head, 0, 0.17 * H, 0);
    // crozier in his left hand
    const cr = new THREE.Group();
    J.wrL.add(cr);
    mesh(new THREE.CylinderGeometry(0.011 * H, 0.011 * H, 0.95 * H, 8), mat, cr, 0, -0.2 * H, 0);
    const curl = new THREE.TorusGeometry(0.06 * H, 0.012 * H, 6, 16, Math.PI * 1.5);
    const c = mesh(curl, mat, cr, -0.06 * H, 0.33 * H, 0);
    c.rotation.z = -Math.PI / 2;
    cr.position.set(0, -0.03 * H, 0.02 * H);
    cr.userData.tip = V(0, 0.37 * H, 0);
    J.weapon = cr;
    return { H, ...b, style: 'one', hand: 'L', reach: 0.9 };
  },
  [ROOK](J, root, mat) {
    // a round keep of stone courses, and a soldier on the battlements
    const T = 0.62;
    const tower = joint(J, 'tower', root, 0, 0, 0);
    const pts = [[0.2, 0], [0.19, 0.04], [0.165, 0.06], [0.15, T * 0.9], [0.19, T * 0.93], [0.2, T], [0.17, T], [0.17, T * 0.96], [0, T * 0.96]];
    lathe(tower, mat, pts, 16);
    for (let i = 1; i < 9; i++) lathe(tower, mat, [[0.152 + 0.004 * (9 - i) / 9, i * T * 0.1 - 0.004], [0.158 + 0.004 * (9 - i) / 9, i * T * 0.1], [0.152 + 0.004 * (9 - i) / 9, i * T * 0.1 + 0.004]], 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const m = box(tower, mat, 0.07, 0.07, 0.05, Math.sin(a) * 0.18, T + 0.035, Math.cos(a) * 0.18);
      m.rotation.y = a;
    }
    // the soldier, from the waist up, standing in the keep
    const H = 0.95;
    const hips = joint(J, 'hips', tower, 0, T - 0.06, 0);
    const spine = joint(J, 'spine', hips, 0, 0.02, 0);
    const chest = joint(J, 'chest', spine, 0, 0.12 * H, 0);
    const neck = joint(J, 'neck', chest, 0, 0.12 * H, 0);
    const head = joint(J, 'head', neck, 0, 0.045 * H, 0);
    const torso = lathe(spine, mat, [[0, 0], [0.1 * H, 0], [0.13 * H, 0.12 * H], [0.128 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]], 14);
    torso.scale.z = 0.76;
    mesh(new THREE.CylinderGeometry(0.036 * H, 0.042 * H, 0.06 * H, 10), mat, neck, 0, 0.0, 0);
    mesh(new THREE.SphereGeometry(0.06 * H, 12, 10), mat, head, 0, 0.05 * H, 0);
    // a crested helmet
    mesh(new THREE.SphereGeometry(0.068 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), mat, head, 0, 0.055 * H, 0);
    box(head, mat, 0.012 * H, 0.05 * H, 0.14 * H, 0, 0.12 * H, -0.01 * H);
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      const sh = joint(J, 'sh' + side, chest, s * 0.13 * H, 0.1 * H, 0);
      limb(sh, mat, 0.17 * H, 0.052 * H, 0.042 * H);
      mesh(new THREE.SphereGeometry(0.068 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, sh);
      const el = joint(J, 'el' + side, sh, 0, -0.17 * H, 0);
      limb(el, mat, 0.15 * H, 0.042 * H, 0.034 * H);
      const wr = joint(J, 'wr' + side, el, 0, -0.15 * H, 0);
      box(wr, mat, 0.055 * H, 0.06 * H, 0.05 * H, 0, -0.025 * H, 0);
    }
    // a tall shield on his left arm and a sword in his right
    const shield = new THREE.Group();
    J.elL.add(shield);
    kite(shield, mat, 0.3 * H, 0.46 * H);
    shield.position.set(0, -0.09 * H, 0.0);
    J.shield = shield;
    J.weapon = sword(J.wrR, mat, H, 0.42);
    J.weapon.position.set(0, -0.03 * H, 0.02 * H);
    return { H, hips, spine, chest, head, legs: [], style: 'one', hand: 'R', reach: 0.9 };
  },
  [KNIGHT](J, root, mat) {
    // a war horse rearing on its hind legs, and its rider with a mace and shield
    const horse = joint(J, 'horse', root, 0, 0.3, -0.1); // pivot on the hind quarters
    horse.userData.rest = new THREE.Euler(-0.8, 0, 0); // reared
    const barrel = new THREE.CapsuleGeometry(0.14, 0.3, 6, 16);
    barrel.rotateX(Math.PI / 2);
    barrel.scale(0.82, 1, 1);
    mesh(barrel, mat, horse, 0, 0.02, 0.18);
    const breast = mesh(new THREE.SphereGeometry(0.15, 14, 10), mat, horse, 0, 0.03, 0.34);
    breast.scale.set(0.85, 1, 0.9);
    const rump = mesh(new THREE.SphereGeometry(0.15, 14, 10), mat, horse, 0, 0.03, 0.02);
    rump.scale.set(0.9, 0.95, 0.9);
    // hind legs, planted on the pedestal (children of the root: they stay put)
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      const hip = joint(J, 'hh' + side, root, s * 0.085, 0.31, -0.12);
      hip.userData.rest = new THREE.Euler(0.3, 0, 0);
      limb(hip, mat, 0.17, 0.07, 0.04);
      const hock = joint(J, 'hk' + side, hip, 0, -0.17, 0);
      hock.userData.rest = new THREE.Euler(-0.75, 0, 0);
      limb(hock, mat, 0.12, 0.034, 0.027);
      mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.04, 8), mat, hock, 0, -0.135, 0.01); // hoof
    }
    // forelegs, raised and folded
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      const sh = joint(J, 'fl' + side, horse, s * 0.08, -0.03, 0.38);
      sh.userData.rest = new THREE.Euler(-0.4, 0, 0);
      limb(sh, mat, 0.16, 0.055, 0.034);
      const kn = joint(J, 'fk' + side, sh, 0, -0.16, 0);
      kn.userData.rest = new THREE.Euler(1.5, 0, 0);
      limb(kn, mat, 0.14, 0.03, 0.025);
      mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.035, 8), mat, kn, 0, -0.15, 0.0);
    }
    // an arched neck and a long head
    const neck = joint(J, 'hneck', horse, 0, 0.08, 0.4);
    neck.userData.rest = new THREE.Euler(0.75, 0, 0);
    const ng = new THREE.CylinderGeometry(0.058, 0.09, 0.28, 12);
    ng.translate(0, 0.14, 0);
    ng.scale(1, 1, 1.3);
    mesh(ng, mat, neck);
    for (let i = 0; i < 6; i++) box(neck, mat, 0.022, 0.06, 0.04, 0, 0.04 + i * 0.042, -0.085 + i * 0.006); // mane
    const hd = joint(J, 'hhead', neck, 0, 0.27, 0.0);
    hd.userData.rest = new THREE.Euler(1.75, 0, 0);
    const hg = new THREE.CylinderGeometry(0.06, 0.035, 0.22, 10);
    hg.translate(0, 0.11, 0);
    hg.scale(0.85, 1, 1.25);
    mesh(hg, mat, hd);
    mesh(new THREE.SphereGeometry(0.065, 10, 8), mat, hd, 0, 0.0, 0.005).scale.set(0.9, 0.9, 1.1);
    for (const s of [1, -1]) {
      const ear = mesh(new THREE.ConeGeometry(0.018, 0.07, 4), mat, hd, s * 0.035, -0.02, -0.05);
      ear.rotation.x = -2.0;
    }
    // tail
    const tail = joint(J, 'tail', horse, 0, 0.05, -0.1);
    tail.userData.rest = new THREE.Euler(1.25, 0, 0);
    const tg = new THREE.CylinderGeometry(0.035, 0.012, 0.32, 8);
    tg.translate(0, -0.16, 0);
    mesh(tg, mat, tail);
    // the rider, sitting on the horse's back (in the horse's frame, but upright)
    const H = 0.8;
    const rider = joint(J, 'hips', horse, 0, 0.15, 0.14);
    rider.userData.rest = new THREE.Euler(0.8, 0, 0);
    const spine = joint(J, 'spine', rider, 0, 0.02, 0);
    const chest = joint(J, 'chest', spine, 0, 0.12 * H, 0);
    const rneck = joint(J, 'neck', chest, 0, 0.12 * H, 0);
    const head = joint(J, 'head', rneck, 0, 0.045 * H, 0);
    const torso = lathe(spine, mat, [[0, 0], [0.1 * H, 0], [0.13 * H, 0.12 * H], [0.128 * H, 0.17 * H], [0.07 * H, 0.21 * H], [0, 0.21 * H]], 14);
    torso.scale.z = 0.76;
    mesh(new THREE.CylinderGeometry(0.036 * H, 0.042 * H, 0.06 * H, 10), mat, rneck, 0, 0.0, 0);
    helm(head, mat, H, false);
    mesh(new THREE.ConeGeometry(0.02 * H, 0.09 * H, 6), mat, head, 0, 0.17 * H, 0); // spike
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      // thighs astride the horse
      const leg = box(rider, mat, 0.05 * H, 0.05 * H, 0.2 * H, s * 0.12 * H, -0.03 * H, 0.08 * H);
      leg.rotation.z = s * 0.2;
      const shin = box(rider, mat, 0.045 * H, 0.2 * H, 0.05 * H, s * 0.15 * H, -0.12 * H, 0.17 * H);
      shin.rotation.z = s * 0.1;
      const sh = joint(J, 'sh' + side, chest, s * 0.13 * H, 0.1 * H, 0);
      limb(sh, mat, 0.17 * H, 0.052 * H, 0.042 * H);
      mesh(new THREE.SphereGeometry(0.068 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, sh);
      const el = joint(J, 'el' + side, sh, 0, -0.17 * H, 0);
      limb(el, mat, 0.15 * H, 0.042 * H, 0.034 * H);
      const wr = joint(J, 'wr' + side, el, 0, -0.15 * H, 0);
      box(wr, mat, 0.055 * H, 0.06 * H, 0.05 * H, 0, -0.025 * H, 0);
    }
    const shield = new THREE.Group();
    J.elL.add(shield);
    kite(shield, mat, 0.28 * H, 0.42 * H);
    shield.position.set(0, -0.08 * H, 0);
    J.shield = shield;
    // mace
    const mace = new THREE.Group();
    J.wrR.add(mace);
    mesh(new THREE.CylinderGeometry(0.012 * H, 0.012 * H, 0.32 * H, 8), mat, mace, 0, -0.1 * H, 0);
    mesh(new THREE.DodecahedronGeometry(0.045 * H, 0), mat, mace, 0, -0.27 * H, 0);
    mace.position.set(0, -0.04 * H, 0.02 * H);
    mace.userData.tip = V(0, -0.27 * H, 0);
    J.weapon = mace;
    return { H, hips: rider, spine, chest, head, legs: [], style: 'one', hand: 'R', reach: 0.95 };
  },
  [PAWN](J, root, mat) {
    // a foot soldier who waits crouched behind two short blades and rises to fight
    const H = 0.6;
    const b = humanoid(J, root, mat, H, { gauntlets: true });
    // kettle hat with a wide brim
    mesh(new THREE.SphereGeometry(0.07 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, J.head, 0, 0.065 * H, 0);
    lathe(J.head, mat, [[0.065 * H, 0], [0.12 * H, -0.02 * H], [0.12 * H, -0.012 * H], [0.065 * H, 0.008 * H]], 14, 0.07 * H);
    // a tabard
    box(J.chest, mat, 0.19 * H, 0.3 * H, 0.015 * H, 0, -0.08 * H, 0.08 * H);
    lathe(J.hips, mat, [[0.097 * H, 0.02 * H], [0.115 * H, -0.08 * H], [0.09 * H, -0.08 * H]], 12);
    const bL = sword(J.wrL, mat, H, 0.42);
    bL.position.set(0, -0.03 * H, 0.02 * H);
    J.weapon = sword(J.wrR, mat, H, 0.42);
    J.weapon.position.set(0, -0.03 * H, 0.02 * H);
    J.weapon2 = bL;
    return { H, ...b, style: 'dual', reach: 0.8 };
  },
};

// ------------------------------------------------------------------ poses and moves
// A pose is { joint: [rx, ry, rz] } plus '$hips': [dy, dz] (the pelvis moves; the legs follow
// by IK) and '$root': [dx, dy, dz, rx] (the whole statue on its pedestal). Moves are keyframes
// [t (0..1), pose, ease]; the blow lands at `at`.
const H_ = { two: {}, one: {}, dual: {} };

// two-handed (king's greatsword, queen's staff)
const TWO = {
  rest: { shL: [-0.55, 0, 0.35], elL: [-1.05, 0, 0], shR: [-0.55, 0, -0.35], elR: [-1.05, 0, 0], wrR: [1.5, 0, 0], wrL: [1.5, 0, 0] },
  ready: { shL: [-1.05, 0.3, 0.3], elL: [-0.9, 0, 0], shR: [-1.05, -0.3, -0.3], elR: [-0.9, 0, 0], wrR: [-0.3, 0, 0], wrL: [-0.3, 0, 0], spine: [0.05, 0.25, 0], $hips: [-0.03, 0] },
  wind: { shL: [-2.9, 0.2, 0.15], elL: [-0.7, 0, 0], shR: [-2.9, -0.2, -0.15], elR: [-0.7, 0, 0], wrR: [-0.6, 0, 0], wrL: [-0.6, 0, 0], spine: [-0.28, 0.2, 0], chest: [-0.12, 0, 0], head: [-0.2, 0, 0], $hips: [-0.01, -0.04] },
  strike: { shL: [-0.85, 0, 0.25], elL: [-0.1, 0, 0], shR: [-0.85, 0, -0.25], elR: [-0.1, 0, 0], wrR: [-0.2, 0, 0], wrL: [-0.2, 0, 0], spine: [0.42, -0.1, 0], chest: [0.15, 0, 0], head: [0.15, 0, 0], $hips: [-0.09, 0.07], $root: [0, 0, 0.12, 0] },
  follow: { shL: [-0.35, 0, 0.3], elL: [-0.1, 0, 0], shR: [-0.35, 0, -0.3], elR: [-0.1, 0, 0], wrR: [-0.1, 0, 0], wrL: [-0.1, 0, 0], spine: [0.5, -0.15, 0], chest: [0.15, 0, 0], head: [0.1, 0, 0], $hips: [-0.11, 0.08], $root: [0, 0, 0.12, 0] },
  block: { shL: [-1.9, 0.5, 0.2], elL: [-1.2, 0, 0], shR: [-1.9, -0.5, -0.2], elR: [-1.2, 0, 0], wrR: [0.9, 0, 1.2], wrL: [0.9, 0, 0], spine: [-0.15, 0, 0], head: [-0.1, 0, 0], $hips: [-0.05, -0.03] },
  cheer: { shL: [-3.0, 0, 0.1], elL: [-0.1, 0, 0], shR: [-3.0, 0, -0.1], elR: [-0.1, 0, 0], wrR: [0.2, 0, 0], wrL: [0.2, 0, 0], spine: [-0.15, 0, 0], head: [-0.35, 0, 0] },
};
// one weapon arm (rook's sword, knight's mace on R; bishop's crozier on L), the other guards
function oneHanded(h) {
  const W = h === 'R' ? 'R' : 'L', O = h === 'R' ? 'L' : 'R', s = h === 'R' ? -1 : 1;
  const p = (wsh, wel, wwr, osh, oel, extra = {}) => ({ ['sh' + W]: wsh, ['el' + W]: wel, ['wr' + W]: wwr, ['sh' + O]: osh, ['el' + O]: oel, ...extra });
  return {
    rest: p([-0.2, 0, s * 0.15], [-0.6, 0, 0], [0.8, 0, 0], [-0.4, 0, -s * 0.2], [-1.2, 0, 0]),
    ready: p([-0.9, 0, s * 0.4], [-1.1, 0, 0], [-0.4, 0, 0], [-0.9, 0, -s * 0.5], [-1.4, 0, 0], { spine: [0.08, -s * 0.2, 0], $hips: [-0.03, 0] }),
    wind: p([-2.8, s * 0.3, s * 0.6], [-1.6, 0, 0], [-0.7, 0, 0], [-1.0, 0, -s * 0.4], [-1.5, 0, 0], { spine: [-0.2, -s * 0.5, 0], chest: [-0.1, -s * 0.2, 0], head: [-0.15, s * 0.3, 0], $hips: [-0.02, -0.04] }),
    strike: p([-0.6, -s * 0.3, -s * 0.2], [-0.15, 0, 0], [0.1, 0, 0], [-0.6, 0, -s * 0.6], [-1.2, 0, 0], { spine: [0.38, s * 0.45, 0], chest: [0.12, s * 0.2, 0], head: [0.1, 0, 0], $hips: [-0.08, 0.07], $root: [0, 0, 0.12, 0] }),
    follow: p([-0.2, -s * 0.4, -s * 0.4], [-0.15, 0, 0], [0.2, 0, 0], [-0.5, 0, -s * 0.5], [-1.1, 0, 0], { spine: [0.42, s * 0.6, 0], chest: [0.12, s * 0.25, 0], $hips: [-0.1, 0.08], $root: [0, 0, 0.12, 0] }),
    block: p([-1.4, 0, s * 0.3], [-1.3, 0, 0], [0.3, 0, 0], [-1.6, -s * 0.6, -s * 0.2], [-1.0, 0, 0], { spine: [-0.15, -s * 0.15, 0], head: [-0.1, 0, 0], $hips: [-0.05, -0.03] }),
    cheer: p([-3.0, 0, s * 0.2], [-0.2, 0, 0], [0.3, 0, 0], [-0.4, 0, -s * 0.3], [-0.6, 0, 0], { spine: [-0.15, 0, 0], head: [-0.3, 0, 0] }),
  };
}
// the pawn: crouched, then up on his feet with a blade in each hand
const DUAL = {
  rest: { $hips: [-0.13, 0.02], spine: [0.85, 0, 0], chest: [0.25, 0, 0], head: [-0.75, 0, 0], shL: [-0.9, 0, -0.55], elL: [-1.5, 0, 0], shR: [-0.9, 0, 0.55], elR: [-1.5, 0, 0], wrL: [1.1, 0, 0], wrR: [1.1, 0, 0] },
  ready: { $hips: [-0.04, 0], spine: [0.25, 0, 0], head: [-0.15, 0, 0], shL: [-0.7, 0, 0.5], elL: [-1.0, 0, 0], shR: [-0.7, 0, -0.5], elR: [-1.0, 0, 0], wrL: [0.2, 0, 0], wrR: [0.2, 0, 0] },
  // rising, the arms fly out wide, blades flat
  wind: { $hips: [0, -0.02], spine: [-0.15, 0.3, 0], chest: [-0.05, 0.15, 0], head: [-0.1, -0.3, 0], shL: [-0.5, -0.6, 1.5], elL: [-0.2, 0, 0], shR: [-0.6, 0.4, -1.6], elR: [-0.3, 0, 0], wrL: [-1.3, 0, 0], wrR: [-1.3, 0, 0] },
  // the cut: both blades sweep in across the body
  strike: { $hips: [-0.06, 0.06], spine: [0.35, -0.35, 0], chest: [0.1, -0.2, 0], head: [0.1, 0.2, 0], shL: [-1.3, 0.9, -0.4], elL: [-0.2, 0, 0], shR: [-1.2, -0.7, 0.5], elR: [-0.3, 0, 0], wrL: [-1.4, 0, 0], wrR: [-1.4, 0, 0], $root: [0, 0, 0.14, 0] },
  follow: { $hips: [-0.07, 0.07], spine: [0.4, -0.45, 0], chest: [0.12, -0.25, 0], shL: [-1.0, 1.1, -0.7], elL: [-0.3, 0, 0], shR: [-0.9, -0.9, 0.8], elR: [-0.3, 0, 0], wrL: [-1.2, 0, 0], wrR: [-1.2, 0, 0], $root: [0, 0, 0.14, 0] },
  block: { $hips: [-0.06, -0.02], spine: [0.15, 0, 0], shL: [-1.6, 0.6, 0.3], elL: [-1.3, 0, 0], shR: [-1.6, -0.6, -0.3], elR: [-1.3, 0, 0], wrL: [0.6, 0, 0.9], wrR: [0.6, 0, -0.9] },
  cheer: { $hips: [0, 0], spine: [-0.15, 0, 0], head: [-0.3, 0, 0], shL: [-2.9, 0, 0.3], elL: [-0.2, 0, 0], shR: [-2.9, 0, -0.3], elR: [-0.2, 0, 0] },
};
// (written with the arms' z the wrong way round: inward is -z for the left arm, +z for the right)
for (const p of Object.values(TWO)) for (const n of ['shL', 'shR']) if (p[n]) p[n] = [p[n][0], p[n][1], -p[n][2]];
H_.two = TWO;
H_.dual = DUAL;
H_.oneR = oneHanded('R');
H_.oneL = oneHanded('L');

// the horse's own poses (layered on the rider's)
const HORSE = {
  rest: {},
  rear: { horse: [-0.35, 0, 0], flL: [-0.9, 0, 0], fkL: [0.4, 0, 0], flR: [-0.6, 0, 0], fkR: [0.8, 0, 0], hneck: [-0.3, 0, 0], hhead: [0.2, 0, 0], tail: [0.5, 0, 0], hhL: [-0.2, 0, 0], hhR: [-0.2, 0, 0], hkL: [0.25, 0, 0], hkR: [0.25, 0, 0] },
  stamp: { horse: [0.45, 0, 0], flL: [0.9, 0, 0], fkL: [-1.3, 0, 0], flR: [1.0, 0, 0], fkR: [-1.3, 0, 0], hneck: [0.25, 0, 0], hhead: [-0.2, 0, 0], tail: [-0.4, 0, 0], hhL: [0.2, 0, 0], hhR: [0.2, 0, 0], hkL: [-0.2, 0, 0], hkR: [-0.2, 0, 0], $root: [0, 0, 0.14, 0] },
  hit: { horse: [-0.4, 0, 0.15], flL: [-0.6, 0, 0], flR: [-0.3, 0, 0], hneck: [-0.5, 0.3, 0], hhead: [0.4, 0, 0] },
};

function clips(kind) {
  const P = H_[kind];
  return {
    idle: { d: 3.2, loop: true, keys: [[0, P.rest], [1, P.rest]] },
    guard: { d: 1.6, loop: true, keys: [[0, P.ready], [1, P.ready]] },
    walk: { d: 1, loop: true, keys: [[0, P.ready], [1, P.ready]] },
    run: { d: 1, loop: true, keys: [[0, P.ready], [1, P.ready]] },
    leap: { d: 1, keys: [[0, P.ready], [0.2, P.wind], [0.8, P.wind], [1, P.ready]] },
    attack: { d: 1.25, at: 0.58, keys: [[0, P.ready], [0.42, P.wind, 'out'], [0.58, P.strike, 'in'], [0.78, P.follow], [1, P.ready]] },
    attack2: { d: 1.25, at: 0.58, keys: [[0, P.ready], [0.42, P.wind, 'out'], [0.58, P.strike, 'in'], [0.78, P.follow], [1, P.ready]] },
    finish: { d: 1.7, at: 0.6, keys: [[0, P.rest], [0.12, P.ready], [0.46, P.wind, 'out'], [0.6, P.strike, 'in'], [0.82, P.follow], [1, P.follow]] },
    block: { d: 0.7, keys: [[0, P.ready], [0.25, P.block, 'out'], [0.7, P.block], [1, P.ready]] },
    hit: { d: 0.6, keys: [[0, P.ready], [0.15, P.block], [1, P.ready]] },
    hit2: { d: 0.7, keys: [[0, P.ready], [0.15, P.block], [1, P.ready]] },
    dodgeL: { d: 0.6, keys: [[0, P.ready], [0.3, { ...P.ready, $root: [0.25, 0, -0.05, 0] }, 'out'], [1, P.ready]] },
    dodgeR: { d: 0.6, keys: [[0, P.ready], [0.3, { ...P.ready, $root: [-0.25, 0, -0.05, 0] }, 'out'], [1, P.ready]] },
    cheer: { d: 1.3, keys: [[0, P.follow], [0.3, P.cheer, 'out'], [0.75, P.cheer], [1, P.rest]] },
    fidget: { d: 2, keys: [[0, P.rest], [0.3, P.ready], [0.7, P.ready], [1, P.rest]] },
    death: { d: 1.2, keys: [[0, P.block], [1, P.block]] },
  };
}
const HORSE_CLIPS = {
  attack: [[0, HORSE.rest], [0.42, HORSE.rear, 'out'], [0.58, HORSE.stamp, 'in'], [0.8, HORSE.stamp], [1, HORSE.rest]],
  finish: [[0, HORSE.rest], [0.46, HORSE.rear, 'out'], [0.6, HORSE.stamp, 'in'], [0.85, HORSE.stamp], [1, HORSE.stamp]],
  leap: [[0, HORSE.rest], [0.25, HORSE.rear], [0.75, HORSE.rear], [1, HORSE.stamp]],
  hit: [[0, HORSE.rest], [0.15, HORSE.hit], [1, HORSE.rest]],
  cheer: [[0, HORSE.rest], [0.35, HORSE.rear, 'out'], [0.75, HORSE.rear], [1, HORSE.rest]],
};
HORSE_CLIPS.attack2 = HORSE_CLIPS.attack;
HORSE_CLIPS.hit2 = HORSE_CLIPS.hit;
HORSE_CLIPS.block = HORSE_CLIPS.hit;

const CLIP_CACHE = {};
function clipSet(kind) {
  return CLIP_CACHE[kind] || (CLIP_CACHE[kind] = clips(kind));
}

const smooth = (x) => x * x * (3 - 2 * x);
const EASE = { out: (x) => 1 - (1 - x) ** 3, in: (x) => x ** 2.6, s: smooth };

// sample a keyframe track at k (0..1)
function sample(keys, k) {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1, e] = keys[i];
    const [t0, p0] = keys[i - 1];
    if (k <= t1) {
      const u = (EASE[e] || smooth)((k - t0) / Math.max(1e-6, t1 - t0));
      return blend(p0, p1, u);
    }
  }
  return keys[keys.length - 1][1];
}
function blend(a, b, u) {
  const out = {};
  for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[n], y = b[n];
    const len = (x || y).length;
    out[n] = [];
    for (let i = 0; i < len; i++) out[n].push((x ? x[i] : 0) * (1 - u) + (y ? y[i] : 0) * u);
  }
  return out;
}

// ------------------------------------------------------------------ the statue
export function buildStatue(code) {
  const type = code & 7, isWhite = (code & 8) === 0;
  const mat = granite(isWhite ? 'white' : 'black');
  const group = new THREE.Group();
  const inner = new THREE.Group(); // effects move this
  group.add(inner);
  const model = new THREE.Group(); // the statue, glides and tilts on its pedestal
  inner.add(model);
  pedestal(model, mat);
  const fig_ = new THREE.Group(); // everything above the pedestal
  fig_.position.y = PED;
  model.add(fig_);
  const J = {};
  const info = BUILD[type](J, fig_, mat, null);
  for (const j of Object.values(J)) if (j.userData.rest) j.rotation.copy(j.userData.rest);
  // sparks fly from the weapon's striking end
  const hand = new THREE.Object3D();
  hand.name = 'handslotr';
  if (J.weapon) {
    hand.position.copy(J.weapon.userData.tip || V(0, -0.3, 0));
    J.weapon.add(hand);
  }
  const kind = info.style === 'one' ? (info.hand === 'L' ? 'oneL' : 'oneR') : info.style;
  const box3 = new THREE.Box3().setFromObject(model);
  const fig = {
    group, type, isWhite, code, spec: {}, model, materials: [mat], stone: false, statue: true,
    parts: { inner }, current: null, J, info, kind, body: fig_,
    height: box3.max.y - box3.min.y, radius: 0.26,
    move: { name: 'idle', t: 0, d: 3.2, loop: true }, from: null, blendT: 1, seed: Math.random() * 10,
  };
  fig.mixer = { update: (dt) => animate(fig, dt) };
  animate(fig, 0);
  return fig;
}

const ALIAS = { Blocking: 'guard', '2H_Melee_Idle': 'guard', Idle: 'idle' };
export const MOVES = clipSet('two');

/** Starts a move; returns its duration. */
export function playMove(fig, name, { loop, speed = 1, duration = 0 } = {}) {
  let key = name.startsWith('S_') ? name.slice(2) : ALIAS[name] || name;
  const C = clipSet(fig.kind);
  if (!C[key]) key = 'idle';
  const c = C[key];
  const d = duration > 0 ? duration : c.d / (speed || 1);
  if (fig.move.name === 'death') return d; // the fallen stay down
  if (fig.move.name === key && c.loop) return d;
  fig.from = fig.pose || null; // cross-fade from wherever the body is now
  fig.blendT = 0;
  fig.move = { name: key, t: 0, d, loop: loop || !!c.loop, at: c.at || 0.5 };
  return d;
}
export const strikeAt = (name) => clipSet('two')[name.replace(/^S_/, '')]?.at;

const _q = new THREE.Vector3(), _a = new THREE.Vector3();
function animate(fig, dt) {
  const m = fig.move;
  m.t += dt;
  if (!m.loop && m.t >= m.d && m.name !== 'death' && m.name !== 'finish') playMove(fig, 'idle');
  const k = m.loop ? (m.t % m.d) / m.d : Math.min(1, m.t / m.d);
  const C = clipSet(fig.kind);
  let pose = sample(C[fig.move.name].keys, k);
  // life: breathing, glancing round; the march sways
  const T = fig.move.t + fig.seed;
  const live = { spine: [Math.sin(T * 1.7) * 0.02, Math.sin(T * 0.4) * 0.05, 0], head: [Math.sin(T * 0.6) * 0.04, Math.sin(T * 0.45) * 0.3, 0] };
  if (m.name === 'walk' || m.name === 'run') {
    live.spine = [0.06, Math.sin(T * 6) * 0.08, Math.sin(T * 6) * 0.04];
    live.head = [0, -Math.sin(T * 6) * 0.06, 0];
  }
  pose = add(pose, live);
  if (fig.type === KNIGHT) {
    const hk = HORSE_CLIPS[m.name];
    let hp = hk ? sample(hk, k) : {};
    if (m.name === 'walk' || m.name === 'run' || m.name === 'guard') {
      const g = T * 9;
      hp = { horse: [-0.12 * Math.sin(g), 0, 0], flL: [0.5 * Math.sin(g), 0, 0], flR: [0.5 * Math.sin(g + 1.3), 0, 0], fkL: [-0.6 * Math.max(0, Math.sin(g + 0.8)), 0, 0], fkR: [-0.6 * Math.max(0, Math.sin(g + 2.1)), 0, 0], hneck: [0.15 * Math.sin(g + 0.5), 0, 0], tail: [0.2 * Math.sin(g), 0, 0.3 * Math.sin(g * 0.5)] };
    } else if (m.name === 'idle') {
      hp = { hneck: [0.08 * Math.sin(T * 1.1), 0.12 * Math.sin(T * 0.4), 0], fkL: [0.25 * Math.max(0, Math.sin(T * 1.7)), 0, 0], tail: [0, 0, 0.3 * Math.sin(T * 2.3)] };
    }
    pose = add(pose, hp);
  }
  // cross-fade from the previous move's pose
  fig.blendT = Math.min(1, fig.blendT + dt / 0.18);
  if (fig.from && fig.blendT < 1) pose = blend(fig.from, pose, smooth(fig.blendT));
  fig.pose = pose;
  const J = fig.J;
  for (const [n, j] of Object.entries(J)) {
    if (!j.userData.rest) continue;
    const r = j.userData.rest, p = pose[n];
    j.rotation.set(r.x + (p ? p[0] : 0), r.y + (p ? p[1] : 0), r.z + (p ? p[2] : 0));
  }
  const H = fig.info.H;
  // the pelvis moves; legs follow by IK, feet stay on the pedestal
  if (J.hips && fig.info.legs.length) {
    const hp = pose.$hips || [0, 0];
    J.hips.position.set(0, 0.5 * H + hp[0] * H, hp[1] * H);
    solveLegs(fig);
  }
  // the statue itself glides and tilts on the board
  const rp = pose.$root || [0, 0, 0, 0];
  fig.model.position.set(rp[0], rp[1], rp[2]);
  fig.model.rotation.x = rp[3];
  if (m.name === 'death') fall(fig, m.t, m.d);
  else fig.body.rotation.set(0, 0, 0);
  return fig.mixer;
}
function add(a, b) {
  const out = { ...a };
  for (const [n, v] of Object.entries(b)) {
    const x = out[n];
    out[n] = x ? x.map((e, i) => e + (v[i] || 0)) : v;
  }
  return out;
}

// two-bone IK in the leg's sagittal plane: knee bends forward, foot stays flat
function solveLegs(fig) {
  const { J, info } = fig;
  fig.body.updateMatrixWorld(true);
  for (const L of info.legs) {
    const target = fig.body.localToWorld(L.foot.clone());
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

// struck down: the figure topples off its pedestal backwards, stiff as stone
function fall(fig, t, d) {
  const k = Math.min(1, t / d);
  const a = k * k * 1.45;
  fig.body.rotation.set(-a, 0, 0.2 * k);
}

/** For the rubble: the solid stone parts of a statue, one per joint. */
export function statueParts(fig) {
  const out = [];
  fig.model.traverse((o) => {
    if (o.isMesh) out.push(o);
  });
  return out;
}

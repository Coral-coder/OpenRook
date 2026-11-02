// The army: every chess piece as a small 3D character built from simple shapes, with named
// parts that the animator moves (legs, arms, weapons, horse legs...).
//
// Units: one square is 1.0. Each figure stands on a round pedestal at y = 0 and faces +z in its
// own space; the board turns it to face the enemy.
import * as THREE from 'three';

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

const V = (x, y) => new THREE.Vector2(x, y);

function mats(isWhite) {
  return isWhite ? MAT.white : MAT.black;
}

export const MAT = (() => {
  const stone = (color, rough, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  return {
    white: {
      body: stone(0xefe8da, 0.42),
      dark: stone(0xcfc4b0, 0.5),
      trim: stone(0xd4af37, 0.3, 0.85), // gold
      steel: stone(0xc9ccd1, 0.3, 0.9),
      cloth: stone(0xe4dccb, 0.6),
      eye: stone(0x3a2e24, 0.6),
      royal: stone(0x9b1b30, 0.55, 0.05), // crimson velvet
    },
    black: {
      body: stone(0x2a2522, 0.3, 0.12),
      dark: stone(0x151211, 0.35, 0.1),
      trim: stone(0x8c5a2b, 0.35, 0.8), // dark bronze
      steel: stone(0x6d6f74, 0.35, 0.85),
      cloth: stone(0x3a302b, 0.55, 0.05),
      eye: stone(0xc0392b, 0.4, 0.2),
      royal: stone(0x4b2a6b, 0.5, 0.08), // deep purple
    },
  };
})();

// Geometry cache: the same shapes are reused by every piece.
const G = {};
const geo = (key, make) => G[key] || (G[key] = make());

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A pivot: a group placed at a joint, so rotating it swings what hangs off it.
function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function pedestal(group, m) {
  const g = geo('pedestal', () => new THREE.LatheGeometry([V(0, 0), V(0.34, 0), V(0.35, 0.03), V(0.32, 0.06), V(0.27, 0.075), V(0, 0.075)], 32));
  group.add(mesh(g, m.dark));
}

// ------------------------------------------------------------------ humans
// Legs, torso, head and arms. robe: a skirt replaces the legs (bishops, queens, kings).
function human(group, m, { scale = 1, robe = null, broad = 1 } = {}) {
  const s = scale;
  const parts = {};
  const hip = 0.075 + 0.3 * s;
  const body = pivot(group, 0, hip, 0); // the whole upper body bobs and leans from here
  parts.body = body;
  if (robe) {
    const skirt = new THREE.LatheGeometry(robe.map(([r, y]) => V(r * s, y * s)), 28);
    parts.robe = mesh(skirt, robe.material || m.cloth, 0, -hip + 0.075, 0);
    group.add(parts.robe);
  } else {
    const leg = geo(`leg${s}`, () => new THREE.CapsuleGeometry(0.052 * s, 0.2 * s, 4, 10));
    for (const side of [-1, 1]) {
      const p = pivot(group, 0.065 * s * side, hip, 0);
      p.add(mesh(leg, m.body, 0, -0.15 * s, 0));
      parts[side < 0 ? 'legL' : 'legR'] = p;
    }
  }
  // torso: a tapered lathe, wider at the shoulders
  const torso = geo(`torso${s}${broad}`, () => new THREE.LatheGeometry(
    [V(0, -0.02), V(0.1 * s, -0.02), V(0.12 * s, 0.08 * s), V(0.14 * s * broad, 0.2 * s), V(0.12 * s * broad, 0.27 * s), V(0, 0.29 * s)], 20));
  body.add(mesh(torso, m.body));
  const belt = geo(`belt${s}`, () => new THREE.TorusGeometry(0.105 * s, 0.018 * s, 6, 20));
  const b = mesh(belt, m.trim, 0, 0.02 * s, 0);
  b.rotation.x = Math.PI / 2;
  body.add(b);
  const neck = pivot(body, 0, 0.29 * s, 0);
  parts.head = neck;
  neck.add(mesh(geo(`head${s}`, () => new THREE.SphereGeometry(0.085 * s, 18, 14)), m.body, 0, 0.08 * s, 0));
  for (const side of [-1, 1]) {
    const eye = mesh(geo(`eye${s}`, () => new THREE.SphereGeometry(0.012 * s, 6, 6)), m.eye, 0.032 * s * side, 0.095 * s, 0.075 * s);
    neck.add(eye);
  }
  const arm = geo(`arm${s}`, () => new THREE.CapsuleGeometry(0.038 * s, 0.17 * s, 4, 8));
  const hand = geo(`hand${s}`, () => new THREE.SphereGeometry(0.035 * s, 10, 8));
  for (const side of [-1, 1]) {
    const p = pivot(body, 0.15 * s * broad * side, 0.24 * s, 0);
    p.add(mesh(arm, m.body, 0, -0.11 * s, 0));
    const h = pivot(p, 0, -0.22 * s, 0);
    h.add(mesh(hand, m.body));
    parts[side < 0 ? 'armL' : 'armR'] = p;
    parts[side < 0 ? 'handL' : 'handR'] = h;
  }
  return parts;
}

function pawn(group, m) {
  const p = human(group, m, { scale: 0.92 });
  const s = 0.92;
  // helmet with a brim and a little spike
  const helm = geo('helm', () => new THREE.SphereGeometry(0.094 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  p.head.add(mesh(helm, m.steel, 0, 0.09 * s, 0));
  const brim = geo('brim', () => new THREE.CylinderGeometry(0.13 * s, 0.13 * s, 0.012, 20));
  p.head.add(mesh(brim, m.steel, 0, 0.09 * s, 0));
  p.head.add(mesh(geo('spike', () => new THREE.ConeGeometry(0.02, 0.07, 8)), m.steel, 0, 0.21 * s, 0));
  // spear in the right hand, shield on the left arm
  const spear = new THREE.Group();
  spear.add(mesh(geo('shaft', () => new THREE.CylinderGeometry(0.012, 0.012, 0.85, 6)), m.dark, 0, 0.18, 0));
  spear.add(mesh(geo('tip', () => new THREE.ConeGeometry(0.03, 0.11, 6)), m.steel, 0, 0.66, 0));
  p.handR.add(spear);
  p.weapon = spear;
  const shieldGroup = pivot(p.armL, -0.02, -0.12, 0.05);
  const sh = mesh(geo('shield', () => new THREE.CylinderGeometry(0.12, 0.12, 0.025, 20)), m.trim);
  sh.rotation.x = Math.PI / 2;
  shieldGroup.add(sh);
  shieldGroup.add(mesh(geo('boss', () => new THREE.SphereGeometry(0.035, 10, 8)), m.steel, 0, 0, 0.02));
  return p;
}

function bishop(group, m) {
  const robe = [[0, 0], [0.27, 0], [0.24, 0.1], [0.17, 0.28], [0.13, 0.42], [0, 0.42]];
  const p = human(group, m, { scale: 1.0, robe });
  // tall mitre with a cleft
  const mitre = geo('mitre', () => new THREE.LatheGeometry([V(0, 0), V(0.08, 0), V(0.095, 0.08), V(0.07, 0.17), V(0.0, 0.24)], 16));
  const mi = mesh(mitre, m.cloth, 0, 0.13, 0);
  p.head.add(mi);
  const band = mesh(geo('mitreband', () => new THREE.TorusGeometry(0.083, 0.012, 6, 18)), m.trim, 0, 0.14, 0);
  band.rotation.x = Math.PI / 2;
  p.head.add(band);
  // crozier: staff with a hook
  const staff = new THREE.Group();
  staff.add(mesh(geo('staff', () => new THREE.CylinderGeometry(0.013, 0.013, 0.95, 6)), m.trim, 0, 0.22, 0));
  const hook = mesh(geo('hook', () => new THREE.TorusGeometry(0.06, 0.013, 6, 14, Math.PI * 1.3)), m.trim, 0.06, 0.72, 0);
  staff.add(hook);
  p.handR.add(staff);
  p.weapon = staff;
  return p;
}

function queen(group, m) {
  const robe = [[0, 0], [0.31, 0], [0.29, 0.06], [0.22, 0.2], [0.14, 0.4], [0.115, 0.44], [0, 0.44]];
  const p = human(group, m, { scale: 1.05, robe });
  // crown: a ring of points
  const crown = new THREE.Group();
  crown.add(mesh(geo('crownring', () => new THREE.CylinderGeometry(0.08, 0.075, 0.04, 18, 1, true)), m.trim));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pt = mesh(geo('crownpt', () => new THREE.ConeGeometry(0.018, 0.07, 6)), m.trim, Math.cos(a) * 0.08, 0.05, Math.sin(a) * 0.08);
    crown.add(pt);
  }
  crown.position.y = 0.16;
  p.head.add(crown);
  // hair bun
  p.head.add(mesh(geo('bun', () => new THREE.SphereGeometry(0.05, 10, 8)), m.dark, 0, 0.1, -0.07));
  // scepter with an orb
  const sc = new THREE.Group();
  sc.add(mesh(geo('scepter', () => new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6)), m.trim, 0, 0.1, 0));
  sc.add(mesh(geo('orb', () => new THREE.SphereGeometry(0.045, 12, 10)), m.steel, 0, 0.32, 0));
  p.handR.add(sc);
  p.weapon = sc;
  // cape
  const cape = mesh(geo('cape', () => new THREE.CylinderGeometry(0.16, 0.27, 0.6, 16, 1, true, Math.PI * 0.62, Math.PI * 0.76)), m.cloth, 0, -0.08, -0.01);
  cape.material = m.royal;
  p.body.add(cape);
  p.cape = cape;
  return p;
}

function king(group, m) {
  const robe = [[0, 0], [0.31, 0], [0.29, 0.06], [0.2, 0.22], [0.15, 0.4], [0.125, 0.44], [0, 0.44]];
  const p = human(group, m, { scale: 1.12, robe, broad: 1.1 });
  const crown = new THREE.Group();
  crown.add(mesh(geo('kcrown', () => new THREE.CylinderGeometry(0.09, 0.085, 0.07, 18, 1, true)), m.trim));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    crown.add(mesh(geo('kpt', () => new THREE.ConeGeometry(0.02, 0.06, 6)), m.trim, Math.cos(a) * 0.09, 0.06, Math.sin(a) * 0.09));
  }
  crown.add(mesh(geo('kcrossv', () => new THREE.BoxGeometry(0.025, 0.12, 0.025)), m.trim, 0, 0.12, 0));
  crown.add(mesh(geo('kcrossh', () => new THREE.BoxGeometry(0.08, 0.025, 0.025)), m.trim, 0, 0.14, 0));
  crown.position.y = 0.17;
  p.head.add(crown);
  // beard
  const beard = mesh(geo('beard', () => new THREE.ConeGeometry(0.06, 0.12, 10)), m.dark, 0, 0.0, 0.05);
  beard.rotation.x = Math.PI;
  p.head.add(beard);
  // sword
  const sword = new THREE.Group();
  sword.add(mesh(geo('blade', () => new THREE.BoxGeometry(0.03, 0.5, 0.01)), m.steel, 0, 0.3, 0));
  sword.add(mesh(geo('guard', () => new THREE.BoxGeometry(0.14, 0.022, 0.03)), m.trim, 0, 0.05, 0));
  sword.add(mesh(geo('grip', () => new THREE.CylinderGeometry(0.014, 0.014, 0.08, 6)), m.dark, 0, 0.0, 0));
  p.handR.add(sword);
  p.weapon = sword;
  const cape = mesh(geo('kcape', () => new THREE.CylinderGeometry(0.18, 0.3, 0.62, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8)), m.royal, 0, -0.08, -0.01);
  p.body.add(cape);
  p.cape = cape;
  return p;
}

// ------------------------------------------------------------------ rook: a walking stone tower
function rook(group, m) {
  const parts = {};
  const body = pivot(group, 0, 0.17, 0);
  parts.body = body;
  const tower = geo('tower', () => new THREE.LatheGeometry([V(0, 0), V(0.2, 0), V(0.18, 0.08), V(0.16, 0.45), V(0.2, 0.5), V(0.2, 0.58), V(0, 0.58)], 20));
  body.add(mesh(tower, m.body));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = mesh(geo('merlon', () => new THREE.BoxGeometry(0.08, 0.09, 0.06)), m.body, Math.cos(a) * 0.17, 0.62, Math.sin(a) * 0.17);
    b.rotation.y = -a;
    body.add(b);
  }
  // stone courses and a door and window on the front
  for (const y of [0.16, 0.3]) {
    const ring = mesh(geo('course', () => new THREE.TorusGeometry(0.17, 0.008, 4, 24)), m.dark, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
    body.add(ring);
  }
  body.add(mesh(geo('window', () => new THREE.BoxGeometry(0.05, 0.08, 0.02)), m.eye, 0, 0.4, 0.16));
  body.add(mesh(geo('door', () => new THREE.BoxGeometry(0.09, 0.12, 0.02)), m.dark, 0, 0.08, 0.175));
  // stubby legs and fists
  const leg = geo('rleg', () => new THREE.CapsuleGeometry(0.055, 0.06, 4, 8));
  for (const side of [-1, 1]) {
    const p = pivot(group, 0.09 * side, 0.17, 0);
    p.add(mesh(leg, m.dark, 0, -0.08, 0));
    parts[side < 0 ? 'legL' : 'legR'] = p;
    const a = pivot(body, 0.21 * side, 0.36, 0);
    a.add(mesh(geo('rarm', () => new THREE.CapsuleGeometry(0.045, 0.14, 4, 8)), m.body, 0, -0.09, 0));
    const fist = pivot(a, 0, -0.2, 0);
    fist.add(mesh(geo('rfist', () => new THREE.DodecahedronGeometry(0.06)), m.dark));
    parts[side < 0 ? 'armL' : 'armR'] = a;
  }
  return parts;
}

// ------------------------------------------------------------------ knight: a horse and rider
function knight(group, m) {
  const parts = {};
  const body = pivot(group, 0, 0.36, 0);
  parts.body = body;
  const torso = mesh(geo('horsebody', () => new THREE.CapsuleGeometry(0.11, 0.24, 6, 14)), m.body);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  // legs: front pair at +z, back pair at -z
  const leg = geo('hleg', () => new THREE.CapsuleGeometry(0.03, 0.2, 4, 8));
  const hoof = geo('hoof', () => new THREE.CylinderGeometry(0.035, 0.04, 0.03, 8));
  parts.legs = [];
  for (const [x, z] of [[-0.06, 0.14], [0.06, 0.14], [-0.06, -0.14], [0.06, -0.14]]) {
    const p = pivot(body, x, -0.05, z);
    p.add(mesh(leg, m.body, 0, -0.13, 0));
    p.add(mesh(hoof, m.dark, 0, -0.27, 0));
    parts.legs.push(p);
  }
  // neck and head
  const neck = pivot(body, 0, 0.05, 0.17);
  parts.neck = neck;
  const n = mesh(geo('hneck', () => new THREE.CapsuleGeometry(0.06, 0.16, 4, 10)), m.body, 0, 0.1, 0.03);
  n.rotation.x = 0.55;
  neck.add(n);
  const head = pivot(neck, 0, 0.2, 0.09);
  const h = mesh(geo('hhead', () => new THREE.CapsuleGeometry(0.05, 0.14, 4, 10)), m.body, 0, 0, 0.05);
  h.rotation.x = 1.9;
  head.add(h);
  for (const side of [-1, 1]) {
    head.add(mesh(geo('hear', () => new THREE.ConeGeometry(0.018, 0.06, 6)), m.body, 0.03 * side, 0.06, -0.02));
    head.add(mesh(geo('heye', () => new THREE.SphereGeometry(0.012, 6, 6)), m.eye, 0.045 * side, 0.02, 0.03));
  }
  const mane = mesh(geo('mane', () => new THREE.BoxGeometry(0.025, 0.22, 0.05)), m.dark, 0, 0.12, -0.02);
  mane.rotation.x = 0.55;
  neck.add(mane);
  parts.head = head;
  // tail
  const tail = pivot(body, 0, 0.03, -0.22);
  const t = mesh(geo('htail', () => new THREE.CapsuleGeometry(0.025, 0.16, 4, 8)), m.dark, 0, -0.08, -0.03);
  t.rotation.x = -0.4;
  tail.add(t);
  parts.tail = tail;
  // rider: torso, helmet with plume, lance
  const rider = pivot(body, 0, 0.1, -0.02);
  parts.rider = rider;
  rider.add(mesh(geo('rtorso', () => new THREE.LatheGeometry([V(0, 0), V(0.075, 0), V(0.09, 0.1), V(0.08, 0.17), V(0, 0.19)], 14)), m.body));
  rider.add(mesh(geo('rhelm', () => new THREE.CylinderGeometry(0.055, 0.06, 0.1, 12)), m.steel, 0, 0.24, 0));
  rider.add(mesh(geo('visor', () => new THREE.BoxGeometry(0.07, 0.015, 0.02)), m.eye, 0, 0.25, 0.058));
  const plume = mesh(geo('plume', () => new THREE.CapsuleGeometry(0.02, 0.1, 4, 6)), m.trim, 0, 0.31, -0.04);
  plume.rotation.x = -0.9;
  rider.add(plume);
  for (const side of [-1, 1]) {
    const leg = mesh(geo('rleg2', () => new THREE.CapsuleGeometry(0.028, 0.12, 4, 6)), m.body, 0.1 * side, -0.04, 0.02);
    leg.rotation.x = 0.4;
    rider.add(leg);
  }
  const armR = pivot(rider, 0.1, 0.15, 0);
  armR.add(mesh(geo('rarm2', () => new THREE.CapsuleGeometry(0.025, 0.1, 4, 6)), m.body, 0, -0.06, 0));
  const lance = new THREE.Group();
  lance.add(mesh(geo('lance', () => new THREE.ConeGeometry(0.03, 0.8, 8)), m.trim, 0, 0.32, 0));
  lance.add(mesh(geo('vamplate', () => new THREE.ConeGeometry(0.06, 0.08, 10)), m.steel, 0, -0.02, 0));
  lance.position.y = -0.12;
  lance.rotation.x = 1.2; // couched forward
  armR.add(lance);
  parts.armR = armR;
  parts.weapon = lance;
  return parts;
}

const BUILDERS = { [PAWN]: pawn, [KNIGHT]: knight, [BISHOP]: bishop, [ROOK]: rook, [QUEEN]: queen, [KING]: king };

/** Builds a figure for a piece code (Dart's: white 1..6, black 9..14). */
export function buildFigure(code) {
  const type = code & 7, isWhite = (code & 8) === 0;
  const group = new THREE.Group();
  const m = mats(isWhite);
  pedestal(group, m);
  const inner = new THREE.Group(); // everything above the pedestal (animated)
  inner.scale.setScalar(1.42); // the figures tower over their squares
  group.add(inner);
  const parts = BUILDERS[type](inner, m);
  parts.inner = inner;
  return { group, parts, type, isWhite, code };
}

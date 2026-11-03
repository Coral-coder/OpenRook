// Wounds in stone. A blow that gets past the guard does real damage to the statue, and it stays
// for the rest of the game: a chunk knocked out of a shoulder or the chest, a groove cut across
// the torso, the crest of a helmet or a point of a crown broken off, the shield arm (or the off
// hand) sheared off at the elbow, a blade snapped in two; cracks run out across the stone from
// every wound. What's knocked off is a real piece of the statue (cut out of its own carving) and
// falls onto the board as rubble.
//
// The cutting is done ahead of the blow (in each joint's own frame, so it doesn't matter how the
// figure moves meanwhile) and spread over frames; when the blow lands the figure's mesh on that
// joint swaps to the wounded stone (its own copy: the carving shared by its type is untouched).
import * as THREE from 'three';
import { cutSteps, soup } from './rubble.js';

const isJoint = (o) => !!o.userData.rest || o.name === 'weapon' || o.name === 'weapon2' || o.name === 'shield';

/** The meshes hung on a joint itself (not on the joints below it). */
export function ownMeshes(joint) {
  const out = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (c.isMesh) {
        if (c.visible && !c.userData.decal) out.push(c);
      } else if (!isJoint(c) && c.visible) walk(c);
    }
  };
  if (joint) walk(joint);
  return out;
}

/** Every visible mesh under [root] (decals included), not going into [skip]. */
export function subtreeMeshes(root, skip = []) {
  const out = [];
  const walk = (o) => {
    if (!o.visible || skip.includes(o)) return;
    if (o.isMesh) out.push(o);
    for (const c of o.children) walk(c);
  };
  if (root) walk(root);
  return out;
}

// the box of a joint's own meshes, in the joint's frame
function localBox(joint, meshes) {
  joint.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(joint.matrixWorld).invert();
  const box = new THREE.Box3();
  for (const m of meshes) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
  }
  return box;
}

function concat(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let k = 0;
  for (const g of geos) {
    P.set(g.attributes.position.array.subarray(0, g.attributes.position.count * 3), k);
    N.set(g.attributes.normal.array.subarray(0, g.attributes.position.count * 3), k);
    k += g.attributes.position.count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.userData.own = true;
  return g;
}

// Cuts the region inside every plane (n . x > d, in the joint's frame) out of the joint's meshes.
// Yields as it goes; returns [{ mesh, keep, out }] for the meshes it touched.
function* carve(joint, meshes, planes) {
  joint.updateWorldMatrix(true, true);
  const res = [];
  for (const mesh of meshes) {
    // the planes in the mesh's own frame
    const toMesh = new THREE.Matrix4().copy(mesh.matrixWorld).invert().multiply(joint.matrixWorld);
    const lp = planes.map(([n, d]) => new THREE.Plane(n.clone(), -d).applyMatrix4(toMesh));
    let cur = soup(mesh.geometry);
    const keep = [];
    for (const pl of lp) {
      const r = yield* cutSteps(cur, pl.normal, -pl.constant);
      if (r) {
        keep.push(r[1]);
        cur = r[0];
      } else {
        const P = cur.attributes.position.array;
        let s = 0;
        for (let i = 0; i < Math.min(P.length, 300); i += 3) s += pl.normal.x * P[i] + pl.normal.y * P[i + 1] + pl.normal.z * P[i + 2] + pl.constant;
        if (s < 0) {
          cur = null; // wholly outside: this mesh keeps all of its stone
          break;
        }
      }
      yield;
    }
    if (cur && keep.length) res.push({ mesh, keep: concat(keep), out: cur });
  }
  return res;
}

const _u = new THREE.Vector3(), _t = new THREE.Vector3();
const off = (fig) => (fig.kind === 'oneL' ? 'R' : 'L');

/** Which wounds a figure can still take. */
export function canTake(fig, kind) {
  const D = fig.damage || {};
  const J = fig.J;
  switch (kind) {
    case 'crest':
      return !!J.head && !D.crest;
    case 'sever': {
      const el = J['el' + off(fig)];
      return !!el && el.visible && !D.severed;
    }
    case 'snap':
      return !!J.weapon && !D.broken && fig.type !== KNIGHT_T;
    case 'chunk':
    case 'groove':
      return !!J.chest && (D.wounds || 0) < 6;
  }
  return false;
}
const KNIGHT_T = 2;

/**
 * Works out a wound ahead of the blow. [kind]: 'chunk' (out of the shoulder or chest), 'groove'
 * (a cut across the torso), 'crest' (off the top of the head), 'sever' (the off arm at the
 * elbow), 'snap' (the blade). [hit] is where the blow will land (world), [dir] the way it drives
 * in, [swing] the way the edge travels. Returns a plan for applyDamage, or null.
 */
export function prepareDamage(rubble, fig, kind, hit, dir, swing = null) {
  if (!canTake(fig, kind)) return null;
  const J = fig.J;
  fig.group.updateMatrixWorld(true);
  const plan = { kind, fig };
  if (kind === 'sever') {
    plan.joint = J['el' + off(fig)];
    return plan;
  }
  let joint, planes, surf, nrm;
  if (kind === 'snap') {
    joint = J.weapon;
    const tip = fig.hand.position.clone();
    const a = tip.clone().normalize();
    const f = 0.42 + Math.random() * 0.16;
    const tilt = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(0.5);
    planes = [[a.clone().add(tilt).normalize(), a.clone().add(tilt).normalize().dot(tip.clone().multiplyScalar(f))]];
    plan.newTip = tip.clone().multiplyScalar(f);
    surf = tip.clone().multiplyScalar(f);
  } else if (kind === 'crest') {
    joint = J.head;
    const meshes = ownMeshes(joint);
    const box = localBox(joint, meshes);
    const h = box.max.y - box.min.y;
    const n = new THREE.Vector3((Math.random() - 0.5) * 0.7, 1, (Math.random() - 0.5) * 0.7).normalize();
    const p = box.getCenter(new THREE.Vector3()).setY(box.max.y - h * (0.2 + Math.random() * 0.1));
    planes = [[n, n.dot(p)]];
    surf = p;
  } else {
    // a shoulder or the chest, whichever side the blow comes in on
    const side = Math.random() < 0.5 ? 'L' : 'R';
    joint = kind === 'chunk' && Math.random() < 0.55 && J['sh' + side] ? J['sh' + side] : J.chest;
    const meshes = ownMeshes(joint);
    if (!meshes.length) return null;
    const box = localBox(joint, meshes);
    const c = box.getCenter(new THREE.Vector3()), hs = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const h = joint.worldToLocal(hit.clone());
    const u = joint.worldToLocal(hit.clone().add(dir.clone().normalize().multiplyScalar(0.1))).sub(h).normalize(); // inward
    const ext = Math.abs(u.x) * hs.x + Math.abs(u.y) * hs.y + Math.abs(u.z) * hs.z;
    // where the blow meets the surface: in line with the hit, at the outside of the stone
    const lat = h.clone().sub(c);
    lat.addScaledVector(u, -lat.dot(u));
    lat.x = Math.max(-hs.x * 0.5, Math.min(hs.x * 0.5, lat.x));
    lat.y = Math.max(-hs.y * 0.45, Math.min(hs.y * 0.45, lat.y));
    lat.z = Math.max(-hs.z * 0.5, Math.min(hs.z * 0.5, lat.z));
    const S = c.clone().add(lat).addScaledVector(u, -ext * 0.85);
    let g; // the long way of the wound
    if (kind === 'groove' && swing) g = joint.worldToLocal(hit.clone().add(swing.clone().normalize().multiplyScalar(0.1))).sub(h);
    else g = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    g.addScaledVector(u, -g.dot(u));
    if (g.lengthSq() < 1e-6) g.set(1, 0, 0).addScaledVector(u, -u.x);
    g.normalize();
    const t = u.clone().cross(g).normalize();
    const depth = kind === 'groove' ? ext * (0.22 + Math.random() * 0.08) : ext * (0.45 + Math.random() * 0.2);
    const open = kind === 'groove' ? 1.5 : 0.85 + Math.random() * 0.3;
    const w = kind === 'groove' ? ext * 1.6 : ext * (0.55 + Math.random() * 0.25);
    const A = S.clone().addScaledVector(u, depth);
    const n1 = u.clone().negate().addScaledVector(t, open).normalize();
    const n2 = u.clone().negate().addScaledVector(t, -open).normalize();
    planes = [[n1, n1.dot(A)], [n2, n2.dot(A)], [g.clone(), g.dot(S) - w], [g.clone().negate(), -g.dot(S) - w]];
    // (a chunk breaks out unevenly)
    if (kind === 'chunk') for (const p of planes) p[0].add(_u.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25)).normalize();
    surf = S;
    nrm = u.clone().negate();
  }
  plan.joint = joint;
  plan.surf = surf;
  plan.nrm = nrm;
  const meshes = ownMeshes(joint);
  // the cracks running out from the wound, worked out on the wounded stone itself
  let cr = null;
  if (nrm && (kind === 'chunk' || kind === 'groove')) {
    const mesh = meshes.slice().sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
    if (mesh) {
      const at = surf.clone().applyMatrix4(joint.matrixWorld);
      const n = nrm.clone().transformDirection(joint.matrixWorld);
      cr = { mesh, L: toLocal(mesh, at, n, (fig.height || 1) * (kind === 'groove' ? 0.42 : 0.34)) };
    }
  }
  plan.task = rubble.task((function* () {
    const res = yield* carve(joint, meshes, planes);
    if (cr) {
      const r = res.find((x) => x.mesh === cr.mesh);
      plan.crack = { mesh: cr.mesh, geo: yield* crackSteps(r ? r.keep : cr.mesh.geometry, cr.L.c, cr.L.n, cr.L.size) };
    }
    return res;
  })());
  return plan;
}

/**
 * The blow lands: the wound opens, what's knocked off falls as rubble, cracks run out.
 * [dir] the way the piece is knocked. Returns { body, at }.
 */
export function applyDamage(rubble, plan, dir, ply = 0, power = 1) {
  const fig = plan.fig;
  const D = (fig.damage = fig.damage || { wounds: 0 });
  fig.group.updateMatrixWorld(true);
  const mat = fig.materials[0];
  let body = null;
  const at = new THREE.Vector3();
  if (plan.kind === 'sever') {
    const el = plan.joint;
    const items = subtreeMeshes(el).map((m) => ({ geo: m.geometry, m: m.matrixWorld.clone(), mat: m.userData.decal ? m.material : undefined }));
    el.getWorldPosition(at);
    const q = el.getWorldQuaternion(new THREE.Quaternion());
    body = rubble.compound(items, mat, q, ply);
    el.visible = false;
    if (fig.shieldAt && subtreeMeshes(el).length >= 0) {
      let inSub = false;
      el.traverse((o) => (inSub = inSub || o === fig.shieldAt));
      if (inSub) fig.shieldAt = null;
    }
    D.severed = 'el' + off(fig);
    if (body) {
      body.v.copy(dir).multiplyScalar(0.9 * power).add(_t.set((Math.random() - 0.5) * 0.4, 0.9, (Math.random() - 0.5) * 0.4));
      body.w.set(Math.random() * 8 - 4, Math.random() * 6 - 3, Math.random() * 8 - 4);
    }
  } else {
    const res = rubble.finish(plan.task) || [];
    const items = [];
    for (const r of res) {
      r.mesh.geometry = r.keep;
      items.push({ geo: r.out, m: r.mesh.matrixWorld.clone() });
    }
    plan.joint.updateWorldMatrix(true, false);
    at.copy(plan.surf).applyMatrix4(plan.joint.matrixWorld);
    if (items.length) {
      body = rubble.compound(items, mat, plan.joint.getWorldQuaternion(new THREE.Quaternion()), ply);
      if (body) {
        const k = plan.kind === 'snap' ? 0.8 : plan.kind === 'crest' ? 1.1 : 1.4;
        body.v.copy(dir).multiplyScalar(k * power).add(_t.set((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6));
        body.w.set(Math.random() * 16 - 8, Math.random() * 16 - 8, Math.random() * 16 - 8);
      }
    }
    if (plan.kind === 'snap') {
      D.broken = true;
      fig.hand.position.copy(plan.newTip);
    } else if (plan.kind === 'crest') D.crest = true;
    else {
      D.wounds++;
      // cracks run out from the wound across the stone
      if (plan.crack) attachCrack(plan.crack.mesh, plan.crack.geo, fig.isWhite);
    }
  }
  return { body, at };
}

// ------------------------------------------------------------------ cracks
// A crack texture: branching fissures from the middle. Red holds how far along from the
// middle each bit is, so a crack can be drawn spreading out (uGrow).
const crackTex = [];
function makeCrackTex(seed) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const branch = (x, y, a, len, w, d0) => {
    let d = d0;
    while (len > 0 && w > 0.4) {
      const step = 5 + rnd() * 6;
      const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      d += step;
      const v = Math.min(255, Math.round((d / (S * 0.5)) * 255));
      g.strokeStyle = `rgb(${v},0,0)`;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      x = nx;
      y = ny;
      a += (rnd() - 0.5) * 0.9;
      len -= step;
      w *= 0.97;
      if (rnd() < 0.12) branch(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.6), len * 0.6, w * 0.7, d);
    }
  };
  const n = 5 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) branch(S / 2, S / 2, (i / n) * Math.PI * 2 + rnd() * 0.6, S * (0.3 + rnd() * 0.18), 3.6, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const growing = [];
function crackMaterial(white) {
  if (!crackTex.length) for (let i = 1; i <= 3; i++) crackTex.push(makeCrackTex(i));
  const m = new THREE.MeshBasicMaterial({
    color: white ? 0x2c2620 : 0x8c8a90, map: crackTex[(Math.random() * 3) | 0], transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const u = { value: 0 };
  m.userData.grow = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrow = u;
    sh.fragmentShader = 'uniform float uGrow;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 cr = texture2D(map, vMapUv);
      if (cr.a < 0.3 || cr.r > uGrow) discard;
      diffuseColor.a *= cr.a * (1.0 - 0.4 * smoothstep(uGrow - 0.15, uGrow, cr.r));`);
  };
  m.customProgramCacheKey = () => 'openrook-crack';
  return m;
}

// Projects a crack onto a part's own surface (in the mesh's frame): the triangles within the
// crack's box, clipped to it, facing out along [n]. Yields as it goes; returns the geometry.
export function* crackSteps(geo, c, n, size, spin = Math.random() * 6.28) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array;
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.x) > 0.9) u.set(0, 1, 0);
  u.cross(n).normalize().applyAxisAngle(n, spin);
  const v = n.clone().cross(u);
  const h = size / 2, hz = size * 0.45;
  const out = [], uvs = [];
  const tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const lift = size * 0.004;
  for (let i = 0; i < P.length; i += 9) {
    if (i && i % 36000 === 0) yield;
    // facing the right way?
    if ((N[i] + N[i + 3] + N[i + 6]) * n.x + (N[i + 1] + N[i + 4] + N[i + 7]) * n.y + (N[i + 2] + N[i + 5] + N[i + 8]) * n.z < 0.3) continue;
    let out0 = 63;
    for (let k = 0; k < 3; k++) {
      const x = P[i + k * 3] - c.x, y = P[i + k * 3 + 1] - c.y, z = P[i + k * 3 + 2] - c.z;
      const a = x * u.x + y * u.y + z * u.z, b = x * v.x + y * v.y + z * v.z, d = x * n.x + y * n.y + z * n.z;
      tri[k][0] = a;
      tri[k][1] = b;
      tri[k][2] = d;
      out0 &= (a < -h) | ((a > h) << 1) | ((b < -h) << 2) | ((b > h) << 3) | ((d < -hz) << 4) | ((d > hz) << 5);
    }
    if (out0) continue; // wholly outside one side of the box
    // clip to the box
    let poly = [tri[0].slice(), tri[1].slice(), tri[2].slice()];
    for (const [ax, sg, lim] of [[0, 1, h], [0, -1, h], [1, 1, h], [1, -1, h], [2, 1, hz], [2, -1, hz]]) {
      const res = [];
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length];
        const da = lim - sg * A[ax], db = lim - sg * B[ax];
        if (da >= 0) res.push(A);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          res.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
        }
      }
      poly = res;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    for (let k = 1; k + 1 < poly.length; k++) {
      for (const q of [poly[0], poly[k], poly[k + 1]]) {
        out.push(c.x + q[0] * u.x + q[1] * v.x + (q[2] + lift) * n.x, c.y + q[0] * u.y + q[1] * v.y + (q[2] + lift) * n.y, c.z + q[0] * u.z + q[1] * v.z + (q[2] + lift) * n.z);
        uvs.push(q[0] / size + 0.5, q[1] / size + 0.5);
      }
    }
  }
  if (out.length < 9) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.userData.own = true;
  return g;
}

/** Hangs a crack (from crackSteps) on [mesh]; it spreads out over [dur] seconds. */
export function attachCrack(mesh, geo, white, dur = 0.6) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, crackMaterial(white));
  m.userData.decal = true;
  m.renderOrder = 2;
  mesh.add(m);
  growing.push({ u: m.material.userData.grow, t: 0, dur });
  return m;
}

// a world point, direction and size in a mesh's own frame
export function toLocal(mesh, at, normal, size) {
  mesh.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const sc = mesh.getWorldScale(new THREE.Vector3());
  return { c: at.clone().applyMatrix4(inv), n: normal.clone().transformDirection(inv).normalize(), size: size / ((sc.x + sc.y + sc.z) / 3) };
}

/** Cracks spreading over [mesh] from [at] (world), facing out along [normal]; [dur] to spread. */
export function crack(mesh, at, normal, size, white, dur = 0.6) {
  const L = toLocal(mesh, at, normal, size);
  const it = crackSteps(mesh.geometry, L.c, L.n, L.size);
  let r = it.next();
  while (!r.done) r = it.next();
  return attachCrack(mesh, r.value, white, dur);
}

/** Spreads the cracks that are still spreading. */
export function updateCracks(dt) {
  for (let i = growing.length - 1; i >= 0; i--) {
    const g = growing[i];
    g.t += dt;
    g.u.value = Math.min(1.02, (g.t / g.dur) * 1.02);
    if (g.t >= g.dur) growing.splice(i, 1);
  }
}

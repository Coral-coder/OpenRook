// Fine detail for the king and queen: relief carved into surfaces (engraved borders, scrolling
// vines, embroidery), beaded and roped edges, rivets, mail at the joints, an ornate sword,
// articulated gauntlets, crown filigree and flowing locks of hair. Every generator returns
// geometry in the local frame of the joint it hangs on.
import * as THREE from 'three';
import { fist, sculpt } from './kq_shapes.js';

const TAU = Math.PI * 2;
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pushes a surface out along its normals by d(x, y, z, a) (a = angle round y, 0 = front). */
export function relief(geo, d) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = d(x, y, z, Math.atan2(x, z));
    if (k) p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ relief patterns
/** A raised line: 1 on the line, falling off over w. */
export const line = (d, w) => Math.exp(-((d / w) ** 2));

/** A scrolling vine running round a band: stem, curling tendrils and leaves. u is the angle
 * (0..TAU), v is the height across the band (-1..1). Returns 0..1. */
export function vine(u, v, n) {
  const ph = u * n;
  const stem = Math.sin(ph) * 0.45;
  let h = line(v - stem, 0.13);
  // a tendril curls off each crest
  const local = ((ph / TAU) % 1 + 1) % 1;
  const cx = local - 0.25, cy = v - Math.sign(Math.cos(ph)) * 0.55;
  const r = Math.hypot(cx * 2.2, cy);
  const ang = Math.atan2(cy, cx * 2.2);
  h = Math.max(h, line(r - 0.3 - 0.06 * ang, 0.07) * (r < 0.45 ? 1 : 0));
  // leaves between
  const lx = (((ph / TAU + 0.5) % 1) + 1) % 1 - 0.5, ly = v + Math.sin(ph) * 0.2;
  h = Math.max(h, Math.max(0, 1 - Math.hypot(lx * 6, ly * 2.2)) * 0.9);
  return h;
}

// ------------------------------------------------------------------ edges
/** A ring of beads round y at radius R (z scaled by zs). */
export function beadRing(R, y, n, r, zs = 1, seg = 6) {
  const out = [];
  const base = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const g = base.clone();
    g.translate(Math.sin(a) * R, y, Math.cos(a) * R * zs);
    out.push(g);
  }
  return out;
}

/** A twisted rope round y. */
export function ropeRing(R, y, r, twists, zs = 1, seg = 160, zBack = zs) {
  const c = new THREE.Curve();
  c.getPoint = (t, v = new THREE.Vector3()) => v.set(Math.sin(t * TAU) * R, y, Math.cos(t * TAU) * R * (Math.cos(t * TAU) > 0 ? zs : zBack));
  const g = new THREE.TubeGeometry(c, seg, r, 8, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / 9) / seg, k = i % 9;
    const a = (k / 8) * TAU;
    const bump = 1 + 0.35 * Math.cos(a * 2 - t * twists * TAU);
    const ctr = c.getPoint(t);
    p.setXYZ(i, ctr.x + (p.getX(i) - ctr.x) * bump, ctr.y + (p.getY(i) - ctr.y) * bump, ctr.z + (p.getZ(i) - ctr.z) * bump);
  }
  g.computeVertexNormals();
  return g;
}

/** Rivets round y at radius R between angles a0..a1. */
export function rivets(R, y, n, r, zs = 1, a0 = 0, a1 = TAU) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const g = new THREE.SphereGeometry(r, 6, 2, 0, TAU, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    g.rotateY(a);
    g.translate(Math.sin(a) * R, y, Math.cos(a) * R * zs);
    out.push(g);
  }
  return out;
}

/** A band of mail: a tube from y0 down to y1 covered in tiny raised rings. */
export function mailBand(r0, r1, y0, y1, ringSize, zs = 1) {
  const h = y0 - y1;
  const rings = Math.max(4, Math.round(h / (ringSize * 0.5)));
  const rad = Math.max(24, Math.round((TAU * Math.max(r0, r1)) / (ringSize * 0.5)));
  const g = sculpt(y1, y0, (t) => r1 + (r0 - r1) * t, { rad, rings, capTop: false, capBottom: false, shape: (x, y, z) => [x, y, z * zs] });
  return relief(g, (x, y, z, a) => {
    const row = (y - y1) / (ringSize * 0.75);
    const col = (a * Math.max(r0, r1)) / (ringSize * 0.75) + (Math.floor(row) % 2) * 0.5;
    const fx = col - Math.round(col), fy = row - Math.round(row);
    const d = Math.hypot(fx, fy);
    return ringSize * 0.22 * line(d - 0.32, 0.12);
  });
}

// ------------------------------------------------------------------ the king's greatsword
/**
 * Lofted along local -y from the hand: a disc pommel set with a jewel, a wire-wound grip, a
 * cross with scrolled quillon ends and langets, a ricasso and a fullered, diamond-section
 * blade. Returns geometries; userData-free.
 */
export function ornateSword(H, len) {
  const out = [];
  const L = len * H;
  // grip, wound with wire
  const gr = new THREE.CylinderGeometry(0.0125 * H, 0.0135 * H, 0.1 * H, 20, 20);
  {
    // the grip swells a little in the middle and the leather is bound in diagonal wraps
    const p = gr.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), a = Math.atan2(p.getX(i), p.getZ(i));
      const k = 1 + 0.08 * Math.cos((y / (0.05 * H)) * Math.PI * 0.5) - 0.05 * Math.max(0, Math.cos(a * 1 - (y / (0.1 * H)) * TAU * 7)) ** 6;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    gr.computeVertexNormals();
  }
  out.push(gr);
  for (const y of [0.05, -0.048]) out.push(ropeRing(0.0145 * H, y * H, 0.0032 * H, 10, 1, 28));
  const wire = new THREE.Curve();
  wire.getPoint = (t, v = new THREE.Vector3()) => {
    const a = t * TAU * 11;
    return v.set(Math.sin(a) * 0.0138 * H, 0.048 * H - t * 0.096 * H, Math.cos(a) * 0.0138 * H);
  };
  out.push(new THREE.TubeGeometry(wire, 150, 0.0016 * H, 4, false));
  // pommel: a wheel with a raised rim and a cabochon each side
  const pom = new THREE.CylinderGeometry(0.027 * H, 0.027 * H, 0.014 * H, 48, 1);
  pom.rotateZ(Math.PI / 2);
  pom.translate(0, 0.068 * H, 0);
  out.push(pom);
  const rim = new THREE.TorusGeometry(0.027 * H, 0.004 * H, 8, 64);
  rim.rotateY(Math.PI / 2);
  rim.translate(0, 0.068 * H, 0);
  out.push(rim);
  for (const s of [-1, 1]) {
    const j = new THREE.SphereGeometry(0.011 * H, 14, 9);
    j.scale(0.55, 1, 1);
    j.translate(s * 0.008 * H, 0.068 * H, 0);
    out.push(j);
    // a collet of beads round each cabochon and a ring of beads on the wheel's face
    for (const [rr, n, br] of [[0.0128, 10, 0.0018], [0.021, 14, 0.0018]]) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const b = new THREE.SphereGeometry(br * H, 4, 3);
        b.translate(s * 0.0072 * H, 0.068 * H + Math.cos(a) * rr * H, Math.sin(a) * rr * H);
        out.push(b);
      }
    }
  }
  const btn = new THREE.SphereGeometry(0.008 * H, 10, 8);
  btn.translate(0, 0.087 * H, 0);
  out.push(btn);
  // the cross: arms that thicken toward scrolled ends
  for (const s of [-1, 1]) {
    const arm = new THREE.Curve();
    arm.getPoint = (t, v = new THREE.Vector3()) => {
      const x = s * t * 0.085 * H;
      return v.set(x, -0.052 * H + (t ** 3) * 0.012 * H, 0);
    };
    const g = new THREE.TubeGeometry(arm, 24, 0.0075 * H, 12, false);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 13) / 24, k = (0.75 + 0.6 * t) * (1 + 0.12 * Math.exp(-(((t - 0.55) / 0.06) ** 2)) + 0.12 * Math.exp(-(((t - 0.25) / 0.05) ** 2)));
      const c = arm.getPoint(t);
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
    g.computeVertexNormals();
    out.push(g);
    const scroll = new THREE.Curve();
    scroll.getPoint = (t, v = new THREE.Vector3()) => {
      const a = t * TAU * 0.9, r = 0.012 * H * (1 - 0.55 * t);
      return v.set(s * (0.085 * H + Math.sin(a) * r), -0.04 * H - (1 - Math.cos(a)) * r * 0.0 + Math.cos(a) * r - r, 0);
    };
    out.push(new THREE.TubeGeometry(scroll, 24, 0.005 * H, 8, false));
    const knob = new THREE.SphereGeometry(0.0055 * H, 12, 8);
    knob.translate(s * 0.085 * H, -0.04 * H, 0);
    out.push(knob);
  }
  // the ecusson: a lozenge block at the centre of the cross, a jewel on each face
  const block = new THREE.SphereGeometry(0.016 * H, 4, 2);
  block.scale(1.15, 1.25, 0.75);
  block.translate(0, -0.054 * H, 0);
  out.push(block);
  for (const s of [-1, 1]) {
    const jewel = new THREE.OctahedronGeometry(0.0075 * H, 1);
    jewel.scale(1, 1.3, 0.6);
    jewel.translate(0, -0.054 * H, s * 0.011 * H);
    out.push(jewel);
  }
  // langets down the blade
  for (const s of [-1, 1]) {
    const lg = new THREE.BoxGeometry(0.014 * H, 0.03 * H, 0.003 * H);
    lg.translate(0, -0.073 * H, s * 0.0055 * H);
    out.push(lg);
  }
  // the blade: lofted cross-sections; a diamond with a fuller groove, tapering to the point
  const rings = 80, cs = 20;
  const pos = [], idx = [];
  const y0 = -0.06 * H;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const w = 0.034 * H * (t < 0.08 ? 0.85 : 1) * (t > 0.8 ? Math.max(0.02, (1 - t) / 0.2) ** 0.85 : 1 - 0.18 * t);
    const th = 0.009 * H * (1 - 0.5 * t);
    const fuller = t > 0.1 && t < 0.72 ? sm(0.1, 0.16, t) * (1 - sm(0.64, 0.72, t)) : 0;
    for (let j = 0; j < cs; j++) {
      const a = (j / cs) * TAU;
      const cx = Math.cos(a), sz = Math.sin(a);
      // a lens/diamond profile
      const x = cx * w * 0.5;
      let z = Math.sign(sz) * th * 0.5 * (1 - Math.abs(cx) ** 1.2);
      // the fuller: a groove down the middle of each face
      z -= Math.sign(sz) * fuller * th * 0.38 * Math.exp(-((x / (w * 0.14)) ** 2));
      // a fine bevel line along each edge (the sharpened edge catches the light)
      z -= Math.sign(sz) * th * 0.06 * Math.exp(-(((Math.abs(x) - w * 0.38) / (w * 0.03)) ** 2));
      // a cross and a band etched into the ricasso
      if (t > 0.025 && t < 0.085) {
        const yy = (t - 0.055) * L, xx = x;
        const cr = (Math.abs(xx) < w * 0.05 && Math.abs(yy) < 0.012 * H) || (Math.abs(yy - 0.004 * H) < w * 0.05 && Math.abs(xx) < w * 0.2);
        if (cr) z += Math.sign(sz) * th * 0.12;
      }
      pos.push(x, y0 - t * L, z);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < cs; j++) {
      const a = i * cs + j, b = i * cs + ((j + 1) % cs), c = a + cs, d = b + cs;
      idx.push(a, c, b, b, c, d);
    }
  }
  const tip = pos.length / 3;
  pos.push(0, y0 - L - 0.004 * H, 0);
  for (let j = 0; j < cs; j++) idx.push(rings * cs + j, tip, rings * cs + ((j + 1) % cs));
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  out.push(blade);
  return { geos: out, tip: [0, y0 - L * 0.9, 0] };
}

// ------------------------------------------------------------------ hands
/** An armoured hand: flared, engraved cuff in three lames, a knuckle plate, articulated
 * fingers closed round a grip. s is the hand's size. */
export function gauntletHand(s, side) {
  const out = fist(s, side, { gauntlet: true });
  // a cuff of three lames close round the wrist, a roped rim at the top
  for (let i = 0; i < 3; i++) {
    const r0 = s * (0.33 + i * 0.025), r1 = s * (0.37 + i * 0.03);
    const cuff = sculpt(-0.11 * s, 0, (u) => r0 + (r1 - r0) * (1 - u), { rad: 36, rings: 4, capTop: i === 0, capBottom: false, shape: (x, y, z) => [x, y, z * 0.85] });
    cuff.translate(0, 0.2 * s - i * 0.095 * s, 0);
    out.push(cuff);
  }
  out.push(ropeRing(s * 0.37, 0.2 * s, 0.014 * s, 18, 0.85, 48));
  for (let i = 0; i < 3; i++) out.push(...rivets(s * (0.37 + i * 0.03), 0.16 * s - i * 0.095 * s, 6, 0.016 * s, 0.85));
  const plate = sculpt(-0.3 * s, 0, (t) => 0.3 * s * Math.sin(Math.PI * (0.15 + 0.7 * t)), { rad: 32, rings: 12, shape: (x, y, z) => [x * 1.1, y, z * 0.35 + 0.1 * s] });
  plate.translate(0, -0.3 * s, 0.02 * s);
  out.push(plate);
  return out;
}

/** A bare hand closed round a staff, with rings on two fingers. */
export function ladyHand(s, side) {
  const out = fist(s, side);
  for (const i of [1, 3]) {
    const r = new THREE.TorusGeometry(0.07 * s, 0.018 * s, 6, 16);
    r.rotateY(Math.PI / 2);
    r.translate((i - 1.5) * 0.15 * s, -0.56 * s, 0.17 * s);
    out.push(r);
    const gem = new THREE.OctahedronGeometry(0.035 * s, 1);
    gem.scale(1, 0.6, 1);
    gem.translate((i - 1.5) * 0.15 * s, -0.5 * s, 0.2 * s);
    out.push(gem);
  }
  return out;
}

// ------------------------------------------------------------------ crowns
/** Filigree for a crown band: S-scrolls between the fleurs, beaded rims, extra gems. */
export function crownFiligree(r, h, points) {
  const out = [];
  for (const y of [0.0, 0.44 * h]) out.push(...beadRing(r * 1.085, y, 40, h * 0.035, 1, 4));
  for (let i = 0; i < points; i++) {
    const a0 = ((i + 0.5) / points) * TAU;
    for (const s of [-1, 1]) {
      const c = new THREE.Curve();
      c.getPoint = (t, v = new THREE.Vector3()) => {
        const a = a0 + s * (0.05 + t * 0.32) * (TAU / points) * 0.9;
        const curl = Math.sin(t * Math.PI * 1.6) * 0.11 * h;
        return v.set(Math.sin(a) * r * 1.075, 0.22 * h + curl * (1 - t * 0.4) - t * 0.05 * h, Math.cos(a) * r * 1.075);
      };
      out.push(new THREE.TubeGeometry(c, 14, h * 0.018, 4, false));
    }
    const gem = new THREE.SphereGeometry(h * 0.055, 8, 6);
    gem.scale(1, 1, 0.55);
    gem.rotateY(a0);
    gem.translate(Math.sin(a0) * r * 1.09, 0.22 * h, Math.cos(a0) * r * 1.09);
    out.push(gem);
  }
  return out;
}

// ------------------------------------------------------------------ hair
/**
 * Flowing locks down the back: each lock a flattened, tapering ribbon of hair with strands
 * grooved into it, waving as it falls. y is measured from the head joint.
 */
export function flowingLocks(H, n, { top = 0.07, len = 0.32, spread = 0.062 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const a = Math.PI + (f * 2 - 1) * 1.25;
    const L = len * H * (0.82 + 0.18 * Math.sin(i * 2.3));
    const c = new THREE.Curve();
    const x0 = Math.sin(a) * spread * H, z0 = Math.cos(a) * spread * H * 0.92;
    c.getPoint = (t, v = new THREE.Vector3()) =>
      v.set(
        x0 * (1 + 0.6 * t) + Math.sin(t * 7 + i * 1.7) * 0.007 * H * t,
        top * H - t * L,
        z0 * (1 + 0.5 * t) - 0.028 * H * t * t + Math.cos(t * 6 + i) * 0.004 * H * t,
      );
    const seg = 28, rs = 8;
    const g = new THREE.TubeGeometry(c, seg, 0.012 * H, rs, false);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = Math.floor(k / (rs + 1)) / seg, j = k % (rs + 1);
      const ang = (j / rs) * TAU;
      const ctr = c.getPoint(Math.min(1, t));
      // flatten into a ribbon lying on the back, taper to a point, groove the strands
      const dx = p.getX(k) - ctr.x, dy = p.getY(k) - ctr.y, dz = p.getZ(k) - ctr.z;
      const outward = new THREE.Vector3(ctr.x, 0, ctr.z).normalize();
      const radial = dx * outward.x + dz * outward.z;
      const taper = (1 - 0.82 * t ** 1.3) * (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 4 + 0.2)));
      const groove = 1 + 0.1 * Math.cos(ang * 5 + t * 3) + 0.05 * Math.cos(ang * 11 - t * 5);
      const squash = 0.45;
      const nx = ctr.x + (dx - outward.x * radial * (1 - squash)) * taper * groove;
      const nz = ctr.z + (dz - outward.z * radial * (1 - squash)) * taper * groove;
      p.setXYZ(k, nx, ctr.y + dy * taper, nz);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

/** Strands combed back over the skull: grooves carved into a hair cap. */
export function combed(geo, H, n = 26) {
  return relief(geo, (x, y, z, a) => -0.0016 * H * (0.5 + 0.5 * Math.cos(a * n + y * 40 / H)));
}

/** One lock of hair along a path of points (head-joint frame): a tapering, grooved ribbon
 * lying flat against what it falls over (flattened toward `flat`, a direction). */
export function lockAlong(points, H, width, flat = new THREE.Vector3(0, 0, 1), { seg = 36, rs = 9 } = {}) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p).multiplyScalar(H)));
  const g = new THREE.TubeGeometry(c, seg, width * H, rs, false);
  const p = g.attributes.position;
  const f = flat.clone().normalize();
  for (let k = 0; k < p.count; k++) {
    const t = Math.floor(k / (rs + 1)) / seg, j = k % (rs + 1);
    const ctr = c.getPoint(Math.min(1, t));
    const d = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k)).sub(ctr);
    const along = d.dot(f);
    d.addScaledVector(f, -along * 0.6); // a flat ribbon
    const taper = (1 - 0.85 * t ** 1.4) * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 3 + 0.3)));
    d.multiplyScalar(taper * (1 + 0.1 * Math.cos((j / rs) * TAU * 5 + t * 4) + 0.05 * Math.cos((j / rs) * TAU * 11 - t * 6)));
    p.setXYZ(k, ctr.x + d.x, ctr.y + d.y, ctr.z + d.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A couter or poleyn: a domed boss with a thick, shell-shaped wing on the outer side and a
 * rolled rim, so it reads as forged plate, not a fin. */
export function couter(r, side, forward = true) {
  const out = [];
  const boss = new THREE.SphereGeometry(r, 28, 18);
  boss.scale(1, 1, 0.9);
  boss.translate(0, 0, forward ? r * 0.25 : -r * 0.25);
  out.push(boss);
  const wing = new THREE.SphereGeometry(r * 1.35, 32, 16, 0, Math.PI, 0, Math.PI);
  wing.scale(0.32, 1, 1);
  wing.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
  wing.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
  wing.translate(side * r * 0.7, 0, 0);
  out.push(wing);
  const rim = new THREE.TorusGeometry(r * 1.35, r * 0.09, 8, 40, Math.PI);
  rim.rotateZ(-Math.PI / 2);
  rim.rotateY(Math.PI / 2);
  rim.scale(1, 1, 1);
  rim.translate(side * r * 0.7, 0, 0);
  out.push(rim);
  return out;
}

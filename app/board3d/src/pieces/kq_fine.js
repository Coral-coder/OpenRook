// Third-pass detail for the king and queen: fur that reads as fur (locks, strands, tufted hem
// and ermine tails), rolled and furred trims along cloth edges, laminated sabatons, finger
// plates, a buckled and studded belt, fine mail, jewelled crowns with real fleurs-de-lis, and
// hem rolls. Every generator returns geometry in the local frame of the joint it hangs on.
import * as THREE from 'three';
import { sculpt } from './kq_shapes.js';
import { line, relief } from './kq_detail.js';

const TAU = Math.PI * 2;
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const frac = (x) => x - Math.floor(x);

// ------------------------------------------------------------------ noise (own copy)
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  zf = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf), yf),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf), yf),
    zf,
  );
}
export const fbm = (x, y, z = 0) => vnoise(x, y, z) * 0.6 + vnoise(x * 2.3, y * 2.3, z * 2.3) * 0.4;

// ------------------------------------------------------------------ fur
/** The fur's height at (u along the edge/round, t down the fall): locks that fall in
 * clumps, strands combed into each, and a little disorder. Returns [lift 0..1, lock 0..1]. */
function furAt(u, t, n, seed = 0) {
  const wob = (fbm(t * 1.2 + seed, u * 0.15 + seed, 1) - 0.5) * 0.8;
  const p = u + wob + t * 0.35;
  const lf = frac(p);
  const lock = Math.sin(Math.PI * lf) ** 0.5;
  const strands = 0.5 + 0.5 * Math.cos(p * TAU * 2 + fbm(u * 0.5, t * 6, 3) * 2);
  const lumpy = fbm(u * 0.7 + seed, t * 4, 5);
  return [lock * 0.74 + strands * 0.18 + lumpy * 0.08, lock, Math.floor(p)];
}

/**
 * An ermine capelet over the shoulders, falling from the neck: heavy fur in locks with combed
 * strands, the hem breaking into tufts, and rows of ermine tails (each a crisp teardrop tuft
 * set in a groove, its tip split in three) so it reads as fur, not a cone.
 */
export function ermineCape(H, { y0 = -0.075, rTop = 0.062, rEdge = 0.17, rad = 172, rings = 26, locks = 40 } = {}) {
  const R = (t) => (rTop + (rEdge - rTop) * Math.pow(t, 0.38)) * H; // t 0 neck .. 1 edge
  // ermine tails: staggered rows round the cape
  const spots = [];
  for (const [t, n, off] of [[0.42, 9, 0.25], [0.8, 12, 0.75]]) {
    for (let i = 0; i < n; i++) spots.push([((i + off) / n) * TAU + 0.07 * Math.sin(i * 3.1), t]);
  }
  const len = Math.abs(y0) * H;
  const g = sculpt(y0 * H, 0, (u) => R(1 - u), {
    rad, rings, capTop: true, capBottom: false,
    shape: (x, y, z, a, u, RR) => {
      const t = 1 - u;
      const [f, lock, li] = furAt((a / TAU) * locks, t, locks);
      let dr = 0.008 * H * f * sm(0.0, 0.12, t);
      // the ermine tails
      let sp = 0;
      for (const [sa, st] of spots) {
        let da = a - sa;
        da -= TAU * Math.round(da / TAU);
        const dx = (da * RR) / (0.011 * H), dy = ((t - st) * Math.hypot(len, (rEdge - rTop) * H)) / (0.028 * H);
        if (Math.abs(dx) > 2 || Math.abs(dy) > 1.6) continue;
        // a teardrop, broad below, pinched above; its lower end split into three points
        const w = 0.55 + 0.45 * sm(-1, 0.6, dy);
        const tri = dy > 0.55 ? 1 - 0.55 * (0.5 + 0.5 * Math.cos(dx * 7.5)) * sm(0.55, 1, dy) : 1;
        const r = Math.hypot(dx / w, dy) / tri;
        sp = Math.max(sp, r < 1 ? 1 - 0.3 * r * r : 0);
        sp = Math.min(sp, r >= 1 && r < 1.2 ? -0.35 * Math.sin(Math.PI * (r - 1) / 0.2) : sp);
        // strands on the tail itself
        if (r < 1) sp -= 0.18 * (0.5 + 0.5 * Math.cos(dx * 9 + dy * 2));
      }
      // where a tail lies the fur is combed flat round it, the tail stands proud
      if (sp !== 0) dr = dr * 0.35 + 0.0105 * H * sp;
      // the hem breaks into rounded hanging tufts of uneven length
      let dy2 = 0;
      if (t > 0.8) dy2 = -0.016 * H * lock ** 0.7 * (0.55 + 0.45 * hash(li, 3.1, 7.7)) * sm(0.8, 1, t);
      const k = (RR + dr) / Math.max(1e-6, RR);
      return [x * k, y + dy2, z * k * (Math.cos(a) > 0 ? 0.78 : 0.9)];
    },
  });
  return g;
}

/** Fur relief laid over any surface parameterised by (u around, t down): used on trims. */
export function furTube(points, r, H, { seg = 120, rs = 14, locks = 1.0, closed = false, flatten = null } = {}) {
  const c = new THREE.CatmullRomCurve3(points, closed);
  const g = new THREE.TubeGeometry(c, seg, r, rs, closed);
  const p = g.attributes.position;
  const L = c.getLength();
  const per = Math.max(4, Math.round(L / (0.012 * H * locks)));
  for (let k = 0; k < p.count; k++) {
    const i = Math.floor(k / (rs + 1)), j = k % (rs + 1);
    const t = i / seg;
    const ctr = c.getPoint(t);
    const ang = (j / rs) * TAU;
    // locks run across the trim (round the tube), clumped along it
    const [f] = furAt(t * per + ang / TAU * 0.6, 0.5 + 0.5 * Math.sin(ang), per, 7);
    const s = 0.82 + 0.38 * f;
    let dx = (p.getX(k) - ctr.x) * s, dy = (p.getY(k) - ctr.y) * s, dz = (p.getZ(k) - ctr.z) * s;
    if (flatten) {
      const d = dx * flatten.x + dy * flatten.y + dz * flatten.z;
      dx -= flatten.x * d * 0.35;
      dy -= flatten.y * d * 0.35;
      dz -= flatten.z * d * 0.35;
    }
    p.setXYZ(k, ctr.x + dx, ctr.y + dy, ctr.z + dz);
  }
  g.computeVertexNormals();
  return g;
}

/** A rolled hem or piping: a tube through points, with a twisted cord if `twist` > 0. */
export function rollTube(points, r, { seg = 160, rs = 8, closed = false, twist = 0 } = {}) {
  const c = new THREE.CatmullRomCurve3(points, closed);
  const g = new THREE.TubeGeometry(c, seg, r, rs, closed);
  if (twist) {
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const i = Math.floor(k / (rs + 1)), j = k % (rs + 1);
      const t = i / seg, ctr = c.getPoint(t);
      const b = 1 + 0.3 * Math.cos((j / rs) * TAU * 2 - t * twist * TAU);
      p.setXYZ(k, ctr.x + (p.getX(k) - ctr.x) * b, ctr.y + (p.getY(k) - ctr.y) * b, ctr.z + (p.getZ(k) - ctr.z) * b);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** The inside of an open shell (a sleeve, a hood): a copy set back along the normals by
 * `thick` and turned to face inward, so the cloth has a lining when seen from within. */
export function lining(geo, thick) {
  const g = geo.clone();
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * thick, p.getY(i) - n.getY(i) * thick, p.getZ(i) - n.getZ(i) * thick);
  const ix = g.index.array;
  for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
  g.computeVertexNormals();
  return g;
}

/** The ring of vertices at row `row` of a sculpt()/gown() surface (rad+1 per row). */
export function rowOf(geo, rad, row, every = 1, push = 0) {
  const p = geo.attributes.position, out = [];
  for (let j = 0; j < rad; j += every) {
    const k = row * (rad + 1) + j;
    const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
    if (push) {
      const l = Math.hypot(v.x, v.z) || 1;
      v.x += (v.x / l) * push;
      v.z += (v.z / l) * push;
    }
    out.push(v);
  }
  return out;
}

// ------------------------------------------------------------------ hair
/**
 * Hair falling over the sides and back of the head from under the crown to the nape, covering
 * the ears and framing the face: a shell round the skull (an ellipsoid rx, ry, rz centred at cy)
 * open at the front between +-a0, combed into waved strands, its front edge rolled under and
 * its lower edge breaking into locks.
 */
export function hairShell(H, { cy = 0.05, rx = 0.053, ry = 0.071, rz = 0.062, a0 = 0.95, top = 0.1, bottom = -0.01, lift = 0.009, cols = 168, rows = 28 } = {}) {
  const pos = [], idx = [];
  const span = TAU - 2 * a0;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows; // 0 bottom .. 1 top
    for (let j = 0; j <= cols; j++) {
      const u = j / cols, a = a0 + span * u;
      // the lower edge falls in locks, longer behind
      const back = 0.5 - 0.5 * Math.cos(a);
      const yb = bottom - 0.03 * back - 0.008 * Math.abs(Math.sin(a * 9)) ** 0.6;
      const y = (yb + (top - yb) * t) * H;
      const v = (y / H - cy) / ry, c = Math.sqrt(Math.max(0.04, 1 - v * v));
      // fuller over the ears, combed strands, tucked in at the front edges and the ends
      const edge = Math.min(u, 1 - u);
      const wv = 1.6 * Math.sin(t * 3.5 + a * 2);
      const strands = 0.0028 * (Math.abs(Math.cos(a * 13 + wv)) ** 0.5 - 0.6) + 0.0008 * Math.cos(a * 37 + wv * 2);
      let L = lift + 0.006 * Math.exp(-(((y / H - cy + 0.005) / 0.03) ** 2)) * Math.sin(Math.min(1, edge * 6) * Math.PI / 2) + strands;
      L *= 0.35 + 0.65 * Math.min(1, edge * 14) * Math.min(1, t * 6 + 0.25);
      pos.push(Math.sin(a) * (rx * c + L) * H, y, Math.cos(a) * (rz * c + L) * H);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + cols + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ armour
/**
 * A sabaton: one lofted shell from heel to toe, flat-soled, with an instep that rises to the
 * greave, five overlapping lames stepping down over the toes, a medial ridge and a pointed toe
 * cap. Bounds match the old box sabaton (w wide, h tall, l long, centred at y).
 */
export function sabaton(w, h, l, y) {
  const z0 = -0.1 * l, z1 = 0.98 * l;
  const g = sculpt(z0, z1, (t) => 1, {
    rad: 28, rings: 48,
    shape: (x, yy, z, a, t) => {
      const sa = Math.sin(a), ca = Math.cos(a);
      const env = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95))), 0.45);
      let hw = 0.5 * w * env * (t > 0.7 ? 1 - 0.45 * sm(0.7, 1, t) : 1);
      let top = h * (0.62 + 0.75 * Math.exp(-(((t - 0.17) / 0.17) ** 2)) - 0.3 * sm(0.45, 1, t)) * env;
      const bot = h * 0.5 * Math.min(1, env * 1.6);
      // the lames: each one flares toward its lower (forward) edge, over the next
      const lt = (t - 0.34) * 9;
      if (lt > 0 && lt < 5) {
        const f = frac(lt);
        const step = 0.16 * f * f - (f > 0.9 ? 0.16 * (f - 0.9) / 0.1 : 0);
        top *= 1 + step;
        hw *= 1 + step * 0.6;
      }
      // the medial ridge
      if (ca < 0) top += h * 0.07 * Math.exp(-((sa / 0.18) ** 2)) * sm(0.3, 0.6, t);
      const px = sa * hw;
      const pz = ca > 0 ? ca * bot * 0.25 : ca * top; // local z becomes -y after rotation
      return [px, yy, pz];
    },
  });
  g.rotateX(Math.PI / 2);
  // the sole: lift so its underside sits at the old base
  g.translate(0, y - h * 0.5 + h * 0.5 * 0.25, 0);
  g.computeVertexNormals();
  return [g];
}

/** A belt round y: a flat strap following the body (zs), set with studs, a framed buckle and
 * its tongue at the front, and the tip of the strap hanging from it. */
export function beltFine(R, y, zs, H, { studs = 14, width = 0.018 } = {}) {
  const out = [];
  const W = width * H;
  const strap = sculpt(-W / 2, W / 2, () => R, { rad: 80, rings: 4, capTop: false, capBottom: false, shape: (x, yy, z, a, t) => {
    const k = 1 + 0.035 * Math.sin(Math.PI * t);
    return [x * k, yy, z * zs * k];
  } });
  strap.translate(0, y, 0);
  out.push(strap);
  for (let i = 0; i < studs; i++) {
    const a = ((i + 0.5) / studs) * TAU;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35) continue; // not under the buckle
    // a quatrefoil stud: four domes round a centre
    for (let k = 0; k < 5; k++) {
      const d = k === 4 ? 0 : 0.0042 * H, ka = (k / 4) * TAU;
      const s = new THREE.SphereGeometry(k === 4 ? 0.0032 * H : 0.0026 * H, 6, 3, 0, TAU, 0, Math.PI / 2);
      s.rotateX(Math.PI / 2);
      s.translate(Math.cos(ka) * d, Math.sin(ka) * d, 0);
      s.rotateY(a);
      s.translate(Math.sin(a) * R * 1.03, y, Math.cos(a) * R * zs * 1.03);
      out.push(s);
    }
  }
  // the buckle: a rounded frame with a centre bar and a tongue
  const fz = R * zs * 1.04, bw = 0.03 * H, bh = 0.028 * H;
  const frame = new THREE.CatmullRomCurve3([
    [-bw / 2, -bh / 2], [0, -bh / 2 - 0.003 * H], [bw / 2, -bh / 2], [bw / 2 + 0.003 * H, 0], [bw / 2, bh / 2], [0, bh / 2 + 0.003 * H], [-bw / 2, bh / 2], [-bw / 2 - 0.003 * H, 0],
  ].map(([a, b]) => new THREE.Vector3(a, b + y, fz + 0.004 * H)), true);
  out.push(new THREE.TubeGeometry(frame, 64, 0.0028 * H, 8, true));
  const bar = new THREE.CylinderGeometry(0.0022 * H, 0.0022 * H, bh, 8);
  bar.translate(-bw * 0.12, y, fz + 0.004 * H);
  out.push(bar);
  const tongue = new THREE.CylinderGeometry(0.0018 * H, 0.0012 * H, bw * 0.55, 6);
  tongue.rotateZ(Math.PI / 2);
  tongue.translate(bw * 0.14, y, fz + 0.007 * H);
  out.push(tongue);
  // the strap's end, through the buckle and hanging down with a chape
  const end = new THREE.BoxGeometry(W * 0.9, 0.05 * H, 0.004 * H, 2, 6, 1);
  const ep = end.attributes.position;
  for (let i = 0; i < ep.count; i++) ep.setZ(i, ep.getZ(i) + ((ep.getY(i) / (0.05 * H)) ** 2) * 0.004 * H);
  end.computeVertexNormals();
  end.translate(bw * 0.62, y - 0.022 * H, fz + 0.002 * H);
  out.push(end);
  const chape = new THREE.SphereGeometry(W * 0.5, 10, 6);
  chape.scale(1, 0.7, 0.35);
  chape.translate(bw * 0.62, y - 0.048 * H, fz + 0.004 * H);
  out.push(chape);
  return out;
}

/** Fine riveted mail: a tube from y0 down to y1 (radius r0 at the top, r1 below) covered in
 * interlocking rings, four vertices across each so the rings read. */
export function mailFine(r0, r1, y0, y1, ringSize, { zs = 1, zFront = zs, arc = null, res = 0.25 } = {}) {
  const h = y0 - y1;
  const rings = Math.max(6, Math.round(h / (ringSize * res)));
  const rad = Math.max(32, Math.round((TAU * Math.max(r0, r1)) / (ringSize * res)));
  const g = sculpt(y1, y0, (t) => r1 + (r0 - r1) * t, {
    rad, rings, capTop: false, capBottom: false,
    shape: (x, y, z, a) => [x, y, z * (Math.cos(a) > 0 ? zFront : zs)],
  });
  const R = Math.max(r0, r1);
  if (arc) {
    // keep only the front, where it shows
    const ix = g.index.array, p = g.attributes.position, keep = [];
    for (let k = 0; k < ix.length; k += 3) {
      const x = p.getX(ix[k]) + p.getX(ix[k + 1]) + p.getX(ix[k + 2]), z = p.getZ(ix[k]) + p.getZ(ix[k + 1]) + p.getZ(ix[k + 2]);
      if (Math.abs(Math.atan2(x, z)) < arc) keep.push(ix[k], ix[k + 1], ix[k + 2]);
    }
    g.setIndex(keep);
  }
  return relief(g, (x, y, z, a) => {
    const row = (y - y1) / (ringSize * 0.62);
    const ri = Math.floor(row + 0.5);
    const col = (a * R) / (ringSize * 0.75) + (ri % 2 ? 0.5 : 0);
    const fx = col - Math.round(col), fy = row - ri;
    // each ring a torus seen face-on, tilted so the rows overlap like scales
    const d = Math.hypot(fx, fy * 1.15);
    return ringSize * 0.3 * (line(d - 0.3, 0.1) - 0.25) + ringSize * 0.08 * fy;
  });
}

// ------------------------------------------------------------------ crowns
/**
 * A fine crown: a band with an engraved lozenge diaper, set with alternating oval and lozenge
 * stones in beaded collets; roped rims; true fleurs-de-lis (a ribbed centre petal and two
 * curling side petals bound by a band) with pearls; and small pearl spikes between them.
 * Optionally two pearled arches carrying a monde and a cross pattée.
 */
export function crownFine(r, h, { points = 8, arches = false } = {}) {
  const out = [];
  const band = sculpt(0, h * 0.42, () => r, {
    rad: 112, rings: 10, capTop: false, capBottom: false,
    shape: (x, y, z, a, t) => [x * (1 + 0.04 * t), y, z * (1 + 0.04 * t)],
  });
  relief(band, (x, y, z, a) => {
    const u = (a / TAU) * points * 4, v = (y / (h * 0.42)) * 2 - 1;
    const d1 = Math.abs(frac(u + v * 0.5) - 0.5), d2 = Math.abs(frac(u - v * 0.5) - 0.5);
    return -0.012 * h * Math.max(line(d1, 0.05), line(d2, 0.05)) * (Math.abs(v) < 0.75 ? 1 : 0);
  });
  out.push(band);
  // inner face of the band so it has thickness from above
  const inner = sculpt(0, h * 0.42, () => r * 0.94, { rad: 64, rings: 1, capTop: false, capBottom: false });
  const ii = inner.index.array;
  for (let k = 0; k < ii.length; k += 3) [ii[k + 1], ii[k + 2]] = [ii[k + 2], ii[k + 1]];
  inner.computeVertexNormals();
  out.push(inner);
  const rope = (y, rr, R) => {
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU;
      pts.push(new THREE.Vector3(Math.sin(a) * R, y, Math.cos(a) * R));
    }
    return rollTube(pts, rr, { seg: 112, rs: 5, closed: true, twist: 40 });
  };
  out.push(rope(0.03 * h, h * 0.055, r * 1.035), rope(0.43 * h, h * 0.05, r * 1.055));
  const fleurGeo = fleurDeLis(h);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const x = Math.sin(a) * r * 1.05, z = Math.cos(a) * r * 1.05;
    for (const fg0 of fleurGeo) {
      const fg = fg0.clone();
      fg.rotateY(a);
      fg.translate(x, h * 0.42, z);
      out.push(fg);
    }
    // a stone set in a collet of beads between each pair of fleurs
    const b = a + Math.PI / points;
    const oval = i % 2 === 0;
    const st = oval ? new THREE.SphereGeometry(h * 0.075, 14, 10) : new THREE.OctahedronGeometry(h * 0.085, 1);
    st.scale(oval ? 0.8 : 0.8, oval ? 1.15 : 1.25, 0.5);
    st.rotateY(b);
    st.translate(Math.sin(b) * r * 1.06, h * 0.22, Math.cos(b) * r * 1.06);
    out.push(st);
    for (let k = 0; k < 8; k++) {
      const ka = (k / 8) * TAU;
      const bd = new THREE.SphereGeometry(h * 0.024, 4, 3);
      bd.translate(Math.cos(ka) * h * 0.085, Math.sin(ka) * h * 0.11, 0);
      bd.rotateY(b);
      bd.translate(Math.sin(b) * r * 1.055, h * 0.22, Math.cos(b) * r * 1.055);
      out.push(bd);
    }
    // a small pearl spike above it
    const sp = new THREE.ConeGeometry(h * 0.04, h * 0.3, 8);
    sp.translate(Math.sin(b) * r * 1.05, h * 0.57, Math.cos(b) * r * 1.05);
    out.push(sp);
    const pe = new THREE.SphereGeometry(h * 0.055, 10, 6);
    pe.translate(Math.sin(b) * r * 1.05, h * 0.74, Math.cos(b) * r * 1.05);
    out.push(pe);
  }
  if (arches) {
    const top = h * 0.45 + r * 0.92;
    for (let i = 0; i < 2; i++) {
      const pts = [];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, a = Math.PI * t;
        pts.push(new THREE.Vector3(Math.cos(a) * r * 0.99, h * 0.45 + Math.sin(a) * r * 0.92 * (1 - 0.12 * Math.sin(a) ** 4), 0));
      }
      const arch = rollTube(pts, h * 0.05, { seg: 60, rs: 7 });
      arch.rotateY((i * Math.PI) / 2);
      out.push(arch);
      for (let k = 1; k < 14; k++) {
        if (k === 7) continue;
        const pt = pts[Math.round((k / 14) * 40)];
        const pe = new THREE.SphereGeometry(h * 0.04, 6, 4);
        pe.translate(pt.x * 1.0, pt.y + h * 0.045, pt.z);
        pe.rotateY((i * Math.PI) / 2);
        out.push(pe);
      }
    }
    // the monde: an orb with its girdle and a meridian, and a cross pattée
    const orb = new THREE.SphereGeometry(h * 0.16, 22, 14);
    orb.translate(0, top + h * 0.12, 0);
    out.push(orb);
    for (const rx of [Math.PI / 2, 0]) {
      const t = new THREE.TorusGeometry(h * 0.165, h * 0.022, 6, 40);
      t.rotateX(rx);
      t.translate(0, top + h * 0.12, 0);
      out.push(t);
    }
    const cs = new THREE.Shape();
    const A = h * 0.17, B = h * 0.045, C = h * 0.1;
    cs.moveTo(-B, -A * 0.3);
    for (const [px, py] of [[-B * 0.6, -B], [-C, -B * 1.4], [-C, B * 1.4], [-B * 0.6, B], [-B, A], [B, A], [B * 0.6, B], [C, B * 1.4], [C, -B * 1.4], [B * 0.6, -B], [B, -A * 0.3]]) cs.lineTo(px, py);
    const cross = new THREE.ExtrudeGeometry(cs, { depth: h * 0.03, bevelEnabled: true, bevelThickness: h * 0.012, bevelSize: h * 0.01, bevelSegments: 2 });
    cross.translate(0, top + h * 0.12 + h * 0.16 + A * 0.32, -h * 0.015);
    out.push(cross);
  }
  return out;
}

/** A fleur-de-lis standing on the band (built facing +z at the origin). */
export function fleurDeLis(h) {
  const out = [];
  // the centre petal: a ribbed spear-shaped leaf
  const sh = new THREE.Shape();
  sh.moveTo(-h * 0.1, 0);
  sh.bezierCurveTo(-h * 0.2, h * 0.22, -h * 0.16, h * 0.5, 0, h * 0.86);
  sh.bezierCurveTo(h * 0.16, h * 0.5, h * 0.2, h * 0.22, h * 0.1, 0);
  sh.lineTo(-h * 0.1, 0);
  const c = new THREE.ExtrudeGeometry(sh, { depth: h * 0.04, bevelEnabled: true, bevelThickness: h * 0.03, bevelSize: h * 0.025, bevelSegments: 1, curveSegments: 7 });
  c.translate(0, 0, -h * 0.02);
  // a midrib and a swelling to the front
  const cp = c.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    if (z > 0) cp.setZ(i, z + h * 0.035 * Math.exp(-((x / (h * 0.03)) ** 2)) * Math.sin(Math.PI * Math.min(1, y / (h * 0.86))) + h * 0.02 * Math.cos(x / (h * 0.12)));
  }
  c.computeVertexNormals();
  out.push(c);
  // the side petals: flat leaves that rise outward and droop to a point, bevelled like the centre
  for (const sd of [-1, 1]) {
    const ps = new THREE.Shape();
    const P2 = (x, y) => [sd * x * h, y * h];
    ps.moveTo(...P2(0.05, 0.1));
    ps.bezierCurveTo(...P2(0.08, 0.3), ...P2(0.2, 0.42), ...P2(0.3, 0.38));
    ps.bezierCurveTo(...P2(0.4, 0.34), ...P2(0.4, 0.2), ...P2(0.33, 0.08));
    ps.bezierCurveTo(...P2(0.33, 0.18), ...P2(0.3, 0.26), ...P2(0.24, 0.27));
    ps.bezierCurveTo(...P2(0.17, 0.28), ...P2(0.12, 0.2), ...P2(0.1, 0.1));
    ps.lineTo(...P2(0.05, 0.1));
    const pg = new THREE.ExtrudeGeometry(ps, { depth: h * 0.035, bevelEnabled: true, bevelThickness: h * 0.025, bevelSize: h * 0.02, bevelSegments: 1, curveSegments: 6 });
    pg.translate(0, 0, -h * 0.018);
    pg.computeVertexNormals();
    out.push(pg);
  }
  // the band binding the three
  const bd = new THREE.CylinderGeometry(h * 0.13, h * 0.13, h * 0.06, 12, 1);
  bd.scale(1, 1, 0.45);
  bd.translate(0, h * 0.16, 0);
  out.push(bd);
  const pearl = new THREE.SphereGeometry(h * 0.07, 10, 6);
  pearl.translate(0, h * 0.92, 0);
  out.push(pearl);
  return out;
}

// ------------------------------------------------------------------ hands
/** Finger plates over a gauntlet's curled fingers: three overlapping scales per finger and
 * knuckle gadlings. Matches the finger curves in fist(). */
export function fingerPlates(s, side) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const fx = (i - 1.5) * 0.15 * s;
    const L = (0.36 - Math.abs(i - 1.2) * 0.04) * s;
    const pt = (t) => {
      const a = t * Math.PI * 1.1;
      return new THREE.Vector3(fx, -0.5 * s - Math.sin(a) * L * 0.55, Math.cos(a) * L * 0.55 - L * 0.55 + 0.18 * s);
    };
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3, t1 = (k + 1) / 3 + 0.04;
      const cv = new THREE.CatmullRomCurve3([pt(t0), pt((t0 + t1) / 2), pt(t1)]);
      const g = new THREE.TubeGeometry(cv, 4, 0.085 * s, 10, false);
      const p = g.attributes.position;
      for (let q = 0; q < p.count; q++) {
        const t = Math.floor(q / 11) / 4, ctr = cv.getPoint(t);
        const f = 1.0 + 0.12 * t - 0.1 * (t > 0.85 ? (t - 0.85) / 0.15 : 0);
        p.setXYZ(q, ctr.x + (p.getX(q) - ctr.x) * f, ctr.y + (p.getY(q) - ctr.y) * f, ctr.z + (p.getZ(q) - ctr.z) * f);
      }
      g.computeVertexNormals();
      out.push(g);
    }
    // a gadling: a small pointed boss on each knuckle
    const gd = new THREE.ConeGeometry(0.04 * s, 0.09 * s, 6);
    gd.rotateX(Math.PI / 2 + 0.5);
    const k0 = pt(0.02);
    gd.translate(k0.x, k0.y + 0.02 * s, k0.z + 0.1 * s);
    out.push(gd);
  }
  return out;
}

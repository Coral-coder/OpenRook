// The bishop's finer work (third pass): the mitre's corded edges, pearled circulus and
// embroidered scrolls; the crozier's carved volute, the shrine's lancet niches with their
// saints; bushy brows; a jewelled pectoral cross on a chain.
import * as THREE from 'three';
import { cord, latheGrid, pearls, rope, setOn } from './bp_fine.js';
import { gem } from './bp_kit.js';

const TAU = Math.PI * 2;

/** Corded edges, pearls and embroidered scrolls on both faces of the mitre. */
export function mitreFine(P, mitre, H, mw, mh) {
  const zf = (x, y) => {
    const t = y / mh;
    return 0.041 * H * (1 - 0.75 * t * t) - (x / mw) ** 2 * 0.012 * H;
  };
  const edge = new THREE.CubicBezierCurve(new THREE.Vector2(-mw, 0), new THREE.Vector2(-mw * 1.08, mh * 0.45), new THREE.Vector2(-mw * 0.55, mh * 0.8), new THREE.Vector2(0, mh));
  for (const zs of [1, -1]) {
    const line = (inset, y0, lift) => {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const q = edge.getPoint(t);
        if (q.y < y0) continue;
        const x = q.x * inset, y = q.y * (0.985 - (1 - inset) * 0.5);
        pts.push(new THREE.Vector3(x, y, zs * (zf(x, y) + lift)));
      }
      const rev = pts.slice(0, -1).reverse().map((v) => new THREE.Vector3(-v.x, v.y, v.z));
      return pts.concat(rev);
    };
    P.add(mitre, rope(line(0.93, 0.03 * H, 0.0015 * H), 0.0034 * H, { twist: 260, radial: 6, perPt: 1.2 }));
    const inner = line(0.8, 0.034 * H, 0.0012 * H);
    const c = new THREE.CatmullRomCurve3(inner);
    const pp = [];
    for (let i = 0; i <= 36; i++) pp.push(c.getPointAt(i / 36));
    P.add(mitre, pearls(pp, 0.0022 * H));
    // scrolls: a curling vine either side of the titulus, with leaves
    for (const sx of [-1, 1]) {
      for (const [cx, cy, rr, turn] of [[0.034, 0.05, 0.011, 1], [0.026, 0.085, 0.009, -1], [0.018, 0.115, 0.006, 1]]) {
        const pts = [];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const a = turn * sx * (t * TAU * 1.15) + (sx > 0 ? 0 : Math.PI);
          const r = rr * H * (1 - 0.7 * t);
          const x = sx * cx * H + Math.cos(a) * r, y = cy * H + Math.sin(a) * r;
          pts.push(new THREE.Vector3(x, y, zs * (zf(x, y) + 0.001 * H)));
        }
        P.add(mitre, cord(pts, 0.0017 * H, { radial: 5, perPt: 1, taper: 0.5 }));
        // a leaf at the vine's outer turn, and a berry in the curl
        const lf = pts[3];
        const leaf = new THREE.SphereGeometry(0.0055 * H, 8, 6);
        leaf.scale(0.55, 1.2, 0.3);
        P.add(mitre, leaf, lf.x + sx * 0.003 * H, lf.y + 0.004 * H, lf.z + zs * 0.001 * H, 0, 0, -sx * 0.8);
        const end = pts[pts.length - 1];
        P.add(mitre, pearls([end.clone().setZ(end.z + zs * 0.0012 * H)], 0.0026 * H, { w: 8, h: 6 }));
      }
      // a stem linking the scrolls
      const stem = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = sx * (0.04 - 0.024 * t) * H + sx * Math.sin(t * 6) * 0.004 * H, y = (0.035 + 0.09 * t) * H;
        stem.push(new THREE.Vector3(x, y, zs * (zf(x, y) + 0.001 * H)));
      }
      P.add(mitre, cord(stem, 0.0014 * H, { radial: 5, perPt: 2 }));
    }
    // pearls along the circulus' edges
    for (const y of [0.0265]) {
      const pts = [];
      for (let i = 0; i < 22; i++) {
        const a = ((i + 0.5) / 22) * Math.PI - Math.PI / 2;
        pts.push(new THREE.Vector3(Math.sin(a) * 0.0665 * H, y * H, zs * Math.cos(a) * 0.0665 * H * 0.66));
      }
      P.add(mitre, pearls(pts, 0.0024 * H));
    }
  }
}

/** The crook's carved fillets, and the shrine's lancet niches with little standing saints. */
export function crozierFine(P, cr, H, spiral, R0) {
  const q = new THREE.Vector3();
  for (const zs of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * 0.97;
      spiral.getPoint(t, q);
      pts.push(new THREE.Vector3(q.x, q.y + 0.33 * H, zs * 0.0098 * H * (1 - 0.45 * t)));
    }
    P.add(cr, cord(pts, 0.0021 * H, { radial: 6, perPt: 1.5, taper: 0.4 }));
  }
  // a beaded ridge on the inside of the curl
  const inner = [];
  for (let i = 0; i <= 34; i++) {
    const t = 0.05 + (i / 34) * 0.85;
    spiral.getPoint(t, q);
    const a = t * Math.PI * 1.85;
    const rr = 0.0108 * H * (1 - 0.45 * t);
    inner.push(new THREE.Vector3(q.x - Math.cos(a) * rr, q.y + 0.33 * H - Math.sin(a) * rr, 0));
  }
  P.add(cr, pearls(inner, 0.0022 * H, { w: 7, h: 5 }));
  // the shrine (node at y 0.245 H): a lancet niche on each face, a saint standing in it
  const ny = 0.245 * H;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const g = new THREE.Group();
    setOn(g, new THREE.Vector3(Math.sin(a) * 0.0232 * H, ny, Math.cos(a) * 0.0232 * H), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
    cr.add(g);
    const w = 0.0065 * H;
    const arch = [new THREE.Vector3(-w, -0.016 * H, 0.003 * H), new THREE.Vector3(-w, 0.004 * H, 0.003 * H), new THREE.Vector3(-w * 0.55, 0.012 * H, 0.003 * H), new THREE.Vector3(0, 0.0165 * H, 0.003 * H), new THREE.Vector3(w * 0.55, 0.012 * H, 0.003 * H), new THREE.Vector3(w, 0.004 * H, 0.003 * H), new THREE.Vector3(w, -0.016 * H, 0.003 * H)];
    P.add(g, cord(arch, 0.0014 * H, { radial: 5, perPt: 3 }));
    const body = new THREE.CapsuleGeometry(0.0028 * H, 0.012 * H, 3, 8);
    body.scale(1, 1, 0.7);
    P.add(g, body, 0, -0.006 * H, 0.0035 * H);
    P.add(g, new THREE.SphereGeometry(0.0026 * H, 8, 6), 0, 0.0048 * H, 0.0038 * H);
  }
  // pinnacled crestwork round the top of the shrine
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    P.add(cr, new THREE.ConeGeometry(0.0025 * H, 0.009 * H, 6), Math.sin(a) * 0.024 * H, ny + 0.03 * H, Math.cos(a) * 0.024 * H);
  }
}

/** Bushy eyebrows: tufts of tapering hair over each eye, sweeping out and down. */
export function browTufts(P, head, r, cx, cy, cz) {
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      const x0 = s * r * (0.1 + 0.42 * u), y0 = r * (0.29 + 0.06 * Math.sin(u * Math.PI) - 0.02 * k / 6);
      const z0 = r * (0.95 - 0.28 * u * u);
      const pts = [
        new THREE.Vector3(cx + x0, cy + y0, cz + z0),
        new THREE.Vector3(cx + x0 + s * r * 0.11, cy + y0 + r * (0.04 - 0.01 * k), cz + z0 + r * 0.04 - r * 0.06 * u),
        new THREE.Vector3(cx + x0 + s * r * 0.22, cy + y0 + r * (0.0 - 0.02 * k), cz + z0 - r * 0.14 * u),
      ];
      P.add(head, cord(pts, r * 0.06, { radial: 6, perPt: 3, taper: 0.75 }));
    }
  }
}

/** A jewelled cross on a twisted chain over the chasuble's front. */
export function pectoral(P, chest, H, ch) {
  const G = latheGrid(ch, ...ch.userData.grid);
  const { p: c, n } = G.at(Math.PI / 2, 0.062 * H);
  const g = new THREE.Group();
  setOn(g, c.clone().addScaledVector(n, 0.006 * H), n);
  chest.add(g);
  const L = 0.026 * H, t = 0.007 * H;
  for (const [x, y, w, h] of [[0, 0.004 * H, t, L * 2.2], [0, 0.012 * H, L * 1.6, t]]) {
    const bx = new THREE.BoxGeometry(w, h, 0.005 * H, 2, 4, 1);
    P.add(g, bx, x, y, 0);
  }
  // budded ends with pearls, a jewel at the crossing
  for (const [x, y] of [[0, 0.004 * H + L * 1.1], [0, 0.004 * H - L * 1.1], [L * 0.8, 0.012 * H], [-L * 0.8, 0.012 * H]]) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + Math.atan2(y - 0.008 * H, x) - Math.PI / 3;
      P.add(g, new THREE.SphereGeometry(0.0034 * H, 10, 8), x + Math.cos(a) * 0.003 * H, y + Math.sin(a) * 0.003 * H, 0.001 * H);
    }
  }
  gem(P, g, 0.0055 * H, 0, 0.012 * H, 0.003 * H);
  // the chain, round the neck under the amice
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const { p: q, n: nn } = G.at(Math.PI / 2 + s * (0.55 - 0.55 * u), (0.125 - 0.025 * u * u) * H - 0.012 * H * Math.sin(u * Math.PI));
      pts.push(q.addScaledVector(nn, 0.004 * H));
    }
    pts.push(c.clone().addScaledVector(n, 0.006 * H).add(new THREE.Vector3(0, 0.04 * H, 0)));
    P.add(chest, rope(pts, 0.0022 * H, { twist: 260, radial: 6, perPt: 4 }));
  }
}

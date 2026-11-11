// The casters' spells: the bishop's, the rook's, the king's and the queen's (her wormhole is in
// wormhole.js). Everything here is cheap: camera-facing ribbons (one draw each) for bolts,
// chains, whips and cracks, glow sprites and the shared particles, a few small meshes; one
// light, added once at start-up (a new light would recompile every material).
//
//   bishop: lightning   a forked arc from the crozier; the victim seizes, arcs crawl over it
//           chains      chains of light rise from the board, coil round the victim and crush it
//           levitate    lifted off its square, turning helplessly, then slammed down
//   queen:  ice         a lance of ice; frost creeps up the stone from the wound; it shatters
//           crush       a telekinetic grip: lifted, squeezed until it crumbles
//           whip        a whip of fire that lashes and coils round it; it burns from within
//   king:   shockwave   a stamp that sends a ripple through the board's squares; it is flung down
//           petrify     a grey beam: the stone dies, cracks and crumbles
//           swords      conjured swords rain down round it and into it
//   rook:   quake       the tower slams down; a fissure runs along the squares to the victim
//           spikes      stone spikes burst up out of the board under it
//           bolts       the battlements loose a volley of bolts that arc into it
//   any defender of these four may raise a ward: a bubble that takes the spell and cracks.
//
// main.js plans the fight around SPELL (which move casts it, when it lands, when it kills) and
// gets callbacks: onImpact(at) when it lands, onKill(how, at) when the victim should come apart
// (how: a Breakup kind).
import * as THREE from 'three';
import { glowSprite } from './battle.js';
import { sfx } from './sfx.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);
const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Each spell: the move that casts it, when it lands (s after it is loosed), when it kills. */
export const SPELL = {
  lightning: { who: 3, move: 'castFwd', impact: 0.05, kill: 0.85, how: 'burst', color: [0xbfe4ff, 0xe2b8ff] },
  chains: { who: 3, move: 'castUp', impact: 0.55, kill: 1.6, how: 'crumble', color: [0xffe6a0, 0xd8a8ff] },
  levitate: { who: 3, move: 'castUp', impact: 0.2, kill: 1.75, how: 'crush', color: [0xbfe4ff, 0xc890ff] },
  ice: { who: 5, move: 'castFwd', impact: 0.22, kill: 1.25, how: 'shatter', color: [0xbff0ff, 0xa8d8ff] },
  crush: { who: 5, move: 'castUp', impact: 0.25, kill: 1.35, how: 'crumble', color: [0xd0a0ff, 0xb070ff] },
  whip: { who: 5, move: 'whip', impact: 0.16, kill: 1.25, how: 'burst', color: [0xffa040, 0xff6a30] },
  shockwave: { who: 6, move: 'stomp', impact: 0.18, kill: 0.95, how: 'crush', color: [0xffe0a8, 0xd8b0ff] },
  petrify: { who: 6, move: 'castFwd', impact: 0.25, kill: 1.55, how: 'crumble', color: [0xc8c8b8, 0xa8a8a0] },
  swords: { who: 6, move: 'castUp', impact: 0.75, kill: 1.45, how: 'burst', color: [0xfff0c0, 0xe0c0ff] },
  quake: { who: 4, move: 'stomp', impact: 0.5, kill: 1.0, how: 'crumble', color: [0xff8a30, 0xff6a40] },
  spikes: { who: 4, move: 'stomp', impact: 0.32, kill: 0.42, how: 'burst', color: [0xffd0a0, 0xffb080] },
  bolts: { who: 4, move: 'castFwd', impact: 0.42, kill: 0.95, how: 'burst', color: [0xffe0a0, 0xffc070] },
};
export const SPELLS_OF = { 3: ['lightning', 'chains', 'levitate'], 4: ['quake', 'spikes', 'bolts'], 5: ['ice', 'crush', 'whip'], 6: ['shockwave', 'petrify', 'swords'] };

// ------------------------------------------------------------------ shared things
let S = null; // { scene, camera, particles, light, squares, tex, mats, geos }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Sets up the shared light, textures and materials (call once, before the first frame). */
export function prepareSpells(scene, camera, particles, squares) {
  if (S) return S;
  const light = new THREE.PointLight(0xffffff, 0, 5, 1.6);
  scene.add(light);
  const tex = {
    // a glowing line: bright core, soft edges across its width
    beam: canvasTex(8, 64, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(0.65, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }),
    // a chain of light: links along its length
    chain: canvasTex(64, 32, (x, w, h) => {
      x.strokeStyle = 'rgba(255,255,255,1)';
      x.lineWidth = 5;
      x.beginPath();
      x.ellipse(16, 16, 13, 8, 0, 0, Math.PI * 2);
      x.stroke();
      x.lineWidth = 6;
      x.beginPath();
      x.moveTo(34, 16);
      x.lineTo(62, 16);
      x.stroke();
    }),
    // a crack in the board: dark core, glowing lips
    fissure: canvasTex(8, 64, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,120,30,0)');
      g.addColorStop(0.3, 'rgba(255,140,40,0.9)');
      g.addColorStop(0.45, 'rgba(20,8,4,1)');
      g.addColorStop(0.55, 'rgba(20,8,4,1)');
      g.addColorStop(0.7, 'rgba(255,140,40,0.9)');
      g.addColorStop(1, 'rgba(255,120,30,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }),
  };
  const add = (map, color = 0xffffff) => new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mats = {
    frost: frostMaterial(),
    ice: new THREE.MeshStandardMaterial({ color: 0xd8f4ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.8, emissive: 0x4a9ad0, emissiveIntensity: 0.6 }),
    spike: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.85, metalness: 0 }),
    sword: new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    ward: wardMaterial(),
    fissure: new THREE.MeshBasicMaterial({ map: tex.fissure, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const geos = {
    spike: new THREE.ConeGeometry(0.07, 0.62, 6, 1).translate(0, 0.31, 0),
    lance: new THREE.OctahedronGeometry(0.06, 0).scale(0.7, 6, 0.7),
    shard: new THREE.TetrahedronGeometry(0.035),
    sword: (() => {
      const blade = new THREE.BoxGeometry(0.04, 0.42, 0.012).translate(0, -0.21, 0);
      const guard = new THREE.BoxGeometry(0.13, 0.022, 0.022);
      const grip = new THREE.BoxGeometry(0.018, 0.1, 0.018).translate(0, 0.06, 0);
      const g = new THREE.BufferGeometry();
      const parts = [blade, guard, grip].map((x) => x.toNonIndexed());
      const pos = [];
      for (const p of parts) pos.push(...p.attributes.position.array);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return g;
    })(),
    ward: new THREE.SphereGeometry(1, 24, 16),
  };
  // compile every new material once, out of sight, on the first frames (no hitch mid-fight)
  const warm = new THREE.Group();
  for (const [k, m] of Object.entries(mats)) {
    const mesh = new THREE.Mesh(k === 'frost' ? new THREE.BoxGeometry(0.01, 0.01, 0.01) : geos.shard, m);
    mesh.frustumCulled = false;
    mesh.position.set(0, -3, 0);
    warm.add(mesh);
  }
  for (const t of Object.values(tex)) {
    const mesh = new THREE.Mesh(geos.shard, add(t));
    mesh.frustumCulled = false;
    mesh.position.set(0, -3, 0);
    warm.add(mesh);
  }
  scene.add(warm);
  S = { scene, camera, particles, light, squares, tex, mats, geos, add, warm, warmFrames: 4, busyLight: 0 };
  return S;
}

/** Per frame, before the spells (takes the warm-up meshes away after a few frames). */
export function tickSpells() {
  if (S && S.warm && --S.warmFrames <= 0) {
    S.scene.remove(S.warm);
    S.warm = null;
  }
}

// ------------------------------------------------------------------ ribbons
// A strip of quads through a list of points that always faces the camera (or lies flat on
// the board): bolts, chains, whips, cracks. One draw call.
class Ribbon {
  constructor(n, material, flat = false) {
    this.n = n;
    this.flat = flat;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2 * 2), 2));
    const idx = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    S.scene.add(this.mesh);
  }
  set(pts, width, uScale = 1) {
    const g = this.mesh.geometry, P = g.attributes.position.array, U = g.attributes.uv.array;
    const cam = S.camera.position;
    const n = Math.min(this.n, pts.length);
    let len = 0;
    for (let i = 0; i < this.n; i++) {
      const j = Math.min(i, n - 1);
      const p = pts[j];
      const a = pts[Math.max(0, j - 1)], b = pts[Math.min(n - 1, j + 1)];
      _t.subVectors(b, a);
      if (this.flat) _s.set(-_t.z, 0, _t.x);
      else _s.crossVectors(_t, _v.subVectors(cam, p));
      _s.normalize().multiplyScalar((typeof width === 'function' ? width(j / Math.max(1, n - 1)) : width) * 0.5);
      if (i > 0 && j > 0) len += pts[j].distanceTo(pts[j - 1]);
      P.set([p.x + _s.x, p.y + _s.y, p.z + _s.z, p.x - _s.x, p.y - _s.y, p.z - _s.z], i * 6);
      U.set([len * uScale, 0, len * uScale, 1], i * 4);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
  }
  dispose() {
    S.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
const _t = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();

// a jagged path from a to b (lightning), [n] points, [amp] how far it strays
function jag(a, b, n, amp) {
  const out = [];
  const d = b.clone().sub(a);
  const side = V(d.z, 0, -d.x).normalize();
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  const up = d.clone().cross(side).normalize();
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const p = a.clone().addScaledVector(d, k);
    const e = Math.sin(Math.PI * k) * amp;
    if (i > 0 && i < n - 1) p.addScaledVector(side, rnd(-e, e)).addScaledVector(up, rnd(-e, e));
    out.push(p);
  }
  return out;
}

function flashAt(at, color, power) {
  S.light.position.copy(at);
  S.light.color.set(color);
  S.light.intensity = Math.max(S.light.intensity, power);
}

// the victim's stone glows from within (fire, frost, lightning): emissive only, no recompiling
function glow(fig, color, k) {
  for (const m of fig.materials) {
    if (!m.emissive) continue;
    m.emissive.set(color);
    m.emissiveIntensity = k;
  }
}

// ------------------------------------------------------------------ the frost shell
function frostMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xe4f6ff, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88, emissive: 0x3c86c8, emissiveIntensity: 0.55, depthWrite: false });
  m.userData.uniforms = { uLevel: { value: 0 }, uPush: { value: 0.006 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = 'uniform float uPush;\nvarying float vWy;\nvarying vec3 vWp;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normal * uPush;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 wq = modelMatrix * vec4(transformed, 1.0); vWy = wq.y; vWp = wq.xyz;');
    sh.fragmentShader = 'uniform float uLevel;\nvarying float vWy;\nvarying vec3 vWp;\n' + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float fr = fract(sin(dot(floor(vWp * 90.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        if (vWy > uLevel + 0.03 * fr) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.5, 0.8, 1.0) * smoothstep(uLevel - 0.05, uLevel, vWy) * 1.2;
        diffuseColor.rgb *= 0.85 + 0.3 * fr;`);
  };
  m.customProgramCacheKey = () => 'openrook-frost';
  return m;
}
// the frost shell over every stone part of a figure (rides on its joints)
function frostOver(fig) {
  const list = [];
  fig.model.traverse((o) => {
    if (o.isMesh && !o.userData.decal && o.visible && !o.userData.frost) {
      const f = new THREE.Mesh(o.geometry, S.mats.frost);
      f.userData.frost = true;
      f.userData.decal = true; // (not a part of the statue: the rubble leaves it be)
      f.renderOrder = 2;
      o.add(f);
      list.push(f);
    }
  });
  return list;
}

// ------------------------------------------------------------------ the ward
function wardMaterial() {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0x8fd0ff) }, uOpacity: { value: 0 }, uHit: { value: V(0, 0, 1) }, uCrack: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() { vP = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform vec3 uHit; uniform float uCrack; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float fres = pow(1.0 - abs(dot(vN, vV)), 2.2);
        // hexagonal shimmer
        vec2 q = vec2(atan(vP.z, vP.x) * 4.0, vP.y * 7.0 + uTime * 0.4);
        float hex = smoothstep(0.42, 0.5, abs(fract(q.x + 0.5 * floor(q.y)) - 0.5) + abs(fract(q.y) - 0.5) * 0.6);
        // cracks running out from where it was struck
        float d = acos(clamp(dot(vP, normalize(uHit)), -1.0, 1.0));
        float ang = atan(dot(vP, cross(uHit, vec3(0.0, 1.0, 0.0))), vP.y);
        float rays = pow(abs(sin(ang * 7.0 + h(floor(vec2(ang * 7.0, 1.0))) * 3.0)), 40.0);
        float crack = uCrack * step(d, uCrack * 2.6) * (rays + smoothstep(0.25, 0.0, d) * 0.6);
        float a = (0.12 + fres * 0.9 + hex * 0.12) * uOpacity + crack * 1.4;
        gl_FragColor = vec4(uColor * (1.0 + crack * 1.5), a);
      }`,
  });
  return m;
}

/** A ward raised by [fig]: a shimmering bubble round it. crack(at) when a spell strikes it, shatter(). */
export function makeWard(fig, white) {
  const m = S.mats.ward.clone();
  m.uniforms.uColor.value.set(white ? 0x8fd0ff : 0xd09cff);
  const mesh = new THREE.Mesh(S.geos.ward, m);
  const h = fig.height || 1;
  mesh.scale.set(0.52, h * 0.62, 0.52);
  mesh.renderOrder = 6;
  S.scene.add(mesh);
  let t = 0, up = 0, gone = false, shatterT = -1;
  sfx('magic_shield', { vol: 0.8 });
  const w = {
    mesh,
    crack(at) {
      const c = fig.group.position.clone().setY(h * 0.55);
      m.uniforms.uHit.value.copy(at).sub(c).normalize();
      m.uniforms.uCrack.value = Math.min(1, m.uniforms.uCrack.value + 0.45);
      S.particles.burst(at, { color: white ? 0xbfe4ff : 0xe0b8ff, n: 20, speed: 2, up: 0.5, size: 0.06, life: 0.4, gravity: 1 });
      flashAt(at, white ? 0xbfe4ff : 0xe0b8ff, 10);
      sfx('magic_impact', { vol: 0.8 });
    },
    shatter() {
      if (shatterT >= 0) return;
      shatterT = t;
      sfx('ice_shatter', { vol: 0.6 });
      const c = fig.group.position.clone().setY(h * 0.55);
      for (let i = 0; i < 3; i++) S.particles.burst(c, { color: white ? 0xbfe4ff : 0xe0b8ff, n: 16, speed: 2.6, up: 0.6, size: 0.07, life: 0.55, gravity: 3 });
    },
    drop() {
      gone = true;
    },
    update(dt) {
      t += dt;
      m.uniforms.uTime.value = t;
      mesh.position.copy(fig.group.position).setY(h * 0.55);
      up = gone || shatterT >= 0 ? up - dt * (shatterT >= 0 ? 6 : 2.5) : Math.min(1, up + dt * 5);
      m.uniforms.uOpacity.value = Math.max(0, up);
      if (shatterT >= 0) mesh.scale.multiplyScalar(1 + dt * 2.5);
      if (up <= 0 && (gone || shatterT >= 0)) {
        S.scene.remove(mesh);
        m.dispose();
        return false;
      }
      return true;
    },
  };
  return w;
}

// ------------------------------------------------------------------ the spells
// o: { from() (where it is cast from, live), to (the point on the victim it strikes),
//      victim (its fig), caster (fig), white, kill, ward (a ward that takes it), onImpact(at),
//      onKill(how, at) }
export function castSpell(kind, o) {
  const f = SPELLS[kind];
  const spec = SPELL[kind];
  const color = spec.color[o.white ? 0 : 1];
  const fx = f(o, color, spec);
  let fired = false, killed = false, t = 0;
  // the shared timeline: the impact, and (when it kills) the moment it comes apart
  return {
    update(dt) {
      t += dt;
      const alive = fx.update(dt, t);
      if (!fired && t >= spec.impact) {
        fired = true;
        const at = o.ward ? o.to.clone().lerp(o.from(), 0.3) : o.to.clone();
        if (o.ward) o.ward.crack(at);
        o.onImpact?.(at);
        fx.impact?.(at);
      }
      if (o.kill && !o.ward && !killed && t >= spec.kill) {
        killed = true;
        fx.kill?.();
        o.onKill?.(spec.how, o.to.clone());
      }
      S.light.intensity = Math.max(0, S.light.intensity - dt * 60);
      return alive || t < Math.max(spec.impact, o.kill ? spec.kill : 0) + 0.05;
    },
  };
}

const SPELLS = {
  // ---- a forked arc from the crozier; with a kill, arcs crawl over the seizing victim
  lightning(o, color) {
    const main = new Ribbon(14, S.add(S.tex.beam, color));
    const forks = [new Ribbon(7, S.add(S.tex.beam, color)), new Ribbon(7, S.add(S.tex.beam, color))];
    const crawl = new Ribbon(9, S.add(S.tex.beam, 0xffffff));
    let next = 0, life = o.kill && !o.ward ? 1.0 : 0.45;
    sfx('spell_charge', { vol: 0.6 });
    sfx('lightning');
    return {
      update(dt, t) {
        if (t >= next) {
          next = t + 0.045;
          const a = o.from(), b = o.ward ? o.to.clone().lerp(a, 0.3) : o.to;
          const path = jag(a, b, 14, 0.18);
          main.set(path, 0.05);
          for (const [i, fk] of forks.entries()) {
            const at = path[4 + i * 4];
            const end = at.clone().lerp(b, 0.6).add(V(rnd(-0.35, 0.35), rnd(-0.4, 0.05), rnd(-0.35, 0.35)));
            fk.set(jag(at, end, 7, 0.08), 0.025);
          }
          if (o.kill && !o.ward && t > 0.1 && o.victim) {
            // arcs over the body
            const c = o.victim.group.position, h = o.victim.height || 1;
            const p0 = c.clone().add(V(rnd(-0.15, 0.15), rnd(0.1, h), rnd(-0.15, 0.15)));
            const p1 = c.clone().add(V(rnd(-0.15, 0.15), rnd(0.05, h), rnd(-0.15, 0.15)));
            crawl.set(jag(p0, p1, 9, 0.06), 0.02);
            glow(o.victim, color, 0.18 + 0.12 * Math.random());
          }
          flashAt(b, color, 14);
          S.particles.burst(b, { color, n: 3, speed: 1.4, up: 0.4, size: 0.05, life: 0.25, gravity: 0 });
        }
        const vis = Math.sin(t * 70) > -0.4;
        main.mesh.visible = forks[0].mesh.visible = forks[1].mesh.visible = vis && t < Math.min(life, 0.5);
        crawl.mesh.visible = vis && t > 0.1 && t < life;
        if (t > life) {
          for (const r of [main, ...forks, crawl]) r.dispose();
          if (o.victim) glow(o.victim, 0x000000, 0);
          return false;
        }
        return true;
      },
      impact(at) {
        S.particles.burst(at, { color, n: 26, speed: 2.6, up: 0.6, size: 0.06, life: 0.35 });
      },
    };
  },

  // ---- chains of light rise out of the board, coil round the victim and tighten
  chains(o, color, spec) {
    const n = 3, links = [];
    for (let i = 0; i < n; i++) links.push(new Ribbon(28, new THREE.MeshBasicMaterial({ map: S.tex.chain, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    const c = (o.victim ? o.victim.group.position : o.to).clone().setY(0);
    const h = o.victim?.height || 1;
    const end = o.kill && !o.ward ? spec.kill + 0.1 : 1.5;
    sfx('spell_charge', { vol: 0.7 });
    let held = false;
    return {
      update(dt, t) {
        const grow = smooth(clamp01(t / 0.55));
        const tight = o.ward ? 0 : smooth(clamp01((t - 0.55) / 0.8));
        for (let i = 0; i < n; i++) {
          const pts = [];
          const a0 = (i / n) * Math.PI * 2 + t * 0.6;
          const r0 = o.ward ? 0.55 : 0.36 - 0.17 * tight;
          for (let j = 0; j < 28; j++) {
            const k = (j / 27) * grow;
            const a = a0 + k * 6.5 * (i % 2 ? 1 : -1);
            const r = r0 * (1 - 0.15 * Math.sin(k * 9 + t * 3));
            pts.push(c.clone().add(V(Math.cos(a) * r, 0.02 + k * h * 0.92, Math.sin(a) * r)));
          }
          links[i].set(pts, 0.045, 10);
          links[i].mesh.material.opacity = t > end - 0.25 ? clamp01((end - t) / 0.25) : 1;
        }
        if (!held && t > 0.55 && o.victim && !o.ward) {
          held = true;
          o.onHold?.('bound');
          sfx('stone_crack', { vol: 0.5 });
        }
        if (t > 0.6 && Math.random() < 0.3) S.particles.burst(c.clone().setY(rnd(0.1, h)), { color, n: 1, speed: 0.4, up: 0.2, size: 0.05, life: 0.4, gravity: 0 });
        if (t > end) {
          for (const r of links) {
            r.dispose();
            r.mesh.material.dispose();
          }
          if (!o.kill || o.ward) S.particles.burst(c.clone().setY(h * 0.5), { color, n: 30, speed: 2, up: 0.5, size: 0.06, life: 0.5, gravity: 2 });
          return false;
        }
        return true;
      },
    };
  },

  // ---- lifted off its square in a column of light, turning, then slammed down
  levitate(o, color, spec) {
    const v = o.victim;
    const ring = new Ribbon(33, S.add(S.tex.beam, color), true);
    const home = v ? v.group.position.clone() : o.to.clone().setY(0);
    const spin0 = v ? v.group.rotation.y : 0;
    const kill = o.kill && !o.ward;
    const top = kill ? 1.15 : 0.55;
    const slamAt = kill ? spec.kill - 0.18 : 1.25;
    sfx('telekinesis', { vol: 0.7 });
    let slammed = false;
    return {
      update(dt, t) {
        const pts = [];
        const r = 0.42 + 0.05 * Math.sin(t * 8);
        for (let i = 0; i <= 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          pts.push(home.clone().add(V(Math.cos(a) * r, 0.015, Math.sin(a) * r)));
        }
        ring.set(pts, 0.08);
        ring.mesh.material.opacity = t < slamAt ? 1 : clamp01(1 - (t - slamAt) / 0.3);
        if (v && !o.ward) {
          if (t < slamAt) {
            const k = smooth(clamp01((t - 0.15) / 0.9));
            v.group.position.y = home.y + top * k + 0.04 * Math.sin(t * 5) * k;
            v.group.rotation.y = spin0 + 1.4 * k * Math.sin(t * 1.3);
            if (Math.random() < 0.5) S.particles.burst(home.clone().add(V(rnd(-0.3, 0.3), rnd(0, v.group.position.y + 0.5), rnd(-0.3, 0.3))), { color, n: 1, speed: 0.2, up: 0.6, size: 0.06, life: 0.6, gravity: -0.5 });
          } else {
            const k = clamp01((t - slamAt) / 0.16);
            v.group.position.y = Math.max(home.y, (home.y + top) * (1 - k * k));
            if (k >= 1 && !slammed) {
              slammed = true;
              o.onSlam?.(home.clone());
              sfx('body_fall');
            }
          }
        }
        if (t > slamAt + 0.35) {
          ring.dispose();
          if (v && v.group.parent) v.group.position.y = home.y;
          return false;
        }
        return true;
      },
    };
  },

  // ---- a lance of ice; frost creeps up the stone; it freezes, then shatters
  ice(o, color, spec) {
    const lance = new THREE.Mesh(S.geos.lance, S.mats.ice);
    S.scene.add(lance);
    const v = o.victim;
    const kill = o.kill && !o.ward;
    let frost = null;
    const start = o.from();
    const flight = spec.impact;
    sfx('ice_form', { vol: 0.8 });
    return {
      update(dt, t) {
        const k = clamp01(t / flight);
        const b = o.ward ? o.to.clone().lerp(start, 0.3) : o.to;
        if (k < 1) {
          lance.position.lerpVectors(start, b, k);
          lance.position.y += Math.sin(Math.PI * k) * 0.12;
          lance.lookAt(b);
          lance.rotateX(Math.PI / 2);
          if (Math.random() < 0.7) S.particles.burst(lance.position, { color, n: 1, speed: 0.2, up: 0, size: 0.05, life: 0.3, gravity: 0 });
        } else if (!kill) {
          lance.visible = false;
        }
        if (frost) {
          const u = S.mats.frost.userData.uniforms.uLevel;
          const top = (v.height || 1) * (kill ? 1.05 : 0.55);
          u.value = v.group.position.y + top * smooth(clamp01((t - flight) / (kill ? 0.75 : 0.5)));
          glow(v, 0x4aa8ff, 0.2 * smooth(clamp01((t - flight) / 0.6)));
          if (!kill && t > flight + 1.1) u.value = Math.max(0, u.value - (t - flight - 1.1) * 1.5);
        }
        const end = kill ? spec.kill + 0.02 : flight + 1.6;
        if (t > end) {
          S.scene.remove(lance);
          if (frost) for (const f of frost) f.parent?.remove(f);
          if (v) glow(v, 0x000000, 0);
          return false;
        }
        return true;
      },
      impact(at) {
        sfx(o.ward ? 'ice_shatter' : 'ice_form');
        for (let i = 0; i < 2; i++) S.particles.burst(at, { color, n: 14, speed: 1.8, up: 0.5, size: 0.05, life: 0.5, gravity: 4 });
        if (v && !o.ward) {
          frost = frostOver(v);
          S.mats.frost.userData.uniforms.uLevel.value = v.group.position.y;
          o.onHold?.('frozen');
        } else lance.visible = false;
      },
      kill() {
        sfx('ice_shatter');
        lance.visible = false;
        const c = v.group.position.clone().setY((v.height || 1) * 0.5);
        for (let i = 0; i < 3; i++) S.particles.burst(c, { color: 0xe8f8ff, n: 18, speed: 2.8, up: 1, size: 0.06, life: 0.7, gravity: 6, solid: true });
      },
    };
  },

  // ---- a telekinetic grip: the victim is lifted a little and squeezed until it crumbles
  crush(o, color, spec) {
    const v = o.victim;
    const kill = o.kill && !o.ward;
    const sprites = [];
    for (let i = 0; i < 10; i++) {
      const s = glowSprite(color, 0.16);
      S.scene.add(s);
      sprites.push(s);
    }
    const home = v ? v.group.position.clone() : o.to.clone();
    const inner = v?.parts.inner;
    sfx('telekinesis');
    const end = kill ? spec.kill + 0.05 : 1.25;
    return {
      update(dt, t) {
        const h = v?.height || 1;
        const grip = smooth(clamp01((t - 0.15) / (kill ? 1.0 : 0.5))) * (kill ? 1 : t < 0.8 ? 1 : clamp01((1.25 - t) / 0.45));
        sprites.forEach((s, i) => {
          const a = t * (4 + (i % 3)) + i * 2.1;
          const r = 0.45 - 0.2 * grip;
          s.position.copy(home).add(V(Math.cos(a) * r, 0.1 + ((i * 0.37 + t * 0.6) % 1) * h, Math.sin(a) * r));
          s.material.opacity = Math.min(1, t * 4) * (t > end - 0.2 ? clamp01((end - t) / 0.2) : 1);
        });
        if (v && inner && !o.ward && v.group.parent) {
          const j = 0.012 * grip * Math.sin(t * 60);
          inner.scale.set(1 - 0.22 * grip + j, 1 - 0.07 * grip, 1 - 0.22 * grip - j);
          v.group.position.y = home.y + 0.12 * grip;
          if (Math.random() < 0.25 * grip) o.onChip?.(v.group.position.clone().setY(rnd(0.2, h)));
        }
        if (t > end) {
          for (const s of sprites) {
            S.scene.remove(s);
            s.material.dispose();
          }
          if (inner) inner.scale.set(1, 1, 1);
          if (v && v.group.parent) v.group.position.y = home.y;
          return false;
        }
        return true;
      },
      kill() {
        if (inner) inner.scale.set(1, 1, 1);
        if (v) v.group.position.y = home.y;
        flashAt(home.clone().setY(0.6), color, 16);
      },
    };
  },

  // ---- a whip of fire: drawn back, lashed out, coiled round the victim
  whip(o, color, spec) {
    const rope = new Ribbon(30, S.add(S.tex.beam, color));
    const core = new Ribbon(30, S.add(S.tex.beam, 0xfff0c0));
    const v = o.victim;
    const kill = o.kill && !o.ward;
    sfx('fire_whoosh');
    const end = kill ? spec.kill + 0.05 : 0.9;
    return {
      update(dt, t) {
        const a = o.from(), b = o.ward ? o.to.clone().lerp(a, 0.3) : o.to.clone();
        const reach = smooth(clamp01(t / spec.impact));
        const pts = [];
        const d = b.clone().sub(a);
        const side = V(d.z, 0, -d.x).normalize();
        for (let i = 0; i < 30; i++) {
          const k = (i / 29) * reach;
          const p = a.clone().addScaledVector(d, k);
          // the wave running down the whip as it cracks out
          p.y += Math.sin(Math.PI * k) * 0.35 * (1 - reach * 0.7) + Math.sin(k * 14 - t * 30) * 0.03;
          p.addScaledVector(side, Math.sin(k * 6 - t * 18) * 0.06 * (1 - reach * 0.5));
          if (kill && t > spec.impact && v && k > 0.75) {
            // coiled round the body
            const c = v.group.position, h = v.height || 1;
            const u = (k - 0.75) / 0.25, ang = u * 14 + t * 6;
            p.lerp(c.clone().add(V(Math.cos(ang) * 0.24, h * (0.3 + u * 0.4), Math.sin(ang) * 0.24)), smooth(clamp01((t - spec.impact) / 0.25)));
          }
          pts.push(p);
        }
        rope.set(pts, (k) => 0.15 * (1 - 0.55 * k));
        core.set(pts, (k) => 0.055 * (1 - 0.55 * k));
        const fade = t > end - 0.2 ? clamp01((end - t) / 0.2) : 1;
        rope.mesh.material.opacity = core.mesh.material.opacity = fade;
        if (Math.random() < 0.8) S.particles.burst(pts[(Math.random() * 30) | 0], { color, n: 1, speed: 0.4, up: 0.6, size: 0.05, life: 0.5, gravity: -1 });
        if (kill && v && t > spec.impact) {
          glow(v, 0xff5010, 0.45 * smooth(clamp01((t - spec.impact) / 0.7)) * (0.8 + 0.2 * Math.random()));
          if (Math.random() < 0.6) S.particles.burst(v.group.position.clone().add(V(rnd(-0.15, 0.15), rnd(0.1, v.height || 1), rnd(-0.15, 0.15))), { color: 0xff8a30, n: 1, speed: 0.3, up: 1, size: 0.06, life: 0.6, gravity: -1.5 });
          flashAt(v.group.position.clone().setY(0.6), 0xff7020, 6);
        }
        if (t > end) {
          rope.dispose();
          core.dispose();
          if (v) glow(v, 0x000000, 0);
          return false;
        }
        return true;
      },
      impact(at) {
        sfx('fire_whoosh', { rate: 1.3 });
        S.particles.burst(at, { color, n: 24, speed: 2, up: 0.8, size: 0.06, life: 0.45 });
        flashAt(at, color, 14);
      },
    };
  },

  // ---- a stamp that ripples through the board's squares; the victim is thrown down
  shockwave(o, color, spec) {
    const c = o.caster.group.position.clone().setY(0);
    const ring = new Ribbon(49, S.add(S.tex.beam, color), true);
    const base = S.squares.map((m) => m.position.y);
    sfx('shockwave');
    let r = 0;
    return {
      update(dt, t) {
        r = t * 5.2;
        const pts = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          pts.push(c.clone().add(V(Math.cos(a) * r, 0.02, Math.sin(a) * r)));
        }
        ring.set(pts, 0.3 * (1 - clamp01(t / 1.2)));
        ring.mesh.material.opacity = 1 - clamp01(t / 1.2);
        // the squares heave as the wave passes under them
        S.squares.forEach((m, i) => {
          const d = Math.hypot(m.position.x - c.x, m.position.z - c.z);
          const x = (d - r) / 0.45;
          m.position.y = base[i] + 0.12 * Math.exp(-x * x) * Math.max(0, 1 - t / 1.4) * Math.min(1, d);
        });
        if (Math.random() < 0.6) S.particles.burst(c.clone().add(V(rnd(-1, 1) * r * 0.7, 0.05, rnd(-1, 1) * r * 0.7)), { color: 0xcfc3ae, n: 1, speed: 0.4, up: 0.4, size: 0.12, life: 0.6, gravity: 0.5, solid: true });
        if (t > 1.45) {
          ring.dispose();
          S.squares.forEach((m, i) => (m.position.y = base[i]));
          return false;
        }
        return true;
      },
      impact(at) {
        flashAt(at.clone().setY(0.4), color, 10);
      },
    };
  },

  // ---- a grey beam: the stone of the victim dies, dries and cracks, then crumbles
  petrify(o, color, spec) {
    const beam = new Ribbon(12, S.add(S.tex.beam, color));
    const v = o.victim;
    const kill = o.kill && !o.ward;
    const u = v?.materials[0]?.userData?.uniforms?.uRot;
    const r0 = u ? u.value : 0;
    sfx('spell_charge');
    const end = kill ? spec.kill + 0.02 : 0.9;
    return {
      update(dt, t) {
        const a = o.from(), b = o.ward ? o.to.clone().lerp(a, 0.3) : o.to;
        const k = clamp01(t / spec.impact);
        beam.set(jag(a, a.clone().lerp(b, k), 12, 0.02), 0.07 + 0.02 * Math.sin(t * 40));
        beam.mesh.material.opacity = t > end - 0.3 ? clamp01((end - t) / 0.3) : 1;
        if (kill && v && u && t > spec.impact) {
          const p = smooth(clamp01((t - spec.impact) / 1.0));
          u.value = r0 + (1 - r0) * p;
          glow(v, 0x30302a, 0.4 * p);
          if (Math.random() < 0.35) o.onChip?.(v.group.position.clone().setY(rnd(0.1, v.height || 1)));
          if (Math.random() < 0.06) sfx('stone_crack', { vol: 0.5 });
        }
        if (t > end) {
          beam.dispose();
          if (v) glow(v, 0x000000, 0);
          return false;
        }
        return true;
      },
      impact(at) {
        S.particles.burst(at, { color: 0xb8b0a0, n: 18, speed: 1.2, up: 0.5, size: 0.08, life: 0.7, gravity: 1, solid: true });
        if (!o.ward) o.onHold?.('frozen');
      },
    };
  },

  // ---- conjured swords rain down round the victim and into it
  swords(o, color, spec) {
    const c = (o.victim ? o.victim.group.position : o.to).clone().setY(0);
    const h = o.victim?.height || 1;
    const kill = o.kill && !o.ward;
    const n = 7;
    const list = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(S.geos.sword, S.mats.sword.clone());
      m.material.color.set(color);
      const hitsIt = kill ? i >= n - 3 : false;
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const r = hitsIt ? rnd(0.0, 0.08) : o.ward ? 0.6 : rnd(0.28, 0.55);
      const to = c.clone().add(V(Math.cos(a) * r, hitsIt ? h * rnd(0.45, 0.75) : 0.12, Math.sin(a) * r));
      const from = to.clone().add(V(rnd(-0.2, 0.2), 1.9 + rnd(0, 0.4), rnd(-0.2, 0.2)));
      m.position.copy(from);
      m.scale.setScalar(0.001);
      S.scene.add(m);
      list.push({ m, from, to, t0: 0.15 + i * 0.09 + (hitsIt ? 0.12 : 0), landed: false });
    }
    sfx('spell_charge', { vol: 0.8 });
    const end = Math.max(kill ? spec.kill : 0, 1.9);
    return {
      update(dt, t) {
        for (const s of list) {
          const appear = smooth(clamp01(t / 0.3));
          s.m.scale.setScalar(Math.max(0.001, appear * 1.6));
          const k = clamp01((t - 0.35 - s.t0) / 0.22);
          s.m.position.lerpVectors(s.from, s.to, k * k);
          s.m.lookAt(s.m.position.clone().add(s.from.clone().sub(s.to)));
          s.m.rotateX(Math.PI / 2);
          if (k >= 1 && !s.landed) {
            s.landed = true;
            S.particles.burst(s.to, { color, n: 10, speed: 1.4, up: 0.6, size: 0.05, life: 0.35 });
            sfx(s.to.y > 0.2 ? 'stab' : 'sword_hit_stone', { vol: 0.5 });
            if (o.ward) o.ward.crack(s.to);
          }
          s.m.material.opacity = t > end - 0.4 ? clamp01((end - t) / 0.4) * 0.9 : 0.9;
        }
        if (t > end) {
          for (const s of list) {
            S.scene.remove(s.m);
            s.m.material.dispose();
          }
          return false;
        }
        return true;
      },
    };
  },

  // ---- the tower slams down; a fissure runs along the squares to the victim and opens under it
  quake(o, color, spec) {
    const a = o.caster.group.position.clone().setY(0.012);
    const b = (o.victim ? o.victim.group.position : o.to).clone().setY(0.012);
    const crack = new Ribbon(18, S.mats.fissure.clone(), true);
    const path = jag(a, b, 18, 0.0);
    // (wander about the line on the board only)
    const d = b.clone().sub(a), side = V(d.z, 0, -d.x).normalize();
    path.forEach((p, i) => i > 0 && p.addScaledVector(side, rnd(-0.08, 0.08)));
    const base = S.squares.map((m) => m.position.y);
    sfx('earthquake');
    const end = Math.max(o.kill ? spec.kill + 0.4 : 0, 1.8);
    return {
      update(dt, t) {
        const k = smooth(clamp01(t / spec.impact));
        const n = Math.max(2, Math.ceil(k * 18));
        crack.set(path.slice(0, n), (u) => 0.05 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.2)));
        crack.mesh.material.opacity = t > end - 0.6 ? clamp01((end - t) / 0.6) : 1;
        // the squares along it jolt
        S.squares.forEach((m, i) => {
          const p = path[Math.min(n - 1, 17)];
          const near = Math.hypot(m.position.x - p.x, m.position.z - p.z) < 0.7 && t < spec.impact + 0.6;
          m.position.y = base[i] + (near ? rnd(-0.015, 0.015) : 0);
        });
        if (t < spec.impact && Math.random() < 0.7) S.particles.burst(path[n - 1], { color: 0xcfc3ae, n: 2, speed: 0.6, up: 0.9, size: 0.12, life: 0.7, gravity: 1, solid: true });
        if (t > end) {
          crack.dispose();
          crack.mesh.material.dispose();
          S.squares.forEach((m, i) => (m.position.y = base[i]));
          return false;
        }
        return true;
      },
      impact(at) {
        flashAt(at.clone().setY(0.2), 0xff8a30, 12);
        for (let i = 0; i < 2; i++) S.particles.burst(b, { color: 0xcfc3ae, n: 10, speed: 1.2, up: 1.2, size: 0.14, life: 0.9, gravity: 1.5, solid: true });
      },
    };
  },

  // ---- stone spikes burst up out of the board under the victim
  spikes(o, color, spec) {
    const c = (o.victim ? o.victim.group.position : o.to).clone().setY(0);
    const kill = o.kill && !o.ward;
    const list = [];
    const n = kill ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(S.geos.spike, S.mats.spike);
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const r = kill ? (i === 0 ? 0 : rnd(0.12, 0.3)) : rnd(0.35, 0.55);
      m.position.copy(c).add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
      m.rotation.set(rnd(-0.35, 0.35), 0, rnd(-0.35, 0.35));
      const s = kill ? (i === 0 ? 1.7 : rnd(0.8, 1.3)) : rnd(0.6, 1.0);
      m.userData.s = s;
      m.scale.set(s, 0.001, s);
      m.castShadow = true;
      S.scene.add(m);
      list.push({ m, t0: spec.impact - 0.12 + i * 0.03 });
    }
    sfx('earthquake', { vol: 0.6 });
    const end = 2.4;
    return {
      update(dt, t) {
        for (const s of list) {
          const up = smooth(clamp01((t - s.t0) / 0.1));
          const down = clamp01((t - 1.7) / 0.7);
          s.m.scale.y = Math.max(0.001, s.m.userData.s * up * (1 - down));
          if (up > 0 && up < 1 && Math.random() < 0.5) S.particles.burst(s.m.position.clone().setY(0.05), { color: 0xcfc3ae, n: 2, speed: 0.8, up: 0.8, size: 0.1, life: 0.5, gravity: 1, solid: true });
        }
        if (t > end) {
          for (const s of list) S.scene.remove(s.m);
          return false;
        }
        return true;
      },
      impact() {
        sfx('stone_break_small');
      },
    };
  },

  // ---- the battlements loose a volley of bolts that arc into the victim
  bolts(o, color, spec) {
    const list = [];
    const kill = o.kill && !o.ward;
    for (let i = 0; i < 4; i++) {
      const s = glowSprite(color, 0.14);
      const tr = new Ribbon(8, S.add(S.tex.beam, color));
      S.scene.add(s);
      list.push({ s, tr, t0: i * 0.1, trail: [], done: false, off: V(rnd(-0.12, 0.12), rnd(-0.15, 0.15), rnd(-0.12, 0.12)) });
    }
    const top = o.caster.group.position.clone().setY((o.caster.height || 1) * 0.72);
    sfx('spell_charge', { vol: 0.5 });
    return {
      update(dt, t) {
        let alive = false;
        for (const b of list) {
          const k = clamp01((t - b.t0) / (spec.impact - 0.1));
          const to = (o.ward ? o.to.clone().lerp(top, 0.3) : o.to).clone().add(b.off);
          const p = top.clone().lerp(to, k);
          p.y += Math.sin(Math.PI * k) * 0.55;
          b.s.position.copy(p);
          b.s.visible = k > 0 && k < 1;
          if (k > 0 && k < 1) {
            b.trail.push(p.clone());
            if (b.trail.length > 8) b.trail.shift();
          } else if (k >= 1 && b.trail.length) b.trail.shift();
          if (b.trail.length > 1) b.tr.set(b.trail, (u) => 0.06 * u);
          b.tr.mesh.visible = b.trail.length > 1;
          if (k >= 1 && !b.done) {
            b.done = true;
            S.particles.burst(to, { color, n: 14, speed: 1.8, up: 0.5, size: 0.05, life: 0.35 });
            sfx(kill ? 'stab' : 'shield_block', { vol: 0.5 });
            flashAt(to, color, 8);
            if (o.ward) o.ward.crack(to);
          }
          if (!b.done || b.trail.length) alive = true;
        }
        if (!alive && t > spec.impact) {
          for (const b of list) {
            S.scene.remove(b.s);
            b.s.material.dispose();
            b.tr.dispose();
          }
          return false;
        }
        return true;
      },
    };
  },
};

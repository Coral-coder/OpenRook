// The queen's wormhole: her finisher against a pawn. She plants her staff, claps twice high over
// her head and sweeps an arm down at the pawn; a little wormhole opens in the air above it, a
// swirling disc with an inky core, sinks toward it and draws it up (tumbling, stretching,
// shrinking, grit and dust spiralling up with it), then snaps shut in a flash of light and
// leaves a faint scorched ring on the square.
//
// Everything here is visual and keyed to its own clock; main.js times the events (the claps'
// sounds, the cast, taking the pawn off the board, the slow motion and the camera) against WORM.
import * as THREE from 'three';
import { glowSprite } from './battle.js';

/** The wormhole's timeline, in seconds after it opens. */
export const WORM = {
  lift: 0.42, // the pawn leaves its square
  gone: 1.4, // ... and is swallowed
  flash: 1.58, // the wormhole has shrunk to a point: the flash
  end: 4.2, // the scorch has faded
};

const PALETTE = {
  white: { core: 0x020108, deep: 0x160e48, mid: 0x3f62ff, rim: 0xc6ecff, spark: 0x9fd8ff, flash: 0xeaf6ff },
  black: { core: 0x040108, deep: 0x2a0a4a, mid: 0x9040ff, rim: 0xf2d0ff, spark: 0xc77dff, flash: 0xf8ecff },
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);
const easeOutBack = (x) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ the light
// One point light for every wormhole, added once (a new light would recompile every material).
let LIGHT = null;
export function prepareWormhole(scene) {
  if (!LIGHT) {
    LIGHT = new THREE.PointLight(0x8a7cff, 0, 4, 1.6);
    scene.add(LIGHT);
  }
  return LIGHT;
}

// ------------------------------------------------------------------ shaders
const DISC_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// the vortex: logarithmic spiral arms wound in toward a black core, a thin bright ring at the
// edge of the dark (the event horizon) and a glowing outer lip, all turning
const DISC_FRAG = `
  varying vec2 vUv;
  uniform float uTime, uBright, uCore;
  uniform vec3 cCore, cDeep, cMid, cRim;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float lr = log(r + 0.002);
    float sw = a - 2.4 * lr + uTime * 5.0;
    float arms = pow(0.5 + 0.5 * sin(3.0 * sw), 2.0);
    float fine = 0.5 + 0.5 * sin(11.0 * sw + 6.0 * lr - uTime * 2.0);
    float ripple = 0.5 + 0.5 * sin(5.0 * a + 40.0 * r - uTime * 9.0);
    float swirl = arms * 0.65 + fine * 0.25 + ripple * 0.1;
    float coreR = 0.3 * uCore;
    float hole = smoothstep(coreR, coreR * 0.55, r);
    float horizon = exp(-pow((r - coreR * 1.08) / 0.05, 2.0));
    float lip = exp(-pow((r - 0.84) / 0.07, 2.0)) * (0.55 + 0.45 * arms);
    float body = smoothstep(1.0, 0.62, r) * smoothstep(coreR * 0.8, coreR * 1.6, r);
    vec3 col = mix(cDeep, cMid, swirl) * body * (0.5 + 1.6 * swirl * swirl);
    col += cMid * pow(arms, 3.0) * body * smoothstep(0.9, 0.35, r) * 0.9;
    col += cRim * horizon * 3.0 + cRim * lip * 1.6;
    col = mix(col, cCore, hole);
    float alpha = max(hole, body * (0.6 + 0.4 * swirl));
    alpha = max(alpha, max(lip, horizon) * 0.95) * smoothstep(1.0, 0.9, r);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col * uBright, alpha);
  }`;
// the funnel hanging under it: streaks of light spiralling up the throat
const FUNNEL_FRAG = `
  varying vec2 vUv;
  uniform float uTime, uOpacity;
  uniform vec3 cMid, cRim;
  void main() {
    float u = vUv.x * 6.2831853, v = vUv.y; // round the throat, and up it (1 at the top)
    float s = 0.5 + 0.5 * sin(4.0 * u + v * 14.0 - uTime * 11.0);
    float s2 = 0.5 + 0.5 * sin(9.0 * u - v * 22.0 - uTime * 17.0);
    float streak = pow(s, 6.0) + 0.5 * pow(s2, 8.0);
    float fade = smoothstep(0.0, 0.45, v) * smoothstep(1.0, 0.8, v);
    vec3 col = mix(cMid, cRim, streak) * streak;
    gl_FragColor = vec4(col * fade * uOpacity, 1.0);
  }`;

// a soft ring for the scorch and the glow it leaves
const ringTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.62, 'rgba(255,255,255,1)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

const chipGeo = new THREE.DodecahedronGeometry(1, 0);

// ------------------------------------------------------------------ the claps
/** A clap: a ring of light bursting out from the meeting hands, and a spray of sparkles. */
export function clapBurst(scene, particles, at, white, camera) {
  const C = PALETTE[white ? 'white' : 'black'];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 40),
    new THREE.MeshBasicMaterial({ color: C.rim, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.position.copy(at);
  if (camera) ring.lookAt(camera.position);
  const glow = glowSprite(C.flash, 0.05);
  glow.position.copy(at);
  scene.add(ring, glow);
  particles.burst(at, { color: C.spark, n: 22, speed: 1.4, up: 0.4, size: 0.05, life: 0.5, gravity: 0.6 });
  particles.burst(at, { color: 0xffffff, n: 10, speed: 2.4, up: 0.2, size: 0.03, life: 0.25, gravity: 0 });
  let t = 0;
  return {
    update(dt) {
      t += dt;
      const k = clamp01(t / 0.3);
      ring.scale.setScalar(0.3 + (1 - Math.pow(1 - k, 3)) * 1.9);
      ring.material.opacity = (1 - k) * (1 - k);
      glow.scale.setScalar(0.05 + Math.sin(Math.PI * clamp01(t / 0.14)) * 0.32);
      if (k >= 1) {
        scene.remove(ring, glow);
        ring.geometry.dispose();
        ring.material.dispose();
        glow.material.dispose();
      }
      return k < 1;
    },
  };
}

/** The spell flung from her hand up to where the wormhole will open: a trail of sparkles. */
export function castTrail(scene, particles, from, to, white) {
  const C = PALETTE[white ? 'white' : 'black'];
  const head = glowSprite(C.rim, 0.22);
  head.position.copy(from);
  scene.add(head);
  let t = 0;
  const mid = from.clone().lerp(to, 0.5).add(V(0, 0.35, 0));
  const p = V();
  return {
    update(dt) {
      t += dt;
      const k = clamp01(t / 0.22);
      // a quadratic arc, up and over
      p.copy(from).multiplyScalar((1 - k) * (1 - k)).addScaledVector(mid, 2 * k * (1 - k)).addScaledVector(to, k * k);
      head.position.copy(p);
      particles.burst(p, { color: C.spark, n: 3, speed: 0.25, up: 0.1, size: 0.05, life: 0.4, gravity: 0 });
      if (k >= 1) {
        scene.remove(head);
        head.material.dispose();
      }
      return k < 1;
    },
  };
}

// ------------------------------------------------------------------ the staff
/**
 * She lets go of her staff: it stays standing upright on her pedestal, at her right side, until
 * `grabAt` (seconds into her move) or until she is doing something else, when it goes back into
 * her hand. Returns an effect (update(dt) -> still running).
 */
export function plantStaff(fig, moveName, grabAt) {
  const st = fig.J.weapon;
  const holder = fig.parts.inner;
  if (!st || !holder || st.parent === holder) return { update: () => false };
  const hand = st.parent;
  const home = { pos: st.position.clone(), quat: st.quaternion.clone() };
  holder.attach(st); // it keeps its place in the world
  // its foot (the ferrule, below the grip) comes to rest on the pedestal's top
  const box = new THREE.Box3();
  st.updateMatrixWorld(true);
  const inv = st.matrixWorld.clone().invert();
  st.traverse((o) => {
    if (o.isMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld)));
    }
  });
  const foot = box.isEmpty() ? 0.67 : -box.min.y;
  const from = { pos: st.position.clone(), quat: st.quaternion.clone() };
  // upright, turned the way it was
  const e = new THREE.Euler().setFromQuaternion(st.quaternion, 'YXZ');
  const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.y, 0, 'YXZ'));
  const r = Math.hypot(from.pos.x, from.pos.z);
  const k = r > 0.24 ? 0.24 / r : 1; // on the pedestal, not beside it
  const toP = V(from.pos.x * k, 0.215 + foot + 0.002, from.pos.z * k);
  let t = 0, back = null;
  return {
    update(dt) {
      t += dt;
      if (!back) {
        const u = smooth(clamp01(t / 0.16));
        st.position.lerpVectors(from.pos, toP, u);
        st.quaternion.slerpQuaternions(from.quat, toQ, u);
        if (fig.move.name !== moveName || fig.move.t >= grabAt) {
          // she takes it back: from where it stands into her hand
          hand.attach(st);
          back = { t: 0, pos: st.position.clone(), quat: st.quaternion.clone() };
        }
        return true;
      }
      back.t += dt;
      const u = smooth(clamp01(back.t / 0.14));
      st.position.lerpVectors(back.pos, home.pos, u);
      st.quaternion.slerpQuaternions(back.quat, home.quat, u);
      return u < 1;
    },
  };
}

// ------------------------------------------------------------------ the wormhole
export class Wormhole {
  /**
   * at: the victim's square (on the board); victim: its figure (lifted and swallowed by the
   * wormhole); light: from prepareWormhole.
   */
  constructor(scene, particles, light, at, victim, white) {
    this.scene = scene;
    this.particles = particles;
    this.light = light;
    this.C = PALETTE[white ? 'white' : 'black'];
    this.at = at.clone().setY(0);
    this.victim = victim;
    this.t = 0;
    this.h = Math.max(0.6, victim ? victim.height || 1 : 1);
    this.low = Math.max(1.45, this.h + 0.48); // where it hangs while it feeds
    this.high = this.low + 0.55; // where it opens
    this.center = this.at.clone().setY(this.high);
    this.R = 0.46; // its radius, open
    const C = this.C;
    const col = (c) => new THREE.Color(c);

    this.group = new THREE.Group();
    scene.add(this.group);
    // the vortex itself
    this.discMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uCore: { value: 1 }, cCore: { value: col(C.core) }, cDeep: { value: col(C.deep) }, cMid: { value: col(C.mid) }, cRim: { value: col(C.rim) } },
      vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, transparent: true, depthWrite: true, side: THREE.DoubleSide,
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), this.discMat);
    this.disc.renderOrder = 2;
    // it faces down, tipped toward whoever is watching, so it reads as a hole in the air
    const _n = V(), _m = new THREE.Matrix4(), _up = V(0, 1, 0), _o = V(), _z = V(0, 0, 1);
    this.disc.onBeforeRender = (r, s, cam) => {
      _n.copy(cam.position).sub(this.disc.position).normalize();
      _n.y -= 0.9;
      _n.normalize();
      _m.lookAt(_n, _o, Math.abs(_n.y) > 0.98 ? _z : _up);
      this.disc.quaternion.setFromRotationMatrix(_m);
      this.disc.updateMatrixWorld(true);
    };
    this.group.add(this.disc);
    // a soft glow behind it (the bloom)
    this.halo = glowSprite(C.mid, 1);
    this.halo.material.opacity = 0.35;
    this.group.add(this.halo);
    // the funnel reaching down from it
    this.funnelMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, cMid: { value: col(C.mid) }, cRim: { value: col(C.rim) } },
      vertexShader: DISC_VERT, fragmentShader: FUNNEL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const fg = new THREE.CylinderGeometry(1, 0.12, 1, 40, 1, true);
    fg.translate(0, -0.5, 0); // hangs from its top
    this.funnel = new THREE.Mesh(fg, this.funnelMat);
    this.group.add(this.funnel);

    this.sparks = [];
    this.debris = [];
    this.spawnAcc = 0;
    this.scorch = null;
    this.flashFx = null;
    this.alive = true;
    // where the victim starts, and which way it will spiral
    this.spin0 = Math.random() * Math.PI * 2;
    if (light) {
      light.color.set(C.mid);
      light.intensity = 0;
    }
  }

  // how open it is (0..1) and its height, over time
  openness(t) {
    if (t < 0) return 0;
    const o = t < 0.34 ? easeOutBack(clamp01(t / 0.34)) : 1;
    const c = clamp01((t - WORM.gone) / (WORM.flash - WORM.gone));
    return o * (1 - c * c * (3 - 2 * c)) * (1 + 0.04 * Math.sin(t * 13));
  }

  height(t) {
    return this.high - (this.high - this.low) * smooth(clamp01((t - 0.04) / 0.6));
  }

  // grit and dust torn up off the square, and sparkles pulled in from the air
  spawnDebris() {
    const mat = this.victim?.materials?.[0];
    for (let i = 0; i < 14 && mat; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.18 + Math.random() * 0.4;
      const m = new THREE.Mesh(chipGeo, mat);
      const s = 0.012 + Math.random() * 0.026;
      m.scale.setScalar(s);
      m.position.copy(this.at).add(V(Math.cos(a) * r, s, Math.sin(a) * r));
      m.castShadow = s > 0.03;
      this.scene.add(m);
      this.debris.push({ m, s, start: m.position.clone(), a, r, delay: Math.random() * 0.55, dur: 0.75 + Math.random() * 0.35, w: V(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6) });
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.15 + Math.random() * 0.35;
      const sp = glowSprite(0x8c8478, 0.2, true);
      sp.material.opacity = 0;
      sp.position.copy(this.at).add(V(Math.cos(a) * r, 0.05, Math.sin(a) * r));
      this.scene.add(sp);
      this.debris.push({ m: sp, dust: true, s: 0.18 + Math.random() * 0.15, start: sp.position.clone(), a, r, delay: Math.random() * 0.4, dur: 0.8 + Math.random() * 0.4 });
    }
  }

  // a point being drawn up into the hole: along a narrowing spiral, faster as it goes
  spiral(start, a0, r0, u, out) {
    const e = Math.pow(u, 1.7);
    const ang = a0 + 9 * u * u;
    const r = r0 * (1 - e) + 0.05 * Math.sin(Math.PI * u) * (1 - e);
    out.set(this.at.x + Math.cos(ang) * r, start.y + (this.center.y - start.y) * e, this.at.z + Math.sin(ang) * r);
    return e;
  }

  updateVictim(t) {
    const fig = this.victim;
    if (!fig || this.swallowed) return;
    const g = fig.group, inner = fig.parts.inner;
    // a shudder before it lets go of the square
    if (t > WORM.lift - 0.3 && t < WORM.lift) {
      const k = (t - (WORM.lift - 0.3)) / 0.3;
      inner.position.set(Math.sin(t * 83) * 0.012 * k, 0, Math.cos(t * 71) * 0.01 * k);
    }
    if (t < WORM.lift) return;
    const u = clamp01((t - WORM.lift) / (WORM.gone - WORM.lift));
    const e = Math.pow(u, 1.6);
    const h = this.h;
    // shrinking and stretched out toward the hole
    const s = 1 - 0.92 * Math.pow(u, 2.2);
    const sy = s * (1 + 0.9 * Math.pow(u, 1.4));
    const sxz = s * (1 - 0.4 * Math.pow(u, 1.4));
    g.scale.set(sxz, sy, sxz);
    // its middle rises along a tightening spiral
    const cy = h * 0.5 + (this.center.y - h * 0.5) * e;
    const ang = this.spin0 + 11 * u * u;
    const r = 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.25)) * (1 - e);
    g.position.set(this.at.x + Math.cos(ang) * r, cy - h * 0.5 * sy, this.at.z + Math.sin(ang) * r);
    // tumbling about its middle
    const c = V(0, h * 0.5, 0);
    inner.rotation.set(2.6 * e + 0.4 * Math.sin(u * 9) * u, 9 * u * u, 1.1 * Math.sin(u * 6.5) * e, 'XYZ');
    const rc = c.clone().applyEuler(inner.rotation);
    inner.position.copy(c).sub(rc);
    if (u >= 1) {
      this.swallowed = true;
      g.visible = false;
    }
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const C = this.C;
    const open = this.openness(t);
    this.center.y = this.height(t);
    // the vortex
    if (t < WORM.flash) {
      this.disc.position.copy(this.center);
      this.disc.scale.setScalar(Math.max(0.001, this.R * open));
      this.discMat.uniforms.uTime.value = t * (1 + 1.5 * clamp01((t - WORM.gone) / (WORM.flash - WORM.gone)));
      // it brightens as it closes
      const c = clamp01((t - (WORM.gone - 0.1)) / (WORM.flash - WORM.gone + 0.1));
      this.discMat.uniforms.uBright.value = 1 + 2.5 * c * c;
      this.discMat.uniforms.uCore.value = 1 - 0.5 * c;
      this.halo.position.copy(this.center);
      this.halo.scale.setScalar(this.R * 2.6 * open * (1 + 0.5 * c));
      this.halo.material.opacity = 0.3 + 0.4 * c;
      // the funnel reaches down to the victim while it feeds
      const reach = clamp01((t - 0.25) / 0.35) * (1 - clamp01((t - (WORM.gone - 0.15)) / 0.25));
      const len = Math.max(0.05, this.center.y - this.h * 0.75) * (0.4 + 0.6 * reach);
      this.funnel.position.copy(this.center);
      this.funnel.scale.set(this.R * 0.7 * open, len, this.R * 0.7 * open);
      this.funnelMat.uniforms.uTime.value = t;
      this.funnelMat.uniforms.uOpacity.value = 0.9 * reach * open;
      if (this.light) {
        this.light.position.copy(this.center).add(V(0, -0.15, 0));
        this.light.intensity = open * (3.2 + 0.8 * Math.sin(t * 23)) + 8 * c * c;
      }
      // sparkles drawn in from all around
      this.spawnAcc += dt * 55 * Math.min(1, open);
      while (this.spawnAcc > 1) {
        this.spawnAcc -= 1;
        const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.8;
        const sp = glowSprite(Math.random() < 0.3 ? C.rim : C.spark, 0.04 + Math.random() * 0.05);
        this.scene.add(sp);
        this.sparks.push({ sp, a, r, dy: (Math.random() - 0.65) * 0.7, t: 0, life: 0.5 + Math.random() * 0.35 });
      }
    } else if (this.group.visible) {
      this.group.visible = false;
      this.boom();
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt;
      const u = clamp01(s.t / s.life), e = u * u;
      const ang = s.a + 5 * u * u;
      const r = s.r * (1 - e);
      s.sp.position.set(this.center.x + Math.cos(ang) * r, this.center.y + s.dy * (1 - e), this.center.z + Math.sin(ang) * r);
      s.sp.material.opacity = Math.min(1, u * 4) * (1 - e * 0.5);
      if (u >= 1 || t >= WORM.flash) {
        this.scene.remove(s.sp);
        s.sp.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
    // the victim, and the grit torn up with it
    if (t >= WORM.lift - 0.15 && !this.spawned) {
      this.spawned = true;
      this.spawnDebris();
      this.particles.burst(this.at.clone().setY(0.08), { color: 0xb8ae9e, n: 10, speed: 0.6, up: 0.4, size: 0.12, life: 0.6, gravity: -0.2, solid: true });
    }
    this.updateVictim(t);
    const _p = V();
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      const u = clamp01((t - (WORM.lift - 0.1) - d.delay) / d.dur);
      if (u <= 0) continue;
      const e = this.spiral(d.start, d.a, d.r, u, _p);
      d.m.position.copy(_p);
      if (d.dust) {
        d.m.material.opacity = 0.45 * Math.min(1, u * 5) * (1 - e);
        d.m.scale.setScalar(d.s * (1 + 1.5 * u) * (1 - e * 0.7));
      } else {
        d.m.rotation.x += d.w.x * dt;
        d.m.rotation.y += d.w.y * dt;
        d.m.rotation.z += d.w.z * dt;
        d.m.scale.setScalar(d.s * (1 - e * 0.85));
      }
      if (u >= 1 || t >= WORM.flash) {
        this.scene.remove(d.m);
        if (d.dust) d.m.material.dispose();
        this.debris.splice(i, 1);
      }
    }
    if (this.flashFx && !this.flashFx.update(dt)) this.flashFx = null;
    if (this.scorch) this.updateScorch(dt);
    if (t >= WORM.end && !this.flashFx) {
      this.dispose();
      return false;
    }
    return true;
  }

  // the flash: a burst of light where it closed, a ring racing out, sparkles falling
  boom() {
    const C = this.C;
    const at = this.center.clone();
    const big = glowSprite(C.flash, 0.1), core = glowSprite(0xffffff, 0.1);
    // a star of light: two thin streaks crossing at the point where it closed
    const streaks = [glowSprite(0xffffff, 0.1), glowSprite(C.rim, 0.1)];
    for (const st of streaks) st.position.copy(at);
    this.scene.add(...streaks);
    big.position.copy(at);
    core.position.copy(at);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 64),
      new THREE.MeshBasicMaterial({ color: C.rim, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(at);
    this.scene.add(big, core, ring);
    this.particles.burst(at, { color: C.spark, n: 50, speed: 3.2, up: 0.4, size: 0.07, life: 0.7, gravity: 1.5 });
    this.particles.burst(at, { color: 0xffffff, n: 26, speed: 5, up: 0.2, size: 0.045, life: 0.3, gravity: 0 });
    this.particles.burst(at, { color: C.rim, n: 30, speed: 0.8, up: 0, size: 0.05, life: 1.6, gravity: 0.9 });
    const light = this.light;
    let t = 0;
    this.flashFx = {
      update: (dt) => {
        t += dt;
        const k = clamp01(t / 0.38);
        const pop = Math.min(1, t / 0.05);
        const q = clamp01(t / 0.2);
        big.scale.setScalar(0.2 + 0.9 * pop + 0.3 * q);
        big.material.opacity = Math.pow(1 - q, 2);
        core.scale.setScalar(0.55 * pop * (1 - k));
        streaks[0].scale.set(2.6 * pop * (1 - 0.5 * k), 0.07 * (1 - k), 1);
        streaks[1].scale.set(0.06 * (1 - k), 1.3 * pop * (1 - 0.5 * k), 1);
        for (const st of streaks) st.material.opacity = 1 - k;
        core.material.opacity = 1 - k * k;
        ring.scale.setScalar(0.15 + 1.5 * (1 - Math.pow(1 - k, 2)));
        ring.material.opacity = (1 - k) * 0.8;
        if (light) {
          light.color.set(C.flash);
          light.intensity = 22 * Math.pow(1 - k, 3);
          light.distance = 6;
        }
        if (k >= 1) {
          this.scene.remove(big, core, ring, ...streaks);
          for (const st of streaks) st.material.dispose();
          big.material.dispose();
          core.material.dispose();
          ring.geometry.dispose();
          ring.material.dispose();
          if (light) {
            light.intensity = 0;
            light.distance = 4;
          }
        }
        return k < 1;
      },
    };
    // the mark it leaves on the square: a glowing ring that cools to a faint scorch
    const mk = (blending, color, opacity) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, opacity, blending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(this.at).setY(0.009);
      this.scene.add(m);
      return m;
    };
    this.scorch = { t: 0, dark: mk(THREE.NormalBlending, 0x0c0814, 0), glow: mk(THREE.AdditiveBlending, C.spark, 0) };
  }

  updateScorch(dt) {
    const s = this.scorch;
    s.t += dt;
    s.glow.material.opacity = Math.min(1, s.t / 0.08) * Math.max(0, 1 - s.t / 1.6) * 0.9;
    s.glow.scale.setScalar(1 + 0.15 * Math.min(1, s.t / 0.3));
    s.dark.material.opacity = Math.min(0.55, s.t * 2) * Math.max(0, 1 - Math.max(0, s.t - 1.2) / (WORM.end - WORM.flash - 1.2));
  }

  dispose() {
    this.scene.remove(this.group);
    this.disc.geometry.dispose();
    this.discMat.dispose();
    this.funnel.geometry.dispose();
    this.funnelMat.dispose();
    this.halo.material.dispose();
    for (const s of this.sparks) this.scene.remove(s.sp);
    for (const d of this.debris) this.scene.remove(d.m);
    if (this.scorch) {
      for (const m of [this.scorch.dark, this.scorch.glow]) {
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
    }
    if (this.light) this.light.intensity = 0;
  }
}

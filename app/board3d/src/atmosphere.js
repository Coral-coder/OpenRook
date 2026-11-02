// The hall around the board: a vast, cold stone chamber like the one under the castle. Pale
// light falls from high above; massive pillars stand back in the gloom, torches burn low on
// their bases, dust hangs in the air and a grey mist creeps over the flagstones.
import * as THREE from 'three';
import { granite } from './granite.js';

function softTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function setupAtmosphere(scene) {
  scene.background = new THREE.Color(0x0b0c0e);
  scene.fog = new THREE.FogExp2(0x101215, 0.05);

  // the vault overhead: dark stone, a faint pale glow where the light comes in
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform float uTime;
        void main(){
          float h = clamp(vP.y, 0.0, 1.0);
          vec3 c = mix(vec3(0.035,0.038,0.045), vec3(0.075,0.08,0.09), pow(h, 0.8));
          c += vec3(0.07,0.075,0.08) * pow(max(0.0, dot(vP, normalize(vec3(-0.35, 0.9, 0.3)))), 24.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);

  // a shaft of light falling on the board
  const shaft = new THREE.SpotLight(0xdfe6ee, 9, 22, 0.55, 0.8, 1.2);
  shaft.position.set(-3, 14, 3);
  shaft.target.position.set(0, 0, 0);
  scene.add(shaft, shaft.target);

  // the hall: a ring of great pillars, and flagstones running off into the dark
  const pillarMat = granite('black', { grain: 3 });
  pillarMat.userData.uniforms.uTint.value.setRGB(0.16, 0.16, 0.17);
  pillarMat.userData.uniforms.uTint2.value.setRGB(0.26, 0.26, 0.27);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const r = 16; // well back in the gloom, never between the camera and the board
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 16, 12), pillarMat);
    p.position.set(Math.cos(a) * r, 7.4, Math.sin(a) * r);
    p.receiveShadow = true;
    scene.add(p);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 2.3), pillarMat);
    base.position.set(p.position.x, -0.35, p.position.z);
    base.rotation.y = -a;
    scene.add(base);
  }

  // torches on iron stands at the corners
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6, metalness: 0.6 });
  const flameTex = softTexture('rgba(255,236,190,1)', 'rgba(255,110,20,0)');
  const torches = [];
  for (const [x, z] of [[-5.4, 5.4], [5.4, 5.4], [-5.4, -5.4], [5.4, -5.4]]) {
    const g = new THREE.Group();
    g.position.set(x, -0.65, z);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.7, 8), ironMat);
    stand.position.y = 0.85;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.12, 0.2, 10, 1, true), ironMat);
    bowl.position.y = 1.75;
    stand.castShadow = true;
    g.add(stand, bowl);
    const flames = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.position.y = 1.92 + i * 0.1;
      g.add(f);
      flames.push(f);
    }
    const light = new THREE.PointLight(0xff9a48, 6, 7, 1.7);
    light.position.y = 2.1;
    g.add(light);
    scene.add(g);
    torches.push({ flames, light, seed: Math.random() * 10 });
  }

  // dust hanging in the light
  const N = 320;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const drift = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 1] = Math.random() * 5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    drift.push([Math.random() * 6, 0.01 + Math.random() * 0.03]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.025, map: softTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), color: 0xb9b6ad,
    transparent: true, opacity: 0.45, depthWrite: false,
  }));
  scene.add(dust);

  // mist over the floor around the board
  const mistTex = softTexture('rgba(150,155,162,0.5)', 'rgba(150,155,162,0)');
  const mist = [];
  for (let i = 0; i < 20; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.22, depthWrite: false }));
    const a = (i / 20) * Math.PI * 2;
    s.position.set(Math.cos(a) * (5.6 + Math.random() * 2), -0.35, Math.sin(a) * (5.6 + Math.random() * 2));
    s.scale.set(4 + Math.random() * 3, 1.1, 1);
    scene.add(s);
    mist.push({ s, a, r: s.position.length(), sp: 0.015 + Math.random() * 0.02 });
  }

  return {
    update(dt, t) {
      sky.material.uniforms.uTime.value = t;
      for (const b of torches) {
        const fl = 0.8 + 0.2 * Math.sin(t * 13 + b.seed) * Math.sin(t * 7.3 + b.seed * 2);
        b.light.intensity = 6 * fl;
        b.flames.forEach((f, i) => {
          f.scale.setScalar((0.45 - i * 0.08) * (0.85 + 0.3 * Math.sin(t * 9 + i + b.seed)));
          f.position.x = Math.sin(t * 5 + i * 1.7 + b.seed) * 0.03;
        });
      }
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const [ph, sp] = drift[i];
        p[i * 3] += Math.sin(t * 0.2 + ph) * sp * dt * 3;
        p[i * 3 + 1] += Math.sin(t * 0.13 + ph * 2) * sp * dt;
        p[i * 3 + 2] += Math.cos(t * 0.17 + ph) * sp * dt * 3;
      }
      geo.attributes.position.needsUpdate = true;
      for (const f of mist) {
        f.a += f.sp * dt;
        f.s.position.x = Math.cos(f.a) * f.r;
        f.s.position.z = Math.sin(f.a) * f.r;
      }
    },
  };
}

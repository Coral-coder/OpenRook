// The mood around the board: a dark vaulted sky, moonlight, four braziers burning at the
// corners, light magic (golden motes) rising over White's side and dark magic (sickly green
// embers) over Black's, and fog drifting low across the floor.
import * as THREE from 'three';

function glowTexture(inner, outer) {
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
  scene.background = new THREE.Color(0x06050a);
  scene.fog = new THREE.FogExp2(0x07060c, 0.045);

  // sky dome: deep violet overhead fading to black at the horizon
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
          vec3 c = mix(vec3(0.02,0.015,0.03), vec3(0.09,0.05,0.14), pow(h, 0.7));
          // a sickly aurora over the dark side, a warm glow over the light side
          c += vec3(0.05,0.18,0.09) * smoothstep(0.1, 0.9, h) * smoothstep(0.2, -0.8, vP.z) * (0.6 + 0.4 * sin(uTime * 0.3 + vP.x * 4.0));
          c += vec3(0.16,0.10,0.03) * smoothstep(0.0, 0.6, h) * smoothstep(-0.2, 0.8, vP.z) * 0.6;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);

  // magic light over each half of the board
  const lightMagic = new THREE.SpotLight(0xffc86b, 30, 16, 0.75, 0.6, 1.4);
  lightMagic.position.set(0, 7, 6.5);
  lightMagic.target.position.set(0, 0, 2.5);
  const darkMagic = new THREE.SpotLight(0x58ff9a, 26, 16, 0.75, 0.6, 1.4);
  darkMagic.position.set(0, 7, -6.5);
  darkMagic.target.position.set(0, 0, -2.5);
  scene.add(lightMagic, lightMagic.target, darkMagic, darkMagic.target);

  // braziers on stone pillars at the four corners
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.85 });
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.4, metalness: 0.7 });
  const flameTex = glowTexture('rgba(255,240,200,1)', 'rgba(255,90,10,0)');
  const greenFlameTex = glowTexture('rgba(220,255,220,1)', 'rgba(40,200,90,0)');
  const braziers = [];
  for (const [x, z] of [[-5.3, 5.3], [5.3, 5.3], [-5.3, -5.3], [5.3, -5.3]]) {
    const dark = z < 0;
    const g = new THREE.Group();
    g.position.set(x, -0.65, z);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.6, 10), pillarMat);
    pillar.position.y = 0.8;
    pillar.castShadow = pillar.receiveShadow = true;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.22, 0.3, 14, 1, true), bowlMat);
    bowl.position.y = 1.72;
    g.add(pillar, bowl);
    const flames = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: dark ? greenFlameTex : flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.position.y = 1.95 + i * 0.12;
      g.add(f);
      flames.push(f);
    }
    const light = new THREE.PointLight(dark ? 0x4dff88 : 0xff9a3c, 8, 7, 1.6);
    light.position.y = 2.2;
    g.add(light);
    scene.add(g);
    braziers.push({ flames, light, seed: Math.random() * 10, dark });
  }

  // drifting motes and embers
  const N = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const vel = [];
  for (let i = 0; i < N; i++) {
    const dark = i % 2 === 1;
    pos[i * 3] = (Math.random() - 0.5) * 11;
    pos[i * 3 + 1] = Math.random() * 4;
    pos[i * 3 + 2] = (dark ? -1 : 1) * Math.random() * 5.5;
    const c = dark ? new THREE.Color(0.35, 1.0, 0.5) : new THREE.Color(1.0, 0.8, 0.4);
    col.set([c.r, c.g, c.b], i * 3);
    vel.push(0.15 + Math.random() * 0.35);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.07, map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), vertexColors: true,
    transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(motes);

  // low fog banks drifting over the floor around the board
  const fogTex = glowTexture('rgba(150,140,170,0.55)', 'rgba(150,140,170,0)');
  const fog = [];
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, transparent: true, opacity: 0.28, depthWrite: false }));
    const a = (i / 18) * Math.PI * 2;
    s.position.set(Math.cos(a) * (5.5 + Math.random() * 2), -0.35, Math.sin(a) * (5.5 + Math.random() * 2));
    s.scale.set(4 + Math.random() * 3, 1.2, 1);
    scene.add(s);
    fog.push({ s, a, r: s.position.length(), sp: 0.02 + Math.random() * 0.03 });
  }

  return {
    update(dt, t) {
      sky.material.uniforms.uTime.value = t;
      for (const b of braziers) {
        const fl = 0.75 + 0.25 * Math.sin(t * 13 + b.seed) * Math.sin(t * 7.3 + b.seed * 2);
        b.light.intensity = 7 * fl;
        b.flames.forEach((f, i) => {
          f.scale.setScalar((0.55 - i * 0.1) * (0.85 + 0.3 * Math.sin(t * 9 + i + b.seed)));
          f.position.x = Math.sin(t * 5 + i * 1.7 + b.seed) * 0.04;
        });
      }
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        p[i * 3 + 1] += vel[i] * dt;
        p[i * 3] += Math.sin(t * 0.7 + i) * 0.003;
        if (p[i * 3 + 1] > 4.5) p[i * 3 + 1] = 0;
      }
      geo.attributes.position.needsUpdate = true;
      for (const f of fog) {
        f.a += f.sp * dt;
        f.s.position.x = Math.cos(f.a) * f.r;
        f.s.position.z = Math.sin(f.a) * f.r;
      }
      darkMagic.intensity = 22 + 6 * Math.sin(t * 0.9);
    },
  };
}

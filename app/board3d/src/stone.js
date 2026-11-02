// Living-stone materials for the Wizard style: the armies as carved chess statues.
//
// White is pale marble shot through with gold veins that faintly glow with light magic.
// Black is cracked obsidian whose cracks pulse with sickly green-violet dark magic. The
// pattern is computed in the shader from the model's own (bind-pose) coordinates, so the
// veins are carved into each figure and move with it. Each figure gets its own material
// instances so a dying piece can rot (uRot) and fade (opacity) on its own.
import * as THREE from 'three';

export const stoneTime = { value: 0 }; // shared clock, advanced by the main loop

const NOISE = /* glsl */ `
  varying vec3 vStone;
  uniform float uTime;
  uniform float uSide;   // 0 white marble, 1 black obsidian
  uniform float uKind;   // 0 body, 1 metal, 2 glow
  uniform float uRot;    // 0 alive .. 1 rotten
  uniform float uScale;  // pattern size
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
`;

export function stoneMaterial(source, side, kind, { offset = [0, 0, 0], scale = 6 } = {}) {
  const isBlack = side === 'black';
  const m = new THREE.MeshStandardMaterial({
    map: source?.map || null,
    roughness: kind === 1 ? 0.3 : isBlack ? 0.22 : 0.38,
    metalness: kind === 1 ? 0.85 : isBlack ? 0.15 : 0.02,
    color: 0xffffff,
    emissive: 0x000000,
  });
  m.userData.uniforms = {
    uTime: stoneTime,
    uSide: { value: isBlack ? 1 : 0 },
    uKind: { value: kind },
    uRot: { value: 0 },
    uOffset: { value: new THREE.Vector3(...offset) },
    uScale: { value: scale },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.vertexShader = 'varying vec3 vStone;\nuniform vec3 uOffset;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n  vStone = position + uOffset;');
    shader.fragmentShader = NOISE + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 sp = vStone * uScale;
      float sn = fbm(sp);
      float vein = 1.0 - smoothstep(0.0, 0.09, abs(sin(sp.y * 1.3 + sn * 6.5 + sp.x * 0.7 + sp.z * 0.4)));
      vec3 stone;
      if (uKind > 1.5) {
        stone = uSide < 0.5 ? vec3(1.0, 0.85, 0.45) : vec3(0.3, 1.0, 0.55);
      } else if (uKind > 0.5) {
        stone = uSide < 0.5 ? mix(vec3(0.75, 0.72, 0.66), vec3(0.95, 0.8, 0.45), sn) : mix(vec3(0.12, 0.12, 0.13), vec3(0.3, 0.28, 0.3), sn);
        stone *= 0.7 + 0.5 * lum;
      } else {
        vec3 base = uSide < 0.5 ? mix(vec3(0.80, 0.77, 0.71), vec3(0.97, 0.95, 0.90), sn) : mix(vec3(0.035, 0.03, 0.045), vec3(0.13, 0.11, 0.14), sn);
        vec3 veinCol = uSide < 0.5 ? vec3(0.80, 0.62, 0.28) : vec3(0.01, 0.01, 0.015);
        stone = mix(base, veinCol, vein * (uSide < 0.5 ? 0.85 : 0.65)) * (0.5 + 0.7 * lum);
      }
      // rot: the stone darkens, mottles and crumbles as the piece dies
      vec3 rotten = mix(vec3(0.16, 0.14, 0.09), vec3(0.05, 0.04, 0.03), sn);
      stone = mix(stone, rotten, uRot * (0.6 + 0.4 * sn));
      diffuseColor.rgb = stone;`,
    ).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float pulse = 0.6 + 0.4 * sin(uTime * 2.2 + sn * 9.0);
      if (uKind > 1.5) {
        totalEmissiveRadiance += (uSide < 0.5 ? vec3(1.0, 0.8, 0.35) : vec3(0.3, 1.0, 0.5)) * 2.0 * pulse * (1.0 - uRot);
      } else if (uKind < 0.5) {
        vec3 magic = uSide < 0.5 ? vec3(1.0, 0.78, 0.35) * 0.32 : vec3(0.35, 1.0, 0.55) * 0.55 + vec3(0.4, 0.1, 0.6) * 0.25 * sin(uTime + sn * 4.0);
        totalEmissiveRadiance += vein * magic * pulse * (1.0 - uRot);
        // dying: the cracks burn like embers before going out
        totalEmissiveRadiance += vein * vec3(1.0, 0.25, 0.05) * smoothstep(0.0, 0.4, uRot) * (1.0 - smoothstep(0.6, 1.0, uRot)) * 1.4;
      }`,
    );
  };
  m.customProgramCacheKey = () => 'openrook-stone';
  return m;
}

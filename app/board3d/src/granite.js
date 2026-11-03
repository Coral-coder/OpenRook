// Carved stone for the statues and the board: pale limestone for White, dark slate for Black.
// Matte, mottled and pitted, with no glow. The grain is computed in the shader from each part's
// own coordinates, so it stays put on a moving limb; a bump from the same noise roughens the
// surface so the light catches the chisel marks.
import * as THREE from 'three';

const NOISE = /* glsl */ `
  varying vec3 vGrain;
  uniform float uRot;
  uniform float uGrain;
  uniform vec3 uTint;
  uniform vec3 uTint2;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.07; a *= 0.5; } return s; }
`;

/**
 * side: 'white' | 'black'. grain: pattern size (bigger = finer). Each call makes its own
 * material, so a figure can crumble (uRot) or fade (opacity) on its own.
 */
export function granite(side, { grain = 48, offset = [0, 0, 0] } = {}) {
  const white = side === 'white';
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: white ? 0.78 : 0.62,
    metalness: 0,
  });
  m.userData.side = side;
  m.userData.uniforms = {
    uRot: { value: 0 },
    uGrain: { value: grain },
    uOffset: { value: new THREE.Vector3(...offset) },
    uTint: { value: white ? new THREE.Color(0.74, 0.71, 0.66) : new THREE.Color(0.105, 0.105, 0.115) },
    uTint2: { value: white ? new THREE.Color(0.86, 0.84, 0.79) : new THREE.Color(0.2, 0.2, 0.215) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.vertexShader = 'varying vec3 vGrain;\nuniform vec3 uOffset;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n  vGrain = position + uOffset;');
    shader.fragmentShader = NOISE + shader.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 gp = vGrain * uGrain;
        float g = fbm(gp);
        float fleck = smoothstep(0.78, 0.86, n3(gp * 3.1));       // crystals in the stone
        float pit = smoothstep(0.8, 0.9, n3(gp * 1.2 + 11.0));    // weathered pits
        vec3 stone = mix(uTint, uTint2, g);
        stone = mix(stone, stone * 1.12, fleck * 0.5);
        stone *= 1.0 - 0.06 * pit;
        // crumbling: the stone darkens and dries out as the piece is destroyed
        stone = mix(stone, stone * vec3(0.55, 0.5, 0.45), uRot);
        diffuseColor.rgb = stone;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // chisel-roughened surface: bump from the same grain
        {
          float hh = (fbm(vGrain * uGrain * 1.9) + 0.3 * pit) * 0.0022;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float dhx = dFdx(hh), dhy = dFdy(hh);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + 0.15 * (pit - fleck), 0.2, 1.0);`);
  };
  m.customProgramCacheKey = () => 'openrook-granite';
  return m;
}

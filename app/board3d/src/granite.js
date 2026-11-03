// Carved stone for the statues and the board: pale, warm limestone for White, near-black basalt
// for Black. Dead matte (high roughness, no flecks or glints), softly mottled and pitted, with
// no glow. The grain is computed in the shader from each part's own coordinates, so it stays
// put on a moving limb; a broad, gentle bump from the same noise gives the surface a tooled
// feel without the fine sparkle a pixel-sized bump makes on a phone screen.
import * as THREE from 'three';

const NOISE = /* glsl */ `
  varying vec3 vGrain;
  uniform float uRot;
  uniform float uGrain;
  uniform vec3 uTint;
  uniform vec3 uTint2;
  uniform float uBump;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.07; a *= 0.5; } return s; }
`;

/**
 * side: 'white' | 'black'. grain: pattern size (bigger = finer). Each call makes its own
 * material, so a figure can crumble (uRot) or fade (opacity) on its own.
 */
export function granite(side, { grain = 48, offset = [0, 0, 0] } = {}) {
  const white = side === 'white';
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: white ? 0.9 : 0.8, // (the basalt a touch smoother: a soft sheen shows its form)
    metalness: 0,
  });
  m.userData.side = side;
  m.userData.uniforms = {
    uRot: { value: 0 },
    uGrain: { value: grain },
    uOffset: { value: new THREE.Vector3(...offset) },
    uTint: { value: white ? new THREE.Color(0.74, 0.71, 0.65) : new THREE.Color(0.021, 0.022, 0.026) },
    uTint2: { value: white ? new THREE.Color(0.88, 0.86, 0.8) : new THREE.Color(0.045, 0.044, 0.048) },
    uBump: { value: 1 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.vertexShader = 'varying vec3 vGrain;\nuniform vec3 uOffset;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n  vGrain = position + uOffset;');
    shader.fragmentShader = NOISE + shader.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 gp = vGrain * uGrain;
        float g = fbm(gp);
        float pit = smoothstep(0.8, 0.9, n3(gp * 1.2 + 11.0));    // weathered pits
        vec3 stone = mix(uTint, uTint2, smoothstep(0.25, 0.75, g));
        stone *= 1.0 - 0.08 * pit;
        // crumbling: the stone darkens and dries out as the piece is destroyed
        stone = mix(stone, stone * vec3(0.55, 0.5, 0.45), uRot);
        diffuseColor.rgb = stone;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // chisel-roughened surface: bump from the same grain
        {
          float hh = (n3(vGrain * uGrain * 0.7) + 0.25 * pit) * 0.0011 * uBump;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float dhx = dFdx(hh), dhy = dFdy(hh);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + 0.08 * pit, 0.2, 1.0);`);
  };
  m.customProgramCacheKey = () => 'openrook-granite';
  return m;
}

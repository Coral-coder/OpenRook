// Tilt-shift focus: the board is a small chess set on a table, so the camera sees it the way a
// macro lens would. Everything nearer or farther than the board and its pieces melts into a
// soft, colourful blur; the board stays sharp. A depth-aware blur (the depth decides how much
// each pixel blurs), in two separable passes, plus a little screen-height falloff for the
// classic miniature look.
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function blurMaterial(final) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() },
      uNear: { value: 0.1 }, uFar: { value: 100 }, uFocus: { value: new THREE.Vector2(5, 15) },
      uMax: { value: 10 }, uBand: { value: new THREE.Vector2(0.5, 0.45) },
      uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    },
    vertexShader: VERT,
    fragmentShader: `
      #include <packing>
      varying vec2 vUv;
      uniform sampler2D tColor, tDepth;
      uniform vec2 uDir, uFocus, uBand;
      uniform float uNear, uFar, uMax;
      uniform mat4 uProjInv, uCamWorld;
      float coc(vec2 uv) {
        // where this pixel is in the room
        vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0);
        vec3 w = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
        // sharp on the board and the pieces standing on it; the farther from it, the softer
        float outside = max(max(abs(w.x), abs(w.z)) - 4.7, max(w.y - 2.2, -0.75 - w.y));
        float blur = smoothstep(0.2, 7.0, outside);
        // and the miniature falloff toward the top and bottom of the picture
        blur = max(blur, smoothstep(uBand.y, uBand.y + 0.35, abs(uv.y - uBand.x)) * 0.35 * step(0.01, outside));
        return blur;
      }
      void main() {
        float c = coc(vUv);
        float r = c * uMax;
        vec4 sum = texture2D(tColor, vUv) * 0.2;
        float wsum = 0.2;
        for (int i = 1; i <= 8; i++) {
          float f = float(i) / 8.0;
          float w = exp(-f * f * 2.5);
          vec2 o = uDir * r * f;
          // a sharp sample never bleeds into a blurred neighbour's halo
          float wa = w * max(coc(vUv + o), c * 0.5);
          float wb = w * max(coc(vUv - o), c * 0.5);
          sum += texture2D(tColor, vUv + o) * wa + texture2D(tColor, vUv - o) * wb;
          wsum += wa + wb;
        }
        gl_FragColor = sum / wsum;
        ${final ? '#include <tonemapping_fragment>\n#include <colorspace_fragment>' : ''}
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: final,
  });
}

export function setupPost(renderer) {
  const make = (depth) => {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: depth ? 4 : 0 });
    if (depth) rt.depthTexture = new THREE.DepthTexture(1, 1);
    return rt;
  };
  const rtScene = make(true), rtH = make(false);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene();
  qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const passH = blurMaterial(false), passV = blurMaterial(true);
  let w = 1, h = 1;
  const focus = new THREE.Vector2(5, 15);
  const _p = new THREE.Vector3();
  return {
    enabled: true,
    setSize(width, height) {
      w = width;
      h = height;
      rtScene.setSize(w, h);
      rtScene.depthTexture.image.width = w;
      rtScene.depthTexture.image.height = h;
      rtH.setSize(w, h);
    },
    /** Focus on the board: the distances from the camera to its nearest and farthest parts. */
    focusOn(camera, points) {
      let a = Infinity, b = 0;
      for (const p of points) {
        const d = -_p.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
        a = Math.min(a, d);
        b = Math.max(b, d);
      }
      focus.set(Math.max(0.2, a * 0.92), b * 1.06);
    },
    render(scene, camera) {
      if (!this.enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      const dpr = renderer.getPixelRatio();
      for (const [m, src, dir, out] of [[passH, rtScene.texture, [1 / w, 0], rtH], [passV, rtH.texture, [0, 1 / h], null]]) {
        const u = m.uniforms;
        u.tColor.value = src;
        u.tDepth.value = rtScene.depthTexture;
        u.uDir.value.set(dir[0], dir[1]);
        u.uNear.value = camera.near;
        u.uFar.value = camera.far;
        u.uFocus.value.copy(focus);
        u.uMax.value = 13 * dpr;
        u.uProjInv.value.copy(camera.projectionMatrixInverse);
        u.uCamWorld.value.copy(camera.matrixWorld);
        quad.material = m;
        renderer.setRenderTarget(out);
        renderer.render(qScene, qCam);
      }
    },
  };
}

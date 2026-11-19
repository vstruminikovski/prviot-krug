// Camera occlusion cut-out ("x-ray hole"): anything *above* the car's roof line and *closer to the
// camera* than the car is dithered away inside a soft circle around the car's screen position.
// Works for merged and instanced geometry (it is a shader patch, not per-object fading), so tree
// crowns, balconies and eaves never bury the car in the chase / high cameras. Visual only.
import * as THREE from 'three';

export const xrayUniforms = {
  uXr: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, // screen uv of car, car view depth, enabled
  uXrRes: { value: new THREE.Vector2(1, 1) },
  uXrR: { value: 0.16 }, // radius in screen heights
  uXrH: { value: 1.6 }, // world height above which cutting is allowed
};

const patched = new WeakSet<THREE.Material>();

function patch(m: THREE.Material) {
  if (patched.has(m) || m.userData.xray) return;
  patched.add(m); m.userData.xray = true;
  if (!(m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhongMaterial)) return;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, xrayUniforms);
    if (sh.vertexShader.includes('vXrY')) return; // never inject twice (shared / re-patched materials)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vXrY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 xrW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          xrW = instanceMatrix * xrW;
        #endif
        vXrY = (modelMatrix * xrW).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vXrY; uniform vec4 uXr; uniform vec2 uXrRes; uniform float uXrR; uniform float uXrH;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uXr.w > 0.5 && vXrY > uXrH && vViewPosition.z < uXr.z) {
          vec2 sp = gl_FragCoord.xy / uXrRes;
          vec2 d = (sp - uXr.xy) * vec2(uXrRes.x / uXrRes.y, 1.0);
          float k = 1.0 - smoothstep(uXrR * 0.55, uXrR, length(d));
          vec2 g = mod(floor(gl_FragCoord.xy), 4.0);
          float bayer = (mod(g.x + g.y * 2.0, 4.0) * 4.0 + mod(g.x * 3.0 + g.y, 4.0)) / 16.0;
          if (k > bayer) discard;
        }`);
  };
  m.customProgramCacheKey = () => 'xray-' + (prev ? prev.toString().length : 0);
  m.needsUpdate = true;
}

/** Patch every lit material under `root` (idempotent, cheap to call periodically). */
export function patchXray(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(patch); else if (mat) patch(mat);
  });
}

const v = new THREE.Vector3();
/** Per frame: aim the hole at the car. `on` false disables it (driver view, mirrors). */
export function aimXray(cam: THREE.PerspectiveCamera, car: THREE.Vector3, roofY: number, w: number, h: number, on: boolean) {
  const u = xrayUniforms.uXr.value;
  if (!on) { u.w = 0; return; }
  cam.updateMatrixWorld();
  const depth = -v.copy(car).applyMatrix4(cam.matrixWorldInverse).z;
  v.copy(car).project(cam);
  u.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, depth - 1.2, 1);
  xrayUniforms.uXrRes.value.set(w, h);
  xrayUniforms.uXrH.value = roofY;
  xrayUniforms.uXrR.value = THREE.MathUtils.clamp(5.5 / Math.max(depth, 4), 0.12, 0.3);
}

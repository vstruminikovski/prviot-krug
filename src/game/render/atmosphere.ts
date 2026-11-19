// Atmosphere & cinematic layer: post-processing (bloom + Balkan-summer colour grade), physical sky
// with time of day, night headlights and lamp glow, rain, skid marks and tyre smoke.
// Purely visual — weather grip is applied to the simulation separately (env.gripAt).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type TimeOfDay = 'golden' | 'noon' | 'dusk' | 'night';
export type Weather = 'clear' | 'rain' | 'fog';
export const TIME_LABEL: Record<TimeOfDay, string> = { golden: 'Златен час', noon: 'Пладне', dusk: 'Самрак', night: 'Ноќ' };
export const WEATHER_LABEL: Record<Weather, string> = { clear: 'Ведро', rain: 'Дожд', fog: 'Магла' };

interface Preset { elev: number; az: number; sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number; fog: string; fogNear: number; fogFar: number; exposure: number; turbidity: number; rayleigh: number; bloom: number; warm: number; lamps: number }
const PRESETS: Record<TimeOfDay, Preset> = {
  golden: { elev: 9, az: 245, sun: '#ffb66e', sunI: 3.1, hemiSky: '#ffe2bd', hemiGround: '#4f6b6a', hemiI: 1.15, fog: '#e9c39a', fogNear: 120, fogFar: 760, exposure: 0.55, turbidity: 6, rayleigh: 2.2, bloom: 0.32, warm: 1, lamps: 0.15 },
  noon: { elev: 58, az: 200, sun: '#fff2dc', sunI: 3.3, hemiSky: '#dfeefa', hemiGround: '#6a6a55', hemiI: 1.3, fog: '#cfdbe3', fogNear: 160, fogFar: 900, exposure: 0.42, turbidity: 3, rayleigh: 1.2, bloom: 0.18, warm: 0.25, lamps: 0 },
  dusk: { elev: 1.2, az: 255, sun: '#ff7a48', sunI: 1.7, hemiSky: '#d9a8b4', hemiGround: '#3a4a54', hemiI: 1.05, fog: '#a8889a', fogNear: 90, fogFar: 600, exposure: 0.6, turbidity: 9, rayleigh: 3, bloom: 0.55, warm: 0.8, lamps: 0.85 },
  night: { elev: -14, az: 260, sun: '#8fa4d8', sunI: 0.9, hemiSky: '#6a80b0', hemiGround: '#2a3040', hemiI: 1.05, fog: '#202a3c', fogNear: 60, fogFar: 420, exposure: 0.9, turbidity: 2, rayleigh: 0.4, bloom: 0.9, warm: 0.2, lamps: 1 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uWarm: { value: 1 }, uVignette: { value: 0.3 }, uGrain: { value: 0.018 },
    uSat: { value: 1.12 }, uContrast: { value: 1.06 }, uWet: { value: 0 }, uTilt: { value: 0 }, uFringe: { value: 0.0012 },
    uRes: { value: new THREE.Vector2(1, 1) }, uFlash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uWarm, uVignette, uGrain, uSat, uContrast, uWet, uTilt, uFringe, uFlash; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 tap(vec2 uv){
      // lens fringing grows towards the frame edge
      vec2 d = uv - 0.5; float e = dot(d, d);
      return vec3(texture2D(tDiffuse, uv - d * uFringe * e * 8.0).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + d * uFringe * e * 8.0).b);
    }
    void main(){
      vec3 c = tap(vUv);
      // tilt-shift: a sharp horizontal band, soft top and bottom (miniature look in the outside cameras)
      if (uTilt > 0.0) {
        float b = smoothstep(0.18, 0.5, abs(vUv.y - 0.46)) * uTilt;
        if (b > 0.01) {
          vec3 acc = c; float w = 1.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 2.39996 + hash(vUv) * 0.5; float r = (float(i) + 1.0) / 8.0;
            vec2 o = vec2(cos(a), sin(a)) * r * b * 7.0 / uRes;
            acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0;
          }
          c = mix(c, acc / w, b);
        }
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // split toning: cool teal shadows, warm peach highlights
      vec3 shadowT = vec3(0.9, 1.0, 1.06), highT = vec3(1.06, 1.0, 0.92);
      c *= mix(vec3(1.0), mix(shadowT, highT, smoothstep(0.1, 0.8, l)), uWarm);
      c = mix(vec3(l), c, uSat - uWet * 0.22);
      // gentle filmic S-curve around mid grey, lifted blacks (print-film feel)
      c = clamp(c, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), clamp((uContrast - 1.0) * 3.0, 0.0, 0.5));
      c = c * 0.97 + vec3(0.012, 0.014, 0.022);
      vec2 d = vUv - 0.5; c *= 1.0 - uVignette * dot(d, d) * 2.0;
      c += (hash(vUv * uRes) - 0.5) * uGrain; // static grain: no per-frame shimmer
      c = mix(c, vec3(1.0), uFlash);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Atmosphere {
  composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private renderPass: RenderPass;
  sky: Sky;
  time: TimeOfDay = 'golden';
  weather: Weather = 'clear';
  enabled = true;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private heads: THREE.SpotLight[] = [];
  private headTargets: THREE.Object3D[] = [];
  private skid: THREE.InstancedMesh; private skidN = 0; private skidMax = 900;
  private smoke: THREE.Points; private smokeData: { x: number; y: number; z: number; life: number; vx: number; vz: number }[] = [];
  private lastSkid = new Map<number, THREE.Vector3>();

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private sun: THREE.DirectionalLight, private hemi: THREE.HemisphereLight) {
    // multisampled HDR target: the composer otherwise renders without anti-aliasing
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    // soft studio reflections for glossy paint and chrome (lit materials only)
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.55, 0.86);
    this.composer.addPass(this.bloom);
    // tone mapping + sRGB first, then grade in display space (vignette, grain, split tone)
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.sky = new Sky();
    this.sky.scale.setScalar(2400); // stays inside the camera far plane
    (this.sky.material as THREE.ShaderMaterial).fog = false;
    scene.add(this.sky);

    // rain: short streaks re-cycled around the camera
    const n = 2600;
    this.rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.resetDrop(i, true);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b8c6d4', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    scene.add(this.rain);

    // headlights (follow the player pose)
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight('#fff1d0', 0, 55, 0.36, 0.6, 1.5);
      const t = new THREE.Object3D(); s.target = t;
      scene.add(s, t); this.heads.push(s); this.headTargets.push(t);
    }

    // skid marks
    const sg = new THREE.PlaneGeometry(0.22, 0.6); sg.rotateX(-Math.PI / 2);
    this.skid = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: '#141414', transparent: true, opacity: 0.55, depthWrite: false }), this.skidMax);
    this.skid.count = 0; this.skid.frustumCulled = false; this.skid.renderOrder = 1;
    scene.add(this.skid);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3));
    this.smoke = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#d8d4cc', size: 1.6, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }));
    this.smoke.frustumCulled = false;
    scene.add(this.smoke);
    this.setTime('golden');
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2);
    (this.grade.uniforms.uRes as { value: THREE.Vector2 }).value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }
  /** tilt-shift amount (0 = off): used by the outside cameras */
  setTilt(k: number) { const u = this.grade.uniforms.uTilt as { value: number }; u.value += (k - u.value) * 0.08; }
  /** brief white flash (impacts / photo moment) */
  flash(k: number) { (this.grade.uniforms.uFlash as { value: number }).value = Math.max((this.grade.uniforms.uFlash as { value: number }).value, k); }

  setTime(t: TimeOfDay) {
    this.time = t;
    const p = PRESETS[t];
    const phi = THREE.MathUtils.degToRad(90 - p.elev), theta = THREE.MathUtils.degToRad(p.az);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.sunPosition.value.copy(dir); u.turbidity.value = p.turbidity; u.rayleigh.value = p.rayleigh; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
    this.sunDir.copy(dir);
    if (p.elev < 0) this.sunDir.set(-0.4, 0.8, 0.3).normalize();
    this.sun.color.set(p.sun); this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky); this.hemi.groundColor.set(p.hemiGround); this.hemi.intensity = p.hemiI;
    this.applyFog();
    this.renderer.toneMappingExposure = 1.0;
    (this.grade.uniforms.uWarm as { value: number }).value = p.warm;
    this.bloom.strength = p.bloom * 0.8;
    this.scene.environmentIntensity = ({ golden: 0.5, noon: 0.6, dusk: 0.22, night: 0.05 } as const)[t];
    this.bloom.threshold = t === 'night' || t === 'dusk' ? 0.72 : 1.25;
    this.lampLevel = p.lamps;
    this.updateLamps();
  }
  sunDir = new THREE.Vector3(-0.8, 0.3, 0.5);
  private lampLevel = 0;

  setWeather(w: Weather) { this.weather = w; this.rain.visible = w === 'rain'; this.applyFog(); (this.grade.uniforms.uWet as { value: number }).value = w === 'rain' ? 1 : 0; }

  private applyFog() {
    const p = PRESETS[this.time];
    const f = this.scene.fog as THREE.Fog;
    const col = new THREE.Color(p.fog);
    if (this.weather === 'rain') col.lerp(new THREE.Color('#7d8790'), 0.55);
    if (this.weather === 'fog') col.lerp(new THREE.Color('#c9cdd0'), 0.6);
    f.color.copy(col);
    f.near = this.weather === 'fog' ? 12 : this.weather === 'rain' ? p.fogNear * 0.5 : p.fogNear;
    f.far = this.weather === 'fog' ? 140 : this.weather === 'rain' ? p.fogFar * 0.55 : p.fogFar;
    this.scene.background = col.clone();
    this.sky.visible = this.weather !== 'fog';
    // distant ridges turn into a flat fog-coloured wall when visibility drops — hide them then
    this.scene.traverse((o) => { if (o.name === 'horizon') o.visible = this.weather === 'clear'; });
    if (this.weather !== 'clear') { this.sun.intensity = PRESETS[this.time].sunI * 0.45; this.hemi.intensity = PRESETS[this.time].hemiI * 0.9; }
  }

  /** Street-lamp heads and similar emissive props glow at dusk/night. */
  updateLamps() {
    const lv = Math.max(this.lampLevel, this.weather === 'clear' ? 0 : 0.5);
    this.scene.traverse((o) => {
      if (o.name !== 'lamphead') return;
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial;
      m.emissive.set('#ffcf8a'); m.emissiveIntensity = 0.15 + lv * 3.2;
    });
  }
  get lightsNeeded() { return this.time === 'night' || this.time === 'dusk' || this.weather !== 'clear'; }

  private resetDrop(i: number, any: boolean) {
    const c = this.camera?.position ?? new THREE.Vector3();
    const x = c.x + (Math.random() - 0.5) * 60, z = c.z + (Math.random() - 0.5) * 60, y = c.y + (any ? Math.random() * 30 - 5 : 22);
    this.rainPos.set([x, y, z, x + 0.06, y - 0.7, z + 0.03], i * 6);
  }

  /** Per frame: headlights, rain, skid marks, smoke. */
  update(dt: number, player: { x: number; y: number; z: number; h: number; vx: number; vy: number; brake: number; spin: boolean; track: number; wheelbase: number; L: number } | null) {
    (this.grade.uniforms.uTime as { value: number }).value += dt;
    const fl = this.grade.uniforms.uFlash as { value: number }; fl.value *= Math.exp(-dt * 9);
    // headlights
    const on = this.lightsNeeded && !!player;
    for (let i = 0; i < 2; i++) {
      const s = this.heads[i];
      s.intensity = on ? (this.time === 'night' ? 240 : 120) : 0;
      if (!player) continue;
      const c = Math.cos(player.h), sn = Math.sin(player.h), side = i ? 0.55 : -0.55;
      const fx = player.x + c * (player.L / 2) + sn * side, fy = player.y + sn * (player.L / 2) - c * side;
      s.position.set(fx, player.z + 0.7, -fy);
      this.headTargets[i].position.set(fx + c * 14, player.z - 0.4, -(fy + sn * 14));
    }
    // rain falls and recycles around the camera
    if (this.rain.visible) {
      const pos = this.rainPos;
      for (let i = 0; i < pos.length / 6; i++) {
        const k = i * 6;
        pos[k + 1] -= dt * 24; pos[k + 4] -= dt * 24;
        if (pos[k + 4] < this.camera.position.y - 6 || Math.abs(pos[k] - this.camera.position.x) > 32 || Math.abs(pos[k + 2] - this.camera.position.z) > 32) this.resetDrop(i, false);
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    // skid marks & smoke from real slip: lateral sliding, wheelspin or hard braking at speed
    if (player) {
      const sliding = Math.abs(player.vy) > 1.2 || player.spin || (player.brake > 0.85 && Math.abs(player.vx) > 9);
      const c = Math.cos(player.h), sn = Math.sin(player.h);
      for (let w = 0; w < 2; w++) {
        const side = (w ? 1 : -1) * player.track / 2;
        const rx = player.x - c * player.wheelbase / 2 + sn * side, ry = player.y - sn * player.wheelbase / 2 - c * side;
        const p = new THREE.Vector3(rx, player.z + 0.02, -ry);
        const last = this.lastSkid.get(w);
        if (sliding && (!last || last.distanceTo(p) > 0.45)) {
          const m = new THREE.Matrix4().makeRotationY(player.h - Math.PI / 2).setPosition(p);
          this.skid.setMatrixAt(this.skidN % this.skidMax, m); this.skidN++;
          this.skid.count = Math.min(this.skidN, this.skidMax); this.skid.instanceMatrix.needsUpdate = true;
          this.lastSkid.set(w, p);
          if (this.smokeData.length < 240) this.smokeData.push({ x: p.x, y: p.y + 0.2, z: p.z, life: 1.4, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6 });
        } else if (!sliding) this.lastSkid.delete(w);
      }
    }
    const sp = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    this.smokeData = this.smokeData.filter((d) => (d.life -= dt) > 0);
    for (let i = 0; i < 240; i++) {
      const d = this.smokeData[i];
      if (d) { d.y += dt * 0.8; d.x += d.vx * dt; d.z += d.vz * dt; sp.setXYZ(i, d.x, d.y, d.z); } else sp.setXYZ(i, 0, -999, 0);
    }
    sp.needsUpdate = true;
    this.sky.position.copy(this.camera.position);
  }

  render() {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    this.composer.render();
  }
}

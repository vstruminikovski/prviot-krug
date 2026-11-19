// Three.js view: renders whatever the simulation (live) or a recorded frame (replay) says.
// It owns no rules. Mirrors are real scene renders from cameras at the vehicle's mirror points.
import * as THREE from 'three';
import { buildWorld } from './worldBuilder';
import { PlateAtlas } from './textures';
import { buildCarRig, type CarRig } from './carMesh';
import { buildPerson, buildSeated, type PersonRig } from './people';
import { CAFE_TABLES, FATHER_SEAT } from '../content/debarMaalo';
import type { Frame } from '../sim/recorder';
import type { Sim, ActorMeta } from '../sim/sim';
import type { CarType } from '../content/generate';
import { clamp, wrapAngle, type Pose } from '../math';
import type { VehicleDef, PlateLayout } from '../vehicles/defs';
import { loadVehicleGLB, vehicleReady, rigFromGLB, proceduralRig, type VehicleRig } from './vehicleAssets';
import { buildCityExtras, buildOpenRoadScene, buildPolygonScene, type CityExtras, type OpenRoadScene } from './envScenes';
import { buildGarage, type GarageScene } from './garage';
import { decorateOpenRoad } from './kenneyProps';
import { Atmosphere } from './atmosphere';
import { patchXray, aimXray, xrayUniforms } from './xray';
import type { EnvId } from '../env/types';
import type { Glance } from '../input';

export type CamMode = 'chase' | 'high' | 'driver';
export type ShotMode = CamMode | 'replay' | 'title' | 'finish';

export interface Custom { paint: string; finish: 'solid' | 'metallic'; plate: string; layout: PlateLayout; trims: string[]; interior: string; mirrorAdj: number }

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private atlas = new PlateAtlas();
  player: VehicleRig | null = null;
  playerDef: VehicleDef | null = null;
  private playerToken = 0;
  private cars = new Map<string, CarRig>();
  private peds = new Map<string, PersonRig>();
  private strollers = new Map<string, PersonRig>();
  private highlight: THREE.Group;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camInit = false; private camYaw = 0;
  private glanceYaw = 0; private camLastH = 0; private lookSide = 0; private pull = 0;
  /** last sim-step longitudinal acceleration (for camera pull) */
  get lastAx() { return this.stepAx; }
  private glassShot = ''; private xrFrame = 0; private tmpV2 = new THREE.Vector2(); private tmpV3 = new THREE.Vector3();
  camMode: CamMode = 'chase';
  private envGroups: Partial<Record<EnvId, THREE.Group>> = {};
  private envKey: Partial<Record<EnvId, string>> = {};
  env: EnvId = 'city';
  cityExtras: CityExtras | null = null;
  openRoad: OpenRoadScene | null = null;
  private patrons = new THREE.Group();
  // mirrors
  private mirrorCams: THREE.PerspectiveCamera[] = [];
  private mirrorRTs: THREE.WebGLRenderTarget[] = [];
  private overlay = new THREE.Scene();
  private overlayCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private mirrorPanels: THREE.Mesh[] = [];
  private mirrorFrame = 0; private mirrorFocus = -1;
  private coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  mirrorsOn = true;
  mirrorQuality: 'high' | 'low' = 'high';
  private noRearPanel: THREE.Mesh;
  // garage
  garage: GarageScene | null = null;
  garageRig: VehicleRig | null = null;
  private garageToken = 0;
  orbit = { yaw: 0.8, pitch: 0.25, dist: 7.5, cockpit: false };
  width = 1; height = 1;
  atmo: Atmosphere;
  private speedFov = 0;
  private shake = 0;
  /** camera impulse on impacts (presentation only) */
  kick(strength: number) { if (this.motion) this.shake = Math.min(1, this.shake + strength); }
  /** reduced-motion option: no shake, no speed FOV, no tilt-shift */
  motion = true;
  quality: 'low' | 'medium' | 'high' = 'high';
  /** Graphics quality: pixel ratio, post chain, ambient occlusion, shadow resolution. */
  setQuality(q: 'low' | 'medium' | 'high') {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2));
    this.atmo.enabled = q !== 'low';
    if (this.atmo.ao) this.atmo.ao.enabled = q === 'high';
    const ms = q === 'high' ? 2048 : q === 'medium' ? 1536 : 1024;
    if (this.sun.shadow.mapSize.x !== ms) { this.sun.shadow.mapSize.set(ms, ms); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.setSize(this.width, this.height);
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 4200);
    this.scene.fog = new THREE.Fog('#e8c39a', 120, 700);
    this.scene.background = new THREE.Color('#e8c39a');
    // late-1990s Balkan summer: warm low sun, dusky teal fill from the sky
    this.hemi = new THREE.HemisphereLight('#ffe2bd', '#4f6b6a', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffbf7a', 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 320;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.atmo = new Atmosphere(this.renderer, this.scene, this.camera, this.sun, this.hemi);
    // replay cue marker
    this.highlight = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 48), new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; ring.renderOrder = 10;
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 12), new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false, depthTest: false }));
    pin.rotation.x = Math.PI; pin.position.y = 3.6; pin.renderOrder = 10;
    this.highlight.add(ring, pin); this.highlight.visible = false;
    this.scene.add(this.highlight);
    // mirrors: three cameras into small render targets, shown as flipped panels in an overlay
    for (let i = 0; i < 3; i++) {
      const cam = new THREE.PerspectiveCamera(i === 2 ? 34 : 30, 2, 0.15, 260);
      this.mirrorCams.push(cam);
      const rt = new THREE.WebGLRenderTarget(i === 2 ? 512 : 360, i === 2 ? 160 : 220);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.mirrorRTs.push(rt);
      const tex = rt.texture.clone(); void tex;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mirrorMaterial(rt.texture, i === 2));
      this.overlay.add(panel);
      this.mirrorPanels.push(panel);
    }
    const nrCanvas = document.createElement('canvas'); nrCanvas.width = 256; nrCanvas.height = 80;
    const g = nrCanvas.getContext('2d')!; g.fillStyle = '#2b2a27'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#d8cdb4'; g.font = '700 20px Arial'; g.textAlign = 'center'; g.fillText('Товарен простор — нема заден прозорец', 128, 46);
    const nrTex = new THREE.CanvasTexture(nrCanvas); nrTex.colorSpace = THREE.SRGBColorSpace;
    this.noRearPanel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: nrTex, toneMapped: false }));
    this.noRearPanel.visible = false;
    this.overlay.add(this.noRearPanel);
    this.buildPatrons();
  }

  private buildPatrons() {
    const looks = [
      { coat: '#5a6b4a', hair: '#3a2a1a', carry: 'none' as const, height: 1.74 },
      { coat: '#8a3a2a', hair: '#c9c2b5', carry: 'none' as const, height: 1.66, skirt: true },
      { coat: '#2e3e5e', hair: '#1a1a1a', carry: 'none' as const, height: 1.8, cap: true },
      { coat: '#c9a66b', hair: '#5a3a20', carry: 'none' as const, height: 1.68 },
    ];
    CAFE_TABLES.forEach((t, i) => {
      if (Math.hypot(t.x - FATHER_SEAT.x, t.y - FATHER_SEAT.y) < 1.5 || i % 3 === 2) return;
      const p = buildSeated(looks[i % looks.length], i); p.position.set(t.x - 0.62, 0.16, -t.y); this.patrons.add(p);
    });
    const father = buildSeated({ coat: '#1f3b3a', hair: '#9a948a', carry: 'none', height: 1.76, cap: true }, 2);
    father.position.set(FATHER_SEAT.x, 0.16, -FATHER_SEAT.y + 0.62); father.rotation.y = Math.PI / 2;
    this.patrons.add(father);
  }

  setSize(w: number, h: number) {
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.atmo.setSize(w, h);
    this.overlayCam.right = w; this.overlayCam.top = h; this.overlayCam.updateProjectionMatrix();
    this.layoutMirrors(null);
  }

  private layoutMirrors(glance: Glance) {
    const w = this.width, h = this.height;
    const touch = this.coarse;
    const small = Math.min(1, w / 1100, h / 720) * (touch ? 0.8 : 1);
    const sw = 150 * small + 30, sh = sw * 0.58;
    const cw = 250 * small + 34, ch = cw * 0.28;
    const sideY = touch ? h * 0.7 : h * 0.5; // phones: above the thumb controls
    const base: [number, number, number, number][] = [
      [sw / 2 + 16, sideY, sw, sh], // left
      [w - sw / 2 - 16, sideY, sw, sh], // right
      [w / 2, h - (touch ? 62 : 78) - ch / 2, cw, ch], // interior
    ];
    const big = glance === 'mirrorL' ? 0 : glance === 'mirrorR' ? 1 : glance === 'mirrorC' ? 2 : -1;
    this.mirrorFocus = big;
    base.forEach(([x, y, pw, ph], i) => {
      const k = i === big ? 2.1 : 1;
      const p = this.mirrorPanels[i];
      const px = i === big ? (i === 0 ? Math.max(x, (pw * k) / 2 + 14) : i === 1 ? Math.min(x, w - (pw * k) / 2 - 14) : x) : x;
      const py = i === big ? Math.min(y, h - (ph * k) / 2 - 60) : y;
      p.position.set(px, py, 0); p.scale.set(pw * k, ph * k, 1);
      ((p.material as THREE.ShaderMaterial).uniforms.uSize.value as THREE.Vector2).set(pw * k, ph * k);
      if (i === 2) { this.noRearPanel.position.set(px, py, 0.01); this.noRearPanel.scale.set(pw * k, ph * k, 1); }
    });
  }

  // ------------------------------------------------------------ environments
  /** Build an environment ahead of time (hidden) and compile its shaders, so starting a drive never hitches. */
  prebuild(env: EnvId, opts: { vehicleLength: number; debrisS?: number }) {
    const g = this.ensureEnv(env, opts);
    if (env === this.env) return;
    g.visible = true;
    const p = this.renderer.compileAsync(this.scene, this.camera);
    g.visible = false;
    void p.catch(() => {});
  }
  private ensureEnv(env: EnvId, opts: { vehicleLength: number; debrisS?: number }): THREE.Group {
    const key = env === 'polygon' ? `L${opts.vehicleLength > 6 ? 'big' : opts.vehicleLength > 4 ? 'long' : 'short'}` : env === 'openRoad' ? `d${Math.round(opts.debrisS ?? 0)}` : 'c';
    if (this.envGroups[env] && this.envKey[env] !== key) { this.scene.remove(this.envGroups[env]!); delete this.envGroups[env]; }
    if (!this.envGroups[env]) {
      let g: THREE.Group;
      if (env === 'city') {
        g = buildWorld(this.atlas).group;
        this.cityExtras = buildCityExtras(); g.add(this.cityExtras.group); g.add(this.patrons);
      } else if (env === 'polygon') g = buildPolygonScene(opts.vehicleLength);
      else { this.openRoad = buildOpenRoadScene(opts.debrisS ?? 2100); g = this.openRoad.group; void decorateOpenRoad(g).then(() => patchXray(g)); }
      patchXray(g);
      g.visible = env === this.env;
      this.envGroups[env] = g; this.envKey[env] = key;
      this.scene.add(g);
    }
    return this.envGroups[env]!;
  }

  setEnvironment(env: EnvId, opts: { vehicleLength: number; debrisS?: number }) {
    this.env = env;
    this.ensureEnv(env, opts);
    for (const [k, g] of Object.entries(this.envGroups)) g!.visible = k === env;
    for (const r of this.cars.values()) r.group.visible = false;
    for (const r of this.peds.values()) r.group.visible = false;
    for (const r of this.strollers.values()) r.group.visible = env === 'city';
  }

  /** Atmosphere per environment / condition (wet road, dusk). */
  setMood(m: { wet?: boolean; dusk?: boolean }) {
    if (m.wet && this.atmo.weather === 'clear') this.atmo.setWeather('rain');
    this.atmo.updateLamps();
  }


  // ------------------------------------------------------------ vehicles
  private makeRig(def: VehicleDef, c: Custom, onReady: (r: VehicleRig) => void): VehicleRig {
    const have = vehicleReady(def.id);
    if (have) return rigFromGLB(have, def, c.paint, c.finish, c.plate, c.layout); // no placeholder pop
    const proc = proceduralRig(def, c.paint, c.finish, c.plate, this.atlas, c.trims);
    loadVehicleGLB(def.id).then((gltf) => { if (gltf) onReady(rigFromGLB(gltf, def, c.paint, c.finish, c.plate, c.layout)); });
    return proc;
  }

  setPlayer(def: VehicleDef, c: Custom) {
    const token = ++this.playerToken;
    if (this.player) this.scene.remove(this.player.group);
    this.playerDef = def;
    this.player = this.makeRig(def, c, (glb) => {
      if (token !== this.playerToken) return;
      const old = this.player!; glb.group.position.copy(old.group.position); glb.group.rotation.copy(old.group.rotation);
      this.scene.remove(old.group); this.player = glb; this.scene.add(glb.group);
    });
    this.scene.add(this.player.group);
  }
  setPlayerPaint(hex: string, finish: 'solid' | 'metallic') { this.player?.setPaint(hex, finish); this.garageRig?.setPaint(hex, finish); }

  private npcRig(id: string, meta: ActorMeta | undefined): CarRig | null {
    let rig = this.cars.get(id);
    if (!rig) {
      if (!meta || meta.kind !== 'car') return null;
      const t = meta.type as string;
      if (t === 'tractor') rig = buildTractor();
      else if (t === 'ambulance') rig = buildAmbulance(this.atlas);
      else rig = buildCarRig(t as CarType, meta.color, meta.plate, this.atlas, 0.3);
      this.cars.set(id, rig); this.scene.add(rig.group);
    }
    return rig;
  }
  private pedRig(id: string, meta: ActorMeta | undefined): PersonRig | null {
    let rig = this.peds.get(id);
    if (!rig) {
      if (!meta || meta.kind !== 'ped') return null;
      rig = buildPerson(meta.look, 1); this.peds.set(id, rig); this.scene.add(rig.group);
    }
    return rig;
  }

  private placePlayer(p: Pose & { z?: number }, v: number, steer: number, dt: number, l: boolean, r: boolean, brake: boolean, gear: string, pitch: number, roll: number) {
    const rig = this.player; if (!rig) return;
    rig.group.position.set(p.x, (p.z ?? 0) + 0.01, -p.y);
    rig.group.rotation.set(0, p.h, 0);
    rig.body.rotation.z = pitch; rig.body.rotation.x = roll; rig.body.position.y = this.susp.h;
    rig.setIndicators(l, r); rig.setBrake(brake);
    const spin = (this.spin += (v / (this.playerDef?.dims.wheelR ?? 0.3)) * dt);
    rig.setSteer(steer, spin); rig.setSteeringWheel(-steer * 14); rig.setGear(gear);
    void dt;
  }
  private spin = 0;

  // ---- render interpolation: the sim runs at a fixed 60 Hz, the display at 60–144 Hz.
  // Before every sim step the previous state is captured; frames blend prev→current by `alpha`,
  // so motion is smooth on any refresh rate (no judder on 120 Hz screens).
  alpha = 1;
  private prevP = { x: 0, y: 0, h: 0, z: 0, vx: 0, ok: false };
  private prevA = new Map<string, { x: number; y: number; h: number }>();
  private stepAx = 0;
  capture(sim: Sim) {
    const p = sim.player;
    this.stepAx = this.prevP.ok ? (p.vx - this.prevP.vx) * 60 : 0;
    Object.assign(this.prevP, { x: p.x, y: p.y, h: p.h, z: p.z, vx: p.vx, ok: true });
    for (const c of sim.cars) { if (c.done) continue; const q = c.pose; const o = this.prevA.get(c.id); if (o) { o.x = q.x; o.y = q.y; o.h = q.h; } else this.prevA.set(c.id, { x: q.x, y: q.y, h: q.h }); }
    for (const d of sim.peds) { if (d.done) continue; const o = this.prevA.get(d.id); if (o) { o.x = d.pos.x; o.y = d.pos.y; o.h = d.h; } else this.prevA.set(d.id, { x: d.pos.x, y: d.pos.y, h: d.h }); }
  }
  resetInterp() { this.prevP.ok = false; this.prevA.clear(); this.alpha = 1; this.susp = { p: 0, pv: 0, r: 0, rv: 0, h: 0, hv: 0 }; }
  private lerpPose(id: string, x: number, y: number, h: number) {
    const o = this.prevA.get(id), a = this.alpha;
    if (!o || Math.hypot(x - o.x, y - o.y) > 4) return { x, y, h };
    return { x: o.x + (x - o.x) * a, y: o.y + (y - o.y) * a, h: o.h + wrapAngle(h - o.h) * a };
  }
  /** Interpolated player pose for this frame. */
  playerPose(sim: Sim): Pose & { z: number } {
    const p = sim.player, o = this.prevP, a = this.alpha;
    if (!o.ok || Math.hypot(p.x - o.x, p.y - o.y) > 4) return { x: p.x, y: p.y, h: p.h, z: p.z };
    return { x: o.x + (p.x - o.x) * a, y: o.y + (p.y - o.y) * a, h: o.h + wrapAngle(p.h - o.h) * a, z: o.z + (p.z - o.z) * a };
  }

  // ---- visual suspension: a damped spring that leans the body with real accelerations
  private susp = { p: 0, pv: 0, r: 0, rv: 0, h: 0, hv: 0 };
  private stepSuspension(dt: number, ax: number, ay: number) {
    const s = this.susp;
    const tp = clamp(ax * 0.0062, -0.045, 0.045), tr = clamp(ay * 0.0085, -0.06, 0.06), th = -Math.abs(tr) * 0.25 - Math.max(0, -tp) * 0.6;
    const k = 70, c = 2 * Math.sqrt(k) * 0.42;
    for (let t = dt; t > 0; t -= 1 / 120) {
      const h = Math.min(t, 1 / 120);
      s.pv += (k * (tp - s.p) - c * s.pv) * h; s.p += s.pv * h;
      s.rv += (k * (tr - s.r) - c * s.rv) * h; s.r += s.rv * h;
      s.hv += (k * 1.4 * (th - s.h) - c * 1.2 * s.hv) * h; s.h += s.hv * h;
    }
  }
  /** a jolt into the springs (impacts, kerbs) */
  jolt(v: number) { this.susp.hv -= v * 0.6; this.susp.pv -= v * 0.5; }

  /** Live: mirror the simulation state. */
  syncLive(sim: Sim, dt: number, blink: boolean) {
    const p = sim.player;
    const ip = this.playerPose(sim);
    this.stepSuspension(dt, this.stepAx, p.vx * p.r);
    const haz = p.hazards && blink;
    this.placePlayer(ip, p.vx, p.steer, dt, (p.indicator === 'left' && blink) || haz, (p.indicator === 'right' && blink) || haz, p.brake > 0.1, String(p.gear), this.susp.p + p.grade, p.roll * 0.5 + this.susp.r);
    this.atmo.update(dt, { x: ip.x, y: ip.y, z: ip.z, h: ip.h, vx: p.vx, vy: p.vy, brake: p.brake, spin: p.wheelspinning, track: p.def.dims.track, wheelbase: p.def.dims.wheelbase, L: p.L });
    const seen = new Set<string>();
    for (const c of sim.cars) {
      if (c.done) continue;
      const rig = this.npcRig(c.id, sim.actorMeta.get(c.id));
      if (!rig) continue;
      seen.add(c.id); rig.group.visible = true;
      const c0 = c.pose, q = this.lerpPose(c.id, c0.x, c0.y, c0.h);
      rig.group.position.set(q.x, sim.world.heightAt(q.x, q.y) + 0.01, -q.y); rig.group.rotation.y = q.h;
      const hz = c.id === 'van-dbl' && blink;
      rig.setIndicators((c.indicator === 'left' && blink) || hz, (c.indicator === 'right' && blink) || hz);
      rig.setBrake(c.braking);
      rig.setHazardsLamp?.(blink);
    }
    for (const [id, rig] of this.cars) if (!seen.has(id)) rig.group.visible = false;
    const seenP = new Set<string>();
    for (const d of sim.peds) {
      if (d.done) continue;
      const rig = this.pedRig(d.id, sim.actorMeta.get(d.id));
      if (!rig) continue;
      seenP.add(d.id); rig.group.visible = true;
      const q = this.lerpPose(d.id, d.pos.x, d.pos.y, d.h);
      rig.group.position.set(q.x, (d.onRoad ? 0.01 : 0.16) + sim.world.heightAt(q.x, q.y), -q.y);
      rig.group.rotation.y = q.h;
      rig.animate(d.phase, d.state === 'walk' || d.state === 'cross' || d.state === 'after');
    }
    for (const [id, rig] of this.peds) if (!seenP.has(id)) rig.group.visible = false;
    this.syncStrollers(sim);
    this.syncSignals(sim.extraState);
  }

  syncSignals(x: Record<string, number | string> | undefined) {
    if (!x) return;
    if (this.cityExtras && this.env === 'city') {
      for (const h of this.cityExtras.heads) h.set((x.sig as never) ?? 'green');
      for (const m of this.cityExtras.pedHeads) m.color.set(x.ped === 'green' ? '#2fae55' : x.ped === 'flash' ? ((performance.now() / 300) % 2 < 1 ? '#2fae55' : '#222') : '#d0281c');
    }
    if (this.openRoad && this.env === 'openRoad') {
      this.openRoad.works[0].set((x.works as never) ?? 'red');
      this.openRoad.works[1].set((x.worksOnc as never) ?? 'red');
    }
  }

  syncStrollers(sim: Sim) {
    for (const s of sim.strollers) {
      let rig = this.strollers.get(s.id);
      if (!rig) { rig = buildPerson(s.look, s.id.length); this.strollers.set(s.id, rig); this.scene.add(rig.group); }
      rig.group.visible = this.env === 'city';
      rig.group.position.set(s.pos.x, 0.16, -s.pos.y); rig.group.rotation.y = s.h;
      rig.animate(s.phase, true);
    }
  }

  /** Replay: pose everything from a recorded frame. */
  syncReplay(f: Frame, sim: Sim, blink: boolean, dt: number) {
    this.placePlayer({ ...f.p, z: f.p.z }, f.p.v, f.p.steer, dt, f.p.ind === 1 && blink, f.p.ind === 2 && blink, f.p.brk > 0.1, f.p.g ?? 'N', 0, 0);
    const seen = new Set<string>(), seenP = new Set<string>();
    for (const a of f.a) {
      if (a.k === 'car') {
        const rig = this.npcRig(a.id, sim.actorMeta.get(a.id)); if (!rig) continue;
        seen.add(a.id); rig.group.visible = true;
        rig.group.position.set(a.x, sim.world.heightAt(a.x, a.y) + 0.01, -a.y); rig.group.rotation.y = a.h;
        rig.setIndicators(a.ind === 1 && blink, a.ind === 2 && blink); rig.setBrake(a.brk);
      } else {
        const rig = this.pedRig(a.id, sim.actorMeta.get(a.id)); if (!rig) continue;
        seenP.add(a.id); rig.group.visible = true;
        rig.group.position.set(a.x, 0.1 + sim.world.heightAt(a.x, a.y), -a.y); rig.group.rotation.y = a.h; rig.animate(a.ph ?? 0, true);
      }
    }
    for (const [id, rig] of this.cars) if (!seen.has(id)) rig.group.visible = false;
    for (const [id, rig] of this.peds) if (!seenP.has(id)) rig.group.visible = false;
    this.syncSignals(f.x);
  }

  setHighlight(pos: { x: number; y: number } | null, t: number) {
    this.highlight.visible = !!pos;
    if (pos) {
      this.highlight.position.set(pos.x, 0, -pos.y);
      const s = 1 + Math.sin(t * 6) * 0.12; this.highlight.scale.set(s, 1, s);
      this.highlight.children[1].position.y = 3.4 + Math.sin(t * 4) * 0.25;
    }
  }

  resetShot() { this.camInit = false; }
  private introT = 0; private introLen = 1;
  /** opening camera sweep: from a low front three-quarter view round to the driving camera */
  startIntro(secs: number) { this.introT = secs; this.introLen = secs; }
  setCamMode(m: CamMode) { this.camMode = m; this.camInit = false; }

  /** Camera for the given shot. `p` is the player pose (with z). */
  updateCamera(dt: number, shot: ShotMode, p: Pose & { z?: number }, v: number, steer: number, glance: Glance, extra?: { focus?: { x: number; y: number } }) {
    const cam = this.camera;
    const z = p.z ?? 0;
    const base = new THREE.Vector3(p.x, z, -p.y);
    const targetGlance = glance === 'shoulderL' ? 2.2 : glance === 'shoulderR' ? -2.2 : glance === 'lookL' ? 1.15 : glance === 'lookR' ? -1.15 : 0;
    this.glanceYaw += (targetGlance - this.glanceYaw) * Math.min(1, dt * 9);
    let fov = 62;
    const def = this.playerDef;
    const glbInterior = this.player?.interior ?? [];
    if (shot === 'driver' && def) {
      const e = def.eye;
      const c = Math.cos(p.h), s = Math.sin(p.h);
      // vehicle frame (x fwd, z right) → world
      const wx = p.x + e.x * c + e.z * s, wy = p.y + e.x * s - e.z * c;
      const pos = new THREE.Vector3(wx, z + e.y, -wy);
      const yaw = p.h + steer * 0.18 + this.glanceYaw;
      const look = pos.clone().add(new THREE.Vector3(Math.cos(yaw), -0.06, -Math.sin(yaw)).multiplyScalar(10));
      cam.position.copy(pos); cam.lookAt(look);
      cam.rotateZ(-this.susp.r * 0.35); cam.rotateX(-this.susp.p * 0.5);
      fov = 70; this.camInit = false;
      for (const o of glbInterior) o.visible = true;
    } else if (shot === 'replay') {
      if (!this.camInit) this.camYaw = p.h;
      this.camYaw += wrapAngle(p.h - this.camYaw) * (1 - Math.exp(-dt * 2));
      const cf = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      const f = extra?.focus ? new THREE.Vector3(extra.focus.x, z, -extra.focus.y) : base.clone().addScaledVector(cf, 12);
      const sep = Math.min(60, f.distanceTo(base));
      const pos = base.clone().addScaledVector(cf, -(8 + sep * 0.12)).setY(z + 7.5 + sep * 0.13);
      const look = base.clone().lerp(f, 0.45).setY(z + 0.8);
      if (!this.camInit) { this.camPos.copy(pos); this.camLook.copy(look); this.camInit = true; }
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 2.5)); this.camLook.lerp(look, 1 - Math.exp(-dt * 3));
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    } else if (shot === 'finish') {
      // slow orbit around the stopped car
      if (!this.camInit) { this.camYaw = p.h + Math.PI * 0.3; this.camInit = true; }
      this.camYaw += dt * 0.42;
      const L = def?.dims.L ?? 3.5, r = L * 1.5 + 3.4;
      cam.position.set(p.x + Math.cos(this.camYaw) * r, z + 1.9, -(p.y + Math.sin(this.camYaw) * r));
      cam.lookAt(p.x, z + 0.75, -p.y);
      fov = 46;
    } else if (shot === 'title') {
      // menu: a slow crane drifting along the neighbourhood (tilt-shift makes it a diorama)
      const t = performance.now() / 1000;
      const u = 0.5 - 0.5 * Math.cos((t / 70) * Math.PI * 2);
      const A = [120, 60, 55, 260, 0, -110], B = [330, 55, 65, 440, 0, -90];
      const m = (i: number) => A[i] + (B[i] - A[i]) * u;
      cam.position.set(m(0), m(1) + Math.sin(t / 11) * 3, m(2)); cam.lookAt(m(3), m(4), m(5));
      fov = 50;
    } else {
      // chase / high: rigidly follow the car's position (no rubber-band lag at speed);
      // only the heading is smoothed, plus springs for anticipation and acceleration feel.
      const high = shot === 'high';
      if (!this.camInit) { this.camYaw = p.h; this.camLastH = p.h; this.lookSide = 0; this.pull = 0; }
      const yawRate = dt > 0 ? wrapAngle(p.h - this.camLastH) / dt : 0; this.camLastH = p.h;
      const rev = v < -0.3;
      const follow = high ? 1.4 : 2.2 + Math.min(2.2, Math.abs(v) * 0.11);
      const goal = p.h; void rev;
      this.camYaw += wrapAngle(goal - this.camYaw) * (1 - Math.exp(-dt * follow));
      this.lookSide += (clamp(yawRate * (high ? 2 : 1.4), -2.2, 2.2) - this.lookSide) * (1 - Math.exp(-dt * 2.5));
      this.pull += (clamp(this.lastAx * 0.05, -0.8, 0.8) - this.pull) * (1 - Math.exp(-dt * 3));
      const yaw = this.camYaw + this.glanceYaw;
      const cf = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const side = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // +right
      const L = def?.dims.L ?? 3.5, H = def?.dims.H ?? 1.4;
      const sp = clamp(Math.abs(v), 0, 30);
      if (high) {
        const dist = 10.5 + L * 0.7 + sp * 0.06;
        cam.position.copy(base).addScaledVector(cf, -dist).setY(z + 6.6 + L * 0.35 + sp * 0.04);
        cam.lookAt(base.clone().addScaledVector(cf, 2.5 + sp * 0.12).addScaledVector(side, -this.lookSide * 1.2).setY(z + 0.6));
        fov = 50;
      } else {
        const dist = L * 1.2 + 2.3 + sp * 0.045 + this.pull;
        cam.position.copy(base).addScaledVector(cf, -dist).addScaledVector(side, this.lookSide * 0.35).setY(z + H + 0.95 + sp * 0.012);
        cam.lookAt(base.clone().addScaledVector(cf, 4 + sp * 0.18).addScaledVector(side, -this.lookSide * 1.1).setY(z + H * 0.62));
        this.speedFov += ((this.motion ? clamp(sp - 8, 0, 22) * 0.42 : 0) - this.speedFov) * Math.min(1, dt * 2);
        fov = 60 + this.speedFov;
      }
      this.camInit = true;
      if (this.introT > 0) {
        this.introT = Math.max(0, this.introT - dt);
        const u = 1 - this.introT / this.introLen, e = u * u * (3 - 2 * u);
        const ang = p.h + Math.PI * 0.8 * (1 - e) + 0.35 * (1 - e);
        const r = (L: number) => L * 1.6 + 3.2;
        const from = base.clone().add(new THREE.Vector3(Math.cos(ang) * r(def?.dims.L ?? 3.5), 1.1 + 0.6 * e, -Math.sin(ang) * r(def?.dims.L ?? 3.5)));
        const to = cam.position.clone();
        const lookTo = base.clone().addScaledVector(cf, 4).setY(z + 0.8);
        cam.position.copy(from.lerp(to, e * e));
        cam.lookAt(base.clone().setY(z + 0.7).lerp(lookTo, e));
        fov = THREE.MathUtils.lerp(42, fov, e);
      }
    }
    if (this.shake > 0.001) {
      const k = this.shake * this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; cam.rotation.z += (Math.random() - 0.5) * k * 0.3;
      this.shake *= Math.exp(-dt * 7);
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.sun.target.position.set(p.x, z, -p.y);
    this.sun.position.set(p.x - 85, z + 52, -p.y + 48);
    this.layoutMirrors(glance);
    this.atmo.setTilt(!this.motion ? 0 : shot === 'high' ? 1 : shot === 'chase' ? 0.35 : shot === 'replay' ? 0.8 : shot === 'title' ? 0.7 : 0);
    // keep the car visible through tree crowns / eaves in the outside cameras
    if (++this.xrFrame % 90 === 0 && this.envGroups[this.env]) patchXray(this.envGroups[this.env]!);
    const buf = this.renderer.getDrawingBufferSize(this.tmpV2);
    aimXray(cam, this.tmpV3.set(p.x, z + (def?.dims.H ?? 1.4) * 0.6, -p.y), z + (def?.dims.H ?? 1.4) + 0.35, buf.x, buf.y, shot === 'chase' || shot === 'high' || shot === 'replay');
    if (this.player) {
      // see through the windscreen from the driver's seat (only re-applied when the shot or rig changes)
      const key = `${shot === 'driver'}:${this.player.group.uuid}`;
      if (key !== this.glassShot) {
        this.glassShot = key;
        this.player.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.name === 'Glass') m.opacity = shot === 'driver' ? 0.12 : 0.62; });
        for (const o of this.player.cockpitHidden ?? []) o.visible = shot !== 'driver';
      }
    }
  }

  private updateMirrors(pose: Pose & { z?: number }) {
    const def = this.playerDef; if (!def) return;
    const c = Math.cos(pose.h), s = Math.sin(pose.h);
    const toWorld = (m: { x: number; y: number; z: number }) => new THREE.Vector3(pose.x + m.x * c + m.z * s, (pose.z ?? 0) + m.y, -(pose.y + m.x * s - m.z * c));
    const set = (cam: THREE.PerspectiveCamera, m: { x: number; y: number; z: number }, outward: number) => {
      const pos = toWorld(m);
      const back = pose.h + Math.PI + outward;
      cam.position.copy(pos);
      cam.lookAt(pos.clone().add(new THREE.Vector3(Math.cos(back), -0.05, -Math.sin(back))));
    };
    set(this.mirrorCams[0], def.mirrors.left, -0.34);
    set(this.mirrorCams[1], def.mirrors.right, 0.34);
    if (def.mirrors.interior) set(this.mirrorCams[2], { ...def.mirrors.interior, x: def.mirrors.interior.x - 0.6 }, 0);
    this.noRearPanel.visible = !def.rearWindow;
  }

  render(mode: 'world' | 'garage', mirrors: boolean, pose?: Pose & { z?: number }) {
    const r = this.renderer;
    if (mode === 'garage' && this.garage) {
      r.render(this.garage.scene, this.garageCam());
      return;
    }
    this.atmo.render();
    // phones: mirrors cost frame time and thumb space — only the one being looked at is shown
    if (this.coarse) mirrors = mirrors && this.mirrorFocus >= 0;
    if (mirrors && this.mirrorsOn && pose) {
      this.mirrorFrame++;
      {
        this.updateMirrors(pose);
        const prevFog = this.scene.fog; const shadow = r.shadowMap.autoUpdate;
        const xrOn = xrayUniforms.uXr.value.w; xrayUniforms.uXr.value.w = 0;
        r.shadowMap.autoUpdate = false;
        // round-robin: one mirror per frame (each ≥ 20 Hz); the mirror being looked at renders every frame
        const focus = this.mirrorFocus;
        for (let i = 0; i < 3; i++) {
          if (i === 2 && !this.playerDef?.rearWindow) continue;
          const due = this.mirrorFrame % (this.mirrorQuality === 'high' ? 3 : 6) === i;
          if (this.coarse ? i !== focus : !due && i !== focus) continue;
          // the interior mirror looks through the cabin: hide the car shell for it
          if (i === 2 && this.player) this.player.group.visible = false;
          r.setRenderTarget(this.mirrorRTs[i]); r.render(this.scene, this.mirrorCams[i]);
          if (this.player) this.player.group.visible = true;
        }
        r.setRenderTarget(null); r.shadowMap.autoUpdate = shadow; this.scene.fog = prevFog;
        xrayUniforms.uXr.value.w = xrOn;
      }
      for (let i = 0; i < 3; i++) this.mirrorPanels[i].visible = !this.coarse || i === this.mirrorFocus;
      r.autoClear = false; r.clearDepth(); r.render(this.overlay, this.overlayCam); r.autoClear = true;
    }
  }

  // ------------------------------------------------------------ garage
  private gCam = new THREE.PerspectiveCamera(48, 1, 0.05, 80);
  private garageCam() {
    const cam = this.gCam; cam.aspect = this.width / this.height;
    // frame the car in the space the garage panel leaves free (left panel on wide screens, bottom sheet on narrow)
    const w = this.width, h = this.height;
    if (h > w && w <= 760) cam.setViewOffset(w, h, 0, h * 0.28, w, h);
    else { const px = (h < 560 ? Math.min(w * 0.54, 400) : Math.min(w * 0.46, 440)) + 16; cam.setViewOffset(w, h, -px / 2, 0, w, h); }
    cam.updateProjectionMatrix();
    const def = this.playerDef;
    if (this.orbit.cockpit && def) {
      const e = def.eye; cam.fov = 70; cam.updateProjectionMatrix();
      cam.position.set(e.x, e.y, e.z); cam.lookAt(e.x + 5, e.y - 0.3, e.z);
      return cam;
    }
    cam.fov = 48; cam.updateProjectionMatrix();
    const { yaw, pitch, dist } = this.orbit;
    const target = new THREE.Vector3(0, (def?.dims.H ?? 1.4) * 0.45, 0);
    cam.position.set(target.x + Math.cos(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.sin(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(target);
    return cam;
  }

  openGarage(def: VehicleDef, c: Custom) {
    if (!this.garage) this.garage = buildGarage();
    this.playerDef = def;
    const token = ++this.garageToken;
    if (this.garageRig) this.garage.turntable.remove(this.garageRig.group);
    const rig = this.makeRig(def, c, (glb) => {
      if (token !== this.garageToken || !this.garage) return;
      if (this.garageRig) this.garage.turntable.remove(this.garageRig.group);
      this.garageRig = glb; this.garage.turntable.add(glb.group); glb.setGear('N');
    });
    this.garageRig = rig;
    this.garage.turntable.add(rig.group);
    this.orbit.dist = Math.max(5.5, def.dims.L * 1.75);
  }
  garageCustom(c: Custom) { this.garageRig?.setPaint(c.paint, c.finish); this.garageRig?.setPlate(c.plate, c.layout); }
  garageSpin(dt: number) { if (this.garage && !this.orbit.cockpit) this.garage.turntable.rotation.y += dt * 0.12; }

  project(x: number, y: number, h: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, h, -y).project(this.camera);
    const el = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight, visible: v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }
}

// ------------------------------------------------------------ special NPC vehicles
function simpleRig(group: THREE.Group, body: THREE.Group, extra: Partial<CarRig> = {}): CarRig {
  return { group, body, wheels: [], setIndicators() {}, setBrake() {}, setReverse() {}, setPaint() {}, ...extra };
}
function buildTractor(): CarRig {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const red = new THREE.MeshLambertMaterial({ color: '#b5452b' }), dark = new THREE.MeshLambertMaterial({ color: '#1b1b1b' });
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.9), red); hood.position.set(0.7, 1.1, 0); body.add(hood);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 1.2), red); cab.position.set(-0.4, 1.8, 0); body.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.4), dark); roof.position.set(-0.4, 2.5, 0); body.add(roof);
  for (const [x, r, w] of [[1.1, 0.42, 0.3], [-0.5, 0.75, 0.45]] as const) for (const z of [-1, 1]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), dark); t.rotation.x = Math.PI / 2; t.position.set(x, r, z * 0.85); body.add(t); }
  const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.9), new THREE.MeshLambertMaterial({ color: '#8a6a3a' })); trailer.position.set(-2.6, 1.0, 0); body.add(trailer);
  body.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return simpleRig(group, body);
}
function buildAmbulance(atlas: PlateAtlas): CarRig {
  const base = buildCarRig('van', '#f2f2ee', 'SK 0194-HM', atlas, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.22, 1.79), new THREE.MeshLambertMaterial({ color: '#c62a1d' })); stripe.position.set(0, 0.95, 0); base.body.add(stripe);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#2244ff', toneMapped: false });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 1.2), lampMat); bar.position.set(0.9, 1.93, 0); base.body.add(bar);
  return { ...base, setHazardsLamp(on: boolean) { lampMat.color.set(on ? '#3a5bff' : '#0a1050'); } };
}

// ------------------------------------------------------------ mirror glass
/** Rounded mirror glass with a dark bezel, soft inner shadow and a diagonal sheen. The scene
 *  texture is flipped horizontally because a mirror shows the reversed view. */
function mirrorMaterial(map: THREE.Texture, interior: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true, depthTest: false, toneMapped: false,
    uniforms: { map: { value: map }, uSize: { value: new THREE.Vector2(200, 100) }, uR: { value: interior ? 0.5 : 0.36 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec2 uSize; uniform float uR; varying vec2 vUv;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 p = (vUv - 0.5) * uSize;
        float r = min(uSize.x, uSize.y) * uR;
        float d = sdRound(p, uSize * 0.5, r);
        float bez = 5.0;
        float outer = 1.0 - smoothstep(-1.0, 0.5, d);
        float glass = 1.0 - smoothstep(-bez - 1.0, -bez, d);
        vec3 col = texture2D(map, vec2(1.0 - vUv.x, vUv.y)).rgb;
        // inner shadow + sheen
        col *= 0.7 + 0.3 * smoothstep(0.0, 12.0, -d - bez);
        float sheen = smoothstep(0.0, 0.5, 1.0 - abs((vUv.x + vUv.y) - 0.75) * 3.0) * 0.08;
        col += sheen;
        vec3 bezel = mix(vec3(0.06, 0.065, 0.07), vec3(0.32, 0.33, 0.34), smoothstep(-bez, 0.0, d) * (0.4 + 0.6 * vUv.y));
        gl_FragColor = vec4(mix(bezel, col, glass), outer * 0.97);
      }`,
  });
}

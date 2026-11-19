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
import { loadVehicleGLB, rigFromGLB, proceduralRig, type VehicleRig } from './vehicleAssets';
import { buildCityExtras, buildOpenRoadScene, buildPolygonScene, type CityExtras, type OpenRoadScene } from './envScenes';
import { buildGarage, type GarageScene } from './garage';
import type { EnvId } from '../env/types';
import type { Glance } from '../input';

export type CamMode = 'chase' | 'driver';
export type ShotMode = CamMode | 'replay' | 'title';

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
  private glanceYaw = 0;
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
  private mirrorFrame = 0;
  mirrorsOn = true;
  mirrorQuality: 'high' | 'low' = 'high';
  private noRearPanel: THREE.Mesh;
  // garage
  garage: GarageScene | null = null;
  garageRig: VehicleRig | null = null;
  private garageToken = 0;
  orbit = { yaw: 0.8, pitch: 0.25, dist: 7.5, cockpit: false };
  width = 1; height = 1;

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
      const cam = new THREE.PerspectiveCamera(i === 2 ? 34 : 30, 2, 0.15, 900);
      this.mirrorCams.push(cam);
      const rt = new THREE.WebGLRenderTarget(i === 2 ? 512 : 360, i === 2 ? 160 : 220);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.mirrorRTs.push(rt);
      const tex = rt.texture.clone(); void tex;
      const mat = new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      // flip horizontally: a mirror shows the reversed scene
      const uv = panel.geometry.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k));
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#1b1d1c', toneMapped: false }));
      frame.position.z = -0.1; frame.scale.set(1.06, 1.1, 1); panel.add(frame);
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
    this.overlayCam.right = w; this.overlayCam.top = h; this.overlayCam.updateProjectionMatrix();
    this.layoutMirrors(null);
  }

  private layoutMirrors(glance: Glance) {
    const w = this.width, h = this.height;
    const small = Math.min(1, w / 1100);
    const sw = 190 * small + 40, sh = sw * 0.6;
    const cw = 300 * small + 40, ch = cw * 0.3;
    const base: [number, number, number, number][] = [
      [sw / 2 + 14, h * 0.56, sw, sh], // left
      [w - sw / 2 - 14, h * 0.56, sw, sh], // right
      [w / 2, h - 70 - ch / 2, cw, ch], // interior
    ];
    const big = glance === 'mirrorL' ? 0 : glance === 'mirrorR' ? 1 : glance === 'mirrorC' ? 2 : -1;
    base.forEach(([x, y, pw, ph], i) => {
      const k = i === big ? 2.1 : 1;
      const p = this.mirrorPanels[i];
      const px = i === big ? (i === 0 ? Math.max(x, (pw * k) / 2 + 14) : i === 1 ? Math.min(x, w - (pw * k) / 2 - 14) : x) : x;
      const py = i === big ? Math.min(y, h - (ph * k) / 2 - 60) : y;
      p.position.set(px, py, 0); p.scale.set(pw * k, ph * k, 1);
      if (i === 2) { this.noRearPanel.position.set(px, py, 0.01); this.noRearPanel.scale.set(pw * k, ph * k, 1); }
    });
  }

  // ------------------------------------------------------------ environments
  setEnvironment(env: EnvId, opts: { vehicleLength: number; debrisS?: number }) {
    this.env = env;
    const key = env === 'polygon' ? `L${opts.vehicleLength > 6 ? 'big' : opts.vehicleLength > 4 ? 'long' : 'short'}` : env === 'openRoad' ? `d${Math.round(opts.debrisS ?? 0)}` : 'c';
    if (this.envGroups[env] && this.envKey[env] !== key) { this.scene.remove(this.envGroups[env]!); delete this.envGroups[env]; }
    if (!this.envGroups[env]) {
      let g: THREE.Group;
      if (env === 'city') {
        g = buildWorld(this.atlas).group;
        this.cityExtras = buildCityExtras(); g.add(this.cityExtras.group); g.add(this.patrons);
      } else if (env === 'polygon') g = buildPolygonScene(opts.vehicleLength);
      else { this.openRoad = buildOpenRoadScene(opts.debrisS ?? 2100); g = this.openRoad.group; }
      this.envGroups[env] = g; this.envKey[env] = key;
      this.scene.add(g);
    }
    for (const [k, g] of Object.entries(this.envGroups)) g!.visible = k === env;
    for (const r of this.cars.values()) r.group.visible = false;
    for (const r of this.peds.values()) r.group.visible = false;
    for (const r of this.strollers.values()) r.group.visible = env === 'city';
  }

  /** Atmosphere per environment / condition (wet road, dusk). */
  setMood(m: { wet?: boolean; dusk?: boolean }) {
    this.sun.intensity = m.dusk ? 1.6 : m.wet ? 1.9 : 3.0;
    this.sun.color.set(m.dusk ? '#ff9a5a' : '#ffbf7a');
    this.hemi.intensity = m.wet ? 1.0 : 1.25;
    (this.scene.fog as THREE.Fog).color.set(m.wet ? '#a9a49a' : '#e8c39a');
    (this.scene.background as THREE.Color).set(m.wet ? '#a9a49a' : '#e8c39a');
    (this.scene.fog as THREE.Fog).far = m.wet ? 420 : 700;
  }

  // ------------------------------------------------------------ vehicles
  private makeRig(def: VehicleDef, c: Custom, onReady: (r: VehicleRig) => void): VehicleRig {
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
    rig.body.rotation.z = pitch; rig.body.rotation.x = roll;
    rig.setIndicators(l, r); rig.setBrake(brake);
    const spin = (this.spin += (v / (this.playerDef?.dims.wheelR ?? 0.3)) * dt);
    rig.setSteer(steer, spin); rig.setSteeringWheel(-steer * 14); rig.setGear(gear);
    void dt;
  }
  private spin = 0; private pitchS = 0; private lastV = 0;

  /** Live: mirror the simulation state. */
  syncLive(sim: Sim, dt: number, blink: boolean) {
    const p = sim.player;
    const acc = dt > 0 ? (p.vx - this.lastV) / dt : 0; this.lastV = p.vx;
    this.pitchS += (clamp(-acc * 0.006, -0.035, 0.035) + p.grade * 0 - this.pitchS) * Math.min(1, dt * 6);
    const haz = p.hazards && blink;
    this.placePlayer({ ...p.pose, z: p.z }, p.vx, p.steer, dt, (p.indicator === 'left' && blink) || haz, (p.indicator === 'right' && blink) || haz, p.brake > 0.1, String(p.gear), this.pitchS - p.grade, p.roll * 0.5 + clamp(p.vx * p.steer * 0.008, -0.03, 0.03));
    const seen = new Set<string>();
    for (const c of sim.cars) {
      if (c.done) continue;
      const rig = this.npcRig(c.id, sim.actorMeta.get(c.id));
      if (!rig) continue;
      seen.add(c.id); rig.group.visible = true;
      const q = c.pose;
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
      rig.group.position.set(d.pos.x, (d.onRoad ? 0.01 : 0.16) + sim.world.heightAt(d.pos.x, d.pos.y), -d.pos.y);
      rig.group.rotation.y = d.h;
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
    } else if (shot === 'title') {
      const t = performance.now() / 1000;
      cam.position.set(22 + Math.sin(t / 9) * 5, 4.2, -0.8); cam.lookAt(86, 2.2, 7.5);
    } else {
      if (!this.camInit) this.camYaw = p.h;
      this.camYaw += wrapAngle(p.h - this.camYaw) * (1 - Math.exp(-dt * 3.2));
      const yaw = this.camYaw + this.glanceYaw;
      const cf = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const L = def?.dims.L ?? 3.5, H = def?.dims.H ?? 1.4;
      const dist = L * 1.35 + 1.8 + clamp(Math.abs(v) * 0.08, 0, 1.2);
      const pos = base.clone().addScaledVector(cf, -dist).setY(z + H + 1.2);
      const look = base.clone().addScaledVector(cf, 3.5).setY(z + H * 0.7);
      if (!this.camInit) { this.camPos.copy(pos); this.camLook.copy(look); this.camInit = true; }
      const k = 1 - Math.exp(-dt * 4.5);
      this.camPos.lerp(pos, k); this.camLook.lerp(look, Math.min(1, k * 1.6));
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.sun.target.position.set(p.x, z, -p.y);
    this.sun.position.set(p.x - 85, z + 52, -p.y + 48);
    this.layoutMirrors(glance);
    if (this.player) {
      // see through the windscreen from the driver's seat
      this.player.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.name === 'Glass') m.opacity = shot === 'driver' ? 0.12 : 0.62; });
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
    set(this.mirrorCams[0], def.mirrors.left, -0.22);
    set(this.mirrorCams[1], def.mirrors.right, 0.22);
    if (def.mirrors.interior) set(this.mirrorCams[2], { ...def.mirrors.interior, x: def.mirrors.interior.x - 0.6 }, 0);
    this.noRearPanel.visible = !def.rearWindow;
  }

  render(mode: 'world' | 'garage', mirrors: boolean, pose?: Pose & { z?: number }) {
    const r = this.renderer;
    if (mode === 'garage' && this.garage) {
      r.render(this.garage.scene, this.garageCam());
      return;
    }
    r.render(this.scene, this.camera);
    if (mirrors && this.mirrorsOn && pose) {
      this.mirrorFrame++;
      if (this.mirrorQuality === 'high' || this.mirrorFrame % 2 === 0) {
        this.updateMirrors(pose);
        const prevFog = this.scene.fog; const shadow = r.shadowMap.autoUpdate;
        r.shadowMap.autoUpdate = false;
        for (let i = 0; i < 3; i++) {
          if (i === 2 && !this.playerDef?.rearWindow) continue;
          r.setRenderTarget(this.mirrorRTs[i]); r.render(this.scene, this.mirrorCams[i]);
        }
        r.setRenderTarget(null); r.shadowMap.autoUpdate = shadow; this.scene.fog = prevFog;
      }
      this.mirrorPanels[2].visible = true;
      r.autoClear = false; r.clearDepth(); r.render(this.overlay, this.overlayCam); r.autoClear = true;
    }
  }

  // ------------------------------------------------------------ garage
  private gCam = new THREE.PerspectiveCamera(48, 1, 0.05, 80);
  private garageCam() {
    const cam = this.gCam; cam.aspect = this.width / this.height; cam.updateProjectionMatrix();
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

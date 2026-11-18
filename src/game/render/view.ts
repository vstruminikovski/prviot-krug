// Three.js view: renders the static world plus whatever the simulation (live) or a
// recorded frame (replay) says. Owns no game rules.
import * as THREE from 'three';
import { buildWorld } from './worldBuilder';
import { PlateAtlas } from './textures';
import { buildCarRig, buildCockpit, type CarRig } from './carMesh';
import { buildPerson, buildSeated, type PersonRig } from './people';
import { CAFE_TABLES, FATHER_SEAT } from '../content/debarMaalo';
import type { Frame } from '../sim/recorder';
import type { Sim } from '../sim/sim';
import type { CarType } from '../content/generate';
import { clamp, wrapAngle, type Pose } from '../math';

export type CamMode = 'chase' | 'driver';
export type ShotMode = CamMode | 'intro' | 'outro' | 'replay' | 'title';

export const PLAYER_LOOK = { type: 'yugo' as CarType, color: '#efe3c8', plate: 'SK 1984-DM' };

type ActorMeta = Sim['actorMeta'] extends Map<string, infer V> ? V : never;

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private atlas = new PlateAtlas();
  player: CarRig;
  private cockpit: { group: THREE.Group; wheel: THREE.Object3D };
  private cars = new Map<string, CarRig>();
  private peds = new Map<string, PersonRig>();
  private strollers = new Map<string, PersonRig>();
  private highlight: THREE.Group;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  private camYaw = 0;
  private lastV = 0; private pitch = 0; private roll = 0;
  camMode: CamMode = 'chase';
  private crowns: THREE.Mesh | null = null;
  private crownFade = 1;
  private shotT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 4200);
    this.scene.fog = new THREE.Fog('#e8c8a0', 110, 640);
    this.scene.background = new THREE.Color('#e8c8a0');

    // Warm late-afternoon light from the west-south-west
    const hemi = new THREE.HemisphereLight('#ffe6c2', '#6e5a44', 1.2);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#ffc888', 2.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    const world = buildWorld(this.atlas);
    this.scene.add(world.group);
    this.crowns = world.group.getObjectByName('tree-crowns') as THREE.Mesh | null;

    this.player = buildCarRig(PLAYER_LOOK.type, PLAYER_LOOK.color, PLAYER_LOOK.plate, this.atlas, 0.12);
    this.scene.add(this.player.group);
    this.cockpit = buildCockpit(PLAYER_LOOK.color);
    this.cockpit.group.visible = false;
    this.player.group.add(this.cockpit.group);

    // café patrons and the father
    const looks = [
      { coat: '#5a6b4a', hair: '#3a2a1a', carry: 'none' as const, height: 1.74 },
      { coat: '#8a3a2a', hair: '#c9c2b5', carry: 'none' as const, height: 1.66, skirt: true },
      { coat: '#2e3e5e', hair: '#1a1a1a', carry: 'none' as const, height: 1.8, cap: true },
      { coat: '#c9a66b', hair: '#5a3a20', carry: 'none' as const, height: 1.68 },
    ];
    CAFE_TABLES.forEach((t, i) => {
      if (Math.hypot(t.x - FATHER_SEAT.x, t.y - FATHER_SEAT.y) < 1.5) return;
      if (i % 3 === 2) return;
      const p = buildSeated(looks[i % looks.length], i);
      p.position.set(t.x - 0.62, 0.16, -t.y);
      p.rotation.y = 0;
      this.scene.add(p);
    });
    const father = buildSeated({ coat: '#1f3b3a', hair: '#9a948a', carry: 'none', height: 1.76, cap: true }, 2);
    father.position.set(FATHER_SEAT.x, 0.16, -FATHER_SEAT.y + 0.62);
    father.rotation.y = Math.PI / 2; // facing the street (north)
    this.scene.add(father);

    // cue highlight for replays
    this.highlight = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 48), new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; ring.renderOrder = 10;
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 12), new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false, depthTest: false }));
    pin.rotation.x = Math.PI; pin.position.y = 3.6; pin.renderOrder = 10;
    this.highlight.add(ring, pin);
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamMode(m: CamMode) {
    this.camMode = m;
    this.camInit = false;
  }

  private carRig(id: string, meta: ActorMeta | undefined): CarRig | null {
    let rig = this.cars.get(id);
    if (!rig) {
      if (!meta || meta.kind !== 'car') return null;
      rig = buildCarRig(meta.type, meta.color, meta.plate, this.atlas, 0.3);
      this.cars.set(id, rig);
      this.scene.add(rig.group);
    }
    return rig;
  }
  private pedRig(id: string, meta: ActorMeta | undefined): PersonRig | null {
    let rig = this.peds.get(id);
    if (!rig) {
      if (!meta || meta.kind !== 'ped') return null;
      rig = buildPerson(meta.look, 1);
      this.peds.set(id, rig);
      this.scene.add(rig.group);
    }
    return rig;
  }

  private placeCar(rig: CarRig, p: Pose) {
    rig.group.position.set(p.x, 0.01, -p.y);
    rig.group.rotation.y = p.h;
  }

  /** Live: mirror the simulation state. */
  syncLive(sim: Sim, dt: number, blink: boolean) {
    const p = sim.player;
    this.placePlayer(p.pose, p.v, p.steer, dt, p.indicator === 'left' && blink, p.indicator === 'right' && blink, p.brake > 0.1 && p.gear === 'D' || p.throttle > 0.1 && p.gear === 'R');
    const seen = new Set<string>();
    for (const c of sim.cars) {
      if (c.done) continue;
      const rig = this.carRig(c.id, sim.actorMeta.get(c.id));
      if (!rig) continue;
      seen.add(c.id);
      rig.group.visible = true;
      this.placeCar(rig, c.pose);
      rig.setIndicators(c.indicator === 'left' && blink, c.indicator === 'right' && blink);
      rig.setBrake(c.braking);
    }
    for (const [id, rig] of this.cars) if (!seen.has(id)) rig.group.visible = false;
    const seenP = new Set<string>();
    for (const d of sim.peds) {
      if (d.done) continue;
      const rig = this.pedRig(d.id, sim.actorMeta.get(d.id));
      if (!rig) continue;
      seenP.add(d.id);
      rig.group.visible = true;
      rig.group.position.set(d.pos.x, d.onRoad ? 0.01 : 0.16, -d.pos.y);
      rig.group.rotation.y = d.h;
      rig.animate(d.phase, d.state === 'walk' || d.state === 'cross' || d.state === 'after');
    }
    for (const [id, rig] of this.peds) if (!seenP.has(id)) rig.group.visible = false;
    this.syncStrollers(sim);
  }

  syncStrollers(sim: Sim) {
    for (const s of sim.strollers) {
      let rig = this.strollers.get(s.id);
      if (!rig) { rig = buildPerson(s.look, s.id.length); this.strollers.set(s.id, rig); this.scene.add(rig.group); }
      rig.group.position.set(s.pos.x, 0.16, -s.pos.y);
      rig.group.rotation.y = s.h;
      rig.animate(s.phase, true);
    }
  }

  /** Replay: pose everything from a recorded frame. */
  syncReplay(f: Frame, meta: Sim['actorMeta'], blink: boolean, dt: number) {
    this.placePlayer(f.p, f.p.v, f.p.steer, dt, f.p.ind === 1 && blink, f.p.ind === 2 && blink, f.p.brk > 0.1 && f.p.gear === 0);
    const seen = new Set<string>(), seenP = new Set<string>();
    for (const a of f.a) {
      if (a.k === 'car') {
        const rig = this.carRig(a.id, meta.get(a.id));
        if (!rig) continue;
        seen.add(a.id); rig.group.visible = true;
        this.placeCar(rig, a);
        rig.setIndicators(a.ind === 1 && blink, a.ind === 2 && blink);
        rig.setBrake(a.brk);
      } else {
        const rig = this.pedRig(a.id, meta.get(a.id));
        if (!rig) continue;
        seenP.add(a.id); rig.group.visible = true;
        rig.group.position.set(a.x, 0.1, -a.y); rig.group.rotation.y = a.h;
        rig.animate(a.ph ?? 0, true);
      }
    }
    for (const [id, rig] of this.cars) if (!seen.has(id)) rig.group.visible = false;
    for (const [id, rig] of this.peds) if (!seenP.has(id)) rig.group.visible = false;
  }

  private placePlayer(p: Pose, v: number, steer: number, dt: number, l: boolean, r: boolean, brake: boolean) {
    this.player.group.position.set(p.x, 0.01, -p.y);
    this.player.group.rotation.y = p.h;
    // expressive body motion: dive/squat with acceleration, lean in corners
    const acc = dt > 0 ? (v - this.lastV) / dt : 0;
    this.lastV = v;
    this.pitch += (clamp(-acc * 0.006, -0.03, 0.03) - this.pitch) * Math.min(1, dt * 6);
    this.roll += (clamp(v * steer * 0.01, -0.035, 0.035) - this.roll) * Math.min(1, dt * 5);
    this.player.body.rotation.z = this.pitch;
    this.player.body.rotation.x = this.roll;
    this.player.body.position.y = Math.abs(v) < 0.2 ? Math.sin(performance.now() / 45) * 0.002 : 0;
    this.player.setIndicators(l, r);
    this.player.setBrake(brake);
    this.cockpit.wheel.rotation.z = -steer * 2.6;
  }

  setHighlight(pos: { x: number; y: number } | null, t: number) {
    this.highlight.visible = !!pos;
    if (pos) {
      this.highlight.position.set(pos.x, 0, -pos.y);
      const s = 1 + Math.sin(t * 6) * 0.12;
      this.highlight.scale.set(s, 1, s);
      this.highlight.children[1].position.y = 3.4 + Math.sin(t * 4) * 0.25;
    }
  }

  /** Camera for the given shot. `p` is the subject pose (player car). */
  updateCamera(dt: number, shot: ShotMode, p: Pose, v: number, steer: number, extra?: { focus?: { x: number; y: number }; t?: number }) {
    const cam = this.camera;
    const k = 1 - Math.exp(-dt * 4.5);
    const fwd = new THREE.Vector3(Math.cos(p.h), 0, -Math.sin(p.h));
    const base = new THREE.Vector3(p.x, 0, -p.y);
    this.cockpit.group.visible = shot === 'driver';
    this.player.body.visible = shot !== 'driver';
    let pos: THREE.Vector3, look: THREE.Vector3, fov = 62;
    if (shot === 'driver') {
      const left = new THREE.Vector3(-Math.sin(p.h), 0, -Math.cos(p.h)); // local -z (driver side)
      pos = base.clone().addScaledVector(fwd, -0.36).addScaledVector(left, 0.3).setY(1.21);
      const yaw = steer * 0.25;
      const dir = new THREE.Vector3(Math.cos(p.h + yaw), 0, -Math.sin(p.h + yaw));
      look = pos.clone().addScaledVector(dir, 10).setY(0.9);
      fov = 72;
      cam.position.copy(pos); cam.lookAt(look);
      this.camInit = false;
    } else if (shot === 'replay') {
      // high observer camera behind the learner's car, framing the car and the cue together
      if (!this.camInit) { this.camYaw = p.h; }
      this.camYaw += wrapAngle(p.h - this.camYaw) * (1 - Math.exp(-dt * 2));
      const cf = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      const f = extra?.focus ? new THREE.Vector3(extra.focus.x, 0, -extra.focus.y) : base.clone().addScaledVector(cf, 12);
      const sep = Math.min(60, f.distanceTo(base));
      // stay behind the learner's car and tilt toward the cue so both are in frame
      pos = base.clone().addScaledVector(cf, -(8 + sep * 0.12)).setY(7.5 + sep * 0.13);
      look = base.clone().lerp(f, 0.45).setY(0.8);
      if (!this.camInit) { this.camPos.copy(pos); this.camLook.copy(look); this.camInit = true; }
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 2.5)); this.camLook.lerp(look, 1 - Math.exp(-dt * 3));
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    } else if (shot === 'chase') {
      // ease the camera yaw toward the car heading (not flipped while reversing)
      if (!this.camInit) { this.camYaw = p.h; }
      this.camYaw += wrapAngle(p.h - this.camYaw) * (1 - Math.exp(-dt * 3.2));
      const cf = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      const dist = 6.4 + clamp(Math.abs(v) * 0.08, 0, 1.2);
      pos = base.clone().addScaledVector(cf, -dist).setY(2.55);
      look = base.clone().addScaledVector(cf, 3.5).setY(1.0);
      if (!this.camInit) { this.camPos.copy(pos); this.camLook.copy(look); this.camInit = true; }
      this.camPos.lerp(pos, k); this.camLook.lerp(look, Math.min(1, k * 1.6));
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    } else if (shot === 'intro' || shot === 'title') {
      this.shotT += dt;
      const t = extra?.t ?? this.shotT;
      // from the café table toward the car, slowly rising behind it
      const u = shot === 'title' ? 0.0 : clamp(t / 5.5, 0, 1);
      const e = u * u * (3 - 2 * u);
      const a = new THREE.Vector3(60.5, 1.45, 7.6), b = base.clone().addScaledVector(fwd, -6.4).setY(2.55);
      const la = new THREE.Vector3(73, 1.1, 2.0), lb = base.clone().addScaledVector(fwd, 3.5).setY(1.0);
      if (shot === 'title') { a.set(22 + Math.sin(performance.now() / 9000) * 5, 4.2, -0.8); la.set(86, 2.2, 7.5); }
      pos = a.lerp(b, e); look = la.lerp(lb, e);
      cam.position.copy(pos); cam.lookAt(look);
      this.camPos.copy(pos); this.camLook.copy(look); this.camInit = true; this.camYaw = p.h;
    } else {
      // outro: drift toward the father's table
      this.shotT += dt;
      // from the street, past the parked car, toward the father's table and the chinar tree
      const target = new THREE.Vector3(FATHER_SEAT.x + 9, 2.3, -(FATHER_SEAT.y + 11.5));
      this.camPos.lerp(target, 1 - Math.exp(-dt * 0.9));
      this.camLook.lerp(new THREE.Vector3(FATHER_SEAT.x + 1, 1.3, -FATHER_SEAT.y), 1 - Math.exp(-dt * 1.2));
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // tree crowns turn see-through in replays so the cue is never hidden
    const fadeTarget = shot === 'replay' ? 0.28 : 1;
    this.crownFade += (fadeTarget - this.crownFade) * Math.min(1, dt * 4);
    if (this.crowns) {
      const m = this.crowns.material as THREE.MeshLambertMaterial;
      m.opacity = this.crownFade; m.depthWrite = this.crownFade > 0.95;
      this.crowns.castShadow = this.crownFade > 0.95;
    }
    // shadows follow the subject
    this.sun.target.position.set(p.x, 0, -p.y);
    this.sun.position.set(p.x - 85, 52, -p.y + 48);
  }

  resetShot() { this.shotT = 0; this.camInit = false; }

  render() { this.renderer.render(this.scene, this.camera); }

  project(x: number, y: number, h: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, h, -y).project(this.camera);
    const el = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight, visible: v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }
}

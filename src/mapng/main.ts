// MapNG route game: drive from the zoo parking lot through the nearest junction.
// Wires import → render → physics → traffic → controls.

import * as THREE from 'three';
import './mapng.css';
import { Controls } from './controls/input';
import { loadLevel, type LevelData } from './import/loadLevel';
import { createVehicle, CAR } from './physics/vehicle';
import { createWorld, initRapier } from './physics/world';
import { carMesh, pedMesh, placeOnPose } from './render/actors';
import { loadModel } from './render/models';
import { buildProps, buildSignals } from './render/props';
import { buildRoads, buildRouteGuide } from './render/roads';
import { createScene, followSun } from './render/scene';
import { buildTerrain } from './render/terrain';
import { SignalSystem } from './traffic/signals';
import { Traffic } from './traffic/traffic';
import type { Vec3 } from './import/types';
import { convertSurvey, frameOf, mergeSurvey, surveyPath, type SurveyCollection } from './import/manualSurvey';

const LEVEL_BASE = `${import.meta.env.BASE_URL}mapng/prviot_krug`.replace(/\/+/g, '/');
const app = document.getElementById('app')!;
const loading = document.getElementById('loading')!;
const status = (s: string) => (loading.querySelector('p')!.textContent = s);

boot().catch((e) => {
  console.error(e);
  status(`Could not start: ${e.message ?? e}`);
  loading.classList.add('error');
});

async function boot() {
  status('Loading map data…');
  const level = await loadLevel(LEVEL_BASE, (m) => status(`Loading ${m}…`));

  // Manual field-survey override layer (optional file; never edits levels/).
  status('Loading surveyed traffic control…');
  const surveyUrl = `${import.meta.env.BASE_URL}${surveyPath('prviot_krug')}`.replace(/\/+/g, '/');
  const fc: SurveyCollection | null = await fetch(surveyUrl)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const merged = mergeSurvey(level, convertSurvey(fc, frameOf(level.index), level.terrain.heightAt));
  level.objects = merged.objects;
  level.roads = merged.roads;
  const sv = merged.summary;
  if (sv.rejected.length) console.warn('Survey features rejected (not placed):', sv.rejected);
  if (sv.unmodelledSigns.length) console.info('Surveyed signs placed without a dedicated 3D sign model:', sv.unmodelledSigns);
  const darkLights = merged.lights.filter((l) => l.controllerId === null);
  status('Starting physics…');
  const R = await initRapier();
  const physics = createWorld(R, level.terrain);
  const kit = createScene(app);
  const { scene, camera, renderer, sun } = kit;

  const route = level.route;
  const mid = route.points[Math.floor(route.points.length / 2)];
  const center: [number, number] = [mid[0], mid[1]];

  status('Building terrain and roads…');
  scene.add(buildTerrain(level.terrain, `${LEVEL_BASE}/${level.index.terrain.baseTexture}`));
  scene.add(buildRoads(level.roads));
  const guide = buildRouteGuide(route.points, route.end.p);
  orientGate(guide.userData.gate, route.points, route.end.p);
  scene.add(guide);
  scene.add(buildProps(level.objects, center, 420));
  const signalMeshes = buildSignals(level.objects, darkLights);
  scene.add(signalMeshes.group);

  // Buildings + sidewalks near the route: visuals and Rapier trimeshes.
  const near = level.index.models.filter(
    (m) => (m.role === 'buildings' || m.role === 'sidewalks') && Math.hypot(m.position[0] - center[0], m.position[1] - center[1]) < 420,
  );
  let done = 0;
  const failed: string[] = [];
  await Promise.all(
    near.map((m) =>
      loadModel(LEVEL_BASE, m, level.terrain.heightAt)
        .then((lm) => {
          scene.add(lm.object);
          physics.addTrimesh(lm.collision.vertices, lm.collision.indices);
          status(`Loading buildings and sidewalks… ${++done}/${near.length}`);
        })
        .catch((e) => {
          failed.push(m.file);
          console.warn('model failed', m.file, e);
        }),
    ),
  );

  // Player car at the route start, facing along the parking aisle.
  const start = route.start;
  const startPos = () => ({ x: start.p[0], y: level.terrain.heightAt(start.p[0], start.p[1]) + 0.9, z: -start.p[1] });
  const vehicle = createVehicle(physics, startPos(), start.heading);
  const car = carMesh(0xe9dfc8);
  scene.add(car);

  const signals = new SignalSystem(level.objects.signals);
  const traffic = new Traffic(level.network, level.roads, signals, { center, radius: 300, cars: 22, pedestrians: 26 });
  const aiMeshes = traffic.cars.map((c) => {
    const m = carMesh(c.color, false);
    scene.add(m);
    return m;
  });
  const pedMeshes = traffic.peds.map((p) => {
    const m = pedMesh((p.id * 0.137) % 1);
    scene.add(m);
    return m;
  });

  const controls = new Controls(app);
  controls.onReset = () => vehicle.reset(startPos(), start.heading);
  let topDown = false;
  controls.onCamera = () => (topDown = !topDown);

  const hud = makeHud(level, failed, merged.summary);
  const progress = makeProgress(route.points, route.end.p);
  const playerSignal = findApproachSignal(level, route.points, route.end.p);
  let phase: 'drive' | 'done' = 'drive';
  let elapsed = 0;

  loading.remove();
  const clock = new THREE.Clock();
  let acc = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let first = true;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    acc += dt;
    const input = controls.read(dt, vehicle.speed());
    while (acc >= 1 / 60) {
      vehicle.update(input, 1 / 60);
      physics.step(1 / 60);
      acc -= 1 / 60;
    }

    // player pose
    const t = vehicle.body.translation();
    const q = vehicle.body.rotation();
    car.position.set(t.x, t.y - 0.42, t.z);
    car.quaternion.set(q.x, q.y, q.z, q.w);
    const wheels: THREE.Object3D[] = car.userData.wheels;
    wheels.forEach((w, i) => {
      const s = vehicle.wheel(i);
      w.position.y = 0.31 + (CAR.restLength - s.suspension) * 0.6;
      w.rotation.set(0, i < 2 ? -vehicle.steerAngle() : 0, 0);
      (w.children[0] as THREE.Object3D).rotation.z = -s.spin;
    });
    car.userData.brake.emissiveIntensity = input.brake > 0 ? 2 : 0.4;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(car.quaternion);
    const heading = Math.atan2(-fwd.z, fwd.x);
    const speed = vehicle.speed();
    const wx = t.x, wy = -t.z;

    // if the car falls through or flips, put it back on the route
    if (t.y < level.terrain.heightAt(wx, wy) - 3 || fwd.y > 0.85 || fwd.y < -0.85) controls.onReset?.();

    traffic.update(dt, { x: wx, y: wy, z: t.y, heading, speed });
    traffic.cars.forEach((c, i) => placeOnPose(aiMeshes[i], c.pose, level.terrain.heightAt));
    traffic.peds.forEach((p, i) => placeOnPose(pedMeshes[i], p.pose, level.terrain.heightAt));
    signalMeshes.update((id) => signals.state(id, traffic.clock));
    const tex: THREE.Texture = guide.children[0].userData.tex;
    tex.offset.y -= dt * 0.6;

    // route progress
    const pr = progress(wx, wy);
    if (phase === 'drive') elapsed += dt;
    if (phase === 'drive' && pr.s > pr.junctionS + 8 && pr.offset < 10) {
      phase = 'done';
      hud.finish(elapsed);
    }
    hud.update({
      speed,
      reverse: input.reverse,
      toJunction: pr.junctionS - pr.s,
      remaining: pr.total - pr.s,
      offRoute: pr.offset > 12,
      signal: playerSignal !== null ? signals.state(playerSignal, traffic.clock) : null,
      phase,
    });

    // camera
    const target = new THREE.Vector3(t.x, t.y, t.z);
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    const want = topDown
      ? target.clone().add(new THREE.Vector3(0, 60, 0.01))
      : target.clone().addScaledVector(flat, -7.5).add(new THREE.Vector3(0, 2.9, 0));
    const look = topDown ? target : target.clone().addScaledVector(flat, 4).add(new THREE.Vector3(0, 0.8, 0));
    const k = first ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(want, k);
    camLook.lerp(look, k);
    first = false;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    followSun(sun, target);
    renderer.render(scene, camera);
  });

  hud.onRestart = () => {
    vehicle.reset(startPos(), start.heading);
    phase = 'drive';
    elapsed = 0;
  };
  // test hook
  (window as unknown as Record<string, unknown>).__mapng = { level, vehicle, traffic, failed, scene, survey: merged };
}

function orientGate(gate: THREE.Object3D, pts: Vec3[], end: Vec3) {
  let k = 0, best = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - end[0], p[1] - end[1]);
    if (d < best) {
      best = d;
      k = i;
    }
  });
  const a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 1)];
  gate.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function makeProgress(pts: Vec3[], junction: Vec3) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let jk = 0, jd = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - junction[0], p[1] - junction[1]);
    if (d < jd) {
      jd = d;
      jk = i;
    }
  });
  let lastS = 0;
  return (x: number, y: number) => {
    let best = { d: Infinity, s: 0 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
      const d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
      const s = cum[i] + Math.sqrt(L2) * t;
      // prefer progress near the last known point so loops in the path don't jump
      const score = d + Math.max(0, Math.abs(s - lastS) - 30) * 0.5;
      if (score < best.d) best = { d: score, s };
    }
    lastS = best.s;
    return { s: best.s, offset: best.d, total: cum[cum.length - 1], junctionS: cum[jk] };
  };
}

function findApproachSignal(level: LevelData, pts: Vec3[], junction: Vec3): number | null {
  const k = pts.findIndex((p) => Math.hypot(p[0] - junction[0], p[1] - junction[1]) < 1);
  const i = k > 1 ? k : pts.length - 1;
  const a = pts[i - 1], b = pts[i];
  const hx = b[0] - a[0], hy = b[1] - a[1];
  const hl = Math.hypot(hx, hy) || 1;
  let best: number | null = null, bd = 30;
  for (const s of level.objects.signals.instances) {
    const d = Math.hypot(s.pos[0] - junction[0], s.pos[1] - junction[1]);
    if (d < bd && (s.dir[0] * hx + s.dir[1] * hy) / hl < -0.5) {
      bd = d;
      best = s.id;
    }
  }
  return best;
}

function makeHud(level: LevelData, failed: string[], sv: ReturnType<typeof mergeSurvey>['summary']) {
  const n = (k: 'signs' | 'lights' | 'markings') => sv[k].survey;
  const surveyed = n('signs') + n('lights') + n('markings');
  const el = document.createElement('div');
  el.className = 'mg-hud';
  el.innerHTML = `
    <div class="mg-top">
      <div class="mg-task"><b>Zoo parking → junction</b><span class="mg-msg"></span></div>
      <div class="mg-sig" hidden title="Simulated timing — not the real signal plan"><i></i><i></i><i></i><small>SIM</small></div>
    </div>
    <div class="mg-speed"><b>0</b><span>km/h</span><em>D</em></div>
    <div class="mg-source" role="note">
      ${surveyed ? `Field survey: ${n('signs')} signs, ${n('lights')} lights, ${n('markings')} markings. ` : 'No field-survey data yet. '}
      Other signs, markings and lights: OpenStreetMap via MapNG, <b>not verified</b>.
      Light timing is <b>simulated</b>. Map data © OpenStreetMap contributors (ODbL).
    </div>
    <div class="mg-help">W/↑ gas · S/↓ brake/reverse · A D steer · Space handbrake · R reset · C camera</div>
    <div class="mg-done" hidden>
      <h2>Through the junction</h2><p></p><button>Drive again</button>
    </div>`;
  document.getElementById('app')!.appendChild(el);
  const msg = el.querySelector<HTMLElement>('.mg-msg')!;
  const sp = el.querySelector<HTMLElement>('.mg-speed b')!;
  const gear = el.querySelector<HTMLElement>('.mg-speed em')!;
  const sig = el.querySelector<HTMLElement>('.mg-sig')!;
  const done = el.querySelector<HTMLElement>('.mg-done')!;
  const api = {
    onRestart: () => {},
    update(s: {
      speed: number;
      reverse: boolean;
      toJunction: number;
      remaining: number;
      offRoute: boolean;
      signal: string | null;
      phase: string;
    }) {
      sp.textContent = String(Math.round(Math.abs(s.speed) * 3.6));
      gear.textContent = s.reverse ? 'R' : 'D';
      if (s.phase === 'done') msg.textContent = 'Route complete';
      else if (s.offRoute) msg.textContent = 'Off the route — follow the amber arrows (R to reset)';
      else if (s.toJunction > 45) msg.textContent = `Leave the lot · junction in ${Math.round(s.toJunction)} m`;
      else if (s.toJunction > 0) msg.textContent = `Junction ahead · ${Math.round(s.toJunction)} m — check left and right`;
      else msg.textContent = `Through the junction · ${Math.max(0, Math.round(s.remaining))} m`;
      sig.hidden = !s.signal || s.toJunction < -5 || s.toJunction > 80;
      sig.dataset.state = s.signal ?? '';
    },
    finish(seconds: number) {
      done.hidden = false;
      done.querySelector('p')!.textContent = `${seconds.toFixed(1)} s from ${level.route.start.label}${failed.length ? ` · ${failed.length} model tiles failed to load` : ''}`;
    },
  };
  done.querySelector('button')!.addEventListener('click', () => {
    done.hidden = true;
    api.onRestart();
  });
  return api;
}

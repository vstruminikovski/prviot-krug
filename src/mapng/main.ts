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
import { createStreetPhotos, geo, MAPILLARY_TOKEN, type StreetPhotos } from './imagery/mapillary';

type CamMode = 'driver' | 'chase' | 'top';

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
  const signalMeshes = buildSignals(level.objects);
  scene.add(signalMeshes.group);

  // Buildings + sidewalks near the route: visuals and Rapier trimeshes.
  const near = level.index.models.filter(
    (m) => (m.role === 'buildings' || m.role === 'sidewalks') && Math.hypot(m.position[0] - center[0], m.position[1] - center[1]) < 420,
  );
  let done = 0;
  const failed: string[] = [];
  await Promise.all(
    near.map((m) =>
      loadModel(LEVEL_BASE, m)
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
  const modes: CamMode[] = ['driver', 'chase', 'top'];
  let cam: CamMode = 'driver';
  controls.onCamera = () => {
    cam = modes[(modes.indexOf(cam) + 1) % modes.length];
    hud.setCamera(cam);
  };

  const hud = makeHud(level, failed);
  hud.onCamera = () => controls.onCamera?.();
  hud.onReset = () => controls.onReset?.();
  hud.setCamera(cam);

  // Street photos (Mapillary), only with a build-time client token.
  const g = geo(level.index);
  let photos: StreetPhotos | null = null;
  const xs = route.points.map((p) => p[0]), ys = route.points.map((p) => p[1]);
  const area = { x0: Math.min(...xs) - 60, y0: Math.min(...ys) - 60, x1: Math.max(...xs) + 60, y1: Math.max(...ys) + 60 };
  if (MAPILLARY_TOKEN) {
    createStreetPhotos(hud.photoBox, level.index, area)
      .then((p) => {
        photos = p;
        hud.setPhotoInfo(`${p.images.length} Mapillary photos near the route`);
      })
      .catch((e) => hud.setPhotoInfo(`Street photos unavailable: ${e.message}`));
  } else hud.setPhotoInfo('Street photos off: no Mapillary token in this build');
  hud.onPhotoSize = () => setTimeout(() => photos?.resize(), 50);
  let photoClock = 0;
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

    // street photo follows the car (twice a second)
    photoClock += dt;
    if (photoClock > 0.5) {
      photoClock = 0;
      const ll = g.toLatLng(wx, wy);
      hud.setMapsLink(ll.lat, ll.lng, heading);
      if (photos) hud.setPhotoState(photos.follow(wx, wy, heading), photos.current);
    }

    // camera
    const target = new THREE.Vector3(t.x, t.y, t.z);
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    car.visible = cam !== 'driver';
    if (cam === 'driver') {
      // driver's eye: left seat, 1.2 m above the road, looking down the bonnet
      const eye = new THREE.Vector3(0.15, 1.2, -0.38).applyQuaternion(car.quaternion).add(car.position);
      const ahead = eye.clone().add(new THREE.Vector3(1, -0.04, 0).applyQuaternion(car.quaternion).multiplyScalar(10));
      camera.fov = 72;
      camera.position.copy(eye);
      camera.lookAt(ahead);
      camPos.copy(eye);
      camLook.copy(ahead);
    } else {
      const want =
        cam === 'top'
          ? target.clone().add(new THREE.Vector3(0, 60, 0.01))
          : target.clone().addScaledVector(flat, -6.5).add(new THREE.Vector3(0, 2.4, 0));
      const look = cam === 'top' ? target : target.clone().addScaledVector(flat, 4).add(new THREE.Vector3(0, 0.8, 0));
      const k = first ? 1 : 1 - Math.exp(-dt * 5);
      camPos.lerp(want, k);
      camLook.lerp(look, k);
      camera.fov = 60;
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    }
    camera.updateProjectionMatrix();
    first = false;
    followSun(sun, target);
    renderer.render(scene, camera);
  });

  hud.onRestart = () => {
    vehicle.reset(startPos(), start.heading);
    phase = 'drive';
    elapsed = 0;
  };
  // test hook
  (window as unknown as Record<string, unknown>).__mapng = { level, vehicle, traffic, failed, scene };
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

function makeHud(level: LevelData, failed: string[]) {
  const el = document.createElement('div');
  el.className = 'mg-hud';
  el.innerHTML = `
    <div class="mg-stack">
    <div class="mg-top">
      <div class="mg-task"><b>Zoo parking → junction</b><span class="mg-msg"></span></div>
      <div class="mg-sig" hidden><i></i><i></i><i></i></div>
    </div>
    <div class="mg-photo" data-size="small">
      <div class="mg-photo-view"></div>
      <div class="mg-photo-bar">
        <span class="mg-photo-info">Street photos</span>
        <span class="mg-photo-credit" hidden>Photo: <a class="mg-photo-src" target="_blank" rel="noopener noreferrer" href="https://www.mapillary.com/">this image</a> · <a target="_blank" rel="noopener noreferrer" href="https://www.mapillary.com/">Mapillary</a>, <a target="_blank" rel="noopener noreferrer" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></span>
        <button class="mg-photo-size" type="button">Bigger</button>
      </div>
    </div>
    </div>
    <div class="mg-buttons">
      <button class="mg-cam" type="button">Camera</button>
      <button class="mg-reset" type="button">Restart</button>
      <a class="mg-gmaps" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps">Open in Google Maps ↗</a>
      <button class="mg-howto-open" type="button">Help</button>
    </div>
    <div class="mg-speed"><b>0</b><span>km/h</span><em>D</em></div>
    <div class="mg-howto">
      <div class="mg-card">
        <h2>How to drive</h2>
        <ul>
          <li><b>Goal:</b> leave the zoo car park and drive through the junction. Follow the amber arrows.</li>
          <li><b>Keyboard:</b> W or ↑ to go, S or ↓ to brake (hold S when stopped to reverse), A D or ← → to steer, Space handbrake.</li>
          <li><b>Phone:</b> left pad steers, right buttons are gas ▲ and brake ■.</li>
          <li><b>Camera</b> switches driver seat, behind the car and map-from-above. <b>Restart</b> puts you back at the start.</li>
          <li>Watch the traffic light at the junction and give way to people on crossings.</li>
        </ul>
        <button class="mg-start" type="button">Start driving</button>
      </div>
    </div>
    <div class="mg-done" hidden>
      <div class="mg-card"><h2>Through the junction</h2><p></p><button type="button">Drive again</button></div>
    </div>`;
  document.getElementById('app')!.appendChild(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const msg = q('.mg-msg'), sp = q('.mg-speed b'), gear = q('.mg-speed em'), sig = q('.mg-sig'), done = q('.mg-done');
  const photo = q('.mg-photo'), info = q('.mg-photo-info'), sizeBtn = q<HTMLButtonElement>('.mg-photo-size');
  const credit = q('.mg-photo-credit'), src = q<HTMLAnchorElement>('.mg-photo-src');
  const camBtn = q<HTMLButtonElement>('.mg-cam'), gmaps = q<HTMLAnchorElement>('.mg-gmaps'), howto = q('.mg-howto');
  const camNames: Record<string, string> = { driver: 'Camera: driver', chase: 'Camera: behind', top: 'Camera: above' };
  // buttons must not steal keyboard focus from driving
  el.querySelectorAll('button').forEach((b) => b.addEventListener('mouseup', () => b.blur()));

  const api = {
    photoBox: q('.mg-photo-view'),
    onRestart: () => {},
    onCamera: () => {},
    onReset: () => {},
    onPhotoSize: () => {},
    setCamera(c: string) {
      camBtn.textContent = camNames[c] ?? 'Camera';
    },
    setPhotoInfo(s: string) {
      info.textContent = s;
      photo.dataset.state = /off|unavailable/.test(s) ? 'off' : photo.dataset.state ?? '';
    },
    setPhotoState(s: 'photo' | 'none', imageId?: string | null) {
      photo.dataset.state = s;
      credit.hidden = s !== 'photo';
      info.hidden = s === 'photo';
      if (s === 'none') info.textContent = 'No street photo at this spot';
      if (imageId) src.href = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(imageId)}&focus=photo`;
    },
    setMapsLink(lat: number, lng: number, heading: number) {
      const compass = Math.round((((90 - (heading * 180) / Math.PI) % 360) + 360) % 360);
      gmaps.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}&heading=${compass}`;
    },
    update(s: { speed: number; reverse: boolean; toJunction: number; remaining: number; offRoute: boolean; signal: string | null; phase: string }) {
      sp.textContent = String(Math.round(Math.abs(s.speed) * 3.6));
      gear.textContent = s.reverse ? 'R' : 'D';
      if (s.phase === 'done') msg.textContent = 'Route complete';
      else if (s.offRoute) msg.textContent = 'Off the route. Follow the amber arrows, or press Restart.';
      else if (s.toJunction > 45) msg.textContent = `Leave the car park. Junction in ${Math.round(s.toJunction)} m`;
      else if (s.toJunction > 0) msg.textContent = `Junction in ${Math.round(s.toJunction)} m. Check left and right.`;
      else msg.textContent = `Through the junction. ${Math.max(0, Math.round(s.remaining))} m to go`;
      sig.hidden = !s.signal || s.toJunction < -5 || s.toJunction > 80;
      sig.dataset.state = s.signal ?? '';
    },
    finish(seconds: number) {
      done.hidden = false;
      done.querySelector('p')!.textContent = `${seconds.toFixed(1)} s from ${level.route.start.label}${failed.length ? ` · ${failed.length} model tiles failed to load` : ''}`;
    },
  };
  sizeBtn.addEventListener('click', () => {
    const big = photo.dataset.size !== 'big';
    photo.dataset.size = big ? 'big' : 'small';
    sizeBtn.textContent = big ? 'Smaller' : 'Bigger';
    api.onPhotoSize();
  });
  camBtn.addEventListener('click', () => api.onCamera());
  q('.mg-reset').addEventListener('click', () => api.onReset());
  q('.mg-start').addEventListener('click', () => (howto.hidden = true));
  q('.mg-howto-open').addEventListener('click', () => (howto.hidden = false));
  done.querySelector('button')!.addEventListener('click', () => {
    done.hidden = true;
    api.onRestart();
  });
  return api;
}

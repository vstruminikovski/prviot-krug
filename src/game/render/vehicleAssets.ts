// Loads the Blender-generated GLB vehicles (public/assets/vehicles/<id>.glb) and turns them into
// rigs with live paint, lights, wheel spin/steer, steering wheel and gear lever. Falls back to the
// procedural meshes if a GLB is missing, so the game never depends on the asset pipeline.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleDef, PlateLayout } from '../vehicles/defs';
import { buildCarRig, MESH_FOR, type CarRig } from './carMesh';
import type { PlateAtlas } from './textures';

const cache = new Map<string, Promise<GLTF | null>>();
const loader = new GLTFLoader();

const ready = new Map<string, GLTF | null>();
export function loadVehicleGLB(id: string): Promise<GLTF | null> {
  if (!cache.has(id)) {
    const url = `${import.meta.env.BASE_URL}assets/vehicles/${id}.glb`;
    cache.set(id, loader.loadAsync(url).then((g) => { ready.set(id, g); return g; }).catch((e) => { console.warn('vehicle GLB missing, using procedural', id, e); ready.set(id, null); return null; }));
  }
  return cache.get(id)!;
}
/** Already-loaded model (undefined while still loading) — lets the view skip the placeholder. */
export function vehicleReady(id: string): GLTF | null | undefined { return ready.get(id); }

export interface VehicleRig extends CarRig {
  setSteer(roadWheelAngle: number, spin: number): void;
  setSteeringWheel(angle: number): void;
  setGear(g: string): void;
  setPlate(text: string, layout: PlateLayout): void;
  glb: boolean;
  interior?: THREE.Object3D[];
  /** parts hidden only in the first-person view (e.g. a roof too low for the eye point) */
  cockpitHidden?: THREE.Object3D[];
}

/** Two-row plate texture (stylised layout, see README). */
function twoRowTexture(text: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 150;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 150);
  g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(3, 3, 250, 144);
  g.fillStyle = '#1f47b0'; g.fillRect(5, 5, 34, 140);
  g.fillStyle = '#fff'; g.font = '700 13px Arial'; g.textAlign = 'center'; g.fillText('NMK', 22, 132);
  const [reg, rest] = text.split(' ');
  g.fillStyle = '#111'; g.font = '700 54px "Arial Narrow", Arial'; g.textAlign = 'center';
  g.fillText(reg, 148, 64); g.fillText(rest ?? '', 148, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function longTexture(text: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 110;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 512, 110);
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 104);
  g.fillStyle = '#1f47b0'; g.fillRect(6, 6, 58, 98);
  g.fillStyle = '#fff'; g.font = '700 20px Arial'; g.textAlign = 'center'; g.fillText('NMK', 35, 92);
  const [reg, rest] = text.split(' ');
  g.fillStyle = '#111'; g.font = '700 70px "Arial Narrow", Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(reg, 80, 60);
  g.fillStyle = '#e8c21a'; g.fillRect(184, 24, 34, 62); g.fillStyle = '#c62a1d'; g.font = '700 20px Arial'; g.textAlign = 'center'; g.fillText('СК', 201, 57);
  g.fillStyle = '#111'; g.font = '700 70px "Arial Narrow", Arial'; g.textAlign = 'left'; g.fillText(rest ?? '', 232, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const SPIN = new THREE.Quaternion(), AXIS_Y = new THREE.Vector3(0, 1, 0);
const RIM_GEO = new THREE.TorusGeometry(0.18, 0.016, 8, 32).rotateX(-Math.PI / 2);
/** Body panels are single-sided shells; from the cabin their back faces would vanish and you'd see
 *  straight through doors and pillars. Back faces render as a matte interior trim colour instead. */
export function withCabinBackfaces<T extends THREE.MeshStandardMaterial>(m: T, trim = '#2a2622'): T {
  m.side = THREE.DoubleSide;
  const col = new THREE.Color(trim);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTrim = { value: col };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTrim;')
      // back faces (door cards, pillars from inside) and downward faces (headliner, underside) → trim
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (!gl_FrontFacing || (vec4(normal, 0.0) * viewMatrix).y < -0.6) diffuseColor.rgb = uTrim;');
  };
  m.customProgramCacheKey = () => 'cabin-trim-2';
  return m;
}

const GATE: Record<string, [number, number]> = { N: [0, 0], 1: [-0.22, 0.22], 2: [-0.22, -0.22], 3: [0, 0.22], 4: [0, -0.22], 5: [0.22, 0.22], R: [0.22, -0.22] };

export function rigFromGLB(gltf: GLTF, def: VehicleDef, paint: string, finish: 'solid' | 'metallic', plate: string, layout: PlateLayout): VehicleRig {
  const group = new THREE.Group();
  const body = gltf.scene.clone(true);
  group.add(body);
  const paintBase = new THREE.MeshStandardMaterial({ color: paint, metalness: finish === 'metallic' ? 0.55 : 0.12, roughness: finish === 'metallic' ? 0.32 : 0.48, flatShading: true });
  // the truck cab is a closed shell with glass laid over it: keep it single-sided so the driver sees out
  const paintMat = def.family === 'truck' ? paintBase : withCabinBackfaces(paintBase);
  const guestWheel: THREE.Object3D[] = [];
  const cockpitHidden: THREE.Object3D[] = [];
  const indL = new THREE.MeshStandardMaterial({ color: '#c9861c', emissive: '#1a0e00', roughness: 0.4 });
  const indR = indL.clone();
  const tail = new THREE.MeshStandardMaterial({ color: '#6a1410', emissive: '#200000', roughness: 0.4 });
  const wheels: Record<string, THREE.Object3D> = {};
  let steering: THREE.Object3D | null = null; let gear: THREE.Object3D | null = null;
  const interior: THREE.Object3D[] = [];
  const mounts: Record<string, THREE.Object3D> = {};
  body.traverse((o) => {
    if (o.name.startsWith('Wheel_')) wheels[o.name.slice(6)] = o;
    if (o.name === 'SteeringWheel') steering = o;
    if (def.id === 'spectral' && (o.name === 'Steering_Wheel' || o.name.startsWith('Wheel_Spoke'))) guestWheel.push(o);
    if (def.id === 'spectral' && o.name === 'CABIN_Roof_Shell') cockpitHidden.push(o);
    if (o.name === 'GearLever') gear = o;
    if (o.name.startsWith('PlateMount_')) mounts[o.name.slice(11)] = o;
    if (o.name.startsWith('Interior') || o.name.startsWith('Steering') || o.name.startsWith('Gear')) interior.push(o);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
    // exported rims carry the Skin modifier's default 0.25 m tube — rebuild as a real 36 cm wheel
    if (m.name === 'SteeringRim') { m.geometry = RIM_GEO; m.castShadow = false; }
    const name = (m.material as THREE.Material).name;
    if (name === 'Paint') m.material = paintMat;
    else if (name === 'IndL') m.material = indL;
    else if (name === 'IndR') m.material = indR;
    else if (name === 'TailLamp') m.material = tail;
    else if (name === 'Glass') { const g = (m.material as THREE.MeshStandardMaterial); g.transparent = true; g.opacity = 0.62; g.depthWrite = false; m.renderOrder = 2; m.castShadow = false; }
  });
  // guest model: its wheel faces the door and sits on the right — replace it with a rigged one at the
  // left-hand driver seat (Macedonia drives on the right)
  if (guestWheel.length) {
    for (const o of guestWheel) o.parent?.remove(o);
    const sw = new THREE.Object3D(); sw.name = 'SteeringWheel';
    sw.position.set(def.eye.x + 0.68, def.eye.y - 0.2, def.eye.z);
    sw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.9, 0.44, 0).normalize());
    body.add(sw); steering = sw;
  }
  // every rigged wheel gets a proper rim (some exports carried none, or a malformed one)
  if (steering) {
    const sw = steering as THREE.Object3D;
    let hasRim = false; sw.traverse((o) => { if (o.name === 'SteeringRim') hasRim = true; });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#1d1b19', roughness: 0.55 });
    if (!hasRim) {
      const rim = new THREE.Mesh(RIM_GEO, trimMat); rim.name = 'SteeringRim'; sw.add(rim);
      if (!sw.children.some((c) => c.name.startsWith('SteeringSpoke'))) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.03), trimMat); sp.name = 'SteeringSpoke'; sw.add(sp); }
      interior.push(sw);
    }
  }
  const steerBase = steering ? (steering as THREE.Object3D).quaternion.clone() : null;
  const gearBase = gear ? (gear as THREE.Object3D).quaternion.clone() : null;
  const plateMeshes: THREE.Mesh[] = [];
  const rig: VehicleRig = {
    group, body: body as unknown as THREE.Group, wheels: Object.values(wheels), glb: true, interior, cockpitHidden,
    setIndicators(l, r) { indL.emissive.set(l ? '#ffb020' : '#1a0e00'); indL.color.set(l ? '#ffc040' : '#c9861c'); indR.emissive.set(r ? '#ffb020' : '#1a0e00'); indR.color.set(r ? '#ffc040' : '#c9861c'); },
    setBrake(on) { tail.emissive.set(on ? '#ff1a10' : '#200000'); tail.color.set(on ? '#ff4030' : '#6a1410'); },
    setReverse() {},
    setPaint(hex, fin) { paintMat.color.set(hex); paintMat.metalness = fin === 'metallic' ? 0.55 : 0.12; paintMat.roughness = fin === 'metallic' ? 0.32 : 0.48; },
    setSteer(angle, spin) {
      for (const [k, w] of Object.entries(wheels)) { w.rotation.set(0, k.startsWith('F') ? angle : 0, -spin); }
    },
    // the rim is modelled in Blender's XY plane, so after the Z-up → Y-up export its own normal is local +Y
    setSteeringWheel(a) { if (steering && steerBase) (steering as THREE.Object3D).quaternion.copy(steerBase).multiply(SPIN.setFromAxisAngle(AXIS_Y, -a)); },
    setGear(gName) {
      if (!gear || !gearBase) return;
      const [lat, fwd] = GATE[gName] ?? [0, 0];
      (gear as THREE.Object3D).quaternion.copy(gearBase).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lat, 0, -fwd)));
    },
    setPlate(text, lay) {
      for (const pm of plateMeshes) { pm.parent?.remove(pm); pm.geometry.dispose(); }
      plateMeshes.length = 0;
      for (const [k, mount] of Object.entries(mounts)) {
        const two = lay === 'twoRow' && def.plates.includes('twoRow') && k === 'R';
        const geo = two ? new THREE.PlaneGeometry(0.34, 0.2) : new THREE.PlaneGeometry(0.52, 0.11);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: two ? twoRowTexture(text) : longTexture(text), toneMapped: false }));
        mesh.rotation.y = k === 'F' ? Math.PI / 2 : -Math.PI / 2;
        mount.add(mesh);
        plateMeshes.push(mesh);
      }
    },
  };
  rig.setPlate(plate, layout);
  return rig;
}

/** Procedural fallback wrapped in the same interface. */
export function proceduralRig(def: VehicleDef, paint: string, finish: 'solid' | 'metallic', plate: string, atlas: PlateAtlas, trims: string[]): VehicleRig {
  const base = buildCarRig(MESH_FOR[def.id] ?? 'yugo', paint, plate, atlas, 0.05, { trims, finish });
  return { ...base, glb: false, setSteer() {}, setSteeringWheel() {}, setGear() {}, setPlate() {} };
}

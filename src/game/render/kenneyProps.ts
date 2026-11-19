// Kenney City Kit (Suburban / Roads), CC0 — visual props only. Collisions and scenario geometry
// stay in the environment data; procedural meshes remain the fallback until these load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ZONES, along, elevAt, LANE_HALF, SHOULDER } from '../env/openRoad';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();

function load(kit: 'suburban' | 'roads', name: string) {
  const key = `${kit}/${name}`;
  if (!cache.has(key)) cache.set(key, loader.loadAsync(`${import.meta.env.BASE_URL}assets/kenney/${kit}/${name}.glb`)
    .then((g) => { g.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return g.scene; })
    .catch(() => null));
  return cache.get(key)!;
}

async function place(group: THREE.Group, kit: 'suburban' | 'roads', name: string, x: number, y: number, z: number, rot: number, scale: number) {
  const src = await load(kit, name);
  if (!src) return false;
  const o = src.clone(true);
  o.position.set(x, z, -y); o.rotation.y = rot; o.scale.setScalar(scale);
  group.add(o);
  return true;
}

const HOUSES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'k', 'l', 'm', 'p', 'q', 'r', 's', 't', 'u'];

/** Replace the open-road village and roadworks props with Kenney models once they load. */
export async function decorateOpenRoad(group: THREE.Group) {
  const half = LANE_HALF + SHOULDER;
  const kenney = new THREE.Group(); kenney.name = 'kenney';
  const jobs: Promise<boolean>[] = [];
  for (let i = 0; i < 14; i++) {
    const sv = 30 + i * 24, side = i % 2 ? 1 : -1;
    const a = along(sv, side * (half + 12));
    // houses face the road: Kenney fronts point along +z
    jobs.push(place(kenney, 'suburban', `building-type-${HOUSES[(i * 5) % HOUSES.length]}`, a.x, a.y, elevAt(sv), a.h + (side > 0 ? Math.PI : 0) + Math.PI / 2, 8));
    const f = along(sv + 4, side * (half + 5));
    jobs.push(place(kenney, 'suburban', 'fence-1x3', f.x, f.y, elevAt(sv), a.h + Math.PI / 2, 3.5));
    const t = along(sv + 10, side * (half + 17));
    jobs.push(place(kenney, 'suburban', i % 3 ? 'tree-large' : 'tree-small', t.x, t.y, elevAt(sv), i, 7));
  }
  for (let s = ZONES.works[0] + 6; s < ZONES.works[1] - 6; s += 4) { const a = along(s, -1.5); jobs.push(place(kenney, 'roads', 'construction-barrier', a.x, a.y, elevAt(s), a.h + Math.PI / 2, 7)); }
  for (let s = ZONES.works[0] - 18; s < ZONES.works[0] + 6; s += 3) { const a = along(s, -1.5 - (ZONES.works[0] + 6 - s) * 0.06); jobs.push(place(kenney, 'roads', 'construction-cone', a.x, a.y, elevAt(s), 0, 4)); }
  for (const s of [ZONES.works[0] + 2, ZONES.works[1] - 2]) { const a = along(s, -half + 0.6); jobs.push(place(kenney, 'roads', 'construction-light', a.x, a.y, elevAt(s), a.h, 6)); }
  const ok = (await Promise.all(jobs)).filter(Boolean).length;
  if (ok < jobs.length * 0.8) return; // keep the procedural fallback if assets are missing
  // hide the procedural village and roadworks props they replace
  group.traverse((o) => { if (/^(house-|roof$|winband$|barrier$|cone$|cone-s$)/.test(o.name)) o.visible = false; });
  group.add(kenney);
}

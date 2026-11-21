// Stand-ins for props whose BeamNG meshes are not in the archive (.link files):
// trees, lamps, signs and traffic lights placed at their exported positions.

import * as THREE from 'three';
import type { LevelObjects, PropInstance } from '../import/types';
import type { Lamp } from '../traffic/signals';

/** True where a prop makes no sense: inside a building or on a drivable road. */
export type Blocked = (x: number, y: number, z: number) => boolean;

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: PropInstance[], place: (o: THREE.Object3D, p: PropInstance) => void) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const o = new THREE.Object3D();
  items.forEach((p, i) => {
    o.position.set(p.pos[0], p.pos[2], -p.pos[1]);
    o.rotation.set(0, p.yaw, 0);
    o.scale.setScalar(1);
    place(o, p);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  m.count = items.length;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Props for the whole map. Trees, lamps, fences and walls that would stand inside a
 * building or on a carriageway are dropped (`blocked`); signs are never dropped.
 */
export function buildProps(objects: LevelObjects, blocked: Blocked = () => false) {
  const g = new THREE.Group();
  g.name = 'props';
  const ok = (p: PropInstance) => !blocked(p.pos[0], p.pos[1], p.pos[2]);
  const dropped: Record<string, number> = {};
  const keep = (kind: string, items: PropInstance[]) =>
    items.filter((p) => ok(p) || ((dropped[kind] = (dropped[kind] ?? 0) + 1), false));

  const trees = keep('trees', objects.trees);
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6).translate(0, 1.5, 0);
  const crown = new THREE.IcosahedronGeometry(2.6, 1).translate(0, 4.6, 0);
  const sz = (t: PropInstance) => (/small|sml|bush/.test(t.type) ? 0.6 : /large|huge/.test(t.type) ? 1.35 : 1) * t.scale;
  g.add(instanced(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4330 }), trees, (o, t) => o.scale.setScalar(sz(t))));
  const crowns = instanced(crown, new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1, flatShading: true }), trees, (o, t) =>
    o.scale.setScalar(sz(t)),
  );
  const col = new THREE.Color();
  trees.forEach((t, i) => crowns.setColorAt(i, col.setHSL(0.24 + ((i * 37) % 10) / 160, 0.38, 0.28 + ((i * 13) % 7) / 70)));
  g.add(crowns);

  // Lamp posts only. 'mapng_lamp_glow' entries are the light halos (~2.4 m from each
  // post, 7 m up), not posts, and stadium floodlights have no stand-in mesh.
  const lamps = keep('lamps', objects.lamps.filter((l) => !/stadium|glow/.test(l.type)));
  const pole = new THREE.CylinderGeometry(0.07, 0.1, 7, 6).translate(0, 3.5, 0);
  g.add(instanced(pole, new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.6, roughness: 0.4 }), lamps, () => {}));

  // Pedestrian rails: 2 m panels along the model's local y; the exported point is the
  // top rail (~0.87 m above the pavement), so the panel hangs down from it.
  const fences = keep('fences', objects.fences.filter((f) => /fence_pedestrian/.test(f.type)));
  const rail = new THREE.BoxGeometry(0.05, 0.9, 2).translate(0, -0.45, 0);
  g.add(instanced(rail, new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.5 }), fences, () => {}));

  // Garden / boundary walls: ~3.1 m segments (the measured spacing) along local x, on the ground.
  const wall = new THREE.BoxGeometry(3.1, 1.2, 0.3).translate(0, 0.6, 0);
  const stone = keep('walls', objects.fences.filter((f) => f.type === 'italy_wall_stone'));
  const concrete = keep('walls', objects.fences.filter((f) => f.type === 'italy_wall_concrete'));
  g.add(instanced(wall, new THREE.MeshStandardMaterial({ color: 0x9a8f7e, roughness: 1 }), stone, () => {}));
  g.add(instanced(wall, new THREE.MeshStandardMaterial({ color: 0xb4b2ab, roughness: 0.95 }), concrete, () => {}));
  g.userData.dropped = dropped;
  g.userData.walls = [...stone, ...concrete]; // for physics: solid, unlike the rails

  const signs = objects.signs;
  const signColor: Record<string, number> = { give_way: 0xd8261f, noentry: 0xc71f1a, one_way: 0x1f5fb8, priorityroad: 0xf1c41a };
  for (const s of signs) {
    const grp = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x777777 }));
    stick.position.y = 1.2;
    const modelled = s.type in signColor;
    const face = osmFace(s.type);
    const plate = new THREE.Mesh(
      face ? new THREE.CylinderGeometry(0.33, 0.33, 0.04, 24) : !modelled ? new THREE.BoxGeometry(0.6, 0.04, 0.6) : s.type === 'give_way' ? new THREE.CylinderGeometry(0.45, 0.45, 0.04, 3) : s.type === 'priorityroad' ? new THREE.BoxGeometry(0.5, 0.04, 0.5) : new THREE.CylinderGeometry(0.33, 0.33, 0.04, 20),
      face ?? (modelled ? new THREE.MeshStandardMaterial({ color: signColor[s.type] }) : codePlate(s.type)),
    );
    plate.rotation.x = Math.PI / 2;
    if (s.type === 'priorityroad') plate.rotation.z = Math.PI / 4;
    plate.position.y = 2.5;
    grp.add(stick, plate);
    grp.position.set(s.pos[0], s.pos[2], -s.pos[1]);
    grp.rotation.y = s.yaw;
    g.add(grp);
  }
  return g;
}

/**
 * Traffic light heads; call update() each frame with lamp states. `dark` heads are
 * surveyed lights with no simulated programme: drawn unlit, never given a made-up cycle.
 */
export function buildSignals(
  objects: LevelObjects,
  dark: { pos: number[]; dir: number[] }[] = [],
  /** where to stand the pole of an OSM/MapNG head (its point marks the stop position on the road centre) */
  poleAt: (pos: number[], dir: number[]) => number[] = (p) => p,
) {
  const g = new THREE.Group();
  g.name = 'signals';
  const heads = new Map<number, THREE.MeshStandardMaterial[]>();
  const housing = new THREE.MeshStandardMaterial({ color: 0x1d1f22 });
  const list = [...objects.signals.instances.map((s) => ({ ...s, lit: true })), ...dark.map((d, k) => ({ id: -1 - k, pos: d.pos, dir: d.dir, lit: false }))];
  for (const s of list) {
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8), housing);
    pole.position.y = 1.6;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.95, 0.3), housing);
    box.position.y = 3.5;
    grp.add(pole, box);
    const mats = [0xff2a1a, 0xffb000, 0x2bd94a].map((c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 }));
    mats.forEach((m, k) => {
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), m);
      lens.position.set(0, 3.8 - k * 0.3, 0.16);
      grp.add(lens);
    });
    if (s.lit) heads.set(s.id, mats);
    // surveyed heads (ids ≥ 200000, and all dark ones) are already at the pole position
    const at = s.lit && s.id < 200000 ? poleAt(s.pos, s.dir) : s.pos;
    grp.position.set(at[0], at[2], -at[1]);
    // lenses (+Z local) face along the instance dir
    grp.rotation.y = Math.atan2(s.dir[0], -s.dir[1]);
    g.add(grp);
  }
  return {
    group: g,
    update(state: (id: number) => Lamp) {
      for (const [id, mats] of heads) {
        const st = state(id);
        mats[0].emissiveIntensity = st === 'red' ? 2.5 : 0;
        mats[1].emissiveIntensity = st === 'yellow' ? 2.5 : 0;
        mats[2].emissiveIntensity = st === 'green' ? 2.5 : 0;
      }
    },
  };
}

/** Plain plate showing the official code: a sign that is placed but has no dedicated 3D model yet. */
const plateCache = new Map<string, THREE.MeshStandardMaterial>();
function codePlate(code: string) {
  let m = plateCache.get(code);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2f2f2';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#555';
  x.lineWidth = 6;
  x.strokeRect(3, 3, 122, 122);
  x.fillStyle = '#222';
  x.font = 'bold 30px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(code.toUpperCase(), 64, 56);
  x.font = '15px system-ui, sans-serif';
  x.fillText('no model', 64, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshStandardMaterial({ map: t });
  plateCache.set(code, m);
  return m;
}

/**
 * Faces for the OSM sign types that are a standard disc: speed limit (red ring,
 * number from the OSM tag) and mandatory direction (blue disc, white arrow).
 */
const faceCache = new Map<string, THREE.MeshStandardMaterial>();
function osmFace(type: string): THREE.MeshStandardMaterial | null {
  const speed = /^speed_(\d+)$/.exec(type)?.[1];
  if (!speed && type !== 'arrow_right') return null;
  let m = faceCache.get(type);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.beginPath();
  x.arc(64, 64, 63, 0, Math.PI * 2);
  if (speed) {
    x.fillStyle = '#d42a20';
    x.fill();
    x.beginPath();
    x.arc(64, 64, 47, 0, Math.PI * 2);
    x.fillStyle = '#fff';
    x.fill();
    x.fillStyle = '#111';
    x.font = 'bold 48px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(speed, 64, 68);
  } else {
    x.fillStyle = '#1f5fb8';
    x.fill();
    x.strokeStyle = x.fillStyle = '#fff';
    x.lineWidth = 14;
    x.beginPath();
    x.moveTo(30, 64);
    x.lineTo(80, 64);
    x.stroke();
    x.beginPath();
    x.moveTo(100, 64);
    x.lineTo(72, 38);
    x.lineTo(72, 90);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // the disc's top cap maps UV around the circle centre; flip so text reads from the front
  t.center.set(0.5, 0.5);
  m = new THREE.MeshStandardMaterial({ map: t });
  faceCache.set(type, m);
  return m;
}

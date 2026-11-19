// Original boxy car meshes built from extruded side profiles (Yugo- and Zastava-inspired
// proportions, no copied designs). Local frame: +x forward, +y up, +z = right-hand side.
import * as THREE from 'three';
import { CAR_DIMS, type CarType } from '../content/generate';
import type { PlateAtlas } from './textures';
import type { Batcher } from './batcher';

interface Profile {
  belt: number; hoodFront: number; wsBase: number; roofFront: number; roofRear: number; backBase: number; tailTop: number;
  wheelR: number; wb: number; kind: 'hatch' | 'sedan' | 'van' | 'truck'; bumper: 'black' | 'chrome'; bevel: number; bottom?: number;
}

const PROFILES: Record<CarType, Profile> = {
  yugo: { belt: 0.86, hoodFront: 0.74, wsBase: 0.72, roofFront: 0.06, roofRear: -1.30, backBase: -1.70, tailTop: 0.90, wheelR: 0.28, wb: 2.15, kind: 'hatch', bumper: 'black', bevel: 0.025 },
  stojadin: { belt: 0.85, hoodFront: 0.76, wsBase: 0.84, roofFront: 0.16, roofRear: -1.08, backBase: -1.86, tailTop: 0.88, wheelR: 0.29, wb: 2.45, kind: 'hatch', bumper: 'chrome', bevel: 0.03 },
  hatch: { belt: 0.88, hoodFront: 0.78, wsBase: 0.86, roofFront: 0.22, roofRear: -1.46, backBase: -1.93, tailTop: 0.95, wheelR: 0.29, wb: 2.47, kind: 'hatch', bumper: 'black', bevel: 0.025 },
  sedan: { belt: 0.86, hoodFront: 0.78, wsBase: 0.95, roofFront: 0.30, roofRear: -0.96, backBase: -1.48, tailTop: 0.90, wheelR: 0.30, wb: 2.55, kind: 'sedan', bumper: 'chrome', bevel: 0.03 },
  compact: { belt: 0.93, hoodFront: 0.86, wsBase: 1.02, roofFront: 0.12, roofRear: -1.58, backBase: -1.98, tailTop: 1.02, wheelR: 0.31, wb: 2.55, kind: 'hatch', bumper: 'black', bevel: 0.06 },
  van: { belt: 0.96, hoodFront: 0.92, wsBase: 1.30, roofFront: 0.74, roofRear: -2.15, backBase: -2.17, tailTop: 1.80, wheelR: 0.31, wb: 2.70, kind: 'van', bumper: 'black', bevel: 0.03 },
  estate: { belt: 0.86, hoodFront: 0.78, wsBase: 0.98, roofFront: 0.32, roofRear: -2.06, backBase: -2.19, tailTop: 0.96, wheelR: 0.30, wb: 2.56, kind: 'hatch', bumper: 'black', bevel: 0.03 },
  coupe: { belt: 0.80, hoodFront: 0.72, wsBase: 0.74, roofFront: -0.02, roofRear: -0.9, backBase: -1.78, tailTop: 0.86, wheelR: 0.30, wb: 2.42, kind: 'sedan', bumper: 'chrome', bevel: 0.035 },
  suv: { belt: 1.14, hoodFront: 1.04, wsBase: 1.04, roofFront: 0.42, roofRear: -1.98, backBase: -2.1, tailTop: 1.16, wheelR: 0.36, wb: 2.5, kind: 'hatch', bumper: 'black', bevel: 0.05, bottom: 0.42 },
  truck: { belt: 1.6, hoodFront: 1.5, wsBase: 3.35, roofFront: 3.2, roofRear: 1.55, backBase: 1.5, tailTop: 2.6, wheelR: 0.48, wb: 4.0, kind: 'truck', bumper: 'black', bevel: 0.04, bottom: 0.62 },
};

/** Which mesh profile a vehicle definition uses (procedural fallback for the Blender assets). */
export const MESH_FOR: Record<string, CarType> = { vardarka: 'yugo', pelister: 'sedan', shar: 'estate', ohrid: 'coupe', korab: 'suv', bistra: 'van', jakupica: 'truck' };

export type CarMat = 'body' | 'glass' | 'black' | 'tire' | 'hub' | 'chrome' | 'head' | 'tail' | 'indL' | 'indR' | 'plate' | 'rust' | 'interior';
export interface CarPart { geom: THREE.BufferGeometry; mat: CarMat }

function extrude(pts: [number, number][], depth: number, bevel = 0.02): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function plateGeom(atlas: PlateAtlas, text: string, x: number, y: number, front: boolean) {
  const g = new THREE.PlaneGeometry(0.52, 0.11);
  const [u0, v0, u1, v1] = atlas.uv(text);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // PlaneGeometry uv order: (0,1) (1,1) (0,0) (1,0)
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  g.rotateY(front ? Math.PI / 2 : -Math.PI / 2);
  g.translate(x, y, 0);
  return g;
}

export function carParts(type: CarType, plate: string, atlas: PlateAtlas, condition = 0, seed = 1, trims: string[] = []): CarPart[] {
  const { L, W, H } = CAR_DIMS[type];
  const p = PROFILES[type];
  if (p.kind === 'truck') return truckParts(L, W, H, p, plate, atlas, trims);
  const parts: CarPart[] = [];
  const hl = L / 2;
  const bodyD = W - 2 * p.bevel;
  const bottom = p.bottom ?? 0.24;
  // lower body
  const top = Math.max(p.belt, p.kind === 'van' ? p.belt : p.tailTop);
  parts.push({ mat: 'body', geom: extrude([
    [-hl, bottom], [hl, bottom], [hl, p.hoodFront - 0.14], [hl - 0.10, p.hoodFront], [p.wsBase, p.belt], [-hl + 0.04, top], [-hl, top - 0.12],
  ], bodyD, p.bevel) });
  // under-body shadow line and sills so the body reads grounded
  parts.push({ mat: 'black', geom: box(L * 0.82, 0.08, W - 0.08, 0, bottom + 0.02, 0) });
  for (const tr of trims) parts.push(...trimParts(tr, type, L, W, H, p));
  if (p.kind === 'van') {
    const split = p.roofFront - 0.85;
    parts.push({ mat: 'glass', geom: extrude([[p.wsBase, p.belt], [p.roofFront, H - 0.02], [split, H - 0.02], [split, p.belt]], W - 0.14, 0.01) });
    parts.push({ mat: 'body', geom: extrude([[split, p.belt - 0.02], [split, H], [-hl, H], [-hl, p.belt - 0.02]], bodyD, p.bevel) });
    parts.push({ mat: 'body', geom: box(Math.abs(p.roofFront - split) + 0.06, 0.06, W - 0.1, (p.roofFront + split) / 2, H, 0) });
  } else {
    const back: [number, number] = p.kind === 'sedan' ? [p.backBase, p.tailTop] : [p.backBase, Math.max(p.belt, p.tailTop - 0.02)];
    parts.push({ mat: 'glass', geom: extrude([[p.wsBase, p.belt], [p.roofFront, H - 0.02], [p.roofRear, H - 0.02], back, [p.backBase + 0.02, p.belt]], W - 0.14, 0.01) });
    // roof skin
    parts.push({ mat: 'body', geom: box(p.roofFront - p.roofRear + 0.04, 0.05, W - 0.10, (p.roofFront + p.roofRear) / 2, H - 0.005, 0) });
    // B pillar (dark frame) and C pillar (body colour)
    const bx = p.roofFront - (p.roofFront - p.roofRear) * 0.48;
    parts.push({ mat: 'black', geom: box(0.08, H - p.belt - 0.04, W - 0.125, bx, (H + p.belt) / 2, 0) });
    const cTop = p.roofRear + (p.kind === 'sedan' ? 0.05 : 0.32);
    parts.push({ mat: 'body', geom: extrude([[cTop, H - 0.03], [p.roofRear - 0.01, H - 0.03], [back[0] + 0.05, back[1] + 0.01], [back[0] + 0.42, p.belt + 0.01]], W - 0.125, 0) });
    // A pillars as thin strips along the windshield edges
    const aLen = Math.hypot(p.wsBase - p.roofFront, H - p.belt);
    const aAng = Math.atan2(H - p.belt, p.roofFront - p.wsBase);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(aLen, 0.05, 0.06);
      g.rotateZ(aAng); g.translate((p.wsBase + p.roofFront) / 2, (H + p.belt) / 2, s * (W / 2 - 0.08));
      parts.push({ mat: 'body', geom: g });
    }
  }
  // wheels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.CylinderGeometry(p.wheelR, p.wheelR, 0.18, 14);
    t.rotateX(Math.PI / 2); t.translate(sx * p.wb / 2, p.wheelR, sz * (W / 2 - 0.12));
    parts.push({ mat: 'tire', geom: t });
    const missing = condition > 0.82 && ((seed + sx * 3 + sz) & 1) === 0;
    if (!missing) {
      const h = new THREE.CylinderGeometry(p.wheelR * 0.58, p.wheelR * 0.58, 0.02, 12);
      h.rotateX(Math.PI / 2); h.translate(sx * p.wb / 2, p.wheelR, sz * (W / 2 - 0.025));
      parts.push({ mat: 'hub', geom: h });
    }
  }
  // dark wheel arches (simple boxes inside the body line)
  for (const sx of [-1, 1]) parts.push({ mat: 'black', geom: box(p.wheelR * 2.2, 0.08, W + 0.005, sx * p.wb / 2, p.wheelR * 2 - 0.02, 0) });
  // bumpers, grille, lights
  const bm: CarMat = p.bumper === 'chrome' ? 'chrome' : 'black';
  parts.push({ mat: bm, geom: box(0.14, 0.15, W + 0.02, hl + 0.02, 0.38, 0) });
  parts.push({ mat: bm, geom: box(0.14, 0.15, W + 0.02, -hl - 0.02, 0.38, 0) });
  const lightY = p.hoodFront - 0.2;
  parts.push({ mat: 'black', geom: box(0.03, 0.13, W * 0.42, hl + 0.005, lightY, 0) });
  for (const sz of [-1, 1]) {
    parts.push({ mat: 'head', geom: box(0.03, 0.12, 0.27, hl + 0.006, lightY, sz * (W / 2 - 0.25)) });
    parts.push({ mat: sz < 0 ? 'indL' : 'indR', geom: box(0.03, 0.07, 0.09, hl + 0.006, lightY, sz * (W / 2 - 0.06)) });
    const ty = Math.min(top, p.belt) - 0.22;
    parts.push({ mat: 'tail', geom: box(0.03, 0.15, 0.26, -hl - 0.006, ty, sz * (W / 2 - 0.25)) });
    parts.push({ mat: sz < 0 ? 'indL' : 'indR', geom: box(0.03, 0.15, 0.09, -hl - 0.006, ty, sz * (W / 2 - 0.07)) });
    // mirrors
    parts.push({ mat: 'black', geom: box(0.08, 0.08, 0.12, p.wsBase - 0.08, p.belt + 0.08, sz * (W / 2 + 0.05)) });
    // side indicator repeater
    parts.push({ mat: sz < 0 ? 'indL' : 'indR', geom: box(0.07, 0.03, 0.01, p.wsBase + 0.25, p.belt - 0.12, sz * (W / 2 + 0.002)) });
    if (condition > 0.72) parts.push({ mat: 'rust', geom: box(0.5, 0.1, 0.01, -hl * 0.45 + sz * 0.2, 0.33, sz * (W / 2 + 0.004)) });
  }
  // plates
  parts.push({ mat: 'plate', geom: plateGeom(atlas, plate, hl + 0.10, 0.40, true) });
  parts.push({ mat: 'plate', geom: plateGeom(atlas, plate, -hl - 0.10, Math.min(top, p.belt) - 0.42 + 0.1, false) });
  return parts;
}

/** Optional original trims (garage): roof rack, spare wheel, stripes, chrome caps, bull bar. */
function trimParts(tr: string, type: CarType, L: number, W: number, H: number, p: Profile): CarPart[] {
  const out: CarPart[] = [];
  if (tr === 'Кровен носач' || tr === 'Кровни шини') {
    for (const z of [-1, 1]) out.push({ mat: 'chrome', geom: box(Math.abs(p.roofFront - p.roofRear) * 0.9, 0.05, 0.05, (p.roofFront + p.roofRear) / 2, H + 0.06, z * (W / 2 - 0.15)) });
    for (let i = 0; i < 3; i++) out.push({ mat: 'black', geom: box(0.05, 0.04, W - 0.25, p.roofRear + (p.roofFront - p.roofRear) * (0.2 + i * 0.3), H + 0.09, 0) });
  } else if (tr === 'Резервно на врата') {
    const t = new THREE.CylinderGeometry(p.wheelR * 0.95, p.wheelR * 0.95, 0.22, 14); t.rotateZ(Math.PI / 2); t.translate(-L / 2 - 0.13, p.belt - 0.05, 0);
    out.push({ mat: 'tire', geom: t });
  } else if (tr === 'Спорт ленти') {
    out.push({ mat: 'interior', geom: box(L * 0.72, 0.06, 0.012, 0, p.belt - 0.2, W / 2 + 0.006) });
    out.push({ mat: 'interior', geom: box(L * 0.72, 0.06, 0.012, 0, p.belt - 0.2, -W / 2 - 0.006) });
  } else if (tr === 'Рамка напред') {
    out.push({ mat: 'chrome', geom: box(0.06, 0.5, W * 0.8, L / 2 + 0.16, 0.62, 0) });
    out.push({ mat: 'chrome', geom: box(0.18, 0.05, W * 0.8, L / 2 + 0.08, 0.86, 0) });
  } else if (tr === 'Хром лајсни' || tr === 'Странична лајсна') {
    for (const z of [-1, 1]) out.push({ mat: 'chrome', geom: box(L * 0.8, 0.03, 0.012, 0, (p.bottom ?? 0.24) + 0.2, z * (W / 2 + 0.006)) });
  }
  void type;
  return out;
}

/** Rigid truck: cab-over, chassis, cargo box (or tilt), twin rear wheels. */
function truckParts(L: number, W: number, H: number, p: Profile, plate: string, atlas: PlateAtlas, trims: string[]): CarPart[] {
  const parts: CarPart[] = [];
  const hl = L / 2;
  const cabL = 1.9, cabX = hl - cabL / 2;
  const cabH = 2.75;
  // cab with a sloped windscreen
  parts.push({ mat: 'body', geom: extrude([[hl - cabL, 0.95], [hl - 0.05, 0.95], [hl, 1.25], [hl, 1.55], [hl - 0.25, cabH - 0.05], [hl - cabL, cabH]], W - 0.1, 0.04) });
  parts.push({ mat: 'glass', geom: extrude([[hl - 0.02, 1.62], [hl - 0.24, cabH - 0.18], [hl - 0.6, cabH - 0.18], [hl - 0.6, 1.62]], W - 0.18, 0.01) });
  parts.push({ mat: 'glass', geom: box(0.7, 0.62, W - 0.04, hl - 0.95, 2.05, 0) });
  parts.push({ mat: 'black', geom: box(0.06, 0.5, W * 0.7, hl + 0.01, 1.2, 0) }); // grille
  parts.push({ mat: 'black', geom: box(0.18, 0.28, W + 0.02, hl + 0.05, 0.72, 0) }); // bumper
  // chassis rails
  for (const z of [-0.45, 0.45]) parts.push({ mat: 'black', geom: box(L - 0.3, 0.22, 0.12, -0.15, 0.78, z) });
  // cargo
  const boxL = L - cabL - 0.25, boxX = -hl + boxL / 2;
  const tilt = trims.includes('Цирада');
  parts.push({ mat: tilt ? 'interior' : 'body', geom: box(boxL, H - 1.0, W, boxX, 1.0 + (H - 1.0) / 2, 0) });
  if (!tilt) for (let i = 1; i < 6; i++) parts.push({ mat: 'chrome', geom: box(0.04, H - 1.1, W + 0.01, -hl + (boxL * i) / 6, 1.0 + (H - 1.0) / 2, 0) });
  // wheels: single front, twin rear
  const r = p.wheelR;
  const wheel = (x: number, z: number) => { const t = new THREE.CylinderGeometry(r, r, 0.3, 16); t.rotateX(Math.PI / 2); t.translate(x, r, z); parts.push({ mat: 'tire', geom: t }); const h = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.32, 10); h.rotateX(Math.PI / 2); h.translate(x, r, z); parts.push({ mat: 'hub', geom: h }); };
  const fx = hl - 1.25, rx = fx - p.wb;
  for (const z of [-1, 1]) { wheel(fx, z * (W / 2 - 0.2)); wheel(rx, z * (W / 2 - 0.2)); wheel(rx, z * (W / 2 - 0.52)); }
  for (const z of [-1, 1]) {
    parts.push({ mat: 'head', geom: box(0.04, 0.16, 0.32, hl + 0.06, 0.9, z * (W / 2 - 0.3)) });
    parts.push({ mat: z < 0 ? 'indL' : 'indR', geom: box(0.04, 0.1, 0.12, hl + 0.06, 0.9, z * (W / 2 - 0.08)) });
    parts.push({ mat: 'tail', geom: box(0.04, 0.16, 0.3, -hl - 0.01, 0.95, z * (W / 2 - 0.3)) });
    parts.push({ mat: z < 0 ? 'indL' : 'indR', geom: box(0.04, 0.16, 0.12, -hl - 0.01, 0.95, z * (W / 2 - 0.08)) });
    // big West-Coast mirrors
    parts.push({ mat: 'black', geom: box(0.08, 0.42, 0.2, hl - 0.35, 2.05, z * (W / 2 + 0.28)) });
  }
  parts.push({ mat: 'plate', geom: plateGeom(atlas, plate, hl + 0.16, 0.72, true) });
  parts.push({ mat: 'plate', geom: plateGeom(atlas, plate, -hl - 0.04, 0.72, false) });
  void cabX;
  return parts;
}

// ---------------------------------------------------------------------------
const fade = (hex: string, condition: number) => {
  const c = new THREE.Color(hex);
  return c.lerp(new THREE.Color('#d6d0c2'), Math.max(0, condition - 0.35) * 0.35);
};

const shared: Partial<Record<CarMat, THREE.Material>> = {};
export function sharedCarMaterial(m: CarMat, atlas: PlateAtlas): THREE.Material {
  if (shared[m]) return shared[m]!;
  let mat: THREE.Material;
  switch (m) {
    case 'glass': mat = new THREE.MeshStandardMaterial({ color: '#25343a', metalness: 0.4, roughness: 0.12 }); break;
    case 'black': mat = new THREE.MeshLambertMaterial({ color: '#1d1d1b' }); break;
    case 'tire': mat = new THREE.MeshLambertMaterial({ color: '#191919' }); break;
    case 'hub': mat = new THREE.MeshStandardMaterial({ color: '#a8a8a2', metalness: 0.6, roughness: 0.4 }); break;
    case 'chrome': mat = new THREE.MeshStandardMaterial({ color: '#c9c9c4', metalness: 0.85, roughness: 0.25 }); break;
    case 'head': mat = new THREE.MeshStandardMaterial({ color: '#e9e4d2', metalness: 0.3, roughness: 0.2, emissive: '#2a2618' }); break;
    case 'tail': mat = new THREE.MeshLambertMaterial({ color: '#7a1410', emissive: '#2a0000' }); break;
    case 'indL': case 'indR': mat = new THREE.MeshLambertMaterial({ color: '#c9861c', emissive: '#1a0e00' }); break;
    case 'plate': mat = new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false }); break;
    case 'rust': mat = new THREE.MeshLambertMaterial({ color: '#7a4a2a' }); break;
    case 'interior': mat = new THREE.MeshLambertMaterial({ color: '#2b2a27' }); break;
    default: mat = new THREE.MeshLambertMaterial({ color: '#888' });
  }
  shared[m] = mat;
  return mat;
}

/** Parked (static) car merged into the world batcher. */
export function addParkedCar(b: Batcher, atlas: PlateAtlas, type: CarType, color: string, plate: string, condition: number, x: number, y: number, h: number, seed: number) {
  const m = new THREE.Matrix4().makeRotationY(h).setPosition(x, 0, -y);
  const body = fade(color, condition);
  const key = `#${body.getHexString()}`;
  for (const part of carParts(type, plate, atlas, condition, seed)) {
    if (part.mat === 'body') b.add(part.geom, 'carbody' + key, () => new THREE.MeshStandardMaterial({ color: body, metalness: 0.15, roughness: 0.55 - (1 - condition) * 0.2 }), m);
    else b.add(part.geom, 'car-' + part.mat, () => sharedCarMaterial(part.mat, atlas), m, part.mat !== 'plate');
  }
}

export interface CarRig {
  group: THREE.Group;
  setIndicators(left: boolean, right: boolean): void;
  setBrake(on: boolean): void;
  setReverse(on: boolean): void;
  wheels: THREE.Object3D[];
  body: THREE.Group;
  /** live paint change: updates the material only, never rebuilds geometry or physics */
  setPaint(hex: string, finish: 'solid' | 'metallic'): void;
  setHazardsLamp?(on: boolean): void;
}

/** Dynamic car with its own light materials (player and moving traffic). */
export function buildCarRig(type: CarType, color: string, plate: string, atlas: PlateAtlas, condition = 0, opts: { trims?: string[]; finish?: 'solid' | 'metallic' } = {}): CarRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const metallic = opts.finish === 'metallic';
  const bodyMat = new THREE.MeshStandardMaterial({ color: fade(color, condition), metalness: metallic ? 0.55 : 0.12, roughness: metallic ? 0.32 : 0.48 });
  const indL = new THREE.MeshLambertMaterial({ color: '#c9861c', emissive: '#1a0e00' });
  const indR = indL.clone();
  const tail = new THREE.MeshLambertMaterial({ color: '#7a1410', emissive: '#2a0000' });
  const wheels: THREE.Object3D[] = [];
  for (const part of carParts(type, plate, atlas, condition, 3, opts.trims ?? [])) {
    const mat = part.mat === 'body' ? bodyMat : part.mat === 'indL' ? indL : part.mat === 'indR' ? indR : part.mat === 'tail' ? tail : sharedCarMaterial(part.mat, atlas);
    const mesh = new THREE.Mesh(part.geom, mat);
    mesh.castShadow = part.mat === 'body' || part.mat === 'glass';
    if (part.mat === 'tire' || part.mat === 'hub') wheels.push(mesh);
    body.add(mesh);
  }
  return {
    group, body, wheels,
    setIndicators(l, r) {
      indL.emissive.set(l ? '#ffb020' : '#1a0e00'); indL.color.set(l ? '#ffc040' : '#c9861c');
      indR.emissive.set(r ? '#ffb020' : '#1a0e00'); indR.color.set(r ? '#ffc040' : '#c9861c');
    },
    setBrake(on) { tail.emissive.set(on ? '#ff1a10' : '#2a0000'); tail.color.set(on ? '#ff4030' : '#7a1410'); },
    setReverse(_on) { /* reverse lamp folded into tail cluster for simplicity */ },
    setPaint(hex, finish) { bodyMat.color.set(hex); bodyMat.metalness = finish === 'metallic' ? 0.55 : 0.12; bodyMat.roughness = finish === 'metallic' ? 0.32 : 0.48; },
  };
}

/** Driver-view interior: dashboard with original analogue dials, wheel, pillars and bonnet. */
export function buildCockpit(color: string): { group: THREE.Group; wheel: THREE.Object3D } {
  const p = PROFILES.yugo;
  const { W, H } = CAR_DIMS.yugo;
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: '#3a3d3a' });
  const petrol = new THREE.MeshLambertMaterial({ color: '#1f3b3a' });
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.4 });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, W - 0.12), dark); dash.position.set(p.wsBase - 0.28, p.belt - 0.05, 0); g.add(dash);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, W - 0.14), petrol); top.position.set(p.wsBase - 0.27, p.belt + 0.03, 0); g.add(top);
  const binnacle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.4), petrol); binnacle.position.set(p.wsBase - 0.47, p.belt + 0.06, -0.36); g.add(binnacle);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(CAR_DIMS.yugo.L / 2 - p.wsBase + 0.05, 0.04, W - 0.06), paint);
  hood.position.set((CAR_DIMS.yugo.L / 2 + p.wsBase) / 2, p.hoodFront + 0.05, 0); hood.rotation.z = -0.07; g.add(hood);
  const aLen = Math.hypot(p.wsBase - p.roofFront, H - p.belt);
  const aAng = Math.atan2(H - p.belt, p.roofFront - p.wsBase);
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(aLen, 0.045, 0.05), paint);
    a.rotation.z = aAng; a.position.set((p.wsBase + p.roofFront) / 2, (H + p.belt) / 2, s * (W / 2 - 0.1)); g.add(a);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, W - 0.1), new THREE.MeshLambertMaterial({ color: '#d8d0bd', emissive: '#6a6252' }));
  roof.position.set(p.roofFront - 0.7, H - 0.06, 0); g.add(roof);
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 8, 28), dark);
  wheel.add(rim);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.02), dark); wheel.add(spoke);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), petrol); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  // the wheel faces the driver (+x is forward); steering spins it about its own normal (rotation.z)
  wheel.rotation.y = Math.PI / 2;
  const holder = new THREE.Group();
  holder.position.set(p.wsBase - 0.74, p.belt - 0.02, -0.36);
  holder.rotation.z = 0.42;
  holder.add(wheel); g.add(holder);
  return { group: g, wheel };
}

export { PROFILES };

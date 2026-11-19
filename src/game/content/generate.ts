// Deterministic expansion of the hand-authored route into buildings, sidewalks and parked cars.
// Shared by the simulation (collisions, sight lines) and the renderer, so both always agree.

import { rng, rect, type Rect, type Vec2, type Pose } from '../math';
import { FRONTAGES, RESERVED, SIDEWALK, PARKING, TIHA_NARROW, SHOPS, type Frontage } from './debarMaalo';

export type CarType = 'yugo' | 'stojadin' | 'hatch' | 'sedan' | 'compact' | 'van' | 'estate' | 'coupe' | 'suv' | 'truck';

export const CAR_DIMS: Record<CarType, { L: number; W: number; H: number }> = {
  yugo: { L: 3.49, W: 1.54, H: 1.39 },
  stojadin: { L: 3.84, W: 1.62, H: 1.40 },
  hatch: { L: 3.98, W: 1.66, H: 1.41 },
  sedan: { L: 4.32, W: 1.68, H: 1.42 },
  compact: { L: 4.06, W: 1.74, H: 1.49 },
  van: { L: 4.38, W: 1.76, H: 1.84 },
  estate: { L: 4.46, W: 1.69, H: 1.48 },
  coupe: { L: 4.12, W: 1.68, H: 1.30 },
  suv: { L: 4.26, W: 1.80, H: 1.76 },
  truck: { L: 7.2, W: 2.36, H: 3.2 },
};

export interface ParkedCar {
  id: string; pose: Pose; type: CarType; color: string; plate: string; condition: number; // 0 tidy … 1 tired
}

export interface Building {
  id: string; r: Rect; // footprint
  front: Vec2[]; // [a, b] of the street-facing wall
  normal: Vec2; // outward (towards street)
  height: number; floors: number; color: string; trim: string; shutter: string;
  roof: 'flat' | 'hip'; balcony: boolean; style: number; shop?: string;
}

export interface Slab { r: Rect; kind: 'sidewalk' | 'terrace' | 'yard' }
export interface Gate { a: Vec2; b: Vec2; normal: Vec2; color: string }

const PLASTER = ['#e9dcc0', '#e3cfa6', '#d9b98c', '#ecd9c6', '#d6c2a4', '#e6c8b2', '#c9b8a0', '#efe5cf', '#d8a98b', '#cfd1bf', '#e4d4b4'];
const TRIM = ['#f4ecdc', '#cbb894', '#a99b82', '#efe7d6'];
const SHUTTER = ['#3e5a4f', '#6b4a32', '#55605a', '#7a3b2e', '#8a8170', '#2f4a5a'];
export const CAR_COLORS = ['#efe3c8', '#8b1e1e', '#1f3b3a', '#c9c3b5', '#2b3a55', '#6b6b63', '#d8cfb4', '#b14a2a', '#e6e2d8', '#46523e', '#7d8b8f', '#a3352d', '#253021', '#b8a37a', '#3a3f45'];
const PLATE_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVZ'; // Q W X Y are not used on Macedonian plates

/** Synthetic Skopje plate in the SK 1234-AB pattern. Numbers are invented. */
export function plateFor(r: ReturnType<typeof rng>): string {
  const n = String(r.int(1000, 9899));
  return `SK ${n}-${r.pick(PLATE_LETTERS.split(''))}${r.pick(PLATE_LETTERS.split(''))}`;
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

function frontRect(f: Frontage, s0: number, s1: number, off0: number, off1: number): Rect {
  const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
  const dx = (f.b.x - f.a.x) / len, dy = (f.b.y - f.a.y) / len;
  const bx = -f.normal.x, by = -f.normal.y; // into the block
  const p = (s: number, o: number) => ({ x: f.a.x + dx * s + bx * o, y: f.a.y + dy * s + by * o });
  const c = [p(s0, off0), p(s1, off0), p(s1, off1), p(s0, off1)];
  return rect(Math.min(...c.map((q) => q.x)), Math.min(...c.map((q) => q.y)), Math.max(...c.map((q) => q.x)), Math.max(...c.map((q) => q.y)));
}

export interface Generated {
  buildings: Building[]; slabs: Slab[]; gates: Gate[]; parked: ParkedCar[]; blockers: Rect[];
}

let cache: Generated | null = null;

export function generate(): Generated {
  if (cache) return cache;
  const buildings: Building[] = [];
  const slabs: Slab[] = [];
  const gates: Gate[] = [];
  const reserved = RESERVED.map((r) => r.r);

  FRONTAGES.forEach((f, fi) => {
    const r = rng(1000 + fi * 37);
    const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
    const baseSw = SIDEWALK[f.street] ?? 2.4;
    // continuous base sidewalk along the whole frontage
    slabs.push({ r: frontRect(f, 0, len, 0, baseSw), kind: 'sidewalk' });
    let s = f.trimStart ?? 0;
    const end = len - (f.trimEnd ?? 0);
    while (s < end - 4) {
      const w = Math.min(end - s, r.range(8, 17));
      if (end - s - w < 5) { /* absorb tiny leftovers */ }
      const sw = baseSw + r.range(-0.2, 1.1);
      const depth = r.range(9.5, 13);
      const fp = frontRect(f, s, s + w, sw, sw + depth);
      const probe = frontRect(f, s, s + w, 0, sw + depth);
      if (reserved.some((q) => overlaps(q, probe))) { s += 2; continue; }
      if (r.chance(0.11) && w > 6) {
        // courtyard gate between buildings
        const gw = 3.4;
        const len2 = len;
        const dx = (f.b.x - f.a.x) / len2, dy = (f.b.y - f.a.y) / len2;
        const o = sw + 0.1;
        gates.push({
          a: { x: f.a.x + dx * s - f.normal.x * o, y: f.a.y + dy * s - f.normal.y * o },
          b: { x: f.a.x + dx * (s + gw) - f.normal.x * o, y: f.a.y + dy * (s + gw) - f.normal.y * o },
          normal: f.normal, color: r.pick(['#2f4a3e', '#3b3b3b', '#5a3b2a', '#26404a']),
        });
        s += gw + 0.4;
        continue;
      }
      slabs.push({ r: frontRect(f, s, s + w, baseSw, sw), kind: 'yard' });
      const floors = r.pick([1, 2, 2, 2, 3, 3, 3, 4]);
      const dx = (f.b.x - f.a.x) / len, dy = (f.b.y - f.a.y) / len;
      const off = sw;
      const a = { x: f.a.x + dx * s - f.normal.x * off, y: f.a.y + dy * s - f.normal.y * off };
      const b = { x: f.a.x + dx * (s + w) - f.normal.x * off, y: f.a.y + dy * (s + w) - f.normal.y * off };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const shop = SHOPS.find((sh) => Math.hypot(sh.x - mid.x, sh.y - mid.y) < w / 2 + 2 && Math.abs(Math.cos(sh.face) - f.normal.x) < 0.3 && Math.abs(Math.sin(sh.face) - f.normal.y) < 0.3);
      buildings.push({
        id: `b${fi}-${buildings.length}`, r: fp, front: [a, b], normal: f.normal,
        floors, height: floors * 3.15 + 0.6 + (floors === 1 ? 0.6 : 0), color: r.pick(PLASTER), trim: r.pick(TRIM), shutter: r.pick(SHUTTER),
        roof: floors <= 2 ? (r.chance(0.75) ? 'hip' : 'flat') : (r.chance(0.45) ? 'hip' : 'flat'),
        balcony: floors >= 2 && r.chance(0.6), style: r.int(0, 3), shop: shop?.text,
      });
      s += w + r.range(0, 0.4);
    }
  });

  // terraces / plazas for reserved areas
  for (const res of RESERVED) slabs.push({ r: res.r, kind: res.kind === 'gate' ? 'yard' : 'terrace' });

  // Café buildings behind terraces (hand placed)
  const cafeBuildings: Building[] = [
    { id: 'cafe-chinar', r: rect(50, -20, 92, -9.3), front: [{ x: 92, y: -9.3 }, { x: 50, y: -9.3 }], normal: { x: 0, y: 1 }, floors: 2, height: 7.2, color: '#efe3c8', trim: '#f6efe0', shutter: '#1f3b3a', roof: 'hip', balcony: true, style: 1, shop: 'КАФЕ ЧИНАР' },
    { id: 'cafe-lipa', r: rect(348, 269.2, 361, 281), front: [{ x: 348, y: 269.2 }, { x: 361, y: 269.2 }], normal: { x: 0, y: -1 }, floors: 3, height: 10.2, color: '#e3cfa6', trim: '#f4ecdc', shutter: '#3e5a4f', roof: 'flat', balcony: true, style: 2, shop: 'КАФЕ ЛИПА' },
    { id: 'shop-mila', r: rect(334, 269.2, 347, 281), front: [{ x: 334, y: 269.2 }, { x: 347, y: 269.2 }], normal: { x: 0, y: -1 }, floors: 2, height: 7.0, color: '#ecd9c6', trim: '#cbb894', shutter: '#6b4a32', roof: 'hip', balcony: false, style: 0, shop: 'БАКАЛНИЦА МИЛА' },
    { id: 'garden-house', r: rect(200, -46, 222, -36.5), front: [{ x: 222, y: -36.5 }, { x: 200, y: -36.5 }], normal: { x: 0, y: 1 }, floors: 2, height: 7.0, color: '#d9b98c', trim: '#f4ecdc', shutter: '#55605a', roof: 'hip', balcony: false, style: 0 },
    { id: 'gate-house-w', r: rect(362, 270, 372, 282), front: [{ x: 362, y: 270 }, { x: 372, y: 270 }], normal: { x: 0, y: -1 }, floors: 2, height: 6.8, color: '#cfd1bf', trim: '#efe7d6', shutter: '#2f4a5a', roof: 'hip', balcony: false, style: 2 },
    { id: 'gate-house-e', r: rect(379, 270, 389, 282), front: [{ x: 379, y: 270 }, { x: 389, y: 270 }], normal: { x: 0, y: -1 }, floors: 3, height: 10, color: '#e6c8b2', trim: '#f4ecdc', shutter: '#7a3b2e', roof: 'flat', balcony: true, style: 1 },
  ];
  buildings.push(...cafeBuildings);
  gates.push({ a: { x: 372.4, y: 270.2 }, b: { x: 378.6, y: 270.2 }, normal: { x: 0, y: -1 }, color: '#2f4a3e' });

  // Parked cars
  const parked: ParkedCar[] = [];
  const types: CarType[] = ['yugo', 'stojadin', 'stojadin', 'hatch', 'hatch', 'sedan', 'compact', 'compact', 'van'];
  PARKING.forEach((p) => {
    const r = rng(p.seed * 7919);
    const len = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
    const dx = (p.to.x - p.from.x) / len, dy = (p.to.y - p.from.y) / len;
    let s = r.range(0, 2);
    while (s < len) {
      const type = r.pick(types);
      const L = CAR_DIMS[type].L;
      if (s + L > len) break;
      if (r.chance(p.gapChance ?? 0)) { s += r.range(4, 7); continue; }
      const c = s + L / 2;
      parked.push({
        id: `pk-${p.seed}-${parked.length}`, pose: { x: p.from.x + dx * c, y: p.from.y + dy * c, h: p.h + r.range(-0.03, 0.03) },
        type, color: r.pick(CAR_COLORS), plate: plateFor(r), condition: r.next(),
      });
      s += L + r.range(0.7, 1.8);
    }
  });
  // Scenario 2 row on Tiha (fixed, evenly packed)
  {
    const r = rng(4242);
    let y = TIHA_NARROW.y0;
    const seq: CarType[] = ['hatch', 'stojadin', 'van', 'sedan', 'yugo', 'compact', 'stojadin', 'hatch', 'sedan', 'compact', 'yugo', 'hatch'];
    let i = 0;
    while (y < TIHA_NARROW.y1 - 3) {
      const type = seq[i++ % seq.length];
      const L = CAR_DIMS[type].L;
      if (y + L > TIHA_NARROW.y1) break;
      parked.push({ id: `tiha-${i}`, pose: { x: TIHA_NARROW.carX - (CAR_DIMS[type].W < 1.6 ? 0.05 : 0), y: y + L / 2, h: Math.PI / 2 + r.range(-0.02, 0.02) }, type, color: r.pick(CAR_COLORS), plate: plateFor(r), condition: r.next() });
      y += L + r.range(0.8, 1.3);
    }
  }

  const blockers = buildings.map((b) => b.r);
  cache = { buildings, slabs, gates, parked, blockers };
  return cache;
}

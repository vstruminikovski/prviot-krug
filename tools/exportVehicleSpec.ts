// Writes tools/blender/vehicles.json from the game's vehicle definitions (single source of truth).
import { writeFileSync } from 'node:fs';
import { VEHICLES } from '../src/game/vehicles/defs';

const PROFILE: Record<string, Record<string, number | string>> = {
  hatchback: { belt: 0.86, hood: 0.74, ws: 0.72, roofF: 0.06, roofR: -1.30, back: -1.70, tail: 0.90, kind: 'hatch' },
  saloon: { belt: 0.86, hood: 0.80, ws: 0.95, roofF: 0.30, roofR: -0.96, back: -1.48, tail: 0.92, kind: 'saloon' },
  estate: { belt: 0.86, hood: 0.80, ws: 0.98, roofF: 0.32, roofR: -2.06, back: -2.19, tail: 0.96, kind: 'hatch' },
  coupe: { belt: 0.80, hood: 0.72, ws: 0.74, roofF: -0.02, roofR: -0.90, back: -1.78, tail: 0.86, kind: 'fastback' },
  suv: { belt: 1.14, hood: 1.04, ws: 1.04, roofF: 0.42, roofR: -1.98, back: -2.10, tail: 1.16, kind: 'hatch', bottom: 0.42 },
  van: { belt: 0.96, hood: 0.92, ws: 1.30, roofF: 0.74, roofR: -2.15, back: -2.17, tail: 1.80, kind: 'van' },
  truck: { belt: 1.6, hood: 1.5, ws: 3.35, roofF: 3.2, roofR: 1.55, back: 1.5, tail: 2.6, kind: 'truck', bottom: 0.62 },
};

const out = VEHICLES.map((v) => ({ id: v.id, name: v.name, family: v.family, dims: v.dims, paint: v.paint, eye: v.eye, profile: PROFILE[v.family] }));
writeFileSync(new URL('./blender/vehicles.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('wrote', out.length, 'vehicles');

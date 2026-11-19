// Local persistence with a schema version. A corrupt or old save never blocks launching.
import type { Assist } from './vehicles/vehicle';
import type { PlateLayout } from './vehicles/defs';
import type { EnvId } from './env/types';
import type { Mode } from './missions/types';

const KEY = 'krug-niz-maaloto';
export const SCHEMA = 3;

export interface GarageChoice { vehicle: string; paint: string; finish: 'solid' | 'metallic'; trims: string[]; plate: string; layout: PlateLayout; interior: string; mirrorAdj: number; load: number }
export interface AttemptRecord { at: string; env: EnvId; mode: Mode; seed: number; vehicle: string; assist: Assist; score: number; passed: boolean | null; failed: string | null; skills: Record<string, number>; mission?: number; time?: string; weather?: string }

export interface Save {
  schema: number;
  settings: { assist: Assist; camera: 'chase' | 'driver'; muted: boolean; mirrors: 'high' | 'low'; legend: boolean; motion: boolean };
  garage: GarageChoice;
  favorites: GarageChoice[];
  history: AttemptRecord[];
  skills: Record<string, { attempts: number; good: number }>;
  seenIntro: boolean;
}

export const DEFAULT_GARAGE: GarageChoice = { vehicle: 'vardarka', paint: '#efe3c8', finish: 'solid', trims: [], plate: 'SK 1984-DM', layout: 'long', interior: 'petrol', mirrorAdj: 0, load: 0 };

export function defaultSave(): Save {
  return {
    schema: SCHEMA,
    settings: { assist: 'learn', camera: 'chase', muted: false, mirrors: 'high', legend: true, motion: true },
    garage: { ...DEFAULT_GARAGE }, favorites: [], history: [], skills: {}, seenIntro: false,
  };
}

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw) as Partial<Save>;
    if (s.schema !== SCHEMA) {
      // migrate what is safe to keep
      const d = defaultSave();
      if (s.garage && typeof s.garage.vehicle === 'string') d.garage = { ...d.garage, ...s.garage };
      return d;
    }
    const d = defaultSave();
    return { ...d, ...s, settings: { ...d.settings, ...s.settings }, garage: { ...d.garage, ...s.garage } } as Save;
  } catch {
    return defaultSave();
  }
}

export function save(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, history: s.history.slice(-60) })); } catch { /* storage unavailable */ }
}

/** Fictional registration validation: SK + 3–4 digits + 2 letters from the Latin set used on Macedonian plates. */
export function validPlate(t: string): boolean {
  return /^[A-Z]{2} \d{3,4}-[A-PR-VZ]{2}$/.test(t) && !/[QWXY]/.test(t);
}

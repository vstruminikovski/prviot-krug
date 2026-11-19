// Local persistence with a schema version. A corrupt or old save never blocks launching.
import type { Assist } from './vehicles/vehicle';
import type { PlateLayout } from './vehicles/defs';
import type { EnvId } from './env/types';
import type { Mode } from './missions/types';

const KEY = 'krug-niz-maaloto';
export const SCHEMA = 3;

export type Quality = 'low' | 'medium' | 'high';
export interface Settings {
  assist: Assist; camera: 'chase' | 'high' | 'driver'; muted: boolean; mirrors: 'high' | 'low'; legend: boolean;
  /** camera shake, speed FOV, tilt-shift */
  motion: boolean;
  quality: Quality; volume: number; hud: 'S' | 'M' | 'L'; steerSens: number;
  /** live key hints while driving (never in exams) */
  coach: boolean;
}
export const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export function defaultSettings(): Settings {
  return { assist: 'learn', camera: 'chase', muted: false, mirrors: coarse() ? 'low' : 'high', legend: true, motion: true, quality: coarse() ? 'low' : 'high', volume: 0.8, hud: 'M', steerSens: 1, coach: true };
}
export interface GarageChoice { vehicle: string; paint: string; finish: 'solid' | 'metallic'; trims: string[]; plate: string; layout: PlateLayout; interior: string; mirrorAdj: number; load: number }
export interface AttemptRecord { at: string; env: EnvId; mode: Mode; seed: number; vehicle: string; assist: Assist; score: number; passed: boolean | null; failed: string | null; skills: Record<string, number>; mission?: number; time?: string; weather?: string }

export interface Save {
  schema: number;
  settings: Settings;
  garage: GarageChoice;
  favorites: GarageChoice[];
  history: AttemptRecord[];
  skills: Record<string, { attempts: number; good: number }>;
  seenIntro: boolean;
  /** last menu choice — survives the garage, results and reloads */
  menu?: { env: EnvId; mode: Mode; time: 'golden' | 'noon' | 'dusk' | 'night'; weather: 'clear' | 'rain' | 'fog' };
}

export const DEFAULT_GARAGE: GarageChoice = { vehicle: 'vardarka', paint: '#efe3c8', finish: 'solid', trims: [], plate: 'SK 1984-DM', layout: 'long', interior: 'petrol', mirrorAdj: 0, load: 0 };

export function defaultSave(): Save {
  return {
    schema: SCHEMA,
    settings: defaultSettings(),
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

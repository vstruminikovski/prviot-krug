// Attempt factory, vehicle/mission compatibility and shareable challenge configuration.
import { Sim, CONTENT_VERSION, type AttemptConfig } from './sim/sim';
import { cityEnv } from './env/city';
import { polygonEnv } from './env/polygon';
import { openRoadEnv } from './env/openRoad';
import { CityMission } from './missions/city';
import { PolygonMission } from './missions/polygon';
import { OpenRoadMission } from './missions/openRoad';
import { vehicleById, VEHICLES } from './vehicles/defs';
import type { EnvId } from './env/types';
import type { Mode } from './missions/types';
import type { Assist } from './vehicles/vehicle';
import { rng } from './math';

export const ENV_INFO: Record<EnvId, { title: string; blurb: string }> = {
  polygon: { title: 'Полигон', blurb: 'Петте вежби од чл. 33 за категорија Б: лента, назад, полукружно, паркирање и угорнина. Плус слалом и бокс.' },
  city: { title: 'Градско возење', blurb: 'Маалото: раскрсници, еднонасочни, премини, семафор, доставувач во лента и живи пешаци.' },
  openRoad: { title: 'Отворен пат', blurb: 'Кривини, преслап, долга надолнина, трактор, одрон, работи на патот и видиковец.' },
};

/** Can this vehicle do this environment? Returns a reason when not. */
export function compatibility(vehicleId: string, env: EnvId): string | null {
  const v = vehicleById(vehicleId);
  if (v.family === 'truck' && env === 'city') return 'Улиците во маалото (5,6–7 m со паркирани возила) се претесни за камион од 7,2 m — изберете Отворен пат или Полигон.';
  return null;
}

export function createSim(config: AttemptConfig): Sim {
  const v = vehicleById(config.vehicle);
  if (config.env === 'polygon') return new Sim(config, polygonEnv(v.dims.L), new PolygonMission());
  if (config.env === 'openRoad') {
    const r = rng(config.seed ^ 0x51ed);
    return new Sim(config, openRoadEnv(2060 + r.range(0, 110)), new OpenRoadMission());
  }
  return new Sim(config, cityEnv(), new CityMission());
}

// ---------------------------------------------------------------- share links
const MODES: Mode[] = ['lesson', 'practice', 'challenge', 'exam', 'free'];
const ASSISTS: Assist[] = ['learn', 'manual', 'exam', 'auto'];
const ENVS: EnvId[] = ['polygon', 'city', 'openRoad']; // order is part of the share-code format

export function encodeChallenge(c: AttemptConfig, score?: number): string {
  const parts = [CONTENT_VERSION, ENVS.indexOf(c.env), MODES.indexOf(c.mode), c.seed >>> 0, VEHICLES.findIndex((v) => v.id === c.vehicle), ASSISTS.indexOf(c.assist), Math.round(c.load / 100), score ?? -1];
  return parts.join('.');
}

export interface DecodedChallenge { config: AttemptConfig; score: number | null; versionMismatch: boolean }

export function decodeChallenge(s: string | null): DecodedChallenge | null {
  if (!s || s.length > 60 || !/^[0-9.\-]+$/.test(s)) return null;
  const n = s.split('.').map(Number);
  if (n.length !== 8 || n.some((x) => !Number.isFinite(x))) return null;
  const [ver, e, m, seed, vi, ai, load, score] = n;
  if (!ENVS[e] || !MODES[m] || !VEHICLES[vi] || !ASSISTS[ai] || seed < 0 || seed > 0xffffffff || load < 0 || load > 40) return null;
  return {
    config: { v: CONTENT_VERSION, env: ENVS[e], mission: ENVS[e], mode: MODES[m], seed, vehicle: VEHICLES[vi].id, assist: ASSISTS[ai], load: load * 100 },
    score: score >= 0 && score <= 100 ? score : null,
    versionMismatch: ver !== CONTENT_VERSION,
  };
}

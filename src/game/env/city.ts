// Градско возење: the fictional Debar Maalo neighbourhood as an environment.
import { obbCorners } from '../math';
import { STREETS, SIGNS, START_POSE } from '../content/debarMaalo';
import { generate, CAR_DIMS } from '../content/generate';
import { rectPoly, type EnvData, type StaticObs } from './types';

let cache: EnvData | null = null;

export function cityEnv(): EnvData {
  if (cache) return cache;
  const g = generate();
  const obstacles: StaticObs[] = [];
  for (const p of g.parked) {
    const d = CAR_DIMS[p.type];
    obstacles.push({ id: p.id, kind: 'parked', quad: obbCorners(p.pose, d.L, d.W) });
  }
  for (const s of SIGNS) {
    if (s.code === 'plaque') continue;
    obstacles.push({ id: s.id, kind: 'pole', quad: obbCorners({ x: s.x, y: s.y, h: 0 }, 0.12, 0.12) });
  }
  cache = {
    id: 'city', title: 'Градско возење',
    drivable: STREETS.map((s) => rectPoly(s.rect.x0, s.rect.y0, s.rect.x1, s.rect.y1)),
    heightAt: () => 0,
    blockers: g.blockers,
    obstacles,
    start: START_POSE,
    defaultLimit: { kmh: 50, ruleId: 'law.speed.settlement' },
    speedZones: [],
  };
  return cache;
}

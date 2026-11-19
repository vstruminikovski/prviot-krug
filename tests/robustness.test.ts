// Crash-resistance: every environment survives long random driving (seeded), never produces
// non-finite state, and always yields a valid result. Plus a basic "it drives" check per env.
import { describe, it, expect } from 'vitest';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION } from '../src/game/sim/sim';
import type { EnvId } from '../src/game/env/types';
import type { Assist } from '../src/game/vehicles/vehicle';

const DT = 1 / 60;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ENVS: EnvId[] = ['polygon', 'city', 'openRoad', 'osm'];

function make(env: EnvId, seed: number, vehicle = 'vardarka', assist: Assist = 'auto') {
  return createSim({ v: CONTENT_VERSION, env, mission: env, mode: 'lesson', seed, vehicle, assist, load: 0 });
}

describe('robustness: random driving never breaks the simulation', () => {
  for (const env of ENVS) {
    for (const assist of ['auto', 'manual'] as Assist[]) {
      it(`${env} / ${assist}: 120 s of seeded random input`, () => {
        const sim = make(env, 11, env === 'city' ? 'vardarka' : 'pelister', assist);
        const r = rng(99);
        let ctl = { throttle: 0, brake: 0, steer: 0, clutch: 0, parkingBrake: false, horn: false };
        const gears = ['N', 1, 2, 3, 'R', 1, 2] as const;
        for (let i = 0; i < 120 * 60 && !sim.finished; i++) {
          if (i % 45 === 0) ctl = { throttle: r() < 0.7 ? r() : 0, brake: r() < 0.25 ? r() : 0, steer: r() * 2 - 1, clutch: r() < 0.3 ? 1 : 0, parkingBrake: r() < 0.03, horn: r() < 0.05 };
          if (i % 240 === 0) sim.player.requestGear(gears[Math.floor(r() * gears.length)]);
          if (i % 900 === 0 && sim.player.engine !== 'running') sim.player.requestEngine();
          sim.step(DT, ctl);
          const p = sim.player;
          expect([p.x, p.y, p.h, p.vx, p.vy, p.omegaE, p.z].every(Number.isFinite)).toBe(true);
        }
        if (!sim.finished) sim.finish();
        const res = sim.result();
        expect(Number.isFinite(res.gameScore)).toBe(true);
        expect(res.gameScore).toBeGreaterThanOrEqual(0);
        expect(res.gameScore).toBeLessThanOrEqual(100);
        for (const k of ['safety', 'technique', 'mission'] as const) expect(Number.isFinite(res.layers[k])).toBe(true);
        if (assist === 'auto') expect(res.incidents.filter((i) => i.text.startsWith('Изгасна'))).toHaveLength(0);
      });
    }
  }
});

describe('robustness: every environment actually drives', () => {
  for (const env of ENVS) {
    it(`${env}: the car moves off in first gear (automatic profile)`, () => {
      const sim = make(env, 5);
      const p = sim.player;
      const start = { x: p.x, y: p.y };
      for (let i = 0; i < 6 * 60; i++) sim.step(DT, { throttle: 0.45, brake: 0, steer: 0, clutch: 0, parkingBrake: false, horn: false });
      expect(Math.hypot(p.x - start.x, p.y - start.y), `${env} moved`).toBeGreaterThan(3);
      expect(p.engine).toBe('running');
    });
  }
  it('same seed → identical run (determinism for replays and challenges)', () => {
    const go = () => { const s = make('openRoad', 42); for (let i = 0; i < 20 * 60; i++) s.step(DT, { throttle: 0.5, brake: 0, steer: Math.sin(i / 90) * 0.3, clutch: 0, parkingBrake: false, horn: false }); return [s.player.x, s.player.y, s.player.h]; };
    expect(go()).toEqual(go());
  });
});

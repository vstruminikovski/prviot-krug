import { it, expect } from 'vitest';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION } from '../src/game/sim/sim';
it('stuck between cars → automatic rewind frees the player', () => {
  const sim = createSim({ v: CONTENT_VERSION, env: 'city', mission: 'city', mode: 'practice', seed: 7, vehicle: 'vardarka', assist: 'auto', load: 0 });
  const p = sim.player; p.parkingBrake = 0;
  const step = (n: number, c: Partial<{ throttle: number; brake: number; steer: number }>) => { for (let i = 0; i < n; i++) sim.step(1 / 60, { throttle: 0, brake: 0, steer: 0, clutch: 0, parkingBrake: false, horn: false, ...c }); };
  step(60 * 2, { throttle: 0.5 }); step(60 * 18, { brake: 1 }); // build some safe history
  const npc = sim.cars.find((c) => c.id === 'x1-car')!; const q = npc.pose;
  p.x = q.x - Math.cos(q.h) * 2.0; p.y = q.y - Math.sin(q.h) * 2.0; p.h = q.h; p.vx = 0;
  sim.contacts.push({ t: sim.t, kind: 'vehicle', id: 'x1-car', speed: 3 });
  const x0 = p.x, y0 = p.y;
  step(60 * 4, { throttle: 1 });
  expect(Math.hypot(p.x - x0, p.y - y0)).toBeGreaterThan(1);
});

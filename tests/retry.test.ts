// "Повтори сцена" relies on determinism: same config + the same recorded inputs = the same world.
import { describe, it, expect } from 'vitest';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION, type Sim } from '../src/game/sim/sim';
import { Autopilot } from '../src/game/sim/autopilot';
import type { Controls } from '../src/game/vehicles/vehicle';

const DT = 1 / 60;
const cfg = { v: CONTENT_VERSION, env: 'city' as const, mission: 'city' as const, mode: 'lesson' as const, seed: 11, vehicle: 'vardarka', assist: 'auto' as const, load: 0 };
const snap = (s: Sim) => JSON.stringify({ p: [s.player.x, s.player.y, s.player.h, s.player.vx, s.player.gear], cars: s.cars.filter((c) => !c.done).map((c) => [c.id, c.pose.x, c.pose.y, c.v]), peds: s.peds.map((d) => [d.id, d.pos.x, d.pos.y]), t: s.t, inc: s.ledger.incidents.map((i) => i.key) });

describe('scene retry', () => {
  it('rebuilding from the same config and inputs restores the exact world at the mark (traffic, hazard, ledger)', () => {
    const a = createSim(cfg); a.player.parkingBrake = 0;
    const ap = new Autopilot({ mode: 'reckless' }, a.player.pose);
    const rec: Controls[] = []; let mark = -1;
    for (let i = 0; i < 60 * 70 && !a.finished; i++) {
      const c = { ...ap.input(a), parkingBrake: false }; rec.push(c); a.step(DT, c);
      for (const e of a.drainEvents()) if (e.type === 'sceneStart' && e.id === 's1' && mark < 0) mark = Math.max(0, Math.round((e.t - e.leadS) * 60));
    }
    expect(mark).toBeGreaterThan(0);
    const b = createSim(cfg); b.player.parkingBrake = 0;
    for (let i = 0; i < mark; i++) b.step(DT, rec[i]);
    const c = createSim(cfg); c.player.parkingBrake = 0;
    for (let i = 0; i < mark; i++) c.step(DT, rec[i]);
    expect(snap(b)).toBe(snap(c)); // twice → identical
    // and the situation is still ahead: s1 not armed, its car not spawned yet
    const s1 = (b.mission as unknown as { scenarios: { id: string; armed: boolean }[] }).scenarios.find((s) => s.id === 's1')!;
    expect(s1.armed).toBe(false);
  });
});

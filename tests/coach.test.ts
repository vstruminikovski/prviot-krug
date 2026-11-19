// A scripted "student" that only does what the live coach says must be able to drive off,
// change up, and stop without stalling — proof that the hints are complete and correct.
// Plus the automatic profile: no handbrake fuss, creep, gentle coasting.
import { describe, it, expect } from 'vitest';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION } from '../src/game/sim/sim';
import { coachTip } from '../src/game/coach';
import type { Assist } from '../src/game/vehicles/vehicle';

const DT = 1 / 60;
const make = (assist: Assist) => createSim({ v: CONTENT_VERSION, env: 'polygon', mission: 'polygon', mode: 'practice', seed: 3, vehicle: 'vardarka', assist, load: 0 });

describe('coach: following only the hints', () => {
  for (const assist of ['manual', 'learn'] as Assist[]) {
    it(`${assist}: a student who obeys the coach drives off and changes up`, () => {
      const sim = make(assist); const p = sim.player;
      let clutch = 0, throttle = 0, pb = true; let maxGear = 0, maxV = 0; const seen = new Set<string>();
      for (let i = 0; i < 25 * 60; i++) {
        const t = coachTip(p, false);
        if (t) seen.add(t.id);
        const k = t?.keys ?? [];
        if (k.includes('Space')) clutch = Math.min(1, clutch + DT * 6);
        if (k.includes('Z')) clutch = Math.min(1, clutch + DT * 0.7);
        if (k.includes('Space ↑') || (!t && clutch > 0)) clutch = Math.max(0, clutch - DT * (clutch > 0.7 ? 1.2 : 0.45));
        if (k.includes('R') && i % 60 === 0) p.requestEngine();
        if (k.includes('N')) p.requestGear('N');
        const g = k.find((x) => /^[1-5]$/.test(x)); if (g) p.requestGear(Number(g) as 1);
        if (k.includes('P')) pb = false;
        throttle = t?.id === 'm-bog' ? 0.6 : k.includes('W') || (!t && p.gear !== 'N' && p.vx > 0.5) ? 0.35 : 0;
        sim.step(DT, { throttle, brake: 0, steer: 0, clutch, parkingBrake: pb, horn: false });
        if (typeof p.gear === 'number') maxGear = Math.max(maxGear, p.gear);
        maxV = Math.max(maxV, p.vx * 3.6);
        if (Math.abs(p.x) > 1e5) break;
      }
      expect(maxGear, [...seen].join(',')).toBeGreaterThanOrEqual(2);
      expect(maxV).toBeGreaterThan(25);
      // stalls before the first contact are coaching failures; after hitting the fence they are not
      const firstHit = sim.contacts.length ? sim.contacts[0].t : Infinity;
      const stalls = sim.ledger.incidents.filter((i) => i.text.startsWith('Изгасна') && i.t < firstHit);
      expect(stalls.map((i) => i.t.toFixed(1)), `stalls before contact (first contact ${firstHit})`).toEqual([]);
    });
  }
  it('stopping: the coach asks for the clutch before the engine stalls', () => {
    const sim = make('manual'); const p = sim.player;
    p.parkingBrake = 0; (p as unknown as { engine: string }).engine = 'running';
    // drive at a steady pace in 2nd, then brake to a stop following the coach's clutch hint
    (p as unknown as { gear: number }).gear = 2; p.vx = 6; // already rolling in 2nd, clutch out
    let clutch = 0; let asked = false;
    for (let i = 0; i < 8 * 60; i++) {
      const t = coachTip(p, false);
      if (t?.id === 'm-stop') { asked = true; }
      if (asked) clutch = 1;
      sim.step(DT, { throttle: 0, brake: 0.6, steer: 0, clutch, parkingBrake: false, horn: false });
    }
    expect(asked).toBe(true);
    expect(p.engine).toBe('running');
  });
});

describe('automatic profile is easy', () => {
  it('pulls away, creeps without pedals, coasts gently, never stalls', () => {
    const sim = make('auto'); const p = sim.player;
    const run = (s: number, c: { throttle?: number; brake?: number }) => { for (let i = 0; i < s * 60; i++) sim.step(DT, { throttle: 0, brake: 0, steer: 0, clutch: 0, parkingBrake: false, horn: false, ...c }); };
    run(6, { throttle: 0.4 }); const v1 = p.vx * 3.6;
    run(4, {}); const v2 = p.vx * 3.6;
    run(3, { brake: 1 }); const v3 = p.vx;
    run(5, {}); const creep = p.vx * 3.6;
    expect(v1).toBeGreaterThan(18);
    expect(v1 - v2).toBeLessThan(6); // gentle coast
    expect(Math.abs(v3)).toBeLessThan(0.05);
    expect(creep).toBeGreaterThan(3); expect(creep).toBeLessThan(10);
    expect(p.engine).toBe('running');
  });
});

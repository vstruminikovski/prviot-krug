// Regressions from a hands-on play-test: things a player notices immediately.
import { describe, it, expect } from 'vitest';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION } from '../src/game/sim/sim';
import { Autopilot } from '../src/game/sim/autopilot';
import { Vehicle, type VehicleWorld } from '../src/game/vehicles/vehicle';
import { vehicleById, VEHICLES } from '../src/game/vehicles/defs';
import { classify } from '../src/game/rules/matrix';
import type { PolygonMission } from '../src/game/missions/polygon';
import { EX_LANE } from '../src/game/env/polygon';

const DT = 1 / 60;
const flat: VehicleWorld = { isDrivable: () => true, hitStatic: () => null, heightAt: () => 0, gripAt: () => 1 };

describe('play-test regressions', () => {
  it('a law-abiding driver passes the signalised crossing without a red or yellow incident (several seeds)', () => {
    for (const seed of [3, 7, 11, 21, 42]) {
      const sim = createSim({ v: CONTENT_VERSION, env: 'city', mission: 'city', mode: 'exam', seed, vehicle: 'vardarka', assist: 'auto', load: 0 });
      sim.player.parkingBrake = 0;
      const ap = new Autopilot({ mode: 'lawful', signal: true }, sim.player.pose);
      while (!sim.finished && sim.t < 120 && sim.player.x < 400) sim.step(DT, { ...ap.input(sim), parkingBrake: false });
      const sig = sim.ledger.incidents.filter((i) => i.ruleIds.includes('law.signal.lights')).map((i) => i.text);
      expect(sig, `seed ${seed}`).toEqual([]);
    }
  });
  it('"Со помош": braking to a stop without the clutch does not stall the engine', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'learn', { parkingBrake: false });
    v.place({ x: 0, y: 0, h: 0 }, 8.3, 2); v.parkingBrake = 0;
    for (let i = 0; i < 240; i++) v.step(DT, { throttle: 0, brake: 1, steer: 0, clutch: 0, parkingBrake: false }, flat, [], i * DT, () => {});
    expect(v.vx).toBeLessThan(0.05);
    expect(v.engine).toBe('running');
  });
  it('a normal keyboard launch (W held, Space released — the game eases the clutch through the bite) neither stalls nor counts as wheelspin, for every car', () => {
    for (const d of VEHICLES) {
      const v = new Vehicle(d, { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false, gear: 1 });
      v.parkingBrake = 0; const events: string[] = []; let clutch = 1;
      for (let i = 0; i < 240; i++) {
        // input.ts easing after Space is released: 3.2/s outside the bite, 0.35/s inside it (manual)
        const inBite = clutch <= d.clutch.biteHigh + 0.02 && clutch >= d.clutch.biteLow - 0.02;
        clutch = Math.max(0, clutch - DT * (inBite ? 0.35 : 3.2));
        v.step(DT, { throttle: Math.min(1, i / 36), brake: 0, steer: 0, clutch, parkingBrake: false }, flat, [], i * DT, () => {});
        events.push(...v.drainEvents().map((e) => e.type));
      }
      const why = `${d.id}: ${v.engine} gear ${v.gear} rpm ${v.rpm.toFixed(0)} events ${events.join(',')}`;
      expect(events, why).not.toContain('wheelspin');
      expect(events, why).not.toContain('stall');
      expect(v.vx, why).toBeGreaterThan(3);
    }
  });
  it('Часови: "Повтори ја вежбата" repeats the exercise that was failed, even when the drive already moved on', () => {
    const sim = createSim({ v: CONTENT_VERSION, env: 'polygon', mission: 'polygon', mode: 'lesson', seed: 7, vehicle: 'vardarka', assist: 'auto', load: 0 });
    const m = sim.mission as unknown as PolygonMission & { ex: { id: string; status: string; start: { x: number; y: number } }[]; cur: number };
    const offers: unknown[] = []; const emit = sim.emit.bind(sim); sim.emit = (e) => { if (e.type === 'retryOffer') offers.push(e); emit(e); };
    // first exercise: run past the STOP line and stop there → fails and the drive moves on to exercise 2
    m.ex[0].status = 'running';
    sim.player.place({ x: EX_LANE.x1 + 1.5, y: EX_LANE.y, h: 0 }, 0, 'N');
    for (let i = 0; i < 120; i++) sim.step(DT, { throttle: 0, brake: 1, steer: 0, clutch: 0, parkingBrake: false });
    expect(offers.length).toBeGreaterThan(0);
    expect(m.ex[0].status).toBe('fail');
    expect(m.cur).toBe(1);
    m.retry(sim);
    expect(m.cur).toBe(0);
    expect(m.ex[0].status).toBe('ready');
    expect(m.ex[1].status).toBe('pending');
    expect(Math.hypot(sim.player.x - m.ex[0].start.x, sim.player.y - m.ex[0].start.y)).toBeLessThan(0.5);
    expect(sim.finished).toBe(false);
  });
  it('city junction without signs: the guidance warns to give way in time and never points through the junction', () => {
    for (const mode of ['lesson', 'exam'] as const) {
      const sim = createSim({ v: CONTENT_VERSION, env: 'city', mission: 'city', mode, seed: 7, vehicle: 'vardarka', assist: 'auto', load: 0 });
      sim.player.parkingBrake = 0;
      const ap = new Autopilot({ mode: 'lawful', signal: true }, sim.player.pose);
      const seen: { text: string; kind?: string; at?: { x: number } }[] = [];
      while (!sim.finished && sim.t < 90 && sim.player.x < 260) {
        sim.step(DT, { ...ap.input(sim), parkingBrake: false });
        const t = sim.mission.task(sim);
        if (t && sim.player.x > 180 && sim.player.x < 237) seen.push({ text: t.text, kind: t.nav?.kind, at: t.nav?.at });
      }
      expect(seen.length).toBeGreaterThan(0);
      if (mode === 'lesson') {
        // before the junction: a give-way line in front of it, never a gate beyond it
        expect(seen.some((x) => x.kind === 'yield')).toBe(true);
        const firstYield = seen.findIndex((x) => x.kind === 'yield');
        expect(seen.slice(firstYield).filter((x) => x.kind !== 'yield' && x.at && x.at.x > 237 && /право/.test(x.text)).length, 'pointed through while the car had priority').toBeLessThan(seen.length - firstYield);
        for (const x of seen.filter((v) => v.kind === 'yield')) expect(x.at!.x).toBeLessThan(237);
      } else {
        // exam: the sign is named, nobody is told whom to let through
        expect(seen.some((x) => /иста важност/.test(x.text))).toBe(true);
        expect(seen.some((x) => /десно|предност/.test(x.text))).toBe(false);
      }
      const s1 = (sim.mission as unknown as { scenarios: { id: string; res: { outcome: string } }[] }).scenarios.find((x) => x.id === 's1')!;
      expect(s1.res.outcome, mode).toBe('pass');
    }
  });
  it('every give-way situation in the city (right-of-way, narrow street, zebra) is announced with a stop line, and a lawful driver passes all three', () => {
    const sim = createSim({ v: CONTENT_VERSION, env: 'city', mission: 'city', mode: 'lesson', seed: 7, vehicle: 'vardarka', assist: 'auto', load: 0 });
    sim.player.parkingBrake = 0;
    const ap = new Autopilot({ mode: 'lawful', signal: true }, sim.player.pose);
    const texts = new Set<string>();
    while (!sim.finished && sim.t < 300) {
      sim.step(DT, { ...ap.input(sim), parkingBrake: false });
      const t = sim.mission.task(sim);
      if (t?.nav?.kind === 'yield') texts.add(t.text);
    }
    const all = [...texts].join(' | ');
    expect(all).toMatch(/десно/); expect(all).toMatch(/спротивно|чекаш/); expect(all).toMatch(/зебра|премин/);
    const sc = (sim.mission as unknown as { scenarios: { id: string; res: { outcome: string } }[] }).scenarios;
    for (const id of ['s1', 's2', 's3']) expect(sc.find((x) => x.id === id)!.res.outcome, id).toBe('pass');
  });
  it('crossing the STOP line is explained as crossing the STOP line, not as leaving the lane', () => {
    const c = classify('lane-exam1.1E-stopover-0', ['exam1.1E'], 'lesson', 'polygon');
    expect(c?.m.id).toBe('poly.stopover');
    expect(c?.m.say).toContain('СТОП');
  });
});

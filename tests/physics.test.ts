// Focused checks for the driving-model audit (SI units throughout): frame-rate independence,
// mass, grade, grip (braking / traction / cornering share one budget), braking distance,
// low-speed turning circle, and contact classification for lessons vs exams.
import { describe, it, expect } from 'vitest';
import { Vehicle, type VehicleWorld, type Controls, type DynamicBody } from '../src/game/vehicles/vehicle';
import { vehicleById, type VehicleDef } from '../src/game/vehicles/defs';
import { PHYSICS, DETECT } from '../src/game/sim/params';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION, type Sim } from '../src/game/sim/sim';
import type { Mode } from '../src/game/missions/types';

const DT = 1 / 60, G = PHYSICS.gravityMps2;
const world = (o: { grade?: number; grip?: number } = {}): VehicleWorld => ({
  isDrivable: () => true, hitStatic: () => null,
  heightAt: (x: number) => x * Math.tan(o.grade ?? 0), gripAt: () => o.grip ?? 1,
});
const ctl = (c: Partial<Controls> = {}): Controls => ({ throttle: 0, brake: 0, steer: 0, clutch: 0, parkingBrake: false, ...c });
const car = (def: VehicleDef = vehicleById('vardarka'), o: { load?: number; gear?: 1 | 2 | 'N'; v?: number; auto?: boolean } = {}) => {
  const v = new Vehicle(def, { x: 0, y: 0, h: 0 }, o.auto ? 'auto' : 'manual', { parkingBrake: false, gear: o.gear ?? 'N', load: o.load ?? 0 });
  if (o.v) v.place({ x: 0, y: 0, h: 0 }, o.v, o.gear ?? 'N');
  v.parkingBrake = 0;
  return v;
};
const run = (v: Vehicle, w: VehicleWorld, c: Controls, secs: number, bodies: DynamicBody[] = []) => { for (let i = 0; i < Math.round(secs / DT); i++) v.step(DT, c, w, bodies, i * DT, () => {}); };

describe('frame-rate independence', () => {
  it('same controls → same state whether rendered at 30, 60 or 144 fps (fixed 60 Hz sim + accumulator)', () => {
    const at = (fps: number) => {
      const v = car(undefined, { gear: 1 }); const w = world(); let acc = 0, steps = 0;
      while (steps < 300) { acc += 1 / fps; while (acc >= DT && steps < 300) { v.step(DT, ctl({ throttle: 0.6, steer: 0.3 }), w, [], steps * DT, () => {}); acc -= DT; steps++; } }
      return [v.x, v.y, v.h, v.vx];
    };
    expect(at(30)).toEqual(at(60)); expect(at(144)).toEqual(at(60));
  });
});

describe('longitudinal force balance', () => {
  it('more mass → less acceleration under the same drive', () => {
    const a = car(undefined, { auto: true }), b = car(undefined, { auto: true, load: 600 });
    run(a, world(), ctl({ throttle: 1 }), 2); run(b, world(), ctl({ throttle: 1 }), 2);
    expect(a.vx).toBeGreaterThan(3);
    expect(b.vx).toBeLessThan(a.vx);
  });
  it('a hill: neutral rolls back at ≈ g·sin(θ) − rolling; the parking brake holds within its grip', () => {
    const th = Math.atan(0.08), d = vehicleById('vardarka');
    const v = car(); run(v, world({ grade: th }), ctl({ clutch: 1 }), 2);
    const expected = -(G * Math.sin(th) - d.aero.rolling * G * Math.cos(th)) * 2; // v after 2 s, aero negligible
    expect(v.vx).toBeLessThan(0);
    expect(v.vx).toBeCloseTo(expected, 0);
    const held = car(); held.parkingBrake = 1; run(held, world({ grade: th }), ctl({ clutch: 1, parkingBrake: true }), 2);
    expect(Math.abs(held.vx)).toBeLessThan(0.05);
  });
  it('braking distance follows d = v²/(2a) (plus brake lag) — 13.89 m/s at 7.5 m/s² ≈ 12.9 m', () => {
    const def = { ...vehicleById('vardarka'), brakes: { ...vehicleById('vardarka').brakes, decel: 7.5 } };
    const v = car(def, { v: 13.89 }); let x = 0;
    for (let i = 0; i < 600 && v.vx > 0.01; i++) { v.step(DT, ctl({ brake: 1, clutch: 1 }), world(), [], i * DT, () => {}); x = v.x; }
    const ideal = 13.89 ** 2 / (2 * 7.5); // 12.86 m
    expect(ideal).toBeCloseTo(12.86, 1);
    expect(x).toBeGreaterThan(ideal); // never better than the ideal
    expect(x).toBeLessThan(ideal + 13.89 * def.brakes.lag + 0.6); // lag adds ≈ v·τ
  });
  it('wet grip lengthens the stop: deceleration capped at μ·g·grip', () => {
    const stop = (grip: number) => { const v = car(undefined, { v: 13.89 }); let i = 0; for (; i < 900 && v.vx > 0.01; i++) v.step(DT, ctl({ brake: 1, clutch: 1 }), world({ grip }), [], i * DT, () => {}); return v.x; };
    const dry = stop(1), wet = stop(0.5);
    expect(wet).toBeGreaterThan(dry);
    const d = vehicleById('vardarka'), tyres = d.tyre.mu * 0.5 * G, rolling = d.aero.rolling * G; // aero adds a little more
    expect(wet).toBeLessThanOrEqual(13.89 ** 2 / (2 * (tyres + rolling)) + 0.3);
    expect(wet).toBeGreaterThan(13.89 ** 2 / (2 * (tyres + rolling + 0.3)));
  });
  it('parking + service brake together never exceed tyre grip', () => {
    const v = car(undefined, { v: 10 }); v.parkingBrake = 1;
    const v0 = v.vx; run(v, world({ grip: 0.2 }), ctl({ brake: 1, clutch: 1, parkingBrake: true }), 0.5);
    const d = vehicleById('vardarka'), decel = (v0 - v.vx) / 0.5;
    const cap = d.tyre.mu * 0.2 * G + d.aero.rolling * G + (0.5 * PHYSICS.airDensityKgM3 * d.aero.cdA * 100) / d.mass; // tyres + rolling + aero
    expect(decel).toBeLessThanOrEqual(cap * 1.02);
  });
  it('traction is grip-limited at any speed (it used to stop applying above 12 m/s)', () => {
    const v = car(undefined, { v: 15, gear: 2 }); const v0 = v.vx;
    run(v, world({ grip: 0.15 }), ctl({ throttle: 1 }), 0.5);
    const a = (v.vx - v0) / 0.5, d = vehicleById('vardarka');
    expect(a).toBeLessThanOrEqual(d.tyre.mu * 0.15 * G * d.frontWeight * 1.1);
  });
});

describe('steering and lateral grip', () => {
  // path radius from three positions (circumradius) → true lateral acceleration v²/R; speed is not forced
  const circle = (speed: number, grip = 1) => {
    const v = car(undefined, { v: speed, gear: 'N' }); const w = world({ grip });
    const pts: { x: number; y: number; v: number }[] = [];
    for (let i = 0; i < 90; i++) { v.step(DT, ctl({ steer: 1, clutch: 1 }), w, [], i * DT, () => {}); if (i === 60 || i === 75 || i === 89) pts.push({ x: v.x, y: v.y, v: Math.hypot(v.vx, v.vy) }); }
    const [a, b, c] = pts; const ab = Math.hypot(a.x - b.x, a.y - b.y), bc = Math.hypot(b.x - c.x, b.y - c.y), ca = Math.hypot(c.x - a.x, c.y - a.y);
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    const R = (ab * bc * ca) / (4 * area);
    return { R, lat: (b.v * b.v) / R, steer: v.steer };
  };
  it('walking pace: turning radius = wheelbase / tan(steer)', () => {
    const c = circle(2), d = vehicleById('vardarka'), wb = d.dims.wheelbase;
    const rear = wb / Math.tan(c.steer), b = wb * d.frontWeight; // centre of mass to rear axle (model geometry)
    expect(c.R).toBeCloseTo(Math.hypot(rear, b), 1); // the centre's path around the rear-axle turning centre
  });
  it('the radius grows with speed (grip and speed-reduced lock)', () => { expect(circle(15).R).toBeGreaterThan(circle(5).R); });
  it('lateral acceleration is capped by grip, and lower on a wet road', () => {
    const dry = circle(18, 1), wet = circle(18, 0.5), mu = vehicleById('vardarka').tyre.mu;
    expect(dry.lat).toBeLessThanOrEqual(mu * G * 1.05);
    expect(wet.lat).toBeLessThan(dry.lat);
    expect(wet.lat).toBeLessThanOrEqual(mu * 0.5 * G * 1.05);
  });
});

describe('contacts: closing speed and classification', () => {
  const moving = (speed: number): DynamicBody => ({ id: 'npc', kind: 'vehicle', quad: () => [{ x: 1, y: -1 }, { x: 3, y: -1 }, { x: 3, y: 1 }, { x: 1, y: 1 }], velocity: () => ({ x: -speed, y: 0 }) });
  it('an NPC driving into a stopped player is reported with its closing speed', () => {
    const v = car(); let got = -1;
    v.step(DT, ctl(), world(), [moving(4)], 0, (c) => { got = c.speed; });
    expect(got).toBeCloseTo(4, 1);
  });
  const make = (mode: Mode) => createSim({ v: CONTENT_VERSION, env: 'city', mission: 'city', mode, seed: 7, vehicle: 'vardarka', assist: 'manual', load: 0 });
  const hit = (sim: Sim, speed: number) => (sim as unknown as { onContact: (c: unknown) => void }).onContact({ t: sim.t, kind: 'vehicle', id: 'npc', speed });
  it('a light touch is not the 51-point collision item (exam total stays 0, drive continues)', () => {
    const sim = make('exam'); hit(sim, DETECT.collisionRelativeSpeedMps * 0.5);
    expect(sim.ledger.incidents.at(-1)?.cls?.mistake).toBe('touch.vehicle');
    expect(sim.ledger.examTotal()).toBe(0); expect(sim.finished).toBe(false);
  });
  it('a severe collision follows the configured treatment: 1-Х (51) and, as configured, the drive ends', () => {
    const sim = make('exam'); hit(sim, DETECT.collisionRelativeSpeedMps * 2);
    expect(sim.ledger.examTotal('Образец бр. 4')).toBe(51);
    expect(sim.finished).toBe(DETECT.examStopsImmediatelyOnCriticalItem);
    expect(sim.result().exam?.passed).toBe(false);
  });
  it('the same light touch: lesson warns and continues; exam records it without points', () => {
    const l = make('lesson'); hit(l, 0.8); const e = make('exam'); hit(e, 0.8);
    expect(l.ledger.incidents.at(-1)?.cls?.action).toBe('warn');
    expect(e.ledger.incidents.at(-1)?.cls?.action).toBe('gameOnly');
  });
  it('official totals include only emitted official items, at their sheet points', () => {
    const sim = make('exam');
    sim.incident('corner-a', { layer: 'safety', severity: 'significant', ruleIds: ['law.signalling'], text: 'x', exam: ['exam4.2K'] }); // 20
    sim.incident('speed', { layer: 'safety', severity: 'significant', ruleIds: ['law.speed.settlement'], text: 'x', exam: ['exam4.2R'] }); // 30
    hit(sim, 0.8); // game-only
    sim.incident('neutral-descent', { layer: 'technique', severity: 'note', ruleIds: ['tech.neutral.descent'], text: 'x' }); // not in matrix → no exam
    expect(sim.ledger.examTotal('Образец бр. 4')).toBe(50);
    expect(sim.result().exam?.passed).toBe(true); // 50 is not "more than 50"
  });
});

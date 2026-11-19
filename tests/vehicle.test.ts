import { describe, it, expect } from 'vitest';
import { Vehicle, type Controls, type VehicleWorld } from '../src/game/vehicles/vehicle';
import { vehicleById, turningCircle } from '../src/game/vehicles/defs';

const flat: VehicleWorld = { isDrivable: () => true, hitStatic: () => null, heightAt: () => 0 };
/** constant slope rising toward +x (grade as fraction, e.g. 0.12 = 12 %) */
const slope = (g: number): VehicleWorld => ({ ...flat, heightAt: (x) => x * g });
const DT = 1 / 60;
const C = (o: Partial<Controls> = {}): Controls => ({ throttle: 0, brake: 0, steer: 0, clutch: 0, parkingBrake: false, ...o });

function run(v: Vehicle, secs: number, ctl: (t: number) => Controls, world = flat) {
  let t = 0;
  while (t < secs) { v.step(DT, ctl(t), world, [], t, () => {}); t += DT; }
  return v;
}
const types = (v: Vehicle) => v.drainEvents().map((e) => e.type);

describe('engine, clutch and gearbox', () => {
  it('neutral: throttle revs the engine but does not move the car', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    run(v, 2, () => C({ throttle: 0.6 }));
    expect(v.rpm).toBeGreaterThan(2500);
    expect(Math.abs(v.vx)).toBeLessThan(0.01);
  });

  it('a gentle clutch release with a little throttle launches without stalling', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    run(v, 0.3, () => C({ clutch: 1 }));
    expect(v.requestGear(1)).toBeNull();
    run(v, 3, (t) => C({ throttle: 0.25, clutch: Math.max(0, 1 - t / 1.6) }));
    expect(v.engine).toBe('running');
    expect(v.vx * 3.6).toBeGreaterThan(8);
    expect(types(v)).not.toContain('stall');
  });

  it('dumping the clutch at idle in first gear stalls the engine', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    run(v, 0.2, () => C({ clutch: 1 }));
    v.requestGear(1);
    run(v, 1.5, () => C({ clutch: 0 }));
    expect(v.engine).toBe('stalled');
    const ev = types(v);
    expect(ev).toContain('stall');
    expect(ev).toContain('jerk');
  });

  it('shifting without the clutch is refused; with the clutch it works', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    expect(v.requestGear(1)).toMatch(/кумплунг/);
    expect(v.gear).toBe('N');
    v.clutchPedal = 1;
    expect(v.requestGear(1)).toBeNull();
    expect(v.gear).toBe(1);
  });

  it('reverse is refused while rolling forward', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    v.place({ x: 0, y: 0, h: 0 }, 6, 3);
    v.clutchPedal = 1;
    expect(v.requestGear('R')).toMatch(/Запри/);
    expect(v.gear).toBe(3);
  });

  it('impossible downshift is refused (over-rev)', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    v.place({ x: 0, y: 0, h: 0 }, 22, 4);
    v.clutchPedal = 1;
    expect(v.requestGear(1)).toMatch(/Пребрзо/);
  });

  it('braking to a stop in gear without the clutch stalls; with the clutch pressed it does not', () => {
    const a = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    a.place({ x: 0, y: 0, h: 0 }, 8, 2);
    run(a, 4, () => C({ brake: 0.7 }));
    expect(a.engine).toBe('stalled');
    const b = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    b.place({ x: 0, y: 0, h: 0 }, 8, 2);
    run(b, 4, (t) => C({ brake: 0.7, clutch: t > 0.8 ? 1 : 0 }));
    expect(b.engine).toBe('running');
    expect(Math.abs(b.vx)).toBeLessThan(0.05);
  });

  it('starting the engine in gear without the clutch lurches and does not start', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { engineRunning: false, parkingBrake: false });
    v.clutchPedal = 1; v.requestGear(1); v.clutchPedal = 0;
    expect(v.requestEngine()).toMatch(/брзина/);
    expect(v.engine).toBe('off');
    v.clutchPedal = 1;
    v.requestEngine();
    run(v, 1.2, () => C({ clutch: 1 }));
    expect(v.engine).toBe('running');
  });
});

describe('slopes, parking brake and engine braking', () => {
  it('rolls back on a 12 % hill when nothing holds it, and the service brake holds it', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    run(v, 2, () => C({ clutch: 1 }), slope(0.12));
    expect(v.vx).toBeLessThan(-1);
    const w = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual', { parkingBrake: false });
    run(w, 2, () => C({ clutch: 1, brake: 0.6 }), slope(0.12));
    expect(Math.abs(w.vx)).toBeLessThan(0.02);
  });

  it('hill start with the parking brake: hold, find the bite, release — no rollback', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0 }, 'manual');
    run(v, 0.2, () => C({ clutch: 1, parkingBrake: true }), slope(0.1));
    v.requestGear(1);
    run(v, 2.5, (t) => C({ clutch: t < 1.2 ? 1 - t * 0.35 : Math.max(0, 0.58 - (t - 1.2) * 0.3), throttle: 0.4, parkingBrake: t < 1.4 }), slope(0.1));
    expect(v.engine).toBe('running');
    expect(v.vx).toBeGreaterThan(0.5);
    expect(types(v)).not.toContain('rollback');
  });

  it('connected driveline brakes harder downhill than neutral', () => {
    const inGear = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: Math.PI }, 'manual', { parkingBrake: false });
    inGear.place({ x: 0, y: 0, h: Math.PI }, 11, 3);
    run(inGear, 8, () => C(), slope(0.08)); // heading west = downhill
    const neutral = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: Math.PI }, 'manual', { parkingBrake: false });
    neutral.place({ x: 0, y: 0, h: Math.PI }, 11, 'N');
    run(neutral, 8, () => C(), slope(0.08));
    expect(neutral.vx).toBeGreaterThan(inGear.vx + 3);
  });
});

describe('chassis', () => {
  it('a stopped car does not rotate when the wheel is turned', () => {
    const v = new Vehicle(vehicleById('vardarka'), { x: 0, y: 0, h: 0.3 }, 'manual');
    run(v, 2, () => C({ steer: 1, clutch: 1 }));
    expect(v.h).toBeCloseTo(0.3, 5);
    expect(Math.abs(v.steer)).toBeGreaterThan(0.4);
  });

  it('turning circles follow the vehicle geometry (truck ≫ hatchback)', () => {
    const tc = (id: string) => {
      const v = new Vehicle(vehicleById(id), { x: 0, y: 0, h: 0 }, 'auto', { parkingBrake: false });
      v.requestGear(1);
      let minX = 0, maxX = 0;
      run(v, 30, () => {
        const c = C({ steer: 1, throttle: v.vx < 1.5 ? 0.3 : 0, brake: v.vx > 2 ? 0.2 : 0 });
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        return c;
      });
      return maxX - minX + vehicleById(id).dims.W;
    };
    const hatch = tc('vardarka'), truck = tc('jakupica');
    expect(hatch).toBeGreaterThan(7); expect(hatch).toBeLessThan(13);
    expect(truck).toBeGreaterThan(hatch + 4);
    expect(turningCircle(vehicleById('jakupica'))).toBeGreaterThan(turningCircle(vehicleById('vardarka')));
  });

  it('heavier vehicles accelerate more slowly with the same driver inputs', () => {
    const accel = (id: string) => {
      const v = new Vehicle(vehicleById(id), { x: 0, y: 0, h: 0 }, 'auto', { parkingBrake: false });
      v.requestGear(1);
      run(v, 6, () => C({ throttle: 0.8 }));
      return v.vx;
    };
    const hatch = accel('vardarka'), truck = accel('jakupica'), coupe = accel('ohrid');
    expect(hatch).toBeGreaterThan(8);
    expect(truck).toBeLessThan(hatch);
    expect(coupe).toBeGreaterThan(truck);
  });
});

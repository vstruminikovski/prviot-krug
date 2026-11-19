import { describe, it, expect } from 'vitest';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION, type Sim } from '../src/game/sim/sim';
import { Autopilot, type AutoOptions } from '../src/game/sim/autopilot';
import type { CityMission } from '../src/game/missions/city';
import type { ScenarioId } from '../src/game/content/scenarios';

const DT = 1 / 60;
function run(opts: AutoOptions, retry?: ScenarioId, maxT = 600, seed = 7) {
  const sim = createSim({ v: CONTENT_VERSION, env: 'city', mission: 'city', mode: 'lesson', seed, vehicle: 'vardarka', assist: 'auto', load: 0, retry });
  sim.player.parkingBrake = 0;
  const ap = new Autopilot(opts, sim.player.pose);
  while (!sim.finished && sim.t < maxT) sim.step(DT, { ...ap.input(sim), parkingBrake: false });
  if (!sim.finished) sim.finish();
  return sim;
}
const scen = (sim: Sim, id: ScenarioId) => (sim.mission as CityMission).scenarios.find((s) => s.id === id)!.res;

describe('city: full run with live traffic', () => {
  it('lawful driver completes the loop and passes every scored situation', () => {
    const sim = run({ mode: 'lawful', signal: true });
    const res = sim.result();
    for (const id of ['s1', 's2', 's3', 's4'] as const) expect(scen(sim, id).outcome, `${id}: ${scen(sim, id).did}`).toBe('pass');
    expect(sim.contacts.filter((c) => c.kind === 'vehicle' || c.kind === 'pedestrian'), JSON.stringify(sim.contacts)).toHaveLength(0);
    expect(res.incidents.filter((i) => i.layer === 'safety' && i.severity !== 'note').map((i) => i.text)).toEqual([]);
    expect(res.layers.mission).toBeGreaterThanOrEqual(80);
    console.log('lawful city run', Math.round(sim.t), 's, game', res.gameScore, 'layers', JSON.stringify(res.layers));
  });
  it('a driver who never yields fails the junction', () => {
    const sim = run({ mode: 'reckless' }, undefined, 240);
    expect(['fail', 'collision']).toContain(scen(sim, 's1').outcome);
    expect(sim.result().incidents.some((i) => i.ruleIds.includes('law.priority.right'))).toBe(true);
  });
});

describe('city: retries — correct and incorrect actions', () => {
  for (const id of ['s1', 's2', 's3'] as const) {
    it(`${id}: lawful passes`, () => expect(scen(run({ mode: 'lawful', signal: true }, id, 120), id).outcome).toBe('pass'));
    it(`${id}: reckless fails`, () => expect(['fail', 'collision']).toContain(scen(run({ mode: 'reckless' }, id, 120), id).outcome));
  }
  it('s4: timely signal passes', () => expect(scen(run({ mode: 'lawful', signal: true }, 's4', 120), 's4').outcome).toBe('pass'));
  it('s4: no signal fails the signal item', () => expect(scen(run({ mode: 'lawful', signal: false }, 's4', 120), 's4').outcome).toBe('fail-signal'));
  it('s4: wrong way fails the route', () => expect(scen(run({ mode: 'reckless', wrongWay: true }, 's4', 60), 's4').outcome).toBe('fail-route'));
  it('same seed reproduces the same trace', () => {
    const a = run({ mode: 'lawful' }, 's3', 60), b = run({ mode: 'lawful' }, 's3', 60);
    expect(a.rec.frames.length).toBe(b.rec.frames.length);
    expect(a.player.x).toBeCloseTo(b.player.x, 6);
  });
});

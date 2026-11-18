import { describe, it, expect } from 'vitest';
import { Sim } from '../src/game/sim/sim';
import { World } from '../src/game/sim/world';
import { Autopilot, type AutoOptions } from '../src/game/sim/autopilot';
import type { ScenarioId } from '../src/game/content/scenarios';

const world = new World();
const DT = 1 / 60;

function run(opts: AutoOptions, retry?: ScenarioId, maxT = 600) {
  const sim = new Sim({ retry }, world);
  const ap = new Autopilot(opts, sim.player.pose);
  while (!sim.finished && sim.t < maxT) sim.step(DT, ap.input(sim));
  if (!sim.finished) sim.finish();
  return sim;
}
const outcome = (sim: Sim, id: ScenarioId) => sim.scenarios.find((s) => s.id === id)!.res;

describe('full run', () => {
  it('lawful driver completes the loop and passes every scored situation', () => {
    const sim = run({ mode: 'lawful', signal: true });
    const sum = sim.summary();
    for (const id of ['s1', 's2', 's3', 's4'] as const) {
      const r = outcome(sim, id);
      expect(r.outcome, `${id}: ${r.did}`).toBe('pass');
      expect(r.cueT, `${id} cue`).not.toBeNull();
    }
    expect(sim.contacts.filter((c) => c.kind !== 'curb'), JSON.stringify(sim.contacts)).toHaveLength(0);
    expect(sim.speeding).toHaveLength(0);
    expect(sum.score).toBeGreaterThanOrEqual(80);
    expect(sim.t).toBeGreaterThan(150); // roughly a five-minute neighbourhood loop at learner pace
    expect(sim.rec.frames.length).toBeGreaterThan(1000);
    console.log('lawful run', Math.round(sim.t), 's, score', sum.score, sum.scenarios.map((s) => `${s.id}:${s.outcome}:${s.reaction?.toFixed(1)}`).join(' '));
  });
});

describe('full run without yielding', () => {
  it('a driver who never yields fails the junction and the narrow street', () => {
    const sim = run({ mode: 'reckless' }, undefined, 240);
    expect(['fail', 'collision']).toContain(outcome(sim, 's1').outcome);
    expect(['fail', 'collision']).toContain(outcome(sim, 's2').outcome);
    expect(sim.summary().score).toBeLessThan(40);
  });
});

describe('scenario retries — correct and incorrect actions', () => {
  for (const id of ['s1', 's2', 's3'] as const) {
    it(`${id}: lawful passes`, () => {
      const sim = run({ mode: 'lawful', signal: true }, id, 120);
      const r = outcome(sim, id);
      expect(r.outcome, r.did).toBe('pass');
      expect(r.points).toBeGreaterThanOrEqual(20);
    });
    it(`${id}: reckless fails`, () => {
      const sim = run({ mode: 'reckless' }, id, 120);
      const r = outcome(sim, id);
      expect(['fail', 'collision'], r.did).toContain(r.outcome);
      expect(r.points).toBe(0);
    });
  }
  it('s4: lawful with timely signal passes', () => {
    const r = outcome(run({ mode: 'lawful', signal: true }, 's4', 120), 's4');
    expect(r.outcome, r.did).toBe('pass');
    expect(r.points).toBe(25);
  });
  it('s4: no signal fails the signal item only', () => {
    const r = outcome(run({ mode: 'lawful', signal: false }, 's4', 120), 's4');
    expect(r.outcome).toBe('fail-signal');
    expect(r.points).toBe(15);
  });
  it('s4: late signal fails', () => {
    const r = outcome(run({ mode: 'lawful', signal: true, lateSignal: true }, 's4', 120), 's4');
    expect(r.outcome, r.did).toBe('fail-signal');
  });
  it('s4: entering the one-way street the wrong way fails the route', () => {
    const r = outcome(run({ mode: 'reckless', wrongWay: true }, 's4', 60), 's4');
    expect(r.outcome).toBe('fail-route');
    expect(r.points).toBe(0);
  });
});

describe('retry reproduces the same setup', () => {
  it('two lawful retries of s3 produce identical traces', () => {
    const a = run({ mode: 'lawful' }, 's3', 60), b = run({ mode: 'lawful' }, 's3', 60);
    expect(a.rec.frames.length).toBe(b.rec.frames.length);
    const fa = a.rec.frames[a.rec.frames.length - 1], fb = b.rec.frames[b.rec.frames.length - 1];
    expect(fa.p.x).toBeCloseTo(fb.p.x, 6);
    expect(outcome(a, 's3').cueT).toBeCloseTo(outcome(b, 's3').cueT!, 6);
  });
});

// Mistake matrix: data integrity against the rule registry, and the mode behaviour required by the
// product (Часови teach and repeat; Полагање counts only official items and stays silent).
import { describe, it, expect } from 'vitest';
import { MISTAKES, MATRIX_CONFIG, classify } from '../src/game/rules/matrix';
import { ruleById } from '../src/game/rules/registry';
import { createSim } from '../src/game/attempt';
import { CONTENT_VERSION, type Sim, type SimEvent } from '../src/game/sim/sim';
import type { EnvId } from '../src/game/env/types';
import type { Mode } from '../src/game/missions/types';

describe('matrix data', () => {
  it('every referenced rule exists; law / exam / game stay in their own categories', () => {
    for (const m of MISTAKES) {
      for (const id of m.law) expect(ruleById(id)?.category, `${m.id} law ${id}`).toBe('trafficLaw');
      for (const id of m.game) expect(['gameBalance', 'instructorTechnique'], `${m.id} game ${id}`).toContain(ruleById(id)?.category);
      for (const id of m.match.rules ?? []) expect(ruleById(id), `${m.id} match ${id}`).toBeTruthy();
      for (const cell of [m.lesson.polygon, m.lesson.city, m.exam.polygon, m.exam.city]) for (const id of cell.exam ?? []) expect(ruleById(id)?.category, `${m.id} exam ${id}`).toBe('officialExam');
    }
  });
  it('exam treatment follows the official points only (critical ⇔ one item above the threshold)', () => {
    for (const m of MISTAKES) for (const place of ['polygon', 'city'] as const) {
      const cell = m.exam[place];
      const pts = (cell.exam ?? []).map((id) => ruleById(id)!.examPoints!);
      if (cell.action === 'examCritical') expect(pts.some((p) => p > MATRIX_CONFIG.examThreshold[place]), `${m.id}/${place}`).toBe(true);
      if (cell.action === 'examMinor') expect(pts.every((p) => p <= MATRIX_CONFIG.examThreshold[place]) && pts.length > 0, `${m.id}/${place}`).toBe(true);
      expect(['retry', 'exerciseFail', 'warn', 'intervene', 'note'].includes(cell.action), `${m.id}/${place}: lesson actions never in exam cells`).toBe(false);
      const l = m.lesson[place].action;
      expect(['examMinor', 'examCritical'].includes(l), `${m.id}/${place}: exam actions never in lesson cells`).toBe(false);
    }
  });
  it('every mistake has a reason and a verification status', () => {
    for (const m of MISTAKES) { expect(m.why.length).toBeGreaterThan(5); expect(['confirmed', 'needsInstructorReview']).toContain(m.status); }
  });
});

const make = (env: EnvId, mode: Mode) => {
  const sim = createSim({ v: CONTENT_VERSION, env, mission: env, mode, seed: 7, vehicle: 'vardarka', assist: 'manual', load: 0 });
  const events: SimEvent[] = []; const emit = sim.emit.bind(sim); sim.emit = (e: SimEvent) => { events.push(e); emit(e); };
  return { sim, events };
};
const contact = (sim: Sim, kind: string, speed: number) => (sim as unknown as { onContact: (c: unknown) => void }).onContact({ t: sim.t, kind, id: 'car-test', speed });

describe('Часови (lesson)', () => {
  it('missed turn signal → instructor warning, lesson continues, no exam points', () => {
    const { sim, events } = make('city', 'lesson');
    const inc = sim.incident('corner-test', { layer: 'safety', severity: 'significant', ruleIds: ['law.signalling'], text: 'Свртување без покажувач.', exam: ['exam4.2K'] })!;
    expect(inc.cls?.action).toBe('warn');
    expect(inc.exam).toBeUndefined();
    expect(sim.finished).toBe(false); expect(sim.failed).toBeNull();
    expect(events.some((e) => e.type === 'say')).toBe(true);
    expect(events.some((e) => e.type === 'retryOffer')).toBe(false);
  });
  it('collision → safety-critical: stop and offer a retry (not a minor warning)', () => {
    const { sim, events } = make('city', 'lesson');
    contact(sim, 'vehicle', 4);
    const inc = sim.ledger.incidents.at(-1)!;
    expect(inc.cls?.action).toBe('retry'); expect(inc.severity).toBe('critical');
    expect(events.some((e) => e.type === 'retryOffer')).toBe(true);
    expect(sim.finished).toBe(false);
  });
  it('polygon line crossing → exercise failure with a repeat offer', () => {
    const { sim, events } = make('polygon', 'lesson');
    const inc = sim.incident('lane-exam1.1E-0', { layer: 'technique', severity: 'serious', ruleIds: ['exam1.1E'], text: 'Газење линија.', exam: ['exam1.1E'] })!;
    expect(inc.cls?.action).toBe('exerciseFail');
    expect(events.some((e) => e.type === 'retryOffer')).toBe(true);
    expect(sim.ledger.examTotal()).toBe(0);
  });
});

describe('Полагање (exam)', () => {
  it('collision → official 1-Х (51 > 50): the exam ends, with source', () => {
    const { sim } = make('city', 'exam');
    contact(sim, 'vehicle', 4);
    expect(sim.failed?.cls?.action).toBe('examCritical');
    expect(sim.failed?.cls?.source).toContain('1-Х');
    expect(sim.finished).toBe(true);
    expect(sim.result().exam?.passed).toBe(false);
  });
  it('missed signal → 20 negative points (2-К), the drive continues', () => {
    const { sim } = make('city', 'exam');
    sim.incident('corner-test', { layer: 'safety', severity: 'significant', ruleIds: ['law.signalling'], text: 'Свртување без покажувач.', exam: ['exam4.2K'] });
    expect(sim.ledger.examTotal('Образец бр. 4')).toBe(20);
    expect(sim.finished).toBe(false);
  });
  it('pedestrian not yielded → 30 points per the official sheet, not an automatic end', () => {
    const { sim } = make('city', 'exam');
    sim.incident('zebra-x', { layer: 'safety', severity: 'serious', ruleIds: ['law.ped.crossing'], text: 'Не го пропушти пешакот.' });
    expect(sim.ledger.examTotal('Образец бр. 4')).toBe(30);
    expect(sim.finished).toBe(false);
  });
  it('game-only penalties never change the exam score', () => {
    const { sim } = make('polygon', 'exam');
    contact(sim, 'curb', 1);
    expect(sim.ledger.incidents.at(-1)?.cls?.action).toBe('gameOnly');
    expect(sim.ledger.examTotal()).toBe(0);
  });
  it('no coaching during the attempt (stall gives no instructor hint)', () => {
    const { sim, events } = make('city', 'exam');
    (sim as unknown as { onVehicleEvent: (e: unknown) => void }).onVehicleEvent({ type: 'stall', data: {} });
    expect(events.filter((e) => e.type === 'say')).toHaveLength(0);
    expect(classify('stall', [], 'exam', 'city')?.cell.action).toBe('examMinor');
  });
});

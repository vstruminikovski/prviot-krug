// Evidence-based incident ledger. Three independent result layers:
//   safety    — traffic-law compliance and safety (rule ids from trafficLaw)
//   technique — vehicle handling and instructor technique
//   mission   — game objectives and progression
// Game points are clearly fictional; official exam points are only attached where the
// sheet item exists, and the exam total is computed separately.
import type { Vec2 } from '../math';
import { ruleById } from './registry';

export type Severity = 'note' | 'minor' | 'significant' | 'serious' | 'critical' | 'technical';
export type Layer = 'safety' | 'technique' | 'mission';

export interface Incident {
  id: number; t: number; key: string;
  layer: Layer; severity: Severity;
  ruleIds: string[];
  text: string; // Macedonian, short and specific
  points: number; // game deduction
  exam?: { form: string; item: string; points: number }[];
  pos?: Vec2;
  evidence?: string;
  /** mistake-matrix classification (mode-aware treatment, source, verification) */
  cls?: { mistake: string; action: string; exam: boolean; source: string; status: 'confirmed' | 'needsInstructorReview'; why: string };
}

export const GAME_POINTS: Record<Severity, number> = { note: 0, minor: 3, significant: 8, serious: 15, critical: 40, technical: 0 };
export const SEVERITY_LABEL: Record<Severity, string> = {
  note: 'Забелешка', minor: 'Мала грешка', significant: 'Значајна грешка', serious: 'Сериозен прекршок', critical: 'Критично', technical: 'Технички инцидент',
};

export class Ledger {
  incidents: Incident[] = [];
  private last = new Map<string, number>();
  private seq = 0;

  /** Add an incident unless the same key fired within `debounce` seconds (one event, not one per frame). */
  add(t: number, key: string, o: { layer: Layer; severity: Severity; ruleIds: string[]; text: string; pos?: Vec2; evidence?: string; exam?: string[]; cls?: Incident['cls'] }, debounce = 6): Incident | null {
    const prev = this.last.get(key);
    if (prev !== undefined && t - prev < debounce) return null;
    this.last.set(key, t);
    const exam = (o.exam ?? []).map((id) => ruleById(id)).filter((r): r is NonNullable<typeof r> => !!r && r.examPoints !== undefined)
      .map((r) => ({ form: r.form!, item: r.item!, points: r.examPoints! }));
    const inc: Incident = { id: ++this.seq, t, key, layer: o.layer, severity: o.severity, ruleIds: o.ruleIds, text: o.text, points: GAME_POINTS[o.severity], exam: exam.length ? exam : undefined, pos: o.pos, evidence: o.evidence, cls: o.cls };
    this.incidents.push(inc);
    return inc;
  }

  examTotal(form?: string) {
    let s = 0;
    for (const i of this.incidents) for (const e of i.exam ?? []) if (!form || e.form === form) s += e.points;
    return s;
  }
  gameDeduction(layer?: Layer) { return this.incidents.filter((i) => !layer || i.layer === layer).reduce((a, i) => a + i.points, 0); }
  critical() { return this.incidents.find((i) => i.severity === 'critical') ?? null; }
}

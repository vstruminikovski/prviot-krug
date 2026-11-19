// Градско возење — Debar Maalo. The four verified situations from Episode 1 now run inside a
// living neighbourhood (ambient traffic, signalised crossing, pedestrians) with instructor navigation.
import { DETECT } from '../sim/params';
import { Path, angleDiff, inRect, rect, type Vec2 } from '../math';
import { Stroller, type Pedestrian } from '../sim/actors';
import { makeScenarios, type ScenarioRuntime } from '../sim/scenarios';
import { CHECKPOINTS, CAFE_CHINAR_ZONE, CAFE_TABLES, PATRON_LINES, ROUTE_HINTS } from '../content/debarMaalo';
import { SCENARIOS } from '../content/scenarios';
import type { Sim } from '../sim/sim';
import type { Mission, MissionItem, TaskInfo } from './types';
import { CityTraffic } from '../traffic/cityTraffic';
import { locate, route, linksFrom, edgeById } from '../traffic/cityGraph';

// navigation goals along the loop (graph edges); the instructor reroutes if a turn is missed
const GOALS = [
  { edge: 'TN', name: 'ул. Тиха' },
  { edge: 'GW2', name: 'ул. Ѓурѓевденска' },
  { edge: 'JS', name: 'ул. Јаворова', compassOnly: true }, // situation 4: the signs decide the route
  { edge: 'BE1', name: 'кафичот' },
];

const CORNERS = [
  { id: 'J2', approach: 0, zone: rect(452, -3.5, 482.8, 3.5) },
  { id: 'TG', approach: Math.PI / 2, zone: rect(477.2, 232, 482.8, 263.5) },
  { id: 'J5', approach: -Math.PI / 2, zone: rect(-3.3, -3.5, 3.3, 28) },
];

export class CityMission implements Mission {
  id = 'city-loop';
  title = 'Круг низ маалото';
  examForm = 'Образец бр. 4' as const;
  done = false;
  scenarios: ScenarioRuntime[] = makeScenarios();
  traffic!: CityTraffic;
  checkpoint = -1;
  private stillInCafe = 0;
  private cornerState = new Map<string, boolean>();
  private speechCooldown = 4;
  private speechIdx = { chinar: 0, lipa: 0 };
  private ambientB = false;
  private retry?: string;
  private intro = 0;

  init(sim: Sim) {
    this.retry = sim.config.retry;
    for (const s of this.scenarios) s.init();
    if (this.retry) {
      const target = this.scenarios.find((s) => s.id === this.retry)!;
      for (const s of this.scenarios) s.enabled = s === target || s.id === 'x1';
      sim.player.place(target.retry.pose, target.retry.v, sim.player.assist === 'auto' ? 1 : 2);
      sim.player.parkingBrake = 0;
      this.checkpoint = 4;
    } else {
      sim.spawnCar('amb-a', 'sedan', '#6b6b63', 'SK 6021-AE', new Path([{ x: 215, y: 0.9 }, { x: 0.75, y: 0.9 }, { x: 0.75, y: 140 }], 4.5), 0, 7.5, 8.5);
    }
    const L = (coat: string, hair: string, carry: Pedestrian['look']['carry'], height = 1.72, skirt = false) => ({ coat, hair, carry, height, skirt });
    sim.strollers = [
      new Stroller('w-intro', { x: 30, y: -5.0 }, { x: 118, y: -5.0 }, 0.95, L('#8a5a44', '#c8c2b8', 'groceries', 1.6, true), 0.3),
      new Stroller('w-bak-n', { x: 96, y: 5.4 }, { x: 226, y: 5.4 }, 1.25, L('#3b4a3a', '#2b2018', 'none')),
      new Stroller('w-bak-s', { x: 250, y: -5.4 }, { x: 330, y: -5.4 }, 1.1, L('#a8442f', '#3a2a1a', 'bag', 1.66, true), 0.5),
      new Stroller('w-tiha', { x: 475.6, y: 160 }, { x: 475.6, y: 246 }, 1.05, L('#5a5a6a', '#9a9a9a', 'none'), 0.2),
      new Stroller('w-gj', { x: 150, y: 254.2 }, { x: 228, y: 254.2 }, 1.2, L('#2e3e5e', '#1a1a1a', 'bag', 1.78)),
      new Stroller('w-jav', { x: -5.0, y: 60 }, { x: -5.0, y: 210 }, 1.15, L('#6b2e3a', '#4a3020', 'groceries', 1.64, true), 0.6),
      new Stroller('w-chin', { x: 245.2, y: 40 }, { x: 245.2, y: 200 }, 1.0, L('#4a6a5a', '#202020', 'none', 1.7), 0.4),
      new Stroller('w-kid', { x: 410, y: 5.2 }, { x: 470, y: 5.2 }, 1.5, L('#d9a441', '#3a2a1a', 'none', 1.32), 0.1),
    ];
    this.traffic = new CityTraffic(sim, !!this.retry);
    if (!this.retry) sim.say('Подготви го возилото и вклучи се кога е безбедно. Покажувач лево, погледни во огледалото.', 1);
  }

  update(sim: Sim, dt: number) {
    const p = sim.player;
    this.intro += dt;
    for (const s of this.scenarios) if (s.enabled && !s.finished) s.update(sim, dt);
    this.traffic.update(sim, dt);
    if (!this.retry && !this.ambientB && this.checkpoint >= 4 && p.x < 3.3 && p.y < 238) {
      this.ambientB = true;
      sim.spawnCar('amb-b', 'compact', '#e6e2d8', 'SK 1985-MR', new Path([{ x: 0.75, y: 14 }, { x: 0.75, y: 259.2 }, { x: 160, y: 259.2 }], 4), 0, 7, 8);
    }
    // signals on the other left turns (technique layer, not a statutory finding without the exam form)
    for (const c of CORNERS) {
      if (this.retry || this.cornerState.get(c.id)) continue;
      if (inRect(c.zone, p.x, p.y) && Math.abs(angleDiff(p.h, c.approach)) > 0.26 && Math.abs(angleDiff(p.h, c.approach)) < 1.2) {
        this.cornerState.set(c.id, true);
        const lastNot = [...sim.rec.sample(sim.t - 6, sim.t)].reverse().find((f) => f.p.ind !== 1);
        const onFor = p.indicator === 'left' ? (lastNot ? sim.t - lastNot.t : 6) : 0;
        if (onFor < DETECT.indicatorLeadSeconds) sim.incident('corner-' + c.id, { layer: 'safety', severity: 'significant', ruleIds: ['law.signalling'], text: 'Свртување налево без навремен покажувач.', exam: ['exam4.2K'] }, 30);
        if (!sim.observedSince(['mirrorL', 'mirrorC', 'shoulderL'], sim.t - 6)) sim.incident('mirror-' + c.id, { layer: 'technique', severity: 'note', ruleIds: ['tech.mirror.before'], text: 'Свртување без поглед во огледало (контрола-проксија).', exam: sim.config.mode === 'exam' ? ['exam4.1I'] : [] }, 30);
      }
    }
    const next = CHECKPOINTS[this.checkpoint + 1];
    if (next && inRect(next.r, p.x, p.y)) { this.checkpoint++; sim.emit({ type: 'checkpoint', index: this.checkpoint }); this.navSay(sim); }
    // café patrons talk as you pass slowly
    this.speechCooldown -= dt;
    if (this.speechCooldown <= 0) {
      for (const cafe of ['chinar', 'lipa'] as const) {
        const tables = CAFE_TABLES.filter((t) => t.cafe === cafe);
        if (tables.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 26) && Math.abs(p.vx) < 9) {
          const lines = PATRON_LINES[cafe];
          const i = this.speechIdx[cafe]++ % lines.length;
          const tb = tables[(i * 3 + 1) % tables.length];
          sim.emit({ type: 'speech', x: tb.x, y: tb.y, text: lines[i], who: cafe });
          this.speechCooldown = 6.5;
          break;
        }
      }
    }
    if (!this.retry && this.checkpoint >= CHECKPOINTS.length - 1 && inRect(CAFE_CHINAR_ZONE, p.x, p.y) && Math.abs(p.vx) < 0.4) {
      this.stillInCafe += dt;
      if (this.stillInCafe > 1.2) this.complete(sim);
    } else this.stillInCafe = 0;
    if (this.retry && this.scenarios.find((s) => s.id === this.retry)!.finished) this.complete(sim);
  }

  private navSay(sim: Sim) {
    const h = [...ROUTE_HINTS].reverse().find((x) => x.afterCheckpoint <= this.checkpoint);
    if (h && h.arrow === 'left') sim.say(`На следната раскрсница ${h.text.toLowerCase().replace('лево на', 'сврти лево на')}.`, 1);
    if (this.checkpoint === 3) sim.say('Назад кон кафичот. Следи ги знаците — не секој краток пат е дозволен.', 1);
    if (this.checkpoint === CHECKPOINTS.length - 1) sim.say('Најди безбедно место и запри кај кафичот.', 1);
  }

  private complete(sim: Sim) {
    for (const s of this.scenarios) if (s.enabled) s.closeMissed(sim);
    this.done = true;
  }

  onContact(sim: Sim, c: Parameters<NonNullable<Mission['onContact']>>[1]) {
    for (const s of this.scenarios) if (s.enabled && s.armed) s.onContact(sim, c);
  }

  private goal = 0;
  private plannedNext: string | null = null;
  private lastEdge: string | null = null;

  /** Graph navigation with preparation distance and rerouting after a missed turn. */
  private navigate(sim: Sim): TaskInfo | null {
    const p = sim.player;
    const loc = locate(p.x, p.y, p.h);
    if (!loc) return null;
    while (this.goal < GOALS.length - 1 && loc.edge.id === GOALS[this.goal].edge) this.goal++;
    const g = GOALS[this.goal];
    if (loc.edge.id !== this.lastEdge) {
      if (this.lastEdge && this.plannedNext && loc.edge.id !== this.plannedNext && loc.edge.id !== g.edge) {
        sim.say('Пропуштивме свртување. Продолжи безбедно — ќе најдеме друг пат.', 2);
      }
      this.lastEdge = loc.edge.id;
    }
    const end = loc.edge.pts[loc.edge.pts.length - 1];
    if (loc.edge.id === g.edge) return { text: g.edge === 'BE1' ? 'Продолжи до кафичот и запри безбедно' : `Продолжи по ${g.name}`, nav: { arrow: 'straight', dist: null, at: g.edge === 'BE1' ? { x: 70, y: -2 } : end } };
    const r = route(loc.edge.id, g.edge);
    if (!r || r.length < 2) return null;
    const link = linksFrom(loc.edge.id).find((l) => l.to === r[1])!;
    this.plannedNext = r[1];
    const dist = Math.round((loc.remaining + 4) / 5) * 5;
    if (g.compassOnly && this.goal === 2) return { text: 'Назад кон кафичот — следи ги знаците', sub: 'Најкраткиот пат не е секогаш дозволен.' };
    const verb = link.turn === 'left' ? 'сврти лево' : link.turn === 'right' ? 'сврти десно' : 'продолжи право';
    const prep = 40 + Math.abs(p.vx) * 6; // preparation distance grows with speed
    return { text: dist <= prep ? `На раскрсницата ${verb} — ${edgeById(r[1]).label}` : `Продолжи, па ${verb} кон ${edgeById(r[1]).label}`, nav: { arrow: link.turn, dist, at: end } };
  }

  task(sim: Sim): TaskInfo | null {
    const p = sim.player;
    const cp = this.checkpoint;
    if (this.retry) return { text: SCENARIOS.find((d) => d.id === this.retry)?.objective ?? '' };
    if (cp < CHECKPOINTS.length - 1) { const nav = this.navigate(sim); if (nav) return nav; }
    if (cp >= CHECKPOINTS.length - 1) return { text: 'Запри кај кафичот', nav: { arrow: 'park', dist: Math.round(Math.hypot(70 - p.x, -2 - p.y) / 10) * 10, at: { x: 70, y: -2 } } };
    const h = [...ROUTE_HINTS].reverse().find((x) => x.afterCheckpoint <= cp);
    if (!h) return null;
    const target: Vec2 = h.turnAt ?? { x: 70, y: -2 };
    const dist = Math.hypot(target.x - p.x, target.y - p.y);
    // preparation distance grows with speed: never say "now" after the decision point
    const prep = 40 + Math.abs(p.vx) * 6;
    return { text: h.text, nav: h.arrow === 'compass' ? undefined : { arrow: h.arrow === 'left' ? 'left' : 'straight', dist: dist < prep * 3 ? Math.round(dist / 10) * 10 : null, at: h.turnAt } };
  }

  items(sim: Sim): MissionItem[] {
    const t0 = sim.rec.start;
    return this.scenarios.filter((s) => s.enabled).map((s) => {
      const def = SCENARIOS.find((d) => d.id === s.id)!;
      const r = s.res;
      const status: MissionItem['status'] = s.id === 'x1' ? 'unscored' : r.outcome === 'pass' ? 'pass' : r.outcome === 'missed' || r.outcome === 'pending' ? 'missed' : 'fail';
      return { id: s.id, title: def.title, status, detail: r.did || def.objective, points: r.points, max: s.id === 'x1' ? 0 : 25, t0: r.armedT ?? undefined, t1: r.endT ?? undefined, cueT: r.cueT, focus: r.focusActor, };
    }).map((i) => ({ ...i, t0: i.t0 !== undefined ? i.t0 : t0 }));
  }

  missionScore(): number {
    const scored = this.scenarios.filter((s) => s.enabled && s.id !== 'x1');
    const max = scored.length * 25;
    return max ? (100 * scored.reduce((a, s) => a + s.res.points, 0)) / max : 0;
  }
}

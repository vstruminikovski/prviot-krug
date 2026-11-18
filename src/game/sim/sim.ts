// Simulation orchestrator: no rendering, no DOM. Runs identically in the browser and in tests.
import { Path, angleDiff, inRect, kmh, rect, type Vec2 } from '../math';
import { World } from './world';
import { PlayerCar, type Contact, type DriveInput, type DynamicBody, PLAYER } from './vehicle';
import { NpcCar, Pedestrian, Stroller } from './actors';
import { Recorder, type Frame } from './recorder';
import { makeScenarios, type ScenarioResult, type ScenarioRuntime } from './scenarios';
import type { CarType } from '../content/generate';
import { CHECKPOINTS, CAFE_CHINAR_ZONE, CAFE_TABLES, PATRON_LINES, START_POSE } from '../content/debarMaalo';
import type { ScenarioId } from '../content/scenarios';

export type SimEvent =
  | { type: 'contact'; contact: Contact }
  | { type: 'scenario'; id: ScenarioId; outcome: string }
  | { type: 'note'; id: ScenarioId; text: string }
  | { type: 'speech'; x: number; y: number; text: string; who: string }
  | { type: 'checkpoint'; index: number }
  | { type: 'finish' };

export interface CornerSignal { id: string; ok: boolean; onFor: number }
export interface SpeedEpisode { t0: number; t1: number; max: number }

export interface RunSummary {
  score: number;
  scenarios: ScenarioResult[];
  speeding: SpeedEpisode[];
  contacts: Contact[];
  corners: CornerSignal[];
  penalties: { speed: number; contacts: number };
  duration: number;
  finished: boolean;
}

const CORNERS = [
  { id: 'J2', approach: 0, zone: rect(452, -3.5, 482.8, 3.5), label: 'Бакалска → Тиха' },
  { id: 'TG', approach: Math.PI / 2, zone: rect(477.2, 232, 482.8, 263.5), label: 'Тиха → Ѓурѓевденска' },
  { id: 'J5', approach: -Math.PI / 2, zone: rect(-3.3, -3.5, 3.3, 28), label: 'Јаворова → Бакалска' },
];

export interface SimOptions { retry?: ScenarioId }

export class Sim {
  t = 0;
  world: World;
  player: PlayerCar;
  cars: NpcCar[] = [];
  peds: Pedestrian[] = [];
  strollers: Stroller[] = [];
  scenarios: ScenarioRuntime[];
  rec = new Recorder();
  contacts: Contact[] = [];
  speeding: SpeedEpisode[] = [];
  corners: CornerSignal[] = [];
  checkpoint = -1;
  finished = false;
  events: SimEvent[] = [];
  readonly retry?: ScenarioId;
  private spawned = new Set<string>();
  /** Appearance of every actor ever spawned (kept after despawn so replays can draw them). */
  actorMeta = new Map<string, { kind: 'car'; type: CarType; color: string; plate: string } | { kind: 'ped'; look: Pedestrian['look'] }>();
  private overSince: number | null = null; private overMax = 0;
  private stillInCafe = 0;
  private cornerState = new Map<string, { started: boolean }>();
  private speechCooldown = 4;
  private speechIdx = { chinar: 0, lipa: 0 };
  private ambientB = false;

  constructor(opts: SimOptions = {}, world?: World) {
    this.world = world ?? new World();
    this.retry = opts.retry;
    this.player = new PlayerCar(START_POSE);
    this.scenarios = makeScenarios();
    for (const s of this.scenarios) s.init();
    if (opts.retry) {
      const target = this.scenarios.find((s) => s.id === opts.retry)!;
      for (const s of this.scenarios) s.enabled = s === target || s.id === 'x1';
      this.player.place(target.retry.pose, target.retry.v);
      this.checkpoint = 4;
    } else {
      this.spawnCar('amb-a', 'sedan', '#6b6b63', 'SK 6021-AE', new Path([{ x: 215, y: 0.9 }, { x: 0.75, y: 0.9 }, { x: 0.75, y: 140 }], 4.5), 0, 7.5, 8.5);
    }
    this.makeStrollers();
  }

  private makeStrollers() {
    const L = (coat: string, hair: string, carry: Pedestrian['look']['carry'], height = 1.72, skirt = false) => ({ coat, hair, carry, height, skirt });
    this.strollers = [
      new Stroller('w-intro', { x: 30, y: -5.0 }, { x: 118, y: -5.0 }, 0.95, L('#8a5a44', '#c8c2b8', 'groceries', 1.6, true), 0.3),
      new Stroller('w-bak-n', { x: 96, y: 5.4 }, { x: 226, y: 5.4 }, 1.25, L('#3b4a3a', '#2b2018', 'none')),
      new Stroller('w-bak-s', { x: 250, y: -5.4 }, { x: 330, y: -5.4 }, 1.1, L('#a8442f', '#3a2a1a', 'bag', 1.66, true), 0.5),
      new Stroller('w-tiha', { x: 475.6, y: 160 }, { x: 475.6, y: 246 }, 1.05, L('#5a5a6a', '#9a9a9a', 'none'), 0.2),
      new Stroller('w-gj', { x: 150, y: 254.2 }, { x: 228, y: 254.2 }, 1.2, L('#2e3e5e', '#1a1a1a', 'bag', 1.78)),
      new Stroller('w-jav', { x: -5.0, y: 60 }, { x: -5.0, y: 210 }, 1.15, L('#6b2e3a', '#4a3020', 'groceries', 1.64, true), 0.6),
      new Stroller('w-chin', { x: 245.2, y: 40 }, { x: 245.2, y: 200 }, 1.0, L('#4a6a5a', '#202020', 'none', 1.7), 0.4),
      new Stroller('w-kid', { x: 410, y: 5.2 }, { x: 470, y: 5.2 }, 1.5, L('#d9a441', '#3a2a1a', 'none', 1.32), 0.1),
    ];
  }

  emit(e: SimEvent) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  npcSpawned(id: string) { return this.spawned.has(id); }

  spawnCar(id: string, type: CarType, color: string, plate: string, path: Path, s0: number, v0: number, vTarget: number) {
    const c = new NpcCar(id, type, color, plate, path, s0, v0, vTarget);
    this.cars.push(c); this.spawned.add(id);
    this.actorMeta.set(id, { kind: 'car', type, color, plate });
    return c;
  }

  spawnPed(id: string, look: Pedestrian['look'], path: Path, markers: Record<string, number>) {
    const p = new Pedestrian(id, look, path, markers);
    this.peds.push(p); this.spawned.add(id);
    this.actorMeta.set(id, { kind: 'ped', look });
    return p;
  }

  step(dt: number, input: DriveInput) {
    if (this.finished) return;
    this.t += dt;
    const bodies: DynamicBody[] = [
      ...this.cars.filter((c) => !c.done),
      ...this.peds.filter((p) => !p.done),
    ];
    this.player.step(dt, input, this.world, bodies, this.t, (c) => {
      this.contacts.push(c);
      this.emit({ type: 'contact', contact: c });
      for (const s of this.scenarios) if (s.enabled && s.armed) s.onContact(this, c);
    });
    const ctx = { playerQuad: this.player.quad(this.player.pose, 0.3), playerPose: this.player.pose, cars: this.cars, peds: this.peds };
    for (const c of this.cars) c.update(dt, ctx);
    for (const s of this.strollers) s.update(dt);
    for (const s of this.scenarios) if (s.enabled && !s.finished) s.update(this, dt);
    this.cars = this.cars.filter((c) => !c.done); // drop despawned
    this.monitor(dt);
    this.ambient();
    this.rec.push(this.t, dt, () => this.snapshot());
  }

  private ambient() {
    const p = this.player;
    if (!this.retry && !this.ambientB && this.checkpoint >= 4 && p.x < 3.3 && p.y < 238) {
      this.ambientB = true;
      this.spawnCar('amb-b', 'compact', '#e6e2d8', 'SK 1985-MR', new Path([{ x: 0.75, y: 14 }, { x: 0.75, y: 259.2 }, { x: 160, y: 259.2 }], 4), 0, 7, 8);
    }
  }

  private monitor(dt: number) {
    const p = this.player;
    // Speed in a built-up area (ЗБСП чл. 35 ст. 1): 50 km/h, 1 km/h tolerance, ≥1 s episodes
    const sp = kmh(p.v);
    if (sp > 51) {
      if (this.overSince === null) { this.overSince = this.t; this.overMax = 0; }
      this.overMax = Math.max(this.overMax, sp);
    } else if (this.overSince !== null) {
      if (this.t - this.overSince >= 1) this.speeding.push({ t0: this.overSince, t1: this.t, max: this.overMax });
      this.overSince = null;
    }
    // Signals on the other left turns (coaching only)
    for (const c of CORNERS) {
      if (this.retry) break;
      const st = this.cornerState.get(c.id) ?? { started: false };
      if (!st.started && inRect(c.zone, p.x, p.y) && Math.abs(angleDiff(p.h, c.approach)) > 0.26 && Math.abs(angleDiff(p.h, c.approach)) < 1.2) {
        st.started = true;
        const lastNot = [...this.rec.sample(this.t - 6, this.t)].reverse().find((f) => f.p.ind !== 1);
        const onFor = p.indicator === 'left' ? (lastNot ? this.t - lastNot.t : 6) : 0;
        this.corners.push({ id: c.id, ok: onFor >= 1.5, onFor });
      }
      this.cornerState.set(c.id, st);
    }
    // Checkpoints
    const next = CHECKPOINTS[this.checkpoint + 1];
    if (next && inRect(next.r, p.x, p.y)) { this.checkpoint++; this.emit({ type: 'checkpoint', index: this.checkpoint }); }
    // Café patrons talk as you pass slowly
    this.speechCooldown -= dt;
    if (this.speechCooldown <= 0) {
      for (const cafe of ['chinar', 'lipa'] as const) {
        const tables = CAFE_TABLES.filter((t) => t.cafe === cafe);
        const near = tables.find((t) => Math.hypot(t.x - p.x, t.y - p.y) < 26);
        if (near && Math.abs(p.v) < 9) {
          const lines = PATRON_LINES[cafe];
          const i = this.speechIdx[cafe]++ % lines.length;
          const tb = tables[(i * 3 + 1) % tables.length];
          this.emit({ type: 'speech', x: tb.x, y: tb.y, text: lines[i], who: cafe });
          this.speechCooldown = 6.5;
          break;
        }
      }
    }
    // Finish at the café
    if (!this.retry && this.checkpoint >= CHECKPOINTS.length - 1 && inRect(CAFE_CHINAR_ZONE, p.x, p.y) && Math.abs(p.v) < 0.4) {
      this.stillInCafe += dt;
      if (this.stillInCafe > 1.2) this.finish();
    } else this.stillInCafe = 0;
    if (this.retry) {
      const target = this.scenarios.find((s) => s.id === this.retry)!;
      if (target.finished) this.finish();
    }
  }

  finish() {
    if (this.finished) return;
    for (const s of this.scenarios) if (s.enabled) s.closeMissed(this);
    if (this.overSince !== null && this.t - this.overSince >= 1) this.speeding.push({ t0: this.overSince, t1: this.t, max: this.overMax });
    this.finished = true;
    this.emit({ type: 'finish' });
  }

  snapshot(): Frame {
    const p = this.player;
    return {
      t: this.t,
      p: { x: p.x, y: p.y, h: p.h, v: p.v, steer: p.steer, thr: p.throttle, brk: p.brake, ind: p.indicator === 'left' ? 1 : p.indicator === 'right' ? 2 : 0, gear: p.gear === 'R' ? 1 : 0 },
      a: [
        ...this.cars.filter((c) => !c.done).map((c) => { const q = c.pose; return { id: c.id, k: 'car' as const, x: q.x, y: q.y, h: q.h, ind: (c.indicator === 'left' ? 1 : c.indicator === 'right' ? 2 : 0) as 0 | 1 | 2, brk: c.braking }; }),
        ...this.peds.filter((d) => !d.done).map((d) => ({ id: d.id, k: 'ped' as const, x: d.pos.x, y: d.pos.y, h: d.h, ind: 0 as const, brk: false, ph: d.phase })),
      ],
    };
  }

  summary(): RunSummary {
    const scen = this.scenarios.filter((s) => s.enabled).map((s) => s.res);
    const speedPen = Math.min(15, this.speeding.length * 5);
    const contPen = Math.min(25, this.contacts.reduce((a, c) => a + (c.kind === 'vehicle' || c.kind === 'pedestrian' ? 10 : 2), 0));
    const base = scen.reduce((a, r) => a + r.points, 0);
    return {
      score: Math.max(0, Math.min(100, Math.round(base - speedPen - contPen))),
      scenarios: scen, speeding: this.speeding, contacts: this.contacts, corners: this.corners,
      penalties: { speed: speedPen, contacts: contPen }, duration: this.t, finished: this.finished,
    };
  }

  /** Where the player is relative to the café (for the route hint compass). */
  bearingTo(target: Vec2) { return Math.atan2(target.y - this.player.y, target.x - this.player.x); }
}

export { PLAYER };

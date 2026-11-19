// Simulation orchestrator: no rendering, no DOM. Runs identically in the browser and in tests.
// One authoritative clock, vehicle, world, actors, rules monitor and mission per attempt.
import { kmh, type Path, type Vec2 } from '../math';
import { World } from './world';
import { DETECT } from './params';
import { classify, examItemsFor, severityFor, actionFor, sourceLine, MATRIX_CONFIG, type Action } from '../rules/matrix';
import { Vehicle, type Assist, type Contact, type Controls, type DynamicBody, type VehicleEvent, type Gear } from '../vehicles/vehicle';
import { vehicleById, VEHICLE_DATA_VERSION } from '../vehicles/defs';
import { NpcCar, Pedestrian, Stroller } from './actors';
import { Recorder, type Frame } from './recorder';
import type { CarType } from '../content/generate';
import { Ledger, type Incident } from '../rules/ledger';
import { RULES_VERSION } from '../rules/registry';
import type { EnvData, EnvId } from '../env/types';
import type { Mission, MissionItem, Mode } from '../missions/types';
import { streams, type Streams } from './seed';

export const CONTENT_VERSION = 3;
export const PHYSICS_VERSION = `veh${VEHICLE_DATA_VERSION}`;

export interface AttemptConfig {
  v: number; // content version
  env: EnvId;
  mission: string;
  mode: Mode;
  seed: number;
  vehicle: string;
  assist: Assist;
  load: number;
  retry?: string; // scenario id to restage (city)
  time?: 'golden' | 'noon' | 'dusk' | 'night';
  weather?: 'clear' | 'rain' | 'fog';
}

export type SimEvent =
  | { type: 'contact'; contact: Contact }
  | { type: 'incident'; incident: Incident }
  | { type: 'vehicle'; e: VehicleEvent }
  | { type: 'say'; text: string; priority: number; who?: string }
  | { type: 'speech'; x: number; y: number; text: string; who: string }
  | { type: 'scenario'; id: string; outcome: string }
  | { type: 'note'; id: string; text: string }
  | { type: 'checkpoint'; index: number }
  | { type: 'fail'; incident: Incident }
  | { type: 'retryOffer'; incident: Incident }
  | { type: 'finish' };

export interface Glance { kind: 'mirrorL' | 'mirrorR' | 'mirrorC' | 'shoulderL' | 'shoulderR' | 'lookL' | 'lookR'; t0: number; t1: number }

export interface AttemptResult {
  config: AttemptConfig;
  finished: boolean;
  failed: Incident | null;
  gameScore: number;
  layers: { safety: number; technique: number; mission: number };
  incidents: Incident[];
  items: MissionItem[];
  exam: { form: string; total: number; passed: boolean } | null;
  duration: number;
  odometer: number;
  versions: { content: number; rules: string; physics: string };
}

export type ActorMeta = { kind: 'car'; type: CarType | string; color: string; plate: string } | { kind: 'ped'; look: Pedestrian['look'] };

export class Sim {
  t = 0;
  config: AttemptConfig;
  env: EnvData;
  world: World;
  player: Vehicle;
  cars: NpcCar[] = [];
  peds: Pedestrian[] = [];
  strollers: Stroller[] = [];
  mission: Mission;
  ledger = new Ledger();
  rec = new Recorder();
  rng: Streams;
  contacts: Contact[] = [];
  glances: Glance[] = [];
  events: SimEvent[] = [];
  finished = false;
  failed: Incident | null = null;
  actorMeta = new Map<string, ActorMeta>();
  /** per-frame extra actors that missions/traffic want recorded (signals etc.) */
  extraState: Record<string, number | string> = {};
  /** extra bodies the player can collide with (traffic system) */
  extraBodies: () => DynamicBody[] = () => [];
  private spawned = new Set<string>();
  private overSince: number | null = null; private overMax = 0; private overLimit = 0; private overRule = '';
  private neutralDescent = 0;
  private lastHorn = -99;

  constructor(config: AttemptConfig, env: EnvData, mission: Mission, world?: World) {
    this.config = config;
    this.env = env;
    this.world = world ?? new World(env);
    this.rng = streams(config.seed);
    if (config.weather === 'rain') this.world.gripScale = 0.72;
    this.mission = mission;
    const def = vehicleById(config.vehicle);
    this.player = new Vehicle(def, env.start, config.assist, { engineRunning: true, parkingBrake: true, gear: 'N', load: config.load });
    mission.init(this);
  }

  // ------------------------------------------------------------------ actors
  emit(e: SimEvent) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  say(text: string, priority = 1, who = 'Инструктор') { this.emit({ type: 'say', text, priority, who }); }
  /** coaching line — silent in Полагање (no hints during an exam attempt) */
  coach(text: string, priority = 1) { if (this.config.mode !== 'exam') this.say(text, priority); }
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

  /** Called by the input layer when a glance view was actually displayed. */
  observe(kind: Glance['kind'], t0: number, t1: number) { if (t1 - t0 >= 0.35) this.glances.push({ kind, t0, t1 }); }
  /** Was a relevant glance completed within the freshness window? (observation-control proxy, game design) */
  observedSince(kinds: Glance['kind'][], since: number) { return this.glances.some((g) => kinds.includes(g.kind) && g.t1 >= since); }

  incident(key: string, o: Parameters<Ledger['add']>[2], debounce?: number) {
    // mode-aware treatment from the mistake matrix (Часови teach; Полагање counts official items only)
    const c = classify(key, [...o.ruleIds, ...(o.exam ?? [])], this.config.mode, this.env.id);
    if (c) {
      const items = examItemsFor(c, o.exam);
      const action = actionFor(c, items);
      const ref = c.exam ? sourceLine(c.m, { action, exam: items.length ? items : c.cell.exam }) : (c.m.exam[c.place].exam?.length ? `На испит: ${sourceLine(c.m, c.m.exam[c.place])}` : sourceLine(c.m, { action: 'none' }));
      o = { ...o, exam: items, severity: severityFor(c, items), cls: { mistake: c.m.id, action, exam: c.exam, source: ref, status: c.m.status, why: c.m.why } };
    } else if (this.config.mode !== 'exam') o = { ...o, exam: [] }; // a lesson is never an official exam
    const inc = this.ledger.add(this.t, key, { ...o, pos: o.pos ?? { x: this.player.x, y: this.player.y } }, debounce);
    if (inc) {
      this.emit({ type: 'incident', incident: inc });
      if (c && !c.exam) {
        const a = inc.cls!.action as Action;
        if (c.m.say && a !== 'note' && a !== 'none' && a !== 'gameOnly') this.say(c.m.say, a === 'warn' ? 2 : 3);
        else if (c.m.say && a === 'note') this.coach(c.m.say);
        if (MATRIX_CONFIG.lessonRetry.includes(a)) this.emit({ type: 'retryOffer', incident: inc });
      }
      if (inc.severity === 'critical' && (this.config.mode === 'exam' || this.config.mode === 'challenge') && !this.failed && (this.config.mode !== 'exam' || MATRIX_CONFIG.examEndOnCritical)) {
        this.failed = inc;
        this.emit({ type: 'fail', incident: inc });
        this.finish();
      }
    }
    return inc;
  }

  // ------------------------------------------------------------------ step
  // ---- unstick: safe-spot history + automatic rewind when input produces no motion
  private safe: { t: number; x: number; y: number; h: number }[] = [];
  private safeT = 0; private stuckT = 0;
  /** set when the sim rewound itself; the engine reads and clears it (message + camera reset) */
  rewound = false;
  private bodiesNow(): DynamicBody[] { return [...this.cars.filter((c) => !c.done), ...this.peds.filter((p) => !p.done), ...this.extraBodies()]; }
  private trackUnstick(dt: number, c: Controls) {
    const p = this.player;
    this.safeT += dt;
    if (this.safeT >= 0.5) {
      this.safeT = 0;
      if (p.penetration(p.pose, this.world, this.bodiesNow()) === 0) { this.safe.push({ t: this.t, x: p.x, y: p.y, h: p.h }); if (this.safe.length > 40) this.safe.shift(); }
    }
    // "stuck" = asking for drive (throttle, clutch engaged, no brakes) without moving, right after a contact
    const trying = c.throttle > 0.3 && (p.assist === 'auto' || p.clutchPedal < p.def.clutch.biteHigh) && p.engine === 'running' && p.parkingBrake < 0.5 && p.gear !== 'N' && c.brake < 0.2;
    const lastHit = this.contacts.length ? this.contacts[this.contacts.length - 1].t : -99;
    const afterCrash = this.t - lastHit < 8 || (this.stuckT > 0 && p.penetration(p.pose, this.world, this.bodiesNow()) > 0);
    this.stuckT = trying && afterCrash && Math.abs(p.vx) < 0.15 ? this.stuckT + dt : 0;
    if (this.stuckT > 2.5) this.rewind();
  }
  /** Put the car back on the last safe spot about `back` seconds ago (falls back to the oldest one). */
  rewind(back = 6, msg = 'Возилото се заглави — вратено малку назад.') {
    const p = this.player; this.stuckT = 0;
    const bodies = this.bodiesNow();
    const ok = (s: { x: number; y: number; h: number }) => p.penetration(s, this.world, bodies) === 0;
    const cands = this.safe.filter((s) => s.t <= this.t - back).reverse().concat(this.safe.slice().reverse());
    const spot = cands.find(ok);
    if (!spot) return false;
    p.x = spot.x; p.y = spot.y; p.h = spot.h; p.vx = 0; p.vy = 0; p.r = 0;
    this.safe = this.safe.filter((s) => s.t <= spot.t);
    this.rewound = true;
    this.say(msg, 2);
    return true;
  }

  step(dt: number, controls: Controls) {
    if (this.finished) return;
    this.t += dt;
    const bodies: DynamicBody[] = [...this.cars.filter((c) => !c.done), ...this.peds.filter((p) => !p.done), ...this.extraBodies()];
    const pl = this.player, keep = { x: pl.x, y: pl.y, h: pl.h, omegaE: pl.omegaE, steer: pl.steer };
    pl.step(dt, controls, this.world, bodies, this.t, (c) => this.onContact(c));
    // numerical safety net: a non-finite state is never allowed to reach the renderer or the score
    if (![pl.x, pl.y, pl.h, pl.vx, pl.vy, pl.r, pl.omegaE, pl.z].every(Number.isFinite)) {
      Object.assign(pl, keep, { vx: 0, vy: 0, r: 0, z: Number.isFinite(pl.z) ? pl.z : 0 });
      if (!Number.isFinite(pl.omegaE)) pl.omegaE = 0;
    }
    for (const e of this.player.drainEvents()) this.onVehicleEvent(e);
    this.trackUnstick(dt, controls);
    const ctx = { playerQuad: this.player.quad(this.player.pose, 0.3), playerPose: this.player.pose, cars: this.cars, peds: this.peds };
    for (const c of this.cars) c.update(dt, ctx);
    for (const s of this.strollers) s.update(dt);
    this.mission.update(this, dt);
    this.cars = this.cars.filter((c) => !c.done);
    this.monitor(dt, controls);
    this.rec.push(this.t, dt, () => this.snapshot());
    if (this.mission.done) this.finish();
  }

  private onContact(c: Contact) {
    this.contacts.push(c);
    this.emit({ type: 'contact', contact: c });
    const strict = this.config.mode === 'exam' || this.config.mode === 'challenge';
    // four distinct contact kinds; c.speed is the closing speed (m/s)
    if (c.kind === 'pedestrian') {
      this.incident('contact-ped-' + c.id, { layer: 'safety', severity: 'critical', ruleIds: ['law.ped.attention'], text: 'Удар во пешак.', exam: ['exam4.1H'], evidence: `${c.speed.toFixed(1)} m/s` }, 10);
    } else if (c.kind === 'vehicle' && c.speed >= DETECT.collisionRelativeSpeedMps) {
      this.incident('collision-veh-' + c.id, { layer: 'safety', severity: 'critical', ruleIds: ['law.speed.adapt'], text: 'Судир со возило.', exam: ['exam4.1H'], evidence: `${c.speed.toFixed(1)} m/s ≥ ${DETECT.collisionRelativeSpeedMps} m/s` }, 10);
    } else if (c.kind === 'vehicle') {
      // a light touch is never automatically the 51-point collision item
      this.incident('touch-veh-' + c.id, { layer: 'safety', severity: 'significant', ruleIds: ['game.contact'], text: 'Лесен допир со возило.', evidence: `${c.speed.toFixed(1)} m/s < ${DETECT.collisionRelativeSpeedMps} m/s` }, 10);
    } else if (c.kind === 'curb') {
      this.incident('curb', { layer: 'technique', severity: strict && this.env.id !== 'polygon' ? 'serious' : 'minor', ruleIds: ['game.contact'], text: 'Удар во рабникот.', exam: this.env.id !== 'polygon' ? ['exam4.1Zh'] : [] }, 4);
    } else if (c.kind === 'parked' || c.kind === 'pole' || c.kind === 'barrier' || c.kind === 'wall' as never) {
      this.incident('obj-' + c.id, { layer: 'safety', severity: c.speed > 2 ? 'serious' : 'significant', ruleIds: ['game.contact'], text: 'Удар во објект.' }, 5);
    }
    this.mission.onContact?.(this, c);
  }

  private onVehicleEvent(e: VehicleEvent) {
    this.emit({ type: 'vehicle', e });
    const road = this.env.id !== 'polygon';
    const tx = (key: string, sev: Incident['severity'], text: string, exam: string[] = [], rules: string[] = ['tech.smooth'], debounce = 5) =>
      this.incident(key, { layer: 'technique', severity: sev, ruleIds: rules, text, exam }, debounce);
    switch (e.type) {
      case 'stall': tx('stall', 'minor', 'Изгасна моторот.', road ? ['exam4.1A'] : []); this.coach('Изгасна моторот. Обезбеди го возилото и стартувај повторно.', 2); break;
      case 'jerk': tx('jerk', 'minor', 'Нагло пуштање на кумплунгот.', road ? ['exam4.1A'] : []); break;
      case 'startInGear': tx('startInGear', 'minor', 'Палење со вклучена брзина.', road ? ['exam4.1Nj'] : []); break;
      case 'gearRefusedClutch': case 'gearRefusedSpeed': tx('gear', 'minor', e.type === 'gearRefusedSpeed' ? 'Обид за премала брзина при голема брзина.' : 'Менување брзина без кумплунг.', road ? ['exam4.1V'] : []); break;
      case 'rollback': if (road) tx('rollback', 'significant', `Возилото се врати назад (${e.data?.m ?? ''} m).`, ['exam4.1O']); break;
      case 'clutchRiding': tx('riding', 'minor', 'Возиш со нога на кумплунгот.', road ? ['exam4.1R'] : [], ['tech.smooth'], 20); break;
      case 'movingWithParkingBrake': tx('pb', 'significant', 'Возиш со крената рачна.', road ? ['exam4.1B'] : [], ['tech.smooth'], 20); break;
      case 'wheelspin': tx('spin', 'minor', 'Пролизгување на тркалата при тргнување.', []); break;
      case 'overRev': tx('overrev', 'note', 'Превисоки вртежи.', [], ['tech.gear.lug'], 15); break;
    }
    this.mission.onVehicleEvent?.(this, e);
  }

  private monitor(dt: number, c: Controls) {
    const p = this.player;
    // ---- speed limit (law): settlement 50 / outside 90 / sign; truck ≤ 80 (чл. 38)
    let lim = this.world.speedLimitAt(p.x, p.y);
    if (p.def.family === 'truck' && lim.kmh > 80) lim = { kmh: 80, ruleId: 'law.speed.truck' };
    const sp = kmh(Math.abs(p.vx));
    if (this.env.id !== 'polygon') {
      if (sp > lim.kmh + DETECT.overspeedToleranceKmh) {
        if (this.overSince === null) { this.overSince = this.t; this.overMax = 0; this.overLimit = lim.kmh; this.overRule = lim.ruleId; }
        this.overMax = Math.max(this.overMax, sp);
        if (this.t - this.overSince > DETECT.overspeedDurationSeconds) {
          const over = this.overMax - this.overLimit;
          this.incident('speed', { layer: 'safety', severity: over > 20 ? 'serious' : 'significant', ruleIds: [this.overRule], text: `Брзина ${Math.round(this.overMax)} km/h каде што е дозволено ${this.overLimit} km/h.`, exam: ['exam4.2R'] }, 15);
        }
      } else this.overSince = null;
    }
    // ---- neutral / clutch-down coasting on a descent (physical consequence + technique note)
    const coasting = (p.gear === 'N' || p.clutchPedal > 0.7) && p.grade < -0.04 && p.vx > 5 && p.vx > 0;
    this.neutralDescent = coasting ? this.neutralDescent + dt : 0;
    if (this.neutralDescent > 4) this.incident('neutral-descent', { layer: 'technique', severity: 'note', ruleIds: ['tech.neutral.descent'], text: 'На надолнина без поврзан мотор: нема моторно сопирање.' }, 30);
    // ---- unnecessary horn (warning signals)
    if (c.horn && this.t - this.lastHorn > 1) {
      this.lastHorn = this.t;
      if (this.env.id === 'city' && this.config.mode === 'exam') this.incident('horn', { layer: 'technique', severity: 'minor', ruleIds: ['law.signs'], text: 'Употреба на сирена без потреба.', exam: ['exam4.2Lj'] }, 10);
    }
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.emit({ type: 'finish' });
  }

  snapshot(): Frame {
    const p = this.player;
    return {
      t: this.t,
      p: { x: p.x, y: p.y, h: p.h, v: p.vx, steer: p.steer, thr: p.throttle, brk: p.brake, ind: p.indicator === 'left' ? 1 : p.indicator === 'right' ? 2 : 0, gear: p.gear === 'R' ? 1 : 0,
        g: String(p.gear), rpm: Math.round(p.rpm), clu: p.clutchPedal, pb: p.parkingBrake, z: p.z, eng: p.engine },
      a: [
        ...this.cars.filter((c) => !c.done).map((c) => { const q = c.pose; return { id: c.id, k: 'car' as const, x: q.x, y: q.y, h: q.h, ind: (c.indicator === 'left' ? 1 : c.indicator === 'right' ? 2 : 0) as 0 | 1 | 2, brk: c.braking }; }),
        ...this.peds.filter((d) => !d.done).map((d) => ({ id: d.id, k: 'ped' as const, x: d.pos.x, y: d.pos.y, h: d.h, ind: 0 as const, brk: false, ph: d.phase })),
      ],
      x: { ...this.extraState },
    };
  }

  result(): AttemptResult {
    const L = this.ledger;
    const safety = Math.max(0, 100 - L.gameDeduction('safety'));
    const technique = Math.max(0, 100 - L.gameDeduction('technique'));
    const mission = Math.round(this.mission.missionScore(this));
    const strict = this.config.mode === 'exam' || this.config.mode === 'challenge';
    const game = this.failed && strict ? 0 : Math.round(0.45 * mission + 0.35 * safety + 0.2 * technique);
    const form = this.mission.examForm;
    const total = form ? L.examTotal(form) : 0;
    return {
      config: this.config, finished: this.finished, failed: this.failed,
      gameScore: Math.max(0, Math.min(100, game)),
      layers: { safety, technique, mission },
      incidents: L.incidents, items: this.mission.items(this),
      exam: form && this.config.mode === 'exam' ? { form, total, passed: total <= MATRIX_CONFIG.examThreshold[this.env.id === 'polygon' ? 'polygon' : 'city'] && !this.failed } : null,
      duration: this.t, odometer: this.player.odometer,
      versions: { content: CONTENT_VERSION, rules: RULES_VERSION, physics: PHYSICS_VERSION },
    };
  }

  /** helpers for missions */
  near(a: Vec2, r: number) { return Math.hypot(a.x - this.player.x, a.y - this.player.y) < r; }
  setGear(g: Gear) { this.player.gear = g; }
}

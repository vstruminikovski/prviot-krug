// Living city layer: lane-graph drivers with junction control, a signal-controlled pedestrian
// crossing on Бакалска, a zebra on Јаворова with seeded pedestrian intent, and a double-parked
// delivery van to bypass. All behaviour is deterministic per TrafficSeed/ScenarioSeed.
import { Path, angleDiff, clamp, obbCorners, type Vec2 } from '../math';
import { NpcCar, Pedestrian } from '../sim/actors';
import type { Sim } from '../sim/sim';
import { EDGES, LINKS, NODES, edgeById, linksFrom, nodeById, pathFor, type Edge } from './cityGraph';
import { CAR_COLORS, plateFor, type CarType } from '../content/generate';

// ---------------------------------------------------------------- signals
export type Lamp = 'green' | 'yellow' | 'red' | 'redYellow';
export const SIGNAL_X = 360; // pedestrian signal crossing on Бакалска
export const SIGNAL_STOP_E = 354.6; // eastbound stop line
export const SIGNAL_STOP_W = 365.4; // westbound stop line
const CYCLE = [
  { lamp: 'green' as Lamp, ped: 'red', d: 16 }, { lamp: 'yellow' as Lamp, ped: 'red', d: 3 },
  { lamp: 'red' as Lamp, ped: 'red', d: 1.5 }, { lamp: 'red' as Lamp, ped: 'green', d: 8 },
  { lamp: 'red' as Lamp, ped: 'flash', d: 3 }, { lamp: 'redYellow' as Lamp, ped: 'red', d: 1.5 },
];
const CYCLE_LEN = CYCLE.reduce((a, c) => a + c.d, 0);

export class SignalCrossing {
  offset: number;
  lamp: Lamp = 'green'; ped: 'red' | 'green' | 'flash' = 'red';
  yellowSince = -1;
  constructor(offset: number) { this.offset = offset; }
  update(t: number) {
    let u = (t + this.offset) % CYCLE_LEN;
    for (const c of CYCLE) {
      if (u < c.d) {
        if (c.lamp === 'yellow' && this.lamp !== 'yellow') this.yellowSince = t;
        this.lamp = c.lamp; this.ped = c.ped as never; return;
      }
      u -= c.d;
    }
  }
  /** vehicles may proceed past the stop line */
  go() { return this.lamp === 'green'; }
}

// ---------------------------------------------------------------- lane-graph driver
export class LaneCar extends NpcCar {
  edge: Edge;
  profile: 'cautious' | 'ordinary' | 'hurried';
  waitAt = 0;
  constructor(id: string, type: CarType, color: string, plate: string, edge: Edge, s0: number, vTarget: number, profile: LaneCar['profile']) {
    super(id, type, color, plate, pathFor(edge), s0, vTarget, vTarget, false);
    this.edge = edge;
    this.profile = profile;
  }
}

interface PedAgent { ped: Pedestrian; intent: 'cross' | 'phone' | 'jogParallel' | 'jogTurn' | 'hidden'; state: string; t: number; side: 1 | -1; resolved: boolean; crossedPlayerWait: boolean }

export class CityTraffic {
  signal: SignalCrossing;
  cars: LaneCar[] = [];
  van: NpcCar | null = null;
  vanX = 410;
  private zebraPed: PedAgent | null = null;
  private signalPeds: Pedestrian[] = [];
  private zebraRuns = 0;
  private nextZebra = 0;
  private playerRedChecked = false;
  private ambientCount: number;

  constructor(private sim: Sim, quiet: boolean) {
    const r = sim.rng.traffic;
    this.signal = new SignalCrossing(r.range(0, CYCLE_LEN));
    this.ambientCount = quiet ? 3 : 7;
    // ambient cars spread over edges away from the start
    const starts = ['BW2', 'GW2', 'GE1', 'TS', 'JN', 'CN', 'BE2', 'GW1', 'TN'];
    for (let i = 0; i < this.ambientCount; i++) {
      const e = edgeById(starts[i % starts.length]);
      const type = r.pick<CarType>(['stojadin', 'hatch', 'sedan', 'compact', 'van', 'yugo']);
      const prof = r.pick<LaneCar['profile']>(['cautious', 'ordinary', 'ordinary', 'hurried']);
      const c = new LaneCar(`amb-${i}`, type, r.pick(CAR_COLORS), plateFor(r), e, r.range(10, 60), prof === 'hurried' ? 10 : prof === 'cautious' ? 7 : 8.5, prof);
      this.cars.push(c);
      sim.cars.push(c);
      sim.actorMeta.set(c.id, { kind: 'car', type, color: c.color, plate: c.plate });
    }
    // double-parked delivery van with hazards (seeded presence)
    if (sim.rng.scenario.chance(0.75) && !quiet) {
      this.vanX = 395 + sim.rng.scenario.range(0, 25);
      const vp = new Path([{ x: this.vanX - 0.1, y: -2.4 }, { x: this.vanX + 0.1, y: -2.4 }]);
      this.van = sim.spawnCar('van-dbl', 'van', '#e9e5da', plateFor(sim.rng.scenario), vp, 0, 0, 0);
      this.van.despawnAtEnd = false; this.van.indicator = 'off';
      sim.extraState.vanHaz = 1;
    }
    this.nextZebra = 0;
  }

  update(sim: Sim, dt: number) {
    this.signal.update(sim.t);
    sim.extraState.sig = this.signal.lamp; sim.extraState.ped = this.signal.ped;
    for (const c of this.cars) this.drive(sim, c, dt);
    this.updateSignalPeds(sim, dt);
    this.updateZebra(sim, dt);
    this.evaluatePlayerSignal(sim);
    this.evaluateVanBypass(sim);
  }

  // ---- NPC driving: edge following, choosing links, junction control
  private drive(sim: Sim, c: LaneCar, _dt: number) {
    if (c.s >= c.path.length - c.L / 2 - 0.3) {
      const opts = linksFrom(c.edge.id);
      const l = c.plannedLink && c.plannedLink.from === c.edge.id ? c.plannedLink : opts[Math.floor(sim.rng.traffic.next() * opts.length) % opts.length];
      c.plannedLink = undefined;
      const end = c.path.at(c.path.length);
      c.edge = edgeById(l.to);
      c.path = pathFor(c.edge, l.via, end);
      c.s = 0;
      c.indicator = 'off';
      c.waitAt = 0;
    }
    const remaining = c.path.length - c.s;
    const node = nodeById(c.edge.to);
    const nextLinks = linksFrom(c.edge.id);
    // indicate a turn early
    if (remaining < 35 && c.indicator === 'off' && nextLinks.length && !c.plannedLink) {
      c.plannedLink = nextLinks[Math.floor(sim.rng.traffic.next() * nextLinks.length) % nextLinks.length];
    }
    let hold: number | null = null;
    if (remaining < 25) {
      if (!this.mayEnter(sim, c, node)) hold = c.path.length - 0.4;
    }
    // signal stop lines on Бакалска
    if (!this.signal.go()) {
      const stopX = c.edge.id === 'BE2' ? SIGNAL_STOP_E : c.edge.id === 'BW2' ? SIGNAL_STOP_W : null;
      if (stopX !== null) {
        const p = c.pose;
        const dist = c.edge.id === 'BE2' ? stopX - (p.x + c.L / 2) : (p.x - c.L / 2) - stopX;
        const canStop = dist > (c.v * c.v) / (2 * 3.5) - 0.5;
        if (dist > -0.5 && (this.signal.lamp !== 'yellow' || canStop)) hold = c.s + c.L / 2 + Math.max(0, dist);
      }
    }
    // narrow Тиха: one direction at a time (reservation), the player counts too
    if (c.edge.id === 'TS' && c.pose.y > 150 && c.pose.y < 175 && this.narrowBusy(sim, 'south', c)) hold = c.path.project({ x: 478.6, y: 158 }, c.s);
    if (c.edge.id === 'TN' && c.pose.y > 60 && c.pose.y < 86 && this.narrowBusy(sim, 'north', c)) hold = c.path.project({ x: 481.4, y: 80 }, c.s);
    // bypassing the delivery van: wait for a gap in the oncoming lane
    if (this.van && c.edge.id === 'BE2' && c.pose.x > this.vanX - 30 && c.pose.x < this.vanX - 9 && this.oncomingNear(sim, this.vanX, 45)) hold = c.path.project({ x: this.vanX - 9, y: -1.75 }, c.s);
    c.holdAtS = hold;
    c.indicator = remaining < 35 && c.plannedLink && c.plannedLink.turn !== 'straight' ? c.plannedLink.turn : c.indicator === 'left' || c.indicator === 'right' ? (remaining > 35 ? 'off' : c.indicator) : 'off';
    if (c.holdAtS !== null && c.v < 0.1) c.waitAt += 1 / 60; else c.waitAt = 0;
  }

  private mayEnter(sim: Sim, c: LaneCar, node: (typeof NODES)[number]): boolean {
    const box = node.box;
    const inBox = (x: number, y: number) => x > box.x0 - 1 && x < box.x1 + 1 && y > box.y0 - 1 && y < box.y1 + 1;
    const me = c.pose;
    const myH = me.h;
    // box occupied by someone else
    for (const o of sim.cars) if (o !== c && !o.done && inBox(o.pose.x, o.pose.y)) return false;
    if (inBox(sim.player.x, sim.player.y)) return false;
    if (node.control !== 'rightHand') return true;
    // ЗБСП чл. 41 ст. 1: yield to traffic approaching from the right; ст. 2: left turners yield to oncoming
    const approaching: { x: number; y: number; h: number; v: number }[] = [
      ...sim.cars.filter((o) => o !== c && !o.done).map((o) => ({ ...o.pose, v: o.v })),
      { x: sim.player.x, y: sim.player.y, h: sim.player.h, v: sim.player.vx },
    ];
    const plan = c.plannedLink;
    for (const a of approaching) {
      const dx = node.c.x - a.x, dy = node.c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 45 || d < 3) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), a.h)) > 0.6) continue; // not heading to this node
      const tta = d / Math.max(a.v, 1);
      const rel = angleDiff(a.h, myH);
      const fromRight = rel > 0.9 && rel < 2.3; // other's heading is ~90° CCW from mine → it comes from my right
      const oncoming = Math.abs(Math.abs(rel) - Math.PI) < 0.5;
      if (fromRight && tta < 4) return c.waitAt > 9; // bounded deadlock fallback
      if (oncoming && plan?.turn === 'left' && tta < 4) return false;
    }
    return true;
  }

  private narrowBusy(sim: Sim, dir: 'north' | 'south', self: NpcCar) {
    const inSec = (x: number, y: number) => x > 477 && x < 483 && y > 86 && y < 156;
    const p = sim.player;
    if (inSec(p.x, p.y) && ((dir === 'south' && Math.sin(p.h) > 0) || (dir === 'north' && Math.sin(p.h) < 0))) return true;
    for (const o of sim.cars) {
      if (o === self || o.done) continue;
      const q = o.pose;
      if (inSec(q.x, q.y) && ((dir === 'south' && Math.sin(q.h) > 0.3) || (dir === 'north' && Math.sin(q.h) < -0.3))) return true;
    }
    return false;
  }

  private oncomingNear(sim: Sim, x: number, range: number) {
    const p = sim.player;
    if (Math.abs(p.x - x) < range && Math.cos(p.h) < -0.5 && Math.abs(p.y) < 3.5) return true;
    return sim.cars.some((o) => !o.done && Math.abs(o.pose.x - x) < range && Math.cos(o.pose.h) < -0.5 && Math.abs(o.pose.y) < 3.5);
  }

  // ---- signal crossing pedestrians
  private updateSignalPeds(sim: Sim, dt: number) {
    if (this.signalPeds.length === 0) {
      const r = sim.rng.ped;
      const n = 2 + r.int(0, 1);
      for (let i = 0; i < n; i++) {
        const fromSouth = i % 2 === 0;
        const y0 = fromSouth ? -5.2 : 5.2, y1 = fromSouth ? 5.6 : -5.6;
        const x = SIGNAL_X - 1.2 + i * 0.9;
        const path = new Path([{ x: x - (fromSouth ? 12 : -12), y: y0 }, { x, y: y0 }, { x, y: y1 }, { x: x + (fromSouth ? 14 : -14), y: y1 }], 0.5, 0.25);
        const ped = sim.spawnPed(`sig-ped-${i}`, { coat: r.pick(['#5a6b4a', '#7a3b2e', '#2e3e5e', '#c9a66b']), hair: r.pick(['#2b2018', '#c8c2b8', '#4a3020']), carry: r.pick(['none', 'bag', 'groceries']), height: r.range(1.55, 1.85), skirt: r.chance(0.4) }, path, { curb: path.project({ x, y: y0 }), far: path.project({ x, y: y1 }) });
        ped.state = 'walk'; ped.speed = r.range(1.0, 1.35);
        this.signalPeds.push(ped);
      }
    }
    for (const ped of this.signalPeds) {
      if (ped.done) continue;
      if (ped.state === 'walk') { ped.advance(dt); if (ped.s >= ped.markers.curb) ped.state = 'wait'; }
      else if (ped.state === 'wait') { if (this.signal.ped === 'green') { ped.state = 'cross'; ped.onRoad = true; } }
      else if (ped.state === 'cross') { ped.advance(dt, ped.speed * (this.signal.ped === 'flash' ? 1.3 : 1)); if (ped.s >= ped.markers.far) { ped.state = 'after'; ped.onRoad = false; } }
      else if (ped.state === 'after') ped.advance(dt);
    }
    if (this.signalPeds.every((p) => p.done)) {
      for (const p of this.signalPeds) this.sim.peds = this.sim.peds.filter((q) => q !== p);
      this.signalPeds = [];
    }
  }

  // ---- unsignalised zebra on Јаворова with seeded, observable intent
  private updateZebra(sim: Sim, dt: number) {
    const p = sim.player;
    const ZY = 130;
    if (!this.zebraPed && sim.t > this.nextZebra) {
      const r = sim.rng.ped;
      const intent = r.pick<PedAgent['intent']>(['cross', 'phone', 'jogParallel', 'jogTurn', 'cross', 'hidden']);
      const side: 1 | -1 = intent === 'hidden' ? 1 : -1;
      const sx = side * 5.0;
      const jog = intent === 'jogParallel' || intent === 'jogTurn';
      const start = { x: sx, y: ZY + (jog ? 40 : 18) };
      const pts: Vec2[] = intent === 'jogParallel' ? [start, { x: sx, y: ZY - 60 }]
        : intent === 'phone' ? [start, { x: sx, y: ZY + 1.2 }, { x: sx - 0.5, y: ZY + 0.8 }, { x: sx - 1.5, y: ZY - 25 }]
        : [start, { x: sx, y: ZY + 0.2 }, { x: side * 3.5, y: ZY }, { x: -side * 3.5, y: ZY }, { x: -side * 5, y: ZY - 0.5 }, { x: -side * 5, y: ZY - 25 }];
      const path = new Path(pts, 0.6, 0.25);
      const look = jog ? { coat: '#d94f3a', hair: '#1a1a1a', carry: 'none' as const, height: 1.78 } : { coat: r.pick(['#5b6b8a', '#8a5a44', '#3b4a3a']), hair: r.pick(['#d9d4cc', '#2b2018']), carry: r.pick(['groceries', 'bag', 'none'] as const), height: r.range(1.55, 1.8), skirt: r.chance(0.5) };
      const ped = sim.spawnPed(`zebra-${this.zebraRuns++}`, look, path, { curb: path.project({ x: side * 3.5, y: ZY }), far: path.project({ x: -side * 3.5, y: ZY }), stop: path.project({ x: sx, y: ZY + 1.2 }) });
      ped.state = 'walk'; ped.speed = jog ? 2.6 : r.range(1.0, 1.3);
      this.zebraPed = { ped, intent, state: 'approach', t: 0, side, resolved: false, crossedPlayerWait: false };
      sim.extraState.zebraIntent = intent;
    }
    const z = this.zebraPed;
    if (!z) return;
    const ped = z.ped;
    z.t += dt;
    // distance the player needs to stop comfortably (game-design response allowance, not a legal constant)
    const pDist = p.y - ZY - p.L / 2;
    const approachingPlayer = Math.abs(p.x) < 3.5 && Math.sin(p.h) < -0.5 && pDist > 0;
    const needed = (p.vx * p.vx) / (2 * 4) + p.vx * 1.1 + 2;
    if (z.intent === 'phone') {
      if (ped.state === 'walk') { ped.advance(dt); if (ped.s >= ped.markers.stop) { ped.state = 'idle'; z.t = 0; } }
      else if (ped.state === 'idle') { if (z.t > 9) ped.state = 'after'; }
      else ped.advance(dt, 1.0);
    } else if (z.intent === 'jogParallel') {
      ped.advance(dt);
    } else {
      if (ped.state === 'walk') {
        // the jogger visibly slows and turns before stepping out (readable cue)
        const toCurb = ped.markers.curb - ped.s;
        const sp = z.intent === 'jogTurn' && toCurb < 8 ? Math.max(1.3, ped.speed * (toCurb / 8)) : ped.speed;
        ped.advance(dt, sp);
        if (ped.s >= ped.markers.curb - 0.05) { ped.state = 'wait'; z.t = 0; }
      } else if (ped.state === 'wait') {
        const carTooClose = approachingPlayer && pDist < needed && p.vx > 2;
        const npcClose = sim.cars.some((c) => !c.done && Math.abs(c.pose.x) < 3.5 && Math.abs(c.pose.y - ZY) < 12 && c.v > 2);
        if (z.t > 0.6 && !carTooClose && !npcClose) { ped.state = 'cross'; ped.onRoad = true; }
      } else if (ped.state === 'cross') {
        const blocked = Math.abs(p.y - ZY) < p.L / 2 + 0.6 && Math.abs(p.x - ped.pos.x) < 1.6;
        if (!blocked) ped.advance(dt, z.intent === 'jogTurn' ? 2.0 : ped.speed * 0.85);
        if (ped.s >= ped.markers.far) { ped.state = 'after'; ped.onRoad = false; }
      } else ped.advance(dt);
    }
    // evaluation when the player's front crosses the zebra line (southbound)
    if (!z.resolved && approachingPlayer && pDist < 2.2 && pDist > -0.5) {
      z.resolved = true;
      const inPath = ped.state === 'cross' && ped.pos.x < 1.0 && ped.pos.x > -4;
      const stepping = ped.state === 'wait';
      if (inPath || stepping) {
        sim.incident('zebra-' + ped.id, { layer: 'safety', severity: 'serious', ruleIds: ['law.ped.crossing'], text: 'Не го пропушти пешакот на обележаниот премин.', exam: ['exam4.2Gj'] }, 30);
      } else if (z.intent === 'phone' || z.intent === 'jogParallel') {
        sim.incident('zebra-ok-' + ped.id, { layer: 'mission', severity: 'note', ruleIds: ['law.ped.attention'], text: z.intent === 'phone' ? 'Добро процени: пешакот застана на тротоарот со телефонот.' : 'Добро процени: тркачот продолжи по тротоарот.' }, 30);
      }
    }
    if (ped.done) {
      sim.peds = sim.peds.filter((q) => q !== ped);
      this.zebraPed = null;
      this.nextZebra = sim.t + 6 + sim.rng.ped.range(0, 10);
    }
    // instructor prompt in learning modes — a prompt to observe, not an order to stop
    if ((sim.config.mode === 'lesson' || sim.config.assist === 'learn') && approachingPlayer && pDist < 45 && pDist > 25 && !z.crossedPlayerWait) {
      z.crossedPlayerWait = true;
      sim.say('Внимавај на пешакот кај преминот.', 1);
    }
  }

  // ---- player at the signal (ЗБСП чл. 43 ст. 1)
  private evaluatePlayerSignal(sim: Sim) {
    const p = sim.player;
    if (Math.abs(p.y) > 3.6) { this.playerRedChecked = false; return; }
    const east = Math.cos(p.h) > 0.7, west = Math.cos(p.h) < -0.7;
    const front = p.front();
    const crossed = (east && front.x > SIGNAL_STOP_E && front.x < SIGNAL_STOP_E + 1.5) || (west && front.x < SIGNAL_STOP_W && front.x > SIGNAL_STOP_W - 1.5);
    if (!crossed) { if (Math.abs(p.x - SIGNAL_X) > 25) this.playerRedChecked = false; return; }
    if (this.playerRedChecked) return;
    this.playerRedChecked = true;
    const lamp = this.signal.lamp;
    if (lamp === 'red' || lamp === 'redYellow') {
      sim.incident('red', { layer: 'safety', severity: 'critical', ruleIds: ['law.signal.lights'], text: 'Помина на црвено светло.', exam: ['exam4.2S'] }, 20);
    } else if (lamp === 'yellow') {
      // could the driver have stopped comfortably when yellow came on? (3 m/s², 1 s response — game assumption)
      const tY = sim.t - this.signal.yellowSince;
      const f = sim.rec.at(sim.t - tY);
      if (f) {
        const v = Math.abs(f.p.v);
        const distAtYellow = Math.abs((east ? SIGNAL_STOP_E : SIGNAL_STOP_W) - (f.p.x + (east ? 1 : -1) * p.L / 2));
        const needed = v * 1.0 + (v * v) / (2 * 3.0);
        if (distAtYellow > needed + 2) sim.incident('yellow', { layer: 'safety', severity: 'significant', ruleIds: ['law.signal.lights'], text: `Жолто се вклучи на ${Math.round(distAtYellow)} m — можеше безбедно да запреш.`, evidence: `потребно ≈ ${Math.round(needed)} m` }, 20);
      }
    }
  }

  // ---- bypassing the van: forcing oncoming traffic to brake is unsafe (чл. 50, 54)
  private evaluateVanBypass(sim: Sim) {
    if (!this.van) return;
    const p = sim.player;
    if (p.x < this.vanX - 6 || p.x > this.vanX + 6 || Math.cos(p.h) < 0.5) return;
    if (p.y > -1.2) {
      const forced = sim.cars.find((o) => !o.done && o !== this.van && Math.cos(o.pose.h) < -0.5 && Math.abs(o.pose.x - p.x) < 25 && o.hardBrake);
      if (forced) sim.incident('van-bypass', { layer: 'safety', severity: 'serious', ruleIds: ['law.overtake.safe'], text: 'Обиколувањето го принуди возилото од спротивно да сопира нагло.', exam: ['exam4.2D'] }, 30);
    }
  }
}

// lightweight extension so the driver can plan its next link
declare module '../sim/actors' {
  interface NpcCar { plannedLink?: (typeof LINKS)[number] }
}
void EDGES; void clamp; void obbCorners;

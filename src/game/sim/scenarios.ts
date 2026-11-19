// Runtime for the four scored situations and one unscored situation.
// Each runtime: arms on a trigger zone, spawns its actors, adapts their timing until the
// player commits (so the situation actually happens at normal city speed), detects the
// first visible cue, and evaluates only predicates that can be observed reliably.
import { Path, angleDiff, clamp, inRect, kmh, rect, type Pose, type Vec2 } from '../math';
import { NpcCar, Pedestrian } from './actors';
import type { Contact } from '../vehicles/vehicle';
import { SCENARIOS, type ScenarioId } from '../content/scenarios';
import { JUNCTIONS, TIHA_NARROW, CROSSINGS, SIGNS } from '../content/debarMaalo';
import type { Sim } from './sim';
import { DETECT } from './params';

export type Outcome = 'pending' | 'pass' | 'fail' | 'fail-route' | 'fail-signal' | 'collision' | 'missed';

export interface ItemResult { id: string; ok: boolean | null; detail: string }

export interface ScenarioResult {
  id: ScenarioId;
  outcome: Outcome;
  armedT: number | null;
  cueT: number | null;
  decisionT: number | null;
  endT: number | null;
  reaction: number | null;
  points: number;
  maxPoints: number;
  items: ItemResult[];
  did: string;
  focusActor: string | null;
  cuePos: Vec2 | null;
}

export interface RetrySetup { pose: Pose; v: number }

/** A rule decides the next metres: where to stop, whom to wait for, and how to say it. */
export interface YieldCue {
  dist: number; stopAt: Vec2; heading: number; actorId: string; visible: boolean;
  /** Часови: names the rule and the road user */ lesson: string;
  /** Полагање: only what a sign or the road itself tells you */ exam: string;
}

export abstract class ScenarioRuntime {
  abstract id: ScenarioId;
  abstract retry: RetrySetup;
  enabled = true;
  armed = false;
  finished = false;
  res!: ScenarioResult;
  protected doneAt: number | null = null;

  init() {
    this.armed = false; this.finished = false; this.doneAt = null;
    this.res = {
      id: this.id, outcome: 'pending', armedT: null, cueT: null, decisionT: null, endT: null, reaction: null,
      points: 0, maxPoints: this.id === 'x1' ? 0 : 25, items: [], did: '', focusActor: null, cuePos: null,
    };
  }

  get def() { return SCENARIOS.find((s) => s.id === this.id)!; }
  abstract update(sim: Sim, dt: number): void;
  /** null while the way is clear (or the situation is over) */
  yieldCue(_sim: Sim): YieldCue | null { return null; }
  onContact(_sim: Sim, _c: Contact) { /* optional */ }

  protected cue(sim: Sim, visible: boolean, pos: Vec2) {
    if (this.res.cueT === null && visible) { this.res.cueT = sim.t; this.res.cuePos = { ...pos }; }
  }

  /** Reaction: first brake press or throttle lift after the cue. */
  protected reaction(sim: Sim, until: number): number | null {
    const c = this.res.cueT;
    if (c === null) return null;
    // A throttle lift only counts if the foot stays off the gas for at least 1 s
    // (so tapping the key to hold a speed is not mistaken for a reaction).
    const sustainedLift = (t0: number) => {
      const later = sim.rec.sample(t0, t0 + 1);
      return later.length > 0 && later.every((f) => f.p.thr <= 0.05);
    };
    const t = sim.rec.firstWhere(c, until, (f, prev) => f.p.brk > 0.15 || (!!prev && prev.p.thr > 0.05 && f.p.thr <= 0.05 && f.p.v > 1 && sustainedLift(f.t)));
    if (t !== null) return Math.max(0, t - c);
    // already coasting/braking when the cue appeared
    const f0 = sim.rec.at(c);
    if (f0 && f0.p.thr <= 0.05 && f0.p.v < 6) return 0;
    return null;
  }

  protected anticipationPoints(r: number | null) { return r === null ? 0 : r <= 2.5 ? 5 : r <= 4 ? 3 : 0; }

  protected finish(sim: Sim, outcome: Outcome) {
    if (this.res.outcome !== 'pending') return;
    this.res.outcome = outcome;
    this.res.decisionT = sim.t;
    sim.emit({ type: 'scenario', id: this.id, outcome });
    // feed the safety layer of the shared ledger with the sourced rule
    const MAP: Record<string, [string, string[], string]> = {
      s1: ['law.priority.right', ['exam4.2B'], 'Не го пропушти возилото од десно.'],
      s2: ['law.meeting.obstacle', ['exam4.2T'], 'Не го пропушти возилото од спротивно кај пречката.'],
      s3: ['law.ped.crossing', ['exam4.2Gj'], 'Не ја пропушти пешачката на преминот.'],
      's4-route': ['law.signs', ['exam4.2O'], 'Влезе спротивно во еднонасочна улица.'],
      's4-signal': ['law.signalling', ['exam4.2K'], 'Свртувањето налево не беше навреме најавено.'],
    };
    const key = this.id === 's4' ? (outcome === 'fail-route' ? 's4-route' : 's4-signal') : this.id;
    if (outcome === 'fail' || outcome === 'collision' || outcome === 'fail-route' || outcome === 'fail-signal') {
      const m = MAP[key];
      if (m) sim.incident('scn-' + key, { layer: 'safety', severity: outcome === 'fail-signal' ? 'significant' : 'serious', ruleIds: [m[0]], text: m[2], exam: m[1] }, 60);
    }
  }

  protected close(sim: Sim, after = 2) {
    if (this.doneAt === null) this.doneAt = sim.t + after;
    if (sim.t >= this.doneAt && !this.finished) { this.finished = true; this.res.endT = sim.t; this.finalize(sim); }
  }

  /** Called at the end of the run for scenarios that never armed or never resolved. */
  closeMissed(sim: Sim) {
    if (this.finished) return;
    if (this.res.outcome === 'pending') this.res.outcome = 'missed';
    this.finished = true;
    this.res.endT = this.res.endT ?? sim.t;
    this.finalize(sim);
  }

  protected abstract finalize(sim: Sim): void;
}


// ---------------------------------------------------------------------------
// S1 — unsignalised junction, vehicle approaching from the right (ЗБСП чл. 41 ст. 1)
export class S1 extends ScenarioRuntime {
  id = 's1' as const;
  retry = { pose: { x: 150, y: -1.75, h: 0 }, v: 7.5 };
  npc: NpcCar | null = null;
  committed = false;
  maxApproach = 0;
  private entered = false;

  init() { super.init(); this.npc = null; this.committed = false; this.maxApproach = 0; this.entered = false; this.warned = false; }
  private warned = false;

  /** Conflict math (constant speeds): when would the priority car reach the player's lane, when
   *  would the player have left the priority car's lane, and the gap between the two (PET). */
  gap(sim: Sim): { cleared: boolean; eta: number; tClear: number; margin: number } {
    const p = sim.player, npc = this.npc;
    if (!npc || npc.done) return { cleared: true, eta: Infinity, tClear: 0, margin: Infinity };
    const npcFrontY = npc.pose.y + npc.L / 2, npcRearY = npc.pose.y - npc.L / 2;
    if (npcRearY > 0.3) return { cleared: true, eta: Infinity, tClear: 0, margin: Infinity };
    const eta = npcFrontY >= -3.5 ? 0 : (-3.5 - npcFrontY) / Math.max(npc.v, 0.1);
    // the priority car's lane: x ≈ 240.6 ± half its width (+0.3 m clearance)
    const laneFar = 240.6 + 1.0 + 0.3;
    const rear = p.x - Math.cos(p.h) * p.L / 2;
    const tClear = Math.max(0, laneFar - rear) / Math.max(p.v, 0.5);
    return { cleared: false, eta, tClear, margin: eta - tClear };
  }

  yieldCue(sim: Sim): YieldCue | null {
    if (!this.armed || this.res.outcome !== 'pending' || !this.npc || this.gap(sim).cleared) return null;
    const p = sim.player;
    const dBox = JUNCTIONS.J1.x0 - (p.x + Math.cos(p.h) * p.L / 2);
    if (dBox > 70 || dBox < -1) return null;
    const visible = this.res.cueT !== null;
    return { dist: dBox, stopAt: { x: JUNCTIONS.J1.x0 - 2.2 - p.L / 2, y: -1.75 }, heading: 0, actorId: this.npc.id, visible,
      lesson: visible ? 'Возило од десно има предност — запри пред крстосницата' : 'Крстосница без знаци за првенство — гледај десно, предност има десниот',
      exam: 'Знак: крстосување на патишта од иста важност' };
  }

  update(sim: Sim, dt: number) {
    const p = sim.player;
    const box = JUNCTIONS.J1;
    if (!this.armed) {
      if (inRect(rect(110, -3.5, 225, 3.5), p.x, p.y) && Math.cos(p.h) > 0.5) {
        this.armed = true; this.res.armedT = sim.t;
        const path = new Path([{ x: 241.6, y: -118 }, { x: 241.6, y: -6 }, { x: 239.6, y: 12 }, { x: 239.6, y: 150 }], 0);
        this.npc = sim.spawnCar('s1-car', 'stojadin', '#8b1e1e', 'SK 3317-BT', path, 0, 7, 7);
        this.res.focusActor = 's1-car';
      }
      return;
    }
    const npc = this.npc!;
    const front = p.x + Math.cos(p.h) * sim.player.L / 2;
    const dBox = box.x0 - front;
    const npcFrontY = npc.pose.y + npc.L / 2;
    // Adapt the other car's arrival until the player commits (30 m out)
    if (!this.committed && this.res.outcome === 'pending') {
      if (dBox < 30 || npcFrontY > -12) this.committed = true;
      else {
        const eta = dBox / Math.max(p.v, 6);
        const dN = -3.5 - npcFrontY;
        npc.vTarget = clamp(dN / Math.max(eta + 0.25, 0.6), 4.5, 10); // arrives just after the learner would
      }
    }
    // the other driver has priority but brakes rather than crash
    this.cue(sim, !npc.done && sim.world.los(p.pose, npc.pose) && Math.hypot(npc.pose.x - p.x, npc.pose.y - p.y) < 85 && npc.pose.y < -3.5, npc.pose);
    // Часови: the instructor names the danger the moment it can be seen
    if (this.res.cueT !== null && !this.warned && this.res.outcome === 'pending' && sim.config.mode !== 'exam') {
      this.warned = true;
      sim.say('Од десно доаѓа возило — тоа има предност. Запри пред крстосницата и пропушти го.', 2);
    }
    if (dBox < 15 && dBox > 0) this.maxApproach = Math.max(this.maxApproach, kmh(p.v));

    if (this.res.outcome === 'pending') {
      const inBox = front >= box.x0 && p.y > box.y0 - 0.5 && p.y < box.y1 + 0.5 && p.x < box.x1 + 3;
      if (inBox && !this.entered) {
        this.entered = true;
        const g = this.gap(sim);
        const ok = g.cleared || g.margin >= DETECT.yieldMinGapSeconds;
        this.res.did = g.cleared ? 'Влезе откако возилото од десно помина.'
          : g.eta < 0.2 ? 'Влезе додека возилото од десно беше веќе во крстосницата.'
          : `Возилото од десно ќе стигнеше за ${g.eta.toFixed(1)} с, а ти ќе ја ослободеше неговата лента за ${g.tClear.toFixed(1)} с — разлика ${g.margin.toFixed(1)} с (потребно ≥ ${DETECT.yieldMinGapSeconds} с).`;
        this.finish(sim, ok ? 'pass' : 'fail');
      } else if (npc.done && p.x > box.x1 + 10) {
        this.finish(sim, 'pass');
      } else if (p.x < 100 || p.y > 40 || p.y < -40) {
        // player turned off before the junction
        if (!inRect(rect(100, -40, 300, 40), p.x, p.y)) { this.res.did = 'Не помина низ крстосницата.'; this.finish(sim, 'missed'); }
      }
    }
    if (this.res.outcome !== 'pending') this.close(sim, 2.5);
  }

  onContact(sim: Sim, c: Contact) {
    if (c.id === 's1-car' && this.res.outcome !== 'collision') {
      this.res.outcome = 'pending';
      this.finish(sim, 'collision');
      this.res.did = 'Судир со возилото што имаше првенство.';
    }
  }

  protected finalize(sim: Sim) {
    const r = this.reaction(sim, this.res.decisionT ?? sim.t);
    this.res.reaction = r;
    const ok = this.res.outcome === 'pass';
    this.res.items = [
      { id: 'yield', ok: this.res.outcome === 'missed' ? null : ok, detail: this.res.did || '—' },
      { id: 'anticipate', ok: r === null ? null : r <= 2.5, detail: r === null ? 'Нема реакција по првиот знак.' : `Реакција ${r.toFixed(1)} с по првиот знак.` },
      { id: 'approach', ok: this.maxApproach ? this.maxApproach <= 30 : null, detail: this.maxApproach ? `Најголема брзина на последните 15 м: ${Math.round(this.maxApproach)} км/ч.` : '—' },
    ];
    this.res.points = ok ? 20 + this.anticipationPoints(r) : 0;
  }
}

// ---------------------------------------------------------------------------
// S2 — narrow street, obstacle on the player's side (ЗБСП чл. 48 ст. 2)
export class S2 extends ScenarioRuntime {
  id = 's2' as const;
  retry = { pose: { x: 481.4, y: 12, h: Math.PI / 2 }, v: 6.5 };
  npc: NpcCar | null = null;
  committed = false;
  private entered = false;
  readonly y0 = TIHA_NARROW.y0 - 2;
  readonly y1 = TIHA_NARROW.y1 + 0.5;
  stoppedBefore = false;

  init() { super.init(); this.npc = null; this.committed = false; this.entered = false; this.stoppedBefore = false; }

  /** Oncoming car vs the narrow part: is it already out, or will it be in it before the player gets through? */
  private meet(sim: Sim) {
    const p = sim.player, npc = this.npc!, np = npc.pose;
    const onTiha = Math.abs(np.x - 478.6) < 1.5 && np.y < 259;
    const npcFrontY = onTiha ? np.y - npc.L / 2 : Infinity, npcRearY = onTiha ? np.y + npc.L / 2 : Infinity;
    const front = p.y + Math.sin(p.h) * p.L / 2;
    const exited = npc.done || (npcRearY < this.y0 && onTiha) || (!onTiha && np.y < 200);
    const npcIn = npcFrontY <= this.y1;
    const etaN = npcIn ? 0 : (npcFrontY - this.y1) / Math.max(npc.v, 0.5);
    const clearT = (this.y1 + p.L - front) / Math.max(p.v, 4);
    return { exited, npcIn, etaN, clearT, front, onTiha };
  }

  yieldCue(sim: Sim): YieldCue | null {
    if (!this.armed || this.res.outcome !== 'pending' || !this.npc) return null;
    const m = this.meet(sim);
    const d = this.y0 - m.front;
    if (m.exited || d > 70 || d < -0.5) return null;
    if (!m.npcIn && m.etaN >= m.clearT + 0.5 && !m.onTiha) return null; // nobody coming yet
    const p = sim.player, visible = this.res.cueT !== null;
    return { dist: d, stopAt: { x: 481.4, y: this.y0 - 2 - p.L / 2 }, heading: Math.PI / 2, actorId: this.npc.id, visible,
      lesson: visible ? 'Пречката е на твојата страна — почекај го возилото од спротивно' : 'Тесен дел со пречка на твојата страна — ти чекаш',
      exam: 'Тесен дел од улицата' };
  }

  update(sim: Sim, dt: number) {
    const p = sim.player;
    if (!this.armed) {
      if (inRect(rect(477.2, 4, 482.8, 45), p.x, p.y) && Math.sin(p.h) > 0.5) {
        this.armed = true; this.res.armedT = sim.t;
        const path = new Path([{ x: 404, y: 259.2 }, { x: 478.6, y: 259.2 }, { x: 478.6, y: 0.9 }, { x: 330, y: 0.9 }], 6);
        this.npc = sim.spawnCar('s2-car', 'van', '#c9c3b5', 'SK 5120-KM', path, 0, 8, 8.5);
        this.res.focusActor = 's2-car';
      }
      return;
    }
    const npc = this.npc!;
    const front = p.y + Math.sin(p.h) * sim.player.L / 2;
    const np = npc.pose;
    const onTiha = Math.abs(np.x - 478.6) < 1.5 && np.y < 259;
    const npcFrontY = onTiha ? np.y - npc.L / 2 : Infinity; // heading south
    const npcSFor = (y: number) => npc.path.project({ x: 478.6, y }, npc.s, 400);

    if (!this.committed && this.res.outcome === 'pending') {
      if (front > this.y0 - 35) this.committed = true;
      else {
        const eta = (this.y0 - front) / Math.max(p.v, 6);
        const dN = npcSFor(this.y1) - npc.frontS();
        if (dN > 0) npc.vTarget = clamp(dN / Math.max(eta - 1.0, 0.8), 5, 12);
      }
    }
    // Opposing driver will not enter the narrow part while the player is in it
    const playerInSection = p.y > this.y0 - 1 && p.y < this.y1 + sim.player.L && Math.abs(p.x - 480) < 3;
    npc.holdAtS = playerInSection && npcFrontY > this.y1 ? npcSFor(this.y1 + 2.5) : null;

    this.cue(sim, onTiha && sim.world.los(p.pose, np) && Math.hypot(np.x - p.x, np.y - p.y) < 190, np);

    if (p.v < 0.3 && front < this.y0 && front > this.y0 - 25) this.stoppedBefore = true;

    if (this.res.outcome === 'pending') {
      if (front >= this.y0 && !this.entered && Math.abs(p.x - 480) < 3) {
        this.entered = true;
        const { exited, npcIn, etaN, clearT } = this.meet(sim);
        if (exited) { this.res.did = 'Влезе откако возилото од спротивно помина.'; this.finish(sim, 'pass'); }
        else {
          if (npcIn) { this.res.did = 'Влезе во тесниот дел додека другото возило веќе беше во него.'; this.finish(sim, 'fail'); }
          else if (etaN < clearT + 0.5) { this.res.did = `Влезе, а возилото од спротивно стигнуваше за ${etaN.toFixed(1)} с — пред ти да излезеш.`; this.finish(sim, 'fail'); }
          else { this.res.did = 'Влезе кога возилото од спротивно беше доволно далеку.'; this.finish(sim, 'pass'); }
        }
      } else if (!inRect(rect(470, -10, 490, 270), p.x, p.y)) {
        this.res.did = 'Не помина низ тесниот дел.'; this.finish(sim, 'missed');
      }
    }
    if (this.res.outcome !== 'pending' && (npc.done || p.y > this.y1 + 20 || sim.t - (this.res.decisionT ?? sim.t) > 25)) this.close(sim, 1.5);
  }

  onContact(sim: Sim, c: Contact) {
    if (!this.armed) return;
    if (c.id === 's2-car') { this.res.outcome = 'pending'; this.finish(sim, 'collision'); this.res.did = 'Судир со возилото од спротивната насока.'; }
    if (c.kind === 'parked' && c.id.startsWith('tiha-')) sim.emit({ type: 'note', id: this.id, text: 'Допир со паркирано возило.' });
  }

  protected finalize(sim: Sim) {
    const r = this.reaction(sim, this.res.decisionT ?? sim.t);
    this.res.reaction = r;
    const ok = this.res.outcome === 'pass';
    const touches = sim.contacts.filter((c) => c.id.startsWith('tiha-')).length;
    this.res.items = [
      { id: 'give-way-obstacle', ok: this.res.outcome === 'missed' ? null : ok, detail: this.res.did || '—' },
      { id: 'anticipate', ok: r === null ? null : r <= 2.5, detail: r === null ? 'Нема реакција по првиот знак.' : `Реакција ${r.toFixed(1)} с по првиот знак.` },
      { id: 'contact', ok: this.res.outcome === 'missed' ? null : touches === 0, detail: touches ? `Допири со паркирани возила: ${touches}.` : 'Без допир.' },
    ];
    this.res.points = ok ? 20 + this.anticipationPoints(r) : 0;
  }
}

// ---------------------------------------------------------------------------
// S3 — marked, unsignalised pedestrian crossing (ЗБСП чл. 122 ст. 3)
export class S3 extends ScenarioRuntime {
  id = 's3' as const;
  retry = { pose: { x: 470, y: 261.75, h: Math.PI }, v: 7 };
  ped: Pedestrian | null = null;
  private walkStarted = false;
  private crossed = false;
  stopFrontX: number | null = null;
  readonly cx = CROSSINGS[0];

  init() { super.init(); this.ped = null; this.walkStarted = false; this.crossed = false; this.stopFrontX = null; }

  yieldCue(sim: Sim): YieldCue | null {
    const ped = this.ped;
    if (!this.armed || this.res.outcome !== 'pending' || !ped || !this.walkStarted) return null;
    const p = sim.player;
    const front = p.x + Math.cos(p.h) * p.L / 2, d = front - this.cx.x1;
    if (d > 70 || d < -0.5) return null;
    // she has priority from the moment she is at the kerb until she has left the player's lane
    const near = ped.state === 'wait' || (ped.state === 'cross' && ped.pos.y >= 259) || (ped.state === 'walk' && ped.markers.curb - ped.s < 8);
    if (!near) return null;
    const visible = this.res.cueT !== null;
    return { dist: d, stopAt: { x: this.cx.x1 + 1.5 + p.L / 2, y: 261.75 }, heading: Math.PI, actorId: ped.id, visible,
      lesson: visible ? 'Пешачка на преминот — запри пред зебрата' : 'Пешачки премин — намали, некој може да стапне',
      exam: 'Пешачки премин' };
  }

  update(sim: Sim, dt: number) {
    const p = sim.player;
    const line = this.cx.x1; // westbound player meets x1 first
    if (!this.armed) {
      if (inRect(rect(380, 256.5, 482.8, 263.5), p.x, p.y) && Math.cos(p.h) < -0.5) {
        this.armed = true; this.res.armedT = sim.t;
        const path = new Path([
          { x: 340.5, y: 269.0 }, { x: 340.5, y: 266.2 }, { x: 333.2, y: 265.2 }, { x: 330.6, y: 264.3 },
          { x: 330.6, y: 255.5 }, { x: 329.5, y: 254.4 }, { x: 300, y: 254.3 },
        ], 0.8, 0.25);
        this.ped = sim.spawnPed('s3-ped', { coat: '#5b6b8a', skirt: true, hair: '#d9d4cc', carry: 'groceries', height: 1.58, stoop: 0.12 }, path, {
          curb: path.project({ x: 330.6, y: 264.1 }), far: path.project({ x: 330.6, y: 255.6 }),
        });
        this.res.focusActor = 's3-ped';
      }
      return;
    }
    const ped = this.ped!;
    const front = p.x + Math.cos(p.h) * sim.player.L / 2;
    const dLine = front - line;
    const eta = dLine / Math.max(p.v, 5);
    const curbS = ped.markers.curb, farS = ped.markers.far;

    if (!this.walkStarted) {
      if (eta < 14 || dLine < 90) {
        this.walkStarted = true;
        ped.state = 'walk';
        const walkLen = curbS - ped.s;
        ped.speed = clamp(walkLen / Math.max(eta - 3.6, 3), 0.75, 1.5);
      }
    }
    if (ped.state === 'walk') {
      // keep adapting her pace until the driver commits (30 m out), so the meeting stays fair at any speed
      if (dLine > 30) ped.speed = clamp((curbS - ped.s) / Math.max(eta - 3.6, 2.5), 0.75, 1.6);
      ped.advance(dt);
      if (ped.s >= curbS - 0.05) ped.state = 'wait';
    } else if (ped.state === 'wait') {
      // she steps out unless a car is clearly too close and too fast to stop
      const tooClose = dLine > 0 && dLine < 14 && p.v > 4 && Math.cos(p.h) < -0.3;
      const blocked = sim.cars.some((c) => !c.done && Math.abs(c.pose.x - 330) < 3.5 && Math.abs(c.pose.y - 260) < 4);
      if (!tooClose && !blocked) { ped.state = 'cross'; ped.onRoad = true; ped.speed = 0.92; }
    } else if (ped.state === 'cross') {
      // she pauses if a car is inside the crossing in front of her
      const carIn = Math.abs(p.x - 330.6) < sim.player.L / 2 + 0.8 && p.y < ped.pos.y && p.y > ped.pos.y - 3;
      if (!carIn) ped.advance(dt);
      if (ped.s >= farS) { ped.state = 'after'; ped.onRoad = false; }
    } else if (ped.state === 'after') {
      ped.advance(dt, 1.0);
    }

    this.cue(sim, this.walkStarted && sim.world.los(p.pose, ped.pos) && Math.hypot(ped.pos.x - p.x, ped.pos.y - p.y) < 65, ped.pos);
    if (p.v < 0.3 && dLine > -0.5 && dLine < 20) this.stopFrontX = front;

    if (this.res.outcome === 'pending') {
      if (dLine <= 0 && !this.crossed && p.y > 256 && p.y < 264) {
        this.crossed = true;
        const inLane = ped.state === 'cross' && ped.pos.y >= 260 - 1.0;
        const stepping = ped.state === 'wait';
        if (inLane) { this.res.did = 'Помина преку преминот додека пешачката беше во твојата лента.'; this.finish(sim, 'fail'); }
        else if (stepping) { this.res.did = 'Помина додека пешачката стоеше на рабникот и стапнуваше на преминот.'; this.finish(sim, 'fail'); }
        else if (ped.state === 'cross') { this.res.did = 'Почека додека пешачката ја помина твојата лента.'; this.finish(sim, 'pass'); }
        else if (ped.state === 'walk') { this.res.did = 'Помина пред пешачката да стигне до преминот.'; this.finish(sim, 'pass'); }
        else { this.res.did = 'Почека пешачката да го помине преминот.'; this.finish(sim, 'pass'); }
      } else if (!inRect(rect(200, 250, 490, 270), p.x, p.y)) { this.res.did = 'Не помина покрај преминот.'; this.finish(sim, 'missed'); }
    }
    if (this.res.outcome !== 'pending') this.close(sim, 2.5);
  }

  onContact(sim: Sim, c: Contact) {
    if (c.id === 's3-ped') { this.res.outcome = 'pending'; this.finish(sim, 'collision'); this.res.did = 'Удар во пешачката.'; }
  }

  protected finalize(sim: Sim) {
    const r = this.reaction(sim, this.res.decisionT ?? sim.t);
    this.res.reaction = r;
    const ok = this.res.outcome === 'pass';
    const stoppedOk = this.stopFrontX === null ? null : this.stopFrontX >= this.cx.x1 - 0.2;
    this.res.items = [
      { id: 'yield-ped', ok: this.res.outcome === 'missed' ? null : ok, detail: this.res.did || '—' },
      { id: 'anticipate', ok: r === null ? null : r <= 2.5, detail: r === null ? 'Нема реакција по првиот знак.' : `Реакција ${r.toFixed(1)} с по првиот знак.` },
      { id: 'stop-before', ok: stoppedOk, detail: this.stopFrontX === null ? 'Не запре кај преминот.' : stoppedOk ? 'Запре пред линијата на преминот.' : 'Запре на самата зебра.' },
    ];
    this.res.points = ok ? 20 + this.anticipationPoints(r) : 0;
  }
}

// ---------------------------------------------------------------------------
// S4 — one-way street decides the route; signal the left turn (чл. 17, 187, 25)
export class S4 extends ScenarioRuntime {
  id = 's4' as const;
  retry = { pose: { x: 312, y: 261.75, h: Math.PI }, v: 7 };
  npc: NpcCar | null = null;
  routeOk: boolean | null = null;
  signalOk: boolean | null = null;
  signalDetail = '';
  laneY: number | null = null;
  private turnStart: number | null = null;

  init() { super.init(); this.npc = null; this.routeOk = null; this.signalOk = null; this.signalDetail = ''; this.laneY = null; this.turnStart = null; }

  update(sim: Sim, dt: number) {
    const p = sim.player;
    if (!this.armed) {
      if (inRect(rect(250, 256.5, 325, 263.5), p.x, p.y) && Math.cos(p.h) < -0.5) {
        this.armed = true; this.res.armedT = sim.t;
        const path = new Path([{ x: 239.4, y: 150 }, { x: 239.4, y: 252.6 }, { x: 239.6, y: 254 }, { x: 241.2, y: 259.2 }, { x: 330, y: 259.2 }], 3.5);
        this.npc = sim.spawnCar('s4-car', 'hatch', '#2b3a55', 'SK 7044-DN', path, 0, 8, 8);
        this.res.focusActor = 's4-205';
      }
      return;
    }
    const npc = this.npc!;
    // Exiting driver yields to the player approaching from its right
    const approaching = p.x > 238 && p.x < 300 && p.y > 255 && Math.cos(p.h) < -0.3;
    npc.holdAtS = approaching ? npc.path.project({ x: 239.4, y: 252.4 }) : null;

    // Cue: the first one-way sign the learner can actually read (in sight, within 70 m and
    // seen less than 65° off its face), not merely an edge-on plate.
    for (const sign of SIGNS.filter((q) => q.id.startsWith('s4-'))) {
      const dx = p.x - sign.x, dy = p.y - sign.y;
      const d = Math.hypot(dx, dy);
      const facing = (dx * Math.cos(sign.face) + dy * Math.sin(sign.face)) / Math.max(d, 0.01);
      if (d < 70 && facing > Math.cos((65 * Math.PI) / 180) && sim.world.los(p.pose, { x: sign.x + Math.cos(sign.face) * 0.3, y: sign.y + Math.sin(sign.face) * 0.3 })) {
        this.cue(sim, true, { x: sign.x, y: sign.y });
        break;
      }
    }

    // Route selection: entering Chinarska southbound is against the one-way.
    if (this.routeOk === null) {
      if (p.x > 236.6 && p.x < 243.4 && p.y < 254.5 && Math.sin(p.h) < -0.4) {
        this.routeOk = false; this.res.did = 'Влезе во еднонасочната улица спротивно од насоката.';
        this.finish(sim, 'fail-route');
      } else if (p.x < 226 && p.y > 255) this.routeOk = true;
    }

    // Left turn into Javorova — signal at least 1.5 s before the heading starts to change
    if (this.routeOk && this.signalOk === null) {
      if (p.x < 20 && p.y > 250 && this.turnStart === null && Math.abs(angleDiff(p.h, Math.PI)) > 0.26) {
        this.turnStart = sim.t;
        this.laneY = p.y;
        const lastNotLeft = [...sim.rec.sample(sim.t - 6, sim.t)].reverse().find((f) => f.p.ind !== 1);
        const onFor = lastNotLeft ? sim.t - lastNotLeft.t : 6;
        const wrongRight = sim.player.indicator === 'right';
        if (wrongRight) { this.signalOk = false; this.signalDetail = 'Беше вклучен десниот покажувач.'; }
        else if (onFor >= 1.5 && sim.player.indicator === 'left') { this.signalOk = true; this.signalDetail = `Левиот покажувач беше вклучен ${onFor >= 6 ? 'повеќе од 6' : onFor.toFixed(1)} с пред свртувањето.`; }
        else if (sim.player.indicator === 'left') { this.signalOk = false; this.signalDetail = `Покажувачот беше вклучен само ${onFor.toFixed(1)} с пред свртувањето.`; }
        else { this.signalOk = false; this.signalDetail = 'Сврте лево без покажувач.'; }
      }
    }
    if (this.routeOk && this.signalOk !== null && this.res.outcome === 'pending') {
      this.res.did = this.signalOk ? 'Продолжи право покрај еднонасочната и најави го свртувањето налево.' : `Избра дозволен пат. ${this.signalDetail}`;
      this.finish(sim, this.signalOk ? 'pass' : 'fail-signal');
    }
    if (this.res.outcome === 'pending' && this.routeOk && !inRect(rect(-10, 200, 300, 275), p.x, p.y)) {
      this.signalOk = null; this.res.did = 'Избра дозволен пат.'; this.finish(sim, 'missed');
    }
    if (this.res.outcome !== 'pending') this.close(sim, this.res.outcome === 'fail-route' ? 3 : 2);
  }

  protected finalize(_sim: Sim) {
    const route = this.routeOk;
    this.res.items = [
      { id: 'route', ok: route, detail: route === false ? 'Влезе спротивно во еднонасочна улица.' : route ? 'Не влезе во еднонасочната улица.' : '—' },
      { id: 'signal', ok: route === false ? null : this.signalOk, detail: this.signalDetail || '—' },
      { id: 'lane', ok: this.laneY === null ? null : this.laneY < 261.6, detail: this.laneY === null ? '—' : this.laneY < 261.6 ? 'Се приближи кон средината пред свртувањето.' : 'Сврте од десниот дел на лентата.' },
    ];
    this.res.points = (route ? 15 : 0) + (route && this.signalOk ? 10 : 0);
  }
}

// ---------------------------------------------------------------------------
// X1 — unscored hazard-perception moment: a parked car signals and pulls out
export class X1 extends ScenarioRuntime {
  id = 'x1' as const;
  retry = { pose: { x: 476, y: 261.75, h: Math.PI }, v: 6 };
  npc: NpcCar | null = null;
  private departed = false;

  init() { super.init(); this.npc = null; this.departed = false; }

  update(sim: Sim, _dt: number) {
    const p = sim.player;
    if (!this.armed) {
      if (!sim.npcSpawned('x1-car')) {
        const path = new Path([{ x: 420, y: 262.62 }, { x: 408, y: 261.9 }, { x: 386, y: 261.75 }, { x: 375.5, y: 261.75 }, { x: 375.5, y: 276 }], 4.5);
        this.npc = sim.spawnCar('x1-car', 'yugo', '#46523e', 'SK 2208-LJ', path, 0, 0, 0);
      }
      if (inRect(rect(462, 255, 483, 264), p.x, p.y) && Math.cos(p.h) < 0) {
        this.armed = true; this.res.armedT = sim.t;
        this.npc!.indicator = 'left';
        this.res.focusActor = 'x1-car';
      }
      return;
    }
    const npc = this.npc!;
    this.cue(sim, sim.world.los(p.pose, npc.pose) && Math.hypot(npc.pose.x - p.x, npc.pose.y - p.y) < 80, npc.pose);
    if (!this.departed && p.x < 457) { this.departed = true; npc.vTarget = 5; }
    if (npc.s > 14 && npc.indicator === 'left') npc.indicator = 'right';
    if (npc.done && this.res.outcome === 'pending') this.finish(sim, 'pass');
    if (!inRect(rect(300, 250, 490, 270), p.x, p.y) && this.res.outcome === 'pending') this.finish(sim, 'pass');
    if (this.res.outcome !== 'pending') this.close(sim, 0.5);
  }

  protected finalize(sim: Sim) {
    const r = this.reaction(sim, (this.res.cueT ?? sim.t) + 8);
    this.res.reaction = r;
    this.res.outcome = this.res.cueT === null ? 'missed' : r !== null && r <= 3 ? 'pass' : 'fail';
    this.res.did = r === null ? 'Не реагираше на трепкачот.' : `Реагираше ${r.toFixed(1)} с откако се вклучи трепкачот.`;
    this.res.items = [{ id: 'anticipate', ok: r === null ? false : r <= 3, detail: this.res.did }];
    this.res.points = 0;
  }
}

export const makeScenarios = () => [new S1(), new S2(), new S3(), new S4(), new X1()];

// Scripted traffic: path-following NPC cars and pedestrians. Behaviour is deterministic
// given the player's inputs, so a retry with the same setup reproduces the situation.
import { Path, clamp, dist, obbCorners, pointInQuad, type Pose, type Vec2 } from '../math';
import { CAR_DIMS, type CarType } from '../content/generate';
import type { Indicator } from './vehicle';

export interface ActorContext {
  playerQuad: Vec2[]; // slightly inflated
  playerPose: Pose;
  cars: NpcCar[];
  peds: Pedestrian[];
}

export class NpcCar {
  kind = 'vehicle' as const;
  s: number; v: number; vTarget: number;
  accel = 2.2; decel = 4.5;
  indicator: Indicator = 'off';
  braking = false; hardBrake = false; horn = false;
  holdAtS: number | null = null; // stop before this arc length
  done = false; active = true;
  waitTime = 0;
  maxDecelUsed = 0;
  readonly L: number; readonly W: number;

  constructor(public id: string, public type: CarType, public color: string, public plate: string, public path: Path, s0 = 0, v0 = 0, vTarget = 8, public despawnAtEnd = true) {
    this.s = s0; this.v = v0; this.vTarget = vTarget;
    this.L = CAR_DIMS[type].L; this.W = CAR_DIMS[type].W;
  }

  get pose(): Pose { return this.path.at(this.s); }
  quad(): Vec2[] { return obbCorners(this.pose, this.L, this.W); }
  /** world velocity (m/s) — for relative-speed contact classification */
  velocity(): Vec2 { const h = this.pose.h; return { x: Math.cos(h) * this.v, y: Math.sin(h) * this.v }; }
  frontS() { return this.s + this.L / 2; }

  update(dt: number, ctx: ActorContext) {
    if (!this.active || this.done) return;
    // Look ahead along the path for anything in the way.
    const look = Math.max(9, (this.v * this.v) / (2 * 3.2) + 7);
    let block = Infinity;
    const hw = this.W / 2 + 0.25;
    for (let d = 0; d <= look; d += 0.8) {
      const p = this.path.at(this.frontS() + d);
      // sample both front corners
      const c = Math.cos(p.h + Math.PI / 2) * hw, sN = Math.sin(p.h + Math.PI / 2) * hw;
      const pts = [p, { x: p.x + c, y: p.y + sN }, { x: p.x - c, y: p.y - sN }];
      let hit = pts.some((q) => pointInQuad(ctx.playerQuad, q.x, q.y));
      if (!hit) for (const o of ctx.cars) {
        if (o === this || !o.active || o.done) continue;
        const oq = o.quad();
        if (dist(oq[0], p) > 8) continue;
        if (pts.some((q) => pointInQuad(oq, q.x, q.y))) { hit = true; break; }
      }
      if (!hit) for (const ped of ctx.peds) {
        if (!ped.onRoad || ped.done) continue;
        if (pts.some((q) => dist(q, ped.pos) < 1.1)) { hit = true; break; }
      }
      if (hit) { block = d; break; }
    }
    if (this.holdAtS !== null) block = Math.min(block, Math.max(0, this.holdAtS - this.frontS()));
    const stopGap = 1.6;
    const vAllowed = block === Infinity ? Infinity : Math.sqrt(Math.max(0, 2 * 4.0 * (block - stopGap)));
    const target = Math.min(this.vTarget, vAllowed);
    const prev = this.v;
    if (target > this.v) this.v = Math.min(target, this.v + this.accel * dt);
    else {
      const need = block < 2.2 ? 9 : this.decel * 1.8;
      this.v = Math.max(target, this.v - need * dt);
    }
    const decelUsed = (prev - this.v) / dt;
    this.braking = decelUsed > 0.6 || (this.v < 0.1 && target < 0.1);
    this.hardBrake = decelUsed > 4.2;
    this.maxDecelUsed = Math.max(this.maxDecelUsed, decelUsed);
    this.waitTime = this.v < 0.1 && block < 6 ? this.waitTime + dt : 0;
    this.horn = this.waitTime > 5 && this.waitTime < 5.6;
    this.s += this.v * dt;
    if (this.s >= this.path.length - this.L / 2) {
      this.s = this.path.length - this.L / 2;
      if (this.despawnAtEnd) this.done = true;
      else if (this.vTarget <= 0) this.v = 0; // parked/stationary actors stay put; drivers get a new path from their owner
    }
  }
}

export type PedState = 'idle' | 'walk' | 'wait' | 'cross' | 'after' | 'done';

export class Pedestrian {
  kind = 'pedestrian' as const;
  s = 0; speed = 1.1; state: PedState = 'idle';
  phase = 0; // walk cycle
  pos: Vec2; h: number;
  onRoad = false;
  done = false;

  constructor(public id: string, public look: { coat: string; skirt?: boolean; hair: string; carry: 'groceries' | 'bag' | 'none'; height: number; stoop?: number }, public path: Path, public markers: Record<string, number> = {}) {
    const p = path.at(0);
    this.pos = { x: p.x, y: p.y }; this.h = p.h;
  }

  quad(): Vec2[] { return obbCorners({ x: this.pos.x, y: this.pos.y, h: this.h }, 0.6, 0.6); }

  advance(dt: number, speed = this.speed) {
    this.s = clamp(this.s + speed * dt, 0, this.path.length);
    const p = this.path.at(this.s);
    this.pos = { x: p.x, y: p.y };
    // turn smoothly
    let dh = p.h - this.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.h += dh * Math.min(1, dt * 6);
    this.phase += speed * dt * 1.9;
    if (this.s >= this.path.length - 0.01) this.done = true;
  }
}

/** Ambient pedestrian that strolls back and forth along a sidewalk segment. */
export class Stroller {
  s = 0; dir = 1; phase = 0; pos: Vec2; h = 0;
  constructor(public id: string, public a: Vec2, public b: Vec2, public speed: number, public look: Pedestrian['look'], offset = 0) {
    this.pos = { ...a };
    this.s = offset * Math.hypot(b.x - a.x, b.y - a.y);
  }
  update(dt: number) {
    const L = Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y);
    this.s += this.dir * this.speed * dt;
    if (this.s > L) { this.s = L; this.dir = -1; }
    if (this.s < 0) { this.s = 0; this.dir = 1; }
    const t = this.s / L;
    this.pos = { x: this.a.x + (this.b.x - this.a.x) * t, y: this.a.y + (this.b.y - this.a.y) * t };
    this.h = Math.atan2((this.b.y - this.a.y) * this.dir, (this.b.x - this.a.x) * this.dir);
    this.phase += this.speed * dt * 1.9;
  }
}

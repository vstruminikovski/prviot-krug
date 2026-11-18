// Player car: a responsive low-speed kinematic bicycle model with reverse, turn signals
// and collision boundaries (curbs, parked cars, poles, NPC vehicles, pedestrians).
import { clamp, obbCorners, obbSamples, quadsOverlap, angleDiff, type Pose, type Vec2 } from '../math';
import type { World } from './world';

export type Indicator = 'off' | 'left' | 'right';
export interface DriveInput { throttle: number; brake: number; steer: number; horn?: boolean }

export const PLAYER = { L: 3.49, W: 1.54, wheelbase: 2.15, maxV: 19.5, maxReverse: 3.2 };

export interface Contact { t: number; kind: 'curb' | 'parked' | 'pole' | 'vehicle' | 'pedestrian'; id: string; speed: number }

export interface DynamicBody { id: string; kind: 'vehicle' | 'pedestrian'; quad(): Vec2[] }

export class PlayerCar {
  x: number; y: number; h: number;
  v = 0; steer = 0; gear: 'D' | 'R' = 'D';
  indicator: Indicator = 'off';
  throttle = 0; brake = 0; steerInput = 0; horn = false;
  revs = 0.12;
  private reverseHold = 0; private driveHold = 0;
  private indHeading = 0; private indTurned = 0; private straightTime = 0;
  private lastContact = new Map<string, number>();

  constructor(p: Pose) { this.x = p.x; this.y = p.y; this.h = p.h; }

  get pose(): Pose { return { x: this.x, y: this.y, h: this.h }; }
  quad(pose: Pose = this.pose, inflate = 0): Vec2[] { return obbCorners(pose, PLAYER.L + inflate * 2, PLAYER.W + inflate * 2); }
  front(): Vec2 { return { x: this.x + Math.cos(this.h) * PLAYER.L / 2, y: this.y + Math.sin(this.h) * PLAYER.L / 2 }; }

  place(p: Pose, v = 0) {
    this.x = p.x; this.y = p.y; this.h = p.h; this.v = v; this.steer = 0; this.gear = 'D';
    this.indicator = 'off'; this.reverseHold = 0; this.driveHold = 0;
  }

  toggleIndicator(dir: 'left' | 'right') {
    this.indicator = this.indicator === dir ? 'off' : dir;
    this.indHeading = this.h; this.indTurned = 0; this.straightTime = 0;
  }

  step(dt: number, inp: DriveInput, world: World, bodies: DynamicBody[], t: number, onContact: (c: Contact) => void) {
    this.throttle = clamp(inp.throttle, 0, 1);
    this.brake = clamp(inp.brake, 0, 1);
    this.steerInput = clamp(inp.steer, -1, 1);
    this.horn = !!inp.horn;

    // Gear logic: hold brake at standstill to engage reverse, throttle to go forward again.
    const still = Math.abs(this.v) < 0.25;
    if (this.gear === 'D') {
      this.reverseHold = still && this.brake > 0.5 && this.throttle < 0.05 ? this.reverseHold + dt : 0;
      if (this.reverseHold > 0.45) { this.gear = 'R'; this.reverseHold = 0; }
    } else {
      this.driveHold = still && this.throttle > 0.4 ? this.driveHold + dt : 0;
      if (this.driveHold > 0.15) { this.gear = 'D'; this.driveHold = 0; }
    }

    // Longitudinal
    const speed = Math.abs(this.v);
    let drive = 0, res = 0;
    if (this.gear === 'D') {
      drive = this.throttle * 2.7 * clamp(1 - this.v / 22, 0.15, 1);
      res = this.brake * 7.8 + 0.12 + 0.0011 * speed * speed + (this.throttle < 0.05 ? 0.45 : 0);
    } else {
      drive = -this.brake * 1.7; // in reverse the brake/down control means "go back"
      res = this.throttle * 7.8 + 0.15 + (this.brake < 0.05 ? 0.6 : 0);
    }
    const a = drive + (this.v > 0 ? -res : this.v < 0 ? res : 0);
    let nv = this.v + a * dt;
    if (this.gear === 'D') nv = clamp(nv, 0, PLAYER.maxV);
    else nv = clamp(nv, -PLAYER.maxReverse, 0);
    // stop exactly when braking crosses zero
    if ((this.v > 0 && nv < 0) || (this.v < 0 && nv > 0)) nv = 0;
    this.v = nv;

    // Steering (speed-sensitive limit and slew rate)
    const maxSteer = 0.62 - clamp(speed / 16, 0, 1) * 0.38;
    const target = this.steerInput * maxSteer;
    const rate = 2.4 * dt;
    this.steer += clamp(target - this.steer, -rate, rate);

    // Integrate
    const beta = Math.atan(0.5 * Math.tan(this.steer));
    const nh = this.h + (this.v / PLAYER.wheelbase) * Math.cos(beta) * Math.tan(this.steer) * dt;
    const nx = this.x + this.v * Math.cos(this.h + beta) * dt;
    const ny = this.y + this.v * Math.sin(this.h + beta) * dt;

    const tryPose = (p: Pose) => this.collide(p, world, bodies);
    let hit = tryPose({ x: nx, y: ny, h: nh });
    if (!hit) { this.x = nx; this.y = ny; this.h = nh; }
    else {
      const impact = Math.abs(this.v);
      const key = hit.id;
      const last = this.lastContact.get(key) ?? -99;
      if (t - last > 1.5 && (impact > 0.4 || hit.kind === 'pedestrian' || hit.kind === 'vehicle')) {
        onContact({ t, kind: hit.kind, id: hit.id, speed: impact });
      }
      this.lastContact.set(key, t);
      this.v = impact > 1.2 ? -this.v * 0.12 : 0;
      // allow rotating in place-ish so the player can steer free
      if (!tryPose({ x: this.x, y: this.y, h: nh })) this.h = nh;
    }

    // Indicator self-cancel after a completed turn (like the column switch of the real car)
    if (this.indicator !== 'off') {
      const turned = Math.abs(angleDiff(this.h, this.indHeading));
      this.indTurned = Math.max(this.indTurned, turned);
      if (this.indTurned > 0.9 && Math.abs(this.steer) < 0.06) {
        this.straightTime += dt;
        if (this.straightTime > 0.35) this.indicator = 'off';
      } else this.straightTime = 0;
    }

    this.revs = clamp(0.12 + Math.abs(this.v) / 9 % 1 * 0.55 + this.throttle * 0.3, 0.1, 1);
  }

  private collide(p: Pose, world: World, bodies: DynamicBody[]): { kind: Contact['kind']; id: string } | null {
    for (const s of obbSamples(p, PLAYER.L, PLAYER.W)) if (!world.isDrivable(s.x, s.y)) return { kind: 'curb', id: 'curb' };
    const q = obbCorners(p, PLAYER.L, PLAYER.W);
    const st = world.hitStatic(q);
    if (st) return { kind: st.kind === 'pole' ? 'pole' : 'parked', id: st.id };
    for (const b of bodies) {
      const bq = b.quad();
      if (Math.hypot(bq[0].x - p.x, bq[0].y - p.y) > 9) continue;
      if (quadsOverlap(q, bq)) return { kind: b.kind, id: b.id };
    }
    return null;
  }
}

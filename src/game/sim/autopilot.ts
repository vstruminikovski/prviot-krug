// Scripted driver used by the automated tests and the in-browser debug API.
// 'lawful' waits where the rules require it and signals; 'reckless' keeps rolling and never signals.
import { Path, angleDiff, clamp, type Vec2 } from '../math';
import { ROUTE_WAYPOINTS } from '../content/debarMaalo';
import type { DriveInput } from './vehicle';
import { PLAYER } from './vehicle';
import type { Sim } from './sim';
import type { S1, S2, S3 } from './scenarios';

export interface AutoOptions { mode: 'lawful' | 'reckless'; signal?: boolean; wrongWay?: boolean; cruise?: number; lateSignal?: boolean }

const WRONG_WAY: Vec2[] = [
  { x: 74, y: -2.35 }, { x: 86, y: -1.75 }, { x: 481.4, y: -1.75 }, { x: 481.4, y: 81 }, { x: 479.2, y: 90 }, { x: 479.2, y: 156 }, { x: 481.4, y: 166 }, { x: 481.4, y: 261.75 }, { x: 239.0, y: 261.75 }, { x: 239.0, y: 120 },
];

export class Autopilot {
  path: Path;
  s = 0;
  private signalled = new Set<string>();

  constructor(public opts: AutoOptions, from?: Vec2) {
    this.path = new Path(opts.wrongWay ? WRONG_WAY : ROUTE_WAYPOINTS, 7, 0.5);
    if (from) this.s = this.path.project(from);
  }

  input(sim: Sim): DriveInput {
    const p = sim.player;
    this.s = this.path.project(p.pose, this.s, 30);
    const v = p.v;
    const Ld = 4.5 + v * 0.55;
    const tgt = this.path.at(this.s + Ld);
    const alpha = angleDiff(Math.atan2(tgt.y - p.y, tgt.x - p.x), p.h);
    const delta = Math.atan((2 * PLAYER.wheelbase * Math.sin(alpha)) / Ld);
    const maxSteer = 0.62 - clamp(Math.abs(v) / 16, 0, 1) * 0.38;
    const steer = clamp(delta / maxSteer, -1, 1);

    // Desired speed: cruise, slower into corners, stop at the end.
    let vd = this.opts.cruise ?? (this.opts.mode === 'reckless' ? 9.5 : 8);
    const h0 = this.path.at(this.s).h, h1 = this.path.at(this.s + 16).h;
    if (Math.abs(angleDiff(h1, h0)) > 0.5) vd = Math.min(vd, 4.6);
    const remain = this.path.length - this.s;
    let stopDist = remain - 2;

    const front = { x: p.x + Math.cos(p.h) * PLAYER.L / 2, y: p.y + Math.sin(p.h) * PLAYER.L / 2 };
    if (this.opts.mode === 'lawful') {
      const s1 = sim.scenarios.find((s) => s.id === 's1') as S1 | undefined;
      if (s1?.npc && !s1.npc.done && s1.npc.pose.y - s1.npc.L / 2 < 0.3 && front.x < 236.8 && front.x > 200 && Math.abs(p.y) < 4) stopDist = Math.min(stopDist, 234.6 - front.x);
      const s2 = sim.scenarios.find((s) => s.id === 's2') as S2 | undefined;
      if (s2?.npc && !s2.npc.done && front.y < 84 && front.y > 30 && Math.abs(p.x - 480) < 3) {
        const np = s2.npc.pose;
        const onTiha = Math.abs(np.x - 478.6) < 1.5 && np.y < 259;
        if ((onTiha && np.y + s2.npc.L / 2 > 86) || (!onTiha && np.x > 430 && np.y > 250)) stopDist = Math.min(stopDist, 79 - front.y);
      }
      const s3 = sim.scenarios.find((s) => s.id === 's3') as S3 | undefined;
      if (s3?.ped && front.x > 332 && front.x < 380 && Math.abs(p.y - 260) < 4) {
        const ped = s3.ped;
        const relevant = (ped.state === 'walk' && ped.s > ped.markers.curb - 14) || ped.state === 'wait' || (ped.state === 'cross' && ped.pos.y > 258.6);
        if (relevant) stopDist = Math.min(stopDist, front.x - 333.4);
      }
      // keep distance to any car ahead in the lane
      for (const c of sim.cars) {
        if (c.done) continue;
        const q = c.pose;
        const dx = q.x - p.x, dy = q.y - p.y;
        const ahead = dx * Math.cos(p.h) + dy * Math.sin(p.h);
        const lat = -dx * Math.sin(p.h) + dy * Math.cos(p.h);
        if (ahead > 0 && ahead < 18 && Math.abs(lat) < 1.7) stopDist = Math.min(stopDist, ahead - c.L / 2 - PLAYER.L / 2 - 2.5);
      }
    }
    const vStop = Math.sqrt(Math.max(0, 2 * 3.2 * Math.max(0, stopDist)));
    vd = Math.min(vd, vStop);
    let throttle = 0, brake = 0;
    if (v < vd - 0.3) throttle = clamp((vd - v) * 0.6, 0.15, 1);
    else if (v > vd + 0.2) brake = clamp((v - vd) * 0.5 + (stopDist < 1 ? 0.6 : 0), 0.15, 1);
    if (vd < 0.05 && v < 0.3) brake = 0.3; // hold (short of the reverse threshold)

    // Indicators
    const want = (id: string, cond: boolean) => {
      if (!cond || this.signalled.has(id)) return;
      this.signalled.add(id);
      if (p.indicator !== 'left') p.toggleIndicator('left');
    };
    if (this.opts.signal) {
      want('J2', p.x > 425 && Math.abs(p.y) < 4);
      want('TG', p.y > 205 && Math.abs(p.x - 480) < 3);
      want('J4', p.x < (this.opts.lateSignal ? 7 : 48) && p.y > 255 && !this.opts.wrongWay);
      want('J5', p.y < 40 && Math.abs(p.x) < 4);
    }
    return { throttle, brake, steer };
  }
}

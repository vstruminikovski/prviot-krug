// Records vehicle positions, inputs and actor states for the end-of-run replay.
import { lerp, wrapAngle } from '../math';

export interface PlayerFrame { x: number; y: number; h: number; v: number; steer: number; thr: number; brk: number; ind: 0 | 1 | 2; gear: 0 | 1 }
export interface ActorFrame { id: string; k: 'car' | 'ped'; x: number; y: number; h: number; ind: 0 | 1 | 2; brk: boolean; ph?: number }
export interface Frame { t: number; p: PlayerFrame; a: ActorFrame[] }

export const REC_HZ = 15;

export class Recorder {
  frames: Frame[] = [];
  private acc = 0;

  push(t: number, dt: number, make: () => Frame) {
    this.acc += dt;
    if (this.frames.length === 0 || this.acc >= 1 / REC_HZ) {
      this.acc = 0;
      const f = make();
      f.t = t;
      this.frames.push(f);
    }
  }

  get duration() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }
  get start() { return this.frames.length ? this.frames[0].t : 0; }

  index(t: number): number {
    const f = this.frames;
    let lo = 0, hi = f.length - 1;
    if (hi < 0) return -1;
    if (t <= f[0].t) return 0;
    if (t >= f[hi].t) return hi;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m].t <= t) lo = m; else hi = m; }
    return lo;
  }

  /** Interpolated frame at time t (actors matched by id). */
  at(t: number): Frame | null {
    const i = this.index(t);
    if (i < 0) return null;
    const a = this.frames[i], b = this.frames[Math.min(i + 1, this.frames.length - 1)];
    if (a === b || b.t === a.t) return a;
    const u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    const ip = (pa: { x: number; y: number; h: number }, pb: { x: number; y: number; h: number }) => ({
      x: lerp(pa.x, pb.x, u), y: lerp(pa.y, pb.y, u), h: pa.h + wrapAngle(pb.h - pa.h) * u,
    });
    const p = { ...a.p, ...ip(a.p, b.p), v: lerp(a.p.v, b.p.v, u) };
    const byId = new Map(b.a.map((x) => [x.id, x]));
    const acts = a.a.map((x) => {
      const y = byId.get(x.id);
      return y ? { ...x, ...ip(x, y), ph: x.ph !== undefined && y.ph !== undefined ? lerp(x.ph, y.ph, u) : x.ph } : x;
    });
    return { t, p, a: acts };
  }

  /** First time in [t0, t1] where the predicate holds on a recorded frame. */
  firstWhere(t0: number, t1: number, pred: (f: Frame, prev: Frame | null) => boolean): number | null {
    let prev: Frame | null = null;
    for (const f of this.frames) {
      if (f.t < t0) { prev = f; continue; }
      if (f.t > t1) break;
      if (pred(f, prev)) return f.t;
      prev = f;
    }
    return null;
  }

  sample(t0: number, t1: number): Frame[] { return this.frames.filter((f) => f.t >= t0 && f.t <= t1); }
}

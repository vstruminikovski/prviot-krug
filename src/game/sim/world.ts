// Static collision and visibility queries for the simulation.
import { inRect, obbCorners, quadsOverlap, segmentHitsRect, type Rect, type Vec2 } from '../math';
import { DRIVABLE, SIGNS } from '../content/debarMaalo';
import { generate, CAR_DIMS } from '../content/generate';

export interface StaticObstacle { id: string; kind: 'parked' | 'pole'; quad: Vec2[]; cx: number; cy: number; r: number }

const CELL = 24;

export class World {
  drivable: Rect[] = DRIVABLE;
  blockers: Rect[];
  obstacles: StaticObstacle[] = [];
  private grid = new Map<string, StaticObstacle[]>();

  constructor() {
    const g = generate();
    this.blockers = g.blockers;
    for (const p of g.parked) {
      const d = CAR_DIMS[p.type];
      this.add({ id: p.id, kind: 'parked', quad: obbCorners(p.pose, d.L, d.W), cx: p.pose.x, cy: p.pose.y, r: d.L / 2 + 0.2 });
    }
    for (const s of SIGNS) {
      if (s.code === 'plaque') continue;
      const q = obbCorners({ x: s.x, y: s.y, h: 0 }, 0.12, 0.12);
      this.add({ id: s.id, kind: 'pole', quad: q, cx: s.x, cy: s.y, r: 0.2 });
    }
  }

  private add(o: StaticObstacle) {
    this.obstacles.push(o);
    const x0 = Math.floor((o.cx - o.r) / CELL), x1 = Math.floor((o.cx + o.r) / CELL);
    const y0 = Math.floor((o.cy - o.r) / CELL), y1 = Math.floor((o.cy + o.r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const k = `${i},${j}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(o);
    }
  }

  isDrivable(x: number, y: number): boolean {
    for (const r of this.drivable) if (inRect(r, x, y)) return true;
    return false;
  }

  /** First static obstacle overlapping the quad, if any. */
  hitStatic(quad: Vec2[]): StaticObstacle | null {
    let cx = 0, cy = 0;
    for (const q of quad) { cx += q.x; cy += q.y; }
    cx /= quad.length; cy /= quad.length;
    const k = `${Math.floor(cx / CELL)},${Math.floor(cy / CELL)}`;
    const seen = new Set<StaticObstacle>();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.grid.get(`${Math.floor(cx / CELL) + i},${Math.floor(cy / CELL) + j}`);
      if (!list) continue;
      for (const o of list) {
        if (seen.has(o)) continue;
        seen.add(o);
        if (Math.hypot(o.cx - cx, o.cy - cy) > o.r + 3.5) continue;
        if (quadsOverlap(quad, o.quad)) return o;
      }
    }
    void k;
    return null;
  }

  /** Line of sight between two ground points, blocked only by building footprints. */
  los(a: Vec2, b: Vec2): boolean {
    for (const r of this.blockers) {
      // quick reject on bounding boxes
      if (Math.max(a.x, b.x) < r.x0 || Math.min(a.x, b.x) > r.x1 || Math.max(a.y, b.y) < r.y0 || Math.min(a.y, b.y) > r.y1) continue;
      if (segmentHitsRect(a, b, r)) return false;
    }
    return true;
  }
}

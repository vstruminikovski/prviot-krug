// Static collision, terrain and visibility queries for any environment.
import { quadsOverlap, segmentHitsRect, type Rect, type Vec2 } from '../math';
import { pointInPoly, type EnvData, type StaticObs } from '../env/types';

const CELL = 20;

interface PolyRec { poly: Vec2[]; x0: number; y0: number; x1: number; y1: number }
interface ObsRec { o: StaticObs; cx: number; cy: number; r: number }

export class World {
  env: EnvData;
  blockers: Rect[];
  knocked = new Set<string>();
  private polyGrid = new Map<string, PolyRec[]>();
  private obsGrid = new Map<string, ObsRec[]>();

  constructor(env: EnvData) {
    this.env = env;
    this.blockers = env.blockers;
    for (const poly of env.drivable) {
      const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
      const rec: PolyRec = { poly, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      this.insert(this.polyGrid, rec, rec.x0, rec.y0, rec.x1, rec.y1);
    }
    for (const o of env.obstacles) {
      const xs = o.quad.map((p) => p.x), ys = o.quad.map((p) => p.y);
      const cx = xs.reduce((a, b) => a + b) / xs.length, cy = ys.reduce((a, b) => a + b) / ys.length;
      const r = Math.max(...o.quad.map((p) => Math.hypot(p.x - cx, p.y - cy)));
      this.insert(this.obsGrid, { o, cx, cy, r }, cx - r, cy - r, cx + r, cy + r);
    }
  }

  private insert<T>(grid: Map<string, T[]>, v: T, x0: number, y0: number, x1: number, y1: number) {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
      const k = `${i},${j}`;
      let l = grid.get(k); if (!l) grid.set(k, (l = []));
      l.push(v);
    }
  }

  isDrivable(x: number, y: number): boolean {
    const l = this.polyGrid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
    if (!l) return false;
    for (const r of l) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && pointInPoly(r.poly, x, y)) return true;
    return false;
  }

  heightAt(x: number, y: number) { return this.env.heightAt(x, y); }
  gripAt(x: number, y: number) { return this.env.gripAt ? this.env.gripAt(x, y) : 1; }

  /** First obstacle overlapping the quad (knocked soft obstacles are ignored). */
  hitStatic(quad: Vec2[]): { id: string; kind: string; soft?: boolean } | null {
    let cx = 0, cy = 0;
    for (const q of quad) { cx += q.x; cy += q.y; }
    cx /= quad.length; cy /= quad.length;
    const seen = new Set<ObsRec>();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.obsGrid.get(`${Math.floor(cx / CELL) + i},${Math.floor(cy / CELL) + j}`);
      if (!l) continue;
      for (const rec of l) {
        if (seen.has(rec)) continue;
        seen.add(rec);
        if (this.knocked.has(rec.o.id)) continue;
        if (Math.hypot(rec.cx - cx, rec.cy - cy) > rec.r + 6) continue;
        if (quadsOverlap(quad, rec.o.quad)) return { id: rec.o.id, kind: rec.o.kind, soft: rec.o.soft };
      }
    }
    return null;
  }

  knock(id: string) { this.knocked.add(id); }

  /** Line of sight between two ground points, blocked only by building/terrain footprints. */
  los(a: Vec2, b: Vec2): boolean {
    for (const r of this.blockers) {
      if (Math.max(a.x, b.x) < r.x0 || Math.min(a.x, b.x) > r.x1 || Math.max(a.y, b.y) < r.y0 || Math.min(a.y, b.y) > r.y1) continue;
      if (segmentHitsRect(a, b, r)) return false;
    }
    return true;
  }

  speedLimitAt(x: number, y: number): { kmh: number; ruleId: string } {
    for (const z of this.env.speedZones) if (pointInPoly(z.poly, x, y)) return { kmh: z.limit, ruleId: z.ruleId };
    return this.env.defaultLimit;
  }
}

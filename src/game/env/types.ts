// Shared description of a drivable environment (simulation side only — no three.js).
import type { Pose, Rect, Vec2 } from '../math';

export type EnvId = 'polygon' | 'city' | 'openRoad' | 'osm';

export type ObstacleKind = 'parked' | 'pole' | 'cone' | 'barrier' | 'post' | 'debris' | 'wall' | 'marker';

export interface StaticObs {
  id: string;
  kind: ObstacleKind;
  quad: Vec2[]; // convex
  /** soft obstacles (cones, plastic markers) are knocked over, they do not stop the car */
  soft?: boolean;
  h?: number; // render height
}

export interface SpeedZone { poly: Vec2[]; limit: number; ruleId: string }

export interface EnvData {
  id: EnvId;
  title: string;
  drivable: Vec2[][]; // convex polygons, any orientation
  heightAt(x: number, y: number): number;
  gripAt?(x: number, y: number): number;
  blockers: Rect[]; // footprints that block sight lines
  obstacles: StaticObs[];
  start: Pose;
  /** default limit and the rule that sets it */
  defaultLimit: { kmh: number; ruleId: string };
  speedZones: SpeedZone[];
}

export function rectPoly(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/** Oriented box polygon. */
export function boxPoly(cx: number, cy: number, h: number, len: number, wid: number): Vec2[] {
  const c = Math.cos(h), s = Math.sin(h), a = len / 2, b = wid / 2;
  return [[a, b], [a, -b], [-a, -b], [-a, b]].map(([lx, ly]) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }));
}

/** Quads following a centre line (for curved roads). */
export function stripPolys(pts: Vec2[], halfWidth: number, extra = 0.05): Vec2[][] {
  const out: Vec2[][] = [];
  const norm = (i: number) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const n0 = norm(i), n1 = norm(i + 1);
    const p0 = pts[i], p1 = pts[i + 1];
    const d = { x: p1.x - p0.x, y: p1.y - p0.y }; const l = Math.hypot(d.x, d.y) || 1;
    const e = { x: (d.x / l) * extra, y: (d.y / l) * extra };
    out.push([
      { x: p0.x - e.x + n0.x * halfWidth, y: p0.y - e.y + n0.y * halfWidth },
      { x: p0.x - e.x - n0.x * halfWidth, y: p0.y - e.y - n0.y * halfWidth },
      { x: p1.x + e.x - n1.x * halfWidth, y: p1.y + e.y - n1.y * halfWidth },
      { x: p1.x + e.x + n1.x * halfWidth, y: p1.y + e.y + n1.y * halfWidth },
    ]);
  }
  return out;
}

export function pointInPoly(poly: Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

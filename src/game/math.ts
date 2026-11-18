// Small 2D math kit shared by the simulation, content and renderer.
// World convention: x = east, y = north (metres). Heading h: 0 = east, +π/2 = north.

export interface Vec2 { x: number; y: number }
export interface Pose { x: number; y: number; h: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const angleDiff = (a: number, b: number) => wrapAngle(a - b);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const kmh = (ms: number) => ms * 3.6;
export const ms = (kmhV: number) => kmhV / 3.6;

export const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({
  x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1),
});
export const inRect = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad;

/** Oriented box corners (length along heading, width across). */
export function obbCorners(p: Pose, length: number, width: number, front = length / 2, back = length / 2): Vec2[] {
  const c = Math.cos(p.h), s = Math.sin(p.h);
  const hw = width / 2;
  const pts: [number, number][] = [[front, hw], [front, -hw], [-back, -hw], [-back, hw]];
  return pts.map(([lx, ly]) => ({ x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c }));
}

/** Points on the outline of an OBB (corners + edge midpoints) for curb tests. */
export function obbSamples(p: Pose, length: number, width: number): Vec2[] {
  const c = obbCorners(p, length, width);
  const out = [...c];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return out;
}

/** Separating-axis test between two convex quads. */
export function quadsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const nx = p2.y - p1.y, ny = p1.x - p2.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const q of a) { const d = q.x * nx + q.y * ny; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const q of b) { const d = q.x * nx + q.y * ny; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

export function pointInQuad(q: Vec2[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const s = cross > 0 ? 1 : cross < 0 ? -1 : 0;
    if (s !== 0) { if (sign === 0) sign = s; else if (s !== sign) return false; }
  }
  return true;
}

/** Does segment ab cross axis-aligned rect r? (Liang–Barsky) */
export function segmentHitsRect(a: Vec2, b: Vec2, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a: number, b: number) => a + (b - a) * next(),
    int: (a: number, b: number) => Math.floor(a + (b - a + 1) * next()),
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length) % arr.length],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

/**
 * A drivable/walkable polyline with rounded corners and arc-length lookup.
 * Corners are filleted with the given radius so vehicles turn smoothly.
 */
export class Path {
  pts: Vec2[] = [];
  cum: number[] = [];
  length = 0;

  constructor(waypoints: Vec2[], radius = 0, step = 0.75) {
    const pts: Vec2[] = [];
    if (waypoints.length < 2 || radius <= 0) pts.push(...waypoints.map((p) => ({ ...p })));
    else {
      pts.push({ ...waypoints[0] });
      for (let i = 1; i < waypoints.length - 1; i++) {
        const p0 = waypoints[i - 1], p1 = waypoints[i], p2 = waypoints[i + 1];
        const d0 = dist(p0, p1), d1 = dist(p1, p2);
        const r = Math.min(radius, d0 * 0.48, d1 * 0.48);
        const a = { x: p1.x + ((p0.x - p1.x) / d0) * r, y: p1.y + ((p0.y - p1.y) / d0) * r };
        const b = { x: p1.x + ((p2.x - p1.x) / d1) * r, y: p1.y + ((p2.y - p1.y) / d1) * r };
        const n = Math.max(3, Math.ceil(r / 0.6));
        for (let k = 0; k <= n; k++) {
          const t = k / n, u = 1 - t;
          pts.push({ x: u * u * a.x + 2 * u * t * p1.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p1.y + t * t * b.y });
        }
      }
      pts.push({ ...waypoints[waypoints.length - 1] });
    }
    // resample to roughly even spacing
    const out: Vec2[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = out[out.length - 1], b = pts[i];
      const d = dist(a, b);
      if (d < 1e-6) continue;
      const n = Math.max(1, Math.ceil(d / step));
      const base = out[out.length - 1];
      for (let k = 1; k <= n; k++) out.push({ x: lerp(base.x, b.x, k / n), y: lerp(base.y, b.y, k / n) });
    }
    this.pts = out;
    this.cum = [0];
    for (let i = 1; i < out.length; i++) this.cum.push(this.cum[i - 1] + dist(out[i - 1], out[i]));
    this.length = this.cum[this.cum.length - 1];
  }

  at(s: number): Pose {
    const { pts, cum } = this;
    if (s <= 0) return { x: pts[0].x, y: pts[0].y, h: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
    if (s >= this.length) {
      const n = pts.length;
      return { x: pts[n - 1].x, y: pts[n - 1].y, h: Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x) };
    }
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    const a = pts[lo], b = pts[hi];
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  /** Closest arc-length to a point (searching optionally near a hint). */
  project(p: Vec2, hint?: number, window = 40): number {
    let best = 0, bestD = Infinity;
    let i0 = 0, i1 = this.pts.length - 1;
    if (hint !== undefined) {
      while (i0 < i1 && this.cum[i0] < hint - window) i0++;
      i1 = i0;
      while (i1 < this.pts.length - 1 && this.cum[i1] < hint + window) i1++;
    }
    for (let i = i0; i <= i1; i++) {
      const d = (this.pts[i].x - p.x) ** 2 + (this.pts[i].y - p.y) ** 2;
      if (d < bestD) { bestD = d; best = this.cum[i]; }
    }
    return best;
  }
}

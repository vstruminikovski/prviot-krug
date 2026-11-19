// Отворен пат: an original hillside road. Elevation follows the road; terrain rises around it.
// Zones carry the rule that sets them (settlement 50 — чл. 35; other roads 90 — чл. 36; places where
// overtaking is prohibited — чл. 56).
import { Path, clamp, lerp, obbCorners, type Vec2 } from '../math';
import { boxPoly, stripPolys, type EnvData, type StaticObs } from './types';

const CTRL: Vec2[] = [
  { x: -40, y: 0 }, { x: 300, y: 0 }, { x: 420, y: 40 }, { x: 520, y: 140 }, { x: 560, y: 260 }, { x: 640, y: 330 },
  { x: 780, y: 360 }, { x: 900, y: 330 }, { x: 1050, y: 250 }, { x: 1200, y: 232 }, { x: 1380, y: 262 }, { x: 1520, y: 268 },
  { x: 1720, y: 300 }, { x: 1920, y: 318 }, { x: 2030, y: 278 }, { x: 2160, y: 222 }, { x: 2330, y: 200 }, { x: 2520, y: 214 },
];

export const ROAD = new Path(CTRL, 70, 1.0);
export const LANE_HALF = 3.25; // two 3.25 m lanes
export const SHOULDER = 1.0;

// elevation keyframes along s (m)
const ELEV: [number, number][] = [[0, 0], [380, 0], [600, 14], [880, 38], [980, 38], [1250, 18], [1520, 6], [1620, 5], [2000, 9], [2250, 18], [2600, 18], [3000, 18]];
export function elevAt(s: number) {
  for (let i = 1; i < ELEV.length; i++) {
    if (s <= ELEV[i][0]) {
      const [s0, e0] = ELEV[i - 1], [s1, e1] = ELEV[i];
      const u = clamp((s - s0) / (s1 - s0), 0, 1);
      return lerp(e0, e1, (1 - Math.cos(u * Math.PI)) / 2);
    }
  }
  return ELEV[ELEV.length - 1][1];
}

export const ZONES = {
  settlement: [0, 380] as [number, number],
  bendsLimit: [560, 1040] as [number, number], // 60 km/h by sign through the climbing bends
  noOvertake: [
    { s: [430, 800] as [number, number], why: 'кривини без доволна прегледност (чл. 56)' },
    { s: [820, 1020] as [number, number], why: 'пред врвот на преслапот (чл. 56)' },
    { s: [1440, 1560] as [number, number], why: 'на мост (чл. 56)' },
    { s: [2190, 2400] as [number, number], why: 'работи на патот и стеснување' },
  ],
  overtakeOk: [1600, 2000] as [number, number],
  bridge: [1460, 1540] as [number, number],
  rockfallSign: 1960,
  works: [2240, 2330] as [number, number],
  pullOff: 2490,
};

/** Point and normal at arc length s, offset sideways (positive = left of travel). */
export function along(s: number, offset = 0) {
  const p = ROAD.at(s);
  const nx = -Math.sin(p.h), ny = Math.cos(p.h);
  return { x: p.x + nx * offset, y: p.y + ny * offset, h: p.h, nx, ny };
}

/** Lane path for traffic: dir +1 forward (right lane, offset −1.62), −1 oncoming (left lane). */
export function lanePath(dir: 1 | -1, s0 = 0, s1 = ROAD.length): Path {
  const pts: Vec2[] = [];
  for (let s = s0; s <= s1; s += 6) { const a = along(s, dir === 1 ? -1.62 : 1.62); pts.push({ x: a.x, y: a.y }); }
  if (dir === -1) pts.reverse();
  return new Path(pts, 0, 1.0);
}

// spatial index from (x,y) to the nearest road arc length
const CELL = 25;
const grid = new Map<string, number[]>();
for (let i = 0; i < ROAD.pts.length; i++) {
  const p = ROAD.pts[i];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const k = `${Math.floor(p.x / CELL) + a},${Math.floor(p.y / CELL) + b}`;
    let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i);
  }
}
export function nearestS(x: number, y: number): { s: number; d: number; side: number } {
  const l = grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
  let best = -1, bd = Infinity;
  if (l) for (const i of l) { const p = ROAD.pts[i]; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } }
  if (best < 0) return { s: ROAD.project({ x, y }), d: 999, side: 0 };
  const s = ROAD.cum[best];
  const a = ROAD.at(s);
  const side = (x - a.x) * -Math.sin(a.h) + (y - a.y) * Math.cos(a.h);
  return { s, d: Math.sqrt(bd), side };
}

export function roadHeight(x: number, y: number) {
  const n = nearestS(x, y);
  return elevAt(n.s);
}

/** Terrain for rendering: road bed, with hills rising away from it (cliff on the rockfall side). */
export function terrainHeight(x: number, y: number) {
  const n = nearestS(x, y);
  const base = elevAt(n.s);
  const d = Math.max(0, n.d - LANE_HALF - SHOULDER - 2);
  const cliff = n.s > 1940 && n.s < 2220 && n.side < 0 ? 0 : 0; // rockfall slope above the left side
  const cliffSide = n.s > 1940 && n.s < 2220 && n.side > 0 ? 1.8 : 0.35;
  const hills = Math.sin(x / 90) * 6 + Math.cos(y / 70) * 5 + Math.sin((x + y) / 160) * 9;
  return base + Math.min(d * cliffSide, 40) + (d > 6 ? hills * clamp((d - 6) / 30, 0, 1) : 0) + cliff - (n.s > 1460 && n.s < 1540 && d > 0 ? Math.min(d * 0.8, 9) : 0);
}

export const PULLOFF_POLY = (() => {
  const a = along(ZONES.pullOff, -LANE_HALF - SHOULDER);
  return boxPoly(a.x + a.nx * -4, a.y + a.ny * -4, a.h, 34, 9);
})();

export function openRoadEnv(debrisS: number): EnvData {
  const centre: Vec2[] = [];
  for (let s = 0; s <= ROAD.length; s += 4) { const a = along(s); centre.push({ x: a.x, y: a.y }); }
  const drivable = stripPolys(centre, LANE_HALF + SHOULDER);
  drivable.push(PULLOFF_POLY);
  // village square at the start
  drivable.push(boxPoly(60, -14, 0, 70, 22));
  const obstacles: StaticObs[] = [];
  // rockfall debris in the right lane (obstruction; bypass or wait)
  for (let i = 0; i < 4; i++) {
    const a = along(debrisS + i * 2.2, -1.2 - (i % 2) * 0.9);
    obstacles.push({ id: `rock-${i}`, kind: 'debris', quad: obbCorners({ x: a.x, y: a.y, h: a.h + i }, 1.3 + (i % 3) * 0.3, 1.1), h: 0.8 });
  }
  // roadworks barriers closing the right lane
  for (let s = ZONES.works[0] + 6; s < ZONES.works[1] - 6; s += 4) {
    const a = along(s, -1.5);
    obstacles.push({ id: `works-${Math.round(s)}`, kind: 'barrier', quad: obbCorners({ x: a.x, y: a.y, h: a.h }, 3.6, 0.5), h: 1.0 });
  }
  return {
    id: 'openRoad', title: 'Отворен пат',
    drivable, heightAt: roadHeight,
    blockers: [], obstacles,
    start: (() => { const a = along(30, -1.62); return { x: a.x, y: a.y, h: a.h }; })(),
    defaultLimit: { kmh: 90, ruleId: 'law.speed.outside' },
    speedZones: [
      { poly: polyAlong(ZONES.settlement[0], ZONES.settlement[1]), limit: 50, ruleId: 'law.speed.settlement' },
      { poly: polyAlong(ZONES.bendsLimit[0], ZONES.bendsLimit[1]), limit: 60, ruleId: 'law.speed.outside' },
    ],
  };
}

function polyAlong(s0: number, s1: number): Vec2[] {
  const left: Vec2[] = [], right: Vec2[] = [];
  for (let s = s0; s <= s1; s += 10) { const a = along(s, 12), b = along(s, -12); left.push({ x: a.x, y: a.y }); right.push({ x: b.x, y: b.y }); }
  return [...left, ...right.reverse()];
}

// Полигон: a dedicated training ground. Exercise geometry for category B follows
// Правилник (Сл. весник на РСМ 29/2025) чл. 33 ст. 1–2; practice extras are labelled as such.
import { obbCorners, type Rect } from '../math';
import { rectPoly, type EnvData, type StaticObs } from './types';

export const PAD = { x0: -6, y0: -8, x1: 150, y1: 100 };

/** Hill: rises 10 % from x=60 to 78 along y∈[4,16], plateau to 90, falls to 104. */
export const HILL = { y0: 4, y1: 16, up0: 60, up1: 78, top1: 90, down1: 104, grade: 0.1, stopX: 71 };
export function polygonHeight(x: number, y: number) {
  if (y < HILL.y0 - 1 || y > HILL.y1 + 1) return 0;
  const edge = Math.min(1, Math.max(0, Math.min(y - (HILL.y0 - 1), HILL.y1 + 1 - y))); // soft side banks
  const H = (HILL.up1 - HILL.up0) * HILL.grade;
  let h = 0;
  if (x <= HILL.up0) h = 0;
  else if (x <= HILL.up1) h = (x - HILL.up0) * HILL.grade;
  else if (x <= HILL.top1) h = H;
  else if (x <= HILL.down1) h = H - (x - HILL.top1) * (H / (HILL.down1 - HILL.top1));
  return h * edge;
}

export interface LaneEx { kind: 'lane' | 'reverse'; x0: number; x1: number; y: number; width: number }
export interface UturnEx { kind: 'uturn'; x0: number; x1: number; y0: number; widthFor(L: number): number }
export interface ParkEx { kind: 'park'; x0: number; y0: number; width: number; lengthFor(L: number): number; laneY: number }
export interface HillEx { kind: 'hill'; stopX: number; y: number }

export const EX_LANE: LaneEx = { kind: 'lane', x0: 8, x1: 44, y: 30, width: 2.5 };
export const EX_REVERSE: LaneEx = { kind: 'reverse', x0: 8, x1: 44, y: 40, width: 2.5 };
// U-turn bay: 6 m wide for vehicles up to 4 m, 7 m for longer (чл. 33 ст. 1 т. 3)
export const EX_UTURN: UturnEx = { kind: 'uturn', x0: 8, x1: 30, y0: 52, widthFor: (L) => (L <= 4 ? 6 : 7) };
// Parallel parking: 2 m × 6 m (≤ 4 m) or 2 m × 7 m (> 4 m), posts at the corners (чл. 33 ст. 1 т. 4, ст. 2)
export const EX_PARK: ParkEx = { kind: 'park', x0: 66, y0: 52, width: 2, lengthFor: (L) => (L <= 4 ? 6 : 7), laneY: 56.2 };
export const EX_HILL: HillEx = { kind: 'hill', stopX: HILL.stopX, y: 10 };
// practice extras (not official)
export const SLALOM = { x0: 70, y: 32, gap: 7, n: 6 };
export const BAY = { x: 118, y0: 54, w: 2.6, d: 5.2, n: 5 };

export function parkRect(L: number): Rect {
  const len = EX_PARK.lengthFor(L);
  return { x0: EX_PARK.x0, y0: EX_PARK.y0, x1: EX_PARK.x0 + len, y1: EX_PARK.y0 + EX_PARK.width };
}

const post = (id: string, x: number, y: number): StaticObs => ({ id, kind: 'post', quad: obbCorners({ x, y, h: 0 }, 0.22, 0.22), soft: true, h: 1.1 });
const cone = (id: string, x: number, y: number): StaticObs => ({ id, kind: 'cone', quad: obbCorners({ x, y, h: 0 }, 0.3, 0.3), soft: true, h: 0.5 });

export function polygonEnv(vehicleLength: number): EnvData {
  const obstacles: StaticObs[] = [];
  // 110 cm markers at the corners of the exercises (white/red)
  const uw = EX_UTURN.widthFor(vehicleLength);
  for (const [x, y] of [[EX_UTURN.x0, EX_UTURN.y0], [EX_UTURN.x1, EX_UTURN.y0], [EX_UTURN.x0, EX_UTURN.y0 + uw], [EX_UTURN.x1, EX_UTURN.y0 + uw]]) obstacles.push(post(`u-${x}-${y}`, x, y));
  const pr = parkRect(vehicleLength);
  for (const [x, y] of [[pr.x0, pr.y0], [pr.x1, pr.y0], [pr.x0, pr.y1], [pr.x1, pr.y1]]) obstacles.push(post(`p-${x}-${y}`, x, y));
  for (let i = 0; i < SLALOM.n; i++) obstacles.push(cone(`s-${i}`, SLALOM.x0 + i * SLALOM.gap, SLALOM.y));
  for (let i = 0; i <= BAY.n; i++) obstacles.push(cone(`b-${i}`, BAY.x + i * BAY.w, BAY.y0 + BAY.d));
  // parked "neighbours" on either side of the parallel space give the manoeuvre its context
  return {
    id: 'polygon', title: 'Полигон',
    drivable: [rectPoly(PAD.x0, PAD.y0, PAD.x1, PAD.y1)],
    heightAt: polygonHeight,
    blockers: [],
    obstacles,
    start: { x: 3.2, y: EX_LANE.y, h: 0 },
    defaultLimit: { kmh: 30, ruleId: 'game.contact' },
    speedZones: [],
  };
}

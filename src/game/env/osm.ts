// Реално Дебар Маало (OSM): free driving on real street geometry from OpenStreetMap.
// Data © OpenStreetMap contributors, ODbL 1.0 (fetched by tools/osm/fetch-debar-maalo.mjs).
// No scored scenarios here: real signage and priority are not modelled from OSM.
import data from '../content/osm/debar-maalo.json';
import type { Rect } from '../math';
import { stripPolys, type EnvData } from './types';

export interface OsmData { attribution: string; buildings: { p: [number, number][]; h: number }[]; roads: { p: [number, number][]; w: number; n: string; oneway: boolean }[] }
export const OSM = data as unknown as OsmData;
export const OSM_ATTRIBUTION = OSM.attribution;

let cache: EnvData | null = null;
export function osmEnv(): EnvData {
  if (cache) return cache;
  const drivable = OSM.roads.flatMap((r) => stripPolys(r.p.map(([x, y]) => ({ x, y })), r.w / 2 + 0.6, 1.2));
  const blockers: Rect[] = OSM.buildings.map((b) => {
    const xs = b.p.map((q) => q[0]), ys = b.p.map((q) => q[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  });
  const start = OSM.roads.filter((r) => r.w >= 6.5 && r.p.length > 2).sort((a, b) => b.p.length - a.p.length)[0] ?? OSM.roads[0];
  const [a, b] = [start.p[0], start.p[1]];
  const h = Math.atan2(b[1] - a[1], b[0] - a[0]);
  cache = {
    id: 'osm', title: 'Реално Дебар Маало (OSM)', drivable, heightAt: () => 0, blockers, obstacles: [],
    start: { x: a[0] + Math.cos(h) * 4 + Math.sin(h) * (start.w / 4), y: a[1] + Math.sin(h) * 4 - Math.cos(h) * (start.w / 4), h },
    defaultLimit: { kmh: 50, ruleId: 'law.speed.settlement' }, speedZones: [],
  };
  return cache;
}

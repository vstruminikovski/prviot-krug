// Fetches OpenStreetMap buildings and drivable roads for Debar Maalo (Skopje) via Overpass and
// writes a compact local file (metres, x = east, y = north around the bbox centre).
// Data © OpenStreetMap contributors, ODbL 1.0 — attribution is shown in the game.
// Approach adapted from mapforge (MIT) / map3d: Overpass → extruded buildings + road ribbons.
import { writeFileSync } from 'node:fs';
const [S, W, N, E] = [41.9955, 21.4075, 42.0035, 21.4225];
const q = `[out:json][timeout:60];(way["building"](${S},${W},${N},${E});way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service)$"](${S},${W},${N},${E}););out geom;`;
const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'krug-niz-maaloto-build/1.0' } });
const data = await res.json();
const lat0 = (S + N) / 2, lon0 = (W + E) / 2, R = 6378137;
const P = (g) => [Math.round(((g.lon - lon0) * Math.PI / 180) * R * Math.cos(lat0 * Math.PI / 180) * 10) / 10, Math.round(((g.lat - lat0) * Math.PI / 180) * R * 10) / 10];
const WIDTH = { primary: 12, secondary: 10, tertiary: 8, residential: 6.5, unclassified: 6, living_street: 5, service: 4 };
const buildings = [], roads = [];
for (const w of data.elements) {
  if (!w.geometry) continue;
  const pts = w.geometry.map(P);
  if (w.tags.building) {
    const lv = parseFloat(w.tags['building:levels']) || (w.id % 3) + 2;
    buildings.push({ p: pts, h: Math.min(40, lv * 3.1) });
  } else roads.push({ p: pts, w: WIDTH[w.tags.highway] ?? 6, n: w.tags.name ?? '', oneway: w.tags.oneway === 'yes' });
}
writeFileSync(new URL('../../src/game/content/osm/debar-maalo.json', import.meta.url), JSON.stringify({ bbox: [S, W, N, E], attribution: '© OpenStreetMap contributors (ODbL)', buildings, roads }));
console.log('buildings', buildings.length, 'roads', roads.length);

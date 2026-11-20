// Query the City of Skopje traffic-signalling GIS for the route area only,
// convert the records with the City GIS adapter, merge with the MapNG/OSM
// objects and report coverage.
//
//   npm run citygis                 (fetch + report; nothing published)
//   CITY_GIS_REUSE_PERMITTED=yes npm run citygis -- --write-game-data
//
// Raw responses and the merged preview stay in .cache/city-gis/ (gitignored).
// Game data (public/mapng/...) is written ONLY with --write-game-data AND
// CITY_GIS_REUSE_PERMITTED=yes, i.e. after the City has granted reuse rights.
// levels/ is read-only.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CITY_GIS_SERVICE,
  CITY_LAYERS,
  convertLights,
  convertMarkings,
  convertSigns,
  mergeLights,
  mergeMarkings,
  mergeSigns,
  type ArcQueryResult,
  type CityLayer,
  type GeoFrame,
} from '../../src/mapng/import/cityGis';
import type { ImportedRoad, LevelIndex, LevelObjects, RouteDef } from '../../src/mapng/import/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LEVEL = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || 'prviot_krug';
const OUT = join(ROOT, 'public', 'mapng', LEVEL);
const CACHE = join(ROOT, '.cache', 'city-gis', LEVEL);
const MARGIN_M = 40;
const writeGame = process.argv.includes('--write-game-data');

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));
const mapng = readJson<{ bounds: GeoFrame['bounds']; sizeMeters: number }>(join(ROOT, 'levels', LEVEL, 'mapng.json')); // read-only
const frame: GeoFrame = { bounds: mapng.bounds, sizeMeters: mapng.sizeMeters ?? 1024 };
const index = readJson<LevelIndex>(join(OUT, 'level.json'));
const route = readJson<RouteDef>(join(OUT, index.files.route));
const objects = readJson<LevelObjects>(join(OUT, index.files.objects));
const roads = readJson<{ roads: ImportedRoad[] }>(join(OUT, index.files.roads)).roads;

// terrain height for converted points
const raw = readFileSync(join(OUT, index.terrain.file));
const n = index.terrain.size;
const heightAt = (x: number, y: number) => {
  const i = Math.max(0, Math.min(n - 1, Math.round(x - index.terrain.origin[0])));
  const j = Math.max(0, Math.min(n - 1, Math.round(y - index.terrain.origin[1])));
  return (raw.readUInt16LE((j * n + i) * 2) / 65535) * index.terrain.maxHeight;
};

// route bbox in WGS84 (only the area the route needs)
const toLatLng = (x: number, y: number) => ({
  lat: frame.bounds.south + ((y + frame.sizeMeters / 2) / frame.sizeMeters) * (frame.bounds.north - frame.bounds.south),
  lng: frame.bounds.west + ((x + frame.sizeMeters / 2) / frame.sizeMeters) * (frame.bounds.east - frame.bounds.west),
});
const xs = route.points.map((p) => p[0]), ys = route.points.map((p) => p[1]);
const sw = toLatLng(Math.min(...xs) - MARGIN_M, Math.min(...ys) - MARGIN_M);
const ne = toLatLng(Math.max(...xs) + MARGIN_M, Math.max(...ys) + MARGIN_M);
const envelope = { xmin: sw.lng, ymin: sw.lat, xmax: ne.lng, ymax: ne.lat, spatialReference: { wkid: 4326 } };
const inRoute = (p: number[]) => p[0] >= Math.min(...xs) - MARGIN_M && p[0] <= Math.max(...xs) + MARGIN_M && p[1] >= Math.min(...ys) - MARGIN_M && p[1] <= Math.max(...ys) + MARGIN_M;

async function getJson(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': 'mapng-route-importer' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function query(layer: CityLayer): Promise<ArcQueryResult> {
  const p = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify(envelope),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
  });
  return getJson(`${CITY_GIS_SERVICE}/${CITY_LAYERS[layer]}/query?${p}`);
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const service = await getJson(`${CITY_GIS_SERVICE}?f=json`);
  const results = {} as Record<CityLayer, ArcQueryResult>;
  for (const layer of Object.keys(CITY_LAYERS) as CityLayer[]) {
    results[layer] = await query(layer);
    if (results[layer].error) throw new Error(`layer ${layer}: ${results[layer].error!.message}`);
    writeFileSync(join(CACHE, `${layer}.json`), JSON.stringify(results[layer]));
  }

  const opts = { index: frame, heightAt, rotation: 'geographic' as const };
  const signs = mergeSigns(convertSigns(results.signs, opts), objects.signs.filter((s) => inRoute(s.pos)));
  const lights = mergeLights(convertLights(results.lights, opts), objects.signals.instances.filter((s) => inRoute(s.pos)));
  const markingsCity = [...convertMarkings(results.longitudinal, 'longitudinal', opts), ...convertMarkings(results.transverse, 'transverse', opts)];
  const markings = mergeMarkings(markingsCity, roads.filter((r) => (r.kind === 'marking' || r.kind === 'zebra') && r.points.some(inRoute)));
  writeFileSync(join(CACHE, 'merged-preview.json'), JSON.stringify({ signs: signs.items, lights: lights.items, markings: markings.items }));

  const count = (l: CityLayer) => results[l].features?.length ?? 0;
  const dates = (Object.keys(CITY_LAYERS) as CityLayer[])
    .flatMap((l) => (results[l].features ?? []).map((f) => f.attributes.datum_snimanja ?? f.attributes.datum_snim))
    .filter((d): d is number => typeof d === 'number')
    .sort();
  const fmt = (d?: number) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
  const report = [
    `# City of Skopje GIS coverage — ${LEVEL} route`,
    '',
    `Queried: ${new Date().toISOString()}`,
    `Service: ${CITY_GIS_SERVICE}`,
    `Area: route bbox + ${MARGIN_M} m (WGS84 ${envelope.xmin.toFixed(6)},${envelope.ymin.toFixed(6)} → ${envelope.xmax.toFixed(6)},${envelope.ymax.toFixed(6)})`,
    `Service copyright text: ${JSON.stringify(service.copyrightText ?? '')}; licence stated: ${/licen|лиценц|CC|ODbL|open/i.test(JSON.stringify(service)) ? 'see service JSON' : 'none'}`,
    '',
    '| Layer | Records in route area |',
    '|---|---|',
    ...(Object.keys(CITY_LAYERS) as CityLayer[]).map((l) => `| ${CITY_LAYERS[l]} ${l} | ${count(l)} |`),
    '',
    `Survey dates: ${dates.length ? `${fmt(dates[0])} … ${fmt(dates[dates.length - 1])}` : 'none (no records)'}`,
    '',
    '## Merge result (route area)',
    `- Signs: ${signs.city} City, ${signs.osmReplaced} OSM replaced, ${signs.osmKept} OSM kept (unverified)`,
    `- Traffic lights: ${lights.city} City, ${lights.osmReplaced} OSM replaced, ${lights.osmKept} OSM kept (unverified); timing: simulated`,
    `- Markings: ${markings.city} City, ${markings.osmReplaced} OSM replaced, ${markings.osmKept} OSM kept (unverified)`,
  ].join('\n');
  writeFileSync(join(CACHE, 'report.md'), report + '\n');
  console.log(report);

  if (writeGame) {
    if (process.env.CITY_GIS_REUSE_PERMITTED !== 'yes')
      throw new Error('Refusing to write City GIS records into game data: no reuse permission (set CITY_GIS_REUSE_PERMITTED=yes only after the City grants it).');
    if (!signs.city && !lights.city && !markings.city) {
      console.log('No City records in the route area; game data left unchanged.');
      return;
    }
    const cityFile = join(OUT, 'city-gis.json');
    writeFileSync(cityFile, JSON.stringify({ source: CITY_GIS_SERVICE, queried: new Date().toISOString(), signs: signs.items, lights: lights.items, markings: markings.items }));
    console.log(`wrote ${cityFile}`);
  } else if (existsSync(join(OUT, 'city-gis.json'))) {
    console.log('Note: an existing public city-gis.json was left untouched.');
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

// MapNG level importer. Reads an extracted BeamNG level under levels/<name>/
// strictly read-only and writes browser-ready data to public/mapng/<name>/.
//
//   npm run mapng:import            (defaults to prviot_krug)
//   npm run mapng:import -- <name>
//
// Every source file ends up in manifest.json with its status and output.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNetwork, routeToNearestJunction } from '../../src/mapng/import/network';
import type {
  ImportedRoad,
  LevelIndex,
  LevelObjects,
  ManifestEntry,
  PlacedModel,
  PropInstance,
  RoadKind,
  Vec3,
} from '../../src/mapng/import/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LEVEL = process.argv[2] || 'prviot_krug';
const SRC = join(ROOT, 'levels', LEVEL);
const OUT = join(ROOT, 'public', 'mapng', LEVEL);

if (!existsSync(SRC)) throw new Error(`No level at ${SRC}`);
if (resolve(OUT).startsWith(resolve(ROOT, 'levels') + sep)) throw new Error('Refusing to write inside levels/');

// ---------- read-only helpers ----------
const rel = (abs: string) => relative(ROOT, abs).split(sep).join('/');
const read = (p: string) => readFileSync(join(SRC, p));
const readJson = <T = any>(p: string): T => JSON.parse(read(p).toString('utf8'));
const readJsonLines = (p: string): any[] =>
  read(p)
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
/** BeamNG absolute asset path (/levels/x/...) to a path under SRC, if it exists. */
const resolveAsset = (p: string) => {
  const m = p.match(/^\/?levels\/[^/]+\/(.*)$/);
  return m && existsSync(join(SRC, m[1])) ? m[1] : null;
};

const allFiles = walk(SRC)
  .map((p) => relative(SRC, p).split(sep).join('/'))
  .filter((p) => !p.endsWith('.DS_Store'));
const hashBefore = hashTree();
const manifest = new Map<string, ManifestEntry>();
const mark = (source: string, e: Omit<ManifestEntry, 'source'>) => {
  const prev = manifest.get(source);
  // keep the strongest status if a file feeds several outputs
  if (prev && prev.status === 'converted' && e.status !== 'converted') return;
  if (prev?.output && e.output && prev.output !== e.output) e = { ...e, output: `${prev.output}, ${e.output}` };
  manifest.set(source, { source: `levels/${LEVEL}/${source}`, ...e });
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const write = (name: string, data: string | Buffer) => {
  mkdirSync(dirname(join(OUT, name)), { recursive: true });
  writeFileSync(join(OUT, name), data);
};
const copy = (src: string, out: string) => {
  mkdirSync(dirname(join(OUT, out)), { recursive: true });
  copyFileSync(join(SRC, src), join(OUT, out));
};

const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};

// ---------- level meta ----------
const info = readJson('info.json');
const mapng = readJson('mapng.json');
mark('info.json', { status: 'converted', kind: 'level info', output: 'level.json' });
mark('mapng.json', { status: 'converted', kind: 'MapNG export meta (bounds, spawn)', output: 'level.json' });

// lat/lng → world (the terrain is resampled linearly over the export bounds)
const B = mapng.bounds;
const SIZE: number = mapng.sizeMeters ?? 1024;
const toWorld = (lat: number, lng: number): [number, number] => [
  ((lng - B.west) / (B.east - B.west)) * SIZE - SIZE / 2,
  ((lat - B.south) / (B.north - B.south)) * SIZE - SIZE / 2,
];

// ---------- terrain ----------
const terJson = readJson('terrain.terrain.json');
const ter = read('art/terrains/terrain.ter');
const terVersion = ter.readUInt8(0);
const terSize = ter.readUInt32LE(1);
if (terSize !== terJson.size) throw new Error(`terrain size mismatch ${terSize} vs ${terJson.size}`);
const heights = Buffer.from(ter.subarray(5, 5 + terSize * terSize * 2));
write('terrain_height.u16', heights);
const levelObjects = readJsonLines('main/MissionGroup/level_objects/items.level.json');
const terrainBlock = levelObjects.find((o) => o.class === 'TerrainBlock');
const maxHeight: number = terrainBlock?.maxHeight ?? 10;
const terrainOrigin: [number, number] = [terrainBlock?.position?.[0] ?? -SIZE / 2, terrainBlock?.position?.[1] ?? -SIZE / 2];
const hAt = (x: number, y: number) => {
  const i = Math.max(0, Math.min(terSize - 1, Math.round(x - terrainOrigin[0])));
  const j = Math.max(0, Math.min(terSize - 1, Math.round(y - terrainOrigin[1])));
  return (heights.readUInt16LE((j * terSize + i) * 2) / 65535) * maxHeight;
};
copy('art/terrains/terrain.png', 'terrain_base.png');
mark('art/terrains/terrain.ter', { status: 'converted', kind: `terrain heightmap v${terVersion}`, output: 'terrain_height.u16' });
mark('terrain.terrain.json', { status: 'converted', kind: 'terrain descriptor', output: 'level.json' });
mark('art/terrains/terrain.png', { status: 'copied', kind: 'terrain colour texture (2048², hybrid imagery)', output: 'terrain_base.png' });
mark('art/terrains/terrain.terrainheightmap.png', {
  status: 'not-needed',
  kind: '16-bit heightmap PNG',
  note: 'same data as terrain.ter; browsers decode PNGs to 8 bits, so the .ter is used',
});
say(`terrain: ${terSize}x${terSize}, 1 m/sample, ${maxHeight} m height range`);

// ---------- roads ----------
const roadFiles = allFiles.filter((f) => f.startsWith('main/MissionGroup/Decal_Roads/') && f.endsWith('items.level.json'));
const roads: ImportedRoad[] = [];
const kindOf = (group: string, o: any): RoadKind => {
  const m: string = o.material ?? '';
  if (/zebra/.test(m)) return 'zebra';
  if (/^m_line/.test(m)) return 'marking';
  if (/gutter/.test(m)) return 'gutter';
  if (/^(footway|cycleway|pedestrian|path|steps)/.test(group)) return 'path';
  if (/^service_/.test(group)) return /asphalt|concrete|dirt/.test(m) ? 'service' : 'other';
  if (o.drivability > 0 && /^road_/.test(group) && m !== 'road_invisible') return 'carriageway';
  if (o.drivability > 0 && m === 'road_invisible') return 'carriageway';
  return 'other';
};
for (const f of roadFiles) {
  const group = f.split('/')[3];
  for (const o of readJsonLines(f)) {
    if (o.class !== 'DecalRoad' || !Array.isArray(o.nodes)) continue;
    roads.push({
      id: o.name,
      group,
      kind: kindOf(group, o),
      material: o.material,
      oneWay: !!o.oneWay,
      lanesLeft: o.lanesLeft ?? (o.mapngLanes ? +o.mapngLanes.split(' ')[1] : 1),
      lanesRight: o.lanesRight ?? (o.mapngLanes ? +o.mapngLanes.split(' ')[0] : 1),
      points: o.nodes.map((n: number[]) => [round(n[0]), round(n[1]), round(n[2]), round(n[3])]),
    });
  }
  mark(f, { status: 'converted', kind: 'DecalRoad group', output: 'roads.json' });
}
const byKind = count(roads.map((r) => r.kind));
say(`roads: ${roads.length} DecalRoads (${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(', ')})`);
write('roads.json', JSON.stringify({ roads }));

// OSM bundle (only used to name places and align): parking lots, POIs
const report = readJson('mapng_source/export_report.json');
const osm: any[] = report.mapData?.features ?? [];
mark('mapng_source/export_report.json', {
  status: 'converted',
  kind: `MapNG report with bundled OSM (${osm.length} features)`,
  output: 'objects.json',
});
// alignment check: OSM road vertices vs nearest DecalRoad node
{
  const nodes = roads.filter((r) => r.kind === 'carriageway').flatMap((r) => r.points);
  const errs: number[] = [];
  for (const f of osm.filter((f) => f.type === 'road' && /^(primary|secondary|tertiary|residential|unclassified)$/.test(f.tags?.highway ?? '')))
    for (const g of f.geometry.slice(1, -1)) {
      const [x, y] = toWorld(g.lat, g.lng);
      if (Math.abs(x) > 480 || Math.abs(y) > 480) continue;
      let m = Infinity;
      for (const n of nodes) m = Math.min(m, Math.hypot(n[0] - x, n[1] - y));
      errs.push(m);
    }
  errs.sort((a, b) => a - b);
  say(`OSM street centre lines vs DecalRoads: median ${errs[errs.length >> 1]?.toFixed(2)} m over ${errs.length} road vertices`);
}

// ---------- network + route ----------
const net = buildNetwork(roads);
say(
  `road graph: ${net.nodes.length} nodes, ${net.edges.length} edges, ${net.nodes.filter((n) => n.junction).length} junctions`,
);
write('network.json', JSON.stringify(net));

const parkingAreas = osm
  .filter((f) => f.tags?.amenity === 'parking' && f.geometry?.length > 2)
  .map((f) => ({
    id: String(f.id),
    name: f.tags['name:en'] || f.tags.name || '',
    polygon: f.geometry.map((g: any) => toWorld(g.lat, g.lng).map(round) as [number, number]),
  }));
const zooFeature = osm.find((f) => f.tags?.tourism === 'zoo');
const zooTicket = osm.find((f) => /zoo/i.test(f.tags?.name ?? '') && f.type === 'building');
const centroid = (poly: [number, number][]) =>
  [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length] as [number, number];
const zooRef = zooTicket ?? zooFeature;
const zooPt: [number, number] | null = zooRef
  ? centroid(zooRef.geometry.map((g: any) => toWorld(g.lat, g.lng)))
  : null;
// the zoo's parking lot: the OSM parking area closest to the zoo ticket office
let zooParking = parkingAreas[0];
if (zooPt)
  zooParking = parkingAreas
    .slice()
    .sort((a, b) => Math.hypot(...sub(centroid(a.polygon), zooPt)) - Math.hypot(...sub(centroid(b.polygon), zooPt)))[0];
const pc = centroid(zooParking.polygon);
say(
  `zoo: ${zooRef ? `${zooRef.tags.name} at ${zooPt!.map(Math.round)}` : 'not found'}; parking lot "${zooParking.name}" (OSM ${zooParking.id}) at ${pc.map(Math.round)}`,
);
const route = routeToNearestJunction(net, [pc[0], pc[1], hAt(pc[0], pc[1])], `Zoo parking (${zooParking.name})`, 'zoo-parking-to-junction');
if (!route) throw new Error('No route from zoo parking to a junction');
say(
  `route: ${route.length.toFixed(0)} m, ${route.edgeIds.length} graph edges, junction node ${route.end.nodeId} at ${route.end.p.slice(0, 2).map(Math.round)}`,
);
write('route.json', JSON.stringify(route));

// ---------- objects ----------
// BeamNG stores rotationMatrix so that element 3 is −sin(heading) in our x-east/y-north
// frame (checked against the data: wall segments line up with their neighbours and
// signs face their road only with this sign).
const yawOf = (m?: number[]) => (m ? Math.atan2(-m[3], m[0]) : 0);
const mg = (p: string) => `main/MissionGroup/${p}/items.level.json`;
const drop = readJsonLines(mg('PlayerDropPoints')).find((o) => o.class === 'SpawnSphere');
mark(mg('PlayerDropPoints'), { status: 'converted', kind: 'spawn point', output: 'objects.json' });
const sites = readJson('city.sites.json');
mark('city.sites.json', { status: 'converted', kind: 'parking spots', output: 'objects.json' });
const quatYaw = (q: number[]) => 2 * Math.atan2(q[2], q[3]);
const signals = readJson('signals.json');
mark('signals.json', { status: 'converted', kind: 'traffic light controllers + sequences', output: 'objects.json' });

const props = (group: string) => {
  const f = mg(group);
  if (!allFiles.includes(f)) return [] as any[];
  mark(f, { status: 'converted', kind: `${group} placements`, output: 'objects.json' });
  return readJsonLines(f);
};
const toProp = (o: any, type: string): PropInstance => ({
  type,
  pos: o.position.map(round) as Vec3,
  yaw: round(yawOf(o.rotationMatrix)),
  scale: Array.isArray(o.scale) ? o.scale[0] : (o.scale ?? 1),
});
const shapeBase = (o: any) => String(o.shapeName ?? '').split('/').pop()!.replace(/\.dae$/i, '');
const signs = props('signs')
  .filter((o) => o.class === 'TSStatic')
  .map((o) => toProp(o, shapeBase(o).replace(/^italy_traf_sign_/, '')));
const furniture = props('street_furniture').filter((o) => o.class === 'TSStatic');
const lamps = furniture
  .filter((o) => /lamp|pole_light|stadium_lights/.test(shapeBase(o)))
  .map((o) => toProp(o, shapeBase(o)));
const barriers = props('barriers').filter((o) => o.class === 'TSStatic');
const fences = barriers.map((o) => toProp(o, shapeBase(o)));
props('traffic_signals');
props('CameraBookmarks');
props('gasStations');
const trees: PropInstance[] = [];
for (const f of allFiles.filter((f) => f.startsWith('forest/') && f.endsWith('.forest4.json'))) {
  for (const o of readJsonLines(f))
    trees.push({ type: o.type, pos: o.pos.map(round) as Vec3, yaw: round(yawOf(o.rotationMatrix)), scale: o.scale ?? 1 });
  mark(f, { status: 'converted', kind: 'tree placements', output: 'objects.json' });
}
const objects: LevelObjects = {
  spawn: { p: drop.position, heading: yawOf(drop.rotationMatrix) },
  parkingSpots: (sites.parkingSpots ?? []).map((s: any) => ({
    name: s.name,
    pos: s.pos.map(round),
    yaw: round(quatYaw(s.rot)),
    size: s.scl,
  })),
  parkingAreas,
  signals: {
    instances: signals.instances.map((i: any) => ({
      id: i.id,
      pos: i.pos,
      dir: i.dir,
      controllerId: i.controllerId,
      sequenceId: i.sequenceId,
    })),
    controllers: signals.controllers.map((c: any) => ({ id: c.id, name: c.name, states: c.states })),
    sequences: signals.sequences.map((s: any) => ({ id: s.id, name: s.name, phases: s.phases })),
  },
  signs,
  lamps,
  trees,
  fences,
  pois: [
    ...(zooPt ? [{ name: 'Zoo Skopje', p: [round(zooPt[0]), round(zooPt[1]), round(hAt(...zooPt))] as Vec3 }] : []),
  ],
};
write('objects.json', JSON.stringify(objects));
say(
  `objects: ${objects.parkingSpots.length} parking spots, ${parkingAreas.length} OSM parking areas, ${objects.signals.instances.length} traffic lights, ${signs.length} signs, ${lamps.length} lamps, ${trees.length} trees, ${fences.length} barriers`,
);

// ---------- models (Collada written by three.js: browser-readable as is) ----------
const models: PlacedModel[] = [];
const linkTargets = new Set<string>();
for (const o of levelObjects.concat(barriers, furniture)) {
  if (o.class !== 'TSStatic' || !o.shapeName) continue;
  const local = resolveAsset(o.shapeName);
  if (!local) {
    if (existsSync(join(SRC, o.shapeName.replace(/^\/?levels\/[^/]+\//, '') + '.link'))) linkTargets.add(o.shapeName);
    continue;
  }
  if (!/osm_objects\/buildings|sidewalks|mapng_flag/.test(local)) continue;
  const role = local.includes('sidewalks') ? 'sidewalks' : local.includes('flag') ? 'flag' : 'buildings';
  const out = `models/${role}/${local.split('/').pop()}`;
  if (!existsSync(join(OUT, out))) copy(local, out);
  mark(local, { status: 'copied', kind: `Collada ${role} tile (three.js export, with collision mesh)`, output: out });
  models.push({ name: o.name, file: out, position: o.position, rotation: o.rotationMatrix, scale: o.scale, role });
}
mark('main/MissionGroup/level_objects/items.level.json', { status: 'converted', kind: 'terrain block + model placements', output: 'level.json' });
say(`models: ${models.filter((m) => m.role === 'buildings').length} building tiles, ${models.filter((m) => m.role === 'sidewalks').length} sidewalk tiles`);

// ---------- everything else: classify ----------
const ddsFormat = (p: string) => {
  const b = read(p);
  const four = b.subarray(84, 88).toString('latin1');
  return four === 'DX10' ? `DX10 dxgi=${b.readUInt32LE(128)}` : four.replace(/\0/g, '') || 'uncompressed';
};
for (const f of allFiles) {
  if (manifest.has(f)) continue;
  if (f.endsWith('.link')) {
    let target = '';
    try {
      target = readJson(f).path;
    } catch {
      /* keep empty */
    }
    mark(f, {
      status: 'unreadable',
      kind: 'BeamNG asset link',
      note: `points to ${target || '?'} inside the BeamNG game install; the file itself is not in the archive`,
    });
  } else if (f.endsWith('.dds')) {
    mark(f, {
      status: 'unreadable',
      kind: `DDS cubemap face (${ddsFormat(f)})`,
      note: 'HDR float DDS; three.js DDSLoader only reads DXT/BC block formats. Sky is drawn procedurally instead',
    });
  } else if (f.endsWith('.lua')) {
    mark(f, { status: 'unreadable', kind: 'BeamNG Lua level script', note: 'engine-specific game logic, not data' });
  } else if (f.endsWith('.dae')) {
    mark(f, { status: 'not-needed', kind: 'Collada model', note: 'not on the drivable map (lamp glow / backdrop mesh)' });
  } else if (f.endsWith('materials.json') || f.endsWith('.ter')) {
    mark(f, { status: 'not-needed', kind: 'BeamNG material definitions', note: 'materials map to BeamNG shaders; colours are rebuilt in the browser' });
  } else if (/\.(png|jpg)$/.test(f)) {
    mark(f, { status: 'not-needed', kind: 'image', note: 'preview / BeamNG material texture not used by the browser renderer' });
  } else if (f.endsWith('.json')) {
    mark(f, { status: 'not-needed', kind: 'BeamNG scene/editor data', note: 'not used by the first route' });
  } else {
    mark(f, { status: 'not-needed', kind: 'other' });
  }
}

const index: LevelIndex = {
  name: info.title ?? LEVEL,
  center: mapng.center,
  bounds: mapng.bounds,
  sizeMeters: SIZE,
  terrain: {
    file: 'terrain_height.u16',
    size: terSize,
    squareSize: terrainBlock?.squareSize ?? 1,
    maxHeight,
    origin: terrainOrigin,
    baseTexture: 'terrain_base.png',
    layout: 'row-major-south-up-uint16',
  },
  models,
  files: { roads: 'roads.json', network: 'network.json', objects: 'objects.json', route: 'route.json' },
};
write('level.json', JSON.stringify(index, null, 1));

// ---------- manifest + report ----------
const entries = [...manifest.values()].sort((a, b) => a.source.localeCompare(b.source));
const tally = count(entries.map((e) => e.status));
const outputs = walk(OUT).map((p) => ({ file: relative(OUT, p).split(sep).join('/'), bytes: statSync(p).size }));
const hashAfter = hashTree();
if (hashAfter !== hashBefore) throw new Error('levels/ changed during import!');
write(
  'manifest.json',
  JSON.stringify(
    {
      level: LEVEL,
      source: `levels/${LEVEL}`,
      sourceTreeSha256: hashBefore,
      importedAt: new Date().toISOString(),
      tally,
      outputs,
      entries,
      log,
    },
    null,
    1,
  ),
);
say(`manifest: ${entries.length} source files — ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}`);
say(`source tree unchanged (sha256 ${hashBefore.slice(0, 12)}…)`);
say(`wrote ${rel(OUT)}/`);

// ---------- utils ----------
function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
function count(xs: string[]) {
  const o: Record<string, number> = {};
  for (const x of xs) o[x] = (o[x] ?? 0) + 1;
  return o;
}
function sub(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}
function hashTree() {
  const h = createHash('sha256');
  for (const f of walk(SRC).sort()) {
    h.update(relative(SRC, f));
    h.update(readFileSync(f));
  }
  return h.digest('hex');
}

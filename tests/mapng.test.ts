// MapNG import: converted data is consistent with the source level, the route
// starts in the zoo parking lot and ends at a junction, and the Rapier terrain
// heightfield lines up with the heightmap.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeTerrain } from '../src/mapng/import/loadLevel';
import type { RoadNetwork } from '../src/mapng/import/network';
import type { LevelIndex, LevelObjects, RouteDef } from '../src/mapng/import/types';
import { heightfieldDesc } from '../src/mapng/physics/world';
import { SignalSystem } from '../src/mapng/traffic/signals';
import { kraussSpeed, PASSENGER, stopSpeed } from '../src/mapng/traffic/sumoModels';

const OUT = join(__dirname, '..', 'public', 'mapng', 'prviot_krug');
const have = existsSync(join(OUT, 'level.json'));
const json = <T>(f: string): T => JSON.parse(readFileSync(join(OUT, f), 'utf8'));

describe.skipIf(!have)('MapNG import (run npm run mapng:import first)', () => {
  let index: LevelIndex, route: RouteDef, net: RoadNetwork, objects: LevelObjects;
  beforeAll(() => {
    index = json('level.json');
    route = json('route.json');
    net = json('network.json');
    objects = json('objects.json');
  });

  it('route starts inside the zoo parking lot and ends on a junction node', () => {
    const lot = objects.parkingAreas.find((a) => a.name === 'Parking Zone C')!;
    expect(lot).toBeTruthy();
    const [x, y] = route.start.p;
    // point-in-polygon, with a few metres tolerance for the aisle edge
    const xs = lot.polygon.map((p) => p[0]), ys = lot.polygon.map((p) => p[1]);
    expect(x).toBeGreaterThan(Math.min(...xs) - 5);
    expect(x).toBeLessThan(Math.max(...xs) + 5);
    expect(y).toBeGreaterThan(Math.min(...ys) - 5);
    expect(y).toBeLessThan(Math.max(...ys) + 5);
    expect(net.nodes[route.end.nodeId].junction).toBe(true);
    expect(route.length).toBeGreaterThan(50);
    expect(route.length).toBeLessThan(400);
  });

  it('route is continuous (no jumps between points)', () => {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(8);
    }
  });

  it('Rapier heightfield matches the heightmap sampler', async () => {
    await RAPIER.init();
    const raw = readFileSync(join(OUT, index.terrain.file));
    const t = makeTerrain(index.terrain, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(heightfieldDesc(RAPIER, t));
    world.step();
    for (const [x, y] of [
      [route.start.p[0], route.start.p[1]],
      [-300, 250],
      [200, -400],
      [10.5, 3.25],
    ]) {
      const ray = new RAPIER.Ray({ x, y: 100, z: -y }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, 200, true);
      expect(hit).not.toBeNull();
      expect(100 - hit!.timeOfImpact).toBeCloseTo(t.heightAt(x, y), 1);
    }
  });

  it('world ↔ lat/lng conversion round-trips and puts the start at the zoo lot', async () => {
    const { geo } = await import('../src/mapng/imagery/mapillary');
    const g = geo(index);
    const ll = g.toLatLng(route.start.p[0], route.start.p[1]);
    expect(ll.lat).toBeCloseTo(42.0053, 3); // Parking Zone C, Zoo Skopje
    expect(ll.lng).toBeCloseTo(21.4179, 3);
    const w = g.toWorld(ll.lat, ll.lng);
    expect(w.x).toBeCloseTo(route.start.p[0], 6);
    expect(w.y).toBeCloseTo(route.start.p[1], 6);
  });

  it('signal programs cycle through green, yellow and red', () => {
    const sys = new SignalSystem(objects.signals);
    const id = objects.signals.instances[0].id;
    const seen = new Set<string>();
    for (let t = 0; t < 120; t += 0.5) seen.add(sys.state(id, t));
    expect([...seen].sort()).toEqual(['green', 'red', 'yellow']);
  });
});

describe('SUMO models', () => {
  it('Krauss keeps a safe speed behind a stopped leader', () => {
    let v = 13.9, gap = 40;
    for (let i = 0; i < 400; i++) {
      v = kraussSpeed(PASSENGER, v, gap, 0, 13.9, 0.1, 0);
      gap -= v * 0.1;
    }
    expect(gap).toBeGreaterThan(-0.01);
    expect(v).toBeLessThan(0.05);
  });
  it('stopSpeed stops within the distance', () => {
    let v = 13.9, d = 30;
    for (let i = 0; i < 300; i++) {
      v = stopSpeed(PASSENGER, v, d, 0.05);
      d -= v * 0.05;
    }
    expect(d).toBeGreaterThan(-0.01);
  });
});

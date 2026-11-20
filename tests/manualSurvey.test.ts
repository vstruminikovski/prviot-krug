// Manual survey layer. All features below are SYNTHETIC test fixtures (made-up
// positions near the route) used only to exercise the code; they are not survey data.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latLngToWorld, type GeoFrame } from '../src/mapng/import/cityGis';
import { convertSurvey, mergeSurvey, type SurveyCollection, type SurveyFeature } from '../src/mapng/import/manualSurvey';
import type { ImportedRoad, LevelObjects } from '../src/mapng/import/types';

const frame: GeoFrame = {
  bounds: { north: 42.0081198283681, south: 41.998828670911365, west: 21.406403607562424, east: 21.41886132316271 },
  sizeMeters: 1024,
};
const h = () => 3;
const ll = (x: number, y: number) => [
  frame.bounds.west + ((x + 512) / 1024) * (frame.bounds.east - frame.bounds.west),
  frame.bounds.south + ((y + 512) / 1024) * (frame.bounds.north - frame.bounds.south),
] as [number, number];
const base = { source: 'synthetic test', surveyor: 'test', surveyDate: '2026-11-20', verified: true };
const fc = (...features: SurveyFeature[]): SurveyCollection => ({ type: 'FeatureCollection', features });
const pt = (id: string, kind: string, xy: [number, number], props: Record<string, unknown>): SurveyFeature => ({
  type: 'Feature',
  id,
  geometry: { type: 'Point', coordinates: ll(...xy) },
  properties: { kind, ...base, ...props },
});

describe('manual survey layer', () => {
  it('the shipped survey file is valid and empty (no invented features)', () => {
    const file = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'survey', 'prviot_krug.geojson'), 'utf8'));
    expect(file.type).toBe('FeatureCollection');
    expect(file.features).toEqual([]);
  });

  it('places points through the MapNG transform exactly', () => {
    const r = convertSurvey(fc(pt('s1', 'sign', [349, 218], { code: 'II-2', facing: 90, roadSide: 'right' })), frame, h);
    expect(r.rejected).toEqual([]);
    const s = r.signs[0];
    const w = latLngToWorld(frame, ll(349, 218)[1], ll(349, 218)[0]);
    expect(s.pos[0]).toBeCloseTo(w.x, 9);
    expect(s.pos[0]).toBeCloseTo(349, 6);
    expect(s.pos[1]).toBeCloseTo(218, 6);
    expect(s.type).toBe('stop');
    expect(s.provenance).toMatchObject({ source: 'manual-survey', code: 'II-2', surveyDate: '2026-11-20', roadSide: 'right', verified: true });
  });

  it('facing bearing turns the sign face the right way in the renderer', () => {
    // renderer plate normal in world x/y = (sin yaw, −cos yaw); bearing 90° = facing east
    const [s] = convertSurvey(fc(pt('s', 'sign', [0, 0], { code: 'III-3', facing: 90, roadSide: 'right' })), frame, h).signs;
    expect(Math.sin(s.yaw)).toBeCloseTo(1, 6);
    expect(-Math.cos(s.yaw)).toBeCloseTo(0, 6);
    const [n] = convertSurvey(fc(pt('n', 'sign', [0, 0], { code: 'III-3', facing: 0, roadSide: 'right' })), frame, h).signs;
    expect(-Math.cos(n.yaw)).toBeCloseTo(1, 6); // north
  });

  it('rejects incomplete records instead of guessing', () => {
    const r = convertSurvey(
      fc(
        pt('noCode', 'sign', [0, 0], { facing: 0, roadSide: 'right' }),
        pt('badCode', 'sign', [0, 0], { code: 'stop', facing: 0, roadSide: 'right' }),
        pt('noFacing', 'sign', [0, 0], { code: 'II-2', roadSide: 'right' }),
        pt('noSide', 'light', [0, 0], { code: 'VI-4.1', facing: 10 }),
        pt('noDate', 'sign', [0, 0], { code: 'II-2', facing: 0, roadSide: 'right', surveyDate: undefined }),
        pt('wrongGeom', 'line', [0, 0], { code: 'V-1' }),
        pt('outside', 'sign', [900, 0], { code: 'II-2', facing: 0, roadSide: 'right' }),
      ),
      frame,
      h,
    );
    expect(r.signs).toHaveLength(0);
    expect(r.lights).toHaveLength(0);
    expect(r.rejected.map((x) => x.id)).toEqual(['noCode', 'badCode', 'noFacing', 'noSide', 'noDate', 'wrongGeom', 'outside']);
  });

  it('lines become stop/lane lines; polygons become zebras with their real width', () => {
    const stop: SurveyFeature = { type: 'Feature', id: 'l', geometry: { type: 'LineString', coordinates: [ll(0, 0), ll(6, 0)] }, properties: { kind: 'line', code: 'V-1', ...base } };
    const zebra: SurveyFeature = {
      type: 'Feature',
      id: 'z',
      geometry: { type: 'Polygon', coordinates: [[ll(0, 0), ll(10, 0), ll(10, 3), ll(0, 3), ll(0, 0)]] },
      properties: { kind: 'area', code: 'V-4', ...base },
    };
    const r = convertSurvey(fc(stop, zebra), frame, h);
    expect(r.markings.map((m) => m.kind)).toEqual(['marking', 'zebra']);
    expect(r.markings[0].points[0][3]).toBe(0.5); // stop-line default width
    expect(r.markings[1].points).toHaveLength(2);
    expect(r.markings[1].points[0][3]).toBeCloseTo(3, 3); // crossing depth from the polygon
  });

  it('merges survey first, keeps OSM as unverified fallback, lights stay SIM', () => {
    const objects = {
      signs: [
        { type: 'one_way', pos: [10, 0, 3], yaw: 0, scale: 1 },
        { type: 'one_way', pos: [200, 0, 3], yaw: 0, scale: 1 },
      ],
      signals: { instances: [{ id: 4, pos: [50, 0, 3], dir: [1, 0, 0], controllerId: 1, sequenceId: 3 }], controllers: [], sequences: [] },
    } as unknown as LevelObjects;
    const roads: ImportedRoad[] = [{ id: 'osm-line', group: 'road', kind: 'marking', material: 'm_line_white', oneWay: false, lanesLeft: 0, lanesRight: 0, points: [[0, 0, 3, 0.15], [6, 0, 3, 0.15]] }];
    const layer = convertSurvey(
      fc(
        pt('sign', 'sign', [12, 0], { code: 'III-2', facing: 0, roadSide: 'right' }),
        pt('light-near-osm', 'light', [52, 0], { code: 'VI-4.1', facing: 270, roadSide: 'right' }),
        pt('light-new', 'light', [300, 0], { code: 'VI-4.1', facing: 0, roadSide: 'left' }),
        { type: 'Feature', id: 'stop', geometry: { type: 'LineString', coordinates: [ll(0, 0.2), ll(6, 0.2)] }, properties: { kind: 'line', code: 'V-1', ...base } },
      ),
      frame,
      h,
    );
    const m = mergeSurvey({ objects, roads }, layer);
    expect(m.summary.signs).toEqual({ survey: 1, osm: 1, replaced: 1 });
    expect(m.signs.find((s) => !s.provenance.verified)?.pos[0]).toBe(200);
    // the surveyed light next to the OSM one inherits its SIM programme; the new one has none
    expect(m.summary.lights).toMatchObject({ survey: 2, replaced: 1, noSimProgram: 1 });
    expect(m.lights.every((l) => l.timing === 'simulated')).toBe(true);
    expect(m.objects.signals.instances).toHaveLength(1);
    expect(m.objects.signals.instances[0].controllerId).toBe(1);
    expect(m.summary.markings).toEqual({ survey: 1, osm: 0, replaced: 1 });
    expect(m.roads.some((r) => r.id === 'osm-line')).toBe(false);
  });

  it('reports surveyed signs that have no dedicated 3D model', () => {
    const layer = convertSurvey(
      fc(pt('a', 'sign', [0, 0], { code: 'II-2', facing: 0, roadSide: 'right' }), pt('b', 'sign', [0, 5], { code: 'III-3', facing: 0, roadSide: 'right' })),
      frame,
      h,
    );
    const m = mergeSurvey({ objects: { signs: [], signals: { instances: [], controllers: [], sequences: [] } } as unknown as LevelObjects, roads: [] }, layer);
    expect(m.summary.unmodelledSigns).toEqual([{ featureId: 'a', code: 'II-2', type: 'stop' }]);
  });
});

// City GIS adapter. Fixtures below are SYNTHETIC test records shaped like the
// City of Skopje ArcGIS schema (layers 69/71/75/76); they are not City data.

import { describe, expect, it } from 'vitest';
import {
  convertLights,
  convertMarkings,
  convertSigns,
  latLngToWorld,
  mercatorToLatLng,
  mergeLights,
  mergeMarkings,
  mergeSigns,
  signTypeFor,
  yawFromRotation,
  type GeoFrame,
} from '../src/mapng/import/cityGis';

// prviot_krug export frame (levels/prviot_krug/mapng.json)
const frame: GeoFrame = {
  bounds: { north: 42.0081198283681, south: 41.998828670911365, west: 21.406403607562424, east: 21.41886132316271 },
  sizeMeters: 1024,
};
const opts = { index: frame, heightAt: () => 3, rotation: 'geographic' as const };
// Parking Zone C, route start (world 434.7, 205.3), converted exactly through the frame
const LAT = frame.bounds.south + ((205.3 + 512) / 1024) * (frame.bounds.north - frame.bounds.south);
const LNG = frame.bounds.west + ((434.7 + 512) / 1024) * (frame.bounds.east - frame.bounds.west);
const toMerc = (lat: number, lng: number) => ({
  x: (lng * Math.PI * 6378137) / 180,
  y: 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
});

describe('City GIS adapter', () => {
  it('Web Mercator → WGS84 → world lands on the route start', () => {
    const m = toMerc(LAT, LNG);
    const ll = mercatorToLatLng(m.x, m.y);
    expect(ll.lat).toBeCloseTo(LAT, 9);
    expect(ll.lng).toBeCloseTo(LNG, 9);
    const w = latLngToWorld(frame, ll.lat, ll.lng);
    expect(w.x).toBeCloseTo(434.7, 3);
    expect(w.y).toBeCloseTo(205.3, 3);
  });

  it('maps official Rulebook codes to game sign types and keeps unknown codes', () => {
    expect(signTypeFor('II-2')).toBe('stop');
    expect(signTypeFor('II-4')).toBe('noentry');
    expect(signTypeFor('III-3')).toBe('priorityroad');
    expect(signTypeFor('III-2')).toBe('one_way');
    expect(signTypeFor('I-11')).toBe('I-11');
  });

  it('rotation conventions differ by 90° framing', () => {
    expect(yawFromRotation(0, 'geographic')).toBeCloseTo(Math.PI / 2); // north
    expect(yawFromRotation(0, 'arithmetic')).toBeCloseTo(0); // east
  });

  it('converts signs with provenance and survey metadata, in both spatial references', () => {
    const attrs = { OBJECTID: 7, sifra_znak: 'II-2: Задолжително запирање', naziv_znak: 'Задолжително запирање', datum_snimanja: Date.UTC(2023, 4, 12), stanje_znaka: 'Добро', nadleznost: '1', ulica: 'Илинден', rotacija: 90 };
    const m = toMerc(LAT, LNG);
    const fromMerc = convertSigns({ spatialReference: { wkid: 102100 }, features: [{ attributes: attrs, geometry: m }] }, opts)[0];
    const fromWgs = convertSigns({ spatialReference: { wkid: 4326 }, features: [{ attributes: attrs, geometry: { x: LNG, y: LAT } }] }, opts)[0];
    expect(fromMerc.type).toBe('stop');
    expect(fromMerc.pos[0]).toBeCloseTo(fromWgs.pos[0], 6);
    expect(fromMerc.provenance).toMatchObject({ source: 'city-gis', verified: true, code: 'II-2', surveyDate: '2023-05-12', objectId: 7 });
    expect(fromMerc.yawVerified).toBe(false);
  });

  it('lights keep City location but simulated timing', () => {
    const l = convertLights({ spatialReference: { wkid: 4326 }, features: [{ attributes: { OBJECTID: 3, sifra_znak: 'VI-4.1 Семафор', nacin_upravljanja: 'Фиксен' }, geometry: { x: LNG, y: LAT } }] }, opts)[0];
    expect(l.timing).toBe('simulated');
    expect(l.controllerId).toBeNull();
    expect(l.controlMode).toBe('Фиксен');
  });

  it('transverse polygons become a centre line; crossings are zebras', () => {
    const p = (dx: number, dy: number) => [LNG + dx * 1e-5, LAT + dy * 1e-5];
    const ring = [p(0, 0), p(40, 0), p(40, 3), p(0, 3), p(0, 0)];
    const [z] = convertMarkings({ spatialReference: { wkid: 4326 }, features: [{ attributes: { OBJECTID: 1, sifra_i_naziv: 'V-4 Пешачки премин', sirina: 3 }, geometry: { rings: [ring] } }] }, 'transverse', opts);
    expect(z.kind).toBe('zebra');
    expect(z.points).toHaveLength(2);
    expect(z.points[0][3]).toBe(3);
  });

  it('City objects replace nearby OSM duplicates; the rest stay labelled unverified', () => {
    const city = convertSigns({ spatialReference: { wkid: 4326 }, features: [{ attributes: { OBJECTID: 1, sifra_znak: 'III-2' }, geometry: { x: LNG, y: LAT } }] }, opts);
    const c = city[0].pos;
    const osm = [
      { type: 'one_way', pos: [c[0] + 2, c[1], 3] as [number, number, number], yaw: 0, scale: 1 }, // duplicate
      { type: 'one_way', pos: [c[0] + 40, c[1], 3] as [number, number, number], yaw: 0, scale: 1 }, // elsewhere
      { type: 'give_way', pos: [c[0] + 1, c[1], 3] as [number, number, number], yaw: 0, scale: 1 }, // other type
    ];
    const r = mergeSigns(city, osm);
    expect(r.city).toBe(1);
    expect(r.osmReplaced).toBe(1);
    expect(r.osmKept).toBe(2);
    expect(r.items.filter((s) => s.provenance.verified)).toHaveLength(1);
    expect(r.items.filter((s) => !s.provenance.verified).map((s) => s.type).sort()).toEqual(['give_way', 'one_way']);
  });

  it('with no City records, nothing is invented and OSM stays unverified', () => {
    const osmLight = { id: 4, pos: [342, 230, 3] as [number, number, number], dir: [1, 0, 0] as [number, number, number], controllerId: 1, sequenceId: 3 };
    const lights = mergeLights([], [osmLight]);
    expect(lights.items).toHaveLength(1);
    expect(lights.items[0].provenance.verified).toBe(false);
    expect(lights.items[0].timing).toBe('simulated');
    const marks = mergeMarkings([], [{ id: 'm', group: 'road', kind: 'marking', material: 'm_line_white', oneWay: false, lanesLeft: 0, lanesRight: 0, points: [[0, 0, 3, 0.15], [5, 0, 3, 0.15]] }]);
    expect(marks.osmKept).toBe(1);
    expect(marks.city).toBe(0);
  });
});

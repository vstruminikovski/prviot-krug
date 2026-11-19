// Scenes for the training ground and the open road, plus the dynamic city additions
// (signal crossing, Јаворова zebra). Shared palette: warm peach/mint facades, teal shadows,
// dusty asphalt, crisp white markings.
import * as THREE from 'three';
import { Batcher } from './batcher';
import * as T from './textures';
import { addSign, buildHorizon } from './worldBuilder';
import { PAD, HILL, EX_LANE, EX_REVERSE, EX_UTURN, EX_PARK, EX_HILL, SLALOM, BAY, polygonHeight, parkRect } from '../env/polygon';
import { ROAD, ZONES, along, elevAt, terrainHeight, LANE_HALF, SHOULDER, PULLOFF_POLY } from '../env/openRoad';
import { SIGNAL_X, SIGNAL_STOP_E, SIGNAL_STOP_W } from '../traffic/cityTraffic';
import type { SignDef } from '../content/debarMaalo';
import { rng } from '../math';

const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const paint = () => lam({ color: '#f4f2ea', emissive: '#262620' });
const yellow = () => lam({ color: '#f0c43a', emissive: '#2a2008' });

/** Flat painted rectangle on the ground (x/y world), following an optional height function. */
function stripe(b: Batcher, x0: number, y0: number, x1: number, y1: number, h: (x: number, y: number) => number, key = 'paint', mat = paint) {
  const g = new THREE.PlaneGeometry(1, 1, Math.max(1, Math.round(Math.abs(x1 - x0) / 2)), 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = x0 + (pos.getX(i) + 0.5) * (x1 - x0), y = y0 + (-pos.getZ(i) + 0.5) * (y1 - y0);
    pos.setXYZ(i, x, h(x, y) + 0.025, -y);
  }
  g.computeVertexNormals();
  b.add(g, key, mat, undefined, false);
}

function post(b: Batcher, x: number, y: number, h: number, base: number) {
  for (let i = 0; i < 4; i++) {
    const g = new THREE.CylinderGeometry(0.08, 0.1, h / 4, 8);
    g.translate(x, base + h / 8 + (i * h) / 4, -y);
    b.add(g, i % 2 ? 'post-r' : 'post-w', i % 2 ? () => lam({ color: '#d33a2c' }) : () => lam({ color: '#f4f2ea' }));
  }
}

function cone(b: Batcher, x: number, y: number) {
  const g = new THREE.ConeGeometry(0.17, 0.5, 10); g.translate(x, 0.27, -y);
  b.add(g, 'cone', () => lam({ color: '#f26a1b' }));
  const s = new THREE.CylinderGeometry(0.11, 0.13, 0.08, 10); s.translate(x, 0.33, -y);
  b.add(s, 'cone-s', () => lam({ color: '#f4f2ea' }));
}

function house(b: Batcher, x: number, y: number, w: number, d: number, hgt: number, color: string, rot = 0, base = 0) {
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, base, -y);
  const g = new THREE.BoxGeometry(w, hgt, d); g.translate(0, hgt / 2, 0);
  b.add(g, 'house-' + color, () => lam({ color }), m);
  const roof = new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.05, hgt * 0.45, 4); roof.rotateY(Math.PI / 4); roof.scale(w / Math.hypot(w, d) * 1.42, 1, d / Math.hypot(w, d) * 1.42); roof.translate(0, hgt + hgt * 0.22, 0);
  b.add(roof, 'roof', () => lam({ map: T.roofTiles(), color: '#ffffff' }), m);
  const win = new THREE.PlaneGeometry(w * 0.7, hgt * 0.35); win.translate(0, hgt * 0.6, d / 2 + 0.02);
  b.add(win, 'winband', () => lam({ map: T.facade(1, '#3e5a4f', false), color: color }), m, false);
}

function trees(group: THREE.Group, pts: { x: number; y: number; z: number; s: number }[]) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 3.6, 6); trunk.translate(0, 1.8, 0);
  const crown = new THREE.IcosahedronGeometry(2.3, 0); crown.translate(0, 4.6, 0);
  const tm = new THREE.InstancedMesh(trunk, lam({ color: '#7d6b55' }), pts.length);
  const cm = new THREE.InstancedMesh(crown, lam({ color: '#ffffff', flatShading: true }), pts.length);
  const m = new THREE.Matrix4();
  const greens = ['#6f8f45', '#7f9a4c', '#5d7f44', '#8fa357', '#6a8a52'];
  pts.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.z, -p.y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), new THREE.Vector3(p.s, p.s * (0.9 + (i % 3) * 0.1), p.s));
    tm.setMatrixAt(i, m); cm.setMatrixAt(i, m); cm.setColorAt(i, new THREE.Color(greens[i % greens.length]));
  });
  tm.castShadow = cm.castShadow = true;
  group.add(tm, cm);
}

export interface SignalHead { group: THREE.Group; set(lamp: 'green' | 'yellow' | 'red' | 'redYellow' | 'off'): void }
export function signalHead(x: number, y: number, face: number, h = 3.0): SignalHead {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 8), lam({ color: '#3b4440' })); pole.position.y = h / 2; group.add(pole);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.28), lam({ color: '#1e2321' })); housing.position.set(0, h + 0.3, 0); group.add(housing);
  const lamps = ['#d0281c', '#e8b51a', '#2fae55'].map((c, i) => {
    const m = new THREE.MeshBasicMaterial({ color: '#222', toneMapped: false });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), m); l.position.set(0, h + 0.6 - i * 0.3, 0.145); group.add(l);
    return { m, c };
  });
  group.position.set(x, 0, -y);
  group.rotation.y = Math.atan2(Math.cos(face), -Math.sin(face));
  return {
    group,
    set(lamp) {
      const on = [lamp === 'red' || lamp === 'redYellow', lamp === 'yellow' || lamp === 'redYellow', lamp === 'green'];
      lamps.forEach((l, i) => l.m.color.set(on[i] ? l.c : '#2a2a28'));
    },
  };
}

// ------------------------------------------------------------------ city additions
export interface CityExtras { group: THREE.Group; heads: SignalHead[]; pedHeads: THREE.MeshBasicMaterial[] }
export function buildCityExtras(): CityExtras {
  const group = new THREE.Group();
  const b = new Batcher();
  const flat = () => 0;
  // signal-controlled crossing on Бакалска
  for (let y = -3.0; y < 3.5; y += 1.0) stripe(b, SIGNAL_X - 2, y, SIGNAL_X + 2, y + 0.5, flat);
  stripe(b, SIGNAL_STOP_E - 0.3, -3.4, SIGNAL_STOP_E, 0, flat);
  stripe(b, SIGNAL_STOP_W, 0, SIGNAL_STOP_W + 0.3, 3.4, flat);
  // zebra on Јаворова
  for (let x = -3.0; x < 3.3; x += 1.0) stripe(b, x, 128, x + 0.5, 132, flat);
  const signs: SignDef[] = [
    { id: 'jz-1', code: '302.1', x: -4.2, y: 133.5, face: Math.PI / 2 }, { id: 'jz-2', code: '302.1', x: 4.2, y: 126.5, face: -Math.PI / 2 },
    { id: 'sig-w', code: '121.1', x: SIGNAL_X - 60, y: -4.6, face: Math.PI },
  ];
  for (const s of signs) addSign(b, s);
  group.add(b.build());
  const heads = [signalHead(SIGNAL_STOP_E + 0.5, -4.4, Math.PI), signalHead(SIGNAL_STOP_W - 0.5, 4.4, 0)];
  for (const h of heads) group.add(h.group);
  const pedHeads: THREE.MeshBasicMaterial[] = [];
  for (const [x, y, f] of [[SIGNAL_X + 2.4, -4.5, Math.PI / 2], [SIGNAL_X - 2.4, 4.5, -Math.PI / 2]]) {
    const ped = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), lam({ color: '#3b4440' })); pole.position.y = 1.2; ped.add(pole);
    const m = new THREE.MeshBasicMaterial({ color: '#2a2a28', toneMapped: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.2), lam({ color: '#1e2321' })); box.position.y = 2.55; ped.add(box);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), m); face.position.set(0, 2.55, 0.101); ped.add(face);
    ped.position.set(x, 0, -y); ped.rotation.y = Math.atan2(Math.cos(f), -Math.sin(f));
    group.add(ped); pedHeads.push(m);
  }
  return { group, heads, pedHeads };
}

// ------------------------------------------------------------------ training ground
export function buildPolygonScene(vehicleLength: number): THREE.Group {
  const group = new THREE.Group();
  const b = new Batcher();
  // grass surroundings and the asphalt pad (the hill is part of the pad mesh)
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lam({ color: '#a7b178' }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(70, -0.06, -45); grass.receiveShadow = true; group.add(grass);
  const nx = 156, ny = 108;
  const pad = new THREE.PlaneGeometry(PAD.x1 - PAD.x0, PAD.y1 - PAD.y0, nx, ny);
  pad.rotateX(-Math.PI / 2);
  const pos = pad.attributes.position as THREE.BufferAttribute;
  const uv = pad.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (PAD.x0 + PAD.x1) / 2, y = -pos.getZ(i) + (PAD.y0 + PAD.y1) / 2;
    pos.setXYZ(i, x, polygonHeight(x, y), -y);
    uv.setXY(i, x / 7, y / 7);
  }
  pad.computeVertexNormals();
  b.add(pad, 'pad', () => lam({ map: T.asphalt(), color: '#e2e2e0' }), undefined, false);
  const h = polygonHeight;
  const w = 0.12;
  // 1. forward lane 2.5 × 36 m with start and STOP lines
  const lane = (ex: typeof EX_LANE, width: number) => {
    stripe(b, ex.x0, ex.y - width / 2 - w, ex.x1, ex.y - width / 2, h); stripe(b, ex.x0, ex.y + width / 2, ex.x1, ex.y + width / 2 + w, h);
    stripe(b, ex.x0 - 0.3, ex.y - width / 2, ex.x0, ex.y + width / 2, h); stripe(b, ex.x1, ex.y - width / 2, ex.x1 + 0.4, ex.y + width / 2, h);
  };
  lane(EX_LANE, vehicleLength > 6 ? 3.5 : EX_LANE.width); lane(EX_REVERSE, vehicleLength > 6 ? 3.5 : EX_REVERSE.width);
  // 3. U-turn bay
  const uw = EX_UTURN.widthFor(vehicleLength);
  stripe(b, EX_UTURN.x0, EX_UTURN.y0 - w, EX_UTURN.x1, EX_UTURN.y0, h); stripe(b, EX_UTURN.x0, EX_UTURN.y0 + uw, EX_UTURN.x1, EX_UTURN.y0 + uw + w, h);
  for (const [x, y] of [[EX_UTURN.x0, EX_UTURN.y0], [EX_UTURN.x1, EX_UTURN.y0], [EX_UTURN.x0, EX_UTURN.y0 + uw], [EX_UTURN.x1, EX_UTURN.y0 + uw]]) post(b, x, y, 1.1, 0);
  // 4. parallel parking space with kerb line and 110 cm markers
  const pr = parkRect(vehicleLength);
  stripe(b, pr.x0 - 12, pr.y0 - w, pr.x1 + 12, pr.y0, h);
  stripe(b, pr.x0, pr.y0, pr.x0 + w, pr.y1, h); stripe(b, pr.x1 - w, pr.y0, pr.x1, pr.y1, h);
  for (const [x, y] of [[pr.x0, pr.y0], [pr.x1, pr.y0], [pr.x0, pr.y1], [pr.x1, pr.y1]]) post(b, x, y, 1.1, 0);
  const kerb = new THREE.BoxGeometry(pr.x1 - pr.x0 + 24, 0.16, 0.3); kerb.translate((pr.x0 + pr.x1) / 2, 0.08, -(pr.y0 - 0.4));
  b.add(kerb, 'kerb', () => lam({ color: '#c9c2b3' }));
  // 5. hill with STOP line and lane edges
  stripe(b, HILL.up0 - 6, EX_HILL.y - 1.6 - w, HILL.down1 + 4, EX_HILL.y - 1.6, h); stripe(b, HILL.up0 - 6, EX_HILL.y + 1.6, HILL.down1 + 4, EX_HILL.y + 1.6 + w, h);
  stripe(b, EX_HILL.stopX, EX_HILL.y - 1.6, EX_HILL.stopX + 0.4, EX_HILL.y + 1.6, h);
  const hillWall = (y: number) => { const g = new THREE.BoxGeometry(HILL.down1 - HILL.up0, 0.3, 0.3); g.translate((HILL.up0 + HILL.down1) / 2, 1.0, -y); return g; };
  void hillWall;
  // practice: slalom cones and bays
  for (let i = 0; i < SLALOM.n; i++) cone(b, SLALOM.x0 + i * SLALOM.gap, SLALOM.y);
  for (let i = 0; i <= BAY.n; i++) { stripe(b, BAY.x + i * BAY.w - 0.06, BAY.y0, BAY.x + i * BAY.w + 0.06, BAY.y0 + BAY.d, h, 'yellow', yellow); cone(b, BAY.x + i * BAY.w, BAY.y0 + BAY.d); }
  // start boxes (yellow corner marks)
  for (const [x, y] of [[EX_LANE.x0 - vehicleLength / 2 - 0.4, EX_LANE.y], [EX_REVERSE.x1 + vehicleLength / 2 + 0.4, EX_REVERSE.y], [EX_PARK.x0 - 9, EX_PARK.laneY], [EX_HILL.stopX - 22, EX_HILL.y]]) {
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) stripe(b, x + dx * (vehicleLength / 2 + 0.3) - 0.3, y + dy * 1.1 - 0.05, x + dx * (vehicleLength / 2 + 0.3) + 0.3, y + dy * 1.1 + 0.05, h, 'yellow', yellow);
  }
  // school building, fence, flag, benches
  house(b, 132, 86, 18, 9, 6.4, '#e6c8b2', 0);
  const sign: SignDef = { id: 'school', code: 'place', x: 132, y: 81.3, face: -Math.PI / 2, text: 'АВТО ШКОЛА ВАРДАР · ПОЛИГОН', height: 4.6 };
  addSign(b, sign);
  for (let x = PAD.x0; x <= PAD.x1; x += 3) { const g = new THREE.BoxGeometry(0.08, 1.3, 0.08); g.translate(x, 0.65, -(PAD.y0 - 1.5)); b.add(g, 'fence', () => lam({ color: '#4a5a52' })); }
  const rail = new THREE.BoxGeometry(PAD.x1 - PAD.x0, 0.06, 0.06); rail.translate((PAD.x0 + PAD.x1) / 2, 1.2, -(PAD.y0 - 1.5)); b.add(rail, 'fence', () => lam({ color: '#4a5a52' }));
  group.add(b.build());
  const r = rng(9);
  const tp: { x: number; y: number; z: number; s: number }[] = [];
  for (let i = 0; i < 40; i++) tp.push({ x: r.range(-60, 210), y: r.chance(0.5) ? r.range(-40, -14) : r.range(106, 140), z: 0, s: r.range(0.9, 1.4) });
  trees(group, tp);
  const hz = buildHorizon(); hz.position.set(-120, 0, 120); group.add(hz);
  return group;
}

// ------------------------------------------------------------------ open road
export interface OpenRoadScene { group: THREE.Group; works: SignalHead[] }
export function buildOpenRoadScene(debrisS: number): OpenRoadScene {
  const group = new THREE.Group();
  const b = new Batcher();
  // terrain
  const xs = ROAD.pts.map((p) => p.x), ys = ROAD.pts.map((p) => p.y);
  const x0 = Math.min(...xs) - 260, x1 = Math.max(...xs) + 260, y0 = Math.min(...ys) - 260, y1 = Math.max(...ys) + 260;
  const nx = Math.round((x1 - x0) / 9), ny = Math.round((y1 - y0) / 9);
  const terr = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny);
  terr.rotateX(-Math.PI / 2);
  const pos = terr.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (x0 + x1) / 2, y = -pos.getZ(i) + (y0 + y1) / 2;
    pos.setXYZ(i, x, terrainHeight(x, y) - 0.35, -y);
  }
  terr.computeVertexNormals();
  // stylised low-poly palette: lush valley floor, dry golden grass higher up, ochre rock on steep
  // faces, and a per-vertex jitter so every facet catches the light a little differently
  const nrm = terr.attributes.normal as THREE.BufferAttribute;
  const lush = new THREE.Color('#8fae5a'), dry = new THREE.Color('#d6bd72'), rock = new THREE.Color('#b98a5a'), deep = new THREE.Color('#6f9450');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), hgt = pos.getY(i), y = -pos.getZ(i);
    const steep = 1 - nrm.getY(i);
    tmp.copy(lush).lerp(deep, (Math.sin(x / 23) * Math.cos(y / 31) + 1) * 0.35)
      .lerp(dry, THREE.MathUtils.smoothstep(hgt, 6, 34))
      .lerp(rock, THREE.MathUtils.smoothstep(steep, 0.18, 0.42));
    const j = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    tmp.offsetHSL(0, 0, (j - 0.5) * 0.06);
    cols.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  terr.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const tm = new THREE.Mesh(terr, lam({ vertexColors: true, flatShading: true }));
  tm.receiveShadow = true; group.add(tm);
  // road ribbon
  const half = LANE_HALF + SHOULDER;
  const n = Math.ceil(ROAD.length / 3);
  const rpos: number[] = [], ruv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * ROAD.length;
    const z = elevAt(s) + 0.02;
    const a = along(s, half), c = along(s, -half);
    rpos.push(a.x, z, -a.y, c.x, z, -c.y);
    ruv.push(0, s / 7, (half * 2) / 7, s / 7);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const road = new THREE.BufferGeometry();
  road.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
  road.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  road.setIndex(idx); road.computeVertexNormals();
  b.add(road, 'road', () => lam({ map: T.asphalt(), color: '#ffffff' }), undefined, false);
  // markings: edge lines everywhere, centre line solid in no-overtaking zones, dashed elsewhere
  const line = (off: number, s0: number, s1: number, dash: boolean) => {
    for (let s = s0; s < s1; s += dash ? 9 : 3) {
      const e = Math.min(s + 3, s1);
      const a = along(s, off), c = along(e, off);
      const z0 = elevAt(s) + 0.035, z1 = elevAt(e) + 0.035;
      const nx2 = -Math.sin(a.h) * 0.06, ny2 = Math.cos(a.h) * 0.06;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([a.x + nx2, z0, -(a.y + ny2), a.x - nx2, z0, -(a.y - ny2), c.x + nx2, z1, -(c.y + ny2), c.x - nx2, z1, -(c.y - ny2)], 3));
      g.setIndex([0, 1, 2, 1, 3, 2]); g.computeVertexNormals();
      b.add(g, 'paint', paint, undefined, false);
    }
  };
  line(LANE_HALF, 0, ROAD.length, false); line(-LANE_HALF, 0, ROAD.length, false);
  const solid = (s: number) => ZONES.noOvertake.some((z) => s >= z.s[0] - 30 && s <= z.s[1]);
  let s = 0;
  while (s < ROAD.length) { let e = s; const sol = solid(s); while (e < ROAD.length && solid(e) === sol) e += 3; line(0, s, e, !sol); s = e; }
  // bridge railings and piers
  for (let sb = ZONES.bridge[0]; sb < ZONES.bridge[1]; sb += 2.5) {
    for (const side of [1, -1]) { const a = along(sb, side * (half + 0.2)); const g = new THREE.BoxGeometry(0.12, 1.0, 0.12); g.translate(a.x, elevAt(sb) + 0.5, -a.y); b.add(g, 'rail', () => lam({ color: '#8e938f' })); }
  }
  for (const side of [1, -1]) {
    for (let sb = ZONES.bridge[0]; sb < ZONES.bridge[1]; sb += 3) { const a = along(sb, side * (half + 0.2)), c = along(sb + 3, side * (half + 0.2)); const g = new THREE.CylinderGeometry(0.05, 0.05, Math.hypot(c.x - a.x, c.y - a.y), 5); g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(c.y - a.y, c.x - a.x)); g.translate((a.x + c.x) / 2, elevAt(sb) + 0.95, -(a.y + c.y) / 2); b.add(g, 'rail', () => lam({ color: '#8e938f' })); }
  }
  const mid = along((ZONES.bridge[0] + ZONES.bridge[1]) / 2);
  const pier = new THREE.BoxGeometry(2, 9, half * 2); pier.rotateY(mid.h); pier.translate(mid.x, elevAt(1500) - 4.5, -mid.y); b.add(pier, 'pier', () => lam({ color: '#b8b2a4' }));
  // signs along the road
  const S = (id: string, code: SignDef['code'], sAt: number, side: number, text?: string, arrow?: 'left' | 'right'): SignDef => { const a = along(sAt, side * (half + 1.0)); return { id, code, x: a.x, y: a.y, face: a.h + Math.PI, text, arrow }; };
  const roadSigns: SignDef[] = [
    S('p-in', 'place', 20, -1, 'Брест'), S('p-out', 'place', ZONES.settlement[1], -1, 'Брест', 'right'),
    S('c1', '103.1', 400, -1), S('lim60', 'limit', ZONES.bendsLimit[0] - 10, -1, '60'), S('up', '107', 520, -1),
    S('c2', '103.2', 600, -1), S('down', '106', 1020, -1), S('lim-end', 'limit', ZONES.bendsLimit[1] + 10, -1, '90'),
    S('rock', '111.1', ZONES.rockfallSign, -1), S('works', '115', ZONES.works[0] - 150, -1), S('wsig', '121.1', ZONES.works[0] - 90, -1),
  ];
  for (const sd of roadSigns) { const q = ROAD.project({ x: sd.x, y: sd.y }); addSign(b, { ...sd, height: 2.2 }, elevAt(q)); }
  // rockfall debris visuals
  for (let i = 0; i < 4; i++) {
    const a = along(debrisS + i * 2.2, -1.2 - (i % 2) * 0.9);
    const g = new THREE.DodecahedronGeometry(0.55 + (i % 3) * 0.15, 0); g.scale(1.2, 0.75, 1); g.translate(a.x, elevAt(debrisS) + 0.35, -a.y);
    b.add(g, 'rock', () => lam({ color: '#8f877a', flatShading: true }));
  }
  for (let i = 0; i < 18; i++) { const a = along(debrisS - 30 + i * 4, (i % 2 ? 1 : -1) * (half + 2 + (i % 3))); const g = new THREE.DodecahedronGeometry(0.8 + (i % 4) * 0.4, 0); g.translate(a.x, elevAt(debrisS) + 0.4, -a.y); b.add(g, 'rock', () => lam({ color: '#8f877a', flatShading: true })); }
  // roadworks barriers and cones
  for (let sw = ZONES.works[0] + 6; sw < ZONES.works[1] - 6; sw += 4) {
    const a = along(sw, -1.5);
    const g = new THREE.BoxGeometry(3.4, 0.9, 0.4); g.rotateY(a.h); g.translate(a.x, elevAt(sw) + 0.45, -a.y);
    b.add(g, 'barrier', () => lam({ map: T.awning('#d33a2c'), color: '#ffffff' }));
  }
  for (let sw = ZONES.works[0] - 18; sw < ZONES.works[0] + 6; sw += 3) { const a = along(sw, -1.5 - (ZONES.works[0] + 6 - sw) * 0.06); cone(b, a.x, a.y); }
  // village houses at the start, viewpoint railing and bench
  const r = rng(3);
  for (let i = 0; i < 14; i++) { const sv = 30 + i * 24; const side = i % 2 ? 1 : -1; const a = along(sv, side * (half + 9 + r.range(0, 6))); house(b, a.x, a.y, r.range(8, 12), r.range(7, 9), r.range(4.5, 7), r.pick(['#e9c9ae', '#cfe0c8', '#efdcc0', '#e6c2a8', '#d9e4d6']), -a.h, elevAt(sv)); }
  const pv = along(ZONES.pullOff, -half - 9);
  for (let i = -16; i <= 16; i += 2) { const q = along(ZONES.pullOff + i, -half - 8.6); const g = new THREE.BoxGeometry(0.1, 1.0, 0.1); g.translate(q.x, elevAt(ZONES.pullOff) + 0.5, -q.y); b.add(g, 'rail', () => lam({ color: '#6b5a44' })); }
  const bench = new THREE.BoxGeometry(2, 0.45, 0.5); bench.rotateY(pv.h); bench.translate(pv.x, elevAt(ZONES.pullOff) + 0.25, -pv.y); b.add(bench, 'bench', () => lam({ color: '#7a5a3a' }));
  void PULLOFF_POLY;
  group.add(b.build());
  // trees along the road
  const tp: { x: number; y: number; z: number; s: number }[] = [];
  for (let sv = 20; sv < ROAD.length; sv += 14) {
    if (sv > ZONES.bridge[0] - 10 && sv < ZONES.bridge[1] + 10) continue;
    for (const side of [1, -1]) { if (r.chance(0.45)) continue; const a = along(sv + r.range(-4, 4), side * (half + r.range(6, 30))); tp.push({ x: a.x, y: a.y, z: terrainHeight(a.x, a.y) - 0.3, s: r.range(0.8, 1.5) }); }
  }
  trees(group, tp);
  // utility poles with sagging wires
  const wire: number[] = [];
  let prev: THREE.Vector3 | null = null;
  for (let sv = 10; sv < ROAD.length; sv += 45) {
    const a = along(sv, half + 3); const z = elevAt(sv);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 6), lam({ color: '#6b5a44' })); pole.position.set(a.x, z + 4, -a.y); pole.castShadow = true; group.add(pole);
    const top = new THREE.Vector3(a.x, z + 7.6, -a.y);
    if (prev) for (let k = 0; k < 6; k++) { const t0 = k / 6, t1 = (k + 1) / 6; const p0 = prev.clone().lerp(top, t0), p1 = prev.clone().lerp(top, t1); p0.y -= Math.sin(t0 * Math.PI) * 0.8; p1.y -= Math.sin(t1 * Math.PI) * 0.8; wire.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); }
    prev = top;
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2a28' })));
  // temporary signals at both ends of the works
  const a0 = along(ZONES.works[0], -half - 0.6), a1 = along(ZONES.works[1], half + 0.6);
  const w0 = signalHead(a0.x, a0.y, a0.h + Math.PI, 2.4 + elevAt(ZONES.works[0]) * 0), w1 = signalHead(a1.x, a1.y, a1.h, 2.4);
  w0.group.position.y = elevAt(ZONES.works[0]); w1.group.position.y = elevAt(ZONES.works[1]);
  group.add(w0.group, w1.group);
  const hz = buildHorizon(); hz.position.set(900, 0, 600); group.add(hz);
  return { group, works: [w0, w1] };
}

// ------------------------------------------------------------------ real Debar Maalo (OSM)
import { OSM } from '../env/osm';
export function buildOsmScene(): THREE.Group {
  const group = new THREE.Group();
  const b = new Batcher();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), lam({ map: (() => { const t = T.paving('sidewalk').clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1040, 1040); t.needsUpdate = true; return t; })(), color: '#d9d4c6' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; group.add(ground);
  // stylised Skopje palette: pastel render, windows in world-scale UVs (≈4 m bays, 3.2 m floors),
  // terracotta or concrete roof caps
  const pal = ['#e9c9ae', '#cfe0c8', '#efdcc0', '#e6c2a8', '#d9e4d6', '#e3cfa6', '#ecd9c6'];
  const fac = (style: number) => { const t = T.facade(style, '#6b4a2e', false).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 4, 1 / 3.2); t.needsUpdate = true; return t; };
  const roofCols = ['#b5583b', '#9a9488', '#a8492f', '#8d877c'];
  OSM.buildings.forEach((bd, i) => {
    if (bd.p.length < 4) return;
    const shape = new THREE.Shape(bd.p.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: bd.h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); // shape (x, y) → world (x, -z); extrude up along +y
    const col = pal[i % pal.length], st = i % 3;
    b.add(g, `osm-${col}-${st}`, () => lam({ color: col, map: fac(st) }));
    const roof = new THREE.ShapeGeometry(shape); roof.rotateX(-Math.PI / 2); roof.translate(0, bd.h + 0.03, 0);
    const rc = roofCols[(i * 7) % roofCols.length];
    b.add(roof, 'osm-roof-' + rc, () => lam({ color: rc }), undefined, false);
  });
  for (const r of OSM.roads) {
    const pts = r.p.map(([x, y]) => ({ x, y }));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const len = Math.hypot(c.x - a.x, c.y - a.y); if (len < 0.1) continue;
      const g = new THREE.PlaneGeometry(len + r.w * 0.5, r.w + 1.2);
      g.rotateX(-Math.PI / 2); g.rotateY(Math.atan2(c.y - a.y, c.x - a.x));
      g.translate((a.x + c.x) / 2, 0.01 + (r.w > 7 ? 0.004 : 0), -(a.y + c.y) / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len / 7, uv.getY(k) * r.w / 7);
      b.add(g, 'road', () => lam({ map: T.asphalt(), color: '#ffffff' }), undefined, false);
    }
  }
  group.add(b.build());
  const hz = buildHorizon(); hz.position.set(-240, 0, 300); group.add(hz);
  return group;
}

// Builds the static 3D neighbourhood from the route content.
import * as THREE from 'three';
import { rng, type Rect, type Vec2 } from '../math';
import {
  STREETS, FRONTAGES, RESERVED, SIGNS, SHOPS, CROSSINGS, ROAD_ARROWS, JUNCTIONS,
  CAFE_CHINAR_TREE, TREES_EXTRA, CAFE_TABLES, VODNO, type SignDef,
} from '../content/debarMaalo';
import { generate, type Building } from '../content/generate';
import { Batcher } from './batcher';
import { addParkedCar } from './carMesh';
import * as T from './textures';
import { buildCafeSet } from './people';

export const faceRot = (f: number) => Math.atan2(Math.cos(f), -Math.sin(f));
const V = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, -y);

const lambert = (opts: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(opts);

function flatRect(r: Rect, h: number, uvScale: number) {
  const w = r.x1 - r.x0, d = r.y1 - r.y0;
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate((r.x0 + r.x1) / 2, h, -(r.y0 + r.y1) / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / uvScale, uv.getY(i) * d / uvScale);
  return g;
}

function slabBox(r: Rect, top: number, uvScale: number) {
  const w = r.x1 - r.x0, d = r.y1 - r.y0;
  const g = new THREE.BoxGeometry(w, top, d);
  g.translate((r.x0 + r.x1) / 2, top / 2, -(r.y0 + r.y1) / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / uvScale, uv.getY(i) * d / uvScale);
  return g;
}

/** Vertical plane at a wall line facing the given 2D normal. */
function wallPlane(a: Vec2, b: Vec2, n: Vec2, y0: number, y1: number, off: number, uRepeat: number, vRepeat: number) {
  const w = Math.hypot(b.x - a.x, b.y - a.y);
  const g = new THREE.PlaneGeometry(w, y1 - y0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uRepeat, uv.getY(i) * vRepeat);
  g.rotateY(faceRot(Math.atan2(n.y, n.x)));
  g.translate((a.x + b.x) / 2 + n.x * off, (y0 + y1) / 2, -((a.y + b.y) / 2 + n.y * off));
  return g;
}

function hipRoof(r: Rect, base: number, rise: number) {
  const o = 0.35;
  const x0 = r.x0 - o, x1 = r.x1 + o, y0 = r.y0 - o, y1 = r.y1 + o;
  const alongX = x1 - x0 >= y1 - y0;
  const inset = (alongX ? y1 - y0 : x1 - x0) / 2;
  const top = base + rise;
  const P = (x: number, y: number, h: number) => [x, h, -y];
  let ridgeA: number[], ridgeB: number[];
  if (alongX) { ridgeA = P(x0 + inset, (y0 + y1) / 2, top); ridgeB = P(x1 - inset, (y0 + y1) / 2, top); }
  else { ridgeA = P((x0 + x1) / 2, y0 + inset, top); ridgeB = P((x0 + x1) / 2, y1 - inset, top); }
  const c00 = P(x0, y0, base), c10 = P(x1, y0, base), c11 = P(x1, y1, base), c01 = P(x0, y1, base);
  const tris: number[][] = alongX
    ? [[c00, c10, ridgeB], [c00, ridgeB, ridgeA], [c11, c01, ridgeA], [c11, ridgeA, ridgeB], [c10, c11, ridgeB], [c01, c00, ridgeA]].map((t) => t.flat())
    : [[c10, c11, ridgeB], [c10, ridgeB, ridgeA], [c01, c00, ridgeA], [c01, ridgeA, ridgeB], [c00, c10, ridgeA], [c11, c01, ridgeB]].map((t) => t.flat());
  const pos = new Float32Array(tris.flat());
  // orient all triangles outward/up
  for (let i = 0; i < pos.length; i += 9) {
    const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]), b = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]), c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.y < 0) { pos[i + 3] = c.x; pos[i + 4] = c.y; pos[i + 5] = c.z; pos[i + 6] = b.x; pos[i + 7] = b.y; pos[i + 8] = b.z; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) { uv[j] = pos[i] / 3; uv[j + 1] = (pos[i + 2] + pos[i + 1] * 1.4) / 3; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface BuiltWorld { group: THREE.Group; atlas: T.PlateAtlas }

export function buildWorld(atlas: T.PlateAtlas): BuiltWorld {
  const gen = generate();
  const group = new THREE.Group();
  const b = new Batcher();
  const r = rng(77);

  // --- ground plinth for blocks (acts as curb edge everywhere)
  const blocks: Rect[] = [
    { x0: 3.3, y0: 3.5, x1: 236.8, y1: 256.5 }, { x0: 243.2, y0: 3.5, x1: 477.2, y1: 256.5 },
    { x0: -90, y0: -170, x1: 236.8, y1: -3.5 }, { x0: 243.2, y0: -170, x1: 580, y1: -3.5 },
    { x0: 482.8, y0: -3.5, x1: 580, y1: 350 }, { x0: -3.3, y0: 263.5, x1: 482.8, y1: 350 },
    { x0: -90, y0: -3.5, x1: -3.3, y1: 350 }, { x0: 236.8, y0: -170, x1: 243.2, y1: -125 },
  ];
  for (const bl of blocks) b.add(slabBox(bl, 0.13, 5), 'ground', () => lambert({ map: T.ground(), color: '#ece5c6' }), undefined, false);
  // far ground
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lambert({ color: '#b9b08a' }));
  far.rotation.x = -Math.PI / 2; far.position.set(240, -0.05, -130); far.receiveShadow = true; group.add(far);

  // --- roads (vertical streets trimmed at the horizontal ones to avoid overlap)
  for (const s of STREETS) {
    let rr = s.rect;
    if (s.id === 'tiha' || s.id === 'javorova') rr = { ...rr, y0: 3.5, y1: 256.5 };
    b.add(flatRect(rr, 0.01, 7), 'road', () => lambert({ map: T.asphalt(), color: '#ffffff' }), undefined, false);
  }

  // --- markings (dimensions follow common European practice; see README gaps)
  const paint = () => lambert({ color: '#f1efe6', emissive: '#1d1d1a' });
  const dash = (x0: number, y0: number, x1: number, y1: number) => {
    const horiz = Math.abs(y1 - y0) < 0.01;
    const len = horiz ? x1 - x0 : y1 - y0;
    for (let s = 1; s + 3 <= len; s += 6) {
      const rr = horiz ? { x0: x0 + s, x1: x0 + s + 3, y0: y0 - 0.06, y1: y0 + 0.06 } : { x0: x0 - 0.06, x1: x0 + 0.06, y0: y0 + s, y1: y0 + s + 3 };
      b.add(flatRect(rr, 0.02, 1), 'paint', paint, undefined, false);
    }
  };
  dash(3.3, 0, 236.8, 0); dash(243.2, 0, 477.2, 0);
  dash(3.3, 260, 236.8, 260); dash(243.2, 260, 326, 260); dash(334, 260, 477.2, 260);
  dash(0, 3.5, 0, 256.5); dash(240, -125, 240, -3.5);
  for (const c of CROSSINGS) {
    for (let y = c.y0 + 0.5; y + 0.5 <= c.y1; y += 1.0) b.add(flatRect({ x0: c.x0, x1: c.x1, y0: y, y1: y + 0.5 }, 0.022, 1), 'paint', paint, undefined, false);
  }
  const arrowShape = new THREE.Shape([
    new THREE.Vector2(-2.5, -0.15), new THREE.Vector2(1.2, -0.15), new THREE.Vector2(1.2, -0.5), new THREE.Vector2(2.5, 0),
    new THREE.Vector2(1.2, 0.5), new THREE.Vector2(1.2, 0.15), new THREE.Vector2(-2.5, 0.15),
  ]);
  for (const a of ROAD_ARROWS) {
    const g = new THREE.ShapeGeometry(arrowShape);
    g.rotateX(-Math.PI / 2);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(a.h).setPosition(a.x, 0.022, -a.y));
    b.add(g, 'paint', paint, undefined, false);
  }

  // --- sidewalks, yards, terraces
  for (const s of gen.slabs) {
    const top = s.kind === 'sidewalk' ? 0.15 : s.kind === 'terrace' ? 0.16 : 0.17;
    b.add(slabBox(s.r, top, s.kind === 'terrace' ? 3 : 4), 'pave-' + s.kind, () => lambert({ map: T.paving(s.kind), color: '#ffffff' }), undefined, false);
  }

  // --- buildings
  for (const bd of gen.buildings) addBuilding(b, bd, r);

  // garden at J1 (low wall + lawn) — the open corner that gives the sight line
  const garden = RESERVED.find((q) => q.kind === 'garden')!.r;
  b.add(slabBox({ x0: garden.x0, y0: garden.y0, x1: garden.x1 - 2.4, y1: garden.y1 - 2.6 }, 0.2, 3), 'lawn', () => lambert({ color: '#7f8f55' }), undefined, false);
  const wallMat = () => lambert({ color: '#d7c9ad' });
  const wallSeg = (x0: number, y0: number, x1: number, y1: number) => {
    const rr = { x0: Math.min(x0, x1) - 0.15, x1: Math.max(x0, x1) + 0.15, y0: Math.min(y0, y1) - 0.15, y1: Math.max(y0, y1) + 0.15 };
    const g = new THREE.BoxGeometry(rr.x1 - rr.x0, 0.85, rr.y1 - rr.y0);
    g.translate((rr.x0 + rr.x1) / 2, 0.55, -(rr.y0 + rr.y1) / 2);
    b.add(g, 'lowwall', wallMat);
  };
  wallSeg(garden.x0 + 0.3, garden.y1 - 2.7, garden.x1 - 2.6, garden.y1 - 2.7);
  wallSeg(garden.x1 - 2.6, garden.y1 - 2.7, garden.x1 - 2.6, garden.y0 + 0.5);

  // gates
  for (const gt of gen.gates) {
    b.add(wallPlane(gt.a, gt.b, gt.normal, 0.15, 2.3, 0.02, 2, 1), 'gate-' + gt.color, () => lambert({ map: T.gateTexture(gt.color), side: THREE.DoubleSide }));
  }

  // --- shops: signs and awnings
  for (const sh of SHOPS) {
    const n = { x: Math.cos(sh.face), y: Math.sin(sh.face) };
    const t = { x: -n.y, y: n.x };
    const a = { x: sh.x - t.x * sh.width / 2, y: sh.y - t.y * sh.width / 2 };
    const c = { x: sh.x + t.x * sh.width / 2, y: sh.y + t.y * sh.width / 2 };
    const bd = nearestFront(gen.buildings, sh.x, sh.y);
    const off = bd ? frontOffset(bd, sh.x, sh.y) : 0.1;
    const g = wallPlane(c, a, n, 2.68, 3.28, off + 0.08, 1, 1);
    b.add(g, 'shop-' + sh.text, () => new THREE.MeshLambertMaterial({ map: T.shopSign(sh.text, sh.color), emissive: '#222', emissiveIntensity: 0.4 }), undefined, false);
    if (sh.awning) {
      const depth = 1.4;
      const g2 = new THREE.BoxGeometry(sh.width * 0.92, 0.05, depth);
      const pos = g2.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setXY(i, pos.getX(i) * sh.width / 2, pos.getY(i));
      g2.rotateX(0.32);
      g2.rotateY(faceRot(sh.face));
      g2.translate(sh.x + n.x * (off + depth / 2), 2.42, -(sh.y + n.y * (off + depth / 2)));
      b.add(g2, 'awn-' + sh.awning, () => lambert({ map: T.awning(sh.awning!), side: THREE.DoubleSide }));
    }
  }

  // --- traffic signs and street plaques
  for (const s of SIGNS) addSign(b, s);

  // --- cafés
  for (const t of CAFE_TABLES) {
    const set = buildCafeSet(t.cafe === 'chinar' ? '#b3342b' : '#3f6b5d');
    set.position.copy(V(t.x, t.y, t.cafe === 'chinar' ? 0.16 : 0.16));
    set.rotation.y = r.range(0, Math.PI);
    group.add(set);
  }

  // --- parked cars
  gen.parked.forEach((p, i) => addParkedCar(b, atlas, p.type, p.color, p.plate, p.condition, p.pose.x, p.pose.y, p.pose.h, i));

  // --- street lamps
  const lampMat = () => lambert({ color: '#3b4440' });
  const lampHead = () => lambert({ color: '#efe8d4', emissive: '#4a4030' });
  for (const f of FRONTAGES) {
    if (f.street === 'chinarska-s') continue;
    const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
    const dx = (f.b.x - f.a.x) / len, dy = (f.b.y - f.a.y) / len;
    for (let s = 20; s < len - 10; s += 34) {
      const x = f.a.x + dx * s - f.normal.x * 0.45, y = f.a.y + dy * s - f.normal.y * 0.45;
      if (nearSignOrCrossing(x, y, 3)) continue;
      const pole = new THREE.CylinderGeometry(0.06, 0.08, 5.6, 6); pole.translate(x, 0.15 + 2.8, -y);
      b.add(pole, 'lamp', lampMat);
      const arm = new THREE.BoxGeometry(1.2, 0.06, 0.06);
      arm.rotateY(faceRot(Math.atan2(f.normal.y, f.normal.x)) - Math.PI / 2);
      arm.translate(x + f.normal.x * 0.6, 5.7, -(y + f.normal.y * 0.6));
      b.add(arm, 'lamp', lampMat);
      const head = new THREE.BoxGeometry(0.45, 0.14, 0.25);
      head.translate(x + f.normal.x * 1.15, 5.62, -(y + f.normal.y * 1.15));
      b.add(head, 'lamphead', lampHead, undefined, false);
    }
  }

  group.add(b.build());

  // --- trees (instanced)
  group.add(buildTrees(r));

  // --- horizon: Vodno with the cross, distant blocks, sky
  group.add(buildHorizon());

  // overhead cables
  const cablePts: number[] = [];
  const cable = (a: Vec2, c: Vec2, h: number) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const sag = (t: number) => h - Math.sin(t * Math.PI) * 0.9;
      cablePts.push(a.x + (c.x - a.x) * t0, sag(t0), -(a.y + (c.y - a.y) * t0), a.x + (c.x - a.x) * t1, sag(t1), -(a.y + (c.y - a.y) * t1));
    }
  };
  for (let x = 30; x < 470; x += 47) cable({ x, y: -9 }, { x: x + 6, y: 9 }, 7.5);
  for (let x = 20; x < 470; x += 53) cable({ x, y: 251 }, { x: x - 4, y: 269 }, 7.2);
  for (let y = 20; y < 250; y += 41) cable({ x: -8, y }, { x: 8, y: y + 5 }, 7.0);
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  group.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#2a2a28' })));

  return { group, atlas };
}

function nearSignOrCrossing(x: number, y: number, d: number) {
  if (SIGNS.some((s) => Math.hypot(s.x - x, s.y - y) < d)) return true;
  if (CROSSINGS.some((c) => x > c.x0 - 6 && x < c.x1 + 6 && y > c.y0 - 8 && y < c.y1 + 8)) return true;
  return false;
}

function nearestFront(bs: Building[], x: number, y: number) {
  let best: Building | null = null, bd = 6;
  for (const bd2 of bs) {
    const [a, c] = bd2.front;
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    const d = Math.hypot(mx - x, my - y) - Math.hypot(c.x - a.x, c.y - a.y) / 2;
    if (d < bd) { bd = d; best = bd2; }
  }
  return best;
}
function frontOffset(bd: Building, x: number, y: number) {
  const a = bd.front[0];
  return (x - a.x) * bd.normal.x + (y - a.y) * bd.normal.y + 0.02;
}

function addBuilding(b: Batcher, bd: Building, r: ReturnType<typeof rng>) {
  const { r: fp } = bd;
  const w = fp.x1 - fp.x0, d = fp.y1 - fp.y0;
  const plaster = new THREE.Color(bd.color);
  const box = new THREE.BoxGeometry(w, bd.height, d);
  box.translate((fp.x0 + fp.x1) / 2, bd.height / 2, -(fp.y0 + fp.y1) / 2);
  b.add(box, 'wall-' + bd.color, () => lambert({ color: plaster }));
  const [a, c] = bd.front;
  const fw = Math.hypot(c.x - a.x, c.y - a.y);
  // the generator stores the front as a→b along the curb direction; make sure the plane faces the street
  const gfH = 3.4;
  const kind: 'shop' | 'door' | 'plain' | 'garage' = bd.shop ? 'shop' : r.chance(0.35) ? 'door' : r.chance(0.15) ? 'garage' : 'plain';
  const accent = bd.shop ? '#3b3b38' : bd.shutter;
  b.add(wallPlane(a, c, bd.normal, 0.15, gfH, 0.03, Math.max(1, Math.round(fw / 3.6)), 1), `gf-${kind}-${accent}-${bd.color}`, () => lambert({ map: T.groundFloor(kind, accent), color: plaster }), undefined, false);
  if (bd.floors > 1) {
    const upH = bd.height - gfH - 0.5;
    b.add(wallPlane(a, c, bd.normal, gfH, gfH + upH, 0.03, Math.max(1, Math.round(fw / 3.6)), upH / 3.15), `fac-${bd.style}-${bd.shutter}-${bd.balcony}-${bd.color}`, () => lambert({ map: T.facade(bd.style, bd.shutter, bd.balcony), color: plaster }), undefined, false);
    if (bd.balcony) {
      const n = bd.normal;
      for (let f = 1; f < bd.floors; f++) {
        const y = gfH + (f - 1) * 3.15 + 0.05;
        const slab = new THREE.BoxGeometry(Math.min(fw * 0.55, 7), 0.14, 0.9);
        slab.rotateY(faceRot(Math.atan2(n.y, n.x)));
        const mx = (a.x + c.x) / 2 + n.x * 0.48, my = (a.y + c.y) / 2 + n.y * 0.48;
        slab.translate(mx, y, -my);
        b.add(slab, 'balc', () => lambert({ color: '#cfc6b3' }));
        const rail = new THREE.BoxGeometry(Math.min(fw * 0.55, 7), 0.9, 0.04);
        rail.rotateY(faceRot(Math.atan2(n.y, n.x)));
        rail.translate(mx + n.x * 0.43, y + 0.52, -(my + n.y * 0.43));
        b.add(rail, 'rail', () => lambert({ color: '#3b3d39', transparent: true, opacity: 0.85 }), undefined, false);
      }
    }
  }
  // AC units, a very Skopje detail
  if (r.chance(0.45)) {
    const n = bd.normal;
    const k = r.int(1, 2);
    for (let i = 0; i < k; i++) {
      const t = r.range(0.15, 0.85);
      const x = a.x + (c.x - a.x) * t + n.x * 0.2, y = a.y + (c.y - a.y) * t + n.y * 0.2;
      const ac = new THREE.BoxGeometry(0.75, 0.5, 0.75);
      ac.translate(x, gfH + r.range(0.8, Math.max(1, bd.height - gfH - 1.5)), -y);
      b.add(ac, 'ac', () => lambert({ color: '#e6e6e0' }));
    }
  }
  if (bd.roof === 'hip') b.add(hipRoof(fp, bd.height, Math.min(w, d) * 0.28), 'roof', () => lambert({ map: T.roofTiles(), color: '#ffffff' }));
  else {
    const rim = 0.25;
    for (const [x0, y0, x1, y1] of [[fp.x0, fp.y0, fp.x1, fp.y0 + rim], [fp.x0, fp.y1 - rim, fp.x1, fp.y1], [fp.x0, fp.y0, fp.x0 + rim, fp.y1], [fp.x1 - rim, fp.y0, fp.x1, fp.y1]]) {
      const g = new THREE.BoxGeometry(x1 - x0, 0.6, y1 - y0);
      g.translate((x0 + x1) / 2, bd.height + 0.3, -(y0 + y1) / 2);
      b.add(g, 'wall-' + bd.color, () => lambert({ color: plaster }));
    }
    if (r.chance(0.5)) {
      const tank = new THREE.CylinderGeometry(0.5, 0.5, 1.3, 10);
      tank.translate(fp.x0 + w * r.range(0.25, 0.75), bd.height + 0.65, -(fp.y0 + d * r.range(0.25, 0.75)));
      b.add(tank, 'tank', () => lambert({ color: '#d6d2c6' }));
    }
    if (r.chance(0.4)) {
      const dish = new THREE.CylinderGeometry(0.45, 0.1, 0.12, 12);
      dish.rotateX(0.9);
      dish.translate(fp.x0 + w * 0.3, bd.height + 0.9, -(fp.y0 + d * 0.6));
      b.add(dish, 'dish', () => lambert({ color: '#efefea' }));
    }
  }
}

export function addSign(b: Batcher, s: SignDef, base = 0) {
  const isPlaque = s.code === 'plaque';
  const wide = s.code === '305.1';
  // Sizes are slightly generous for screen readability; official dimensions are listed as unverified in the README.
  const isPlace = s.code === 'place';
  const w = isPlaque ? 1.0 : isPlace ? (s.text && s.text.length > 12 ? 6 : 1.6) : wide ? 1.25 : ['102', '103.1', '103.2', '106', '107', '111.1', '115', '121.1', '123'].includes(s.code) ? 1.05 : 0.78;
  const h = isPlaque ? 0.25 : isPlace ? (s.text && s.text.length > 12 ? 0.9 : 0.5) : wide ? 0.47 : w;
  const centerY = isPlaque ? 2.9 : (s.height ?? 2.3);
  const rot = faceRot(s.face);
  const n = { x: Math.cos(s.face), y: Math.sin(s.face) };
  if (!isPlaque) {
    const pole = new THREE.CylinderGeometry(0.035, 0.035, centerY + h / 2, 6);
    pole.translate(s.x, base + (centerY + h / 2) / 2, -s.y);
    b.add(pole, 'signpole', () => lambert({ color: '#8e938f' }));
    const back = new THREE.PlaneGeometry(w * 0.98, h * 0.98);
    back.rotateY(rot + Math.PI);
    back.translate(s.x - n.x * 0.045, base + centerY, -(s.y - n.y * 0.045));
    b.add(back, 'signback', () => lambert({ color: '#9aa09c', side: THREE.FrontSide }), undefined, false);
  }
  const face = new THREE.PlaneGeometry(w, h);
  face.rotateY(rot);
  face.translate(s.x + n.x * 0.04, base + centerY, -(s.y + n.y * 0.04));
  b.add(face, `sign-${s.code}-${s.arrow ?? ''}-${s.text ?? ''}`, () => new THREE.MeshBasicMaterial({ map: T.signTexture(s.code, { arrow: s.arrow, text: s.text }), transparent: true, alphaTest: 0.4, toneMapped: false }), undefined, true);
}

function buildTrees(r: ReturnType<typeof rng>): THREE.Group {
  const pts: { x: number; y: number; s: number; tone: number }[] = [];
  const nearJ = (x: number, y: number) => Object.values(JUNCTIONS).some((j) => x > j.x0 - 12 && x < j.x1 + 12 && y > j.y0 - 12 && y < j.y1 + 12);
  for (const f of FRONTAGES) {
    if (f.street === 'tiha') continue;
    const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
    const dx = (f.b.x - f.a.x) / len, dy = (f.b.y - f.a.y) / len;
    for (let s = 8 + r.range(0, 6); s < len - 6; s += r.range(12, 19)) {
      const x = f.a.x + dx * s - f.normal.x * 0.95, y = f.a.y + dy * s - f.normal.y * 0.95;
      if (nearJ(x, y) || nearSignOrCrossing(x, y, 4) || RESERVED.some((q) => x > q.r.x0 - 2 && x < q.r.x1 + 2 && y > q.r.y0 - 2 && y < q.r.y1 + 2)) continue;
      pts.push({ x, y, s: r.range(0.85, 1.25), tone: r.next() });
    }
  }
  for (const t of TREES_EXTRA) pts.push({ x: t.x, y: t.y, s: r.range(0.9, 1.2), tone: r.next() });
  pts.push({ x: CAFE_CHINAR_TREE.x, y: CAFE_CHINAR_TREE.y, s: 1.9, tone: 0.3 });

  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 4.2, 7); trunkGeo.translate(0, 2.1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 1); crownGeo.scale(1, 0.85, 1); crownGeo.translate(0, 5.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert({ color: '#8a7d6a' }), pts.length);
  const crowns = new THREE.InstancedMesh(crownGeo, lambert({ color: '#ffffff', flatShading: true, transparent: true, opacity: 1 }), pts.length);
  crowns.name = 'tree-crowns';
  const m = new THREE.Matrix4();
  const greens = ['#6d8a3f', '#7d9447', '#5f7d3c', '#8a9a4a', '#73893e'];
  pts.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, 0.15, -p.y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.tone * 6), new THREE.Vector3(p.s, p.s, p.s));
    trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, new THREE.Color(greens[Math.floor(p.tone * greens.length) % greens.length]));
  });
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  g.add(trunks, crowns);
  return g;
}

export function buildHorizon(): THREE.Group {
  const g = new THREE.Group();
  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 24, 16), new THREE.MeshBasicMaterial({ map: T.skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.set(240, 0, -130);
  g.add(sky);
  // Vodno: long ridge to the south with the cross on its top
  const ridge = new THREE.PlaneGeometry(3400, 700, 80, 12);
  const pos = ridge.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = (y + 350) / 700; // 0 bottom, 1 top
    const prof = Math.exp(-((x / 900) ** 2)) * 560 + Math.sin(x / 140) * 18 * (1 - Math.abs(x) / 1700) + Math.sin(x / 57) * 7;
    pos.setY(i, Math.max(0, prof * t) );
    pos.setZ(i, -t * 260);
  }
  ridge.computeVertexNormals();
  const mtn = new THREE.Mesh(ridge, new THREE.MeshBasicMaterial({ color: '#8f9aa0', fog: false }));
  mtn.position.set(VODNO.x, -2, -VODNO.y);
  mtn.rotation.y = Math.PI;
  g.add(mtn);
  const crossMat = new THREE.MeshBasicMaterial({ color: '#f1efe8', fog: false });
  // the ridge's local x = 0 is its summit; after the half-turn it sits at world x = VODNO.x
  const cx = VODNO.x, cz = -VODNO.y + 260, peak = 560;
  const v = new THREE.Mesh(new THREE.BoxGeometry(6, 66, 6), crossMat); v.position.set(cx, peak + 28, cz); g.add(v);
  const hbar = new THREE.Mesh(new THREE.BoxGeometry(34, 6, 6), crossMat); hbar.position.set(cx, peak + 44, cz); g.add(hbar);
  // distant Yugoslav-era residential blocks, hazy
  const r = rng(5);
  const blockMat = new THREE.MeshLambertMaterial({ color: '#c9bfae' });
  for (let i = 0; i < 46; i++) {
    const ang = r.range(0, Math.PI * 2);
    const dist = r.range(380, 620);
    const x = 240 + Math.cos(ang) * dist, y = -130 + Math.sin(ang) * dist * 0.9 + 130;
    if (y < -260) continue; // keep the view to Vodno open
    const h = r.pick([18, 24, 30, 42, 48]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.range(14, 40), h, r.range(12, 16)), blockMat);
    m.position.set(x, h / 2, -y);
    m.rotation.y = r.range(0, Math.PI);
    g.add(m);
  }
  return g;
}

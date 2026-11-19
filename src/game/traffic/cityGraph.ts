// Directed lane graph of the neighbourhood. NPC drivers, junction control and the
// instructor's navigation (with rerouting) all use this single representation.
import { Path, angleDiff, type Vec2 } from '../math';

export type Turn = 'straight' | 'left' | 'right';
export interface Edge { id: string; street: string; pts: Vec2[]; speed: number; to: string; label: string }
export interface Link { from: string; to: string; node: string; turn: Turn; via: Vec2 }
export interface NodeDef { id: string; c: Vec2; control: 'rightHand' | 'corner' | 'signal'; box: { x0: number; y0: number; x1: number; y1: number } }

const P = (x: number, y: number): Vec2 => ({ x, y });

export const NODES: NodeDef[] = [
  { id: 'J1', c: P(240, 0), control: 'rightHand', box: { x0: 236.8, y0: -3.5, x1: 243.2, y1: 3.5 } },
  { id: 'J2', c: P(480, 0), control: 'corner', box: { x0: 477.2, y0: -3.5, x1: 482.8, y1: 3.5 } },
  { id: 'NE', c: P(480, 260), control: 'corner', box: { x0: 477.2, y0: 256.5, x1: 482.8, y1: 263.5 } },
  { id: 'J3', c: P(240, 260), control: 'rightHand', box: { x0: 236.8, y0: 256.5, x1: 243.2, y1: 263.5 } },
  { id: 'J4', c: P(0, 260), control: 'corner', box: { x0: -3.3, y0: 256.5, x1: 3.3, y1: 263.5 } },
  { id: 'J5', c: P(0, 0), control: 'corner', box: { x0: -3.3, y0: -3.5, x1: 3.3, y1: 3.5 } },
];

// lane centre lines keep clear of the parked rows of each street
export const EDGES: Edge[] = [
  { id: 'BE1', street: 'bakalska', pts: [P(5, -1.75), P(234, -1.75)], speed: 9, to: 'J1', label: 'ул. Бакалска' },
  { id: 'BE2', street: 'bakalska', pts: [P(246, -1.75), P(474, -1.75)], speed: 9, to: 'J2', label: 'ул. Бакалска' },
  { id: 'BW2', street: 'bakalska', pts: [P(474, 0.9), P(246, 0.9)], speed: 9, to: 'J1', label: 'ул. Бакалска' },
  { id: 'BW1', street: 'bakalska', pts: [P(234, 0.9), P(5, 0.9)], speed: 9, to: 'J5', label: 'ул. Бакалска' },
  { id: 'TN', street: 'tiha', pts: [P(481.4, 6), P(481.4, 81), P(479.2, 90), P(479.2, 156), P(481.4, 166), P(481.4, 254)], speed: 7, to: 'NE', label: 'ул. Тиха' },
  { id: 'TS', street: 'tiha', pts: [P(478.6, 254), P(478.6, 6)], speed: 7, to: 'J2', label: 'ул. Тиха' },
  { id: 'GW2', street: 'gjurgjevdenska', pts: [P(474, 261.75), P(246, 261.75)], speed: 9, to: 'J3', label: 'ул. Ѓурѓевденска' },
  { id: 'GW1', street: 'gjurgjevdenska', pts: [P(234, 261.75), P(6, 261.75)], speed: 9, to: 'J4', label: 'ул. Ѓурѓевденска' },
  { id: 'GE1', street: 'gjurgjevdenska', pts: [P(6, 259.2), P(234, 259.2)], speed: 9, to: 'J3', label: 'ул. Ѓурѓевденска' },
  { id: 'GE2', street: 'gjurgjevdenska', pts: [P(246, 259.2), P(474, 259.2)], speed: 9, to: 'NE', label: 'ул. Ѓурѓевденска' },
  { id: 'JS', street: 'javorova', pts: [P(-1.65, 254), P(-1.65, 6)], speed: 8, to: 'J5', label: 'ул. Јаворова' },
  { id: 'JN', street: 'javorova', pts: [P(0.75, 6), P(0.75, 254)], speed: 8, to: 'J4', label: 'ул. Јаворова' },
  { id: 'CN', street: 'chinarska-n', pts: [P(239.4, 6), P(239.4, 253)], speed: 8, to: 'J3', label: 'ул. Чинарска' },
];

const L = (from: string, to: string, node: string, turn: Turn, via: Vec2): Link => ({ from, to, node, turn, via });
// Only lawful connections (the one-way street has no southbound links).
export const LINKS: Link[] = [
  L('BE1', 'BE2', 'J1', 'straight', P(240, -1.75)), L('BE1', 'CN', 'J1', 'left', P(239.4, -1.75)),
  L('BW2', 'BW1', 'J1', 'straight', P(240, 0.9)), L('BW2', 'CN', 'J1', 'right', P(239.4, 0.9)),
  L('BE2', 'TN', 'J2', 'left', P(481.4, -1.75)), L('TS', 'BW2', 'J2', 'right', P(478.6, 0.9)),
  L('TN', 'GW2', 'NE', 'left', P(481.4, 261.75)), L('GE2', 'TS', 'NE', 'right', P(478.6, 259.2)),
  L('GW2', 'GW1', 'J3', 'straight', P(240, 261.75)), L('GE1', 'GE2', 'J3', 'straight', P(240, 259.2)),
  L('CN', 'GW1', 'J3', 'left', P(239.4, 261.75)), L('CN', 'GE2', 'J3', 'right', P(239.4, 259.2)),
  L('GW1', 'JS', 'J4', 'left', P(-1.65, 261.75)), L('JN', 'GE1', 'J4', 'right', P(0.75, 259.2)),
  L('JS', 'BE1', 'J5', 'left', P(-1.65, -1.75)), L('BW1', 'JN', 'J5', 'right', P(0.75, 0.9)),
];

export const edgeById = (id: string) => EDGES.find((e) => e.id === id)!;
export const linksFrom = (id: string) => LINKS.filter((l) => l.from === id);
export const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

const lenOf = (pts: Vec2[]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

/** Path for an NPC: optional link into the edge, then the edge's lane line. */
export function pathFor(edge: Edge, via?: Vec2, prevEnd?: Vec2): Path {
  const pts = [...(prevEnd ? [prevEnd] : []), ...(via ? [via] : []), ...edge.pts];
  return new Path(pts, 6, 0.6);
}

/** Locate the player on the graph: nearest edge whose direction matches the heading. */
export function locate(x: number, y: number, h: number): { edge: Edge; along: number; remaining: number } | null {
  let best: { edge: Edge; along: number; remaining: number; d: number } | null = null;
  for (const e of EDGES) {
    let acc = 0;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      const px = a.x + dx * u, py = a.y + dy * u;
      const d = Math.hypot(px - x, py - y);
      const dirOk = Math.abs(angleDiff(Math.atan2(dy, dx), h)) < 0.8;
      if (dirOk && d < 3.2 && (!best || d < best.d)) best = { edge: e, along: acc + l * u, remaining: lenOf(e.pts) - (acc + l * u), d };
      acc += l;
    }
  }
  return best ? { edge: best.edge, along: best.along, remaining: best.remaining } : null;
}

/** Shortest lawful route (edge ids) from an edge to a goal edge. */
export function route(fromEdge: string, goalEdge: string): string[] | null {
  const dist = new Map<string, number>([[fromEdge, 0]]);
  const prev = new Map<string, string>();
  const q = [fromEdge];
  while (q.length) {
    q.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const cur = q.shift()!;
    if (cur === goalEdge) break;
    for (const l of linksFrom(cur)) {
      const nd = dist.get(cur)! + lenOf(edgeById(l.to).pts) + (l.turn === 'straight' ? 0 : 15);
      if (nd < (dist.get(l.to) ?? Infinity)) { dist.set(l.to, nd); prev.set(l.to, cur); if (!q.includes(l.to)) q.push(l.to); }
    }
  }
  if (!dist.has(goalEdge)) return null;
  const out = [goalEdge];
  while (out[0] !== fromEdge) out.unshift(prev.get(out[0])!);
  return out;
}

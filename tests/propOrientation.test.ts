// Imported prop headings: wall segments must line up with their neighbours and
// OSM signs must face along their road (catches a mirrored rotationMatrix read).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ImportedRoad, LevelObjects, PropInstance } from '../src/mapng/import/types';

const dir = join(__dirname, '..', 'public', 'mapng', 'prviot_krug');
const objects: LevelObjects = JSON.parse(readFileSync(join(dir, 'objects.json'), 'utf8'));
const roads: ImportedRoad[] = JSON.parse(readFileSync(join(dir, 'roads.json'), 'utf8')).roads;
const median = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
const lineOff = (a: number, b: number) => {
  const d = (((a - b) % Math.PI) + Math.PI) % Math.PI;
  return Math.min(d, Math.PI - d);
};

describe('imported prop orientation', () => {
  it('stone wall segments run along their own heading (local x)', () => {
    const walls = objects.fences.filter((f) => f.type === 'italy_wall_stone');
    const off = walls.map((a) => {
      let best: PropInstance = walls[0], bd = Infinity;
      for (const b of walls) {
        const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
        if (b !== a && d < bd) [best, bd] = [b, d];
      }
      return lineOff(Math.atan2(best.pos[1] - a.pos[1], best.pos[0] - a.pos[0]), a.yaw);
    });
    expect(median(off)).toBeLessThan(0.05);
  });

  it('OSM sign faces point along the nearest road', () => {
    const segs = roads
      .filter((r) => r.kind === 'carriageway' || r.kind === 'service')
      .flatMap((r) => r.points.slice(1).map((b, i) => [r.points[i], b]));
    const align = objects.signs
      .filter((s) => s.type !== 'one_way') // one-way plates run parallel to the road
      .map((s) => {
        let u = [1, 0], bd = Infinity;
        for (const [a, b] of segs) {
          const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6;
          const t = Math.max(0, Math.min(1, ((s.pos[0] - a[0]) * dx + (s.pos[1] - a[1]) * dy) / (L * L)));
          const d = Math.hypot(s.pos[0] - a[0] - dx * t, s.pos[1] - a[1] - dy * t);
          if (d < bd) [u, bd] = [[dx / L, dy / L], d];
        }
        // renderer plate normal = (sin yaw, −cos yaw)
        return Math.abs(Math.sin(s.yaw) * u[0] - Math.cos(s.yaw) * u[1]);
      });
    expect(align.reduce((a, b) => a + b, 0) / align.length).toBeGreaterThan(0.8);
  });
});

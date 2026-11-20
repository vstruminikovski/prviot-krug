// Terrain mesh from the imported heightmap, draped with the MapNG colour texture.

import * as THREE from 'three';
import type { Terrain } from '../import/loadLevel';

export function buildTerrain(t: Terrain, textureUrl: string, step = 2): THREE.Mesh {
  const n = t.size;
  const m = Math.floor((n - 1) / step) + 1;
  const pos = new Float32Array(m * m * 3);
  const uv = new Float32Array(m * m * 2);
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const si = Math.min(n - 1, i * step), sj = Math.min(n - 1, j * step);
      const k = j * m + i;
      const x = t.origin[0] + si * t.squareSize;
      const y = t.origin[1] + sj * t.squareSize;
      pos[k * 3] = x;
      pos[k * 3 + 1] = t.heights[sj * n + si] - 0.04; // sit just under decals and slabs
      pos[k * 3 + 2] = -y;
      uv[k * 2] = si / (n - 1);
      uv[k * 2 + 1] = sj / (n - 1); // image top = north
    }
  const idx = new Uint32Array((m - 1) * (m - 1) * 6);
  let o = 0;
  for (let j = 0; j < m - 1; j++)
    for (let i = 0; i < m - 1; i++) {
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      idx.set([a, b, c, b, d, c], o);
      o += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();

  const tex = new THREE.TextureLoader().load(textureUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// Merges static geometry by material to keep draw calls low (important on phones).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Bucket { mat: THREE.Material; geoms: THREE.BufferGeometry[]; shadow: boolean }

export class Batcher {
  private buckets = new Map<string, Bucket>();

  add(geom: THREE.BufferGeometry, key: string, make: () => THREE.Material, matrix?: THREE.Matrix4, castShadow = true) {
    let b = this.buckets.get(key);
    if (!b) { b = { mat: make(), geoms: [], shadow: castShadow }; this.buckets.set(key, b); }
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    g.morphAttributes = {};
    g.clearGroups();
    b.geoms.push(g);
  }

  build(receiveShadow = true): THREE.Group {
    const group = new THREE.Group();
    for (const [key, b] of this.buckets) {
      if (!b.geoms.length) continue;
      const merged = mergeGeometries(b.geoms, false);
      if (!merged) { console.warn('merge failed', key); continue; }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = receiveShadow;
      mesh.name = key;
      group.add(mesh);
      for (const g of b.geoms) g.dispose();
    }
    this.buckets.clear();
    return group;
  }
}

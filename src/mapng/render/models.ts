// MapNG building and sidewalk tiles (Collada exported by three.js).
// Visual meshes are shown; the "Colmesh" nodes become Rapier trimeshes.

import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import type { PlacedModel } from '../import/types';

export interface LoadedModel {
  model: PlacedModel;
  object: THREE.Object3D;
  collision: { vertices: Float32Array; indices: Uint32Array };
}

const buildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 });
const buildingFlat = new THREE.MeshStandardMaterial({ color: 0xd9cbb3, roughness: 0.85 });
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.95 });

export async function loadModel(base: string, model: PlacedModel): Promise<LoadedModel> {
  const loader = new ColladaLoader();
  const collada = await loader.loadAsync(`${base}/${model.file}`);
  const root = new THREE.Group();
  root.name = model.name;
  root.add(collada.scene); // the loader already turns Z_UP into three's Y_UP
  const [x, y, z] = model.position;
  root.position.set(x, z, -y);
  root.updateMatrixWorld(true);

  const verts: number[] = [];
  const idx: number[] = [];
  const hide: THREE.Object3D[] = [];
  collada.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const isCol = /colmesh/i.test(mesh.name) || /colmesh/i.test(mesh.parent?.name ?? '');
    if (isCol) {
      appendWorld(mesh, verts, idx);
      hide.push(mesh);
      return;
    }
    const g = mesh.geometry as THREE.BufferGeometry;
    if (model.role === 'sidewalks') mesh.material = sidewalkMat;
    else mesh.material = g.getAttribute('color') ? buildingMat : buildingFlat;
    mesh.castShadow = model.role === 'buildings';
    mesh.receiveShadow = true;
  });
  hide.forEach((m) => m.removeFromParent());
  // no explicit collision mesh: collide with the visual one
  if (!idx.length)
    collada.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) appendWorld(o as THREE.Mesh, verts, idx);
    });
  return { model, object: root, collision: { vertices: new Float32Array(verts), indices: new Uint32Array(idx) } };
}

function appendWorld(mesh: THREE.Mesh, verts: number[], idx: number[]) {
  const g = mesh.geometry as THREE.BufferGeometry;
  const p = g.getAttribute('position');
  if (!p) return;
  mesh.updateWorldMatrix(true, false);
  const base = verts.length / 3;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    verts.push(v.x, v.y, v.z);
  }
  const index = g.getIndex();
  if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
  else for (let i = 0; i < p.count; i++) idx.push(base + i);
}

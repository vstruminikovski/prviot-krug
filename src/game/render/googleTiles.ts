// Optional live view of Google Photorealistic 3D Tiles over Debar Maalo, Skopje.
// Visualization only: tiles are streamed and displayed, never stored, converted, or used for
// collisions or scenario geometry (Google Maps Tile API policies). Disabled without a key.
// Lazy-loaded so the game bundle does not grow when the feature is off.
import * as THREE from 'three';

export const GOOGLE_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || undefined;
export const googleTilesEnabled = () => !!GOOGLE_KEY;

// Debar Maalo (approx. centre) — WGS84
const LAT = 41.9995, LON = 21.4155;

export interface TilesViewer { dispose(): void }

export async function openGoogleTiles(container: HTMLElement, onAttribution: (text: string) => void): Promise<TilesViewer> {
  if (!GOOGLE_KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY is not set');
  const { TilesRenderer, GlobeControls } = await import('3d-tiles-renderer');
  const { GoogleCloudAuthPlugin } = await import('3d-tiles-renderer/plugins');
  const { CAMERA_FRAME } = await import('3d-tiles-renderer/src/three/math/Ellipsoid.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9d6dc');
  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 1, 1.6e7);

  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: GOOGLE_KEY, autoRefreshToken: true }));
  tiles.group.rotation.x = -Math.PI / 2; // ECEF Z-up → three Y-up
  scene.add(tiles.group);
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);

  const controls = new GlobeControls(scene, camera, renderer.domElement, tiles);
  // place the camera above the neighbourhood, looking north-west, ~450 m up
  const m = new THREE.Matrix4();
  tiles.ellipsoid.getFrame(LAT * THREE.MathUtils.DEG2RAD, LON * THREE.MathUtils.DEG2RAD, -0.6, -0.55, 0, 450, m, CAMERA_FRAME);
  m.premultiply(tiles.group.matrixWorld.clone().makeRotationX(-Math.PI / 2));
  m.decompose(camera.position, camera.quaternion, camera.scale);

  let raf = 0, lastAttr = '';
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    camera.updateMatrixWorld();
    tiles.update();
    renderer.render(scene, camera);
    // aggregate and show data attributions for the tiles in view (required)
    const text = tiles.getAttributions().filter((a) => a.type === 'string').map((a) => String(a.value)).join('; ');
    if (text !== lastAttr) { lastAttr = text; onAttribution(text); }
  };
  loop();
  const onResize = () => { renderer.setSize(container.clientWidth, container.clientHeight); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); tiles.setResolutionFromRenderer(camera, renderer); };
  window.addEventListener('resize', onResize);
  return {
    dispose() {
      cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
      controls.dispose?.(); tiles.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}

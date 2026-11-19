// A compact garage bay for the vehicle selection: concrete floor, mint-and-cream walls,
// workbench, tool board, tyre stack, a 1999 calendar and warm hanging lamps.
import * as THREE from 'three';

const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export interface GarageScene { scene: THREE.Scene; turntable: THREE.Group; update(dt: number): void }

export function buildGarage(): GarageScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2622');
  scene.fog = new THREE.Fog('#2a2622', 18, 40);
  scene.add(new THREE.HemisphereLight('#ffe9c8', '#3a3530', 0.9));
  for (const x of [-2.2, 2.2]) {
    const l = new THREE.SpotLight('#ffd49a', 60, 14, Math.PI / 4, 0.5, 1.6);
    l.position.set(x, 4.2, 1.2); l.target.position.set(0, 0, 0); l.castShadow = true; l.shadow.mapSize.set(1024, 1024);
    scene.add(l, l.target);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), lam({ color: '#1f3b3a', side: THREE.DoubleSide }));
    shade.position.set(x, 4.3, 1.2); scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff1c8' })); bulb.position.set(x, 4.15, 1.2); scene.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), lam({ color: '#111' })); cord.position.set(x, 5.0, 1.2); scene.add(cord);
  }
  // evening light through the open door behind the camera
  const sun = new THREE.DirectionalLight('#ffb070', 1.4); sun.position.set(6, 3, 9); sun.castShadow = true; scene.add(sun);
  // floor with painted bay and oil stains
  const floorTex = canvasTex(512, 512, (g) => {
    g.fillStyle = '#8f8a80'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) { const v = 110 + Math.random() * 40; g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.25)`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
    g.fillStyle = 'rgba(30,26,20,0.28)'; for (const [x, y, r] of [[240, 260, 50], [300, 300, 26], [150, 360, 18]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0.4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#e2b83a'; g.lineWidth = 8; g.setLineDash([30, 18]); g.strokeRect(90, 70, 332, 372);
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), lam({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // walls
  const wallTex = canvasTex(256, 256, (g) => { g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#8fb3a1'; g.fillRect(0, 150, 256, 106); g.fillStyle = '#5e8a78'; g.fillRect(0, 146, 256, 6); for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(80,70,50,0.06)'; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); } });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(3, 1);
  for (const [w, x, z, ry] of [[14, 0, -5, 0], [10, -6, 0, Math.PI / 2], [10, 6, 0, -Math.PI / 2]] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 5), lam({ map: wallTex }));
    m.position.set(x, 2.5, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), lam({ color: '#3a3530' })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 5; scene.add(ceil);
  // workbench with radio and tool board
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.8), lam({ color: '#6b4a2e' })); bench.position.set(-3.4, 0.45, -4.4); bench.castShadow = true; scene.add(bench);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 0.85), lam({ color: '#8a6440' })); top.position.set(-3.4, 0.93, -4.4); scene.add(top);
  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.2), lam({ color: '#7a1f2b' })); radio.position.set(-2.4, 1.1, -4.5); scene.add(radio);
  const board = canvasTex(512, 256, (g) => {
    g.fillStyle = '#c9b48a'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 10; x < 512; x += 16) for (let y = 10; y < 256; y += 16) g.fillRect(x, y, 3, 3);
    g.fillStyle = '#2b2b2b'; g.fillRect(40, 40, 18, 140); g.fillRect(28, 40, 42, 16); g.fillRect(110, 50, 12, 120); g.beginPath(); g.arc(116, 50, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a1f2b'; g.fillRect(180, 60, 90, 22); g.fillStyle = '#2b2b2b'; g.fillRect(260, 50, 14, 44);
    g.fillStyle = '#1f3b3a'; g.fillRect(320, 40, 150, 70); g.fillStyle = '#efe3c8'; g.font = '700 22px Arial'; g.fillText('ВАРДАР', 340, 84);
  });
  const tb = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), lam({ map: board })); tb.position.set(-3.4, 2.1, -4.98); scene.add(tb);
  // calendar
  const cal = canvasTex(256, 360, (g) => {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 256, 360);
    const grd = g.createLinearGradient(0, 0, 0, 180); grd.addColorStop(0, '#f2b880'); grd.addColorStop(1, '#8fb3a1'); g.fillStyle = grd; g.fillRect(12, 12, 232, 170);
    g.fillStyle = '#efe3c8'; g.fillRect(60, 110, 130, 34); g.fillRect(84, 88, 80, 26); g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(88, 146, 14, 0, Math.PI * 2); g.arc(166, 146, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a1f2b'; g.font = '700 30px Arial'; g.textAlign = 'center'; g.fillText('ЈУНИ 1999', 128, 216);
    g.fillStyle = '#333'; g.font = '16px Arial';
    for (let d = 1; d <= 30; d++) { const col = (d + 1) % 7, row = Math.floor((d + 1) / 7); g.fillText(String(d), 30 + col * 33, 248 + row * 24); }
  });
  const calm = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), lam({ map: cal })); calm.position.set(1.5, 2.4, -4.98); scene.add(calm);
  // tyre stack and jerrycan
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 8, 18), lam({ color: '#1b1b1b' })); t.rotation.x = Math.PI / 2; t.position.set(4.4, 0.12 + i * 0.24, -3.6); t.castShadow = true; scene.add(t); }
  const can = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.18), lam({ color: '#b3342b' })); can.position.set(3.6, 0.23, -4.4); scene.add(can);
  // turntable
  const turntable = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.06, 48), lam({ color: '#5b5650' })); disc.position.y = 0.03; disc.receiveShadow = true; turntable.add(disc);
  scene.add(turntable);
  return { scene, turntable, update(dt) { void dt; } };
}

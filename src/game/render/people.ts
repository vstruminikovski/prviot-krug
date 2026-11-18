// Simple, readable low-poly people: walkers with a swing cycle, seated café patrons and the father.
import * as THREE from 'three';

export interface Look { coat: string; skirt?: boolean; hair: string; carry: 'groceries' | 'bag' | 'none'; height: number; stoop?: number; cap?: boolean }

const matCache = new Map<string, THREE.Material>();
const lam = (c: string) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c)!; };
const SKIN = ['#d9a982', '#c99470', '#e0b896', '#b98563'];

export interface PersonRig { group: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; animate(phase: number, moving: boolean): void }

function limb(len: number, r: number, mat: THREE.Material) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 6), mat);
  m.position.y = -len / 2; m.castShadow = true;
  pivot.add(m);
  return pivot;
}

export function buildPerson(look: Look, seed = 0): PersonRig {
  const s = look.height / 1.72;
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.scale.setScalar(s);
  const skin = lam(SKIN[seed % SKIN.length]);
  const coat = lam(look.coat);
  const trousers = lam(look.skirt ? '#3a3330' : '#2f3238');
  const legL = limb(0.86, 0.075, trousers), legR = limb(0.86, 0.075, trousers);
  legL.position.set(0, 0.9, -0.1); legR.position.set(0, 0.9, 0.1);
  body.add(legL, legR);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.62, 8), coat);
  torso.position.y = 1.22; torso.castShadow = true; body.add(torso);
  if (look.skirt) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.42, 8), coat); sk.position.y = 0.78; body.add(sk); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), skin);
  head.position.y = 1.66; body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(look.hair));
  hair.position.y = 1.68; body.add(hair);
  if (look.cap) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), lam('#3a3a34')); cap.position.set(0.03, 1.77, 0); body.add(cap); }
  const armL = limb(0.62, 0.055, coat), armR = limb(0.62, 0.055, coat);
  armL.position.set(0, 1.5, -0.25); armR.position.set(0, 1.5, 0.25);
  body.add(armL, armR);
  if (look.carry === 'groceries') {
    const bag = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14), lam('#e9e3d2')); b.position.y = -0.78; bag.add(b);
    const leek = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.3, 5), lam('#6f9a3a')); leek.position.set(0.05, -0.55, 0); leek.rotation.z = 0.2; bag.add(leek);
    const bread = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6), lam('#c9934a')); bread.position.set(-0.07, -0.6, 0.02); bread.rotation.z = -0.3; bag.add(bread);
    armR.add(bag);
  } else if (look.carry === 'bag') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.08), lam('#5a3b2a')); b.position.set(0, -0.62, 0.08); armL.add(b);
  }
  if (look.stoop) body.rotation.z = -look.stoop;
  return {
    group: g, legL, legR, armL, armR,
    animate(phase, moving) {
      const a = moving ? Math.sin(phase * Math.PI) * 0.45 : 0;
      legL.rotation.z = a; legR.rotation.z = -a;
      armL.rotation.z = -a * 0.7;
      armR.rotation.z = look.carry === 'groceries' ? a * 0.15 : a * 0.7;
    },
  };
}

/** Seated person on a café chair, facing +x of the returned group. */
export function buildSeated(look: Look, seed = 0): THREE.Group {
  const g = new THREE.Group();
  const s = look.height / 1.72;
  const b = new THREE.Group(); b.scale.setScalar(s); g.add(b);
  const coat = lam(look.coat);
  const trousers = lam('#2f3238');
  const thighs = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.34), trousers); thighs.position.set(0.18, 0.5, 0); b.add(thighs);
  const shins = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.3), trousers); shins.position.set(0.4, 0.23, 0); b.add(shins);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.6, 8), coat); torso.position.set(-0.02, 0.86, 0); torso.rotation.z = -0.08; torso.castShadow = true; b.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), lam(SKIN[seed % SKIN.length])); head.position.set(0.02, 1.3, 0); b.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(look.hair)); hair.position.set(0.01, 1.32, 0); b.add(hair);
  if (look.cap) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), lam('#3a3a34')); cap.position.set(0.04, 1.41, 0); b.add(cap); const brim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.2), lam('#3a3a34')); brim.position.set(0.15, 1.395, 0); b.add(brim); }
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), coat); forearm.position.set(0.22, 0.78, 0.2); b.add(forearm);
  const forearm2 = forearm.clone(); forearm2.position.z = -0.2; b.add(forearm2);
  return g;
}

export function buildCafeSet(umbrella: string): THREE.Group {
  const g = new THREE.Group();
  const metal = lam('#3a3d3a');
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 14), lam('#e9e2cf')); top.position.y = 0.74; top.castShadow = true; g.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), metal); leg.position.y = 0.37; g.add(leg);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 8), lam('#f4f1ea')); cup.position.set(0.12, 0.79, 0.05); g.add(cup);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 10), lam('#f4f1ea')); saucer.position.set(0.12, 0.765, 0.05); g.add(saucer);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.1, 8), new THREE.MeshStandardMaterial({ color: '#cfe3e6', transparent: true, opacity: 0.6 })); water.position.set(-0.1, 0.81, -0.08); g.add(water);
  for (const a of [0, Math.PI]) {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), lam('#6b4a2e')); seat.position.y = 0.45; chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.42), lam('#6b4a2e')); back.position.set(-0.2, 0.68, 0); chair.add(back);
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 0.03), metal); l.position.set(x, 0.225, z); chair.add(l); }
    chair.position.set(Math.cos(a) * -0.62, 0, Math.sin(a) * 0.62);
    chair.rotation.y = a;
    g.add(chair);
  }
  if (umbrella) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6), metal); pole.position.y = 1.2; g.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.45, 8, 1, true), new THREE.MeshLambertMaterial({ color: umbrella, side: THREE.DoubleSide }));
    canopy.position.y = 2.35; canopy.castShadow = true; g.add(canopy);
  }
  return g;
}

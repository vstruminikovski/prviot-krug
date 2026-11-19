// In-world navigation: a glowing gate where the next decision is, a guide chevron that floats ahead of
// the car and points at it, and a short burst when the gate is reached. Original, minimal — light only.
import * as THREE from 'three';
import type { Vec2 } from '../math';

const AMBER = new THREE.Color('#ffc65a');

/** Vertical light curtain: opaque at the ground, fading upward, gently scrolling. */
function curtainMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uA: { value: 1 }, uC: { value: AMBER } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uA; uniform vec3 uC;
      void main(){ float f = clamp(1.0 - vUv.y, 0.0, 1.0); float fade = f * f; float band = 0.75 + 0.25 * sin(vUv.y * 9.0 - uT * 2.2);
        gl_FragColor = vec4(clamp(uC * band, 0.0, 1.0), clamp(fade * 0.55 * uA, 0.0, 1.0)); }`,
  });
}

export class NavMarker {
  readonly group = new THREE.Group();
  private gate = new THREE.Group();
  private curtain: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private arrow: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private burstRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private t = 0; private show = 0; private burstT = -1;
  private at: Vec2 | null = null;
  /** required direction at the gate (polygon starts): an arrow painted inside the ring */
  private headArrow: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    this.curtain = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 2.8, 40, 1, true), curtainMaterial());
    this.curtain.position.y = 1.4;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.25, 48), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.04;
    const hs = new THREE.Shape();
    hs.moveTo(1.6, 0); hs.lineTo(0.3, 0.9); hs.lineTo(0.3, 0.32); hs.lineTo(-1.5, 0.32); hs.lineTo(-1.5, -0.32); hs.lineTo(0.3, -0.32); hs.lineTo(0.3, -0.9); hs.closePath();
    this.headArrow = new THREE.Mesh(new THREE.ShapeGeometry(hs), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.headArrow.position.y = 0.05; this.headArrow.visible = false;
    this.gate.add(this.curtain, this.ring, this.headArrow);
    // guide chevron (flat, lying in the horizontal plane, tip along +x)
    const s = new THREE.Shape();
    s.moveTo(0.9, 0); s.lineTo(-0.5, 0.75); s.lineTo(-0.2, 0); s.lineTo(-0.5, -0.75); s.closePath();
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    this.arrow.renderOrder = 5;
    this.burstRing = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.2, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.burstRing.rotation.x = -Math.PI / 2;
    this.group.add(this.gate, this.arrow, this.burstRing);
    this.group.visible = false;
  }

  setTarget(at: Vec2 | null, heading?: number) {
    this.at = at ? { x: at.x, y: at.y } : null;
    this.headArrow.visible = !!at && heading !== undefined;
    if (heading !== undefined) this.headArrow.rotation.set(-Math.PI / 2, 0, heading);
  }

  /** The gate was reached: a white ring expands from it. */
  burst(at: Vec2, z: number) { this.burstT = 0; this.burstRing.position.set(at.x, z + 0.06, -at.y); }

  update(dt: number, car: { x: number; y: number; z: number; h: number }, heightAt: (x: number, y: number) => number, driverCam: boolean) {
    this.t += dt;
    this.show += ((this.at ? 1 : 0) - this.show) * Math.min(1, dt * 6);
    this.group.visible = this.show > 0.02 || this.burstT >= 0;
    if (this.burstT >= 0) {
      this.burstT += dt;
      const k = this.burstT / 0.6;
      this.burstRing.scale.setScalar(1 + k * 2.2);
      this.burstRing.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { this.burstT = -1; this.burstRing.material.opacity = 0; }
    }
    if (!this.at) { this.gate.visible = this.arrow.visible = this.show > 0.02; this.curtain.material.uniforms.uA.value = this.show; this.ring.material.opacity = 0.9 * this.show; this.arrow.material.opacity = 0.95 * this.show; return; }
    const { x, y } = this.at;
    const dist = Math.hypot(x - car.x, y - car.y);
    this.gate.visible = true;
    this.gate.position.set(x, heightAt(x, y), -y);
    const pulse = 1 + Math.sin(this.t * 3) * 0.04;
    this.gate.scale.set(pulse, 1, pulse);
    this.curtain.material.uniforms.uT.value = this.t;
    // the gate is a destination marker: softer when the car is right on it
    const near = Math.min(1, Math.max(0.35, (dist - 2) / 10));
    this.curtain.material.uniforms.uA.value = this.show * near;
    this.ring.material.opacity = 0.9 * this.show;
    // chevron: hovers over the road ahead of the car and turns toward the gate
    const ahead = driverCam ? 10 : 8, lift = 0.35; // just above the road: every camera looks down on it
    const ax = car.x + Math.cos(car.h) * ahead, ay = car.y + Math.sin(car.h) * ahead;
    const bearing = Math.atan2(y - car.y, x - car.x);
    this.arrow.visible = dist > 7;
    this.arrow.position.set(ax, heightAt(ax, ay) + lift + Math.sin(this.t * 2.4) * 0.05, -ay);
    this.arrow.scale.setScalar(driverCam ? 1.1 : 1.3);
    this.arrow.rotation.set(-Math.PI / 2, 0, bearing);
    this.arrow.material.opacity = 0.95 * this.show * Math.min(1, (dist - 7) / 6);
  }
}

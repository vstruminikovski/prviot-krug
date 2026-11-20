// Keyboard + touch controls producing a DriveInput each frame.
// Keys: W/↑ throttle, S/↓ brake (hold at standstill → reverse), A/D or ←/→ steer,
// Space handbrake, R reset to route start, C camera.

import type { DriveInput } from '../physics/vehicle';

export class Controls {
  private keys = new Set<string>();
  private touch = { throttle: 0, brake: 0, steer: 0 };
  private steer = 0;
  reverse = false;
  onReset?: () => void;
  onCamera?: () => void;
  private disposers: (() => void)[] = [];

  constructor(private root: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.onReset?.();
      if (e.code === 'KeyC') this.onCamera?.();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.disposers.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });
    this.buildTouch();
  }

  private buildTouch() {
    const pad = document.createElement('div');
    pad.className = 'mg-touch';
    pad.innerHTML = `
      <div class="mg-steer" data-zone="steer"><span>◀</span><span>▶</span></div>
      <div class="mg-pedals">
        <button data-zone="brake" aria-label="Brake">■</button>
        <button data-zone="throttle" aria-label="Throttle">▲</button>
      </div>`;
    this.root.appendChild(pad);
    const steerZone = pad.querySelector<HTMLElement>('[data-zone=steer]')!;
    const track = new Map<number, string>();
    const apply = (e: PointerEvent, zone: string) => {
      if (zone === 'steer') {
        const r = steerZone.getBoundingClientRect();
        this.touch.steer = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      } else this.touch[zone as 'throttle' | 'brake'] = 1;
    };
    pad.addEventListener('pointerdown', (e) => {
      const zone = (e.target as HTMLElement).closest<HTMLElement>('[data-zone]')?.dataset.zone;
      if (!zone) return;
      e.preventDefault();
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; the pedal still works without it */
      }
      track.set(e.pointerId, zone);
      apply(e, zone);
    });
    pad.addEventListener('pointermove', (e) => {
      const zone = track.get(e.pointerId);
      if (zone) apply(e, zone);
    });
    const end = (e: PointerEvent) => {
      const zone = track.get(e.pointerId);
      track.delete(e.pointerId);
      if (zone === 'steer') this.touch.steer = 0;
      else if (zone) this.touch[zone as 'throttle' | 'brake'] = 0;
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  read(dt: number, speed: number): DriveInput {
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    const thr = Math.max(k('KeyW', 'ArrowUp') ? 1 : 0, this.touch.throttle);
    const brk = Math.max(k('KeyS', 'ArrowDown') ? 1 : 0, this.touch.brake);
    const target = this.touch.steer || (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    // keyboard steering ramps so tapping gives small corrections
    const rate = target === 0 ? 4 : 2.5;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));

    // S at standstill selects reverse; W at standstill selects drive
    if (Math.abs(speed) < 0.4) {
      if (brk && !thr) this.reverse = true;
      if (thr && !brk) this.reverse = false;
    }
    const throttle = this.reverse ? brk : thr;
    const brake = this.reverse ? thr : brk;
    return { throttle, brake, steer: this.steer, handbrake: k('Space'), reverse: this.reverse };
  }

  dispose() {
    this.disposers.forEach((d) => d());
  }
}

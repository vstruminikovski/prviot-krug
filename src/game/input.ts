// Keyboard + touch input merged into one drive input.
import type { DriveInput } from './sim/vehicle';

export interface TouchState { steer: number; throttle: number; brake: number; horn: boolean }

export type Command = 'indLeft' | 'indRight' | 'camera' | 'mute' | 'pause' | 'restart';

export class Input {
  private keys = new Set<string>();
  touch: TouchState = { steer: 0, throttle: 0, brake: 0, horn: false };
  private steerKb = 0;
  onCommand: (c: Command) => void = () => {};
  private down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k === 'KeyQ') this.onCommand('indLeft');
    if (k === 'KeyE') this.onCommand('indRight');
    if (k === 'KeyC') this.onCommand('camera');
    if (k === 'KeyM') this.onCommand('mute');
    if (k === 'Escape' || k === 'KeyP') this.onCommand('pause');
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); };

  attach() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }
  detach() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
  }

  read(dt: number): DriveInput {
    const k = this.keys;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    // keyboard steering eases in and returns to centre, like a light hand on the wheel
    const rate = target === 0 ? 4.5 : 2.6;
    this.steerKb += Math.max(-rate * dt, Math.min(rate * dt, target - this.steerKb));
    const kbThrottle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    const kbBrake = k.has('KeyS') || k.has('ArrowDown') || k.has('Space') ? 1 : 0;
    const steer = Math.abs(this.touch.steer) > 0.02 ? this.touch.steer : this.steerKb;
    return {
      throttle: Math.max(kbThrottle, this.touch.throttle),
      brake: Math.max(kbBrake, this.touch.brake),
      steer,
      horn: k.has('KeyH') || this.touch.horn,
    };
  }
}

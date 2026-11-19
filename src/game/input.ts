// Keyboard + touch → normalised controls. Physical key codes (KeyboardEvent.code) are used,
// so the bindings work on Macedonian Cyrillic and other non-Latin layouts.
// Binary keys drive pedal *curves*: the clutch eases through the biting region when Space is
// released, and Z/X move it slowly and latch it, so the bite point can be held.
import type { Controls, Gear, Assist } from './vehicles/vehicle';

export type Command =
  | { type: 'gear'; gear: Gear } | { type: 'gearUp' } | { type: 'gearDown' }
  | { type: 'indicator'; dir: 'left' | 'right' } | { type: 'cancelIndicator' } | { type: 'hazards' }
  | { type: 'parkingBrake' } | { type: 'engine' } | { type: 'camera' } | { type: 'pause' } | { type: 'mute' } | { type: 'reset' };

export type Glance = 'mirrorL' | 'mirrorR' | 'mirrorC' | 'shoulderL' | 'shoulderR' | 'lookL' | 'lookR' | null;

export const BINDINGS: { keys: string; action: string }[] = [
  { keys: 'W', action: 'Гас' }, { keys: 'S', action: 'Сопирачка' }, { keys: 'A / D', action: 'Волан' },
  { keys: 'Space', action: 'Кумплунг (држи = до крај, пушти = полека)' }, { keys: 'Z / X', action: 'Кумплунг фино: притисни / пушти (останува)' },
  { keys: '1–5', action: 'Брзини' }, { keys: 'N', action: 'Празен од' }, { keys: '6', action: 'Рикверц (само при мирување)' }, { keys: '[ / ]', action: 'Брзина надолу / нагоре' },
  { keys: 'Q / E', action: 'Покажувач лево / десно' }, { keys: 'Backspace', action: 'Исклучи покажувач' }, { keys: 'B', action: 'Сите четири' },
  { keys: 'P', action: 'Рачна (крени / спушти)' }, { keys: 'R', action: 'Мотор: пали / гаси' },
  { keys: 'J / K', action: 'Лево / десно огледало' }, { keys: 'M', action: 'Внатрешно огледало' }, { keys: 'U / I', action: 'Поглед преку рамо лево / десно' },
  { keys: 'F / G', action: 'Поглед лево / десно' }, { keys: 'V', action: 'Камера' }, { keys: 'H', action: 'Сирена' }, { keys: 'T', action: 'Постави на почеток (полигон)' },
  { keys: '0', action: 'Звук' }, { keys: 'Esc', action: 'Пауза' },
];

export interface TouchState { steer: number; throttle: number; brake: number; clutchHeld: boolean; clutchLatch: number | null; horn: boolean; glance: Glance }

export class Input {
  private keys = new Set<string>();
  touch: TouchState = { steer: 0, throttle: 0, brake: 0, clutchHeld: false, clutchLatch: null, horn: false, glance: null };
  onCommand: (c: Command) => void = () => {};
  enabled = true;
  assist: Assist = 'manual';
  private steerKb = 0; private throttle = 0; private brake = 0;
  clutch = 0; // pedal 0 released … 1 pressed
  private clutchLatched = false;
  parkingBrake = true;
  bite = { low: 0.34, high: 0.66 };

  private down = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    const cmd = (c: Command) => this.onCommand(c);
    switch (k) {
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': cmd({ type: 'gear', gear: Number(k.slice(5)) as Gear }); break;
      case 'Digit6': cmd({ type: 'gear', gear: 'R' }); break;
      case 'KeyN': cmd({ type: 'gear', gear: 'N' }); break;
      case 'BracketLeft': cmd({ type: 'gearDown' }); break;
      case 'BracketRight': cmd({ type: 'gearUp' }); break;
      case 'KeyQ': cmd({ type: 'indicator', dir: 'left' }); break;
      case 'KeyE': cmd({ type: 'indicator', dir: 'right' }); break;
      case 'Backspace': cmd({ type: 'cancelIndicator' }); break;
      case 'KeyB': cmd({ type: 'hazards' }); break;
      case 'KeyP': cmd({ type: 'parkingBrake' }); break;
      case 'KeyR': cmd({ type: 'engine' }); break;
      case 'KeyV': cmd({ type: 'camera' }); break;
      case 'Digit0': cmd({ type: 'mute' }); break;
      case 'KeyT': cmd({ type: 'reset' }); break;
      case 'Escape': cmd({ type: 'pause' }); break;
      case 'Space': this.clutchLatched = false; break;
    }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  /** Clear held inputs on blur so no pedal stays stuck. */
  private blur = () => { this.keys.clear(); this.touch.throttle = 0; this.touch.brake = 0; this.touch.steer = 0; this.touch.clutchHeld = false; this.touch.horn = false; this.touch.glance = null; };

  attach() { window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up); window.addEventListener('blur', this.blur); document.addEventListener('visibilitychange', this.blur); }
  detach() { window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.blur); }
  clear() { this.blur(); }

  glance(): Glance {
    const k = this.keys;
    if (this.touch.glance) return this.touch.glance;
    if (k.has('KeyJ')) return 'mirrorL';
    if (k.has('KeyK')) return 'mirrorR';
    if (k.has('KeyM')) return 'mirrorC';
    if (k.has('KeyU')) return 'shoulderL';
    if (k.has('KeyI')) return 'shoulderR';
    if (k.has('KeyF')) return 'lookL';
    if (k.has('KeyG')) return 'lookR';
    return null;
  }

  read(dt: number): Controls {
    const k = this.keys;
    // steering: eases in and returns to centre like a light hand on the wheel
    const left = k.has('KeyA') || k.has('ArrowLeft'), right = k.has('KeyD') || k.has('ArrowRight');
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = target === 0 ? 4.5 : 2.4;
    this.steerKb += Math.max(-rate * dt, Math.min(rate * dt, target - this.steerKb));
    // pedals: ramps so a tap gives a partial pedal
    const wantT = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    const wantB = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    this.throttle += wantT ? Math.min(dt * 1.6, 1 - this.throttle) : -Math.min(dt * 5, this.throttle);
    this.brake += wantB ? Math.min(dt * 3.2, 1 - this.brake) : -Math.min(dt * 6, this.brake);
    // clutch
    const held = k.has('Space') || this.touch.clutchHeld;
    if (held) { this.clutch = Math.min(1, this.clutch + dt * 7); this.clutchLatched = false; }
    else if (k.has('KeyZ')) { this.clutch = Math.min(1, this.clutch + dt * 0.7); this.clutchLatched = true; }
    else if (k.has('KeyX')) { this.clutch = Math.max(0, this.clutch - dt * 0.6); this.clutchLatched = true; }
    else if (this.touch.clutchLatch !== null) { this.clutch = this.touch.clutchLatch; this.clutchLatched = true; }
    else if (!this.clutchLatched && this.clutch > 0) {
      // automatic easing through the biting region (slower in the learner profile)
      const inBite = this.clutch <= this.bite.high + 0.02 && this.clutch >= this.bite.low - 0.02;
      const slow = this.assist === 'learn' ? 0.42 : 0.75;
      this.clutch = Math.max(0, this.clutch - dt * (inBite ? slow : 3.2));
    }
    const steer = Math.abs(this.touch.steer) > 0.02 ? this.touch.steer : this.steerKb;
    return {
      throttle: Math.max(this.throttle, this.touch.throttle),
      brake: Math.max(this.brake, this.touch.brake),
      steer,
      clutch: this.clutch,
      parkingBrake: this.parkingBrake,
      horn: k.has('KeyH') || this.touch.horn,
    };
  }
}

// Original procedural street audio (Web Audio API): engine, relay-click indicator, horn,
// cups on saucers, chair scrape, café murmur, birds and a soft city bed. No sample files.
import { clamp } from '../math';

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private engGain!: GainNode; private engOsc1!: OscillatorNode; private engOsc2!: OscillatorNode; private engFilter!: BiquadFilterNode;
  private bedGain!: GainNode; private murmurGain!: GainNode; private murmurFilter!: BiquadFilterNode;
  private hornGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = false;
  private engineOn = false;
  private nextBird = 3;
  private nextClink = 2;

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(ctx.destination);
    // noise
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
    // engine
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 420; this.engFilter.Q.value = 2;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth'; this.engOsc1.frequency.value = 38;
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 19;
    const o2g = ctx.createGain(); o2g.gain.value = 0.5;
    this.engOsc1.connect(this.engFilter); this.engOsc2.connect(o2g).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc1.start(); this.engOsc2.start();
    // city bed
    const bed = ctx.createBufferSource(); bed.buffer = this.noiseBuf; bed.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 500;
    this.bedGain = ctx.createGain(); this.bedGain.gain.value = 0.22;
    bed.connect(bf).connect(this.bedGain).connect(this.master); bed.start();
    // café murmur: band-passed noise with slow wobble
    const mur = ctx.createBufferSource(); mur.buffer = this.noiseBuf; mur.loop = true; mur.playbackRate.value = 0.7;
    this.murmurFilter = ctx.createBiquadFilter(); this.murmurFilter.type = 'bandpass'; this.murmurFilter.frequency.value = 650; this.murmurFilter.Q.value = 1.8;
    this.murmurGain = ctx.createGain(); this.murmurGain.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 2.7; const lfoG = ctx.createGain(); lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(this.murmurFilter.frequency); lfo.start();
    mur.connect(this.murmurFilter).connect(this.murmurGain).connect(this.master); mur.start();
    // horn (two detuned squares, original "Yugo-ish" beep)
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(this.hornGain).connect(this.master);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private noiseBurst(t: number, dur: number, f: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', pan = 0) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    src.connect(fl).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return { fl, g };
  }

  private tone(t: number, f: number, dur: number, gain: number, type: OscillatorType = 'sine', pan = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    o.connect(g).connect(p).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  /** Indicator relay: a dry tick on, softer tock off. */
  relay(on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.03, on ? 3200 : 2100, 6, on ? 0.55 : 0.35, 'bandpass', -0.15);
    this.tone(t, on ? 1400 : 950, 0.025, on ? 0.08 : 0.05, 'square', -0.15);
  }

  clink(gain = 0.25, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, a] of [[2380, 1], [3170, 0.6], [4420, 0.35], [5900, 0.2]] as const) this.tone(t, f * (0.97 + Math.random() * 0.06), 0.35 + Math.random() * 0.2, gain * a * 0.25, 'sine', pan);
    this.tone(t + 0.09, 2600, 0.18, gain * 0.08, 'sine', pan);
  }

  chairScrape(gain = 0.5, pan = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { fl } = this.noiseBurst(t, 0.55, 900, 9, gain, 'bandpass', pan);
    fl.frequency.setValueAtTime(700, t); fl.frequency.linearRampToValueAtTime(1500, t + 0.25); fl.frequency.linearRampToValueAtTime(1100, t + 0.5);
  }

  thud(intensity: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.tone(t, 90, 0.35, clamp(0.25 + intensity * 0.08, 0.2, 0.8), 'sine');
    o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
    this.noiseBurst(t, 0.2, 400, 1, clamp(intensity * 0.1, 0.1, 0.6), 'lowpass');
  }

  crank() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this.noiseBurst(t + i * 0.13, 0.11, 240, 3, 0.4, 'bandpass');
    this.engineOn = true;
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 660, 0.4, 0.12); this.tone(t + 0.12, 880, 0.5, 0.1);
  }

  bird(pan: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.tone(t + i * 0.11, 3200 + Math.random() * 900, 0.08, 0.035, 'sine', pan);
      o.frequency.exponentialRampToValueAtTime(4800, t + i * 0.11 + 0.07);
    }
  }

  /** Called every frame. */
  update(dt: number, s: { revs: number; throttle: number; speed: number; horn: boolean; cafeProximity: number; cafePan: number; running: boolean }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const run = s.running && this.engineOn;
    const base = 34 + s.revs * 95;
    this.engOsc1.frequency.setTargetAtTime(base, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(base / 2, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(300 + s.throttle * 900 + s.revs * 400, t, 0.1);
    this.engGain.gain.setTargetAtTime(run ? 0.07 + s.throttle * 0.08 + Math.min(s.speed, 15) * 0.002 : 0, t, run ? 0.12 : 0.6);
    this.hornGain.gain.setTargetAtTime(s.horn ? 0.09 : 0, t, 0.015);
    this.murmurGain.gain.setTargetAtTime(s.cafeProximity * 0.5, t, 0.3);
    this.nextBird -= dt;
    if (this.nextBird < 0) { this.nextBird = 4 + Math.random() * 9; this.bird(Math.random() * 2 - 1); }
    if (s.cafeProximity > 0.15) {
      this.nextClink -= dt;
      if (this.nextClink < 0) { this.nextClink = 1.6 + Math.random() * 4; this.clink(0.2 + s.cafeProximity * 0.5, s.cafePan); }
    }
  }
}

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
  engineOn = false;
  private nextBird = 3;
  private nextClink = 2;

  /** Page hidden (app switched, screen locked): stop the audio thread; resume when it comes back. */
  private hidden = false;
  private onVis = () => {
    this.hidden = document.visibilityState === 'hidden';
    if (!this.ctx) return;
    if (this.hidden) void this.ctx.suspend().catch(() => {}); else void this.ctx.resume().catch(() => {});
  };
  /** iOS can leave the context 'interrupted' (call, Siri, another app): the next touch revives it. */
  private revive = () => { if (this.ctx && !this.hidden && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {}); };
  /** quieter while paused or in menus (0…1 of the set volume) */
  private duck = 1;
  setDuck(d: number) {
    if (Math.abs(d - this.duck) < 0.01) return;
    this.duck = d;
    if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.volume * d, this.ctx.currentTime, 0.12);
  }
  init() {
    if (this.ctx) { this.revive(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    document.addEventListener('visibilitychange', this.onVis);
    for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, this.revive, { capture: true, passive: true });
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume * this.duck; 
    // safety limiter: the summed synth voices must never clip the output (clipping = crackle)
    this.limiter = ctx.createDynamicsCompressor(); this.limiter.threshold.value = -6; this.limiter.knee.value = 4; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.master.connect(this.limiter).connect(ctx.destination);
    // noise
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
    // engine: 4-cylinder synthesis — firing-order harmonics + half-order rumble, a load-driven
    // soft clipper (the "bark" under throttle), intake roar from band-passed noise, exhaust low-pass.
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 420; this.engFilter.Q.value = 1.2;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const harm = [0, 1, 0.62, 0.3, 0.42, 0.16, 0.2, 0.08, 0.1, 0.05];
    const wave = ctx.createPeriodicWave(new Float32Array(harm.length), new Float32Array(harm));
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.setPeriodicWave(wave); this.engOsc1.frequency.value = 27;
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'triangle'; this.engOsc2.frequency.value = 13.5;
    const o2g = ctx.createGain(); o2g.gain.value = 0.42;
    // load "bark": ONE fixed soft-clip curve; the amount is the (smoothly ramped) gain into it, with a
    // matching make-up gain after. Rebuilding the curve while it plays made discontinuities = crackle.
    this.drive = ctx.createWaveShaper(); this.drive.oversample = '2x';
    { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(3 * x) / Math.tanh(3); } this.drive.curve = c; }
    this.driveIn = ctx.createGain(); this.driveOut = ctx.createGain(); this.setDrive(0.2);
    // combustion irregularity: slow random-ish amplitude wobble, strongest at idle
    this.wobble = ctx.createGain(); this.wobble.gain.value = 1;
    const wob = ctx.createOscillator(); wob.frequency.value = 6.3; this.wobbleDepth = ctx.createGain(); this.wobbleDepth.gain.value = 0.12;
    wob.connect(this.wobbleDepth).connect(this.wobble.gain); wob.start();
    this.engOsc1.connect(this.driveIn); this.engOsc2.connect(o2g).connect(this.driveIn);
    this.driveIn.connect(this.drive).connect(this.driveOut).connect(this.wobble).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc1.start(); this.engOsc2.start();
    // intake / induction roar
    const intake = ctx.createBufferSource(); intake.buffer = this.noiseBuf; intake.loop = true;
    this.intakeF = ctx.createBiquadFilter(); this.intakeF.type = 'bandpass'; this.intakeF.Q.value = 3; this.intakeF.frequency.value = 300;
    this.intakeG = ctx.createGain(); this.intakeG.gain.value = 0;
    intake.connect(this.intakeF).connect(this.intakeG).connect(this.master); intake.start();
    // tyres: squeal (narrow band noise + wavering tone) and road rumble; wind by speed
    const sq = ctx.createBufferSource(); sq.buffer = this.noiseBuf; sq.loop = true;
    this.squealF = ctx.createBiquadFilter(); this.squealF.type = 'bandpass'; this.squealF.Q.value = 14; this.squealF.frequency.value = 1150;
    this.squealG = ctx.createGain(); this.squealG.gain.value = 0;
    sq.connect(this.squealF).connect(this.squealG).connect(this.master); sq.start(0, 0.7);
    this.squealOsc = ctx.createOscillator(); this.squealOsc.type = 'sine'; this.squealOsc.frequency.value = 1050;
    const vib = ctx.createOscillator(); vib.frequency.value = 7; const vibG = ctx.createGain(); vibG.gain.value = 40; vib.connect(vibG).connect(this.squealOsc.frequency); vib.start();
    this.squealToneG = ctx.createGain(); this.squealToneG.gain.value = 0; this.squealOsc.connect(this.squealToneG).connect(this.master); this.squealOsc.start();
    const rum = ctx.createBufferSource(); rum.buffer = this.noiseBuf; rum.loop = true; rum.playbackRate.value = 0.5;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 140;
    this.rumbleG = ctx.createGain(); this.rumbleG.gain.value = 0; rum.connect(rf).connect(this.rumbleG).connect(this.master); rum.start(0, 0.3);
    const wind = ctx.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.6; this.windF.frequency.value = 600;
    this.windG = ctx.createGain(); this.windG.gain.value = 0; wind.connect(this.windF).connect(this.windG).connect(this.master); wind.start(0, 1.1);
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

  volume = 0.8;
  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume * this.duck, this.ctx.currentTime, 0.05);
  }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); this.setMuted(this.muted); }
  /** UI feedback: soft tick (hover/select), confirm, back */
  ui(kind: 'tick' | 'confirm' | 'back') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, k = 1 / Math.max(0.2, this.duck); // UI clicks keep their level while the scene is ducked
    if (kind === 'tick') this.tone(t, 1650, 0.035, 0.035 * k, 'sine');
    else if (kind === 'confirm') { this.tone(t, 740, 0.12, 0.06 * k, 'triangle'); this.tone(t + 0.07, 1110, 0.16, 0.05 * k, 'triangle'); }
    else this.tone(t, 520, 0.09, 0.04 * k, 'triangle');
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

  /** a waypoint reached: one bright, short two-note ping */
  ping() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 988, 0.12, 0.07, 'sine'); this.tone(t + 0.06, 1319, 0.2, 0.06, 'sine'); }
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

  grind() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseBurst(t, 0.35, 1800, 3, 0.5, 'bandpass'); const o = this.tone(t, 160, 0.3, 0.12, 'sawtooth'); o.frequency.linearRampToValueAtTime(110, t + 0.3); }
  ratchet() { if (!this.ctx) return; const t = this.ctx.currentTime; for (let i = 0; i < 5; i++) this.noiseBurst(t + i * 0.035, 0.02, 2600, 8, 0.35, 'bandpass', -0.2); }
  stall() { if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.tone(t, 70, 0.5, 0.25, 'sawtooth'); o.frequency.exponentialRampToValueAtTime(25, t + 0.45); this.noiseBurst(t, 0.3, 300, 2, 0.4, 'lowpass'); this.engineOn = false; }
  started() { this.engineOn = true; }
  private drive!: WaveShaperNode; private driveIn!: GainNode; private driveOut!: GainNode; private limiter!: DynamicsCompressorNode; private wobble!: GainNode; private wobbleDepth!: GainNode;
  private intakeF!: BiquadFilterNode; private intakeG!: GainNode;
  private squealF!: BiquadFilterNode; private squealG!: GainNode; private squealOsc!: OscillatorNode; private squealToneG!: GainNode;
  private rumbleG!: GainNode; private windF!: BiquadFilterNode; private windG!: GainNode;
  private setDrive(k: number) {
    // input drive 0.35…2.3 into the fixed tanh(3x) curve; make-up keeps the level roughly constant
    const g = 0.35 + clamp(k, 0, 1) * 1.95, t = this.ctx!.currentTime;
    this.driveIn.gain.setTargetAtTime(g, t, 0.05);
    this.driveOut.gain.setTargetAtTime(1 / Math.max(0.8, Math.tanh(3 * g) / Math.tanh(3) * 1.6), t, 0.05);
  }
  /** gear change: a short mechanical clunk */
  clunk() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseBurst(t, 0.07, 700, 4, 0.35, 'bandpass', 0.1); this.tone(t, 120, 0.08, 0.1, 'triangle'); }
  private sirenOsc: OscillatorNode | null = null; private sirenGain: GainNode | null = null;

  /** Called every frame. */
  update(dt: number, s: { revs: number; throttle: number; speed: number; horn: boolean; cafeProximity: number; cafePan: number; running: boolean; siren?: boolean; diesel?: boolean; load?: number; slip?: number; rpm?: number; tyre?: number }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const run = s.running;
    if (s.running) this.engineOn = true;
    // siren (emergency vehicle behind)
    if (s.siren && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain).connect(this.master); this.sirenOsc.start();
    }
    if (this.sirenOsc) {
      if (!s.siren) { this.sirenGain!.gain.setTargetAtTime(0, t, 0.2); this.sirenOsc.stop(t + 0.6); this.sirenOsc = null; }
      else this.sirenOsc.frequency.setTargetAtTime((t % 1.4) < 0.7 ? 760 : 980, t, 0.05);
    }
    // firing frequency of a four-stroke four: rpm / 30
    const rpm = s.rpm ?? (800 + s.revs * 5200);
    const f = Math.max(8, rpm / 30) * (s.diesel ? 0.92 : 1);
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.03);
    this.engOsc2.frequency.setTargetAtTime(f / 2, t, 0.03);
    const load = s.load ?? 0;
    this.setDrive(clamp(0.15 + s.throttle * 0.5 + load * 0.35, 0, 1));
    this.wobbleDepth.gain.setTargetAtTime(clamp(0.16 - s.revs * 0.16, 0.02, 0.16), t, 0.2);
    this.engFilter.frequency.setTargetAtTime((s.diesel ? 220 : 280) + f * 3.2 + s.throttle * 700 + load * 400 + (s.slip ?? 0) * 400, t, 0.06);
    this.engGain.gain.setTargetAtTime(run ? 0.06 + s.throttle * 0.06 + load * 0.03 + s.revs * 0.03 : 0, t, run ? 0.08 : 0.5);
    this.intakeF.frequency.setTargetAtTime(f * 2.4 + 120, t, 0.05);
    this.intakeG.gain.setTargetAtTime(run ? (s.throttle * 0.05 + s.revs * 0.03) * (s.diesel ? 0.6 : 1) : 0, t, 0.08);
    const tyre = clamp(s.tyre ?? 0, 0, 1);
    this.squealG.gain.setTargetAtTime(tyre * 0.22, t, 0.04);
    this.squealToneG.gain.setTargetAtTime(tyre * 0.025, t, 0.04);
    this.squealF.frequency.setTargetAtTime(1000 + tyre * 400, t, 0.1);
    const v = Math.min(s.speed, 40);
    this.rumbleG.gain.setTargetAtTime(v * 0.012, t, 0.2);
    this.windG.gain.setTargetAtTime(v * v * 0.00009, t, 0.3);
    this.windF.frequency.setTargetAtTime(400 + v * 25, t, 0.3);
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

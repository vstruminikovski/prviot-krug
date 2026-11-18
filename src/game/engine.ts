// Game loop and flow: title → intro → drive → outro → review ↔ replay / retry.
import { Sim, type RunSummary } from './sim/sim';
import { World } from './sim/world';
import { View, type CamMode } from './render/view';
import { GameAudio } from './audio/audio';
import { Input } from './input';
import { Autopilot } from './sim/autopilot';
import { ROUTE_HINTS, CHECKPOINTS, CAFE_TABLES, FATHER_SEAT } from './content/debarMaalo';
import type { ScenarioId } from './content/scenarios';
import { emitComplete } from './host';
import { angleDiff, kmh } from './math';
import type { ScenarioResult } from './sim/scenarios';

export type Phase = 'title' | 'intro' | 'drive' | 'outro' | 'review' | 'replay' | 'retry' | 'retryDone';

export interface Bubble { id: number; text: string; x: number; y: number; wx: number; wy: number; until: number }

export interface HudState {
  phase: Phase;
  speed: number; gear: 'D' | 'R'; indicator: 'off' | 'left' | 'right'; blink: boolean; revs: number;
  hint: { text: string; arrow: 'left' | 'straight' | 'compass'; dist: number | null; angle: number } | null;
  subtitle: { who: string; text: string } | null;
  bubbles: Bubble[];
  camMode: CamMode; muted: boolean; paused: boolean;
  toast: string | null;
  countdown: number | null;
  replay: ReplayState | null;
  retryId: ScenarioId | null;
}

export interface ReplayState {
  scenario: ScenarioResult;
  t0: number; t1: number; t: number; cueT: number | null; decisionT: number | null;
  playing: boolean; atCue: boolean; seenCue: boolean;
  speed: number; brake: number; throttle: number; indicator: number;
  source: 'run' | 'retry';
}

const FINAL_LINES = {
  great: 'Е, тоа е круг. Седни, ќе нарачам две кафиња.',
  good: 'Добро беше. Само едно место — следниот пат полека.',
  mixed: 'Ајде, седни малку. Утре пак еден круг, заедно.',
  bump: 'Колата е цела? Добро. Ти си цел — тоа е важно. Утре пак.',
};

export class GameEngine {
  view: View;
  audio = new GameAudio();
  input = new Input();
  world = new World();
  sim: Sim;
  runSim: Sim | null = null;
  retrySim: Sim | null = null;
  summary: RunSummary | null = null;
  retrySummary: RunSummary | null = null;
  phase: Phase = 'title';
  paused = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private phaseT = 0;
  private blinkT = 0;
  private prevBlink = false;
  private subtitle: HudState['subtitle'] = null;
  private subtitleUntil = 0;
  private bubbles: Bubble[] = [];
  private bubbleId = 0;
  private toast: string | null = null; private toastUntil = 0;
  private listeners = new Set<(h: HudState) => void>();
  private hudT = 0;
  replay: ReplayState | null = null;
  private countdown: number | null = null;
  private retryId: ScenarioId | null = null;
  private auto: Autopilot | null = null; // debug/testing only
  /** QA only: run the simulation faster than real time. */
  timeScale = 1;
  private introCues = new Set<string>();
  finalLine = '';

  constructor(canvas: HTMLCanvasElement) {
    this.view = new View(canvas);
    this.sim = new Sim({}, this.world);
    this.input.attach();
    this.input.onCommand = (c) => {
      if (c === 'indLeft' || c === 'indRight') this.toggleIndicator(c === 'indLeft' ? 'left' : 'right');
      if (c === 'camera') this.toggleCamera();
      if (c === 'mute') this.toggleMute();
      if (c === 'pause' && (this.phase === 'drive' || this.phase === 'retry')) this.paused = !this.paused;
    };
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() { cancelAnimationFrame(this.raf); this.input.detach(); this.view.renderer.dispose(); }

  subscribe(fn: (h: HudState) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  // ---------------------------------------------------------------- commands
  toggleIndicator(d: 'left' | 'right') {
    if (this.phase !== 'drive' && this.phase !== 'retry') return;
    this.sim.player.toggleIndicator(d);
    this.blinkT = 0; this.prevBlink = false;
  }
  toggleCamera() { this.view.setCamMode(this.view.camMode === 'chase' ? 'driver' : 'chase'); this.emitHud(true); }
  toggleMute() { this.audio.setMuted(!this.audio.muted); this.emitHud(true); }

  startRun() {
    this.audio.init();
    this.sim = new Sim({}, this.world);
    this.runSim = this.sim;
    this.summary = null; this.replay = null; this.retryId = null; this.paused = false;
    this.phase = 'intro'; this.phaseT = 0; this.introCues.clear();
    this.view.resetShot(); this.view.setCamMode(this.view.camMode);
    this.say('Татко', 'Ај, еден круг. Те чекам кај кафичот.', 4.8);
    this.emitHud(true);
  }

  skipIntro() {
    if (this.phase !== 'intro') return;
    if (!this.introCues.has('crank')) { this.audio.crank(); this.introCues.add('crank'); }
    this.beginDrive();
  }

  private beginDrive() {
    this.phase = 'drive'; this.phaseT = 0;
    this.view.resetShot();
    this.emitHud(true);
  }

  restart() { this.startRun(); }

  startRetry(id: ScenarioId) {
    this.audio.init();
    this.retryId = id;
    this.retrySim = new Sim({ retry: id }, this.world);
    this.sim = this.retrySim;
    this.retrySummary = null; this.replay = null; this.paused = false;
    this.phase = 'retry'; this.phaseT = 0; this.countdown = 3;
    this.view.resetShot();
    this.audio.crank();
    this.emitHud(true);
  }

  backToReview() {
    this.phase = 'review'; this.replay = null; this.retryId = null;
    if (this.runSim) this.sim = this.runSim;
    this.emitHud(true);
  }

  startReplay(id: ScenarioId, source: 'run' | 'retry' = 'run') {
    const sim = source === 'retry' ? this.retrySim : this.runSim;
    if (!sim) return;
    const sc = sim.scenarios.find((s) => s.id === id);
    if (!sc) return;
    const r = sc.res;
    const start = sim.rec.start;
    const cue = r.cueT;
    const t0 = Math.max(start, (cue ?? r.armedT ?? r.decisionT ?? start) - 4);
    const t1 = Math.min(sim.rec.duration, (r.decisionT ?? r.endT ?? (cue ?? t0) + 8) + 3.5);
    this.sim = sim;
    this.replay = { scenario: r, t0, t1, t: t0, cueT: cue, decisionT: r.decisionT, playing: true, atCue: false, seenCue: false, speed: 0, brake: 0, throttle: 0, indicator: 0, source };
    this.phase = 'replay';
    this.view.resetShot();
    this.emitHud(true);
  }

  replayControl(cmd: 'play' | 'pause' | 'restart' | 'continue' | { seek: number }) {
    const r = this.replay;
    if (!r) return;
    if (cmd === 'play') r.playing = true;
    else if (cmd === 'pause') r.playing = false;
    else if (cmd === 'restart') { r.t = r.t0; r.playing = true; r.atCue = false; r.seenCue = false; this.view.resetShot(); }
    else if (cmd === 'continue') { r.atCue = false; r.seenCue = true; r.playing = true; }
    else { r.t = Math.max(r.t0, Math.min(r.t1, cmd.seek)); r.atCue = false; if (r.cueT !== null) r.seenCue = r.t > r.cueT; this.view.resetShot(); }
    this.emitHud(true);
  }

  /** QA hook: simulate a whole run instantly with the scripted driver, then open the review. */
  qaInstantRun(opts: ConstructorParameters<typeof Autopilot>[0]) {
    const sim = new Sim({}, this.world);
    const ap = new Autopilot(opts, sim.player.pose);
    while (!sim.finished && sim.t < 600) sim.step(1 / 60, ap.input(sim));
    if (!sim.finished) sim.finish();
    sim.drainEvents();
    this.sim = sim; this.runSim = sim; this.phase = 'drive';
    this.onRunFinished();
    this.phase = 'review';
    this.emitHud(true);
    return this.summary;
  }

  /** Debug/QA hook: let the scripted driver take the wheel. */
  setAutopilot(opts: ConstructorParameters<typeof Autopilot>[0] | null) {
    this.auto = opts ? new Autopilot(opts, this.sim.player.pose) : null;
  }

  // ---------------------------------------------------------------- loop
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.update(dt);
  };

  private say(who: string, text: string, secs: number) {
    this.subtitle = { who, text };
    this.subtitleUntil = performance.now() / 1000 + secs;
  }

  private update(dt: number) {
    const v = this.view;
    const nowS = performance.now() / 1000;
    this.phaseT += dt;
    if (this.subtitle && nowS > this.subtitleUntil) this.subtitle = null;
    if (this.toast && nowS > this.toastUntil) this.toast = null;

    // blink at ~1.5 Hz (indicator relay)
    this.blinkT += dt;
    const blink = (this.blinkT % 0.66) < 0.36;
    const ind = this.sim.player.indicator;
    if ((this.phase === 'drive' || this.phase === 'retry') && ind !== 'off' && blink !== this.prevBlink) this.audio.relay(blink);
    this.prevBlink = blink;

    const step = (input: Parameters<Sim['step']>[1]) => {
      this.acc += dt * this.timeScale;
      const maxSteps = 6 * Math.max(1, Math.ceil(this.timeScale));
      let n = 0;
      while (this.acc >= 1 / 60 && n < maxSteps) {
        // the scripted QA driver needs a fresh input every physics step
        const inp = this.auto && (this.phase === 'drive' || this.phase === 'retry') ? this.auto.input(this.sim) : input;
        this.sim.step(1 / 60, inp); this.acc -= 1 / 60; n++;
      }
      if (n === maxSteps) this.acc = 0;
      this.handleEvents();
    };

    if (this.phase === 'title') {
      v.syncLive(this.sim, dt, blink);
      v.updateCamera(dt, 'title', this.sim.player.pose, 0, 0);
      this.sim.strollers.forEach((s) => s.update(dt));
    } else if (this.phase === 'intro') {
      const t = this.phaseT;
      if (t > 0.35 && !this.introCues.has('chair')) { this.introCues.add('chair'); this.audio.chairScrape(0.45, -0.3); }
      if (t > 1.3 && !this.introCues.has('clink')) { this.introCues.add('clink'); this.audio.clink(0.5, -0.2); }
      if (t > 3.4 && !this.introCues.has('crank')) { this.introCues.add('crank'); this.audio.crank(); }
      step({ throttle: 0, brake: 0.3, steer: 0 });
      v.syncLive(this.sim, dt, blink);
      v.updateCamera(dt, 'intro', this.sim.player.pose, 0, 0, { t });
      if (t > 5.6) this.beginDrive();
    } else if (this.phase === 'drive' || this.phase === 'retry') {
      if (this.phase === 'retry' && this.countdown !== null) {
        this.countdown -= dt;
        if (this.countdown <= 0) this.countdown = null;
        v.syncLive(this.sim, dt, blink);
      } else if (!this.paused) {
        const input = this.input.read(dt);
        step(input);
        v.syncLive(this.sim, dt, blink);
      }
      const p = this.sim.player;
      v.updateCamera(dt, v.camMode, p.pose, p.v, p.steer);
    } else if (this.phase === 'outro') {
      v.syncLive(this.sim, dt, blink);
      this.sim.strollers.forEach((s) => s.update(dt));
      v.updateCamera(dt, 'outro', this.sim.player.pose, 0, 0);
      if (this.phaseT > 5.2) { this.phase = 'review'; this.emitHud(true); }
    } else if (this.phase === 'review' || this.phase === 'retryDone') {
      this.sim.strollers.forEach((s) => s.update(dt));
      v.syncLive(this.sim, dt, blink);
      v.updateCamera(dt, 'outro', this.sim.player.pose, 0, 0);
    } else if (this.phase === 'replay' && this.replay) {
      const r = this.replay;
      if (r.playing && !r.atCue) {
        r.t += dt;
        if (r.cueT !== null && !r.seenCue && r.t >= r.cueT) { r.t = r.cueT; r.atCue = true; r.playing = false; this.emitHud(true); }
        if (r.t >= r.t1) { r.t = r.t1; r.playing = false; this.emitHud(true); }
      }
      const f = this.sim.rec.at(r.t);
      if (f) {
        const replayBlink = (r.t % 0.66) < 0.36;
        v.syncReplay(f, this.sim.actorMeta, replayBlink, dt);
        v.syncStrollers(this.sim);
        r.speed = kmh(f.p.v); r.brake = f.p.brk; r.throttle = f.p.thr; r.indicator = f.p.ind;
        let focus: { x: number; y: number } | null = null;
        const fa = r.scenario.focusActor ? f.a.find((a) => a.id === r.scenario.focusActor) : null;
        if (fa) focus = { x: fa.x, y: fa.y };
        else if (r.scenario.cuePos) focus = r.scenario.cuePos;
        v.updateCamera(dt, 'replay', f.p, f.p.v, f.p.steer, { focus: focus ?? undefined });
        const showRing = r.cueT !== null && r.t >= r.cueT - 0.05 && r.t <= (r.decisionT ?? r.t1) + 0.5;
        v.setHighlight(showRing ? focus : null, nowS);
      }
    }
    if (this.phase !== 'replay') v.setHighlight(null, nowS);

    // audio
    const p = this.sim.player;
    const near = CAFE_TABLES.reduce((m, t) => Math.min(m, Math.hypot(t.x - p.x, t.y - p.y)), 999);
    const cafeProx = Math.max(0, 1 - near / 35);
    const cf = CAFE_TABLES.find((t) => Math.hypot(t.x - p.x, t.y - p.y) === near) ?? CAFE_TABLES[0];
    const cafePan = Math.sin(angleDiff(Math.atan2(cf.y - p.y, cf.x - p.x), p.h)) * -0.8;
    const running = this.phase === 'drive' || this.phase === 'retry' || (this.phase === 'intro' && this.introCues.has('crank'));
    this.audio.update(dt, { revs: p.revs, throttle: running ? p.throttle : 0, speed: Math.abs(p.v), horn: p.horn && running, cafeProximity: this.phase === 'replay' ? 0 : cafeProx, cafePan, running: running && !this.paused });

    v.render();

    // speech bubbles follow the patrons on screen
    for (const b of this.bubbles) { const s = v.project(b.wx, b.wy, 1.9); b.x = s.x; b.y = s.visible ? s.y : -999; }
    this.bubbles = this.bubbles.filter((b) => b.until > nowS);
    this.hudT += dt;
    if (this.hudT > 1 / 15) { this.hudT = 0; this.emitHud(); }
  }

  private handleEvents() {
    for (const e of this.sim.drainEvents()) {
      if (e.type === 'contact') {
        this.audio.thud(e.contact.speed);
        const msg = e.contact.kind === 'pedestrian' ? 'Удар во пешак!' : e.contact.kind === 'vehicle' ? 'Судир со возило!' : e.contact.kind === 'curb' ? 'Рабник' : 'Допир';
        this.toast = msg; this.toastUntil = performance.now() / 1000 + 1.6;
      } else if (e.type === 'speech') {
        this.bubbles.push({ id: ++this.bubbleId, text: e.text, wx: e.x, wy: e.y, x: -999, y: -999, until: performance.now() / 1000 + 4.2 });
        this.audio.clink(0.3, 0);
      } else if (e.type === 'finish') {
        if (this.phase === 'drive') this.onRunFinished();
        else if (this.phase === 'retry') this.onRetryFinished();
      }
    }
  }

  private onRunFinished() {
    this.summary = this.sim.summary();
    const s = this.summary;
    const fails = s.scenarios.filter((x) => x.id !== 'x1' && ['fail', 'fail-route', 'fail-signal', 'collision'].includes(x.outcome)).length;
    const hard = s.contacts.some((c) => c.kind === 'vehicle' || c.kind === 'pedestrian');
    this.finalLine = hard ? FINAL_LINES.bump : fails === 0 && s.score >= 80 ? FINAL_LINES.great : fails <= 1 ? FINAL_LINES.good : FINAL_LINES.mixed;
    this.say('Татко', this.finalLine, 6);
    this.audio.chairScrape(0.3, 0.2);
    this.phase = 'outro'; this.phaseT = 0;
    this.view.resetShot();
    emitComplete(s);
    this.emitHud(true);
  }

  private onRetryFinished() {
    this.retrySummary = this.sim.summary();
    this.phase = 'retryDone'; this.phaseT = 0;
    this.audio.chime();
    this.emitHud(true);
  }

  hud(): HudState {
    const p = this.sim.player;
    let hint: HudState['hint'] = null;
    if (this.phase === 'drive') {
      const cp = this.sim.checkpoint;
      const h = [...ROUTE_HINTS].reverse().find((x) => x.afterCheckpoint <= cp);
      if (h) {
        const target = h.turnAt ?? { x: 70, y: -2 };
        const dist = Math.hypot(target.x - p.x, target.y - p.y);
        const angle = angleDiff(Math.atan2(target.y - p.y, target.x - p.x), p.h);
        if (h.arrow === 'compass' || dist < 150 || cp < 0) hint = { text: h.text, arrow: h.arrow, dist: h.arrow === 'compass' ? null : Math.round(dist / 10) * 10, angle };
      }
      if (cp >= CHECKPOINTS.length - 1) {
        const dist = Math.hypot(70 - p.x, -2 - p.y);
        hint = { text: 'Запри кај кафичот', arrow: 'compass', dist: Math.round(dist / 10) * 10, angle: angleDiff(Math.atan2(-2 - p.y, 70 - p.x), p.h) };
      }
    }
    return {
      phase: this.phase,
      speed: kmh(Math.abs(p.v)), gear: p.gear, indicator: p.indicator, blink: (this.blinkT % 0.66) < 0.36, revs: p.revs,
      hint, subtitle: this.subtitle, bubbles: this.bubbles.map((b) => ({ ...b })),
      camMode: this.view.camMode, muted: this.audio.muted, paused: this.paused,
      toast: this.toast, countdown: this.countdown === null ? null : Math.ceil(this.countdown),
      replay: this.replay ? { ...this.replay } : null, retryId: this.retryId,
    };
  }

  private emitHud(_force = false) {
    const h = this.hud();
    for (const l of this.listeners) l(h);
  }
}

export { FATHER_SEAT };

// Game loop and flow: menu ↔ garage → drive → result ↔ replay / retry (same seed or new variation).
// React never owns per-frame physics; it receives a throttled HUD snapshot.
import { createSim, compatibility, encodeChallenge } from './attempt';
import { CONTENT_VERSION, type AttemptConfig, type AttemptResult, type Sim } from './sim/sim';
import { View, type CamMode, type Custom } from './render/view';
import { GameAudio } from './audio/audio';
import { Input, type Command, type Glance } from './input';
import { Autopilot } from './sim/autopilot';
import { vehicleById, type VehicleDef } from './vehicles/defs';
import { load, save, type Save, type GarageChoice } from './store';
import { randomSeed } from './sim/seed';
import { emitComplete } from './host';
import { earnedStamps } from './career';
import { kmh } from './math';
import type { Gear } from './vehicles/vehicle';
import type { EnvId } from './env/types';
import type { Mode, TaskInfo } from './missions/types';
import type { Incident } from './rules/ledger';
import type { PolygonMission } from './missions/polygon';
import type { OpenRoadMission } from './missions/openRoad';

export type Phase = 'menu' | 'garage' | 'drive' | 'result' | 'replay';

export interface Bubble { id: number; text: string; x: number; y: number; wx: number; wy: number; until: number }
export interface Say { text: string; who: string; priority: number; until: number }

export interface HudState {
  phase: Phase;
  speed: number; rpm: number; redline: number; gear: string; engine: string;
  throttle: number; brake: number; clutch: number; bite: [number, number]; parkingBrake: boolean;
  indicator: 'off' | 'left' | 'right'; hazards: boolean; blink: boolean;
  assist: string; mode: Mode; env: EnvId;
  task: TaskInfo | null; say: Say | null; prompt: string | null; toast: { text: string; tone: 'bad' | 'warn' | 'ok' | 'info' } | null;
  bubbles: Bubble[]; camMode: CamMode; muted: boolean; paused: boolean; glance: Glance;
  limit: number; suggestGear: number | null; countdown: number | null;
  replay: ReplayState | null; failed: string | null; finished: boolean;
}

export interface ReplayState { t0: number; t1: number; t: number; cueT: number | null; decisionT: number | null; playing: boolean; atCue: boolean; seenCue: boolean; title: string; detail: string; status: string; focus: string | null; incidents: Incident[]; speed: number; gear: string; brake: number; throttle: number; clutch: number; indicator: number }

export class GameEngine {
  view: View;
  audio = new GameAudio();
  input = new Input();
  sim: Sim | null = null;
  result: AttemptResult | null = null;
  phase: Phase = 'menu';
  paused = false;
  store: Save = load();
  config: AttemptConfig;
  private raf = 0; private last = 0; private acc = 0; private blinkT = 0; private prevBlink = false;
  private sayQueue: Say[] = []; private current: Say | null = null;
  private bubbles: Bubble[] = []; private bubbleId = 0;
  private toast: HudState['toast'] = null; private toastUntil = 0;
  private listeners = new Set<(h: HudState) => void>();
  private hudT = 0;
  private glanceStart: { kind: Glance; t: number } | null = null;
  replay: ReplayState | null = null;
  private countdown: number | null = null;
  private auto: Autopilot | null = null;
  timeScale = 1;
  newStamps: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.view = new View(canvas);
    this.config = { v: CONTENT_VERSION, env: 'polygon', mission: 'polygon', mode: 'lesson', seed: randomSeed(), vehicle: this.store.garage.vehicle, assist: this.store.settings.assist, load: this.store.garage.load };
    this.audio.setMuted(this.store.settings.muted);
    this.view.camMode = this.store.settings.camera;
    this.view.mirrorQuality = this.store.settings.mirrors;
    this.input.attach();
    this.input.onCommand = (c) => this.command(c);
    this.view.setEnvironment('city', { vehicleLength: 3.5 });
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() { cancelAnimationFrame(this.raf); this.input.detach(); this.view.renderer.dispose(); }
  subscribe(fn: (h: HudState) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  persist() { save(this.store); }

  get custom(): Custom { const g = this.store.garage; return { paint: g.paint, finish: g.finish, plate: g.plate, layout: g.layout, trims: g.trims, interior: g.interior, mirrorAdj: g.mirrorAdj }; }
  get def(): VehicleDef { return vehicleById(this.store.garage.vehicle); }

  // ---------------------------------------------------------------- flow
  openGarage() { this.phase = 'garage'; this.view.openGarage(this.def, this.custom); this.emitHud(); }
  setGarage(patch: Partial<GarageChoice>) {
    const g = { ...this.store.garage, ...patch };
    const vehicleChanged = patch.vehicle && patch.vehicle !== this.store.garage.vehicle;
    if (vehicleChanged) { const d = vehicleById(g.vehicle); g.paint = patch.paint ?? d.paint; g.trims = []; if (!d.plates.includes(g.layout)) g.layout = 'long'; g.load = 0; }
    this.store.garage = g; this.persist();
    if (vehicleChanged || patch.trims) this.view.openGarage(this.def, this.custom);
    else this.view.garageCustom(this.custom);
    this.emitHud();
  }
  backToMenu() { this.phase = 'menu'; this.sim = null; this.replay = null; this.input.clear(); this.emitHud(); }

  /** Start an attempt. `same` re-uses the seed (same situation), otherwise a new variation. */
  start(opts: Partial<AttemptConfig> = {}, same = false) {
    this.audio.init();
    const g = this.store.garage;
    const prev = this.config;
    this.config = { ...prev, ...opts, v: CONTENT_VERSION, vehicle: opts.vehicle ?? g.vehicle, load: opts.load ?? g.load, assist: opts.assist ?? this.store.settings.assist, seed: same ? prev.seed : (opts.seed ?? randomSeed()) };
    this.config.mission = this.config.env;
    const why = compatibility(this.config.vehicle, this.config.env);
    if (why) { this.flash(why, 'warn'); return false; }
    const sim = createSim(this.config);
    this.sim = sim; this.result = null; this.replay = null; this.paused = false; this.auto = null;
    const def = vehicleById(this.config.vehicle);
    const debris = this.config.env === 'openRoad' ? (sim.mission as OpenRoadMission).debrisS : undefined;
    this.view.setEnvironment(this.config.env, { vehicleLength: def.dims.L, debrisS: debris });
    const wetRoad = this.config.env === 'openRoad' && (sim.mission as OpenRoadMission).wet;
    this.view.atmo.setTime(this.config.time ?? 'golden');
    this.view.atmo.setWeather(wetRoad ? 'rain' : this.config.weather ?? 'clear');
    this.view.atmo.updateLamps();
    this.view.setPlayer(def, this.custom);
    this.view.resetShot();
    this.input.clear();
    this.input.assist = this.config.assist;
    this.input.parkingBrake = sim.player.parkingBrake > 0.5;
    this.input.clutch = 0;
    this.input.bite = { low: def.clutch.biteLow, high: def.clutch.biteHigh };
    this.sayQueue = []; this.current = null; this.bubbles = [];
    this.countdown = 1.2;
    this.phase = 'drive';
    this.audio.crank();
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.emitHud();
    return true;
  }
  retrySame() { return this.start({}, true); }
  retryNew() { return this.start({}); }

  // ---------------------------------------------------------------- commands
  command(c: Command) {
    if (c.type === 'pause') { if (this.phase === 'drive') { this.paused = !this.paused; this.input.clear(); this.emitHud(); } return; }
    if (c.type === 'mute') { this.toggleMute(); return; }
    if (c.type === 'camera') { this.toggleCamera(); return; }
    const sim = this.sim;
    if (!sim || this.phase !== 'drive' || this.paused) return;
    const p = sim.player;
    let msg: string | null = null;
    switch (c.type) {
      case 'gear': msg = p.requestGear(c.gear); if (msg) this.audio.grind(); break;
      case 'gearUp': case 'gearDown': {
        const order: Gear[] = ['R', 'N', 1, 2, 3, 4, 5];
        const i = order.indexOf(p.gear) + (c.type === 'gearUp' ? 1 : -1);
        if (i >= 0 && i < order.length) { msg = p.requestGear(order[i]); if (msg) this.audio.grind(); }
        break;
      }
      case 'indicator': p.toggleIndicator(c.dir); this.blinkT = 0; break;
      case 'cancelIndicator': p.cancelIndicator(); break;
      case 'hazards': p.hazards = !p.hazards; break;
      case 'parkingBrake': this.input.parkingBrake = !this.input.parkingBrake; this.audio.ratchet(); break;
      case 'engine': msg = p.requestEngine(); break;
      case 'reset': if (sim.config.env === 'polygon') { (sim.mission as PolygonMission).placeAtStart(sim); this.input.parkingBrake = true; } break;
    }
    if (msg) this.flash(msg, 'warn');
    this.emitHud();
  }
  toggleCamera() { this.view.setCamMode(this.view.camMode === 'chase' ? 'driver' : 'chase'); this.store.settings.camera = this.view.camMode; this.persist(); this.emitHud(); }
  toggleMute() { this.audio.setMuted(!this.audio.muted); this.store.settings.muted = this.audio.muted; this.persist(); this.emitHud(); }
  flash(text: string, tone: NonNullable<HudState['toast']>['tone'] = 'info', secs = 2.4) { this.toast = { text, tone }; this.toastUntil = performance.now() / 1000 + secs; }

  // ---------------------------------------------------------------- replay
  startReplay(t0: number, t1: number, info: { title: string; detail: string; status: string; cueT: number | null; decisionT: number | null; focus: string | null }) {
    const sim = this.sim; if (!sim) return;
    const a = Math.max(sim.rec.start, t0), b = Math.min(sim.rec.duration, t1);
    this.replay = { t0: a, t1: b, t: a, cueT: info.cueT, decisionT: info.decisionT, playing: true, atCue: false, seenCue: false, title: info.title, detail: info.detail, status: info.status, focus: info.focus, incidents: sim.ledger.incidents.filter((i) => i.t >= a && i.t <= b), speed: 0, gear: 'N', brake: 0, throttle: 0, clutch: 0, indicator: 0 };
    this.phase = 'replay'; this.view.resetShot(); this.emitHud();
  }
  replayControl(cmd: 'play' | 'pause' | 'restart' | 'continue' | { seek: number }) {
    const r = this.replay; if (!r) return;
    if (cmd === 'play') r.playing = true;
    else if (cmd === 'pause') r.playing = false;
    else if (cmd === 'restart') { r.t = r.t0; r.playing = true; r.atCue = false; r.seenCue = false; this.view.resetShot(); }
    else if (cmd === 'continue') { r.atCue = false; r.seenCue = true; r.playing = true; }
    else { r.t = Math.max(r.t0, Math.min(r.t1, cmd.seek)); r.atCue = false; if (r.cueT !== null) r.seenCue = r.t > r.cueT; this.view.resetShot(); }
    this.emitHud();
  }
  backToResult() { this.phase = 'result'; this.replay = null; this.emitHud(); }

  /** QA hooks */
  setAutopilot(opts: ConstructorParameters<typeof Autopilot>[0] | null) { this.auto = opts && this.sim ? new Autopilot(opts, this.sim.player.pose) : null; }

  // ---------------------------------------------------------------- loop
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    try { this.update(dt); } catch (e) { console.error(e); }
  };

  private update(dt: number) {
    const v = this.view;
    const nowS = performance.now() / 1000;
    if (this.toast && nowS > this.toastUntil) this.toast = null;
    this.blinkT += dt;
    const blink = (this.blinkT % 0.66) < 0.36;
    const sim = this.sim;
    if (this.phase === 'garage') {
      v.garageSpin(dt);
      v.render('garage', false);
    } else if (this.phase === 'menu' || !sim) {
      v.updateCamera(dt, 'title', { x: 60, y: 0, h: 0 }, 0, 0, null);
      v.render('world', false);
    } else if (this.phase === 'drive') {
      const p = sim.player;
      if ((p.indicator !== 'off' || p.hazards) && blink !== this.prevBlink) this.audio.relay(blink);
      this.prevBlink = blink;
      const glance = this.input.glance();
      this.trackGlance(sim, glance);
      if (this.countdown !== null) { this.countdown -= dt; if (this.countdown <= 0) this.countdown = null; }
      if (!this.paused && !sim.finished) {
        this.acc += dt * this.timeScale;
        const maxSteps = 6 * Math.max(1, Math.ceil(this.timeScale));
        let n = 0;
        while (this.acc >= 1 / 60 && n < maxSteps) {
          const ctl = this.input.read(1 / 60);
          const inp = this.auto ? { ...this.auto.input(sim), parkingBrake: false } : ctl;
          if (this.auto) this.input.parkingBrake = false;
          sim.step(1 / 60, inp);
          this.acc -= 1 / 60; n++;
        }
        if (n === maxSteps) this.acc = 0;
        this.handleEvents(sim);
      }
      v.syncLive(sim, dt, blink);
      v.updateCamera(dt, v.camMode, { ...p.pose, z: p.z }, p.vx, p.steer, glance);
      v.render('world', true, { ...p.pose, z: p.z });
      this.audio.update(dt, { revs: p.rpm / p.def.engine.redline, throttle: p.throttle, speed: Math.abs(p.vx), horn: !!p.horn, cafeProximity: 0, cafePan: 0, running: p.engine === 'running' && !this.paused, siren: sim.extraState.siren === 1, diesel: !!p.def.engine.diesel, load: p.engineLoad, slip: !p.locked && p.clutchEff > 0.05 && p.clutchEff < 0.95 && p.gear !== 'N' ? 1 : 0 });
      if (sim.finished && !this.result) this.onFinished(sim);
    } else if (this.phase === 'result') {
      v.updateCamera(dt, 'chase', { ...sim.player.pose, z: sim.player.z }, 0, 0, null);
      v.render('world', false);
      this.audio.update(dt, { revs: 0.1, throttle: 0, speed: 0, horn: false, cafeProximity: 0, cafePan: 0, running: false });
    } else if (this.phase === 'replay' && this.replay) {
      const r = this.replay;
      if (r.playing && !r.atCue) {
        r.t += dt;
        if (r.cueT !== null && !r.seenCue && r.t >= r.cueT) { r.t = r.cueT; r.atCue = true; r.playing = false; this.emitHud(); }
        if (r.t >= r.t1) { r.t = r.t1; r.playing = false; this.emitHud(); }
      }
      const f = sim.rec.at(r.t);
      if (f) {
        v.syncReplay(f, sim, (r.t % 0.66) < 0.36, dt);
        r.speed = kmh(Math.abs(f.p.v)); r.gear = f.p.g ?? 'N'; r.brake = f.p.brk; r.throttle = f.p.thr; r.clutch = f.p.clu ?? 0; r.indicator = f.p.ind;
        const fa = r.focus ? f.a.find((a) => a.id === r.focus) : null;
        const focus = fa ? { x: fa.x, y: fa.y } : null;
        v.updateCamera(dt, 'replay', { ...f.p, z: f.p.z }, f.p.v, f.p.steer, null, { focus: focus ?? undefined });
        v.setHighlight(r.cueT !== null && r.t >= r.cueT - 0.05 ? focus : null, nowS);
      }
      v.render('world', false);
    }
    if (this.phase !== 'replay') v.setHighlight(null, nowS);
    for (const b of this.bubbles) { const s = v.project(b.wx, b.wy, 1.9); b.x = s.x; b.y = s.visible ? s.y : -999; }
    this.bubbles = this.bubbles.filter((b) => b.until > nowS);
    // instructor queue: higher priority interrupts, otherwise each line stays readable
    if (this.current && nowS > this.current.until) this.current = null;
    if (this.sayQueue.length) {
      this.sayQueue.sort((a, b) => b.priority - a.priority);
      const nx = this.sayQueue[0];
      if (!this.current || nx.priority > this.current.priority) { this.current = { ...nx, until: nowS + Math.max(3.2, nx.text.length / 14) }; this.sayQueue.shift(); }
    }
    this.hudT += dt;
    if (this.hudT > 1 / 15) { this.hudT = 0; this.emitHud(); }
  }

  /** Glances count as observation only while the view is actually displayed (proxy, not eye tracking). */
  private trackGlance(sim: Sim, g: Glance) {
    const cur = this.glanceStart;
    if (cur && cur.kind !== g) { if (cur.kind) sim.observe(cur.kind as never, cur.t, sim.t); this.glanceStart = null; }
    if (g && (!this.glanceStart || this.glanceStart.kind !== g)) this.glanceStart = { kind: g, t: sim.t };
  }

  private handleEvents(sim: Sim) {
    for (const e of sim.drainEvents()) {
      if (e.type === 'say') this.sayQueue.push({ text: e.text, who: e.who ?? 'Инструктор', priority: e.priority, until: 0 });
      else if (e.type === 'contact') { this.audio.thud(e.contact.speed); this.view.kick(Math.min(1, e.contact.speed / 6)); }
      else if (e.type === 'incident') {
        const i = e.incident;
        if (i.severity !== 'note' || i.layer === 'mission') this.flash(`${i.text}${i.points ? ` −${i.points}` : ''}`, i.severity === 'note' ? 'ok' : i.severity === 'minor' ? 'warn' : 'bad', 2.8);
        if (i.severity === 'critical' && sim.config.mode !== 'exam' && sim.config.mode !== 'challenge') this.sayQueue.push({ text: `Инструкторот интервенира: ${i.text}`, who: 'Инструктор', priority: 3, until: 0 });
      } else if (e.type === 'speech') this.bubbles.push({ id: ++this.bubbleId, text: e.text, wx: e.x, wy: e.y, x: -999, y: -999, until: performance.now() / 1000 + 4.2 });
      else if (e.type === 'vehicle') {
        if (e.e.type === 'stall') this.audio.stall();
        if (e.e.type === 'engineStart') this.audio.started();
        if (e.e.type === 'crank') this.audio.crank();
      } else if (e.type === 'fail') this.sayQueue.push({ text: `Обидот заврши: ${e.incident.text}`, who: 'Инструктор', priority: 3, until: 0 });
    }
  }

  private onFinished(sim: Sim) {
    const r = sim.result();
    this.result = r;
    this.phase = 'result';
    this.input.clear();
    const before = earnedStamps(this.store.history);
    const skills: Record<string, number> = {};
    for (const i of r.incidents) for (const id of i.ruleIds) skills[id] = (skills[id] ?? 0) + 1;
    this.store.history.push({ at: new Date().toISOString(), env: r.config.env, mode: r.config.mode, seed: r.config.seed, vehicle: r.config.vehicle, assist: r.config.assist, score: r.gameScore, passed: r.exam ? r.exam.passed : null, failed: r.failed?.text ?? null, skills, mission: r.layers.mission, time: r.config.time ?? 'golden', weather: r.config.weather ?? 'clear' });
    const after = earnedStamps(this.store.history);
    this.newStamps = after.filter((id) => !before.includes(id));
    this.persist();
    emitComplete(r);
    this.audio.chime();
    this.emitHud();
  }

  shareCode() { return this.result ? encodeChallenge(this.result.config, this.result.gameScore) : encodeChallenge(this.config); }

  hud(): HudState {
    const s = this.sim;
    const p = s?.player;
    const def = p?.def;
    let suggest: number | null = null;
    if (p && def && this.config.assist === 'learn' && typeof p.gear === 'number' && p.engine === 'running') {
      const rpm = p.rpm;
      if (rpm > def.engine.redline * (def.engine.diesel ? 0.62 : 0.55) && p.gear < 5) suggest = p.gear + 1;
      else if (rpm < def.engine.idle * 1.3 && p.gear > 1 && p.vx > 2) suggest = p.gear - 1;
    }
    const nowS = performance.now() / 1000;
    return {
      phase: this.phase,
      speed: p ? kmh(Math.abs(p.vx)) : 0, rpm: p ? p.rpm : 0, redline: def?.engine.redline ?? 6000, gear: p ? String(p.gear) : 'N', engine: p?.engine ?? 'off',
      throttle: p?.throttle ?? 0, brake: p?.brake ?? 0, clutch: p?.clutchPedal ?? 0, bite: [def?.clutch.biteLow ?? 0.34, def?.clutch.biteHigh ?? 0.66], parkingBrake: (p?.parkingBrake ?? 0) > 0.5,
      indicator: p?.indicator ?? 'off', hazards: !!p?.hazards, blink: (this.blinkT % 0.66) < 0.36,
      assist: this.config.assist, mode: this.config.mode, env: this.config.env,
      task: s ? s.mission.task(s) : null, say: this.current && this.current.until > nowS ? this.current : null,
      prompt: p && this.config.assist !== 'exam' ? p.whyNotMoving() : null, toast: this.toast,
      bubbles: this.bubbles.map((b) => ({ ...b })), camMode: this.view.camMode, muted: this.audio.muted, paused: this.paused, glance: this.input.glance(),
      limit: s && p ? (p.def.family === 'truck' ? Math.min(80, s.world.speedLimitAt(p.x, p.y).kmh) : s.world.speedLimitAt(p.x, p.y).kmh) : 50,
      suggestGear: suggest, countdown: this.countdown === null ? null : Math.ceil(this.countdown),
      replay: this.replay ? { ...this.replay } : null, failed: s?.failed?.text ?? null, finished: !!s?.finished,
    };
  }
  private emitHud() { const h = this.hud(); for (const l of this.listeners) l(h); }
}

// Authoritative vehicle simulation. One state, fixed step, SI units.
// Frame: world x = east, y = north; heading h (rad, 0 = east). Body frame: vx forward, vy left, r yaw rate.
//
// Model (documented simplifications, see README):
// - Engine: torque curve × throttle, idle governor, friction + pumping drag, inertia.
// - Clutch: torque capacity from pedal position through a configurable biting region;
//   locked or slipping, so engine braking, launch, stall and over-revving all emerge from it.
// - Gearbox: 5 forward + reverse, needs the clutch to shift; impossible downshifts are refused.
// - Chassis: dynamic bicycle model with saturating tyres, blended to kinematic at walking pace
//   so a stopped car never rotates on the spot. Slope gravity, rolling and aero resistance.
// - Brakes: service brake with lag, parking brake on the rear, static hold without jitter.
import { clamp, obbCorners, obbSamples, quadsOverlap, angleDiff, type Pose, type Vec2 } from '../math';
import type { VehicleDef } from './defs';
import { PHYSICS, DETECT } from '../sim/params';

export type Gear = 'R' | 'N' | 1 | 2 | 3 | 4 | 5;
export type EngineState = 'off' | 'starting' | 'running' | 'stalled';
export type Assist = 'learn' | 'manual' | 'exam' | 'auto';
export type Indicator = 'off' | 'left' | 'right';

export interface VehicleWorld {
  isDrivable(x: number, y: number): boolean;
  hitStatic(quad: Vec2[]): { id: string; kind: string; soft?: boolean } | null;
  knock?(id: string): void;
  heightAt(x: number, y: number): number;
  gripAt?(x: number, y: number): number;
}

export interface Controls {
  throttle: number; brake: number; steer: number; // steer +1 = left
  clutch: number; // pedal: 0 released … 1 fully pressed
  parkingBrake: boolean;
  horn?: boolean;
}

export type VehicleEventType =
  | 'engineStart' | 'engineStop' | 'stall' | 'startInGear' | 'crank'
  | 'gearChange' | 'gearRefusedClutch' | 'gearRefusedSpeed' | 'reverseRefused'
  | 'jerk' | 'rollback' | 'wheelspin' | 'overRev' | 'clutchRiding' | 'movingWithParkingBrake' | 'contact';

export interface VehicleEvent { t: number; type: VehicleEventType; data?: Record<string, number | string> }

/** speed = closing speed between the two bodies (m/s): player velocity minus the other body's velocity */
export interface Contact { t: number; kind: 'curb' | 'parked' | 'pole' | 'cone' | 'barrier' | 'vehicle' | 'pedestrian' | 'static'; id: string; speed: number }

export interface DynamicBody { id: string; kind: 'vehicle' | 'pedestrian'; quad(): Vec2[]; /** world velocity m/s (optional) */ velocity?(): Vec2 }

const G = PHYSICS.gravityMps2;
const rpmToRad = (rpm: number) => (rpm * Math.PI) / 30;
const radToRpm = (w: number) => (w * 30) / Math.PI;

export class Vehicle {
  def: VehicleDef;
  assist: Assist;
  x: number; y: number; h: number; z = 0;
  vx = 0; vy = 0; r = 0;
  steer = 0; // road-wheel angle
  gear: Gear = 'N';
  engine: EngineState = 'running';
  omegaE: number; // engine speed rad/s
  engineLoad = 0;
  throttle = 0; brake = 0; clutchPedal = 0; clutchEff = 0; parkingBrake = 1; steerInput = 0;
  indicator: Indicator = 'off'; hazards = false; horn = false;
  grade = 0; roll = 0; pitch = 0;
  wheelAngle = 0; // visual wheel spin
  locked = false; // clutch locked
  massExtra = 0;
  events: VehicleEvent[] = [];
  odometer = 0;
  private startTimer = 0;
  private indHeading = 0; private indTurned = 0; private straightTime = 0;
  private lastContact = new Map<string, number>();
  private brakeApplied = 0;
  private prevEngage = 0; private engageHistory: { t: number; e: number }[] = [];
  private stoppedAt: number | null = null; private rollbackDist = 0;
  private ridingTime = 0; private pbMovingTime = 0;
  private autoShiftCooldown = 0;
  t = 0;

  constructor(def: VehicleDef, pose: Pose, assist: Assist = 'manual', opts: { engineRunning?: boolean; parkingBrake?: boolean; gear?: Gear; load?: number } = {}) {
    this.def = def;
    this.assist = assist;
    this.x = pose.x; this.y = pose.y; this.h = pose.h;
    this.massExtra = opts.load ?? 0;
    this.engine = opts.engineRunning === false ? 'off' : 'running';
    this.omegaE = this.engine === 'running' ? rpmToRad(def.engine.idle) : 0;
    this.parkingBrake = opts.parkingBrake === false ? 0 : 1;
    this.gear = opts.gear ?? (assist === 'auto' ? 'N' : 'N');
  }

  get mass() { return this.def.mass + this.massExtra; }
  get pose(): Pose { return { x: this.x, y: this.y, h: this.h }; }
  get v() { return this.vx; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get rpm() { return radToRpm(this.omegaE); }
  get L() { return this.def.dims.L; }
  get W() { return this.def.dims.W; }
  get gearRatio(): number {
    const d = this.def;
    if (this.gear === 'N') return 0;
    if (this.gear === 'R') return -d.reverse * d.finalDrive;
    return d.gears[this.gear - 1] * d.finalDrive;
  }
  /** Engagement 0..1 from pedal position through the biting region. */
  engagement(pedal: number) {
    const { biteHigh, biteLow } = this.def.clutch;
    const u = clamp((biteHigh - pedal) / (biteHigh - biteLow), 0, 1);
    return u * u * (3 - 2 * u);
  }
  inBiteZone(pedal = this.clutchPedal) { return pedal < this.def.clutch.biteHigh && pedal > this.def.clutch.biteLow; }

  quad(pose: Pose = this.pose, inflate = 0): Vec2[] { return obbCorners(pose, this.L + inflate * 2, this.W + inflate * 2); }
  front(): Vec2 { return { x: this.x + Math.cos(this.h) * this.L / 2, y: this.y + Math.sin(this.h) * this.L / 2 }; }
  rear(): Vec2 { return { x: this.x - Math.cos(this.h) * this.L / 2, y: this.y - Math.sin(this.h) * this.L / 2 }; }
  /** Wheel contact points (FL, FR, RL, RR) for line/zone checks. */
  wheels(): Vec2[] {
    const { wheelbase, track } = this.def.dims;
    const c = Math.cos(this.h), s = Math.sin(this.h);
    return [[wheelbase / 2, track / 2], [wheelbase / 2, -track / 2], [-wheelbase / 2, track / 2], [-wheelbase / 2, -track / 2]]
      .map(([lx, ly]) => ({ x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c }));
  }

  emit(type: VehicleEventType, data?: VehicleEvent['data']) { this.events.push({ t: this.t, type, data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  place(p: Pose, v = 0, gear?: Gear) {
    this.x = p.x; this.y = p.y; this.h = p.h; this.vx = v; this.vy = 0; this.r = 0; this.steer = 0;
    if (gear !== undefined) this.gear = gear;
    if (v > 0.5 && this.engine !== 'running') { this.engine = 'running'; }
    if (this.engine === 'running' && this.gear !== 'N' && this.gear !== 'R') this.omegaE = Math.max(rpmToRad(this.def.engine.idle), Math.abs(v) / this.def.dims.wheelR * this.gearRatio);
    if (v > 0.5) this.parkingBrake = 0;
    this.indicator = 'off';
  }

  // ------------------------------------------------------------------ commands
  toggleIndicator(dir: 'left' | 'right') {
    this.indicator = this.indicator === dir ? 'off' : dir;
    this.indHeading = this.h; this.indTurned = 0; this.straightTime = 0;
  }
  cancelIndicator() { this.indicator = 'off'; }

  requestEngine() {
    if (this.engine === 'running') { this.engine = 'off'; this.emit('engineStop'); return 'Моторот е изгасен.'; }
    if (this.engine === 'starting') return null;
    const inGear = this.gear !== 'N';
    const clutchDown = this.clutchPedal > this.def.clutch.biteHigh + 0.1;
    if (inGear && !clutchDown) {
      // Starter turns with the gear engaged: the car lurches and the engine does not catch.
      this.emit('startInGear');
      if (this.assist === 'learn' || this.assist === 'auto') return 'Пред палење: притисни кумплунг (Space) или стави во празен (N).';
      this.vx += (this.gear === 'R' ? -1 : 1) * 0.35;
      return 'Возилото трзна — палење со вклучена брзина.';
    }
    this.engine = 'starting'; this.startTimer = 0.75; this.emit('crank');
    return null;
  }

  requestGear(target: Gear): string | null {
    if (target === this.gear) return null;
    const d = this.def;
    if (this.assist !== 'auto') {
      const clutchOk = this.clutchPedal > d.clutch.biteHigh + 0.12 || this.assist === 'learn';
      if (!clutchOk && target !== 'N') { this.emit('gearRefusedClutch'); return 'Притисни го кумплунгот до крај пред менување (Space).'; }
    }
    if (target === 'R' && this.vx > 0.4) { this.emit('reverseRefused'); return 'Запри целосно пред рикверц.'; }
    if (typeof target === 'number' && this.vx < -0.6) { this.emit('reverseRefused'); return 'Запри пред да вклучиш брзина напред.'; }
    if (typeof target === 'number') {
      const ratio = d.gears[target - 1] * d.finalDrive;
      const rpm = radToRpm(Math.abs(this.vx) / d.dims.wheelR * ratio);
      if (rpm > d.engine.redline + 300) { this.emit('gearRefusedSpeed', { rpm: Math.round(rpm) }); return `Пребрзо за ${target}. брзина (${Math.round(rpm)} вртежи).`; }
    }
    const from = this.gear;
    this.gear = target;
    this.locked = false;
    this.emit('gearChange', { from: String(from), to: String(target) });
    if (this.assist === 'learn' && this.clutchPedal < d.clutch.biteHigh) this.autoClutchHold = 0.35; // gentle auto-clutch for learners
    return null;
  }
  private autoClutchHold = 0;

  // ------------------------------------------------------------------ step
  step(dt: number, c: Controls, world: VehicleWorld, bodies: DynamicBody[], t: number, onContact: (c: Contact) => void) {
    this.t = t;
    const d = this.def;
    const m = this.mass;
    this.throttle = clamp(c.throttle, 0, 1);
    this.brake = clamp(c.brake, 0, 1);
    this.steerInput = clamp(c.steer, -1, 1);
    this.clutchPedal = clamp(c.clutch, 0, 1);
    this.horn = !!c.horn;
    // parking brake lever travel is quick but not instantaneous
    this.parkingBrake = clamp(this.parkingBrake + (c.parkingBrake ? 1 : -1) * dt * 4, 0, 1);

    // ---- automatic accessibility profile: clutch and gears are handled for the driver
    let pedal = this.clutchPedal;
    if (this.assist === 'auto') {
      pedal = this.autoClutch(dt);
      // the automatic never stalls: it opens the clutch near idle
      if (this.rpm < d.engine.idle * 0.92 && this.throttle < 0.3) pedal = 1;
      if (this.engine === 'stalled') { this.engine = 'starting'; this.startTimer = 0.4; }
    }
    if (this.autoClutchHold > 0) { this.autoClutchHold -= dt; pedal = Math.max(pedal, d.clutch.biteLow + (d.clutch.biteHigh - d.clutch.biteLow) * (this.autoClutchHold / 0.35)); }

    // ---- engine start sequence
    if (this.engine === 'starting') {
      this.startTimer -= dt;
      this.omegaE = Math.min(this.omegaE + dt * rpmToRad(900), rpmToRad(d.engine.idle));
      if (this.startTimer <= 0) { this.engine = 'running'; this.omegaE = rpmToRad(d.engine.idle * 1.15); this.emit('engineStart'); }
    }
    const running = this.engine === 'running';
    const rpm = this.rpm;

    // learner anti-stall: slip the clutch a little and add a touch of throttle near stall
    let throttleEff = this.throttle;
    if (this.assist === 'learn' && running && this.gear !== 'N' && rpm < d.engine.idle * 0.92) {
      const k = clamp((d.engine.idle * 0.92 - rpm) / (d.engine.idle * 0.4), 0, 1);
      pedal = Math.max(pedal, d.clutch.biteLow + (d.clutch.biteHigh - d.clutch.biteLow) * (0.25 + 0.6 * k));
      throttleEff = Math.max(throttleEff, 0.12 * k);
    }
    // idle governor
    if (running) {
      const idleCmd = clamp((d.engine.idle - rpm) / 220, 0, d.engine.diesel ? 0.7 : 0.55);
      throttleEff = Math.max(throttleEff, idleCmd);
    } else throttleEff = 0;
    this.clutchEff = this.engagement(pedal);

    // ---- slope
    const hc = world.heightAt(this.x, this.y);
    const fx = Math.cos(this.h), fy = Math.sin(this.h);
    const half = d.dims.wheelbase / 2;
    const hf = world.heightAt(this.x + fx * half, this.y + fy * half);
    const hr = world.heightAt(this.x - fx * half, this.y - fy * half);
    const hl = world.heightAt(this.x - fy * d.dims.track / 2, this.y + fx * d.dims.track / 2);
    const hrt = world.heightAt(this.x + fy * d.dims.track / 2, this.y - fx * d.dims.track / 2);
    this.z = hc;
    this.grade = Math.atan2(hf - hr, d.dims.wheelbase);
    this.roll = Math.atan2(hl - hrt, d.dims.track);
    const mu = d.tyre.mu * (world.gripAt?.(this.x, this.y) ?? 1);

    // ---- engine torque
    const curve = d.engine.curve;
    let tq = 0;
    for (let i = 1; i < curve.length; i++) {
      if (rpm <= curve[i][0] || i === curve.length - 1) {
        const [r0, t0] = curve[i - 1], [r1, t1] = curve[i];
        tq = t0 + (t1 - t0) * clamp((rpm - r0) / (r1 - r0), 0, 1);
        break;
      }
    }
    // rev limiter
    if (rpm > d.engine.redline) throttleEff *= 0.1;
    // progressive throttle body: small pedal movements already give useful torque
    const Te = running ? (1 - (1 - throttleEff) * (1 - throttleEff)) * tq : 0;
    // friction + closed-throttle pumping losses (what makes engine braking work)
    const pumping = d.engine.friction1 * 1.6 * rpm * Math.max(0, 1 - throttleEff * 4);
    const Tf = running || this.engine === 'starting' ? d.engine.friction0 + d.engine.friction1 * rpm + pumping : d.engine.offDrag + d.engine.friction1 * rpm;
    const Tnet = Te - Math.sign(this.omegaE || 1) * Tf * (this.omegaE > 0.5 ? 1 : this.omegaE / 0.5);

    // ---- resistive forces along the body x axis (signed)
    const vx = this.vx;
    // normal force on the road (slope-aware) and the grip budget left after cornering (friction circle)
    const N = m * G * Math.cos(this.grade);
    const gripN = mu * N;
    const longBudget = gripN * Math.sqrt(Math.max(0, 1 - this.latUse * this.latUse));
    const Fgrav = -m * G * Math.sin(this.grade);
    const Froll = -Math.sign(vx) * d.aero.rolling * N * (Math.abs(vx) < PHYSICS.rollingRampSpeedMps ? Math.abs(vx) / PHYSICS.rollingRampSpeedMps : 1);
    const Faero = -Math.sign(vx) * 0.5 * PHYSICS.airDensityKgM3 * d.aero.cdA * vx * vx;
    // brakes (with lag for air brakes): service brake on all wheels, parking brake on the rear axle;
    // the total can never exceed what the tyres can transmit
    this.brakeApplied += (this.brake - this.brakeApplied) * clamp(dt / Math.max(d.brakes.lag, dt), 0, 1);
    const Fservice = this.brakeApplied * d.brakes.decel * m;
    const Fpark = Math.min(this.parkingBrake * d.brakes.parkDecel * m, gripN * (1 - d.frontWeight));
    const Fbrake = Math.min(Fservice + Fpark, longBudget);

    const G_ratio = this.gearRatio;
    const rW = d.dims.wheelR;
    const eff = d.driveEfficiency;
    const Ie = d.engine.inertia;
    const coupled = G_ratio !== 0 && this.clutchEff > 0.001;
    const Tcap = d.clutch.maxTorque * this.clutchEff;
    let Fdrive = 0;
    let newOmega = this.omegaE;
    const Fext = Fgrav + Froll + Faero; // excluding brakes
    let aVeh = 0;

    if (coupled) {
      const omegaD = (vx / rW) * G_ratio;
      // try locked
      const mEff = m + (Ie * G_ratio * G_ratio * eff) / (rW * rW);
      const FengLocked = (Tnet * G_ratio * eff) / rW;
      const aLock = this.applyBrakes(FengLocked + Fext, Fbrake, mEff, dt);
      // torque the clutch must carry to keep engine and wheels locked
      const alphaE = (aLock / rW) * G_ratio;
      const Treq = Tnet - Ie * alphaE;
      const slip = this.omegaE - omegaD;
      const canLock = Math.abs(Treq) <= Tcap && (this.locked || Math.abs(slip) < PHYSICS.clutchLockWindowRadS);
      if (canLock) {
        this.locked = true;
        aVeh = aLock;
        Fdrive = FengLocked;
        newOmega = (vx + aVeh * dt) / rW * G_ratio;
      } else {
        this.locked = false;
        const Tcl = Tcap * Math.tanh(slip / PHYSICS.clutchSlipScaleRadS);
        newOmega = this.omegaE + ((Tnet - Tcl) / Ie) * dt;
        Fdrive = (Tcl * G_ratio * eff) / rW;
        aVeh = this.applyBrakes(Fdrive + Fext, Fbrake, m, dt);
        // detect crossing to synchronous speed → lock next step
        const omegaD2 = ((vx + aVeh * dt) / rW) * G_ratio;
        if (Math.sign(newOmega - omegaD2) !== Math.sign(slip) && Tcap > 1) { this.locked = true; newOmega = omegaD2; }
      }
    } else {
      this.locked = false;
      newOmega = this.omegaE + (Tnet / Ie) * dt;
      aVeh = this.applyBrakes(Fext, Fbrake, m, dt);
    }

    // traction limit on the driven axle
    // (applies at every speed: wet roads limit acceleration at speed too)
    const driveShare = d.drive === 'AWD' ? 1 : d.drive === 'FWD' ? d.frontWeight - (aVeh * d.comHeight) / (G * d.dims.wheelbase) : 1 - d.frontWeight + (aVeh * d.comHeight) / (G * d.dims.wheelbase);
    const Fmax = longBudget * clamp(driveShare, 0.2, 1);
    if (Math.abs(Fdrive) > Fmax * PHYSICS.tractionSlack) {
      if (!this.wheelspinning && Math.abs(vx) < 12) this.emit('wheelspin');
      this.wheelspinning = true;
      const excess = (Math.abs(Fdrive) - Fmax) * Math.sign(Fdrive);
      aVeh -= excess / m;
    } else this.wheelspinning = false;

    newOmega = Math.max(0, newOmega);
    this.omegaE = newOmega;
    this.engineLoad = clamp(Te / Math.max(tq, 1), 0, 1);
    let nvx = vx + aVeh * dt;
    // longitudinal tyre utilisation this step (drive + brake), shared with cornering below
    const Ftyre = m * aVeh - (Fgrav + Froll + Faero);
    this.longUse = gripN > 1 ? clamp(Math.abs(Ftyre) / gripN, 0, 1) : 0;
    this.longDrive = Ftyre * Math.sign(vx || 1) > 0; // driving (only the driven axle is loaded) vs braking (all wheels)
    if (!coupled && Math.abs(vx) < 1e-4 && Math.abs(nvx) < 1e-4) nvx = 0;

    // stall
    if (running && radToRpm(this.omegaE) < d.engine.stall) {
      if (this.assist === 'auto') {
        // an automatic's torque converter never lets the engine die: decouple and hold idle
        this.omegaE = rpmToRad(d.engine.idle); this.locked = false;
      } else {
        this.engine = 'stalled';
        this.emit('stall', { speed: Math.round(nvx * 36) / 10 });
      }
    }
    if (!running && this.engine !== 'starting' && !coupled) this.omegaE = Math.max(0, this.omegaE - dt * rpmToRad(1500));

    // abrupt clutch release while launching
    const e = this.clutchEff;
    this.engageHistory.push({ t, e });
    while (this.engageHistory.length && this.engageHistory[0].t < t - 0.25) this.engageHistory.shift();
    if (e > 0.85 && this.prevEngage < 0.85 && this.engageHistory.length && this.engageHistory[0].e < 0.15 && this.gear !== 'N' && Math.abs(vx) < 3) this.emit('jerk');
    this.prevEngage = e;

    // rollback (moving opposite to the selected direction after a stop)
    const dirSel = this.gear === 'R' ? -1 : this.gear === 'N' ? 0 : 1;
    if (Math.abs(nvx) < 0.05) { this.stoppedAt = t; this.rollbackDist = 0; }
    if (dirSel !== 0 && this.stoppedAt !== null && Math.sign(nvx) === -dirSel && Math.abs(nvx) > 0.05) {
      this.rollbackDist += Math.abs(nvx) * dt;
      if (this.rollbackDist > DETECT.hillRollbackLimitM && !this.rollbackReported) { this.rollbackReported = true; this.emit('rollback', { m: Math.round(this.rollbackDist * 10) / 10 }); }
    } else if (Math.sign(nvx) === dirSel && Math.abs(nvx) > 0.5) { this.rollbackReported = false; this.stoppedAt = null; }

    // riding the clutch / moving with the parking brake
    if (Math.abs(nvx) > DETECT.clutchRidingSpeedMps && this.gear !== 'N' && this.clutchPedal > DETECT.clutchRidingPedal && this.assist !== 'auto') this.ridingTime += dt; else this.ridingTime = 0;
    if (this.ridingTime > DETECT.clutchRidingSeconds) { this.emit('clutchRiding'); this.ridingTime = -30; }
    if (Math.abs(nvx) > DETECT.movingWithParkingBrakeSpeedMps && this.parkingBrake > 0.5) this.pbMovingTime += dt; else this.pbMovingTime = 0;
    if (this.pbMovingTime > DETECT.movingWithParkingBrakeSeconds) { this.emit('movingWithParkingBrake'); this.pbMovingTime = -60; }
    if (radToRpm(this.omegaE) > d.engine.redline + 50 && this.overRevCool <= 0) { this.emit('overRev'); this.overRevCool = 4; }
    this.overRevCool -= dt;

    // ---- steering and lateral dynamics
    const sp = Math.abs(nvx);
    // grip-limited lock (keyboard / touch steering is binary): the steady-state bicycle-model angle at
    // the grip limit, δ = L·a_y/v² + K·a_y with a_y = μ·g and the understeer gradient
    // K = m·(f/C_f − (1−f)/C_r) — all from this vehicle's data and the local grip
    const ayMax = mu * G * Math.cos(this.grade);
    const K = Math.max(0, m * (d.frontWeight / d.tyre.cornerF - (1 - d.frontWeight) / d.tyre.cornerR));
    const gripLock = sp > 0.5 ? (d.dims.wheelbase * ayMax) / (sp * sp) + K * ayMax : d.steer.lock;
    const lockAtSpeed = Math.min(d.steer.lock, gripLock * PHYSICS.steerGripLockMargin);
    const target = this.steerInput * lockAtSpeed;
    const rate = d.steer.rate * dt;
    this.steer += clamp(target - this.steer, -rate, rate);
    const a = d.dims.wheelbase * (1 - d.frontWeight), b = d.dims.wheelbase * d.frontWeight;
    const Iz = m * (d.dims.L * d.dims.L + d.dims.W * d.dims.W) / 12 * 1.1;
    const steps = 2;
    let vy = this.vy, r = this.r, latSum = 0, dvx = 0;
    for (let i = 0; i < steps; i++) {
      const h2 = dt / steps;
      if (sp > 0.5) {
        const sgn = Math.sign(nvx);
        const af = Math.atan2(vy + a * r, sp) - this.steer * sgn;
        const ar = Math.atan2(vy - b * r, sp);
        const FzF = N * d.frontWeight, FzR = N * (1 - d.frontWeight);
        // friction circle per axle: braking loads all wheels; drive loads only the driven axle
        const busy = Math.sqrt(Math.max(0.05, 1 - this.longUse * this.longUse));
        const fF = !this.longDrive || d.drive !== 'RWD' ? busy : 1, fR = !this.longDrive || d.drive !== 'FWD' ? busy : 1;
        const sat = (C: number, al: number, Fz: number, f: number) => { const lim = mu * Fz * f; return -lim * Math.tanh((C * al) / lim); };
        const Fyf = sat(d.tyre.cornerF, af, FzF, fF), Fyr = sat(d.tyre.cornerR, ar, FzR, fR);
        vy += ((Fyf * Math.cos(this.steer) + Fyr) / m - nvx * r) * h2;
        latSum = Math.abs(Fyf * Math.cos(this.steer) + Fyr);
        r += ((a * Fyf * Math.cos(this.steer) - b * Fyr) / Iz) * sgn * h2;
        // body-frame longitudinal coupling: a sliding car scrubs speed (front force drag + vy·r)
        if (sgn > 0) dvx += (vy * r - (Fyf * Math.sin(this.steer)) / m) * h2;
      }
    }
    // kinematic model at low speed (no rotating on the spot; exact low-speed turning circle)
    const rKin = (nvx / d.dims.wheelbase) * Math.tan(this.steer);
    const vyKin = rKin * b * 0; // reference at the rear axle: lateral slip vanishes at walking pace
    const kBlend = clamp((sp - PHYSICS.kinematicBlendFromMps) / (PHYSICS.kinematicBlendToMps - PHYSICS.kinematicBlendFromMps), 0, 1);
    if (nvx > 0) nvx = Math.max(0, nvx + dvx * kBlend);
    this.r = rKin * (1 - kBlend) + r * kBlend;
    this.vy = vyKin * (1 - kBlend) + vy * kBlend;
    // relaxation only where the kinematic model rules: in the dynamic regime the tyre forces already
    // damp sideslip, and an extra decay here acted as free lateral grip beyond μ·g
    this.vy *= Math.exp(-dt * PHYSICS.lateralRelaxationPerS * (1 - kBlend));
    // lateral tyre utilisation (dynamic regime only), shared with braking/drive next step
    this.latUse = gripN > 1 ? clamp((latSum * kBlend) / gripN, 0, 0.98) : 0;

    // ---- integrate pose with collision response
    const nh = this.h + this.r * dt;
    // kinematic reference at the rear axle for low speed, centre otherwise
    const cosH = Math.cos(this.h), sinH = Math.sin(this.h);
    let wx = nvx * cosH - this.vy * sinH, wy = nvx * sinH + this.vy * cosH;
    if (kBlend < 1) {
      // rear-axle kinematics: the centre moves with the rear axle plus rotation
      const beta = Math.atan((b / d.dims.wheelbase) * Math.tan(this.steer));
      const kx = nvx * Math.cos(this.h + beta) / Math.cos(beta), ky = nvx * Math.sin(this.h + beta) / Math.cos(beta);
      wx = kx * (1 - kBlend) + wx * kBlend; wy = ky * (1 - kBlend) + wy * kBlend;
    }
    const nx = this.x + wx * dt, ny = this.y + wy * dt;
    let hit = this.collide({ x: nx, y: ny, h: nh }, world, bodies);
    // soft obstacles (cones, plastic markers) are knocked over and reported, but do not stop the car
    for (let guard = 0; hit && hit.soft && guard < 4; guard++) {
      onContact({ t, kind: hit.kind === 'cone' ? 'cone' : 'static', id: hit.id, speed: Math.abs(nvx) });
      world.knock?.(hit.id);
      hit = this.collide({ x: nx, y: ny, h: nh }, world, bodies);
    }
    // already interpenetrating (hard crash, an NPC driving into us, a respawn)? Any move that reduces
    // the overlap is allowed, so two cars can never fuse into a permanent lock.
    if (hit && !hit.soft && this.collide(this.pose, world, bodies)) {
      const now = this.penetration(this.pose, world, bodies), next = this.penetration({ x: nx, y: ny, h: nh }, world, bodies);
      if (next < now - 1e-4) {
        this.x = nx; this.y = ny; this.h = nh; this.vx = nvx * 0.6; this.vy = 0; this.r *= 0.5;
        hit = null; (this as unknown as { freed: boolean }).freed = true;
      }
    }
    // glancing hits on kerbs and walls: slide along them instead of sticking (contact is still reported)
    let slid = false;
    if (hit && hit.kind !== 'vehicle' && hit.kind !== 'pedestrian') {
      const full = Math.hypot(wx, wy) * dt;
      const cands: Pose[] = [{ x: nx, y: this.y, h: nh }, { x: this.x, y: ny, h: nh }, { x: nx, y: this.y, h: this.h }, { x: this.x, y: ny, h: this.h }];
      let best: Pose | null = null, bestD = 0;
      for (const c of cands) { const dd = Math.hypot(c.x - this.x, c.y - this.y); if (dd > bestD && !this.collide(c, world, bodies)) { best = c; bestD = dd; } }
      if (best && full > 1e-4 && bestD / full > 0.4) {
        const keep = bestD / full;
        const impact = Math.hypot(nvx, this.vy) * Math.sqrt(Math.max(0, 1 - keep * keep));
        const last = this.lastContact.get(hit.id) ?? -99;
        if (t - last > 1.5 && impact > 0.3) onContact({ t, kind: hit.kind as Contact['kind'], id: hit.id, speed: impact });
        this.lastContact.set(hit.id, t);
        this.x = best.x; this.y = best.y; this.h = best.h;
        this.vx = nvx * (0.55 + 0.4 * keep); this.vy *= 0.3; this.r *= 0.4;
        this.odometer += bestD;
        slid = true;
      }
    }
    const freed = (this as unknown as { freed?: boolean }).freed; (this as unknown as { freed?: boolean }).freed = false;
    if (slid || freed) { /* handled above */ } else if (!hit) {
      this.x = nx; this.y = ny; this.h = nh; this.vx = nvx;
      this.odometer += Math.hypot(wx, wy) * dt;
    } else {
      // closing speed: our world velocity minus the other body's (a moving NPC hitting a stopped
      // player is still a collision; two cars touching while moving together are not)
      const cH = Math.cos(this.h), sH = Math.sin(this.h);
      const ov = bodies.find((b) => b.id === hit!.id)?.velocity?.() ?? { x: 0, y: 0 };
      const impact = Math.hypot(nvx * cH - this.vy * sH - ov.x, nvx * sH + this.vy * cH - ov.y);
      const last = this.lastContact.get(hit.id) ?? -99;
      if (t - last > 1.5 && (impact > DETECT.contactReportSpeedMps || hit.kind === 'pedestrian' || hit.kind === 'vehicle' || hit.kind === 'cone')) onContact({ t, kind: hit.kind as Contact['kind'], id: hit.id, speed: impact });
      this.lastContact.set(hit.id, t);
      this.vx = impact > 1.2 ? -nvx * 0.12 : 0;
      this.vy = 0; this.r = 0;
      if (this.locked && Math.abs(this.vx) < 0.1 && this.gear !== 'N' && this.clutchEff > 0.9 && running) { /* stalls naturally next steps */ }
    }
    this.wheelAngle += (this.vx / d.dims.wheelR) * dt;

    // indicator self-cancel after a completed turn
    if (this.indicator !== 'off') {
      const turned = Math.abs(angleDiff(this.h, this.indHeading));
      this.indTurned = Math.max(this.indTurned, turned);
      if (this.indTurned > 0.9 && Math.abs(this.steer) < 0.05) { this.straightTime += dt; if (this.straightTime > 0.35) this.indicator = 'off'; }
      else this.straightTime = 0;
    }
    if (this.assist === 'auto') this.autoGearbox(dt);
  }
  wheelspinning = false;
  /** tyre utilisation 0..1 (friction circle): longitudinal and lateral share one grip budget */
  longUse = 0; latUse = 0; longDrive = false;
  private rollbackReported = false;
  private overRevCool = 0;

  private applyBrakes(Fother: number, Fbrake: number, m: number, dt: number) {
    const vx = this.vx;
    if (Fbrake <= 0) return Fother / m;
    if (Math.abs(vx) < 0.05 && Math.abs(Fother) <= Fbrake) return -vx / dt; // static hold
    const dir = Math.abs(vx) > 0.02 ? Math.sign(vx) : Math.sign(Fother);
    const a = (Fother - dir * Fbrake) / m;
    // do not let braking reverse the motion within one step
    if (Math.abs(vx) > 0 && Math.sign(vx + a * dt) !== Math.sign(vx) && Math.abs(Fother) <= Fbrake) return -vx / dt;
    return a;
  }

  // ---- accessibility automatic: centrifugal clutch + simple shift schedule (clearly labelled)
  private autoClutch(_dt: number) {
    const d = this.def;
    if (this.gear === 'N') return 1;
    const lo = d.clutch.biteLow, hi = d.clutch.biteHigh, range = hi - lo;
    // holding the brake at a stop: decoupled (no creep fighting the brake)
    if (this.brake > 0.2 && Math.abs(this.vx) < 0.5) return 1;
    if (this.throttle < 0.05) {
      // torque-converter creep: rolls at walking pace with no pedals — parking and slow manoeuvres
      if (Math.abs(this.vx) < 1.6) return hi - 0.38 * range;
      // coasting: soft coupling, gentle engine braking instead of a first-gear lurch
      return lo + 0.85 * range;
    }
    const rpm = this.rpm;
    const launch = clamp((rpm - d.engine.idle * 0.95) / 900, 0, 1);
    const pedalFromRpm = d.clutch.biteHigh - launch * (d.clutch.biteHigh - d.clutch.biteLow);
    const crawl = this.brake > 0.2 && Math.abs(this.vx) < 0.5 ? 1 : pedalFromRpm;
    return this.locked && Math.abs(this.vx) > 2 ? 0 : crawl;
  }
  private autoGearbox(dt: number) {
    this.autoShiftCooldown -= dt;
    // an automatic engages drive when the driver asks for throttle from neutral at a standstill
    if (this.gear === 'N' && this.engine === 'running' && this.throttle > 0.08 && this.brake < 0.05 && Math.abs(this.vx) < 0.5) {
      this.gear = 1; this.locked = false; this.autoShiftCooldown = 0.6; this.emit('gearChange', { from: 'N', to: '1' }); return;
    }
    if (this.gear === 'N' || this.gear === 'R' || this.autoShiftCooldown > 0) return;
    const rpm = this.rpm, d = this.def;
    // light throttle shifts early and quietly, full throttle holds the gear longer
    const hiUp = d.engine.diesel ? d.engine.redline * 0.62 : d.engine.redline * 0.55;
    const up = Math.min(hiUp, d.engine.idle * 2.3 + this.throttle * (hiUp - d.engine.idle * 2.3));
    const down = d.engine.idle * 1.3;
    if (rpm > up && this.gear < 5) { this.gear = (this.gear + 1) as Gear; this.autoShiftCooldown = 0.8; this.locked = false; }
    else if (rpm < down && this.gear > 1 && this.vx > 0.5) { this.gear = (this.gear - 1) as Gear; this.autoShiftCooldown = 0.8; this.locked = false; }
    else if (this.vx < 0.3 && this.gear > 1) this.gear = 1;
  }

  /** How badly a pose overlaps the world: off-road sample points + approximate depth into other bodies. */
  penetration(p: Pose, world: VehicleWorld, bodies: DynamicBody[]): number {
    let bad = 0;
    for (const s of obbSamples(p, this.L, this.W)) if (!world.isDrivable(s.x, s.y)) bad += 1;
    const q = obbCorners(p, this.L, this.W);
    const st = world.hitStatic(q); if (st && !st.soft) bad += 1;
    const rSelf = Math.hypot(this.L, this.W) / 2;
    for (const b of bodies) {
      const bq = b.quad();
      const cx = (bq[0].x + bq[2].x) / 2, cy = (bq[0].y + bq[2].y) / 2;
      const rB = Math.hypot(bq[0].x - bq[2].x, bq[0].y - bq[2].y) / 2;
      const dd = Math.hypot(cx - p.x, cy - p.y);
      if (dd < rSelf + rB && quadsOverlap(q, bq)) bad += (rSelf + rB - dd);
    }
    return bad;
  }

  private collide(p: Pose, world: VehicleWorld, bodies: DynamicBody[]): { kind: string; id: string; soft?: boolean } | null {
    for (const s of obbSamples(p, this.L, this.W)) if (!world.isDrivable(s.x, s.y)) return { kind: 'curb', id: 'curb' };
    const q = obbCorners(p, this.L, this.W);
    const st = world.hitStatic(q);
    if (st) return st;
    for (const b of bodies) {
      const bq = b.quad();
      if (Math.hypot(bq[0].x - p.x, bq[0].y - p.y) > this.L + 6) continue;
      if (quadsOverlap(q, bq)) return { kind: b.kind, id: b.id };
    }
    return null;
  }

  /** Short, state-aware reason why throttle is not moving the car (or null). */
  whyNotMoving(): string | null {
    if (this.throttle < 0.2 || Math.abs(this.vx) > 0.3) return null;
    if (this.engine === 'off' || this.engine === 'stalled') return this.engine === 'stalled' ? 'Изгасна моторот — притисни кумплунг и R за палење.' : 'Моторот е изгасен — притисни кумплунг и R.';
    if (this.engine === 'starting') return null;
    if (this.gear === 'N') return 'Избери прва брзина (1) со притиснат кумплунг.';
    if (this.assist !== 'auto' && this.clutchPedal > this.def.clutch.biteHigh) return 'Пушти го кумплунгот полека (пушти Space или држи X).';
    if (this.parkingBrake > 0.5) return 'Рачната е крената — спушти ја (P).';
    if (this.brake > 0.2) return 'Ја држиш сопирачката.';
    return null;
  }
}

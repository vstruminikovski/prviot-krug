// Отворен пат mission: following, optional overtaking, bends and crest, a long descent,
// a narrow bridge, rockfall debris, roadworks under temporary signals, an emergency vehicle,
// and a safe stop at the viewpoint. Variation comes from the ScenarioSeed.
import { Path, angleDiff, clamp, kmh } from '../math';
import { NpcCar } from '../sim/actors';
import type { Sim } from '../sim/sim';
import type { Contact } from '../vehicles/vehicle';
import type { Mission, MissionItem, TaskInfo } from './types';
import { ROAD, ZONES, along, lanePath, nearestS, PULLOFF_POLY } from '../env/openRoad';
import { pointInPoly } from '../env/types';
import { CAR_COLORS, plateFor } from '../content/generate';

class RoadCar extends NpcCar {
  offset = 0; // lateral offset (m, + = left) applied on top of the lane path
  siren = false;
  override get pose() {
    const p = this.path.at(this.s);
    if (!this.offset) return p;
    return { x: p.x - Math.sin(p.h) * this.offset, y: p.y + Math.cos(p.h) * this.offset, h: p.h };
  }
}

interface Goal { id: string; title: string; status: MissionItem['status']; detail: string; t0?: number; t1?: number; focus?: string | null; cue?: number | null }

export class OpenRoadMission implements Mission {
  id = 'open-road';
  title = 'Отворен пат';
  examForm = 'Образец бр. 4' as const;
  done = false;
  debrisS = 2100;
  private fwd!: Path; private back!: Path;
  private tractor: RoadCar | null = null;
  private ambulance: RoadCar | null = null;
  private ambulanceWait = 0;
  private ambulanceAt = 0;
  private oncomingNext = 0;
  private oncomingN = 0;
  works: { lamp: 'green' | 'red'; offset: number; oncomingLamp: 'green' | 'red' } = { lamp: 'green', offset: 0, oncomingLamp: 'red' };
  wet = false;
  goals: Goal[] = [];
  private said = new Set<string>();
  overtaking = false;
  private stillAtView = 0;
  private sMax = 0;

  init(sim: Sim) {
    const r = sim.rng.scenario;
    this.wet = r.chance(0.3);
    this.ambulanceAt = r.chance(0.6) ? r.range(1650, 1850) : -1;
    this.works.offset = r.range(0, 48);
    this.fwd = lanePath(1);
    this.back = lanePath(-1);
    this.goals = [
      { id: 'village', title: 'Излез од населено место (50 km/h)', status: 'pending', detail: '' },
      { id: 'bends', title: 'Кривини и преслап — без престигнување', status: 'pending', detail: '' },
      { id: 'descent', title: 'Долга надолнина со поврзан мотор', status: 'pending', detail: '' },
      { id: 'tractor', title: 'Бавно возило: престигни безбедно или почекај', status: 'pending', detail: '' },
      { id: 'debris', title: 'Одрон на камења — обиколи или почекај', status: 'pending', detail: '' },
      { id: 'works', title: 'Работи на патот — привремени светла', status: 'pending', detail: '' },
      { id: 'stop', title: 'Безбедно запирање на видиковецот', status: 'pending', detail: '' },
    ];
    if (this.ambulanceAt > 0) this.goals.splice(4, 0, { id: 'ambulance', title: 'Возило со сини светла одзади', status: 'pending', detail: '' });
    sim.player.place(sim.env.start, 0, 'N');
    sim.player.parkingBrake = 1;
    sim.extraState.wet = this.wet ? 1 : 0;
    if (this.wet) sim.env.gripAt = () => 0.72;
    sim.say(this.wet ? 'Патот е мокар. Подготви го возилото и тргни кога е безбедно — подолго ќе сопираме.' : 'Подготви го возилото и тргни кога е безбедно. Возиме до видиковецот.', 1);
  }

  private goal(id: string) { return this.goals.find((g) => g.id === id); }
  private set(sim: Sim, id: string, status: MissionItem['status'], detail: string) {
    const g = this.goal(id); if (!g || g.status === 'pass' || g.status === 'fail') return;
    g.status = status; g.detail = detail; g.t1 = sim.t;
  }
  private sayOnce(sim: Sim, key: string, text: string, pr = 1) { if (!this.said.has(key)) { this.said.add(key); sim.say(text, pr); } }

  update(sim: Sim, dt: number) {
    const p = sim.player;
    const n = nearestS(p.x, p.y);
    const s = n.s;
    this.sMax = Math.max(this.sMax, s);
    const lateral = n.side; // + left of centreline
    const onLeft = lateral > 0.25 && Math.abs(angleDiff(p.h, ROAD.at(s).h)) < 1.2;

    // ---- coaching / navigation lines with preparation distance
    if (s > 300) this.sayOnce(sim, 'exit', 'Излегуваме од населеното место. Внимавај на знаците за ограничување.');
    if (s > 470) this.sayOnce(sim, 'bends', 'Кривини и врв на преслап: не престигнувај, држи се десно.');
    if (s > 1000) this.sayOnce(sim, 'descent', 'Долга надолнина. Остави брзина вклучена — моторот помага да кочиш.');
    if (s > 1380) this.sayOnce(sim, 'bridge', 'Мост напред — на мост не се престигнува.');
    if (s > ZONES.rockfallSign - 40) this.sayOnce(sim, 'rock', 'Знак: одронување камења. Намали и биди подготвен да запреш.');
    if (s > ZONES.works[0] - 120) this.sayOnce(sim, 'works', 'Работи на патот и привремен семафор напред.');
    if (s > ZONES.pullOff - 160) this.sayOnce(sim, 'stop', 'Најди безбедно место и запри на видиковецот десно.');

    // ---- goals: village & bends
    if (s > ZONES.settlement[1] && this.goal('village')!.status === 'pending') this.set(sim, 'village', 'pass', 'Излезе од населеното место.');
    if (s > 1040 && this.goal('bends')!.status === 'pending') this.set(sim, 'bends', 'pass', 'Без престигнување низ кривините.');

    // ---- overtaking / bypass evaluation (чл. 50, 54, 56)
    if (onLeft && Math.abs(p.vx) > 2) {
      this.overtaking = true;
      const zone = ZONES.noOvertake.find((z) => s >= z.s[0] && s <= z.s[1]);
      const passingMoving = sim.cars.some((c) => !c.done && c !== this.ambulance && Math.abs(nearestS(c.pose.x, c.pose.y).s - s) < 12 && c.v > 1 && Math.cos(angleDiff(c.pose.h, p.h)) > 0.5);
      if (zone && passingMoving) {
        sim.incident('ot-zone', { layer: 'safety', severity: 'serious', ruleIds: ['law.overtake.place'], text: `Престигнување ${zone.why}.`, exam: ['exam4.2D'] }, 20);
        if (zone.s[0] < 1100) this.set(sim, 'bends', 'fail', `Престигнување ${zone.why}.`);
      }
      // oncoming conflict
      for (const c of sim.cars) {
        if (c.done || Math.cos(angleDiff(c.pose.h, p.h)) > -0.5) continue;
        const d = Math.hypot(c.pose.x - p.x, c.pose.y - p.y);
        const ttc = d / Math.max(1, p.vx + c.v);
        if ((c.hardBrake && d < 60) || ttc < 1.6) sim.incident('ot-conflict', { layer: 'safety', severity: 'critical', ruleIds: ['law.overtake.safe'], text: 'Во спротивната лента со возило што доаѓа — опасна ситуација.', exam: ['exam4.1H'] }, 20);
      }
    } else this.overtaking = false;

    // ---- descent: physical consequence of neutral / clutch-down coasting
    if (s > 1000 && s < 1500 && (p.gear === 'N' || p.clutchPedal > 0.7) && p.vx > 8) this.goal('descent')!.detail = 'Дел од надолнината без поврзан мотор.';
    if (s > 1500 && this.goal('descent')!.status === 'pending') {
      const neutral = this.goal('descent')!.detail;
      this.set(sim, 'descent', neutral ? 'partial' : 'pass', neutral || 'Надолнина со вклучена брзина и контролирана брзина.');
    }

    // ---- tractor ahead on the straight
    if (!this.tractor && s > 1150) {
      this.tractor = new RoadCar('tractor', 'van', '#b5452b', plateFor(sim.rng.scenario), this.fwd, this.fwd.project(along(1600, -1.62)), 7.5, 7.5, true);
      sim.cars.push(this.tractor);
      sim.actorMeta.set('tractor', { kind: 'car', type: 'tractor', color: '#b5452b', plate: '' });
      this.goal('tractor')!.t0 = sim.t;
    }
    if (this.tractor && !this.tractor.done) {
      const ts = nearestS(this.tractor.pose.x, this.tractor.pose.y).s;
      if (ts > 2040) { this.tractor.done = true; }
      if (s > ts + 8 && this.goal('tractor')!.status === 'pending') this.set(sim, 'tractor', 'pass', 'Безбедно престигнување на тракторот.');
    } else if (this.tractor?.done && this.goal('tractor')!.status === 'pending' && s > 2050) this.set(sim, 'tractor', 'pass', 'Почека зад тракторот додека не сврте — исто така точно.');
    if (this.tractor && s > 1500 && s < 1620) this.sayOnce(sim, 'tractor', 'Пред нас е трактор. Престигнувај само ако е безбедно и дозволено — чекањето е исто така добро.');

    // ---- oncoming traffic (seeded gaps)
    if (sim.t > this.oncomingNext && this.oncomingN < 40) {
      const r = sim.rng.traffic;
      const startS = Math.min(ROAD.length - 20, s + 420 + r.range(0, 200));
      if (startS > s + 250) {
        const c = new RoadCar(`onc-${this.oncomingN++}`, r.pick(['stojadin', 'hatch', 'sedan', 'compact', 'van'] as const), r.pick(CAR_COLORS), plateFor(r), this.back, this.back.project(along(startS, 1.62)), 17, r.range(15, 21), true);
        sim.cars.push(c);
        sim.actorMeta.set(c.id, { kind: 'car', type: c.type, color: c.color, plate: c.plate });
      }
      this.oncomingNext = sim.t + r.range(6, 16);
    }
    for (const c of sim.cars as RoadCar[]) {
      if (c.done || c === this.tractor || c === this.ambulance) continue;
      if (Math.hypot(c.pose.x - p.x, c.pose.y - p.y) > 700 && nearestS(c.pose.x, c.pose.y).s < s - 50) c.done = true;
      // oncoming drivers hold at the roadworks while their light is red
      const cs = nearestS(c.pose.x, c.pose.y).s;
      c.holdAtS = this.works.oncomingLamp === 'red' && cs > ZONES.works[1] + 2 && cs < ZONES.works[1] + 60 ? c.path.project(along(ZONES.works[1] + 4, 1.62), c.s) : null;
    }

    // ---- emergency vehicle from behind (чл. 139)
    if (this.ambulanceAt > 0 && !this.ambulance && s > this.ambulanceAt) {
      const s0 = Math.max(10, s - 160);
      this.ambulance = new RoadCar('ambulance', 'van', '#f2f2ee', 'SK 0194-HM', this.fwd, this.fwd.project(along(s0, -1.62)), 24, 24, true);
      this.ambulance.siren = true;
      sim.cars.push(this.ambulance);
      sim.actorMeta.set('ambulance', { kind: 'car', type: 'ambulance', color: '#f2f2ee', plate: 'SK 0194-HM' });
      this.goal('ambulance')!.t0 = sim.t; this.goal('ambulance')!.cue = sim.t;
      sim.say('Слушај — возило со сирена одзади. Направи му простор безбедно.', 3);
    }
    const amb = this.ambulance;
    if (amb && !amb.done) {
      sim.extraState.siren = 1;
      const as = nearestS(amb.pose.x, amb.pose.y).s;
      const gap = s - as;
      // it passes using the opposite lane when the learner has made room
      const room = lateral < -1.9 || Math.abs(p.vx) < 3;
      const oncomingClose = sim.cars.some((c) => !c.done && c !== amb && Math.cos(angleDiff(c.pose.h, p.h)) < -0.5 && Math.abs(nearestS(c.pose.x, c.pose.y).s - as) < 120);
      amb.offset += clamp(((gap > 0 && gap < 40 && room && !oncomingClose ? 3.0 : 0) - amb.offset), -dt * 1.5, dt * 1.5);
      if (gap > 0 && gap < 22 && amb.offset < 1) { this.ambulanceWait += dt; amb.vTarget = Math.max(0, p.vx); } else { amb.vTarget = 24; this.ambulanceWait = Math.max(0, this.ambulanceWait - dt); }
      if (this.ambulanceWait > 6) {
        sim.incident('ambulance', { layer: 'safety', severity: 'serious', ruleIds: ['law.emergency'], text: 'Не му направи простор на возилото со сини светла.', exam: ['exam4.2V'] }, 30);
        this.set(sim, 'ambulance', 'fail', 'Возилото со сирена чекаше зад тебе.');
      }
      if (gap < -15) { this.set(sim, 'ambulance', 'pass', 'Направи простор и го пропушти возилото.'); }
      if (gap < -200) { amb.done = true; sim.extraState.siren = 0; }
    }

    // ---- rockfall debris
    const dS = this.debrisS;
    if (s > dS - 60 && s < dS + 20) this.goal('debris')!.t0 ??= sim.t;
    if (s > dS + 14 && this.goal('debris')!.status === 'pending') this.set(sim, 'debris', 'pass', 'Безбедно обиколување на одронот.');
    if (s > dS - 2 && s < dS + 10 && onLeft) {
      const conflict = sim.cars.some((c) => !c.done && Math.cos(angleDiff(c.pose.h, p.h)) < -0.5 && (c.hardBrake || Math.hypot(c.pose.x - p.x, c.pose.y - p.y) < 14));
      if (conflict) { sim.incident('debris', { layer: 'safety', severity: 'serious', ruleIds: ['law.overtake.safe'], text: 'Обиколувањето на одронот го попречи возилото од спротивно.', exam: ['exam4.2D'] }, 20); this.set(sim, 'debris', 'fail', 'Обиколување пред возило од спротивно.'); }
    }

    // ---- roadworks temporary signals (чл. 60 ст. 1; чл. 43)
    const cycle = (sim.t + this.works.offset) % 48;
    this.works.lamp = cycle < 18 ? 'green' : 'red';
    this.works.oncomingLamp = cycle >= 24 && cycle < 42 ? 'green' : 'red';
    sim.extraState.works = this.works.lamp; sim.extraState.worksOnc = this.works.oncomingLamp;
    const stopS = ZONES.works[0];
    if (s > stopS - 0.5 && s < stopS + 2 && Math.cos(angleDiff(p.h, ROAD.at(s).h)) > 0.5 && !this.said.has('works-cross')) {
      this.said.add('works-cross');
      if (this.works.lamp === 'red') { sim.incident('works-red', { layer: 'safety', severity: 'critical', ruleIds: ['law.signal.lights'], text: 'Помина на црвено на привремениот семафор.', exam: ['exam4.2S'] }, 30); this.set(sim, 'works', 'fail', 'Помина на црвено.'); }
      else this.set(sim, 'works', 'pass', 'Помина на зелено.');
      this.goal('works')!.t0 = sim.t - 8;
    }

    // ---- finish at the viewpoint
    if (pointInPoly(PULLOFF_POLY, p.x, p.y) && Math.abs(p.vx) < 0.2) {
      this.stillAtView += dt;
      if (this.stillAtView > 1.5) {
        this.set(sim, 'stop', p.parkingBrake > 0.5 ? 'pass' : 'partial', p.parkingBrake > 0.5 ? 'Запре на безбедно место и ја крена рачната.' : 'Запре безбедно — следниот пат крени ја и рачната.');
        for (const g of this.goals) if (g.status === 'pending') g.status = 'missed';
        this.done = true;
      }
    } else this.stillAtView = 0;
    sim.extraState.s = Math.round(s);
    void kmh;
  }

  onContact(sim: Sim, c: Contact) {
    if (c.id.startsWith('rock-')) { sim.incident('rock-hit', { layer: 'safety', severity: 'serious', ruleIds: ['law.speed.adapt'], text: 'Удар во камењата на патот.' }, 10); this.set(sim, 'debris', 'fail', 'Удар во одронот.'); }
    if (c.id.startsWith('works-')) this.set(sim, 'works', 'fail', 'Удар во оградата на работите.');
  }

  task(sim: Sim): TaskInfo | null {
    const p = sim.player;
    const s = nearestS(p.x, p.y).s;
    const next = this.goals.find((g) => g.status === 'pending');
    const toView = Math.max(0, ZONES.pullOff - s);
    return { text: next ? next.title : 'Запри на видиковецот', sub: this.wet ? 'Мокар коловоз — подолг пат на сопирање' : undefined, nav: { arrow: toView < 200 ? 'park' : 'straight', dist: Math.round(toView / 10) * 10 }, progress: `${Math.round((s / ZONES.pullOff) * 100)}%` };
  }

  items(): MissionItem[] {
    return this.goals.map((g) => ({ id: g.id, title: g.title, status: g.status, detail: g.detail || '—', t0: g.t0, t1: g.t1, cueT: g.cue ?? g.t0 ?? null, focus: g.id === 'tractor' ? 'tractor' : g.id === 'ambulance' ? 'ambulance' : null }));
  }

  missionScore() {
    const scored = this.goals;
    return (100 * scored.reduce((a, g) => a + (g.status === 'pass' ? 1 : g.status === 'partial' ? 0.6 : 0), 0)) / scored.length;
  }
}

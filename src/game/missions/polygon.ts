// Полигон mission: the five category-B exercises of чл. 33 (Сл. весник 29/2025), scored with the
// official negative points of Образец бр. 1 in exam mode (> 50 = not passed, чл. 36 ст. 2),
// plus two clearly labelled practice extras. Exercises are linked by driving between start boxes.
import { angleDiff, inRect, type Pose, type Vec2 } from '../math';
import type { Sim } from '../sim/sim';
import type { VehicleEvent, Contact } from '../vehicles/vehicle';
import type { Mission, MissionItem, TaskInfo } from './types';
import { EX_HILL, EX_LANE, EX_PARK, EX_REVERSE, EX_UTURN, SLALOM, BAY, parkRect } from '../env/polygon';

type ExId = 'lane' | 'reverse' | 'uturn' | 'park' | 'hill' | 'slalom' | 'bay';

interface Ex {
  id: ExId; title: string; official: boolean; howTo: string;
  start: Pose; status: 'pending' | 'toStart' | 'ready' | 'running' | 'pass' | 'fail' | 'disabled';
  reason?: string; detail: string; pts: number; t0?: number; t1?: number; attempts: number;
  // runtime
  stopT: number; maxGear: number; segments: number; lastDir: number; stoppedOnHill: boolean; pbUsed: boolean; stalls: number; reversed: boolean; flags: Set<string>;
}

const EX_INFO: Record<ExId, { title: string; official: boolean; howTo: string }> = {
  lane: { title: 'Тргнување, прва→втора, запирање пред СТОП', official: true, howTo: 'Кумплунг, прва, спушти рачна, тргни мазно. Во лентата смени во втора, па запри пред СТОП линијата (најмногу 1 m пред неа).' },
  reverse: { title: 'Возење назад по лента и запирање', official: true, howTo: 'Рикверц (6), гледај во огледалата, држи ја средината на лентата и запри пред линијата.' },
  uturn: { title: 'Полукружно свртување (најмногу 3 маневри)', official: true, howTo: 'Сврти во спротивна насока во обележаниот простор, без да газиш линии, со најмногу три маневри.' },
  park: { title: 'Паркирање покрај раб со движење назад', official: true, howTo: 'Помини покрај просторот, па влези со рикверц. Целото возило мора да биде во просторот 2 m × 6/7 m.' },
  hill: { title: 'Запирање и поаѓање на угорнина со рачна', official: true, howTo: 'Запри пред СТОП линијата на угорнината, крени рачна, па тргни без враќање назад.' },
  slalom: { title: 'Слалом меѓу чуновите (вежба)', official: false, howTo: 'Возете во слалом меѓу чуновите без да соборите ниеден.' },
  bay: { title: 'Паркирање со рикверц во бокс (вежба)', official: false, howTo: 'Паркирај со рикверц во средниот бокс меѓу чуновите.' },
};

export class PolygonMission implements Mission {
  id = 'polygon';
  title = 'Полигон';
  examForm = 'Образец бр. 1' as const;
  done = false;
  ex: Ex[] = [];
  cur = 0;
  private L = 3.5;
  private truck = false;

  init(sim: Sim) {
    const v = sim.player;
    this.L = v.L;
    this.truck = v.def.family === 'truck';
    const L = this.L;
    const order: ExId[] = sim.config.mode === 'exam' ? ['lane', 'reverse', 'uturn', 'park', 'hill'] : ['lane', 'reverse', 'uturn', 'park', 'hill', 'slalom', 'bay'];
    const starts: Record<ExId, Pose> = {
      lane: { x: EX_LANE.x0 - L / 2 - 0.4, y: EX_LANE.y, h: 0 },
      reverse: { x: EX_REVERSE.x1 + L / 2 + 0.4, y: EX_REVERSE.y, h: 0 },
      uturn: { x: EX_UTURN.x0 + 1.2 + L / 2, y: EX_UTURN.y0 + EX_UTURN.widthFor(L) * 0.28, h: 0 },
      park: { x: EX_PARK.x0 - 9, y: EX_PARK.laneY, h: 0 },
      hill: { x: EX_HILL.stopX - 22, y: EX_HILL.y, h: 0 },
      slalom: { x: SLALOM.x0 - 12, y: SLALOM.y, h: 0 },
      bay: { x: BAY.x + BAY.w * 2.5, y: BAY.y0 - 7, h: 0 },
    };
    this.ex = order.map((id) => ({ id, ...EX_INFO[id], start: starts[id], status: 'pending', detail: '', pts: 0, attempts: 0, stopT: 0, maxGear: 0, segments: 0, lastDir: 0, stoppedOnHill: false, pbUsed: false, stalls: 0, reversed: false, flags: new Set() }));
    if (this.truck) {
      for (const e of this.ex) if (e.id !== 'lane' && e.id !== 'reverse' && e.id !== 'slalom') { e.status = 'disabled'; e.reason = 'За камион вежбата е на други димензии (чл. 33: лента 3,75 m, страничен пат 5 m, косо паркирање) — не е изградена.'; }
      for (const e of this.ex) if (e.id === 'lane') { e.title = 'Тргнување, втора→трета, запирање (вежба за камион)'; e.official = false; e.howTo = 'Лента 3,5 m (чл. 33 т. 1 за останатите категории): тргни, смени од втора во трета и запри пред линијата. Само вежба.'; }
      for (const e of this.ex) if (e.id === 'reverse') { e.official = false; }
    }
    // start in the first exercise box, engine running, neutral, parking brake applied
    sim.player.place(this.ex[0].start, 0, 'N');
    sim.player.parkingBrake = 1;
    this.ex[0].status = 'ready';
    sim.say(`Вежба 1: ${this.ex[0].howTo}`, 1);
  }

  get active(): Ex | undefined { return this.ex[this.cur]; }

  /** Practice helper: put the car at the start of the current exercise (recorded as assistance). */
  placeAtStart(sim: Sim) {
    const e = this.active; if (!e) return;
    sim.player.place(e.start, 0, 'N');
    sim.player.parkingBrake = 1;
    e.status = 'ready';
    sim.incident('reposition-' + e.id + '-' + e.attempts, { layer: 'mission', severity: 'note', ruleIds: ['game.technical'], text: 'Поставено на почеток (помош).' }, 1);
  }

  private width(e: Ex) { return e.id === 'lane' || e.id === 'reverse' ? (this.truck ? 3.5 : EX_LANE.width) : 0; }

  private examInc(sim: Sim, e: Ex, ruleId: string, text: string, layer: 'safety' | 'technique' = 'technique', once = true) {
    const key = `${e.id}-${ruleId}-${e.attempts}`;
    if (once && e.flags.has(key)) return;
    e.flags.add(key);
    const official = e.official;
    const inc = sim.incident(key, { layer, severity: ruleId.endsWith('E') || ruleId.match(/1\.(1E|2B|4A|4D|4Gj|5B|5Gj|6A|6G)$/) ? 'serious' : 'significant', ruleIds: [ruleId], text, exam: official ? [ruleId] : [] }, 0.5);
    if (inc && official) e.pts += inc.exam?.reduce((a, x) => a + x.points, 0) ?? 0;
    if (sim.config.mode === 'exam' && sim.ledger.examTotal('Образец бр. 1') > 50 && !sim.failed) {
      sim.failed = sim.ledger.incidents[sim.ledger.incidents.length - 1];
      sim.say('Над 50 негативни поени — првиот практичен дел не е положен (чл. 36).', 3);
      this.done = true;
    }
  }

  private finishEx(sim: Sim, e: Ex, ok: boolean, detail: string) {
    e.status = ok ? 'pass' : 'fail';
    e.detail = detail;
    e.t1 = sim.t;
    sim.say(ok ? `Добро. ${detail}` : `${detail}`, 2);
    // next exercise
    do { this.cur++; } while (this.cur < this.ex.length && this.ex[this.cur].status === 'disabled');
    const n = this.active;
    if (!n) { this.done = true; return; }
    n.status = 'toStart';
    sim.say(`Следна вежба: ${n.title}. Возете до означениот почеток.`, 1);
  }

  update(sim: Sim, dt: number) {
    const e = this.active;
    if (!e || this.done) return;
    const p = sim.player;
    if (e.status === 'toStart') {
      const inBox = Math.hypot(p.x - e.start.x, p.y - e.start.y) < 2.2 && Math.abs(angleDiff(p.h, e.start.h)) < 0.35;
      if (inBox && Math.abs(p.vx) < 0.2) { e.status = 'ready'; sim.say(`Вежба: ${e.howTo}`, 1); }
      return;
    }
    if (e.status === 'ready') {
      if (Math.abs(p.vx) > 0.25) { e.status = 'running'; e.t0 = sim.t; e.attempts++; e.maxGear = typeof p.gear === 'number' ? p.gear : 0; }
      return;
    }
    if (e.status !== 'running') return;
    if (typeof p.gear === 'number') e.maxGear = Math.max(e.maxGear, p.gear);
    const stopped = Math.abs(p.vx) < 0.05;
    e.stopT = stopped ? e.stopT + dt : 0;
    const wheels = p.wheels();
    switch (e.id) {
      case 'lane': return this.lane(sim, e, wheels, false);
      case 'reverse': return this.lane(sim, e, wheels, true);
      case 'uturn': return this.uturn(sim, e, wheels);
      case 'park': return this.park(sim, e);
      case 'hill': return this.hill(sim, e);
      case 'slalom': return this.slalom(sim, e);
      case 'bay': return this.bay(sim, e);
    }
  }

  private lane(sim: Sim, e: Ex, wheels: Vec2[], back: boolean) {
    const p = sim.player;
    const lane = back ? EX_REVERSE : EX_LANE;
    const half = this.width(e) / 2;
    const inside = wheels.some((w) => w.x > lane.x0 - 1 && w.x < lane.x1 + 1);
    if (inside && wheels.some((w) => w.x > lane.x0 && w.x < lane.x1 && Math.abs(w.y - lane.y) > half - 0.12)) {
      this.examInc(sim, e, back ? 'exam1.2B' : 'exam1.1E', 'Тркалото ја гази линијата на лентата.', 'safety');
    }
    const front = back ? p.rear().x : p.front().x;
    const line = back ? lane.x0 : lane.x1;
    const beyond = back ? front < line - 0.05 : front > line + 0.05;
    if (beyond) this.examInc(sim, e, back ? 'exam1.2B' : 'exam1.1E', 'Возилото ја премина СТОП линијата.', 'safety');
    const dist = back ? front - line : line - front;
    // unnecessary stop in the middle of the lane
    if (e.stopT > 1.5 && dist > 4 && ((back && front < lane.x1 - 3) || (!back && front > lane.x0 + 3))) this.examInc(sim, e, back ? 'exam1.2A' : 'exam1.1Z', 'Непотребно запирање во лентата.');
    // finished: stopped near the line for a second
    if (e.stopT > 1.0 && dist < 6) {
      if (dist > 1) this.examInc(sim, e, back ? 'exam1.2V' : 'exam1.1Zh', `Запре ${dist.toFixed(1)} m пред линијата (дозволено до 1 m).`);
      const needGear = this.truck ? 3 : 2;
      if (!back && sim.player.assist !== 'auto' && e.maxGear < needGear) this.examInc(sim, e, 'exam1.1Gj', this.truck ? 'Не смени од втора во трета.' : 'Не смени од прва во втора.');
      const ok = e.pts === 0 || !e.official ? !beyond : e.pts < 51;
      this.finishEx(sim, e, ok && !beyond, dist <= 1 && !beyond ? `Запре ${dist.toFixed(2)} m пред линијата.` : `Растојание до линијата: ${dist.toFixed(2)} m.`);
    }
  }

  private uturn(sim: Sim, e: Ex, wheels: Vec2[]) {
    const p = sim.player;
    const w = EX_UTURN.widthFor(this.L);
    const r = { x0: EX_UTURN.x0, y0: EX_UTURN.y0, x1: EX_UTURN.x1, y1: EX_UTURN.y0 + w };
    if (wheels.some((q) => !inRect(r, q.x, q.y, -0.08))) this.examInc(sim, e, 'exam1.4A', 'Тркало на линиите на просторот за полукружно свртување.', 'safety');
    const dir = p.vx > 0.3 ? 1 : p.vx < -0.3 ? -1 : 0;
    if (dir !== 0 && dir !== e.lastDir) { e.segments++; e.lastDir = dir; }
    if (e.segments > 3 && !e.flags.has('seg')) { e.flags.add('seg'); this.examInc(sim, e, 'exam1.4D', 'Повеќе од три маневри.'); }
    if (Math.abs(angleDiff(p.h, Math.PI)) < 0.3 && e.stopT > 0.6 && wheels.every((q) => inRect(r, q.x, q.y))) {
      this.finishEx(sim, e, e.segments <= 3 && !e.flags.has(`uturn-exam1.4A-${e.attempts}`), `Свртено со ${e.segments} маневр${e.segments === 1 ? '' : 'и'}.`);
    }
    if (Math.abs(angleDiff(p.h, Math.PI)) < 0.3 && p.x < EX_UTURN.x0 - 2) this.finishEx(sim, e, e.segments <= 3, `Свртено со ${e.segments} маневри.`);
  }

  private park(sim: Sim, e: Ex) {
    const p = sim.player;
    const r = parkRect(this.L);
    const corners = p.quad();
    if (p.vx < -0.2) e.reversed = true;
    // wheel over the kerb-side line while reversing in
    if (p.wheels().some((q) => q.y < r.y0 + 0.05 && q.x > r.x0 - 1 && q.x < r.x1 + 1)) this.examInc(sim, e, 'exam1.5B', 'Тркало на линијата на паркинг просторот.', 'safety');
    const allIn = corners.every((c) => inRect(r, c.x, c.y));
    if (allIn && e.stopT > 1.5) {
      const ang = Math.min(Math.abs(angleDiff(p.h, 0)), Math.abs(angleDiff(p.h, Math.PI)));
      const off = Math.abs(p.y - (r.y0 + r.y1) / 2);
      if (ang > 0.1 || off > 0.32) this.examInc(sim, e, 'exam1.5V', `Несиметрично паркирање (агол ${Math.round((ang * 180) / Math.PI)}°).`);
      this.finishEx(sim, e, !e.flags.has(`park-exam1.5B-${e.attempts}`), 'Возилото е целосно во паркинг просторот.');
      return;
    }
    // abandoned attempt: drove away forward past the space after reversing
    if (e.reversed && p.x > r.x1 + 7 && p.vx > 0.5) this.cancelPark(sim, e);
    if (e.stopT > 2 && e.reversed && !allIn && corners.some((c) => inRect(r, c.x, c.y)) && sim.t - (e.t0 ?? 0) > 60) this.cancelPark(sim, e);
  }

  /** Player or timeout cancels a parking attempt (Образец 1: 5-А once, 5-Г on the second). */
  cancelPark(sim: Sim, e = this.active!) {
    if (e.id !== 'park') return;
    if (e.attempts <= 1) {
      this.examInc(sim, e, 'exam1.5A', 'Неуспешен обид за паркирање (откажан).');
      e.status = 'ready'; e.reversed = false;
      sim.player.place(e.start, 0, sim.player.gear === 'R' ? 'N' : sim.player.gear);
      sim.say('Втор обид за паркирање.', 2);
    } else this.finishEx(sim, e, false, 'Неуспешно паркирање и по вториот обид.');
  }

  private hill(sim: Sim, e: Ex) {
    const p = sim.player;
    const front = p.front().x;
    const line = EX_HILL.stopX;
    if (!e.stoppedOnHill) {
      if (e.stopT > 0.8 && front > line - 8) {
        e.stoppedOnHill = true;
        const dist = line - front;
        if (dist > 1 || dist < -0.1) this.examInc(sim, e, 'exam1.6D', `Запирање ${dist.toFixed(1)} m од СТОП линијата.`);
        sim.say('Крени рачна. Кога ќе бидеш подготвен — тргни без враќање назад.', 1);
      }
      if (front > line + 3) this.examInc(sim, e, 'exam1.6D', 'Не запре пред СТОП линијата на угорнината.');
      return;
    }
    if (p.parkingBrake > 0.5) e.pbUsed = true;
    if (p.vx > 0.4 && !e.pbUsed) this.examInc(sim, e, 'exam1.6A', 'Тргнување без употреба на рачната.', 'safety');
    if (front > line + 9) this.finishEx(sim, e, !e.flags.has(`hill-exam1.6V-${e.attempts}`) && e.stalls < 2, e.stalls ? `Тргна по ${e.stalls} гаснење.` : 'Мазно поаѓање на угорнина.');
  }

  private slalom(sim: Sim, e: Ex) {
    const p = sim.player;
    if (p.x > SLALOM.x0 + SLALOM.n * SLALOM.gap + 4) this.finishEx(sim, e, !e.flags.has('cone'), e.flags.has('cone') ? 'Соборен чун.' : 'Слалом без соборени чунови.');
  }

  private bay(sim: Sim, e: Ex) {
    const p = sim.player;
    const r = { x0: BAY.x + BAY.w * 2, y0: BAY.y0, x1: BAY.x + BAY.w * 3, y1: BAY.y0 + BAY.d + 0.4 };
    if (p.quad().every((c) => inRect(r, c.x, c.y)) && e.stopT > 1.2) this.finishEx(sim, e, Math.abs(angleDiff(p.h, -Math.PI / 2)) < 0.2 || Math.abs(angleDiff(p.h, Math.PI / 2)) < 0.2, 'Возилото е во боксот.');
  }

  onVehicleEvent(sim: Sim, ev: VehicleEvent) {
    const e = this.active;
    if (!e || e.status !== 'running') {
      if (e && ev.type === 'startInGear') this.examInc(sim, e, 'exam1.1A', 'Палење со вклучен степен на пренос.');
      return;
    }
    const map: Partial<Record<ExId, Partial<Record<VehicleEvent['type'], string>>>> = {
      lane: { stall: 'exam1.1V', jerk: 'exam1.1V', gearRefusedClutch: 'exam1.1D', gearRefusedSpeed: 'exam1.1D', movingWithParkingBrake: 'exam1.1B', startInGear: 'exam1.1A' },
      reverse: { stall: 'exam1.2G', jerk: 'exam1.2G' },
      uturn: { stall: 'exam1.1V', jerk: 'exam1.1V' },
      park: { stall: 'exam1.1V', jerk: 'exam1.1V' },
      hill: { stall: 'exam1.6B', rollback: 'exam1.6V', wheelspin: 'exam1.6Gj' },
    };
    const rid = map[e.id]?.[ev.type];
    // Образец 1 lists stalls/jerks per exercise (4-Б, 5-Д are 10 like 1-В)
    if (rid) {
      if (ev.type === 'stall' && e.id === 'hill') { e.stalls++; if (e.stalls >= 2) this.examInc(sim, e, 'exam1.6B', 'Неуспешно поаѓање и по втор обид.', 'technique', false); }
      this.examInc(sim, e, rid, ev.type === 'stall' ? 'Изгасна моторот.' : ev.type === 'rollback' ? 'Возилото се врати наназад.' : ev.type === 'wheelspin' ? 'Пролизгување на погонските тркала.' : ev.type === 'jerk' ? 'Нагло пуштање на кумплунгот.' : ev.type === 'movingWithParkingBrake' ? 'Возење со затегната рачна.' : 'Неправилно менување на брзините.', 'technique', ev.type !== 'stall');
    }
  }

  onContact(sim: Sim, c: Contact) {
    const e = this.active;
    if (!e || e.status !== 'running') return;
    if (c.kind === 'cone') e.flags.add('cone');
    if (c.id.startsWith('u-')) this.examInc(sim, e, 'exam1.4Gj', 'Удар во граничник.', 'safety');
    if (c.id.startsWith('p-')) this.examInc(sim, e, 'exam1.5B', 'Удар во столбче-граничник.', 'safety');
  }

  task(sim: Sim): TaskInfo | null {
    const e = this.active;
    if (!e) return { text: 'Полигонот е завршен.' };
    const n = this.ex.filter((x) => x.status !== 'disabled').indexOf(e) + 1;
    const total = this.ex.filter((x) => x.status !== 'disabled').length;
    const pts = sim.config.mode === 'exam' ? ` · ${sim.ledger.examTotal('Образец бр. 1')}/50 нег. поени` : '';
    if (e.status === 'toStart') return { text: `Возете до почетокот: ${e.title}`, progress: `${n}/${total}${pts}`, nav: { arrow: 'park', dist: Math.round(Math.hypot(e.start.x - sim.player.x, e.start.y - sim.player.y)) } };
    return { text: `${e.official ? '' : '(вежба) '}${e.title}`, sub: e.status === 'ready' ? e.howTo : undefined, progress: `${n}/${total}${pts}` };
  }

  items(): MissionItem[] {
    return this.ex.map((e) => ({
      id: e.id, title: (e.official ? '' : '(вежба) ') + e.title,
      status: e.status === 'pass' ? 'pass' : e.status === 'fail' ? 'fail' : e.status === 'disabled' ? 'unscored' : 'missed',
      detail: e.status === 'disabled' ? e.reason ?? '' : e.detail || e.howTo, points: e.official ? e.pts : undefined, t0: e.t0, t1: e.t1, cueT: e.t0 ?? null, focus: null,
    }));
  }

  missionScore() {
    const live = this.ex.filter((e) => e.status !== 'disabled');
    return live.length ? (100 * live.filter((e) => e.status === 'pass').length) / live.length : 0;
  }
}

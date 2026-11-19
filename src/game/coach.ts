// Live driving coach: reads the car's state and says the single next thing to do, with the
// exact keys. Rules are ordered by urgency; the first match wins. Never shown in exams.
import type { Vehicle } from './vehicles/vehicle';

export interface CoachTip { id: string; keys: string[]; text: string; tone: 'do' | 'warn' | 'good' }

const tip = (id: string, keys: string[], text: string, tone: CoachTip['tone'] = 'do'): CoachTip => ({ id, keys, text, tone });

export function coachTip(p: Vehicle, touch: boolean): CoachTip | null {
  const d = p.def;
  const v = p.vx, sp = Math.abs(v);
  const gear = p.gear;
  const auto = p.assist === 'auto';
  if (p.assist === 'exam') return null;

  // ---------------- automatic (and every phone)
  if (auto || touch) {
    if (p.engine !== 'running') return null; // restarts itself
    if (p.parkingBrake > 0.5 && p.throttle > 0.05) return null; // releasing itself
    if (gear === 'R') return sp < 0.3 && p.throttle < 0.05
      ? tip('a-r', touch ? ['ГАС'] : ['W'], touch ? 'Рикверц: ГАС вози назад. D — напред.' : 'Рикверц: W вози назад, 1 — назад во D.')
      : null;
    if (gear === 'N' && sp < 0.3) return tip('a-go', touch ? ['ГАС'] : ['W'], touch ? 'Притисни ГАС — менувачот сам вклучува D.' : 'Притисни W — менувачот сам вклучува D. Рикверц: 6.');
    return null;
  }

  // ---------------- manual / learner (keyboard)
  const clutchIn = p.clutchPedal > d.clutch.biteHigh + 0.12; // same threshold the gearbox uses
  const inBite = p.clutchPedal >= d.clutch.biteLow - 0.03 && p.clutchPedal <= d.clutch.biteHigh + 0.12;
  if (p.engine === 'stalled' || p.engine === 'off') {
    if (gear !== 'N' && !clutchIn) return tip('m-start-n', ['Space', 'N'], 'Изгасна. Кумплунг или празен од, па пали.', 'warn');
    return tip('m-start', ['Space', 'R'], 'Држи кумплунг и пали со R.', 'warn');
  }
  if (p.engine === 'starting') return null;
  if (sp > 1 && p.parkingBrake > 0.5) return tip('m-pb-moving', ['P'], 'Рачната е крената — спушти ја!', 'warn');

  // stopping: clutch in before the engine drops below idle
  if (typeof gear === 'number' && sp > 0.2 && v > 0 && p.brake > 0.2 && !clutchIn && p.rpm < d.engine.idle * 1.6)
    return tip('m-stop', ['Space'], 'Застануваш — притисни кумплунг, инаку ќе изгасне.', 'warn');

  // revs collapsing while the clutch bites: rescue before the stall
  if (typeof gear === 'number' && sp < 4 && p.clutchPedal > d.clutch.biteLow - 0.12 && !clutchIn && p.rpm < d.engine.idle * 0.97)
    return tip('m-bog', ['Z', 'W'], 'Моторот паѓа — притисни малку кумплунг (Z) и додај гас.', 'warn');
  if (sp < 0.3) {
    if (gear === 'N') return clutchIn ? tip('m-g1', ['1'], 'Вклучи прва брзина.') : tip('m-clutch', ['Space'], 'Држи го кумплунгот до крај за брзина.');
    if (gear === 'R' && clutchIn && p.parkingBrake > 0.5) return tip('m-pb-r', ['P'], 'Спушти ја рачната.');
    if (clutchIn && p.parkingBrake > 0.5) return tip('m-pb', ['P'], 'Спушти ја рачната.');
    if (clutchIn) return tip('m-launch', ['W', 'Space ↑'], 'Малку гас и полека пушти го кумплунгот.');
    if (inBite) return p.throttle < 0.1 ? tip('m-gas', ['W'], 'Додај малку гас додека кумплунгот зафаќа.') : tip('m-ease', ['W', 'Space ↑'], 'Држи го гасот и полека пушти го кумплунгот.', 'good');
    return null;
  }

  // pulling away: keep easing the clutch out
  if (typeof gear === 'number' && sp < 3 && inBite) return tip('m-ease', ['W', 'Space ↑'], 'Добро — пушти го кумплунгот до крај.', 'good');

  // shifting up / down
  // shifting: judged on the revs this gear has at this road speed (stable while the clutch moves)
  const rpmAt = (g: number) => (sp / d.dims.wheelR) * d.gears[g - 1] * d.finalDrive * 60 / (2 * Math.PI);
  if (typeof gear === 'number' && !clutchIn && sp > 3) {
    const upAt = d.engine.redline * (d.engine.diesel ? 0.6 : 0.52);
    if (rpmAt(gear) > upAt && gear < 5) return tip('m-up', ['Space', String(gear + 1)], `Префрли во ${gear + 1}. брзина.`);
    if (rpmAt(gear) < d.engine.idle * 1.25 && gear > 1) return tip('m-down', ['Space', String(gear - 1)], `Моторот се дави — намали во ${gear - 1}.`, 'warn');
  }
  if (clutchIn && sp > 3) {
    // suggest the highest gear that keeps the engine comfortably above idle at this speed
    let best = 1;
    for (let g = 1; g <= 5; g++) if (rpmAt(g) > d.engine.idle * 1.7) best = g;
    if (gear === best) return tip('m-release', ['Space ↑', 'W'], 'Брзината е вклучена — пушти го кумплунгот и додај гас.', 'good');
    return tip('m-shift', ['Space', String(best)], `Кумплунгот е долу — ${best}. брзина.`);
  }
  return null;
}

import type { Sim } from '../sim/sim';
import type { Mission, TaskInfo } from './types';

/** Free drive: shared rules monitor (speed, technique, contacts) but no authored scenarios. */
export class FreeMission implements Mission {
  id = 'free'; title = 'Слободно возење'; done = false;
  init(sim: Sim) { sim.say('Слободно возење по вистинските улици. Внимавај: знаците и првенствата од стварноста не се моделирани тука.', 1); }
  update() {}
  task(sim: Sim): TaskInfo { return { text: 'Слободно возење — вистинско Дебар Маало (OSM)', sub: 'Без бодувани ситуации', progress: `${(sim.player.odometer / 1000).toFixed(1)} km` }; }
  items() { return []; }
  missionScore(sim: Sim) { return Math.min(100, sim.player.odometer / 20); }
}

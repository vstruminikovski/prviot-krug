import type { Sim } from '../sim/sim';
import type { Contact, VehicleEvent } from '../vehicles/vehicle';

export type Mode = 'lesson' | 'practice' | 'challenge' | 'exam' | 'free';
export const MODE_LABEL: Record<Mode, string> = {
  lesson: 'Часови', practice: 'Часови', challenge: 'Часови', exam: 'Полагање', free: 'Часови',
};

export interface NavHint { arrow: 'left' | 'right' | 'straight' | 'uturn' | 'stop' | 'park' | 'reverse'; dist: number | null }
export interface TaskInfo { text: string; sub?: string; nav?: NavHint; progress?: string }

export interface MissionItem { id: string; title: string; status: 'pass' | 'fail' | 'partial' | 'missed' | 'pending' | 'unscored'; detail: string; points?: number; max?: number; t0?: number; t1?: number; cueT?: number | null; focus?: string | null }

export interface Mission {
  id: string;
  title: string;
  /** which sheet the strict exam variant uses, if any */
  examForm?: 'Образец бр. 1' | 'Образец бр. 4';
  init(sim: Sim): void;
  update(sim: Sim, dt: number): void;
  onContact?(sim: Sim, c: Contact): void;
  onVehicleEvent?(sim: Sim, e: VehicleEvent): void;
  task(sim: Sim): TaskInfo | null;
  items(sim: Sim): MissionItem[];
  /** mission layer score 0..100 */
  missionScore(sim: Sim): number;
  done: boolean;
}

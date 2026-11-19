// Career: a driving-school booklet with stamps earned from actual attempt results.
// The final stamp is an *in-game* licence — never presented as an official document.
import type { AttemptRecord } from './store';
import type { EnvId } from './env/types';
import type { Mode } from './missions/types';
import type { Assist } from './vehicles/vehicle';
import type { TimeOfDay } from './render/atmosphere';

export interface Stamp { id: string; title: string; how: string; earned: (h: AttemptRecord[]) => boolean }

const done = (h: AttemptRecord[], f: (r: AttemptRecord) => boolean) => h.some((r) => !r.failed && f(r));

export const STAMPS: Stamp[] = [
  { id: 'first', title: 'Прво тргнување', how: 'Заврши кој било обид без критична грешка.', earned: (h) => done(h, () => true) },
  { id: 'polygon', title: 'Полигон — вежби', how: 'Заврши ги вежбите на полигонот со ≥ 60 % од мисијата.', earned: (h) => done(h, (r) => r.env === 'polygon' && (r.mission ?? 0) >= 60) },
  { id: 'polygonExam', title: 'Прв практичен дел', how: 'Испитен предизвик на полигон: ≤ 50 негативни поени (Образец бр. 1).', earned: (h) => done(h, (r) => r.env === 'polygon' && r.mode === 'exam' && r.passed === true) },
  { id: 'city', title: 'Градско возење', how: 'Заврши го кругот низ маалото со ≥ 75 % од мисијата.', earned: (h) => done(h, (r) => r.env === 'city' && (r.mission ?? 0) >= 75) },
  { id: 'openRoad', title: 'Отворен пат', how: 'Стигни до видиковецот со ≥ 70 % од мисијата.', earned: (h) => done(h, (r) => r.env === 'openRoad' && (r.mission ?? 0) >= 70) },
  { id: 'hard', title: 'Тешки услови', how: 'Заврши возење ноќе, во самрак, на дожд или во магла.', earned: (h) => done(h, (r) => (r.time === 'night' || r.time === 'dusk' || (r.weather ?? 'clear') !== 'clear')) },
  { id: 'manual', title: 'Без помош', how: 'Заврши кој било предел во мануелен или испитен профил со ≥ 70 поени.', earned: (h) => done(h, (r) => (r.assist === 'manual' || r.assist === 'exam') && r.score >= 70) },
  { id: 'cityExam', title: 'Втор практичен дел', how: 'Испитен предизвик во градско: ≤ 50 негативни поени (Образец бр. 4).', earned: (h) => done(h, (r) => r.env === 'city' && r.mode === 'exam' && r.passed === true) },
];

/** What to set up in the menu to go for each stamp. */
export const STAMP_SETUP: Record<string, { env: EnvId; mode: Mode; assist?: Assist; time?: TimeOfDay }> = {
  first: { env: 'polygon', mode: 'lesson' },
  polygon: { env: 'polygon', mode: 'lesson' },
  polygonExam: { env: 'polygon', mode: 'exam' },
  city: { env: 'city', mode: 'lesson' },
  openRoad: { env: 'openRoad', mode: 'lesson' },
  hard: { env: 'city', mode: 'practice', time: 'night' },
  manual: { env: 'polygon', mode: 'practice', assist: 'manual' },
  cityExam: { env: 'city', mode: 'exam' },
};
/** First stamp still missing, in booklet order. */
export function nextStamp(h: AttemptRecord[], touch = false): Stamp | null { const got = earnedStamps(h); return STAMPS.find((s) => !got.includes(s.id) && !(touch && s.id === 'manual')) ?? null; }

export function earnedStamps(h: AttemptRecord[]) { return STAMPS.filter((s) => s.earned(h)).map((s) => s.id); }
export function licenceEarned(h: AttemptRecord[]) { return earnedStamps(h).length === STAMPS.length; }

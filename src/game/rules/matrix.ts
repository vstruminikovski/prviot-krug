// Mistake matrix: how each detectable mistake is treated in the four mode × place cells.
// It does NOT define rules — it classifies incidents the simulation already raises, using the
// rule registry (law / official exam sheets / technique / game). Three things stay distinct:
//   law     → traffic-law basis (ЗБСП article, registry `trafficLaw`)
//   exam    → official evaluation items with their negative points (Образец бр. 1 / бр. 4)
//   game    → extra game-design penalties (registry `gameBalance` / `instructorTechnique`)
// Exam treatment follows the official points only: an item worth more than the pass threshold
// on its own ends the attempt ("critical"); everything else accumulates. Where the repo has no
// verified basis, the entry is marked `needsInstructorReview` and every value is configurable.
import { ruleById, SRC } from './registry';
import type { Severity } from './ledger';
import type { Mode } from '../missions/types';
import type { EnvId } from '../env/types';
import { DETECT, PARAM_INFO } from '../sim/params';

export type Action =
  | 'none' // not applicable / not detected in this place
  | 'note' // coaching note, lesson continues
  | 'warn' // instructor warning with explanation, lesson continues
  | 'intervene' // instructor intervenes (safety), lesson continues after correction
  | 'exerciseFail' // the current exercise fails; repeat offered (Часови)
  | 'retry' // safety-critical: stop, explain, offer to repeat the situation (Часови)
  | 'examMinor' // official item, negative points accumulate (Полагање)
  | 'examCritical' // official item worth more than the threshold on its own: attempt not passed
  | 'gameOnly'; // recorded, never affects the official exam score

export interface Cell { action: Action; exam?: string[] }
export interface Mistake {
  id: string;
  title: string;
  did: string; // what the player did
  detect: string; // how the game detects it (honest caveats)
  detected: boolean;
  match: { keys?: RegExp; rules?: string[] };
  law: string[];
  game: string[];
  lesson: { polygon: Cell; city: Cell };
  exam: { polygon: Cell; city: Cell };
  status: 'confirmed' | 'needsInstructorReview';
  why: string; // reason for the classification
  say?: string; // instructor explanation in Часови
  /** named thresholds used by the detection (see sim/params.ts) and the false-positive caveat */
  params?: (keyof typeof DETECT)[];
  caveat?: string;
}

/** Tuning lives here — never in mission code. */
export const MATRIX_CONFIG = {
  /** > threshold negative points = not passed — Правилник 29/2025 чл. 36 ст. 2, each practical part separately */
  get examThreshold() { return DETECT.examPointLimit; },
  examThresholdStatus: { polygon: 'confirmed', city: 'confirmed' } as Record<'polygon' | 'city', Mistake['status']>,
  /** whether a single above-threshold item ends the drive immediately — not prescribed (чл. 35 ст. 2 only allows a shorter part 2): needs verification */
  get examEndOnCritical() { return DETECT.examStopsImmediatelyOnCriticalItem; },
  lessonSeverity: { none: 'note', note: 'note', warn: 'minor', intervene: 'serious', exerciseFail: 'serious', retry: 'critical', gameOnly: 'minor', examMinor: 'minor', examCritical: 'critical' } as Record<Action, Severity>,
  /** lesson actions that stop and offer a repeat */
  lessonRetry: ['retry', 'exerciseFail'] as Action[],
  /** seconds rewound when a city situation is repeated */
  cityRetryRewind: 8,
};

export const ACTION_LABEL: Record<Action, string> = {
  none: '—', note: 'Совет', warn: 'Предупредување', intervene: 'Интервенција', exerciseFail: 'Неуспешна вежба · повтори', retry: 'Стоп · повтори',
  examMinor: 'Негативни поени', examCritical: 'Над прагот — не положено', gameOnly: 'Само игра (не влијае на испитот)',
};

const C = (action: Action, exam?: string[]): Cell => ({ action, exam });
const NA = C('none');

export const MISTAKES: Mistake[] = [
  // ------------------------------------------------ safety-critical
  { id: 'collision.vehicle', title: 'Судир со возило', did: 'Удри во друго возило со брзина на приближување над прагот collisionRelativeSpeedMps.', detect: 'Контакт на каросеријата со возило во движење или паркирано НПЦ возило.', detected: true,
    match: { keys: /^collision-veh-/ }, law: ['law.speed.adapt'], game: [],
    lesson: { polygon: NA, city: C('retry') }, exam: { polygon: NA, city: C('examCritical', ['exam4.1H']) },
    status: 'needsInstructorReview', why: 'Образец бр. 4, 1-Х „создавање непосредно опасна ситуација“ (51). Поените се од листот; дека секој судир над прагот на брзина е 1-Х е толкување — за проверка.',
    say: 'Судир. Застануваме — ќе ја повториме ситуацијата. Брзината мора да овозможи запирање пред секоја предвидлива пречка (чл. 33).' },
  { id: 'touch.vehicle', title: 'Лесен допир со возило', did: 'Допре друго возило со мала брзина на приближување (на пр. при паркирање).', detect: 'Контакт со возило под прагот на судир.', detected: true,
    match: { keys: /^touch-veh-/ }, law: [], game: ['game.contact'],
    lesson: { polygon: NA, city: C('warn') }, exam: { polygon: NA, city: C('gameOnly') },
    status: 'needsInstructorReview', why: 'Нема посебна ставка во Образец бр. 4 за лесен допир; дали испитувачот би го бодувал како 1-Х е за проверка. Засега не влијае на испитот.',
    say: 'Допре возило. Полека — гледај ги аглите во огледалата.' },
  { id: 'collision.ped', title: 'Удар во пешак', did: 'Контакт со пешак.', detect: 'Контакт на каросеријата со пешак.', detected: true,
    match: { keys: /^contact-ped-/ }, law: ['law.ped.attention', 'law.speed.adapt'], game: [],
    lesson: { polygon: NA, city: C('retry') }, exam: { polygon: NA, city: C('examCritical', ['exam4.1H']) },
    status: 'needsInstructorReview', why: 'Образец бр. 4, 1-Х (51); чл. 19 — внимание кон пешаците. Пресликувањето контакт → 1-Х е толкување.',
    say: 'Стоп! Пешак. Ова е најтешката грешка — ја повторуваме ситуацијата со помала брзина.' },
  { id: 'object.hit', title: 'Удар во објект', did: 'Удри во столб, граничник или паркиран предмет.', detect: 'Контакт со статичен објект (не рабник, не конус).', detected: true,
    match: { keys: /^obj-/ }, law: [], game: ['game.contact'],
    lesson: { polygon: C('exerciseFail'), city: C('retry') }, exam: { polygon: C('gameOnly'), city: C('examCritical', ['exam4.1H']) },
    status: 'needsInstructorReview', why: 'Полигон: удар во граничник се бодува преку ставката на вежбата (4-Ѓ, 5-Б). Градска: 1-Х е толкување — за проверка.',
    say: 'Удар во објект — вежбата не успеа. Ајде повторно, полека и со погледи.' },
  { id: 'red.light', title: 'Црвено светло', did: 'Ја помина стоп-линијата на црвено.', detect: 'Преминување на стоп-линијата по почеток на црвено.', detected: true,
    match: { keys: /^red$/ }, law: ['law.signal.lights'], game: [],
    lesson: { polygon: NA, city: C('retry') }, exam: { polygon: NA, city: C('examCritical', ['exam4.2S']) },
    status: 'confirmed', why: 'чл. 43 ст. 1; Образец бр. 4, 2-S (51).',
    say: 'Црвено значи забрана — секогаш. Се враќаме пред семафорот.' },
  { id: 'priority.right', title: 'Првенство од десно', did: 'Влезе во крстосница пред возилото од десно.', detect: 'Возило од десно ≤ 3 с од крстосницата при влез (сценарио s1).', detected: true,
    match: { rules: ['law.priority.right'] }, law: ['law.priority.right'], game: [],
    lesson: { polygon: NA, city: C('retry') }, exam: { polygon: NA, city: C('examCritical', ['exam4.2B']) },
    status: 'confirmed', why: 'чл. 41 ст. 1; Образец бр. 4, 2-Б (51).',
    say: 'На крстосница без знаци го пропушташ возилото од десно. Ја повторуваме крстосницата.' },
  { id: 'priority.left', title: 'Свртување налево без пропуштање', did: 'Сврте налево пред возилото од спротивно.', detect: 'Конфликт во крстосница со возило од спротивна насока.', detected: true,
    match: { rules: ['law.priority.left'] }, law: ['law.priority.left'], game: [],
    lesson: { polygon: NA, city: C('retry') }, exam: { polygon: NA, city: C('examCritical', ['exam4.2B']) },
    status: 'confirmed', why: 'чл. 41 ст. 2; Образец бр. 4, 2-Б (51).',
    say: 'При свртување налево ги пропушташ возилата од спротивно. Повторно.' },
  { id: 'meeting.obstacle', title: 'Разминување кај пречка', did: 'Влезе во тесниот дел пред спротивното возило.', detect: 'Сценарио s2: спротивното возило би стигнало прво.', detected: true,
    match: { rules: ['law.meeting.obstacle'] }, law: ['law.meeting.obstacle'], game: [],
    lesson: { polygon: NA, city: C('retry') }, exam: { polygon: NA, city: C('examCritical', ['exam4.2T']) },
    status: 'confirmed', why: 'чл. 48 ст. 2; Образец бр. 4, 2-Т (51).',
    say: 'Пречката е на нашата страна — ние чекаме. Ајде повторно.' },
  { id: 'ped.yield', title: 'Непропуштање пешак', did: 'Помина преку пешачки додека пешак стапува или е на преминот.', detect: 'Пешак во твојата лента или стапува при минување (s3, зебри).', detected: true,
    match: { rules: ['law.ped.crossing'] }, law: ['law.ped.crossing'], game: [],
    lesson: { polygon: NA, city: C('retry') }, exam: { polygon: NA, city: C('examMinor', ['exam4.2Gj']) },
    status: 'confirmed', why: 'чл. 122 ст. 3; Образец бр. 4, 2-Ѓ (30) — официјално не е над прагот сам по себе.',
    say: 'Пешакот што стапува на премин има предност. Ја повторуваме ситуацијата.' },
  { id: 'wrong.way', title: 'Еднонасочна / забрана', did: 'Влезе спротивно во еднонасочна улица.', detect: 'Влез во забранета насока (сценарио s4).', detected: true,
    match: { keys: /^scn-s4-route/, rules: ['law.signs'] }, law: ['law.signs'], game: [],
    lesson: { polygon: NA, city: C('intervene') }, exam: { polygon: NA, city: C('examCritical', ['exam4.2O']) },
    status: 'confirmed', why: 'чл. 17 ст. 1; Образец бр. 4, 2-О (51).',
    say: 'Знакот забранува влез. Запри и врати се безбедно — ќе најдеме друг пат.' },
  { id: 'emergency', title: 'Возило со предност', did: 'Не направи простор на возило со сини светла.', detect: 'Возилото зад тебе предолго без простор (отворен пат).', detected: true,
    match: { rules: ['law.emergency'] }, law: ['law.emergency'], game: [],
    lesson: { polygon: NA, city: C('intervene') }, exam: { polygon: NA, city: C('examCritical', ['exam4.2V']) },
    status: 'confirmed', why: 'чл. 139 ст. 1; Образец бр. 4, 2-В (51).',
    say: 'Сини светла и сирена — тргни десно и забави, пропушти го.' },
  // ------------------------------------------------ road rules
  { id: 'signal.turn', title: 'Покажувач', did: 'Сврте или се престрои без навремен покажувач.', detect: 'Покажувач вклучен < 1,5 с пред почетокот на свртувањето.', detected: true,
    match: { keys: /^corner-|^scn-s4-signal/, rules: ['law.signalling'] }, law: ['law.signalling'], game: [],
    lesson: { polygon: NA, city: C('warn') }, exam: { polygon: NA, city: C('examMinor', ['exam4.2K']) },
    status: 'confirmed', why: 'чл. 25 ст. 2–3; Образец бр. 4, 2-К „непрописно свртување“ (20).',
    say: 'Покажувач — пред секое свртување, навреме. Продолжуваме, следниот пат пред да свртиш.' },
  { id: 'speed', title: 'Пребрзо', did: 'Возеше над ограничувањето подолго од 1 с.', detect: 'Брзина > ограничување + 1 km/h подолго од 1 с.', detected: true,
    match: { keys: /^speed$/, rules: ['law.speed.settlement', 'law.speed.outside', 'law.speed.truck'] }, law: ['law.speed.settlement', 'law.speed.outside', 'law.speed.truck'], game: [],
    lesson: { polygon: NA, city: C('warn') }, exam: { polygon: NA, city: C('examMinor', ['exam4.2R']) },
    status: 'confirmed', why: 'чл. 35–38; Образец бр. 4, 2-Р (30).',
    say: 'Погледни го ограничувањето и намали. Во маало: најмногу 50.' },
  { id: 'yellow', title: 'Жолто светло', did: 'Влезе на жолто кога можеше безбедно да запре.', detect: 'Растојание до линијата при жолто > запирно растојание + 2 m.', detected: true,
    match: { keys: /^yellow$/ }, law: ['law.signal.lights'], game: [],
    lesson: { polygon: NA, city: C('warn') }, exam: { polygon: NA, city: C('gameOnly') },
    status: 'needsInstructorReview', why: 'чл. 43 ст. 1. Дали испитувачот го бодува ова како 2-S е проценка — за проверка; засега не влијае на испитот.',
    say: 'Жолто: запри ако можеш безбедно. Тука имаше простор за запирање.' },
  { id: 'overtake', title: 'Обиколување', did: 'Обиколи пречка и го принуди спротивниот да кочи.', detect: 'Конфликт со спротивно возило за време на маневарот.', detected: true,
    match: { rules: ['law.overtake.safe', 'law.overtake.place'] }, law: ['law.overtake.safe', 'law.overtake.place'], game: [],
    lesson: { polygon: NA, city: C('intervene') }, exam: { polygon: NA, city: C('examMinor', ['exam4.2D']) },
    status: 'confirmed', why: 'чл. 50, 54, 56–58; Образец бр. 4, 2-Д (15).',
    say: 'Обиколувај само кога спротивната лента е слободна доволно далеку.' },
  { id: 'distance', title: 'Растојание', did: 'Возеше преблиску до возилото пред тебе.', detect: 'Не е детектирано во оваа верзија (параметар minimumFollowingTimeSeconds е подготвен).', detected: false,
    match: { rules: ['law.distance'] }, law: ['law.distance'], game: [],
    lesson: { polygon: NA, city: C('warn') }, exam: { polygon: NA, city: C('examMinor', ['exam4.2Zh']) },
    status: 'needsInstructorReview', why: 'чл. 93 ст. 1; Образец бр. 4, 2-Ж (10). Прагот на размак е проценка.',
    say: 'Подалеку од возилото пред тебе — барем две секунди.' },
  { id: 'curb', title: 'Рабник', did: 'Удри во работ на коловозот.', detect: 'Контакт на тркало со рабникот.', detected: true,
    match: { keys: /^curb$/ }, law: [], game: ['game.contact'],
    lesson: { polygon: C('note'), city: C('warn') }, exam: { polygon: C('gameOnly'), city: C('examCritical', ['exam4.1Zh']) },
    status: 'confirmed', why: 'Градска: Образец бр. 4, 1-Ж „удирање во работ на коловозот“ (51). Полигон: линиите се бодуваат преку вежбата.',
    say: 'Внимавај на рабникот — погледни во десното огледало.' },
  { id: 'mirror', title: 'Огледала', did: 'Маневар без поглед во огледало.', detect: 'Нема прикажан поглед (J/K/M/U/I) во 6 с пред свртување — контрола-проксија, не вистинско следење на очите.', detected: true,
    match: { rules: ['tech.mirror.before'] }, law: [], game: ['tech.mirror.before'],
    lesson: { polygon: NA, city: C('note') }, exam: { polygon: NA, city: C('examMinor', ['exam4.1I']) },
    status: 'needsInstructorReview', why: 'Образец бр. 4, 1-И (10); детекцијата е проксија.',
    say: 'Пред маневар: огледало, па рамо.' },
  { id: 'horn', title: 'Сирена', did: 'Сирена без потреба.', detect: 'Употреба на сирена (на испит).', detected: true,
    match: { keys: /^horn$/ }, law: ['law.signs'], game: [],
    lesson: { polygon: NA, city: C('none') }, exam: { polygon: NA, city: C('examMinor', ['exam4.2Lj']) },
    status: 'confirmed', why: 'Образец бр. 4, 2-Љ (10).' },
  // ------------------------------------------------ vehicle handling
  { id: 'stall', title: 'Гаснење / нагло кумплунг', did: 'Моторот изгасна или кумплунгот беше пуштен нагло.', detect: 'Настан stall или jerk од моделот на возилото.', detected: true,
    match: { keys: /^(stall|jerk)$/, rules: ['exam1.1V', 'exam1.2G', 'exam1.6B', 'exam4.1A'] }, law: [], game: ['tech.smooth'],
    lesson: { polygon: C('note'), city: C('note') }, exam: { polygon: C('examMinor', ['exam1.1V']), city: C('examMinor', ['exam4.1A']) },
    status: 'confirmed', why: 'Образец бр. 1, 1-В / 2-Г (10), 6-Б (30); Образец бр. 4, 1-А (10).',
    say: 'Кумплунгот пушти го полека низ точката на зафаќање, со малку гас.' },
  { id: 'startInGear', title: 'Палење во брзина', did: 'Палење со вклучена брзина.', detect: 'Настан startInGear.', detected: true,
    match: { keys: /^startInGear$/, rules: ['exam1.1A', 'exam4.1Nj'] }, law: [], game: ['tech.smooth'],
    lesson: { polygon: C('note'), city: C('note') }, exam: { polygon: C('examMinor', ['exam1.1A']), city: C('examMinor', ['exam4.1Nj']) },
    status: 'confirmed', why: 'Образец бр. 1, 1-А (20); Образец бр. 4, 1-Њ (10).',
    say: 'Пред палење: празен од или притиснат кумплунг.' },
  { id: 'gear', title: 'Менување брзини', did: 'Неправилно менување (без кумплунг / погрешна брзина).', detect: 'Одбиено менување од менувачот.', detected: true,
    match: { keys: /^gear$/, rules: ['exam1.1D', 'exam4.1V'] }, law: [], game: ['tech.smooth'],
    lesson: { polygon: C('note'), city: C('note') }, exam: { polygon: C('examMinor', ['exam1.1D']), city: C('examMinor', ['exam4.1V']) },
    status: 'confirmed', why: 'Образец бр. 1, 1-Д (15); Образец бр. 4, 1-В (15).',
    say: 'Кумплунг до крај, па брзина.' },
  { id: 'handbrake.moving', title: 'Возење со рачна', did: 'Возеше со крената рачна.', detect: 'Возење > 1,5 с со крената рачна.', detected: true,
    match: { keys: /^pb$/, rules: ['exam1.1B', 'exam4.1B'] }, law: [], game: ['tech.smooth'],
    lesson: { polygon: C('warn'), city: C('warn') }, exam: { polygon: C('examMinor', ['exam1.1B']), city: C('examMinor', ['exam4.1B']) },
    status: 'confirmed', why: 'Образец бр. 1, 1-Б (30); Образец бр. 4, 1-Б (10).',
    say: 'Рачната е крената — спушти ја (P).' },
  { id: 'rollback', title: 'Враќање наназад', did: 'Возилото се врати наназад при тргнување.', detect: 'Враќање > 0,3 m (прагот е проценка).', detected: true,
    match: { keys: /^rollback$/, rules: ['exam1.6V', 'exam4.1O'] }, law: [], game: ['tech.smooth'],
    lesson: { polygon: C('note'), city: C('note') }, exam: { polygon: C('examMinor', ['exam1.6V']), city: C('examMinor', ['exam4.1O']) },
    status: 'needsInstructorReview', why: 'Образец бр. 1, 6-В (30); Образец бр. 4, 1-О (30). Прагот 0,3 m е проценка.',
    say: 'На угорнина: рачна, гас, кумплунг до зафаќање, па рачната.' },
  { id: 'riding', title: 'Нога на кумплунг', did: 'Возеше со нога на кумплунгот.', detect: 'Кумплунг > 25 % на брзина > 3 m/s подолго од 3 с.', detected: true,
    match: { keys: /^riding$/, rules: ['exam4.1R'] }, law: [], game: ['tech.smooth'],
    lesson: { polygon: C('note'), city: C('note') }, exam: { polygon: C('gameOnly'), city: C('examMinor', ['exam4.1R']) },
    status: 'confirmed', why: 'Образец бр. 4, 1-Р (15).',
    say: 'Тргни ја ногата од кумплунгот додека возиш.' },
  { id: 'wheelspin', title: 'Пролизгување', did: 'Тркалата пролизгаа при тргнување.', detect: 'Настан wheelspin.', detected: true,
    match: { keys: /^spin$/, rules: ['exam1.6Gj'] }, law: [], game: ['tech.smooth'],
    lesson: { polygon: C('note'), city: C('note') }, exam: { polygon: C('examMinor', ['exam1.6Gj']), city: C('gameOnly') },
    status: 'confirmed', why: 'Образец бр. 1, 6-Ѓ (30).', say: 'Помалку гас при тргнување.' },
  // ------------------------------------------------ polygon exercises (Образец бр. 1)
  { id: 'poly.stopover', title: 'Преминување на СТОП линијата (полигон)', did: 'Возилото ја премина СТОП линијата на крајот на лентата.', detect: 'Предниот (назад: задниот) браник помина над линијата за повеќе од 5 cm.', detected: true,
    match: { keys: /-stopover-/ }, law: [], game: [],
    lesson: { polygon: C('exerciseFail'), city: NA }, exam: { polygon: C('examCritical', ['exam1.1E']), city: NA },
    status: 'needsInstructorReview', why: 'Образец бр. 1, 1-Е / 2-Б „газење или преминување на линиите“ (51). Дека СТОП линијата спаѓа во „линиите на лентата“ е толкување — за проверка.',
    say: 'Ја помина СТОП линијата. Кочи порано и помеко — и кумплунгот пред да застанеш.' },
  { id: 'poly.lines', title: 'Газење линии (полигон)', did: 'Тркало преку линијата на лентата / просторот.', detect: 'Тркало надвор од означениот простор на вежбата.', detected: true,
    match: { rules: ['exam1.1E', 'exam1.2B', 'exam1.4A', 'exam1.5B'] }, law: [], game: [],
    lesson: { polygon: C('exerciseFail'), city: NA }, exam: { polygon: C('examCritical', ['exam1.1E']), city: NA },
    status: 'confirmed', why: 'Образец бр. 1, 1-Е / 2-Б / 4-А / 5-Б (51).',
    say: 'Тркалото излезе од линиите — вежбата не успеа. Повторно, полека.' },
  { id: 'poly.uturn3', title: 'Полукружно > 3 маневри', did: 'Полукружното свртување со повеќе од три маневри.', detect: 'Бројач на промени на насока > 3.', detected: true,
    match: { rules: ['exam1.4D'] }, law: [], game: [],
    lesson: { polygon: C('exerciseFail'), city: NA }, exam: { polygon: C('examCritical', ['exam1.4D']), city: NA },
    status: 'confirmed', why: 'Образец бр. 1, 4-Д (51).', say: 'Три маневри: напред, назад, напред — со полн волан навреме.' },
  { id: 'poly.object', title: 'Удар во граничник (вежба)', did: 'Удри во граничник за време на вежба.', detect: 'Контакт со граничник во вежбата.', detected: true,
    match: { rules: ['exam1.4Gj'] }, law: [], game: [],
    lesson: { polygon: C('exerciseFail'), city: NA }, exam: { polygon: C('examCritical', ['exam1.4Gj']), city: NA },
    status: 'confirmed', why: 'Образец бр. 1, 4-Ѓ (51).', say: 'Граничникот е ѕид — вежбата повторно.' },
  { id: 'poly.stopline', title: 'Запирање далеку од линијата', did: 'Запре повеќе од 1 m пред СТОП линијата.', detect: 'Растојание браник–линија > 1 m.', detected: true,
    match: { rules: ['exam1.1Zh', 'exam1.2V', 'exam1.6D'] }, law: [], game: [],
    lesson: { polygon: C('note'), city: NA }, exam: { polygon: C('examMinor', ['exam1.1Zh']), city: NA },
    status: 'confirmed', why: 'Образец бр. 1, 1-Ж / 2-В / 6-Д (30).', say: 'Запри најмногу 1 m пред линијата.' },
  { id: 'poly.unneeded', title: 'Непотребно запирање', did: 'Запре во лентата пред крајот.', detect: 'Брзина 0 во лентата пред означениот крај.', detected: true,
    match: { rules: ['exam1.1Z', 'exam1.2A'] }, law: [], game: [],
    lesson: { polygon: C('note'), city: NA }, exam: { polygon: C('examMinor', ['exam1.1Z']), city: NA },
    status: 'needsInstructorReview', why: 'Образец бр. 1, 1-З (15) / 2-А (10). Што е „непотребно“ е проценка.' },
  { id: 'poly.second', title: 'Без втора брзина', did: 'Вежба 1 без промена од прва во втора.', detect: 'Вежбата завршена без 2. брзина.', detected: true,
    match: { rules: ['exam1.1Gj'] }, law: [], game: [],
    lesson: { polygon: C('note'), city: NA }, exam: { polygon: C('examMinor', ['exam1.1Gj']), city: NA },
    status: 'confirmed', why: 'Образец бр. 1, 1-Ѓ (20).', say: 'Во лентата: прва, па втора.' },
  { id: 'poly.park', title: 'Паркирање', did: 'Се откажа, паркира несиметрично или со каросерија надвор.', detect: 'Излез без паркирање / агол > 6° / точка надвор од 2 × 6/7 m.', detected: true,
    match: { rules: ['exam1.5A', 'exam1.5V', 'exam1.5Gj'] }, law: [], game: [],
    lesson: { polygon: C('exerciseFail'), city: NA }, exam: { polygon: C('examMinor', ['exam1.5A', 'exam1.5V']), city: NA },
    status: 'needsInstructorReview', why: 'Образец бр. 1, 5-А (30), 5-В (15, за проверка), 5-Ѓ (51 — над прагот).', say: 'Паркирај симетрично, целото возило во просторот.' },
  { id: 'poly.hill.handbrake', title: 'Угорнина без рачна', did: 'Запре на угорнина без рачна кочница.', detect: 'Запирање на угорнината без рачна.', detected: true,
    match: { rules: ['exam1.6A'] }, law: [], game: [],
    lesson: { polygon: C('exerciseFail'), city: NA }, exam: { polygon: C('examCritical', ['exam1.6A']), city: NA },
    status: 'confirmed', why: 'Образец бр. 1, 6-А (51).', say: 'На угорнина: запри, рачна (P), па тргнување.' },
  // ------------------------------------------------ recorded but not detected yet (kept visible on purpose)
  { id: 'harsh.brake', title: 'Нагло сопирање', did: 'Нагло сопирање без опасност.', detect: 'Не е детектирано во оваа верзија.', detected: false,
    match: { rules: ['law.sudden'] }, law: ['law.sudden'], game: [],
    lesson: { polygon: NA, city: C('note') }, exam: { polygon: NA, city: C('examMinor', ['exam4.1S']) },
    status: 'needsInstructorReview', why: 'чл. 34; Образец бр. 4, 1-С (15).' },
  { id: 'ped.block', title: 'Стои на пешачки', did: 'Го попречува движењето на пешаците.', detect: 'Не е детектирано во оваа верзија.', detected: false,
    match: {}, law: ['law.ped.attention'], game: [],
    lesson: { polygon: NA, city: C('note') }, exam: { polygon: NA, city: C('examMinor', ['exam4.1F']) },
    status: 'needsInstructorReview', why: 'Образец бр. 4, 1-Ф (30).' },
];

// Thresholds (named, with units in sim/params.ts) and the honest false-positive caveat per mistake.
const PARAMS: Record<string, (keyof typeof DETECT)[]> = {
  'collision.vehicle': ['collisionRelativeSpeedMps'], 'touch.vehicle': ['collisionRelativeSpeedMps', 'contactReportSpeedMps'], 'object.hit': ['contactReportSpeedMps'], curb: ['contactReportSpeedMps'],
  speed: ['overspeedToleranceKmh', 'overspeedDurationSeconds'], 'signal.turn': ['indicatorLeadSeconds'], 'handbrake.moving': ['movingWithParkingBrakeSpeedMps', 'movingWithParkingBrakeSeconds'],
  rollback: ['hillRollbackLimitM'], riding: ['clutchRidingPedal', 'clutchRidingSpeedMps', 'clutchRidingSeconds'], 'poly.stopline': ['stopLineMaxDistanceM'], distance: ['minimumFollowingTimeSeconds'], 'harsh.brake': ['hardBrakingMps2'],
};
const CAVEATS: Record<string, string> = {
  'collision.vehicle': 'Брзината е брзина на приближување на двете тела; агол и оштета не се моделирани.',
  'collision.ped': 'Секој контакт со пешак, без оглед на брзината.',
  'touch.vehicle': 'Ист настан како судир — само брзината одлучува; прагот не е калибриран.',
  'object.hit': 'Контакт со статичен објект; не разликува огледало од браник.',
  'red.light': 'Мери позиција на стоп-линијата при промена на светлото; не мери гледање.',
  'priority.right': 'Проценка по време до крстосница (≤ 3 с), не по намера на возачот.',
  'priority.left': 'Конфликт во крстосница; блиски ситуации може да се погрешно оценат.',
  'meeting.obstacle': 'Пресметка на време на стигнување до тесниот дел.',
  'ped.yield': 'Положба на пешакот во/кон лентата; не гледа контакт со погледот.',
  'wrong.way': 'Влез во забранет сегмент од графот на улиците.',
  emergency: 'Мерено време додека возилото е зад тебе без простор.',
  'signal.turn': 'Почеток на свртување се одредува од аголот на возилото; рано вклучен и исклучен покажувач се смета како вклучен.',
  speed: 'Ограничувањето е од податоците на зоната; толеранцијата избегнува шум, законот не дава толеранција.',
  yellow: 'Запирното растојание е пресметано од моделот на сопирање.',
  overtake: 'Се гледа само принудното сопирање на спротивното возило.',
  curb: 'Секој контакт на тркало со рабникот над прагот на пријава; благото чешање е под прагот.',
  mirror: 'Проксија: дали погледот бил прикажан на екранот, не каде гледал човекот.',
  horn: 'Секоја употреба на сирена на испит.',
  stall: 'Настан од моделот на моторот/кумплунгот.', startInGear: 'Настан од моделот.', gear: 'Одбиено менување од менувачот.',
  'handbrake.moving': 'Делумно спуштена рачна се смета како крената над половина од ходот.',
  rollback: 'Мерено растојание наназад по запирање; прагот е проценка.',
  riding: 'Положба на педалот, не притисок на ногата.', wheelspin: 'Погонската сила над достапното прилепување.',
  'poly.lines': 'Точки на тркалата наспроти правоаголниците на вежбата.', 'poly.stopover': 'Положба на браникот наспроти линијата; 5 cm толеранција.', 'poly.uturn3': 'Бројач на промени на насока.', 'poly.object': 'Контакт со граничник.',
  'poly.stopline': 'Растојание браник–линија по мирување.', 'poly.unneeded': 'Мирување во лентата пред крајот.', 'poly.second': 'Највисока брзина во вежбата.',
  'poly.park': 'Агол и растојание до рабовите на просторот.', 'poly.hill.handbrake': 'Мирување на угорнината без рачна над половина од ходот.',
};
for (const m of MISTAKES) { m.params = PARAMS[m.id] ?? []; m.caveat = CAVEATS[m.id] ?? (m.detected ? '' : 'Не е детектирано.'); }
/** "1,5 m/s (provisional)" style text for a mistake's thresholds. */
export const thresholdText = (m: Mistake) => (m.params ?? []).map((k) => { const v = DETECT[k]; const i = PARAM_INFO[k]; return `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v} ${i.unit} (${i.status})`; }).join('; ') || 'настан од моделот (без праг)';

export const mistakeById = (id: string) => MISTAKES.find((m) => m.id === id);

export type Place = 'polygon' | 'city';
export const placeOf = (env: EnvId): Place => (env === 'polygon' ? 'polygon' : 'city');
export const isExamMode = (mode: Mode) => mode === 'exam';

/** Which matrix entry and cell an incident falls into (first match wins; entries are ordered by priority). */
export function classify(key: string, ruleIds: string[], mode: Mode, env: EnvId) {
  const m = MISTAKES.find((x) => x.detected && ((x.match.keys && x.match.keys.test(key)) || (x.match.rules && ruleIds.some((r) => x.match.rules!.includes(r)))));
  if (!m) return null;
  const place = placeOf(env);
  const exam = isExamMode(mode);
  const cell = (exam ? m.exam : m.lesson)[place];
  return { m, cell, exam, place };
}

/** Points of the official items in a cell (0 when none). */
export const cellPoints = (cell: Cell) => (cell.exam ?? []).reduce((a, id) => a + (ruleById(id)?.examPoints ?? 0), 0);

/** Official items counted in Полагање: what the mission/sim emitted for this incident (it knows the
 *  exact sheet item), otherwise the cell's items. Never any in Часови. */
export function examItemsFor(c: NonNullable<ReturnType<typeof classify>>, emitted: string[] | undefined): string[] {
  if (!c.exam || c.cell.action === 'gameOnly' || c.cell.action === 'none') return [];
  return emitted && emitted.length ? emitted : c.cell.exam ?? [];
}
const pts = (ids: string[]) => ids.reduce((a, id) => a + (ruleById(id)?.examPoints ?? 0), 0);

/** Severity recorded in the ledger. Полагање: from the official points against the threshold. */
export function severityFor(c: NonNullable<ReturnType<typeof classify>>, items: string[]): Severity {
  if (!c.exam) return MATRIX_CONFIG.lessonSeverity[c.cell.action];
  const p = pts(items);
  if (!p) return 'note';
  if (p > MATRIX_CONFIG.examThreshold[c.place]) return 'critical';
  return p >= 30 ? 'significant' : 'minor';
}
/** The action actually applied (exam cells resolve by points). */
export function actionFor(c: NonNullable<ReturnType<typeof classify>>, items: string[]): Action {
  if (!c.exam) return c.cell.action;
  const p = pts(items);
  if (!p) return c.cell.action === 'none' ? 'none' : 'gameOnly';
  return p > MATRIX_CONFIG.examThreshold[c.place] ? 'examCritical' : 'examMinor';
}

/** One-line source for the result screen. */
export function sourceLine(m: Mistake, cell: Cell) {
  const law = m.law.map((id) => ruleById(id)?.source?.ref).filter(Boolean).join('; ');
  const ex = (cell.exam ?? []).map((id) => { const r = ruleById(id); return r ? `${r.form} ${r.item} (${r.examPoints})` : id; }).join(', ');
  return [law && `ЗБСП ${law}`, ex].filter(Boolean).join(' · ') || 'Игра — не е официјално правило';
}
export const MATRIX_SOURCES = { law: SRC.law, exam: SRC.exam };

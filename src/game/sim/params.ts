// Single authoritative place for shared simulation tuning and rule-detection thresholds.
// Vehicle-specific data stays in vehicles/defs.ts. Every value carries its unit, a status and its
// basis — "verified" only where a cited source supports the number; otherwise "provisional"
// (a tuning choice) or "needsInstructorVerification" (an exam/practice question).
export type ParamStatus = 'verified' | 'provisional' | 'needsInstructorVerification';
export interface ParamInfo { unit: string; status: ParamStatus; basis: string }

/** Physics tuning (SI). */
export const PHYSICS = {
  gravityMps2: 9.81,
  airDensityKgM3: 1.2,
  /** below this |v| rolling resistance ramps in linearly (avoids a sign flip at standstill) */
  rollingRampSpeedMps: 0.1,
  /** steering lock at speed = min(lock, margin × (L·μg/v² + K·μg)) — steady-state angle at the grip limit */
  steerGripLockMargin: 1,
  /** kinematic (walking pace) ↔ dynamic bicycle model blend */
  kinematicBlendFromMps: 3,
  kinematicBlendToMps: 8,
  /** first-order decay of lateral velocity (tyre relaxation stand-in) */
  lateralRelaxationPerS: 0.4,
  /** clutch slip torque = capacity × tanh(slip / scale) */
  clutchSlipScaleRadS: 3,
  /** max engine–driveline speed difference at which the clutch may lock */
  clutchLockWindowRadS: 6,
  /** how far drive force may exceed the grip limit before wheelspin is declared */
  tractionSlack: 1.02,
};

/** Rule-detection thresholds (named by meaning and unit). */
export const DETECT = {
  /** vehicle–vehicle contact at or above this relative speed is a collision, below it a light touch */
  collisionRelativeSpeedMps: 1.5,
  /** contacts slower than this are not reported at all (sliding along, resting) */
  contactReportSpeedMps: 0.3,
  overspeedToleranceKmh: 1,
  overspeedDurationSeconds: 1,
  indicatorLeadSeconds: 1.5,
  minimumFollowingTimeSeconds: 1,
  hardBrakingMps2: 5.5,
  stopLineMaxDistanceM: 1,
  hillRollbackLimitM: 0.3,
  /** wheelspin must last this long to count (a keyboard launch chirp is not a mistake) */
  wheelspinMinSeconds: 0.3,
  movingWithParkingBrakeSeconds: 1.5,
  movingWithParkingBrakeSpeedMps: 1,
  clutchRidingSeconds: 3,
  clutchRidingPedal: 0.25,
  clutchRidingSpeedMps: 3,
  /** official: > limit negative points = not passed, each practical part separately */
  examPointLimit: { polygon: 50, city: 50 } as Record<'polygon' | 'city', number>,
  /** end the drive as soon as one item alone exceeds the limit (the result is already "not passed") */
  examStopsImmediatelyOnCriticalItem: true,
};

const RULEBOOK = 'Правилник за возачки испити, Сл. весник на РСМ 29/2025';
export const PARAM_INFO: Record<keyof typeof PHYSICS | keyof typeof DETECT, ParamInfo> = {
  gravityMps2: { unit: 'm/s²', status: 'verified', basis: 'стандардна гравитација' },
  airDensityKgM3: { unit: 'kg/m³', status: 'provisional', basis: 'приближно на ниво на море, 15 °C (1,225)' },
  rollingRampSpeedMps: { unit: 'm/s', status: 'provisional', basis: 'нумеричка стабилност' },
  steerGripLockMargin: { unit: '—', status: 'provisional', basis: 'помош за тастатура: волан ограничен на прилепувањето (1 = точно на границата)' },
  kinematicBlendFromMps: { unit: 'm/s', status: 'provisional', basis: 'модел: без ротирање во место' },
  kinematicBlendToMps: { unit: 'm/s', status: 'provisional', basis: 'модел' },
  lateralRelaxationPerS: { unit: '1/s', status: 'provisional', basis: 'замена за релаксација на гумите' },
  clutchSlipScaleRadS: { unit: 'rad/s', status: 'provisional', basis: 'модел на кумплунгот' },
  clutchLockWindowRadS: { unit: 'rad/s', status: 'provisional', basis: 'модел на кумплунгот' },
  tractionSlack: { unit: '—', status: 'provisional', basis: 'хистерезис за пролизгување' },
  collisionRelativeSpeedMps: { unit: 'm/s', status: 'provisional', basis: 'граница „судир / лесен допир“ — не е официјална, за калибрација' },
  contactReportSpeedMps: { unit: 'm/s', status: 'provisional', basis: 'игра' },
  overspeedToleranceKmh: { unit: 'km/h', status: 'provisional', basis: 'толеранција на мерење (закон: секое пречекорување)' },
  overspeedDurationSeconds: { unit: 's', status: 'provisional', basis: 'игра — избегнува мигновени скокови' },
  indicatorLeadSeconds: { unit: 's', status: 'provisional', basis: 'чл. 25 бара „навремено“, без број — вредноста е проценка' },
  minimumFollowingTimeSeconds: { unit: 's', status: 'provisional', basis: 'чл. 93 без број; не е детектирано' },
  hardBrakingMps2: { unit: 'm/s²', status: 'provisional', basis: 'чл. 34 без број; не е детектирано' },
  stopLineMaxDistanceM: { unit: 'm', status: 'verified', basis: 'Образец бр. 1, 1-Ж / 2-В / 6-Д: запирање „над 1 m“ пред линијата' },
  wheelspinMinSeconds: { unit: 's', status: 'provisional', basis: 'игра — тастатурата не може да дозира гас' },
  hillRollbackLimitM: { unit: 'm', status: 'needsInstructorVerification', basis: 'Образец бр. 1, 6-В без мерка — 0,3 m е проценка' },
  movingWithParkingBrakeSeconds: { unit: 's', status: 'provisional', basis: 'игра' },
  movingWithParkingBrakeSpeedMps: { unit: 'm/s', status: 'provisional', basis: 'игра' },
  clutchRidingSeconds: { unit: 's', status: 'provisional', basis: 'игра' },
  clutchRidingPedal: { unit: 'педал 0–1', status: 'provisional', basis: 'игра' },
  clutchRidingSpeedMps: { unit: 'm/s', status: 'provisional', basis: 'игра' },
  examPointLimit: { unit: 'негативни поени', status: 'verified', basis: `${RULEBOOK}, чл. 36 ст. 2: „повеќе од 50 негативни поени за првиот и вториот практичен дел одделно“` },
  examStopsImmediatelyOnCriticalItem: { unit: 'да/не', status: 'needsInstructorVerification', basis: `${RULEBOOK}, чл. 35 ст. 2 дозволува пократок втор дел поради безбедност; автоматско прекинување не е пропишано` },
};

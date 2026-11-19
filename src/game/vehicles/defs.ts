// One shared, versioned definition per vehicle: the renderer, collision, physics, cockpit,
// mirrors, garage comparison and mission feasibility all read these numbers.
// Names are original (Macedonian mountains/rivers); no manufacturer badges are used.

export const VEHICLE_DATA_VERSION = 2;

export type Family = 'hatchback' | 'saloon' | 'estate' | 'coupe' | 'suv' | 'van' | 'truck';
export type Drive = 'FWD' | 'RWD' | 'AWD';
export type PlateLayout = 'long' | 'twoRow';

export interface VehicleDef {
  id: string;
  name: string; // shown in the garage
  family: Family;
  familyLabel: string;
  era: string;
  blurb: string;
  /** Licence scope this profile trains. Category B is fully supported; the truck is an expanded practice profile. */
  scope: { category: 'B' | 'C1'; label: string; verified: boolean };
  dims: { L: number; W: number; H: number; wheelbase: number; track: number; wheelR: number; frontOverhang: number; groundClearance: number };
  mass: number; // kg incl. driver
  loadOptions?: number[]; // extra kg the garage can add (van, truck)
  comHeight: number;
  frontWeight: number; // static fraction on the front axle
  drive: Drive;
  steer: { lock: number; rate: number }; // rad, rad/s at the road wheels
  engine: { idle: number; redline: number; stall: number; inertia: number; friction0: number; friction1: number; offDrag: number; curve: [number, number][]; diesel?: boolean };
  gears: number[]; // 1..5
  reverse: number;
  finalDrive: number;
  driveEfficiency: number;
  clutch: { maxTorque: number; biteHigh: number; biteLow: number }; // pedal 1 = pressed; bite between biteLow..biteHigh
  brakes: { decel: number; parkDecel: number; lag: number };
  tyre: { mu: number; cornerF: number; cornerR: number };
  aero: { cdA: number; rolling: number };
  /** driver eye point in vehicle frame: x forward from centre, y up, z right (+) */
  eye: { x: number; y: number; z: number };
  mirrors: { left: { x: number; y: number; z: number }; right: { x: number; y: number; z: number }; interior: { x: number; y: number; z: number } | null };
  rearWindow: boolean; // false → the interior mirror sees the cargo wall
  plates: PlateLayout[];
  paint: string;
  trims: string[]; // original wheel/trim options shown in the garage
  /** Honest notes on what the physics simplifies for this profile. */
  simplifications: string;
}

const g = (v: number) => v;

export const VEHICLES: VehicleDef[] = [
  {
    id: 'vardarka', name: 'Вардарка 45', family: 'hatchback', familyLabel: 'Мал хечбек', era: '1988', paint: '#efe3c8',
    blurb: 'Лесна, тесна и искрена. Слуша на секое движење на кумплунгот.',
    scope: { category: 'B', label: 'Категорија Б', verified: true },
    dims: { L: 3.49, W: 1.54, H: 1.39, wheelbase: 2.15, track: 1.31, wheelR: 0.28, frontOverhang: 0.66, groundClearance: 0.14 },
    mass: 920, comHeight: 0.52, frontWeight: 0.61, drive: 'FWD',
    steer: { lock: 0.62, rate: 2.5 },
    engine: { idle: 850, redline: 6000, stall: 430, inertia: 0.11, friction0: 6, friction1: 0.0042, offDrag: 22, curve: [[0, 0], [700, 52], [1500, 70], [2500, 80], [3500, 86], [4500, 82], [5500, 72], [6200, 55]] },
    gears: [3.5, 2.06, 1.36, 0.97, 0.81], reverse: 3.2, finalDrive: 4.1, driveEfficiency: 0.9,
    clutch: { maxTorque: 150, biteHigh: 0.66, biteLow: 0.34 },
    brakes: { decel: 7.8, parkDecel: 3.2, lag: 0.06 },
    tyre: { mu: 0.95, cornerF: 38000, cornerR: 34000 },
    aero: { cdA: 0.68, rolling: 0.013 },
    eye: { x: -0.36, y: 1.21, z: -0.3 },
    mirrors: { left: { x: 0.62, y: 1.0, z: -0.84 }, right: { x: 0.62, y: 1.0, z: 0.84 }, interior: { x: 0.25, y: 1.3, z: 0 } },
    rearWindow: true, plates: ['long', 'twoRow'], trims: ['Челични', 'Хром капаци', 'Спорт ленти'],
    simplifications: 'Еден модел на гума по оска; без пренос на тежина помеѓу тркала лево/десно.',
  },
  {
    id: 'pelister', name: 'Пелистер 1600', family: 'saloon', familyLabel: 'Седан (три волумени)', era: '1991', paint: '#7a1f2b',
    blurb: 'Квадратен седан со долг гепек — пазете го задниот агол.',
    scope: { category: 'B', label: 'Категорија Б', verified: true },
    dims: { L: 4.32, W: 1.68, H: 1.42, wheelbase: 2.55, track: 1.42, wheelR: 0.30, frontOverhang: 0.8, groundClearance: 0.15 },
    mass: 1130, comHeight: 0.54, frontWeight: 0.53, drive: 'RWD',
    steer: { lock: 0.58, rate: 2.5 },
    engine: { idle: 800, redline: 5800, stall: 420, inertia: 0.15, friction0: 8, friction1: 0.0048, offDrag: 28, curve: [[0, 0], [700, 78], [1500, 108], [2500, 122], [3200, 126], [4200, 118], [5200, 102], [6000, 80]] },
    gears: [3.7, 2.1, 1.4, 1.03, 0.85], reverse: 3.5, finalDrive: 3.9, driveEfficiency: 0.88,
    clutch: { maxTorque: 210, biteHigh: 0.68, biteLow: 0.36 },
    brakes: { decel: 7.6, parkDecel: 3.0, lag: 0.07 },
    tyre: { mu: 0.95, cornerF: 46000, cornerR: 44000 },
    aero: { cdA: 0.74, rolling: 0.012 },
    eye: { x: -0.45, y: 1.2, z: -0.34 },
    mirrors: { left: { x: 0.68, y: 1.0, z: -0.91 }, right: { x: 0.68, y: 1.0, z: 0.91 }, interior: { x: 0.28, y: 1.32, z: 0 } },
    rearWindow: true, plates: ['long', 'twoRow'], trims: ['Челични', 'Алу 13"', 'Хром лајсни'],
    simplifications: 'Заден погон без моделирање на диференцијал; лизгањето е поедноставено.',
  },
  {
    id: 'shar', name: 'Шар Комби', family: 'estate', familyLabel: 'Караван', era: '1994', paint: '#3f6b5d',
    blurb: 'Долг покрив и далечен заден праг — кога паркирате, задницата е подалеку отколку што мислите.',
    scope: { category: 'B', label: 'Категорија Б', verified: true },
    dims: { L: 4.46, W: 1.69, H: 1.48, wheelbase: 2.56, track: 1.42, wheelR: 0.30, frontOverhang: 0.8, groundClearance: 0.15 },
    mass: 1190, loadOptions: [0, 150, 300], comHeight: 0.56, frontWeight: 0.52, drive: 'FWD',
    steer: { lock: 0.58, rate: 2.5 },
    engine: { idle: 800, redline: 5800, stall: 420, inertia: 0.15, friction0: 8, friction1: 0.0048, offDrag: 28, curve: [[0, 0], [700, 80], [1500, 112], [2500, 125], [3200, 128], [4200, 120], [5200, 104], [6000, 82]] },
    gears: [3.7, 2.1, 1.4, 1.03, 0.85], reverse: 3.5, finalDrive: 4.05, driveEfficiency: 0.9,
    clutch: { maxTorque: 210, biteHigh: 0.68, biteLow: 0.36 },
    brakes: { decel: 7.5, parkDecel: 3.0, lag: 0.07 },
    tyre: { mu: 0.95, cornerF: 46000, cornerR: 46000 },
    aero: { cdA: 0.78, rolling: 0.012 },
    eye: { x: -0.45, y: 1.22, z: -0.34 },
    mirrors: { left: { x: 0.68, y: 1.02, z: -0.92 }, right: { x: 0.68, y: 1.02, z: 0.92 }, interior: { x: 0.28, y: 1.34, z: 0 } },
    rearWindow: true, plates: ['long'], trims: ['Челични', 'Кровен носач', 'Алу 14"'],
    simplifications: 'Товарот го менува вкупната маса и тежиштето, не и распределбата по оски.',
  },
  {
    id: 'ohrid', name: 'Охрид GT', family: 'coupe', familyLabel: 'Купе', era: '1989', paint: '#2b3a55',
    blurb: 'Ниско седиште, тешки врати и широк C-столб — гледај во ретровизорите.',
    scope: { category: 'B', label: 'Категорија Б', verified: true },
    dims: { L: 4.12, W: 1.68, H: 1.30, wheelbase: 2.42, track: 1.42, wheelR: 0.30, frontOverhang: 0.82, groundClearance: 0.13 },
    mass: 1080, comHeight: 0.48, frontWeight: 0.52, drive: 'RWD',
    steer: { lock: 0.57, rate: 2.5 },
    engine: { idle: 850, redline: 6500, stall: 450, inertia: 0.14, friction0: 8, friction1: 0.005, offDrag: 28, curve: [[0, 0], [800, 82], [1800, 120], [3000, 140], [4200, 150], [5200, 146], [6000, 132], [6700, 105]] },
    gears: [3.4, 2.05, 1.42, 1.07, 0.86], reverse: 3.3, finalDrive: 3.9, driveEfficiency: 0.88,
    clutch: { maxTorque: 240, biteHigh: 0.66, biteLow: 0.4 },
    brakes: { decel: 8.0, parkDecel: 3.0, lag: 0.06 },
    tyre: { mu: 0.98, cornerF: 52000, cornerR: 50000 },
    aero: { cdA: 0.62, rolling: 0.012 },
    eye: { x: -0.62, y: 1.06, z: -0.34 },
    mirrors: { left: { x: 0.5, y: 0.93, z: -0.91 }, right: { x: 0.5, y: 0.93, z: 0.91 }, interior: { x: 0.12, y: 1.2, z: 0 } },
    rearWindow: true, plates: ['long'], trims: ['Алу 14"', 'Спорт ленти', 'Челични'],
    simplifications: 'Поедноставен заден погон; без моделирање на блокирање на диференцијал.',
  },
  {
    id: 'korab', name: 'Кораб 4×4', family: 'suv', familyLabel: 'Теренец (SUV)', era: '1999', paint: '#46523e',
    blurb: 'Седиш високо и гледаш далеку — но тежиштето е горе и сопирањето трае подолго.',
    scope: { category: 'B', label: 'Категорија Б', verified: true },
    dims: { L: 4.26, W: 1.80, H: 1.76, wheelbase: 2.50, track: 1.52, wheelR: 0.36, frontOverhang: 0.82, groundClearance: 0.21 },
    mass: 1640, comHeight: 0.74, frontWeight: 0.53, drive: 'AWD',
    steer: { lock: 0.56, rate: 2.5 },
    engine: { idle: 800, redline: 5000, stall: 420, inertia: 0.2, friction0: 10, friction1: 0.006, offDrag: 34, curve: [[0, 0], [700, 110], [1500, 160], [2300, 176], [3000, 172], [4000, 156], [5000, 128], [5300, 110]] },
    gears: [4.1, 2.3, 1.45, 1.0, 0.82], reverse: 3.9, finalDrive: 4.3, driveEfficiency: 0.85,
    clutch: { maxTorque: 300, biteHigh: 0.68, biteLow: 0.36 },
    brakes: { decel: 7.2, parkDecel: 2.8, lag: 0.08 },
    tyre: { mu: 0.92, cornerF: 56000, cornerR: 54000 },
    aero: { cdA: 1.05, rolling: 0.015 },
    eye: { x: -0.4, y: 1.58, z: -0.36 },
    mirrors: { left: { x: 0.62, y: 1.32, z: -0.98 }, right: { x: 0.62, y: 1.32, z: 0.98 }, interior: { x: 0.25, y: 1.62, z: 0 } },
    rearWindow: true, plates: ['long', 'twoRow'], trims: ['Челични 15"', 'Резервно на врата', 'Рамка напред'],
    simplifications: 'Погон на сите тркала како фиксна распределба 50:50; навалувањето е визуелно, не превртување.',
  },
  {
    id: 'bistra', name: 'Бистра Фургон', family: 'van', familyLabel: 'Мал доставен комбе', era: '1996', paint: '#e6e2d8',
    blurb: 'Нема заден прозорец: внатрешниот ретровизор гледа во товарот. Живееш од страничните огледала.',
    scope: { category: 'B', label: 'Категорија Б', verified: true },
    dims: { L: 4.40, W: 1.77, H: 1.86, wheelbase: 2.70, track: 1.48, wheelR: 0.31, frontOverhang: 0.72, groundClearance: 0.16 },
    mass: 1360, loadOptions: [0, 300, 600], comHeight: 0.66, frontWeight: 0.58, drive: 'FWD',
    steer: { lock: 0.6, rate: 2.5 },
    engine: { idle: 800, redline: 4800, stall: 400, inertia: 0.22, friction0: 10, friction1: 0.006, offDrag: 34, diesel: true, curve: [[0, 0], [700, 105], [1400, 150], [2000, 162], [2800, 155], [3600, 138], [4400, 112], [4900, 90]] },
    gears: [3.9, 2.2, 1.4, 1.0, 0.8], reverse: 3.7, finalDrive: 4.2, driveEfficiency: 0.88,
    clutch: { maxTorque: 280, biteHigh: 0.66, biteLow: 0.36 },
    brakes: { decel: 7.0, parkDecel: 2.8, lag: 0.08 },
    tyre: { mu: 0.92, cornerF: 50000, cornerR: 52000 },
    aero: { cdA: 1.2, rolling: 0.014 },
    eye: { x: 0.62, y: 1.52, z: -0.38 },
    mirrors: { left: { x: 1.15, y: 1.3, z: -1.0 }, right: { x: 1.15, y: 1.3, z: 1.0 }, interior: null },
    rearWindow: false, plates: ['long', 'twoRow'], trims: ['Челични', 'Кровни шини', 'Странична лајсна'],
    simplifications: 'Товарот е една точкаста маса; без моделирање на поместување на товарот.',
  },
  {
    id: 'jakupica', name: 'Јакупица 7.5', family: 'truck', familyLabel: 'Камион (крут, 7,5 t)', era: '1998', paint: '#d9a441',
    blurb: 'Долго меѓуосовинско растојание, широк лак на свртување и големи слепи точки.',
    scope: { category: 'C1', label: 'Проширен профил „Ц1“ — само вежба, не е категорија Б', verified: false },
    dims: { L: 7.2, W: 2.36, H: 3.2, wheelbase: 4.0, track: 1.95, wheelR: 0.48, frontOverhang: 1.25, groundClearance: 0.26 },
    mass: 4900, loadOptions: [0, 1200, 2600], comHeight: 1.15, frontWeight: 0.42, drive: 'RWD',
    steer: { lock: 0.6, rate: 1.2 },
    engine: { idle: 650, redline: 2800, stall: 380, inertia: 0.9, friction0: 30, friction1: 0.03, offDrag: 120, diesel: true, curve: [[0, 0], [600, 300], [1100, 420], [1500, 460], [1900, 450], [2400, 400], [2800, 330], [3000, 260]] },
    gears: [6.2, 3.7, 2.2, 1.4, 1.0], reverse: 5.8, finalDrive: 4.6, driveEfficiency: 0.86,
    clutch: { maxTorque: 900, biteHigh: 0.66, biteLow: 0.34 },
    brakes: { decel: 6.2, parkDecel: 2.6, lag: 0.3 },
    tyre: { mu: 0.85, cornerF: 160000, cornerR: 220000 },
    aero: { cdA: 5.6, rolling: 0.009 },
    eye: { x: 2.3, y: 2.35, z: -0.6 },
    mirrors: { left: { x: 2.75, y: 2.15, z: -1.36 }, right: { x: 2.75, y: 2.15, z: 1.36 }, interior: null },
    rearWindow: false, plates: ['long', 'twoRow'], trims: ['Цирада', 'Сандак', 'Ладилник'],
    simplifications: 'Пневматските сопирачки се приближени со доцнење од 0,3 с; без моторна сопирачка и без мерење на оска по оска.',
  },
  {
    id: 'spectral', name: 'Spectral GT-RS (гостин)', family: 'coupe', familyLabel: 'Гостин: модерно спортско купе', era: '2020-ти', paint: '#22304f',
    blurb: 'Модел CC0 од трета страна — широк, низок и силен. Тешко се гледа наоколу; во маалото е тесно.',
    scope: { category: 'B', label: 'Категорија Б (гостин-возило, само за вежба)', verified: false },
    dims: { L: 5.19, W: 2.0, H: 1.68, wheelbase: 3.05, track: 1.72, wheelR: 0.36, frontOverhang: 1.05, groundClearance: 0.11 },
    mass: 1520, comHeight: 0.45, frontWeight: 0.44, drive: 'RWD',
    steer: { lock: 0.55, rate: 2.6 },
    engine: { idle: 900, redline: 7600, stall: 480, inertia: 0.16, friction0: 10, friction1: 0.005, offDrag: 30, curve: [[0, 0], [900, 160], [2000, 320], [3500, 420], [5000, 460], [6500, 440], [7600, 380], [8000, 300]] },
    gears: [3.3, 2.1, 1.5, 1.15, 0.92], reverse: 3.2, finalDrive: 3.6, driveEfficiency: 0.9,
    clutch: { maxTorque: 600, biteHigh: 0.64, biteLow: 0.4 },
    brakes: { decel: 9.5, parkDecel: 3.0, lag: 0.05 },
    tyre: { mu: 1.05, cornerF: 80000, cornerR: 90000 },
    aero: { cdA: 0.62, rolling: 0.011 },
    eye: { x: -0.35, y: 1.08, z: -0.4 },
    mirrors: { left: { x: 0.55, y: 1.0, z: -1.15 }, right: { x: 0.55, y: 1.0, z: 1.15 }, interior: { x: 0.1, y: 1.25, z: 0 } },
    rearWindow: true, plates: ['long'], trims: [],
    simplifications: 'Гостин-модел: физиката е проценета за модерно купе, не е мерена.',
  } as VehicleDef,
];

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];

export const PAINT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Крем', hex: '#efe3c8' }, { name: 'Бордо', hex: '#7a1f2b' }, { name: 'Темно зелена', hex: '#2f4a3e' },
  { name: 'Морнарско', hex: '#22304f' }, { name: 'Бледо сина', hex: '#a9c4d6' }, { name: 'Окер', hex: '#c9952e' },
  { name: 'Графит', hex: '#3a3d40' }, { name: 'Сребрена', hex: '#b9bcbd' }, { name: 'Бела', hex: '#eeeee8' }, { name: 'Црна', hex: '#16181a' },
];

export const INTERIOR_PALETTES = [
  { id: 'petrol', name: 'Петрол и крем', dash: '#1f3b3a', seat: '#c9b48a' },
  { id: 'tobacco', name: 'Тутун кафеава', dash: '#3b2a1f', seat: '#8a5a3a' },
  { id: 'grey', name: 'Сива ткаенина', dash: '#2e3134', seat: '#7d8186' },
];

/** Turning circle (kerb to kerb, approx.) from the shared geometry — shown in the garage. */
export function turningCircle(d: VehicleDef) {
  const R = d.dims.wheelbase / Math.tan(d.steer.lock) + d.dims.track / 2;
  return 2 * Math.hypot(R + d.dims.W / 2 - d.dims.track / 2, d.dims.wheelbase + d.dims.frontOverhang);
}

void g;

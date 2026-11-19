// Episode 1 route: an original, hand-authored, fictionalised block layout inspired by
// Debar Maalo, Skopje. No map API and no OpenStreetMap geometry is used: every street,
// business and person here is invented. Units are metres; x = east, y = north.
//
// Everything a future route (e.g. Centar) needs to replace lives in this file and in
// ./scenarios.ts: streets, frontages, parking, signs, markings, props and the route itself.

import { rect, type Rect, type Vec2, type Pose } from '../math';

export type SignCode = '102' | '205' | '302.1' | '305' | '305.1' | 'plaque' | '103.1' | '103.2' | '106' | '107' | '111.1' | '115' | '121.1' | 'limit' | 'place' | '123';

export interface Street {
  id: string;
  name: string; // invented, shown on street plaques
  rect: Rect; // carriageway
  axis: 'x' | 'y';
  center: number;
  oneWay?: 'north';
  centerLine?: 'dashed';
}

export interface Frontage {
  /** curb line from a to b; buildings stand on the side opposite to `normal` */
  a: Vec2; b: Vec2;
  normal: Vec2; // points from the curb into the street
  street: string;
  trimStart?: number; trimEnd?: number; // keep corners free for the crossing frontage
}

export interface Reserved { r: Rect; kind: 'garden' | 'cafe' | 'gate' | 'plaza' | 'shop' }

export interface ParkingStrip {
  street: string; from: Vec2; to: Vec2; h: number; // heading of the parked cars
  seed: number; gapChance?: number;
}

export interface SignDef { id: string; code: SignCode; x: number; y: number; face: number; text?: string; arrow?: 'left' | 'right'; height?: number }

export interface ShopDef { x: number; y: number; face: number; width: number; text: string; color: string; awning?: string }

export interface Crossing { id: string; street: string; x0: number; x1: number; y0: number; y1: number; axis: 'x' | 'y' }

export interface RouteHint { id: string; until: (p: Pose, cp: number) => boolean; text: string; arrow?: 'left' | 'right' | 'straight' | 'compass'; target?: Vec2 }

// ---------------------------------------------------------------------------
// Streets (carriageways). Bakalska and Gjurgjevdenska are 7.0 m wide, Javorova 6.6,
// Chinarska 6.4 (one-way northbound between Bakalska and Gjurgjevdenska) and Tiha 5.6.
export const STREETS: Street[] = [
  { id: 'bakalska', name: 'ул. Бакалска', rect: rect(-3.3, -3.5, 482.8, 3.5), axis: 'x', center: 0, centerLine: 'dashed' },
  { id: 'tiha', name: 'ул. Тиха', rect: rect(477.2, -3.5, 482.8, 263.5), axis: 'y', center: 480 },
  { id: 'gjurgjevdenska', name: 'ул. Ѓурѓевденска', rect: rect(-3.3, 256.5, 482.8, 263.5), axis: 'x', center: 260, centerLine: 'dashed' },
  { id: 'javorova', name: 'ул. Јаворова', rect: rect(-3.3, -3.5, 3.3, 263.5), axis: 'y', center: 0, centerLine: 'dashed' },
  { id: 'chinarska-s', name: 'ул. Чинарска', rect: rect(236.8, -125, 243.2, -3.5), axis: 'y', center: 240, centerLine: 'dashed' },
  { id: 'chinarska-n', name: 'ул. Чинарска', rect: rect(236.8, 3.5, 243.2, 256.5), axis: 'y', center: 240, oneWay: 'north' },
];

/** Junction squares (part of the drivable area, listed for markings/scoring). */
export const JUNCTIONS = {
  J1: rect(236.8, -3.5, 243.2, 3.5), // Bakalska × Chinarska — equal importance, scenario 1
  J2: rect(477.2, -3.5, 482.8, 3.5), // corner Bakalska → Tiha
  J3: rect(236.8, 256.5, 243.2, 263.5), // Gjurgjevdenska × Chinarska (one-way mouth) — scenario 4
  J4: rect(-3.3, 256.5, 3.3, 263.5), // corner Gjurgjevdenska → Javorova
  J5: rect(-3.3, -3.5, 3.3, 3.5), // corner Javorova → Bakalska
};

export const DRIVABLE: Rect[] = STREETS.map((s) => s.rect);

// Curb lines with the side buildings stand on. Horizontal streets own inner corners.
const F = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, street: string, trimStart = 0, trimEnd = 0): Frontage =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, normal: { x: nx, y: ny }, street, trimStart, trimEnd });

export const FRONTAGES: Frontage[] = [
  // Bakalska
  F(-3.3, -3.5, 236.8, -3.5, 0, 1, 'bakalska'),
  F(243.2, -3.5, 482.8, -3.5, 0, 1, 'bakalska'),
  F(3.3, 3.5, 236.8, 3.5, 0, -1, 'bakalska'),
  F(243.2, 3.5, 477.2, 3.5, 0, -1, 'bakalska'),
  // Gjurgjevdenska
  F(-3.3, 263.5, 482.8, 263.5, 0, -1, 'gjurgjevdenska'),
  F(3.3, 256.5, 236.8, 256.5, 0, 1, 'gjurgjevdenska'),
  F(243.2, 256.5, 477.2, 256.5, 0, 1, 'gjurgjevdenska'),
  // Javorova (outer west side runs full length)
  F(-3.3, -3.5, -3.3, 263.5, 1, 0, 'javorova', 16, 16),
  F(3.3, 3.5, 3.3, 256.5, -1, 0, 'javorova', 16, 16),
  // Tiha
  F(482.8, -3.5, 482.8, 263.5, -1, 0, 'tiha', 16, 16),
  F(477.2, 3.5, 477.2, 256.5, 1, 0, 'tiha', 16, 16),
  // Chinarska
  F(236.8, 3.5, 236.8, 256.5, 1, 0, 'chinarska-n', 16, 16),
  F(243.2, 3.5, 243.2, 256.5, -1, 0, 'chinarska-n', 16, 16),
  F(236.8, -125, 236.8, -3.5, 1, 0, 'chinarska-s', 0, 16),
  F(243.2, -125, 243.2, -3.5, -1, 0, 'chinarska-s', 0, 16),
  F(236.8, -125, 243.2, -125, 0, 1, 'chinarska-s'),
];

/** Areas on the built side where no generic building is placed. */
export const RESERVED: Reserved[] = [
  // Scenario 1 sight-line: open garden with a low wall at the SW corner of J1.
  { r: rect(198, -36, 236.8, -3.5), kind: 'garden' },
  // Start café terrace "Кафе Чинар"
  { r: rect(48, -20, 94, -3.5), kind: 'cafe' },
  // "Кафе Липа" + "Бакалница Мила" by the crossing
  { r: rect(333, 263.5, 362, 285), kind: 'cafe' },
  // Courtyard gate used by the pulling-out car
  { r: rect(372, 263.5, 379, 285), kind: 'gate' },
];

/** Sidewalk width by street (irregular widths are added per building in the generator). */
export const SIDEWALK: Record<string, number> = {
  bakalska: 2.6, gjurgjevdenska: 2.8, javorova: 2.4, tiha: 2.0, 'chinarska-n': 2.2, 'chinarska-s': 2.2,
};

// ---------------------------------------------------------------------------
// Parking. Cars park facing the direction of travel of their side.
export const PARKING: ParkingStrip[] = [
  { street: 'bakalska', from: { x: 12, y: 2.62 }, to: { x: 96, y: 2.62 }, h: Math.PI, seed: 11 },
  { street: 'bakalska', from: { x: 124, y: 2.62 }, to: { x: 224, y: 2.62 }, h: Math.PI, seed: 12, gapChance: 0.25 },
  { street: 'bakalska', from: { x: 262, y: 2.62 }, to: { x: 330, y: 2.62 }, h: Math.PI, seed: 13 },
  { street: 'bakalska', from: { x: 352, y: 2.62 }, to: { x: 466, y: 2.62 }, h: Math.PI, seed: 14, gapChance: 0.2 },
  { street: 'gjurgjevdenska', from: { x: 100, y: 257.38 }, to: { x: 226, y: 257.38 }, h: 0, seed: 21, gapChance: 0.2 },
  { street: 'gjurgjevdenska', from: { x: 256, y: 257.38 }, to: { x: 318, y: 257.38 }, h: 0, seed: 22 },
  { street: 'gjurgjevdenska', from: { x: 366, y: 257.38 }, to: { x: 466, y: 257.38 }, h: 0, seed: 23, gapChance: 0.15 },
  { street: 'javorova', from: { x: 2.45, y: 26 }, to: { x: 2.45, y: 232 }, h: Math.PI / 2, seed: 31, gapChance: 0.25 },
  { street: 'chinarska-n', from: { x: 242.35, y: 14 }, to: { x: 242.35, y: 244 }, h: Math.PI / 2, seed: 41, gapChance: 0.1 },
  { street: 'chinarska-s', from: { x: 237.65, y: -112 }, to: { x: 237.65, y: -42 }, h: -Math.PI / 2, seed: 42, gapChance: 0.2 },
];

/** Scenario 2: the parked row that narrows Tiha on the northbound side (fixed, not random). */
export const TIHA_NARROW = { y0: 90, y1: 152, carX: 481.92 };

// ---------------------------------------------------------------------------
// Signs. `face` is the heading the sign face points toward (towards the drivers it addresses).
// Designs follow the sign plates reproduced in the MVR exam handbook (see scenarios.ts sources).
const E = 0, N = Math.PI / 2, W = Math.PI, S = -Math.PI / 2;
export const SIGNS: SignDef[] = [
  // Scenario 1 — sign 102 "Крстосување на патишта од иста важност" on every approach to J1
  { id: 's1-102-east', code: '102', x: 196, y: -4.4, face: W },
  { id: 's1-102-west', code: '102', x: 286, y: 4.4, face: E },
  { id: 's1-102-north', code: '102', x: 244.1, y: -46, face: S },
  // One-way start at J1 (sign 305) for northbound traffic entering Chinarska
  { id: 'j1-305-r', code: '305', x: 244.0, y: 5.2, face: S },
  { id: 'j1-305-l', code: '305', x: 236.0, y: 5.2, face: S },
  // Scenario 3 — sign 302.1 at the marked crossing on Gjurgjevdenska
  { id: 's3-302-w', code: '302.1', x: 332.6, y: 264.3, face: E },
  { id: 's3-302-e', code: '302.1', x: 327.4, y: 255.7, face: W },
  // Scenario 4 — sign 205 at the one-way mouth, and 305.1 arrows for cross traffic
  { id: 's4-205-r', code: '205', x: 244.0, y: 255.6, face: N },
  { id: 's4-205-l', code: '205', x: 236.0, y: 255.6, face: N },
  { id: 's4-3051-e', code: '305.1', x: 245.2, y: 254.2, face: E, arrow: 'right', height: 2.6 },
  { id: 's4-3051-w', code: '305.1', x: 234.8, y: 254.2, face: W, arrow: 'left', height: 2.6 },
  // Street plaques (art, not traffic signs)
  { id: 'pl-1', code: 'plaque', x: 6.2, y: 6.6, face: S, text: 'ул. Бакалска' },
  { id: 'pl-2', code: 'plaque', x: 474.6, y: 7.0, face: S, text: 'ул. Тиха' },
  { id: 'pl-3', code: 'plaque', x: 474.6, y: 252.8, face: N, text: 'ул. Ѓурѓевденска' },
  { id: 'pl-4', code: 'plaque', x: 233.8, y: 252.6, face: E, text: 'ул. Чинарска' },
  { id: 'pl-5', code: 'plaque', x: 6.3, y: 252.8, face: N, text: 'ул. Јаворова' },
  { id: 'pl-6', code: 'plaque', x: 233.6, y: 7.0, face: S, text: 'ул. Чинарска' },
];

export const CROSSINGS: Crossing[] = [
  { id: 'lipa', street: 'gjurgjevdenska', x0: 328, x1: 332, y0: 256.5, y1: 263.5, axis: 'x' },
];

// Painted one-way arrows on Chinarska (cue for direction of travel)
export const ROAD_ARROWS: Pose[] = [
  { x: 239.4, y: 30, h: N }, { x: 239.4, y: 140, h: N }, { x: 239.4, y: 236, h: N },
];

// ---------------------------------------------------------------------------
// Businesses (all invented). `face` = heading the shopfront looks toward.
export const SHOPS: ShopDef[] = [
  { x: 70, y: -9.1, face: N, width: 18, text: 'КАФЕ ЧИНАР', color: '#7a1f1a', awning: '#b3342b' },
  { x: 120, y: 9.0, face: S, width: 9, text: 'ПЕКАРА КОРА', color: '#2e4d3f', awning: '#c9a66b' },
  { x: 156, y: -8.9, face: N, width: 6, text: 'ТРАФИКА', color: '#1f3b5a' },
  { x: 300, y: 9.0, face: S, width: 9, text: 'АПТЕКА ЗДРАВЕЦ', color: '#1d6b4e' },
  { x: 384, y: 9.0, face: S, width: 10, text: 'БЕРБЕРНИЦА 77', color: '#3b2f5c', awning: '#d8c8a6' },
  { x: 302, y: -8.9, face: N, width: 10, text: 'ЧЕВЛАРНИЦА ТОДОР', color: '#5a3b1f' },
  { x: 424, y: -8.9, face: N, width: 9, text: 'ЦВЕЌАРНИЦА ЛАЛЕ', color: '#7a2950', awning: '#e3b7c8' },
  { x: 354.5, y: 269.0, face: S, width: 12, text: 'КАФЕ ЛИПА', color: '#2c4a43', awning: '#3f6b5d' },
  { x: 340.5, y: 269.0, face: S, width: 11, text: 'БАКАЛНИЦА МИЛА', color: '#7a4b12', awning: '#d9a441' },
  { x: 420, y: 269.0, face: S, width: 11, text: 'КНИЖАРНИЦА ПЕРГАМЕНТ', color: '#2a3b6b' },
  { x: 200, y: 269.0, face: S, width: 9, text: 'ФОТО ЕМА', color: '#4a4a4a' },
  { x: 150, y: 251.0, face: N, width: 10, text: 'СКАРА КАЈ ПЕПИ', color: '#8a2a12', awning: '#c84b2a' },
  { x: 290, y: 251.0, face: N, width: 11, text: 'МАРКЕТ ДВА БРАТА', color: '#1f5a3b', awning: '#e8e2d0' },
  { x: -8.6, y: 150, face: E, width: 11, text: 'АВТО-ДЕЛОВИ', color: '#3a3a3a' },
  { x: 8.6, y: 90, face: W, width: 9, text: 'ЕЛЕКТРО ЈОВЕ', color: '#1a4f7a' },
  { x: 472.2, y: 200, face: E, width: 9, text: 'ШИВАЧКА РАБОТИЛНИЦА', color: '#5c3b4a' },
];

// ---------------------------------------------------------------------------
// Route
export const START_POSE: Pose = { x: 74, y: -2.35, h: 0 };
export const FATHER_SEAT: Pose = { x: 66.5, y: -8.2, h: N };
export const CAFE_CHINAR_ZONE = rect(42, -3.5, 106, 0.8); // stop here to finish

/** Waypoints along the intended loop (right-hand lane centre lines). */
export const ROUTE_WAYPOINTS: Vec2[] = [
  { x: 74, y: -2.35 }, { x: 86, y: -1.75 },
  { x: 481.4, y: -1.75 },
  { x: 481.4, y: 81 }, { x: 479.2, y: 90 }, { x: 479.2, y: 156 }, { x: 481.4, y: 166 },
  { x: 481.4, y: 261.75 },
  { x: -1.65, y: 261.75 },
  { x: -1.65, y: -1.75 },
  { x: 74, y: -1.75 },
];

/** Progress gates, in order. The run only finishes after gate index 5 is passed. */
export const CHECKPOINTS: { id: string; r: Rect }[] = [
  { id: 'past-j1', r: rect(250, -3.5, 300, 3.5) },
  { id: 'tiha-start', r: rect(477.2, 15, 482.8, 30) },
  { id: 'tiha-end', r: rect(477.2, 200, 482.8, 215) },
  { id: 'gj-east', r: rect(390, 256.5, 400, 263.5) },
  { id: 'gj-mid', r: rect(280, 256.5, 290, 263.5) },
  { id: 'javorova', r: rect(-3.3, 120, 3.3, 130) },
];

export const ROUTE_HINTS: { afterCheckpoint: number; text: string; arrow: 'left' | 'straight' | 'compass'; turnAt?: Vec2 }[] = [
  { afterCheckpoint: -1, text: 'Право по Бакалска, па лево на Тиха', arrow: 'straight', turnAt: { x: 480, y: 0 } },
  { afterCheckpoint: 0, text: 'Лево на ул. Тиха', arrow: 'left', turnAt: { x: 480, y: 0 } },
  { afterCheckpoint: 1, text: 'Лево на ул. Ѓурѓевденска', arrow: 'left', turnAt: { x: 480, y: 260 } },
  { afterCheckpoint: 3, text: 'Назад кон кафичот — следи ги знаците', arrow: 'compass' },
];

// ---------------------------------------------------------------------------
// Landmarks and props
export const CAFE_CHINAR_TREE: Vec2 = { x: 90, y: -7.2 };
export const VODNO = { x: 120, y: -1350, cross: { x: 60, y: -1350 } }; // mountain to the south
export const TREES_EXTRA: Vec2[] = [
  { x: 212, y: -12 }, { x: 226, y: -24 }, { x: 206, y: -28 }, { x: 228, y: -9 }, // J1 garden
  { x: 344, y: 282 }, { x: 52, y: -16 },
];

export const CAFE_TABLES: { x: number; y: number; cafe: 'chinar' | 'lipa' }[] = [
  { x: 56, y: -6.6, cafe: 'chinar' }, { x: 62, y: -8.4, cafe: 'chinar' }, { x: 66.5, y: -6.9, cafe: 'chinar' },
  { x: 75, y: -7.6, cafe: 'chinar' }, { x: 81, y: -6.5, cafe: 'chinar' },
  { x: 350.5, y: 266.6, cafe: 'lipa' }, { x: 355, y: 267.4, cafe: 'lipa' }, { x: 359.2, y: 266.4, cafe: 'lipa' },
];

export const PATRON_LINES = {
  chinar: [
    'Една долга, ве молам.', 'Ова лето ќе трае до Митровден.', 'Виде ли кој се врати од Германија?',
    'Мачката пак е на ѕидот.', 'Ајде, уште едно кафе и одам.',
  ],
  lipa: [
    'Чинарот е постар од зградата.', 'Пак ја копаат Бакалска?', 'Тетка Мила ги има најдобрите домати.',
    'Синоќа имаше музика до доцна.', 'Е, ова е маало.',
  ],
};

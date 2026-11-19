# Круг низ маалото — Епизода 1: „Првиот круг“

A playable browser game module for Astibosoft's Macedonian driving-school platform. It is only the game: the host platform keeps the formal theory lessons and exam tests.

It is a warm late afternoon in present-day Skopje. Your father hands you the keys to the family's cream hatchback outside a neighbourhood café: *„Ај, еден круг. Те чекам кај кафичот.“* You drive one continuous loop (about 1.5 km, 4–5 minutes at learner pace) through an original, fictionalised route inspired by Debar Maalo. Along the way, four everyday situations unfold. When you get back to the café, the game shows **„Како го извози кругот?“**: a replay of each moment, plain-Macedonian feedback and an instant **„Пробај повторно“**.

No login, no paid service, no API key, no backend, no map API. All art and audio is generated procedurally at load time.

## Run it

Requires Node 18+ (tested with Node 26).

```bash
npm install
```

```bash
npm run dev
```

Opens on http://localhost:5173 (Vite default).

```bash
npm test
```

Headless simulation tests for every scored situation (Vitest).

```bash
npm run build
```

Typecheck, then a production bundle in `dist/` with a relative base path, so it runs from any sub-path or iframe.

```bash
npm run preview
```

Serves the production build locally.

### Deploy to GitHub Pages

`.github/workflows/deploy.yml` runs on every push to `main` (or manually from the Actions tab): `npm ci`, `npm test`, then `npm run build` with `VITE_BASE=/<repo>/`, and publishes `dist/` with the official Pages actions. In the repository settings, **Pages → Source** must be **GitHub Actions**. The game is then served at `https://<user>.github.io/<repo>/`. Because that is a non-local http(s) host, the „Да те видам ти“ challenge link is enabled there.

### Controls

| Action | Keyboard | Touch (landscape) |
|---|---|---|
| Gas | `W` / `↑` | **ГАС** pedal (right thumb) |
| Brake. Hold at a standstill to engage reverse (**R** on the dial); then this control reverses | `S` / `↓` / `Space` | **СОП** pedal |
| Steer | `A` `D` / `←` `→` | ◀ ▶ (left thumb) |
| Turn signals (they cancel themselves after a completed turn, like the column switch) | `Q` left, `E` right | ⇦ ⇨ |
| Horn | `H` | 📯 |
| Camera: chase ↔ driver view | `C` | top-right button |
| Mute | `M` | top-right button |
| Pause / restart | `Esc` / `P` | ❚❚ (the menu has „Почни одново“) |

On phones held upright, the game asks you to rotate to landscape.

## Host integration

- **Completion event.** When the run ends at the café, the game dispatches `window` `CustomEvent('krug:complete', { detail })`. If it runs in an iframe, it also posts the same payload to the parent with `postMessage`. Payload: `{ type: 'krug:complete', episode: 'debar-maalo-1', score, maxScore: 100, finished, scenarios: [{ id, outcome, points, reactionSec, scored }], speedingEpisodes, contacts, completedAt }`. The score is a **game score**, not an exam assessment.
- **Direct mount.** `window.KrugGame.mount(element, { onComplete, challenge, shareUrl })`. Set `data-manual` on `#root` to stop the automatic mount.
- **„Да те видам ти“ challenge link.** It appears on the review screen only when the game is hosted (served over http(s) from a non-local host), or when `?hosted=1` / `challenge: true` is set. The link is `…?route=debar-maalo-1&challenge=<score>`. Opening it shows the friend's score on the title screen.

## The four situations (plus one unscored)

Every rule below was read from the official texts on **2026-11-18**. The full per-scenario record is in `src/game/content/scenarios.ts` and in the game under **„Извори и белешки“** (title screen and review screen). That record covers geometry, sign configuration, actor behaviour, lawful responses, scoring predicates, sources, article references and the date checked.

| # | Situation | Legally required (scored) | Basis | Coaching only (not scored) |
|---|---|---|---|---|
| 1 | Bakalska × Chinarska: unsignalised junction of roads of equal importance. Sign **102** on every approach. Open garden corner gives a ~45 m sight line to the right. A car approaches from the right. | Do not enter the junction while the car from the right has not cleared your lane and is ≤ 3.0 s away (or already in it). | ЗБСП чл. 41 ст. 1, чл. 42 ст. 2 | Reaction time after the first visible cue; approach speed ≤ 30 km/h in the last 15 m (чл. 42 ст. 1–2) |
| 2 | Tiha: 5.6 m street. A parked row on **your** side leaves ~3.8 m, too narrow for two cars. An oncoming van. | Since the obstacle is on your side, give way. Fail if you enter the narrow part while the oncoming car is in it, or will reach it before you can get out (your entry speed, min 4 m/s, +0.5 s). | ЗБСП чл. 48 ст. 2 (and ст. 4) | Reaction time; no contact with parked cars |
| 3 | Gjurgjevdenska: marked crossing with no signals by „Кафе Липа“. Sign **302.1** on both sides. An older woman with groceries leaves „Бакалница Мила“ and steps onto the crossing. | Do not cross the line while she is on the crossing in your lane (or within 1 m of it), or while she stands at the kerb stepping out. | ЗБСП чл. 122 ст. 3 (and чл. 19) | Reaction time; stopped before the zebra, not on it (чл. 19 ст. 2) |
| 4 | Gjurgjevdenska × Chinarska (T): Chinarska is one-way **towards** you. Sign **205** at its mouth, **305.1** arrows on the corners, painted arrows, all parked cars facing north. The café is "just down there", so the short cut is tempting. | (a) Do not enter the one-way street against its direction. (b) For the left turn into Javorova, the left indicator must be on ≥ 1.5 s before the heading starts to change (> 15°). | ЗБСП чл. 17 ст. 1, чл. 187 ст. 3 (signs); чл. 25 ст. 2–3 (signalling) | Lane position along the centre line for the left turn (чл. 39 ст. 3) |
| + | Gjurgjevdenska: a parked car signals and pulls out into a courtyard, a hazard-perception moment in the DVSA style. | **Unscored**, clearly labelled „Без бодови“. Shows your reaction to the indicator. | чл. 26 ст. 1 (it must yield to you) | — |

**General rows on the review screen.**

- Speed above 50 km/h in a built-up area for ≥ 1 s (ЗБСП чл. 35 ст. 1) costs 5 game points per episode, up to 15.
- Contacts cost game points: 2 for a kerb or parked car, 10 for a moving vehicle or pedestrian, up to 25. This is a game rule, not a legal one.
- Indicator use on the other left turns is coaching only.

**Score.** Each scored situation is worth 20 points if lawful, plus up to 5 for anticipation (first brake, or a throttle lift held for ≥ 1 s, within 2.5 s of the cue = 5; within 4 s = 3). Situation 4 gives 15 for the route plus 10 for the signal. A situation the player never reached is shown as „Не е одиграно“. Time to finish is never scored, and no clock is shown.

**What counts as observable.** Pedals, steering, the indicator, the car's position and heading, and the positions of other road users. Turning the camera is never treated as having checked the surroundings.

**Cues and adaptive timing.** Each situation's other road user adjusts its speed until the learner commits (30–35 m out). After that it runs at a constant speed, so the situation always happens at normal city speed and stays deterministic for a given set of inputs. The "first cue" timestamp is the first frame on which the cue is in line of sight (buildings occlude), within range and, for signs, seen less than 65° off its face.

## Replay and retry

- The recorder stores vehicle and pedestrian positions, indicators, brake lamps and the learner's inputs at 15 Hz (`src/game/sim/recorder.ts`).
- **▶ Погледни** replays the moment from an elevated observer camera, with a timeline showing the cue and decision timestamps. The replay **pauses at the first cue**. A pulsing marker shows what to look at, and a card shows what the learner did plus one plain-language sentence for next time. Tree crowns fade during replays so cues are never hidden.
- **„Пробај повторно“** restarts just before that moment, with a countdown and the same traffic setup: the same actors and the same adaptive rules, so identical inputs give an identical trace (tested). Retries never change the run's score.

## Code layout (built so a Centar route can be added)

```
src/game/content/debarMaalo.ts   route data: streets, frontages, parking, signs, markings, shops, hints, start/end
src/game/content/generate.ts     deterministic expansion → buildings, sidewalks, parked cars, synthetic plates
src/game/content/scenarios.ts    legal + teaching content, sources, feedback (no runtime logic)
src/game/sim/                    simulation (no DOM, no three.js): vehicle model, world collisions/line of sight,
                                 NPC cars & pedestrians, scenario runtimes + scoring predicates, recorder, autopilot
src/game/render/                 three.js: procedural textures, car meshes, people, world builder, camera/view
src/game/audio/audio.ts          procedural Web Audio (engine, relay click, cups, chair scrape, murmur, birds, horn)
src/game/engine.ts               loop and flow: title → intro → drive → outro → review ↔ replay/retry
src/game/host.ts                 completion event, challenge link
src/ui/                          React HUD (original analogue dial), touch controls, review/replay/sources panels
tests/scenarios.test.ts          headless verification of correct and incorrect actions
```

A new district needs a new `content/<route>.ts`, a new scenario list and runtime classes. The vehicle model, recorder, replay, review UI and renderer are route-agnostic.

## What was verified

**Automated (`npm test`, 13 tests, all passing).**

- A full lawful run of the loop finishes at the café in ~224 s of simulated time. It passes all four scored situations, records a cue for each, has no contacts and no speeding, and scores ≥ 80.
- A full run that never yields fails situation 1 (junction) and situation 2 (narrow street) and scores < 40.
- Per-situation retries:
  - Lawful passes situations 1, 2 and 3; reckless fails each of them (`fail` or `collision`, 0 points).
  - Situation 4: a timely signal passes (25); no signal gives `fail-signal` (15); a late signal (< 1.5 s) gives `fail-signal`; entering the one-way street gives `fail-route` (0).
- Two identical retries of situation 3 produce identical traces and cue times (same traffic setup).

**In the browser (dev server and production build).**

- **Title → intro.** The father's line, chair scrape, café clink, the woman with groceries walking past, and the engine crank. Control is handed over at ~5.5 s, and the intro can be skipped.
- **Keyboard driving.** Gas, brake, holding brake to engage reverse (reached −11.5 km/h), steering, indicators with relay click, and the camera toggle. The driver view was checked and adjusted.
- **Full run in the real page.** The scripted driver completed a run at 6–10× time scale. All situations passed, the outro played with the father's closing line, the review screen appeared, and `krug:complete` fired with the payload.
- **Replay.** It pauses at the first cue with the card. Continue, seek and restart all work, for both the lawful and the non-yielding run.
- **Retry.** The countdown runs, situation 3 is replayed, the result card appears, and the main run's score is unchanged.
- **Phone, landscape (740×360, touch emulation).** The pedals drove the car to 16 km/h, the ◀ button steered left, ⇦ turned the indicator on, and holding СОП stopped the car and engaged R. The HUD was rearranged so the dial no longer covers the car.
- **Phone, portrait.** The rotate prompt is shown.
- **Production build** (`npm run build`, served with `npm run preview`). The game runs, the challenge banner from `?challenge=78` shows, „Да те видам ти“ appears when hosted, the sources panel lists all sources, and the console has no errors.

**Not verified:**

- A real phone. Only touch emulation in a desktop browser was used.
- Frame rate on low-end devices.
- Every combination of free-form manual driving. The tests use a scripted driver.

## Legal references used (checked 2026-11-18)

- MVR — Закони: https://mvr.gov.mk/mk-MK/legislativa/zakoni
- **Закон за безбедност на сообраќајот на патиштата**, редакциски пречистен текст. It includes everything up to Сл. весник на РСМ 193/25: https://portal.mdt.gov.mk/post-body-files/zakoni-mvr-file-jL7k.pdf
  - Articles used: 17, 19, 25, 26, 35, 39, 41, 42, 48, 122, 187.
- Amendment Сл. весник на РСМ 193 of 18.9.2025: https://portal.mdt.gov.mk/post-body-files/zakoni-mvr-file-ibag.pdf. Checked: it does not amend any of the articles used.
- MVR — Полагање возачки испит: https://mvr.gov.mk/mk-MK/uslugi/polaganje-vozacki-ispit/polaganje-vozacki-ispit
- **Прирачник за полагање возачки испит** (MVR): https://portal.mdt.gov.mk/post-body-files/polaganje-vozacki-ispit-file-PfGR.pdf. Sign plates and names were taken from PDF pages 127 (102), 132 (205) and 138 (302.1, 305, 305.1).
- **Тестови со точни одговори** (MK): http://arhiva.mvr.gov.mk/vozacka-testovi/Testovi-so-tocni-odgovori/mk/prasanjaMK.htm. Questions 249, 307, 310, 316, 566 and 614 were used only as an educational reference. All in-game wording is original.

Where an international reference (DVSA, Zutobi) differs from these texts, Macedonian law is applied. Those references inform only the teaching method and pacing.

## Remaining gaps — please review before release

**For a Macedonian Category B instructor:**

1. **Situation 3, "стапуваат" (чл. 122 ст. 3).** Does a pedestrian standing at the kerb, facing the crossing, count as "stepping onto" it? The game currently scores passing them as a violation.
2. **Situation 3, when the driver may proceed.** The game allows it once the pedestrian has cleared the driver's lane plus 1 m. A stricter reading would require the whole carriageway to be clear.
3. **Situation 4, signal timing.** Is "≥ 1.5 s before the turn begins" an appropriate operational definition of "навремено" (чл. 25 ст. 2)?
4. **Situation 2, timing margins.** Please confirm the 0.5 s safety margin and the 4 m/s minimum speed used to predict whether the learner clears the narrow part first.
5. **Situation 1.** Please confirm that sign 102, with no other priority signs, makes a T/X junction "of equal importance" for scoring under чл. 41 ст. 1.

**Specifications not verified against an official text:**

- **Traffic-sign geometry.** The *Правилник за сообраќајните знаци, опрема и сигнализација на патот* (Сл. весник на РСМ 174/2020) could not be obtained. Sign meanings and artwork follow the MVR handbook plates. Exact dimensions, colours, mounting heights and placement distances are **not** verified, and the in-game signs are drawn slightly larger for screen readability.
- **Road markings.** The zebra (0.5 m bars), the dashed centre line (3 m / 3 m) and the arrows follow common European practice and are **not** verified.
- **Registration plates.** The layout is white with black characters, a blue left field with "NMK", 520×110 mm proportions, the `SK 1234-AB` pattern and a small red-yellow city badge. It is based on a secondary source (Wikipedia, which cites Сл. весник на РМ 107/2011 and a Government notice of 13.02.2019). The official rulebook text and typeface were not obtained. All plate numbers are synthetic. Regional visitor plates were left out because their current designs could not be verified.

**Product gaps:**

- No real-device test yet.
- No in-game language other than Macedonian.
- Audio is synthesised: original, but simple.
- Pedestrians and cars use low-poly procedural meshes rather than Blender GLB assets. The build pipeline accepts GLB later through `three/examples/jsm/loaders/GLTFLoader`.

## Assets and licences

- All geometry, textures (canvas-generated), sign artwork, cars, people and audio (Web Audio synthesis) are original to this project and created at runtime.
- No photographs, map data or OpenStreetMap geometry are used. All streets, businesses, people and plate numbers are invented.
- If OSM geometry is used for a future route, add the "© OpenStreetMap contributors" attribution and document the ODbL in this file.
- Dependencies: three.js (MIT), React (MIT), Vite (MIT), Vitest (MIT).

## QA hooks

The running page exposes `window.__krug` (the game engine):

- `__krug.qaInstantRun({ mode: 'lawful' | 'reckless', signal: true })` simulates a whole run instantly and opens the review.
- `__krug.setAutopilot({ mode: 'lawful', signal: true })` with `__krug.timeScale = 6` lets the scripted driver drive the real page.
- `__krug.startRetry('s1' | 's2' | 's3' | 's4')` jumps straight to a situation.

## Third-party resources (expansion)

| Resource | Licence | Use | Notes |
|---|---|---|---|
| Spectral GT-RS car (github.com/JaronKBragg7337/spectral-gt-rs) | CC0 1.0 | Guest vehicle `spectral` — **currently out of the garage** (`GUEST_VEHICLES` in `defs.ts`): the optimised shell has missing panels, takes no paint and its cabin is too low for first person | Optimised by `tools/blender/import_spectral.py`: removed hidden engine/suspension, text badges and plate text; selective decimation + planar dissolve; 152k → 31.5k tris, 4.7 → 1.7 MB; mapped to game conventions (Wheel_FL…, Paint, Glass, IndL/IndR, PlateMount_F/R). Physics uses its own `VehicleDef` (estimated, labelled). |
| 3d-tiles-renderer 0.4.10 (NASA-AMMOS) | Apache-2.0 | Optional Google 3D view, lazy-loaded | Not in the main bundle path until opened. |
| Google Photorealistic 3D Tiles | Google Maps Platform terms | Optional live **display only** („Google 3D поглед“ in the menu) | Never stored, converted, or used for collisions/scenario geometry. Shows "Google Maps" label + aggregated tile copyrights. Requires `VITE_GOOGLE_MAPS_API_KEY` in `.env.local` (see `.env.example`) with the Map Tiles API enabled; without it the button is disabled. Not verified with a live key. |
| Kenney City Kit Suburban / Roads | CC0 (licence files in `public/assets/kenney/`) | Open-road village houses, fences, trees and roadworks barriers/cones/lights (`src/game/render/kenneyProps.ts`) | Visual only; collisions stay in env data. 26 selected models + 2 colour maps (2 MB). Procedural meshes remain the fallback. Kenney road signs are not used (non-Macedonian designs). Source zips live in git-ignored `tools/assets/kenney/`. |
| mapforge (MIT) approach | MIT (not a dependency — it is an R3F browser app) | Reimplemented as `tools/osm/fetch-debar-maalo.mjs` → `src/game/content/osm/debar-maalo.json` | New free-drive environment „Реално маало (OSM)“: 1,302 buildings, 245 roads of real Debar Maalo. Data © OpenStreetMap contributors (ODbL 1.0), attribution shown in-game. No scored scenarios there (real signs/priority not modelled). |
| Needle car-physics | No licence stated | Reference only | Existing drivetrain/tyre model kept; no code copied. |

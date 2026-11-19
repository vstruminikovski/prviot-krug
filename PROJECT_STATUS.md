# PROJECT_STATUS — Круг низ маалото (driving-school simulator)

Last checkpoint: commit `55d10e3` (local, **not pushed** — the live GitHub Pages build is still the old Episode 1).
Tests: 26 passing (`npm test`): 14 vehicle-physics, 12 city scenarios with live traffic.

## What exists now (code-level, typechecks)

| Area | State | Files |
|---|---|---|
| Vehicle defs (7 families, original names) | Done | `src/game/vehicles/defs.ts` |
| Drivetrain: engine curve, clutch bite, 5+R gearbox, stall/restart, parking brake, slope gravity, engine braking, tyre model | Done, tested headless | `src/game/vehicles/vehicle.ts`, `tests/vehicle.test.ts` |
| Inputs per brief (Space/Z/X clutch curve, 1–5/N/6, P, R, J/K/M, U/I, F/G, V…) + touch | Written, **not yet play-tested by hand** | `src/game/input.ts`, `src/ui/Hud.tsx` |
| Rule registry (law / official exam sheets Образец 1 & 4 / technique / game) + incident ledger (3 layers) | Done | `src/game/rules/*` |
| Environments: Полигон (5 official чл. 33 exercises + 2 practice), Градско (Debar Maalo + lane graph traffic, signal crossing, zebra intents, delivery van), Отворен пат (bends, crest, descent, bridge, tractor, rockfall, roadworks, ambulance, viewpoint) | City scenarios tested headless; every env fuzz-tested (120 s random driving, finite state, valid result, determinism) | `src/game/env/*`, `src/game/missions/*`, `src/game/traffic/*` |
| Blender pipeline: generator → 7 GLBs with named parts, loads in game, live paint | Done (proof quality) | `tools/blender/*`, `public/assets/vehicles/*.glb`, `src/game/render/vehicleAssets.ts` |
| Garage (orbit, paint/finish, trims, plate + layout, load, comparison, favourites) | Works in browser | `src/ui/Garage.tsx`, `src/game/render/garage.ts` |
| Real-scene mirrors (rounded glass panels, round-robin render) + glance observation proxy | Visually checked | `src/game/render/view.ts`, `engine.ts` |
| Menu / results (layers, exam total, incident timeline, replay, same seed / new variation, share code) | Written; menu & garage seen working | `src/ui/*` |

| Presentation (2026 pass): fixed-step render interpolation, spring suspension, rigid chase / high / driver cameras with anticipation, camera x-ray cut-out, GTAO + MSAA + bloom + display-space grade with tilt-shift, time-of-day env reflections, cinematic intro, 60 fps spring gauges, synthesized 4-cyl engine + tyre/wind/rumble audio | Done; verified by stepped frames (pane was hidden — real-time feel still to be judged by hand) | `src/game/render/{view,atmosphere,xray}.ts`, `src/game/audio/audio.ts`, `src/ui/Hud.tsx` |
| Robustness: UI error boundary, WebGL context-loss recovery, frame-error streak → menu, NaN guard in sim | Done | `src/ui/ErrorBoundary.tsx`, `src/ui/App.tsx`, `src/game/engine.ts`, `src/game/sim/sim.ts` |

## Rough map of remaining work

**Slice A — verify what's written (next)**
1. Hand-drive polygon with keyboard: launch, stall, hill start, parking; fix tuning (bite speed, steering feel, camera).
2. Check mirrors, driver view per vehicle, open-road terrain/road alignment, signal lamps.
3. Headless tests: polygon exam scoring (each Образец 1 item fires once), open-road goals, truck limits.

**Slice B — feel & readability**
- Camera settling, wheel/pedal/gear-lever agreement, engine/clutch audio, sign sizes, phone layout of new HUD.

**Slice C — content depth**
- Scenario template/generator layer over the existing families (seeded variants, workload budget, validator over N seeds).
- Coverage map of the 100 catalogue variants → family / preset / status (honest: implemented / partial / not yet).
- Police-officer junction, door-opening, bus stop, roundabout, dusk/fog, lane changes (missing).

**Slice D — art pass**
- Modular Blender street kit (facades, shop fronts, balconies, awnings, props) replacing procedural boxes; palette pass (peach/mint facades, teal shadows); hero-car detail pass.

**Slice E — ship**
- Production build, push, Pages deploy, README rewrite (bindings, verification, legal refs, instructor-review list).

## Resources that would help most
- Reference photos of Debar Maalo streets / facades (owned or licensed).
- Any licensed glTF vehicles or street props, with licence text.
- Fonts/audio you want used (licensed), or engine/indicator recordings.
- Confirmation from a Category B instructor on the `needsInstructorReview` rules (listed in-game under „Извори и правила“).
- Official text of the sign rulebook (Сл. весник 174/2020) and plate rulebook, if you have access.

## How to run
`npm install` · `npm run dev` · `npm test` · Blender assets: see `tools/blender/generate_vehicles.py` header.

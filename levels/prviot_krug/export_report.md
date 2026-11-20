# MapNG BeamNG Level Export Report

## Summary
- Level display name: prviot-krug
- Level folder name: prviot_krug
- Regional look (worked out from the place; the ground textures, lamps, rocks and ground cover follow it): Italy
- Export started (UTC): 2026-11-20T18:46:02.841Z
- Report generated (UTC): 2026-11-20T18:46:17.405Z
- Processing time before ZIP compression: 14.56 s
- Session config (paste into MapNG): mapng:1:XVTBctowEP0XnT0ZMA4JvjUlTWdSChNI22kmh7W1Niqy5JFkDM3k37OSwUBOnn1a7b59--Q3ZvM1VvALjRVasXQYsUpzZCmzQpUSWcRyVA4NS9-YBMfSJL4aDEbJTZLEg2SSDCYRk6pkaTy8SobxOB7ejMbX8TiZjN4j9l_rioqOI2bQatm4rskgTiImVC4bjvPljKXONBgxlLgFn7LUjck9iQpq6r3WRhGRxuLz8mHJ0gKkxRA_LP78PY8fn-Y_b8c9Uhudo_WTzJDq2AWahdihDHMaaFdoDAjV55dQfxNS9u2pKZ3IDPJNj1kHioPh7IzvsxJuvqViIkgHjdN0DHwLKkc-C4IeWmhKc43Bu0ZITsTscfgKwRL-pIH_Ftyt-4NWm00hdUuFqR-Rp8a7WhvnV5KBxRXufEU6X-8zokAJpdGN4jOgoQX1pSNtK8INVfcRxxx8oewzixbCrrvAGcT-pNC0QjdFZYXbUwmlTRVqbAW2U-Flyc-GJ-U3_V0LBX6Fuo_zxmTfUZRrdymop7dsTAGh0pFk-C5J2hakr3lQMqMJJc5prp6hJJno_hb3RwysbSpcgNkIb9LjVVKpPI3mGqVQft4EvwtZHc9TbmeZey48xsgdxNCuocbeTIeZPfbU6X2G3F22Dpi3Tk1MP8GrS1oBu985A5fQFB0IeYS8V7nRNXErpc5AjgZ-8RbhhzfPvCgskuoDWoKmd60cISx9odcgZAt7-yWjbWiFnL16n4UnugJvkJfXzhGPQnHb3Togyzbs9hh6v8tTBllU5Asyj-8bBKMfQ62F8gK-vDEybMryPZT_EiJKe_KxraH1b15BdXiIp5_P9WgyPv_p3NzG1xFbI_CwYxpN2CkW0EjXqfL--v4B

## Terrain
- Requested resolution: 1024 px
- Requested processing resolution: 1.000 m/px
- Source processing resolution used: 1.000 m/px
- Exported terrain size: 1024 x 1024 px
- Terrain texture size: 2048 x 2048 px
- Height range min/max: 247.23 m / 256.81 m
- Height difference: 9.58 m
- Terrain height step: 0.1 mm (the game stores terrain heights in 16 bits, so the smallest step is the map's height difference / 65,535)
- Scale: 1.000 m/px
- World size: 1024.00 m x 1024.00 m
- Total area: 1048576.00 m^2 (1.049 km^2)
- Center coordinates: 42.003474, 21.412622
- Bounds north/south/east/west: 42.008120, 41.998829, 21.418861, 21.406404
- Elevation source used: Best free (Mapterhorn): no lidar here, global 30 m (AWS Terrain Tiles) used
- Ground under buildings (global 30 m): not needed, the elevation here is bare earth already
- Source GeoTIFF source: n/a
- Normalized terrain size for BeamNG (square power-of-two): No
- Terrain samples (valid/no-data/total): 1048576/0/1048576
- Terrain no-data ratio: 0.00%
- Terrain sample warning: none

## Selected Export Options
- Base texture: hybrid
- Include buildings: Yes
- Include bridges & overpasses: Yes
- Include tunnels: Yes
- Terrain shaping at export (master): Yes
- Shape terrain under roads / at bridges / at overpasses / at tunnels / sidewalks+lakes+car parks / fine ground detail (global 30 m): Yes / Yes / Yes / Yes / Yes / Yes
- Raw terrain at data generation: No
  (details: "Terrain Shaping and Structures" below)
- Include backdrop: Yes
- PBR materials: Yes
- PBR source requested: osm
- PBR source used: osm
- Include water: Yes
- Measured bridge heights (US lidar): Yes
- Include native barriers: Yes
- Safe caps on content: Yes (at most 20000 buildings, 50000 barriers, 20000 streetLamps, 5000 benches, 8000 poles, 200 fuelStations, 4000 tunnelLights, 75000 forestPerType, 650000 forestTotal, 250000 forestPerArea)
- Include trees/bushes: Yes
- Forest density: normal (×1.5 the base tree rates; woods ~54 trees/ha)
- Include rocks: Yes
- Street parking assumed where none is mapped: No
- Map data bundled for bug reports (in export_report.json): Yes: 2225 features, 0.9 MB, checksum 088d3df8094fb0, bounds N 42.0081198283681 S 41.998828670911365 E 21.41886132316271 W 21.406403607562424 (in export_report.json; its source: "OSM Request Metadata" below)
- Roads follow the lidar survey's slope: no (coarse elevation here: class grades)
- View distance: auto (the map's width, 4 km at least, 16 km at most) (LevelInfo visibleDistance)
- Road surfaces: decal roads
- Include sidewalks: Yes (as meshes: raised slabs with curbs, 15 cm high)
- What to build, switched off: railwaysAbandoned
- OSM features left out for them: 0

## Generated Content
- Terrain materials written: 10
- DecalRoad groups (one per road name; DecalRoads under Roads below): 342
- Barrier folders: 1
- Barrier TSStatic objects: 1966
- Water objects generated: 47
- Forest placement groups: 21
- Forest placement files: 21
- Forest placements total: 731
- Left out by land cover (© ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (CC BY 4.0)): 887 trees (of mapped woods, or seen as canopy in the imagery) where it sees no tree cover, 0 bushes on rock, snow or water, 0 scattered trees on bare ground
- Ground cover objects: 5
- OSM DAE written: No
- Backdrop DAE written: Yes
- Backdrop textures written: 8
- MapNG flag asset written: Yes

## Surrounding Backdrop Diagnostics
- Requested surrounding tiles: 8
- Built surrounding tiles: 8
- Direct elevation tiles: 8
- Flat-fallback tiles: 0
- Skipped tiles: 0
- Flat-fallback threshold (no-data ratio): 25.00%
- Tile NW: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%
- Tile N: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%
- Tile NE: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%
- Tile W: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%
- Tile E: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%
- Tile SW: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%
- Tile S: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%
- Tile SE: mode=direct, valid=1048576, no-data=0, total=1048576, no-data ratio=0.00%

## Spawn and Quicktravel Points
- Point 1 (default spawn): off road, x 426.82 y 211.8 z 3.17, heading 0°; no drivable road within reach: on the ground where placed

## OSM Analysis
- Source OSM features before bounds filter: 2225
- OSM features after export filter: 2223
- Roads: 490
- Buildings: 1069
- Water features: 2
- Vegetation points/features: 247
- Landuse features: 222
- Point/line/polygon split: 397/536/1290

## Processing Timeline
- duration, share of the time so far, and where the progress bar stood when the step began
- Preparing 1024×1024 terrain and 2225 OSM features…: 54 ms (0.4% of the time; bar at 0%)
- Adding fine ground detail by land cover (global 30 m terrain)…: 50 ms (0.3% of the time; bar at 1%)
- Reading measured bridge heights (US lidar survey)…: 50 ms (0.3% of the time; bar at 2%)
- Laying out 490 OSM roads: DecalRoads, lane markings, junctions, bridge decks and tunnels, and shaping the terrain under them…: 540 ms (3.7% of the time; bar at 22%)
- Building sidewalks, curbs and ramps along 216 carriageways…: 2.85 s (19.5% of the time; bar at 32%)
- Placing street props (hydrants, bins, benches, utility poles, power lines) and traffic signals…: 29 ms (0.2% of the time; bar at 40%)
- Generating the satellite hybrid base texture for the 1024×1024 terrain…: 437 ms (3.0% of the time; bar at 40%)
- Painting terrain materials from OSM land use (1024×1024 layer map)…: 233 ms (1.6% of the time; bar at 41%)
- Writing the terrain binary (terrain.ter, 1024×1024 heights + material layers)…: 71 ms (0.5% of the time; bar at 43%)
- Encoding the 16-bit heightmap PNG (1024×1024)…: 67 ms (0.5% of the time; bar at 45%)
- Rendering the level preview thumbnail…: 37 ms (0.3% of the time; bar at 46%)
- Building the surrounding backdrop (global 30 m elevation + satellite imagery, 8 tiles)…: 1.00 s (6.9% of the time; bar at 46%)
- Building textured 3D buildings (1069 OSM footprints)…: 1.10 s (7.6% of the time; bar at 80%)
- Building water: sea level plane, lakes and rivers…: 16 ms (0.1% of the time; bar at 85%)
- Placing barriers, fences, road signs, traffic lights, lamps, benches and fuel stations…: 392 ms (2.7% of the time; bar at 85%)
- Planting trees and bushes where the land cover (ESA WorldCover) has them, rocks, ground cover and props…: 28 ms (0.2% of the time; bar at 89%)
- Loading bundled assets (MapNG flag, reflection cubemap)…: 7.42 s (51.0% of the time; bar at 90%)
- Assembling the level files (levels/prviot_krug/…)…: 184 ms (1.3% of the time; bar at 90%)

## OSM Request Metadata
- endpointCandidates: ["https://lz4.overpass-api.de/api/interpreter","https://overpass-api.de/api/interpreter","https://overpass.private.coffee/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.openstreetmap.ru/api/interpreter"]
- method: POST
- output: json
- timeoutSec: 30
- maxSize: 134217728
- bbox: {"south":41.998828670911365,"west":21.406403607562424,"north":42.0081198283681,"east":21.41886132316271}
- endpointUsed: mapng-osm-tiles
- osmSnapshot: 2026-11-02
- elementCount: 18398
- overtureBuildings: {"release":"2026-10-21.0","heightsAdded":0,"footprintsAdded":78}
- attribution: © OpenStreetMap contributors, Overture Maps Foundation (overturemaps.org)
- startedAt: 2026-11-20T18:42:18.722Z
- completedAt: 2026-11-20T18:42:21.834Z

## Environment
- MapNG build: 5c46066 (2026-11-20T17:24:07.695Z)
- Browser: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15
- CPU threads: 8, device memory: n/a
- JS heap at report time: n/a
- Disk streaming for the ZIP (OPFS): available

## Terrain Shaping and Structures
- All defaults: the terrain was shaped for roads, bridges, overpasses, tunnels, sidewalks and lakes as usual.

### Data generation (before the export)
- Raw terrain: off (roads snapped, smoothed and levelled into the terrain at generation)

### Structures built
- Bridges & overpasses: on (0 deck(s) built)
- Tunnels: on (0 built)

### Terrain shaping at export
- Master switch: on
- Under roads (ground levelled to each road's smoothed profile, with side slopes): on
- At bridges over water and valleys (approach embankments, abutment fill, ground kept clear under the deck): on
- At overpasses over roads (the same, for decks over another road): on
- At tunnels (portal cuttings, headwall backfill, cut-and-cover cover): on (portal holes always open: they change no height)
- Sidewalks, lake beds and car parks (ground under curbs and slabs, lake beds deepening away from the shore, multi-storey car park decks): on

### What the switches did here
- Road stations held on the ground: none (every road shaped as usual)
- Terrain grid points shaped for roads and structures: 330631
- Ground under sidewalks graded: 58600 grid point(s)
- Lake bed grid points dug: 1208
  - Unnamed lake: 1.5 m at its deepest (the shore's slope 1% carried under the water), 8 m from the nearest shore there
- Measured bridge heights (US lidar): not used, no survey here (USGS 3DEP covers the US)

## Roads
- Street widths measured between the buildings along them (no width tag in OSM): 8 of 490 roads; median 9.0 m curb to curb (lanes keep their class width; parking and shoulders give way or grow)
- OSM road ways in the map: 490
  - footway: 221 ways, 15.57 km, 3 bridge
  - residential: 71 ways, 8.91 km
  - service: 113 ways, 7.85 km
  - tertiary: 52 ways, 6.21 km
  - pedestrian: 4 ways, 0.51 km
  - living_street: 4 ways, 0.42 km
  - cycleway: 6 ways, 0.42 km
  - tertiary_link: 12 ways, 0.32 km
  - steps: 7 ways, 0.05 km
- Road groups (one per road name): 342
- DecalRoad objects: 1715 (drivable, in the AI road graph: 216)
- DecalRoad nodes: 33413
- DecalRoads by material:
  - road_asphalt_2lane: 568
  - gutter1: 516
  - m_line_white: 355
  - m_line_white_discontinue: 141
  - mapng_road_pavers: 76
  - italy_road_markings_zebra: 28
  - road_invisible: 19
  - m_dirt_road: 10
  - road1_concrete: 2
- Carriageways (paint cut / sidewalk input): 216
- Crosswalk zones: 36
- Pedestrian streets drawn (highway=pedestrian, no traffic): 1 piece(s)
- Service roads drawn (driveways, parking aisles, alleys; no traffic): 108 piece(s), 7.86 km
- Footpaths, cycleways and trails drawn (beside a street's raised sidewalk left out): 210 piece(s), 15.33 km
- Stone and brick paving (surface=sett/cobblestone/unhewn_cobblestone/paving_stones/bricks) is laid in strips about one texture tile wide: mapng_road_* materials, art/roads/main.materials.json.

## Structure checks
- How well roads, bridges and tunnels fit together and the terrain around them. 0 is the goal for every count; "at" is world x, y in metres (F11 world editor coordinates).
- Steps where roads meet (ends > 0.1 m apart in height): 0 of 348 joints
- Steeper than the road class allows: 0 stretch(es) on bridges/tunnels; 0 stretch(es) on ground roads
- Grade-separated crossings short of their clearance (6.5 m, or a tunnel's roof under a street; deck top over the road under it): 0 of 0
- Ground road nodes floating over / buried in the terrain (> 0.5 m): 0 of 7933
- Terrain over a deck's road surface or up into its clear underside: 0 of 0 samples
- Terrain spikes / pits near structures (> 2 m off their 3×3 median): 0 of 0 pixels
- Road surface (the terrain the road smoothing left under ground roads):
  - Bumps / dips along roads (grade changing more than the class allows within 6 m): 0 of 6416 points
  - Tilted (> 8%) or humped (> 0.2 m) across the road: 0 of 2634 cross-sections
  - Junction centres bumped or dipped (> 0.25 m off the roads 12 m out): 0 of 72 junctions
  - Creases just outside road edges (ground slope changing > 30% between 1-4 m and 4-8 m out): 0 of 5268 points
- Structure solver graph: 316 nodes, 404 edges (0 bridge, 0 tunnel), 9032 stations; 2 joints where a road goes onto a bridge, into a tunnel or changes layer, 187 junctions (0 mixing layers), 64 dead ends, 46 roads leaving the map
- Structure solver crossings: 0 grade-separated (0 by OSM layer, 0 by bridge tag, 0 by tunnel tag), 0 ground roads crossing level that OSM did not join; 0 bridge run(s) over water (0 ship channel)
- Structure solver classes: all ground; 0 bridge tag(s) over nothing (culverts), 0 untagged stretch(es) that need a deck, 0 tunnel tag(s) too shallow for a roof (open cutting)
- Structure solver v2 TERRAIN APPLIED (test switch): 330631 pixels, 0 held under decks, 0 on retaining-wall steps, 0 road-core pixels under a deck too low over them (not dug), 220 ms; under the solver's roads: 0 bumps/dips, 0 tilted/humped cross-sections, 0 of 185 junction centres off
- Structure solver profile (6 rounds, 53 ms): steps 0, too steep 0, short crossings 0 of 0; remaining violations: joints 0 m, crossings 0 m, grade +0, water 0 m, tunnel cover 0 m
- Checked in 8 ms.

## Structures (solver)
- Every road's height solved at once (joints level, crossings cleared, grade limits per class, bridges over water, tunnel cover), then each stretch classed from its height over the ground and its tags; the terrain is composed once from the result.
- Bridge tags over nothing (culverts, no deck): 0; approaches carried on as decks where a fill would reach a road below: 0 station(s); untagged stretches that needed a deck: 0 (over water 0, over a road or railway 0, a fill would reach a road below 0, only high over plain ground 0: 0 m)
- Left unmet by the solve (0 is the goal): joints 0 m, crossings 0 m short, grades +0 over the limit, water clearance 0 m short, tunnel cover 0 m short
- Terrain: 330631 pixels composed in 220 ms, 0 held under decks, 0 despiked, 0 on retaining-wall steps, 0 road-core pixels under a deck too low over them

## Bridges
- Bridge decks: 0, approach embankments built: 0
- Decks carried on along their approach roads to climb what they cross (walled ramps): 0
- Roads sunk into a cutting under a deck that could not clear them: 0
- Overpasses baked into the elevation, cut out under the deck: 0
- Heights are absolute (m above sea level); "ground" is the exported terrain under the point.
- An abutment far from its ground means the deck meets its road above/below the terrain: look there first.

## Tunnels
- Tunnels built: 0 (0 cut and cover, 0 galleries); tunnel=yes roads left on the ground: 0; portal hole squares: 0
- Drivable tunnel=yes and tunnel=avalanche_protector roads are built (building passages, culverts and covered ways stay as they were).
- A bored tunnel needs the ground over its road by the tube height + 1.5 m along most of it; short dips are filled over the tube.
- One mapped under flat ground (a city deck, an underpass) is cut and cover: a box 0.8 m under the street, its approaches in trenches.
- On a hillside without the rock over it (and tunnel=avalanche_protector) a gallery: a roof on valley-side columns, the hillside brought up to the roof as its back (backfilled where the slope is lower), the road where it is.
- Ramps joining inside a tunnel share its bore: it widens on their side to the portal; past the shared cutting they climb out in their own trench.

## Railways
- No railway built (none in the map data, or the structure solver off). Lines of railway=rail, light_rail, subway (above ground), tram, narrow_gauge, monorail and funicular are built, and disused, preserved and abandoned lines as the kind they were (each can be left out in What to build); razed, construction and proposed ones are not.

## Buildings
- OSM building footprints: 1069, built: 1066
- Skipped: invalid geometry 0, under 4 m² 3, over 50,000 m² (non-industrial) 0, no terrain under them 0, over the building cap 0, bridge piers / towers mapped as buildings (drawn by the bridges) 0
- Shapes: 16 building tile(s) (each a full detail level near the camera and a lite one from about 400 m: no laid-over windows, soffits or small details), 16 full mesh(es), 190288 triangles; collision: the lite walls and roofs
- Floors: min 1, mean 2.4, max 14
- Eave height: min 3.0 m, mean 7.4 m, max 42.0 m
- Heights from: OSM tags 149, Overture (Microsoft / Google ML) 0, the median of tagged neighbours of the same kind within 120 m 197, estimated from class and size 720
- On sloping ground: 0 footprint(s) span more than 3 m of terrain (max 2.5 m; their plinth reaches the lowest corner)
- Shop fronts: 58, offices: 0, courtyards (inner rings): 5
- Details: parapets 333, shop awnings / fascias 214, verandas 0, door hoods 0, front steps 126, chimneys 82, roof plant pieces 589, church towers 1, domes 0, silos / tanks 0, passage openings 9, castles / forts 0 (merlons 0, sentry boxes 0, corner towers 0, gates 0)
- Building uses with their own look (from the building's tags or a point inside it): pub 3, restaurant 12, hotel 5, fast_food 10, cafe 9, bar 3; historic 0. Hotel canopies 3, flags 0, rooftop signs 1; pub signs 6; café signs 8; string courses 5
- Floodlights (poles by kind of venue, grandstand downlights; OSM lit=no respected, road courses and off-road tracks only with lit=yes): field 14, court 37
- Sports fields (OSM leisure=pitch / track by sport=*: surface by surface=* or the sport's usual one, regulation markings scaled to the mapped size, goals, posts, hoops, nets, fences): soccer 4, basketball 8, beach_volleyball 1, tennis 4
- Seating (building=grandstand, leisure=bleachers: tiered seats facing the nearest field): bleachers 1
- Fountains (OSM amenity=fountain / drinking_water, by kind from fountain=* and shape: stone basins with water, bowls, jets, obelisks, pools, wall spouts, splash pads, drinking posts): bubbler 1
- Kinds:
  - house: 533
  - block: 407
  - shed: 126
- OSM building=* classes:
  - yes: 579
  - apartments: 222
  - house: 100
  - garages: 54
  - residential: 34
  - detached: 15
  - university: 14
  - office: 9
  - retail: 7
  - school: 5
  - roof: 5
  - greenhouse: 4
  - commercial: 3
  - garage: 3
  - kindergarten: 2
  - public: 2
  - civic: 1
  - chapel: 1
  - sports_hall: 1
  - kiosk: 1
  - hospital: 1
  - supermarket: 1
  - hotel: 1
  - container: 1
- Roofs:
  - flat: 451
  - hipped: 316
  - gabled: 299
- Wall materials:
  - facade: 364
  - stucco: 235
  - plaster: 158
  - rendered: 98
  - siding: 35
  - cladding: 30
  - stone: 21
  - stoneClean: 20
  - stoneMixed: 20
  - blockwall: 20
  - panel: 20
  - stoneFacade: 15
  - concrete: 13
  - claddingOld: 8
  - brickEca: 4
  - brickDark: 2
  - brick: 2
  - brickPainted: 1
- Buildings on roads (each footprint checked against the roads' driving lanes; tunnels, building passages, covered ways, bridges, driveways and parking aisles never count):
  - Machine-learned / cadastre outlines (Overture, no OSM source) on a road, left out: 2
  - OSM buildings reaching into the lanes, cut back along the lanes' edge: 23 (OSM buildings are never left out)
  - OSM buildings largely on a road, kept as mapped: 0

## Sidewalks and Street Furniture
- Sidewalk curb runs: 368, raised walkways away from the curb: 217, piers and footbridges: 3, gangways: 0 ramps + 0 stairs, meshes: 4, triangles (with medians): 138708
- Sidewalks on the terrain: 0 of 3013 samples floating, 0 buried; ground graded under them: 58600 pixels
- Divided-road medians: 22 island run(s), 3.22 km of curb, on 20 carriageway(s)
- Street props placed: 0 hydrants, 0 bins, 8 benches, 0 utility poles (0 of them lattice towers on high-voltage lines), 0 power line spans
- Utility poles: only the ones OpenStreetMap maps. Pole lines along country roads are added where they are the norm (North America, Japan, Australia, New Zealand), not here.
- Mapped in OSM: 0 hydrants, 2 bins
- Traffic signals: 31 signal instances, 25 controllers, 7 sequences, 82 signal objects
- Road signs: 116
  - one_way: 46
  - no_entry: 27
  - priority_road: 21
  - give_way: 14
  - chevronRight: 5
  - speed: 3
- Barriers / fences: 1966
  - fence_pedestrian.dae: 1608
  - italy_wall_stone.dae: 296
  - italy_wall_concrete.dae: 34
  - ind_mesh_fence_gate_3m.dae: 16
  - farm_gate_metal1.dae: 9
  - italy_bld_boomgate_6.5m.dae: 1
  - italy_bld_boomgate_4.5m.dae: 1
  - farm_gate_wood1.dae: 1
- Lamps, benches and other furniture: 1065
- Mapped objects placed from the model picks (bus stops with and without a shelter, post boxes, picnic tables, flagpoles, recycling bins, information boards): 9 busShelter, 16 bikeStand, 6 dumpster, 3 recyclingBin, 2 artworkStatue, 1 toilets, 6 artworkSculpture, 2 billboard
  - SpotLight: 346
  - fence_pedestrian.dae: 288
  - eca_lamppost.dae: 173
  - pole_light_single.dae: 122
  - hr_stadium_lights.dae: 51
  - clutter_city_bench_wood.dae: 16
  - clutter_city_bike_stand.dae: 16
  - R_HS_A_ST_01_130X60.dae: 15
  - italy_city_busstop.dae: 9
  - eca_comsign_cafe.dae: 8
  - italy_clutter_dumpster.dae: 6
  - italy_castle_statue.dae: 6
  - italy_clutter_sorting_bin.dae: 3
  - jri_observatory_statue.dae: 2
  - billboard_10x5.dae: 2
  - … 2 more
- Fuel / charging station objects: 6
- Open gates and openings: 6 farm, 2 gap, 2 boom, 5 mesh, 6 smallMesh, 1 wood
- Bollards (OSM barrier=bollard): 0 placed (0 concrete), 2 on drawn roads left out, 0 under bridges
- Curve warnings from road geometry: 5 signs (5 chevronRight)
- Traffic calming placed: 0 bump, 0 hump, 0 table, 0 cushion (0 objects, 0 chevron decals, 0 warning signs)

## Vegetation
- Forest item types: 21, placements: 731
  - holm_oak_city_small: 60
  - mapng_tree_tree_oak_sml_b: 54
  - mapng_tree_tree_beech_forest_a: 53
  - mapng_tree_tree_beech_large_c: 51
  - mapng_tree_tree_aspen_small_a: 50
  - mapng_tree_tree_aspen_small_c: 49
  - mapng_tree_tree_oak_large_a: 44
  - mapng_tree_tree_beech_large_b: 44
  - mapng_tree_tree_oak_large_c: 41
  - mapng_tree_tree_aspen_forest_b: 41
  - mapng_tree_tree_oak_forest_a: 40
  - mapng_tree_tree_oak_large_b: 38
  - mapng_tree_tree_oak_sml_a: 36
  - mapng_tree_tree_beech_small_c: 36
  - mapng_tree_tree_oak_forest_b: 36
  - mapng_tree_tro_tree_1_filler: 14
  - mapng_tree_tro_bush_huge: 12
  - mapng_tree_tro_tree_2_filler: 10
  - mapng_tree_tro_bush_2_small: 10
  - mapng_tree_tro_tree_1_huge: 10
  - mapng_prop_bin_round: 2
- Ground cover objects: 5
  - mapng_grass_cover (material GrassMiddle)
  - mapng_weed_cover (material mapng_gc_undergrowth)
  - mapng_flower_cover (material mapng_gc_undergrowth)
  - mapng_dry_grass_cover (material mapng_gc_grass_dry)
  - mapng_lawn_cover (material mapng_gc_grass_mown)

## Water
- Water objects: 47
  - WaterBlock: 43
  - River: 3
  - WaterPlane: 1
- Water over the backdrop (the lakes, ponds and rivers round the map): 6 lake WaterBlocks in 2 lakes, 3 rivers

## Terrain Materials
  - 0: DefaultMaterial — 1.80% of the terrain
  - 1: Grass — 23.63% of the terrain
  - 2: Dirt — 0.63% of the terrain
  - 3: BeachSand — 0.00% of the terrain
  - 4: ROCK — 0.00% of the terrain
  - 5: asphalt — 20.41% of the terrain
  - 6: GRAVEL — 2.53% of the terrain
  - 7: Concrete — 7.09% of the terrain
  - 8: DirtGrass — 3.11% of the terrain
  - 9: Lawn — 40.81% of the terrain

## Job Console Log
- 177 line(s) from the start of the export to this report (ZIP compression follows it).

```text
[    0.03s] LOG   [BeamNG Export Service] Start exportBeamNGLevel
[    0.03s] LOG   [BeamNG Export Service] Input summary: {"center":{"lat":42.00347442049409,"lng":21.412621736526493},"terrainWidth":1024,"terrainHeight":1024,"hasBounds":true,"osmFeatureCount":2225,"options":{"baseTexture":"hybrid","includeBuildings":true,"includeBackdrop":true,"includeWater":true,"seaLevelOffset":0,"includeNativeBarriers":true,"safeCaps":true,"includeTrees":true,"includeRocks":true,"backdropElevationSource":"global30m","includeBridges":true,"includeTunnels":true,"shaping":{"roads":true,"bridges":true,"overpasses":true,"tunnels":true,"extras":true,"master":true},"roadType":"decal","levelName":"prviot-krug","pbrSource":"osm"}}
[    0.03s] LOG   [BeamNG Export Service] Step {"step":"Preparing 1024×1024 terrain and 2225 OSM features…","pct":0}
[    0.03s] LOG   [BeamNG Export UI] Progress: {"step":"Preparing 1024×1024 terrain and 2225 OSM features…","pct":0}
[    0.03s] LOG   [BeamNG Export Service] Street parking not assumed: 115 street(s) built at their driving width.
[    0.08s] LOG   [BeamNG Export Service] Buildings on roads: 2 ML outline(s) left out, 23 OSM building(s) cut back from the lanes, 0 largely on a road kept as mapped.
[    0.08s] LOG   [BeamNG Export Service] Step {"step":"Choosing the regional look and road rules for this location…","pct":0}
[    0.08s] LOG   [BeamNG Export UI] Progress: {"step":"Choosing the regional look and road rules for this location…","pct":0}
[    0.08s] LOG   [BeamNG Export Service] Regional look: Italy (Mediterranean).
[    0.08s] LOG   [BeamNG Export Service] Road rules: North Macedonia (MK), right-hand traffic, EU signal cycle.
[    0.08s] LOG   [BeamNG Export Service] Step {"step":"Adding fine ground detail by land cover (global 30 m terrain)…","pct":1}
[    0.08s] LOG   [BeamNG Export UI] Progress: {"step":"Adding fine ground detail by land cover (global 30 m terrain)…","pct":1}
[    0.13s] LOG   [BeamNG Export Service] Fine ground detail: 39% of the terrain, up to 0.38 m; 0 mapped cliff(s) sharpened.
[    0.13s] LOG   [BeamNG Export Service] Step {"step":"Reading measured bridge heights (US lidar survey)…","pct":2}
[    0.13s] LOG   [BeamNG Export UI] Progress: {"step":"Reading measured bridge heights (US lidar survey)…","pct":2}
[    0.18s] LOG   [BeamNG Export Service] Lidar decks: skipped: no survey here (USGS 3DEP covers the US)
[    0.18s] LOG   [BeamNG Export Service] Step {"step":"Laying out 490 OSM roads: DecalRoads, lane markings, junctions, bridge decks and tunnels, and shaping the terrain under them…","pct":22}
[    0.18s] LOG   [BeamNG Export UI] Progress: {"step":"Laying out 490 OSM roads: DecalRoads, lane markings, junctions, bridge decks and tunnels, and shaping the terrain under them…","pct":22}
[    0.19s] LOG   [BeamNG Export Service] Step {"step":"Joining the roads into one network…","pct":22}
[    0.19s] LOG   [BeamNG Export UI] Progress: {"step":"Joining the roads into one network…","pct":22}
[    0.21s] LOG   [BeamNG Export Service] Step {"step":"Finding where roads cross over and under each other…","pct":23}
[    0.21s] LOG   [BeamNG Export UI] Progress: {"step":"Finding where roads cross over and under each other…","pct":23}
[    0.23s] LOG   [BeamNG Export Service] Step {"step":"Planning tunnels and their approaches…","pct":23}
[    0.23s] LOG   [BeamNG Export UI] Progress: {"step":"Planning tunnels and their approaches…","pct":23}
[    0.24s] LOG   [BeamNG Export Service] Step {"step":"Working out which roads are bridges…","pct":23}
[    0.24s] LOG   [BeamNG Export UI] Progress: {"step":"Working out which roads are bridges…","pct":23}
[    0.24s] LOG   [BeamNG Export Service] Step {"step":"Planning tunnels and their approaches…","pct":23}
[    0.24s] LOG   [BeamNG Export UI] Progress: {"step":"Planning tunnels and their approaches…","pct":23}
[    0.24s] LOG   [BeamNG Export Service] Step {"step":"Setting road heights along the whole network (bridges, ramps, junctions)…","pct":23}
[    0.24s] LOG   [BeamNG Export UI] Progress: {"step":"Setting road heights along the whole network (bridges, ramps, junctions)…","pct":23}
[    0.30s] LOG   [BeamNG Export Service] Step {"step":"Drawing the road surfaces and lane markings…","pct":25}
[    0.30s] LOG   [BeamNG Export UI] Progress: {"step":"Drawing the road surfaces and lane markings…","pct":25}
[    0.35s] LOG   [BeamNG Export Service] Step {"step":"Painting junction markings (stop lines, crosswalks)…","pct":25}
[    0.35s] LOG   [BeamNG Export UI] Progress: {"step":"Painting junction markings (stop lines, crosswalks)…","pct":25}
[    0.37s] LOG   [BeamNG Export] Junction markings: 28 stop bars, 36 crosswalks
[    0.37s] LOG   [BeamNG Export Service] Step {"step":"Trimming paint and surfaces where roads meet…","pct":25}
[    0.37s] LOG   [BeamNG Export UI] Progress: {"step":"Trimming paint and surfaces where roads meet…","pct":25}
[    0.38s] LOG   [BeamNG Export] Paint cut at crossing roads: 136 lines/blends → 125 pieces (6 removed entirely).
[    0.41s] LOG   [BeamNG Export] Surfaces cut at other surfaces: 9 decals trimmed, 3 junction mouths in the cross street's surface.
[    0.41s] LOG   [BeamNG Export Service] Step {"step":"Shaping the terrain under the roads…","pct":25}
[    0.41s] LOG   [BeamNG Export UI] Progress: {"step":"Shaping the terrain under the roads…","pct":25}
[    0.43s] LOG   [BeamNG Export Service] Structure solver v2: 0 deck(s) of 0 part(s); 13657 road nodes in 382 decals at their solved heights.
[    0.66s] LOG   [BeamNG Export Service] Structure solver v2 terrain: 330631 pixels in 8628 corridors, 0 held under decks, 220 ms.
[    0.68s] LOG   [BeamNG Export Service] Step {"step":"Carving riverbeds and lake beds under the bridges…","pct":26}
[    0.68s] LOG   [BeamNG Export UI] Progress: {"step":"Carving riverbeds and lake beds under the bridges…","pct":26}
[    0.69s] LOG   [BeamNG Export Service] Step {"step":"Choosing bridge styles (arches, trusses, cables) and fitting buildings to bridges…","pct":28}
[    0.69s] LOG   [BeamNG Export UI] Progress: {"step":"Choosing bridge styles (arches, trusses, cables) and fitting buildings to bridges…","pct":28}
[    0.71s] LOG   [BeamNG Export Service] Step {"step":"Building tunnel models…","pct":32}
[    0.71s] LOG   [BeamNG Export UI] Progress: {"step":"Building tunnel models…","pct":32}
[    0.72s] LOG   [BeamNG Export Service] Step {"step":"Building sidewalks, curbs and ramps along 216 carriageways…","pct":32}
[    0.72s] LOG   [BeamNG Export UI] Progress: {"step":"Building sidewalks, curbs and ramps along 216 carriageways…","pct":32}
[    3.45s] LOG   Sidewalks (paved model): 20 tiles, 58970 slab / 16206 curb / 29674 edge triangles in 2469 ms (banks found in 4 ms on 0 tiles, mesh 128 ms, check samples 6 ms)
[    3.57s] LOG   [BeamNG Export Service] Sidewalks: 368 curb runs, 22 median island runs, 0 paved pockets by seawalls, 138708 triangles in 3 mesh(es).
[    3.57s] LOG   [BeamNG Export Service] Step {"step":"Placing street props (hydrants, bins, benches, utility poles, power lines) and traffic signals…","pct":40}
[    3.57s] LOG   [BeamNG Export UI] Progress: {"step":"Placing street props (hydrants, bins, benches, utility poles, power lines) and traffic signals…","pct":40}
[    3.58s] LOG   [BeamNG Export Service] Street props: 0 hydrants, 0 bins, 8 benches, 0 poles, 0 wires in 0 tile(s).
[    3.59s] LOG   [BeamNG Signals] 41 signal heads, 0 placements dropped (no clear spot off the road).
[    3.59s] LOG   [BeamNG Export Service] Curve warnings: 5 signs ({"chevronRight":5}).
[    3.60s] LOG   [BeamNG Export Service] Step {"step":"Generating the satellite hybrid base texture for the 1024×1024 terrain…","pct":40}
[    3.60s] LOG   [BeamNG Export UI] Progress: {"step":"Generating the satellite hybrid base texture for the 1024×1024 terrain…","pct":40}
[    3.73s] LOG   [BeamNG Export Service] Step {"step":"Fitting the base texture to the 1024×1024 grid (8.4 MB source)…","pct":41}
[    3.73s] LOG   [BeamNG Export UI] Progress: {"step":"Fitting the base texture to the 1024×1024 grid (8.4 MB source)…","pct":41}
[    4.04s] LOG   [BeamNG Export Service] Step {"step":"Painting terrain materials from OSM land use (1024×1024 layer map)…","pct":41}
[    4.04s] LOG   [BeamNG Export UI] Progress: {"step":"Painting terrain materials from OSM land use (1024×1024 layer map)…","pct":41}
[    4.06s] LOG   [OSM Materials] Land cover (ESA WorldCover) on unmapped ground: 4.5% of the terrain.
[    4.12s] LOG   [OSM Materials] Steep ground (over ~45°) as rock: 0.0% of the terrain.
[    4.22s] LOG   [BeamNG Export Service] Lake beds: lake 1.5 m (slope).
[    4.27s] LOG   [BeamNG Export Service] Sports fields: 15 graded flat (12894 px).
[    4.27s] LOG   [BeamNG Export Service] Step {"step":"Writing the terrain binary (terrain.ter, 1024×1024 heights + material layers)…","pct":43}
[    4.27s] LOG   [BeamNG Export UI] Progress: {"step":"Writing the terrain binary (terrain.ter, 1024×1024 heights + material layers)…","pct":43}
[    4.32s] LOG   [BeamNG Export Service] Pools: 0 sunk (0 terrain squares opened); 9164 px bare under decks / basins.
[    4.34s] LOG   [BeamNG Export Service] Step {"step":"Encoding the 16-bit heightmap PNG (1024×1024)…","pct":45}
[    4.34s] LOG   [BeamNG Export UI] Progress: {"step":"Encoding the 16-bit heightmap PNG (1024×1024)…","pct":45}
[    4.41s] LOG   [BeamNG Export Service] Step {"step":"Rendering the level preview thumbnail…","pct":46}
[    4.41s] LOG   [BeamNG Export UI] Progress: {"step":"Rendering the level preview thumbnail…","pct":46}
[    4.44s] LOG   [BeamNG Export Service] Step {"step":"Building the surrounding backdrop (global 30 m elevation + satellite imagery, 8 tiles)…","pct":46}
[    4.44s] LOG   [BeamNG Export UI] Progress: {"step":"Building the surrounding backdrop (global 30 m elevation + satellite imagery, 8 tiles)…","pct":46}
[    4.45s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Calculating tile coverage…","pct":46}
[    4.45s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Calculating tile coverage…","pct":46}
[    4.45s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Downloading 20 terrain + 20 satellite tiles…","pct":46}
[    4.45s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Downloading 20 terrain + 20 satellite tiles…","pct":46}
[    4.47s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Downloaded 20/40 tiles…","pct":60}
[    4.47s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Downloaded 20/40 tiles…","pct":60}
[    4.48s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Downloaded 40/40 tiles…","pct":75}
[    4.48s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Downloaded 40/40 tiles…","pct":75}
[    4.49s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile NW (1/8)…","pct":75}
[    4.49s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile NW (1/8)…","pct":75}
[    4.53s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile N (2/8)…","pct":75}
[    4.53s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile N (2/8)…","pct":75}
[    4.56s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile NE (3/8)…","pct":75}
[    4.56s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile NE (3/8)…","pct":75}
[    4.61s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile W (4/8)…","pct":75}
[    4.61s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile W (4/8)…","pct":75}
[    4.63s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile E (5/8)…","pct":75}
[    4.63s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile E (5/8)…","pct":75}
[    4.68s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile SW (6/8)…","pct":75}
[    4.68s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile SW (6/8)…","pct":75}
[    4.74s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile S (7/8)…","pct":75}
[    4.74s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile S (7/8)…","pct":75}
[    4.78s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Processing tile SE (8/8)…","pct":75}
[    4.78s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Processing tile SE (8/8)…","pct":75}
[    4.82s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile NW…","pct":75}
[    4.82s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile NW…","pct":75}
[    4.85s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile N…","pct":75}
[    4.85s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile N…","pct":75}
[    4.88s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile NE…","pct":75}
[    4.88s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile NE…","pct":75}
[    4.91s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile W…","pct":75}
[    4.91s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile W…","pct":75}
[    4.94s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile E…","pct":75}
[    4.94s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile E…","pct":75}
[    4.97s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile SW…","pct":75}
[    4.97s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile SW…","pct":75}
[    5.00s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile S…","pct":75}
[    5.00s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile S…","pct":75}
[    5.03s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building mesh for tile SE…","pct":75}
[    5.03s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building mesh for tile SE…","pct":75}
[    5.06s] LOG   [BeamNG Export Service] Step {"step":"Backdrop: Building the backdrop meshes and textures…","pct":76}
[    5.06s] LOG   [BeamNG Export UI] Progress: {"step":"Backdrop: Building the backdrop meshes and textures…","pct":76}
[    5.44s] LOG   [BeamNG Export Service] Step {"step":"Building textured 3D buildings (1069 OSM footprints)…","pct":80}
[    5.44s] LOG   [BeamNG Export UI] Progress: {"step":"Building textured 3D buildings (1069 OSM footprints)…","pct":80}
[    5.46s] LOG   [BeamNG Export Service] Step {"step":"Choosing which buildings to build…","pct":80}
[    5.46s] LOG   [BeamNG Export UI] Progress: {"step":"Choosing which buildings to build…","pct":80}
[    6.08s] LOG   [BeamNG Export Service] Step {"step":"Putting the building models into the level…","pct":84}
[    6.08s] LOG   [BeamNG Export UI] Progress: {"step":"Putting the building models into the level…","pct":84}
[    6.55s] LOG   [BeamNG Export Service] Step {"step":"Building water: sea level plane, lakes and rivers…","pct":85}
[    6.55s] LOG   [BeamNG Export UI] Progress: {"step":"Building water: sea level plane, lakes and rivers…","pct":85}
[    6.56s] LOG   [BeamNG Export Service] Water over the backdrop: 6 lake WaterBlocks (2 lakes; 2 small ponds left out), 3 rivers (0 streams that never reach the map left out).
[    6.56s] LOG   [BeamNG Export Service] Water: 37 lake tiles in 1 lakes (0 of them wide or tidal rivers), 0 rivers; left out 0 dry washes, 0 culverts, 1 drains/ditches, 0 dry lakes; 0 cut at roads.
[    6.56s] LOG   [BeamNG Export Service] Step {"step":"Placing barriers, fences, road signs, traffic lights, lamps, benches and fuel stations…","pct":85}
[    6.56s] LOG   [BeamNG Export UI] Progress: {"step":"Placing barriers, fences, road signs, traffic lights, lamps, benches and fuel stations…","pct":85}
[    6.56s] LOG   [BeamNG Export Service] Step {"step":"Placing barriers, fences and guardrails…","pct":85}
[    6.56s] LOG   [BeamNG Export UI] Progress: {"step":"Placing barriers, fences and guardrails…","pct":85}
[    6.58s] LOG   [BeamNG Export Service] Step {"step":"Laying gutters along the curbs…","pct":86}
[    6.58s] LOG   [BeamNG Export UI] Progress: {"step":"Laying gutters along the curbs…","pct":86}
[    6.59s] LOG   [BeamNG Export Service] Step {"step":"Filling the road surface inside rounded curbs…","pct":86}
[    6.59s] LOG   [BeamNG Export UI] Progress: {"step":"Filling the road surface inside rounded curbs…","pct":86}
[    6.59s] LOG   [BeamNG Export Service] Step {"step":"Building sidewalk walls and decks…","pct":87}
[    6.59s] LOG   [BeamNG Export UI] Progress: {"step":"Building sidewalk walls and decks…","pct":87}
[    6.59s] LOG   [BeamNG Export Service] Step {"step":"Paving pedestrian squares and courtyards…","pct":87}
[    6.59s] LOG   [BeamNG Export UI] Progress: {"step":"Paving pedestrian squares and courtyards…","pct":87}
[    6.60s] LOG   [BeamNG Export Service] Plazas: 3 of 3 pedestrian square(s) and courtyard(s) paved, 9208 triangles.
[    6.60s] LOG   [BeamNG Export Service] Step {"step":"Raising platforms and islands, building wing walls and quay walls…","pct":88}
[    6.60s] LOG   [BeamNG Export UI] Progress: {"step":"Raising platforms and islands, building wing walls and quay walls…","pct":88}
[    6.62s] LOG   [BeamNG Export Service] Step {"step":"Building monuments…","pct":89}
[    6.62s] LOG   [BeamNG Export UI] Progress: {"step":"Building monuments…","pct":89}
[    6.93s] LOG   [BeamNG Export Service] Step {"step":"Placing road signs…","pct":89}
[    6.93s] LOG   [BeamNG Export UI] Progress: {"step":"Placing road signs…","pct":89}
[    6.93s] LOG   [BeamNG Signs] 111 signs (give_way:derived 13, give_way:osm 1, priority_road:derived 21, speed:osm 3, one_way:osm 46, no_entry:osm 27); not placed: give_way:no_room 5, priority_road:no_room 3, speed_40 1, no_entry:no_room 12.
[    6.93s] LOG   [BeamNG Export Service] Signs: 1 moved off the road, 0 left out (no ground beside it).
[    6.95s] LOG   [BeamNG Export] Mapped objects from the model picks: 9 busShelter, 16 bikeStand, 6 dumpster, 3 recyclingBin, 2 artworkStatue, 1 toilets, 6 artworkSculpture, 2 billboard
[    6.95s] LOG   [BeamNG Export] Mapped objects left out: 1 inside a building's outline (a roof's mast, a station's toilets), 0 against a wall with no room, 0 mapped twice in one place, 0 on a footpath with no room beside it
[    6.95s] LOG   [BeamNG Export] Street furniture: 295 lamps (+lights; 294 along lit streets, 0 on utility poles), 16 benches, 0 utility poles
[    6.95s] LOG   [BeamNG Export Service] Step {"step":"Placing street lamps, benches, bus stops and other mapped objects…","pct":89}
[    6.95s] LOG   [BeamNG Export UI] Progress: {"step":"Placing street lamps, benches, bus stops and other mapped objects…","pct":89}
[    6.95s] LOG   [BeamNG Export Service] Step {"step":"Mooring boats at the piers and marinas…","pct":89}
[    6.95s] LOG   [BeamNG Export UI] Progress: {"step":"Mooring boats at the piers and marinas…","pct":89}
[    6.95s] LOG   [BeamNG Export Service] Bollards: 0 placed, 2 on drawn roads left out.
[    6.96s] LOG   [BeamNG Export Service] Step {"step":"Planting trees and bushes where the land cover (ESA WorldCover) has them, rocks, ground cover and props…","pct":89}
[    6.96s] LOG   [BeamNG Export UI] Progress: {"step":"Planting trees and bushes where the land cover (ESA WorldCover) has them, rocks, ground cover and props…","pct":89}
[    6.96s] LOG   [BeamNG Export Service] Tree species: broadleaf 91%, tropical 9% (from 22 tree records nearby).
[    6.98s] LOG   [BeamNG Export Service] Canopy trees: 540 from 560 satellite canopy patch(es) outside OSM woods.
[    6.98s] LOG   [BeamNG Export Service] Vegetation timing: 1069 placements chosen at 0.0 s.
[    6.98s] LOG   [BeamNG Export Service] Vegetation: 340 placement(s) kept off roads, sidewalks and bridges.
[    6.98s] LOG   [BeamNG Export Service] Vegetation timing: kept off roads, props added at 0.0 s.
[    6.98s] LOG   [BeamNG Export Service] Vegetation timing: forest files written at 0.0 s.
[    6.98s] LOG   [BeamNG Export Service] Vegetation timing: ground cover and item data done at 0.0 s.
[    6.98s] LOG   [BeamNG Export Service] Step {"step":"Loading bundled assets (MapNG flag, reflection cubemap)…","pct":90}
[    6.98s] LOG   [BeamNG Export UI] Progress: {"step":"Loading bundled assets (MapNG flag, reflection cubemap)…","pct":90}
[   14.41s] LOG   [BeamNG Export Service] Step {"step":"Assembling the level files (levels/prviot_krug/…)…","pct":90}
[   14.41s] LOG   [BeamNG Export UI] Progress: {"step":"Assembling the level files (levels/prviot_krug/…)…","pct":90}
[   14.48s] LOG   [BeamNG Export Service] Time of day: Europe/Skopje, UTC+1 on the export day.
[   14.58s] LOG   [BeamNG Export Service] Points: Spawn and Quicktravel Points
[   14.58s] LOG   [BeamNG Export Service] Points: Point 1 (default spawn): off road, x 426.82 y 211.8 z 3.17, heading 0°; no drivable road within reach: on the ground where placed
[   14.58s] LOG   [BeamNG Export Service] Spawn and quicktravel points: 1 spawn sphere(s), 1 preview photo(s).
[   14.58s] LOG   [BeamNG Export Service] Parking: 264 spaces, 311 stall lines.
[   14.58s] LOG   [BeamNG Export] Turn arrows: 38 on 20 approach(es) with turn:lanes; 14 on their drawn lanes (9 behind a stop bar, 5 behind the lane lines' end), 6 from the way's own line (no carriageway found), 0 arrow(s) with no room before the junction, 2 tagged end(s) not at a junction.
```

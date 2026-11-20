# Manual traffic-control survey

The game loads `public/survey/prviot_krug.geojson` as an override layer over the
OpenStreetMap/MapNG traffic objects. It never edits `levels/`. The file ships
**empty**: add only features you have surveyed on site.

## What happens to each record

| Situation | Result in game |
|---|---|
| Valid surveyed sign / light / marking | Placed at its WGS84 position via the MapNG transform; labelled as field survey |
| OSM object within 6 m (signs), 8 m (lights) or 1.5 m (markings) of a surveyed one of the same kind | Dropped as a duplicate |
| OSM object with no surveyed counterpart | Kept, labelled **unverified** |
| Record missing a required field, malformed, or outside the map | **Rejected** (listed in the browser console), never guessed |
| Surveyed sign whose type has no dedicated 3D sign model | Placed at its GPS position with a plain plate showing its code, and listed separately as "no 3D model" |
| Surveyed traffic light | Timing stays **SIM**: it borrows the simulated cycle of the OSM light it replaces; with no OSM light nearby it is drawn **dark** (no invented cycle) |

Signs with a dedicated model today: `give_way` (II-1), `noentry` (II-4), `one_way` (III-2), `priorityroad` (III-3).

## Feature format (GeoJSON, WGS84 `[longitude, latitude]`)

| Property | Required | Meaning |
|---|---|---|
| `kind` | yes | `sign` or `light` (Point), `line` (LineString: lane/stop lines), `area` (Polygon: zebras, other painted areas) |
| `code` | yes | Official code from the Rulebook (Сл. весник 174/2020), e.g. `II-2`, `III-3`, `VI-4.1`, `V-1`, `V-4` |
| `source` | yes | e.g. `field survey`, or a document reference |
| `surveyor` | yes | Name or initials |
| `surveyDate` | yes | `YYYY-MM-DD` |
| `verified` | yes | `true` once checked on site; `false` for a draft |
| `facing` | signs, lights | Compass bearing (°, clockwise from true north) of the direction the sign face / lenses point, i.e. towards approaching drivers |
| `roadSide` | signs, lights | `left`, `right`, `centre` or `overhead` |
| `widthM` | optional | Painted width of a line in metres (default 0.5 for V-1 stop lines, 0.12 otherwise) |
| `note` | optional | Free text |

Template (replace every `<…>` with surveyed values; this is not valid JSON until you do):

```json
{
  "type": "Feature",
  "id": "<unique id, e.g. S-001>",
  "geometry": { "type": "Point", "coordinates": [<lon>, <lat>] },
  "properties": {
    "kind": "sign",
    "code": "<Rulebook code>",
    "facing": <bearing 0–359.9>,
    "roadSide": "<left|right|centre|overhead>",
    "source": "field survey",
    "surveyor": "<name>",
    "surveyDate": "<YYYY-MM-DD>",
    "verified": true
  }
}
```

## Surveying tips

- Stand at the sign post (or the centre of the light head's pole) and record the GPS fix with a
  phone app that shows accuracy; note it in `note` if it is worse than ±3 m.
- Take `facing` with a compass app pointed the way the sign face points.
- For lines, walk both ends; for zebras, record the four corners.
- Photograph each item; keep the photos with the survey (they are your evidence, not game assets).

The City of Skopje GIS (`npm run citygis`) is the other official source; it returned no
records for this route when last checked.

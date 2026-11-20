// Live street-level photos from Mapillary (CC BY-SA 4.0), shown through the
// official MapillaryJS viewer and Graph API. Nothing is stored: image ids are
// held in memory for this page session only. Needs a Mapillary client token at
// build time (VITE_MAPILLARY_TOKEN, a GitHub Actions secret); without it the
// game runs without photos and says so.
//
// Terms: https://www.mapillary.com/terms — register the app, show the Mapillary
// logo + link (MapillaryJS draws it with the photographer credit), no real-time
// navigation or route guidance.

import type { LevelIndex } from '../import/types';

export interface StreetImage {
  id: string;
  x: number; // world metres
  y: number;
  compass: number; // degrees clockwise from north
}

export const MAPILLARY_TOKEN: string | undefined = import.meta.env.VITE_MAPILLARY_TOKEN || undefined;

export function geo(index: LevelIndex) {
  const b = index.bounds, s = index.sizeMeters;
  return {
    toWorld: (lat: number, lng: number) => ({
      x: ((lng - b.west) / (b.east - b.west)) * s - s / 2,
      y: ((lat - b.south) / (b.north - b.south)) * s - s / 2,
    }),
    toLatLng: (x: number, y: number) => ({
      lat: b.south + ((y + s / 2) / s) * (b.north - b.south),
      lng: b.west + ((x + s / 2) / s) * (b.east - b.west),
    }),
  };
}

export interface StreetPhotos {
  images: StreetImage[];
  current: string | null;
  /** Show the photo nearest to the car if one is close and facing the same way. */
  follow(x: number, y: number, headingRad: number): 'photo' | 'none';
  resize(): void;
}

export async function createStreetPhotos(
  container: HTMLElement,
  index: LevelIndex,
  area: { x0: number; y0: number; x1: number; y1: number },
): Promise<StreetPhotos> {
  if (!MAPILLARY_TOKEN) throw new Error('no-token');
  const g = geo(index);
  const sw = g.toLatLng(area.x0, area.y0), ne = g.toLatLng(area.x1, area.y1);
  const url =
    `https://graph.mapillary.com/images?fields=id,computed_geometry,geometry,compass_angle,computed_compass_angle` +
    `&bbox=${sw.lng.toFixed(6)},${sw.lat.toFixed(6)},${ne.lng.toFixed(6)},${ne.lat.toFixed(6)}&limit=2000`;
  const res = await fetch(url, { headers: { Authorization: `OAuth ${MAPILLARY_TOKEN}` } });
  if (!res.ok) throw new Error(`Mapillary API ${res.status}`);
  const body = await res.json();
  const images: StreetImage[] = (body.data ?? [])
    .map((d: any) => {
      const c = (d.computed_geometry ?? d.geometry)?.coordinates;
      if (!c) return null;
      const w = g.toWorld(c[1], c[0]);
      return { id: String(d.id), x: w.x, y: w.y, compass: d.computed_compass_angle ?? d.compass_angle ?? 0 };
    })
    .filter(Boolean);

  const [{ Viewer }] = await Promise.all([import('mapillary-js'), import('mapillary-js/dist/mapillary.css')]);
  let viewer: InstanceType<typeof Viewer> | null = null;
  let current: string | null = null;
  let moving = false;

  return {
    images,
    get current() {
      return current;
    },
    follow(x, y, headingRad) {
      const compass = (((90 - (headingRad * 180) / Math.PI) % 360) + 360) % 360;
      let best: StreetImage | null = null, bd = 14;
      for (const im of images) {
        const d = Math.hypot(im.x - x, im.y - y);
        const turn = Math.abs(((im.compass - compass + 540) % 360) - 180);
        // a photo looking the opposite way is still useful if it is a panorama; keep it simple: within 70°
        if (d < bd && turn < 70) {
          bd = d;
          best = im;
        }
      }
      if (!best) return 'none';
      if (best.id !== current && !moving) {
        current = best.id;
        if (!viewer) {
          viewer = new Viewer({ accessToken: MAPILLARY_TOKEN!, container, imageId: best.id, component: { cover: false, sequence: false } });
        } else {
          moving = true;
          viewer
            .moveTo(best.id)
            .catch(() => {})
            .finally(() => (moving = false));
        }
      }
      return 'photo';
    },
    resize() {
      viewer?.resize();
    },
  };
}

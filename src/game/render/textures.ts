// Procedural canvas textures: all artwork is original and generated at load time.
import * as THREE from 'three';
import type { SignCode } from '../content/debarMaalo';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 4;
  t.needsUpdate = true;
  return t;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1, size = 1) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (w * h) / (size * size) * 0.5; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${amount * r()})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

export function asphalt(): THREE.Texture {
  const k = 'asphalt';
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(512, 512);
  g.fillStyle = '#5b5852'; g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, 0.25, 7, 2);
  noise(g, 512, 512, 0.12, 9, 5);
  // patches and cracks
  g.strokeStyle = 'rgba(30,28,26,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(70,66,60,0.5)';
  g.fillRect(80, 300, 120, 70); g.fillRect(350, 60, 90, 140);
  const t = tex(c, { repeat: true, aniso: 8 });
  cache.set(k, t); return t;
}

export function paving(kind: 'sidewalk' | 'terrace' | 'yard'): THREE.Texture {
  const k = 'pave-' + kind;
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(256, 256);
  const base = kind === 'terrace' ? '#c9b79a' : kind === 'yard' ? '#b7ab95' : '#b9b2a4';
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 0.18, kind.length * 13, 2);
  g.strokeStyle = 'rgba(80,72,60,0.45)'; g.lineWidth = 2;
  const step = kind === 'terrace' ? 32 : 64;
  for (let i = 0; i <= 256; i += step) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  if (kind === 'terrace') { g.fillStyle = 'rgba(150,80,50,0.15)'; for (let i = 0; i < 256; i += 64) g.fillRect(i, (i * 3) % 256, 32, 32); }
  const t = tex(c, { repeat: true });
  cache.set(k, t); return t;
}

export function ground(): THREE.Texture {
  const k = 'ground';
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#b3ad88'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 0.12, 3, 3);
  g.fillStyle = 'rgba(110,135,70,0.4)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 20, 6 + Math.random() * 12);
  const t = tex(c, { repeat: true });
  cache.set(k, t); return t;
}

/** One facade bay (3.6 m wide × 3.15 m tall) — white plaster so the material colour tints it. */
export function facade(style: number, shutter: string, balcony: boolean): THREE.Texture {
  const k = `fac-${style}-${shutter}-${balcony}`;
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(256, 224);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 224);
  noise(g, 256, 224, 0.07, style * 31 + 5, 3);
  // weathering streaks
  g.fillStyle = 'rgba(120,110,95,0.10)';
  for (let i = 0; i < 4; i++) g.fillRect(20 + i * 60, 150, 6, 74);
  const winW = style === 2 ? 70 : 84, winH = style === 1 ? 118 : 104;
  const wx = (256 - winW) / 2, wy = 46;
  // frame / sill
  g.fillStyle = '#e8e2d4'; g.fillRect(wx - 8, wy - 8, winW + 16, winH + 18);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(wx - 10, wy + winH + 8, winW + 20, 6);
  // glass
  const grd = g.createLinearGradient(0, wy, 0, wy + winH);
  grd.addColorStop(0, '#3b4a52'); grd.addColorStop(1, '#1e2529');
  g.fillStyle = grd; g.fillRect(wx, wy, winW, winH);
  g.fillStyle = 'rgba(255,240,210,0.18)'; g.fillRect(wx + 6, wy + 6, winW * 0.35, winH - 12);
  g.strokeStyle = '#efe9dc'; g.lineWidth = 5;
  g.strokeRect(wx, wy, winW, winH);
  g.beginPath(); g.moveTo(wx + winW / 2, wy); g.lineTo(wx + winW / 2, wy + winH); g.stroke();
  if (style !== 2) { g.beginPath(); g.moveTo(wx, wy + winH * 0.32); g.lineTo(wx + winW, wy + winH * 0.32); g.stroke(); }
  // shutters / roller blind
  if (style === 0 || style === 3) {
    g.fillStyle = shutter;
    g.fillRect(wx - 34, wy - 4, 28, winH + 8); g.fillRect(wx + winW + 6, wy - 4, 28, winH + 8);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let y = wy; y < wy + winH; y += 9) { g.beginPath(); g.moveTo(wx - 34, y); g.lineTo(wx - 6, y); g.moveTo(wx + winW + 6, y); g.lineTo(wx + winW + 34, y); g.stroke(); }
  } else {
    g.fillStyle = shutter; g.globalAlpha = 0.85;
    g.fillRect(wx, wy, winW, winH * (style === 1 ? 0.42 : 0.25));
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let y = wy; y < wy + winH * 0.4; y += 6) { g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + winW, y); g.stroke(); }
  }
  if (balcony) {
    g.fillStyle = 'rgba(40,40,40,0.75)';
    for (let x = 10; x < 246; x += 12) g.fillRect(x, 168, 3, 50);
    g.fillRect(6, 166, 244, 5); g.fillRect(6, 214, 244, 5);
  }
  // string course between floors
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, 256, 6);
  const t = tex(c, { repeat: true });
  cache.set(k, t); return t;
}

/** Ground floor bay: shopfront glazing, entrance door or plain wall with a small window. */
export function groundFloor(kind: 'shop' | 'door' | 'plain' | 'garage', accent: string): THREE.Texture {
  const k = `gf-${kind}-${accent}`;
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(256, 240);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 240);
  noise(g, 256, 240, 0.08, 99, 3);
  g.fillStyle = 'rgba(90,80,70,0.30)'; g.fillRect(0, 200, 256, 40); // plinth
  if (kind === 'shop') {
    g.fillStyle = accent; g.fillRect(14, 40, 228, 180);
    const grd = g.createLinearGradient(0, 50, 0, 210);
    grd.addColorStop(0, '#46585e'); grd.addColorStop(1, '#232b2e');
    g.fillStyle = grd; g.fillRect(24, 52, 140, 160); g.fillRect(176, 52, 56, 168);
    g.fillStyle = 'rgba(255,230,180,0.25)'; g.fillRect(30, 60, 50, 140);
    g.fillStyle = 'rgba(255,220,160,0.5)'; g.fillRect(186, 130, 6, 10);
  } else if (kind === 'door') {
    g.fillStyle = '#e8e2d4'; g.fillRect(84, 46, 92, 194);
    g.fillStyle = accent; g.fillRect(94, 58, 72, 182);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(100, 70, 60, 70);
    g.fillStyle = '#c8b27a'; g.fillRect(150, 160, 8, 4);
    g.fillStyle = '#2a3236'; g.fillRect(18, 70, 46, 70); g.fillRect(196, 70, 46, 70);
  } else if (kind === 'garage') {
    g.fillStyle = accent; g.fillRect(30, 60, 196, 180);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
    for (let y = 70; y < 240; y += 12) { g.beginPath(); g.moveTo(30, y); g.lineTo(226, y); g.stroke(); }
  } else {
    g.fillStyle = '#2a3236'; g.fillRect(90, 60, 76, 90);
    g.strokeStyle = '#efe9dc'; g.lineWidth = 4; g.strokeRect(90, 60, 76, 90);
    g.fillStyle = 'rgba(40,40,40,0.6)'; for (let x = 92; x < 166; x += 10) g.fillRect(x, 60, 2, 90);
  }
  const t = tex(c, { repeat: true });
  cache.set(k, t); return t;
}

export function roofTiles(): THREE.Texture {
  const k = 'roof';
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#a5533a'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    for (let x = (y / 16) % 2 ? 0 : 10; x < 256; x += 20) {
      g.fillStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},${30 + Math.random() * 20},0.6)`;
      g.beginPath(); g.ellipse(x, y + 10, 10, 9, 0, 0, Math.PI); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, y + 14, 256, 2);
  }
  noise(g, 256, 256, 0.15, 21, 2);
  const t = tex(c, { repeat: true });
  cache.set(k, t); return t;
}

export function shopSign(text: string, color: string): THREE.Texture {
  const k = `shop-${text}-${color}`;
  if (cache.has(k)) return cache.get(k)!;
  const w = 512, h = 96;
  const { c, g } = canvas(w, h);
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(239,227,200,0.85)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#f3e7cc';
  let size = 54;
  g.font = `700 ${size}px "Trebuchet MS", "DejaVu Sans", Arial, sans-serif`;
  while (g.measureText(text).width > w - 40 && size > 20) { size -= 2; g.font = `700 ${size}px "Trebuchet MS", "DejaVu Sans", Arial, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 3);
  const t = tex(c);
  cache.set(k, t); return t;
}

export function awning(color: string): THREE.Texture {
  const k = `awn-${color}`;
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(128, 64);
  for (let x = 0; x < 128; x += 16) { g.fillStyle = (x / 16) % 2 ? color : '#efe3c8'; g.fillRect(x, 0, 16, 64); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 54, 128, 10);
  const t = tex(c, { repeat: true });
  cache.set(k, t); return t;
}

// ---------------------------------------------------------------------------
// Traffic signs — drawn from the plates in the MVR exam handbook (shapes, colours, symbols).
const RED = '#d0281c', BLUE = '#1f45a8', WHITE = '#ffffff', BLACK = '#111111';

function arrowPath(g: CanvasRenderingContext2D, cx: number, cy: number, len: number, shaft: number, head: number, headLen: number, angle: number) {
  g.save(); g.translate(cx, cy); g.rotate(angle);
  g.beginPath();
  g.moveTo(-len / 2, -shaft / 2); g.lineTo(len / 2 - headLen, -shaft / 2); g.lineTo(len / 2 - headLen, -head / 2);
  g.lineTo(len / 2, 0); g.lineTo(len / 2 - headLen, head / 2); g.lineTo(len / 2 - headLen, shaft / 2); g.lineTo(-len / 2, shaft / 2);
  g.closePath(); g.fill(); g.restore();
}

function pedestrian(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.beginPath(); g.arc(4, -46, 9, 0, Math.PI * 2); g.fill();
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle as string; g.lineWidth = 11;
  g.beginPath(); g.moveTo(2, -33); g.lineTo(-2, -2); g.stroke(); // body
  g.lineWidth = 8;
  g.beginPath(); g.moveTo(1, -28); g.lineTo(-14, -12); g.moveTo(1, -28); g.lineTo(16, -14); g.stroke(); // arms
  g.lineWidth = 9;
  g.beginPath(); g.moveTo(-2, -2); g.lineTo(-16, 24); g.moveTo(-2, -2); g.lineTo(14, 22); g.lineTo(18, 30); g.stroke(); // legs
  g.restore();
}

export function signTexture(code: SignCode, opts: { arrow?: 'left' | 'right'; text?: string } = {}): THREE.Texture {
  const k = `sign-${code}-${opts.arrow ?? ''}-${opts.text ?? ''}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const wide = code === '305.1' || code === 'plaque' || code === 'place';
  const { c, g } = canvas(wide ? S * 2 : S, wide ? (code === 'plaque' ? S * 0.5 : S * 0.75) : S);
  g.clearRect(0, 0, c.width, c.height);
  if (code === '102') {
    const tri = (pad: number) => { g.beginPath(); g.moveTo(S / 2, pad + 6); g.lineTo(S - pad, S - pad - 26); g.lineTo(pad, S - pad - 26); g.closePath(); };
    g.fillStyle = WHITE; tri(4); g.fill();
    g.fillStyle = RED; tri(10); g.fill();
    g.fillStyle = WHITE; tri(40); g.fill();
    g.fillStyle = BLACK;
    g.save(); g.translate(S / 2, S * 0.62); g.rotate(Math.PI / 4);
    g.fillRect(-36, -9, 72, 18); g.rotate(Math.PI / 2); g.fillRect(-36, -9, 72, 18); g.restore();
  } else if (code === '205') {
    g.fillStyle = WHITE; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = RED; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = WHITE; g.fillRect(S * 0.18, S * 0.42, S * 0.64, S * 0.16);
  } else if (code === '302.1') {
    g.fillStyle = WHITE; g.fillRect(0, 0, S, S);
    g.fillStyle = BLUE; g.fillRect(8, 8, S - 16, S - 16);
    g.fillStyle = WHITE; g.beginPath(); g.moveTo(S / 2, 26); g.lineTo(S - 22, S - 30); g.lineTo(22, S - 30); g.closePath(); g.fill();
    g.fillStyle = BLACK;
    for (let i = 0; i < 5; i++) {
      const x0 = 52 + i * 34;
      g.beginPath(); g.moveTo(x0, S - 40); g.lineTo(x0 + 18, S - 40); g.lineTo(x0 + 24, S - 70); g.lineTo(x0 + 8, S - 70); g.closePath(); g.fill();
    }
    pedestrian(g, S / 2 - 4, S - 98, 1.25);
  } else if (code === '305') {
    g.fillStyle = WHITE; g.fillRect(0, 0, S, S);
    g.fillStyle = BLUE; g.fillRect(8, 8, S - 16, S - 16);
    g.fillStyle = WHITE; arrowPath(g, S / 2, S / 2, S * 0.7, 36, 104, 70, -Math.PI / 2);
  } else if (code === '305.1') {
    const W = c.width, H = c.height;
    g.fillStyle = WHITE; g.fillRect(0, 0, W, H);
    g.fillStyle = BLUE; g.fillRect(8, 8, W - 16, H - 16);
    g.fillStyle = WHITE; arrowPath(g, W / 2, H / 2, W * 0.78, 32, 96, 90, opts.arrow === 'left' ? Math.PI : 0);
  } else if (['103.1', '103.2', '106', '107', '111.1', '115', '121.1', '123'].includes(code)) {
    // warning triangle (white field, red border) with an original pictogram
    const tri = (pad: number) => { g.beginPath(); g.moveTo(S / 2, pad + 6); g.lineTo(S - pad, S - pad - 26); g.lineTo(pad, S - pad - 26); g.closePath(); };
    g.fillStyle = WHITE; tri(4); g.fill(); g.fillStyle = RED; tri(10); g.fill(); g.fillStyle = WHITE; tri(40); g.fill();
    g.fillStyle = BLACK; g.strokeStyle = BLACK; g.lineCap = 'round'; g.lineJoin = 'round';
    const cx = S / 2, cy = S * 0.6;
    if (code === '103.1' || code === '103.2') {
      const d = code === '103.1' ? -1 : 1;
      g.lineWidth = 14; g.beginPath(); g.moveTo(cx - d * 10, cy + 40); g.quadraticCurveTo(cx - d * 10, cy - 10, cx + d * 22, cy - 30); g.stroke();
      g.beginPath(); g.moveTo(cx + d * 30, cy - 38); g.lineTo(cx + d * 8, cy - 40); g.lineTo(cx + d * 24, cy - 16); g.closePath(); g.fill();
    } else if (code === '106' || code === '107') {
      g.beginPath(); g.moveTo(cx - 52, cy + 38); g.lineTo(cx + 52, cy + 38); g.lineTo(code === '106' ? cx - 52 : cx + 52, cy - 20); g.closePath(); g.fill();
      g.font = '700 26px Arial'; g.textAlign = 'center'; g.fillText('10%', code === '106' ? cx + 14 : cx - 14, cy - 2);
    } else if (code === '111.1') {
      g.fillRect(cx - 52, cy + 34, 104, 8); g.lineWidth = 6; g.beginPath(); g.moveTo(cx + 40, cy + 34); g.lineTo(cx + 40, cy - 40); g.stroke();
      for (const [x, y, r] of [[cx + 18, cy - 20, 9], [cx + 4, cy + 4, 11], [cx - 16, cy + 22, 9], [cx + 22, cy + 14, 7]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    } else if (code === '115') {
      g.beginPath(); g.arc(cx - 6, cy - 34, 9, 0, Math.PI * 2); g.fill();
      g.lineWidth = 10; g.beginPath(); g.moveTo(cx - 8, cy - 22); g.lineTo(cx - 14, cy + 6); g.lineTo(cx - 28, cy + 34); g.moveTo(cx - 14, cy + 6); g.lineTo(cx + 2, cy + 34); g.moveTo(cx - 10, cy - 14); g.lineTo(cx + 22, cy + 2); g.stroke();
      g.beginPath(); g.moveTo(cx + 14, cy + 34); g.lineTo(cx + 46, cy + 34); g.lineTo(cx + 30, cy + 14); g.closePath(); g.fill();
    } else if (code === '121.1') {
      g.fillRect(cx - 20, cy - 46, 40, 92);
      for (const [y, col] of [[cy - 30, '#d0281c'], [cy, '#e8b51a'], [cy + 30, '#2a9a4a']] as [number, string][]) { g.fillStyle = col; g.beginPath(); g.arc(cx, y, 12, 0, Math.PI * 2); g.fill(); }
    } else if (code === '123') {
      pedestrian(g, cx, cy + 20, 1.1);
    }
  } else if (code === 'limit') {
    g.fillStyle = WHITE; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = RED; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = WHITE; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = BLACK; g.font = '700 100px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(opts.text ?? '60', S / 2, S / 2 + 6);
  } else if (code === 'place') {
    const W2 = c.width, H2 = c.height;
    g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W2, H2); g.strokeStyle = BLACK; g.lineWidth = 10; g.strokeRect(8, 8, W2 - 16, H2 - 16);
    g.fillStyle = BLACK; g.font = '700 58px "Trebuchet MS", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(opts.text ?? '', W2 / 2, H2 / 2 + 2);
    if (opts.arrow === 'right') { g.strokeStyle = RED; g.lineWidth = 10; g.beginPath(); g.moveTo(20, H2 - 20); g.lineTo(W2 - 20, 20); g.stroke(); }
  } else if (code === 'plaque') {
    const W = c.width, H = c.height;
    g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1d3d7a'; g.lineWidth = 10; g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = '#1d3d7a'; g.font = '700 52px "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(opts.text ?? '', W / 2, H / 2 + 2);
  }
  const t = tex(c, { aniso: 8 });
  t.generateMipmaps = true;
  cache.set(k, t); return t;
}

// ---------------------------------------------------------------------------
// Registration plates: one atlas for every car so parked cars can be merged.
// Layout follows the current North Macedonian car plate as documented (white, black
// characters, blue field with "NMK" on the left). Numbers are synthetic.
export class PlateAtlas {
  readonly cols = 4; readonly rows = 48;
  readonly cw = 256; readonly ch = 54;
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; texture: THREE.CanvasTexture;
  private slots = new Map<string, number>();
  constructor() {
    const { c, g } = canvas(this.cols * this.cw, this.rows * this.ch);
    this.c = c; this.g = g;
    this.texture = tex(c, { aniso: 8 }) as THREE.CanvasTexture;
  }
  /** Returns [u0, v0, u1, v1] for the plate text. */
  uv(text: string): [number, number, number, number] {
    let i = this.slots.get(text);
    if (i === undefined) {
      i = this.slots.size % (this.cols * this.rows);
      this.slots.set(text, i);
      this.draw(i, text);
      this.texture.needsUpdate = true;
    }
    const col = i % this.cols, row = Math.floor(i / this.cols);
    const u0 = (col * this.cw) / this.c.width, u1 = ((col + 1) * this.cw) / this.c.width;
    const v1 = 1 - (row * this.ch) / this.c.height, v0 = 1 - ((row + 1) * this.ch) / this.c.height;
    return [u0, v0, u1, v1];
  }
  private draw(i: number, text: string) {
    const g = this.g;
    const x = (i % this.cols) * this.cw, y = Math.floor(i / this.cols) * this.ch;
    const w = this.cw, h = this.ch;
    g.fillStyle = '#f7f7f2'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = '#1f47b0'; g.fillRect(x + 3, y + 3, 30, h - 6);
    g.fillStyle = '#fff'; g.font = '700 11px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('NMK', x + 18, y + h - 13);
    const [reg, rest] = text.split(' ');
    g.fillStyle = '#111'; g.font = '700 34px "DIN Alternate", "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText(reg, x + 40, y + h / 2 + 2);
    // small red/yellow city badge with the Cyrillic code
    g.fillStyle = '#e8c21a'; g.fillRect(x + 92, y + 12, 18, 30);
    g.fillStyle = '#c62a1d'; g.font = '700 10px Arial, sans-serif'; g.textAlign = 'center';
    g.fillText('СК', x + 101, y + 27);
    g.fillStyle = '#111'; g.font = '700 34px "DIN Alternate", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'left';
    g.fillText(rest, x + 116, y + h / 2 + 2);
  }
}

export function gateTexture(color: string): THREE.Texture {
  const k = `gate-${color}`;
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(128, 128);
  g.fillStyle = color; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 6; x < 128; x += 12) g.fillRect(x, 0, 4, 128);
  g.fillRect(0, 20, 128, 5); g.fillRect(0, 100, 128, 5);
  noise(g, 128, 128, 0.2, 4, 2);
  const t = tex(c, { repeat: true });
  cache.set(k, t); return t;
}

export function skyTexture(): THREE.Texture {
  const k = 'sky';
  if (cache.has(k)) return cache.get(k)!;
  const { c, g } = canvas(16, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#7aa3c2'); grd.addColorStop(0.38, '#b7c6c6'); grd.addColorStop(0.55, '#ecd0a4'); grd.addColorStop(0.7, '#f2c086'); grd.addColorStop(1, '#e3a874');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
  const t = tex(c);
  cache.set(k, t); return t;
}

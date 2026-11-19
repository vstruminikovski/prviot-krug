// Shared UI kit: one icon language (24px grid, 1.75 stroke, round caps), the logo, and small
// building blocks every screen uses so the whole game reads as one design.
import { useEffect, useRef, useState, type ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  play: <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  retry: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
  shuffle: <><path d="M3 7h3.5c4 0 6 10 10 10H21" /><path d="M3 17h3.5c1.6 0 2.8-1.6 3.9-3.6M13.6 9.6C14.7 7.6 15.9 7 17 7h4" /><path d="M18 4l3 3-3 3M18 14l3 3-3 3" /></>,
  camera: <><rect x="3" y="7" width="13" height="10" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3" /></>,
  sound: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  mute: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  keys: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" /><circle cx="12" cy="12" r="7" /></>,
  book: <><path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10.5" /><path d="M9 8.5h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6h.01" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8M12 17h.01" /></>,
  car: <><path d="M4 15.5V12l2-4.6A2 2 0 0 1 7.8 6h8.4a2 2 0 0 1 1.8 1.4L20 12v3.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 15.5z" /><path d="M4 12h16" /><circle cx="7.5" cy="14.3" r=".6" fill="currentColor" /><circle cx="16.5" cy="14.3" r=".6" fill="currentColor" /><path d="M6 17v2M18 17v2" /></>,
  wheel: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.2" /><path d="M3.5 10.5h6.3M14.2 10.5h6.3M12 14.2V21" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4.5h12l-2.5 4 2.5 4H5" /></>,
  map: <><path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  rain: <><path d="M7 15a4.5 4.5 0 1 1 1.6-8.7A5.5 5.5 0 0 1 19 9a3.5 3.5 0 0 1-1 6.8" /><path d="M8.5 18l-1 2.5M12.5 17l-1 2.5M16.5 18l-1 2.5" /></>,
  fog: <path d="M4 9h16M3 13h18M5 17h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.4h.01" /></>,
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="17.5" cy="6" r="2.5" /><circle cx="17.5" cy="18" r="2.5" /><path d="M8.2 10.8l7.1-3.6M8.2 13.2l7.1 3.6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  home: <><path d="M4 11l8-6.5 8 6.5" /><path d="M6 9.5V20h12V9.5" /></>,
  download: <><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 19.5h14" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  sliders: <><path d="M5 4v16M12 4v16M19 4v16" /><circle cx="5" cy="14" r="2" fill="currentColor" /><circle cx="12" cy="8" r="2" fill="currentColor" /><circle cx="19" cy="16" r="2" fill="currentColor" /></>,
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`ico ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{P[name]}</svg>
  );
}

/** Logo: a road ring with a dashed centre line and a car-arrow driving it, plus the wordmark. */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a4a48" /><stop offset="1" stopColor="#0f1f1e" /></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#lg-ring)" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#f4ecd8" strokeOpacity=".9" strokeWidth="2" strokeDasharray="5 5.1" className="logo-dash" />
      <circle cx="32" cy="32" r="12" fill="#13292a" stroke="#f4ecd8" strokeOpacity=".25" />
      <g className="logo-car"><path d="M32 6.5l6.5 6-6.5-1.6-6.5 1.6z" fill="#f2a93b" /></g>
      <circle cx="32" cy="32" r="3.2" fill="#d9472f" />
    </svg>
  );
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'compact' : ''}`}>
      <LogoMark size={compact ? 34 : 52} />
      <div className="logo-type">
        <span className="logo-k">КРУГ</span>
        <span className="logo-s">низ маалото</span>
      </div>
    </div>
  );
}

/** Modal sheet with a consistent header; Esc and backdrop close it. */
export function Modal({ title, kicker, onClose, children, wide = false, className = '' }: { title: ReactNode; kicker?: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={`sheet ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <header className="sheet-h">
          <div>{kicker && <div className="kicker">{kicker}</div>}<h2>{title}</h2></div>
          <button className="btn icon ghost" onClick={onClose} aria-label="Затвори"><Icon name="close" /></button>
        </header>
        <div className="sheet-b">{children}</div>
      </div>
    </div>
  );
}

/** Segmented control. */
export function Seg<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { id: T; label: ReactNode; title?: string; disabled?: boolean }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} disabled={o.disabled} title={o.title} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle"><span>{label}</span><button role="switch" aria-checked={on} className={on ? 'on' : ''} onClick={() => onChange(!on)}><i /></button></label>
  );
}

export function Slider({ value, min, max, step, onChange, label, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: ReactNode; fmt?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider"><span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ ['--p' as string]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{fmt ? fmt(value) : value}</b>
    </label>
  );
}

/** Count-up number (results). */
export function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (now: number) => { const u = Math.min(1, (now - t0) / ms); setV(Math.round(to * (1 - Math.pow(1 - u, 3)))); if (u < 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, ms]);
  return <>{v}</>;
}

// ---------------------------------------------------------------- fullscreen (phones in a browser tab)
const standalone = () => matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
/** Enter fullscreen and lock landscape where the browser allows it (Android); safe to call anywhere. */
export async function enterFullscreen() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions); } catch { /* refused */ }
  try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* unsupported */ }
}
/** True when a fullscreen button makes sense right now: touch device, browser tab, fullscreen
 *  supported (not iPhone Safari) and currently not fullscreen. Re-renders on every change. */
export function useNeedsFullscreen() {
  const calc = () => matchMedia('(pointer: coarse)').matches && !standalone() && !!document.fullscreenEnabled && !document.fullscreenElement;
  const [need, setNeed] = useState(calc);
  useEffect(() => { const f = () => setNeed(calc()); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  return need;
}
/** Small pill/button to go (back) to fullscreen. */
export function FullscreenButton({ variant = 'icon', onDone, label = 'Назад на цел екран' }: { variant?: 'icon' | 'block'; onDone?: () => void; label?: string }) {
  const need = useNeedsFullscreen();
  if (!need) return null;
  return variant === 'block'
    ? <button className="btn primary block" onClick={() => { void enterFullscreen().then(() => onDone?.()); }}><Icon name="expand" size={18} />{label}</button>
    : <button className="btn icon glass fs-btn" onClick={() => void enterFullscreen()} title="Цел екран" aria-label="Цел екран"><Icon name="expand" /></button>;
}

import { useEffect, useRef, useState } from 'react';
import { GameEngine, type HudState } from '../game/engine';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { Garage } from './Garage';
import { Result, ReplayPanel } from './Result';
import { ErrorBoundary } from './ErrorBoundary';
import { LogoMark, useAutoFullscreen } from './kit';

declare global { interface Window { __krug?: GameEngine } }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  useAutoFullscreen();

  useEffect(() => {
    let eng: GameEngine;
    try { eng = new GameEngine(canvasRef.current!); } catch (e) { setError(String((e as Error).message ?? e)); setBooted(true); return; }
    window.__krug = eng;
    setEngine(eng);
    const unsub = eng.subscribe(setHud);
    const resize = () => { const el = wrapRef.current; if (!el) return; const w = el.clientWidth, h = el.clientHeight; if (w > 0 && h > 0 && (w !== eng.view.width || h !== eng.view.height)) eng.view.setSize(w, h); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrapRef.current!);
    // phones settle their size late after a rotation, fullscreen change or toolbar collapse: measure again
    const timers: number[] = [];
    const settle = () => { resize(); requestAnimationFrame(resize); for (const ms of [120, 350, 700]) timers.push(window.setTimeout(resize, ms)); };
    const sizeEvents: [EventTarget, string][] = [[window, 'resize'], [window, 'orientationchange'], [document, 'fullscreenchange'], [document, 'webkitfullscreenchange'], [document, 'visibilitychange']];
    if (window.visualViewport) sizeEvents.push([window.visualViewport, 'resize']);
    for (const [t, ev] of sizeEvents) t.addEventListener(ev, settle);
    // GPU reset / driver hiccup: pause, then rebuild cleanly when the context comes back
    const cv = canvasRef.current!;
    const lost = (e: Event) => { e.preventDefault(); setError('Графичката картичка го ресетираше прикажувањето. Се обидуваме повторно…'); };
    const restored = () => location.reload();
    cv.addEventListener('webglcontextlost', lost); cv.addEventListener('webglcontextrestored', restored);
    eng.onFatal = (msg) => setError(msg);
    // boot curtain: wait for fonts and a couple of rendered frames, never longer than 4 s
    let done = false;
    const finish = () => { if (!done) { done = true; setBooted(true); } };
    const t0 = performance.now();
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]).then(() => {
      const wait = Math.max(0, 900 - (performance.now() - t0));
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(finish)), wait);
    });
    const hard = setTimeout(finish, 4000);
    // UI feedback sounds; the first gesture also unlocks Web Audio
    const click = (e: Event) => {
      const b = (e.target as HTMLElement)?.closest?.('button, [role=radio], [role=switch]') as HTMLElement | null;
      if (!b || b.hasAttribute('disabled')) return;
      eng.audio.init();
      eng.audio.ui(b.classList.contains('primary') || b.classList.contains('go') ? 'confirm' : b.dataset.sound === 'back' ? 'back' : 'tick');
    };
    window.addEventListener('click', click, true);
    return () => { unsub(); ro.disconnect(); for (const [t, ev] of sizeEvents) t.removeEventListener(ev, settle); timers.forEach(clearTimeout); clearTimeout(hard); window.removeEventListener('click', click, true); cv.removeEventListener('webglcontextlost', lost); cv.removeEventListener('webglcontextrestored', restored); eng.dispose(); };
  }, []);

  const phase = hud?.phase ?? 'menu';
  const hudSize = engine?.store.settings.hud ?? 'M';
  return (
    <div className={`app phase-${phase} hud-${hudSize}`} ref={wrapRef}>
      <canvas ref={canvasRef} className="scene" tabIndex={-1} />
      <ErrorBoundary key={phase} onReset={() => engine?.backToMenu()}>
        <div className="screen" key={phase}>
          {engine && hud && phase === 'drive' && <Hud engine={engine} hud={hud} />}
          {engine && phase === 'menu' && <Menu engine={engine} />}
          {engine && phase === 'garage' && <Garage engine={engine} />}
          {engine && phase === 'result' && engine.result && <Result engine={engine} />}
          {engine && phase === 'replay' && hud?.replay && <ReplayPanel engine={engine} rp={hud.replay} />}
        </div>
      </ErrorBoundary>
      {error && (
        <div className="scrim solid"><div className="sheet narrow"><header className="sheet-h"><h2>3D не може да се вчита</h2></header><div className="sheet-b"><p className="muted">{error}</p><button className="btn primary block" onClick={() => location.reload()}>Вчитај повторно</button></div></div></div>
      )}
      <div className={`boot ${booted ? 'gone' : ''}`} aria-hidden={booted}>
        <LogoMark size={88} />
        <div className="boot-word">КРУГ <span>низ маалото</span></div>
        <div className="boot-bar"><i /></div>
      </div>
    </div>
  );
}

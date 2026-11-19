import { useEffect, useRef, useState } from 'react';
import { GameEngine, type HudState } from '../game/engine';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { Garage } from './Garage';
import { Result, ReplayPanel } from './Result';

declare global { interface Window { __krug?: GameEngine } }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let eng: GameEngine;
    try { eng = new GameEngine(canvasRef.current!); } catch (e) { setError(String((e as Error).message ?? e)); return; }
    window.__krug = eng;
    setEngine(eng);
    const unsub = eng.subscribe(setHud);
    const resize = () => { const el = wrapRef.current!; eng.view.setSize(el.clientWidth, el.clientHeight); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrapRef.current!);
    return () => { unsub(); ro.disconnect(); eng.dispose(); };
  }, []);

  const phase = hud?.phase ?? 'menu';
  return (
    <div className={`app phase-${phase}`} ref={wrapRef}>
      <canvas ref={canvasRef} className="scene" tabIndex={-1} />
      <div className="vignette" />
      {error && <div className="modal-back"><div className="card"><h2>3D не може да се вчита</h2><p>{error}</p></div></div>}
      {engine && hud && phase === 'drive' && <Hud engine={engine} hud={hud} />}
      {engine && phase === 'menu' && <Menu engine={engine} />}
      {engine && phase === 'garage' && <Garage engine={engine} />}
      {engine && phase === 'result' && engine.result && <Result engine={engine} />}
      {engine && phase === 'replay' && hud?.replay && <ReplayPanel engine={engine} rp={hud.replay} />}
      <div className="rotate-hint">Сврти го телефонот хоризонтално 🔄</div>
    </div>
  );
}

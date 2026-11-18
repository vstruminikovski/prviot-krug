import { useEffect, useRef, useState } from 'react';
import { GameEngine, type HudState } from '../game/engine';
import { Hud } from './Hud';
import { Review, ReplayPanel, RetryDone, SourcesPanel } from './Review';
import { incomingChallenge } from '../game/host';

declare global { interface Window { __krug?: GameEngine } }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const challenge = incomingChallenge();

  useEffect(() => {
    let eng: GameEngine;
    try { eng = new GameEngine(canvasRef.current!); }
    catch (e) { setError(String((e as Error).message ?? e)); return; }
    window.__krug = eng;
    setEngine(eng);
    const unsub = eng.subscribe(setHud);
    const resize = () => {
      const el = wrapRef.current!;
      eng.view.setSize(el.clientWidth, el.clientHeight);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current!);
    return () => { unsub(); ro.disconnect(); eng.dispose(); };
  }, []);

  const phase = hud?.phase ?? 'title';
  return (
    <div className="app" ref={wrapRef}>
      <canvas ref={canvasRef} className="scene" />
      <div className="vignette" />
      {error && <div className="modal-back"><div className="card"><h2>3D не може да се вчита</h2><p>{error}</p></div></div>}
      {engine && hud && <Hud engine={engine} hud={hud} />}
      {engine && phase === 'title' && (
        <div className="title">
          <div className="title-card">
            <div className="kicker">Епизода 1 · Дебар Маало</div>
            <h1>Круг низ маалото</h1>
            <h2>Првиот круг</h2>
            <p>Топло попладне. Татко ти ти ги дава клучевите од старото кремаво возило. Еден круг низ маалото — и назад кај кафичот.</p>
            {challenge !== null && <p className="challenge">Другар те предизвика: <b>{challenge} поени</b>. Да те видам ти.</p>}
            <button className="btn primary big" onClick={() => engine.startRun()}>Тргни</button>
            <div className="controls-help">
              <div><kbd>W</kbd>/<kbd>↑</kbd> гас · <kbd>S</kbd>/<kbd>↓</kbd> сопирачка (држи при мирување за назад)</div>
              <div><kbd>A</kbd><kbd>D</kbd>/<kbd>←</kbd><kbd>→</kbd> волан · <kbd>Q</kbd>/<kbd>E</kbd> покажувач · <kbd>H</kbd> сирена</div>
              <div><kbd>C</kbd> камера (возач) · <kbd>M</kbd> звук · <kbd>Esc</kbd> пауза</div>
            </div>
            <button className="btn ghost small" onClick={() => setShowSources(true)}>Извори и белешки</button>
          </div>
        </div>
      )}
      {engine && phase === 'review' && engine.summary && <Review engine={engine} summary={engine.summary} finalLine={engine.finalLine} />}
      {engine && phase === 'replay' && hud?.replay && <ReplayPanel engine={engine} rp={hud.replay} />}
      {engine && phase === 'retryDone' && hud && <RetryDone engine={engine} hud={hud} />}
      {showSources && <SourcesPanel onClose={() => setShowSources(false)} />}
      <div className="rotate-hint">Сврти го телефонот хоризонтално 🔄</div>
    </div>
  );
}

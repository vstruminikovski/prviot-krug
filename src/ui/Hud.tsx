import { useEffect, useRef, useState } from 'react';
import type { GameEngine, HudState } from '../game/engine';

/** Original analogue speedometer: sun-faded cream face, petrol rim, enamel-red needle. */
export function Dial({ speed, indicator, blink, gear, revs }: { speed: number; indicator: string; blink: boolean; gear: string; revs: number }) {
  const max = 140;
  const a0 = -225, a1 = 45; // degrees
  const ang = (v: number) => ((a0 + ((a1 - a0) * Math.min(v, max)) / max) * Math.PI) / 180;
  const pt = (v: number, r: number) => [80 + Math.cos(ang(v)) * r, 80 + Math.sin(ang(v)) * r];
  const ticks = [];
  for (let v = 0; v <= max; v += 10) {
    const [x1, y1] = pt(v, 62), [x2, y2] = pt(v, v % 20 === 0 ? 52 : 57);
    ticks.push(<line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={v === 50 ? '#b3342b' : '#1f3b3a'} strokeWidth={v % 20 === 0 ? 2.4 : 1.4} />);
    if (v % 20 === 0) { const [tx, ty] = pt(v, 42); ticks.push(<text key={'t' + v} x={tx} y={ty + 3.5} textAnchor="middle" fontSize="10" fill="#1f3b3a" fontWeight={700}>{v}</text>); }
  }
  const [nx, ny] = pt(speed, 56);
  const revA = (-200 + revs * 120) * Math.PI / 180;
  return (
    <svg className="dial" viewBox="0 0 160 160" aria-label={`Брзина ${Math.round(speed)} км/ч`}>
      <circle cx="80" cy="80" r="76" fill="#1f3b3a" />
      <circle cx="80" cy="80" r="70" fill="#efe3c8" stroke="#c9b48a" strokeWidth="2" />
      {ticks}
      <path d={`M ${pt(50, 66)[0]} ${pt(50, 66)[1]} A 66 66 0 0 1 ${pt(52, 66)[0]} ${pt(52, 66)[1]}`} stroke="#b3342b" strokeWidth="4" fill="none" />
      <text x="80" y="58" textAnchor="middle" fontSize="7" fill="#6b5a3a" letterSpacing="1">км/ч</text>
      <g transform="translate(0,6)">
        <path d="M58 98 l-9 -6 v12 z" fill={indicator === 'left' && blink ? '#3fd16b' : '#9fae96'} />
        <path d="M102 98 l9 -6 v12 z" fill={indicator === 'right' && blink ? '#3fd16b' : '#9fae96'} />
        <text x="80" y="103" textAnchor="middle" fontSize="13" fontWeight={800} fill={gear === 'R' ? '#b3342b' : '#1f3b3a'}>{gear}</text>
      </g>
      <text x="80" y="128" textAnchor="middle" fontSize="15" fontWeight={800} fill="#1f3b3a">{Math.round(speed)}</text>
      <line x1="80" y1="80" x2={80 + Math.cos(revA) * 12} y2={80 + Math.sin(revA) * 12} stroke="#c58a2a" strokeWidth="1.5" opacity="0.6" />
      <line x1="80" y1="80" x2={nx} y2={ny} stroke="#b3342b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="80" cy="80" r="6" fill="#1f3b3a" />
    </svg>
  );
}

function HintArrow({ arrow, angle }: { arrow: string; angle: number }) {
  if (arrow === 'left') return <span className="hint-arrow">↰</span>;
  if (arrow === 'straight') return <span className="hint-arrow">↑</span>;
  return <span className="hint-arrow compass" style={{ transform: `rotate(${-angle}rad)` }}>➤</span>;
}

export function Hud({ engine, hud }: { engine: GameEngine; hud: HudState }) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const driving = hud.phase === 'drive' || hud.phase === 'retry';
  return (
    <>
      {driving && (
        <div className="hud-dial"><Dial speed={hud.speed} indicator={hud.indicator} blink={hud.blink} gear={hud.gear} revs={hud.revs} /></div>
      )}
      {driving && hud.hint && (
        <div className="hint" role="status">
          <HintArrow arrow={hud.hint.arrow} angle={hud.hint.angle} />
          <span>{hud.hint.text}{hud.hint.dist !== null && hud.hint.arrow !== 'straight' ? ` · ${hud.hint.dist} м` : ''}</span>
        </div>
      )}
      {hud.toast && driving && <div className="toast">{hud.toast}</div>}
      {hud.countdown !== null && <div className="countdown">{hud.countdown}</div>}
      {hud.retryId && driving && <div className="retry-tag">Повторување</div>}
      {driving && (
        <div className="topbar">
          <button className="icon-btn" onClick={() => engine.toggleCamera()} title="Камера (C)">{hud.camMode === 'chase' ? '🚗 Возач' : '🎥 Зад колата'}</button>
          <button className="icon-btn" onClick={() => engine.toggleMute()} title="Звук (M)" aria-pressed={hud.muted}>{hud.muted ? '🔇' : '🔊'}</button>
          <button className="icon-btn" onClick={() => { engine.paused = true; setConfirmRestart(false); }} title="Пауза (Esc)">❚❚</button>
        </div>
      )}
      {driving && hud.paused && (
        <div className="modal-back">
          <div className="card pause">
            <h2>Пауза</h2>
            {!confirmRestart ? (
              <>
                <button className="btn primary" onClick={() => { engine.paused = false; }}>Продолжи</button>
                <button className="btn" onClick={() => setConfirmRestart(true)}>Почни одново</button>
                {hud.retryId && <button className="btn" onClick={() => engine.backToReview()}>Назад кон резултатите</button>}
                <button className="btn" onClick={() => engine.toggleMute()}>{hud.muted ? 'Вклучи звук' : 'Исклучи звук'}</button>
                <button className="btn" onClick={() => engine.toggleCamera()}>Камера: {hud.camMode === 'chase' ? 'зад колата' : 'од возачот'}</button>
              </>
            ) : (
              <>
                <p>Да почнеме нов круг од кафичот?</p>
                <button className="btn primary" onClick={() => { hud.retryId ? engine.startRetry(hud.retryId) : engine.restart(); }}>Да, од почеток</button>
                <button className="btn" onClick={() => setConfirmRestart(false)}>Не</button>
              </>
            )}
          </div>
        </div>
      )}
      {hud.subtitle && (hud.phase === 'intro' || hud.phase === 'outro' || hud.phase === 'drive') && (
        <div className="subtitle"><b>{hud.subtitle.who}:</b> „{hud.subtitle.text}“</div>
      )}
      {hud.phase === 'intro' && <button className="btn skip" onClick={() => engine.skipIntro()}>Прескокни ›</button>}
      {driving && hud.bubbles.map((b) => b.y > -900 && (
        <div key={b.id} className="bubble" style={{ left: b.x, top: b.y }}>{b.text}</div>
      ))}
      {driving && <TouchControls engine={engine} hud={hud} />}
    </>
  );
}

function useHold(onChange: (v: boolean) => void) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const down = (e: PointerEvent) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ } el.classList.add('held'); onChange(true); };
    const up = (e: PointerEvent) => { e.preventDefault(); el.classList.remove('held'); onChange(false); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, [onChange]);
  return ref;
}

/** Landscape touch layout: steering on the left thumb, pedals on the right. */
function TouchControls({ engine, hud }: { engine: GameEngine; hud: HudState }) {
  const t = engine.input.touch;
  const left = useRef(false), right = useRef(false);
  const applySteer = () => { t.steer = (left.current ? 1 : 0) - (right.current ? 1 : 0); };
  const lRef = useHold(useCallbackStable((v: boolean) => { left.current = v; applySteer(); }));
  const rRef = useHold(useCallbackStable((v: boolean) => { right.current = v; applySteer(); }));
  const gRef = useHold(useCallbackStable((v: boolean) => { t.throttle = v ? 1 : 0; }));
  const bRef = useHold(useCallbackStable((v: boolean) => { t.brake = v ? 1 : 0; }));
  const hRef = useHold(useCallbackStable((v: boolean) => { t.horn = v; }));
  useEffect(() => () => { t.steer = 0; t.throttle = 0; t.brake = 0; t.horn = false; }, [t]);
  return (
    <div className="touch">
      <div className="touch-left">
        <div className="ind-row">
          <button className={`tbtn ind ${hud.indicator === 'left' ? 'on' : ''}`} onClick={() => engine.toggleIndicator('left')} aria-label="Лев покажувач">⇦</button>
          <button className={`tbtn ind ${hud.indicator === 'right' ? 'on' : ''}`} onClick={() => engine.toggleIndicator('right')} aria-label="Десен покажувач">⇨</button>
        </div>
        <div className="steer-row">
          <button ref={lRef} className="tbtn steer" aria-label="Лево">◀</button>
          <button ref={rRef} className="tbtn steer" aria-label="Десно">▶</button>
        </div>
      </div>
      <div className="touch-right">
        <button ref={hRef} className="tbtn horn" aria-label="Сирена">📯</button>
        <div className="pedal-row">
          <button ref={bRef} className="tbtn pedal brake" aria-label="Сопирачка / назад">СОП<small>држи за R</small></button>
          <button ref={gRef} className="tbtn pedal gas" aria-label="Гас">ГАС</button>
        </div>
      </div>
    </div>
  );
}

// stable callback helper without re-binding listeners each render
function useCallbackStable<T extends (...a: never[]) => void>(fn: T): T {
  const r = useRef(fn);
  r.current = fn;
  const stable = useRef(((...a: never[]) => r.current(...a)) as T);
  return stable.current;
}

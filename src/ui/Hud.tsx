import { useEffect, useRef, useState } from 'react';
import type { GameEngine, HudState } from '../game/engine';
import { BINDINGS } from '../game/input';
import { MODE_LABEL } from '../game/missions/types';
import { ENV_INFO } from '../game/attempt';
import { TIME_LABEL, WEATHER_LABEL } from '../game/render/atmosphere';
import { kmh } from '../game/math';
import { Icon } from './kit';
import { Settings } from './Settings';

const ASSIST_LABEL: Record<string, string> = { learn: 'Со помош', manual: 'Мануелно', exam: 'Испит', auto: 'Автоматски' };

/** 60 fps needle with a little spring overshoot, read straight from the simulation (HUD state is 15 Hz). */
function useNeedle(read: () => number, max: number, sweep: number, digits?: React.RefObject<SVGTextElement>) {
  const ref = useRef<SVGGElement>(null);
  const r = useRef(read); r.current = read;
  useEffect(() => {
    let raf = 0, v = r.current(), vel = 0, last = performance.now(), shown = -1;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const target = Math.max(0, Math.min(max * 1.02, r.current()));
      vel += ((target - v) * 260 - vel * 22) * dt; v += vel * dt;
      ref.current?.setAttribute('transform', `rotate(${(sweep * Math.max(0, v)) / max} 80 80)`);
      if (digits?.current) { const n = Math.round(target); if (n !== shown) { shown = n; digits.current.textContent = String(n).padStart(3, ' '); } }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [max, sweep, digits]);
  return ref;
}

function Gauge({ value, max, ticks, label, red, unit, size = 150, read, lcd }: { value: number; max: number; ticks: number; label: string; red?: number; unit: string; size?: number; read?: () => number; lcd?: boolean }) {
  const lcdRef = useRef<SVGTextElement>(null);
  const needle = useNeedle(read ?? (() => value), max, 270, lcd ? lcdRef : undefined);
  const a0 = -225, a1 = 45;
  const ang = (v: number) => ((a0 + ((a1 - a0) * Math.min(v, max)) / max) * Math.PI) / 180;
  const pt = (v: number, r: number) => [80 + Math.cos(ang(v)) * r, 80 + Math.sin(ang(v)) * r];
  const els = [];
  for (let v = 0; v <= max; v += max / ticks) {
    const major = Math.round(v / (max / ticks)) % 2 === 0;
    const [x1, y1] = pt(v, 62), [x2, y2] = pt(v, major ? 51 : 57);
    els.push(<line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={red !== undefined && v >= red ? '#b3342b' : '#1f3b3a'} strokeWidth={major ? 2.4 : 1.3} />);
    if (major) { const [tx, ty] = pt(v, 41); els.push(<text key={'t' + v} x={tx} y={ty + 3.5} textAnchor="middle" fontSize="10" fill="#1f3b3a" fontWeight={700}>{unit === 'rpm' ? Math.round(v / 1000) : Math.round(v)}</text>); }
  }
  if (red !== undefined) { const [ax, ay] = pt(red, 66), [bx, by] = pt(max, 66); els.push(<path key="red" d={`M ${ax} ${ay} A 66 66 0 0 1 ${bx} ${by}`} stroke="#b3342b" strokeWidth="5" fill="none" />); }
  const [nx, ny] = pt(0, 57);
  return (
    <svg className="gauge" viewBox="0 0 160 160" width={size} height={size} aria-label={`${label} ${Math.round(value)}`}>
      <circle cx="80" cy="80" r="77" fill="#1f3b3a" />
      <circle cx="80" cy="80" r="71" fill="#efe3c8" stroke="#c9b48a" strokeWidth="2" />
      {els}
      <text x="80" y="60" textAnchor="middle" fontSize="7.5" fill="#6b5a3a" letterSpacing="1">{label}</text>
      {lcd && <><rect x="58" y="96" width="44" height="17" rx="3" fill="#1b2422" /><text ref={lcdRef} x="80" y="109" textAnchor="middle" fontSize="13" fill="#9fe0a8" fontFamily="ui-monospace, Menlo, monospace" fontWeight={700}>0</text></>}
      <g ref={needle}>
        <line x1="80" y1="80" x2={nx} y2={ny} stroke="#b3342b" strokeWidth="3" strokeLinecap="round" />
        <line x1="80" y1="80" x2={80 - (nx - 80) * 0.22} y2={80 - (ny - 80) * 0.22} stroke="#b3342b" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="80" cy="80" r="6" fill="#1f3b3a" /><circle cx="78.5" cy="78.5" r="1.8" fill="#4a6a68" />
    </svg>
  );
}

function Lamps({ h }: { h: HudState }) {
  const blink = h.blink;
  const lamp = (on: boolean, col: string, txt: string, title: string) => <span className={`lamp ${on ? 'on' : ''}`} style={{ ['--c' as string]: col }} title={title}>{txt}</span>;
  return (
    <div className="lamps">
      {lamp((h.indicator === 'left' || h.hazards) && blink, '#3fd16b', '◀', 'Лев покажувач')}
      {lamp(h.parkingBrake, '#e5402e', 'P', 'Рачна')}
      {lamp(h.engine !== 'running', '#e5402e', '⏻', 'Мотор')}
      {lamp(h.hazards && blink, '#e5402e', '△', 'Сите четири')}
      {lamp((h.indicator === 'right' || h.hazards) && blink, '#3fd16b', '▶', 'Десен покажувач')}
    </div>
  );
}

function Pedals({ h }: { h: HudState }) {
  const bar = (v: number, cls: string, label: string, bite?: [number, number]) => (
    <div className={`pedal-bar ${cls}`}>
      <div className="pb-track">
        {bite && <div className="pb-bite" style={{ bottom: `${bite[0] * 100}%`, height: `${(bite[1] - bite[0]) * 100}%` }} />}
        <div className="pb-fill" style={{ height: `${v * 100}%` }} />
      </div>
      <span>{label}</span>
    </div>
  );
  return (
    <div className="pedals" aria-label="Педали">
      {bar(h.clutch, 'c', 'К', h.assist === 'learn' ? h.bite : undefined)}
      {bar(h.brake, 'b', 'С')}
      {bar(h.throttle, 'g', 'Г')}
    </div>
  );
}

function Gate({ gear, suggest }: { gear: string; suggest: number | null }) {
  const pos: Record<string, [number, number]> = { 1: [12, 10], 2: [12, 50], 3: [36, 10], 4: [36, 50], 5: [60, 10], R: [60, 50], N: [36, 30] };
  const [x, y] = pos[gear] ?? pos.N;
  return (
    <svg className="gate" viewBox="0 0 72 60" aria-label={`Брзина ${gear}`}>
      <path d="M12 10 V50 M36 10 V50 M60 10 V50 M12 30 H60" stroke="#c9b48a" strokeWidth="4" fill="none" strokeLinecap="round" />
      {Object.entries(pos).filter(([k]) => k !== 'N').map(([k, [px, py]]) => <text key={k} x={px} y={py < 30 ? py - 2 : py + 9} textAnchor="middle" fontSize="8" fill={String(suggest) === k ? '#e8a33a' : '#efe3c8'} fontWeight={700}>{k}</text>)}
      <circle cx={x} cy={y} r="6" fill="#b3342b" stroke="#efe3c8" strokeWidth="1.5" />
    </svg>
  );
}

export function Hud({ engine, hud }: { engine: GameEngine; hud: HudState }) {
  const [legend, setLegend] = useState(engine.store.settings.legend && engine.store.history.length < 3);
  const [settings, setSettings] = useState(false);
  const sp = () => (engine.sim ? kmh(Math.abs(engine.sim.player.vx)) : 0);
  const rp = () => (engine.sim ? engine.sim.player.rpm : 0);
  const driving = hud.phase === 'drive';
  if (!driving) return null;
  const arrow = hud.task?.nav?.arrow;
  const arrowCh = arrow === 'left' ? '↰' : arrow === 'right' ? '↱' : arrow === 'park' ? 'P' : arrow === 'stop' ? '■' : arrow === 'reverse' ? '↓' : '↑';
  const intro = hud.countdown !== null;
  const camLabel = hud.camMode === 'chase' ? 'Зад колата' : hud.camMode === 'high' ? 'Од високо' : 'Возач';
  return (
    <div className={`hud ${intro ? 'intro-on' : ''}`}>
      <div className="instruments">
        <Gauge value={hud.speed} read={sp} lcd max={hud.env === 'openRoad' ? 140 : 120} ticks={hud.env === 'openRoad' ? 14 : 12} label="км/ч" unit="kmh" />
        <div className="gearbox">
          <div key={hud.gear} className={`gear-big ${hud.gear === 'R' ? 'r' : ''}`}>{hud.gear}</div>
          {hud.suggestGear && <div className="gear-sug">→ {hud.suggestGear}</div>}
          <Gate gear={hud.gear} suggest={hud.suggestGear} />
          <div className="limit" title="Важечко ограничување">{hud.limit}</div>
        </div>
        <Gauge value={hud.rpm} read={rp} max={Math.ceil(hud.redline / 1000 + 1) * 1000} ticks={Math.ceil(hud.redline / 1000 + 1) * 2} label="×1000 вртежи" unit="rpm" red={hud.redline} />
        <Lamps h={hud} />
        <Pedals h={hud} />
      </div>
      {hud.task && (
        <div className="task" role="status">
          {hud.task.nav && <span className="task-arrow">{arrowCh}</span>}
          <div className="task-body">
            <div className="task-t">{hud.task.text}{hud.task.nav?.dist ? <b className="task-d">{hud.task.nav.dist} м</b> : null}</div>
            {hud.task.sub && <div className="task-s">{hud.task.sub}</div>}
          </div>
          {hud.task.progress && <span className="task-p">{hud.task.progress}</span>}
        </div>
      )}
      {hud.say && !intro && <div key={hud.say.text} className="say"><span className="say-who">{hud.say.who}</span><span>{hud.say.text}</span></div>}
      {hud.prompt && !intro && <div key={hud.prompt} className="prompt"><Icon name="info" size={16} />{hud.prompt}</div>}
      {hud.toast && <div key={hud.toast.text} className={`toast ${hud.toast.tone}`}><Icon name={hud.toast.tone === 'ok' ? 'check' : hud.toast.tone === 'info' ? 'info' : 'warn'} size={16} />{hud.toast.text}</div>}
      {intro && <Intro engine={engine} hud={hud} />}
      <div className="mode-tag"><span>{MODE_LABEL[hud.mode]}</span><i />{ASSIST_LABEL[hud.assist]}</div>
      <div className="topbar">
        <button className="btn icon glass wide" onClick={() => engine.toggleCamera()} title="Камера (V)"><Icon name="camera" /><span>{camLabel}</span></button>
        <button className="btn icon glass" onClick={() => engine.toggleMute()} title="Звук (0)"><Icon name={hud.muted ? 'mute' : 'sound'} /></button>
        <button className="btn icon glass hide-touch hide-narrow" onClick={() => { setLegend(!legend); engine.store.settings.legend = !legend; engine.persist(); }} title="Копчиња"><Icon name="keys" /></button>
        <button className="btn icon glass" onClick={() => engine.command({ type: 'pause' })} title="Пауза (Esc)"><Icon name="pause" /></button>
      </div>
      {legend && !intro && (
        <div className="legend">
          {BINDINGS.slice(0, 15).map((b) => <div key={b.keys}><kbd>{b.keys}</kbd><span>{b.action}</span></div>)}
          <div className="legend-more">J/K/M огледала · U/I рамо · V камера · T почеток · Esc пауза</div>
        </div>
      )}
      {hud.glance && <div className="glance-tag"><Icon name="eye" size={15} />{hud.glance.startsWith('mirror') ? `${hud.glance === 'mirrorC' ? 'Внатрешно' : hud.glance === 'mirrorL' ? 'Лево' : 'Десно'} огледало` : hud.glance.startsWith('shoulder') ? `Преку ${hud.glance === 'shoulderL' ? 'левото' : 'десното'} рамо` : hud.glance === 'lookL' ? 'Поглед лево' : 'Поглед десно'}</div>}
      {hud.bubbles.map((b) => b.y > -900 && <div key={b.id} className="bubble" style={{ left: b.x, top: b.y }}>{b.text}</div>)}
      {hud.paused && !settings && <PauseMenu engine={engine} hud={hud} onSettings={() => setSettings(true)} />}
      {settings && <Settings engine={engine} onClose={() => setSettings(false)} />}
      {hud.env === 'osm' && <div className="osm-attr">© OpenStreetMap contributors (ODbL)</div>}
      <TouchControls engine={engine} hud={hud} />
    </div>
  );
}

/** Cinematic opening: letterbox, place and conditions, while the camera sweeps in behind the car. */
function Intro({ engine, hud }: { engine: GameEngine; hud: HudState }) {
  const c = engine.config;
  return (
    <div className="intro">
      <div className="lb top" /><div className="lb bot" />
      <div className="intro-card">
        <div className="intro-k">{MODE_LABEL[hud.mode]} · {TIME_LABEL[c.time ?? 'golden']} · {WEATHER_LABEL[c.weather ?? 'clear']}</div>
        <div className="intro-t">{ENV_INFO[hud.env].title}</div>
        <div className="intro-s">{hud.task?.text ?? ''}</div>
      </div>
    </div>
  );
}

function PauseMenu({ engine, hud, onSettings }: { engine: GameEngine; hud: HudState; onSettings: () => void }) {
  const resume = () => engine.command({ type: 'pause' });
  return (
    <div className="scrim" onClick={resume}>
      <div className="sheet narrow pause" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-h"><div><div className="kicker">{ENV_INFO[hud.env].title} · {MODE_LABEL[hud.mode]}</div><h2>Пауза</h2></div></header>
        <div className="sheet-b pause-list">
          <button className="btn primary block" onClick={resume}><Icon name="play" size={18} />Продолжи<kbd>Esc</kbd></button>
          <button className="btn glass block" onClick={() => engine.retrySame()}><Icon name="retry" size={18} />Истата ситуација одново</button>
          <button className="btn glass block" onClick={() => engine.retryNew()}><Icon name="shuffle" size={18} />Нова варијација</button>
          {hud.env === 'polygon' && <button className="btn glass block" onClick={() => { engine.command({ type: 'pause' }); engine.command({ type: 'reset' }); }}><Icon name="flag" size={18} />На почеток на вежбата</button>}
          <button className="btn glass block" onClick={onSettings}><Icon name="sliders" size={18} />Поставки</button>
          <button className="btn ghost block" data-sound="back" onClick={() => engine.backToMenu()}><Icon name="home" size={18} />Главно мени</button>
        </div>
      </div>
    </div>
  );
}

/** Analog drag zone: reports a value from the pointer position while held. */
function useDrag(onMove: (fx: number, fy: number, el: HTMLElement) => void, onEnd: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const mv = useRef(onMove); mv.current = onMove;
  const en = useRef(onEnd); en.current = onEnd;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let id: number | null = null;
    const at = (e: PointerEvent) => { const r = el.getBoundingClientRect(); mv.current(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)), el); };
    const down = (e: PointerEvent) => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { el.setPointerCapture(id); } catch { /* */ } el.classList.add('held'); at(e); };
    const move = (e: PointerEvent) => { if (e.pointerId === id) at(e); };
    const up = (e: PointerEvent) => { if (e.pointerId !== id) return; id = null; el.classList.remove('held'); en.current(); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, []);
  return ref;
}
function useHold(onChange: (v: boolean) => void) {
  const ref = useRef<HTMLButtonElement>(null);
  const cb = useRef(onChange); cb.current = onChange;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const down = (e: PointerEvent) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* */ } el.classList.add('held'); cb.current(true); };
    const up = (e: PointerEvent) => { e.preventDefault(); el.classList.remove('held'); cb.current(false); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, []);
  return ref;
}

/** Landscape touch: left thumb slides on a steering pad (analog), right thumb works three
 *  pressure pedals (finger depth = pedal travel — so the clutch bite can be held), plus a tap gearbox. */
function TouchControls({ engine, hud }: { engine: GameEngine; hud: HudState }) {
  const t = engine.input.touch;
  const knob = useRef<HTMLSpanElement>(null);
  const steerRef = useDrag((fx) => { const v = (0.5 - fx) * 2.4; t.steer = Math.max(-1, Math.min(1, Math.abs(v) < 0.06 ? 0 : v)); if (knob.current) knob.current.style.transform = `translateX(${(fx - 0.5) * 100}%)`; },
    () => { t.steer = 0; if (knob.current) knob.current.style.transform = ''; });
  const depth = (fy: number) => Math.max(0.2, Math.min(1, 0.2 + fy * 0.95));
  const gRef = useDrag((_, fy, el) => { t.throttle = depth(fy); el.style.setProperty('--d', String(t.throttle)); }, () => { t.throttle = 0; });
  const bRef = useDrag((_, fy, el) => { t.brake = depth(fy); el.style.setProperty('--d', String(t.brake)); }, () => { t.brake = 0; });
  const cRef = useDrag((_, fy, el) => { const v = Math.max(0, Math.min(1, fy * 1.15)); t.clutchLatch = v; t.clutchHeld = v > 0.97; el.style.setProperty('--d', String(v)); }, () => { t.clutchLatch = null; t.clutchHeld = false; });
  const mlRef = useHold((v) => { t.glance = v ? 'mirrorL' : null; });
  const mcRef = useHold((v) => { t.glance = v ? 'mirrorC' : null; });
  const mrRef = useHold((v) => { t.glance = v ? 'mirrorR' : null; });
  const slRef = useHold((v) => { t.glance = v ? 'shoulderL' : null; });
  const srRef = useHold((v) => { t.glance = v ? 'shoulderR' : null; });
  useEffect(() => () => { t.steer = 0; t.throttle = 0; t.brake = 0; t.clutchHeld = false; t.clutchLatch = null; t.horn = false; t.glance = null; }, [t]);
  const cmd = (c: Parameters<GameEngine['command']>[0]) => engine.command(c);
  const gears: (1 | 2 | 3 | 4 | 5 | 'N' | 'R')[] = [1, 3, 5, 'N', 2, 4, 'R'];
  return (
    <div className="touch">
      <div className="touch-left">
        <div className="t-row">
          <button className={`tbtn ${hud.indicator === 'left' && hud.blink ? 'blink' : ''}`} onClick={() => cmd({ type: 'indicator', dir: 'left' })} aria-label="Лев покажувач">◀</button>
          <button ref={slRef} className="tbtn" aria-label="Преку лево рамо">↶</button>
          <button ref={mlRef} className="tbtn" aria-label="Лево огледало">◧</button>
          <button ref={mcRef} className="tbtn" aria-label="Внатрешно огледало">▭</button>
          <button ref={mrRef} className="tbtn" aria-label="Десно огледало">◨</button>
          <button ref={srRef} className="tbtn" aria-label="Преку десно рамо">↷</button>
          <button className={`tbtn ${hud.indicator === 'right' && hud.blink ? 'blink' : ''}`} onClick={() => cmd({ type: 'indicator', dir: 'right' })} aria-label="Десен покажувач">▶</button>
        </div>
        <div ref={steerRef} className="steer-pad" aria-label="Волан: лизгај лево-десно"><span className="steer-track" /><span ref={knob} className="steer-knob"><Icon name="wheel" size={26} /></span></div>
      </div>
      <div className="touch-right">
        <div className="t-row">
          <button className={`tbtn ${hud.engine !== 'running' ? 'warn' : ''}`} onClick={() => cmd({ type: 'engine' })} aria-label="Мотор">⏻</button>
          <button className={`tbtn ${hud.parkingBrake ? 'on-red' : ''}`} onClick={() => cmd({ type: 'parkingBrake' })} aria-label="Рачна">P</button>
          <div className="t-gears">{gears.map((g) => <button key={String(g)} className={`tg ${hud.gear === String(g) ? 'on' : ''}`} onClick={() => cmd({ type: 'gear', gear: g })}>{g}</button>)}</div>
        </div>
        <div className="t-row pedals-row">
          <div ref={cRef} className="tpedal clutch"><i /><b>К</b><small>кумплунг</small></div>
          <div ref={bRef} className="tpedal brake"><i /><b>С</b><small>сопирачка</small></div>
          <div ref={gRef} className="tpedal gas"><i /><b>Г</b><small>гас</small></div>
        </div>
      </div>
    </div>
  );
}

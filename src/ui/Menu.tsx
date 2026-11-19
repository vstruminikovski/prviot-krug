import { useEffect, useState } from 'react';
import type { GameEngine } from '../game/engine';
import { ENV_INFO, compatibility, decodeChallenge } from '../game/attempt';
import { MODE_LABEL, type Mode } from '../game/missions/types';
import { vehicleById } from '../game/vehicles/defs';
import { BINDINGS } from '../game/input';
import { incomingChallenge } from '../game/host';
import type { EnvId } from '../game/env/types';
import type { Assist } from '../game/vehicles/vehicle';
import { Sources } from './Sources';
import { GoogleTilesView } from './GoogleTilesView';
import { Booklet } from './Booklet';
import { Settings } from './Settings';
import { earnedStamps, nextStamp, STAMP_SETUP, STAMPS } from '../game/career';
import { TIME_LABEL, WEATHER_LABEL, type TimeOfDay, type Weather } from '../game/render/atmosphere';
import { googleTilesEnabled } from '../game/render/googleTiles';
import { Icon, Logo, Modal, Seg, type IconName } from './kit';

const ASSISTS: { id: Assist; label: string; note: string }[] = [
  { id: 'learn', label: 'Со помош', note: 'Не гасне лесно, точката на зафаќање е означена, ти предлага брзина.' },
  { id: 'manual', label: 'Мануелно', note: 'Ти ги менуваш брзините и го водиш кумплунгот.' },
  { id: 'exam', label: 'Испит', note: 'Без совети на екранот, без автоматика.' },
  { id: 'auto', label: 'Автоматски', note: 'Пристапност: кумплунгот и брзините се автоматски. Резултатите се означени.' },
];
const MODES: { id: Mode; note: string }[] = [
  { id: 'lesson', note: 'Инструкторот води, советува и враќа кога треба.' },
  { id: 'practice', note: 'Без притисок, без задолжителен рестарт.' },
  { id: 'challenge', note: 'Кратко и строго — критична грешка го ресетира обидот.' },
  { id: 'exam', note: 'Официјален оценувачки лист (над 50 нег. поени = не положено). Игра, не сертификат.' },
  { id: 'free', note: 'Слободно возење без крај.' },
];
const ENV_ICON: Record<EnvId, IconName> = { polygon: 'flag', city: 'home', osm: 'map', openRoad: 'wheel' };
const TIME_ICON: Record<TimeOfDay, IconName> = { golden: 'sun', noon: 'sun', dusk: 'sun', night: 'moon' };
const WEATHER_ICON: Record<Weather, IconName> = { clear: 'sun', rain: 'rain', fog: 'fog' };

export function Menu({ engine }: { engine: GameEngine }) {
  const [env, setEnv] = useState<EnvId>(engine.config.env);
  const [mode, setMode] = useState<Mode>(engine.config.mode);
  const [assist, setAssist] = useState<Assist>(engine.store.settings.assist);
  const [time, setTime] = useState<TimeOfDay>(engine.config.time ?? 'golden');
  const [weather, setWeather] = useState<Weather>(engine.config.weather ?? 'clear');
  const [sheet, setSheet] = useState<null | 'sources' | 'gmap' | 'book' | 'settings' | 'help'>(engine.store.history.length === 0 ? 'help' : null);
  const code = incomingChallenge();
  const ch = decodeChallenge(code);
  const def = vehicleById(engine.store.garage.vehicle);
  const block = compatibility(def.id, env);
  const stamps = earnedStamps(engine.store.history).length;
  const last = engine.store.history.slice(-3).reverse();
  const goal = nextStamp(engine.store.history);
  const go = () => { if (block) return; engine.store.settings.assist = assist; engine.persist(); engine.start({ env, mode, assist, time, weather }); };
  // keyboard: Enter drives, ? opens help, G garage
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (sheet || (e.target as HTMLElement)?.closest?.('input,select,textarea')) return;
      if (e.code === 'Enter') { e.preventDefault(); go(); }
      else if (e.key === '?') setSheet('help');
      else if (e.code === 'KeyG') engine.openGarage();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  return (
    <div className="menu">
      <aside className="menu-panel panel">
        <header className="menu-top">
          <Logo />
          <nav className="menu-icons">
            <button className="btn icon glass badge-wrap" onClick={() => setSheet('book')} title="Возачка книшка"><Icon name="book" />{stamps > 0 && <span className="badge-dot">{stamps}</span>}</button>
            <button className="btn icon glass" onClick={() => setSheet('settings')} title="Поставки"><Icon name="sliders" /></button>
            <button className="btn icon glass" onClick={() => setSheet('help')} title="Како се вози (?)"><Icon name="help" /></button>
          </nav>
        </header>
        <div className="menu-scroll">
          {ch && (
            <div className="banner amber">
              <Icon name="flag" />
              <div><b>Предизвик од другар</b><small>{ENV_INFO[ch.config.env].title} · {MODE_LABEL[ch.config.mode]} · {vehicleById(ch.config.vehicle).name}{ch.score !== null ? ` · ${ch.score} поени` : ''}</small>{ch.versionMismatch && <small className="warn-t">Од друга верзија — ситуацијата може да се разликува.</small>}</div>
              <button className="btn primary sm" onClick={() => { engine.store.garage.vehicle = ch.config.vehicle; engine.start(ch.config, false); }}>Прифати</button>
            </div>
          )}
          {goal && (
            <button className="goal" onClick={() => { const g = STAMP_SETUP[goal.id]; setEnv(g.env); setMode(g.mode); if (g.assist) setAssist(g.assist); if (g.time) setTime(g.time); }}>
              <span className="goal-stamp">{STAMPS.indexOf(goal) + 1}</span>
              <span className="goal-t"><small>Следен печат · {stamps}/{STAMPS.length}</small><b>{goal.title}</b><span>{goal.how}</span></span>
              <span className="goal-go">Постави<Icon name="next" size={15} /></span>
            </button>
          )}
          <section>
            <h3 className="sec">Каде возиш</h3>
            <div className="env-grid">
              {(Object.keys(ENV_INFO) as EnvId[]).map((e, i) => (
                <button key={e} className={`env-tile env-${e} ${env === e ? 'on' : ''}`} style={{ ['--i' as string]: i }} onClick={() => setEnv(e)} aria-pressed={env === e}>
                  <span className="env-ico"><Icon name={ENV_ICON[e]} size={22} /></span>
                  <b>{ENV_INFO[e].title}</b>
                  <small>{ENV_INFO[e].blurb}</small>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="sec">Режим</h3>
            <Seg value={mode} onChange={setMode} options={MODES.map((m) => ({ id: m.id, label: MODE_LABEL[m.id], title: m.note }))} />
            <p className="hint">{MODES.find((m) => m.id === mode)?.note}</p>
          </section>
          <section>
            <h3 className="sec">Менувач</h3>
            <Seg value={assist} onChange={setAssist} options={ASSISTS.map((a) => ({ id: a.id, label: a.label, title: a.note }))} />
            <p className="hint">{ASSISTS.find((a) => a.id === assist)?.note}</p>
          </section>
          <section>
            <h3 className="sec">Услови</h3>
            <div className="seg-row">
              <Seg size="sm" value={time} onChange={setTime} options={(Object.keys(TIME_LABEL) as TimeOfDay[]).map((t) => ({ id: t, label: <><Icon name={TIME_ICON[t]} size={15} />{TIME_LABEL[t]}</> }))} />
              <Seg size="sm" value={weather} onChange={setWeather} options={(Object.keys(WEATHER_LABEL) as Weather[]).map((w) => ({ id: w, label: <><Icon name={WEATHER_ICON[w]} size={15} />{WEATHER_LABEL[w]}</> }))} />
            </div>
            {weather === 'rain' && <p className="hint">Дожд: помало прилепување (≈72 %) и подолг пат на сопирање.</p>}
            {weather === 'fog' && <p className="hint">Магла: видливост околу 100 m — вози со светла и поголемо растојание.</p>}
          </section>
          {last.length > 0 && (
            <section>
              <h3 className="sec">Последни обиди</h3>
              <div className="recent">
                {last.map((h, i) => (
                  <div key={i} className="recent-row"><span className={`dot ${h.failed || h.passed === false ? 'bad' : 'ok'}`} /><span>{ENV_INFO[h.env].title}</span><small>{MODE_LABEL[h.mode]} · {vehicleById(h.vehicle).name}</small><b>{h.score}</b></div>
                ))}
              </div>
            </section>
          )}
          <div className="menu-links">
            <button className="link" onClick={() => setSheet('sources')}><Icon name="info" size={15} />Извори и правила</button>
            <button className="link" disabled={!googleTilesEnabled()} title={googleTilesEnabled() ? '' : 'Потребен е VITE_GOOGLE_MAPS_API_KEY (види README)'} onClick={() => setSheet('gmap')}><Icon name="map" size={15} />Google 3D поглед</button>
          </div>
        </div>
        <footer className="menu-foot">
          <button className="car-chip" onClick={() => engine.openGarage()} title="Гаража (G)">
            <span className="swatch" style={{ background: engine.store.garage.paint }}><Icon name="car" size={16} /></span>
            <span className="car-chip-t"><b>{def.name}</b><small>{def.familyLabel} · гаража</small></span>
            <Icon name="next" size={16} />
          </button>
          <button className="btn primary go" disabled={!!block} onClick={go}><Icon name="play" size={18} />Возиме<kbd>Enter</kbd></button>
        </footer>
        {block && <p className="block-note"><Icon name="warn" size={15} />{block}</p>}
      </aside>
      <div className="menu-hero" aria-hidden>
        <div className="hero-k">Епизода 1</div>
        <div className="hero-t">Првиот круг</div>
        <div className="hero-s">Дебар Маало · Скопје · 1999</div>
      </div>
      {sheet === 'sources' && <Sources onClose={() => setSheet(null)} />}
      {sheet === 'gmap' && <GoogleTilesView onClose={() => setSheet(null)} />}
      {sheet === 'book' && <Booklet history={engine.store.history} plate={engine.store.garage.plate} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <Settings engine={engine} onClose={() => setSheet(null)} />}
      {sheet === 'help' && <HowTo onClose={() => setSheet(null)} />}
    </div>
  );
}

export function HowTo({ onClose }: { onClose: () => void }) {
  const touch = matchMedia('(pointer: coarse)').matches;
  return (
    <Modal title="Како се вози" kicker="Рачен менувач · 30 секунди" onClose={onClose}>
      <div className="howto">
        <div className="howto-anim" aria-hidden>
          <div className="ap ap-c"><span>К</span><i /></div>
          <div className="ap ap-g"><span>Г</span><i /></div>
          <div className="ap-gear">1</div>
        </div>
        {touch ? (
          <ol className="steps">
            <li>Држи го <b>К</b> (кумплунг) долу, допри <b>1</b> на менувачот.</li>
            <li>Спушти ја рачната — <b>P</b>.</li>
            <li>Малку <b>Г</b> (гас), а прстот од <b>К</b> лизгај нагоре — колата полека тргнува.</li>
            <li>Управувај со лизгање по левата подлога. Огледалата се на копчињата горе.</li>
          </ol>
        ) : (
          <ol className="steps">
            <li><kbd>Space</kbd> држи кумплунг, <kbd>1</kbd> прва брзина.</li>
            <li><kbd>P</kbd> спушти ја рачната.</li>
            <li>Малку <kbd>W</kbd> гас и пушти <kbd>Space</kbd> — кумплунгот сам оди полека низ точката на зафаќање. <kbd>Z</kbd>/<kbd>X</kbd> го задржуваат.</li>
            <li><kbd>Q</kbd>/<kbd>E</kbd> покажувач, <kbd>J</kbd>/<kbd>K</kbd>/<kbd>M</kbd> огледала, <kbd>U</kbd>/<kbd>I</kbd> преку рамо, <kbd>V</kbd> камера.</li>
          </ol>
        )}
        <p className="hint">Изгасна? Кумплунг + <kbd>R</kbd>. Не тргнува? Жолтата порака под инструкторот кажува зошто.</p>
        {!touch && (
          <details className="all-keys"><summary>Сите контроли</summary>
            <div className="keys-grid">{BINDINGS.map((b) => <div key={b.keys}><kbd>{b.keys}</kbd><span>{b.action}</span></div>)}</div>
          </details>
        )}
        <button className="btn primary block" onClick={onClose}>Разбрав</button>
      </div>
    </Modal>
  );
}

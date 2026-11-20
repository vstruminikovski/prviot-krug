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
import { Booklet } from './Booklet';
import { Settings } from './Settings';
import { earnedStamps, nextStamp, STAMP_SETUP, STAMPS } from '../game/career';
import { TIME_LABEL, WEATHER_LABEL, type TimeOfDay, type Weather } from '../game/render/atmosphere';
import { Icon, Logo, Modal, Seg, type IconName } from './kit';

const ASSISTS: { id: Assist; label: string; note: string }[] = [
  { id: 'learn', label: 'Со помош', note: 'Не гасне лесно, точката на зафаќање е означена, ти предлага брзина.' },
  { id: 'manual', label: 'Мануелно', note: 'Ти ги менуваш брзините и го водиш кумплунгот.' },
  { id: 'auto', label: 'Автоматски', note: 'Пристапност: кумплунгот и брзините се автоматски. Резултатите се означени.' },
];
const ENV_ICON: Record<EnvId, IconName> = { polygon: 'flag', city: 'home', openRoad: 'wheel' };
const TIME_ICON: Record<TimeOfDay, IconName> = { golden: 'sun', noon: 'sun', dusk: 'sun', night: 'moon' };
const WEATHER_ICON: Record<Weather, IconName> = { clear: 'sun', rain: 'rain', fog: 'fog' };

export function Menu({ engine }: { engine: GameEngine }) {
  const saved = engine.store.menu;
  const [env, setEnv] = useState<EnvId>(saved?.env ?? engine.config.env);
  const [mode, setMode] = useState<Mode>((saved?.mode ?? engine.config.mode) === 'exam' ? 'exam' : 'lesson'); // Часови | Полагање
  const [assist, setAssist] = useState<Assist>(engine.store.settings.assist === 'exam' ? 'manual' : engine.store.settings.assist);
  const [time, setTime] = useState<TimeOfDay>(saved?.time ?? engine.config.time ?? 'golden');
  const [weather, setWeather] = useState<Weather>(saved?.weather ?? engine.config.weather ?? 'clear');
  // remember every choice immediately (garage visits and reloads keep it)
  useEffect(() => { engine.store.menu = { env, mode, time, weather }; engine.persist(); }, [engine, env, mode, time, weather]);
  const [sheet, setSheet] = useState<null | 'sources' | 'book' | 'settings' | 'help'>(engine.store.history.length === 0 ? 'help' : null);
  const code = incomingChallenge();
  const ch = decodeChallenge(code);
  const def = vehicleById(engine.store.garage.vehicle);
  const block = compatibility(def.id, env);
  const stamps = earnedStamps(engine.store.history).length;
  const last = engine.store.history.slice(-3).reverse();
  const touch = matchMedia('(pointer: coarse)').matches;
  const goal = nextStamp(engine.store.history, touch);
  const go = () => { if (block) return; engine.store.settings.assist = assist; engine.persist(); engine.start({ env, mode, assist, time, weather }); };
  // live preview: the 3D background shows the chosen time of day and weather right away
  useEffect(() => { const a = engine.view.atmo; a.setTime(time); a.setWeather(weather); a.updateLamps(); }, [engine, time, weather]);
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
            <button className="goal" onClick={() => { const g = STAMP_SETUP[goal.id]; setEnv(g.env); setMode(g.mode === 'exam' ? 'exam' : 'lesson'); if (g.assist) setAssist(g.assist); if (g.time) setTime(g.time); }}>
              <span className="goal-stamp">{STAMPS.indexOf(goal) + 1}</span>
              <span className="goal-t"><small>Следен печат · {stamps}/{STAMPS.length}</small><b>{goal.title}</b><span>{goal.how}</span></span>
              <span className="goal-go">Постави<Icon name="next" size={15} /></span>
            </button>
          )}
          <section>
            <h3 className="sec">Што возиш</h3>
            <div className="mode-grid">
              <button className={`mode-card ${mode !== 'exam' ? 'on' : ''}`} onClick={() => setMode('lesson')} aria-pressed={mode !== 'exam'}>
                <span className="mode-ico"><Icon name="wheel" size={22} /></span>
                <b>Часови</b>
                <small>Инструкторот учи и исправа: предупредува, објаснува, запира кога е опасно и ти дава да повториш. Не е испит.</small>
              </button>
              <button className={`mode-card exam ${mode === 'exam' ? 'on' : ''}`} onClick={() => { setMode('exam'); if (env === 'openRoad') setEnv('city'); }} aria-pressed={mode === 'exam'}>
                <span className="mode-ico"><Icon name="flag" size={22} /></span>
                <b>Полагање</b>
                <small>Строго, без совети. Се бодува само по официјалните листови (Образец бр. 1 и 4). Над 50 негативни поени = не положено.</small>
              </button>
            </div>
          </section>
          <section>
            <h3 className="sec">Каде</h3>
            <div className="env-grid">
              {(Object.keys(ENV_INFO) as EnvId[]).filter((e) => mode !== 'exam' || e !== 'openRoad').map((e, i) => (
                <button key={e} className={`env-tile env-${e} ${env === e ? 'on' : ''}`} style={{ ['--i' as string]: i }} onClick={() => setEnv(e)} aria-pressed={env === e}>
                  <span className="env-ico"><Icon name={ENV_ICON[e]} size={22} /></span>
                  <b>{ENV_INFO[e].title}</b>
                  <small>{mode === 'exam' ? (e === 'polygon' ? 'Прв практичен дел: пет вежби по чл. 33, Образец бр. 1.' : 'Втор практичен дел во сообраќај, Образец бр. 4.') : ENV_INFO[e].blurb}</small>
                </button>
              ))}
            </div>
          </section>
          {(
            <section>
              <h3 className="sec">Менувач</h3>
              <Seg value={assist} onChange={setAssist} options={ASSISTS.map((a) => ({ id: a.id, label: a.label, title: a.note }))} />
              <p className="hint">{ASSISTS.find((a) => a.id === assist)?.note}</p>
            </section>
          )}
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
      {sheet === 'book' && <Booklet history={engine.store.history} plate={engine.store.garage.plate} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <Settings engine={engine} onClose={() => setSheet(null)} />}
      {sheet === 'help' && <HowTo assist={assist} onClose={() => setSheet(null)} />}
    </div>
  );
}

export function HowTo({ onClose, assist = 'manual' }: { onClose: () => void; assist?: Assist }) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const auto = assist === 'auto';
  return (
    <Modal title="Како се вози" kicker={auto ? 'Автоматски менувач · 20 секунди' : 'Рачен менувач · 30 секунди'} onClose={onClose}>
      <div className="howto">
        {!auto && (
          <div className="howto-anim" aria-hidden>
            <div className="ap ap-c"><span>К</span><i /></div>
            <div className="ap ap-g"><span>Г</span><i /></div>
            <div className="ap-gear">1</div>
          </div>
        )}
        {auto ? (touch ? (
          <ol className="steps">
            <li><b>Лев палец</b> лизга по подлогата — волан.</li>
            <li><b>Десно</b>: тесната педала е гас, широката кочи. Подлабоко = повеќе.</li>
            <li><b>D / R</b> — напред или рикверц (кога стоиш). Брзините се менуваат сами.</li>
            <li><b>(P)</b> рачна. На угорнина: крени ја пред да ја пуштиш кочницата; со гас сама попушта.</li>
            <li>Стрелките горе се покажувачи, <b>окото</b> — огледало, подолго преку рамо.</li>
          </ol>
        ) : (
          <ol className="steps">
            <li><kbd>W</kbd> гас, <kbd>S</kbd> кочница, <kbd>A</kbd>/<kbd>D</kbd> волан.</li>
            <li><kbd>1</kbd> напред (D), <kbd>6</kbd> рикверц (R) — кога стоиш. Брзините се менуваат сами.</li>
            <li><kbd>P</kbd> рачна. На угорнина: крени ја пред да ја пуштиш кочницата; со гас сама попушта.</li>
            <li><kbd>Q</kbd>/<kbd>E</kbd> покажувач, <kbd>J</kbd>/<kbd>K</kbd>/<kbd>M</kbd> огледала, <kbd>U</kbd>/<kbd>I</kbd> преку рамо, <kbd>V</kbd> камера.</li>
          </ol>
        )) : touch ? (
          <ol className="steps">
            <li><b>Лев палец</b> лизга по подлогата — волан.</li>
            <li><b>Десно</b>: широката педала кочи, тесната е гас. Подлабоко = повеќе.</li>
            <li><b>Автоматски</b>: D / R — напред или рикверц.</li>
            <li><b>Рачен</b>: третата педала е кумплунг — лизгај надолу за до дното; кога ќе го кренеш прстот, сам излегува полека. Брзини со <b>+ / −</b>, палење со клучот.</li>
            <li><b>(P)</b> рачна. Стрелките горе се покажувачи, <b>окото</b> — огледало, подолго преку рамо.</li>
          </ol>
        ) : (
          <ol className="steps">
            <li><kbd>Space</kbd> држи кумплунг, <kbd>1</kbd> прва брзина.</li>
            <li><kbd>P</kbd> спушти ја рачната.</li>
            <li>Малку <kbd>W</kbd> гас и пушти <kbd>Space</kbd> — кумплунгот сам оди полека низ точката на зафаќање. <kbd>Z</kbd>/<kbd>X</kbd> го задржуваат.</li>
            <li><kbd>Q</kbd>/<kbd>E</kbd> покажувач, <kbd>J</kbd>/<kbd>K</kbd>/<kbd>M</kbd> огледала, <kbd>U</kbd>/<kbd>I</kbd> преку рамо, <kbd>V</kbd> камера.</li>
          </ol>
        )}
        <p className="hint">{auto ? 'Не тргнува? Пораката горе кажува зошто (најчесто: рачната или кочницата).' : touch ? 'Изгасна? Кумплунг до дното, па клучот. Не тргнува? Пораката горе кажува зошто.' : <>Изгасна? Кумплунг + <kbd>R</kbd>. Не тргнува? Жолтата порака под инструкторот кажува зошто.</>}</p>
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

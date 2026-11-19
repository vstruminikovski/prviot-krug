import { useState } from 'react';
import type { GameEngine } from '../game/engine';
import { ENV_INFO, compatibility, decodeChallenge } from '../game/attempt';
import { MODE_LABEL, type Mode } from '../game/missions/types';
import { vehicleById, VEHICLES } from '../game/vehicles/defs';
import { BINDINGS } from '../game/input';
import { incomingChallenge } from '../game/host';
import type { EnvId } from '../game/env/types';
import type { Assist } from '../game/vehicles/vehicle';
import { Sources } from './Sources';

const ASSISTS: { id: Assist; label: string; note: string }[] = [
  { id: 'learn', label: 'Помош при учење', note: 'Помош против гаснење, означена точка на зафаќање, предлог за брзина.' },
  { id: 'manual', label: 'Мануелно', note: 'Ти ги менуваш брзините и го водиш кумплунгот.' },
  { id: 'exam', label: 'Испит / предизвик', note: 'Без совети на екранот. Без автоматика.' },
  { id: 'auto', label: 'Автоматски', note: 'Пристапност. Резултатите се означени како автоматски.' },
];
const MODES: { id: Mode; note: string }[] = [
  { id: 'lesson', note: 'Инструктор, совети, контролирано враќање.' },
  { id: 'practice', note: 'Без притисок, без задолжителен рестарт.' },
  { id: 'challenge', note: 'Кратко. Критична грешка го ресетира обидот.' },
  { id: 'exam', note: 'Официјален лист (> 50 нег. поени = не положено). Само игра — не е сертификат.' },
  { id: 'free', note: 'Слободно возење без крај.' },
];

export function Menu({ engine }: { engine: GameEngine }) {
  const [env, setEnv] = useState<EnvId>(engine.config.env);
  const [mode, setMode] = useState<Mode>(engine.config.mode);
  const [assist, setAssist] = useState<Assist>(engine.store.settings.assist);
  const [sources, setSources] = useState(false);
  const code = incomingChallenge();
  const ch = decodeChallenge(code);
  const def = vehicleById(engine.store.garage.vehicle);
  const block = compatibility(def.id, env);
  const last = engine.store.history.slice(-3).reverse();
  const go = () => { engine.store.settings.assist = assist; engine.persist(); engine.start({ env, mode, assist }); };
  return (
    <div className="menu">
      <div className="menu-card">
        <div className="kicker">Возачка школа · Дебар Маало · 1999</div>
        <h1>Круг низ маалото</h1>
        <p className="lead">Секој круг е различен. Управувај со автомобилот, читај го сообраќајот, слушај го инструкторот и донесувај одлуки — истовремено.</p>
        {ch && (
          <div className="challenge">
            Предизвик од другар: <b>{ENV_INFO[ch.config.env].title}</b>, {MODE_LABEL[ch.config.mode]}, {vehicleById(ch.config.vehicle).name}, {ASSISTS.find((a) => a.id === ch.config.assist)?.label}{ch.score !== null ? <> — <b>{ch.score} поени</b></> : null}.
            {ch.versionMismatch && <div className="warn">Предизвикот е од друга верзија на играта — ситуацијата може да не е иста.</div>}
            <button className="btn primary small" onClick={() => { engine.store.garage.vehicle = ch.config.vehicle; engine.start(ch.config, false); }}>Да те видам ти</button>
          </div>
        )}
        <h3>Каде возиш?</h3>
        <div className="env-cards">
          {(Object.keys(ENV_INFO) as EnvId[]).map((e) => (
            <button key={e} className={`env-card ${env === e ? 'sel' : ''} env-${e}`} onClick={() => setEnv(e)}>
              <b>{ENV_INFO[e].title}</b><span>{ENV_INFO[e].blurb}</span>
            </button>
          ))}
        </div>
        <h3>Како?</h3>
        <div className="chips">{MODES.map((m) => <button key={m.id} className={`chip ${mode === m.id ? 'sel' : ''}`} onClick={() => setMode(m.id)} title={m.note}>{MODE_LABEL[m.id]}</button>)}</div>
        <p className="note">{MODES.find((m) => m.id === mode)?.note}</p>
        <div className="chips">{ASSISTS.map((a) => <button key={a.id} className={`chip ${assist === a.id ? 'sel' : ''}`} onClick={() => setAssist(a.id)} title={a.note}>{a.label}</button>)}</div>
        <p className="note">{ASSISTS.find((a) => a.id === assist)?.note}</p>
        <div className="vehicle-row">
          <span className="swatch" style={{ background: engine.store.garage.paint }} />
          <div><b>{def.name}</b> · {def.familyLabel}<br /><small>{def.scope.label}</small></div>
          <button className="btn small" onClick={() => engine.openGarage()}>Гаража</button>
        </div>
        {block && <p className="warn">{block}</p>}
        <div className="row">
          <button className="btn primary big" disabled={!!block} onClick={go}>Возиме</button>
          <button className="btn ghost small" onClick={() => setSources(true)}>Извори и правила</button>
        </div>
        {last.length > 0 && (
          <div className="history">
            {last.map((h, i) => <div key={i}>{ENV_INFO[h.env].title} · {MODE_LABEL[h.mode]} · {vehicleById(h.vehicle).name} — <b>{h.score}</b>{h.passed === true ? ' · положено' : h.passed === false ? ' · не положено' : ''}{h.failed ? ` · ${h.failed}` : ''}</div>)}
          </div>
        )}
      </div>
      <ControlCard />
      {sources && <Sources onClose={() => setSources(false)} />}
      <span className="sr">{VEHICLES.length}</span>
    </div>
  );
}

function ControlCard() {
  return (
    <div className="control-card">
      <h3>Тргнување (рачен менувач)</h3>
      <div className="anim-pedals" aria-hidden>
        <div className="ap ap-c"><span>К</span></div>
        <div className="ap ap-g"><span>Г</span></div>
        <div className="ap-gear">1</div>
      </div>
      <ol>
        <li><kbd>Space</kbd> држи кумплунг → <kbd>1</kbd> прва</li>
        <li><kbd>P</kbd> спушти рачна</li>
        <li>Малку <kbd>W</kbd> гас, пушти <kbd>Space</kbd> — кумплунгот сам оди полека низ точката на зафаќање. Со <kbd>X</kbd> / <kbd>Z</kbd> го задржуваш.</li>
        <li><kbd>Q</kbd>/<kbd>E</kbd> покажувач, <kbd>J</kbd>/<kbd>K</kbd> огледала, <kbd>U</kbd>/<kbd>I</kbd> преку рамо.</li>
      </ol>
      <details><summary>Сите контроли</summary>
        <div className="all-keys">{BINDINGS.map((b) => <div key={b.keys}><kbd>{b.keys}</kbd> {b.action}</div>)}</div>
      </details>
      <p className="note">Изгасна? Кумплунг + <kbd>R</kbd>. Возилото не тргнува? Погледни ја пораката под инструкторот — кажува зошто.</p>
    </div>
  );
}

import { useState } from 'react';
import type { GameEngine, HudState, ReplayState } from '../game/engine';
import { SCENARIOS, SOURCES, SPEC_NOTES, GENERAL_ITEMS, DATE_CHECKED, type ScenarioDef } from '../game/content/scenarios';
import type { ScenarioResult } from '../game/sim/scenarios';
import type { RunSummary } from '../game/sim/sim';
import { isHosted, challengeUrl } from '../game/host';

const fmt = (t: number, t0 = 0) => {
  const s = Math.max(0, t - t0);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export function outcomeLabel(r: ScenarioResult) {
  if (r.id === 'x1') return { text: 'Без бодови', cls: 'neutral' };
  switch (r.outcome) {
    case 'pass': return { text: 'Точно', cls: 'ok' };
    case 'missed': return { text: 'Не е одиграно', cls: 'neutral' };
    case 'collision': return { text: 'Судир', cls: 'bad' };
    default: return { text: 'Пропуштено', cls: 'bad' };
  }
}

export function feedbackFor(def: ScenarioDef, r: ScenarioResult) {
  if (def.id === 'x1') return def.feedback[r.outcome === 'pass' ? 'pass' : r.outcome === 'missed' ? 'missed' : 'fail'];
  return def.feedback[r.outcome] ?? def.feedback.fail ?? def.feedback.pass;
}

function scoreWord(score: number) {
  if (score >= 90) return 'Чист круг';
  if (score >= 70) return 'Добар круг';
  if (score >= 45) return 'Има уште за вежбање';
  return 'Уште еден круг, полека';
}

function ItemList({ def, r }: { def: ScenarioDef; r: ScenarioResult }) {
  const legal = def.items.filter((i) => i.kind === 'legal');
  const coach = def.items.filter((i) => i.kind === 'coaching');
  const res = (id: string) => r.items.find((x) => x.id === id);
  const mark = (ok: boolean | null | undefined) => ok === null || ok === undefined ? '—' : ok ? '✓' : '✗';
  return (
    <div className="items">
      {legal.length > 0 && <div className="items-h">Законска обврска {def.status === 'scored' ? '(се бодува)' : '(без бодови)'}</div>}
      {legal.map((i) => (
        <div key={i.id} className={`item ${res(i.id)?.ok === false ? 'bad' : res(i.id)?.ok ? 'ok' : ''}`}>
          <span className="mark">{mark(res(i.id)?.ok)}</span>
          <span><b>{i.label}</b> <small>{i.basis}</small><br />{res(i.id)?.detail}</span>
        </div>
      ))}
      {coach.length > 0 && <div className="items-h">Совети (не се бодуваат)</div>}
      {coach.map((i) => (
        <div key={i.id} className={`item coach ${res(i.id)?.ok === false ? 'warn' : ''}`}>
          <span className="mark">{mark(res(i.id)?.ok)}</span>
          <span><b>{i.label}</b> <small>{i.basis}</small><br />{res(i.id)?.detail}</span>
        </div>
      ))}
    </div>
  );
}

function SourceList({ def }: { def: ScenarioDef }) {
  return (
    <ul className="sources">
      {def.sources.map((s, i) => {
        const src = SOURCES[s.source];
        return <li key={i}><a href={src.url} target="_blank" rel="noreferrer">{src.title}</a> — {s.ref}</li>;
      })}
      <li className="checked">Проверено на {DATE_CHECKED}.</li>
    </ul>
  );
}

function ScenarioCard({ engine, def, r, t0 }: { engine: GameEngine; def: ScenarioDef; r: ScenarioResult; t0: number }) {
  const [open, setOpen] = useState(false);
  const lab = outcomeLabel(r);
  return (
    <div className={`scard ${lab.cls}`}>
      <div className="scard-head">
        <span className="snum">{def.id === 'x1' ? '+' : def.index}</span>
        <div className="stitle"><b>{def.title}</b><small>{def.objective}</small></div>
        <span className={`badge ${lab.cls}`}>{lab.text}{def.id !== 'x1' && r.outcome !== 'missed' ? ` · ${r.points}/25` : ''}</span>
      </div>
      <p className="next">{r.outcome !== 'pass' && def.id !== 'x1' && <b>Следниот пат: </b>}{feedbackFor(def, r)}</p>
      {r.cueT !== null && <p className="meta">Прв знак во {fmt(r.cueT, t0)}{r.reaction !== null ? ` · реакција по ${r.reaction.toFixed(1)} с` : ''}{r.decisionT !== null ? ` · одлука во ${fmt(r.decisionT, t0)}` : ''}</p>}
      <div className="row">
        <button className="btn small" disabled={r.armedT === null} onClick={() => engine.startReplay(def.id, 'run')}>▶ Погледни</button>
        <button className="btn small primary" onClick={() => engine.startRetry(def.id)}>Пробај повторно</button>
        <button className="btn small ghost" onClick={() => setOpen(!open)}>{open ? 'Помалку' : 'Детали и извори'}</button>
      </div>
      {open && (
        <div className="details">
          <ItemList def={def} r={r} />
          <p className="lesson">{def.lesson}</p>
          <SourceList def={def} />
        </div>
      )}
    </div>
  );
}

export function Review({ engine, summary, finalLine }: { engine: GameEngine; summary: RunSummary; finalLine: string }) {
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);
  const t0 = engine.runSim?.rec.start ?? 0;
  const hosted = isHosted();
  const share = async () => {
    const url = challengeUrl(summary.score);
    try {
      if (navigator.share) await navigator.share({ title: 'Круг низ маалото', text: `Собрав ${summary.score} поени на „Првиот круг“. Да те видам ти!`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); }
    } catch { /* user cancelled */ }
  };
  const signalsOk = summary.corners.filter((c) => c.ok).length;
  return (
    <div className="review">
      <div className="review-inner">
        <header className="review-head">
          <div>
            <h1>Како го извози кругот?</h1>
            <p className="father">Татко: „{finalLine}“</p>
          </div>
          <div className="score">
            <div className="score-n">{summary.score}</div>
            <div className="score-l">поени во играта<br /><b>{scoreWord(summary.score)}</b></div>
          </div>
        </header>
        <div className="cards">
          {SCENARIOS.map((def) => {
            const r = summary.scenarios.find((x) => x.id === def.id);
            return r ? <ScenarioCard key={def.id} engine={engine} def={def} r={r} t0={t0} /> : null;
          })}
        </div>
        <div className="general">
          <h3>Општо</h3>
          <div className={`item ${summary.speeding.length ? 'bad' : 'ok'}`}><span className="mark">{summary.speeding.length ? '✗' : '✓'}</span><span><b>{GENERAL_ITEMS.speed.label}</b> <small>{GENERAL_ITEMS.speed.basis}</small><br />{summary.speeding.length ? `Над 50 км/ч ${summary.speeding.length}× (најмногу ${Math.round(Math.max(...summary.speeding.map((s) => s.max)))} км/ч) — −${summary.penalties.speed} поени.` : 'Без пребрзо возење.'}</span></div>
          <div className={`item coach ${summary.contacts.length ? 'warn' : ''}`}><span className="mark">{summary.contacts.length ? '!' : '✓'}</span><span><b>{GENERAL_ITEMS.contacts.label}</b> <small>{GENERAL_ITEMS.contacts.basis}</small><br />{summary.contacts.length ? `${summary.contacts.length} допир(и) — −${summary.penalties.contacts} поени во играта.` : 'Без допири.'}</span></div>
          <div className="item coach"><span className="mark">{summary.corners.length ? `${signalsOk}/${summary.corners.length}` : '—'}</span><span><b>{GENERAL_ITEMS.signals.label}</b> <small>{GENERAL_ITEMS.signals.basis}</small><br />Навремено најавени свртувања на другите аглови.</span></div>
          <p className="disclaimer">Резултатот е игровен — не е оценка од возачки испит. Се бодуваат само постапки што играта сигурно ги гледа (педали, волан, покажувач, положба). Вртењето на камерата не се смета како „погледнав“.</p>
        </div>
        <div className="row end">
          <button className="btn ghost" onClick={() => setShowSources(true)}>Извори и белешки</button>
          {hosted && <button className="btn" onClick={share}>{copied ? 'Линкот е копиран' : 'Да те видам ти'}</button>}
          <button className="btn primary" onClick={() => engine.restart()}>Нов круг</button>
        </div>
      </div>
      {showSources && <SourcesPanel onClose={() => setShowSources(false)} />}
    </div>
  );
}

export function SourcesPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card sources-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Извори и белешки</h2>
        <p className="meta">Правилата се проверени на {DATE_CHECKED} според официјалните текстови на МВР. Каде меѓународен пример се разликува, важи македонскиот закон.</p>
        <h3>Официјални извори</h3>
        <ul className="sources">{Object.values(SOURCES).map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> — {s.ref}{s.note ? <><br /><small>{s.note}</small></> : null}</li>)}</ul>
        <h3>Ситуации</h3>
        {SCENARIOS.map((d) => (
          <details key={d.id}>
            <summary>{d.id === 'x1' ? '+' : d.index}. {d.title} — {d.status === 'scored' ? 'се бодува' : 'без бодови'}</summary>
            <p><b>Геометрија:</b> {d.geometry}</p>
            <p><b>Знаци:</b> {d.signs}</p>
            <p><b>Учесници:</b> {d.actors}</p>
            <p><b>Дозволени постапки:</b> {d.lawful.join(' / ')}</p>
            <p><b>Правила за бодување:</b></p>
            <ul>{d.predicates.map((p, i) => <li key={i}>{p}</li>)}</ul>
            <SourceList def={d} />
            {d.instructorNotes && <><p><b>За проверка од инструктор (категорија Б):</b></p><ul>{d.instructorNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
          </details>
        ))}
        <h3>Спецификации со статус</h3>
        <ul className="sources">{SPEC_NOTES.map((n) => <li key={n.topic}><b>{n.topic}</b> ({n.status}): {n.text} <a href={n.url} target="_blank" rel="noreferrer">извор</a></li>)}</ul>
        <p className="meta">Маалото, улиците, бизнисите и луѓето се измислени. Не е користена мапа ниту OpenStreetMap.</p>
        <button className="btn primary" onClick={onClose}>Затвори</button>
      </div>
    </div>
  );
}

export function ReplayPanel({ engine, rp }: { engine: GameEngine; rp: ReplayState }) {
  const def = SCENARIOS.find((d) => d.id === rp.scenario.id)!;
  const sim = rp.source === 'retry' ? engine.retrySim : engine.runSim;
  const base = sim?.rec.start ?? 0;
  const span = rp.t1 - rp.t0;
  const pct = (t: number) => `${((t - rp.t0) / span) * 100}%`;
  const lab = outcomeLabel(rp.scenario);
  const ind = rp.indicator === 1 ? '⇦ лев' : rp.indicator === 2 ? 'десен ⇨' : 'исклучен';
  return (
    <div className="replay">
      <div className="replay-top">
        <span className="badge neutral">ПОВТОРУВАЊЕ</span>
        <b>{def.title}</b>
        <span className={`badge ${lab.cls}`}>{lab.text}</span>
        <span className="tele">{Math.round(rp.speed)} км/ч · {rp.brake > 0.1 ? 'сопира' : rp.throttle > 0.1 ? 'гас' : 'без педал'} · покажувач {ind}</span>
      </div>
      {rp.atCue && (
        <div className="cue-card">
          <div className="cue-time">{fmt(rp.t, base)}</div>
          <h3>Тука можеше прво да забележиш</h3>
          <p>{def.cue}</p>
          <p><b>Што направи ти:</b> {rp.scenario.did || '—'}{rp.scenario.reaction !== null ? ` Реакција по ${rp.scenario.reaction.toFixed(1)} с.` : ''}</p>
          <p className="next">{rp.scenario.outcome !== 'pass' && def.id !== 'x1' && <b>Следниот пат: </b>}{feedbackFor(def, rp.scenario)}</p>
          <button className="btn primary" onClick={() => engine.replayControl('continue')}>Продолжи ▶</button>
        </div>
      )}
      <div className="timeline-wrap">
        <div className="timeline" onClick={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          engine.replayControl({ seek: rp.t0 + ((e.clientX - r.left) / r.width) * span });
        }}>
          <div className="tl-fill" style={{ width: pct(rp.t) }} />
          {rp.cueT !== null && <div className="tl-mark cue" style={{ left: pct(rp.cueT) }} title="Прв знак"><span>знак {fmt(rp.cueT, base)}</span></div>}
          {rp.decisionT !== null && <div className="tl-mark dec" style={{ left: pct(rp.decisionT) }} title="Одлука"><span>одлука {fmt(rp.decisionT, base)}</span></div>}
        </div>
        <div className="tl-times"><span>{fmt(rp.t0, base)}</span><span>{fmt(rp.t, base)}</span><span>{fmt(rp.t1, base)}</span></div>
      </div>
      <div className="row center">
        <button className="btn small" onClick={() => engine.replayControl('restart')}>⟲ Од почеток</button>
        <button className="btn small" onClick={() => engine.replayControl(rp.playing ? 'pause' : 'play')}>{rp.playing ? '❚❚ Пауза' : '▶ Пушти'}</button>
        <button className="btn small primary" onClick={() => engine.startRetry(def.id)}>Пробај повторно</button>
        <button className="btn small ghost" onClick={() => engine.backToReview()}>Назад</button>
      </div>
    </div>
  );
}

export function RetryDone({ engine, hud }: { engine: GameEngine; hud: HudState }) {
  const sum = engine.retrySummary;
  const id = hud.retryId;
  if (!sum || !id) return null;
  const r = sum.scenarios.find((s) => s.id === id)!;
  const def = SCENARIOS.find((d) => d.id === id)!;
  const lab = outcomeLabel(r);
  return (
    <div className="modal-back">
      <div className="card retry-card">
        <span className={`badge ${lab.cls}`}>{lab.text}</span>
        <h2>{def.title}</h2>
        <p>{r.did}</p>
        <p className="next">{r.outcome !== 'pass' && def.id !== 'x1' && <b>Следниот пат: </b>}{feedbackFor(def, r)}</p>
        <ItemList def={def} r={r} />
        <p className="meta">Повторувањето не го менува резултатот од кругот.</p>
        <div className="row">
          <button className="btn small" onClick={() => engine.startReplay(id, 'retry')}>▶ Погледни</button>
          <button className="btn small primary" onClick={() => engine.startRetry(id)}>Пробај пак</button>
          <button className="btn small ghost" onClick={() => engine.backToReview()}>Назад кон резултатите</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { GameEngine, HudState, ReplayState } from '../game/engine';
import { ruleById, type RuleCategory } from '../game/rules/registry';
import { SEVERITY_LABEL } from '../game/rules/ledger';
import { MODE_LABEL } from '../game/missions/types';
import { ENV_INFO } from '../game/attempt';
import { vehicleById } from '../game/vehicles/defs';
import { challengeUrl, isHosted } from '../game/host';
import { Sources } from './Sources';
import { STAMPS } from '../game/career';

const CAT: Record<RuleCategory, { label: string; cls: string }> = {
  trafficLaw: { label: 'Закон', cls: 'law' }, officialExam: { label: 'Испитен лист', cls: 'exam' },
  instructorTechnique: { label: 'Техника', cls: 'tech' }, gameBalance: { label: 'Игра', cls: 'game' },
};
const fmt = (t: number, t0 = 0) => { const s = Math.max(0, t - t0); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const STATUS: Record<string, { label: string; cls: string }> = { pass: { label: 'Точно', cls: 'ok' }, fail: { label: 'Пропуштено', cls: 'bad' }, partial: { label: 'Делумно', cls: 'warn' }, missed: { label: 'Не е одиграно', cls: 'neutral' }, pending: { label: '—', cls: 'neutral' }, unscored: { label: 'Без бодови', cls: 'neutral' } };

export function Result({ engine }: { engine: GameEngine }) {
  const r = engine.result!;
  const sim = engine.sim!;
  const [src, setSrc] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const t0 = sim.rec.start;
  const def = vehicleById(r.config.vehicle);
  const share = async () => {
    const url = challengeUrl(engine.shareCode());
    try { if (navigator.share) await navigator.share({ title: 'Круг низ маалото', text: `${r.gameScore} поени — да те видам ти`, url }); else { await navigator.clipboard.writeText(url); setCopied(url); } } catch { setCopied(url); }
  };
  const layer = (name: string, v: number, note: string) => (
    <div className="layer"><div className="layer-h"><b>{name}</b><span>{Math.round(v)}</span></div><div className="layer-bar"><div style={{ width: `${v}%` }} /></div><small>{note}</small></div>
  );
  return (
    <div className="result">
      <div className="result-inner">
        <header className="result-head">
          <div>
            <div className="kicker">{ENV_INFO[r.config.env].title} · {MODE_LABEL[r.config.mode]} · {def.name} · {r.config.assist === 'auto' ? 'автоматски' : r.config.assist === 'learn' ? 'со помош' : 'мануелно'}</div>
            <h1>{r.config.env === 'city' ? 'Како го извози кругот?' : r.failed ? 'Обидот заврши' : 'Резултат'}</h1>
            {r.failed && <p className="fail-line">Причина: {r.failed.text}</p>}
            {r.exam && <p className={`exam-line ${r.exam.passed ? 'ok' : 'bad'}`}>{r.exam.form}: <b>{r.exam.total}</b> негативни поени — {r.exam.passed ? 'под 50 (во играта: положено)' : 'над 50 (во играта: не положено)'}. <small>Игровна симулација, не официјален испит.</small></p>}
          </div>
          <div className="score"><div className="score-n">{r.gameScore}</div><div className="score-l">поени во играта</div></div>
        </header>
        {engine.newStamps.length > 0 && <div className="new-stamp">Нов печат во книшката: {engine.newStamps.map((id) => STAMPS.find((x) => x.id === id)?.title).join(', ')}</div>}
        <div className="layers">
          {layer('Безбедност и прописи', r.layers.safety, 'Само проверени правила од законот.')}
          {layer('Техника на возење', r.layers.technique, 'Кумплунг, брзини, рачна, мазност.')}
          {layer('Мисија', r.layers.mission, 'Задачи од инструкторот.')}
        </div>
        <h3>Задачи</h3>
        <div className="items">
          {r.items.map((it) => (
            <div key={it.id} className={`item-row ${STATUS[it.status].cls}`}>
              <span className={`badge ${STATUS[it.status].cls}`}>{STATUS[it.status].label}{it.points !== undefined && it.max ? ` · ${it.points}/${it.max}` : it.points ? ` · ${it.points} нег.` : ''}</span>
              <div className="item-t"><b>{it.title}</b><small>{it.detail}</small></div>
              {it.t0 !== undefined && <button className="btn small" onClick={() => engine.startReplay((it.cueT ?? it.t0!) - 4, (it.t1 ?? it.t0! + 10) + 3, { title: it.title, detail: it.detail, status: it.status, cueT: it.cueT ?? null, decisionT: it.t1 ?? null, focus: it.focus ?? null })}>▶</button>}
            </div>
          ))}
        </div>
        <h3>Настани ({r.incidents.length})</h3>
        <div className="incidents">
          {r.incidents.length === 0 && <p className="note">Без забелешки. Убаво.</p>}
          {r.incidents.map((i) => {
            const rule = ruleById(i.ruleIds[0]);
            const cat = rule ? CAT[rule.category] : CAT.gameBalance;
            return (
              <div key={i.id} className={`inc sev-${i.severity}`}>
                <span className="inc-t">{fmt(i.t, t0)}</span>
                <span className={`cat ${cat.cls}`}>{cat.label}</span>
                <div className="inc-body"><b>{i.text}</b><small>{SEVERITY_LABEL[i.severity]}{rule?.source ? ` · ${rule.source.ref}` : ''}{rule?.status === 'needsInstructorReview' ? ' · за проверка од инструктор' : ''}{i.exam ? ` · ${i.exam.map((e) => `${e.form} ${e.item}: ${e.points}`).join(', ')}` : ''}{i.evidence ? ` · ${i.evidence}` : ''}</small></div>
                <span className="inc-p">{i.points ? `−${i.points}` : ''}</span>
                <button className="btn small ghost" onClick={() => engine.startReplay(i.t - 6, i.t + 3, { title: i.text, detail: rule?.explain ?? '', status: i.severity, cueT: null, decisionT: i.t, focus: null })}>▶</button>
              </div>
            );
          })}
        </div>
        <p className="note small">Игровни поени — не се официјални казнени поени. „Испитен лист“ ги користи вредностите од Образец бр. 1 / бр. 4 (Сл. весник 29/2025) само каде играта може сигурно да ја види грешката. Погледите (J/K/M/U/I) се контрола-проксија, не мерење на вниманието. Верзии: содржина {r.versions.content}, правила {r.versions.rules}, физика {r.versions.physics}.</p>
        <div className="row end">
          <button className="btn ghost" onClick={() => setSrc(true)}>Извори</button>
          <button className="btn ghost" onClick={() => engine.backToMenu()}>Мени</button>
          {isHosted() && <button className="btn" onClick={share}>Да те видам ти</button>}
          <button className="btn" onClick={() => engine.retryNew()}>Нова варијација</button>
          <button className="btn primary" onClick={() => engine.retrySame()}>Истата ситуација</button>
        </div>
        {copied && <p className="note small">Линкот е копиран: {copied}</p>}
      </div>
      {src && <Sources onClose={() => setSrc(false)} />}
    </div>
  );
}

export function ReplayPanel({ engine, rp }: { engine: GameEngine; rp: ReplayState }) {
  const base = engine.sim?.rec.start ?? 0;
  const span = Math.max(0.1, rp.t1 - rp.t0);
  const pct = (t: number) => `${((t - rp.t0) / span) * 100}%`;
  const ind = rp.indicator === 1 ? '⇦' : rp.indicator === 2 ? '⇨' : '—';
  return (
    <div className="replay">
      {rp.atCue && (
        <div className="cue-card">
          <div className="cue-time">{fmt(rp.t, base)}</div>
          <h3>Тука можеше прво да забележиш</h3>
          <p><b>{rp.title}</b></p>
          <p>{rp.detail}</p>
          <button className="btn primary" onClick={() => engine.replayControl('continue')}>Продолжи ▶</button>
        </div>
      )}
      <div className="replay-top">
        <span className="badge neutral">ПОВТОРУВАЊЕ</span><b>{rp.title}</b>
        <span className="tele">{Math.round(rp.speed)} км/ч · {rp.gear} · гас {Math.round(rp.throttle * 100)}% · сопирачка {Math.round(rp.brake * 100)}% · кумплунг {Math.round(rp.clutch * 100)}% · {ind}</span>
      </div>
      <div className="timeline" onClick={(e) => { const b = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); engine.replayControl({ seek: rp.t0 + ((e.clientX - b.left) / b.width) * span }); }}>
        <div className="tl-fill" style={{ width: pct(rp.t) }} />
        {rp.cueT !== null && <div className="tl-mark cue" style={{ left: pct(rp.cueT) }}><span>знак {fmt(rp.cueT, base)}</span></div>}
        {rp.decisionT !== null && <div className="tl-mark dec" style={{ left: pct(rp.decisionT) }}><span>одлука {fmt(rp.decisionT, base)}</span></div>}
        {rp.incidents.map((i) => <div key={i.id} className="tl-mark inc" style={{ left: pct(i.t) }} title={i.text} />)}
      </div>
      <div className="tl-times"><span>{fmt(rp.t0, base)}</span><span>{fmt(rp.t, base)}</span><span>{fmt(rp.t1, base)}</span></div>
      <div className="row center">
        <button className="btn small" onClick={() => engine.replayControl('restart')}>⟲</button>
        <button className="btn small" onClick={() => engine.replayControl(rp.playing ? 'pause' : 'play')}>{rp.playing ? '❚❚' : '▶'}</button>
        <button className="btn small primary" onClick={() => engine.retrySame()}>Истата ситуација</button>
        <button className="btn small ghost" onClick={() => engine.backToResult()}>Назад</button>
      </div>
    </div>
  );
}

export type { HudState };

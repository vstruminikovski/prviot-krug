import { useEffect, useState } from 'react';
import type { GameEngine, HudState, ReplayState } from '../game/engine';
import { ruleById, type RuleCategory } from '../game/rules/registry';
import { SEVERITY_LABEL } from '../game/rules/ledger';
import { MODE_LABEL } from '../game/missions/types';
import { ENV_INFO } from '../game/attempt';
import { vehicleById } from '../game/vehicles/defs';
import { challengeUrl, isHosted } from '../game/host';
import { Sources } from './Sources';
import { STAMPS, nextStamp } from '../game/career';
import { CountUp, FullscreenButton, Icon, Seg } from './kit';

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
  const [tab, setTab] = useState<'items' | 'inc'>('items');
  const [copied, setCopied] = useState<string | null>(null);
  const t0 = sim.rec.start;
  const def = vehicleById(r.config.vehicle);
  const share = async () => {
    const url = challengeUrl(engine.shareCode());
    try { if (navigator.share) await navigator.share({ title: 'Круг низ маалото', text: `${r.gameScore} поени — да те видам ти`, url }); else { await navigator.clipboard.writeText(url); setCopied(url); } } catch { setCopied(url); }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (src) return; if (e.code === 'Enter') engine.retrySame(); else if (e.code === 'KeyN') engine.retryNew(); else if (e.code === 'Escape') engine.backToMenu(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [engine, src]);
  const verdict = r.failed ? { cls: 'bad', label: 'Обидот заврши', icon: 'warn' as const } : r.exam ? (r.exam.passed ? { cls: 'ok', label: 'Положено во играта', icon: 'check' as const } : { cls: 'bad', label: 'Не положено', icon: 'warn' as const }) : r.gameScore >= 85 ? { cls: 'ok', label: 'Одлично возење', icon: 'check' as const } : r.gameScore >= 60 ? { cls: 'amber', label: 'Добро — има што да се поправи', icon: 'info' as const } : { cls: 'bad', label: 'Пробај повторно', icon: 'retry' as const };
  const C = 2 * Math.PI * 52;
  const layer = (name: string, v: number, note: string, i: number) => (
    <div className="layer" style={{ ['--i' as string]: i }}><div className="layer-h"><b>{name}</b><span><CountUp to={Math.round(v)} /></span></div><div className="layer-bar"><div style={{ ['--w' as string]: `${v}%` }} /></div><small>{note}</small></div>
  );
  return (
    <div className="result">
      <div className="result-inner panel">
        <header className="result-head">
          <div className="score-ring">
            <svg viewBox="0 0 120 120" width="120" height="120">
              <circle cx="60" cy="60" r="52" className="ring-bg" />
              <circle cx="60" cy="60" r="52" className={`ring-fg ${verdict.cls}`} strokeDasharray={C} style={{ ['--off' as string]: C * (1 - r.gameScore / 100), ['--c' as string]: C }} />
            </svg>
            <div className="score-n"><CountUp to={r.gameScore} /><small>поени</small></div>
          </div>
          <div className="result-title">
            <div className="kicker">{ENV_INFO[r.config.env].title} · {MODE_LABEL[r.config.mode]} · {def.name} · {r.config.assist === 'auto' ? 'автоматски' : r.config.assist === 'learn' ? 'со помош' : 'мануелно'}</div>
            <h1>{r.config.env === 'city' && !r.failed ? 'Како го извози кругот?' : verdict.label}</h1>
            <span className={`verdict ${verdict.cls}`}><Icon name={verdict.icon} size={15} />{verdict.label}</span>
            {r.failed && <p className="fail-line">Причина: {r.failed.text}</p>}
            {r.exam && <p className="exam-line">{r.exam.form}: <b className={r.exam.passed ? 'ok-t' : 'bad-t'}>{r.exam.total}</b> негативни поени (граница 50). <span className="muted">Игровна симулација, не официјален испит.</span></p>}
          </div>
        </header>
        {engine.newStamps.length > 0 && <div className="banner newstamp"><span className="stamp-mini">★</span><div><b>Нов печат во книшката</b><small>{engine.newStamps.map((id) => STAMPS.find((x) => x.id === id)?.title).join(' · ')}</small></div></div>}
        {(() => { const g = nextStamp(engine.store.history, matchMedia('(pointer: coarse)').matches); return g && engine.newStamps.length === 0 ? <p className="next-goal"><Icon name="flag" size={15} />Следен печат: <b>{g.title}</b> — {g.how}</p> : null; })()}
        <div className="layers">
          {layer('Безбедност и прописи', r.layers.safety, 'Само проверени правила од законот.', 0)}
          {layer('Техника на возење', r.layers.technique, 'Кумплунг, брзини, рачна, мазност.', 1)}
          {layer('Мисија', r.layers.mission, 'Задачите од инструкторот.', 2)}
        </div>
        <Seg value={tab} onChange={setTab} options={[{ id: 'items', label: `Задачи (${r.items.length})` }, { id: 'inc', label: `Настани (${r.incidents.length})` }]} />
        <div className="result-list" key={tab}>
          {tab === 'items' && r.items.map((it, i) => (
            <div key={it.id} className={`item-row ${STATUS[it.status].cls}`} style={{ ['--i' as string]: i }}>
              <span className={`badge ${STATUS[it.status].cls}`}>{STATUS[it.status].label}{it.points !== undefined && it.max ? ` · ${it.points}/${it.max}` : it.points ? ` · ${it.points} нег.` : ''}</span>
              <div className="item-t"><b>{it.title}</b><small>{it.detail}</small></div>
              {it.t0 !== undefined && <button className="btn icon glass sm" title="Погледни повторно" onClick={() => engine.startReplay((it.cueT ?? it.t0!) - 4, (it.t1 ?? it.t0! + 10) + 3, { title: it.title, detail: it.detail, status: it.status, cueT: it.cueT ?? null, decisionT: it.t1 ?? null, focus: it.focus ?? null })}><Icon name="play" size={16} /></button>}
            </div>
          ))}
          {tab === 'inc' && r.incidents.length === 0 && <p className="empty"><Icon name="check" />Без забелешки. Убаво.</p>}
          {tab === 'inc' && r.incidents.map((i, k) => {
            const rule = ruleById(i.ruleIds[0]);
            const cat = rule ? CAT[rule.category] : CAT.gameBalance;
            return (
              <div key={i.id} className={`inc sev-${i.severity}`} style={{ ['--i' as string]: k }}>
                <span className="inc-t">{fmt(i.t, t0)}</span>
                <span className={`cat ${cat.cls}`}>{cat.label}</span>
                <div className="inc-body"><b>{i.text}</b><small>{SEVERITY_LABEL[i.severity]}{rule?.source ? ` · ${rule.source.ref}` : ''}{rule?.status === 'needsInstructorReview' ? ' · за проверка од инструктор' : ''}{i.exam ? ` · ${i.exam.map((e) => `${e.form} ${e.item}: ${e.points}`).join(', ')}` : ''}{i.evidence ? ` · ${i.evidence}` : ''}</small></div>
                <span className="inc-p">{i.points ? `−${i.points}` : ''}</span>
                <button className="btn icon glass sm" title="Погледни повторно" onClick={() => engine.startReplay(i.t - 6, i.t + 3, { title: i.text, detail: rule?.explain ?? '', status: i.severity, cueT: null, decisionT: i.t, focus: null })}><Icon name="play" size={16} /></button>
              </div>
            );
          })}
        </div>
        <p className="fine">Игровни поени — не се официјални казнени поени. „Испитен лист“ ги користи вредностите од Образец бр. 1 / бр. 4 (Сл. весник 29/2025) само каде играта сигурно ја гледа грешката. Погледите се контрола-проксија, не мерење на вниманието. Верзии: содржина {r.versions.content}, правила {r.versions.rules}, физика {r.versions.physics}.</p>
        {copied && <p className="hint">Линкот е копиран: {copied}</p>}
        <footer className="result-foot">
          <FullscreenButton />
          <button className="btn ghost" data-sound="back" onClick={() => engine.backToMenu()}><Icon name="home" size={18} /><span className="hide-sm">Мени</span></button>
          <button className="btn ghost" onClick={() => setSrc(true)}><Icon name="info" size={18} /><span className="hide-sm">Извори</span></button>
          <span className="grow" />
          {isHosted() && <button className="btn glass" onClick={share}><Icon name="share" size={18} />Да те видам ти</button>}
          <button className="btn glass" onClick={() => engine.retryNew()}><Icon name="shuffle" size={18} />Нова<kbd>N</kbd></button>
          <button className="btn primary" onClick={() => engine.retrySame()}><Icon name="retry" size={18} />Истата<kbd>Enter</kbd></button>
        </footer>
      </div>
      {src && <Sources onClose={() => setSrc(false)} />}
    </div>
  );
}

export function ReplayPanel({ engine, rp }: { engine: GameEngine; rp: ReplayState }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const r = engine.replay; if (!r) return;
      if (e.code === 'Space') { e.preventDefault(); engine.replayControl(r.atCue ? 'continue' : r.playing ? 'pause' : 'play'); }
      else if (e.code === 'Escape') engine.backToResult();
      else if (e.code === 'ArrowLeft') engine.replayControl({ seek: r.t - 2 });
      else if (e.code === 'ArrowRight') engine.replayControl({ seek: r.t + 2 });
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [engine]);
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
          <button className="btn primary block" onClick={() => engine.replayControl('continue')}><Icon name="play" size={18} />Продолжи</button>
        </div>
      )}
      <div className="replay-top">
        <span className="rec-dot" />ПОВТОРУВАЊЕ<b>{rp.title}</b>
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
        <button className="btn icon glass" onClick={() => engine.replayControl('restart')} aria-label="Од почеток"><Icon name="retry" /></button>
        <button className="btn icon glass big-ico" onClick={() => engine.replayControl(rp.playing ? 'pause' : 'play')} aria-label="Пушти / паузирај"><Icon name={rp.playing ? 'pause' : 'play'} /></button>
        <button className="btn primary sm" onClick={() => engine.retrySame()}><Icon name="retry" size={16} />Истата ситуација</button>
        <button className="btn ghost sm" data-sound="back" onClick={() => engine.backToResult()}><Icon name="back" size={16} />Назад</button>
      </div>
    </div>
  );
}

export type { HudState };

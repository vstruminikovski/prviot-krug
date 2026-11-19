import { RULES, RULES_VERSION, DATE_CHECKED, SRC, type RuleCategory } from '../game/rules/registry';
import { SCENARIOS, SPEC_NOTES } from '../game/content/scenarios';
import { Modal } from './kit';
import { MISTAKES, ACTION_LABEL, MATRIX_CONFIG, sourceLine, type Cell } from '../game/rules/matrix';

const CAT: Record<RuleCategory, string> = { trafficLaw: 'Закон (ЗБСП)', officialExam: 'Официјални оценувачки листови', instructorTechnique: 'Техника (совет, не прекршок)', gameBalance: 'Игра' };
const ST: Record<string, string> = { verified: 'проверено', needsInstructorReview: 'за проверка од инструктор', unverified: 'не е проверено' };

export function Sources({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Извори и правила" kicker="Македонски закон · оценувачки листови" onClose={onClose} wide>
      <div className="sources-panel">
        <p className="hint">Регистар {RULES_VERSION}, проверено на {DATE_CHECKED}. Каде меѓународен пример се разликува, важи македонскиот закон. Игровните поени не се официјални казнени поени.</p>
        <ul className="sources">{Object.values(SRC).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
        {(Object.keys(CAT) as RuleCategory[]).map((c) => (
          <details key={c} open={c === 'trafficLaw'}>
            <summary>{CAT[c]} ({RULES.filter((r) => r.category === c).length})</summary>
            <table className="rules"><tbody>
              {RULES.filter((r) => r.category === c).map((r) => (
                <tr key={r.id}><td><b>{r.title}</b><br /><small>{r.explain}</small></td><td><small>{r.source?.ref ?? '—'}</small></td><td><small>{r.trigger}</small></td><td><span className={`st st-${r.status}`}>{ST[r.status]}</span></td></tr>
              ))}
            </tbody></table>
          </details>
        ))}
        <details open>
          <summary>Матрица на грешки — Часови / Полагање ({MISTAKES.length})</summary>
          <p className="hint">Праг: над {MATRIX_CONFIG.examThreshold.polygon} негативни поени = не положено. Часовите не носат официјални поени. Ставка над прагот го завршува испитот (за проверка од инструктор).</p>
          <div className="matrix-wrap"><table className="rules matrix"><thead><tr><th>Грешка</th><th>Часови · Полигон</th><th>Часови · Градска</th><th>Полагање · Полигон</th><th>Полагање · Градска</th><th>Извор</th><th /></tr></thead><tbody>
            {MISTAKES.map((m) => { const c = (x: Cell) => (x.action === 'none' ? '—' : `${ACTION_LABEL[x.action]}${x.exam?.length ? ` (${x.exam.map((id) => id.replace(/^exam/, '')).join(', ')})` : ''}`); return (
              <tr key={m.id}><td><b>{m.title}</b><br /><small>{m.detected ? m.detect : 'не е детектирано во оваа верзија'}</small></td><td><small>{c(m.lesson.polygon)}</small></td><td><small>{c(m.lesson.city)}</small></td><td><small>{c(m.exam.polygon)}</small></td><td><small>{c(m.exam.city)}</small></td><td><small>{sourceLine(m, m.exam.city.action !== 'none' ? m.exam.city : m.exam.polygon)}</small></td><td><span className={`st st-${m.status === 'confirmed' ? 'verified' : 'needsInstructorReview'}`}>{m.status === 'confirmed' ? 'потврдено' : 'за проверка'}</span></td></tr>
            ); })}
          </tbody></table></div>
        </details>
        <details>
          <summary>Ситуации во маалото (епизода 1)</summary>
          {SCENARIOS.map((d) => <p key={d.id}><b>{d.title}</b> — {d.objective} <small>{d.sources.map((s) => s.ref).join(' · ')}</small></p>)}
        </details>
        <details>
          <summary>Спецификации со статус</summary>
          <ul className="sources">{SPEC_NOTES.map((n) => <li key={n.topic}><b>{n.topic}</b> ({n.status}): {n.text}</li>)}</ul>
        </details>
        <button className="btn primary block" onClick={onClose}>Затвори</button>
      </div>
    </Modal>
  );
}

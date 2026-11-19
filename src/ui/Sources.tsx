import { RULES, RULES_VERSION, DATE_CHECKED, SRC, type RuleCategory } from '../game/rules/registry';
import { SCENARIOS, SPEC_NOTES } from '../game/content/scenarios';

const CAT: Record<RuleCategory, string> = { trafficLaw: 'Закон (ЗБСП)', officialExam: 'Официјални оценувачки листови', instructorTechnique: 'Техника (совет, не прекршок)', gameBalance: 'Игра' };
const ST: Record<string, string> = { verified: 'проверено', needsInstructorReview: 'за проверка од инструктор', unverified: 'не е проверено' };

export function Sources({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card sources-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Извори и правила</h2>
        <p className="meta">Регистар {RULES_VERSION}, проверено на {DATE_CHECKED}. Каде меѓународен пример се разликува, важи македонскиот закон. Игровните поени не се официјални казнени поени.</p>
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
        <details>
          <summary>Ситуации во маалото (епизода 1)</summary>
          {SCENARIOS.map((d) => <p key={d.id}><b>{d.title}</b> — {d.objective} <small>{d.sources.map((s) => s.ref).join(' · ')}</small></p>)}
        </details>
        <details>
          <summary>Спецификации со статус</summary>
          <ul className="sources">{SPEC_NOTES.map((n) => <li key={n.topic}><b>{n.topic}</b> ({n.status}): {n.text}</li>)}</ul>
        </details>
        <button className="btn primary" onClick={onClose}>Затвори</button>
      </div>
    </div>
  );
}

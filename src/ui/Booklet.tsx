import { STAMPS, earnedStamps, licenceEarned } from '../game/career';
import type { AttemptRecord } from '../game/store';

export function Booklet({ history, plate, onClose }: { history: AttemptRecord[]; plate: string; onClose: () => void }) {
  const got = earnedStamps(history);
  const lic = licenceEarned(history);
  return (
    <div className="modal-back fixed" onClick={onClose}>
      <div className="booklet" onClick={(e) => e.stopPropagation()}>
        <div className="booklet-cover">
          <div className="kicker">Авто школа „Вардар“ · Дебар Маало</div>
          <h2>Возачка книшка</h2>
          <p className="note">Печат добиваш само за вистински завршени обиди. Последната страна е возачка дозвола <b>во играта</b> — не е официјален документ.</p>
          <div className="booklet-progress">{got.length} / {STAMPS.length} печати</div>
        </div>
        <div className="stamps">
          {STAMPS.map((s, i) => {
            const on = got.includes(s.id);
            return (
              <div key={s.id} className={`stamp-slot ${on ? 'on' : ''}`}>
                <div className="stamp" style={{ transform: `rotate(${(i % 3 - 1) * 9}deg)` }}>{on ? <><b>{s.title}</b><small>ВАРДАР · {i + 1}</small></> : <span>{i + 1}</span>}</div>
                <div className="stamp-how"><b>{s.title}</b><small>{s.how}</small></div>
              </div>
            );
          })}
        </div>
        <div className={`licence ${lic ? 'on' : ''}`}>
          <div className="lic-head">ВОЗАЧКА ДОЗВОЛА · ИГРА</div>
          <div className="lic-body"><span className="lic-cat">Б</span><div>{lic ? <>Положени сите печати.<br /><small>Возило {plate}</small></> : <>Собери ги сите {STAMPS.length} печати.</>}</div></div>
        </div>
        <button className="btn primary" onClick={onClose}>Затвори</button>
      </div>
    </div>
  );
}

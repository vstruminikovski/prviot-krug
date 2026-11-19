import { useState } from 'react';
import type { GameEngine } from '../game/engine';
import { Modal, Seg, Slider, Toggle } from './kit';
import type { Quality } from '../game/store';

export function Settings({ engine, onClose }: { engine: GameEngine; onClose: () => void }) {
  const [, force] = useState(0);
  const s = engine.store.settings;
  const set = (p: Partial<typeof s>) => { engine.updateSettings(p); force((x) => x + 1); };
  return (
    <Modal title="Поставки" kicker="Се зачувува автоматски" onClose={onClose}>
      <div className="settings">
        <h3 className="sec">Слика</h3>
        <div className="set-row"><span>Квалитет</span>
          <Seg size="sm" value={s.quality} onChange={(q: Quality) => set({ quality: q })} options={[{ id: 'low', label: 'Брзо' }, { id: 'medium', label: 'Балансирано' }, { id: 'high', label: 'Најубаво' }]} />
        </div>
        <p className="hint">{s.quality === 'low' ? 'Без ефекти, помала резолуција — за телефони и постари компјутери.' : s.quality === 'medium' ? 'Сјај и боја, помала резолуција и сенки.' : 'Целосна слика: сјај, боја, мек фокус на рабовите, остри сенки.'}</p>
        <Toggle on={s.motion} onChange={(v) => set({ motion: v })} label="Движење на камерата (тресење, брзина, фокус)" />

        <h3 className="sec">Звук</h3>
        <Toggle on={!s.muted} onChange={(v) => set({ muted: !v })} label="Звук вклучен" />
        <Slider label="Јачина" value={s.volume} min={0} max={1} step={0.05} onChange={(v) => set({ volume: v })} fmt={(v) => `${Math.round(v * 100)}%`} />

        <h3 className="sec">Возење</h3>
        <Toggle on={s.coach} onChange={(v) => set({ coach: v })} label="Совети со копчиња при возење (не на испит)" />
        <Slider label="Брзина на воланот" value={s.steerSens} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ steerSens: v })} fmt={(v) => `${v.toFixed(2)}×`} />

        <h3 className="sec">Приказ</h3>
        <div className="set-row"><span>Големина на инструменти</span>
          <Seg size="sm" value={s.hud} onChange={(h) => set({ hud: h })} options={[{ id: 'S', label: 'S' }, { id: 'M', label: 'M' }, { id: 'L', label: 'L' }]} />
        </div>
        <Toggle on={s.legend} onChange={(v) => set({ legend: v })} label="Листа со копчиња при возење" />
        <button className="btn primary block" onClick={onClose}>Готово</button>
      </div>
    </Modal>
  );
}

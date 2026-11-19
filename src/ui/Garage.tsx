import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '../game/engine';
import { VEHICLES, PAINT_PRESETS, turningCircle, vehicleById } from '../game/vehicles/defs';
import { validPlate, DEFAULT_GARAGE } from '../game/store';
import { compatibility } from '../game/attempt';
import { Icon, Seg } from './kit';

const REGIONS = [{ code: 'SK', name: 'Скопје' }, { code: 'BT', name: 'Битола' }, { code: 'OH', name: 'Охрид' }, { code: 'KU', name: 'Куманово' }, { code: 'TE', name: 'Тетово' }, { code: 'VE', name: 'Велес' }, { code: 'ST', name: 'Штип' }, { code: 'PP', name: 'Прилеп' }];

export function Garage({ engine }: { engine: GameEngine }) {
  const [, force] = useState(0);
  const g = engine.store.garage;
  const def = vehicleById(g.vehicle);
  const [plateText, setPlateText] = useState(g.plate);
  const [tab, setTab] = useState<'car' | 'look' | 'plate' | 'data'>('car');
  const set = (p: Parameters<GameEngine['setGarage']>[0]) => { engine.setGarage(p); force((x) => x + 1); };
  useOrbit(engine);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,select')) return; if (e.code === 'Escape') engine.backToMenu(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [engine]);
  const plateOk = validPlate(plateText);
  const cmp = (id: string) => vehicleById(id);
  const peak = (d: typeof def) => Math.max(...d.engine.curve.map((c) => c[1]));
  const blocked = compatibility(def.id, engine.store.menu?.env ?? engine.config.env);
  return (
    <div className="garage">
      <aside className="garage-panel panel">
        <header className="garage-h">
          <button className="btn icon glass" data-sound="back" onClick={() => engine.backToMenu()} aria-label="Назад"><Icon name="back" /></button>
          <div><div className="kicker">Гаража · {def.familyLabel}</div><h2>{def.name}</h2></div>
        </header>
        <div className="garage-meta"><span className={`tag ${def.scope.category === 'B' ? '' : 'amber'}`}>{def.scope.label}</span><span className="muted">{def.era}</span></div>
        <Seg value={tab} onChange={setTab} options={[{ id: 'car', label: 'Возило' }, { id: 'look', label: 'Изглед' }, { id: 'plate', label: 'Табла' }, { id: 'data', label: 'Податоци' }]} />
        <div className="garage-body" key={tab}>
          {tab === 'car' && (<>
            <p className="hint">{def.blurb}</p>
            <div className="fleet">
              {VEHICLES.map((v, i) => (
                <button key={v.id} style={{ ['--i' as string]: i }} className={`fleet-tile ${v.id === g.vehicle ? 'on' : ''}`} onClick={() => set({ vehicle: v.id })} title={v.familyLabel}>
                  <span className={`sil sil-${v.family}`} /><b>{v.name}</b><small>{v.familyLabel}</small>
                </button>
              ))}
            </div>
            {def.loadOptions && (<>
              <h3 className="sec">Товар</h3>
              <Seg size="sm" value={String(g.load)} onChange={(l) => set({ load: Number(l) })} options={def.loadOptions.map((l) => ({ id: String(l), label: l === 0 ? 'Празно' : `+${l} kg` }))} />
            </>)}
          </>)}
          {tab === 'look' && (<>
            <h3 className="sec">Боја</h3>
            <div className="swatches">
              {PAINT_PRESETS.map((p) => <button key={p.hex} className={`sw ${g.paint === p.hex ? 'on' : ''}`} style={{ background: p.hex }} title={p.name} aria-label={p.name} onClick={() => set({ paint: p.hex })} />)}
              <label className="sw custom" title="Своја боја"><input type="color" value={g.paint} onChange={(e) => set({ paint: e.target.value })} />+</label>
            </div>
            <Seg size="sm" value={g.finish} onChange={(f) => set({ finish: f })} options={[{ id: 'solid', label: 'Мат лак' }, { id: 'metallic', label: 'Металик' }]} />
          </>)}
          {tab === 'plate' && (<>
            <div className="plate-preview" aria-hidden><span className="plate-eu">MK</span><b>{plateOk ? plateText : g.plate}</b></div>
            <div className="plate-row">
              <select value={plateText.slice(0, 2)} onChange={(e) => { const t = e.target.value + plateText.slice(2); setPlateText(t); if (validPlate(t)) set({ plate: t }); }}>
                {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
              </select>
              <input value={plateText} maxLength={10} spellCheck={false} onChange={(e) => { const t = e.target.value.toUpperCase(); setPlateText(t); if (validPlate(t)) set({ plate: t }); }} aria-invalid={!plateOk} />
            </div>
            <p className={`hint ${plateOk ? '' : 'warn-t'}`}>{plateOk ? 'Измислена регистрација — регионалниот код е само украс.' : 'Формат: SK 1234-AB (без Q, W, X, Y).'}</p>
            <Seg size="sm" value={g.layout} onChange={(l) => set({ layout: l })} options={[{ id: 'long', label: 'Долга' }, { id: 'twoRow', label: 'Дворедна (задна)', disabled: !def.plates.includes('twoRow') }]} />
          </>)}
          {tab === 'data' && (<>
            <div className="stats">
              {[def.id, ...(def.id !== 'vardarka' ? ['vardarka'] : ['jakupica'])].map((id) => { const d = cmp(id); return (
                <div key={id} className={`stat-card ${id === def.id ? 'me' : ''}`}>
                  <b>{d.name}</b>
                  <dl>
                    <dt>Должина</dt><dd>{d.dims.L.toFixed(2)} m</dd>
                    <dt>Ширина</dt><dd>{d.dims.W.toFixed(2)} m</dd>
                    <dt>Круг на свртување</dt><dd>{turningCircle(d).toFixed(1)} m</dd>
                    <dt>Маса</dt><dd>{d.mass + (id === def.id ? g.load : 0)} kg</dd>
                    <dt>Вртежен момент</dt><dd>{peak(d)} Nm</dd>
                    <dt>Висина на око</dt><dd>{d.eye.y.toFixed(2)} m</dd>
                  </dl>
                </div>
              ); })}
            </div>
            <p className="hint">{def.rearWindow ? 'Има заден прозорец.' : 'Нема заден прозорец — внатрешното огледало е слепо, вози по страничните.'} {def.simplifications}</p>
          </>)}
        </div>
        <div className="garage-tools">
          <button className="btn ghost sm" onClick={() => { set({ ...DEFAULT_GARAGE, vehicle: g.vehicle, paint: def.paint }); setPlateText(DEFAULT_GARAGE.plate); }}><Icon name="retry" size={16} />Ресетирај</button>
        </div>
        <footer className="garage-foot">
          <button className="btn primary go" disabled={!!blocked} title={blocked ?? ''} onClick={() => engine.start({ ...engine.store.menu, assist: engine.store.settings.assist })}><Icon name="play" size={18} />Возиме</button>
        </footer>
      </aside>
      <div className="garage-hint"><Icon name="eye" size={15} />Влечи за вртење · тркалце или два прста за зум</div>
    </div>
  );
}

function useOrbit(engine: GameEngine) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = engine.view.renderer.domElement;
    const down = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; };
    const move = (e: PointerEvent) => {
      if (!drag.current || pts.size > 1) return;
      const o = engine.view.orbit;
      o.yaw += (e.clientX - drag.current.x) * 0.008;
      o.pitch = Math.max(0.02, Math.min(1.1, o.pitch + (e.clientY - drag.current.y) * 0.005));
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => { drag.current = null; };
    const wheel = (e: WheelEvent) => { const o = engine.view.orbit; o.dist = Math.max(3, Math.min(18, o.dist + e.deltaY * 0.01)); };
    // two-finger pinch zoom on touch screens
    const pts = new Map<number, { x: number; y: number }>(); let pinch0 = 0;
    const tdown = (e: PointerEvent) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); drag.current = null; } };
    const tmove = (e: PointerEvent) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const o = engine.view.orbit; o.dist = Math.max(3, Math.min(18, o.dist * (pinch0 / Math.max(1, d)))); pinch0 = d; } };
    const tup = (e: PointerEvent) => { pts.delete(e.pointerId); };
    el.addEventListener('pointerdown', tdown); window.addEventListener('pointermove', tmove); window.addEventListener('pointerup', tup); window.addEventListener('pointercancel', tup);
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); el.addEventListener('wheel', wheel, { passive: true });
    el.style.touchAction = 'none';
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.removeEventListener('wheel', wheel); el.removeEventListener('pointerdown', tdown); window.removeEventListener('pointermove', tmove); window.removeEventListener('pointerup', tup); window.removeEventListener('pointercancel', tup); };
  }, [engine]);
}

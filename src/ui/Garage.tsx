import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '../game/engine';
import { VEHICLES, PAINT_PRESETS, INTERIOR_PALETTES, turningCircle, vehicleById } from '../game/vehicles/defs';
import { validPlate, DEFAULT_GARAGE } from '../game/store';
import { compatibility } from '../game/attempt';

const REGIONS = [{ code: 'SK', name: 'Скопје' }, { code: 'BT', name: 'Битола' }, { code: 'OH', name: 'Охрид' }, { code: 'KU', name: 'Куманово' }, { code: 'TE', name: 'Тетово' }, { code: 'VE', name: 'Велес' }, { code: 'ST', name: 'Штип' }, { code: 'PP', name: 'Прилеп' }];

export function Garage({ engine }: { engine: GameEngine }) {
  const [, force] = useState(0);
  const g = engine.store.garage;
  const def = vehicleById(g.vehicle);
  const [plateText, setPlateText] = useState(g.plate);
  const [cockpit, setCockpit] = useState(false);
  const set = (p: Parameters<GameEngine['setGarage']>[0]) => { engine.setGarage(p); force((x) => x + 1); };
  useOrbit(engine);
  useEffect(() => { engine.view.orbit.cockpit = cockpit; }, [cockpit, engine]);
  const plateOk = validPlate(plateText);
  const cmp = (id: string) => vehicleById(id);
  const peak = (d: typeof def) => Math.max(...d.engine.curve.map((c) => c[1]));
  return (
    <div className="garage">
      <div className="garage-panel">
        <div className="kicker">Гаража</div>
        <h2>{def.name}</h2>
        <p className="note">{def.familyLabel} · {def.era} · {def.blurb}</p>
        <div className={`scope ${def.scope.category === 'B' ? '' : 'warn'}`}>{def.scope.label}</div>
        <h4>Возило</h4>
        <div className="fleet">
          {VEHICLES.map((v) => (
            <button key={v.id} className={`fleet-tile ${v.id === g.vehicle ? 'sel' : ''}`} onClick={() => set({ vehicle: v.id })} title={v.familyLabel}>
              <span className={`sil sil-${v.family}`} /><b>{v.name}</b><small>{v.familyLabel}</small>
            </button>
          ))}
        </div>
        <h4>Боја</h4>
        <div className="swatches">
          {PAINT_PRESETS.map((p) => <button key={p.hex} className={`sw ${g.paint === p.hex ? 'sel' : ''}`} style={{ background: p.hex }} title={p.name} onClick={() => set({ paint: p.hex })} />)}
          <label className="sw custom" title="Своја боја"><input type="color" value={g.paint} onChange={(e) => set({ paint: e.target.value })} />+</label>
        </div>
        <div className="chips">
          <button className={`chip ${g.finish === 'solid' ? 'sel' : ''}`} onClick={() => set({ finish: 'solid' })}>Мат лак</button>
          <button className={`chip ${g.finish === 'metallic' ? 'sel' : ''}`} onClick={() => set({ finish: 'metallic' })}>Металик</button>
        </div>
        <h4>Опрема (фабрички опции)</h4>
        <div className="chips">{def.trims.map((t) => <button key={t} className={`chip ${g.trims.includes(t) ? 'sel' : ''}`} onClick={() => set({ trims: g.trims.includes(t) ? g.trims.filter((x) => x !== t) : [...g.trims, t] })}>{t}</button>)}</div>
        <h4>Регистрација (измислена)</h4>
        <div className="plate-row">
          <select value={plateText.slice(0, 2)} onChange={(e) => { const t = e.target.value + plateText.slice(2); setPlateText(t); if (validPlate(t)) set({ plate: t }); }}>
            {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
          </select>
          <input value={plateText} maxLength={10} onChange={(e) => { const t = e.target.value.toUpperCase(); setPlateText(t); if (validPlate(t)) set({ plate: t }); }} aria-invalid={!plateOk} />
        </div>
        {!plateOk && <p className="warn small">Формат: SK 1234-AB (без Q, W, X, Y).</p>}
        <div className="chips">
          <button className={`chip ${g.layout === 'long' ? 'sel' : ''}`} onClick={() => set({ layout: 'long' })}>Долга табла</button>
          <button className={`chip ${g.layout === 'twoRow' ? 'sel' : ''}`} disabled={!def.plates.includes('twoRow')} title={def.plates.includes('twoRow') ? '' : 'Ова возило нема место за дворедна табла'} onClick={() => set({ layout: 'twoRow' })}>Дворедна (задна)</button>
        </div>
        <p className="note small">Изгледот на таблата е стилизиран според секундарен извор; бројките се измислени. Регионалните кодови се само украс.</p>
        <h4>Ентериер</h4>
        <div className="chips">{INTERIOR_PALETTES.map((p) => <button key={p.id} className={`chip ${g.interior === p.id ? 'sel' : ''}`} onClick={() => set({ interior: p.id })}>{p.name}</button>)}</div>
        {def.loadOptions && (<>
          <h4>Товар</h4>
          <div className="chips">{def.loadOptions.map((l) => <button key={l} className={`chip ${g.load === l ? 'sel' : ''}`} onClick={() => set({ load: l })}>{l === 0 ? 'Празно' : `+${l} kg`}</button>)}</div>
        </>)}
        <h4>Споредба</h4>
        <table className="cmp">
          <thead><tr><th /><th>Должина</th><th>Ширина</th><th>Круг на свртување</th><th>Маса</th><th>Вртежен момент</th><th>Око</th></tr></thead>
          <tbody>
            {[def.id, ...(def.id !== 'vardarka' ? ['vardarka'] : ['jakupica'])].map((id) => { const d = cmp(id); return (
              <tr key={id} className={id === def.id ? 'me' : ''}><td>{d.name}</td><td>{d.dims.L.toFixed(2)} m</td><td>{d.dims.W.toFixed(2)} m</td><td>{turningCircle(d).toFixed(1)} m</td><td>{d.mass + (id === def.id ? g.load : 0)} kg</td><td>{peak(d)} Nm</td><td>{d.eye.y.toFixed(2)} m</td></tr>
            ); })}
          </tbody>
        </table>
        <p className="note small">{def.rearWindow ? 'Заден прозорец: да.' : 'Нема заден прозорец — внатрешното огледало е слепо, вози по страничните.'} {def.simplifications}</p>
        <div className="row">
          <button className="btn" onClick={() => setCockpit(!cockpit)}>{cockpit ? 'Надвор' : 'Седни внатре'}</button>
          <button className="btn" onClick={() => { engine.store.favorites = [...engine.store.favorites.filter((f) => f.vehicle !== g.vehicle), { ...g }].slice(-6); engine.persist(); force((x) => x + 1); }}>Зачувај омилено</button>
          <button className="btn ghost" onClick={() => { set({ ...DEFAULT_GARAGE, vehicle: g.vehicle, paint: def.paint }); setPlateText(DEFAULT_GARAGE.plate); }}>Ресетирај</button>
        </div>
        {engine.store.favorites.length > 0 && <div className="chips">{engine.store.favorites.map((f, i) => <button key={i} className="chip" onClick={() => { set(f); setPlateText(f.plate); }}><span className="dot" style={{ background: f.paint }} />{vehicleById(f.vehicle).name}</button>)}</div>}
        <div className="row end">
          <button className="btn ghost" onClick={() => engine.backToMenu()}>Назад</button>
          <button className="btn primary" onClick={() => engine.start({ env: def.family === 'truck' ? 'polygon' : 'polygon', mode: 'practice' })}>Пробно возење (полигон)</button>
          <button className="btn primary" disabled={!!compatibility(def.id, engine.config.env)} onClick={() => engine.start({})}>Возиме</button>
        </div>
      </div>
      <div className="garage-hint">Влечи за вртење · тркалце за зум</div>
    </div>
  );
}

function useOrbit(engine: GameEngine) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = engine.view.renderer.domElement;
    const down = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; };
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const o = engine.view.orbit;
      o.yaw += (e.clientX - drag.current.x) * 0.008;
      o.pitch = Math.max(0.02, Math.min(1.1, o.pitch + (e.clientY - drag.current.y) * 0.005));
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => { drag.current = null; };
    const wheel = (e: WheelEvent) => { const o = engine.view.orbit; o.dist = Math.max(3, Math.min(18, o.dist + e.deltaY * 0.01)); };
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); el.addEventListener('wheel', wheel, { passive: true });
    el.style.touchAction = 'none';
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.removeEventListener('wheel', wheel); };
  }, [engine]);
}

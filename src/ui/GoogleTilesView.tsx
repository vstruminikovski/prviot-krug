import { useEffect, useRef, useState } from 'react';
import { openGoogleTiles, type TilesViewer } from '../game/render/googleTiles';

/** Full-screen optional Google 3D view. Visual reference only — not part of the driving world. */
export function GoogleTilesView({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [attr, setAttr] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let v: TilesViewer | null = null, dead = false;
    openGoogleTiles(ref.current!, setAttr).then((x) => { if (dead) x.dispose(); else v = x; }).catch((e) => setErr(String(e.message ?? e)));
    return () => { dead = true; v?.dispose(); };
  }, []);
  return (
    <div className="gtiles">
      <div ref={ref} className="gtiles-canvas" />
      <div className="gtiles-bar">
        <span>Google 3D приказ на Дебар Маало — само за ориентација. Возењето се одвива во измисленото маало.</span>
        <button className="btn glass sm" onClick={onClose}>Затвори</button>
      </div>
      {err && <div className="gtiles-err">{err}</div>}
      <div className="gtiles-attr"><span className="gtiles-logo" aria-label="Google Maps">Google Maps</span>{attr && <span className="gtiles-data">{attr}</span>}</div>
    </div>
  );
}

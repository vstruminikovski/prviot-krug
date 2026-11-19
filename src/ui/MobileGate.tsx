import { useEffect, useState } from 'react';
import { Icon, LogoMark, enterFullscreen } from './kit';

type W = Window & { __installPrompt?: Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } };

const isStandalone = () => matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1 && !/Android/.test(navigator.userAgent));
const coarse = () => matchMedia('(pointer: coarse)').matches;

/** Phones in a browser tab get toolbars, portrait and no fullscreen — not a driving game. This
 *  gate offers the real thing: install as an app (fullscreen, landscape, own icon) or go
 *  fullscreen + landscape right now. Shown once per session; never inside the installed app. */
export function MobileGate() {
  const [show, setShow] = useState(() => { try { return coarse() && !isStandalone() && sessionStorage.getItem('krug-gate') !== '1'; } catch { return coarse() && !isStandalone(); } });
  const [canInstall, setCanInstall] = useState(() => !!(window as W).__installPrompt);
  useEffect(() => { const f = () => setCanInstall(true); window.addEventListener('krug-installable', f); return () => window.removeEventListener('krug-installable', f); }, []);
  if (!show) return null;
  const close = () => { try { sessionStorage.setItem('krug-gate', '1'); } catch { /* */ } setShow(false); };
  const install = async () => {
    const p = (window as W).__installPrompt; if (!p) return;
    await p.prompt(); try { await p.userChoice; } catch { /* */ }
    (window as W).__installPrompt = undefined; setCanInstall(false);
  };
  const fullscreen = async () => { await enterFullscreen(); close(); };
  const ios = isIOS();
  const canFullscreen = !!document.documentElement.requestFullscreen && !ios;
  return (
    <div className="mgate">
      <div className="mgate-card">
        <LogoMark size={64} />
        <h2>Играј како апликација</h2>
        <p className="hint">На телефон КРУГ се вози на цел екран, хоризонтално, без лентите на прелистувачот.</p>
        {canInstall && <button className="btn primary block" onClick={install}><Icon name="next" size={18} />Инсталирај ја КРУГ</button>}
        {!canInstall && ios && (
          <ol className="mgate-steps">
            <li>Допри <b>Сподели</b> <span className="ios-share" aria-hidden>⬆︎</span> долу во Safari.</li>
            <li>Избери <b>„Додај на почетен екран“</b>.</li>
            <li>Отвори ја <b>КРУГ</b> од почетниот екран и сврти го телефонот.</li>
          </ol>
        )}
        {!canInstall && !ios && <p className="hint">Мени на прелистувачот <b>⋮</b> → <b>„Инсталирај апликација“</b> или <b>„Додај на почетен екран“</b>.</p>}
        {canFullscreen && <button className={`btn ${canInstall ? 'glass' : 'primary'} block`} onClick={fullscreen}><Icon name="play" size={18} />Играј веднаш на цел екран</button>}
        <button className="link mgate-skip" onClick={close}>Продолжи во прелистувач</button>
      </div>
    </div>
  );
}

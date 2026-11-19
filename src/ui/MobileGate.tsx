// Getting the game onto a phone the way the platforms intend (standard PWA patterns):
//  • Android Chrome / Edge / Samsung Internet: `beforeinstallprompt` → our Install button →
//    Chrome mints a real APK (WebAPK) that lives in the launcher and app settings.
//  • iPhone / iPad: no install API exists — Share → "Add to Home Screen", with the right steps
//    for the browser in use (Safari, Chrome, Firefox, Edge).
//  • Firefox for Android: install from its menu.
//  • In-app browsers (Instagram, Facebook, Messenger, TikTok…) cannot install anything: open
//    the link in Chrome (Android `intent://`) or in Safari (iOS menu).
//  • Installed / fullscreen: never shown.
import { useEffect, useState } from 'react';
import { Icon, LogoMark, enterFullscreen } from './kit';

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type W = Window & { __installPrompt?: Prompt };

const ua = () => navigator.userAgent;
export const isStandalone = () => matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true || document.referrer.startsWith('android-app://');
const isAndroid = () => /Android/i.test(ua());
const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1 && !isAndroid());
const inApp = () => /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|musical_ly|Bytedance|Snapchat|Twitter|LinkedInApp|MicroMessenger|Pinterest|GSA\//.test(ua());
const iosBrowser = (): 'safari' | 'chrome' | 'firefox' | 'edge' => /CriOS/.test(ua()) ? 'chrome' : /FxiOS/.test(ua()) ? 'firefox' : /EdgiOS/.test(ua()) ? 'edge' : 'safari';
const androidBrowser = (): 'chrome' | 'firefox' | 'samsung' | 'other' => /SamsungBrowser/.test(ua()) ? 'samsung' : /Firefox\//.test(ua()) ? 'firefox' : /Chrome\//.test(ua()) ? 'chrome' : 'other';
const coarse = () => matchMedia('(pointer: coarse)').matches;

/** Shared install state: the saved prompt (if the browser offered one) and whether the app got installed. */
export function useInstall() {
  const [canInstall, setCanInstall] = useState(() => !!(window as W).__installPrompt);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const ok = () => setCanInstall(true);
    const done = () => { (window as W).__installPrompt = undefined; setCanInstall(false); setInstalled(true); };
    window.addEventListener('krug-installable', ok); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('krug-installable', ok); window.removeEventListener('appinstalled', done); };
  }, []);
  const install = async () => {
    const p = (window as W).__installPrompt; if (!p) return;
    await p.prompt();
    try { const c = await p.userChoice; if (c.outcome === 'accepted') setInstalled(true); } catch { /* */ }
    (window as W).__installPrompt = undefined; setCanInstall(false);
  };
  return { canInstall, installed, install };
}

/** Compact install button for the menu (desktop Chrome/Edge and Android when the browser offers it). */
export function InstallButton() {
  const { canInstall, install } = useInstall();
  if (!canInstall || isStandalone()) return null;
  return <button className="btn icon glass fs-btn" onClick={() => void install()} title="Инсталирај ја играта" aria-label="Инсталирај"><Icon name="download" /></button>;
}

export function MobileGate() {
  const [show, setShow] = useState(() => { try { return coarse() && !isStandalone() && sessionStorage.getItem('krug-gate') !== '1'; } catch { return coarse() && !isStandalone(); } });
  const { canInstall, installed, install } = useInstall();
  const [copied, setCopied] = useState(false);
  if (!show) return null;
  const close = () => { try { sessionStorage.setItem('krug-gate', '1'); } catch { /* */ } setShow(false); };
  const fullscreen = async () => { await enterFullscreen(); close(); };
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); } catch { setCopied(false); } };
  const ios = isIOS(), android = isAndroid(), app = inApp();
  const canFullscreen = !!document.documentElement.requestFullscreen && !ios && !app;
  const chromeIntent = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;

  let body: JSX.Element;
  if (installed) {
    body = <div className="mgate-done"><Icon name="check" size={22} /><p><b>Инсталирано!</b> Отвори ја <b>КРУГ</b> од почетниот екран — се отвора на цел екран.</p></div>;
  } else if (app) {
    body = android ? (
      <>
        <p className="hint">Оваа апликација (Instagram, Facebook, Messenger…) не може да инсталира игри. Отвори го линкот во Chrome.</p>
        <a className="btn primary block" href={chromeIntent}><Icon name="next" size={18} />Отвори во Chrome</a>
        <button className="btn glass block" onClick={() => void copy()}>{copied ? 'Линкот е копиран' : 'Копирај линк'}</button>
      </>
    ) : (
      <>
        <p className="hint">Оваа апликација не може да инсталира игри. Отвори го линкот во Safari:</p>
        <ol className="mgate-steps"><li>Допри <b>•••</b> или <b>⋯</b> (горе или долу десно).</li><li>Избери <b>„Отвори во Safari“</b> / „Open in browser“.</li></ol>
        <button className="btn glass block" onClick={() => void copy()}>{copied ? 'Линкот е копиран — залепи го во Safari' : 'Копирај линк'}</button>
      </>
    );
  } else if (canInstall) {
    body = <button className="btn primary block" onClick={() => void install()}><Icon name="download" size={18} />Инсталирај ја КРУГ</button>;
  } else if (ios) {
    const b = iosBrowser();
    body = (
      <ol className="mgate-steps">
        {b === 'safari' && <li>Допри <b>Сподели</b> <span className="ios-share" aria-hidden>⬆︎</span> (долу во Safari).</li>}
        {b === 'chrome' && <li>Допри <b>Сподели</b> <span className="ios-share" aria-hidden>⬆︎</span> во лентата за адреса (горе десно).</li>}
        {(b === 'firefox' || b === 'edge') && <li>Отвори го менито <b>☰</b> / <b>⋯</b> и допри <b>Сподели</b>.</li>}
        <li>Избери <b>„Додај на почетен екран“</b>.</li>
        <li>Отвори ја <b>КРУГ</b> од почетниот екран и сврти го телефонот.</li>
      </ol>
    );
  } else if (android) {
    const b = androidBrowser();
    body = <p className="hint">{b === 'samsung' ? <>Мени <b>☰</b> → <b>„Додај страница на“</b> → <b>„Почетен екран“</b>.</> : b === 'firefox' ? <>Мени <b>⋮</b> → <b>„Инсталирај“</b>.</> : <>Мени <b>⋮</b> → <b>„Инсталирај апликација“</b> / „Додај на почетен екран“.</>}</p>;
  } else {
    body = <p className="hint">Отвори го менито на прелистувачот и избери „Инсталирај“ или „Додај на почетен екран“.</p>;
  }

  return (
    <div className="mgate">
      <div className="mgate-card">
        <LogoMark size={64} />
        <h2>{app ? 'Отвори во прелистувач' : 'Играј како апликација'}</h2>
        {!app && !installed && <p className="hint">На телефон КРУГ се вози на цел екран, хоризонтално, без лентите на прелистувачот{android ? ' — се инсталира како вистинска Android апликација' : ''}.</p>}
        {body}
        {canFullscreen && !installed && <button className={`btn ${canInstall ? 'glass' : 'primary'} block`} onClick={() => void fullscreen()}><Icon name="play" size={18} />Играј веднаш на цел екран</button>}
        <button className="link mgate-skip" onClick={close}>{installed ? 'Продолжи тука' : 'Продолжи во прелистувач'}</button>
      </div>
    </div>
  );
}

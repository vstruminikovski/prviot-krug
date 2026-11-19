import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { setHostOptions, type HostOptions } from './game/host';
import '@fontsource-variable/unbounded/wght.css';
import '@fontsource-variable/manrope/wght.css';
import './ui/styles.css';

/**
 * Host API. The platform can either load index.html in an iframe and listen for
 * `message` events of type "krug:complete", or mount the module directly:
 *   window.KrugGame.mount(document.getElementById('game'), { onComplete: (p) => … })
 */
export function mount(el: HTMLElement, opts: HostOptions = {}) {
  setHostOptions(opts);
  const root = createRoot(el);
  root.render(<App />);
  return { unmount: () => root.unmount() };
}

declare global { interface Window { KrugGame?: { mount: typeof mount } } }
window.KrugGame = { mount };

// installable app: offline cache + home-screen install (production builds only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); });
}
// keep the browser's install prompt so the game can offer it from its own button
// install: the browser's own native install banner/menu is used (no custom prompt UI)

const rootEl = document.getElementById('root');
if (rootEl && !rootEl.dataset.manual) {
  createRoot(rootEl).render(<App />);
}

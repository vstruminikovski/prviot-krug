import { Component, type ReactNode } from 'react';

/** A UI panel that throws never takes the game down: it shows a small recoverable card instead. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String((e as Error)?.message ?? e) }; }
  componentDidCatch(e: unknown) { console.error('[ui]', e); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="scrim">
        <div className="sheet narrow"><header className="sheet-h"><div><div className="kicker">Грешка</div><h2>Нешто запна</h2></div></header><div className="sheet-b">
          <p className="hint">Овој дел од екранот не успеа да се прикаже. Играта продолжува.</p>
          <p className="fine"><code>{this.state.err}</code></p>
          <button className="btn primary block" onClick={() => { this.setState({ err: null }); this.props.onReset?.(); }}>Назад во менито</button>
        </div></div>
      </div>
    );
  }
}

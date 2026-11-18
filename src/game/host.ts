// Host-platform integration: a small completion event and the optional friend challenge link.
import type { RunSummary } from './sim/sim';

export const EPISODE_ID = 'debar-maalo-1';

export interface CompletionPayload {
  type: 'krug:complete';
  episode: string;
  score: number; // game score 0–100 (not a legal assessment)
  maxScore: 100;
  finished: boolean;
  scenarios: { id: string; outcome: string; points: number; reactionSec: number | null; scored: boolean }[];
  speedingEpisodes: number;
  contacts: number;
  completedAt: string;
}

export interface HostOptions {
  onComplete?: (p: CompletionPayload) => void;
  /** Force-enable or disable the "Да те видам ти" challenge link. Default: on when served over http(s) from a non-local host. */
  challenge?: boolean;
  /** Base URL used for the challenge link (defaults to the current page). */
  shareUrl?: string;
}

let hostOptions: HostOptions = {};
export const setHostOptions = (o: HostOptions) => { hostOptions = { ...hostOptions, ...o }; };

export function emitComplete(sum: RunSummary) {
  const payload: CompletionPayload = {
    type: 'krug:complete', episode: EPISODE_ID, score: sum.score, maxScore: 100, finished: sum.finished,
    scenarios: sum.scenarios.map((s) => ({ id: s.id, outcome: s.outcome, points: s.points, reactionSec: s.reaction === null ? null : Math.round(s.reaction * 10) / 10, scored: s.id !== 'x1' })),
    speedingEpisodes: sum.speeding.length, contacts: sum.contacts.length, completedAt: new Date().toISOString(),
  };
  try { window.dispatchEvent(new CustomEvent('krug:complete', { detail: payload })); } catch { /* ignore */ }
  try { if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*'); } catch { /* ignore */ }
  hostOptions.onComplete?.(payload);
  return payload;
}

export function isHosted(): boolean {
  if (hostOptions.challenge !== undefined) return hostOptions.challenge;
  const q = new URLSearchParams(location.search);
  if (q.get('hosted') === '1') return true;
  return /^https?:$/.test(location.protocol) && !['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
}

export function challengeUrl(score: number): string {
  const base = hostOptions.shareUrl ?? `${location.origin}${location.pathname}`;
  const u = new URL(base, location.href);
  u.searchParams.set('route', EPISODE_ID);
  u.searchParams.set('challenge', String(score));
  return u.toString();
}

export function incomingChallenge(): number | null {
  const q = new URLSearchParams(location.search);
  const c = q.get('challenge');
  if (!c || q.get('route') !== EPISODE_ID) return null;
  const n = Number(c);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

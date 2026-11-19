// Host-platform integration: a small completion event and the optional friend challenge link.
import type { AttemptResult } from './sim/sim';

export const EPISODE_ID = 'debar-maalo-1';

export interface CompletionPayload {
  type: 'krug:complete';
  episode: string;
  env: string; mode: string; vehicle: string; assist: string; seed: number;
  score: number; // game score 0–100 (not a legal assessment)
  maxScore: 100;
  finished: boolean;
  failed: string | null;
  layers: { safety: number; technique: number; mission: number };
  exam: { form: string; total: number; passed: boolean } | null;
  items: { id: string; status: string }[];
  incidents: { rule: string; severity: string; t: number }[];
  versions: { content: number; rules: string; physics: string };
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

export function emitComplete(r: AttemptResult) {
  const payload: CompletionPayload = {
    type: 'krug:complete', episode: EPISODE_ID, env: r.config.env, mode: r.config.mode, vehicle: r.config.vehicle, assist: r.config.assist, seed: r.config.seed,
    score: r.gameScore, maxScore: 100, finished: r.finished, failed: r.failed?.text ?? null, layers: r.layers, exam: r.exam,
    items: r.items.map((i) => ({ id: i.id, status: i.status })), incidents: r.incidents.map((i) => ({ rule: i.ruleIds[0], severity: i.severity, t: Math.round(i.t * 10) / 10 })),
    versions: r.versions, completedAt: new Date().toISOString(),
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

export function challengeUrl(code: string): string {
  const base = hostOptions.shareUrl ?? `${location.origin}${location.pathname}`;
  const u = new URL(base, location.href);
  u.searchParams.set('c', code);
  return u.toString();
}

export function incomingChallenge(): string | null {
  return new URLSearchParams(location.search).get('c');
}

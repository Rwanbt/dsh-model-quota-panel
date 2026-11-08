import { kindOfModelProvider } from './providers.js';

/**
 * Normalisation helpers shared by every adapter.
 * Pure functions: no I/O, no Node imports.
 */

/** Clamp a percentage into 0..100, or null when the value is not a number. */
export function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Accept Unix seconds, Unix milliseconds, an ISO string or a Date. */
export function toIso(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === 'string' && value !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

/** Human label for a vendor window length, in seconds. */
export function windowLabel(seconds, fallback) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return fallback;
  if (seconds >= 7 * 86400) return 'Semaine';
  if (seconds >= 86400) return `Fenêtre ${Math.round(seconds / 86400)} j`;
  if (seconds >= 3600) return `Fenêtre ${Math.round(seconds / 3600)} h`;
  return `Fenêtre ${Math.round(seconds / 60)} min`;
}

/** Highest utilisation across one provider's percentage windows. */
export function worstPercent(provider) {
  const windows = Array.isArray(provider?.windows) ? provider.windows : [];
  let worst = null;
  for (const window of windows) {
    if (typeof window?.usedPct !== 'number') continue;
    if (worst === null || window.usedPct > worst) worst = window.usedPct;
  }
  return worst;
}

/**
 * Which cards a panel may show: providers that answered, or whose last known
 * reading is still kept. Unsupported families and disconnected accounts are
 * dropped; when nothing answers, transient failures are published instead.
 */
export function visibleProviders(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const ok = list.filter((entry) => entry.status === 'ok');
  return ok.length > 0 ? ok : list.filter((entry) => entry.status === 'error');
}

/**
 * Pick the card that describes the Session's model: the exact provider instance
 * first (two accounts of one vendor are two ids), then its family.
 */
export function pickActive(providers, providerId) {
  const list = Array.isArray(providers) ? providers.filter(Boolean) : [];
  if (typeof providerId === 'string' && providerId !== '') {
    const exact = list.find((entry) => entry.provider === providerId || entry.id === providerId);
    if (exact) return exact;
    const kind = kindOfModelProvider(providerId);
    const family = list.find((entry) => entry.kind === kind);
    if (family) return family;
  }
  return list.find((entry) => entry.active) ?? list.find((entry) => worstPercent(entry) !== null) ?? list[0] ?? null;
}

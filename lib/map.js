/**
 * Pure payload mappers: each vendor response becomes `{ windows, plan }`.
 * No network, no I/O — the adapters in `index.js` only deal with fetch and
 * error handling, so every mapping rule here is unit-tested against fixtures.
 */

import { pct, toIso, windowLabel } from './format.js';

/** OpenCode Go: rolling / weekly / monthly percentages. */
export function mapOpencodeUsage(payload) {
  const usage = payload?.usage ?? {};
  const windows = [];
  for (const [key, label] of [
    ['rolling', 'Fenêtre glissante'],
    ['weekly', 'Semaine'],
    ['monthly', 'Mois'],
  ]) {
    const window = usage[key];
    if (!window || typeof window.percent !== 'number') continue;
    windows.push({ label, usedPct: pct(window.percent), resetsAt: toIso(window.resetsAt) });
  }
  return { windows, plan: 'Go' };
}

/**
 * Codex (ChatGPT): `used_percent` is the *consumed* percentage, so the panel
 * stays progressive like every other provider.
 */
export function mapCodexUsage(payload) {
  const limit = payload?.rate_limit;
  const windows = [];
  for (const [key, fallback] of [
    ['primary_window', 'Fenêtre courte'],
    ['secondary_window', 'Semaine'],
  ]) {
    const window = limit?.[key];
    if (!window || typeof window.used_percent !== 'number') continue;
    windows.push({
      label: windowLabel(window.limit_window_seconds, fallback),
      usedPct: pct(window.used_percent),
      resetsAt: toIso(window.reset_at),
    });
  }
  return { windows, plan: typeof payload?.plan_type === 'string' ? payload.plan_type : null };
}

/** Anthropic OAuth usage: five-hour and seven-day utilization. */
export function mapAnthropicUsage(payload) {
  const windows = [];
  for (const [key, label] of [
    ['five_hour', 'Fenêtre 5 h'],
    ['seven_day', 'Semaine'],
  ]) {
    const window = payload?.[key];
    if (!window || typeof window.utilization !== 'number') continue;
    windows.push({ label, usedPct: pct(window.utilization), resetsAt: toIso(window.resets_at) });
  }
  return { windows, plan: null };
}

/** GitHub Copilot: quota snapshots expose the *remaining* percentage. */
export function mapCopilotUser(payload) {
  const snapshots = payload?.quota_snapshots ?? {};
  const windows = [];
  for (const [key, label] of [
    ['chat', 'Chat'],
    ['completions', 'Complétions'],
    ['premium_interactions', 'Premium'],
  ]) {
    const snapshot = snapshots[key];
    if (!snapshot || typeof snapshot.percent_remaining !== 'number') continue;
    windows.push({
      label,
      usedPct: pct(100 - snapshot.percent_remaining),
      resetsAt: toIso(snapshot.quota_reset_at),
    });
  }
  return { windows, plan: typeof payload?.copilot_plan === 'string' ? payload.copilot_plan : null };
}

/** OpenRouter: credit usage against the key's own limit. */
export function mapOpenrouterKey(payload) {
  const data = payload?.data ?? {};
  const limit = typeof data.limit === 'number' ? data.limit : null;
  const usage = typeof data.usage === 'number' ? data.usage : null;
  const windows = [];
  if (limit !== null && limit > 0 && usage !== null) {
    windows.push({ label: 'Crédit', usedPct: pct((usage / limit) * 100), resetsAt: null });
  }
  return { windows, plan: null };
}

/** Z.ai coding plan: `success: false` carries the reason (no coding plan). */
export function mapZaiLimit(payload) {
  if (payload?.success === false) {
    return { windows: [], plan: null, reason: payload.msg ?? 'Aucun plan coding sur ce compte' };
  }
  const limits = payload?.data?.limits ?? payload?.data ?? null;
  const rows = Array.isArray(limits) ? limits : limits && typeof limits === 'object' ? [limits] : [];
  const windows = [];
  for (const item of rows) {
    const used = item?.used ?? item?.usage;
    const total = item?.total ?? item?.limit;
    if (typeof used !== 'number' || typeof total !== 'number' || total <= 0) continue;
    windows.push({
      label: String(item?.name ?? item?.type ?? 'Quota'),
      usedPct: pct((used / total) * 100),
      resetsAt: toIso(item?.resetTime ?? item?.reset_at),
    });
  }
  return { windows, plan: null };
}

/** MiniMax coding plan: interval and weekly counters, plus the vendor status. */
export function mapMinimaxRemains(payload) {
  const status = payload?.base_resp?.status_code;
  if (status !== 0 && status !== undefined) {
    return { windows: [], plan: null, reason: payload?.base_resp?.status_msg ?? 'Aucun plan MiniMax actif' };
  }
  const model = Array.isArray(payload?.model_remains) ? payload.model_remains[0] : null;
  if (!model) return { windows: [], plan: null, reason: 'Aucun quota MiniMax renvoyé' };
  const windows = [];
  for (const [label, used, total, resetsAt] of [
    ['Intervalle', model.current_interval_usage_count, model.current_interval_total_count, model.end_time],
    ['Semaine', model.current_weekly_usage_count, model.current_weekly_total_count, model.weekly_end_time],
  ]) {
    if (typeof used !== 'number' || typeof total !== 'number' || total <= 0) continue;
    windows.push({ label, usedPct: pct((used / total) * 100), resetsAt: toIso(resetsAt) });
  }
  return { windows, plan: typeof model.model === 'string' ? model.model : null };
}

/** Moonshot / Kimi: a balance, not a percentage. */
export function mapMoonshotBalance(payload) {
  const balance = payload?.data?.available_balance;
  if (typeof balance !== 'number') return { windows: [], plan: null, reason: 'Aucun solde renvoyé par Moonshot' };
  return { windows: [], plan: null, reason: `Solde : ¥${balance.toFixed(2)}` };
}

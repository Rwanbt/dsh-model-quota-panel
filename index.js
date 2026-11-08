/**
 * Host half of the model-quota-panel bundle.
 *
 * Publishes `quotas.json` next to this file. The client half reads that file
 * through the built-in `api/file` route, because the desktop shell forwards
 * requests to a plugin's own web routes but never delivers their responses.
 *
 * Every number comes from the vendor's own usage endpoint. A provider with no
 * quota API, or one that is not connected, is not published at all.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REQUEST_TIMEOUT_MS = 12_000;
const PUBLISH_INTERVAL_MS = 20_000;
const QUOTAS_PATH = new URL('./quotas.json', import.meta.url);

/**
 * Codex windows: the API field is used_percent and its own flags match that
 * reading (limit_reached stayed false while the short window sat at 0), so the
 * consumed percentage is shown directly and every bar grows as you use it.
 * Set to true only if OpenAI starts reporting the remaining quota instead.
 */
const CODEX_WINDOWS_ARE_REMAINING = false;

const OPENCODE_AUTH = () => join(homedir(), '.local', 'share', 'opencode', 'auth.json');
const DSH_CREDENTIALS = () =>
  process.env.DSH_HOME && process.env.DSH_HOME !== ''
    ? join(process.env.DSH_HOME, '.credentials.yaml')
    : join(homedir(), '.dsh', '.credentials.yaml');

export function apply(ctx) {
  const agentDefaultModel = ctx.get('agentDefaultModel');

  const publish = async () => {
    try {
      const value = await collect(agentDefaultModel);
      await writeFile(QUOTAS_PATH, JSON.stringify(value), 'utf8');
    } catch (error) {
      console.warn('[model-quota-panel] could not publish quotas.json:', error?.message);
    }
  };

  void publish();
  const timer = setInterval(() => void publish(), PUBLISH_INTERVAL_MS);
  ctx.effect(() => () => clearInterval(timer), 'model-quota-panel: publisher');
}
async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Flat `NAME: value` entries of the DSH credential store's `refs:` block. */
async function dshRefs() {
  const map = {};
  try {
    const text = await readFile(DSH_CREDENTIALS(), 'utf8');
    let inRefs = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^refs:\s*$/.test(line)) {
        inRefs = true;
        continue;
      }
      if (!inRefs) continue;
      if (line.trim() === '') continue;
      if (!line.startsWith(' ')) break;
      const match = line.match(/^\s{1,4}([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$/);
      if (!match) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value !== '') map[match[1]] = value;
    }
  } catch {
    // no store
  }
  return map;
}

async function opencodeAuth() {
  return (await readJsonFile(OPENCODE_AUTH())) ?? {};
}

/* ── collection ───────────────────────────────────────────────────────── */

async function collect(agentDefaultModel) {
  const [refs, opencode] = await Promise.all([dshRefs(), opencodeAuth()]);
  const active = readActiveSelection(agentDefaultModel);
  const activeKind = kindOf(active.provider);

  const providers = [];
  const push = (provider) => {
    if (provider) providers.push(provider);
  };

  push(await opencodeGoQuota(refs, activeKind));
  push(await codexQuota(activeKind));
  push(await claudeQuota(activeKind));
  push(await openrouterQuota(opencode, activeKind));
  push(await zaiQuota(opencode, activeKind));
  push(await copilotQuota(opencode, activeKind));
  push(await moonshotQuota(refs, activeKind));
  push(await minimaxQuota(refs, opencode, activeKind));

  // Only providers that can actually report a quota are published, and while at
  // least one works the transient failures stay out of the panel. When nothing
  // works, the failures are published so the panel can say why it is empty.
  const okProviders = providers.filter((provider) => provider.status === 'ok');
  const visible = okProviders.length > 0 ? okProviders : providers.filter((provider) => provider.status === 'error');
  visible.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return {
    ok: visible.some((provider) => provider.status === 'ok'),
    generatedAt: new Date().toISOString(),
    active,
    providers: visible,
  };
}

function readActiveSelection(agentDefaultModel) {
  let selection = null;
  try {
    selection = agentDefaultModel?.currentSelection?.() ?? null;
  } catch (error) {
    console.warn('[model-quota-panel] could not read the default model selection:', error?.message);
  }
  return {
    provider: typeof selection?.provider === 'string' ? selection.provider : null,
    model: typeof selection?.model === 'string' ? selection.model : null,
  };
}

function kindOf(provider) {
  if (typeof provider !== 'string') return null;
  if (provider.includes('opencode')) return 'opencode-go';
  if (provider.includes('claude')) return 'claude';
  if (provider.includes('codex')) return 'openai-codex';
  if (provider.includes('openrouter')) return 'openrouter';
  if (provider.includes('zai') || provider.includes('z.ai') || provider.includes('glm')) return 'zai';
  if (provider.includes('copilot')) return 'github-copilot';
  if (provider.includes('moonshot') || provider.includes('kimi')) return 'moonshot';
  return provider;
}

function base(id, label, activeKind, extra = {}) {
  return Object.assign({ id, label, plan: null, windows: [], active: id === activeKind, status: 'ok', reason: null }, extra);
}

function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toIso(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === 'string' && value !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  let body = null;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = body && (body.error?.message || body.msg || body.message);
    throw new Error(`HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
  }
  if (body === null) throw new Error('réponse non JSON');
  return body;
}

/* ── OpenCode Go ──────────────────────────────────────────────────────── */

async function opencodeGoQuota(refs, activeKind) {
  const key = refs.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_GO_API_KEY ?? (await opencodeAuth())['opencode-go']?.key;
  if (!key) return null;
  const entry = base('opencode-go', 'OpenCode Go', activeKind, { plan: 'Go' });
  try {
    const payload = await getJson('https://opencode.ai/inference/go/v1/usage', {
      authorization: `Bearer ${key}`,
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    });
    const usage = payload?.usage ?? {};
    const labels = { rolling: 'Fenêtre glissante', weekly: 'Semaine', monthly: 'Mois' };
    for (const [key2, label] of Object.entries(labels)) {
      const window = usage[key2];
      if (!window || typeof window.percent !== 'number') continue;
      entry.windows.push({ label, usedPct: pct(window.percent), resetsAt: toIso(window.resetsAt) });
    }
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune fenêtre renvoyée par OpenCode';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

/* ── Codex (ChatGPT) ──────────────────────────────────────────────────── */

async function codexQuota(activeKind) {
  const entry = base('openai-codex', 'Codex (ChatGPT)', activeKind);
  const auth = await readJsonFile(join(homedir(), '.codex', 'auth.json'));
  const token = auth?.tokens?.access_token;
  if (typeof token !== 'string' || token === '') {
    return Object.assign(entry, { status: 'unavailable', reason: 'Connexion Codex absente (lance `codex login`)' });
  }
  try {
    const headers = { authorization: `Bearer ${token}` };
    if (typeof auth?.tokens?.account_id === 'string') headers['chatgpt-account-id'] = auth.tokens.account_id;
    const usage = await getJson('https://chatgpt.com/backend-api/wham/usage', headers);
    const limit = usage?.rate_limit;
    for (const [key, fallback] of [['primary_window', 'Fenêtre courte'], ['secondary_window', 'Semaine']]) {
      const window = limit?.[key];
      if (!window || typeof window.used_percent !== 'number') continue;
      const seconds = window.limit_window_seconds;
      entry.windows.push({
        label: typeof seconds === 'number' && seconds >= 7 * 86400 ? 'Semaine' : fallback,
        // OpenAI reports the Codex windows as *remaining* quota. Every other
        // provider here reports consumption, so invert it once, here, to keep
        // the whole panel progressive (a bar that grows as you use it).
        usedPct: pct(CODEX_WINDOWS_ARE_REMAINING ? 100 - window.used_percent : window.used_percent),
        resetsAt: toIso(window.reset_at),
      });
    }
    entry.plan = typeof usage?.plan_type === 'string' ? usage.plan_type : null;
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune fenêtre renvoyée par OpenAI';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

/* ── Claude Code ──────────────────────────────────────────────────────── */

async function claudeQuota(activeKind) {
  const entry = base('claude', 'Claude Code', activeKind);
  const credentials = await readJsonFile(join(homedir(), '.claude', '.credentials.json'));
  const oauth = credentials?.claudeAiOauth;
  if (typeof oauth?.accessToken !== 'string' || oauth.accessToken === '') {
    return Object.assign(entry, { status: 'unavailable', reason: 'Connexion Claude absente (lance `claude`, puis /login)' });
  }
  try {
    const usage = await getJson('https://api.anthropic.com/api/oauth/usage', {
      authorization: `Bearer ${oauth.accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
    });
    for (const [key, label] of [['five_hour', 'Fenêtre 5 h'], ['seven_day', 'Semaine']]) {
      const window = usage?.[key];
      if (!window || typeof window.utilization !== 'number') continue;
      entry.windows.push({ label, usedPct: pct(window.utilization), resetsAt: toIso(window.resets_at) });
    }
    entry.plan = typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null;
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune fenêtre renvoyée par Anthropic';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

/* ── OpenRouter ───────────────────────────────────────────────────────── */

async function openrouterQuota(opencode, activeKind) {
  const key = opencode?.openrouter?.key;
  if (!key) return null;
  const entry = base('openrouter', 'OpenRouter', activeKind);
  try {
    const payload = await getJson('https://openrouter.ai/api/v1/key', { authorization: `Bearer ${key}` });
    const data = payload?.data ?? {};
    const limit = typeof data.limit === 'number' ? data.limit : null;
    const usage = typeof data.usage === 'number' ? data.usage : null;
    if (limit !== null && limit > 0 && usage !== null) {
      entry.windows.push({ label: 'Crédit', usedPct: pct((usage / limit) * 100), resetsAt: null });
    } else if (usage !== null) {
      entry.windows.push({ label: 'Consommé', usedPct: null, resetsAt: null, note: `$${usage.toFixed(2)} consommés (pas de plafond)` });
    }
    if (typeof data.limit_remaining === 'number') entry.note = `$${data.limit_remaining.toFixed(2)} restants`;
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune donnée de crédit renvoyée par OpenRouter';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

/* ── Z.ai (GLM coding plan) ───────────────────────────────────────────── */

async function zaiQuota(opencode, activeKind) {
  const key = opencode?.zai?.key;
  if (!key) return null;
  const entry = base('zai', 'Z.ai (GLM)', activeKind);
  try {
    const payload = await getJson('https://api.z.ai/api/monitor/usage/quota/limit', {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    });
    if (payload?.success === false) {
      entry.status = 'unavailable';
      entry.reason = payload.msg ?? 'Aucun plan coding sur ce compte';
      return entry;
    }
    const limits = payload?.data?.limits ?? payload?.data ?? null;
    const candidate = Array.isArray(limits) ? limits : limits && typeof limits === 'object' ? [limits] : [];
    for (const item of candidate) {
      const used = item?.used ?? item?.usage;
      const total = item?.total ?? item?.limit;
      if (typeof used === 'number' && typeof total === 'number' && total > 0) {
        entry.windows.push({
          label: String(item?.name ?? item?.type ?? 'Quota'),
          usedPct: pct((used / total) * 100),
          resetsAt: toIso(item?.resetTime ?? item?.reset_at),
        });
      }
    }
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune fenêtre reconnue dans la réponse Z.ai';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

/* ── GitHub Copilot ───────────────────────────────────────────────────── */

async function copilotQuota(opencode, activeKind) {
  const token = opencode?.['github-copilot']?.access;
  if (!token) return null;
  const entry = base('github-copilot', 'GitHub Copilot', activeKind);
  try {
    const exchange = await getJson('https://api.github.com/copilot_internal/v2/token', {
      authorization: `token ${token}`,
      accept: 'application/json',
      'user-agent': 'GitHubCopilotChat/0.26.7',
    });
    const copilotToken = exchange?.token;
    if (typeof copilotToken !== 'string') throw new Error('jeton Copilot absent');
    const usage = await getJson('https://api.github.com/copilot_internal/user', {
      authorization: `Bearer ${copilotToken}`,
      accept: 'application/json',
      'user-agent': 'GitHubCopilotChat/0.26.7',
    });
    const snapshots = usage?.quota_snapshots ?? {};
    for (const [key, label] of [['chat', 'Chat'], ['completions', 'Complétions'], ['premium_interactions', 'Premium']]) {
      const snapshot = snapshots[key];
      if (!snapshot) continue;
      const remaining = snapshot.percent_remaining;
      if (typeof remaining !== 'number') continue;
      entry.windows.push({ label, usedPct: pct(100 - remaining), resetsAt: toIso(snapshot.quota_reset_at) });
    }
    entry.plan = typeof usage?.copilot_plan === 'string' ? usage.copilot_plan : null;
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucun quota Copilot renvoyé';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

/* ── Moonshot / Kimi ──────────────────────────────────────────────────── */
async function moonshotQuota(refs, activeKind) {
  const key = refs.MOONSHOT_API_KEY ?? process.env.MOONSHOT_API_KEY;
  if (!key) return null;
  const entry = base('moonshot', 'Moonshot / Kimi', activeKind);
  try {
    const payload = await getJson('https://api.moonshot.cn/v1/users/me/balance', {
      authorization: `Bearer ${key}`,
    });
    const data = payload?.data ?? {};
    const balance = data.available_balance;
    if (typeof balance === 'number') {
      entry.windows.push({ label: 'Solde', usedPct: null, resetsAt: null, note: `¥${balance.toFixed(2)} disponibles` });
      return entry;
    }
    entry.status = 'unavailable';
    entry.reason = 'Aucun solde renvoyé par Moonshot';
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

/* ── MiniMax (coding / token plan) ────────────────────────────────────── */

async function minimaxQuota(refs, opencode, activeKind) {
  const key = refs.MINIMAX_API_KEY ?? process.env.MINIMAX_API_KEY ?? opencode?.['minimax-coding-plan']?.key;
  if (!key) return null;
  const entry = base('minimax', 'MiniMax', activeKind);
  try {
    const payload = await getJson('https://api.minimax.io/v1/coding_plan/remains', {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    });
    const status = payload?.base_resp?.status_code;
    if (status !== 0 && status !== undefined) {
      entry.status = 'unavailable';
      entry.reason = payload?.base_resp?.status_msg ?? 'Aucun plan MiniMax actif';
      return entry;
    }
    const models = Array.isArray(payload?.model_remains) ? payload.model_remains : [];
    const model = models[0];
    if (!model) {
      entry.status = 'unavailable';
      entry.reason = 'Aucun quota MiniMax renvoyé';
      return entry;
    }
    if (typeof model.model === 'string') entry.plan = model.model;
    const pairs = [
      ['Intervalle', model.current_interval_usage_count, model.current_interval_total_count, model.end_time],
      ['Semaine', model.current_weekly_usage_count, model.current_weekly_total_count, model.weekly_end_time],
    ];
    for (const [label, used, total, resetsAt] of pairs) {
      if (typeof used !== 'number' || typeof total !== 'number' || total <= 0) continue;
      entry.windows.push({ label, usedPct: pct((used / total) * 100), resetsAt: toIso(resetsAt) });
    }
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune fenêtre reconnue dans la réponse MiniMax';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}





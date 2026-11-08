/**
 * Host half of the model-quota-panel bundle.
 *
 * Publishes `quotas.json` next to this file. The client half reads that file
 * through the built-in `api/file` route, because the desktop shell forwards
 * requests to a plugin's own web routes but never delivers their responses.
 *
 * Provider instances are discovered from the profile's `llm-pi-ai` provider
 * map, so any number of accounts works: two OpenCode Go subscriptions, a custom
 * Anthropic account, and so on are each reported separately.
 *
 * Every number comes from the vendor's own usage endpoint. A provider with no
 * quota API, or one that is not connected, is not published at all.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUEST_TIMEOUT_MS = 12_000;
const PUBLISH_INTERVAL_MS = 20_000;
const QUOTAS_PATH = new URL('./quotas.json', import.meta.url);

const OPENCODE_AUTH = () => join(homedir(), '.local', 'share', 'opencode', 'auth.json');
const DSH_CREDENTIALS = () =>
  process.env.DSH_HOME && process.env.DSH_HOME !== ''
    ? join(process.env.DSH_HOME, '.credentials.yaml')
    : join(homedir(), '.dsh', '.credentials.yaml');
const PROFILE_PATCH = () =>
  process.env.DSH_HOME &&
  process.env.DSH_PROFILE &&
  process.env.DSH_HOME !== '' &&
  process.env.DSH_PROFILE !== ''
    ? join(process.env.DSH_HOME, 'profiles', process.env.DSH_PROFILE, 'cordis.patch.yml')
    : null;

export function apply(ctx) {
  const agentDefaultModel = ctx.get('agentDefaultModel');

  const publish = async () => {
    try {
      const value = await collect(ctx, agentDefaultModel);
      await writeFile(QUOTAS_PATH, JSON.stringify(value), 'utf8');
    } catch (error) {
      console.warn('[model-quota-panel] could not publish quotas.json:', error?.message);
    }
  };

  void seedReadings().then(publish);
  const timer = setInterval(() => void publish(), PUBLISH_INTERVAL_MS);
  ctx.effect(() => () => clearInterval(timer), 'model-quota-panel: publisher');
}

/* ── provider discovery ───────────────────────────────────────────────── */

/** `llm-pi-ai` provider map: id -> { apiKeyEnv, baseURL, displayName, api }. */
async function providerInstances(ctx) {
  const fromEditor = providersFromConfigEditor(ctx);
  if (fromEditor !== null) return fromEditor;
  return providersFromPatch();
}

function providersFromConfigEditor(ctx) {
  try {
    const editor = ctx.get('configEditor');
    if (!editor || typeof editor.configuration !== 'function') return null;
    const rows = editor.configuration();
    if (!Array.isArray(rows)) return null;
    let providers = null;
    for (const row of rows) {
      const entry = row?.entry ?? {};
      const name = entry?.options?.name ?? entry?.name ?? row?.name ?? '';
      if (name !== '@deepseek-ai/dsh-llm-pi-ai') continue;
      const merged = {
        ...(row?.inherited?.providers ?? {}),
        ...(entry?.options?.config?.providers ?? {}),
        ...(row?.override?.providers ?? {}),
        ...(entry?.config?.providers ?? {}),
      };
      providers = { ...(providers ?? {}), ...merged };
    }
    return providers;
  } catch {
    return null;
  }
}

/**
 * Fallback for builds where `configEditor` is absent: a small reader for the
 * `providers:` block of the active profile patch (two-level map, ignoring the
 * nested `models:` lists).
 */
async function providersFromPatch() {
  const file = PROFILE_PATCH();
  if (!file) return {};
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return {};
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /name:\s*'@deepseek-ai\/dsh-llm-pi-ai'/.test(line));
  if (start < 0) return {};
  const providers = {};
  let current = null;
  let inProviders = false;
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^-\s/.test(line) || /^[A-Za-z]/.test(line)) break; // next top-level entry
    if (/^\s{0,4}providers:\s*$/.test(line)) {
      inProviders = true;
      continue;
    }
    if (!inProviders) continue;
    const header = line.match(/^\s{6}([A-Za-z0-9_.-]+):\s*$/);
    if (header) {
      current = header[1];
      providers[current] = {};
      continue;
    }
    if (current === null) continue;
    const field = line.match(/^\s{8,}(apiKeyEnv|baseURL|displayName|api):\s*(.+?)\s*$/);
    if (field) {
      let value = field[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      providers[current][field[1]] = value;
    }
  }
  return providers;
}

function kindOfProvider(id, config) {
  const hay = `${id} ${config?.displayName ?? ''} ${config?.baseURL ?? ''}`.toLowerCase();
  if (hay.includes('opencode')) return 'opencode-go';
  if (hay.includes('anthropic') || hay.includes('claude')) return 'anthropic';
  if (hay.includes('codex')) return 'openai-codex';
  if (hay.includes('minimax')) return 'minimax';
  if (hay.includes('zai') || hay.includes('z.ai') || hay.includes('glm')) return 'zai';
  if (hay.includes('copilot')) return 'github-copilot';
  if (hay.includes('openrouter')) return 'openrouter';
  if (hay.includes('moonshot') || hay.includes('kimi')) return 'moonshot';
  if (config?.api === 'anthropic-messages') return 'anthropic';
  return null;
}

const KIND_LABEL = {
  'opencode-go': 'OpenCode Go',
  anthropic: 'Claude',
  'openai-codex': 'Codex (ChatGPT)',
  minimax: 'MiniMax',
  zai: 'Z.ai (GLM)',
  'github-copilot': 'GitHub Copilot',
  openrouter: 'OpenRouter',
  moonshot: 'Moonshot / Kimi',
};

/** Provider id used by the quota payload for a model-provider id. */
function kindOfModelProvider(provider) {
  if (typeof provider !== 'string') return null;
  if (provider.includes('opencode')) return 'opencode-go';
  if (provider.includes('claude') || provider.includes('anthropic')) return 'anthropic';
  if (provider.includes('codex')) return 'openai-codex';
  if (provider.includes('minimax')) return 'minimax';
  if (provider.includes('zai') || provider.includes('z.ai') || provider.includes('glm')) return 'zai';
  if (provider.includes('copilot')) return 'github-copilot';
  if (provider.includes('openrouter')) return 'openrouter';
  if (provider.includes('moonshot') || provider.includes('kimi')) return 'moonshot';
  return provider;
}

/* ── collection ───────────────────────────────────────────────────────── */

async function collect(ctx, agentDefaultModel) {
  const [refs, opencodeStore, configured] = await Promise.all([
    dshRefs(),
    opencodeAuth(),
    providerInstances(ctx),
  ]);
  const active = readActiveSelection(agentDefaultModel);
  const activeKind = kindOfModelProvider(active.provider);

  const instances = Object.entries(configured)
    .map(([id, config]) => ({ id, config: config ?? {}, kind: kindOfProvider(id, config ?? {}) }))
    .filter((instance) => instance.kind !== null);

  // Labels stay readable when several accounts share a provider.
  const countByKind = {};
  for (const instance of instances) countByKind[instance.kind] = (countByKind[instance.kind] ?? 0) + 1;
  for (const instance of instances) {
    const base = instance.config.displayName || KIND_LABEL[instance.kind] || instance.id;
    instance.label = countByKind[instance.kind] > 1 ? `${base}` : base;
  }

  const entries = [];
  for (const instance of instances) {
    const exact = active.provider === instance.id;
    const entry = await describeInstance(instance, { refs, opencodeStore, exact, activeKind });
    if (entry) entries.push(entry);
  }

  // Credentials that live in the vendor CLI rather than the profile.
  if (!instances.some((instance) => instance.kind === 'openai-codex')) {
    const entry = await codexCliQuota(active, activeKind);
    if (entry) entries.push(entry);
  }
  if (!instances.some((instance) => instance.kind === 'anthropic')) {
    const entry = await claudeCliQuota(active, activeKind);
    if (entry) entries.push(entry);
  }

  // Only providers that can actually report a quota are published, and while at
  // least one works the transient failures stay out of the panel. When nothing
  // works, the failures are published so the panel can say why it is empty.
  const okEntries = entries.filter((entry) => entry.status === 'ok');
  const visible = okEntries.length > 0 ? okEntries : entries.filter((entry) => entry.status === 'error');
  visible.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return {
    ok: okEntries.length > 0,
    generatedAt: new Date().toISOString(),
    active,
    providers: visible,
  };
}

/** Last successful reading per provider instance, so a flaky vendor endpoint
 *  does not make the card disappear. */
const goodReadings = new Map();

/** Restores the previous snapshot so cards survive a restart before any vendor
 *  answers (Anthropic in particular rate-limits its usage endpoint). */
async function seedReadings() {
  const previous = await readJsonFile(fileURLToPath(QUOTAS_PATH));
  const providers = Array.isArray(previous?.providers) ? previous.providers : [];
  for (const provider of providers) {
    if (!provider || typeof provider.id !== 'string' || !Array.isArray(provider.windows)) continue;
    if (provider.windows.length === 0) continue;
    const at = typeof provider.updatedAt === 'string' ? Date.parse(provider.updatedAt) : Date.now();
    const updatedAt = typeof provider.updatedAt === 'string' ? provider.updatedAt : new Date().toISOString();
    goodReadings.set(provider.id, {
      at: Number.isNaN(at) ? Date.now() : at,
      updatedAt,
      entry: cloneEntry(provider),
    });
  }
}
/** Anthropic rate-limits its usage endpoint hard: refresh it less often. */
const ANTHROPIC_REFRESH_MS = 4 * 60_000;
/** Keep showing a stale reading for this long before dropping the card. */
const STALE_MAX_MS = 20 * 60_000;

function adapterFor(kind) {
  if (kind === 'opencode-go') return opencodeQuota;
  if (kind === 'anthropic') return anthropicQuota;
  if (kind === 'openrouter') return openrouterQuota;
  if (kind === 'zai') return zaiQuota;
  if (kind === 'github-copilot') return copilotQuota;
  if (kind === 'moonshot') return moonshotQuota;
  if (kind === 'minimax') return minimaxQuota;
  if (kind === 'openai-codex') return codexConfiguredQuota;
  return null;
}

function cloneEntry(entry) {
  return { ...entry, windows: entry.windows.map((window) => ({ ...window })) };
}

/** Re-applies the live `active` flag and records where the values came from. */
function finalizeEntry(entry, state, updatedAt, stale) {
  return {
    ...entry,
    windows: entry.windows.map((window) => ({ ...window })),
    active: state.exact === true || entry.kind === state.activeKind,
    stale: stale === true,
    updatedAt: updatedAt ?? null,
  };
}

async function describeInstance(instance, state) {
  const adapter = adapterFor(instance.kind);
  if (!adapter) return null;

  const cached = goodReadings.get(instance.id);
  const refreshMs = instance.kind === 'anthropic' ? ANTHROPIC_REFRESH_MS : 0;
  if (cached && refreshMs > 0 && Date.now() - cached.at < refreshMs) {
    return finalizeEntry(cached.entry, state, cached.updatedAt, true);
  }

  let entry = null;
  try {
    entry = await adapter(instance, state);
  } catch (error) {
    entry = null;
  }

  if (entry && entry.status === 'ok') {
    const updatedAt = new Date().toISOString();
    goodReadings.set(instance.id, { at: Date.now(), updatedAt, entry: cloneEntry(entry) });
    return finalizeEntry(entry, state, updatedAt, false);
  }

  // The vendor failed: keep the last good reading instead of hiding the card.
  if (cached && Date.now() - cached.at < STALE_MAX_MS) {
    return finalizeEntry(cached.entry, state, cached.updatedAt, true);
  }
  return entry ? finalizeEntry(entry, state, null, false) : null;
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

function entryBase(instance, state) {
  return {
    id: instance.id,
    kind: instance.kind,
    provider: instance.id,
    label: instance.label,
    plan: null,
    windows: [],
    active: state.exact === true || instance.kind === state.activeKind,
    status: 'ok',
    reason: null,
  };
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

/** Window label from the vendor's own window length (18000 s -> "Fenêtre 5 h"). */
function windowLabel(seconds, fallback) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return fallback;
  if (seconds >= 7 * 86400) return 'Semaine';
  if (seconds >= 86400) return `Fenêtre ${Math.round(seconds / 86400)} j`;
  if (seconds >= 3600) return `Fenêtre ${Math.round(seconds / 3600)} h`;
  return `Fenêtre ${Math.round(seconds / 60)} min`;
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

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/* ── credentials ──────────────────────────────────────────────────────── */

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

function credentialFor(instance, state) {
  const env = instance.config?.apiKeyEnv;
  if (env) {
    if (typeof state.refs[env] === 'string' && state.refs[env] !== '') return state.refs[env];
    if (typeof process.env[env] === 'string' && process.env[env] !== '') return process.env[env];
  }
  const store = state.opencodeStore ?? {};
  return store[instance.id]?.key ?? store[instance.kind]?.key ?? null;
}

/* ── adapters ─────────────────────────────────────────────────────────── */

async function opencodeQuota(instance, state) {
  const entry = entryBase(instance, state);
  const key = credentialFor(instance, state);
  if (!key) return null;
  entry.plan = 'Go';
  try {
    const payload = await getJson('https://opencode.ai/inference/go/v1/usage', {
      authorization: `Bearer ${key}`,
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    });
    const usage = payload?.usage ?? {};
    for (const [key2, label] of [
      ['rolling', 'Fenêtre glissante'],
      ['weekly', 'Semaine'],
      ['monthly', 'Mois'],
    ]) {
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

async function anthropicQuota(instance, state) {
  const entry = entryBase(instance, state);
  let key = credentialFor(instance, state);
  const oauth = state.opencodeStore?.anthropic?.key ?? state.opencodeStore?.claude?.key ?? null;
  if (!key) key = oauth;
  if (!key) return null;
  try {
    // An OAuth access token answers the subscription-usage endpoint; a plain API
    // key has no quota API at all.
    if (!key.startsWith('sk-ant-oat')) {
      if (!key.startsWith('sk-ant-')) throw new Error('clé API : pas d’API de quota');
      entry.status = 'unavailable';
      entry.reason = 'Clé API Anthropic : pas d’API de quota';
      return entry;
    }
    const usage = await getJson('https://api.anthropic.com/api/oauth/usage', {
      authorization: `Bearer ${key}`,
      'anthropic-beta': 'oauth-2025-04-20',
    });
    for (const [key2, label] of [['five_hour', 'Fenêtre 5 h'], ['seven_day', 'Semaine']]) {
      const window = usage?.[key2];
      if (!window || typeof window.utilization !== 'number') continue;
      entry.windows.push({ label, usedPct: pct(window.utilization), resetsAt: toIso(window.resets_at) });
    }
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune fenêtre renvoyée par Anthropic';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

async function codexConfiguredQuota(instance, state) {
  const entry = entryBase(instance, state);
  const auth = await readJsonFile(join(homedir(), '.codex', 'auth.json'));
  const token = auth?.tokens?.access_token;
  if (typeof token !== 'string' || token === '') {
    return Object.assign(entry, { status: 'unavailable', reason: 'Connexion Codex absente (lance `codex login`)' });
  }
  return codexUsage(entry, auth, token);
}

async function codexCliQuota(active, activeKind) {
  const auth = await readJsonFile(join(homedir(), '.codex', 'auth.json'));
  const token = auth?.tokens?.access_token;
  if (typeof token !== 'string' || token === '') return null;
  const entry = {
    id: 'openai-codex',
    kind: 'openai-codex',
    provider: 'openai-codex',
    label: KIND_LABEL['openai-codex'],
    plan: null,
    windows: [],
    active: active.provider === 'openai-codex' || activeKind === 'openai-codex',
    status: 'ok',
    reason: null,
  };
  return codexUsage(entry, auth, token);
}

async function codexUsage(entry, auth, token) {
  try {
    const headers = { authorization: `Bearer ${token}` };
    if (typeof auth?.tokens?.account_id === 'string') headers['chatgpt-account-id'] = auth.tokens.account_id;
    const usage = await getJson('https://chatgpt.com/backend-api/wham/usage', headers);
    const limit = usage?.rate_limit;
    for (const [key, fallback] of [['primary_window', 'Fenêtre courte'], ['secondary_window', 'Semaine']]) {
      const window = limit?.[key];
      if (!window || typeof window.used_percent !== 'number') continue;
      entry.windows.push({
        label: windowLabel(window.limit_window_seconds, fallback),
        // The API field is the consumed percentage, so the bar grows with use.
        usedPct: pct(window.used_percent),
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

async function claudeCliQuota(active, activeKind) {
  const credentials = await readJsonFile(join(homedir(), '.claude', '.credentials.json'));
  const oauth = credentials?.claudeAiOauth;
  if (typeof oauth?.accessToken !== 'string' || oauth.accessToken === '') return null;
  const entry = {
    id: 'claude',
    kind: 'anthropic',
    provider: 'claude',
    label: 'Claude Code',
    plan: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
    windows: [],
    active: active.provider === 'claude' || activeKind === 'anthropic',
    status: 'ok',
    reason: null,
  };
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
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucune fenêtre renvoyée par Anthropic';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

async function openrouterQuota(instance, state) {
  const key = credentialFor(instance, state);
  if (!key) return null;
  const entry = entryBase(instance, state);
  try {
    const payload = await getJson('https://openrouter.ai/api/v1/key', { authorization: `Bearer ${key}` });
    const data = payload?.data ?? {};
    const limit = typeof data.limit === 'number' ? data.limit : null;
    const usage = typeof data.usage === 'number' ? data.usage : null;
    if (limit !== null && limit > 0 && usage !== null) {
      entry.windows.push({ label: 'Crédit', usedPct: pct((usage / limit) * 100), resetsAt: null });
    }
    if (entry.windows.length === 0) {
      entry.status = 'unavailable';
      entry.reason = 'Aucun plafond de crédit sur cette clé OpenRouter';
    }
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

async function zaiQuota(instance, state) {
  const key = credentialFor(instance, state);
  if (!key) return null;
  const entry = entryBase(instance, state);
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

async function copilotQuota(instance, state) {
  const token = credentialFor(instance, state);
  if (!token) return null;
  const entry = entryBase(instance, state);
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
      if (!snapshot || typeof snapshot.percent_remaining !== 'number') continue;
      entry.windows.push({ label, usedPct: pct(100 - snapshot.percent_remaining), resetsAt: toIso(snapshot.quota_reset_at) });
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

async function moonshotQuota(instance, state) {
  const key = credentialFor(instance, state);
  if (!key) return null;
  const entry = entryBase(instance, state);
  try {
    const payload = await getJson('https://api.moonshot.cn/v1/users/me/balance', {
      authorization: `Bearer ${key}`,
    });
    const balance = payload?.data?.available_balance;
    if (typeof balance !== 'number') {
      entry.status = 'unavailable';
      entry.reason = 'Aucun solde renvoyé par Moonshot';
      return entry;
    }
    entry.status = 'unavailable';
    entry.reason = `Solde : ¥${balance.toFixed(2)}`;
    return entry;
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

async function minimaxQuota(instance, state) {
  const key = credentialFor(instance, state);
  if (!key) return null;
  const entry = entryBase(instance, state);
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
    for (const [label, used, total, resetsAt] of [
      ['Intervalle', model.current_interval_usage_count, model.current_interval_total_count, model.end_time],
      ['Semaine', model.current_weekly_usage_count, model.current_weekly_total_count, model.weekly_end_time],
    ]) {
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

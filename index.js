/**
 * Host half of the model-quota-panel bundle.
 *
 * Publishes `quotas.json` next to this file. The client half reads it through
 * DSH's built-in `api/file` route, whose absolute path the Host also injects
 * into the page at boot, so an install needs no hand-edited constant on any OS.
 *
 * Provider instances are discovered from the profile's `llm-pi-ai` provider
 * map, so any number of accounts works: two OpenCode Go subscriptions, a custom
 * Anthropic account, and so on are each reported separately.
 *
 * Every number comes from the vendor's own usage endpoint. A provider with no
 * quota API, or one that is not connected, is not published at all.
 */

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import zlib from 'node:zlib';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseProvidersPatch, parseRefs } from './lib/config.js';
import { MESSAGES } from './lib/i18n.js';
import { PRICES, currencyForLocale, SUPPORTED_CURRENCIES } from './lib/prices.js';
import { foldSessionCost } from './lib/session-cost.js';
import { pct, toIso, windowLabel } from './lib/format.js';
import {
  mapAnthropicUsage,
  mapCodexUsage,
  mapCopilotUser,
  mapMinimaxRemains,
  mapMoonshotBalance,
  mapOpencodeUsage,
  mapOpenrouterKey,
  mapZaiLimit,
} from './lib/map.js';
import { KIND_LABEL, kindOfModelProvider, kindOfProvider, labelInstances } from './lib/providers.js';

const REQUEST_TIMEOUT_MS = 12_000;
const PUBLISH_INTERVAL_MS = 20_000;
const QUOTAS_PATH = new URL('./quotas.json', import.meta.url);
const ASSET_PATH = new URL('./assets/quotas.svg', import.meta.url);

const DSH_CREDENTIALS = () =>
  process.env.DSH_HOME && process.env.DSH_HOME !== ''
    ? join(process.env.DSH_HOME, '.credentials.yaml')
    : join(homedir(), '.dsh', '.credentials.yaml');
const PROFILE_PATCH = () =>
  process.env.DSH_HOME && process.env.DSH_PROFILE && process.env.DSH_HOME !== '' && process.env.DSH_PROFILE !== ''
    ? join(process.env.DSH_HOME, 'profiles', process.env.DSH_PROFILE, 'cordis.patch.yml')
    : null;

/** OpenCode stores its CLI credentials in a per-OS data directory. */
const OPENCODE_AUTH_CANDIDATES = () => {
  const candidates = [];
  if (process.env.XDG_DATA_HOME) candidates.push(join(process.env.XDG_DATA_HOME, 'opencode', 'auth.json'));
  candidates.push(join(homedir(), '.local', 'share', 'opencode', 'auth.json'));
  candidates.push(join(homedir(), 'Library', 'Application Support', 'opencode', 'auth.json'));
  return candidates;
};

/** Last successful reading per provider instance, so a flaky vendor endpoint
 *  does not make the card disappear. */
const goodReadings = new Map();
/** Anthropic rate-limits its usage endpoint hard: refresh it less often. */
const ANTHROPIC_REFRESH_MS = 4 * 60_000;
/** Keep showing a stale reading for this long before dropping the card. */
const STALE_MAX_MS = 20 * 60_000;

export const inject = ['webServer'];

/** Locale the user's machine reports, independent of the app bundle. */
function osLocale() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof locale === 'string' && locale !== '') return locale;
  } catch {
    // fall through
  }
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  const match = /^([a-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})?)/.exec(env);
  return match ? match[1].replace('_', '-') : 'en-US';
}

/**
 * Locale and currency the panel should use: explicit plugin config first, then
 * the operating system's locale, then the currency that locale implies.
 */
function displayPreferences(config) {
  const requestedLocale = typeof config?.locale === 'string' && config.locale !== '' ? config.locale : osLocale();
  const implied = currencyForLocale(requestedLocale);
  const requestedCurrency =
    typeof config?.currency === 'string' && SUPPORTED_CURRENCIES.includes(config.currency.toUpperCase())
      ? config.currency.toUpperCase()
      : implied;
  return { locale: requestedLocale, currency: requestedCurrency, source: typeof config?.locale === 'string' ? 'config' : 'os' };
}

export function apply(ctx, config) {
  const preferences = displayPreferences(config);
  const agentDefaultModel = ctx.get('agentDefaultModel');
  const webServer = ctx.get('webServer');
  const snapshotPath = fileURLToPath(QUOTAS_PATH);

  // Hand the browser half its own absolute snapshot path, so a fresh install on
  // any OS needs no hand-edited constant.
  if (webServer && typeof webServer.tapIndex === 'function') {
    ctx.effect(
      () =>
        webServer.tapIndex((html) => {
          try {
            const payload = JSON.stringify({ path: snapshotPath }).replace(/</g, '\\u003c');
            const script = `<script>window.__MODEL_QUOTA_PANEL__=${payload}</script>`;
            return typeof html === 'string' && html.includes('</head>')
              ? html.replace('</head>', `${script}</head>`)
              : `${script}${String(html ?? '')}`;
          } catch {
            return html;
          }
        }),
      'model-quota-panel: index snapshot path',
    );
  }

  // The supported way for a plugin to answer the page: a connection-level Fetch
  // route, served through the same bridge as the built-in `/api/file`, so the
  // desktop shell delivers its response (a plain webServer route does not).
  const connection = ctx.get('connection');
  if (connection && connection.fetch && typeof connection.fetch.register === 'function') {
    ctx.effect(() => {
      try {
        return connection.fetch.register({
          path: '/api/model-quota',
          methods: ['GET'],
          fetch: async () => {
            const value = await collect(ctx, agentDefaultModel, preferences);
            return new Response(JSON.stringify(value), {
              headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
            });
          },
        });
      } catch (error) {
        console.warn('[model-quota-panel] quota route already registered:', error?.message);
        return () => {};
      }
    }, 'model-quota-panel: quota fetch route');
  }

  const publish = async () => {
    try {
      const value = await collect(ctx, agentDefaultModel);
      const serialised = JSON.stringify(value);
      await writeFile(QUOTAS_PATH, serialised, 'utf8');
      // Also publish through the plugin-asset route: a plain relative URL the
      // page can fetch without knowing any filesystem path. The route only
      // serves image extensions, hence the .svg name.
      // `assets/` is git-ignored, so a fresh clone does not have it: create it,
      // otherwise the plugin-asset route answers 404 and the panel shows
      // "Quota data unavailable".
      await mkdir(new URL('./assets/', import.meta.url), { recursive: true })
        .then(() => writeFile(ASSET_PATH, serialised, 'utf8'))
        .catch((error) => console.warn('[model-quota-panel] could not publish the asset snapshot:', error?.message));
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

async function providersFromPatch() {
  const file = PROFILE_PATCH();
  if (!file) return {};
  try {
    return parseProvidersPatch(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

/* ── session cost + currency ──────────────────────────────────────────── */

const SESSIONS_DIR = () =>
  join(process.env.DSH_HOME && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh'), 'sessions');

let sessionCache = { path: null, key: '', value: null };

/**
 * Decode a session log that grows by appending whole zstd frames.
 *
 * `zstdDecompressSync` stops after the first frame on some runtimes, which
 * would hide every event written after the session started. Split at the frame
 * magic, decode each frame, and keep whichever reading yields the most text.
 */
function decodeSessionLog(buffer) {
  let whole = null;
  try {
    whole = zlib.zstdDecompressSync(buffer).toString('utf8');
  } catch {
    whole = null;
  }

  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const offsets = [];
  for (let index = buffer.indexOf(magic); index !== -1; index = buffer.indexOf(magic, index + 4)) {
    offsets.push(index);
  }

  if (offsets.length > 1) {
    const parts = [];
    for (let index = 0; index < offsets.length; index++) {
      const slice = buffer.subarray(offsets[index], index + 1 < offsets.length ? offsets[index + 1] : buffer.length);
      try {
        parts.push(zlib.zstdDecompressSync(slice).toString('utf8'));
      } catch {
        // an interior magic byte splits a frame: fall back to the whole decode
        parts.length = 0;
        break;
      }
    }
    const joined = parts.join('');
    if (whole === null || joined.length > whole.length) return joined;
  }

  return whole ?? '';
}

/** Newest `session.v4.jsonl.zstd` files under the session store, newest first. */
async function newestSessionFiles() {
  const found = [];
  const walk = async (directory, depth) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0) await walk(absolute, depth - 1);
        continue;
      }
      if (!entry.name.endsWith('.jsonl.zstd')) continue;
      try {
        const info = await stat(absolute);
        found.push({ path: absolute, mtimeMs: info.mtimeMs, size: info.size });
      } catch {
        // unreadable entry
      }
    }
  };
  await walk(SESSIONS_DIR(), 2);
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, 4);
}

/**
 * Cost of the most recently active session, folded per model. Reads the durable
 * log the harness already writes; nothing leaves the machine.
 */
async function readSessionCost() {
  const files = await newestSessionFiles();
  if (files.length === 0) return null;
  if (typeof zlib.zstdDecompressSync !== 'function') return null; // Node without zstd

  for (const file of files) {
    const key = `${file.mtimeMs}:${file.size}`;
    if (sessionCache.path === file.path && sessionCache.key === key) return sessionCache.value;
    try {
      const text = decodeSessionLog(await readFile(file.path));
      const events = [];
      for (const line of text.split('\n')) {
        if (line === '') continue;
        try {
          events.push(JSON.parse(line));
        } catch {
          // a torn trailing line is ignored
        }
      }
      const folded = foldSessionCost(events, PRICES);
      if (folded.models.length === 0) continue; // a fresh or empty session
      const value = {
        id: file.path.split(/[\\/]/).slice(-2, -1)[0] ?? null,
        updatedAt: new Date(file.mtimeMs).toISOString(),
        ...folded,
      };
      sessionCache = { path: file.path, key, value };
      return value;
    } catch (error) {
      console.warn('[model-quota-panel] could not read the session log:', error?.message);
    }
  }
  return null;
}

let fxCache = { at: 0, rates: null };

/** USD conversion rates (ECB reference rates), refreshed every six hours. */
async function fxRates() {
  const sixHours = 6 * 60 * 60 * 1000;
  if (fxCache.rates !== null && Date.now() - fxCache.at < sixHours) return fxCache.rates;
  try {
    const payload = await getJson('https://api.frankfurter.app/latest?from=USD', { accept: 'application/json' });
    fxCache = { at: Date.now(), rates: payload?.rates ?? null };
  } catch {
    fxCache = { at: Date.now(), rates: fxCache.rates };
  }
  return fxCache.rates;
}

/* ── collection ───────────────────────────────────────────────────────── */

async function collect(ctx, agentDefaultModel, preferences = displayPreferences(null)) {
  const [refs, opencodeStore, configured] = await Promise.all([
    dshRefs(),
    opencodeAuth(),
    providerInstances(ctx),
  ]);
  const active = readActiveSelection(agentDefaultModel);
  const activeKind = kindOfModelProvider(active.provider);

  const instances = labelInstances(
    Object.entries(configured)
      .map(([id, config]) => ({ id, config: config ?? {}, kind: kindOfProvider(id, config ?? {}) }))
      .filter((instance) => instance.kind !== null),
  );

  const state = { refs, opencodeStore, exact: false, activeKind };
  const entries = [];
  for (const instance of instances) {
    const entry = await describeInstance(instance, { ...state, exact: active.provider === instance.id });
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

  const [session, rates] = await Promise.all([readSessionCost(), fxRates()]);
  return {
    ok: okEntries.length > 0,
    generatedAt: new Date().toISOString(),
    active,
    providers: visible,
    messages: MESSAGES,
    locale: preferences.locale,
    currency: preferences.currency,
    localeSource: preferences.source,
    prices: PRICES,
    fx: { base: 'USD', rates, at: new Date(fxCache.at).toISOString() },
    session,
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

/* ── per-instance cache ───────────────────────────────────────────────── */

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
  return { ...entry, windows: (entry.windows ?? []).map((window) => ({ ...window })) };
}

/** Re-applies the live `active` flag and records where the values came from. */
function finalizeEntry(entry, state, updatedAt, stale) {
  return {
    ...entry,
    windows: (entry.windows ?? []).map((window) => ({ ...window })),
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
  } catch {
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

/* ── entries ──────────────────────────────────────────────────────────── */

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

function cliEntry(id, kind, label, active, activeKind, plan = null) {
  return {
    id,
    kind,
    provider: id,
    label,
    plan,
    windows: [],
    active: active.provider === id || activeKind === kind,
    status: 'ok',
    reason: null,
  };
}

function applyMapping(entry, mapping) {
  if (Array.isArray(mapping?.windows)) entry.windows = mapping.windows;
  if (mapping?.plan !== undefined) entry.plan = mapping.plan;
  if (mapping?.reason) {
    entry.status = 'unavailable';
    entry.reason = mapping.reason;
  }
  if (entry.windows.length === 0 && entry.status === 'ok') {
    entry.status = 'unavailable';
    entry.reason = entry.reason ?? 'Aucune fenêtre renvoyée par le fournisseur';
  }
  return entry;
}

/* ── credentials ──────────────────────────────────────────────────────── */

async function dshRefs() {
  try {
    return parseRefs(await readFile(DSH_CREDENTIALS(), 'utf8'));
  } catch {
    return {};
  }
}

async function opencodeAuth() {
  for (const candidate of OPENCODE_AUTH_CANDIDATES()) {
    const value = await readJsonFile(candidate);
    if (value && typeof value === 'object') return value;
  }
  return {};
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

/* ── http + files ─────────────────────────────────────────────────────── */

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

/* ── adapters ─────────────────────────────────────────────────────────── */

async function opencodeQuota(instance, state) {
  const key = credentialFor(instance, state);
  if (!key) return null;
  const entry = entryBase(instance, state);
  try {
    const payload = await getJson('https://opencode.ai/inference/go/v1/usage', {
      authorization: `Bearer ${key}`,
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    });
    return applyMapping(entry, mapOpencodeUsage(payload));
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

async function anthropicQuota(instance, state) {
  const key = credentialFor(instance, state) ?? state.opencodeStore?.anthropic?.key ?? null;
  if (!key) return null;
  const entry = entryBase(instance, state);
  try {
    if (!key.startsWith('sk-ant-oat')) {
      // A plain API key has no quota endpoint.
      return Object.assign(entry, { status: 'unavailable', reason: 'Clé API Anthropic : pas d’API de quota' });
    }
    const payload = await getJson('https://api.anthropic.com/api/oauth/usage', {
      authorization: `Bearer ${key}`,
      'anthropic-beta': 'oauth-2025-04-20',
    });
    return applyMapping(entry, mapAnthropicUsage(payload));
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
  return codexUsage(cliEntry('openai-codex', 'openai-codex', KIND_LABEL['openai-codex'], active, activeKind), auth, token);
}

async function codexUsage(entry, auth, token) {
  try {
    const headers = { authorization: `Bearer ${token}` };
    if (typeof auth?.tokens?.account_id === 'string') headers['chatgpt-account-id'] = auth.tokens.account_id;
    const payload = await getJson('https://chatgpt.com/backend-api/wham/usage', headers);
    return applyMapping(entry, mapCodexUsage(payload));
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

async function claudeCliQuota(active, activeKind) {
  const credentials = await readJsonFile(join(homedir(), '.claude', '.credentials.json'));
  const oauth = credentials?.claudeAiOauth;
  if (typeof oauth?.accessToken !== 'string' || oauth.accessToken === '') return null;
  const entry = cliEntry(
    'claude',
    'anthropic',
    'Claude Code',
    active,
    activeKind,
    typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
  );
  try {
    const payload = await getJson('https://api.anthropic.com/api/oauth/usage', {
      authorization: `Bearer ${oauth.accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
    });
    return applyMapping(entry, mapAnthropicUsage(payload));
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
    return applyMapping(entry, mapOpenrouterKey(payload));
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
    return applyMapping(entry, mapZaiLimit(payload));
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
    const payload = await getJson('https://api.github.com/copilot_internal/user', {
      authorization: `Bearer ${copilotToken}`,
      accept: 'application/json',
      'user-agent': 'GitHubCopilotChat/0.26.7',
    });
    return applyMapping(entry, mapCopilotUser(payload));
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
    return applyMapping(entry, mapMoonshotBalance(payload));
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
    return applyMapping(entry, mapMinimaxRemains(payload));
  } catch (error) {
    return Object.assign(entry, { status: 'error', reason: error.message });
  }
}

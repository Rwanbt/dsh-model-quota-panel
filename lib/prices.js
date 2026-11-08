/**
 * Token pricing and money formatting.
 *
 * Prices are USD per **one million tokens**, taken from the public price lists
 * of each vendor. They are a best-effort snapshot shipped with the bundle: edit
 * `PRICES` when a vendor changes its rates, or override a model through the
 * `priceOverride` plugin config.
 *
 * Pure functions: no I/O, no Node imports.
 */

/** USD per 1M tokens: [input, output, cacheRead, cacheWrite]. */
export const PRICES = {
  'opencode-go': {
    'deepseek-v4.1-flash': { input: 0.15, output: 0.6, cacheRead: 0.015, cacheWrite: 0.15 },
    'deepseek-v4-pro': { input: 0.6, output: 2.4, cacheRead: 0.06, cacheWrite: 0.6 },
    'glm-5.2': { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
    'glm-5.3': { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
    'grok-4.7': { input: 2, output: 6, cacheRead: 0.2, cacheWrite: 2 },
    'qwen3.8-flash': { input: 0.15, output: 0.47, cacheRead: 0.016, cacheWrite: 0.2 },
    'qwen3.8-max': { input: 2, output: 6, cacheRead: 0.25, cacheWrite: 2.5 },
    'minimax-m3': { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
  anthropic: {
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  },
  'openai-codex': {
    'gpt-6': { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
    'gpt-6-mini': { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
  },
  openrouter: {},
  minimax: {},
};

/** Currency symbols are rendered by `Intl`, never by this table. */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'CAD', 'JPY', 'CNY', 'AUD', 'INR', 'BRL'];

/** Region subtag -> default currency, used when the user has no explicit choice. */
const REGION_CURRENCY = {
  US: 'USD',
  GB: 'GBP',
  CH: 'CHF',
  CA: 'CAD',
  JP: 'JPY',
  CN: 'CNY',
  AU: 'AUD',
  IN: 'INR',
  BR: 'BRL',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  PT: 'EUR',
  AT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
};

/**
 * Pick a display currency from a BCP 47 locale (`fr-FR` -> EUR), defaulting to
 * USD when the region is unknown.
 * @param {string|undefined} locale
 * @returns {string} ISO 4217 code.
 */
export function currencyForLocale(locale) {
  if (typeof locale !== 'string') return 'USD';
  const region = locale.split(/[-_]/)[1];
  if (!region) return 'USD';
  return REGION_CURRENCY[region.toUpperCase()] ?? 'USD';
}

/**
 * Price of one model, or null when the model is unknown.
 * @param {string} provider
 * @param {string} model
 * @param {Record<string, Record<string, Object>>} [table]
 */
export function priceOf(provider, model, table = PRICES) {
  const byModel = table?.[provider];
  if (!byModel || typeof model !== 'string') return null;
  if (byModel[model]) return byModel[model];
  // Tolerate vendor-prefixed ids such as `anthropic/claude-sonnet-4-6`.
  const last = model.split('/').pop();
  return byModel[last] ?? null;
}

/**
 * Cost in USD of one token bucket.
 * @param {{uncachedInputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number}} usage
 * @param {{input: number, output: number, cacheRead: number, cacheWrite: number}} price
 * @returns {number} USD.
 */
export function costOf(usage, price) {
  if (!price) return 0;
  const million = 1_000_000;
  return (
    ((usage?.uncachedInputTokens ?? 0) * price.input) / million +
    ((usage?.outputTokens ?? 0) * price.output) / million +
    ((usage?.cacheReadTokens ?? 0) * (price.cacheRead ?? 0)) / million +
    ((usage?.cacheWriteTokens ?? 0) * (price.cacheWrite ?? 0)) / million
  );
}

/**
 * Convert USD into the requested currency with the given table
 * (`rates[code]` = how many units of that currency one USD buys).
 * @param {number} usd
 * @param {string} currency
 * @param {Record<string, number>|null} rates
 * @returns {number}
 */
export function convertFromUsd(usd, currency, rates) {
  if (!Number.isFinite(usd)) return 0;
  if (currency === 'USD') return usd;
  const rate = rates?.[currency];
  return typeof rate === 'number' && Number.isFinite(rate) ? usd * rate : usd;
}

/**
 * Format an amount in the user's locale and currency, with enough precision for
 * a session cost (small values keep their sub-cent digits).
 * @param {number} amount
 * @param {string} locale
 * @param {string} currency
 * @returns {string}
 */
export function formatMoney(amount, locale, currency) {
  const value = Number.isFinite(amount) ? amount : 0;
  const digits = value !== 0 && Math.abs(value) < 1 ? 4 : 2;
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: Math.min(2, digits),
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency || 'USD'}`;
  }
}

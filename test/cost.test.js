import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOCALES, MESSAGES, resolveLocale, translate } from '../lib/i18n.js';
import { convertFromUsd, costOf, currencyForLocale, formatMoney, priceOf } from '../lib/prices.js';
import { foldSessionCost } from '../lib/session-cost.js';

/* ── i18n ────────────────────────────────────────────────────────────── */

test('every locale translates every key of the baseline', () => {
  const baseline = Object.keys(MESSAGES.en);
  assert.ok(baseline.length > 20);
  for (const locale of LOCALES) {
    assert.ok(MESSAGES[locale], `missing locale ${locale}`);
    for (const key of baseline) {
      assert.equal(typeof MESSAGES[locale][key], 'string', `${locale} misses ${key}`);
      assert.notEqual(MESSAGES[locale][key], '', `${locale}.${key} is empty`);
    }
    for (const key of Object.keys(MESSAGES[locale])) {
      assert.ok(baseline.includes(key), `${locale} has an unknown key ${key}`);
    }
  }
});

test('translate falls back to English and substitutes placeholders', () => {
  assert.equal(translate('fr', 'panel.used'), 'utilisé');
  assert.equal(translate('es', 'panel.used'), 'usado');
  assert.equal(translate('xx', 'panel.used'), 'used');
  assert.equal(translate('fr', 'window.hour', { count: 5 }), 'Fenêtre 5 h');
  assert.equal(translate('en', 'window.hour', { count: 5 }), '5-hour window');
  assert.equal(translate('en', 'unknown.key'), 'unknown.key');
  assert.equal(translate('fr', 'window.hour'), 'Fenêtre {count} h');
});

test('resolveLocale maps browser tags onto the supported set', () => {
  assert.equal(resolveLocale('fr-FR'), 'fr');
  assert.equal(resolveLocale('de-AT'), 'de');
  assert.equal(resolveLocale('pt-BR'), 'en');
  assert.equal(resolveLocale(undefined), 'en');
});

/* ── pricing ─────────────────────────────────────────────────────────── */

test('currencyForLocale derives the display currency from the region', () => {
  assert.equal(currencyForLocale('fr-FR'), 'EUR');
  assert.equal(currencyForLocale('en-US'), 'USD');
  assert.equal(currencyForLocale('ja-JP'), 'JPY');
  assert.equal(currencyForLocale('en-AU'), 'AUD');
  assert.equal(currencyForLocale('en'), 'USD');
  assert.equal(currencyForLocale(undefined), 'USD');
});

test('priceOf resolves exact ids and vendor-prefixed ids', () => {
  assert.deepEqual(priceOf('anthropic', 'claude-sonnet-4-6'), {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  });
  assert.equal(priceOf('anthropic', 'anthropic/claude-sonnet-4-6').output, 15);
  assert.equal(priceOf('nope', 'model'), null);
  assert.equal(priceOf('anthropic', undefined), null);
});

test('costOf prices the four token buckets per million', () => {
  const price = { input: 1, output: 10, cacheRead: 0.1, cacheWrite: 2 };
  assert.equal(costOf({ uncachedInputTokens: 1_000_000 }, price), 1);
  assert.equal(costOf({ outputTokens: 1_000_000 }, price), 10);
  assert.equal(costOf({ cacheReadTokens: 1_000_000 }, price), 0.1);
  assert.ok(Math.abs(costOf({ cacheWriteTokens: 1_000_000 }, price) - 2) < 1e-9);
  assert.equal(costOf({ uncachedInputTokens: 500_000, outputTokens: 500_000 }, price), 5.5);
  assert.equal(costOf({}, price), 0);
  assert.equal(costOf({ uncachedInputTokens: 100 }, null), 0);
});

test('convertFromUsd and formatMoney respect the currency and the locale', () => {
  assert.equal(convertFromUsd(10, 'USD', null), 10);
  assert.equal(convertFromUsd(10, 'EUR', { EUR: 0.9 }), 9);
  assert.equal(convertFromUsd(10, 'EUR', null), 10);
  assert.match(formatMoney(1.5, 'fr-FR', 'EUR'), /€/);
  assert.match(formatMoney(1.5, 'en-US', 'USD'), /\$/);
  assert.match(formatMoney(0.0042, 'en-US', 'USD'), /0\.0042/);
});

/* ── session cost ────────────────────────────────────────────────────── */

let stepSeq = 0;
const USAGE = (input, output, cacheRead = 0) => {
  stepSeq += 1;
  return {
    type: 'assistant/attempt',
    data: {
      turn: 1,
      step: stepSeq,
      stream: [{ chunk: { type: 'usage', usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead } } }],
    },
  };
};

test('foldSessionCost splits usage per model across a model switch', () => {
  const events = [
    { type: 'model/selection', data: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
    USAGE(1_000_000, 1_000_000),
    { type: 'request/context', data: { provider: 'opencode', model: 'deepseek-v4.1-flash' } },
    USAGE(2_000_000, 1_000_000),
  ];
  const folded = foldSessionCost(events);
  assert.equal(folded.models.length, 2);
  const byModel = Object.fromEntries(folded.models.map((model) => [model.model, model]));
  // sonnet: 1M in * 3 + 1M out * 15 = 18 USD
  assert.ok(Math.abs(byModel['claude-sonnet-4-6'].costUsd - 18) < 1e-9);
  // flash: 2M in * 0.15 + 1M out * 0.6 = 0.9 USD
  assert.ok(Math.abs(byModel['deepseek-v4.1-flash'].costUsd - 0.9) < 1e-9);
  assert.ok(Math.abs(folded.totalUsd - 18.9) < 1e-9);
  assert.deepEqual(folded.unpricedModels, []);
});

test('foldSessionCost reports unpriced models and ignores empty usage', () => {
  const folded = foldSessionCost([
    { type: 'model/selection', data: { provider: 'mystery', model: 'mystery-large' } },
    USAGE(1_000, 1_000),
    { type: 'assistant/attempt', data: { turn: 1, step: 99, stream: [{ chunk: { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } } }] } },
  ]);
  assert.equal(folded.models.length, 1);
  assert.equal(folded.models[0].priced, false);
  assert.equal(folded.models[0].costUsd, 0);
  assert.deepEqual(folded.unpricedModels, ['mystery/mystery-large']);
  assert.equal(foldSessionCost([]).totalUsd, 0);
  assert.equal(foldSessionCost(null).models.length, 0);
});

test('foldSessionCost counts cache reads at their own rate', () => {
  const folded = foldSessionCost([
    { type: 'request/context', data: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
    USAGE(0, 0, 1_000_000),
  ]);
  assert.ok(Math.abs(folded.totalUsd - 0.3) < 1e-9);
});

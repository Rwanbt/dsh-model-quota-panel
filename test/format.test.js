import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pct, pickActive, toIso, visibleProviders, windowLabel, worstPercent } from '../lib/format.js';

test('pct clamps, rounds and rejects non-numbers', () => {
  assert.equal(pct(0), 0);
  assert.equal(pct(12.4), 12);
  assert.equal(pct(12.6), 13);
  assert.equal(pct(100), 100);
  assert.equal(pct(140), 100);
  assert.equal(pct(-5), 0);
  assert.equal(pct(null), null);
  assert.equal(pct(undefined), null);
  assert.equal(pct(Number.NaN), null);
  assert.equal(pct(Number.POSITIVE_INFINITY), null);
  assert.equal(pct('42'), null);
});

test('toIso accepts seconds, milliseconds, ISO strings and Dates', () => {
  assert.equal(toIso(1794143164), new Date(1794143164000).toISOString());
  assert.equal(toIso(1794143164000), new Date(1794143164000).toISOString());
  assert.equal(toIso('2026-11-08T18:44:31.000Z'), '2026-11-08T18:44:31.000Z');
  assert.equal(toIso('2026-11-08T18:44:31+00:00'), '2026-11-08T18:44:31.000Z');
  assert.equal(toIso(new Date('2026-11-08T18:44:31Z')), '2026-11-08T18:44:31.000Z');
  assert.equal(toIso('not a date'), null);
  assert.equal(toIso(''), null);
  assert.equal(toIso(null), null);
  assert.equal(toIso(new Date('nope')), null);
});

test('windowLabel derives a readable label from the vendor window length', () => {
  assert.equal(windowLabel(18000, 'fallback'), 'Fenêtre 5 h');
  assert.equal(windowLabel(604800, 'fallback'), 'Semaine');
  assert.equal(windowLabel(86400, 'fallback'), 'Fenêtre 1 j');
  assert.equal(windowLabel(300, 'fallback'), 'Fenêtre 5 min');
  assert.equal(windowLabel(0, 'fallback'), 'fallback');
  assert.equal(windowLabel(undefined, 'fallback'), 'fallback');
  assert.equal(windowLabel('18000', 'fallback'), 'fallback');
});

test('worstPercent reports the tightest window only', () => {
  assert.equal(worstPercent({ windows: [{ usedPct: 0 }, { usedPct: 82 }] }), 82);
  assert.equal(worstPercent({ windows: [{ usedPct: 0 }] }), 0);
  assert.equal(worstPercent({ windows: [] }), null);
  assert.equal(worstPercent({}), null);
});

test('visibleProviders prefers answered providers and falls back to failures', () => {
  const ok = { id: 'a', status: 'ok' };
  const unsupported = { id: 'b', status: 'unsupported' };
  const unavailable = { id: 'c', status: 'unavailable' };
  const failed = { id: 'd', status: 'error' };

  assert.deepEqual(visibleProviders([ok, unsupported, failed]), [ok]);
  assert.deepEqual(visibleProviders([unsupported, unavailable]), []);
  assert.deepEqual(visibleProviders([unsupported, failed]), [failed]);
  assert.deepEqual(visibleProviders([]), []);
});

test('pickActive prefers the exact provider instance, then the family', () => {
  const first = { id: 'opencode-go', provider: 'opencode-go', kind: 'opencode-go' };
  const second = { id: 'opencode-go-2', provider: 'opencode-go-2', kind: 'opencode-go' };
  const list = [first, second];

  assert.equal(pickActive(list, 'opencode-go-2'), second);
  assert.equal(pickActive(list, 'opencode-go'), first);
  assert.equal(pickActive(list, 'some-unknown-opencode'), first);
  assert.equal(pickActive(list, null), first);
});

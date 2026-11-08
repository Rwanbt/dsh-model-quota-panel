import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mapAnthropicUsage,
  mapCodexUsage,
  mapCopilotUser,
  mapMinimaxRemains,
  mapMoonshotBalance,
  mapOpencodeUsage,
  mapOpenrouterKey,
  mapZaiLimit,
} from '../lib/map.js';

test('mapOpencodeUsage keeps the three windows and their reset times', () => {
  const mapped = mapOpencodeUsage({
    usage: {
      rolling: { status: 'ok', percent: 13, resetsAt: '2026-11-08T18:44:31.000Z' },
      weekly: { percent: 5, resetsAt: '2026-11-09T00:00:00.000Z' },
      monthly: { percent: 2, resetsAt: '2026-12-01T22:33:20.000Z' },
    },
  });
  assert.equal(mapped.plan, 'Go');
  assert.deepEqual(mapped.windows.map((window) => window.usedPct), [13, 5, 2]);
  assert.equal(mapped.windows[0].resetsAt, '2026-11-08T18:44:31.000Z');
  assert.deepEqual(mapOpencodeUsage({}), { windows: [], plan: 'Go' });
});

test('mapCodexUsage reports consumption, never the remaining quota', () => {
  const mapped = mapCodexUsage({
    plan_type: 'plus',
    rate_limit: {
      primary_window: { used_percent: 0, limit_window_seconds: 18000, reset_at: 1794167883 },
      secondary_window: { used_percent: 82, limit_window_seconds: 604800, reset_at: 1794170891 },
    },
  });
  assert.equal(mapped.plan, 'plus');
  assert.deepEqual(mapped.windows.map((window) => window.label), ['Fenêtre 5 h', 'Semaine']);
  assert.deepEqual(mapped.windows.map((window) => window.usedPct), [0, 82]);
  assert.ok(mapped.windows[1].resetsAt.endsWith('Z'));
});

test('mapCodexUsage tolerates a partial payload', () => {
  assert.deepEqual(mapCodexUsage({}), { windows: [], plan: null });
  assert.deepEqual(mapCodexUsage({ rate_limit: { primary_window: {} } }), { windows: [], plan: null });
});

test('mapAnthropicUsage keeps five-hour and weekly utilization', () => {
  const mapped = mapAnthropicUsage({
    five_hour: { utilization: 0, resets_at: null },
    seven_day: { utilization: 100, resets_at: '2026-11-08T18:59:59.542714+00:00' },
  });
  assert.deepEqual(mapped.windows.map((window) => window.usedPct), [0, 100]);
  assert.equal(mapped.windows[0].resetsAt, null);
  assert.equal(mapped.windows[1].resetsAt, '2026-11-08T18:59:59.542Z');
});

test('mapCopilotUser converts percent_remaining into consumption', () => {
  const mapped = mapCopilotUser({
    copilot_plan: 'individual',
    quota_snapshots: {
      chat: { percent_remaining: 75, quota_reset_at: 1794170891 },
      completions: { percent_remaining: 100 },
      premium_interactions: { percent_remaining: 90 },
    },
  });
  assert.equal(mapped.plan, 'individual');
  assert.deepEqual(mapped.windows.map((window) => window.usedPct), [25, 0, 10]);
  assert.deepEqual(mapped.windows.map((window) => window.label), ['Chat', 'Complétions', 'Premium']);
});

test('mapOpenrouterKey only reports a credit window when a limit exists', () => {
  assert.deepEqual(mapOpenrouterKey({ data: { usage: 25, limit: 100 } }).windows, [
    { label: 'Crédit', usedPct: 25, resetsAt: null },
  ]);
  assert.deepEqual(mapOpenrouterKey({ data: { usage: 25 } }).windows, []);
  assert.deepEqual(mapOpenrouterKey({}).windows, []);
});

test('mapZaiLimit surfaces the vendor refusal as a reason', () => {
  assert.equal(mapZaiLimit({ success: false, msg: '当前用户不存在coding plan' }).reason, '当前用户不存在coding plan');
  const mapped = mapZaiLimit({
    success: true,
    data: { limits: [{ name: 'Coding', used: 30, total: 120 }] },
  });
  assert.equal(mapped.windows[0].label, 'Coding');
  assert.equal(mapped.windows[0].usedPct, 25);
});

test('mapMinimaxRemains handles an inactive plan and a real window', () => {
  assert.equal(
    mapMinimaxRemains({ base_resp: { status_code: 2062, status_msg: 'no active token plan subscription' } }).reason,
    'no active token plan subscription',
  );
  const mapped = mapMinimaxRemains({
    base_resp: { status_code: 0 },
    model_remains: [
      {
        model: 'MiniMax-M2',
        current_interval_usage_count: 40,
        current_interval_total_count: 100,
        current_weekly_usage_count: 300,
        current_weekly_total_count: 1000,
        end_time: 1794170891,
      },
    ],
  });
  assert.equal(mapped.plan, 'MiniMax-M2');
  assert.deepEqual(mapped.windows.map((window) => window.usedPct), [40, 30]);
});

test('mapMoonshotBalance reports the balance without inventing a percentage', () => {
  const mapped = mapMoonshotBalance({ data: { available_balance: 12.345 } });
  assert.deepEqual(mapped.windows, []);
  assert.match(mapped.reason, /12\.35/);
  assert.equal(mapMoonshotBalance({}).reason, 'Aucun solde renvoyé par Moonshot');
});

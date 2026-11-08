import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KIND_LABEL, kindOfModelProvider, kindOfProvider, labelInstances } from '../lib/providers.js';

test('kindOfProvider classifies configured instances', () => {
  assert.equal(kindOfProvider('opencode-go', { apiKeyEnv: 'X' }), 'opencode-go');
  assert.equal(kindOfProvider('opencode-go-2', { displayName: 'opencode-go 2' }), 'opencode-go');
  assert.equal(kindOfProvider('anthropic-account', { api: 'anthropic-messages' }), 'anthropic');
  assert.equal(kindOfProvider('openai-codex', {}), 'openai-codex');
  assert.equal(kindOfProvider('minimax-coding-plan', {}), 'minimax');
  assert.equal(kindOfProvider('zai', {}), 'zai');
  assert.equal(kindOfProvider('glm-coding', {}), 'zai');
  assert.equal(kindOfProvider('openrouter', {}), 'openrouter');
  assert.equal(kindOfProvider('copilot', {}), 'github-copilot');
  assert.equal(kindOfProvider('kimi-coding', {}), 'moonshot');
});

test('opencode wins over an anthropic-shaped api', () => {
  assert.equal(kindOfProvider('opencode-go-3', { api: 'anthropic-messages' }), 'opencode-go');
});

test('kindOfProvider returns null for vendors without a quota adapter', () => {
  assert.equal(kindOfProvider('cerebras', {}), null);
  assert.equal(kindOfProvider('groq', {}), null);
  assert.equal(kindOfProvider('google', { api: 'openai-completions' }), null);
});

test('kindOfModelProvider maps a Session provider id to a quota family', () => {
  assert.equal(kindOfModelProvider('opencode-go-2'), 'opencode-go');
  assert.equal(kindOfModelProvider('anthropic-account'), 'anthropic');
  assert.equal(kindOfModelProvider('claude-code'), 'anthropic');
  assert.equal(kindOfModelProvider('openai-codex'), 'openai-codex');
  assert.equal(kindOfModelProvider('unknown-provider'), 'unknown-provider');
  assert.equal(kindOfModelProvider(undefined), null);
});

test('labelInstances prefers displayName, then the family label, then the id', () => {
  const labelled = labelInstances([
    { id: 'opencode-go-2', kind: 'opencode-go', config: { displayName: 'opencode-go 2' } },
    { id: 'openai-codex', kind: 'openai-codex', config: {} },
    { id: 'mystery', kind: 'unknown-kind', config: {} },
  ]);
  assert.equal(labelled[0].label, 'opencode-go 2');
  assert.equal(labelled[1].label, KIND_LABEL['openai-codex']);
  assert.equal(labelled[2].label, 'mystery');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseProvidersPatch, parseRefs } from '../lib/config.js';

const LF = `version: 1
refs:
  OPENCODE_GO_API_KEY: oc_aaa
  OPENCODE_GO_2_API_KEY: "oc_bbb"
  QUOTED: 'value with spaces'
`;

const CRLF = LF.replace(/\n/g, '\r\n');

test('parseRefs reads flat refs with LF and CRLF endings', () => {
  assert.deepEqual(parseRefs(LF), {
    OPENCODE_GO_API_KEY: 'oc_aaa',
    OPENCODE_GO_2_API_KEY: 'oc_bbb',
    QUOTED: 'value with spaces',
  });
  assert.deepEqual(parseRefs(CRLF), parseRefs(LF));
});

test('parseRefs stops at the next top-level key and ignores junk', () => {
  const text = ['refs:', '  A: a', 'other:', '  B: b', '  broken line', '  : empty'].join('\n');
  assert.deepEqual(parseRefs(text), { A: 'a' });
  assert.deepEqual(parseRefs(''), {});
  assert.deepEqual(parseRefs(null), {});
});

const PATCH = `- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      opencode-go:
        apiKeyEnv: OPENCODE_GO_API_KEY
      anthropic-account:
        displayName: Anthropic-account
        api: anthropic-messages
        baseURL: https://api.anthropic.com
        apiKeyEnv: ANTHROPIC_ACCOUNT_OAUTH
        models:
          - id: claude-opus-4-8
            name: Claude Opus 4.8
            contextWindow: 1000000
      opencode-go-2:
        displayName: opencode-go 2
        apiKeyEnv: OPENCODE_GO_2_API_KEY
        api: openai-completions
        baseURL: https://opencode.ai/zen/go/v1
- id: other-plugin
  name: '@deepseek-ai/other'
`;

test('parseProvidersPatch finds every provider instance and ignores models', () => {
  const providers = parseProvidersPatch(PATCH);
  assert.deepEqual(Object.keys(providers), ['opencode-go', 'anthropic-account', 'opencode-go-2']);
  assert.equal(providers['opencode-go'].apiKeyEnv, 'OPENCODE_GO_API_KEY');
  assert.equal(providers['anthropic-account'].baseURL, 'https://api.anthropic.com');
  assert.equal(providers['anthropic-account'].displayName, 'Anthropic-account');
  assert.equal(providers['opencode-go-2'].apiKeyEnv, 'OPENCODE_GO_2_API_KEY');
  assert.equal(providers['opencode-go-2'].api, 'openai-completions');
});

test('parseProvidersPatch is CRLF-safe and returns nothing without the row', () => {
  assert.deepEqual(parseProvidersPatch(PATCH.replace(/\n/g, '\r\n')), parseProvidersPatch(PATCH));
  assert.deepEqual(parseProvidersPatch(''), {});
  assert.deepEqual(parseProvidersPatch(null), {});
  assert.deepEqual(parseProvidersPatch("- id: x\n  name: '@deepseek-ai/other'\n"), {});
});

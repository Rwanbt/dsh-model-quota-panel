import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseProvidersPatch, parseRecords, parseRefs } from '../lib/config.js';

const LF = `version: 1
refs:
  OPENCODE_GO_API_KEY: oc_aaa
  OPENCODE_GO_2_API_KEY: "oc_bbb"
  QUOTED: 'value with spaces'
`;

const CRLF = LF.replace(/\n/g, '\r\n');

const CREDENTIALS = `${LF}records:
  llm-pi-ai/openai-codex:
    kind: grant
    payload:
      type: oauth
      access: eyJ.header.signature
      refresh: rt.1.abc
      expires: 1795353454000
      accountId: 1589d1ca-4a94-4881-a29d-6fbb9863e878
  deepseek-account-platform/default:
    kind: grant
    payload:
      token: abc
other:
  x: 1
`;

test('parseRecords reads grant payload scalars and stops at the next block', () => {
  const records = parseRecords(CREDENTIALS);
  assert.deepEqual(Object.keys(records), ['llm-pi-ai/openai-codex', 'deepseek-account-platform/default']);
  assert.equal(records['llm-pi-ai/openai-codex'].kind, 'grant');
  assert.equal(records['llm-pi-ai/openai-codex'].payload.access, 'eyJ.header.signature');
  assert.equal(records['llm-pi-ai/openai-codex'].payload.expires, '1795353454000');
  assert.equal(records['llm-pi-ai/openai-codex'].payload.accountId, '1589d1ca-4a94-4881-a29d-6fbb9863e878');
  assert.equal(records['deepseek-account-platform/default'].payload.token, 'abc');
  assert.deepEqual(parseRecords(CREDENTIALS.replace(/\n/g, '\r\n')), records);
  assert.deepEqual(parseRecords('version: 1\nrefs:\n  A: a\n'), {});
  assert.deepEqual(parseRecords(null), {});
});

test('parseRecords keeps quoted scalars intact', () => {
  const records = parseRecords('records:\n  key:\n    payload:\n      token: "quoted value"\n');
  assert.equal(records.key.payload.token, 'quoted value');
});

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

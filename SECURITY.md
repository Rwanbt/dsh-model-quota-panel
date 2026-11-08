# Security

## What this plugin touches

- **Reads** two configuration files: `<DSH_HOME>/.credentials.yaml` (only the flat `refs:` block) and the profile's `cordis.patch.yml` (only the `llm-pi-ai` provider map).
- **Reads** the vendor CLI credential files when the profile does not configure that provider: `~/.codex/auth.json`, `~/.claude/.credentials.json`, and the OpenCode data directory.
- **Reads** the newest session log under `<DSH_HOME>/sessions/**/session.v4.jsonl.zstd` to price the session you are looking at. Only `model/selection`, `request/context`, `assistant/attempt` and `assistant/message` events are used (provider, model, token counts) — message text, reasoning and tool payloads are parsed and discarded.
- **Writes** two files next to `index.js`: `quotas.json` and `assets/quotas.svg` (the same snapshot, `.svg` named because the harness asset route only serves image extensions). They contain percentages, reset timestamps, provider labels and token counts — never a credential.
- **Calls** three kinds of endpoint: the vendor usage endpoints, and `api.frankfurter.app` for ECB reference rates (USD conversion, every six hours, no parameters, no key). A vendor key is only ever sent to the vendor that issued it.

## What it never does

- No key, token or credential is written to disk, logged, or published in the snapshot.
- No telemetry, analytics or update check.
- The browser half holds no credential and talks to no third party: it reads the local snapshot from the plugin-asset route (with the connection Fetch route and `api/file` as fallbacks).
- No session content, prompt or message text leaves the machine, and the session log is only read locally, in memory.

## Automated checks

`npm test` (or `node --test test/`) runs a deterministic suite, on every push, pull request and release tag, across Linux, macOS and Windows:

- `test/security.test.js` fails the build if a credential-shaped string (OpenCode `oc_…`, `sk-…`, `sk-ant-oat…`, `gho_…`, `ghp_…`, Google `AIza…`, raw JWT), a personal absolute path, or a runtime artefact (`quotas.json`, `boot.log`, `debug.json`, `session-debug.log`, `assets/`) is committed.
- `test/config.test.js`, `test/providers.test.js`, `test/format.test.js`, `test/map.test.js`, `test/cost.test.js` pin every parsing, normalisation, pricing and folding rule, including the progressive-quota semantics and per-model cost split.
- `test/client.test.js` loads the browser bundle in a sandbox and checks its slot registrations, module id and that it embeds no path or credential.

## Reporting

Open a private advisory through GitHub's *Security → Report a vulnerability*, or open an issue without including any key material. Never paste a token in an issue; redact it first.

## Scope note

The vendor usage endpoints used here are the ones their own CLIs call. They are undocumented, unversioned and may change or be rate-limited without notice; a failure is surfaced in the panel instead of being hidden behind a guessed value. Prices are a shipped snapshot, not a billing authority.

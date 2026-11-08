# Security

## What this plugin touches

- **Reads** two configuration files: `<DSH_HOME>/.credentials.yaml` (only the flat `refs:` block) and the profile's `cordis.patch.yml` (only the `llm-pi-ai` provider map).
- **Reads** the vendor CLI credential files when the profile does not configure that provider: `~/.codex/auth.json`, `~/.claude/.credentials.json`, and the OpenCode data directory.
- **Writes** one file: `quotas.json`, next to `index.js` — the snapshot the browser half reads. It contains percentages, reset timestamps and provider labels. It never contains a credential.
- **Calls** the vendor usage endpoints, and nothing else. A key is sent only to the vendor that issued it.

## What it never does

- No key, token or credential is written to disk, logged, or published in `quotas.json`.
- No telemetry, analytics or update check.
- The browser half holds no credential and talks to no third party: it only reads the local snapshot through DSH's built-in `api/file` route.

## Automated checks

`npm test` (or `node --test test/`) runs a deterministic suite, on every push and pull request, across Linux, macOS and Windows:

- `test/security.test.js` fails the build if a credential-shaped string (OpenCode `oc_…`, `sk-…`, `sk-ant-oat…`, `gho_…`, `ghp_…`, Google `AIza…`, raw JWT), a personal absolute path, or a runtime artefact (`quotas.json`, `boot.log`, `debug.json`) is committed.
- `test/config.test.js`, `test/providers.test.js`, `test/format.test.js`, `test/map.test.js` pin every parsing and normalisation rule, including the progressive-quota semantics.
- `test/client.test.js` loads the browser bundle in a sandbox and checks its slot registrations, module id and that it embeds no path or credential.

## Reporting

Open a private advisory through GitHub's *Security → Report a vulnerability*, or open an issue without including any key material. Never paste a token in an issue; redact it first.

## Scope note

The vendor usage endpoints used here are the ones their own CLIs call. They are undocumented, unversioned and may change or be rate-limited without notice; a failure is surfaced in the panel instead of being hidden behind a guessed value.

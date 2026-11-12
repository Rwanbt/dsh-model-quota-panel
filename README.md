# dsh-model-quota-panel

![ci](https://github.com/Rwanbt/dsh-model-quota-panel/actions/workflows/ci.yml/badge.svg)
![version](https://img.shields.io/badge/version-1.8.1-blue)
![status](https://img.shields.io/badge/status-stable-success)
![license](https://img.shields.io/badge/license-MIT-green)

**Status: stable.** Released as `v1.8.0`; see [CHANGELOG.md](CHANGELOG.md) for the history. Interfaces, payload shape and file layout are frozen for the 1.x line — new providers and locales are additive.

A [DeepSeek Harness](https://www.deepseek.com/en/harness/) plugin that puts **your AI subscription quotas** where you actually write.

It adds a progress ring next to the composer's built-in *context used* meter, and a click-opened panel that is a pixel-level copy of that meter's panel. Every quota comes from the vendor's own usage endpoint — no placeholder — and a provider with no quota API, or one that is not connected, is simply not displayed. The panel also prices the session you are looking at, for pay-per-token users.

```
composer dock:   [◔ 15 % context used]   [◔ 15 % subscription quota]
                                              ↑ this plugin
```

## Features

- **Ring + percentage in the composer dock**, immediately to the right of the context meter, using that meter's exact tokens, geometry and typography — same 14 px ring, same 13 px tabular figure, same hover surface.
- **Panel on click**, identical to the context panel: same `--dsw-*` tokens, 264 px width, segmented bar, swatch legend, anchored above the trigger; closes on Escape, outside click, or a second click.
- **Describes the subscription of the model the open conversation uses**, not the profile default. Switching model updates the ring within two seconds.
- **Any number of accounts per vendor** (two OpenCode Go subscriptions, a second Anthropic account, …), each with its own card.
- **Progressive everywhere**: every bar grows as you consume. See below.
- **Quiet by design**: providers without a quota API, or not connected, never appear; transient failures stay hidden while at least one provider answers.
- **Exact reset readout**: compact duration in the row (`· 3 h 33 min`), full sentence with the local reset time in the row tooltip.
- **Session cost** for API-key users: the panel adds the price of the session you are looking at, **split per model** when you switched model mid-session.
- **Five languages** (English, French, Spanish, German, Chinese) and money shown in **your currency and locale**, converted from USD with ECB reference rates.

## Progressive quota (why Codex looks "inverted" elsewhere)

Quota screens disagree on direction. Codex, for instance, shows **remaining** allowance, so its numbers go *down* as you work, and the same is true of some vendor CLIs.

This plugin normalises everything to **consumption**:

| Vendor | Raw field | What the panel shows |
| --- | --- | --- |
| OpenCode Go | `percent` | consumed directly |
| Codex (ChatGPT) | `used_percent` | consumed directly |
| Claude (OAuth) | `utilization` | consumed directly |
| GitHub Copilot | `percent_remaining` | `100 − remaining` |
| MiniMax | `current_*_usage_count / total` | consumed ratio |

Result: one consistent reading across the panel — `0 %` means untouched, `100 %` means exhausted — and bars that fill up instead of emptying. A Codex window at `0 % / 82 %` therefore means *5-hour window untouched, weekly limit 82 % consumed*, which is the opposite of what the Codex app prints for the same account.

## Session cost

Subscription quotas do not cover pay-per-token users. The panel therefore also prices the **most recently active session** from the durable log the harness already writes:

- `model/selection` and `request/context` events give the provider and model in force,
- `assistant/message` (and `assistant/attempt`) events carry the token counts, keyed per `turn/step` so one step is never counted twice,
- each bucket is priced with the table in [`lib/prices.js`](lib/prices.js) (USD per 1 M tokens, input / output / cache read / cache write),
- the result is a **per-model breakdown**, so switching model mid-conversation keeps the split exact.

Amounts are converted from USD with the ECB reference rates (`api.frankfurter.app`, refreshed every six hours) and rendered with `Intl.NumberFormat` in the user's locale and the currency implied by that locale (`fr-FR` → EUR, `en-US` → USD, `ja-JP` → JPY, …). When a vendor rate is unavailable the panel falls back to USD; when a model has no known price the row shows `—` and the model is reported as unpriced instead of guessing.

Prices are a shipped snapshot: edit `PRICES` when a vendor changes its rates.

## Languages and currencies

The bundle ships five locales (en, fr, es, de, zh) and falls back to English for anything missing. Window labels travel from the Host as **semantic keys**, so one payload serves every language; `test/cost.test.js` fails the build when a locale misses a key.

**The locale is resolved by the Host, not by the page**: `navigator.language` in the desktop shell reports the Electron bundle locale (`en-US`), which forced USD. The Host therefore uses, in order:

1. the plugin config `locale` (and/or `currency`),
2. the operating system locale via `Intl.DateTimeFormat().resolvedOptions().locale` (e.g. `fr-FR`),
3. `LC_ALL` / `LC_MESSAGES` / `LANG`,
4. `en-US`.

The currency is derived from the region of that locale and published alongside it (`locale`, `currency`, `localeSource` in the snapshot).

Currencies: USD, EUR, GBP, CHF, CAD, JPY, CNY, AUD, INR, BRL — formatted with `Intl.NumberFormat`, with four decimals below one unit.

## Multiple accounts

Provider instances are discovered from the profile's `llm-pi-ai` provider map, so nothing is hard-coded:

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      opencode-go:
        apiKeyEnv: OPENCODE_GO_API_KEY
      opencode-go-2:
        displayName: opencode-go 2
        apiKeyEnv: OPENCODE_GO_2_API_KEY
```

Each entry becomes its own card, named after its `displayName`. The meter and the panel header follow the **exact provider id** of the conversation's model first (so `opencode-go` and `opencode-go-2` are distinguished), then fall back to the provider family.

## Supported providers

| Provider | Endpoint used | Credential |
| --- | --- | --- |
| **OpenCode Go** | `https://opencode.ai/inference/go/v1/usage` | `OPENCODE_GO_API_KEY` (profile `apiKeyEnv`), DSH store, env, or OpenCode store |
| **Codex (ChatGPT)** | `https://chatgpt.com/backend-api/wham/usage` | `~/.codex/auth.json` (`codex login`) |
| **Claude (OAuth account)** | `https://api.anthropic.com/api/oauth/usage` | profile `apiKeyEnv` holding an `sk-ant-oat…` token, or `~/.claude/.credentials.json` |
| **Anthropic CLI account** | same endpoint | `~/.claude/.credentials.json` (`claude` then `/login`) |
| **MiniMax** | `https://api.minimax.io/v1/coding_plan/remains` | `apiKeyEnv` / `MINIMAX_API_KEY` (needs an active coding plan) |
| **Z.ai (GLM)** | `https://api.z.ai/api/monitor/usage/quota/limit` | `apiKeyEnv` (needs a coding plan) |
| **OpenRouter** | `https://openrouter.ai/api/v1/key` | `apiKeyEnv`; the credit limit comes from the key itself |
| **GitHub Copilot** | `copilot_internal/v2/token` → `copilot_internal/user` | Copilot OAuth token |
| **Moonshot / Kimi** | `https://api.moonshot.cn/v1/users/me/balance` | `apiKeyEnv`; reports a balance, not a percentage |

Providers with **no public quota endpoint** are never displayed: Perplexity, Google / Gemini API keys, Mistral, Groq, Cerebras, NVIDIA, and MiniMax API keys (only MiniMax *coding plans* expose a quota).

Keys are resolved from, in order: the profile's `apiKeyEnv` in the DSH credential store (`<DSH_HOME>/.credentials.yaml`, `refs:` block), the process environment, then the OpenCode CLI store (`~/.local/share/opencode/auth.json`). A key is only ever sent to that vendor's own API.

## Install

The plugin is an ordinary DeepSeek Harness bundle.

```sh
git clone https://github.com/Rwanbt/dsh-model-quota-panel.git
```

Then, in a DSH session of the profile you use: **Plugins → Add plugin**, pick the cloned directory (or use `plugin_manager` / `dsh plugin --profile <name> add link:<absolute path>`), and enable the bundle. It needs DeepSeek Harness 0.2.2-rc.1 (Web or Desktop).

### No path to configure

The Host half publishes the snapshot twice:

1. next to `index.js` as `quotas.json`, and
2. into `assets/quotas.svg` (JSON bytes, `.svg` name because DSH's plugin-asset route only serves image extensions).

The browser reads it through the **plugin-asset route** — a plain relative URL, `plugins/dsh-model-quota-panel/assets/quotas.svg` — so no filesystem path is involved and nothing has to be edited on any OS. Three fallbacks remain, in order: the connection-level Fetch route (`api/model-quota`), then DSH's built-in `api/file` route with the absolute path the Host injects at boot (`window.__MODEL_QUOTA_PANEL__.path`, remembered in `localStorage`).

## Compatibility

| OS | Status | Notes |
| --- | --- | --- |
| **Windows** | tested | path injected at boot, no manual configuration |
| **Linux** | supported | same code path; credentials follow XDG (`$XDG_DATA_HOME`), `~/.local/share`, `~/.dsh` |
| **macOS** | supported, untested | also probes `~/Library/Application Support/opencode/auth.json` for the OpenCode CLI |

Nothing in the bundle is OS-specific: the Host uses `node:os`/`node:path`/`node:url` only, and the browser half never hard-codes a filesystem path. Requires DeepSeek Harness 0.2.2-rc.1 (Web or Desktop) and Node.js 20+; the session-cost section additionally needs **Node 22.15+** for zstd, and silently stays hidden below that.

Credentials are read from the same places on every OS: `~/.codex/auth.json`, `~/.claude/.credentials.json`, the OpenCode data directory, and `<DSH_HOME>/.credentials.yaml`.

## How it works

| Part | Role |
| --- | --- |
| `index.js` (Host) | Reads the profile provider map, asks each vendor for its usage every 20 s (plus once at start), folds the newest session log into a per-model cost, fetches ECB rates every six hours, and publishes one snapshot: quotas, prices, messages, FX and session cost. |
| `client.js` (browser) | Registers a meter into `conversation.composer.dock` (the row holding the context meter, `order: 1` puts it on the right) and a panel into `shell.overlay` (the frame-wide floating layer, so the composer can never clip it). |
| Session awareness | Reads the open session id, then its `modelSelection` projection, and matches the provider instance — exact id first, family second. |

Why not a plain JSON endpoint: the desktop shell forwards requests to a plugin's own web routes but does not deliver their responses, so a custom `/api/…` route hangs in the page. A **connection-level Fetch route** (`connection.fetch.register`, the same mechanism behind the built-in `/api/file`) is registered as a second option, and the plugin-asset route is the primary one because it is a relative URL that always answers.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No ring in the composer | The plugin must be **enabled** in Plugins; then reload the window (`Ctrl+R`). |
| Ring present, panel empty | The snapshot could not be read (reload the window once) or no provider is connected. |
| A provider is missing | It has no quota API, its credential is absent, or its endpoint answered with an error (429/401/403) while another provider worked; it returns on its own. |
| Wrong subscription shown | The conversation's model provider has no matching card, so the panel fell back to the first available one. |

## Tests and CI

The repository ships a deterministic, dependency-free suite (Node's built-in runner): **44 tests**, no network, no fixtures to refresh.

```sh
npm test        # node --test
npm run check   # node --check on both bundle halves
```

| File | Covers |
| --- | --- |
| `test/config.test.js` | `refs:` block and `llm-pi-ai` provider map parsing, LF and CRLF, quoted values, nested `models:` ignored |
| `test/providers.test.js` | provider-instance classification (`opencode-go-2`, `anthropic-account`, …), model-provider mapping, card labels |
| `test/format.test.js` | percentage clamping, timestamp normalisation (seconds / ms / ISO), window labels, visibility rules, active-card selection |
| `test/map.test.js` | every vendor payload → windows mapping, including Codex consumption semantics, Copilot `percent_remaining`, MiniMax status codes |
| `test/client.test.js` | the browser bundle loaded in a VM sandbox: module id, slot registrations, absence of embedded paths or credentials |
| `test/cost.test.js` | i18n completeness and placeholders, currency conversion and formatting, token pricing, per-model session folding across model switches |
| `test/security.test.js` | fails the build on any credential-shaped string, personal absolute path, or tracked runtime artefact |

`.github/workflows/ci.yml` runs that suite on **ubuntu, windows and macos** with **Node 20 and 22**, plus the syntax check. See [SECURITY.md](SECURITY.md) for the security model and [CHANGELOG.md](CHANGELOG.md) for the release history.

## Limitations

- Refresh granularity is 20 s; a window that just reset can take that long to show it.
- Rate-limited vendors (HTTP 429) are hidden while another provider answers, and listed with their message when none does.
- The panel reads the vendor endpoints these CLIs use; those are undocumented and may change without notice.
- Linux and macOS are untested; credential paths follow each CLI's own home-directory convention.
- **Session cost** covers the *most recently active* session only, and prices are a shipped snapshot. A vendor that reports cache reads inside `inputTokens` is priced slightly high; a model absent from the table is reported as unpriced rather than guessed.
- **Session cost needs zstd** (`node:zlib` `zstdDecompressSync`, Node 22.15+). On an older runtime the quota panel works and the cost section stays hidden.

## License

MIT — see [LICENSE](LICENSE).

---

## En français

**dsh-model-quota-panel** affiche tes quotas d'abonnement IA dans DeepSeek Harness : un anneau de progression juste à droite du compteur « contexte utilisé » du composeur, et un panneau au clic identique, en design, à celui du contexte.

- Tous les quotas sont affichés en **progressif** (consommation) : `0 %` = intact, `100 %` = épuisé. Codex affiche pour sa part le *restant*, d'où l'inversion.
- **Autant de comptes que tu veux** par fournisseur : chaque entrée `providers` du profil devient une carte.
- Supportés : OpenCode Go, Codex, Claude (OAuth), MiniMax (coding plan), Z.ai, OpenRouter, GitHub Copilot, Moonshot. Les fournisseurs sans API de quota (Perplexity, Gemini, Mistral, Groq, Cerebras, NVIDIA) ne sont pas affichés.
- **Coût de session** pour les clés API : prix de la session affichée, **découpé par modèle** (un changement de modèle en cours de discussion reste exact), tarifs dans `lib/prices.js`.
- **Cinq langues** (en, fr, es, de, zh) et montants dans **ta devise**, déduite de la locale du système d'exploitation (`fr-FR` → EUR) et convertie avec les taux BCE. Surchargeable via la config du plugin (`locale`, `currency`).
- **Aucune configuration** : la page lit l'instantané par une URL relative d'asset, quel que soit l'OS ou le dossier d'installation. Windows testé, Linux et macOS supportés.

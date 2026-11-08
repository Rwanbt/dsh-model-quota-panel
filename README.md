# dsh-model-quota-panel

A [DeepSeek Harness](https://www.deepseek.com/en/harness/) plugin that shows the **quota of the AI subscriptions you actually use**, right where you write: a progress ring next to the composer's native "context used" meter, and a floating panel with the detailed windows.

It never invents a number: every value comes from the vendor's own usage endpoint, and a provider that has no quota API — or that is not connected — is simply not shown.

## Features

- **Ring + percentage in the composer dock**, immediately to the right of the built-in context meter, using that meter's exact tokens, geometry and typography. It always describes the **subscription of the model the current conversation uses** — not the profile default — and follows a model switch within a couple of seconds.
- **Panel on click**, visually identical to the context panel (same `--dsw-*` tokens, 264 px width, segmented bar, swatch legend, anchored above the trigger, Escape / outside click to close).
- **One card per connected subscription**, active provider first, reset countdowns included.
- **Silent about noise**: providers without a quota API, or not connected, never appear.

## Supported providers

| Provider | Endpoint used | Notes |
| --- | --- | --- |
| **OpenCode Go** | `opencode.ai/inference/go/v1/usage` | rolling / weekly / monthly windows; key read from the DSH credential store (`OPENCODE_GO_API_KEY`) |
| **Codex (ChatGPT)** | `chatgpt.com/backend-api/wham/usage` | needs `~/.codex/auth.json` (run `codex login`) |
| **Claude Code** | `api.anthropic.com/api/oauth/usage` | needs `~/.claude/.credentials.json` (run `claude`, then `/login`) |
| **MiniMax** | `api.minimax.io/v1/coding_plan/remains` | needs an active token/coding plan |
| **Z.ai (GLM)** | `api.z.ai/api/monitor/usage/quota/limit` | needs a coding plan on the account |
| **OpenRouter** | `openrouter.ai/api/v1/key` | reads the credit limit from the key itself |
| **GitHub Copilot** | `copilot_internal/v2/token` + `/user` | needs a Copilot OAuth token |
| **Moonshot / Kimi** | `api.moonshot.cn/v1/users/me/balance` | reports the balance, no percentage |
| MiniMax API, Perplexity, Google/Gemini, Mistral, Groq, Cerebras, NVIDIA | — | no public quota endpoint; not displayed |

API keys are read from, in order: the DSH credential store (`<DSH_HOME>/.credentials.yaml`, `refs:` block), the process environment, then the OpenCode CLI store (`~/.local/share/opencode/auth.json`). No key is ever sent anywhere except the vendor's own API.

## Install

The plugin is a normal DeepSeek Harness bundle. From a checkout:

```sh
git clone https://github.com/Rwanbt/dsh-model-quota-panel.git
```

Then, in a DSH session of the profile you use, install the bundle from that directory (Plugins → Add plugin, or the `plugin_manager` tool / `dsh plugin --profile <name> add link:<absolute path>`), and enable it.

### One line to check after installing elsewhere

The Host half publishes a snapshot as `quotas.json` next to `index.js`, and the browser half reads it through DSH's built-in `api/file` route — that route needs an absolute path. Set it near the top of `client.js`:

```js
const QUOTAS_FILE = '/absolute/path/to/dsh-model-quota-panel/quotas.json';
```

Nothing else is configurable.

## How it works

- `index.js` (Host): every 20 s, plus once at startup, it asks each vendor for the current usage and writes the result to `quotas.json`. Providers without an API, or not connected, are filtered out before publication.
- `client.js` (browser): registers a meter into `conversation.composer.dock` (the row holding the context meter, `order: 1` puts it on the right) and a panel into `shell.overlay` (the frame-wide floating layer, so the composer can never clip it). It re-reads the snapshot every 20 s.

## Limitations

- The desktop shell does not deliver responses from a plugin's own web routes, hence the file snapshot instead of a JSON endpoint.
- Refresh granularity is 20 s; a window that resets may take that long to show it.
- Rate-limited vendors (HTTP 429) are displayed with the vendor message while no other provider answers, and hidden otherwise.
- Linux/macOS are untested; the credential paths are the Windows/macOS/Linux home-directory conventions of each CLI.

## License

MIT — see [LICENSE](LICENSE).


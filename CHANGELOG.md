# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.8.1] — 2026-11-12

### Fixed

- **"Quota data unavailable: HTTP 404" on a fresh install**: the git-ignored `assets/` directory is now created before the snapshot is published, so the plugin-asset route serves it. A failed write is logged instead of being silently ignored.

### Documentation

- README and SECURITY corrected after the session-cost, locale and transport changes: the locale is resolved by the Host from the operating system (not `navigator.language`), the snapshot is read through the plugin-asset route, session cost is described with its zstd requirement and its per-model folding, and the security page lists the local session log and the ECB rate endpoint.
## [1.8.0] — 2026-11-08 — production release

First release considered stable and supported.

### Added

- **Session cost**: the panel prices the most recently active session from the durable session log, split **per model** so a mid-conversation model switch stays exact.
- **Pricing table** (`lib/prices.js`, USD per 1M tokens: input, output, cache read, cache write) and a machine-readable price lookup tolerant of vendor-prefixed ids.
- **Currency**: USD amounts converted with ECB reference rates (`api.frankfurter.app`, refreshed every six hours) and formatted with `Intl.NumberFormat`.
- **Locale resolution from the operating system** (`Intl.DateTimeFormat().resolvedOptions().locale`, then `LC_ALL`/`LANG`), overridable per install through the plugin config.
- **Five locales** (en, fr, es, de, zh) with semantic window keys, so one Host payload serves every language.
- **Multi-account discovery**: every entry of the profile's `llm-pi-ai` provider map becomes its own card.
- **Optional per-conversation cost rows**, and an explicit "unpriced" report instead of a guessed amount.

### Changed

- Session logs are decoded **frame by frame**: `zstdDecompressSync` stops after the first frame on the Electron runtime, which hid every event written after the session started.
- The quota snapshot is also served through the plugin-asset route, a relative URL that always answers; the injected `api/file` path and the connection Fetch route remain as fallbacks.
- Provider cards are kept when a vendor endpoint flaps (last good reading, Anthropic polled at most every four minutes).

### Fixed

- The composer meter follows the session's model, not the profile default.
- Codex windows are reported as consumption, like every other provider.
- Panel rows no longer wrap; the reset sentence moved to the row tooltip.

## [1.7.1] — 2026-11-08

### Fixed

- Locale and currency now come from the operating system instead of `navigator.language`, which reports the Electron app locale (`en-US`) and forced USD.

## [1.7.0] — 2026-11-08

### Added

- Session cost, token pricing, currency conversion, five locales.

## [1.6.1] — 2026-11-08

### Fixed

- Quota data is read through the plugin-asset route, so the panel works without a page reload.

## [1.6.0] — 2026-11-08

### Added

- Deterministic test suite (44 cases now), CI matrix on ubuntu/windows/macos with Node 20 and 22, and a security test that fails on committed credentials, personal paths or runtime artefacts.
- Pure `lib/` modules (config parsing, provider classification, formatting, payload mapping).

## [1.5.0] — 2026-11-08

### Added

- Linux and macOS support: no hand-edited path, XDG and macOS credential locations.

## [1.4.1] — 2026-11-08

### Fixed

- A provider card no longer disappears when its vendor endpoint rate-limits.

## [1.4.0] — 2026-11-08

### Changed

- Rewritten README, with the progressive-quota explanation and the provider matrix.

## [1.3.2] — 2026-11-08

### Fixed

- Panel kept on one line per window; duplicated labels removed.

## [1.3.0] — 2026-11-08

### Added

- Per-instance provider discovery: several accounts per vendor, each with its own card.

## [1.2.1] — 2026-11-08

### Changed

- The meter follows the conversation's model; exact reset readout.

## [1.2.0] — 2026-11-08

### Changed

- Published under `dsh-model-quota-panel`.

## [1.1.0] — 2026-11-08

### Added

- Initial working plugin: quota ring beside the context meter, click panel, real vendor usage (OpenCode Go, Codex, Claude, MiniMax, Z.ai, OpenRouter, GitHub Copilot, Moonshot).

[1.8.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.8.0
[1.7.1]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.7.1
[1.7.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.7.0
[1.6.1]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.6.1
[1.6.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.6.0
[1.5.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.5.0
[1.4.1]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.4.1
[1.4.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.4.0
[1.3.2]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.3.2
[1.3.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.3.0
[1.2.1]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.2.1
[1.2.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.2.0
[1.1.0]: https://github.com/Rwanbt/dsh-model-quota-panel/releases/tag/v1.1.0

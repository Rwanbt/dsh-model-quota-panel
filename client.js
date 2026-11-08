/**
 * Client half of the model-quota-panel bundle.
 *
 * Mirrors the shipped composer "context used" meter: a 14 px progress ring plus
 * its percentage in the composer dock row, and a click-opened anchored panel
 * that reuses the exact same tokens, geometry and layout as that meter. It sits
 * to the right of the context meter (flex `order`), so the composer reads:
 *   [context used]  [subscription quota]
 *
 * Quota data is published by the Host as `quotas.json`; the page reads it over
 * the built-in `api/file` route, because the desktop shell does not deliver
 * responses from a plugin's own web routes.
 */

window.__ModuleLoader__.load({
  id: 'dsh-model-quota-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    /** This bundle's package name, equal to the module id asserted by the tests. */
    const PACKAGE_ID = 'dsh-model-quota-panel';
    const STYLE_ID = 'model-quota-panel-styles';
    const PANEL_WIDTH = 264;
    const RADIUS = 5.5;

    /* ── locale, translation and money ──────────────────────────────── */

    const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'zh'];
    const REGION_CURRENCY = {
      US: 'USD', GB: 'GBP', CH: 'CHF', CA: 'CAD', JP: 'JPY', CN: 'CNY',
      AU: 'AUD', IN: 'INR', BR: 'BRL',
      DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR',
      PT: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
    };
    const FALLBACK_MESSAGES = {
      'panel.title': 'Subscription quota',
      'panel.sessionCost': 'Session cost',
      'panel.estimate': 'estimate',
      'panel.used': 'used',
      'panel.noData': 'No quota data available',
      'panel.unavailable': 'Quota data unavailable',
    };

    const USER_LOCALE = (() => {
      try {
        const requested = (globalThis.navigator && globalThis.navigator.language) || 'en';
        const primary = String(requested).toLowerCase().split(/[-_]/)[0];
        return SUPPORTED_LOCALES.includes(primary) ? primary : 'en';
      } catch (error) {
        return 'en';
      }
    })();

    /** Translate a key with the dictionaries the Host published. */
    function translate(data, key, params) {
      const messages = data && data.messages;
      const template =
        (messages && messages[USER_LOCALE] && messages[USER_LOCALE][key]) ||
        (messages && messages.en && messages.en[key]) ||
        FALLBACK_MESSAGES[key] ||
        key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      );
    }

    /** Local currency implied by the browser locale. */
    function displayCurrency() {
      try {
        const tag = (globalThis.navigator && globalThis.navigator.language) || 'en-US';
        const region = String(tag).split(/[-_]/)[1];
        if (region && REGION_CURRENCY[region.toUpperCase()]) return REGION_CURRENCY[region.toUpperCase()];
      } catch (error) {
        // fall through
      }
      return 'USD';
    }

    /** Format a USD amount in the user's currency and locale. */
    function money(usd, data) {
      const currency = displayCurrency();
      const rates = data && data.fx && data.fx.rates;
      const rate = currency === 'USD' ? 1 : rates && typeof rates[currency] === 'number' ? rates[currency] : 1;
      const amount = (Number.isFinite(usd) ? usd : 0) * rate;
      const digits = amount !== 0 && Math.abs(amount) < 1 ? 4 : 2;
      try {
        return new Intl.NumberFormat(USER_LOCALE, {
          style: 'currency',
          currency,
          minimumFractionDigits: Math.min(2, digits),
          maximumFractionDigits: digits,
        }).format(amount);
      } catch (error) {
        return amount.toFixed(digits) + ' ' + currency;
      }
    }

    /** Window label from its semantic key, falling back to the Host label. */
    function windowText(data, window) {
      if (window && typeof window.key === 'string') {
        const translated = translate(data, 'window.' + window.key, window.params);
        if (translated !== 'window.' + window.key) return translated;
      }
      return (window && window.label) || '';
    }
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
    /**
     * Absolute path of the snapshot published by the Host (index.js). The Host
     * injects it into the page for the current install, so no path is hard-coded
     * here and a clone works from any directory on any OS. Empty means the page
     * was rendered without the injection (a reload fixes it) — the panel then
     * says so instead of guessing a path.
     */
    const STORAGE_KEY = 'dsh.model-quota.snapshot';

    /** Absolute path of the snapshot: injected by the Host at boot, or remembered
     *  from a previous page load. Reading it lazily lets a page that booted
     *  before the injection existed pick it up after the first success. */
    function snapshotPath() {
      try {
        if (typeof window !== 'undefined' && window.__MODEL_QUOTA_PANEL__ && typeof window.__MODEL_QUOTA_PANEL__.path === 'string') {
          const injected = window.__MODEL_QUOTA_PANEL__.path;
          if (injected !== '') {
            try {
              window.localStorage.setItem(STORAGE_KEY, injected);
            } catch (error) {
              // storage may be unavailable
            }
            return injected;
          }
        }
        const stored = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
        return typeof stored === 'string' ? stored : '';
      } catch (error) {
        return '';
      }
    }

    /* ── styles: same values as ui-conversation ContextMeter.module.css ── */

    const CSS = `
      .mqp_root { flex: none; display: inline-flex; order: 1; }
      .mqp_trigger {
        border-radius: var(--dsw-radius-sm);
        color: var(--dsw-alias-label-tertiary);
        font-family: inherit;
        font-size: var(--dsh-content-font-size-secondary, 13px);
        font-variant-numeric: tabular-nums;
        line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
        white-space: nowrap; cursor: pointer; background: 0 0; border: none; flex: none;
        align-items: center; gap: 6px; padding: 1px 8px; display: inline-flex;
      }
      .mqp_trigger[aria-expanded="true"] {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-secondary);
      }
      @media (hover: hover) {
        .mqp_trigger:hover {
          background: var(--dsw-alias-interactive-bg-hover);
          color: var(--dsw-alias-label-secondary);
        }
      }
      .mqp_track { fill: none; stroke: var(--dsw-alias-border-l3); stroke-width: 2px; }
      .mqp_fill { fill: none; stroke: var(--dsw-alias-label-tertiary); stroke-width: 2px; stroke-linecap: round; }
      .mqp_panel {
        z-index: 1100; box-sizing: border-box; border-radius: var(--dsw-radius-lg);
        background: var(--dsw-specific-menu); width: min(${PANEL_WIDTH}px, 100vw - 24px);
        backdrop-filter: var(--dsw-menu-backdrop-filter);
        --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
        box-shadow: var(--dsw-elevation-prominent);
        color: var(--dsw-alias-label-secondary); cursor: default;
        max-height: min(70vh, 460px); border: 0; padding: 12px;
        font-size: 12px; line-height: 20px; position: fixed; overflow: hidden auto;
        --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
        --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
      }
      .mqp_header { align-items: center; gap: 6px; display: flex; }
      .mqp_figures {
        font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary);
        margin-left: auto; font-weight: 500;
      }
      .mqp_percent { color: var(--dsw-alias-label-primary); font-weight: 500; }
      .mqp_headline {
        color: var(--dsw-alias-label-tertiary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .mqp_headline:empty { display: none; }
      .mqp_bar {
        corner-shape: round; background: var(--dsw-alias-interactive-bg-hover);
        border-radius: 999px; gap: 1px; height: 4px; margin: 10px 0 12px;
        display: flex; overflow: hidden;
      }
      .mqp_segment {
        background: var(--mqp-tint, var(--dsw-alias-label-tertiary));
        border-radius: 1px; flex: none; min-width: 2px; height: 100%;
      }
      .mqp_swatch {
        background: var(--mqp-tint); vertical-align: baseline; border-radius: 2px;
        width: 8px; height: 8px; margin-right: 6px; display: inline-block;
      }
      .mqp_t1 { --mqp-tint: var(--dsw-static-neutral-bluish-400); }
      .mqp_t2 { --mqp-tint: #a78bfa; }
      .mqp_t3 { --mqp-tint: var(--dsw-static-blue-450); }
      .mqp_rows { margin: 6px 0 0; }
      .mqp_row {
        justify-content: space-between; align-items: center; gap: 12px;
        padding: 2px 0; display: flex;
      }
      .mqp_row dt {
        color: var(--dsw-alias-label-secondary);
        min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .mqp_row dd {
        font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary);
        margin: 0; white-space: nowrap;
      }
      .mqp_section { margin-top: 14px; }
      .mqp_section:first-of-type { margin-top: 0; }
      .mqp_section_head {
        align-items: center; gap: 6px; display: flex;
        color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 20px;
        white-space: nowrap; overflow: hidden;
      }
      .mqp_section_head > span:first-child { overflow: hidden; text-overflow: ellipsis; }
      .mqp_section_plan {
        margin-left: auto; text-transform: uppercase; letter-spacing: .03em; font-size: 10px;
      }
      .mqp_note { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; margin-top: 4px; }
      .mqp_reset { color: var(--dsw-alias-label-tertiary); }
      .mqp_empty { color: var(--dsw-alias-label-tertiary); }
    `;

    function useStyles() {
      useEffect(() => {
        if (document.getElementById(STYLE_ID)) return undefined;
        const element = document.createElement('style');
        element.id = STYLE_ID;
        element.textContent = CSS;
        document.head.appendChild(element);
        return () => {
          const current = document.getElementById(STYLE_ID);
          if (current) current.remove();
        };
      }, []);
    }

    /* ── data ─────────────────────────────────────────────────────────── */

    /**
     * Where the snapshot may be read from, in order:
     *  1. the plugin-asset route — a plain relative URL, so no filesystem path
     *     and no page reload are needed;
     *  2. the absolute path the Host injects into the page at boot;
     *  3. the same path passed through the built-in `api/file` route.
     */
    function quotaSources() {
      // A relative plugin-asset URL first: no filesystem path, no page reload.
      const sources = ['plugins/' + PACKAGE_ID + '/assets/quotas.svg'];
      const path = snapshotPath();
      if (path !== '') sources.push('api/file?path=' + encodeURIComponent(path));
      sources.push('api/model-quota');
      return sources;
    }

    async function readQuotas() {
      let lastError = null;
      for (const source of quotaSources()) {
        try {
          const url = source + (source.includes('?') ? '&' : '?') + 't=' + Date.now();
          const response = await fetch(url);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const parsed = await response.json();
          return parsed;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error('aucune source de quota disponible');
    }


    function usable(provider) {
      // Hidden: no quota API, or the provider is not connected.
      return provider && (provider.status === 'ok' || provider.status === 'error');
    }

    function shownProviders(data) {
      const list = data && Array.isArray(data.providers) ? data.providers.filter(usable) : [];
      return list;
    }

    function providerWindows(provider) {
      return Array.isArray(provider?.windows) ? provider.windows.filter((w) => typeof w.usedPct === 'number') : [];
    }

    /** Tooltip text telling when a kept-over reading was taken. */
    function staleTitle(provider, data) {
      if (!provider || provider.stale !== true || !provider.updatedAt) return undefined;
      const at = new Date(provider.updatedAt);
      if (Number.isNaN(at.getTime())) return undefined;
      return translate(data, 'panel.stale', { time: at.toLocaleTimeString(USER_LOCALE, { hour: '2-digit', minute: '2-digit' }) });
    }

    function worstPercent(provider) {
      let worst = null;
      for (const window of providerWindows(provider)) {
        if (worst === null || window.usedPct > worst) worst = window.usedPct;
      }
      return worst;
    }

    /** Provider id used by the quota payload for a model-provider id. */
    function kindOf(provider) {
      if (typeof provider !== 'string') return null;
      if (provider.includes('opencode')) return 'opencode-go';
      if (provider.includes('claude') || provider.includes('anthropic')) return 'anthropic';
      if (provider.includes('codex')) return 'openai-codex';
      if (provider.includes('minimax')) return 'minimax';
      if (provider.includes('zai') || provider.includes('z.ai') || provider.includes('glm')) return 'zai';
      if (provider.includes('copilot')) return 'github-copilot';
      if (provider.includes('openrouter')) return 'openrouter';
      if (provider.includes('moonshot') || provider.includes('kimi')) return 'moonshot';
      return provider;
    }

    /** Model selection of the Session currently shown in the window. */
    let selectionValue = null;

    function readSelection(ctx) {
      try {
        const raw = globalThis.localStorage ? globalThis.localStorage.getItem('dsh.sessions.current') : null;
        const sessionId = raw ? JSON.parse(raw).sessionId : null;
        if (!sessionId) return null;
        const binding = ctx && ctx.get ? ctx.get('sessions')?.binding?.(sessionId) : null;
        const face = binding && binding.session && binding.session.projections
          ? binding.session.projections.faceOf('modelSelection')
          : null;
        const snapshot = face && face.getSnapshot ? face.getSnapshot() : null;
        const value = snapshot && snapshot.next ? snapshot.next : snapshot;
        if (value && typeof value.provider === 'string') {
          return { provider: value.provider, model: typeof value.model === 'string' ? value.model : null };
        }
      } catch (error) {
        // best effort: fall back to the Host's own active flag
      }
      return null;
    }

    /**
     * The card of the Session's model: an exact provider instance first (two
     * OpenCode Go accounts are two distinct provider ids), then its kind.
     */
    function activeProvider(data) {
      const list = shownProviders(data);
      const selection = selectionValue;
      if (selection && selection.provider) {
        const exact = list.find(
          (provider) => provider.provider === selection.provider || provider.id === selection.provider,
        );
        if (exact) return exact;
        const kind = kindOf(selection.provider);
        const match = list.find((provider) => provider.kind === kind);
        if (match) return match;
      }
      return list.find((provider) => provider.active) ?? list.find((provider) => worstPercent(provider) !== null) ?? null;
    }

    /**
     * Exact reset readout: countdown down to the minute, then the local clock
     * time it lands on, e.g. "dans 4 h 58 min (20:09)".
     */
    /**
     * Reset readout: a compact duration for the row, and the full sentence for
     * the row's tooltip so the panel never wraps.
     */
    function resetParts(iso) {
      if (!iso) return null;
      const at = new Date(iso);
      if (Number.isNaN(at.getTime())) return null;
      const totalMinutes = Math.round((at.getTime() - Date.now()) / 60000);
      const clock = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      if (totalMinutes <= 0) return { shortKey: 'reset.done', shortParams: { time: clock }, fullKey: 'reset.done', fullParams: { time: clock } };
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      if (days > 0) {
        const params = { days, hours, time: clock };
        return { shortKey: 'duration.daysHours', shortParams: params, fullKey: 'reset.in', fullParams: params };
      }
      if (hours > 0) {
        const params = { hours, minutes: String(minutes).padStart(2, '0'), time: clock };
        return { shortKey: 'duration.hoursMinutes', shortParams: params, fullKey: 'reset.in', fullParams: params };
      }
      const params = { minutes, time: clock };
      return { shortKey: 'duration.minutes', shortParams: params, fullKey: 'reset.in', fullParams: params };
    }

    /* ── shared open state between the dock trigger and the overlay panel ── */

    const store = { open: false, anchor: null, data: null, error: null };
    const listeners = new Set();
    const emit = () => {
      for (const listener of listeners) listener();
    };

    function patch(next) {
      Object.assign(store, next);
      emit();
    }

    function useStore() {
      const [, force] = useState(0);
      useEffect(() => {
        const listener = () => force((n) => n + 1);
        listeners.add(listener);
        return () => listeners.delete(listener);
      }, []);
      return store;
    }

    function ring(percent) {
      const value = typeof percent === 'number' ? percent : 0;
      return h('svg', { viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': true },
        h('circle', { className: 'mqp_track', cx: 7, cy: 7, r: RADIUS }),
        h('circle', {
          className: 'mqp_fill', cx: 7, cy: 7, r: RADIUS,
          strokeDasharray: `${(CIRCUMFERENCE * value) / 100} ${CIRCUMFERENCE}`,
          transform: 'rotate(-90 7 7)',
        }));
    }

    /* ── trigger ──────────────────────────────────────────────────────── */

    function QuotaMeter() {
      const current = useStore();
      useStyles();
      const rootRef = useRef(null);

      useEffect(() => {
        let alive = true;
        const run = async () => {
          try {
            const data = await readQuotas();
                if (alive) patch({ data, error: null });
          } catch (error) {
                if (alive) patch({ error: error && error.message ? error.message : String(error) });
          }
        };
        void run();
        const timer = setInterval(() => void run(), 20_000);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, []);

      const providers = shownProviders(current.data);
      const active = activeProvider(current.data);
      const percent = worstPercent(active);
      const reading = percent === null ? '—' : percent + ' %';

      const toggle = useCallback(() => {
        if (store.open) {
          patch({ open: false, anchor: null });
          return;
        }
        const node = rootRef.current;
        const rect = node ? node.getBoundingClientRect() : null;
        patch({
          open: true,
          anchor: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null,
        });
      }, []);

      return h('span', { ref: rootRef, className: 'mqp_root' },
        h('button', {
          type: 'button',
          className: 'mqp_trigger',
          title: providers.length === 0 ? translate(current.data, 'panel.noData') : translate(current.data, 'panel.title'),
          'aria-label': translate(current.data, 'panel.title') + ' : ' + reading,
          'aria-haspopup': 'dialog',
          'aria-expanded': current.open ? 'true' : 'false',
          onClick: toggle,
        },
        ring(percent),
        h('span', null, reading)));
    }

    /* ── panel, rendered in the frame-wide overlay layer ──────────────── */

    function QuotaPanel() {
      const current = useStore();
      useStyles();
      const panelRef = useRef(null);

      useEffect(() => {
        if (!current.open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') patch({ open: false, anchor: null });
        };
        const onPointerDown = (event) => {
          if (panelRef.current && panelRef.current.contains(event.target)) return;
          if (event.target instanceof Element && event.target.closest('.mqp_root')) return;
          patch({ open: false, anchor: null });
        };
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown, true);
          document.removeEventListener('pointerdown', onPointerDown, true);
        };
      }, [current.open]);

      if (!current.open) return null;

      const anchor = current.anchor;
      const style = { position: 'fixed' };
      if (anchor) {
        const left = Math.max(8, Math.min(window.innerWidth - PANEL_WIDTH - 8, anchor.right - PANEL_WIDTH));
        style.left = left;
        if (anchor.top > 260) style.bottom = window.innerHeight - anchor.top + 8;
        else style.top = anchor.bottom + 8;
      }

      const providers = shownProviders(current.data);
      const active = activeProvider(current.data);
      const ordered = active ? [active, ...providers.filter((provider) => provider !== active)] : providers;
      const percent = worstPercent(active);
      const windows = providerWindows(active);
      const tints = ['mqp_t1', 'mqp_t2', 'mqp_t3'];

      return h('div', {
        ref: panelRef,
        className: 'mqp_panel',
        style,
        role: 'dialog',
        'aria-label': translate(current.data, 'panel.title'),
      },
      ordered.length === 0
        ? h('div', { className: 'mqp_empty' }, current.error
            ? translate(current.data, 'panel.unavailable') + ' : ' + current.error
            : translate(current.data, 'panel.noData'))
        : ordered.map((provider, index) => {
            const providerPercent = worstPercent(provider);
            const providerWindowsList = providerWindows(provider);
            const isFirst = index === 0;
            return h('div', { className: 'mqp_section', key: provider.id },
              isFirst
                ? h('div', { className: 'mqp_header', title: staleTitle(provider, current.data) },
                    h('span', { className: 'mqp_headline' }, provider.label),
                    h('span', { className: 'mqp_percent' }, providerPercent === null ? '—' : providerPercent + ' %'),
                    h('span', { className: 'mqp_headline' }, translate(current.data, 'panel.used')))
                : h('div', { className: 'mqp_section_head', title: staleTitle(provider, current.data) },
                    h('span', null, provider.label),
                    provider.plan ? h('span', { className: 'mqp_section_plan' }, provider.plan) : null,
                    h('span', { className: 'mqp_percent', style: { marginLeft: 'auto' } },
                      providerPercent === null ? '—' : providerPercent + ' %')),

              isFirst && providerWindowsList.length > 0
                ? h('div', { className: 'mqp_bar' },
                    providerWindowsList.map((window, windowIndex) =>
                      h('div', {
                        key: provider.id + '-' + windowIndex,
                        className: 'mqp_segment ' + tints[windowIndex % tints.length],
                        style: { width: window.usedPct + '%' },
                      })))
                : null,

              h('dl', { className: 'mqp_rows' },
                providerWindowsList.length > 0
                  ? providerWindowsList.map((window, windowIndex) => {
                      const reset = resetParts(window.resetsAt);
                      return h('div', { className: 'mqp_row', key: provider.id + '-row-' + windowIndex },
                        h('dt', null,
                          h('span', {
                            className: 'mqp_swatch ' + tints[windowIndex % tints.length],
                            'aria-hidden': true,
                          }),
                          windowText(current.data, window)),
                        h('dd', { title: reset ? translate(current.data, reset.fullKey, reset.fullParams) : undefined },
                          window.usedPct + ' %',
                          reset
                            ? h('span', { className: 'mqp_reset' }, ' · ' + translate(current.data, reset.shortKey, reset.shortParams))
                            : null));
                    })
                  : h('div', { className: 'mqp_row' },
                      h('dt', null, translate(current.data, 'panel.state')),
                      h('dd', null, provider.reason ?? '—'))),

              provider.status === 'error' && provider.reason
                ? h('div', { className: 'mqp_note' }, provider.reason)
                : null);
          }),

      current.data && current.data.session && Array.isArray(current.data.session.models) && current.data.session.models.length > 0
        ? h('div', { className: 'mqp_section' },
            h('div', { className: 'mqp_header' },
              h('span', { className: 'mqp_headline' }, translate(current.data, 'panel.sessionCost')),
              h('span', { className: 'mqp_percent' }, money(current.data.session.totalUsd, current.data)),
              h('span', { className: 'mqp_headline' }, translate(current.data, 'panel.estimate'))),
            h('dl', { className: 'mqp_rows' },
              current.data.session.models.map((model, index) =>
                h('div', { className: 'mqp_row', key: 'cost-' + index },
                  h('dt', { title: (model.provider || '') + ' / ' + (model.model || '') },
                    h('span', { className: 'mqp_swatch ' + tints[index % tints.length], 'aria-hidden': true }),
                    model.model || translate(current.data, 'panel.state')),
                  h('dd', null, model.priced ? money(model.costUsd, current.data) : '—')))))
        : null);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Follow the Session actually shown: the meter must describe the
        // subscription of the model this conversation uses, not the profile
        // default (which can point at another provider entirely).
        let lastKey = '\u0000';
        const syncSelection = () => {
          const selection = readSelection(ctx);
          const key = selection ? `${selection.provider}/${selection.model ?? ''}` : '';
          if (key === lastKey) return;
          lastKey = key;
          selectionValue = selection;
          patch({});

        };
        syncSelection();
        const selectionPoll = setInterval(syncSelection, 2000);
        ctx.effect(() => () => clearInterval(selectionPoll), 'model-quota-panel: session selection');

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'model-quota-meter',
          order: 50,
          label: 'Quotas d’abonnement',
        }, QuotaMeter));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'model-quota-meter-panel',
          order: 500,
          label: 'Quotas d’abonnement (panneau)',
        }, QuotaPanel));
      },
    };
  },
});





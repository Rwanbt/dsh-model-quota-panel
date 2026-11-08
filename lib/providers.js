/**
 * Provider classification and normalisation helpers.
 * Pure functions: no I/O, no Node imports.
 */

export const KIND_LABEL = {
  'opencode-go': 'OpenCode Go',
  anthropic: 'Claude',
  'openai-codex': 'Codex (ChatGPT)',
  minimax: 'MiniMax',
  zai: 'Z.ai (GLM)',
  'github-copilot': 'GitHub Copilot',
  openrouter: 'OpenRouter',
  moonshot: 'Moonshot / Kimi',
};

/**
 * Classify one configured provider instance.
 * `opencode` wins over `anthropic-messages`, because OpenCode serves Anthropic
 * shaped models under its own quota.
 * @param {string} id - provider id from the profile.
 * @param {{displayName?: string, baseURL?: string, api?: string}} config
 * @returns {string|null} quota family, or null when the vendor has no adapter.
 */
export function kindOfProvider(id, config = {}) {
  const hay = `${id} ${config?.displayName ?? ''} ${config?.baseURL ?? ''}`.toLowerCase();
  if (hay.includes('opencode')) return 'opencode-go';
  if (hay.includes('anthropic') || hay.includes('claude')) return 'anthropic';
  if (hay.includes('codex')) return 'openai-codex';
  if (hay.includes('minimax')) return 'minimax';
  if (hay.includes('zai') || hay.includes('z.ai') || hay.includes('glm')) return 'zai';
  if (hay.includes('copilot')) return 'github-copilot';
  if (hay.includes('openrouter')) return 'openrouter';
  if (hay.includes('moonshot') || hay.includes('kimi')) return 'moonshot';
  if (config?.api === 'anthropic-messages') return 'anthropic';
  return null;
}

/**
 * Map a model-provider id (as recorded by a Session) to its quota family.
 * @param {string|undefined} provider
 * @returns {string|null}
 */
export function kindOfModelProvider(provider) {
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

/**
 * Card label for every instance: the configured display name when present,
 * otherwise the family label, otherwise the raw id.
 * @param {Array<{id: string, kind: string, config?: {displayName?: string}}>} instances
 * @returns {Array<Object>} the same instances, each with `label`.
 */
export function labelInstances(instances) {
  return (instances ?? []).map((instance) => ({
    ...instance,
    label:
      instance?.config?.displayName ||
      KIND_LABEL[instance?.kind] ||
      instance?.id ||
      'unknown',
  }));
}

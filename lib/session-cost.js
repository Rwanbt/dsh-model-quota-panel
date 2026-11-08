/**
 * Session cost estimation from a DSH session log.
 *
 * The durable log records, in order:
 *   - `model/selection` / `request/context`: the provider and model in force,
 *   - `assistant/attempt`: a stream whose `usage` chunks carry token counts,
 *   - `assistant/message`: the settled message, which also carries `usage`.
 *
 * The settled message and the attempt describe the same step, so usage is keyed
 * per `turn/step` and the last reading wins — never summed twice. Folding then
 * gives a **per-model** breakdown that stays correct when the model changes.
 *
 * Pure function: no I/O, no Node imports.
 */

import { costOf, priceOf } from './prices.js';
import { kindOfModelProvider } from './providers.js';

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Price table lookup tolerant of the provider id a session records. */
function priceFor(provider, model, prices) {
  return priceOf(provider, model, prices) ?? priceOf(kindOfModelProvider(provider), model, prices);
}

function emptyUsage() {
  return { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function addUsage(target, usage) {
  target.uncachedInputTokens += count(usage?.inputTokens);
  target.outputTokens += count(usage?.outputTokens);
  target.cacheReadTokens += count(usage?.cacheReadTokens);
  target.cacheWriteTokens += count(usage?.cacheWriteTokens);
}

/**
 * Fold one session's events into per-model token usage and cost.
 * @param {Array<Object>} events - parsed JSONL events, in log order.
 * @param {Record<string, Record<string, Object>>} [prices]
 * @returns {{models: Array<Object>, totalUsd: number, unpricedModels: string[]}}
 */
export function foldSessionCost(events, prices) {
  let current = null;
  /** Least-recent usage per step, so an attempt and its settled message count once. */
  const byStep = new Map();

  const record = (event, usage) => {
    if (!usage) return;
    const data = event.data && typeof event.data === 'object' ? event.data : {};
    const key = `${data.turn ?? '?'}/${data.step ?? '?'}`;
    byStep.set(key, {
      provider: current?.provider ?? null,
      model: current?.model ?? null,
      usage: {
        uncachedInputTokens: count(usage.inputTokens),
        outputTokens: count(usage.outputTokens),
        cacheReadTokens: count(usage.cacheReadTokens),
        cacheWriteTokens: count(usage.cacheWriteTokens),
      },
    });
  };

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    const data = event.data && typeof event.data === 'object' ? event.data : {};

    if (event.type === 'model/selection' || event.type === 'request/context') {
      if (typeof data.provider === 'string' && typeof data.model === 'string') {
        current = { provider: data.provider, model: data.model };
      }
      continue;
    }

    if (event.type === 'assistant/message') {
      record(event, data.usage ?? data.message?.usage ?? null);
      continue;
    }

    if (event.type !== 'assistant/attempt') continue;
    const stream = Array.isArray(data.stream) ? data.stream : [];
    const merged = emptyUsage();
    let found = false;
    for (const item of stream) {
      const chunk = item && item.chunk;
      if (!chunk || chunk.type !== 'usage' || !chunk.usage) continue;
      addUsage(merged, chunk.usage);
      found = true;
    }
    if (found) {
      record(event, {
        inputTokens: merged.uncachedInputTokens,
        outputTokens: merged.outputTokens,
        cacheReadTokens: merged.cacheReadTokens,
        cacheWriteTokens: merged.cacheWriteTokens,
      });
    }
  }

  const buckets = new Map();
  for (const step of byStep.values()) {
    const { provider, model, usage } = step;
    const total = usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    if (total === 0) continue;
    const key = `${provider ?? 'unknown'}/${model ?? 'unknown'}`;
    const bucket = buckets.get(key) ?? { provider, model, ...emptyUsage() };
    bucket.uncachedInputTokens += usage.uncachedInputTokens;
    bucket.outputTokens += usage.outputTokens;
    bucket.cacheReadTokens += usage.cacheReadTokens;
    bucket.cacheWriteTokens += usage.cacheWriteTokens;
    buckets.set(key, bucket);
  }

  const models = [];
  const unpricedModels = [];
  for (const bucket of buckets.values()) {
    const price = priceFor(bucket.provider, bucket.model, prices);
    if (!price) unpricedModels.push(`${bucket.provider ?? '?'}/${bucket.model ?? '?'}`);
    models.push({
      ...bucket,
      priced: Boolean(price),
      costUsd: price ? costOf(bucket, price) : 0,
    });
  }

  models.sort((a, b) => b.costUsd - a.costUsd);
  return {
    models,
    totalUsd: models.reduce((sum, model) => sum + model.costUsd, 0),
    unpricedModels,
  };
}

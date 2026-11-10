// netlify/functions/_shared/thinking-guide/spend.mjs
// The guide's spend log: token usage per call, summed per month in the thread store's _ops area
// (thinking-threads/v1/{owner}/_ops/guide-spend-YYYY-MM.json), priced in A$ from pricing.mjs.
import { audFor } from './pricing.mjs';

/** The month a call counts in, on Sydney time ('2026-11'). */
export function monthKey(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}

const metaName = (month) => `guide-spend-${month}`;
const empty = (month) => ({ month, calls: 0, inputTokens: 0, outputTokens: 0, aud: 0, byKind: {} });

/** Tokens billed at the input rate: plain input plus any cache writes and reads (counted at full rate). */
export function inputTokensOf(usage) {
  return ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((sum, key) => sum + (Number(usage?.[key]) || 0), 0);
}

/** Add one call to this month's log. Best-effort: a store without meta support is skipped. */
export async function recordSpend(store, owner, { model, usage, kind = 'call', now }) {
  if (!store?.getMeta || !store?.setMeta || !usage) return null;
  const month = monthKey(now);
  const input = inputTokensOf(usage);
  const output = Number(usage.output_tokens) || 0;
  const aud = audFor(model, { input, output }) ?? 0;
  const prior = (await store.getMeta(owner, metaName(month))) ?? empty(month);
  const next = {
    ...empty(month),
    ...prior,
    calls: (prior.calls ?? 0) + 1,
    inputTokens: (prior.inputTokens ?? 0) + input,
    outputTokens: (prior.outputTokens ?? 0) + output,
    aud: Number(((prior.aud ?? 0) + aud).toFixed(6)),
    byKind: { ...(prior.byKind ?? {}), [kind]: ((prior.byKind ?? {})[kind] ?? 0) + 1 },
    updatedAt: now
  };
  await store.setMeta(owner, metaName(month), next);
  return next;
}

/** This month's spend line: { month, aud, calls }. */
export async function readSpend(store, owner, now) {
  const month = monthKey(now);
  const row = store?.getMeta ? await store.getMeta(owner, metaName(month)) : null;
  return { month, aud: Number((row?.aud ?? 0).toFixed(4)), calls: row?.calls ?? 0 };
}

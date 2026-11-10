// packages/protocol-view/cost.mjs
// What a protocol run costs, from the token usage logged on past runs. Pure and browser-safe.
//
// Server: GET /api/knowledge/protocols?costs=1 returns { costs: { "<protocolId>:<mode>": { aud, runs } } },
// the median A$ of completed runs (see `medianCosts`; only keys with at least MIN_RUNS runs appear).
// Browser: `loadProtocolCosts()` fetches that once and caches it; `protocolCost(protocolId, mode)`
// is synchronous and reads the cache, so it returns null until the load has resolved (the
// card then says "no cost data yet", the same as when there are too few runs).
import { audFor } from '../thinking-map/pricing.mjs';

export const MIN_RUNS = 3;

/** A$ for one session's `usage` ({ byModel: { model: { input, output } } }); null when unpriced or empty. */
export function sessionAud(usage) {
  const rows = Object.entries(usage?.byModel ?? {});
  if (!rows.length) return null;
  let total = 0;
  for (const [model, tokens] of rows) {
    const aud = audFor(model, tokens);
    if (aud === null) return null;
    total += aud;
  }
  return total;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median cost per "protocolId:mode" across completed runs with priced usage; keys with fewer than `minRuns` are left out. */
export function medianCosts(rows, minRuns = MIN_RUNS) {
  const groups = new Map();
  for (const row of rows ?? []) {
    if (row?.status !== 'completed' || !row.protocolId || !row.mode) continue;
    const aud = sessionAud(row.usage);
    if (aud === null) continue;
    const key = `${row.protocolId}:${row.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), aud]);
  }
  const out = {};
  for (const [key, values] of groups) {
    if (values.length >= minRuns) out[key] = { aud: median(values), runs: values.length };
  }
  return out;
}

let cache = {};

/** Replace the cached medians (used by the loader and by tests). */
export function setProtocolCosts(costs) {
  cache = costs && typeof costs === 'object' ? { ...costs } : {};
}

/** { aud, runs } for a protocol and mode, or null when fewer than three runs are logged (or nothing is loaded yet). */
export function protocolCost(protocolId, mode) {
  const row = cache[`${protocolId}:${mode}`];
  return row && Number.isFinite(row.aud) && row.runs >= MIN_RUNS ? { aud: row.aud, runs: row.runs } : null;
}

/** Fetch and cache the medians. Resolves to the cache; a failed fetch leaves it as it was. */
export async function loadProtocolCosts({ apiBase = '/api/knowledge', fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(`${apiBase}/protocols?costs=1`, { credentials: 'include' });
    const body = await response.json();
    if (response.ok && body?.data?.costs) setProtocolCosts(body.data.costs);
  } catch { /* the card says "no cost data yet" */ }
  return cache;
}

/** "A$0.42" for the button label. */
export function formatAud(aud) {
  return `A$${aud < 0.1 ? aud.toFixed(3) : aud.toFixed(2)}`;
}

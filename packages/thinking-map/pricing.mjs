// packages/thinking-map/pricing.mjs
// Per-token prices for the models the thinking threads pay for, and the A$ conversion. Shared
// by the guide's spend log (netlify/functions/_shared/thinking-guide/spend.mjs) and the
// protocol cost estimate (packages/protocol-view/cost.mjs).
//
// Source: Anthropic first-party API list prices, USD per million tokens, as given by the
// claude-api skill's model table (cached 3 November 2026). Haiku 5.5's rates hold for prompts
// up to 100K tokens ($0.50 / $2.50 beyond); the guide's prompts stay far under that.

export const PRICES_USD_PER_MTOK = Object.freeze({
  'claude-haiku-5-5': Object.freeze({ input: 0.10, output: 0.50 }),
  'claude-sonnet-5-5': Object.freeze({ input: 2.00, output: 10.00 }),
  'claude-sonnet-5': Object.freeze({ input: 2.00, output: 10.00 }),
  'claude-sonnet-4-6': Object.freeze({ input: 3.00, output: 15.00 }),
  'claude-opus-5-5': Object.freeze({ input: 4.00, output: 20.00 }),
  'claude-opus-5': Object.freeze({ input: 5.00, output: 25.00 })
});

/** USD to AUD, set 10 November 2026. Approximate; update when the rate moves far. */
export const USD_TO_AUD = 1.55;

/** A$ for one call's usage on `model`, or null for a model with no price here. */
export function audFor(model, { input = 0, output = 0 } = {}) {
  const price = PRICES_USD_PER_MTOK[model];
  if (!price) return null;
  const usd = (Math.max(0, Number(input) || 0) * price.input + Math.max(0, Number(output) || 0) * price.output) / 1_000_000;
  return usd * USD_TO_AUD;
}

// netlify/functions/_shared/thinking-guide/pricing.mjs
// The guide's prices: the shared table in packages/thinking-map/pricing.mjs (also read by the
// protocol cost estimate), re-exported for server code.
export { PRICES_USD_PER_MTOK, USD_TO_AUD, audFor } from '../../../../packages/thinking-map/pricing.mjs';

/** The guide's model. */
export const GUIDE_MODEL = 'claude-haiku-5-5';

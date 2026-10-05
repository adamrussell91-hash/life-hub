/**
 * Offer-first readiness insights for the Life agents.
 *
 * Adam decides whether he wants to hear an insight:
 *   1. An agent with an eligible insight is told only its TOPIC and may offer it once,
 *      in one short line ("I've noticed something about … — want to hear it?").
 *   2. If Adam's next message says yes (within OFFER_TTL_MS), the FINDING is given to the
 *      agent to share. "No" quiets that insight for DECLINE_QUIET_DAYS.
 *   3. Asking outright ("any insights?", "noticed any patterns?") reveals that agent's
 *      insights without an offer.
 * An insight is offered at most once every OFFER_COOLDOWN_DAYS. The finding never
 * reaches the prompt before a yes, so it cannot leak into a reply.
 * Pure: callers load and save `state` (tasks store) around the turn.
 */

export const OFFER_TTL_MS = 3 * 60 * 60 * 1000;
export const OFFER_COOLDOWN_DAYS = 7;
export const DECLINE_QUIET_DAYS = 30;
const DAY_MS = 86_400_000;

const YES = /^\s*(?:y(?:es|eah|ep|up)?|sure|ok(?:ay)?|go on|go ahead|tell me|please|yes please|what is it|what(?:'s| is) that|i'?d like (?:that|to)|why not|hit me|share it|go for it)\b/i;
const NO = /^\s*(?:no|nah|nope|not now|later|maybe later|not today|skip|don'?t|i'?m (?:good|fine))\b/i;
const ASK = /\b(?:insights?|patterns?|noticed (?:anything|something)|notice anything|what have you noticed|anything you'?ve noticed)\b/i;

const key = (slug, id) => `${slug}:${id}`;
const ago = (iso, now) => now.getTime() - Date.parse(iso ?? '');

/** Insights this agent may talk about. */
export function insightsFor(slug, insights) {
  return (insights ?? []).filter(i => Array.isArray(i?.agents) && i.agents.includes(slug));
}

function revealBlock(items) {
  return [
    'Readiness insight — Adam has said he wants to hear this. Share it now, briefly, in your own voice:',
    ...items.map(i => `- ${i.finding}`),
    'Frame it as a pattern you noticed, not a cause or a judgement. No shaming (food especially). Offer one practical next step only if he wants one.'
  ].join('\n');
}

function offerBlock(item) {
  return [
    `Readiness insight available — topic: ${item.topic}.`,
    'You do NOT know the finding yet and must not guess or hint at it.',
    `If it fits naturally, end your reply with one short offer, e.g. “I’ve noticed something about ${item.topic} — want to hear it?”`,
    'Skip the offer if Adam is upset, rushed, or in the middle of something else.'
  ].join('\n');
}

/**
 * @param {{ slug: string, message: string, insights: object[], state?: object, now?: Date, enabled?: boolean }} input
 * @returns {{ promptBlock: string, state: object, event: null | { kind: 'offered'|'revealed'|'declined', ids: string[] } }}
 */
export function insightTurn({ slug, message, insights, state = {}, now = new Date(), enabled = true }) {
  const next = { offers: { ...(state.offers ?? {}) }, pending: { ...(state.pending ?? {}) } };
  if (!enabled) return { promptBlock: '', state: next, event: null };
  const mine = insightsFor(slug, insights);
  const text = String(message ?? '');

  // A pending offer from this agent: Adam's reply decides.
  const pending = next.pending[slug];
  if (pending && ago(pending.offered_at, now) <= OFFER_TTL_MS) {
    const item = mine.find(i => i.id === pending.id);
    if (item && YES.test(text)) {
      delete next.pending[slug];
      next.offers[key(slug, item.id)] = { ...(next.offers[key(slug, item.id)] ?? {}), response: 'accepted', responded_at: now.toISOString() };
      return { promptBlock: revealBlock([item]), state: next, event: { kind: 'revealed', ids: [item.id] } };
    }
    if (NO.test(text)) {
      delete next.pending[slug];
      next.offers[key(slug, pending.id)] = { ...(next.offers[key(slug, pending.id)] ?? {}), response: 'declined', responded_at: now.toISOString() };
      return { promptBlock: 'Adam declined the insight you offered. Do not bring it up again.', state: next, event: { kind: 'declined', ids: [pending.id] } };
    }
  }
  if (pending && ago(pending.offered_at, now) > OFFER_TTL_MS) delete next.pending[slug];

  // Asking outright: share what this agent has, no offer needed.
  if (mine.length && ASK.test(text)) {
    delete next.pending[slug];
    for (const i of mine) next.offers[key(slug, i.id)] = { ...(next.offers[key(slug, i.id)] ?? {}), response: 'asked', responded_at: now.toISOString() };
    return { promptBlock: revealBlock(mine), state: next, event: { kind: 'revealed', ids: mine.map(i => i.id) } };
  }

  // Otherwise: offer at most one, respecting cooldowns.
  const eligible = mine.find(i => {
    const seen = next.offers[key(slug, i.id)];
    if (!seen) return true;
    if (seen.response === 'declined' && ago(seen.responded_at, now) < DECLINE_QUIET_DAYS * DAY_MS) return false;
    return ago(seen.offered_at ?? seen.responded_at, now) >= OFFER_COOLDOWN_DAYS * DAY_MS;
  });
  if (!eligible || next.pending[slug]) return { promptBlock: '', state: next, event: null };
  next.pending[slug] = { id: eligible.id, offered_at: now.toISOString() };
  next.offers[key(slug, eligible.id)] = { offered_at: now.toISOString() };
  return { promptBlock: offerBlock(eligible), state: next, event: { kind: 'offered', ids: [eligible.id] } };
}

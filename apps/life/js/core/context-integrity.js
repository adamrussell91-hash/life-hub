/**
 * Thin context-integrity helpers for Life Hub agent pipelines.
 * Not a memory OS — markers, Delivery checks, and Goodhart-resistant Behaviour fixtures.
 */

/** Injected into the model system prompt when Central Node load fails for the turn. */
export const CENTRAL_NODE_UNAVAILABLE_MARKER =
  '[Central Node unavailable this turn — repository load failed. Do not invent Status, Flags, or Cross-Agent directives.]';

/** HTML comment written into Central Node when Cross-Agent lines are trimmed. */
export function crossAgentTruncationComment({ kept, omitted }) {
  return `<!-- life-hub:cross-agent-truncated kept=${kept} omitted=${omitted} -->`;
}

/**
 * Deterministic Behaviour fixture: given active constraint text and a proposed
 * recommendation, fail if the recommendation matches a forbidden pattern that
 * would treat the constraint as absent.
 *
 * Goodhart-resistant: does NOT require mentioning "pain" or any keyword.
 * Callers supply domain-specific mustNotPatterns (RegExp or string).
 */
export function evaluateConstraintBehaviour({
  constraintPresent,
  recommendation,
  mustNotPatterns = [],
  mustPatterns = []
} = {}) {
  const text = String(recommendation ?? '');
  const violations = [];

  if (constraintPresent) {
    for (const pattern of mustNotPatterns) {
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
      if (re.test(text)) {
        violations.push({ type: 'must-not', pattern: String(pattern) });
      }
    }
    for (const pattern of mustPatterns) {
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
      if (!re.test(text)) {
        violations.push({ type: 'must', pattern: String(pattern) });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations
  };
}

/**
 * Delivery assertion helper: selected context must appear in the final system string.
 */
export function assertContextDelivered(systemPrompt, needle, label = 'context') {
  const haystack = String(systemPrompt ?? '');
  const required = String(needle ?? '');
  if (!required || !haystack.includes(required)) {
    const err = new Error(`Delivery failed: ${label} did not reach final system prompt`);
    err.code = 'CONTEXT_DELIVERY_FAILED';
    throw err;
  }
}

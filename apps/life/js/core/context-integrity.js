/**
 * Thin context-integrity helpers for Life Hub agent pipelines.
 * Not a memory OS — markers, Delivery checks, and Goodhart-resistant Behaviour fixtures.
 */

/** Injected into the model system prompt when Central Node load fails for the turn. */
export const CENTRAL_NODE_UNAVAILABLE_MARKER =
  '[Central Node unavailable this turn — repository load failed. Do not invent Status, Flags, or Cross-Agent directives.]';

/** Injected when the whole Other hubs snapshot fails to load (loader threw). */
export const HUB_CONTEXT_UNAVAILABLE_MARKER =
  '[Other hubs unavailable this turn — umbrella store load failed. Do not invent Tasks or Teaching rows.]';

export const HUB_TASKS_UNAVAILABLE_MARKER =
  '[Other hubs: Tasks unavailable this turn — store load failed. Do not invent Tasks rows.]';

export const HUB_TEACHING_CLASSES_UNAVAILABLE_MARKER =
  '[Other hubs: Teaching classes unavailable this turn — store load failed. Do not invent class rows.]';

export const HUB_TEACHING_LESSONS_UNAVAILABLE_MARKER =
  '[Other hubs: Teaching lessons unavailable this turn — store load failed. Do not invent lesson rows.]';

export function hubContextTruncationLine({ label, kept, omitted } = {}) {
  return `[Other hubs: ${label} truncated kept=${kept} omitted=${omitted}. This is not the complete set.]`;
}

export function hubLessonsWindowLine({ until, omitted } = {}) {
  return `[Other hubs: Teaching lessons window ends ${until}; omitted=${omitted} later scheduled. This is not the complete upcoming set.]`;
}

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

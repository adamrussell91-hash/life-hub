// packages/decision-book/families/common.mjs
// What every Decision Book family factory shares: config checks, the frozen tool shell that
// meets Problem Solver's tool contract (machine.mjs), the optional opening `subject` slot and
// the closing `reflection` slot. A family adds its own slots, tags, checks and completeness.
import { countSlots, hasSlot, parseSlot } from '../../problem-solver/slots.mjs';

/** Fills a chart may use, all drawn from the `.dm-scope` tokens. */
export const FILLS = Object.freeze(['red', 'green', 'ink', 'tint']);

export const nameOf = (node) => parseSlot(node?.slot)?.name;
export const indexOf = (node) => parseSlot(node?.slot)?.index ?? 0;
export const bySlot = (a, b) => indexOf(a) - indexOf(b);

/** Placed nodes in one slot family, in slot order. */
export function nodesIn(run, name) {
  return run.nodes.filter((node) => nameOf(node) === name).sort(bySlot);
}

/** Throws a config error naming the tool, so a bad model config fails at import, not mid-session. */
export function check(condition, id, message) {
  if (!condition) throw new Error(`Decision Book tool ${id}: ${message}`);
}

/** Ids are slot names and tags: lower case words joined by underscores. */
export const isKey = (value) => typeof value === 'string' && /^[a-z]+(_[a-z]+)*$/.test(value);

/** Deep-freeze plain config data (arrays and objects), so a chart config cannot drift at run time. */
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) freeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** The fields every model config carries, checked once. */
export function checkCommon(config) {
  const { id } = config;
  check(typeof id === 'string' && id.startsWith('dm_'), id, 'ids start with dm_');
  check(typeof config.name === 'string' && config.name, id, 'needs a name');
  check(typeof config.when === 'string' && config.when, id, 'needs a "use it when" line');
  check(Array.isArray(config.steps) && config.steps.length > 0, id, 'needs coaching steps');
  check(['worksheet', 'lens'].includes(config.tier ?? 'worksheet'), id, 'tier is worksheet or lens');
  check(config.chart && typeof config.chart === 'object', id, 'needs a chart config');
}

/**
 * The slots that frame a family's own: an optional `subject` first (what the model is applied
 * to) and a `reflection` last (what the chart says about the decision), on by default.
 */
export function framing(config) {
  const subject = config.chart.subject ?? null;
  const reflection = config.chart.reflection === false ? null : (config.chart.reflection ?? 'What this shows about the decision');
  return { subject, reflection };
}

/** Before the family's own slots: the subject, if it is asked for and not yet given. */
export function subjectFirst(run, subject) {
  return subject && !hasSlot(run, 'subject') ? ['subject'] : null;
}

/** True when the chart has its reflection, or needs none. */
export function reflected(run, reflection) {
  return !reflection || countSlots(run, 'reflection') === 1;
}

/**
 * The frozen tool definition. `slots` holds the family's own slot descriptions; the subject
 * and reflection descriptions are added around them. Everything in `extra` (nextSlots,
 * complete, nodeTags, validateNode, scores …) passes through unchanged.
 */
export function baseTool(config, family, slots, extra) {
  checkCommon(config);
  const { subject, reflection } = framing(config);
  return Object.freeze({
    id: config.id,
    name: config.name,
    kind: config.kind ?? 'decision',
    step: 'explore',
    family,
    tier: config.tier ?? 'worksheet',
    when: config.when,
    failureModes: freeze([...(config.failureModes ?? [])]),
    steps: freeze(config.steps.map((s) => ({ ...s }))),
    chart: freeze(structuredClone(config.chart)),
    slots: freeze({ ...(subject ? { subject } : {}), ...slots, ...(reflection ? { reflection } : {}) }),
    ...extra,
    edgeKinds: freeze([...(extra.edgeKinds ?? [])])
  });
}

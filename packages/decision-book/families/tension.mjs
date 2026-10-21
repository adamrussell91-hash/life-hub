// packages/decision-book/families/tension.mjs
// The tension family: forces set against each other around a `centre` (the situation).
//   pull      two sides pulling opposite ways (what holds you, what pulls you), equal arrows:
//             the kit forbids inventing a numeric balance.
//   gap       two sides with the gap between them named (belief and action, expected and actual).
//   triangle  three corners of which the person fixes `pick` (the project triangle: pick two).
// Each `force` is tagged with its side. In a triangle, `fix` slots name the fixed corners.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { FILLS, baseTool, check, checkCommon, framing, isKey, nodesIn, reflected } from './common.mjs';

const VARIANTS = Object.freeze({ pull: 2, gap: 2, triangle: 3 });

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {'pull'|'gap'|'triangle'} config.chart.variant
 * @param {string} config.chart.centre what the centre holds
 * @param {{id: string, label: string, fill: string}[]} config.chart.sides
 * @param {string} [config.chart.gap] the gap's name (gap variant)
 * @param {number} [config.chart.pick] corners to fix (triangle, 2)
 * @param {number} [config.chart.perSide] forces per side (6)
 */
export function tensionTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(chart.variant in VARIANTS, id, `variant is one of ${Object.keys(VARIANTS).join(', ')}`);
  check(Array.isArray(chart.sides) && chart.sides.length === VARIANTS[chart.variant], id, `a ${chart.variant} has ${VARIANTS[chart.variant]} sides`);
  for (const side of chart.sides) {
    check(isKey(side.id) && side.label, id, `side ${side.id} needs a key and a label`);
    check(FILLS.includes(side.fill), id, `side ${side.id} fill must be one of ${FILLS.join(', ')}`);
  }
  check(typeof chart.centre === 'string' && chart.centre, id, 'needs a centre description');
  if (chart.variant === 'gap') check(typeof chart.gap === 'string' && chart.gap, id, 'a gap needs a name');
  const triangle = chart.variant === 'triangle';
  const pick = chart.pick ?? 2;
  if (triangle) check(Number.isInteger(pick) && pick >= 1 && pick <= 2, id, 'pick is 1 or 2');
  const perSide = chart.perSide ?? 6;
  const sideIds = chart.sides.map((side) => side.id);
  check(!chart.subject, id, 'a tension chart starts from its centre, not a subject');
  const { reflection } = framing(config);

  const forcesOn = (run, side) => nodesIn(run, 'force').filter((node) => node.tag === side).length;
  const ready = (run) => sideIds.every((side) => forcesOn(run, side) >= 1) && (!triangle || countSlots(run, 'fix') === pick);

  return baseTool(config, 'tension', {
    centre: chart.centre,
    force: 'One force, on its side',
    ...(triangle ? { fix: 'A corner held fixed: the other must give' } : {})
  }, {
    nodeTags: { force: sideIds, ...(triangle ? { fix: sideIds } : {}) },
    validateNode(run, node) {
      const name = node.slot.split(':')[0];
      if (name === 'force' && forcesOn(run, node.tag) >= perSide) return `That side already has ${perSide} forces; merge or replace one.`;
      if (name === 'fix' && nodesIn(run, 'fix').some((fixed) => fixed.tag === node.tag)) return 'That corner is already fixed; fix a different one.';
      return null;
    },
    nextSlots(run) {
      if (!hasSlot(run, 'centre')) return ['centre'];
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'force', perSide * sideIds.length), triangle ? nextIndexed(run, 'fix', pick) : null, reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return hasSlot(run, 'centre') && ready(run) && reflected(run, reflection);
    }
  });
}

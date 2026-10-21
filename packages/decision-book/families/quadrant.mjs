// packages/decision-book/families/quadrant.mjs
// The quadrant family: a 2×2 on two labelled axes, with each entry (an `item` slot) tagged
// with the cell it sits in. Axis direction comes from config: `col` 0 is the x axis's low end
// (left) and `row` 0 is the y axis's high end (top), so a model's "logic" line such as
// "urgency rises to the right, importance upwards" is a checkable fact about its cells.
// A payoff variant (prisoner's dilemma) gives each cell a fixed `note` shown under its label.
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { FILLS, baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {{x: {label: string, low: string, high: string}, y: {label: string, low: string, high: string}}} config.chart.axes
 * @param {{id: string, label: string, col: 0|1, row: 0|1, fill: string, note?: string}[]} config.chart.cells
 * @param {string} config.chart.item what one entry is
 * @param {number} [config.chart.max] entries in all (16)
 * @param {number} [config.chart.minItems] entries before the reflection opens (3)
 * @param {number} [config.chart.minCells] distinct cells used before the reflection opens (2)
 */
export function quadrantTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(chart.axes?.x?.label && chart.axes?.y?.label, id, 'needs x and y axes with labels');
  for (const axis of ['x', 'y']) check(chart.axes[axis].low && chart.axes[axis].high, id, `axis ${axis} needs low and high words`);
  check(Array.isArray(chart.cells) && chart.cells.length === 4, id, 'needs exactly four cells');
  const places = new Set(chart.cells.map((cell) => `${cell.col}${cell.row}`));
  check(places.size === 4 && [...places].every((p) => /^[01][01]$/.test(p)), id, 'cells must fill the four places once');
  for (const cell of chart.cells) {
    check(isKey(cell.id), id, `cell id ${cell.id} must be a lower-case key`);
    check(typeof cell.label === 'string' && cell.label, id, `cell ${cell.id} needs a label`);
    check(FILLS.includes(cell.fill), id, `cell ${cell.id} fill must be one of ${FILLS.join(', ')}`);
  }
  check(typeof chart.item === 'string' && chart.item, id, 'needs an item description');
  const max = chart.max ?? 16;
  const minItems = chart.minItems ?? 3;
  const minCells = chart.minCells ?? 2;
  const cellIds = chart.cells.map((cell) => cell.id);
  const { subject, reflection } = framing(config);

  const ready = (run) => {
    const items = nodesIn(run, 'item');
    return items.length >= minItems && new Set(items.map((node) => node.tag)).size >= minCells;
  };

  return baseTool(config, 'quadrant', { item: chart.item }, {
    nodeTags: { item: cellIds },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'item', max), reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}

/** Item nodes per cell id, in slot order, for a quadrant tool's config. */
export function itemsByCell(run, chart) {
  const out = Object.fromEntries(chart.cells.map((cell) => [cell.id, []]));
  for (const node of nodesIn(run, 'item')) if (out[node.tag]) out[node.tag].push(node);
  return out;
}

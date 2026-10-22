// packages/decision-book/families/list.mjs
// The list family: entries (`entry` slots) tagged with the group they belong to. The layout
// only changes the drawing:
//   checklist  criteria in order, each ticked once it has an entry (Whitmore)
//   rows       a row per group (cognitive bias)
//   lanes      a column per group (conflict responses)
//   routes     groups as routes out from the centre (crossroads)
//   pyramid    groups stacked from the base up, one pyramid per `column` (Maslow, then and now);
//              a column listed in `inverted` is drawn widest at the top (Maslow's wants)
//   roles      a card per group (Belbin roles, de Bono hats)
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';

export const LIST_LAYOUTS = Object.freeze(['checklist', 'rows', 'lanes', 'routes', 'pyramid', 'roles']);

/** Entry nodes per group id, in slot order. */
export function entriesByGroup(run, chart) {
  const out = Object.fromEntries(chart.groups.map((group) => [group.id, []]));
  for (const node of nodesIn(run, 'entry')) if (out[node.tag]) out[node.tag].push(node);
  return out;
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {string} config.chart.layout
 * @param {{id: string, label: string, prompt?: string, column?: string, max?: number}[]} config.chart.groups
 *   `max` caps one group below perGroup (the 5/25 Rule's five)
 * @param {string} config.chart.entry what one entry is
 * @param {number} [config.chart.perGroup] (6)
 * @param {number} [config.chart.minGroups] groups with an entry before the reflection opens (2)
 * @param {number} [config.chart.minEntries] entries before the reflection opens (3)
 * @param {string[]} [config.chart.inverted] pyramid columns drawn widest at the top
 */
export function listTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(LIST_LAYOUTS.includes(chart.layout), id, `layout is one of ${LIST_LAYOUTS.join(', ')}`);
  check(Array.isArray(chart.groups) && chart.groups.length >= 2, id, 'needs at least two groups');
  for (const group of chart.groups) check(isKey(group.id) && group.label, id, `group ${group.id} needs a key and a label`);
  check(new Set(chart.groups.map((group) => group.id)).size === chart.groups.length, id, 'group ids are unique');
  const columns = chart.groups.map((group) => group.column ?? null);
  check(columns.every((c) => c === null) || columns.every((c) => isKey(c)), id, 'give every group a column, or none');
  if (columns[0] !== null) check(chart.layout === 'pyramid' || chart.layout === 'lanes', id, 'columns belong to pyramid or lanes');
  check(!chart.inverted || (chart.layout === 'pyramid' && chart.inverted.every((column) => columns.includes(column))), id, 'inverted names pyramid columns');
  check(typeof chart.entry === 'string' && chart.entry, id, 'needs an entry description');
  const perGroup = chart.perGroup ?? 6;
  const minGroups = chart.minGroups ?? 2;
  const minEntries = chart.minEntries ?? 3;
  const groupIds = chart.groups.map((group) => group.id);
  for (const group of chart.groups) check(group.max === undefined || (Number.isInteger(group.max) && group.max >= 1 && group.max <= perGroup), id, `group ${group.id}: max is a whole number from 1 to perGroup`);
  const capOf = Object.fromEntries(chart.groups.map((group) => [group.id, group.max ?? perGroup]));
  const { subject, reflection } = framing(config);

  const ready = (run) => {
    const entries = nodesIn(run, 'entry');
    return entries.length >= minEntries && new Set(entries.map((node) => node.tag)).size >= minGroups;
  };

  return baseTool(config, 'list', { entry: chart.entry }, {
    nodeTags: { entry: groupIds },
    validateNode(run, node) {
      if (node.slot.startsWith('entry') && entriesByGroup(run, chart)[node.tag]?.length >= capOf[node.tag]) return `That group already has ${capOf[node.tag]} entries; merge or replace one.`;
      return null;
    },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'entry', perGroup * groupIds.length), reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}

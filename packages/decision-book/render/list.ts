// packages/decision-book/render/list.ts
// The list family's chart: one block per group (its label, its prompt in small type, then its
// entries), laid out by `data-layout` in CSS:
//   checklist  rows in order, a tick and "Done" once a criterion has an entry;
//   rows       full-width rows; lanes  columns side by side;
//   routes     blocks around a centre disc, joined to it by dotted lines;
//   pyramid    levels from the base up, each narrower than the one below, one pyramid per column
//              (an `inverted` column is drawn widest at the top);
//   roles      a card grid.
// Groups with a `column` are drawn in one stack per column, headed by the column's name.
// Phone: everything becomes one column of labelled blocks; a pyramid keeps its narrowing.
import { type DmToolRun, type ChartView, type EntrySpec, type Fill, createChart, el, setAttr, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

export type ListChart = {
  layout: 'checklist' | 'rows' | 'lanes' | 'routes' | 'pyramid' | 'roles';
  groups: { id: string; label: string; prompt?: string; column?: string }[];
  entry: string;
  inverted?: string[];
};

const FILL_CYCLE: Fill[] = ['green', 'red', 'tint'];

/** Words for a column key: "then_and_now" → "Then and now". */
export const columnName = (key: string): string => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function createListView(tool: ChartTool & { chart: ListChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const groups = new Map<string, { block: HTMLDivElement; items: HTMLDivElement; done: HTMLSpanElement }>();
  return createChart({
    family: 'list',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!groups.size) {
        const board = el(doc, 'div', 'dm-list');
        board.setAttribute('data-layout', chart.layout);
        const columnKeys = [...new Set(chart.groups.map((group) => group.column ?? ''))];
        if (chart.layout === 'routes') {
          const hub = el(doc, 'div', 'dm-list__hub');
          hub.setAttribute('aria-hidden', 'true');
          board.append(hub);
        }
        for (const columnKey of columnKeys) {
          const stack = el(doc, 'div', 'dm-list__column');
          if (columnKey) {
            stack.setAttribute('role', 'group');
            stack.setAttribute('aria-label', columnName(columnKey));
            stack.append(el(doc, 'h3', 'dm-list__column-name', columnName(columnKey)));
          }
          const members = chart.groups.filter((group) => (group.column ?? '') === columnKey);
          // A pyramid is listed from its base; it is drawn top down.
          const drawn = chart.layout === 'pyramid' ? [...members].reverse() : members;
          drawn.forEach((group) => {
            const level = members.indexOf(group);
            const block = el(doc, 'div', 'dm-list__group');
            block.setAttribute('role', 'group');
            block.setAttribute('aria-label', group.label);
            block.setAttribute('data-group', group.id);
            // An inverted pyramid keeps its levels in order but is widest at the top.
            const width = chart.inverted?.includes(columnKey) ? members.length - 1 - level : level;
            block.style.setProperty('--dm-level', String(width));
            block.style.setProperty('--dm-levels', String(members.length));
            const head = el(doc, 'div', 'dm-list__head');
            head.setAttribute('aria-hidden', 'true');
            head.append(el(doc, 'span', 'dm-list__label', group.label));
            const done = el(doc, 'span', 'dm-list__done', 'Done');
            done.hidden = true;
            if (chart.layout === 'checklist') head.append(done);
            if (group.prompt) head.append(el(doc, 'span', 'dm-list__prompt', group.prompt));
            const items = el(doc, 'div', 'dm-list__items');
            block.append(head, items);
            stack.append(block);
            groups.set(group.id, { block, items, done });
          });
          board.append(stack);
        }
        ctx.frame.append(board);
      }
      const entries = run.nodes.filter((node) => slotName(node) === 'entry' && groups.has(node.tag ?? ''));
      for (const [id, group] of groups) {
        const has = entries.some((node) => node.tag === id);
        group.done.hidden = !has;
        setAttr(group.block, 'data-done', has ? 'true' : null);
      }
      return entries.map((node) => {
        const index = chart.groups.findIndex((group) => group.id === node.tag);
        const group = chart.groups[index];
        return { node, host: groups.get(group.id)!.items, fill: FILL_CYCLE[index % FILL_CYCLE.length], label: `${group.column ? `${columnName(group.column)}, ` : ''}${group.label}, entry ${slotIndex(node)}` };
      });
    }
  }, doc);
}

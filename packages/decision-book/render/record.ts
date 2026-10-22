// packages/decision-book/render/record.ts
// The decision record, the Decide step's chart: the decision as a headline, its reasons (each
// saying which model and node it rests on, from setBasis), the Stop Rule as a red band reading
// "If … then …", the first step on a forward arrow and the review date on a back arrow, as on
// the book's cover. Phone: the same order, one column.
import { RECORD_SLOTS } from '../record-slots.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, slotIndex, slotName } from './core';

/** What a reason rests on: the model's name and the node's title. */
export type Basis = { model: string; title: string };
export type RecordView = ChartView & { setBasis(basis: Record<string, Basis[]>): void };

/** "Rests on Eisenhower matrix: Reply by Friday; SWOT: Team" */
export function basisWords(list: Basis[] | undefined): string {
  return list?.length ? `Rests on ${list.map((b) => `${b.model}: ${b.title}`).join('; ')}` : '';
}

/** A review value as a date in words when it is an ISO date ("1 February 2027"), else as written. */
export function reviewWords(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return text;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function createRecordView(doc: Document = document): RecordView {
  const hosts = new Map<string, HTMLElement>();
  let basis: Record<string, Basis[]> = {};
  let last: DmToolRun | null = null;
  const view = createChart({
    family: 'record',
    label: 'Decision record',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const section = (slot: string, className: string, title: string): HTMLDivElement => {
          const box = el(doc, 'div', `dm-record__part ${className}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', title);
          box.append(el(doc, 'span', 'dm-record__title', title));
          hosts.set(slot, box);
          return box;
        };
        const band = el(doc, 'div', 'dm-record__stop');
        band.setAttribute('role', 'group');
        band.setAttribute('aria-label', 'Stop Rule');
        band.append(el(doc, 'span', 'dm-record__title', 'Stop Rule'));
        const ifPart = section('trigger', 'dm-record__if', 'If');
        const thenPart = section('action', 'dm-record__then', 'then');
        band.append(ifPart, thenPart);
        const ends = el(doc, 'div', 'dm-record__ends');
        ends.append(section('first_step', 'dm-record__forward', 'First step'), section('review', 'dm-record__back', 'Review'));
        ctx.frame.append(section('decision', 'dm-record__decision', 'Decision'), section('reason', 'dm-record__reasons', 'Because'), band, ends);
      }
      return run.nodes
        .filter((node) => hosts.has(slotName(node)))
        .map((node) => {
          const name = slotName(node);
          const fill = name === 'decision' ? 'ink' : name === 'trigger' || name === 'action' ? 'red' : name === 'first_step' ? 'green' : 'tint';
          const title = RECORD_SLOTS[name as keyof typeof RECORD_SLOTS];
          return {
            node,
            host: hosts.get(name)!,
            fill,
            label: name === 'reason' ? `Reason ${slotIndex(node)}` : title,
            meta: name === 'reason' ? basisWords(basis[node.id]) || undefined : name === 'review' ? reviewWords(node.text) : undefined
          };
        });
    }
  }, doc);
  return {
    ...view,
    update(run) {
      last = run;
      view.update(run);
    },
    setBasis(next) {
      basis = next;
      if (last) view.update(last);
    }
  };
}

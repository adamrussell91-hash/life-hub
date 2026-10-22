// packages/decision-book/render/ratings.ts
// The ratings family's chart (Gear Shifter's Structured Evaluation). A table with one row per
// idea, always in the order the ideas were named, and one column per criterion plus "All
// criteria". Each cell gives the mean, the sample SD and n across the raters who have scored;
// one rater's spread reads "n/a". Under it, the raters, each with their mean and their own
// ranking, then the recommendation and the decision owner, then the form that enters one
// rater's scores and ranking at a time (Save sends one snapshot). Nothing is sorted by score,
// totalled or marked as a winner. Phone: each idea's row becomes a card, criteria named inside.
import { ratingsOf } from '../families/ratings.mjs';
import type { PsNode } from '../../problem-solver/types';
import { nodeTitle } from '../../problem-solver/titles.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

export type RatingsChart = { idea: string; criterion: string; rater: string };

type Stat = { mean: number | null; sd: number | null; n: number };
type Ratings = {
  ideas: string[];
  criteria: string[];
  raters: string[];
  scored: string[];
  cells: Record<string, Record<string, Stat>>;
  pooled: Record<string, Stat>;
  raterMeans: Record<string, number>;
  rankings: Record<string, string[]>;
};
type Snapshot = { rater?: string; scores?: Record<string, Record<string, number>>; ranking?: string[] };

const one = (n: number): string => n.toFixed(1);

/** The three lines a cell shows. */
export function statWords(stat: Stat): [string, string, string] {
  if (!stat.n || stat.mean === null) return ['Not scored', '', ''];
  return [`Mean ${one(stat.mean)}`, `Sample SD ${stat.sd === null ? 'n/a' : one(stat.sd)}`, `n = ${stat.n}`];
}

type Row = { row: HTMLDivElement; head: HTMLDivElement; cells: Map<string, HTMLDivElement>; pooled: HTMLDivElement };

export function createRatingsView(tool: ChartTool & { chart: RatingsChart }, doc: Document = document): ChartView {
  let built = false;
  const table = el(doc, 'div', 'dm-ratings');
  const headRow = el(doc, 'div', 'dm-ratings__row dm-ratings__row--head');
  const corner = el(doc, 'div', 'dm-ratings__corner', 'Ideas');
  const pooledHead = el(doc, 'div', 'dm-ratings__crit dm-ratings__crit--all', 'All criteria');
  const criterionHeads = new Map<string, HTMLDivElement>();
  const rows = new Map<string, Row>();
  const raterList = el(doc, 'div', 'dm-ratings__raters');
  const raters = new Map<string, { block: HTMLDivElement; host: HTMLDivElement; meta: HTMLParagraphElement }>();
  const recommendation = el(doc, 'div', 'dm-ratings__box');
  const owner = el(doc, 'div', 'dm-ratings__box dm-ratings__box--owner');
  const form = el(doc, 'form', 'dm-ratings__form');
  const status = el(doc, 'p', 'dm-ratings__status');
  let formKey = '';
  let select: HTMLSelectElement | null = null;
  const scoreInputs = new Map<string, HTMLInputElement>();
  const rankInputs = new Map<string, HTMLInputElement>();
  let latest: Record<string, Snapshot> = {};
  let emit: (payload: Record<string, unknown>) => void = () => {};

  function build(frame: HTMLDivElement): void {
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Ratings by idea and criterion');
    headRow.setAttribute('role', 'row');
    corner.setAttribute('role', 'columnheader');
    pooledHead.setAttribute('role', 'columnheader');
    headRow.append(corner, pooledHead);
    table.append(headRow);
    const note = el(doc, 'p', 'dm-ratings__note', 'Raters weigh equally. Ideas stay in the order they were named: nothing here is ranked for you.');
    raterList.setAttribute('role', 'group');
    raterList.setAttribute('aria-label', 'Raters');
    raterList.append(el(doc, 'span', 'dm-chart__slot-label', 'Raters'));
    recommendation.append(el(doc, 'span', 'dm-chart__slot-label', tool.slots.recommendation ?? 'Recommendation'));
    owner.append(el(doc, 'span', 'dm-chart__slot-label', tool.slots.owner ?? 'Who decides'));
    const close = el(doc, 'div', 'dm-ratings__close');
    close.append(recommendation, owner);
    status.setAttribute('aria-live', 'polite');
    frame.append(table, note, raterList, close, form);
    built = true;
  }

  function cell(className: string, role: string): HTMLDivElement {
    const out = el(doc, 'div', className);
    out.setAttribute('role', role);
    return out;
  }

  /** Keep a cell's three lines (and, for phones, its criterion's name) in step. */
  function fillCell(target: HTMLDivElement, label: string, stat: Stat): void {
    const words = statWords(stat);
    const key = [label, ...words].join('|');
    if (target.getAttribute('data-key') === key) return;
    target.setAttribute('data-key', key);
    target.replaceChildren(
      el(doc, 'span', 'dm-ratings__cell-label', label),
      el(doc, 'span', 'dm-ratings__mean', words[0]),
      ...(words[1] ? [el(doc, 'span', 'dm-ratings__sd', words[1]), el(doc, 'span', 'dm-ratings__n', words[2])] : [])
    );
    setAttr(target, 'data-scored', stat.n ? 'true' : null);
  }

  function syncTable(r: Ratings, byId: Map<string, PsNode>): void {
    for (const [id, head] of criterionHeads) if (!r.criteria.includes(id)) { head.remove(); criterionHeads.delete(id); }
    for (const id of r.criteria) {
      if (!criterionHeads.has(id)) {
        const head = cell('dm-ratings__crit', 'columnheader');
        head.setAttribute('data-criterion', id);
        criterionHeads.set(id, head);
      }
    }
    r.criteria.forEach((id, i) => {
      const head = criterionHeads.get(id)!;
      if (headRow.children[i + 1] !== head) headRow.insertBefore(head, headRow.children[i + 1] ?? null);
    });
    for (const [id, row] of rows) if (!r.ideas.includes(id)) { row.row.remove(); rows.delete(id); }
    r.ideas.forEach((id, i) => {
      let row = rows.get(id);
      if (!row) {
        const line = cell('dm-ratings__row', 'row');
        line.setAttribute('data-idea', id);
        const head = cell('dm-ratings__idea', 'rowheader');
        const pooled = cell('dm-ratings__cell dm-ratings__cell--all', 'cell');
        line.append(head, pooled);
        row = { row: line, head, cells: new Map(), pooled };
        rows.set(id, row);
      }
      if (table.children[i + 1] !== row.row) table.insertBefore(row.row, table.children[i + 1] ?? null);
      for (const [c, target] of row.cells) if (!r.criteria.includes(c)) { target.remove(); row.cells.delete(c); }
      r.criteria.forEach((c, j) => {
        let target = row!.cells.get(c);
        if (!target) {
          target = cell('dm-ratings__cell', 'cell');
          target.setAttribute('data-criterion', c);
          row!.cells.set(c, target);
        }
        if (row!.row.children[j + 1] !== target) row!.row.insertBefore(target, row!.row.children[j + 1] ?? null);
        fillCell(target, nodeTitle(byId.get(c)!), r.cells[id][c]);
      });
      fillCell(row.pooled, 'All criteria', r.pooled[id]);
    });
  }

  function syncRaters(r: Ratings, byId: Map<string, PsNode>): void {
    for (const [id, rater] of raters) if (!r.raters.includes(id)) { rater.block.remove(); raters.delete(id); }
    r.raters.forEach((id, i) => {
      let rater = raters.get(id);
      if (!rater) {
        const block = el(doc, 'div', 'dm-ratings__rater');
        block.setAttribute('data-rater', id);
        const host = el(doc, 'div', 'dm-ratings__rater-name');
        const meta = el(doc, 'p', 'dm-ratings__rater-meta');
        block.append(host, meta);
        rater = { block, host, meta };
        raters.set(id, rater);
      }
      if (raterList.children[i + 1] !== rater.block) raterList.insertBefore(rater.block, raterList.children[i + 1] ?? null);
      const words = r.scored.includes(id)
        ? `Mean ${one(r.raterMeans[id])} · Ranks: ${r.rankings[id].map((idea) => nodeTitle(byId.get(idea)!)).join(', ')}`
        : 'Not scored yet';
      setText(rater.meta, words);
    });
  }

  function prefill(): void {
    const snap = select ? latest[select.value] : undefined;
    for (const [key, input] of scoreInputs) {
      const [idea, c] = key.split('|');
      if (doc.activeElement !== input) input.value = snap?.scores?.[idea]?.[c] !== undefined ? String(snap.scores[idea][c]) : '';
    }
    for (const [idea, input] of rankInputs) {
      const at = snap?.ranking?.indexOf(idea) ?? -1;
      if (doc.activeElement !== input) input.value = at >= 0 ? String(at + 1) : '';
    }
  }

  function syncForm(r: Ratings, byId: Map<string, PsNode>): void {
    const ready = r.ideas.length >= 2 && r.criteria.length >= 2 && r.raters.length >= 1;
    form.hidden = !ready;
    const key = [r.ideas, r.criteria, r.raters].map((list) => list.map((id) => `${id}=${nodeTitle(byId.get(id)!)}`).join(',')).join(';');
    if (!ready || key === formKey) {
      if (ready) prefill();
      return;
    }
    formKey = key;
    const keep = select?.value;
    scoreInputs.clear();
    rankInputs.clear();
    const who = el(doc, 'label', 'dm-ratings__field');
    who.append(el(doc, 'span', 'dm-ratings__field-label', 'Scores from'));
    select = el(doc, 'select', 'dm-ratings__select');
    for (const id of r.raters) {
      const option = el(doc, 'option', '', nodeTitle(byId.get(id)!));
      option.value = id;
      select.append(option);
    }
    if (keep && r.raters.includes(keep)) select.value = keep;
    select.addEventListener('change', () => {
      setText(status, '');
      prefill();
    });
    who.append(select);
    const grid = el(doc, 'div', 'dm-ratings__grid');
    for (const idea of r.ideas) {
      const set = el(doc, 'fieldset', 'dm-ratings__idea-form');
      set.append(el(doc, 'legend', 'dm-ratings__idea-name', nodeTitle(byId.get(idea)!)));
      for (const c of r.criteria) {
        const label = el(doc, 'label', 'dm-ratings__field');
        label.append(el(doc, 'span', 'dm-ratings__field-label', `${nodeTitle(byId.get(c)!)} (1–10)`));
        const input = el(doc, 'input', 'dm-ratings__input');
        input.type = 'number';
        input.min = '1';
        input.max = '10';
        input.step = '1';
        label.append(input);
        set.append(label);
        scoreInputs.set(`${idea}|${c}`, input);
      }
      const rank = el(doc, 'label', 'dm-ratings__field');
      rank.append(el(doc, 'span', 'dm-ratings__field-label', `Rank (1 is best of ${r.ideas.length})`));
      const input = el(doc, 'input', 'dm-ratings__input dm-ratings__rank');
      input.type = 'number';
      input.min = '1';
      input.max = String(r.ideas.length);
      input.step = '1';
      rank.append(input);
      set.append(rank);
      rankInputs.set(idea, input);
      grid.append(set);
    }
    const save = el(doc, 'button', 'dm-ratings__save', 'Save these scores');
    save.type = 'button';
    save.addEventListener('click', () => {
      const ideas = [...rankInputs.keys()];
      const ranks = ideas.map((idea) => Number(rankInputs.get(idea)!.value));
      const wanted = ideas.map((_, i) => i + 1);
      if ([...ranks].sort((a, b) => a - b).join() !== wanted.join()) {
        setText(status, `Give each idea a different rank from 1 to ${ideas.length}.`);
        return;
      }
      setText(status, '');
      const scores: Record<string, Record<string, number>> = {};
      for (const [k, input] of scoreInputs) {
        const [idea, c] = k.split('|');
        (scores[idea] ??= {})[c] = Number(input.value);
      }
      const ranking = [...ideas].sort((a, b) => ranks[ideas.indexOf(a)] - ranks[ideas.indexOf(b)]);
      emit({ rater: select!.value, scores, ranking });
    });
    form.replaceChildren(el(doc, 'p', 'dm-ratings__form-title', 'Enter one rater’s scores and ranking'), who, grid, save, status);
    prefill();
  }

  return createChart({
    family: 'ratings',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      emit = ctx.emitScore;
      if (!built) build(ctx.frame);
      const r = ratingsOf(run) as Ratings;
      latest = {};
      for (const snap of (run.scores?.snapshots ?? []) as Snapshot[]) if (snap.rater) latest[snap.rater] = snap;
      const byId = new Map(run.nodes.map((node) => [node.id, node]));
      syncTable(r, byId);
      syncRaters(r, byId);
      syncForm(r, byId);
      const specs: EntrySpec[] = [];
      for (const node of run.nodes) {
        const name = slotName(node);
        if (name === 'idea') specs.push({ node, host: rows.get(node.id)!.head, fill: 'red', label: `Idea ${slotIndex(node)}` });
        else if (name === 'criterion') specs.push({ node, host: criterionHeads.get(node.id)!, fill: 'tint', label: `Criterion ${slotIndex(node)}` });
        else if (name === 'rater') specs.push({ node, host: raters.get(node.id)!.host, fill: 'ink', label: `Rater ${slotIndex(node)}` });
        else if (name === 'recommendation') specs.push({ node, host: recommendation, fill: 'green', label: tool.slots.recommendation ?? 'Recommendation' });
        else if (name === 'owner') specs.push({ node, host: owner, fill: 'red', label: tool.slots.owner ?? 'Who decides' });
      }
      return specs;
    }
  }, doc);
}

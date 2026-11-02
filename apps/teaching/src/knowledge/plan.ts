import type { AlreadyKnow, KnowledgeItem, KnowledgePlan, KnowledgeUnitPlan, KnowledgeWeek, ScopeSequence } from '@/schemas';

/**
 * The year as a written knowledge plan (Scope & Sequence → Knowledge plan).
 * Unit order, terms and weeks come from the timeline. What a unit sets up and
 * the warnings are worked out from "already know" links, so neither is typed.
 * Helpers named as actions change the plan in place. Pure: no DOM.
 */

export type PlanRow = {
  unit_id: string;
  title: string;
  /** Position in teaching order, from 1. */
  n: number;
  term: number | null;
  weeks: number;
  plan: KnowledgeUnitPlan;
};
export type ItemHome = { item: KnowledgeItem; text: string; unit_id: string; kind: 'must' | 'skill'; /** Null while its unit is off the timeline. */ n: number | null };
export type ItemIndex = Map<string, ItemHome>;
export type AlreadyState =
  | { state: 'ok'; text: string; item_id: string; n: number }
  | { state: 'before'; text: string }
  | { state: 'untaught'; text: string }
  | { state: 'later'; text: string; item_id: string; n: number }
  | { state: 'off'; text: string; item_id: string };
export type PlanIssue = { state: 'untaught' | 'later' | 'off' | 'week_order'; text: string; n: number };
export type SetsUp = { n: number; title: string; texts: string[] };
export type PlanSuggestions = { essential: Array<{ id: string; text: string }>; others: Array<{ id: string; text: string }> };
type PieceLike = { id: string; text: string; tier: string };

const rand = (): string => Math.random().toString(36).slice(2, 8).padEnd(6, '0');
export const newItemId = (): string => `ki_${rand()}`;
export const newWeekId = (): string => `kw_${rand()}`;
export const emptyPlan = (): KnowledgePlan => ({ year_target: '', units: [] });

export const blankUnitPlan = (unit_id: string): KnowledgeUnitPlan => ({
  unit_id, big_idea: '', already: [], must: [], words: [], skills: [], assessed_by: '', leads_on: '', weeks: []
});
export const blankWeek = (label = ''): KnowledgeWeek => ({
  id: newWeekId(), label, question: '', already: [], must_ids: [], skill_ids: [], words: [], check: ''
});

/** The plan's record for a unit, added on first use so a blank row costs nothing to store. */
export function unitPlanFor(plan: KnowledgePlan, unitId: string): KnowledgeUnitPlan {
  let found = plan.units.find((u) => u.unit_id === unitId);
  if (!found) {
    found = blankUnitPlan(unitId);
    plan.units.push(found);
  }
  return found;
}

/** Units on the timeline in teaching order. Notes and units that no longer exist are left out. */
export function buildRows(
  scope: Pick<ScopeSequence, 'terms' | 'timeline_items'>,
  units: ReadonlyArray<{ id: string; title: string }>,
  plan: KnowledgePlan
): PlanRow[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const items = scope.timeline_items.flatMap((item) => (item.kind === 'unit' && byId.has(item.unit_id) ? [item] : []));
  items.sort((a, b) => a.start_week - b.start_week || a.order - b.order);
  return items.map((item, i) => ({
    unit_id: item.unit_id,
    title: byId.get(item.unit_id)!.title,
    n: i + 1,
    term: scope.terms.find((t) => t.start_week <= item.start_week && item.start_week <= t.end_week)?.term_number ?? null,
    weeks: item.end_week - item.start_week + 1,
    plan: plan.units.find((u) => u.unit_id === item.unit_id) ?? blankUnitPlan(item.unit_id)
  }));
}

/** Every item in the plan and where it is taught. A linked item shows its piece's current wording. */
export function indexItems(plan: KnowledgePlan, rows: readonly PlanRow[], pieceText: ReadonlyMap<string, string> = new Map()): ItemIndex {
  const nByUnit = new Map(rows.map((r) => [r.unit_id, r.n]));
  const index: ItemIndex = new Map();
  for (const unit of plan.units) {
    const add = (item: KnowledgeItem, kind: 'must' | 'skill') => {
      const text = (item.piece_id && pieceText.get(item.piece_id)) || item.text;
      index.set(item.id, { item, text, unit_id: unit.unit_id, kind, n: nByUnit.get(unit.unit_id) ?? null });
    };
    unit.must.forEach((item) => add(item, 'must'));
    unit.skills.forEach((item) => add(item, 'skill'));
  }
  return index;
}

/** Null when a link points at an item that has gone: the row just leaves it out. */
export function alreadyState(entry: AlreadyKnow, rowN: number, index: ItemIndex): AlreadyState | null {
  if (entry.from === 'before') return { state: 'before', text: entry.text };
  if (entry.from === 'untaught') return { state: 'untaught', text: entry.text };
  const home = index.get(entry.item_id);
  if (!home) return null;
  if (home.n === null) return { state: 'off', text: home.text, item_id: entry.item_id };
  if (home.n > rowN) return { state: 'later', text: home.text, item_id: entry.item_id, n: home.n };
  return { state: 'ok', text: home.text, item_id: entry.item_id, n: home.n };
}

const entriesOf = (plan: KnowledgeUnitPlan): AlreadyKnow[] => [...plan.already, ...plan.weeks.flatMap((w) => w.already)];

/** What later units rely on from this one, nearest first. */
export function setsUp(rows: readonly PlanRow[], i: number, index: ItemIndex): SetsUp[] {
  const unitId = rows[i]!.unit_id;
  const out: SetsUp[] = [];
  for (const later of rows.slice(i + 1)) {
    const texts: string[] = [];
    for (const entry of entriesOf(later.plan)) {
      if (entry.from !== 'plan') continue;
      const home = index.get(entry.item_id);
      if (home?.unit_id === unitId && !texts.includes(home.text)) texts.push(home.text);
    }
    if (texts.length) out.push({ n: later.n, title: later.title, texts });
  }
  return out;
}

/** Where an item is taught and which other units rely on it. */
export function threadOf(itemId: string, rows: readonly PlanRow[], index: ItemIndex): { home: ItemHome | null; usedIn: number[] } {
  const home = index.get(itemId) ?? null;
  const usedIn = rows
    .filter((r) => r.unit_id !== home?.unit_id && entriesOf(r.plan).some((e) => e.from === 'plan' && e.item_id === itemId))
    .map((r) => r.n);
  return { home, usedIn };
}

const firstWeekOf = (unit: KnowledgeUnitPlan, itemId: string): number =>
  unit.weeks.findIndex((w) => w.must_ids.includes(itemId) || w.skill_ids.includes(itemId));

/** The later week of this unit that teaches something this week relies on. Null when the order is fine. */
export function placedLater(unit: KnowledgeUnitPlan, weekIndex: number, itemId: string): KnowledgeWeek | null {
  const first = firstWeekOf(unit, itemId);
  return first > weekIndex ? unit.weeks[first]! : null;
}

/** How many must-know items this week introduces: those no earlier week has placed. */
export function newInWeek(unit: KnowledgeUnitPlan, weekIndex: number): number {
  const known = new Set(unit.must.map((m) => m.id));
  return new Set(unit.weeks[weekIndex]?.must_ids.filter((id) => known.has(id) && firstWeekOf(unit, id) === weekIndex)).size;
}

export function planIssues(rows: readonly PlanRow[], index: ItemIndex): PlanIssue[] {
  const out: PlanIssue[] = [];
  for (const row of rows) {
    row.plan.weeks.forEach((week, w) => {
      for (const entry of week.already) {
        if (entry.from !== 'plan' || !placedLater(row.plan, w, entry.item_id)) continue;
        const text = index.get(entry.item_id)?.text ?? '';
        if (text.trim() && !out.some((x) => x.state === 'week_order' && x.text === text && x.n === row.n)) out.push({ state: 'week_order', text, n: row.n });
      }
    });
    for (const entry of entriesOf(row.plan)) {
      const read = alreadyState(entry, row.n, index);
      if (!read || read.state === 'ok' || read.state === 'before' || !read.text.trim()) continue;
      if (!out.some((x) => x.state === read.state && x.text === read.text && x.n === row.n)) out.push({ state: read.state, text: read.text, n: row.n });
    }
  }
  return out;
}

/** Must-know items not yet in a week, counted only for units whose weeks have been started. */
export function unplacedCount(rows: readonly PlanRow[]): number {
  return rows.reduce((sum, { plan }) => {
    if (!plan.weeks.length) return sum;
    const placed = new Set(plan.weeks.flatMap((w) => w.must_ids));
    return sum + plan.must.filter((m) => m.text.trim() && !placed.has(m.id)).length;
  }, 0);
}

const allEntryLists = (plan: KnowledgePlan): AlreadyKnow[][] =>
  plan.units.flatMap((u) => [u.already, ...u.weeks.map((w) => w.already)]);

/** Teach an assumed thing in a unit: it joins that unit's must-know and every matching assumption now links to it. */
export function teachIn(plan: KnowledgePlan, unitId: string, text: string): string {
  const item: KnowledgeItem = { id: newItemId(), text };
  unitPlanFor(plan, unitId).must.push(item);
  for (const list of allEntryLists(plan)) {
    list.forEach((entry, i) => {
      if (entry.from === 'untaught' && entry.text === text) list[i] = { from: 'plan', item_id: item.id };
    });
  }
  return item.id;
}

export function markFromBefore(plan: KnowledgePlan, text: string): void {
  for (const list of allEntryLists(plan)) {
    list.forEach((entry, i) => {
      if (entry.from === 'untaught' && entry.text === text) list[i] = { from: 'before', text };
    });
  }
}

/** Remove a taught item. Anything relying on it stays visible as assumed and untaught. */
export function removeItem(plan: KnowledgePlan, unitId: string, itemId: string, shownText: string): void {
  const unit = plan.units.find((u) => u.unit_id === unitId);
  if (!unit) return;
  unit.must = unit.must.filter((m) => m.id !== itemId);
  unit.skills = unit.skills.filter((m) => m.id !== itemId);
  for (const week of unit.weeks) {
    week.must_ids = week.must_ids.filter((id) => id !== itemId);
    week.skill_ids = week.skill_ids.filter((id) => id !== itemId);
  }
  for (const list of allEntryLists(plan)) {
    list.forEach((entry, i) => {
      if (entry.from === 'plan' && entry.item_id === itemId) list[i] = { from: 'untaught', text: shownText };
    });
  }
  for (const list of allEntryLists(plan)) {
    const blank = list.filter((e) => e.from !== 'plan' && !e.text.trim());
    for (const entry of blank) list.splice(list.indexOf(entry), 1);
  }
}

/** Deep understanding pieces not yet in this unit's plan: essential ones first, the rest on request. */
export function pieceSuggestions(unit: KnowledgeUnitPlan, pieces: readonly PieceLike[]): PlanSuggestions {
  const used = new Set(unit.must.map((m) => m.piece_id));
  const free = pieces.filter((p) => !used.has(p.id));
  const brief = (p: PieceLike) => ({ id: p.id, text: p.text });
  return { essential: free.filter((p) => p.tier === 'essential').map(brief), others: free.filter((p) => p.tier !== 'essential').map(brief) };
}

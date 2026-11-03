import { apiGet } from '@/api/client';
import { collectAnthology, type AnthologyItem } from '@/blocks/anthology-collect';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { placements } from '@/deep/derive';
import type { DeepUnderstanding } from '@/deep/schema';
import type { Block, KnowledgeUnitPlan, Lesson } from '@/schemas';
import { firstHidden, normText, writtenTexts } from './editor-model';
import type { Organiser, OrganiserSection } from './types';

/**
 * Bring in: copy chosen items from Deep understandings, the Anthology and the Knowledge plan onto
 * the sheet as lines. They are copies. A piece keeps its link and takes the first lesson that
 * teaches it; text already on the sheet is skipped.
 */

export type BringSource = 'deep' | 'anthology' | 'plan';
export const BRING_LABEL: Record<BringSource, string> = {
  deep: 'Deep understandings',
  anthology: 'Anthology',
  plan: 'Knowledge plan'
};

export type BringItem = {
  key: string;
  source: BringSource;
  /** What it is grouped under in the panel. */
  group: string;
  /** The text shown to tick. */
  label: string;
  /** Goes in the first shown column of a table. */
  cue?: string;
  /** Goes in the first hidden column of a table (the thing to know). */
  know?: string;
  piece_id?: string;
  lesson_id?: string;
};

type LessonLike = { id: string; title?: string; blocks?: Block[] };

const shorten = (text: string, n = 60): string => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

/** The earliest lesson in the unit's order that teaches a piece. */
export function firstTeachingLesson(taught: readonly string[] | undefined, order: readonly string[]): string | undefined {
  if (!taught?.length) return undefined;
  const rank = (id: string): number => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...taught].sort((a, b) => rank(a) - rank(b))[0];
}

export function deepItems(deep: readonly DeepUnderstanding[], lessons: readonly LessonLike[], order: readonly string[]): BringItem[] {
  const out: BringItem[] = [];
  deep.forEach((du, i) => {
    const taught = placements(lessons, du.id).taught;
    const group = `${i + 1}. ${shorten(du.claim)}`;
    for (const piece of du.pieces) {
      out.push({
        key: `deep:${piece.id}`,
        source: 'deep',
        group,
        label: piece.text,
        know: piece.text,
        piece_id: piece.id,
        lesson_id: firstTeachingLesson(taught.get(piece.id), order)
      });
    }
  });
  return out;
}

export function anthologyItems(items: readonly AnthologyItem[]): BringItem[] {
  return items.map((item) => ({
    key: `anthology:${item.annotation_id}`,
    source: 'anthology' as const,
    group: item.lesson_title || 'Anthology',
    label: item.quote,
    cue: item.quote,
    know: item.note || undefined,
    lesson_id: item.lesson_id
  }));
}

export function planItems(plan: KnowledgeUnitPlan | undefined, lessons: readonly LessonLike[], order: readonly string[], deep: readonly DeepUnderstanding[] = []): BringItem[] {
  if (!plan) return [];
  const taught = new Map<string, string[]>();
  for (const du of deep) for (const [piece, ids] of placements(lessons, du.id).taught) taught.set(piece, [...(taught.get(piece) ?? []), ...ids]);
  const out: BringItem[] = [];
  for (const item of plan.must) {
    if (!item.text.trim()) continue;
    out.push({
      key: `plan:${item.id}`,
      source: 'plan',
      group: 'What students must know',
      label: item.text,
      know: item.text,
      piece_id: item.piece_id,
      lesson_id: item.piece_id ? firstTeachingLesson(taught.get(item.piece_id), order) : undefined
    });
  }
  plan.words.forEach((word, i) => {
    if (!word.trim()) return;
    out.push({ key: `plan:word:${i}`, source: 'plan', group: 'Words', label: word, cue: word });
  });
  return out;
}

/** Items whose text (or piece) is not already on the sheet. */
export function freshItems(items: readonly BringItem[], organiser: Pick<Organiser, 'sections'>): BringItem[] {
  const written = writtenTexts(organiser);
  const linked = new Set(organiser.sections.flatMap((s) => s.lines.map((l) => l.piece_id).filter((id): id is string => !!id)));
  return items.filter((item) => {
    if (item.piece_id && linked.has(item.piece_id)) return false;
    const main = item.know ?? item.cue ?? item.label;
    return !written.has(normText(main)) && !written.has(normText(item.cue ?? main));
  });
}

/** Where an item's text goes in a given section. A table puts the thing to know in a covered column. */
export function bringLine(item: BringItem, section: Pick<OrganiserSection, 'kind' | 'columns'>): { cells: string[]; lesson_id?: string; piece_id?: string } {
  let cells: string[];
  if (section.kind !== 'table') {
    cells = [item.cue ?? item.know ?? item.label];
  } else {
    const columns = section.columns ?? [];
    cells = columns.map(() => '');
    const hidden = firstHidden(columns);
    const knowAt = hidden !== -1 ? hidden : Math.min(1, columns.length - 1);
    let cueAt = columns.findIndex((c, i) => !c.hide && i !== knowAt);
    if (cueAt === -1) cueAt = knowAt === 0 ? 1 : 0;
    if (item.know !== undefined) cells[knowAt] = item.know;
    if (item.cue !== undefined) cells[cueAt] = item.cue;
    // A quote with no note, or a piece with no prompt: the text still has a home.
    if (!cells.some((c) => c)) cells[knowAt] = item.label;
  }
  return {
    cells,
    ...(item.lesson_id ? { lesson_id: item.lesson_id } : {}),
    ...(item.piece_id ? { piece_id: item.piece_id } : {})
  };
}

/** The unit's lessons, in full, for deriving first lessons and the Anthology. */
export async function loadUnitLessons(lessonIds: readonly string[]): Promise<Lesson[]> {
  const rows = await Promise.all(lessonIds.map((id) => apiGet<Lesson>(`/api/lessons/${encodeURIComponent(id)}`).catch(() => null)));
  return rows.filter((row): row is Lesson => !!row);
}

export function anthologyFromLessons(lessons: readonly Lesson[], order: readonly string[]): AnthologyItem[] {
  const snapshots = lessons.map((lesson) => ({
    lesson_id: lesson.id,
    lesson_title: lesson.title,
    published: true,
    blocks: filterBlocksForStudent(lesson.blocks ?? [])
  }));
  return collectAnthology(snapshots, { includeUnpublished: true, lessonOrder: [...order] }).items;
}

export type BringPanelOptions = {
  title: string;
  items: BringItem[];
  /** Called with the chosen items; resolves when they are on the sheet. */
  onAdd: (items: BringItem[]) => Promise<void>;
  onClose: () => void;
};

/** The tick list. Nothing is added until the button is pressed. */
export function renderBringPanel(options: BringPanelOptions): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'ko-bring';
  const head = document.createElement('p');
  head.className = 'ko-bring__head';
  head.textContent = options.items.length ? `${options.title}: tick what to copy in` : `${options.title}: everything here is already on the sheet`;
  panel.append(head);
  const boxes: Array<{ box: HTMLInputElement; item: BringItem }> = [];
  let group = '';
  for (const item of options.items) {
    if (item.group !== group) {
      group = item.group;
      const label = document.createElement('p');
      label.className = 'ko-bring__meta';
      label.textContent = group;
      panel.append(label);
    }
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    const text = document.createElement('span');
    text.textContent = item.label;
    if (item.piece_id) {
      const chip = document.createElement('span');
      chip.className = 'ko-chip';
      chip.textContent = 'Piece';
      text.append(' ', chip);
    }
    row.append(box, text);
    panel.append(row);
    boxes.push({ box, item });
  }
  const actions = document.createElement('div');
  actions.className = 'ko-actions';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--primary ko-btn';
  add.textContent = 'Add these lines';
  add.disabled = !options.items.length;
  add.addEventListener('click', () => {
    const chosen = boxes.filter((b) => b.box.checked).map((b) => b.item);
    if (!chosen.length) return;
    add.disabled = true;
    void options.onAdd(chosen).then(options.onClose, () => { add.disabled = false; });
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn--ghost ko-btn';
  close.textContent = 'Close';
  close.addEventListener('click', options.onClose);
  actions.append(add, close);
  panel.append(actions);
  return panel;
}

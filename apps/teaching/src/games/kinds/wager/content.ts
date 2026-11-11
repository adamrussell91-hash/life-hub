import type { GameKeys } from '../../core/model';
import type { PublicGame, PublicItem } from '../../core/schema';

/**
 * Content helpers shared by Wager and Points rush (rules, phones, boards).
 * Pure: no DOM. A question as students see it never carries its answer.
 */

/** A question or term as a phone shows it: the prompt and, for choice questions, the options. */
export type ShownItem = {
  id: string;
  /** 'choice' (options as buttons), 'truefalse', or 'text' (type the answer: short answer, or a term from its clue). */
  mode: 'choice' | 'truefalse' | 'text';
  prompt: string;
  /** Choice questions: option ids are the public ones (fresh at publish), never their position in the editor. */
  options?: Array<{ id: string; text: string }>;
  /** A quote under the prompt (quote_technique). */
  quote?: string;
  /** Terms: the clue's kind ("definition", "example") and the word lengths, e.g. (8, 7). */
  clue_kind?: string;
  lengths?: number[];
};

const CHOICE_KINDS = new Set(['multiple_choice', 'odd_one_out', 'quote_technique']);

/** The game's public items: the page copy for solo kinds, or the room's live content (kept with the keys) for live-only kinds. */
export function contentItems(game: Pick<PublicGame, 'items'> | null | undefined, keys?: Pick<GameKeys, 'live'> | null): PublicItem[] {
  return keys?.live?.items?.length ? keys.live.items : game?.items ?? [];
}

/** A public item as a phone shows it, or null for a kind these games can't play (matching, ordering…). */
export function shownItem(item: PublicItem | undefined): ShownItem | null {
  if (!item) return null;
  if (item.shape === 'term') {
    const clue = item.clues[0];
    return { id: item.id, mode: 'text', prompt: clue?.text ?? '', clue_kind: clue?.kind ?? 'definition', lengths: item.lengths };
  }
  if (item.shape !== 'question') return null;
  const q = item.question as { kind?: string; prompt?: string; options?: Array<{ id: string; text: string }>; quote?: string };
  const prompt = String(q.prompt ?? '');
  if (CHOICE_KINDS.has(String(q.kind)) && Array.isArray(q.options) && q.options.length >= 2) {
    return { id: item.id, mode: 'choice', prompt, options: q.options.map((o) => ({ id: String(o.id), text: String(o.text) })), ...(q.quote ? { quote: String(q.quote) } : {}) };
  }
  if (q.kind === 'true_false') return { id: item.id, mode: 'truefalse', prompt };
  if (q.kind === 'short_answer') return { id: item.id, mode: 'text', prompt };
  return null;
}

/** The answer a phone sends for a shown item: `{ selected: [id] }`, `{ value }` or `{ text }`. */
export function responseFor(item: ShownItem, pick: string): unknown {
  if (item.mode === 'choice') return { selected: [pick] };
  if (item.mode === 'truefalse') return { value: pick === 'true' };
  return { text: pick.slice(0, 200) };
}

/** Which option a response chose ('true' / 'false' for true-false), or null for typed answers. */
export function choiceOf(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const r = response as { selected?: unknown; value?: unknown };
  if (Array.isArray(r.selected) && typeof r.selected[0] === 'string') return r.selected[0].slice(0, 40);
  if (typeof r.value === 'boolean') return r.value ? 'true' : 'false';
  return null;
}

/** The options a board draws for an item: the choice options, True/False, or none for typed answers. */
export function optionsOf(item: ShownItem | null): Array<{ id: string; text: string }> {
  if (!item) return [];
  if (item.mode === 'choice') return item.options ?? [];
  if (item.mode === 'truefalse') return [
    { id: 'true', text: 'True' },
    { id: 'false', text: 'False' }
  ];
  return [];
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** "1,240" (en-AU). */
export const fmt = (n: number): string => Math.round(n).toLocaleString('en-AU');

import type { Organiser, OrganiserColumn, OrganiserSection, Sheet } from './types';

/** Pure helpers for the teacher's organiser screens: no DOM, no network. */

/**
 * Pasted text from Word or Sheets: a new line starts a row, a tab starts a cell. Blank rows go,
 * cells beyond the section's columns are ignored, short rows are padded.
 */
export function parsePaste(text: string, columns: number): string[][] {
  const width = Math.max(1, columns);
  const rows: string[][] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const cells = raw.split('\t').map((cell) => cell.trim()).slice(0, width);
    if (!cells.some((cell) => cell)) continue;
    while (cells.length < width) cells.push('');
    rows.push(cells);
  }
  return rows;
}

/** Lesson ids of the n most recent release days on a sheet, newest first. Lines with no lesson never count. */
export function recentLessonIds(sheet: Pick<Sheet, 'sections'>, n = 2): Set<string> {
  const released = new Map<string, { day: string; at: number }>();
  let at = 0;
  for (const section of sheet.sections) {
    for (const line of section.lines) {
      at += 1;
      if (!line.lesson_id || !line.released_on) continue;
      const seen = released.get(line.lesson_id);
      if (!seen || line.released_on > seen.day) released.set(line.lesson_id, { day: line.released_on, at });
    }
  }
  const ranked = [...released.entries()].sort((a, b) => b[1].day.localeCompare(a[1].day) || b[1].at - a[1].at);
  return new Set(ranked.slice(0, n).map(([id]) => id));
}

/** "L1", "L2"… from the unit's lesson order. */
export function lessonCodes(orderedIds: readonly string[]): Map<string, string> {
  return new Map(orderedIds.map((id, i) => [id, `L${i + 1}`]));
}

export function normText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Every cell already written on the sheet, normalised. */
export function writtenTexts(organiser: Pick<Organiser, 'sections'>): Set<string> {
  const out = new Set<string>();
  for (const section of organiser.sections) for (const line of section.lines) for (const cell of line.cells) if (cell.trim()) out.add(normText(cell));
  return out;
}

/** Index of the first column a student sees covered, or -1. */
export function firstHidden(columns: readonly OrganiserColumn[]): number {
  return columns.findIndex((c) => c.hide);
}

/** Where a table's prompt, answer and other columns sit. One-cell sections answer in cell 0. */
export function columnSlots(section: Pick<OrganiserSection, 'kind' | 'columns'>): { cue: number; answer: number; rest: number[] } {
  if (section.kind !== 'table') return { cue: -1, answer: 0, rest: [] };
  const columns = section.columns ?? [];
  const cue = columns.findIndex((c) => !c.hide);
  const answer = firstHidden(columns);
  return { cue, answer, rest: columns.map((_c, i) => i).filter((i) => i !== cue && i !== answer) };
}

export const isIdeas = (section: Pick<OrganiserSection, 'role'>): boolean => section.role === 'concept' || section.role === 'ideas';

/** A line's main words, as the picker and the sheet show them. */
export function lineWords(section: Pick<OrganiserSection, 'kind' | 'columns' | 'role'>, line: Pick<OrganiserSection['lines'][number], 'cells'>): { head: string; body: string } {
  const { cue, answer } = columnSlots(section);
  const main = line.cells[answer]?.trim() ?? '';
  if (isIdeas(section) || cue === -1) return { head: '', body: main || (line.cells[cue]?.trim() ?? '') };
  return { head: line.cells[cue]?.trim() ?? '', body: main };
}

/** What a lesson offers for judging which sheet lines belong on its card. */
export type LessonRelevance = { pieces: readonly string[]; text: string };

/**
 * Whether a line this lesson has not ticked still belongs on its card: its knowledge piece is one the
 * lesson picked, or it is unclaimed and its word or label appears in the lesson. Whole words only.
 */
export function lineIsRelevant(
  section: Pick<OrganiserSection, 'kind' | 'columns' | 'role'>,
  line: OrganiserSection['lines'][number],
  relevance: LessonRelevance
): boolean {
  if (line.piece_id && relevance.pieces.includes(line.piece_id)) return true;
  const label = lineWords(section, line).head.toLowerCase();
  if (label.length < 3) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(relevance.text.toLowerCase());
}

/** Whether a line can become a practice card, by the server's rule. */
export function makesCard(section: OrganiserSection, line: Pick<OrganiserSection['lines'][number], 'cells'>): boolean {
  const { cue, answer } = columnSlots(section);
  return section.kind === 'table' && cue !== -1 && answer !== -1 && !!line.cells[cue]?.trim() && !!line.cells[answer]?.trim();
}

const CONCEPT_COLOURS = ['#376fb7', '#5d4e70', '#a85a0c', '#2f7a4f'];
/** A fallback colour for the nth concept, where the unit map names none. */
export const conceptColourAt = (n: number): string => CONCEPT_COLOURS[n % CONCEPT_COLOURS.length]!;

/** One queue so changes reach the server in the order they were made. */
export function createSerialQueue(): { add: <T>(job: () => Promise<T>) => Promise<T> } {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    add<T>(job: () => Promise<T>): Promise<T> {
      const run = tail.then(job, job);
      tail = run.catch(() => undefined);
      return run;
    }
  };
}

/** A tracked piece's line on the sheet: its short prompt and the words students learn. */
export type PieceLine = { line_id: string; prompt: string; text: string };

/** Each piece's line, first one wins. A piece with no line isn't in the map. */
export function pieceLines(organiser: Pick<Organiser, 'sections'>): Map<string, PieceLine> {
  const out = new Map<string, PieceLine>();
  for (const section of organiser.sections) {
    const { cue, answer } = columnSlots(section);
    for (const line of section.lines) {
      if (!line.piece_id || out.has(line.piece_id)) continue;
      out.set(line.piece_id, { line_id: line.id, prompt: line.cells[cue]?.trim() ?? '', text: line.cells[answer]?.trim() ?? '' });
    }
  }
  return out;
}

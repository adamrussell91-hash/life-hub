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

/** What to tell the teacher when a table cannot make practice cards, or null. */
export function noCardWarning(section: Pick<OrganiserSection, 'kind' | 'columns'>): string | null {
  if (section.kind !== 'table') return null;
  const columns = section.columns ?? [];
  const hidden = columns.filter((c) => c.hide).length;
  if (hidden === 0) return 'Nothing is hidden here, so this table makes no practice cards. Choose a column to hide.';
  if (hidden >= columns.length) return 'Every column is hidden, so this table makes no practice cards. Keep one column showing.';
  return null;
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

/** The columns with one flipped. At least one column always stays showing. */
export function toggleHide(columns: readonly OrganiserColumn[], id: string): OrganiserColumn[] {
  const next = columns.map((c) => (c.id === id ? { ...c, hide: !c.hide } : { ...c }));
  return next.every((c) => c.hide) ? columns.map((c) => ({ ...c })) : next;
}

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

/** The usual three sections for a new unit. The second column of each is covered. */
export const USUAL_THREE: Array<{ name: string; columns: Array<{ label: string; hide: boolean }> }> = [
  { name: 'Key ideas', columns: [{ label: 'Prompt', hide: false }, { label: 'What to know', hide: true }, { label: 'Example', hide: false }] },
  { name: 'Vocabulary', columns: [{ label: 'Word', hide: false }, { label: 'Meaning', hide: true }, { label: 'In a sentence', hide: false }] },
  { name: 'Key lines', columns: [{ label: 'Line', hide: false }, { label: 'Who', hide: true }, { label: 'Why it matters', hide: false }] }
];

/** Cells shaped for a section: one per column for a table, otherwise one joined cell. */
export function fitCells(cells: readonly string[], section: Pick<OrganiserSection, 'kind' | 'columns'>): string[] {
  if (section.kind !== 'table') return [cells.map((c) => c.trim()).filter(Boolean).join(' - ')];
  const width = (section.columns ?? []).length;
  const out = cells.slice(0, width).map((c) => c.trim());
  while (out.length < width) out.push('');
  return out;
}

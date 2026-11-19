import { button, el } from '@/quiz/dom';
import { changeLabel, describeEdits, formatShift, predictionWord, tokenise } from './model';
import { notePrompt, type LabStep, type PublicLab } from './schema';
import type { LabMe, LabStatus } from './api';

/**
 * Lab notes: one short note at every step, when the lab has them on. A step
 * shows a dashed "Lab note" box with that step's prompt, and its main button
 * goes through once the note has words; until then a calm line sits under
 * the box and the box takes the cursor. A one-line strip above the card
 * keeps the facts as they happen, and the notes come back in step order
 * above the Explain box. With lab notes off nothing here renders and nothing
 * blocks.
 */
export type LabNotesContext = {
  lab: PublicLab;
  me: LabMe;
  /** The step's unsent state (the player's `draft`): what is typed in a note box waits here, so a redraw keeps it. */
  draft: Record<string, unknown>;
  /** Saves a note by itself, for the steps where the note is what the student hands over. */
  save(step: LabStep, text: string): Promise<unknown>;
};

export const NOTE_GATE = 'Write your lab note to carry on.';

/** True when this lab asks for a note at every step. */
export const notesOn = (lab: Pick<PublicLab, 'notes_on'>): boolean => lab.notes_on === true;

const draftKey = (step: LabStep): string => `note:${step}`;
const missKey = (step: LabStep): string => `note-miss:${step}`;
const partsKey = (step: LabStep): string => `note-box:${step}`;
type BoxParts = { area: HTMLTextAreaElement; miss: HTMLElement };

/** The note for a step as it stands on this device: what is typed, else what is saved. Empty when lab notes are off. */
export function noteText(step: LabStep, ctx: LabNotesContext): string {
  if (!notesOn(ctx.lab)) return '';
  const typed = ctx.draft[draftKey(step)];
  return (typeof typed === 'string' ? typed : ctx.me.notes?.[step] ?? '').trim();
}

/** True once this step's note is saved with the student's record. */
export const noteSaved = (step: LabStep, ctx: LabNotesContext): boolean => notesOn(ctx.lab) && !!(ctx.me.notes?.[step] ?? '').trim();

/** The note box for a step, or null when lab notes are off. */
export function noteBox(step: LabStep, ctx: LabNotesContext): HTMLElement | null {
  if (!notesOn(ctx.lab)) return null;
  const box = el('label', 'lab-note');
  box.dataset.note = step;
  const area = el('textarea');
  area.rows = 2;
  area.maxLength = 600;
  area.placeholder = notePrompt(ctx.lab, step);
  const typed = ctx.draft[draftKey(step)];
  area.value = typeof typed === 'string' ? typed : ctx.me.notes?.[step] ?? '';
  const miss = el('em', '', ctx.draft[missKey(step)] === true && !area.value.trim() ? NOTE_GATE : '');
  miss.setAttribute('role', 'status');
  area.addEventListener('input', () => {
    ctx.draft[draftKey(step)] = area.value;
    if (area.value.trim()) {
      miss.textContent = '';
      delete ctx.draft[missKey(step)];
    }
  });
  box.append(el('span', '', 'Lab note'), area, miss);
  ctx.draft[partsKey(step)] = { area, miss } satisfies BoxParts;
  return box;
}

/** A note already written for a step, shown back once the step is done. Null when there is none to show. */
export function notedLine(step: LabStep, ctx: LabNotesContext): HTMLElement | null {
  if (!notesOn(ctx.lab)) return null;
  const text = (ctx.me.notes?.[step] ?? '').trim();
  return text ? el('p', 'lab-said', text) : null;
}

/**
 * True when the step's main button may go through: lab notes are off, or the
 * step's note has words. When it may not, the calm line shows under the box
 * and the box takes the cursor.
 */
export function noteAllows(step: LabStep, ctx: LabNotesContext): boolean {
  if (!notesOn(ctx.lab)) return true;
  if (noteText(step, ctx)) return true;
  ctx.draft[missKey(step)] = true;
  const parts = ctx.draft[partsKey(step)] as BoxParts | undefined;
  if (parts) {
    parts.miss.textContent = NOTE_GATE;
    parts.area.focus();
  }
  return false;
}

/**
 * The foot of a step whose note is what the student hands over (Question,
 * Test, Result), and of a step a partner has already completed for the pair:
 * the note box with Save note until the note is saved, then the note shown
 * back above the waiting line. With lab notes off it is the waiting line alone.
 */
export function noteOrWait(step: LabStep, ctx: LabNotesContext, wait: HTMLElement | null): HTMLElement[] {
  const rest = wait ? [wait] : [];
  if (!notesOn(ctx.lab)) return rest;
  if (noteSaved(step, ctx)) return [notedLine(step, ctx)!, ...rest];
  const save = button('Save note', 'primary', () => {
    if (!noteAllows(step, ctx)) return;
    save.disabled = true;
    void ctx.save(step, noteText(step, ctx));
  });
  save.dataset.act = 'save-note';
  return [noteBox(step, ctx)!, save];
}

/** Everything a student noted, in step order, for the panel above the Explain box. Null when there is nothing to show. */
export function notesPanel(ctx: Pick<LabNotesContext, 'lab' | 'me'>, steps: readonly LabStep[]): HTMLElement | null {
  if (!notesOn(ctx.lab)) return null;
  return notesList(ctx.me.notes ?? {}, steps, 'Your lab notes');
}

/** Notes as a labelled list in step order: the student's own panel, and the one beside their answer when it is marked. */
export function notesList(notes: Record<string, string>, steps: readonly string[], label: string): HTMLElement | null {
  const kept = steps.filter((step) => (notes[step] ?? '').trim());
  if (!kept.length) return null;
  const box = el('div', 'lab-pane lab-notes-panel');
  const list = el('ul', 'lab-notes-list');
  for (const step of kept) {
    const item = el('li');
    item.append(el('b', '', step), notes[step]!.trim());
    list.append(item);
  }
  box.append(el('span', 'lab-label', label), list);
  return box;
}

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
type FactsStatus = Pick<LabStatus, 'me' | 'pair' | 'control' | 'findings' | 'results'>;

/** The facts so far, in the order they happen: the change, the prediction, the shift (or the winner), the feature. */
export function labFacts(lab: PublicLab, status: FactsStatus): string[] {
  const bits: string[] = [];
  if (lab.level === 'pairs') {
    const pair = status.pair;
    if (!pair?.trial) return bits;
    if (pair.ready || pair.pred !== null) bits.push(changeLabel(describeEdits(tokenise(status.control ?? ''), pair.edit)));
    if (pair.pred !== null) bits.push(`Predicted ${predictionWord(pair.pred, lab.trait)}`);
    if (status.findings?.mine) bits.push(`Shift ${formatShift(status.findings.mine.shift)}`);
    const feature = pair.feature !== null ? lab.features?.[pair.feature] : undefined;
    if (feature) bits.push(feature.name);
    return bits.filter(Boolean);
  }
  const options = lab.options ?? [];
  const pred = status.me?.pred;
  if (pred !== null && pred !== undefined && options[pred]) bits.push(`Predicted ${lower(options[pred]!)}`);
  if (status.results) bits.push(status.results.win && options[status.results.top] ? `${options[status.results.top]} ${lab.judge === 'pick' ? 'won' : 'scored highest'}` : 'Too close to call');
  return bits;
}

/** The one-line "Lab notes" strip above the student's card. Null when lab notes are off or nothing has happened yet. */
export function factsStrip(lab: PublicLab, status: FactsStatus): HTMLElement | null {
  if (!notesOn(lab)) return null;
  const bits = labFacts(lab, status);
  if (!bits.length) return null;
  const strip = el('p', 'lab-notes');
  strip.append(el('b', '', 'Lab notes'), bits.join(' · '));
  return strip;
}

import type { LabStep, PublicLab } from './schema';
import type { LabMe } from './api';

/**
 * Lab notes: the seam every step calls. Task 5 builds the dashed note box,
 * the gate on each step's main button, the facts strip and the notes panel
 * here. Until then nothing renders and nothing blocks, which is also what
 * "Lab notes: Off" means.
 */
export type LabNotesContext = { lab: PublicLab; me: LabMe; save(step: LabStep, text: string): Promise<unknown> };

/** True when this lab asks for a note at every step. */
export const notesOn = (lab: Pick<PublicLab, 'notes_on'>): boolean => lab.notes_on === true;

/** The note box for a step, or null when the step shows none. */
export function noteBox(_step: LabStep, _ctx: LabNotesContext): HTMLElement | null {
  return null;
}

/** A note already written for a step, shown back once the step is done. Null when there is none to show. */
export function notedLine(_step: LabStep, _ctx: LabNotesContext): HTMLElement | null {
  return null;
}

/** True when the step's main button may go through. Task 5 turns this into the note gate. */
export function noteAllows(_step: LabStep, _ctx: LabNotesContext): boolean {
  return true;
}

/** Everything a student noted, in step order, for the panel above the Explain box. Null when there is nothing to show. */
export function notesPanel(_ctx: LabNotesContext, _steps: LabStep[]): HTMLElement | null {
  return null;
}

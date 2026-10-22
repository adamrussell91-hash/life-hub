import { el } from '@/quiz/dom';
import type { AssessmentColumn, AssessmentMark } from './schema';
import type { RosterStudent } from './types';
import { bandFor } from './calc';
import { openOverlay } from './overlay';

/**
 * Marking one assessment task, one student at a time, from a pile of scripts.
 * Enter saves and moves on, so the keyboard never has to leave the boxes.
 */

export type AssessmentPanelOptions = {
  column: AssessmentColumn;
  students: RosterStudent[];
  studentId: string;
  /** Read each time a student is shown, so it reflects saves made in the panel. */
  markFor: (studentId: string) => AssessmentMark | undefined;
  onSave: (studentId: string, mark: AssessmentMark | null) => void;
  /** Where focus goes on close when the opener is gone; gets the student shown last. */
  returnFocus?: (studentId: string) => HTMLElement | null;
};

let panelCount = 0;

export function openAssessmentPanel(o: AssessmentPanelOptions): HTMLElement {
  const panel = el('div', 'mb-panel');
  panelCount += 1;
  const taskId = `mb-panel-task-${panelCount}`;
  const studentId = `mb-panel-student-${panelCount}`;
  let current = o.studentId;
  let boxes: HTMLInputElement[] = [];
  let feedback: HTMLTextAreaElement;
  let exempt: HTMLInputElement;
  let note: HTMLInputElement;
  let error: HTMLElement;

  function paint(): void {
    const student = o.students.find((s) => s.id === current) ?? { id: current, name: 'Removed student', initials: '–' };
    const mark = o.markFor(current);
    panel.replaceChildren();
    const task = el('p', 'mb-panel__task', o.column.title);
    task.id = taskId;
    const heading = el('h3', 'mb-panel__student', `${student.initials} · ${student.name}`);
    heading.id = studentId;
    panel.append(task, heading);
    boxes = o.column.criteria.map((c) => {
      const row = el('label', 'mb-panel__row');
      const box = el('input', 'mb-form__input mb-panel__mark');
      box.type = 'number';
      box.inputMode = 'decimal';
      box.min = '0';
      box.max = String(c.max);
      // Any decimal, e.g. 7.25; the range is checked on save.
      box.step = 'any';
      const given = mark?.criteria?.[c.id];
      box.value = typeof given === 'number' ? String(given) : '';
      const band = el('span', 'mb-panel__band');
      const showBand = () => {
        const n = Number(box.value);
        const label = box.value.trim() && Number.isFinite(n) ? bandFor(c, n) : null;
        band.textContent = label ? `Band ${label}` : '';
      };
      box.addEventListener('input', showBand);
      showBand();
      box.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveAndNext();
        }
      });
      row.append(el('span', 'mb-form__label', `${c.label} (out of ${c.max})`), box, band);
      panel.append(row);
      return box;
    });
    feedback = el('textarea', 'mb-form__input mb-panel__feedback');
    feedback.rows = 3;
    feedback.value = mark?.feedback ?? '';
    const exemptRow = el('label', 'mb-panel__exempt-row');
    exempt = el('input', 'mb-panel__exempt');
    exempt.type = 'checkbox';
    exempt.checked = !!mark?.exempt;
    exemptRow.append(exempt, el('span', undefined, 'Exempt from this task'));
    note = el('input', 'mb-form__input mb-panel__note');
    note.placeholder = 'Reason or provision, e.g. misadventure, extra time';
    note.value = mark?.note ?? '';
    error = el('p', 'mb-form__error mb-panel__error');
    error.setAttribute('role', 'alert');
    const fb = el('label', 'mb-form__field');
    fb.append(el('span', 'mb-form__label', 'Feedback (optional)'), feedback);
    const nt = el('label', 'mb-form__field');
    nt.append(el('span', 'mb-form__label', 'Note'), note);
    const actions = el('div', 'mb-form__actions');
    const next = el('button', 'btn btn--primary mb-panel__next', 'Save and next');
    next.type = 'button';
    next.addEventListener('click', saveAndNext);
    const saveBtn = el('button', 'btn btn--secondary mb-panel__save', 'Save');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      if (save()) close();
    });
    const closeBtn = el('button', 'btn btn--secondary mb-panel__close', 'Close');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => close());
    actions.append(next, saveBtn, closeBtn);
    panel.append(fb, exemptRow, nt, error, actions);
  }

  function collect(): AssessmentMark | null | string {
    const noteText = note.value.trim();
    if (exempt.checked) return { criteria: {}, exempt: true, ...(noteText ? { note: noteText } : {}) };
    const criteria: Record<string, number> = {};
    for (const [i, c] of o.column.criteria.entries()) {
      const box = boxes[i]!;
      const text = box.value.trim();
      // A browser blanks a number box it can't read, so ask rather than treat it as empty.
      if (!text && !box.validity?.badInput) continue;
      const n = Number(text);
      if (!text || !Number.isFinite(n) || n < 0 || n > c.max) return `Give between 0 and ${c.max} for ${c.label}.`;
      criteria[c.id] = n;
    }
    const fbText = feedback.value.trim();
    if (!Object.keys(criteria).length && !fbText && !noteText) return null;
    return { criteria, ...(fbText ? { feedback: fbText } : {}), ...(noteText ? { note: noteText } : {}) };
  }

  function save(): boolean {
    const mark = collect();
    if (typeof mark === 'string') {
      error.textContent = mark;
      return false;
    }
    o.onSave(current, mark);
    return true;
  }

  function saveAndNext(): void {
    if (!save()) return;
    const at = o.students.findIndex((s) => s.id === current);
    const next = o.students[at + 1];
    if (!next) {
      close();
      return;
    }
    current = next.id;
    paint();
    boxes[0]?.focus();
  }

  paint();
  const { overlay, close } = openOverlay(panel, {
    labelledBy: `${taskId} ${studentId}`,
    returnFocus: () => o.returnFocus?.(current) ?? null
  });
  boxes[0]?.focus();
  return overlay;
}

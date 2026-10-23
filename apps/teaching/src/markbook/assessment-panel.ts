import type { SkillsContinuum } from '@/skills/schema';
import { findSkill, nextMoveFor, rungForMark, rungName } from '@/skills/model';
import { el } from '@/quiz/dom';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import { codeChips } from '@/evidence/code-chips';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { MARKBOOK_LIMITS, type AssessmentColumn, type AssessmentMark } from './schema';
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
  /** Lets the owner report a save that failed later. Returns an unsubscribe, called on close. */
  subscribeErrors?: (show: (message: string) => void) => () => void;
  /** The skills continuum, so a criterion linked to a skill shows its rung and next move. */
  skills?: SkillsContinuum | null;
  /** The teacher's feedback codes, offered under each criterion below full marks. */
  codes?: FeedbackCode[];
};

type Problem = { problem: string; index: number };

let panelCount = 0;

/** A typed mark as the box would show it, so 7.50 and 7.5 count as the same. */
function tidy(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : t;
}

export function openAssessmentPanel(o: AssessmentPanelOptions): HTMLElement {
  const panel = el('div', 'mb-panel');
  panelCount += 1;
  const prefix = `mb-panel-${panelCount}`;
  const taskId = `${prefix}-task`;
  const studentId = `${prefix}-student`;
  // Lives outside the repainted part, so screen readers hear each move.
  const announce = el('p', 'mb-sr mb-panel__announce');
  announce.setAttribute('aria-live', 'polite');
  const body = el('div', 'mb-panel__body');
  panel.append(announce, body);
  let current = o.studentId;
  let boxes: HTMLInputElement[] = [];
  /** Feedback codes picked per criterion for the student shown. */
  let picked: Record<string, string[]> = {};
  let feedback: HTMLTextAreaElement;
  let exempt: HTMLInputElement;
  let note: HTMLInputElement;
  let error: HTMLElement;
  let asking = false;
  let unsubscribe: (() => void) | undefined;

  const studentOf = (id: string): RosterStudent => o.students.find((s) => s.id === id) ?? { id, name: 'Removed student', initials: '–' };

  function clearError(): void {
    error.textContent = '';
    for (const b of boxes) b.removeAttribute('aria-invalid');
  }

  /** Under a skill-linked criterion: the rung the mark reaches and the next move, which can go into the feedback. */
  function skillPanel(c: AssessmentColumn['criteria'][number], box: HTMLInputElement, feedbackBox: () => HTMLTextAreaElement | undefined): { node: HTMLElement; update: () => void } | null {
    const entry = o.skills ? findSkill(o.skills, c.skill) : null;
    if (!entry || !o.skills) return null;
    const continuum = o.skills;
    const node = el('div', 'mb-panel__skill');
    node.setAttribute('aria-live', 'polite');
    const update = (): void => {
      const n = Number(box.value);
      const fits = box.value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= c.max;
      node.replaceChildren(el('span', 'mb-panel__skill-name', `${entry.strand.name} · ${entry.sub.name}`));
      if (!fits) {
        node.append(el('span', 'mb-panel__skill-hint', 'Enter a mark to see the rung and next move.'));
        return;
      }
      const rung = rungForMark(n, c.max);
      const next = nextMoveFor(entry.sub, rung);
      const add = el('button', 'btn btn--secondary mb-panel__skill-add', 'Add next move to feedback');
      add.type = 'button';
      add.addEventListener('click', () => {
        const fb = feedbackBox();
        if (!fb) return;
        const line = `${entry.sub.name}: ${next.move}`;
        if (fb.value.includes(line)) return;
        fb.value = fb.value.trim() ? `${fb.value.trim()}\n${line}` : line;
        fb.dispatchEvent(new Event('input'));
        add.textContent = 'Added';
        add.disabled = true;
      });
      node.append(
        el('span', `mb-panel__rung mb-panel__rung--${rung}`, rungName(continuum, rung)),
        el('p', 'mb-panel__skill-next', `Next move: ${next.move}`),
        add
      );
    };
    update();
    return { node, update };
  }

  function paint(): void {
    const student = studentOf(current);
    const mark = o.markFor(current);
    body.replaceChildren();
    const task = el('p', 'mb-panel__task', o.column.title);
    task.id = taskId;
    const heading = el('h3', 'mb-panel__student', `${student.initials} · ${student.name}`);
    heading.id = studentId;
    body.append(task, heading);
    picked = Object.fromEntries(Object.entries(mark?.codes ?? {}).map(([id, list]) => [id, [...list]]));
    boxes = o.column.criteria.map((c, i) => {
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
      band.id = `${prefix}-band-${i}`;
      band.setAttribute('aria-live', 'polite');
      box.setAttribute('aria-describedby', band.id);
      const showBand = () => {
        const n = Number(box.value);
        const fits = box.value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= c.max;
        const label = fits ? bandFor(c, n) : null;
        band.textContent = label ? `Band ${label}` : '';
      };
      const skillBox = skillPanel(c, box, () => feedback);
      box.addEventListener('input', () => {
        clearError();
        showBand();
        skillBox?.update();
      });
      showBand();
      box.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.repeat || event.isComposing) return;
        event.preventDefault();
        saveAndNext();
      });
      row.append(el('span', 'mb-form__label', `${c.label} (out of ${c.max})`), box, band);
      body.append(row);
      if (skillBox) body.append(skillBox.node);
      if (o.codes?.length) {
        const chipHost = el('div', 'mb-panel__codes');
        const showChips = (): void => {
          const n = Number(box.value);
          chipHost.hidden = !(box.value.trim() !== '' && Number.isFinite(n) && n < c.max);
        };
        chipHost.append(
          codeChips({
            codes: o.codes,
            selected: picked[c.id] ?? [],
            onChange: (ids) => {
              picked[c.id] = ids;
              clearError();
            }
          })
        );
        box.addEventListener('input', showChips);
        showChips();
        body.append(chipHost);
      }
      return box;
    });
    feedback = el('textarea', 'mb-form__input mb-panel__feedback');
    feedback.rows = 3;
    feedback.maxLength = MARKBOOK_LIMITS.feedback;
    feedback.value = mark?.feedback ?? '';
    feedback.addEventListener('input', clearError);
    const exemptRow = el('label', 'mb-panel__exempt-row');
    exempt = el('input', 'mb-panel__exempt');
    exempt.type = 'checkbox';
    exempt.checked = !!mark?.exempt;
    exemptRow.append(exempt, el('span', undefined, 'Exempt from this task'));
    const hint = el('p', 'mb-panel__exempt-hint', 'Marks and feedback aren’t kept while the student is exempt.');
    const applyExempt = () => {
      for (const b of boxes) b.disabled = exempt.checked;
      feedback.disabled = exempt.checked;
      hint.hidden = !exempt.checked;
    };
    exempt.addEventListener('change', () => {
      clearError();
      applyExempt();
    });
    note = el('input', 'mb-form__input mb-panel__note');
    note.maxLength = MARKBOOK_LIMITS.note;
    note.placeholder = 'Reason or provision, e.g. misadventure, extra time';
    note.value = mark?.note ?? '';
    note.addEventListener('input', clearError);
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
    closeBtn.addEventListener('click', () => {
      if (canClose()) close();
    });
    actions.append(next, saveBtn, closeBtn);
    body.append(fb, exemptRow, hint, nt, error, actions);
    applyExempt();
  }

  function collect(): AssessmentMark | null | Problem {
    const noteText = note.value.trim();
    if (exempt.checked) return { criteria: {}, exempt: true, ...(noteText ? { note: noteText } : {}) };
    const criteria: Record<string, number> = {};
    for (const [i, c] of o.column.criteria.entries()) {
      const box = boxes[i]!;
      const text = box.value.trim();
      // A browser blanks a number box it can't read, so ask rather than treat it as empty.
      if (!text && !box.validity?.badInput) continue;
      const n = Number(text);
      if (!text || !Number.isFinite(n) || n < 0 || n > c.max) return { problem: `Give between 0 and ${c.max} for ${c.label}.`, index: i };
      criteria[c.id] = n;
    }
    // Codes count only where marks were lost, so raising a mark to full drops them.
    const codes = Object.fromEntries(
      o.column.criteria
        .filter((c) => typeof criteria[c.id] === 'number' && (criteria[c.id] as number) < c.max && picked[c.id]?.length)
        .map((c) => [c.id, picked[c.id] as string[]])
    );
    const fbText = feedback.value.trim();
    if (!Object.keys(criteria).length && !fbText && !noteText) return null;
    return { criteria, ...(Object.keys(codes).length ? { codes } : {}), ...(fbText ? { feedback: fbText } : {}), ...(noteText ? { note: noteText } : {}) };
  }

  /** Codes in a comparable shape: empty lists dropped, criteria in column order, ids sorted. */
  function liveCodes(codes: Record<string, string[]>): Array<[string, string[]]> {
    return o.column.criteria.filter((c) => codes[c.id]?.length).map((c) => [c.id, [...codes[c.id]!].sort()]);
  }

  /** The fields as typed, and a saved mark as the fields would show it, in one comparable shape. */
  function typedState(): string {
    const ex = exempt.checked;
    return JSON.stringify({
      ex,
      marks: ex ? [] : boxes.map((b) => (b.validity?.badInput ? '\u0000' : tidy(b.value))),
      feedback: ex ? '' : feedback.value.trim(),
      // Only codes collect() would keep: those under a typed mark below full.
      codes: ex ? {} : liveCodes(Object.fromEntries(o.column.criteria.filter((c, i) => {
        const t = boxes[i]?.value.trim() ?? '';
        return t !== '' && Number(t) < c.max;
      }).map((c) => [c.id, picked[c.id] ?? []]))),
      note: note.value.trim()
    });
  }
  function savedState(mark: AssessmentMark | undefined): string {
    const ex = !!mark?.exempt;
    return JSON.stringify({
      ex,
      marks: ex ? [] : o.column.criteria.map((c) => {
        const v = mark?.criteria?.[c.id];
        return typeof v === 'number' ? String(v) : '';
      }),
      feedback: ex ? '' : (mark?.feedback ?? '').trim(),
      codes: ex ? {} : liveCodes(mark?.codes ?? {}),
      note: (mark?.note ?? '').trim()
    });
  }

  /** Closes straight away unless there is unsaved typing; then asks, and closes only on a yes. */
  function canClose(): boolean {
    if (typedState() === savedState(o.markFor(current))) return true;
    // Next tick, so the Escape that asked has finished before the card starts listening.
    setTimeout(() => void askThenClose(), 0);
    return false;
  }

  async function askThenClose(): Promise<void> {
    if (asking) return;
    asking = true;
    const back = document.activeElement;
    let yes = false;
    try {
      yes = await askConfirmCard({ title: 'Close without saving?', supporting: 'What you typed for this student will be lost.', confirmLabel: 'Close' });
    } finally {
      asking = false;
    }
    if (!panel.isConnected) return;
    if (yes) close();
    else if (back instanceof HTMLElement && back.isConnected) back.focus();
  }

  function save(): boolean {
    const mark = collect();
    if (mark && 'problem' in mark) {
      error.textContent = mark.problem;
      const box = boxes[mark.index];
      box?.setAttribute('aria-invalid', 'true');
      box?.focus();
      return false;
    }
    o.onSave(current, mark);
    return true;
  }

  /** The first mark box, or for an exempt student Save and next, so Enter still moves on. */
  function focusFirst(): void {
    (boxes.find((b) => !b.disabled) ?? body.querySelector<HTMLButtonElement>('.mb-panel__next'))?.focus();
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
    announce.textContent = `Now marking ${next.initials} · ${next.name}`;
    focusFirst();
  }

  paint();
  const { overlay, close } = openOverlay(panel, {
    labelledBy: `${taskId} ${studentId}`,
    returnFocus: () => o.returnFocus?.(current) ?? null,
    canClose,
    onClose: () => unsubscribe?.()
  });
  unsubscribe = o.subscribeErrors?.((message) => {
    if (!panel.isConnected) {
      unsubscribe?.();
      return;
    }
    error.textContent = message;
  });
  focusFirst();
  return overlay;
}

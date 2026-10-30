import { el } from '@/quiz/dom';
import { emptyWritingLog, recordChange, type WritingCheck, type WritingLog } from '@/quiz/writing';

export type WritingWatch = {
  check: Exclude<WritingCheck, 'off'>;
  /** The log so far for this answer, carried across question changes and reloads. */
  log: WritingLog | null;
  /** Called when a log is made, and after a paste, a drop or the student leaving the page. Typing itself rides the answer's own save. */
  onLog: (log: WritingLog) => void;
};

/**
 * Watches one written answer box: records every change for the teacher's
 * replay, counts paste attempts and times the window lost focus, and with
 * the check on block, stops paste and drop. Returns the line shown under the
 * box, which says what is watched.
 */
export function watchWriting(input: HTMLTextAreaElement, watch: WritingWatch): HTMLElement {
  let log = watch.log;
  let before = input.value;
  let pasted = false;
  const block = watch.check === 'block';
  const note = el('p', 'qz-writing-note', block ? 'Pasting is off. Your teacher sees how this answer was typed.' : 'Your teacher sees how this answer was typed.');
  note.setAttribute('aria-live', 'polite');

  const ensure = (): WritingLog => {
    if (!log) {
      log = emptyWritingLog(before);
      watch.onLog(log);
    }
    return log;
  };

  const tried = (event: Event): void => {
    const current = ensure();
    current.pastes += 1;
    if (block) {
      event.preventDefault();
      note.textContent = 'Pasting is off for this quiz. Type your answer in your own words.';
      note.dataset.state = 'blocked';
    } else pasted = true;
    watch.onLog(current);
  };
  input.addEventListener('paste', tried);
  input.addEventListener('drop', tried);

  input.addEventListener('input', () => {
    const current = ensure();
    recordChange(current, before, input.value, Date.now(), pasted);
    pasted = false;
    before = input.value;
  });

  const away = (): void => {
    if (!input.isConnected) {
      window.removeEventListener('blur', away);
      return;
    }
    if (document.activeElement !== input || !log) return;
    log.away += 1;
    watch.onLog(log);
  };
  window.addEventListener('blur', away);

  return note;
}

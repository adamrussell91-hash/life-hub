/**
 * Initials on the live class activities (continuum line, brainstorm): the
 * teacher's own view only. The Display view never asks the server for them
 * and never shows the switch. On by default; the switch is for when the
 * build page itself is up on the projector. Remembered on this browser.
 */
import { readJSON, writeJSON } from '@/blocks/peer-feedback-ui';

const KEY = 'teacher-initials:off';

export function showInitials(): boolean {
  return readJSON<boolean>(KEY) !== true;
}

/** The switch for a teacher bar. `changed` runs after a flip, to fetch or drop the initials. */
export function initialsToggle(changed: () => void): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'pf-switch pf-switch--bar';
  wrap.title = 'Your screen only: each symbol shows the initials the student claimed in the class. Students and the Display view never see them.';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = showInitials();
  box.addEventListener('change', () => {
    writeJSON(KEY, box.checked ? null : true);
    changed();
  });
  const text = document.createElement('span');
  text.textContent = 'Initials';
  wrap.append(box, text);
  return wrap;
}

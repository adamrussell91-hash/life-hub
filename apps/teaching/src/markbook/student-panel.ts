import { el } from '@/quiz/dom';
import { focusFor, type FocusPins } from '@/evidence/patterns';
import type { Evidence, TagKind } from '@/evidence/types';
import { mixUpText, pct } from '@/evidence/views/parts';
import { openOverlay } from './overlay';
import type { RosterStudent } from './types';

export type StudentPanelOptions = {
  student: RosterStudent;
  evidence: Evidence[];
  kind: TagKind;
  label: (tag: string) => string;
  codeLabel: (id: string) => string;
  pins: FocusPins;
  onPins: (pins: FocusPins) => void;
  overall: string;
};

/** One student's focus areas, secure tags and confidence, for the panel and for tests. */
export function studentPanelBody(o: StudentPanelOptions, headingId?: string): HTMLElement {
  const body = el('div', 'mb-student-panel');
  const heading = el('h3', 'mb-panel__student', `${o.student.initials} · ${o.student.name}`);
  if (headingId) heading.id = headingId;
  body.append(heading, el('p', 'mb-panel__task', `Overall ${o.overall}`));
  const { focus, secure } = focusFor(o.evidence, o.student.id, o.kind, o.pins);

  body.append(el('h4', 'mb-form__label', 'Focus areas'));
  if (!focus.length) body.append(el('p', 'mb__empty', 'No weak area has enough evidence yet.'));
  const list = el('ul', 'mb-focus');
  for (const f of focus) {
    const li = el('li', 'mb-focus__item');
    const first = f.why[0];
    const top = first ? mixUpText({ tag: f.tag, key: '', why: first, count: 1, students: [] }, o.label, o.codeLabel) : '';
    li.append(el('span', undefined, `${pct(f.mean)} ${o.label(f.tag)} · ${f.items} ${f.items === 1 ? 'item' : 'items'}${top ? ` · ${top}` : ''}`));
    const pin = el('button', 'btn btn--ghost', f.pinned ? 'Unpin' : 'Pin');
    pin.type = 'button';
    pin.dataset.focus = `${f.tag}:pin`;
    pin.addEventListener('click', () =>
      o.onPins(f.pinned ? { ...o.pins, pinned: o.pins.pinned.filter((t) => t !== f.tag) } : { ...o.pins, pinned: [...o.pins.pinned, f.tag] })
    );
    li.append(pin);
    if (!f.pinned) {
      const dismiss = el('button', 'btn btn--ghost', 'Dismiss');
      dismiss.type = 'button';
      dismiss.dataset.focus = `${f.tag}:dismiss`;
      dismiss.addEventListener('click', () => o.onPins({ ...o.pins, dismissed: [...o.pins.dismissed, f.tag] }));
      li.append(dismiss);
    }
    list.append(li);
  }
  body.append(list);

  body.append(el('h4', 'mb-form__label', 'Secure'));
  body.append(el('p', 'mb__empty', secure.length ? secure.map((s) => `${o.label(s.tag)} ${pct(s.mean)}`).join(' · ') : 'Nothing secure with enough evidence yet.'));

  const mine = o.evidence.filter((e) => e.student === o.student.id && e.share !== null);
  const sureWrong = mine.filter((e) => e.confidence === 3 && (e.share as number) < 1);
  const wrongTags = [...new Set(sureWrong.flatMap((e) => e.tags.filter((t) => t.startsWith(`${o.kind}:`))))].map(o.label).join(', ') || 'untagged questions';
  body.append(el('h4', 'mb-form__label', 'Confidence'));
  body.append(el('p', 'mb__empty', sureWrong.length ? `Sure but wrong ${sureWrong.length} ${sureWrong.length === 1 ? 'time' : 'times'}, on ${wrongTags}.` : 'Never sure and wrong.'));
  if (o.pins.dismissed.length) {
    const undo = el('button', 'btn btn--ghost', `Show ${o.pins.dismissed.length} dismissed`);
    undo.type = 'button';
    undo.dataset.focus = 'show-dismissed';
    undo.addEventListener('click', () => o.onPins({ ...o.pins, dismissed: [] }));
    body.append(undo);
  }
  return body;
}

export type StudentPanelHandle = {
  /** Redraws with the pins `pinsNow` gives, e.g. after a failed save was rolled back. */
  refresh: () => void;
  close: () => void;
  /** False once the overlay has left the page, however it went. */
  isOpen: () => boolean;
};

export function openStudentPanel(
  o: StudentPanelOptions & { returnFocus?: () => HTMLElement | null; pinsNow?: () => FocusPins; onClose?: () => void }
): StudentPanelHandle {
  const sheet = el('div', 'mb-sheet mb-sheet--student');
  const close = el('button', 'btn btn--secondary mb-sheet__close', 'Close');
  close.type = 'button';
  const headingId = `mb-student-${o.student.id}`;
  let pins = o.pins;
  const build = (): HTMLElement => studentPanelBody({ ...o, pins, onPins: pick }, headingId);
  let body = build();
  /**
   * Draws the body again, keeping focus on the same control, or the heading when it has gone.
   * After a press (`pressed`) focus always lands somewhere in the panel: Safari leaves it on the body.
   */
  function repaint(pressed: boolean): void {
    const active = document.activeElement;
    const hadFocus = active instanceof HTMLElement && body.contains(active);
    const key = hadFocus ? (active.dataset.focus ?? null) : null;
    const fresh = build();
    body.replaceWith(fresh);
    body = fresh;
    if (!hadFocus && !pressed) return;
    const same = key ? ([...fresh.querySelectorAll<HTMLElement>('[data-focus]')].find((n) => n.dataset.focus === key) ?? null) : null;
    if (same) same.focus();
    else {
      const heading = fresh.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`);
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
  }
  function pick(next: FocusPins): void {
    // Set first, so a refresh the save triggers sees nothing new.
    pins = next;
    o.onPins(next);
    repaint(true);
  }
  sheet.append(close, body);
  const opened = openOverlay(sheet, { labelledBy: headingId, returnFocus: o.returnFocus, onClose: o.onClose });
  close.addEventListener('click', () => opened.close());
  return {
    refresh: () => {
      const now = o.pinsNow?.();
      if (!now || JSON.stringify(now) === JSON.stringify(pins)) return;
      pins = now;
      repaint(false);
    },
    close: () => opened.close(),
    isOpen: () => opened.overlay.isConnected
  };
}

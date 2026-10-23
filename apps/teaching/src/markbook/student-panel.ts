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
export function studentPanelBody(o: StudentPanelOptions): HTMLElement {
  const body = el('div', 'mb-student-panel');
  const heading = el('h3', 'mb-panel__student', `${o.student.initials} · ${o.student.name}`);
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
    pin.addEventListener('click', () =>
      o.onPins(f.pinned ? { ...o.pins, pinned: o.pins.pinned.filter((t) => t !== f.tag) } : { ...o.pins, pinned: [...o.pins.pinned, f.tag] })
    );
    li.append(pin);
    if (!f.pinned) {
      const dismiss = el('button', 'btn btn--ghost', 'Dismiss');
      dismiss.type = 'button';
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
    undo.addEventListener('click', () => o.onPins({ ...o.pins, dismissed: [] }));
    body.append(undo);
  }
  return body;
}

export function openStudentPanel(o: StudentPanelOptions & { returnFocus?: () => HTMLElement | null }): void {
  const sheet = el('div', 'mb-sheet mb-sheet--student');
  const close = el('button', 'btn btn--secondary mb-sheet__close', 'Close');
  close.type = 'button';
  const headingId = `mb-student-${o.student.id}`;
  const build = (): HTMLElement => {
    const next = studentPanelBody({ ...o, onPins: redraw });
    (next.querySelector('h3') as HTMLElement).id = headingId;
    return next;
  };
  let body = build();
  function redraw(pins: FocusPins): void {
    o.onPins(pins);
    o = { ...o, pins };
    const next = build();
    body.replaceWith(next);
    body = next;
  }
  sheet.append(close, body);
  const opened = openOverlay(sheet, { labelledBy: headingId, returnFocus: o.returnFocus });
  close.addEventListener('click', () => opened.close());
}

import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import type { GroupBoard, SprintSummary, SprintTeacherApi } from './api';

const PITCH_MS = 120_000;
const POLL_MS = 4000;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/**
 * The pitch on the projector: one group at a time, its pitch file, a
 * 2-minute timer (a prompt, never a cut-off) and the feedback round. The
 * class gives feedback on their own devices while it is open.
 */
export function openPitchView(o: { api: SprintTeacherApi; getLesson: () => Lesson; summary: SprintSummary; onClose(): void }): () => void {
  const groups = o.summary.groups;
  let at = Math.max(0, groups.findIndex((g) => g.id === o.summary.running));
  let started = 0;
  let tick = 0;
  let poll = 0;
  let objectUrl = '';
  const view = el('div', 'spitch');
  view.setAttribute('role', 'dialog');
  view.setAttribute('aria-label', 'Pitches');
  const bar = el('div', 'spitch__bar');
  const who = el('div', 'spitch__who');
  const timer = el('div', 'spitch__timer', clock(PITCH_MS));
  const stage = el('div', 'spitch__stage');
  const foot = el('div', 'spitch__foot');
  const count = el('span', 'spitch__count');
  const order = el('div', 'spitch__order');
  bar.append(who, timer);
  view.append(bar, stage, foot, order);
  document.body.append(view);

  const outside = () => groups.filter((g) => g.id !== groups[at]!.id).reduce((n, g) => n + g.students.length, 0);
  const showCount = (b: GroupBoard | null) => {
    const r = b?.round;
    count.textContent = !r ? 'Feedback not open' : `Feedback ${r.status} · ${r.entries.length} of ${outside()} in`;
  };

  async function show(): Promise<void> {
    const g = groups[at]!;
    who.replaceChildren(el('span', '', `Group ${g.name}`), el('small', '', `Pitch ${at + 1} of ${groups.length}`));
    stage.replaceChildren(el('p', '', 'Opening the pitch file…'));
    started = 0;
    timer.textContent = clock(PITCH_MS);
    await o.api.run(g.id);
    const b = await o.api.board(g.id);
    stage.replaceChildren();
    if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    if (!b.pitch) stage.append(el('p', '', 'This group hasn’t set a pitch file. They can present without one.'));
    else if (b.pitch.kind === 'link' && b.pitch.link) {
      const a = el('a', 'spitch__link', 'Open the group’s link');
      a.href = b.pitch.link;
      a.target = '_blank';
      a.rel = 'noopener';
      stage.append(a);
    } else if (b.pitch.file) {
      objectUrl = await o.api.fileUrl(b.pitch.file);
      if ((b.pitch.name ?? '').toLowerCase().endsWith('.pdf')) {
        const frame = el('iframe', 'spitch__file');
        frame.src = objectUrl;
        frame.title = 'Pitch file';
        stage.append(frame);
      } else {
        const img = el('img', 'spitch__file');
        img.src = objectUrl;
        img.alt = 'The group’s pitch file';
        stage.append(img);
      }
    }
    showCount(b);
    paintOrder();
  }

  const roundButton = (op: 'open' | 'close' | 'release', label: string, kind: 'primary' | 'secondary') => {
    const b = button(label, kind, async () => {
      await o.api.round(groups[at]!.id, op);
      showCount(await o.api.board(groups[at]!.id));
    });
    b.dataset.round = op;
    return b;
  };

  function paintOrder(): void {
    order.replaceChildren(...groups.map((g, i) => {
      const chip = el('button', `spitch__chip${i === at ? ' spitch__chip--now' : i < at ? ' spitch__chip--done' : ''}`, g.name);
      chip.type = 'button';
      chip.addEventListener('click', () => { at = i; void show(); });
      return chip;
    }));
  }

  foot.append(
    count,
    button('Start timer', 'secondary', () => { started = Date.now(); }),
    roundButton('open', 'Open feedback', 'primary'),
    roundButton('close', 'Close feedback', 'secondary'),
    roundButton('release', 'Release to the group', 'secondary'),
    button('Next group', 'secondary', () => { if (at < groups.length - 1) { at += 1; void show(); } }),
    button('Close', 'ghost', () => close())
  );

  tick = window.setInterval(() => {
    if (!started) return;
    const left = Math.max(0, PITCH_MS - (Date.now() - started));
    timer.textContent = clock(left);
    timer.classList.toggle('spitch__timer--up', left === 0);
  }, 250);
  poll = window.setInterval(async () => {
    try { showCount(await o.api.board(groups[at]!.id)); } catch { /* next poll */ }
  }, POLL_MS);

  function close(): void {
    window.clearInterval(tick);
    window.clearInterval(poll);
    if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl);
    view.remove();
    void o.api.run(null).catch(() => {});
    o.onClose();
  }
  void show();
  return close;
}

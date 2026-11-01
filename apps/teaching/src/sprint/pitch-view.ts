import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import type { GroupBoard, SprintSummary, SprintTeacherApi } from './api';

const PITCH_MS = 120_000;
const POLL_MS = 4000;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/**
 * The pitch on the projector: one group at a time, its cover poster, a
 * 2-minute timer (a prompt, never a cut-off) and the feedback round. The
 * pitch file itself downloads to open in its own app. The class gives
 * feedback on their own devices while it is open.
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
  const fileSlot = el('span', 'spitch__fileslot');
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
    who.replaceChildren(el('span', '', /^group\b/i.test(g.name) ? g.name : `Group ${g.name}`), el('small', '', `Pitch ${at + 1} of ${groups.length}`));
    stage.replaceChildren();
    fileSlot.replaceChildren();
    started = 0;
    timer.textContent = clock(PITCH_MS);
    timer.classList.remove('spitch__timer--up');
    await o.api.run(g.id);
    const b = await o.api.board(g.id);
    if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    if (b.cover?.file) {
      objectUrl = await o.api.fileUrl(b.cover.file);
      const img = el('img', 'spitch__cover');
      img.src = objectUrl;
      img.alt = `${g.name}’s cover poster`;
      stage.append(img);
    } else stage.append(el('p', 'spitch__none', 'No cover poster'));
    // The pitch file opens in its own app (slides, PDF) on the teacher's machine, never on this screen.
    if (b.pitch?.kind === 'link' && b.pitch.link) {
      const a = el('a', 'btn btn--secondary spitch__file', 'Open their link');
      a.href = b.pitch.link;
      a.target = '_blank';
      a.rel = 'noopener';
      fileSlot.append(a);
    } else if (b.pitch?.file) {
      const file = b.pitch.file;
      const name = b.pitch.name ?? 'pitch file';
      fileSlot.append(button('Download pitch file', 'secondary', async () => {
        const url = await o.api.fileUrl(file);
        const a = el('a');
        a.href = url;
        a.download = name;
        a.click();
        window.setTimeout(() => { if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url); }, 10_000);
      }));
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
    fileSlot,
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

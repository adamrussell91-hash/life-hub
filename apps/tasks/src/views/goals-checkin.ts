// apps/tasks/src/views/goals-checkin.ts
/**
 * G-36 / G-37 Sunday check-in: 3-step flow (What moved → Stuck why → One move).
 */
import type { Goal } from '@/schemas/goal';
import type { GoalReadEnvelope } from '@/domain/goal-reads';
import { describeGhost } from '@/domain/goal-reads';
import { tasksApi } from '@/services/client-api';
import { el } from '@/views/hub-kit';
import { createStepIndicator } from '../../design-kit/js/hub-surfaces.js';
import { createCardSwipe } from '../../design-kit/js/card-swipe.js';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

const STUCK_REASONS = [
  { id: 'too_big', label: 'too big' },
  { id: 'unclear', label: 'unclear' },
  { id: 'boring', label: 'boring' },
  { id: 'no_time', label: 'no time' },
  { id: 'waiting', label: 'waiting on someone' }
] as const;

function dow(today: string): number {
  return new Date(`${today}T00:00:00Z`).getUTCDay();
}

/** Prominent on Sat/Sun/Mon. */
export function checkInProminent(today: string): boolean {
  const d = dow(today);
  return d === 0 || d === 1 || d === 6;
}

export function openSundayCheckIn(
  host: HTMLElement,
  goals: Goal[],
  envelopes: GoalReadEnvelope[],
  today: string,
  onDone: () => void
): void {
  document.querySelector('.goals-checkin-sheet')?.remove();
  const sheet = el('div', 'goals-checkin-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Sunday check-in');
  const steps = createStepIndicator({
    root: document,
    steps: ['What moved?', "What's stuck?", 'One move'],
    current: 0
  });
  const body = el('div', 'goals-checkin__body');
  sheet.append(el('h2', '', 'Sunday check-in'), steps.el, body);

  const moved = goals.filter((g) => {
    const read = envelopes.find((e) => e.read?.goal_id === g.id)?.read;
    return (read?.week.count ?? 0) > 0;
  });
  const stuck = goals.filter((g) => {
    const read = envelopes.find((e) => e.read?.goal_id === g.id)?.read;
    return read && (read.temperature === 'cooling' || read.temperature === 'cold');
  });
  const reasons = new Map<string, string>();
  let step = 0;

  const paint = (): void => {
    body.replaceChildren();
    steps.el.querySelectorAll('.hub-steps__item, [data-step]').forEach((node, i) => {
      node.classList.toggle('is-current', i === step);
      node.classList.toggle('is-done', i < step);
    });

    if (step === 0) {
      body.append(el('p', 'meta', 'Goals with any count this week. Tap Next.'));
      if (!moved.length) body.append(el('p', 'empty-state', 'Nothing logged this week yet — that is fine.'));
      for (const g of moved) {
        const read = envelopes.find((e) => e.read?.goal_id === g.id)?.read;
        const row = el('div', 'goals-checkin__row');
        row.append(el('p', '', g.title));
        if (read) row.append(el('span', 'meta', `${read.week.count}/${read.week.per_week ?? '—'} this week`));
        body.append(row);
      }
    } else if (step === 1) {
      body.append(el('p', 'meta', 'Cooling or cold goals — why are they stuck?'));
      if (!stuck.length) body.append(el('p', 'empty-state', 'Nothing stuck. Nice.'));
      for (const g of stuck) {
        const block = el('div', 'goals-checkin__stuck');
        block.append(el('p', '', g.title));
        const chips = el('div', 'row');
        for (const r of STUCK_REASONS) {
          const btn = el('button', 'hub-chip', r.label) as HTMLButtonElement;
          btn.type = 'button';
          if (reasons.get(g.id) === r.id) btn.classList.add('is-selected');
          btn.addEventListener('click', () => {
            reasons.set(g.id, r.id);
            paint();
          });
          chips.append(btn);
        }
        block.append(chips);
        body.append(block);
      }
    } else {
      body.append(el('p', 'meta', 'Confirm or skip one move per stuck goal (max 3).'));
      const ghosts = stuck
        .flatMap((g) => envelopes.find((e) => e.read?.goal_id === g.id)?.read?.ghosts ?? [])
        .slice(0, 3);
      if (!ghosts.length) {
        body.append(el('p', 'empty-state', 'Nothing to change. Keep going.'));
      } else {
        const slides = ghosts.map((ghost) => {
          const card = el('div', 'glass-tile goals-checkin__card');
          const info = describeGhost(ghost);
          card.append(el('p', 'meta', info.kind), el('p', '', info.title));
          const acts = el('div', 'row');
          const confirm = el('button', 'btn btn--primary', 'Confirm') as HTMLButtonElement;
          confirm.type = 'button';
          confirm.addEventListener('click', () => {
            void tasksApi.decideGhost(ghost.id, 'accept').then(() => {
              confirm.disabled = true;
              confirm.textContent = 'Confirmed';
            });
          });
          const skip = el('button', 'btn btn--ghost', 'Skip') as HTMLButtonElement;
          skip.type = 'button';
          skip.addEventListener('click', () => {
            void tasksApi.decideGhost(ghost.id, 'dismiss').then(() => {
              skip.disabled = true;
              skip.textContent = 'Skipped';
            });
          });
          acts.append(confirm, skip);
          card.append(acts);
          return card;
        });
        const swipe = createCardSwipe({ root: document, slides, label: 'Moves', fluid: true });
        body.append(swipe.el);
      }
    }

    const nav = el('div', 'row goals-checkin__nav');
    if (step > 0) {
      const back = el('button', 'btn btn--ghost', 'Back') as HTMLButtonElement;
      back.type = 'button';
      back.addEventListener('click', () => {
        step -= 1;
        paint();
      });
      nav.append(back);
    }
    if (step < 2) {
      const next = el('button', 'btn btn--primary', 'Next') as HTMLButtonElement;
      next.type = 'button';
      next.addEventListener('click', () => {
        step += 1;
        paint();
      });
      nav.append(next);
    } else {
      const done = el('button', 'btn btn--primary', 'Done') as HTMLButtonElement;
      done.type = 'button';
      done.addEventListener('click', () => {
        const planned = Math.min(3, stuck.flatMap((g) => envelopes.find((e) => e.read?.goal_id === g.id)?.read?.ghosts ?? []).length);
        void tasksApi
          .saveGoalCheckin({
            date: today,
            moved: moved.map((g) => g.id),
            stuck: [...reasons.entries()].map(([id, reason]) => ({ id, reason })),
            moves_planned: planned
          })
          .finally(() => {
            sheet.remove();
            onDone();
          });
      });
      nav.append(done);
    }
    const close = el('button', 'btn btn--ghost', 'Close') as HTMLButtonElement;
    close.type = 'button';
    close.addEventListener('click', () => sheet.remove());
    nav.append(close);
    body.append(nav);
  };

  paint();
  host.append(sheet);
  sheet.tabIndex = -1;
  sheet.focus();
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') sheet.remove();
  });
}

export function checkInStripLine(
  checkin: { date: string; moves_planned?: number } | null,
  today: string
): string | null {
  if (!checkin?.date) return null;
  const d = new Date(`${checkin.date}T00:00:00Z`);
  const day = d.getUTCDay();
  const add = (6 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  const nextSat = d.toISOString().slice(0, 10);
  if (today >= nextSat) return null;
  const n = checkin.moves_planned ?? 0;
  return `Checked in ${formatDisplayDate(checkin.date)} · ${n} move${n === 1 ? '' : 's'} planned`;
}

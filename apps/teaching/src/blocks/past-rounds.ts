import { apiPost } from '@/api/client';
import { button, el, errorText } from '@/blocks/peer-feedback-ui';

/**
 * Past rounds of a live class activity (brainstorm, continuum line, hinge
 * question, peer feedback). A round goes idle twelve hours after it starts,
 * but its work stays saved: this lists the block's earlier rounds and brings
 * one back as the live round. See netlify/functions/_shared/activity-rounds.mjs.
 */

type Round = { session: string; started_at: string | null; students: number; live: boolean; round?: 'backup' };

const WHEN = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function pastRounds(
  endpoint: string,
  bringBack: (session: string, pressed: HTMLButtonElement) => Promise<unknown> | void,
  count: (n: number) => string = (n) => `${n} ${n === 1 ? 'student' : 'students'}`
): HTMLDetailsElement {
  const box = el('details', 'pf-rounds');
  const list = el('div', 'pf-rounds__list');
  box.append(el('summary', 'pf-rounds__toggle', 'Past rounds'), list);
  box.addEventListener('toggle', () => {
    if (box.open) void load();
  });

  async function load(): Promise<void> {
    list.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
    try {
      const { rounds } = await apiPost<{ rounds: Round[] }>(endpoint, { action: 'rounds' });
      const past = rounds.filter((r) => !r.live);
      list.replaceChildren(
        ...(past.length
          ? [el('p', 'pf-note block-secondary', 'Bring a round back to see its answers or carry on with it. Students who joined it rejoin with the same code.'), ...past.map(row)]
          : [el('p', 'pf-note block-secondary', 'No past rounds yet.')])
      );
    } catch (error) {
      list.replaceChildren(el('p', 'pf-alert', errorText(error)));
    }
  }

  function row(r: Round): HTMLElement {
    const item = el('div', 'pf-rounds__row');
    const info = el('div', 'pf-rounds__info');
    info.append(
      el('span', 'pf-rounds__when', r.started_at ? WHEN.format(new Date(r.started_at)) : 'Earlier round'),
      el('span', 'pf-rounds__who block-secondary', r.round === 'backup' ? `${count(r.students)} · back-up question` : count(r.students))
    );
    item.append(
      info,
      button('Bring back', 'secondary', function () {
        const done = bringBack(r.session, this);
        if (done) void done.then(() => (box.open = false));
      })
    );
    return item;
  }

  return box;
}

/** Asked before a past round replaces the one running now. */
export const confirmBringBack = (live: boolean): boolean =>
  !live || confirm('Bring back this round? The round running now is kept in Past rounds.');

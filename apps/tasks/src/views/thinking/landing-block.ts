// apps/tasks/src/views/thinking/landing-block.ts
// In the home step: a line for each detour still out ("waiting on…"), and a "Came back from…"
// block for each that returned, with three choices. Use as this step's answer sends the answer
// to the coach with the engine's own `say` (there is no node-edit action), so the coach places
// it. Add to notes only records the landing; Not useful dismisses it.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { threadsApi } from './api';
import { THREAD_CHANGED_EVENT } from './checkin-card';
import { toolName, toolRoute, PROTOCOL_TOOL } from './map';
import { answerLine, awaitingLanding, detoursFrom, waitingOn } from './thread-logic';
import type { Landing, Thread, ThreadSession } from './types';

type LandingOptions = {
  sessionId: string;
  /** Sends text to the coach as the person's reply. */
  say: (text: string) => Promise<void>;
};

export type LandingBlock = { update(thread: Thread): void };

/** Where a detour opens: its tool's page, or the thread view for Thought Starter and protocols. */
export function detourHref(thread: Pick<Thread, 'id'>, s: ThreadSession): string {
  const base = toolRoute(s.tool);
  if (s.tool === 'question-book' || s.tool === PROTOCOL_TOOL || !base) return `#/think/${encodeURIComponent(thread.id)}?detour=${encodeURIComponent(s.sessionId)}`;
  return `${base}?id=${encodeURIComponent(s.sessionId)}`;
}

function list(label: string, items: string[]): HTMLElement | null {
  if (!items.length) return null;
  const box = el('div', 'tt-land__group');
  const ul = el('ul', 'tt-land__list');
  for (const item of items) ul.append(el('li', '', item));
  box.append(el('h4', 'tt-land__label', label), ul);
  return box;
}

function waitingLine(thread: Thread, s: ThreadSession): HTMLElement {
  const row = el('p', 'tt-wait');
  const link = el('a', 'tt-wait__link', 'Open') as HTMLAnchorElement;
  link.href = detourHref(thread, s);
  const what = s.state === 'running' ? 'running' : 'waiting';
  row.append(document.createTextNode(`Waiting on a ${toolName(s.tool)} detour${s.question ? `: ${s.question}` : ''} (${what}). `), link);
  return row;
}

export function mountLandingBlock(host: HTMLElement, { sessionId, say }: LandingOptions): LandingBlock {
  host.classList.add('tt-landing');

  function landingCard(thread: Thread, s: ThreadSession): HTMLElement {
    const packet = s.packet!;
    const tool = toolName(s.tool);
    const card = el('section', 'tt-card tt-land');
    card.setAttribute('aria-label', `Came back from ${tool}`);
    card.append(el('p', 'tt-card__eyebrow', `Came back from ${tool}`));
    if (s.question) card.append(el('p', 'tt-land__question', s.question));
    card.append(el('p', 'tt-land__answer', packet.answer));
    if (packet.detail) card.append(el('p', 'tt-land__detail', packet.detail));
    for (const group of [list('Rests on', packet.restsOn), list('Still open', packet.openQuestions), list('Suggested next actions', packet.actions)]) if (group) card.append(group);
    const status = el('p', 'tt-card__status');
    status.setAttribute('role', 'status');
    const actions = el('div', 'tt-card__actions');
    const lock = (on: boolean) => actions.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = on));
    const choose = async (landing: Landing, extra?: () => Promise<void>) => {
      lock(true);
      status.textContent = '';
      try {
        const fresh = await threadsApi.get(thread.id);
        if (extra) await extra();
        const next = await threadsApi.setLanding(fresh, s.sessionId, landing);
        window.dispatchEvent(new CustomEvent(THREAD_CHANGED_EVENT, { detail: { thread: next } }));
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not save that.');
        lock(false);
      }
    };
    const use = el('button', 'btn btn--primary tt-btn', 'Use as this step’s answer') as HTMLButtonElement;
    use.type = 'button';
    use.addEventListener('click', () => void choose('answer', () => say(answerLine(tool, packet.answer))));
    const note = el('button', 'btn btn--ghost tt-btn', 'Add to notes') as HTMLButtonElement;
    note.type = 'button';
    note.addEventListener('click', () => void choose('note'));
    const no = el('button', 'btn btn--ghost tt-btn', 'Not useful') as HTMLButtonElement;
    no.type = 'button';
    no.addEventListener('click', () => void choose('dismissed'));
    actions.append(use, note, no);
    card.append(status, actions);
    return card;
  }

  let sig = '';
  return {
    update(thread) {
      const mine = detoursFrom(thread, sessionId);
      // Redraw only when something a card shows has changed, so a poll never wipes a click in flight.
      const next_sig = mine.map((s) => `${s.sessionId}:${s.state}:${s.landing ?? ''}:${s.packet?.answer ?? ''}`).join('|');
      if (next_sig === sig) return;
      sig = next_sig;
      const failed = mine.filter((s) => s.state === 'failed').map((s) => {
        const row = el('p', 'tt-wait tt-wait--failed', `A ${toolName(s.tool)} detour did not finish. `);
        const link = el('a', 'tt-wait__link', 'Open') as HTMLAnchorElement;
        link.href = detourHref(thread, s);
        row.append(link);
        return row;
      });
      const next = [...mine.filter(waitingOn).map((s) => waitingLine(thread, s)), ...failed, ...mine.filter(awaitingLanding).filter((s) => s.packet).map((s) => landingCard(thread, s))];
      host.replaceChildren(...next);
      host.hidden = next.length === 0;
    }
  };
}

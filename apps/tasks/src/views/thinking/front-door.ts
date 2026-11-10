// apps/tasks/src/views/thinking/front-door.ts
// #/think: "Think it through". The listed threads (open first, then resting with their date), a
// box for the situation, and the guide's triage: at most one question, then a start, a "likely"
// and an "or instead", each with its reason. The guide only suggests; a tap starts anything.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { guideApi, threadsApi } from './api';
import { isProtocolOption, option, optionLabel } from './map';
import { canStartHere, startFromFrontDoor } from './start';
import type { ThreadRow, Triage } from './types';

type Suggestion = Exclude<Triage, { question: string }>;

/** Open threads first (newest first), then resting ones by the day they come back. */
export function sortRows(rows: readonly ThreadRow[]): ThreadRow[] {
  const open = rows.filter((r) => r.status === 'open').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const resting = rows.filter((r) => r.status === 'resting').sort((a, b) => String(a.restUntil ?? '').localeCompare(String(b.restUntil ?? '')));
  return [...open, ...resting];
}

/** "A$0.12 this month over 14 checks"; an empty month says so. */
export function spendLine(spend: { aud: number; calls: number }): string {
  if (!spend.calls) return 'Guide spend this month: nothing yet.';
  const amount = spend.aud < 0.01 ? 'under A$0.01' : `A$${spend.aud.toFixed(2)}`;
  return `Guide spend this month: ${amount} over ${spend.calls} ${spend.calls === 1 ? 'check' : 'checks'}.`;
}

function threadRow(row: ThreadRow): HTMLLIElement {
  const item = el('li', 'tt-thread');
  const link = el('a', 'tt-thread__link') as HTMLAnchorElement;
  link.href = `#/think/${encodeURIComponent(row.id)}`;
  const meta = row.status === 'resting' && row.restUntil ? `Resting until ${formatDisplayDate(row.restUntil)}` : `Updated ${formatDisplayDate(row.updatedAt.slice(0, 10))}`;
  link.append(el('span', 'tt-thread__title', row.title), el('span', 'tt-thread__meta', `${row.sessionCount} ${row.sessionCount === 1 ? 'session' : 'sessions'} · ${meta}`));
  item.append(link);
  return item;
}

export async function renderFrontDoor(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'tt-page tt-door');
  page.append(el('p', 'tt-lede', 'Say what is going on. The guide suggests where to start and checks in as you go. You choose.'));

  const threadsHost = el('section', 'tt-section');
  const form = el('form', 'tt-door__form') as HTMLFormElement;
  const box = el('textarea', 'tt-input tt-door__situation') as HTMLTextAreaElement;
  box.rows = 4;
  box.maxLength = 12000;
  box.placeholder = 'What is going on? For example: choosing between two community garden plots, or a flatmate who never does the dishes.';
  box.setAttribute('aria-label', 'Describe the situation');
  const go = el('button', 'btn btn--primary tt-btn', 'Think it through') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'tt-card__status');
  status.setAttribute('role', 'status');
  const row = el('div', 'tt-card__actions');
  row.append(go);
  const result = el('div', 'tt-door__result');
  result.setAttribute('aria-live', 'polite');
  form.append(box, status, row);

  const spend = el('p', 'tt-door__spend');
  page.append(form, result, threadsHost, spend);
  canvas.replaceChildren(page);

  void (async () => {
    try {
      const rows = sortRows(await threadsApi.list());
      threadsHost.append(el('h2', 'tt-section__title', 'Your threads'));
      if (!rows.length) {
        threadsHost.append(el('p', 'tt-muted', 'No threads yet. A thread appears here once it has a detour.'));
        return;
      }
      const list = el('ul', 'tt-threads');
      list.append(...rows.map(threadRow));
      threadsHost.append(list);
    } catch (err) {
      threadsHost.append(el('p', 'tt-muted', errorMessage(err, 'Could not load your threads.')));
    }
  })();
  void guideApi.spend().then((s) => { spend.textContent = spendLine(s); }, () => undefined);

  let asked = false;

  function optionCard(label: string, optionId: string, reason: string, primary: boolean, situation: string): HTMLElement {
    const card = el('section', `tt-card${primary ? ' tt-card--suggest' : ''}`);
    card.append(el('p', 'tt-card__eyebrow', label), el('h3', 'tt-card__title', optionLabel(optionId)));
    if (reason) card.append(el('p', 'tt-card__reason', reason));
    const when = option(optionId)?.when;
    if (when) card.append(el('p', 'tt-card__when', when));
    const note = el('p', 'tt-card__status');
    note.setAttribute('role', 'status');
    if (isProtocolOption(optionId) || !canStartHere(optionId)) {
      const link = el('a', 'btn btn--ghost tt-btn', 'Open in Knowledge') as HTMLAnchorElement;
      link.href = '/knowledge/#protocols';
      card.append(note, link);
      return card;
    }
    const start = el('button', `btn ${primary ? 'btn--primary' : 'btn--ghost'} tt-btn`, primary ? 'Start here' : 'Start here instead') as HTMLButtonElement;
    start.type = 'button';
    start.addEventListener('click', async () => {
      start.disabled = true;
      note.textContent = '';
      try {
        location.hash = await startFromFrontDoor(situation, optionId);
      } catch (err) {
        note.textContent = errorMessage(err, 'Could not start.');
        start.disabled = false;
      }
    });
    card.append(note, start);
    return card;
  }

  function showSuggestion(s: Suggestion, situation: string): void {
    const pieces: HTMLElement[] = [optionCard('Start with', s.start.optionId, s.start.reason, true, situation)];
    if (s.likely.length) {
      const likely = el('section', 'tt-card tt-card--quiet');
      likely.append(el('p', 'tt-card__eyebrow', 'Likely, will check as we go'));
      const ul = el('ul', 'tt-land__list');
      for (const id of s.likely) ul.append(el('li', '', optionLabel(id)));
      likely.append(ul);
      pieces.push(likely);
    }
    pieces.push(optionCard('Or instead', s.alternative.optionId, s.alternative.reason, false, situation));
    if (s.fallback) pieces.unshift(el('p', 'tt-muted', 'The guide could not be reached, so these come from the map alone.'));
    result.replaceChildren(...pieces);
  }

  function showQuestion(question: string, situation: string): void {
    const ask = el('form', 'tt-card tt-card--suggest') as HTMLFormElement;
    const input = el('textarea', 'tt-input') as HTMLTextAreaElement;
    input.rows = 2;
    input.setAttribute('aria-label', 'Your answer');
    const send = el('button', 'btn btn--primary tt-btn', 'Answer') as HTMLButtonElement;
    send.type = 'submit';
    const skip = el('button', 'btn btn--ghost tt-btn', 'Skip') as HTMLButtonElement;
    skip.type = 'button';
    const note = el('p', 'tt-card__status');
    note.setAttribute('role', 'status');
    const actions = el('div', 'tt-card__actions');
    actions.append(send, skip);
    ask.append(el('p', 'tt-card__eyebrow', 'One question'), el('h3', 'tt-card__title', question), input, note, actions);
    result.replaceChildren(ask);
    input.focus();
    const resolve = async (text: string | undefined) => {
      send.disabled = true;
      skip.disabled = true;
      await run(situation, text || 'No answer.', note);
      send.disabled = false;
      skip.disabled = false;
    };
    ask.addEventListener('submit', (event) => {
      event.preventDefault();
      void resolve(input.value.trim());
    });
    skip.addEventListener('click', () => void resolve(undefined));
  }

  async function run(situation: string, withAnswer: string | undefined, into: HTMLElement): Promise<void> {
    into.textContent = 'Thinking…';
    try {
      const out = await guideApi.triage(situation, withAnswer);
      into.textContent = '';
      if ('question' in out && !withAnswer && !asked) {
        asked = true;
        showQuestion(out.question, situation);
      } else if ('start' in out) {
        showSuggestion(out, situation);
      } else {
        into.textContent = 'The guide had nothing to add. Try saying a little more.';
      }
    } catch (err) {
      into.textContent = errorMessage(err, 'The guide could not answer. Pick a tool from the list on the left.');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const situation = box.value.trim();
    if (!situation) {
      box.focus();
      return;
    }
    asked = false;
    go.disabled = true;
    result.replaceChildren();
    await run(situation, undefined, status);
    go.disabled = false;
  });
}

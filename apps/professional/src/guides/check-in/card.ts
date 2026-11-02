// The saved Check-in on the meeting page: closed, with who and when only. Open fetches and unseals it.
import { emblemEl, iconEl } from './icons';
import { shortTime } from './model';
import type { CheckInSummary } from './types';

export function renderCheckInCard(doc: Document, summary: CheckInSummary, onOpen: () => Promise<void>): HTMLElement {
  const card = doc.createElement('div');
  card.className = 'ci-locked guide';
  card.dataset.checkIn = summary.id;
  const words = doc.createElement('div');
  const title = doc.createElement('b');
  title.textContent = `Check-in · ${summary.person_name}`;
  const when = doc.createElement('span');
  when.className = 'ci-locked__when';
  when.append(iconEl(doc, 'lock', 'ci-ico ci-ico--sm'), doc.createTextNode(` ${shortTime(summary.created_at)} · locked`));
  words.append(title, when);
  const open = doc.createElement('button');
  open.type = 'button';
  open.className = 'btn btn--secondary ci-locked__open';
  open.dataset.part = 'check-in-open';
  open.textContent = 'Open';
  open.addEventListener('click', async () => {
    open.disabled = true;
    card.classList.add('is-opening');
    try {
      await onOpen();
    } finally {
      open.disabled = false;
      card.classList.remove('is-opening');
    }
  });
  card.append(emblemEl(doc, 'guide-emblem ci-emblem ci-emblem--sm'), words, open);
  return card;
}

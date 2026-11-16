/**
 * A pop-up card for adding someone to People without leaving the page you
 * are on (e.g. the event form, when a presenter search finds nobody). It is
 * the same quick Add person form as the People page, with the typed name
 * filled in. The card sits on the body, outside any open form.
 */

import { mountAddPersonForm, type AddPersonResult } from '@/components/add-person-form';

export interface QuickPersonCardOptions {
  name: string;
  /** Says what the new person is for, e.g. "They'll be added as a presenter." */
  note?: string;
  onAdded: (result: AddPersonResult) => void;
}

export function openQuickPersonCard(options: QuickPersonCardOptions): { close: () => void } {
  const dialog = document.createElement('dialog');
  dialog.className = 'quick-person-card';
  dialog.setAttribute('aria-label', 'Add person');

  const head = document.createElement('div');
  head.className = 'quick-person-card__head';
  const title = document.createElement('h2');
  title.className = 'quick-person-card__title';
  title.textContent = 'Add to People';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'person-icon-btn quick-person-card__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close');
  head.append(title, closeBtn);
  dialog.append(head);

  if (options.note) {
    const note = document.createElement('p');
    note.className = 'quick-person-card__note';
    note.textContent = options.note;
    dialog.append(note);
  }

  const body = document.createElement('div');
  body.className = 'quick-person-card__body';
  dialog.append(body);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    dialog.remove();
  }

  const form = mountAddPersonForm(body, {
    initialName: options.name,
    onCreated: (result) => {
      options.onAdded(result);
      close();
    },
    onCancel: close
  });

  closeBtn.addEventListener('click', close);
  // Esc closes the card (native dialog cancel).
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  form.focusName();
  return { close };
}

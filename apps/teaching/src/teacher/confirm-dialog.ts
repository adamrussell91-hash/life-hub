/** Kit confirm-card modal — replaces window.confirm for destructive / agent writes. */

export type ConfirmDialogOptions = {
  eyebrow?: string;
  title: string;
  supporting?: string;
  confirmLabel?: string;
  discardLabel?: string;
};

export function askConfirmCard(options: ConfirmDialogOptions): Promise<boolean> {
  const {
    eyebrow = 'Please confirm',
    title,
    supporting = 'This cannot be undone from here.',
    confirmLabel = 'Confirm',
    discardLabel = 'Cancel'
  } = options;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-card-overlay';
    overlay.setAttribute('role', 'presentation');

    const card = document.createElement('section');
    card.className = 'confirm-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);

    const eye = document.createElement('p');
    eye.className = 'page-header__eyebrow';
    eye.textContent = eyebrow;

    const heading = document.createElement('h2');
    heading.className = 'page-header__title';
    heading.style.fontSize = 'var(--text-lg)';
    heading.textContent = title;

    const body = document.createElement('p');
    body.className = 'page-header__supporting';
    body.textContent = supporting;

    const actions = document.createElement('div');
    actions.className = 'confirm-card__actions';

    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'btn btn--ghost';
    discard.textContent = discardLabel;

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--primary';
    confirm.textContent = confirmLabel;

    const finish = (value: boolean) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };

    discard.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
    window.addEventListener('keydown', onKey);

    actions.append(discard, confirm);
    card.append(eye, heading, body, actions);
    overlay.append(card);
    document.body.append(overlay);
    confirm.focus();
  });
}

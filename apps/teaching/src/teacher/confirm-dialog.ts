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

type FieldCardOptions = {
  eyebrow?: string;
  title: string;
  supporting?: string;
  confirmLabel?: string;
  discardLabel?: string;
};

/**
 * Shared shell for the text and select cards. Resolves the field's value on
 * confirm (Enter or the button) and null on Cancel / Escape / backdrop.
 */
function askFieldCard(
  options: FieldCardOptions,
  field: HTMLInputElement | HTMLSelectElement,
  validate: (value: string) => boolean
): Promise<string | null> {
  const { eyebrow, title, supporting, confirmLabel = 'Save', discardLabel = 'Cancel' } = options;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-card-overlay';
    overlay.setAttribute('role', 'presentation');

    const card = document.createElement('form');
    card.className = 'confirm-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);
    card.noValidate = true;

    if (eyebrow) {
      const eye = document.createElement('p');
      eye.className = 'page-header__eyebrow';
      eye.textContent = eyebrow;
      card.append(eye);
    }

    const heading = document.createElement('h2');
    heading.className = 'page-header__title';
    heading.style.fontSize = 'var(--text-lg)';
    heading.textContent = title;
    card.append(heading);

    if (supporting) {
      const body = document.createElement('p');
      body.className = 'page-header__supporting';
      body.textContent = supporting;
      card.append(body);
    }

    field.classList.add(field instanceof HTMLSelectElement ? 'create-modal__select' : 'create-modal__input');
    field.setAttribute('aria-label', title);

    const actions = document.createElement('div');
    actions.className = 'confirm-card__actions';

    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'btn btn--ghost';
    discard.textContent = discardLabel;

    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'btn btn--primary';
    confirm.textContent = confirmLabel;

    const sync = () => {
      confirm.disabled = !validate(field.value);
    };

    const finish = (value: string | null) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };

    field.addEventListener('input', sync);
    field.addEventListener('change', sync);
    card.addEventListener('submit', (event) => {
      event.preventDefault();
      if (validate(field.value)) finish(field.value);
    });
    discard.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(null);
    });
    window.addEventListener('keydown', onKey);

    actions.append(discard, confirm);
    card.append(field, actions);
    overlay.append(card);
    document.body.append(overlay);
    sync();
    field.focus();
    if (field instanceof HTMLInputElement) field.select();
  });
}

/** Kit replacement for window.prompt — some browsers block prompt() outright. */
export function askTextCard(
  options: FieldCardOptions & { value?: string; placeholder?: string; optional?: boolean }
): Promise<string | null> {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = options.value ?? '';
  if (options.placeholder) input.placeholder = options.placeholder;
  return askFieldCard(options, input, (value) => options.optional || value.trim().length > 0).then(
    (value) => (value === null ? null : value.trim())
  );
}

/** Pick one option from a list in a kit card. Resolves the chosen value, or null. */
export function askSelectCard(
  options: FieldCardOptions & {
    choices: ReadonlyArray<{ value: string; label: string }>;
    value?: string;
  }
): Promise<string | null> {
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select…';
  select.append(placeholder);
  for (const choice of options.choices) {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  const initial = options.value ?? (options.choices.length === 1 ? options.choices[0]!.value : '');
  select.value = options.choices.some((choice) => choice.value === initial) ? initial : '';
  return askFieldCard({ confirmLabel: 'Continue', ...options }, select, (value) => value !== '');
}

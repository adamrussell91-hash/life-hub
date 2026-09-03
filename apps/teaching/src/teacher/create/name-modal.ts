export function openNameModal(options: {
  title: string;
  label: string;
  defaultValue: string;
  confirmLabel: string;
  onConfirm: (title: string) => void | Promise<void>;
}): void {
  let submitting = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'create-modal-backdrop';
  backdrop.dataset.nameModal = 'backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'create-modal glass-panel glass-tile';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'name-modal-title');

  const heading = document.createElement('h2');
  heading.id = 'name-modal-title';
  heading.className = 'create-modal__title';
  heading.textContent = options.title;

  const errorBanner = document.createElement('p');
  errorBanner.className = 'create-modal__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const fields = document.createElement('div');
  fields.className = 'create-modal__fields';

  const field = document.createElement('label');
  field.className = 'create-modal__field';
  const span = document.createElement('span');
  span.className = 'create-modal__label';
  span.textContent = options.label;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'create-modal__input';
  input.dataset.nameModalField = 'title';
  input.required = true;
  input.value = options.defaultValue;
  field.append(span, input);
  fields.append(field);

  const footer = document.createElement('div');
  footer.className = 'create-modal__footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.dataset.nameModalAction = 'cancel';
  cancelBtn.textContent = 'Cancel';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--decisive';
  saveBtn.dataset.nameModalAction = 'save';
  saveBtn.textContent = options.confirmLabel;

  footer.append(cancelBtn, saveBtn);
  dialog.append(heading, errorBanner, fields, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);
  input.focus();
  input.select();

  const close = (): void => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      void submit();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  cancelBtn.addEventListener('click', () => close());

  const submit = async (): Promise<void> => {
    if (submitting) return;
    const trimmed = input.value.trim();
    if (!trimmed) {
      errorBanner.hidden = false;
      errorBanner.textContent = 'Please enter a title.';
      input.focus();
      return;
    }
    submitting = true;
    saveBtn.disabled = true;
    try {
      await options.onConfirm(trimmed);
      close();
    } catch (error) {
      errorBanner.hidden = false;
      errorBanner.textContent = error instanceof Error ? error.message : 'Save failed';
      submitting = false;
      saveBtn.disabled = false;
    }
  };

  saveBtn.addEventListener('click', () => {
    void submit();
  });
}

/**
 * "Delete permanently": Adam types the person's name to confirm. It runs
 * deidentify then delete. A tombstone stays, so links to it stop resolving.
 */

export interface DeletePersonDialogOptions {
  name: string;
  /** Runs one lifecycle step; the dialog calls it with deidentify, then delete. */
  transition: (action: 'deidentify' | 'delete') => Promise<unknown>;
  /** True when the person is already deidentified (an earlier try stopped half way). */
  alreadyDeidentified?: boolean;
  onDeleted: () => void;
}

function sameName(typed: string, name: string): boolean {
  const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(typed) !== '' && norm(typed) === norm(name);
}

export function openDeletePersonDialog(host: HTMLElement, options: DeletePersonDialogOptions): { close: () => void } {
  const backdrop = document.createElement('div');
  backdrop.className = 'person-dialog';
  const box = document.createElement('div');
  box.className = 'person-dialog__box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `Delete ${options.name} permanently`);

  const title = document.createElement('h2');
  title.className = 'person-dialog__title';
  title.textContent = `Delete ${options.name} permanently?`;
  const body = document.createElement('p');
  body.className = 'person-dialog__body';
  body.textContent =
    'This can’t be undone. Their name and details are removed, and links to them stop working. Type their name to confirm.';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'person-dialog__input';
  input.setAttribute('aria-label', 'Type their name to confirm');
  input.autocomplete = 'off';
  const status = document.createElement('p');
  status.className = 'person-dialog__status';
  status.setAttribute('role', 'alert');
  status.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'person-dialog__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost';
  cancel.textContent = 'Cancel';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'btn btn--danger';
  confirm.textContent = 'Delete permanently';
  confirm.disabled = true;
  actions.append(cancel, confirm);

  box.append(title, body, input, status, actions);
  backdrop.append(box);
  host.append(backdrop);
  input.focus();

  let deidentified = Boolean(options.alreadyDeidentified);
  function close(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !confirm.dataset.busy) close();
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop && !confirm.dataset.busy) close();
  });
  cancel.addEventListener('click', close);
  input.addEventListener('input', () => {
    confirm.disabled = !sameName(input.value, options.name);
  });
  confirm.addEventListener('click', () => {
    if (!sameName(input.value, options.name)) return;
    confirm.disabled = true;
    cancel.disabled = true;
    confirm.dataset.busy = '1';
    confirm.textContent = 'Deleting…';
    status.hidden = true;
    void (async () => {
      try {
        if (!deidentified) {
          await options.transition('deidentify');
          deidentified = true;
        }
        await options.transition('delete');
        close();
        options.onDeleted();
      } catch (err) {
        delete confirm.dataset.busy;
        confirm.disabled = false;
        cancel.disabled = false;
        confirm.textContent = 'Delete permanently';
        status.hidden = false;
        status.textContent = `${err instanceof Error ? err.message : 'Delete failed.'} Try again.`;
      }
    })();
  });
  return { close };
}

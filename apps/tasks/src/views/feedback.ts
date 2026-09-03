/** Shared loading / error / busy helpers so views never stick on a spinner. */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function errorMessage(err: unknown, fallback = 'Request failed'): string {
  return err instanceof Error && err.message.trim() ? err.message : fallback;
}

/** Keep the current view on screen instead of flashing “Loading…” on a remount. */
export function showViewLoading(canvas: HTMLElement, message: string, readySelector: string): void {
  if (canvas.matches(readySelector) || canvas.querySelector(readySelector)) return;
  canvas.replaceChildren(el('p', 'canvas-status', message));
}

export function renderLoadError(
  host: HTMLElement,
  err: unknown,
  onRetry: () => void,
  context: string
): void {
  host.replaceChildren();
  host.append(el('p', 'empty-state', `${context}: ${errorMessage(err)}`));
  const retry = el('button', 'btn btn--secondary', 'Retry');
  retry.type = 'button';
  retry.addEventListener('click', onRetry);
  host.append(retry);
}

export function renderInlineError(host: HTMLElement, err: unknown): void {
  host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
}

export function showConfirmWrite(
  host: HTMLElement,
  title: string,
  summary: string,
  onConfirm: () => Promise<void>,
  confirmLabel = 'Confirm'
): void {
  host.replaceChildren();
  const overlay = el('div', 'confirm-overlay');
  overlay.setAttribute('role', 'presentation');
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Confirm change');
  const destructive = confirmLabel.toLowerCase() === 'delete';
  card.append(el('p', 'page-header__eyebrow', destructive ? 'Delete' : 'Proposed write'));
  const heading = el('h2', 'page-header__title', title);
  heading.style.fontSize = 'var(--text-lg)';
  card.append(heading);
  card.append(
    el(
      'p',
      'page-header__supporting',
      destructive ? summary : `${summary} Do not apply until Confirm.`
    )
  );
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', destructive ? 'btn btn--decisive' : 'btn btn--primary', confirmLabel);
  confirm.type = 'button';
  const close = (): void => host.replaceChildren();
  discard.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await onConfirm();
      close();
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  overlay.append(card);
  host.append(overlay);
  confirm.focus();
}

export async function withBusy<T>(
  buttons: HTMLButtonElement[],
  work: () => Promise<T>,
  pendingLabel?: string
): Promise<T> {
  const previous = buttons.map((btn) => ({ btn, text: btn.textContent, disabled: btn.disabled }));
  for (const btn of buttons) {
    btn.disabled = true;
    if (pendingLabel) btn.textContent = pendingLabel;
  }
  try {
    return await work();
  } finally {
    for (const row of previous) {
      row.btn.disabled = row.disabled;
      if (pendingLabel) row.btn.textContent = row.text;
    }
  }
}

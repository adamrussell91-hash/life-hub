import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { createHubField } from '@/views/hub-kit';

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

/** One-click card delete — no proposed-write banner. */
export function deleteTaskNow(
  task: Task,
  reload: () => void | Promise<void>,
  errorHost: HTMLElement
): void {
  void tasksApi
    .deleteTask(task.id, { agent: 'Tasks Hub', reason: 'Card delete' })
    .then(() => reload())
    .catch((err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    });
}

/** One-click card delete — no proposed-write banner. */
export function deleteProjectNow(
  project: Project,
  reload: () => void | Promise<void>,
  errorHost: HTMLElement
): void {
  void tasksApi
    .deleteProject(project.id, { agent: 'Tasks Hub', reason: 'Card delete' })
    .then(() => reload())
    .catch((err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    });
}

/**
 * Shared by Projects and Excursions boards — a short retrospective is
 * required, then the project moves to the Archive (status "completed").
 */
export function showCompleteConfirm(
  host: HTMLElement,
  project: Project,
  slipDays: number | null,
  onDone: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm completion');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'closure-confirm__title', `Mark ${project.title} complete`));
  const reason = createHubField({
    ariaLabel: 'Retrospective',
    placeholder: 'Short retrospective (required)'
  });
  const slipText =
    slipDays === null
      ? 'No baseline comparison.'
      : slipDays === 0
        ? 'Landed on baseline.'
        : slipDays > 0
          ? `${slipDays} days past baseline.`
          : `${Math.abs(slipDays)} days ahead of baseline.`;
  card.append(el('p', 'page-header__supporting', `${slipText} Do not apply until Confirm.`), reason.el);
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    const text = reason.input.value.trim();
    if (!text) {
      host.append(el('p', 'empty-state', 'Add a retrospective first.'));
      return;
    }
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await tasksApi.closeProject(project.id, text);
      host.replaceChildren(el('p', 'canvas-status', 'Moved to the Archive.'));
      onDone();
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

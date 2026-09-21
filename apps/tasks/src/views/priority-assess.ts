import { tasksApi } from '@/services/client-api';
import type { PriorityAssessResult, PriorityAssessment } from '@/domain/priority-assess';
import { errorMessage } from '@/views/feedback';
import { el } from '@/views/hub-kit';

let floorsAttempted = false;

export function resetPriorityAssessSession(): void {
  floorsAttempted = false;
}

export async function maybeApplyPriorityFloors(): Promise<PriorityAssessResult | null> {
  if (floorsAttempted) return null;
  floorsAttempted = true;
  if (typeof tasksApi.assessPriorities !== 'function') return null;
  try {
    return await tasksApi.assessPriorities({ mode: 'floor', apply: true });
  } catch {
    return null;
  }
}

function changeLine(change: PriorityAssessment): string {
  return `${change.title} — ${change.current} → ${change.suggested} (${change.reason})`;
}

export function createPriorityAssessControls(options: {
  onApplied?: () => void | Promise<void>;
} = {}): { el: HTMLElement } {
  const wrap = el('div', 'priority-assess');
  const button = el('button', 'btn btn--secondary', 'Assess priorities');
  button.type = 'button';
  const status = el('p', 'priority-assess__status');
  status.hidden = true;
  const confirmHost = el('div', 'priority-assess__confirm');

  const setStatus = (text: string): void => {
    status.textContent = text;
    status.hidden = !text;
  };

  const showConfirm = (preview: PriorityAssessResult): void => {
    confirmHost.replaceChildren();
    const card = el('section', 'confirm-card');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Confirm priority changes');
    card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
    card.append(el('h2', 'page-header__title', 'Update priority tags'));
    const count = preview.changes.length;
    card.append(
      el(
        'p',
        'page-header__supporting',
        `${count} tag${count === 1 ? '' : 's'} would change. Do not apply until Confirm.`
      )
    );
    const list = el('ul', 'priority-assess__list');
    for (const change of preview.changes) {
      list.append(el('li', '', changeLine(change)));
    }
    card.append(list);
    const actions = el('div', 'confirm-card__actions');
    const discard = el('button', 'btn btn--ghost', 'Discard');
    discard.type = 'button';
    const confirm = el('button', 'btn btn--primary', 'Confirm');
    confirm.type = 'button';
    discard.addEventListener('click', () => confirmHost.replaceChildren());
    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      discard.disabled = true;
      try {
        await tasksApi.assessPriorities({ mode: 'full', apply: true });
        confirmHost.replaceChildren();
        setStatus(`Updated ${count} priorit${count === 1 ? 'y' : 'ies'}.`);
        await options.onApplied?.();
      } catch (err) {
        confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not apply priorities')));
      }
    });
    actions.append(discard, confirm);
    card.append(actions);
    confirmHost.append(card);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    setStatus('Assessing priorities…');
    confirmHost.replaceChildren();
    try {
      const preview = await tasksApi.assessPriorities({ mode: 'full', apply: false });
      if (!preview.changes.length) {
        setStatus('Priorities already match due dates.');
        return;
      }
      setStatus('');
      showConfirm(preview);
    } catch (err) {
      setStatus(errorMessage(err, 'Could not assess priorities'));
    } finally {
      button.disabled = false;
    }
  });

  wrap.append(button, status, confirmHost);
  return { el: wrap };
}

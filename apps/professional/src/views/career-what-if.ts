import { listCareerMoves } from '@/api/career';
import type { CareerModel } from '@/domain/career-model';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function surface(node: HTMLElement): void {
  node.style.background = 'var(--glass)';
  node.style.border = '1px solid var(--line)';
  node.style.borderRadius = 'var(--radius-md)';
  node.style.boxShadow = 'var(--elev-1)';
}

/**
 * What if… panel — try a move and watch futures react (deltas from model).
 */
export function renderWhatIfPanel(host: HTMLElement, model: CareerModel): void {
  const section = el('section', 'career-page__whatif');
  surface(section);
  section.append(el('h2', 'career-page__heading', 'What if…'));
  section.append(
    el(
      'p',
      'career-page__meta',
      'Describe a move you’re weighing. Ann drafts coverage against your futures — nothing saves until you keep it.'
    )
  );

  const input = el('textarea', 'career-mirror__ad-text') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'e.g. Lead the gifted policy rewrite this term';
  section.append(input);

  const status = el('p', 'career-page__meta');
  const deltas = el('ul', 'career-page__future-list');

  if (model.what_if_deltas?.length) {
    for (const delta of model.what_if_deltas) {
      const li = document.createElement('li');
      const sign = delta.readiness_delta > 0 ? '+' : '';
      li.append(
        el(
          'p',
          'career-page__meta',
          `${delta.title}: ${sign}${delta.readiness_delta}% ready${
            delta.arrival_after ? ` · arrival ${delta.arrival_after}` : ''
          }`
        )
      );
      deltas.append(li);
    }
  } else {
    deltas.append(el('li', 'empty-state', 'No active What if move yet.'));
  }

  const tryBtn = el('button', 'btn btn--secondary', 'Try this move') as HTMLButtonElement;
  tryBtn.type = 'button';
  tryBtn.addEventListener('click', () => {
    void (async () => {
      tryBtn.disabled = true;
      status.textContent = 'Loading moves…';
      try {
        await listCareerMoves();
        status.textContent =
          input.value.trim()
            ? 'What-if drafting against futures lands with career-moves keep — describe the move and keep it from the scan when ready.'
            : 'Add a move description first.';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not load moves.';
      } finally {
        tryBtn.disabled = false;
      }
    })();
  });

  section.append(tryBtn, status, deltas);
  host.append(section);
}

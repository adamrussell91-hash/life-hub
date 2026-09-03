import type { PublicOutcome } from '@/curriculum/outcome-catalog';

export function renderOutcomeList(
  outcomes: readonly PublicOutcome[],
  emptyMessage: string
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'outcome-list';

  if (outcomes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'outcome-list__empty';
    empty.textContent = emptyMessage;
    root.append(empty);
    return root;
  }

  for (const outcome of outcomes) {
    const article = document.createElement('article');
    article.className = 'outcome-list__item';
    article.dataset.outcomeId = outcome.id;

    const code = document.createElement('span');
    code.className = 'outcome-list__code';
    code.textContent = outcome.code;

    const title = document.createElement('h3');
    title.className = 'outcome-list__title';
    title.textContent = outcome.title;

    const body = document.createElement('p');
    body.className = 'outcome-list__description';
    body.textContent = outcome.description;

    article.append(code, title, body);
    root.append(article);
  }

  return root;
}

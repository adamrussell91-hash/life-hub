/**
 * Lock a confirm-card into a past-tense receipt after a successful apply.
 * Tool UI receipt pattern — Cotton Glass chrome, no React.
 */

/**
 * @param {HTMLElement} card
 * @param {{
 *   createElement: typeof document.createElement,
 *   summary: string,
 *   label?: string
 * }} options
 */
export function lockConfirmCardReceipt(card, { createElement, summary, label = 'Confirmed' } = {}) {
  if (!card || typeof createElement !== 'function') return card;

  card.classList.add('confirm-card--receipt', 'is-receipt');
  card.setAttribute('aria-label', label);

  for (const control of card.querySelectorAll?.('button, input, textarea, select') ?? []) {
    control.disabled = true;
  }

  const actions = card.querySelector?.('.confirm-card__actions');
  const receipt = createElement('p');
  receipt.className = 'confirm-card__receipt';
  receipt.textContent = summary || label;

  if (actions) {
    actions.replaceChildren(receipt);
  } else {
    card.append(receipt);
  }

  return card;
}

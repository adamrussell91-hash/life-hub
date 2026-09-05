/**
 * Structured agent choice surface (Tool UI option-list pattern, Cotton Glass chrome).
 * Decision UI only — durable writes still go through .confirm-card.
 */

/**
 * @typedef {{ id: string, label: string, detail?: string, disabled?: boolean }} AgentChoice
 */

/**
 * @param {ParentNode & { createElement: typeof document.createElement }} root
 * @param {{
 *   title?: string,
 *   hint?: string,
 *   choices: AgentChoice[],
 *   multi?: boolean,
 *   confirmLabel?: string,
 *   onConfirm?: (selected: AgentChoice[]) => void,
 *   onDismiss?: () => void
 * }} options
 */
export function createAgentChoiceCard(root, options) {
  const create = root.createElement?.bind(root) ?? globalThis.document.createElement.bind(globalThis.document);
  const card = create('section');
  card.className = 'agent-choice-card confirm-card';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', options.title || 'Choose an option');

  const eyebrow = create('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = 'Choose';
  card.append(eyebrow);

  if (options.title) {
    const title = create('h2');
    title.className = 'agent-choice-card__title';
    title.textContent = options.title;
    card.append(title);
  }
  if (options.hint) {
    const hint = create('p');
    hint.className = 'agent-choice-card__hint';
    hint.textContent = options.hint;
    card.append(hint);
  }

  const list = create('div');
  list.className = 'agent-choice-card__list';
  list.setAttribute('role', options.multi ? 'group' : 'radiogroup');
  card.append(list);

  /** @type {Set<string>} */
  const selected = new Set();
  const buttons = [];

  function paint() {
    for (const btn of buttons) {
      const on = selected.has(btn.dataset.choiceId);
      btn.classList.toggle('is-selected', on);
      btn.setAttribute(options.multi ? 'aria-pressed' : 'aria-checked', on ? 'true' : 'false');
    }
  }

  for (const choice of options.choices ?? []) {
    const btn = create('button');
    btn.type = 'button';
    btn.className = 'agent-choice-card__option';
    btn.dataset.choiceId = choice.id;
    btn.disabled = Boolean(choice.disabled);
    btn.setAttribute('role', options.multi ? 'button' : 'radio');
    const label = create('span');
    label.className = 'agent-choice-card__label';
    label.textContent = choice.label;
    btn.append(label);
    if (choice.detail) {
      const detail = create('span');
      detail.className = 'agent-choice-card__detail';
      detail.textContent = choice.detail;
      btn.append(detail);
    }
    btn.addEventListener('click', () => {
      if (options.multi) {
        if (selected.has(choice.id)) selected.delete(choice.id);
        else selected.add(choice.id);
      } else {
        selected.clear();
        selected.add(choice.id);
      }
      paint();
    });
    list.append(btn);
    buttons.push(btn);
  }
  paint();

  const actions = create('div');
  actions.className = 'confirm-card__actions';
  const dismiss = create('button');
  dismiss.type = 'button';
  dismiss.className = 'btn btn--ghost';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', () => options.onDismiss?.());
  const confirm = create('button');
  confirm.type = 'button';
  confirm.className = 'btn btn--primary';
  confirm.textContent = options.confirmLabel || (options.multi ? 'Apply selected' : 'Choose');
  confirm.addEventListener('click', () => {
    const picks = (options.choices ?? []).filter(choice => selected.has(choice.id));
    if (!picks.length) return;
    options.onConfirm?.(picks);
    card.classList.add('is-receipt');
    card.setAttribute('aria-label', 'Choice recorded');
    for (const btn of buttons) btn.disabled = true;
    dismiss.disabled = true;
    confirm.disabled = true;
    const receipt = create('p');
    receipt.className = 'agent-choice-card__receipt';
    receipt.textContent = `Chose: ${picks.map(p => p.label).join(', ')}`;
    actions.replaceChildren(receipt);
  });
  actions.append(dismiss, confirm);
  card.append(actions);

  return card;
}

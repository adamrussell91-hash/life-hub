function setText(node, text) {
  if (node) node.textContent = text ?? '';
}

function row(root, { title, detail, action }) {
  const item = root.createElement('li');
  item.className = 'shortcuts-item';
  const copy = root.createElement('div');
  const heading = root.createElement('p');
  heading.className = 'shortcuts-item__title';
  heading.textContent = title;
  const supporting = root.createElement('p');
  supporting.className = 'shortcuts-item__detail';
  supporting.textContent = detail;
  copy.append(heading, supporting);
  item.append(copy);
  if (action) item.append(action);
  return item;
}

export function renderShortcuts(root, {
  status = 'ready',
  catalog = [],
  promoted = [],
  proposal = null,
  error = '',
  notice = '',
  onRun,
  onConfirm,
  onDiscard
} = {}) {
  const dashboard = root.querySelector('#shortcuts-dashboard');
  if (dashboard) dashboard.hidden = false;

  const promotedHost = root.querySelector('[data-shortcuts="promoted"]');
  const catalogHost = root.querySelector('[data-shortcuts="catalog"]');
  const confirmHost = root.querySelector('[data-shortcuts="confirm"]');
  if (!promotedHost || !catalogHost) return;

  promotedHost.replaceChildren();
  catalogHost.replaceChildren();
  confirmHost?.replaceChildren();

  if (status === 'loading') {
    setText(promotedHost, 'Loading…');
    setText(catalogHost, 'Loading…');
    return;
  }
  if (status === 'error') {
    setText(promotedHost, error || 'Could not load shortcuts.');
    return;
  }

  if (!promoted.length) {
    setText(promotedHost, 'No promoted drafts yet. Ask an agent to promote a repeated action, then Confirm it.');
  } else {
    const list = root.createElement('ul');
    list.className = 'shortcuts-list';
    for (const draft of promoted) {
      const run = root.createElement('button');
      run.type = 'button';
      run.className = 'btn btn--primary';
      run.textContent = 'Run';
      run.addEventListener('click', () => onRun?.(draft));
      list.append(row(root, {
        title: draft.proposed_id || draft.tool_name || 'Promoted shortcut',
        detail: draft.summary || `${draft.write_count ?? 0} write${draft.write_count === 1 ? '' : 's'}`,
        action: run
      }));
    }
    promotedHost.append(list);
  }

  if (!catalog.length) {
    setText(catalogHost, 'Named shortcuts are not loaded.');
  } else {
    const list = root.createElement('ul');
    list.className = 'shortcuts-list';
    for (const item of catalog) {
      list.append(row(root, {
        title: item.id,
        detail: item.summary || item.tool_name || item.risk
      }));
    }
    catalogHost.append(list);
  }

  if (notice && confirmHost && !proposal) {
    setText(confirmHost, notice);
  }

  if (proposal && confirmHost) {
    const card = root.createElement('section');
    card.className = 'confirm-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Confirm change');

    const eyebrow = root.createElement('p');
    eyebrow.className = 'page-header__eyebrow';
    eyebrow.textContent = 'Proposed write';
    const heading = root.createElement('h2');
    heading.className = 'shortcuts-confirm-title';
    heading.textContent = typeof proposal.intent === 'string' && proposal.intent.trim()
      ? proposal.intent.trim()
      : 'Proposed durable write';
    const supporting = root.createElement('p');
    supporting.className = 'page-header__supporting';
    const writes = Array.isArray(proposal.writes) ? proposal.writes : [];
    supporting.textContent = writes.length
      ? writes.map(write => write.path).filter(Boolean).join(', ')
      : 'Do not apply until Confirm.';

    const actions = root.createElement('div');
    actions.className = 'confirm-card__actions';
    const discard = root.createElement('button');
    discard.type = 'button';
    discard.className = 'btn btn--ghost';
    discard.textContent = 'Discard';
    discard.addEventListener('click', () => onDiscard?.());
    const confirm = root.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--primary';
    confirm.textContent = 'Confirm';
    confirm.addEventListener('click', () => onConfirm?.(proposal, confirm));
    actions.append(discard, confirm);
    card.append(eyebrow, heading, supporting, actions);
    confirmHost.append(card);
  }
}

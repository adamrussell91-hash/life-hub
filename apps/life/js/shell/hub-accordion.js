export function toggleHubAccordion(root, name) {
  if (!root || !name) return false;
  const row = root.querySelector(`.hub-row[data-hub="${name}"]`);
  const panel = root.querySelector(`.hub-panel[data-hub-panel="${name}"]`);
  if (!row || !panel) return false;
  const isOpen = row.classList.contains('is-open');
  for (const openRow of root.querySelectorAll('.hub-row.is-open')) {
    openRow.classList.remove('is-open');
    openRow.querySelector('.hub-toggle')?.setAttribute('aria-expanded', 'false');
  }
  for (const openPanel of root.querySelectorAll('.hub-panel.is-open')) {
    openPanel.classList.remove('is-open');
  }
  if (!isOpen) {
    row.classList.add('is-open');
    panel.classList.add('is-open');
    row.querySelector('.hub-toggle')?.setAttribute('aria-expanded', 'true');
  }
  return !isOpen;
}

export function openHubAccordion(root, name) {
  if (!root || !name) return;
  const row = root.querySelector(`.hub-row[data-hub="${name}"]`);
  if (row?.classList.contains('is-open')) return;
  toggleHubAccordion(root, name);
}

export function bindHubAccordion(root) {
  if (!root?.dataset || root.dataset.hubAccordionBound === 'true') return;
  root.dataset.hubAccordionBound = 'true';
  root.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-hub-toggle]');
    if (!toggle || !root.contains(toggle)) return;
    event.preventDefault();
    event.stopPropagation();
    toggleHubAccordion(root, toggle.dataset.hubToggle);
  });
}

export function renderHubPreview(root, hubId, lines) {
  const inner = root.querySelector?.(`[data-hub-preview="${hubId}"]`);
  if (!inner) return;
  const rows = (Array.isArray(lines) ? lines : [])
    .map(line => String(line ?? '').trim())
    .filter(Boolean)
    .slice(0, 8);
  inner.replaceChildren();
  if (!rows.length) {
    const empty = inner.ownerDocument.createElement('div');
    empty.className = 'hub-preview-item';
    empty.textContent = 'Nothing to preview yet';
    inner.append(empty);
    return;
  }
  for (const line of rows) {
    const item = inner.ownerDocument.createElement('div');
    item.className = 'hub-preview-item';
    item.textContent = line;
    inner.append(item);
  }
}

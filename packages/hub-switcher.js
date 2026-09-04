export const UMBRELLA_HUBS = [
  {
    id: 'life',
    title: 'Life',
    eyebrow: 'Private dashboard',
    origin: '/',
    paths: ['M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z']
  },
  {
    id: 'teaching',
    title: 'Teaching',
    eyebrow: 'Classes and lessons',
    origin: '/teaching/',
    paths: ['M4 19V6.8L12 4l8 2.8V19', 'M4 19h16', 'M12 4v15']
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    eyebrow: 'Archive and research',
    origin: '/knowledge/',
    paths: [
      'M5 5.5h6.5A3.5 3.5 0 0 1 15 9v10H8.5A3.5 3.5 0 0 0 5 15.5V5.5Z',
      'M15 9h4v10h-4'
    ]
  },
  {
    id: 'tasks',
    title: 'Tasks',
    eyebrow: 'Board',
    origin: '/tasks/',
    paths: ['M8 7h11', 'M8 12h11', 'M8 17h11', 'm4.5 7 .8.8L7 6', 'M4.5 12l.8.8L7 11']
  }
];

export const CHEVRON_PATH = 'm6 9 6 6 6-6';

export function listUmbrellaHubs() {
  return UMBRELLA_HUBS.map(hub => ({ ...hub, paths: [...hub.paths] }));
}

function iconSvg(paths, className = 'hub-rail__icon') {
  const body = paths
    .map(d => `<path d="${d}"/>`)
    .join('');
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function chevronSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${CHEVRON_PATH}"/></svg>`;
}

function accordionRowHtml(hub, currentId) {
  const current = hub.id === currentId;
  return `<div class="hub-row${current ? ' is-active' : ''}" data-hub="${hub.id}">
    <a class="hub-label" href="${hub.origin}"${current ? ' aria-current="page"' : ''}>
      <span class="nav-glyph" aria-hidden="true">${iconSvg(hub.paths)}</span>
      <span>${hub.title}</span>
    </a>
    <button class="hub-toggle" type="button" data-hub-toggle="${hub.id}" aria-label="Preview ${hub.title}" aria-expanded="false">
      ${chevronSvg()}
    </button>
  </div>
  <div class="hub-panel" data-hub-panel="${hub.id}">
    <div class="hub-panel-inner" data-hub-preview="${hub.id}">
      <div class="hub-preview-item">${hub.eyebrow}</div>
    </div>
  </div>`;
}

export function hubSwitcherHtml(currentId) {
  const rows = UMBRELLA_HUBS.map(hub => accordionRowHtml(hub, currentId)).join('');
  return `<div class="hub-rail__hubs" data-hub-switcher><p class="hub-rail__section">Hubs</p>${rows}</div>`;
}

export function hubSwitcherHost(node) {
  return node?.closest?.('.hub-rail') ?? node;
}

function createIcon(doc, paths) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'hub-rail__icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function createChevron(doc) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CHEVRON_PATH);
  svg.append(path);
  return svg;
}

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
  if (!root || root.dataset.hubAccordionBound === 'true') return;
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

export function appendHubSwitcher(parent, currentId) {
  if (!parent) return;
  const doc = parent.ownerDocument ?? document;
  let host = parent.querySelector('[data-hub-switcher]');
  if (!host) {
    host = doc.createElement('div');
    host.dataset.hubSwitcher = '';
    host.className = 'hub-rail__hubs';
    parent.append(host);
  }
  const staging = doc.createElement('div');
  staging.innerHTML = hubSwitcherHtml(currentId);
  const next = staging.querySelector('[data-hub-switcher]');
  if (next) host.replaceWith(next);
  else host.replaceChildren();
  const live = parent.querySelector('[data-hub-switcher]') ?? host;
  bindHubAccordion(live);
}

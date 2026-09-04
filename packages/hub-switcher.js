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

export function listUmbrellaHubs() {
  return UMBRELLA_HUBS.map(hub => ({ ...hub, paths: [...hub.paths] }));
}

function iconSvg(paths, className = 'hub-rail__icon') {
  const body = paths
    .map(d => `<path d="${d}"/>`)
    .join('');
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function hubSwitcherHtml(currentId) {
  const links = UMBRELLA_HUBS.map(hub => {
    const current = hub.id === currentId;
    return `<a class="hub-rail__link${current ? ' is-current' : ''}" href="${hub.origin}"${current ? ' aria-current="page"' : ''}><span class="nav-glyph" aria-hidden="true">${iconSvg(hub.paths)}</span><span>${hub.title}</span></a>`;
  }).join('');
  return `<div class="hub-rail__hubs" data-hub-switcher><p class="hub-rail__section">Hubs</p>${links}</div>`;
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
  host.replaceChildren();
  const label = doc.createElement('p');
  label.className = 'hub-rail__section';
  label.textContent = 'Hubs';
  host.append(label);
  for (const hub of UMBRELLA_HUBS) {
    const link = doc.createElement('a');
    link.className = 'hub-rail__link';
    link.href = hub.origin;
    if (hub.id === currentId) {
      link.classList.add('is-current');
      link.setAttribute('aria-current', 'page');
    }
    const glyph = doc.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.append(createIcon(doc, hub.paths));
    const title = doc.createElement('span');
    title.textContent = hub.title;
    link.append(glyph, title);
    host.append(link);
  }
}

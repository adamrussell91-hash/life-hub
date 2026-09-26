/** Collapsed key: "What do the places mean?" */

import { HABITAT_LABELS, PLACE_MEANINGS, type WorldModel } from './model';

const PLACE_ORDER = [
  'forest',
  'reef',
  'savannah',
  'wetland',
  'island',
  'sandbank',
  'open-sea',
  'mangrove',
  'stepping'
] as const;

const STATE_ORDER = [
  { key: 'active', label: 'Active' },
  { key: 'quiet', label: 'Quiet' },
  { key: 'bridge', label: 'Bridge (segmented shell)' },
  { key: 'new', label: 'New this year' },
  { key: 'landmark', label: 'Landmark (organisation)' }
] as const;

export function mountKey(host: HTMLElement): { render: (model: WorldModel) => void; el: HTMLElement } {
  const wrap = document.createElement('div');
  wrap.className = 'miniworld__key';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'miniworld__key-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'What do the places mean?';
  const panel = document.createElement('div');
  panel.className = 'miniworld__key-panel';
  panel.hidden = true;
  wrap.append(toggle, panel);
  host.append(wrap);

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  function render(model: WorldModel): void {
    panel.replaceChildren();
    const places = document.createElement('ul');
    places.className = 'miniworld__key-list';
    for (const key of PLACE_ORDER) {
      const count = model.keyCounts[key] ?? 0;
      if (key !== 'open-sea' && key !== 'mangrove' && key !== 'stepping' && count === 0) continue;
      const li = document.createElement('li');
      const label =
        key === 'reef'
          ? 'Coral Reef'
          : key === 'open-sea'
            ? 'Open sea'
            : key === 'mangrove'
              ? 'Mangrove sandbar'
              : key === 'stepping'
                ? 'Stepping stones'
                : HABITAT_LABELS[key as keyof typeof HABITAT_LABELS] ?? key;
      li.innerHTML = `<b>${label}</b> <span class="count">${count}</span><span class="desc">${PLACE_MEANINGS[key]}</span>`;
      places.append(li);
    }
    const states = document.createElement('ul');
    states.className = 'miniworld__key-list miniworld__key-list--states';
    const h = document.createElement('h3');
    h.textContent = 'Creatures';
    for (const s of STATE_ORDER) {
      const li = document.createElement('li');
      li.innerHTML = `<b>${s.label}</b> <span class="count">${model.keyCounts[s.key] ?? 0}</span>`;
      states.append(li);
    }
    if ((model.keyCounts['last-contact-unknown'] ?? 0) > 0) {
      const note = document.createElement('p');
      note.className = 'miniworld__key-note';
      note.textContent = `${model.keyCounts['last-contact-unknown']} people have no last-contact date (counted as not quiet).`;
      panel.append(places, h, states, note);
    } else {
      panel.append(places, h, states);
    }
  }

  return { render, el: wrap };
}

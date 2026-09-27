/** Communities cards — phone layout + desktop Communities view (D2 sort). */

import { HABITAT_LABELS, type Community, type WorldModel } from './model';
import { HAB_COLORS } from './terrain';

export function mountCards(
  host: HTMLElement,
  options: { onSelectCommunity?: (id: string) => void } = {}
): { render: (model: WorldModel) => void; el: HTMLElement; setVisible: (v: boolean) => void } {
  const el = document.createElement('div');
  el.className = 'miniworld__cards';
  el.hidden = true;
  host.append(el);

  function render(model: WorldModel): void {
    el.replaceChildren();
    if (!model.communities.length) {
      const empty = document.createElement('p');
      empty.className = 'miniworld__empty';
      empty.textContent = 'No communities yet';
      el.append(empty);
      return;
    }
    // Already sorted by member count desc in model (D2).
    for (const c of model.communities) {
      el.append(card(c, () => options.onSelectCommunity?.(c.id)));
    }
  }

  return {
    render,
    el,
    setVisible(v) {
      el.hidden = !v;
    }
  };
}

function card(c: Community, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'miniworld__card';
  btn.style.setProperty('--hab', HAB_COLORS[c.habitat].fill);
  btn.style.setProperty('--hab-ink', HAB_COLORS[c.habitat].edge);
  btn.addEventListener('click', onClick);
  btn.innerHTML = `
    <div class="miniworld__card-top">
      <em>${HABITAT_LABELS[c.habitat]}</em>
      <span>${c.stats.memberCount} people</span>
    </div>
    <h3>${escapeHtml(c.label)}</h3>
    <p>${escapeHtml(c.meaning)}</p>
  `;
  return btn;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

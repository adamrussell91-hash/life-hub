/** Clickable insight sentences from the model. */

import type { Insight, WorldModel } from './model';
import { HAB_COLORS } from './terrain';

export function mountInsights(
  host: HTMLElement,
  options: { onFocus?: (insight: Insight) => void } = {}
): { render: (model: WorldModel) => void; el: HTMLElement } {
  const box = document.createElement('section');
  box.className = 'miniworld__box';
  const title = document.createElement('h2');
  title.id = 'miniworld-insights-title';
  const list = document.createElement('ul');
  list.className = 'miniworld__insights';
  box.append(title, list);
  host.append(box);

  function render(model: WorldModel): void {
    title.textContent = `What the map says in ${model.year}`;
    list.replaceChildren();
    for (const insight of model.insights) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      const color =
        insight.colorKey in HAB_COLORS
          ? HAB_COLORS[insight.colorKey as keyof typeof HAB_COLORS].fill
          : insight.colorKey === 'mangrove'
            ? '#4f7a55'
            : insight.colorKey === 'open-sea'
              ? '#a4c3d3'
              : '#6b7788';
      btn.innerHTML = `<i style="background:${color}"></i><span></span>`;
      (btn.querySelector('span') as HTMLElement).textContent = insight.text;
      btn.addEventListener('click', () => options.onFocus?.(insight));
      li.append(btn);
      list.append(li);
    }
  }

  return { render, el: box };
}

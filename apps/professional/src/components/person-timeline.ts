/**
 * The person timeline: a year gutter, then rows. A role is a filled crest
 * shield, education an outlined one, a touchpoint a dot. More than 12 rows
 * collapse behind "Show all".
 */

import {
  groupTimelineByYear,
  TIMELINE_COLLAPSE_AT,
  type TimelineRow
} from '@/domain/person-timeline';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderPersonTimeline(
  host: HTMLElement,
  rows: TimelineRow[],
  crest: (orgRef: string, orgName: string) => HTMLElement
): void {
  host.replaceChildren();
  if (!rows.length) {
    host.append(el('p', 'people-pane__empty', 'Add their roles and education, or link a meeting or note.'));
    return;
  }
  let expanded = false;

  function marker(row: TimelineRow): HTMLElement {
    const wrap = el('span', `person-timeline__marker person-timeline__marker--${row.kind}`);
    wrap.setAttribute('aria-hidden', 'true');
    if (row.kind === 'touchpoint' || !row.orgRef) {
      wrap.append(el('span', 'person-timeline__dot'));
    } else {
      const shield = crest(row.orgRef, row.orgName ?? '');
      if (row.kind === 'education') shield.classList.add('people-crest--outline');
      wrap.append(shield);
    }
    return wrap;
  }

  function paint(): void {
    host.replaceChildren();
    const shown = expanded ? rows : rows.slice(0, TIMELINE_COLLAPSE_AT);
    const list = el('ol', 'person-timeline');
    for (const group of groupTimelineByYear(shown)) {
      const year = el('li', 'person-timeline__year');
      year.append(el('span', 'person-timeline__year-label', group.year));
      const items = el('ol', 'person-timeline__rows');
      for (const row of group.rows) {
        const item = el('li', `person-timeline__row person-timeline__row--${row.kind}`);
        item.dataset.kind = row.kind;
        const text = el('span', 'person-timeline__text');
        text.append(el('span', 'person-timeline__label', row.text));
        if (row.when) text.append(el('span', 'person-timeline__when', ` · ${row.when}`));
        item.append(marker(row), text);
        items.append(item);
      }
      year.append(items);
      list.append(year);
    }
    host.append(list);
    if (rows.length > TIMELINE_COLLAPSE_AT) {
      const toggle = el('button', 'person-timeline__toggle', expanded ? 'Show fewer' : `Show all ${rows.length}`) as HTMLButtonElement;
      toggle.type = 'button';
      toggle.addEventListener('click', () => {
        expanded = !expanded;
        paint();
      });
      host.append(toggle);
    }
  }
  paint();
}

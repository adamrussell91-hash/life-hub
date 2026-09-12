/**
 * Shared relationship timeline renderer.
 * Renders an authorised server `timeline` array as-is — grouped by year
 * without reordering items inside a year.
 */

import { formatDisplayDate } from './format-display-date.js';

function yearOf(dateValue) {
  if (!dateValue) return 'Undated';
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return 'Undated';
  return String(parsed.getFullYear());
}

function isOpenPeriod(entry) {
  return entry.kind === 'period' && !entry.end_date;
}

function isEndedPeriod(entry) {
  return entry.kind === 'period' && Boolean(entry.end_date);
}

function renderEntry(entry) {
  const item = document.createElement('li');
  item.className = 'relationship-timeline__entry';
  if (isOpenPeriod(entry)) item.classList.add('relationship-timeline__entry--open');
  if (isEndedPeriod(entry)) item.classList.add('relationship-timeline__entry--ended');

  const marker = document.createElement('span');
  marker.className = 'relationship-timeline__marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = isEndedPeriod(entry) ? '◌' : '●';

  const body = document.createElement('div');
  body.className = 'relationship-timeline__body';

  const label = document.createElement('p');
  label.className = 'relationship-timeline__label';
  if (entry.href) {
    const link = document.createElement('a');
    link.href = entry.href;
    link.textContent = entry.label;
    label.append(link);
  } else {
    label.textContent = entry.label;
  }

  const meta = document.createElement('p');
  meta.className = 'relationship-timeline__meta';
  const parts = [];
  const startDisplay = formatDisplayDate(entry.date);
  if (startDisplay) {
    if (entry.end_date) {
      const endDisplay = formatDisplayDate(entry.end_date);
      parts.push(endDisplay ? `${startDisplay} – ${endDisplay}` : startDisplay);
    } else if (isOpenPeriod(entry)) {
      parts.push(`${startDisplay} – present`);
    } else {
      parts.push(startDisplay);
    }
  }
  if (entry.context_key) parts.push(entry.context_key);
  meta.textContent = parts.join(' · ');

  body.append(label);
  if (parts.length) body.append(meta);
  item.append(marker, body);
  return item;
}

/**
 * @param {HTMLElement} container
 * @param {Array<{
 *   id: string,
 *   kind: string,
 *   date: string | null,
 *   end_date?: string | null,
 *   label: string,
 *   context_key?: string | null,
 *   source_ref?: string,
 *   href?: string | null
 * }>} timeline
 */
export function renderRelationshipTimeline(container, timeline) {
  container.replaceChildren();
  container.classList.add('relationship-timeline');

  if (!timeline.length) {
    const empty = document.createElement('p');
    empty.className = 'relationship-timeline__empty';
    empty.textContent = 'No relationship history yet.';
    container.append(empty);
    return;
  }

  let currentYear = null;
  /** @type {HTMLUListElement | null} */
  let list = null;

  for (const entry of timeline) {
    const year = yearOf(entry.date);
    if (year !== currentYear) {
      currentYear = year;
      const heading = document.createElement('p');
      heading.className = 'relationship-timeline__year';
      heading.textContent = year;
      container.append(heading);
      list = document.createElement('ul');
      list.className = 'relationship-timeline__list';
      container.append(list);
    }
    list?.append(renderEntry(entry));
  }
}

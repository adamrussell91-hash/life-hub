import type { JournalFixture } from '@/journal/types';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export interface ChapterJumpEntry {
  id: string;
  label: string;
  kind: 'leg' | 'day';
}

export function buildChapterEntries(fixture: JournalFixture): ChapterJumpEntry[] {
  const legs = [...fixture.legs].sort((a, b) => a.order - b.order);
  const entries: ChapterJumpEntry[] = [];
  for (const leg of legs) {
    entries.push({ id: leg.id, label: leg.destination, kind: 'leg' });
    const days = fixture.days
      .filter((d) => d.leg_id === leg.id)
      .sort((a, b) => a.local_date.localeCompare(b.local_date));
    for (const day of days) {
      entries.push({
        id: day.id,
        label: formatDisplayDate(day.local_date),
        kind: 'day',
      });
    }
  }
  return entries;
}

export interface OpenChapterJumpOptions {
  fixture: JournalFixture;
  anchor: HTMLElement;
  onSelect: (id: string) => void;
  onClose?: () => void;
}

/** Searchable chapter list (48px rows); selecting scrolls to `[id]` and focuses heading. */
export function openChapterJump(options: OpenChapterJumpOptions): { destroy(): void } {
  const entries = buildChapterEntries(options.fixture);
  const backdrop = document.createElement('div');
  backdrop.className = 'journal-chapter-backdrop';
  backdrop.setAttribute('role', 'presentation');

  const panel = document.createElement('div');
  panel.className = 'journal-chapter';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Chapters');

  const head = document.createElement('div');
  head.className = 'journal-chapter__head';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'journal-chapter__search';
  search.placeholder = 'Search chapters';
  search.setAttribute('aria-label', 'Search chapters');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost journal-chapter__close';
  closeBtn.textContent = 'Close';
  head.append(search, closeBtn);

  const list = document.createElement('ul');
  list.className = 'journal-chapter__list';

  function renderList(query: string): void {
    list.replaceChildren();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) => e.label.toLowerCase().includes(q))
      : entries;
    for (const entry of filtered) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `journal-chapter__row journal-chapter__row--${entry.kind}`;
      btn.textContent = entry.label;
      btn.addEventListener('click', () => {
        options.onSelect(entry.id);
        destroy();
      });
      li.append(btn);
      list.append(li);
    }
    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'journal-chapter__empty';
      empty.textContent = 'No chapters match';
      list.append(empty);
    }
  }

  renderList('');
  search.addEventListener('input', () => renderList(search.value));

  panel.append(head, list);
  backdrop.append(panel);
  options.anchor.append(backdrop);

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') destroy();
  };
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', () => destroy());
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) destroy();
  });

  function destroy(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    options.onClose?.();
  }

  search.focus();
  return { destroy };
}

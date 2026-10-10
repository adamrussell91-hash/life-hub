import type { JournalDocument } from '@/api/journal';
import {
  getOrBuildJournalSearchIndex,
  journalSearchFieldLabel,
  searchJournalIndex,
  type JournalSearchIndex,
  type JournalSearchRow,
} from '@/journal/search-index';

export interface OpenJournalSearchOptions {
  journal: JournalDocument;
  anchor: HTMLElement;
  onSelect: (targetId: string) => void;
  onClose?: () => void;
}

function snippet(label: string, max = 120): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function openJournalSearch(options: OpenJournalSearchOptions): { destroy(): void } {
  let index: JournalSearchIndex | null = null;
  let destroyed = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'journal-chapter-backdrop journal-search-backdrop';
  backdrop.setAttribute('role', 'presentation');

  const panel = document.createElement('div');
  panel.className = 'journal-chapter journal-search';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Search journal');

  const head = document.createElement('div');
  head.className = 'journal-chapter__head journal-search__head';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'journal-chapter__search';
  search.placeholder = 'Search journal';
  search.setAttribute('aria-label', 'Search journal');
  search.autocomplete = 'off';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn--ghost journal-search__clear';
  clearBtn.textContent = 'Clear';
  clearBtn.hidden = true;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost journal-chapter__close';
  closeBtn.textContent = 'Close';

  head.append(search, clearBtn, closeBtn);

  const status = document.createElement('p');
  status.className = 'journal-search__status';
  status.hidden = true;

  const list = document.createElement('ul');
  list.className = 'journal-chapter__list journal-search__list';

  function renderRow(row: JournalSearchRow): HTMLLIElement {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'journal-chapter__row journal-search__row';
    const kind = document.createElement('span');
    kind.className = 'journal-search__kind';
    kind.textContent = journalSearchFieldLabel(row.field);
    const text = document.createElement('span');
    text.className = 'journal-search__label';
    text.textContent = snippet(row.label);
    btn.append(kind, text);
    btn.addEventListener('click', () => {
      options.onSelect(row.targetId);
      destroy();
    });
    li.append(btn);
    return li;
  }

  function renderList(): void {
    list.replaceChildren();
    const q = search.value;
    clearBtn.hidden = !q.trim();
    if (!index) {
      status.hidden = false;
      status.textContent = 'Building search index…';
      return;
    }
    status.hidden = true;
    if (!q.trim()) {
      const hint = document.createElement('p');
      hint.className = 'journal-chapter__empty';
      hint.textContent = 'Type to search places, titles, captions, and notes';
      list.append(hint);
      return;
    }
    const hits = searchJournalIndex(index, q);
    if (hits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'journal-search__empty';
      const msg = document.createElement('p');
      msg.className = 'journal-chapter__empty';
      msg.textContent = 'No results';
      empty.append(msg);
      list.append(empty);
      return;
    }
    for (const row of hits) {
      list.append(renderRow(row));
    }
  }

  clearBtn.addEventListener('click', () => {
    search.value = '';
    renderList();
    search.focus();
  });

  search.addEventListener('input', () => renderList());

  panel.append(head, status, list);
  backdrop.append(panel);
  options.anchor.append(backdrop);

  void getOrBuildJournalSearchIndex(options.journal).then((built) => {
    if (destroyed) return;
    index = built;
    renderList();
  });

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') destroy();
  };
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', () => destroy());
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) destroy();
  });

  function destroy(): void {
    destroyed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    options.onClose?.();
  }

  search.focus();
  renderList();
  return { destroy };
}

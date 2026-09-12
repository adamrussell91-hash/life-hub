/**
 * Shared `@` entity picker — interaction only.
 * Hosts supply `search` / `onSelect` / `onCreate` callbacks.
 * This module never contains API URLs, auth, or domain relationship keys.
 */

const DEFAULT_DEBOUNCE_MS = 200;

/**
 * @typedef {{
 *   ref: string,
 *   kind: string,
 *   display_label: string,
 *   supporting_label?: string | null,
 *   href?: string | null
 * }} EntitySuggestion
 */

/**
 * @param {{
 *   input: HTMLInputElement | HTMLTextAreaElement,
 *   search: (query: string, signal: AbortSignal) => Promise<EntitySuggestion[] | { groups: Record<string, EntitySuggestion[]> }>,
 *   allowedKinds?: string[],
 *   onSelect: (item: EntitySuggestion) => void,
 *   onCreate?: (query: string, kind: string) => void,
 *   emptyText?: string,
 *   debounceMs?: number
 * }} options
 */
export function createEntityPicker(options) {
  const input = options.input;
  if (!input) throw new Error('createEntityPicker requires an input element.');
  const search = options.search;
  const onSelect = options.onSelect;
  const onCreate = options.onCreate ?? null;
  const allowedKinds = options.allowedKinds ? [...options.allowedKinds] : null;
  const emptyText = options.emptyText ?? 'No matching entities.';
  const debounceMs = Math.min(250, Math.max(150, options.debounceMs ?? DEFAULT_DEBOUNCE_MS));

  const root = document.createElement('div');
  root.className = 'entity-picker';
  root.hidden = true;

  const listbox = document.createElement('div');
  listbox.className = 'entity-picker__listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.id = `entity-picker-listbox-${Math.random().toString(36).slice(2, 9)}`;
  root.append(listbox);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listbox.id);

  let open = false;
  let activeIndex = -1;
  /** @type {EntitySuggestion[]} */
  let flatItems = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let debounceTimer = null;
  /** @type {AbortController | null} */
  let abortController = null;
  let searchGeneration = 0;
  let mentionStart = -1;
  let mentionQuery = '';

  function setOpen(next) {
    open = next;
    root.hidden = !next;
    input.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (!next) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    }
  }

  function close() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    setOpen(false);
    mentionStart = -1;
    mentionQuery = '';
  }

  function normalizeResults(raw) {
    /** @type {EntitySuggestion[]} */
    let items = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (raw && typeof raw === 'object' && raw.groups) {
      for (const [kind, group] of Object.entries(raw.groups)) {
        if (allowedKinds && !allowedKinds.includes(kind)) continue;
        if (Array.isArray(group)) {
          for (const item of group) items.push({ ...item, kind: item.kind ?? kind });
        }
      }
    }
    if (allowedKinds) {
      items = items.filter((item) => allowedKinds.includes(item.kind));
    }
    // Never surface StudentReference through the shared picker.
    return items.filter((item) => item.kind !== 'student_reference' && item.kind !== 'student');
  }

  function groupItems(items) {
    /** @type {Map<string, EntitySuggestion[]>} */
    const groups = new Map();
    for (const item of items) {
      const kind = item.kind || 'other';
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push(item);
    }
    return groups;
  }

  function renderList(items) {
    flatItems = items;
    listbox.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'entity-picker__empty';
      empty.textContent = emptyText;
      listbox.append(empty);
      if (onCreate && allowedKinds?.length === 1 && mentionQuery.trim()) {
        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'entity-picker__create btn btn--secondary';
        createBtn.textContent = `Create ${allowedKinds[0]} “${mentionQuery.trim()}”`;
        createBtn.addEventListener('click', () => {
          onCreate(mentionQuery.trim(), allowedKinds[0]);
          close();
        });
        listbox.append(createBtn);
      }
      activeIndex = -1;
      return;
    }

    const groups = groupItems(items);
    let flatIndex = 0;
    for (const [kind, group] of groups) {
      const heading = document.createElement('p');
      heading.className = 'entity-picker__group';
      heading.textContent = kind;
      listbox.append(heading);
      for (const item of group) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'entity-picker__option';
        option.id = `${listbox.id}-opt-${flatIndex}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.dataset.index = String(flatIndex);

        const label = document.createElement('span');
        label.className = 'entity-picker__option-label';
        label.textContent = item.display_label;

        const meta = document.createElement('span');
        meta.className = 'entity-picker__option-meta';
        meta.textContent = [item.kind, item.supporting_label].filter(Boolean).join(' · ');

        option.append(label, meta);
        option.addEventListener('click', () => selectIndex(Number(option.dataset.index)));
        option.addEventListener('pointerdown', (event) => {
          // Prevent input blur before click selection on touch devices.
          event.preventDefault();
        });
        listbox.append(option);
        flatIndex += 1;
      }
    }
    setActive(0);
  }

  function setActive(index) {
    const options = [...listbox.querySelectorAll('.entity-picker__option')];
    if (!options.length) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    activeIndex = ((index % options.length) + options.length) % options.length;
    options.forEach((option, i) => {
      const selected = i === activeIndex;
      option.classList.toggle('entity-picker__option--active', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) {
        input.setAttribute('aria-activedescendant', option.id);
        if (typeof option.scrollIntoView === 'function') {
          option.scrollIntoView({ block: 'nearest' });
        }
      }
    });
  }

  function selectIndex(index) {
    const item = flatItems[index];
    if (!item) return;
    onSelect(item);
    // Strip the active @mention token from the input value when present.
    if (mentionStart >= 0 && 'value' in input) {
      const before = input.value.slice(0, mentionStart);
      const after = input.value.slice(mentionStart + 1 + mentionQuery.length);
      input.value = `${before}${after}`.replace(/\s{2,}/g, ' ').trimStart();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    close();
  }

  function scheduleSearch(query) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runSearch(query);
    }, debounceMs);
  }

  async function runSearch(query) {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const generation = ++searchGeneration;
    const signal = abortController.signal;
    try {
      const raw = await search(query, signal);
      if (generation !== searchGeneration || signal.aborted) return;
      renderList(normalizeResults(raw));
      setOpen(true);
    } catch (error) {
      if (signal.aborted || generation !== searchGeneration) return;
      listbox.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'entity-picker__empty';
      empty.textContent = error instanceof Error ? error.message : 'Search failed.';
      listbox.append(empty);
      setOpen(true);
    }
  }

  function readMention() {
    if (!('value' in input) || typeof input.selectionStart !== 'number') {
      return null;
    }
    const cursor = input.selectionStart;
    const before = input.value.slice(0, cursor);
    const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
    if (!match) return null;
    const token = match[2] ?? '';
    const start = before.length - token.length - 1;
    return { start, query: token };
  }

  function onInput() {
    const mention = readMention();
    if (!mention) {
      close();
      return;
    }
    mentionStart = mention.start;
    mentionQuery = mention.query;
    scheduleSearch(mention.query);
  }

  function onKeyDown(event) {
    if (!open) {
      if (event.key === '@') {
        // Let the character land, then input handler opens.
        return;
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(activeIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex - 1);
      return;
    }
    if (event.key === 'Enter') {
      if (activeIndex >= 0) {
        event.preventDefault();
        selectIndex(activeIndex);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);

  return {
    root,
    open: () => {
      const mention = readMention();
      if (mention) {
        mentionStart = mention.start;
        mentionQuery = mention.query;
        scheduleSearch(mention.query);
      }
    },
    close,
    destroy() {
      close();
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      root.remove();
    },
    get isOpen() {
      return open;
    }
  };
}

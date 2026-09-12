import { searchEntities } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import type { SearchResult } from '@/domain/types';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export type SearchKinds = 'person' | 'organisation' | 'person,organisation';

export interface EntitySearchOptions {
  kinds: SearchKinds;
  label: string;
  placeholder: string;
  /** Shown before any search has been made. */
  emptyHint: string;
  onSelect: (result: SearchResult) => void;
}

export interface EntitySearchHandle {
  destroy(): void;
}

function mergeGroups(groups: { person: SearchResult[]; organisation: SearchResult[] }, kinds: SearchKinds): SearchResult[] {
  if (kinds === 'person') return groups.person;
  if (kinds === 'organisation') return groups.organisation;
  return [...groups.person, ...groups.organisation];
}

function messageForSearchFailure(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'unauthenticated' || err.status === 401) return 'Your session expired. Refresh and sign in again.';
    if (err.code === 'network_error' || err.code === 'timeout') return 'Could not reach the network. Try again.';
    return 'The server could not complete this search. Try again.';
  }
  return 'The server could not complete this search. Try again.';
}

/** Search-first entity finder (People / Organisations / Relationships landing). */
export function mountEntitySearch(container: HTMLElement, options: EntitySearchOptions): EntitySearchHandle {
  container.replaceChildren();
  container.classList.add('entity-search');

  const field = document.createElement('div');
  field.className = 'entity-search__field sign-in__field';

  const inputId = `entity-search-${Math.random().toString(36).slice(2, 8)}`;
  const label = document.createElement('label');
  label.className = 'entity-search__label sign-in__label';
  label.htmlFor = inputId;
  label.textContent = options.label;

  const input = document.createElement('input');
  input.className = 'entity-search__input';
  input.id = inputId;
  input.type = 'search';
  input.placeholder = options.placeholder;
  input.autocomplete = 'off';

  field.append(label, input);

  const statusEl = document.createElement('p');
  statusEl.className = 'entity-search__status';
  statusEl.textContent = options.emptyHint;

  const results = document.createElement('ul');
  results.className = 'entity-search__results';
  results.setAttribute('role', 'listbox');

  container.append(field, statusEl, results);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let currentQuery = '';
  let destroyed = false;

  function setStatus(message: string | null): void {
    if (message === null) {
      statusEl.hidden = true;
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  function renderResults(list: SearchResult[]): void {
    results.replaceChildren();
    if (!list.length) return;
    for (const result of list) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entity-search__result';
      button.setAttribute('role', 'option');

      const name = document.createElement('span');
      name.className = 'entity-search__result-label';
      name.textContent = result.display_label;
      button.append(name);

      if (result.supporting_label) {
        const supporting = document.createElement('span');
        supporting.className = 'entity-search__result-supporting';
        supporting.textContent = result.supporting_label;
        button.append(supporting);
      }

      button.addEventListener('click', () => options.onSelect(result));
      item.append(button);
      results.append(item);
    }
  }

  async function runSearch(query: string): Promise<void> {
    controller?.abort();
    const ownController = new AbortController();
    controller = ownController;
    setStatus('Searching…');
    results.replaceChildren();

    try {
      // One bounded request even for mixed person+organisation search —
      // the server already caps the combined result set at 20.
      const response = await searchEntities(query, options.kinds, { signal: ownController.signal });

      // Ignore a response that raced back after a newer query already
      // superseded it — the caller may have kept typing while this was in
      // flight, even when the request itself wasn't (or couldn't be)
      // cancelled in time.
      if (destroyed || query !== currentQuery) return;

      const merged = {
        person: response.groups.person ?? [],
        organisation: response.groups.organisation ?? []
      };
      const list = mergeGroups(merged, options.kinds);

      if (!list.length) {
        setStatus(`No results for "${query}".`);
        return;
      }
      setStatus(null);
      renderResults(list);
    } catch (err) {
      if (ownController.signal.aborted) return;
      if (destroyed || query !== currentQuery) return;
      setStatus(messageForSearchFailure(err));
    }
  }

  input.addEventListener('input', () => {
    const value = input.value.trim();
    currentQuery = value;
    if (debounceTimer) clearTimeout(debounceTimer);

    if (value.length < MIN_QUERY_LENGTH) {
      controller?.abort();
      results.replaceChildren();
      setStatus(value.length === 0 ? options.emptyHint : `Type at least ${MIN_QUERY_LENGTH} characters.`);
      return;
    }

    debounceTimer = setTimeout(() => {
      void runSearch(value);
    }, DEBOUNCE_MS);
  });

  return {
    destroy() {
      destroyed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      controller?.abort();
    }
  };
}

/**
 * Resource Library → Morphemic matrices.
 *
 * Every matrix the model has built for a lesson word, shared by all lessons.
 * Words already passed the dictionary and spelling checks on the server; this
 * is where the teacher reads the meanings, rewords or removes a word, ticks a
 * matrix as checked, or rebuilds it. Students see a matrix as soon as it is
 * built, ticked or not.
 */
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import { forgetMatrices } from '@/blocks/morphemic-client';
import { askConfirmCard } from '@/teacher/confirm-dialog';

type MatrixWord = { word: string; front: string; prefix: string; ending: string; definition: string; example: string };
type Slot = { id: string; label: string };
type LibraryMatrix = {
  id: string;
  base: string;
  source: string;
  meaning: string;
  fronts: Slot[];
  prefixes: Slot[];
  endings: Slot[];
  words: MatrixWord[];
  status: 'new' | 'checked';
  built_from?: string;
};

let showAll = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** un- + critic + -al, from the matrix's own slot labels. */
export function morphemesOf(matrix: Pick<LibraryMatrix, 'base' | 'fronts' | 'prefixes' | 'endings'>, word: MatrixWord): string {
  const label = (slots: Slot[], id: string) => slots.find((slot) => slot.id === id)?.label ?? id;
  return [
    word.front && label(matrix.fronts, word.front),
    word.prefix && label(matrix.prefixes, word.prefix),
    matrix.base,
    word.ending && label(matrix.endings, word.ending)
  ]
    .filter(Boolean)
    .join(' + ');
}

export function renderMorphemicLibrary(host: HTMLElement): void {
  host.append(el('h2', 'resources-main__title', 'Morphemic matrices'));
  const intro = el(
    'p',
    'morph-lib__intro',
    'Built once for a lesson word and shared by every lesson. Every word here is in the Australian English dictionary and spells from its morphemes. Read the meanings, then tick Looks right.'
  );
  const filters = el('div', 'hub-pills morph-lib__filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Show');
  const list = el('div', 'morph-lib__list');
  list.setAttribute('aria-live', 'polite');
  host.append(intro, filters, list);

  let matrices: LibraryMatrix[] = [];

  function paintFilters(): void {
    filters.replaceChildren();
    const fresh = matrices.filter((matrix) => matrix.status === 'new').length;
    for (const [all, label] of [[false, `New (${fresh})`], [true, `All (${matrices.length})`]] as const) {
      const pill = button(label, 'hub-pills__btn', () => {
        showAll = all;
        paint();
      });
      pill.setAttribute('aria-pressed', String(showAll === all));
      filters.append(pill);
    }
  }

  async function save(matrix: LibraryMatrix, patch: Record<string, unknown>): Promise<void> {
    const { matrix: next } = await apiPatch<{ matrix: LibraryMatrix }>(`/api/morphemic/matrices/${encodeURIComponent(matrix.id)}`, patch);
    matrices = matrices.map((row) => (row.id === next.id ? next : row));
    forgetMatrices();
    paint();
  }

  function card(matrix: LibraryMatrix): HTMLElement {
    const root = el('section', 'morph-lib__card');
    root.dataset.matrix = matrix.id;
    const head = el('div', 'morph-lib__head');
    const title = el('h3', 'morph-lib__title', `Base: ${matrix.base}`);
    if (matrix.source) title.append(el('span', 'morph-lib__source', `, from ${matrix.source}`));
    if (matrix.meaning) title.append(el('span', 'morph-lib__meaning', ` “${matrix.meaning}”`));
    const badge = el('span', `morph-lib__badge morph-lib__badge--${matrix.status}`, matrix.status === 'new' ? 'New' : 'Checked');
    head.append(title, badge);
    root.append(head);
    if (matrix.built_from) root.append(el('p', 'morph-lib__built', `Built for “${matrix.built_from}”`));

    const rows = el('div', 'morph-lib__rows');
    rows.setAttribute('role', 'list');
    for (const word of matrix.words) {
      const row = el('div', 'morph-lib__row');
      row.setAttribute('role', 'listitem');
      const name = el('div', 'morph-lib__name');
      name.append(el('span', 'morph-lib__word', word.word), el('span', 'morph-lib__morphemes', morphemesOf(matrix, word)));
      const meaning = el('textarea', 'input morph-lib__def-input');
      meaning.rows = 2;
      meaning.value = word.definition;
      meaning.setAttribute('aria-label', `Meaning of ${word.word}`);
      meaning.addEventListener('change', () => {
        const text = meaning.value.trim();
        if (!text || text === word.definition) {
          meaning.value = word.definition;
          return;
        }
        void save(matrix, { words: matrix.words.map((entry) => (entry.word === word.word ? { ...entry, definition: text } : entry)) });
      });
      const remove = button('Remove', 'btn btn--ghost morph-lib__remove', () => {
        void save(matrix, { words: matrix.words.filter((entry) => entry.word !== word.word) });
      });
      remove.setAttribute('aria-label', `Remove ${word.word}`);
      row.append(name, meaning, remove);
      rows.append(row);
    }
    root.append(rows);

    const actions = el('div', 'morph-lib__card-actions');
    if (matrix.status === 'new') {
      actions.append(button('Looks right', 'btn btn--primary', () => void save(matrix, { status: 'checked' })));
    }
    actions.append(
      button('Rebuild matrix', 'btn btn--ghost', async () => {
        const ok = await askConfirmCard({
          title: `Rebuild the matrix for ${matrix.base}?`,
          supporting: 'Your edits to it are replaced. A new build costs about A$0.05 and takes a few seconds.',
          confirmLabel: 'Rebuild'
        });
        if (!ok) return;
        await apiDelete(`/api/morphemic/matrices/${encodeURIComponent(matrix.id)}`);
        forgetMatrices();
        await apiPost('/api/morphemic', { word: matrix.built_from || matrix.base });
        await load();
      })
    );
    root.append(actions);
    return root;
  }

  function paint(): void {
    paintFilters();
    list.replaceChildren();
    const shown = showAll ? matrices : matrices.filter((matrix) => matrix.status === 'new');
    if (!shown.length) {
      list.append(
        el(
          'p',
          'resources-main__empty',
          matrices.length
            ? 'Every matrix is checked.'
            : 'No matrices yet. They are built the first time a word in a lesson tray is pinned or tapped.'
        )
      );
      return;
    }
    for (const matrix of shown) list.append(card(matrix));
  }

  async function load(): Promise<void> {
    list.replaceChildren(el('p', 'resources-main__empty', 'Loading matrices…'));
    try {
      matrices = (await apiGet<{ matrices: LibraryMatrix[] }>('/api/morphemic/matrices')).matrices;
      paint();
    } catch (error) {
      list.replaceChildren(el('p', 'resources-main__empty', error instanceof Error && error.message ? error.message : 'The matrices did not load. Try again.'));
    }
  }

  void load();
}

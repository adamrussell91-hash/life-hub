import {
  groupTechniquesByFamily,
  loadLiteraryElements,
  searchTechniques,
  type LiteraryTechnique
} from '@/blocks/literary-elements';

/**
 * Full-width sheet technique picker (phone-safe). Resolves technique id or null.
 */
export async function askTechniquePicker(options?: {
  title?: string;
  initialQuery?: string;
}): Promise<string | null> {
  const table = await loadLiteraryElements();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'annotation-technique-sheet-overlay';
    overlay.setAttribute('role', 'presentation');

    const sheet = document.createElement('div');
    sheet.className = 'annotation-technique-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', options?.title ?? 'Technique');

    const header = document.createElement('div');
    header.className = 'annotation-technique-sheet__header';
    const title = document.createElement('h2');
    title.className = 'annotation-technique-sheet__title';
    title.textContent = options?.title ?? 'Technique';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost';
    cancel.textContent = 'Cancel';
    header.append(title, cancel);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'annotation-technique-sheet__search';
    search.placeholder = 'Search name or symbol';
    search.setAttribute('aria-label', 'Search techniques');
    search.value = options?.initialQuery ?? '';

    const list = document.createElement('div');
    list.className = 'annotation-technique-sheet__list';
    list.setAttribute('role', 'listbox');

    const finish = (value: string | null) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };

    function paintList(query: string): void {
      list.replaceChildren();
      const matches = searchTechniques(table, query);
      const groups = groupTechniquesByFamily(table, matches);
      if (groups.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'annotation-technique-sheet__empty';
        empty.textContent = 'No matching techniques.';
        list.append(empty);
        return;
      }
      for (const group of groups) {
        const famHeading = document.createElement('h3');
        famHeading.className = 'annotation-technique-sheet__family';
        famHeading.textContent = group.family.name;
        list.append(famHeading);
        for (const sub of group.subgroups) {
          const subHeading = document.createElement('h4');
          subHeading.className = 'annotation-technique-sheet__subgroup';
          subHeading.textContent = sub.subgroup.name;
          list.append(subHeading);
          for (const tech of sub.techniques) {
            list.append(rowButton(tech, () => finish(tech.id)));
          }
        }
      }
    }

    cancel.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(null);
    });
    search.addEventListener('input', () => paintList(search.value));
    window.addEventListener('keydown', onKey);

    sheet.append(header, search, list);
    overlay.append(sheet);
    document.body.append(overlay);
    paintList(search.value);
    search.focus();
  });
}

function rowButton(tech: LiteraryTechnique, onPick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'annotation-technique-sheet__row';
  btn.setAttribute('role', 'option');
  const sym = document.createElement('span');
  sym.className = 'annotation-technique-sheet__symbol';
  sym.textContent = tech.symbol;
  const name = document.createElement('span');
  name.className = 'annotation-technique-sheet__name';
  name.textContent = tech.name;
  btn.append(sym, name);
  btn.addEventListener('click', onPick);
  return btn;
}

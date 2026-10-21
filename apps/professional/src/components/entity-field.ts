import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntity, searchEntities } from '@/api/entities';
import { ApiClientError } from '@/api/client';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError || err instanceof Error ? err.message : fallback;
}

export interface SelectedEntity {
  ref: string;
  display_label: string;
}

/**
 * One `@`-picker field that resolves to a single Person or Organisation,
 * with inline "Create X '<name>'" support via the picker's own `onCreate`
 * (SOURCE-BRIEF.md section 5's "Organisation, when known" / "Who
 * introduced you" — unlike every other `@`-picker in this app, these two
 * genuinely may not exist yet, so typing a name with no match can create
 * one on the spot via `POST /api/entities` rather than requiring the
 * organisation/person to already exist).
 */
export function buildSingleEntityField(options: {
  kind: 'organisation' | 'person';
  placeholder: string;
  emptyText: string;
  ariaLabel: string;
  onError: (message: string) => void;
}): { root: HTMLElement; getSelected: () => SelectedEntity | null; reset: () => void } {
  const wrap = el('div', 'add-person-form__field');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = options.placeholder;
  input.setAttribute('aria-label', options.ariaLabel);

  let selected: SelectedEntity | null = null;

  const selectedNote = el('p', 'add-person-form__selected-note');
  selectedNote.hidden = true;
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'add-person-form__clear';
  clearBtn.textContent = 'Clear';

  function setSelected(next: SelectedEntity | null): void {
    selected = next;
    if (next) {
      input.hidden = true;
      selectedNote.replaceChildren(document.createTextNode(`${next.display_label} `), clearBtn);
      selectedNote.hidden = false;
    } else {
      input.value = '';
      input.hidden = false;
      selectedNote.hidden = true;
    }
  }

  clearBtn.addEventListener('click', () => setSelected(null));

  const picker = createEntityPicker({
    input,
    // A dedicated field: type the name (spaces and all), no `@` needed.
    mode: 'field',
    allowedKinds: [options.kind],
    emptyText: options.emptyText,
    search: async (query, signal) => {
      const result = await searchEntities(query, options.kind, { signal });
      return {
        groups: {
          person: result.groups.person ?? [],
          organisation: result.groups.organisation ?? [],
          task: result.groups.task ?? []
        }
      };
    },
    onSelect: (item) => setSelected({ ref: item.ref, display_label: item.display_label }),
    onCreate: (query, createdKind) => {
      void (async () => {
        try {
          const created = await createEntity({
            kind: createdKind as 'person' | 'organisation',
            display_name: query
          });
          setSelected({ ref: created.ref, display_label: created.display_name });
        } catch (err) {
          options.onError(errorMessage(err, `Could not create ${createdKind} "${query}".`));
        }
      })();
    }
  });

  wrap.append(input, picker.root, selectedNote);
  return { root: wrap, getSelected: () => selected, reset: () => setSelected(null) };
}

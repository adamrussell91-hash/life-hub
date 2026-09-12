/**
 * Accessible entity chips for pending and saved relationships.
 * Hosts supply remove/end callbacks. No API URLs or domain keys here.
 */

/**
 * @typedef {{
 *   id: string,
 *   ref: string,
 *   label: string,
 *   relationshipType?: string | null,
 *   state: 'pending' | 'saved',
 *   supportingLabel?: string | null
 * }} EntityChipModel
 */

/**
 * @param {{
 *   container: HTMLElement,
 *   chips: EntityChipModel[],
 *   onRemovePending?: (chip: EntityChipModel) => void,
 *   onEndSaved?: (chip: EntityChipModel) => void,
 *   endLabel?: string
 * }} options
 */
export function renderEntityChips(options) {
  const container = options.container;
  const chips = options.chips ?? [];
  const onRemovePending = options.onRemovePending;
  const onEndSaved = options.onEndSaved;
  const endLabel = options.endLabel ?? 'End';

  container.replaceChildren();
  container.classList.add('entity-chips');
  if (!chips.length) {
    container.classList.add('entity-chips--empty');
    return;
  }
  container.classList.remove('entity-chips--empty');

  const list = document.createElement('ul');
  list.className = 'entity-chips__list';
  list.setAttribute('role', 'list');

  for (const chip of chips) {
    const item = document.createElement('li');
    item.className = `entity-chip entity-chip--${chip.state}`;
    item.dataset.ref = chip.ref;
    item.dataset.chipId = chip.id;
    if (chip.relationshipType) item.dataset.relationshipType = chip.relationshipType;

    const label = document.createElement('span');
    label.className = 'entity-chip__label';
    label.textContent = chip.label;

    const meta = document.createElement('span');
    meta.className = 'entity-chip__meta';
    const metaParts = [chip.relationshipType, chip.supportingLabel].filter(Boolean);
    meta.textContent = metaParts.join(' · ');

    item.append(label);
    if (metaParts.length) item.append(meta);

    if (chip.state === 'pending' && onRemovePending) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'entity-chip__action';
      remove.setAttribute('aria-label', `Remove ${chip.label}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => onRemovePending(chip));
      item.append(remove);
    } else if (chip.state === 'saved' && onEndSaved) {
      const end = document.createElement('button');
      end.type = 'button';
      end.className = 'entity-chip__action entity-chip__action--end';
      end.setAttribute('aria-label', `${endLabel} relationship with ${chip.label}`);
      end.textContent = endLabel;
      end.addEventListener('click', () => onEndSaved(chip));
      item.append(end);
    }

    list.append(item);
  }

  container.append(list);
}

/**
 * Convenience factory that keeps an in-memory chip list and re-renders.
 * Duplicate selection is prevented by canonical ref + relationship type.
 */
export function createEntityChipList(options) {
  /** @type {EntityChipModel[]} */
  let chips = [...(options.chips ?? [])];
  const container = options.container;

  function paint() {
    renderEntityChips({
      container,
      chips,
      onRemovePending: (chip) => {
        chips = chips.filter((item) => item.id !== chip.id);
        options.onRemovePending?.(chip);
        paint();
      },
      onEndSaved: (chip) => {
        options.onEndSaved?.(chip);
      },
      endLabel: options.endLabel
    });
  }

  paint();

  return {
    getChips() {
      return [...chips];
    },
    setChips(next) {
      chips = [...next];
      paint();
    },
    addPending(chip) {
      const relationshipType = chip.relationshipType ?? null;
      const exists = chips.some(
        (item) => item.ref === chip.ref && (item.relationshipType ?? null) === relationshipType
      );
      if (exists) return false;
      chips = [
        ...chips,
        {
          ...chip,
          id: chip.id ?? `pending:${chip.ref}:${relationshipType ?? ''}`,
          state: 'pending'
        }
      ];
      paint();
      return true;
    },
    removeById(id) {
      chips = chips.filter((item) => item.id !== id);
      paint();
    },
    refresh: paint
  };
}

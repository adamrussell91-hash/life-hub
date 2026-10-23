import {
  ATLAS_LIMITS,
  blankDraft,
  isBigMacName,
  maccasDraftsKey,
  type MaccasDraft,
  type MaccasKind,
  type VsHome,
} from '@/atlas/maccas';
import { RATING_OPTIONS } from '@/journal/meal-section';
import type { Currency } from '@/types';

const CURRENCIES: Currency[] = ['AUD', 'EUR', 'GBP', 'JPY', 'KRW', 'MYR', 'NZD', 'SGD', 'TRY', 'USD', 'CAD'];

export interface MaccasRowsHandle {
  drafts(): MaccasDraft[];
  changed(): boolean;
  /** Adds the first row when the switch turns on with none. */
  ensureRow(): void;
}

export function removeItemLabel(draft: Pick<MaccasDraft, 'name'>, index: number): string {
  return `Remove item ${draft.name.trim() || index + 1}`;
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrap = document.createElement('label');
  wrap.className = 'journal-edit-moment__field';
  const label = document.createElement('span');
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function select<T extends string>(
  options: [label: string, value: T][],
  value: T,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const el = document.createElement('select');
  for (const [label, v] of options) {
    const o = document.createElement('option');
    o.textContent = label;
    o.value = v;
    el.append(o);
  }
  el.value = value;
  el.addEventListener('change', () => onChange(el.value as T));
  return el;
}

/** One row per item: name, kind, price, rating, vs home, the Big Mac tick and a note. */
export function mountMaccasRows(
  container: HTMLElement,
  options: { drafts: MaccasDraft[]; currency: () => string; onChange: () => void },
): MaccasRowsHandle {
  let drafts = options.drafts.map((d) => ({ ...d }));
  const loadedKey = maccasDraftsKey(drafts);
  const changed = options.onChange;

  const list = document.createElement('div');
  list.className = 'journal-edit-moment__dishes maccas-rows';

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--secondary journal-edit-moment__add-dish';
  add.textContent = 'Add item';
  add.addEventListener('click', () => {
    drafts.push(blankDraft(options.currency()));
    changed();
    render();
    list.querySelector<HTMLInputElement>('.maccas-row:last-child input')?.focus();
  });

  function row(draft: MaccasDraft, index: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'journal-edit-moment__dish maccas-row';

    const remove = document.createElement('button');
    const bigMac = document.createElement('input');
    bigMac.type = 'checkbox';
    bigMac.checked = draft.big_mac;

    const name = document.createElement('input');
    name.type = 'text';
    name.value = draft.name;
    name.maxLength = ATLAS_LIMITS.name;
    name.placeholder = 'e.g. Ebi Filet-O';
    name.addEventListener('input', () => {
      draft.name = name.value;
      if (!draft.big_mac_touched) {
        draft.big_mac = isBigMacName(draft.name);
        bigMac.checked = draft.big_mac;
        // A Big Mac is the classic everywhere.
        if (draft.big_mac && !draft.id) setKind('classic');
      }
      remove.setAttribute('aria-label', removeItemLabel(draft, index));
      changed();
    });

    const vsWrap = field('Vs home', select<VsHome | ''>(
      [['No call', ''], ['Better than home', 'better'], ['Same as home', 'same'], ['Worse than home', 'worse']],
      draft.vs_home ?? '',
      (v) => { draft.vs_home = v || null; changed(); },
    ));
    vsWrap.hidden = draft.kind !== 'classic';

    function setKind(v: MaccasKind): void {
      draft.kind = v;
      kind.value = v;
      vsWrap.hidden = v !== 'classic';
    }
    const kind = select<MaccasKind>(
      [['Only here (exclusive)', 'exclusive'], ['Classic', 'classic']],
      draft.kind,
      (v) => {
        setKind(v);
        changed();
      },
    );

    const amount = document.createElement('input');
    amount.type = 'text';
    amount.inputMode = 'decimal';
    amount.value = draft.amount;
    amount.placeholder = '0.00';
    amount.addEventListener('input', () => { draft.amount = amount.value; changed(); });

    const currencies: string[] = [...CURRENCIES];
    if (!currencies.includes(draft.currency)) currencies.unshift(draft.currency);
    const currency = select(currencies.map((c) => [c, c] as [string, string]), draft.currency, (v) => {
      draft.currency = v;
      changed();
    });

    const rating = select(
      RATING_OPTIONS.map((r) => [r === null ? 'No rating' : String(r), r === null ? '' : String(r)] as [string, string]),
      draft.rating === null ? '' : String(draft.rating),
      (v) => { draft.rating = v === '' ? null : Number(v); changed(); },
    );

    bigMac.addEventListener('change', () => {
      draft.big_mac = bigMac.checked;
      draft.big_mac_touched = true;
      changed();
    });
    const bigMacRow = document.createElement('label');
    bigMacRow.className = 'journal-edit-moment__meal-switch maccas-row__bigmac';
    const bigMacText = document.createElement('span');
    bigMacText.textContent = 'My Big Mac for the index';
    bigMacRow.append(bigMac, bigMacText);

    const note = document.createElement('input');
    note.type = 'text';
    note.value = draft.note;
    note.maxLength = ATLAS_LIMITS.note;
    note.addEventListener('input', () => { draft.note = note.value; changed(); });

    const pricePair = document.createElement('div');
    pricePair.className = 'journal-edit-moment__dish-pair';
    pricePair.append(field('Price', amount), field('Currency', currency));
    const kindPair = document.createElement('div');
    kindPair.className = 'journal-edit-moment__dish-pair';
    kindPair.append(field('Kind', kind), field('Rating', rating));

    remove.type = 'button';
    remove.className = 'btn btn--ghost journal-edit-moment__dish-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', removeItemLabel(draft, index));
    remove.addEventListener('click', () => {
      drafts = drafts.filter((d) => d !== draft);
      changed();
      render();
    });

    el.append(field('Item', name), kindPair, vsWrap, pricePair, bigMacRow, field('Note (optional)', note), remove);
    return el;
  }

  function render(): void {
    list.replaceChildren(...drafts.map((d, i) => row(d, i)));
  }

  render();
  container.replaceChildren(list, add);

  return {
    drafts: () => drafts,
    changed: () => maccasDraftsKey(drafts) !== loadedKey,
    ensureRow() {
      if (drafts.length) return;
      drafts.push(blankDraft(options.currency()));
      render();
    },
  };
}

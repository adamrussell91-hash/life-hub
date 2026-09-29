import type { Currency, HopMode, Item, ItemDraft, Place, Status, Trip } from '@/types';
import { addItem, editItem, parseEmail, removeItem, searchPlaces } from '@/api/travel';
import { daysForCity } from '@/model/day';

type FormKind = 'do' | 'food' | 'stay' | 'flight' | 'train';

const KIND_LABELS: Record<FormKind, string> = {
  do: 'Thing to do',
  food: 'Food',
  stay: 'Stay',
  flight: 'Flight',
  train: 'Train'
};

const HOP_MODES: HopMode[] = ['walk', 'train', 'tram', 'bus', 'taxi', 'ferry'];
const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'booked', label: 'Booked' },
  { value: 'todo', label: 'Need to book' },
  { value: 'idea', label: 'Just an idea' }
];

export interface AddFormOptions {
  trip: Trip;
  tripId: string;
  version: string;
  cityId?: string;
  date?: string;
  editing?: Item;
  onSaved: (trip: Trip, version: string) => void;
  onClose: () => void;
}

function dayOptionLabel(trip: Trip, date: string, cityId: string): string {
  const city = trip.cities.find((c) => c.id === cityId);
  return `${new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  })} · ${city?.name ?? cityId}`;
}

function field(labelText: string, control: HTMLElement, opts: { full?: boolean } = {}): HTMLElement {
  const wrap = document.createElement('label');
  if (opts.full) wrap.classList.add('full');
  const label = document.createElement('span');
  label.className = 'flabel';
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

/** The mockup's add/edit form (§5), TR-30 through TR-37. */
export function renderAddForm(host: HTMLElement, options: AddFormOptions): void {
  const { trip, editing } = options;
  host.replaceChildren();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const title = document.createElement('h3');
  title.textContent = editing ? `Edit "${editing.title}"` : 'Add to the trip';
  sheet.append(title);

  const initialKind: FormKind =
    editing?.kind === 'flight' || editing?.kind === 'train' || editing?.kind === 'stay'
      ? editing.kind
      : editing?.kind === 'food'
        ? 'food'
        : 'do';
  let kind: FormKind = initialKind;

  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Type');
  const segButtons = new Map<FormKind, HTMLButtonElement>();
  (Object.keys(KIND_LABELS) as FormKind[]).forEach((k) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(k === kind));
    btn.textContent = KIND_LABELS[k];
    btn.addEventListener('click', () => {
      kind = k;
      segButtons.forEach((b, key) => b.setAttribute('aria-checked', String(key === k)));
      syncType();
    });
    segButtons.set(k, btn);
    seg.append(btn);
  });
  sheet.append(seg);

  const form = document.createElement('form');
  form.noValidate = true;
  const grid = document.createElement('div');
  grid.className = 'fgrid';
  form.append(grid);

  // Common fields
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.required = true;
  titleInput.value = editing?.title ?? '';
  grid.append(field('Title', titleInput, { full: true }));

  const daySelect = document.createElement('select');
  const cityOptions: { date: string; cityId: string }[] = [];
  for (const city of trip.cities) {
    for (const date of daysForCity(trip, city.id)) cityOptions.push({ date, cityId: city.id });
  }
  for (const opt of cityOptions) {
    const optionEl = document.createElement('option');
    optionEl.value = `${opt.cityId}|${opt.date}`;
    optionEl.textContent = dayOptionLabel(trip, opt.date, opt.cityId);
    daySelect.append(optionEl);
  }
  const defaultCityId = editing?.city_id ?? options.cityId ?? cityOptions[0]?.cityId ?? '';
  const defaultDate = editing?.date ?? options.date ?? cityOptions[0]?.date ?? '';
  daySelect.value = `${defaultCityId}|${defaultDate}`;
  grid.append(field('Day', daySelect));

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = editing?.time ?? '';
  grid.append(field('Time (leave blank for "Time to set")', timeInput));

  const noteInput = document.createElement('textarea');
  noteInput.value = editing?.note ?? '';
  grid.append(field('Note', noteInput, { full: true }));

  // Where (do/food)
  const whereWrap = document.createElement('div');
  whereWrap.className = 'full';
  const placeRow = document.createElement('div');
  placeRow.className = 'place-row';
  const placeSearch = document.createElement('input');
  placeSearch.type = 'text';
  placeSearch.placeholder = 'Search a place…';
  const pickOnMapBtn = document.createElement('button');
  pickOnMapBtn.type = 'button';
  pickOnMapBtn.className = 'btn ghost';
  pickOnMapBtn.textContent = 'Pick on map';
  placeRow.append(placeSearch, pickOnMapBtn);
  const suggestions = document.createElement('div');
  suggestions.className = 'sugg';
  const pinnedLabel = document.createElement('p');
  pinnedLabel.className = 'pinned';
  whereWrap.append(field('Where', placeRow), suggestions, pinnedLabel);

  let placeDraft: Place | undefined = (editing as { place?: Place })?.place;
  function renderPinnedLabel(): void {
    pinnedLabel.textContent = placeDraft?.name ? `Pinned: ${placeDraft.name}` : '';
  }
  renderPinnedLabel();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  placeSearch.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = placeSearch.value.trim();
      if (!q) {
        suggestions.replaceChildren();
        return;
      }
      const city = trip.cities.find((c) => c.id === daySelect.value.split('|')[0]);
      try {
        const { places } = await searchPlaces(q, city?.center.lat, city?.center.lon);
        suggestions.replaceChildren();
        for (const place of places.slice(0, 6)) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.textContent = place.name;
          chip.addEventListener('click', () => {
            placeDraft = place;
            renderPinnedLabel();
          });
          suggestions.append(chip);
        }
      } catch {
        suggestions.replaceChildren();
        const note = document.createElement('p');
        note.className = 'hint';
        note.textContent = 'Search is unavailable right now. Pick it on the map instead.';
        suggestions.append(note);
      }
    }, 400);
  });

  pickOnMapBtn.addEventListener('click', () => {
    placeDraft = { name: 'Dropped pin', lat: trip.cities[0]?.center.lat ?? 0, lon: trip.cities[0]?.center.lon ?? 0 };
    renderPinnedLabel();
  });
  grid.append(whereWrap);

  // Stay fields
  const nightsInput = document.createElement('input');
  nightsInput.type = 'number';
  nightsInput.min = '1';
  nightsInput.value = String(editing?.kind === 'stay' ? editing.nights : 1);
  const nightsField = field('Nights', nightsInput);

  const addressInput = document.createElement('input');
  addressInput.type = 'text';
  addressInput.value = editing?.kind === 'stay' ? editing.place?.address ?? '' : '';
  const addressField = field('Address', addressInput, { full: true });

  const cancelUntilInput = document.createElement('input');
  cancelUntilInput.type = 'date';
  cancelUntilInput.value = editing?.kind === 'stay' ? editing.cancel_until ?? '' : '';
  const cancelUntilField = field('Free cancellation until', cancelUntilInput);

  const homeBaseLabel = document.createElement('label');
  homeBaseLabel.className = 'check';
  const homeBaseInput = document.createElement('input');
  homeBaseInput.type = 'checkbox';
  homeBaseInput.checked = editing?.kind === 'stay' ? editing.home_base : true;
  homeBaseLabel.append(homeBaseInput, document.createTextNode('This is where I\u2019m sleeping'));

  // Ticket fields
  const carrierInput = document.createElement('input');
  carrierInput.type = 'text';
  carrierInput.value = editing?.kind === 'flight' || editing?.kind === 'train' ? editing.carrier : '';
  const numberInput = document.createElement('input');
  numberInput.type = 'text';
  numberInput.value = editing?.kind === 'flight' || editing?.kind === 'train' ? editing.number : '';
  const fromCodeInput = document.createElement('input');
  fromCodeInput.type = 'text';
  fromCodeInput.value = editing?.kind === 'flight' || editing?.kind === 'train' ? editing.from_code : '';
  const toCodeInput = document.createElement('input');
  toCodeInput.type = 'text';
  toCodeInput.value = editing?.kind === 'flight' || editing?.kind === 'train' ? editing.to_code : '';
  const arriveTimeInput = document.createElement('input');
  arriveTimeInput.type = 'time';
  arriveTimeInput.value = editing?.kind === 'flight' || editing?.kind === 'train' ? editing.arrive_time : '';
  const arriveDateInput = document.createElement('input');
  arriveDateInput.type = 'date';
  arriveDateInput.value = editing?.kind === 'flight' || editing?.kind === 'train' ? editing.arrive_date : '';
  const arriveCitySelect = document.createElement('select');
  for (const c of trip.cities) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name;
    arriveCitySelect.append(o);
  }
  if (editing?.kind === 'flight' || editing?.kind === 'train') {
    arriveCitySelect.value = editing.arrive_city_id ?? '';
  }

  const ticketFields = document.createElement('div');
  ticketFields.className = 'full ticket-fields';
  ticketFields.append(
    field('Carrier', carrierInput),
    field('Number', numberInput),
    field('From code', fromCodeInput),
    field('To code', toCodeInput),
    field('Arrives', arriveTimeInput),
    field('Arrival date', arriveDateInput),
    field('Arrival city', arriveCitySelect)
  );

  const stayFields = document.createElement('div');
  stayFields.className = 'full stay-fields';
  stayFields.append(nightsField, addressField, cancelUntilField, field('', homeBaseLabel));

  grid.append(stayFields, ticketFields);

  // Status / cost / private / link / booking ref
  const statusSelect = document.createElement('select');
  for (const s of STATUS_OPTIONS) {
    const o = document.createElement('option');
    o.value = s.value;
    o.textContent = s.label;
    statusSelect.append(o);
  }
  statusSelect.value = editing?.status ?? 'planned';
  grid.append(field('Status', statusSelect));

  const currencySelect = document.createElement('select');
  const currencies = ['AUD', 'MYR', 'TRY', 'GBP', 'EUR', 'KRW', 'CAD', 'USD', 'JPY', 'NZD', 'SGD'];
  for (const cur of currencies) {
    const o = document.createElement('option');
    o.value = cur;
    o.textContent = cur;
    currencySelect.append(o);
  }
  let currencyTouched = false;
  currencySelect.addEventListener('change', () => {
    currencyTouched = true;
  });
  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.step = '0.01';
  if (editing?.cost) {
    amountInput.value = String(editing.cost.amount);
    currencySelect.value = editing.cost.currency;
    currencyTouched = true;
  }
  const costRow = document.createElement('div');
  costRow.className = 'place-row';
  costRow.append(amountInput, currencySelect);
  const audHint = document.createElement('p');
  audHint.className = 'aud hint';
  grid.append(field('Cost', costRow), audHint);

  daySelect.addEventListener('change', () => {
    if (currencyTouched) return;
    const cityId = daySelect.value.split('|')[0];
    const city = trip.cities.find((c) => c.id === cityId);
    if (city) currencySelect.value = city.local_currency;
  });
  if (!currencyTouched) {
    const startCity = trip.cities.find((c) => c.id === defaultCityId);
    if (startCity) currencySelect.value = startCity.local_currency;
  }

  const bookingRefInput = document.createElement('input');
  bookingRefInput.type = 'text';
  bookingRefInput.value = editing?.booking_ref ?? '';
  grid.append(field('Booking reference (private)', bookingRefInput));

  const linkInput = document.createElement('input');
  linkInput.type = 'url';
  linkInput.value = editing?.link ?? '';
  grid.append(field('Link', linkInput));

  const privateLabel = document.createElement('label');
  privateLabel.className = 'check';
  const privateInput = document.createElement('input');
  privateInput.type = 'checkbox';
  privateInput.checked = editing?.private ?? false;
  privateLabel.append(privateInput, document.createTextNode('Private: hide from the public link'));
  grid.append(field('', privateLabel));

  // Hop section (TR-34)
  const hopFields = document.createElement('div');
  hopFields.className = 'full hop-section';
  const hopHeading = document.createElement('p');
  hopHeading.className = 'flabel';
  hopHeading.textContent = 'Getting to the next stop';
  const hopSeg = document.createElement('div');
  hopSeg.className = 'seg';
  let hopMode: HopMode | null = editing?.hop?.mode ?? null;
  const hopModeButtons = new Map<HopMode, HTMLButtonElement>();
  for (const mode of HOP_MODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(mode === hopMode));
    btn.textContent = mode[0]!.toUpperCase() + mode.slice(1);
    btn.addEventListener('click', () => {
      hopMode = mode;
      hopModeButtons.forEach((b, m) => b.setAttribute('aria-checked', String(m === mode)));
    });
    hopModeButtons.set(mode, btn);
    hopSeg.append(btn);
  }
  const hopMinutes = document.createElement('input');
  hopMinutes.type = 'number';
  hopMinutes.min = '0';
  hopMinutes.value = editing?.hop ? String(editing.hop.minutes) : '';
  const hopNote = document.createElement('input');
  hopNote.type = 'text';
  hopNote.value = editing?.hop?.note ?? '';
  hopFields.append(hopHeading, hopSeg, field('Minutes', hopMinutes), field('Note', hopNote));
  grid.append(hopFields);

  // Paste a confirmation email (TR-37)
  const paste = document.createElement('details');
  paste.className = 'paste';
  const pasteSummary = document.createElement('summary');
  pasteSummary.textContent = 'Paste a confirmation email';
  const pasteTextarea = document.createElement('textarea');
  pasteTextarea.placeholder = 'e.g. "Your booking at Test Hotel is confirmed for 3 nights from 13 Dec…"';
  const fillBtn = document.createElement('button');
  fillBtn.type = 'button';
  fillBtn.className = 'btn ghost';
  fillBtn.textContent = 'Fill from email';
  paste.append(pasteSummary, pasteTextarea, fillBtn);
  form.append(paste);

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  form.append(errorNote);

  fillBtn.addEventListener('click', async () => {
    try {
      const result = await parseEmail(pasteTextarea.value);
      const draft = result.draft;
      if (draft.title) titleInput.value = draft.title;
      if (draft.time !== undefined) timeInput.value = draft.time ?? '';
      if (draft.note) noteInput.value = draft.note;
      if (draft.cost && 'currency' in draft.cost) {
        currencySelect.value = draft.cost.currency;
        amountInput.value = String(draft.cost.amount);
        currencyTouched = true;
      }
      for (const path of result.missing) {
        const el = form.querySelector<HTMLElement>(`[name="${path}"]`);
        el?.setAttribute('aria-invalid', 'true');
      }
      errorNote.hidden = false;
      errorNote.textContent = 'Filled from the email. Check it, then add it.';
    } catch {
      errorNote.hidden = false;
      errorNote.textContent = 'Could not read that email. Fill the fields yourself.';
    }
  });

  const actions = document.createElement('div');
  actions.className = 'row';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = editing ? 'Save' : 'Add';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    host.replaceChildren();
    options.onClose();
  });
  actions.append(saveBtn, cancelBtn);

  // TR-30: Remove lives in the edit sheet with an in-sheet confirm (never window.confirm).
  if (editing) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn ghost danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      const label = editing.title.trim() || 'this item';
      const confirmMsg = document.createElement('p');
      confirmMsg.className = 'hint remove-confirm';
      confirmMsg.textContent = `Remove ${label}?`;
      const confirmRemove = document.createElement('button');
      confirmRemove.type = 'button';
      confirmRemove.className = 'btn danger';
      confirmRemove.textContent = 'Remove';
      const keepBtn = document.createElement('button');
      keepBtn.type = 'button';
      keepBtn.className = 'btn ghost';
      keepBtn.textContent = 'Cancel';
      const restoreActions = () => {
        actions.replaceChildren(saveBtn, cancelBtn, removeBtn);
        confirmMsg.remove();
      };
      keepBtn.addEventListener('click', restoreActions);
      confirmRemove.addEventListener('click', async () => {
        confirmRemove.disabled = true;
        keepBtn.disabled = true;
        try {
          const saved = await removeItem(options.tripId, editing.id, options.version);
          options.onSaved(saved.trip, saved.version);
          host.replaceChildren();
        } catch {
          confirmRemove.disabled = false;
          keepBtn.disabled = false;
          errorNote.hidden = false;
          errorNote.textContent = 'Could not remove. Try again.';
          restoreActions();
        }
      });
      actions.replaceChildren(confirmRemove, keepBtn);
      actions.before(confirmMsg);
    });
    actions.append(removeBtn);
  }
  form.append(actions);

  function syncType(): void {
    whereWrap.hidden = kind === 'stay' || kind === 'flight' || kind === 'train';
    stayFields.hidden = kind !== 'stay';
    ticketFields.hidden = kind !== 'flight' && kind !== 'train';
  }
  syncType();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNote.hidden = true;
    const [cityId, date] = daySelect.value.split('|');
    const amount = Number(amountInput.value);
    const cost = amount > 0 ? { amount, currency: currencySelect.value as Currency } : undefined;

    let draft: ItemDraft;
    const base = {
      city_id: cityId!,
      date: date!,
      time: timeInput.value || null,
      title: titleInput.value.trim(),
      note: noteInput.value,
      status: statusSelect.value as Status,
      cost,
      booking_ref: bookingRefInput.value || undefined,
      private: privateInput.checked,
      link: linkInput.value || undefined,
      hop: hopMode && hopMinutes.value ? { mode: hopMode, minutes: Number(hopMinutes.value), note: hopNote.value || undefined } : undefined
    };
    if (kind === 'stay') {
      const place: Place | undefined = placeDraft
        ? { ...placeDraft, address: addressInput.value || placeDraft.address }
        : addressInput.value
          ? { name: titleInput.value.trim(), lat: 0, lon: 0, address: addressInput.value }
          : undefined;
      draft = {
        ...base,
        kind: 'stay',
        place,
        nights: Number(nightsInput.value) || 1,
        check_out_date: computeCheckOut(date!, Number(nightsInput.value) || 1),
        cancel_until: cancelUntilInput.value || undefined,
        home_base: homeBaseInput.checked
      } as ItemDraft;
    } else if (kind === 'flight' || kind === 'train') {
      draft = {
        ...base,
        kind,
        carrier: carrierInput.value,
        number: numberInput.value,
        from_code: fromCodeInput.value,
        to_code: toCodeInput.value,
        depart_time: timeInput.value || '00:00',
        arrive_time: arriveTimeInput.value,
        arrive_date: arriveDateInput.value || date!,
        arrive_city_id: arriveCitySelect.value
      } as ItemDraft;
    } else {
      draft = {
        ...base,
        kind,
        place: placeDraft
      } as ItemDraft;
    }

    try {
      const saved = editing
        ? await editItem(options.tripId, editing.id, options.version, draft)
        : await addItem(options.tripId, options.version, draft);
      options.onSaved(saved.trip, saved.version);
      host.replaceChildren();
    } catch {
      errorNote.hidden = false;
      errorNote.textContent = 'Could not save. Try again.';
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) {
      host.replaceChildren();
      options.onClose();
    }
  });
  document.addEventListener(
    'keydown',
    function onKey(e) {
      if (e.key === 'Escape' && host.contains(back)) {
        host.replaceChildren();
        options.onClose();
        document.removeEventListener('keydown', onKey);
      }
    },
    { once: true }
  );
  host.append(back);
  titleInput.focus();
}

function computeCheckOut(date: string, nights: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + nights);
  return d.toISOString().slice(0, 10);
}

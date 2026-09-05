/** Pin, progress, run, schedule, disclosures, scroll island, input stack, journal, save, status. */

function ownerDoc(root) {
  if (root?.createElement) return root;
  return root?.ownerDocument ?? globalThis.document;
}

function addClass(el, name) {
  if (el.classList?.add) el.classList.add(name);
  else el.className = `${el.className || ''} ${name}`.trim();
}

function textOf(value, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

export function createPinList(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-pin-list');
  const items = (options.items ?? []).map((item) => ({ ...item, pinned: Boolean(item.pinned) }));

  const paint = () => {
    el.replaceChildren?.();
    if (!el.replaceChildren) el.textContent = '';
    const ordered = [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    for (const item of ordered) {
      const row = doc.createElement('div');
      addClass(row, 'hub-pin-list__item');
      if (item.pinned) addClass(row, 'is-pinned');
      const pin = doc.createElement('button');
      pin.type = 'button';
      addClass(pin, 'hub-icon-btn');
      pin.setAttribute('aria-pressed', item.pinned ? 'true' : 'false');
      pin.setAttribute('aria-label', item.pinned ? `Unpin ${item.label}` : `Pin ${item.label}`);
      pin.textContent = item.pinned ? 'Pinned' : 'Pin';
      pin.addEventListener('click', () => {
        item.pinned = !item.pinned;
        options.onPin?.(item.id, item.pinned);
        paint();
      });
      const label = doc.createElement('span');
      addClass(label, 'hub-pin-list__label');
      label.textContent = item.label;
      label.addEventListener('click', () => options.onOpen?.(item.id));
      row.append(pin, label);
      el.append(row);
    }
  };
  paint();
  return { el, items, paint };
}

export function createLabeledProgress(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-progress');
  const max = Number(options.max) > 0 ? Number(options.max) : 100;
  const value = Math.max(0, Math.min(max, Number(options.value) || 0));
  const pct = Math.round((value / max) * 100);
  const label = doc.createElement('p');
  addClass(label, 'hub-progress__label');
  label.textContent = `${textOf(options.label, 'Progress')} ${value} / ${max}`;
  const track = doc.createElement('div');
  addClass(track, 'hub-progress__track');
  const fill = doc.createElement('div');
  addClass(fill, 'hub-progress__fill');
  fill.style.setProperty?.('--hub-progress-pct', `${pct}%`);
  if (!fill.style.setProperty) fill.style.width = `${pct}%`;
  track.append(fill);
  el.append(label, track);
  return { el, value, max, pct };
}

export function createStepIndicator(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('ol');
  addClass(el, 'hub-steps');
  const current = options.current ?? 0;
  (options.steps ?? []).forEach((step, index) => {
    const item = doc.createElement('li');
    addClass(item, 'hub-steps__item');
    if (index === current) addClass(item, 'is-current');
    item.textContent = step;
    el.append(item);
  });
  return { el };
}

export function createRunWidget(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-run');
  const value = doc.createElement('p');
  addClass(value, 'hub-run__value');
  addClass(value, 'hub-count');
  value.setAttribute('data-hub-count', '');
  const amount = Number(options.distance) || 0;
  value.textContent = `${amount} ${textOf(options.unit, 'km')}`;
  const label = doc.createElement('p');
  addClass(label, 'metric-caption');
  label.textContent = options.label ?? 'Distance';
  el.append(label, value);
  return { el, value };
}

export function createScheduleButton(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-schedule');
  const btn = doc.createElement('button');
  btn.type = 'button';
  addClass(btn, 'btn');
  addClass(btn, 'btn--secondary');
  btn.textContent = options.label ?? 'Schedule';
  btn.addEventListener('click', () => options.onSchedule?.());
  el.append(btn);
  return { el, button: btn };
}

export function createSlotPicker(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-slots');
  const selected = new Set(options.selected ?? []);
  for (const slot of options.slots ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'btn');
    addClass(btn, 'btn--ghost');
    addClass(btn, 'hub-slots__btn');
    btn.textContent = slot.label ?? slot.id;
    btn.setAttribute('aria-pressed', selected.has(slot.id) ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (selected.has(slot.id)) selected.delete(slot.id);
      else selected.add(slot.id);
      btn.setAttribute('aria-pressed', selected.has(slot.id) ? 'true' : 'false');
      options.onToggle?.(slot.id, selected.has(slot.id));
    });
    el.append(btn);
  }
  return { el, selected };
}

export function createEventReminders(options = {}) {
  return createSlotPicker({
    ...options,
    slots: (options.reminders ?? ['15 min before', '1 hour before']).map((label, index) => ({
      id: String(index),
      label
    }))
  });
}

export function createDisclosureCard(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('article');
  addClass(el, 'hub-disclosure');
  if (options.className) addClass(el, options.className);
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  addClass(trigger, 'hub-disclosure__trigger');
  trigger.setAttribute('aria-expanded', 'false');
  const title = doc.createElement('span');
  title.textContent = options.title ?? 'Details';
  const meta = doc.createElement('span');
  meta.textContent = options.meta ?? '';
  trigger.append(title, meta);
  const body = doc.createElement('div');
  addClass(body, 'hub-disclosure__body');
  body.hidden = true;
  body.textContent = options.detail ?? '';
  trigger.addEventListener('click', () => {
    body.hidden = !body.hidden;
    trigger.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
  });
  el.append(trigger, body);
  return { el, trigger, body, open: () => { body.hidden = false; trigger.setAttribute('aria-expanded', 'true'); } };
}

export function createTaskDisclosure(options = {}) {
  return createDisclosureCard({ ...options, className: 'hub-disclosure--task', meta: options.progress ?? options.meta });
}

export function createActivitiesCard(options = {}) {
  const api = createDisclosureCard({ ...options, className: 'hub-disclosure--activities' });
  if (options.items?.length) {
    api.body.textContent = '';
    const list = ownerDoc(options.root).createElement('ul');
    addClass(list, 'hub-list');
    for (const item of options.items) {
      const li = ownerDoc(options.root).createElement('li');
      addClass(li, 'hub-list-item');
      li.textContent = item;
      list.append(li);
    }
    api.body.append(list);
  }
  return api;
}

export function createCollectionGrid(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-grid-disclose');
  for (const item of options.items ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'btn');
    addClass(btn, 'btn--secondary');
    btn.textContent = item.label;
    btn.addEventListener('click', () => options.onExpand?.(item));
    el.append(btn);
  }
  return { el };
}

export function createScrollIsland(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-scroll-island');
  const progress = doc.createElement('p');
  addClass(progress, 'hub-progress__label');
  progress.textContent = options.progressLabel ?? 'On this page';
  el.append(progress);
  for (const action of options.actions ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'btn');
    addClass(btn, 'btn--ghost');
    btn.textContent = action.label;
    btn.addEventListener('click', () => action.onSelect?.());
    el.append(btn);
  }
  return { el };
}

export function createProgressiveInputStack(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-input-stack');
  const fields = options.fields ?? [];
  fields.forEach((field, index) => {
    const wrap = doc.createElement('label');
    addClass(wrap, 'hub-input-stack__field');
    if (index > 0) wrap.hidden = true;
    wrap.textContent = field.label;
    const input = doc.createElement('input');
    addClass(input, 'hub-inline-edit__input');
    input.name = field.name ?? field.label;
    input.addEventListener('input', () => {
      if (String(input.value ?? '').trim() && fields[index + 1]) {
        const next = el.children[index + 1];
        if (next) next.hidden = false;
      }
      options.onChange?.(input.name, input.value);
    });
    wrap.append(input);
    el.append(wrap);
  });
  return { el };
}

export function createJournalNav(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('nav');
  addClass(el, 'hub-journal-nav');
  el.setAttribute('aria-label', options.label ?? 'Journal');
  for (const section of options.sections ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'btn');
    addClass(btn, section.id === options.current ? 'btn--primary' : 'btn--ghost');
    btn.textContent = section.label;
    btn.addEventListener('click', () => options.onSelect?.(section.id));
    el.append(btn);
  }
  return { el };
}

export function createSaveToggle(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const btn = options.wrap ?? doc.createElement('button');
  btn.type = 'button';
  addClass(btn, 'btn');
  addClass(btn, 'btn--ghost');
  addClass(btn, 'hub-save-toggle');
  let saved = Boolean(options.saved);
  const paint = () => {
    btn.textContent = saved ? (options.savedLabel ?? 'Saved') : (options.label ?? 'Save');
    btn.classList?.toggle?.('is-saved', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  };
  btn.addEventListener('click', () => {
    saved = !saved;
    paint();
    options.onToggle?.(saved);
  });
  paint();
  return { el: btn, isSaved: () => saved };
}

export function createStatusPicker(options = {}) {
  const doc = ownerDoc(options.root ?? options.wrap);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-status-picker');
  let value = options.value ?? options.statuses?.[0]?.id ?? '';
  for (const status of options.statuses ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'btn');
    addClass(btn, 'btn--ghost');
    btn.textContent = status.label;
    btn.dataset.status = status.id;
    btn.setAttribute('aria-pressed', status.id === value ? 'true' : 'false');
    btn.addEventListener('click', () => {
      value = status.id;
      for (const node of el.querySelectorAll?.('[data-status]') ?? []) {
        node.setAttribute('aria-pressed', node.dataset.status === value ? 'true' : 'false');
      }
      options.onChange?.(value);
    });
    el.append(btn);
  }
  return { el, get value() { return value; } };
}

export function mountHubSurfaces(scope = document) {
  const mounted = [];
  for (const el of scope.querySelectorAll?.('[data-hub-progress]:not([data-hub-surface-ready])') ?? []) {
    el.setAttribute('data-hub-surface-ready', '1');
    mounted.push(createLabeledProgress({
      wrap: el,
      label: el.getAttribute('data-label'),
      value: el.getAttribute('data-value'),
      max: el.getAttribute('data-max')
    }));
  }
  for (const el of scope.querySelectorAll?.('[data-hub-journal]:not([data-hub-surface-ready])') ?? []) {
    el.setAttribute('data-hub-surface-ready', '1');
    addClass(el, 'hub-journal-nav');
    mounted.push({ el });
  }
  return mounted;
}

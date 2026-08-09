import {
  SKINCARE_ROUTINES,
  appendNoteChip,
  buildProductList,
  currentRoutineKey,
  toSkincareConfirmPayload
} from './skincare-routines-data.js';

function setText(root, selector, value) {
  const el = root.querySelector(selector);
  if (el) el.textContent = String(value);
}

export function renderSkincare(root, model, {
  onLogRoutine,
  onLogProcedure,
  onRemoveFromRoutine,
  onAddFromLibrary,
  onCreateProduct
} = {}) {
  const dashboard = root.querySelector('#skincare-dashboard');
  if (!dashboard) return;

  setText(root, '[data-skincare="date"]', model.date);
  setText(root, '[data-skincare="am-streak"]', model.amStreak);
  setText(root, '[data-skincare="pm-streak"]', model.pmStreak);

  const heatmap = root.querySelector('#skincare-consistency-heatmap');
  if (heatmap) {
    heatmap.replaceChildren();
    for (const day of model.monthHeatmap ?? []) {
      const tile = root.createElement('span');
      tile.className = 'heatmap-tile';
      tile.dataset.skincareState = day.state;
      if (day.isToday) tile.dataset.today = 'true';
      tile.title = day.date;
      heatmap.append(tile);
    }
  }

  const host = root.querySelector('#skincare-routine-cards');
  if (host) {
    host.replaceChildren();
    for (const key of ['am', 'pm']) {
      host.append(renderRoutineCard(root, key, model, {
        onLogRoutine,
        onRemoveFromRoutine,
        onAddFromLibrary,
        onCreateProduct
      }));
    }
  }

  const procedureHost = root.querySelector('#skincare-procedure');
  if (procedureHost) {
    renderProcedureCard(root, procedureHost, model, onLogProcedure);
  }

  const logged = root.querySelector('#skincare-procedure-log');
  if (logged) {
    logged.replaceChildren();
    if (!model.procedures.length) {
      const empty = root.createElement('p');
      empty.className = 'metric-caption';
      empty.textContent = 'No procedures logged today.';
      logged.append(empty);
    } else {
      const list = root.createElement('ul');
      list.className = 'skincare-procedure-list';
      for (const item of model.procedures) {
        const row = root.createElement('li');
        row.textContent = item.notes || 'Procedure logged';
        list.append(row);
      }
      logged.append(list);
    }
  }

  dashboard.removeAttribute('hidden');
}

function renderRoutineCard(root, key, model, {
  onLogRoutine,
  onRemoveFromRoutine,
  onAddFromLibrary,
  onCreateProduct
} = {}) {
  const routine = model.routines[key];
  const isCurrent = model.currentRoutine === key;
  const card = root.createElement('article');
  card.className = isCurrent ? 'metric-card skincare-card skincare-card--current' : 'metric-card skincare-card';
  card.dataset.routine = key;

  const heading = root.createElement('div');
  heading.className = 'skincare-card__heading';
  const headingLabel = root.createElement('p');
  headingLabel.className = 'metric-label';
  headingLabel.textContent = `${routine.label} · ${routine.duration_hint}`;
  heading.append(headingLabel);
  if (isCurrent) {
    const nowChip = root.createElement('span');
    nowChip.className = 'skincare-card__now-chip';
    nowChip.textContent = 'Now';
    heading.append(nowChip);
  }
  card.append(heading);

  const status = root.createElement('p');
  status.className = 'metric-caption skincare-card__status';
  const already = key === 'am' ? model.amLogged : model.pmLogged;
  status.textContent = already ? 'Logged today' : (model.currentRoutine === key ? 'Up next' : 'Waiting');
  card.append(status);

  const productEntries = Array.isArray(routine.productEntries)
    ? routine.productEntries
    : (routine.products ?? []).map(name => ({ id: null, name }));

  const state = {
    choices: {},
    enabled: new Set(productEntries.map(entry => entry.name)),
    oneOffs: [],
    extras: new Set(),
    notes: ''
  };
  for (const choice of Object.values(routine.choices ?? {})) {
    state.choices[choice.id] = choice.default;
  }

  for (const choice of Object.values(routine.choices ?? {})) {
    const wrap = root.createElement('div');
    wrap.className = 'skincare-choice';
    const label = root.createElement('p');
    label.className = 'metric-caption';
    label.textContent = choice.label;
    wrap.append(label);
    for (const option of choice.options) {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'skincare-chip';
      if (state.choices[choice.id] === option) button.dataset.active = 'true';
      button.textContent = option;
      button.addEventListener('click', () => {
        state.choices[choice.id] = option;
        for (const child of [...wrap.children]) {
          if (child.type === 'button' || child.tagName === 'BUTTON') {
            if (child === button) child.dataset.active = 'true';
            else delete child.dataset.active;
          }
        }
      });
      wrap.append(button);
    }
    card.append(wrap);
  }

  const list = root.createElement('div');
  list.className = 'skincare-products skincare-products--pills';
  function renderProductChips() {
    list.replaceChildren();
    const entries = [
      ...productEntries,
      ...state.oneOffs.map(name => ({ id: null, name }))
    ];
    for (const { id, name: product } of entries) {
      const wrap = root.createElement('div');
      wrap.className = 'skincare-product-pill';
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'skincare-chip';
      if (state.enabled.has(product)) button.dataset.active = 'true';
      button.textContent = product;
      button.addEventListener('click', () => {
        if (state.enabled.has(product)) {
          state.enabled.delete(product);
          delete button.dataset.active;
        } else {
          state.enabled.add(product);
          button.dataset.active = 'true';
        }
      });
      wrap.append(button);

      if (!state.oneOffs.includes(product)) {
        const menu = root.createElement('button');
        menu.type = 'button';
        menu.className = 'skincare-product-pill__menu';
        menu.setAttribute('aria-label', `Remove ${product} from routine`);
        menu.textContent = '⋯';
        menu.addEventListener('click', event => {
          event.stopPropagation();
          if (id) onRemoveFromRoutine?.({ routine: key, productId: id });
        });
        wrap.append(menu);
      }
      list.append(wrap);
    }
  }
  renderProductChips();
  card.append(list);

  const add = root.createElement('div');
  add.className = 'skincare-add';
  const addButton = root.createElement('button');
  addButton.type = 'button';
  addButton.className = 'skincare-chip';
  addButton.textContent = '+ Add';
  addButton.addEventListener('click', () => {
    const name = root.createElement('input');
    name.type = 'text';
    name.placeholder = 'Product name';
    name.setAttribute('aria-label', 'Product name');

    let keepInRoutine = true;
    const keep = root.createElement('button');
    keep.type = 'button';
    keep.className = 'skincare-chip';
    keep.dataset.active = 'true';
    keep.setAttribute('aria-pressed', 'true');
    keep.textContent = 'Keep in routine';
    keep.addEventListener('click', () => {
      keepInRoutine = !keepInRoutine;
      if (keepInRoutine) keep.dataset.active = 'true';
      else delete keep.dataset.active;
      keep.setAttribute('aria-pressed', String(keepInRoutine));
    });

    const confirm = root.createElement('button');
    confirm.type = 'button';
    confirm.className = 'skincare-chip';
    confirm.textContent = 'Add product';
    confirm.addEventListener('click', () => {
      const product = name.value.trim();
      if (!product) return;
      if (productEntries.some(entry => entry.name === product) || routine.products?.includes(product)) {
        state.enabled.add(product);
        renderProductChips();
        return;
      }
      // Always create a selected draft pill first so Log can include it
      // before a Keep write finishes (and so Keep failure does not clear it).
      if (!state.oneOffs.includes(product)) {
        state.oneOffs.push(product);
        state.enabled.add(product);
        renderProductChips();
      }
      onCreateProduct?.({ routine: key, name: product, keep: keepInRoutine });
    });
    add.replaceChildren(name, keep, confirm);
  });
  add.append(addButton);
  card.append(add);

  if (model.routines.extras?.length) {
    const extras = root.createElement('div');
    extras.className = 'skincare-extras';
    const label = root.createElement('p');
    label.className = 'metric-caption';
    label.textContent = 'Occasional extras';
    extras.append(label);
    for (const extra of model.routines.extras) {
      const chip = root.createElement('button');
      chip.type = 'button';
      chip.className = 'skincare-chip';
      chip.textContent = `+ ${extra}`;
      chip.addEventListener('click', () => {
        if (state.extras.has(extra)) {
          state.extras.delete(extra);
          delete chip.dataset.active;
        } else {
          state.extras.add(extra);
          chip.dataset.active = 'true';
        }
      });
      extras.append(chip);
    }
    card.append(extras);
  }

  const notesWrap = root.createElement('div');
  notesWrap.className = 'skincare-notes';
  const notesLabel = root.createElement('p');
  notesLabel.className = 'metric-caption';
  notesLabel.textContent = 'Notes';
  const notes = root.createElement('textarea');
  notes.rows = 2;
  notes.placeholder = 'How does skin feel?';
  notes.addEventListener('input', () => { state.notes = notes.value; });
  notesWrap.append(notesLabel, notes);

  const chips = root.createElement('div');
  chips.className = 'skincare-note-chips';
  for (const chipText of model.routines.note_chips ?? []) {
    const chip = root.createElement('button');
    chip.type = 'button';
    chip.className = 'skincare-chip';
    chip.textContent = chipText;
    chip.addEventListener('click', () => {
      state.notes = appendNoteChip(state.notes, chipText);
      notes.value = state.notes;
    });
    chips.append(chip);
  }
  notesWrap.append(chips);
  card.append(notesWrap);

  const done = root.createElement('button');
  done.type = 'button';
  done.className = 'skincare-done';
  done.textContent = already ? 'Log again' : 'Log';
  done.addEventListener('click', () => {
    const products = buildProductList(key, {
      choiceSelections: state.choices,
      enabledProducts: [...state.enabled],
      extras: [...state.extras],
      activeProducts: routine.products,
      oneOffs: state.oneOffs
    });
    onLogRoutine?.({
      routine: key,
      products,
      notes: state.notes,
      payload: toSkincareConfirmPayload({
        date: model.date,
        routine: key,
        products,
        notes: state.notes,
        slug: key
      })
    });
  });
  card.append(done);
  return card;
}

function renderProcedureCard(root, host, model, onLogProcedure) {
  host.replaceChildren();
  const title = root.createElement('p');
  title.className = 'metric-label';
  title.textContent = 'Other / procedure';
  host.append(title);

  const name = root.createElement('input');
  name.type = 'text';
  name.placeholder = 'Laser, clinic, mask night…';
  name.className = 'skincare-procedure-title';
  host.append(name);

  const notes = root.createElement('textarea');
  notes.rows = 2;
  notes.placeholder = 'What happened / aftercare';
  host.append(notes);

  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'skincare-done';
  button.textContent = 'Log procedure';
  button.addEventListener('click', () => {
    const procedureTitle = name.value.trim() || 'procedure';
    const routine = model.currentRoutine === 'am' ? 'am' : 'pm';
    onLogProcedure?.({
      payload: toSkincareConfirmPayload({
        date: model.date,
        routine,
        products: [procedureTitle],
        notes: notes.value.trim(),
        procedureTitle,
        slug: undefined
      })
    });
  });
  host.append(button);
}

export { SKINCARE_ROUTINES, currentRoutineKey };

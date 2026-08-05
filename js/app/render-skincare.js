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

export function renderSkincare(root, model, { onLogRoutine, onLogProcedure } = {}) {
  const dashboard = root.querySelector('#skincare-dashboard');
  if (!dashboard) return;

  setText(root, '[data-skincare="date"]', model.date);
  const host = root.querySelector('#skincare-routine-cards');
  if (host) {
    host.replaceChildren();
    for (const key of ['am', 'pm']) {
      host.append(renderRoutineCard(root, key, model, onLogRoutine));
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
      for (const item of model.procedures) {
        const row = root.createElement('p');
        row.className = 'metric-caption';
        row.textContent = item.notes || 'Procedure logged';
        logged.append(row);
      }
    }
  }

  dashboard.removeAttribute('hidden');
}

function renderRoutineCard(root, key, model, onLogRoutine) {
  const routine = model.routines[key];
  const card = root.createElement('article');
  card.className = 'metric-card skincare-card';
  if (model.currentRoutine === key) card.dataset.current = 'true';
  card.dataset.routine = key;

  const heading = root.createElement('p');
  heading.className = 'metric-label';
  heading.textContent = `${routine.label} · ${routine.duration_hint}`;
  card.append(heading);

  const status = root.createElement('p');
  status.className = 'metric-caption skincare-card__status';
  const already = key === 'am' ? model.amLogged : model.pmLogged;
  status.textContent = already ? 'Logged today' : (model.currentRoutine === key ? 'Up next' : 'Waiting');
  card.append(status);

  const state = {
    choices: {},
    enabled: new Set(routine.products),
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
  list.className = 'skincare-products';
  for (const product of routine.products) {
    const row = root.createElement('label');
    row.className = 'skincare-product';
    const box = root.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => {
      if (box.checked) state.enabled.add(product);
      else state.enabled.delete(product);
    });
    const name = root.createElement('span');
    name.textContent = product;
    row.append(box, name);
    list.append(row);
  }
  card.append(list);

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
  done.textContent = already ? 'Log again' : 'Done';
  done.addEventListener('click', () => {
    const products = buildProductList(key, {
      choiceSelections: state.choices,
      enabledProducts: [...state.enabled],
      extras: [...state.extras]
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

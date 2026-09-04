import {
  createMorphingNotePopover,
  createMorphingPopover
} from '../../../../packages/design-kit/js/morphing-popover.js';
import {
  SKINCARE_ROUTINES,
  appendNoteChip,
  buildProductList,
  currentRoutineKey,
  toSkincareConfirmPayload
} from './skincare-routines-data.js';
import { groupProductsByCategory, searchProductLibrary } from './skincare-product-library.js';
import { formatDisplayDate } from '../core/time.js';

function setText(root, selector, value) {
  const el = root.querySelector(selector);
  if (el) el.textContent = String(value);
}

function prefersReducedMotion(root) {
  return root.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/** Prior user pick on the persistent track; otherwise null → clock / model.currentRoutine. */
function readDrawerSelection(track, segment) {
  if (track?.dataset?.userPicked === 'true') {
    const fromTrack = track.dataset.active;
    if (fromTrack === 'am' || fromTrack === 'pm') return fromTrack;
    const selectedTab = [...(segment?.querySelectorAll?.('[data-routine]') ?? [])]
      .find(tab => tab.getAttribute?.('aria-selected') === 'true');
    const fromTab = selectedTab?.dataset?.routine;
    if (fromTab === 'am' || fromTab === 'pm') return fromTab;
  }
  return null;
}

function resolveDrawerRoutine(track, segment, modelCurrent) {
  return readDrawerSelection(track, segment)
    ?? (modelCurrent === 'am' ? 'am' : 'pm');
}

function setBeautyDrawerActive(segment, track, activeKey, {
  reducedMotion = false,
  userPicked = false
} = {}) {
  const active = activeKey === 'am' ? 'am' : 'pm';
  if (track) {
    track.dataset.active = active;
    if (userPicked) track.dataset.userPicked = 'true';
    if (reducedMotion) track.dataset.reducedMotion = 'true';
    else delete track.dataset.reducedMotion;
    if (!String(track.className || '').includes('skincare-drawer-track')) {
      track.className = `${track.className || ''} skincare-drawer-track`.trim();
    }
  }
  const tabs = segment?.querySelectorAll?.('[data-routine]') ?? [];
  for (const tab of tabs) {
    const selected = tab.dataset.routine === active;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) tab.dataset.active = 'true';
    else delete tab.dataset.active;
  }
}

function wireBeautyDrawer(root, segment, track, modelCurrent) {
  if (!track) return modelCurrent === 'am' ? 'am' : 'pm';
  const reducedMotion = prefersReducedMotion(root);
  const active = resolveDrawerRoutine(track, segment, modelCurrent);
  setBeautyDrawerActive(segment, track, active, { reducedMotion });

  if (!segment || segment.dataset.drawerWired === 'true') return active;
  segment.dataset.drawerWired = 'true';

  const tabs = segment.querySelectorAll?.('[data-routine]') ?? [];
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const next = tab.dataset.routine === 'am' ? 'am' : 'pm';
      setBeautyDrawerActive(segment, track, next, {
        reducedMotion: prefersReducedMotion(root),
        userPicked: true
      });
    });
  }
  return active;
}

export function renderSkincare(root, model, {
  onLogRoutine,
  onLogProcedure,
  onRemoveFromRoutine,
  onAddFromLibrary,
  onCreateProduct,
  library = null
} = {}) {
  const dashboard = root.querySelector('#skincare-dashboard');
  if (!dashboard) return;

  setText(root, '[data-skincare="date"]', formatDisplayDate(model.date));
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
      tile.title = formatDisplayDate(day.date);
      heatmap.append(tile);
    }
  }

  const host = root.querySelector('#skincare-routine-cards');
  const segment = root.querySelector('#skincare-routine-segment');
  if (host) {
    host.replaceChildren();
    for (const key of ['am', 'pm']) {
      host.append(renderRoutineCard(root, key, model, {
        onLogRoutine,
        onRemoveFromRoutine,
        onAddFromLibrary,
        onCreateProduct,
        library
      }));
    }
    wireBeautyDrawer(root, segment, host, model.currentRoutine);
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
  onCreateProduct,
  library = null
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
  list.className = 'skincare-product-groups';
  let openMenuWrap = null;

  function closeOpenMenu() {
    if (!openMenuWrap) return;
    openMenuWrap.replaceChildren(
      ...[...openMenuWrap.children].filter(child => child.className !== 'skincare-product-pill__menu-panel')
    );
    openMenuWrap = null;
  }

  function renderProductChips() {
    closeOpenMenu();
    list.replaceChildren();
    const entries = [
      ...productEntries,
      ...state.oneOffs.map(name => ({ id: null, name, category: 'Other', hint: '' }))
    ];
    const groups = groupProductsByCategory(entries);

    for (const group of groups) {
      const section = root.createElement('div');
      section.className = 'skincare-product-group';
      const label = root.createElement('p');
      label.className = 'metric-caption skincare-product-group__label';
      label.textContent = group.category;
      section.append(label);

      const pills = root.createElement('div');
      pills.className = 'skincare-products skincare-products--pills';

      for (const { id, name: product, hint } of group.products) {
        const wrap = root.createElement('div');
        wrap.className = 'skincare-product-pill';
        const row = root.createElement('div');
        row.className = 'skincare-product-pill__row';
        const button = root.createElement('button');
        button.type = 'button';
        button.className = 'skincare-chip';
        if (state.enabled.has(product)) button.dataset.active = 'true';
        button.textContent = product;
        button.addEventListener('click', () => {
          closeOpenMenu();
          if (state.enabled.has(product)) {
            state.enabled.delete(product);
            delete button.dataset.active;
          } else {
            state.enabled.add(product);
            button.dataset.active = 'true';
          }
        });
        row.append(button);

        if (id && !state.oneOffs.includes(product)) {
          const menu = root.createElement('button');
          menu.type = 'button';
          menu.className = 'skincare-product-pill__menu';
          menu.setAttribute('aria-label', `Options for ${product}`);
          menu.setAttribute('aria-haspopup', 'true');
          menu.textContent = '⋯';
          menu.addEventListener('click', event => {
            event.stopPropagation();
            if (openMenuWrap === wrap) {
              closeOpenMenu();
              return;
            }
            closeOpenMenu();
            const panel = root.createElement('div');
            panel.className = 'skincare-product-pill__menu-panel';
            panel.setAttribute('role', 'menu');
            const removeAction = root.createElement('button');
            removeAction.type = 'button';
            removeAction.className = 'skincare-product-pill__menu-action';
            removeAction.setAttribute('role', 'menuitem');
            removeAction.textContent = 'Remove from routine';
            removeAction.addEventListener('click', event2 => {
              event2.stopPropagation();
              closeOpenMenu();
              onRemoveFromRoutine?.({ routine: key, productId: id });
            });
            panel.append(removeAction);
            wrap.append(panel);
            openMenuWrap = wrap;
          });
          row.append(menu);
        }
        wrap.append(row);

        if (hint) {
          const hintEl = root.createElement('span');
          hintEl.className = 'skincare-product-pill__hint';
          hintEl.textContent = hint;
          wrap.append(hintEl);
        }
        pills.append(wrap);
      }
      section.append(pills);
      list.append(section);
    }
  }
  renderProductChips();
  card.append(list);

  function draftSelectProduct(name) {
    if (
      !productEntries.some(entry => entry.name === name)
      && !(routine.products ?? []).includes(name)
      && !state.oneOffs.includes(name)
    ) {
      state.oneOffs.push(name);
    }
    state.enabled.add(name);
    renderProductChips();
  }

  const add = root.createElement('div');
  add.className = 'skincare-add';
  const addButton = root.createElement('button');
  addButton.type = 'button';
  addButton.className = 'skincare-chip';
  addButton.textContent = '+ Add';

  function resetAdd() {
    add.replaceChildren(addButton);
  }

  function showAddChooser() {
    const fromLibrary = root.createElement('button');
    fromLibrary.type = 'button';
    fromLibrary.className = 'skincare-chip';
    fromLibrary.textContent = 'From library';
    fromLibrary.addEventListener('click', () => showFromLibrary());

    const newOneOff = root.createElement('button');
    newOneOff.type = 'button';
    newOneOff.className = 'skincare-chip';
    newOneOff.textContent = 'New / one-off…';
    newOneOff.addEventListener('click', () => showNewOneOff());

    add.replaceChildren(fromLibrary, newOneOff);
  }

  function showFromLibrary() {
    const onRoutine = new Set(
      productEntries.map(entry => entry.id).filter(Boolean)
    );
    const available = (library?.products ?? []).filter(product => !onRoutine.has(product.id));
    const panel = root.createElement('div');
    panel.className = 'skincare-add__panel skincare-add__panel--library';

    if (!available.length) {
      const empty = root.createElement('p');
      empty.className = 'metric-caption skincare-add__empty';
      empty.textContent = 'Nothing left on the shelf — create a product.';
      const actions = root.createElement('div');
      actions.className = 'skincare-add__actions';
      const back = root.createElement('button');
      back.type = 'button';
      back.className = 'skincare-chip';
      back.textContent = 'Back';
      back.addEventListener('click', () => showAddChooser());
      const create = root.createElement('button');
      create.type = 'button';
      create.className = 'skincare-chip';
      create.dataset.active = 'true';
      create.textContent = 'Create a product';
      create.addEventListener('click', () => showNewOneOff());
      actions.append(back, create);
      panel.append(empty, actions);
      add.replaceChildren(panel);
      return;
    }

    const selected = new Set();
    for (const product of available) {
      const row = root.createElement('label');
      row.className = 'skincare-add__option';
      const checkbox = root.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.productId = product.id;
      checkbox.setAttribute('aria-label', product.name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(product.id);
        else selected.delete(product.id);
      });
      const name = root.createElement('span');
      name.textContent = product.name;
      row.append(checkbox, name);
      panel.append(row);
    }

    const confirm = root.createElement('button');
    confirm.type = 'button';
    confirm.className = 'skincare-chip';
    confirm.textContent = 'Add selected';
    confirm.addEventListener('click', () => {
      const productIds = [...selected];
      if (!productIds.length) return;
      for (const id of productIds) {
        const match = available.find(product => product.id === id);
        if (match) draftSelectProduct(match.name);
      }
      onAddFromLibrary?.({ routine: key, productIds });
      resetAdd();
    });
    panel.append(confirm);
    add.replaceChildren(panel);
  }

  function showNewOneOff() {
    const panel = root.createElement('div');
    panel.className = 'skincare-add__panel skincare-add__panel--new';

    const name = root.createElement('input');
    name.type = 'text';
    name.placeholder = 'Product name';
    name.setAttribute('aria-label', 'Product name');

    const matchesHost = root.createElement('div');
    matchesHost.className = 'skincare-add__matches';

    function renderMatches() {
      matchesHost.replaceChildren();
      const matches = searchProductLibrary(library, name.value);
      for (const match of matches) {
        const button = root.createElement('button');
        button.type = 'button';
        button.className = 'skincare-chip skincare-add__match';
        button.textContent = match.name;
        button.addEventListener('click', () => {
          draftSelectProduct(match.name);
          onAddFromLibrary?.({ routine: key, productIds: [match.id] });
          resetAdd();
        });
        matchesHost.append(button);
      }
    }

    name.addEventListener('input', renderMatches);

    const keepCreate = root.createElement('button');
    keepCreate.type = 'button';
    keepCreate.className = 'skincare-chip';
    keepCreate.dataset.active = 'true';
    keepCreate.textContent = 'Add to library + routine';
    keepCreate.addEventListener('click', () => {
      const product = name.value.trim();
      if (!product) return;
      if (
        productEntries.some(entry => entry.name === product)
        || (routine.products ?? []).includes(product)
      ) {
        state.enabled.add(product);
        renderProductChips();
        resetAdd();
        return;
      }
      draftSelectProduct(product);
      onCreateProduct?.({ routine: key, name: product, keep: true });
      resetAdd();
    });

    const justOnce = root.createElement('button');
    justOnce.type = 'button';
    justOnce.className = 'skincare-chip';
    justOnce.textContent = 'Just this time';
    justOnce.addEventListener('click', () => {
      const product = name.value.trim();
      if (!product) return;
      if (
        productEntries.some(entry => entry.name === product)
        || (routine.products ?? []).includes(product)
      ) {
        state.enabled.add(product);
        renderProductChips();
        resetAdd();
        return;
      }
      draftSelectProduct(product);
      onCreateProduct?.({ routine: key, name: product, keep: false });
      resetAdd();
    });

    const actions = root.createElement('div');
    actions.className = 'skincare-add__actions';
    actions.append(keepCreate, justOnce);

    panel.append(name, matchesHost, actions);
    add.replaceChildren(panel);
  }

  addButton.addEventListener('click', () => {
    closeOpenMenu();
    showAddChooser();
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

  const notesPopover = createMorphingNotePopover({
    root,
    label: String(state.notes ?? '').trim() ? 'Notes' : 'Add a note',
    title: 'Notes',
    supporting: 'How does skin feel?',
    placeholder: 'How does skin feel?',
    value: state.notes,
    rows: 2,
    className: 'skincare-notes',
    layoutId: `skincare-notes-${key}`,
    onChange: value => { state.notes = value; },
    extra(body, _api, refs) {
      const chips = root.createElement('div');
      chips.className = 'skincare-note-chips';
      for (const chipText of model.routines.note_chips ?? []) {
        const chip = root.createElement('button');
        chip.type = 'button';
        chip.className = 'skincare-chip';
        chip.textContent = chipText;
        chip.addEventListener('click', () => {
          state.notes = appendNoteChip(state.notes, chipText);
          if (refs?.textarea) refs.textarea.value = state.notes;
        });
        chips.append(chip);
      }
      body.append(chips);
    }
  });
  card.append(notesPopover.el);

  const done = root.createElement('button');
  done.type = 'button';
  done.className = 'skincare-done';
  done.textContent = already ? 'Log again' : 'Log';
  done.addEventListener('click', async () => {
    if (done.disabled) return;
    const priorLabel = done.textContent;
    done.disabled = true;
    done.textContent = 'Logging…';
    const products = buildProductList(key, {
      choiceSelections: state.choices,
      enabledProducts: [...state.enabled],
      extras: [...state.extras],
      activeProducts: routine.products,
      oneOffs: state.oneOffs
    });
    try {
      await onLogRoutine?.({
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
    } catch {
      done.textContent = priorLabel;
      done.disabled = false;
    }
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

  const popover = createMorphingPopover({
    root,
    triggerLabel: 'Log a procedure',
    title: 'Other / procedure',
    supporting: 'Clinic visit, laser, mask night…',
    layoutId: 'skincare-procedure',
    triggerClass: 'btn btn--ghost',
    renderContent(body, api) {
      const name = root.createElement('input');
      name.type = 'text';
      name.placeholder = 'Laser, clinic, mask night…';
      name.className = 'skincare-procedure-title';
      name.setAttribute?.('aria-label', 'Procedure');

      const notes = root.createElement('textarea');
      notes.className = 'morphing-popover__note';
      notes.rows = 2;
      notes.placeholder = 'What happened / aftercare';
      notes.setAttribute?.('aria-label', 'Procedure notes');

      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'skincare-done';
      button.textContent = 'Log procedure';
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const priorLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Logging…';
        const procedureTitle = name.value.trim() || 'procedure';
        const routine = model.currentRoutine === 'am' ? 'am' : 'pm';
        try {
          await onLogProcedure?.({
            payload: toSkincareConfirmPayload({
              date: model.date,
              routine,
              products: [procedureTitle],
              notes: notes.value.trim(),
              procedureTitle,
              slug: undefined
            })
          });
          api.close();
        } catch {
          button.textContent = priorLabel;
          button.disabled = false;
        }
      });
      body.append(name, notes, button);
    }
  });
  host.append(popover.el);
}

export { SKINCARE_ROUTINES, currentRoutineKey };

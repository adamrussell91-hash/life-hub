import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSkincare } from '../../js/app/render-skincare.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this._textContent = '';
    this.children = [];
    this.hidden = false;
    this._listeners = {};
    this.value = '';
    this.type = '';
    this.checked = false;
  }

  set textContent(value) {
    this._textContent = value;
    this.children = [];
  }

  get textContent() {
    if (this.children.length) return this.children.map(child => child.textContent).join('');
    return this._textContent;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  addEventListener(type, handler) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }

  click(event = {}) {
    for (const handler of this._listeners.click ?? []) {
      handler({ stopPropagation: () => {}, ...event, target: this, currentTarget: this });
    }
  }

  dispatch(type, event = {}) {
    for (const handler of this._listeners[type] ?? []) {
      handler({ stopPropagation: () => {}, preventDefault: () => {}, ...event, target: this, currentTarget: this });
    }
  }

  setAttribute(name, value = '') {
    this.attributes[name] = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'type') this.type = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden') this.hidden = false;
  }

  querySelector() {
    return null;
  }
}

function descendants(element) {
  return element.children.flatMap(child => [child, ...descendants(child)]);
}

function findDescendant(root, predicate) {
  return descendants(root).find(predicate) ?? null;
}

function countProductPills(card, productName) {
  return descendants(card).filter(node =>
    node.tagName === 'button'
    && node.className === 'skincare-chip'
    && node.textContent === productName
  ).length;
}

function openNewOneOff(card) {
  const addButton = findDescendant(card, node =>
    node.tagName === 'button' && node.textContent === '+ Add'
  );
  assert.ok(addButton, '+ Add control should exist');
  addButton.click();

  const newPath = findDescendant(card, node =>
    node.tagName === 'button' && node.textContent === 'New / one-off…'
  );
  assert.ok(newPath, 'New / one-off path should appear');
  newPath.click();

  const nameInput = findDescendant(card, node =>
    node.tagName === 'input' && node.type !== 'checkbox'
  );
  assert.ok(nameInput, 'product name input should appear');
  return nameInput;
}

function addProductViaUi(card, { name, keepInRoutine = true }) {
  const nameInput = openNewOneOff(card);
  nameInput.value = name;
  nameInput.dispatch('input');

  const confirmLabel = keepInRoutine ? 'Add to library + routine' : 'Just this time';
  const confirm = findDescendant(card, node =>
    node.tagName === 'button' && node.textContent === confirmLabel
  );
  assert.ok(confirm, `${confirmLabel} should exist`);
  confirm.click();
}

function libraryFixture(products) {
  return { schema_version: 1, products };
}

function amRoutineWithEntries(entries) {
  return {
    ...SKINCARE_ROUTINES,
    am: {
      ...SKINCARE_ROUTINES.am,
      products: entries.map(entry => entry.name),
      productEntries: entries
    }
  };
}

function monthHeatmapFixture() {
  const states = ['miss', 'am', 'pm', 'both'];
  return Array.from({ length: 30 }, (_, i) => ({
    date: `2026-07-${String(i + 7).padStart(2, '0')}`,
    state: states[i % states.length],
    isToday: i === 29
  }));
}

function baseModel(overrides = {}) {
  return {
    date: '2026-08-05',
    currentRoutine: 'pm',
    routines: SKINCARE_ROUTINES,
    amLogged: false,
    pmLogged: false,
    amRecord: null,
    pmRecord: null,
    procedures: [],
    amStreak: 3,
    pmStreak: 2,
    monthHeatmap: monthHeatmapFixture(),
    ...overrides
  };
}

function fakeSkincareRoot() {
  const dashboard = new FakeElement('section');
  const dateLabel = new FakeElement('p');
  const routineCards = new FakeElement('div');
  const procedureCard = new FakeElement('article');
  const procedureLog = new FakeElement('div');
  const amStreak = new FakeElement('strong');
  const pmStreak = new FakeElement('strong');
  const heatmap = new FakeElement('div');
  const nodes = {
    '#skincare-dashboard': dashboard,
    '[data-skincare="date"]': dateLabel,
    '#skincare-routine-cards': routineCards,
    '#skincare-procedure': procedureCard,
    '#skincare-procedure-log': procedureLog,
    '[data-skincare="am-streak"]': amStreak,
    '[data-skincare="pm-streak"]': pmStreak,
    '#skincare-consistency-heatmap': heatmap
  };
  return {
    createElement: tag => new FakeElement(tag),
    querySelector(selector) {
      return nodes[selector] ?? null;
    },
    _dashboard: dashboard,
    _dateLabel: dateLabel,
    _routineCards: routineCards,
    _procedureCard: procedureCard,
    _procedureLog: procedureLog,
    _amStreak: amStreak,
    _pmStreak: pmStreak,
    _heatmap: heatmap
  };
}

test('renderSkincare sets AM and PM streak numerals from the model', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel({ amStreak: 5, pmStreak: 0 }));

  assert.equal(root._amStreak.textContent, '5');
  assert.equal(root._pmStreak.textContent, '0');
});

test('renderSkincare fills the consistency heatmap with 30 dated tiles carrying data-skincare-state', () => {
  const root = fakeSkincareRoot();
  const monthHeatmap = monthHeatmapFixture();
  renderSkincare(root, baseModel({ monthHeatmap }));

  const tiles = root._heatmap.children;
  assert.equal(tiles.length, 30);
  for (const [index, tile] of tiles.entries()) {
    assert.equal(tile.dataset.skincareState, monthHeatmap[index].state);
    assert.equal(tile.title, monthHeatmap[index].date);
  }
  assert.equal(tiles[29].dataset.today, 'true');
  assert.equal(tiles[0].dataset.today, undefined);
});

test('renderSkincare re-renders the heatmap cleanly on repeated calls', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel());
  renderSkincare(root, baseModel({ monthHeatmap: monthHeatmapFixture().slice(0, 5) }));
  assert.equal(root._heatmap.children.length, 5);
});

test('renderSkincare marks the current routine card with skincare-card--current and a Now chip', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel({ currentRoutine: 'pm' }));

  const [amCard, pmCard] = root._routineCards.children;
  assert.equal(amCard.className.includes('skincare-card--current'), false);
  assert.equal(amCard.textContent.includes('Now'), false);
  assert.equal(pmCard.className.includes('skincare-card--current'), true);
  assert.match(pmCard.textContent, /Now/);
});

test('renderSkincare groups products by category with Sunscreen separate from Other', () => {
  const root = fakeSkincareRoot();
  const routines = amRoutineWithEntries([
    { id: 'gel', name: 'Korres Greek Yoghurt Probiotic Gel Cream', category: 'Moisturiser' },
    { id: 'spf', name: 'La Roche Posay Anthelios SPF 50+', category: 'Sunscreen' },
    { id: 'powder', name: 'Kosas Cloud Set', category: 'Makeup' }
  ]);
  renderSkincare(root, baseModel({ routines }));

  const amCard = root._routineCards.children[0];
  const labels = descendants(amCard)
    .filter(node => node.className === 'metric-caption skincare-product-group__label')
    .map(node => node.textContent);
  assert.deepEqual(labels, ['Moisturiser', 'Sunscreen', 'Makeup']);
});

test('renderSkincare renders routine products as selectable pills with add and remove controls', () => {
  const root = fakeSkincareRoot();
  const routines = {
    ...SKINCARE_ROUTINES,
    am: {
      ...SKINCARE_ROUTINES.am,
      products: ['Catalog serum'],
      productEntries: [{ id: 'catalog-serum', name: 'Catalog serum' }]
    },
    pm: {
      ...SKINCARE_ROUTINES.pm,
      products: ['Fallback cleanser'],
      productEntries: [{ id: null, name: 'Fallback cleanser' }]
    }
  };
  renderSkincare(root, baseModel({ routines }));

  const routineCards = root._routineCards.children;
  const controls = routineCards.flatMap(descendants);

  assert.equal(
    controls.some(control => control.tagName === 'input' && control.type === 'checkbox'),
    false,
    'routine cards should not use checkbox controls'
  );
  assert.ok(controls.some(control =>
    control.tagName === 'button'
    && control.className === 'skincare-chip'
    && control.textContent === 'Catalog serum'
  ));
  assert.ok(controls.some(control => control.tagName === 'button' && control.textContent === '+ Add'));
  assert.ok(controls.some(control =>
    control.className === 'skincare-product-pill__menu'
    && control.attributes['aria-label']?.includes('Options for Catalog serum')
  ));
  assert.equal(
    controls.some(control =>
      control.className === 'skincare-product-pill__menu'
      && control.attributes['aria-label']?.includes('Fallback cleanser')
    ),
    false,
    '⋯ menu should be hidden for products without an id'
  );
});

test('renderSkincare labels routine actions Log or Log again', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel({ amLogged: false, pmLogged: true }));

  const [amCard, pmCard] = root._routineCards.children;
  assert.ok(descendants(amCard).some(control => control.className === 'skincare-done' && control.textContent === 'Log'));
  assert.ok(descendants(pmCard).some(control => control.className === 'skincare-done' && control.textContent === 'Log again'));
});

test('renderSkincare renders logged procedures as a compact ul/li list', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel({
    procedures: [
      { path: 'a', notes: 'Procedure: Laser. Mild redness', products: ['Laser'] },
      { path: 'b', notes: 'Procedure: Mask night', products: [] }
    ]
  }));

  const [list] = root._procedureLog.children;
  assert.equal(list.tagName, 'ul');
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].tagName, 'li');
  assert.match(list.children[0].textContent, /Laser/);
  assert.match(list.children[1].textContent, /Mask night/);
});

test('renderSkincare shows an empty caption (not a list) when no procedures are logged', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel({ procedures: [] }));

  assert.equal(root._procedureLog.children.length, 1);
  const [empty] = root._procedureLog.children;
  assert.equal(empty.tagName, 'p');
  assert.match(empty.textContent, /No procedures logged today\./);
});

test('adding an existing routine product as one-off does not duplicate the pill', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel());

  const [, pmCard] = root._routineCards.children;
  const existingProduct = SKINCARE_ROUTINES.pm.products[0];
  const initialCount = countProductPills(pmCard, existingProduct);

  addProductViaUi(pmCard, { name: existingProduct, keepInRoutine: false });

  assert.equal(
    countProductPills(pmCard, existingProduct),
    initialCount,
    'existing routine product should not render a second pill when added as one-off'
  );
});

test('adding an existing routine product via New / one-off does not call onCreateProduct', () => {
  const root = fakeSkincareRoot();
  const addCalls = [];
  renderSkincare(root, baseModel(), {
    onCreateProduct: payload => addCalls.push(payload)
  });

  const [, pmCard] = root._routineCards.children;
  const existingProduct = SKINCARE_ROUTINES.pm.products[0];

  addProductViaUi(pmCard, { name: existingProduct, keepInRoutine: true });

  assert.equal(addCalls.length, 0, 'onCreateProduct should be skipped for an existing routine product');
  const chip = findDescendant(pmCard, node =>
    node.tagName === 'button'
    && node.className === 'skincare-chip'
    && node.textContent === existingProduct
  );
  assert.equal(chip?.dataset.active, 'true', 'existing product pill should be selected');
});

test('Add to library + routine creates a selected draft pill immediately', () => {
  const root = fakeSkincareRoot();
  const addCalls = [];
  renderSkincare(root, baseModel(), {
    onCreateProduct: payload => addCalls.push(payload)
  });

  const [, pmCard] = root._routineCards.children;
  const product = 'Brand New Night Oil';

  addProductViaUi(pmCard, { name: product, keepInRoutine: true });

  assert.deepEqual(addCalls, [{ routine: 'pm', name: product, keep: true }]);
  assert.equal(countProductPills(pmCard, product), 1);
  const chip = findDescendant(pmCard, node =>
    node.tagName === 'button'
    && node.className === 'skincare-chip'
    && node.textContent === product
  );
  assert.equal(chip?.dataset.active, 'true');
});

test('⋯ opens menu with Remove from routine and does not call remove until chosen', () => {
  const root = fakeSkincareRoot();
  const removeCalls = [];
  const routines = amRoutineWithEntries([
    { id: 'catalog-serum', name: 'Catalog serum' }
  ]);
  renderSkincare(root, baseModel({ routines }), {
    onRemoveFromRoutine: payload => removeCalls.push(payload)
  });

  const [amCard] = root._routineCards.children;
  const menuButton = findDescendant(amCard, node =>
    node.className === 'skincare-product-pill__menu'
    && node.attributes['aria-label']?.includes('Options for Catalog serum')
  );
  assert.ok(menuButton, '⋯ menu trigger should exist');

  menuButton.click();
  assert.equal(removeCalls.length, 0, '⋯ click alone should not remove');

  const panel = findDescendant(amCard, node =>
    node.className === 'skincare-product-pill__menu-panel'
  );
  assert.ok(panel, 'menu panel should open');
  const removeAction = findDescendant(panel, node =>
    node.tagName === 'button' && node.textContent === 'Remove from routine'
  );
  assert.ok(removeAction, 'Remove from routine action should be present');

  // Real DOM Node.children is an HTMLCollection (no .filter). Mimic that so
  // closeOpenMenu cannot rely on Array.prototype methods on children.
  const pill = findDescendant(amCard, node =>
    node.className === 'skincare-product-pill'
    && node.children.some?.(child => child === panel)
  ) || findDescendant(amCard, node =>
    node.className === 'skincare-product-pill'
    && [...node.children].includes(panel)
  );
  assert.ok(pill, 'product pill wrap should host the menu panel');
  const childNodes = [...pill.children];
  const htmlCollectionLike = {
    length: childNodes.length,
    item(index) { return childNodes[index]; },
    *[Symbol.iterator]() { yield* childNodes; }
  };
  childNodes.forEach((child, index) => { htmlCollectionLike[index] = child; });
  pill.children = htmlCollectionLike;

  removeAction.click();
  assert.deepEqual(removeCalls, [{ routine: 'am', productId: 'catalog-serum' }]);
});

test('+ Add shows From library and New / one-off chooser', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel(), {
    library: libraryFixture([])
  });

  const [, pmCard] = root._routineCards.children;
  const addButton = findDescendant(pmCard, node =>
    node.tagName === 'button' && node.textContent === '+ Add'
  );
  addButton.click();

  assert.ok(findDescendant(pmCard, node =>
    node.tagName === 'button' && node.textContent === 'From library'
  ));
  assert.ok(findDescendant(pmCard, node =>
    node.tagName === 'button' && node.textContent === 'New / one-off…'
  ));
  assert.equal(
    findDescendant(pmCard, node =>
      node.tagName === 'button' && node.textContent === 'Keep in routine'
    ),
    null,
    'Keep in routine toggle should be gone'
  );
});

test('empty From library offers Back and Create a product escape hatches', () => {
  const root = fakeSkincareRoot();
  const routines = amRoutineWithEntries([
    { id: 'product-a', name: 'Product A' }
  ]);
  renderSkincare(root, baseModel({ routines }), {
    library: libraryFixture([
      { id: 'product-a', name: 'Product A', notes: '' }
    ])
  });

  const [amCard] = root._routineCards.children;
  findDescendant(amCard, node => node.tagName === 'button' && node.textContent === '+ Add').click();
  findDescendant(amCard, node => node.tagName === 'button' && node.textContent === 'From library').click();

  assert.match(
    findDescendant(amCard, node => node.className?.includes('skincare-add__empty'))?.textContent ?? '',
    /Nothing left on the shelf/
  );

  const back = findDescendant(amCard, node =>
    node.tagName === 'button' && node.textContent === 'Back'
  );
  assert.ok(back, 'Back should return to chooser');
  back.click();
  assert.ok(findDescendant(amCard, node =>
    node.tagName === 'button' && node.textContent === 'From library'
  ));
  assert.ok(findDescendant(amCard, node =>
    node.tagName === 'button' && node.textContent === 'New / one-off…'
  ));

  findDescendant(amCard, node => node.tagName === 'button' && node.textContent === 'From library').click();
  const create = findDescendant(amCard, node =>
    node.tagName === 'button' && node.textContent === 'Create a product'
  );
  assert.ok(create, 'Create a product should open new/one-off');
  create.click();
  assert.ok(findDescendant(amCard, node =>
    node.tagName === 'input' && node.type !== 'checkbox'
  ), 'new/one-off name input should appear');
  assert.ok(findDescendant(amCard, node =>
    node.tagName === 'button' && node.textContent === 'Just this time'
  ));
});

test('From library lists shelf products not on routine and adds selected', () => {
  const root = fakeSkincareRoot();
  const addCalls = [];
  const routines = amRoutineWithEntries([
    { id: 'product-a', name: 'Product A' }
  ]);
  const library = libraryFixture([
    { id: 'product-a', name: 'Product A', notes: '' },
    { id: 'product-b', name: 'Product B', notes: '' }
  ]);

  renderSkincare(root, baseModel({ routines }), {
    library,
    onAddFromLibrary: payload => addCalls.push(payload)
  });

  const [amCard] = root._routineCards.children;
  findDescendant(amCard, node => node.tagName === 'button' && node.textContent === '+ Add').click();
  findDescendant(amCard, node => node.tagName === 'button' && node.textContent === 'From library').click();

  const checkboxes = descendants(amCard).filter(node =>
    node.tagName === 'input' && node.type === 'checkbox'
  );
  assert.equal(checkboxes.length, 1, 'only products not already on routine should list');
  assert.equal(checkboxes[0].attributes['aria-label'], 'Product B');
  checkboxes[0].checked = true;
  checkboxes[0].dispatch('change');

  const confirm = findDescendant(amCard, node =>
    node.tagName === 'button' && node.textContent === 'Add selected'
  );
  assert.ok(confirm, 'confirm add should exist');
  confirm.click();

  assert.deepEqual(addCalls, [{ routine: 'am', productIds: ['product-b'] }]);
});

test('New / one-off typeahead surfaces library matches', () => {
  const root = fakeSkincareRoot();
  const addCalls = [];
  const library = libraryFixture([
    { id: 'cerave-hydrating', name: 'CeraVe Hydrating Cleanser', notes: '' },
    { id: 'other', name: 'Other Cream', notes: '' }
  ]);

  renderSkincare(root, baseModel(), {
    library,
    onAddFromLibrary: payload => addCalls.push(payload)
  });

  const [, pmCard] = root._routineCards.children;
  const nameInput = openNewOneOff(pmCard);
  nameInput.value = 'cera';
  nameInput.dispatch('input');

  const match = findDescendant(pmCard, node =>
    node.tagName === 'button' && node.textContent.includes('CeraVe Hydrating Cleanser')
  );
  assert.ok(match, 'typeahead should surface library match');
  match.click();

  assert.deepEqual(addCalls, [{ routine: 'pm', productIds: ['cerave-hydrating'] }]);
  assert.equal(countProductPills(pmCard, 'CeraVe Hydrating Cleanser'), 1);
  const chip = findDescendant(pmCard, node =>
    node.tagName === 'button'
    && node.className === 'skincare-chip'
    && node.textContent === 'CeraVe Hydrating Cleanser'
  );
  assert.equal(chip?.dataset.active, 'true');
});

test('Just this time creates one-off without keep create', () => {
  const root = fakeSkincareRoot();
  const createCalls = [];
  renderSkincare(root, baseModel(), {
    library: libraryFixture([]),
    onCreateProduct: payload => createCalls.push(payload)
  });

  const [, pmCard] = root._routineCards.children;
  const product = 'Clinic Sample Serum';
  addProductViaUi(pmCard, { name: product, keepInRoutine: false });

  assert.equal(countProductPills(pmCard, product), 1);
  const chip = findDescendant(pmCard, node =>
    node.tagName === 'button'
    && node.className === 'skincare-chip'
    && node.textContent === product
  );
  assert.equal(chip?.dataset.active, 'true');
  assert.deepEqual(createCalls, [{ routine: 'pm', name: product, keep: false }]);
  assert.equal(
    createCalls.some(call => call.keep === true),
    false,
    'Just this time must not keep-create into the library'
  );
});

test('index.html leads Skincare with the consistency hero, heatmap, and legend; week-dots strip is gone', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

  const dashboardStart = html.indexOf('id="skincare-dashboard"');
  const heroIndex = html.indexOf('skincare-consistency-card', dashboardStart);
  const routineCardsIndex = html.indexOf('id="skincare-routine-cards"', dashboardStart);
  assert.ok(dashboardStart >= 0, 'skincare-dashboard should exist');
  assert.ok(heroIndex >= 0, 'skincare-consistency-card hero should exist');
  assert.ok(heroIndex < routineCardsIndex, 'consistency hero should render before routine cards');

  assert.match(html, /data-skincare="am-streak"/);
  assert.match(html, /data-skincare="pm-streak"/);
  assert.match(html, /id="skincare-consistency-heatmap"/);
  assert.match(html, /class="heatmap-grid skincare-heatmap"/);

  for (const state of ['both', 'am', 'pm', 'miss']) {
    assert.match(html, new RegExp(`data-state="${state}"`));
  }

  assert.doesNotMatch(html, /skincare-week-dots/);
});

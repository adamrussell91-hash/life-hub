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
      handler({ stopPropagation: () => {}, ...event, target: this });
    }
  }

  setAttribute(name, value = '') {
    this.attributes[name] = String(value);
    if (name === 'hidden') this.hidden = true;
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

function addProductViaUi(card, { name, keepInRoutine = true }) {
  const addButton = findDescendant(card, node =>
    node.tagName === 'button' && node.textContent === '+ Add'
  );
  assert.ok(addButton, '+ Add control should exist');
  addButton.click();

  const nameInput = findDescendant(card, node => node.tagName === 'input');
  assert.ok(nameInput, 'product name input should appear');
  nameInput.value = name;

  if (!keepInRoutine) {
    const keepToggle = findDescendant(card, node =>
      node.tagName === 'button' && node.textContent === 'Keep in routine'
    );
    assert.ok(keepToggle, 'Keep in routine toggle should exist');
    keepToggle.click();
  }

  const confirm = findDescendant(card, node =>
    node.tagName === 'button' && node.textContent === 'Add product'
  );
  assert.ok(confirm, 'Add product confirm should exist');
  confirm.click();
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

test('renderSkincare renders routine products as selectable pills with add and retire controls', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel());

  const routineCards = root._routineCards.children;
  const controls = routineCards.flatMap(descendants);
  const productNames = new Set([
    ...SKINCARE_ROUTINES.am.products,
    ...SKINCARE_ROUTINES.pm.products
  ]);

  assert.equal(
    controls.some(control => control.tagName === 'input' && control.type === 'checkbox'),
    false,
    'routine cards should not use checkbox controls'
  );
  for (const product of productNames) {
    const chip = controls.find(control =>
      control.tagName === 'button'
      && control.className === 'skincare-chip'
      && control.textContent === product
    );
    assert.ok(chip, `${product} should render as a skincare chip`);
  }
  assert.ok(controls.some(control => control.tagName === 'button' && control.textContent === '+ Add'));
  assert.ok(controls.some(control =>
    control.attributes['aria-label']?.includes('Remove')
    && control.attributes['aria-label']?.includes('from rotation')
  ));
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

test('adding an existing routine product with keep in routine does not call onAddProduct', () => {
  const root = fakeSkincareRoot();
  const addCalls = [];
  renderSkincare(root, baseModel(), {
    onAddProduct: payload => addCalls.push(payload)
  });

  const [, pmCard] = root._routineCards.children;
  const existingProduct = SKINCARE_ROUTINES.pm.products[0];

  addProductViaUi(pmCard, { name: existingProduct, keepInRoutine: true });

  assert.equal(addCalls.length, 0, 'onAddProduct should be skipped for an existing routine product');
  const chip = findDescendant(pmCard, node =>
    node.tagName === 'button'
    && node.className === 'skincare-chip'
    && node.textContent === existingProduct
  );
  assert.equal(chip?.dataset.active, 'true', 'existing product pill should be selected');
});

test('keeping a new product creates a selected draft pill immediately', () => {
  const root = fakeSkincareRoot();
  const addCalls = [];
  renderSkincare(root, baseModel(), {
    onAddProduct: payload => addCalls.push(payload)
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

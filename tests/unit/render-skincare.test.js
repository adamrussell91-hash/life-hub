import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSkincare } from '../../js/app/render-skincare.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.children = [];
    this.hidden = false;
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

  addEventListener() {}

  setAttribute(name) {
    if (name === 'hidden') this.hidden = true;
  }

  removeAttribute(name) {
    if (name === 'hidden') this.hidden = false;
  }

  querySelector() {
    return null;
  }
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
    weekDots: [
      { date: '2026-07-30', logged: false, isToday: false },
      { date: '2026-07-31', logged: true, isToday: false },
      { date: '2026-08-01', logged: false, isToday: false },
      { date: '2026-08-02', logged: false, isToday: false },
      { date: '2026-08-03', logged: true, isToday: false },
      { date: '2026-08-04', logged: false, isToday: false },
      { date: '2026-08-05', logged: true, isToday: true }
    ],
    ...overrides
  };
}

function fakeSkincareRoot() {
  const dashboard = new FakeElement('section');
  const dateLabel = new FakeElement('p');
  const routineCards = new FakeElement('div');
  const procedureCard = new FakeElement('article');
  const procedureLog = new FakeElement('div');
  const weekDots = new FakeElement('div');
  const nodes = {
    '#skincare-dashboard': dashboard,
    '[data-skincare="date"]': dateLabel,
    '#skincare-routine-cards': routineCards,
    '#skincare-procedure': procedureCard,
    '#skincare-procedure-log': procedureLog,
    '#skincare-week-dots': weekDots
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
    _weekDots: weekDots
  };
}

test('renderSkincare fills #skincare-week-dots with one dot per day, flagging hits and today', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel());

  const dots = root._weekDots.children;
  assert.equal(dots.length, 7);
  assert.equal(dots[0].dataset.hit, 'false');
  assert.equal(dots[1].dataset.hit, 'true');
  assert.equal(dots[6].dataset.hit, 'true');
  assert.equal(dots[6].dataset.today, 'true');
  assert.equal(dots[0].dataset.today, undefined);
});

test('renderSkincare re-renders week dots cleanly on repeated calls', () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel());
  renderSkincare(root, baseModel({ weekDots: baseModel().weekDots.slice(0, 3) }));
  assert.equal(root._weekDots.children.length, 3);
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

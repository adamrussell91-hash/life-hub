import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountCompactRiver } from '../../packages/design-kit/js/calendar/term-river-rows.js';

function mount(items, capacity = new Map()) {
  const browser = new Window();
  const doc = browser.document;
  const card = doc.createElement('div');
  doc.body.append(card);
  const nodes = new Map();
  const result = mountCompactRiver({ doc, card, lanes: [{ id: 'teacher', label: 'Teacher' }, { id: 'body', label: 'Body' }], grouped: { teacher: items, body: [{ id: 'medical', title: 'Appointment', date: '2026-10-15' }] }, window: { from: '2026-10-12', to: '2026-10-25' }, terms: [], today: '2026-10-14', capacity, nodes });
  return { browser, doc, nodes, ...result };
}

test('eight same-week items remain eight native compact rows with correct shapes and full titles', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `task-${i}`, title: `Full task title ${i}`, date: '2026-10-14', shape: i % 2 ? 'diamond' : 'point' }));
  const { element, nodes, dispose } = mount(items);
  const rows = element.querySelectorAll('[data-lane="teacher"] .tr-rows__item');
  assert.equal(rows.length, 8);
  assert.equal(element.querySelectorAll('.tr-rows__week-heading').length, 2);
  assert.equal(rows[1].querySelector('.is-diamond') !== null, true);
  assert.equal(rows[0].textContent.includes('14/10'), true);
  assert.equal(rows[0].getAttribute('aria-label').includes(items[0].title), true);
  assert.equal(nodes.get('row:task-0'), rows[0]);
  assert.equal(rows[0].tagName, 'BUTTON');
  dispose();
});

test('overlapping spans get separate tracks and proportional positions before event rows', () => {
  const items = [
    { id: 'long', title: 'Project', from: '2026-10-12', to: '2026-10-25', shape: 'bar' },
    { id: 'short', title: 'Trip', from: '2026-10-15', to: '2026-10-18', shape: 'bar' },
    { id: 'after', title: 'Later', from: '2026-10-19', to: '2026-10-20', shape: 'bar' },
    { id: 'point', title: 'Event', date: '2026-10-14' }
  ];
  const { element, dispose } = mount(items);
  const long = element.querySelector('[data-id="long"]');
  const short = element.querySelector('[data-id="short"]');
  assert.equal(long.style.left, '0%');
  assert.equal(long.style.width, '100%');
  assert.ok(Math.abs(parseFloat(short.style.left) - 3 / 14 * 100) < 0.01);
  assert.ok(Math.abs(parseFloat(short.style.width) - 4 / 14 * 100) < 0.01);
  assert.notEqual(long.style.top, short.style.top);
  const lane = element.querySelector('[data-lane="teacher"] .tr-rows__content');
  assert.equal(lane.children[0].className, 'tr-rows__spans');
  assert.equal(lane.children[1].className, 'tr-rows__weeks');
  dispose();
});

test('body appointments sit below capacity and row flags control forecast strokes', () => {
  const capacity = new Map([
    ['2026-10-12', { pct: 70, forecast: false }],
    ['2026-10-13', { pct: 65, forecast: false }],
    ['2026-10-14', { pct: 60, low: 50, high: 70, forecast: true }],
    ['2026-10-15', { pct: 55, low: 40, high: 70, forecast: true }]
  ]);
  const { element, dispose } = mount([], capacity);
  const body = element.querySelector('[data-lane="body"] .tr-rows__content');
  assert.equal(body.children[0].getAttribute('data-part'), 'capacity');
  assert.ok(body.querySelector('.tr-rows__capacity-line.is-forecast').getAttribute('d').includes('L'));
  assert.ok(body.querySelector('.tr-rows__capacity-line.is-logged').getAttribute('d').includes('L'));
  assert.ok(body.querySelector('.tr-rows__capacity-band').getAttribute('d').endsWith('Z'));
  assert.equal(body.querySelector('.tr-rows__soften-label').textContent, '40%');
  assert.equal(body.children[1].querySelector('[data-id="medical"]') !== null, true);
  dispose();
});

test('focus opens the complete title and disposal removes the floating title', () => {
  const title = 'Complete long title '.repeat(80);
  const { doc, element, dispose } = mount([{ id: 'long-title', title, date: '2026-10-14' }]);
  element.querySelector('[data-id="long-title"]').focus();
  assert.equal(doc.querySelector('.tr-rows-tooltip').textContent, title);
  assert.equal(doc.querySelector('.tr-rows-tooltip').hidden, false);
  dispose();
  assert.equal(doc.querySelector('.tr-rows-tooltip'), null);
});

test('long titles scroll once on focus using measured overflow and reset on blur', () => {
  const { element, dispose } = mount([{ id: 'long', title: 'Complete title', date: '2026-10-14' }]);
  const button = element.querySelector('[data-id="long"]');
  Object.defineProperty(button.querySelector('.tr-rows__title'), 'clientWidth', { value: 100 });
  Object.defineProperty(button.querySelector('.tr-rows__title-text'), 'scrollWidth', { value: 340 });
  button.focus();
  assert.equal(button.classList.contains('is-reading-title'), true);
  assert.equal(button.style.getPropertyValue('--tr-title-shift'), '-240px');
  button.blur();
  assert.equal(button.classList.contains('is-reading-title'), false);
  dispose();
});

test('holiday weeks compress to .65 of school weeks while keeping a 200px minimum and shared span scale', () => {
  const browser = new Window();
  const doc = browser.document;
  const card = doc.createElement('div');
  doc.body.append(card);
  const result = mountCompactRiver({ doc, card, lanes: [{ id: 'teacher', label: 'Teacher' }], grouped: { teacher: [{ id: 'hol', title: 'Holiday', shape: 'bar', from: '2026-10-05', to: '2026-10-11' }] }, window: { from: '2026-10-05', to: '2026-10-18', holidayFactor: .65 }, terms: [{ starts_on: '2026-10-12', ends_on: '2026-10-18' }], capacity: new Map(), loads: [{ week: '2026-10-05', booked: 8, capacity: 6, over: true }] });
  const widths = result.element.style.getPropertyValue('--tr-week-columns').split(' ').map(parseFloat);
  assert.ok(Math.abs(widths[0] - 200) < .001);
  assert.ok(Math.abs(widths[0] / widths[1] - .65) < .001);
  assert.ok(Math.abs(parseFloat(result.element.querySelector('[data-id="hol"]').style.width) - 200 / (200 + 200 / .65) * 100) < .001);
  assert.equal(result.element.querySelector('[data-part="weekly-load"] .is-over').textContent, '8h / 6h');
  result.dispose();
});

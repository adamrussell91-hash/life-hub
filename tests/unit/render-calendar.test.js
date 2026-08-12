import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCalendar } from '../../js/app/render-calendar.js';
import { buildCalendarModel } from '../../js/app/calendar-model.js';

function fakeRoot() {
  const store = new Map();
  const doc = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        dataset: {},
        children: [],
        style: {},
        title: '',
        type: '',
        listeners: [],
        append(...nodes) {
          this.children.push(...nodes);
        },
        replaceChildren(...nodes) {
          this.children = [...nodes];
        },
        addEventListener(type, fn) {
          this.listeners.push([type, fn]);
        },
        removeAttribute(name) {
          if (name === 'hidden') this.hidden = false;
        },
        setAttribute(name, value) {
          if (name === 'hidden') this.hidden = true;
          this.attributes ||= {};
          this.attributes[name] = value;
        },
        scrollIntoView() {
          this.scrolled = true;
        }
      };
      return el;
    }
  };
  const byId = {
    'calendar-dashboard': doc.createElement('section'),
    'calendar-week-strip': doc.createElement('div'),
    'calendar-month-grid': doc.createElement('div'),
    'calendar-day-detail': doc.createElement('article')
  };
  byId['calendar-dashboard'].hidden = true;
  const label = doc.createElement('p');
  label.dataset.calendar = 'month-label';
  const prev = doc.createElement('button');
  prev.dataset.calendar = 'prev-month';
  const next = doc.createElement('button');
  next.dataset.calendar = 'next-month';

  return {
    createElement: doc.createElement.bind(doc),
    defaultView: {
      matchMedia: () => ({ matches: false })
    },
    querySelector(selector) {
      if (selector === '#calendar-dashboard') return byId['calendar-dashboard'];
      if (selector === '#calendar-week-strip') return byId['calendar-week-strip'];
      if (selector === '#calendar-month-grid') return byId['calendar-month-grid'];
      if (selector === '#calendar-day-detail') return byId['calendar-day-detail'];
      if (selector === '[data-calendar="month-label"]') return label;
      if (selector === '[data-calendar="prev-month"]') return prev;
      if (selector === '[data-calendar="next-month"]') return next;
      return store.get(selector) ?? null;
    },
    _grid: byId['calendar-month-grid'],
    _detail: byId['calendar-day-detail']
  };
}

test('month shift applies forward/back motion on the grid', () => {
  const root = fakeRoot();
  const model = buildCalendarModel({
    events: [],
    date: '2026-08-05',
    selectedDate: '2026-08-05',
    viewMonth: '2026-08'
  });
  renderCalendar(root, model, { monthDelta: 1 });
  assert.equal(root._grid.dataset.motion, 'forward');
  renderCalendar(root, model, { monthDelta: -1 });
  assert.equal(root._grid.dataset.motion, 'back');
  renderCalendar(root, model, { monthDelta: 0 });
  assert.equal(root._grid.dataset.motion, undefined);
});

test('day selection scrolls detail into view with motion cue', () => {
  const root = fakeRoot();
  const model = buildCalendarModel({
    events: [],
    date: '2026-08-05',
    selectedDate: '2026-08-05',
    viewMonth: '2026-08'
  });
  renderCalendar(root, model, { expanded: true, scrollToDetail: true });
  assert.equal(root._detail.dataset.motion, 'in');
  assert.equal(root._detail.scrolled, true);
  assert.equal(root._detail.hidden, false);
});

test('collapsed day detail is hidden until expanded', () => {
  const root = fakeRoot();
  const model = buildCalendarModel({
    events: [],
    date: '2026-08-05',
    selectedDate: '2026-08-05',
    viewMonth: '2026-08'
  });
  renderCalendar(root, model, { expanded: false });
  assert.equal(root._detail.hidden, true);
  assert.equal(root._detail.children.length, 0);
  assert.equal(root._detail.dataset.motion, undefined);
});

test('expanded day detail lists brief rows or empty copy', () => {
  const root = fakeRoot();
  const withEvents = buildCalendarModel({
    events: [
      { record: { type: 'workout', date: '2026-08-05', title: 'Push', duration_min: 40, status: 'completed' }, body: '', path: 'w' }
    ],
    date: '2026-08-05',
    selectedDate: '2026-08-05',
    viewMonth: '2026-08'
  });
  renderCalendar(root, withEvents, { expanded: true, scrollToDetail: true });
  assert.equal(root._detail.hidden, false);
      const eventRow = root._detail.children.find(child => child.className === 'calendar-event');
  assert.ok(eventRow);
  const meta = eventRow.children.find(child => child.className === 'calendar-event__meta');
  const brief = meta?.children.find(child => child.className === 'calendar-event__brief');
  assert.equal(brief?.textContent, '40 min · completed');

  const emptyModel = buildCalendarModel({
    events: [],
    date: '2026-08-05',
    selectedDate: '2026-08-05',
    viewMonth: '2026-08'
  });
  renderCalendar(root, emptyModel, { expanded: true });
  assert.equal(
    root._detail.children.some(child => child.textContent === 'Nothing logged this day.'),
    true
  );
});

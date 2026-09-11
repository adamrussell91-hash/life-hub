import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTaskChecklist, renderTeachingAgenda } from '../../apps/life/js/shell/render-hub-widgets.js';

function fakeElement(tag) {
  return {
    tag,
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    classList: {
      list: new Set(),
      add(name) { this.list.add(name); }
    },
    append(...nodes) { this.children.push(...nodes); }
  };
}

function fakeRoot(containerSelector) {
  const container = fakeElement('div');
  container.replaceChildren = function () { this.children = []; };
  return {
    createElement: fakeElement,
    querySelector(selector) {
      return selector === containerSelector ? container : null;
    },
    container
  };
}

test('renderTeachingAgenda shows an empty state when there are no lessons today', () => {
  const root = fakeRoot('[data-teaching-agenda]');
  renderTeachingAgenda(root, []);
  assert.equal(root.container.children.length, 1);
  assert.equal(root.container.children[0].textContent, 'No lessons today.');
});

test('renderTeachingAgenda renders each lesson with time, class, and lesson title', () => {
  const root = fakeRoot('[data-teaching-agenda]');
  renderTeachingAgenda(root, [
    { id: 'a', classTitle: 'Year 8 Maths', lessonTitle: 'Fractions review', startTime: '08:45', isPast: true, isNext: false },
    { id: 'b', classTitle: 'Year 10 English', lessonTitle: 'Analysing belonging', startTime: '09:40', isPast: false, isNext: true }
  ]);
  const [past, next] = root.container.children;
  assert.ok(past.classList.list.has('is-past'));
  assert.ok(next.classList.list.has('is-next'));
  const [, nextBody] = next.children;
  assert.ok(nextBody.children.some(node => node.textContent === '09:40 · next'));
  assert.ok(nextBody.children.some(node => node.textContent === 'Year 10 English'));
  assert.ok(nextBody.children.some(node => node.textContent === 'Analysing belonging'));
});

test('renderTaskChecklist shows an empty state when nothing is open', () => {
  const root = fakeRoot('[data-task-checklist]');
  renderTaskChecklist(root, []);
  assert.equal(root.container.children[0].textContent, 'Nothing open.');
});

test('renderTaskChecklist renders up to three open tasks with a due badge when present', () => {
  const root = fakeRoot('[data-task-checklist]');
  renderTaskChecklist(root, [
    { id: 't1', title: 'Pack for the trip', status: 'open', due_date: '2026-09-15' },
    { id: 't2', title: 'Reply to Clare', status: 'open' },
    { id: 't3', title: 'Done already', status: 'done' }
  ], { today: '2026-09-15' });
  assert.equal(root.container.children.length, 2);
  const [first, second] = root.container.children;
  assert.equal(first.dataset.taskId, 't1');
  assert.ok(first.children.some(node => node.textContent === 'Today'));
  assert.equal(second.dataset.taskId, 't2');
  assert.ok(!second.children.some(node => node.className === 'hub-checklist__due'));
});

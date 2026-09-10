import test from 'node:test';
import assert from 'node:assert/strict';
import { renderClareResult, renderTasksDashboard } from '../../apps/life/js/shell/render-tasks.js';

function fakeRoot() {
  const status = { textContent: '', hidden: false };
  const list = {
    hidden: false,
    children: [],
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    append(...nodes) {
      this.children.push(...nodes);
    }
  };
  return {
    createElement() {
      return { textContent: '' };
    },
    querySelector(selector) {
      if (selector === '[data-tasks="status"]') return status;
      if (selector === '#tasks-item-list') return list;
      if (selector === '#tasks-project-list') return { ...list, children: [], hidden: true, replaceChildren() {}, append() {} };
      if (selector === '#clare-voice') return { textContent: '', hidden: true };
      if (selector === '#clare-proposals') return { ...list, children: [], hidden: true, replaceChildren() {}, append() {} };
      if (selector === '#clare-briefing') return { textContent: '', hidden: true };
      return null;
    },
    _status: status,
    _list: list
  };
}

test('tasks dashboard lists titles', () => {
  const root = fakeRoot();
  renderTasksDashboard(root, {
    status: 'ready',
    tasks: [{ id: 'task-1', title: 'Mark 12 English' }]
  });
  assert.equal(root._status.hidden, true);
  assert.equal(root._list.children[0].textContent, 'Mark 12 English');
});

test('clare dump result shows voice and proposal titles', () => {
  const voice = { textContent: '', hidden: true };
  const list = {
    hidden: false,
    children: [],
    replaceChildren(...nodes) { this.children = [...nodes]; },
    append(...nodes) { this.children.push(...nodes); }
  };
  const brief = { textContent: '', hidden: true };
  const root = {
    createElement() { return { textContent: '' }; },
    querySelector(selector) {
      if (selector === '#clare-voice') return voice;
      if (selector === '#clare-proposals') return list;
      if (selector === '#clare-briefing') return brief;
      return null;
    }
  };
  renderClareResult(root, {
    status: 'ready',
    dump: { voice: 'Right — one thing.', proposals: [{ title: 'Email parents' }] }
  });
  assert.equal(voice.textContent, 'Right — one thing.');
  assert.equal(list.children[0].textContent, 'Email parents');
});

test('tasks dashboard explains an unbound content store', () => {
  const root = fakeRoot();
  renderTasksDashboard(root, { status: 'unbound' });
  assert.match(root._status.textContent, /not bound/);
  assert.equal(root._list.hidden, true);
});

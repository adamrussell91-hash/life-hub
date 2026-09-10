import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTeachingDashboard } from '../../apps/life/js/shell/render-teaching.js';

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
      if (selector === '[data-teaching="status"]') return status;
      if (selector === '#teaching-class-list') return list;
      return null;
    },
    _status: status,
    _list: list
  };
}

test('teaching dashboard lists active class titles', () => {
  const root = fakeRoot();
  renderTeachingDashboard(root, {
    status: 'ready',
    classes: [{ code: '12ENG', title: 'English' }]
  });
  assert.equal(root._status.hidden, true);
  assert.equal(root._list.hidden, false);
  assert.equal(root._list.children[0].textContent, '12ENG · English');
});

test('teaching dashboard explains an unbound content store', () => {
  const root = fakeRoot();
  renderTeachingDashboard(root, { status: 'unbound' });
  assert.match(root._status.textContent, /not bound/);
  assert.equal(root._list.hidden, true);
});

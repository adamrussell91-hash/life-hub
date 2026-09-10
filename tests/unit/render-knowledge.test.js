import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKnowledgeDashboard } from '../../apps/life/js/shell/render-knowledge.js';

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
      if (selector === '[data-knowledge="status"]') return status;
      if (selector === '#knowledge-page-list') return list;
      return null;
    },
    _status: status,
    _list: list
  };
}

test('knowledge dashboard lists page titles', () => {
  const root = fakeRoot();
  renderKnowledgeDashboard(root, {
    status: 'ready',
    pages: [{ id: 'note-1', title: 'Archive note' }]
  });
  assert.equal(root._status.hidden, true);
  assert.equal(root._list.hidden, false);
  assert.equal(root._list.children[0].textContent, 'Archive note');
});

test('knowledge dashboard explains an unbound data repo', () => {
  const root = fakeRoot();
  renderKnowledgeDashboard(root, { status: 'unbound' });
  assert.match(root._status.textContent, /not bound/);
  assert.equal(root._list.hidden, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { futureMapItems, renderFutureMap } from '../../apps/life/js/app/render-future-map.js';

const tasks = [
  { id: 'b', title: 'See the northern lights', bucket: 'someday', someday_kind: 'bucket_list', origin_date: '2014-06-01' },
  { id: 'd', title: 'Live by the sea', bucket: 'someday', someday_kind: 'dreams_jar', origin_date: '2011-01-09' },
  { id: 'c', title: 'Run a studio', bucket: 'someday', someday_kind: 'career', origin_date: '2020-01-01' },
  { id: 'a', title: 'Buy milk', bucket: 'active', someday_kind: 'bucket_list', origin_date: '2024-01-01' }
];

test('future map keeps bucket list and dreams jar, and leaves career in Tasks', () => {
  const items = futureMapItems(tasks);
  assert.deepEqual(items.map(item => item.title), ['Live by the sea', 'See the northern lights']);
  assert.deepEqual(futureMapItems(tasks, 'bucket_list').map(item => item.id), ['b']);
  assert.equal(futureMapItems(tasks).some(item => item.someday_kind === 'career'), false);
});

function button(filter) {
  const node = {
    dataset: { futureMapFilter: filter },
    className: '',
    attributes: {},
    listeners: {},
    classList: {
      toggle(name, on) {
        const parts = new Set(node.className.split(/\s+/).filter(Boolean));
        if (on) parts.add(name);
        else parts.delete(name);
        node.className = [...parts].join(' ');
      }
    },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  };
  return node;
}

test('future map renders origin dates and hides career goals', () => {
  const list = {
    textContent: '',
    children: [],
    replaceChildren(...next) { this.children = next; this.textContent = ''; },
    append(...next) { this.children.push(...next); }
  };
  const filters = [button('all'), button('bucket_list'), button('dreams_jar')];
  const root = {
    createElement(tag) {
      const node = {
        tag,
        className: '',
        textContent: '',
        children: [],
        append(...next) { this.children.push(...next); }
      };
      return node;
    },
    querySelector(selector) {
      return selector === '[data-future-map="list"]' ? list : null;
    },
    querySelectorAll(selector) {
      return selector === '[data-future-map-filter]' ? filters : [];
    }
  };

  renderFutureMap(root, { tasks, kind: 'all' });
  const rendered = list.children[0].children.map(row => row.children[0].children[1].textContent);
  assert.deepEqual(rendered, [
    'Dreams jar · Origin 09/01/11',
    'Bucket list · Origin 01/06/14'
  ]);
  assert.equal(rendered.some(line => line.includes('Run a studio')), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listCalendarSources } from '../../apps/life/js/shell/calendar-sources.js';
import { renderCalendarSources } from '../../apps/life/js/shell/render-calendar-sources.js';

function fakeRoot() {
  const empty = {
    className: '',
    textContent: '',
    hidden: false,
    children: [],
    dataset: {},
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    removeAttribute(name) {
      if (name === 'hidden') this.hidden = false;
    },
    setAttribute(name) {
      if (name === 'hidden') this.hidden = true;
    }
  };
  const list = {
    ...empty,
    tagName: 'UL',
    children: [],
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    append(...nodes) {
      this.children.push(...nodes);
    }
  };
  return {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        children: [],
        append(...nodes) {
          this.children.push(...nodes);
        }
      };
    },
    querySelector(selector) {
      if (selector === '#calendar-source-registry') return { ...empty, tagName: 'ARTICLE' };
      if (selector === '[data-calendar="sources-empty"]') return empty;
      if (selector === '#calendar-source-list') return list;
      return null;
    },
    _empty: empty,
    _list: list
  };
}

test('shared calendar source registry names Life logged days', () => {
  const sources = listCalendarSources();
  assert.deepEqual(sources.map(source => source.id), ['life', 'teaching']);
  assert.equal(sources[0].status, 'live');
  assert.equal(sources[1].status, 'pending');
  assert.equal(sources.some(source => source.fetch || source.url || source.endpoint), false);
});

test('shared calendar source registry does not name other hub APIs', async () => {
  const source = await readFile(new URL('../../apps/life/js/shell/calendar-sources.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /teaching-api|knowledge-api|tasks-api|jade-melomakarona/i);
  assert.doesNotMatch(source, /teaching-hub|knowledge-hub|Tasks-Hub/i);
});

test('source card lists Life Hub and hides the empty copy', () => {
  const root = fakeRoot();
  renderCalendarSources(root, listCalendarSources());
  assert.equal(root._empty.hidden, true);
  assert.equal(root._list.hidden, false);
  assert.equal(root._list.children.length, 2);
  assert.equal(root._list.children[0].textContent, 'Life Hub');
  assert.equal(root._list.children[1].textContent, 'Teaching');
});

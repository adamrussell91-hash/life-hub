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

test('shared calendar source registry is empty — no live feeds', () => {
  const sources = listCalendarSources();
  assert.deepEqual(sources, []);
  assert.equal(sources.some(source => source.fetch || source.url || source.endpoint), false);
});

test('shared calendar source registry does not name other hub APIs', async () => {
  const source = await readFile(new URL('../../apps/life/js/shell/calendar-sources.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /teaching-api|knowledge-api|tasks-api|jade-melomakarona/i);
  assert.doesNotMatch(source, /teaching-hub|knowledge-hub|Tasks-Hub/i);
});

test('source placeholder shows empty copy and hides the list', () => {
  const root = fakeRoot();
  renderCalendarSources(root, listCalendarSources());
  assert.equal(root._empty.hidden, false);
  assert.match(root._empty.textContent, /No shared sources yet/);
  assert.equal(root._list.hidden, true);
  assert.equal(root._list.children.length, 0);
});

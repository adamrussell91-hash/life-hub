import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { mountEntityTagger } from '../../packages/design-kit/js/entity-tagger.js';

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.DOMException = dom.window.DOMException;
  return dom;
}

function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Teaching Hub loads shared entity tag styles', async () => {
  const source = await readFile(
    new URL('../../apps/teaching/src/design/tokens.css', import.meta.url),
    'utf8'
  );
  assert.match(source, /entity-links\.css/);
});

test('generic tag selection updates live without waiting for a fresh relationship list', async () => {
  setupDom();
  const host = document.createElement('div');
  document.body.append(host);

  let listCalls = 0;
  const suppressed = [];
  mountEntityTagger({
    host,
    sourceRef: 'teaching:unit:unit_1',
    search: async () => ({
      groups: {
        event: [
          {
            ref: 'professional:event:event_1',
            kind: 'event',
            display_label: 'Warlight Professional Development',
            supporting_label: 'professional development',
            href: '/professional/#/event/event_1'
          }
        ]
      }
    }),
    listLinks: async () => {
      listCalls += 1;
      return { outgoing: [], incoming: [] };
    },
    createLink: async () => ({
      link: {
        id: 'link_1',
        source_ref: 'teaching:unit:unit_1',
        target_ref: 'professional:event:event_1',
        relationship_type: 'tagged_with',
        status: 'current'
      },
      created: true
    }),
    suppressLink: async (id) => {
      suppressed.push(id);
      return { link: { id, status: 'suppressed' } };
    }
  });

  await tick();
  const input = host.querySelector('.entity-tagger__picker');
  input.value = '@War';
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(220);

  const option = host.querySelector('.entity-picker__option');
  assert.ok(option);
  option.click();
  await tick();

  const chip = host.querySelector('.entity-chip--saved.entity-chip--tag');
  assert.ok(chip);
  assert.equal(chip.querySelector('.entity-chip__label').textContent, 'Warlight Professional Development');
  assert.equal(chip.querySelector('.entity-chip__meta').textContent, 'Event');
  assert.equal(chip.textContent.includes('tagged_with'), false);
  assert.equal(listCalls, 1);

  const remove = chip.querySelector('.entity-chip__action--remove');
  assert.equal(remove.textContent, '×');
  assert.equal(remove.getAttribute('aria-label'), 'Remove Warlight Professional Development');
  remove.click();
  await tick();

  assert.deepEqual(suppressed, ['link_1']);
  assert.equal(host.querySelectorAll('.entity-chip').length, 0);
});


test('tagger presents one compact Connections composer surface', async () => {
  setupDom();
  const host = document.createElement('div');
  document.body.append(host);

  mountEntityTagger({
    host,
    sourceRef: 'teaching:unit:unit_1',
    search: async () => ({ groups: {} }),
    listLinks: async () => ({ outgoing: [], incoming: [] }),
    createLink: async () => ({ link: { id: 'link_1' } }),
    suppressLink: async () => undefined
  });

  await tick();

  const tagger = host.querySelector('.entity-tagger');
  const field = host.querySelector('.entity-tagger__field');
  assert.equal(host.querySelector('.entity-tagger__heading').textContent, 'Connections');
  assert.ok(field);
  assert.ok(field.contains(host.querySelector('.entity-tagger__picker')));
  assert.ok(field.contains(host.querySelector('.entity-tagger__chips')));
  assert.equal(tagger.querySelector('.entity-tagger__hint'), null);
});

function mountForSearch(searchCalls, groups) {
  setupDom();
  const host = document.createElement('div');
  document.body.append(host);
  mountEntityTagger({
    host,
    sourceRef: 'teaching:unit:unit_1',
    excludeKinds: ['communication'],
    search: async (query, _signal, kinds) => {
      searchCalls.push({ query, kinds });
      return { groups };
    },
    listLinks: async () => ({ outgoing: [], incoming: [] }),
    createLink: async () => ({ link: { id: 'link_1' } }),
    suppressLink: async () => undefined
  });
  return host;
}

function type(input, value) {
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

test('tagger searches plain typed words, spaces included, with no @ needed', async () => {
  const calls = [];
  const host = mountForSearch(calls, {
    event: [{ ref: 'professional:event:event_1', kind: 'event', display_label: 'PD — Samuel Wagan Watson', supporting_label: 'scheduled' }],
    page: [{ ref: 'knowledge:page:p1', kind: 'page', display_label: 'Watson notes', supporting_label: null }]
  });
  await tick();
  const input = host.querySelector('.entity-tagger__picker');

  type(input, 'w');
  await tick(260);
  assert.equal(calls.length, 0, 'one letter never reaches the server');

  type(input, 'wagan watson');
  await tick(260);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, 'wagan watson');
  assert.equal(calls[0].kinds.includes('communication'), false, 'excluded kinds are never requested');

  const headings = [...host.querySelectorAll('.entity-picker__group')].map((node) => node.textContent);
  assert.deepEqual(headings, ['Events', 'Knowledge notes']);
});

test('a category button narrows the server request to that category', async () => {
  const calls = [];
  const host = mountForSearch(calls, { event: [] });
  await tick();
  const labels = [...host.querySelectorAll('.entity-tagger__filter')].map((node) => node.textContent);
  assert.equal(labels[0], 'All');
  assert.ok(labels.includes('Events & meetings'));
  assert.equal(labels.includes('Communications'), false, 'no button for a kind this host cannot tag');

  const input = host.querySelector('.entity-tagger__picker');
  type(input, 'wagan');
  await tick(260);
  host.querySelector('[data-filter="events"]').click();
  await tick(260);
  assert.deepEqual(calls.at(-1), { query: 'wagan', kinds: ['event', 'meeting'] });
  assert.equal(host.querySelector('[data-filter="events"]').getAttribute('aria-pressed'), 'true');
});

test('a page never offers itself as its own connection', async () => {
  const calls = [];
  const host = mountForSearch(calls, {
    unit: [
      { ref: 'teaching:unit:unit_1', kind: 'unit', display_label: 'Ethics unit' },
      { ref: 'teaching:unit:unit_2', kind: 'unit', display_label: 'Ethics unit two' }
    ]
  });
  await tick();
  type(host.querySelector('.entity-tagger__picker'), 'ethics');
  await tick(260);
  const options = [...host.querySelectorAll('.entity-picker__option-label')].map((node) => node.textContent);
  assert.deepEqual(options, ['Ethics unit two']);
});

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

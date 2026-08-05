import test from 'node:test';
import assert from 'node:assert/strict';
import { showEphemeralMessage } from '../../js/app/ephemeral-message.js';

class FakeEl {
  constructor() {
    this.textContent = '';
    this.hidden = true;
    this.dataset = {};
    this.classList = {
      items: new Set(),
      add(name) { this.items.add(name); },
      remove(name) { this.items.delete(name); }
    };
    this.style = {};
  }
}

test('ephemeral message shows then clears after hold + fade', async () => {
  const el = new FakeEl();
  showEphemeralMessage(el, 'Boom', { holdMs: 20, fadeMs: 10 });
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, 'Boom');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, '');
});

test('empty message clears immediately', () => {
  const el = new FakeEl();
  el.hidden = false;
  el.textContent = 'x';
  showEphemeralMessage(el, '');
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, '');
});

test('clearEphemeralMessage cancels a pending fade so sticky status can stick', async () => {
  const { clearEphemeralMessage } = await import('../../js/app/ephemeral-message.js');
  const el = new FakeEl();
  showEphemeralMessage(el, 'Logged', { holdMs: 40, fadeMs: 40 });
  clearEphemeralMessage(el);
  el.textContent = 'Saving…';
  el.hidden = false;
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(el.textContent, 'Saving…');
  assert.equal(el.hidden, false);
});

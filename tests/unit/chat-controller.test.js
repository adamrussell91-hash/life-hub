import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatController } from '../../js/app/chat-controller.js';

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.children = [];
    this.parent = null;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
      node.parent = this;
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    this.children = nodes;
    for (const node of nodes) node.parent = this;
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map([
      ['#chat-form', new FakeElement('form')],
      ['#chat-input', new FakeElement('input')],
      ['#chat-messages', new FakeElement('ul')],
      ['#chat-error', new FakeElement('p')],
      ['#chat-send', new FakeElement('button')]
    ]);
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  createElement(tag) {
    return new FakeElement(tag);
  }
}

function fakeChatApi({ record, path, confirmImpl }) {
  const confirmCalls = [];
  return {
    confirmCalls,
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'record_proposal', path, record };
    },
    async confirm(payload) {
      confirmCalls.push(payload);
      return confirmImpl(payload, confirmCalls.length);
    }
  };
}

async function flushMicrotasks() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function skincareRecord() {
  return {
    schema_version: 1,
    id: 'abc123',
    type: 'skincare',
    date: '2026-08-02',
    created_at: '2026-08-02T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    source: 'chat',
    duration_minutes: 15,
    completed: false
  };
}

test('editing a numeric and a boolean field before confirming sends the coerced values, not the raw strings', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: skincareRecord(),
    path: '2026/2026-08-02-hyaluronica-skincare.md',
    confirmImpl: async () => ({ ok: true })
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Hyaluronica, log tonight\'s routine');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className === 'record-proposal');
  assert.ok(proposal, 'a record proposal card should have been appended');

  const fields = proposal.children.find(child => child.tagName === 'dl');
  const inputsByField = new Map();
  for (const child of fields.children) {
    if (child.tagName !== 'dd') continue;
    const input = child.children.find(node => node.tagName === 'input');
    if (input) inputsByField.set(input.dataset.field, input);
  }

  inputsByField.get('duration_minutes').value = '45';
  inputsByField.get('completed').value = 'true';

  const confirmButton = proposal.children.find(child => child.className === 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(chatApi.confirmCalls.length, 1);
  const { candidate } = chatApi.confirmCalls[0];
  assert.equal(candidate.fields.duration_minutes, 45);
  assert.equal(typeof candidate.fields.duration_minutes, 'number');
  assert.equal(candidate.fields.completed, true);
  assert.equal(typeof candidate.fields.completed, 'boolean');
});

test('a write_conflict on first confirm prompts a retry, and confirming again sends exactly one overwrite request', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: skincareRecord(),
    path: '2026/2026-08-02-hyaluronica-skincare.md',
    confirmImpl: async (payload, callNumber) => {
      if (callNumber === 1) throw Object.assign(new Error('conflict'), { code: 'write_conflict' });
      return { ok: true };
    }
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Hyaluronica, log tonight\'s routine');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className === 'record-proposal');
  const confirmButton = proposal.children.find(child => child.className === 'record-proposal__confirm');

  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(chatApi.confirmCalls.length, 1);
  assert.equal(chatApi.confirmCalls[0].overwrite, false);
  assert.equal(confirmButton.disabled, false, 'the button should re-enable so the user can retry');
  assert.equal(confirmButton.dataset.overwrite, '1');
  assert.match(root.querySelector('#chat-error').textContent, /already exists.*overwrite/i);

  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(chatApi.confirmCalls.length, 2, 'exactly one retry request should have been sent, not more');
  assert.equal(chatApi.confirmCalls[1].overwrite, true);
});

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
    this.style = {
      props: new Map(),
      setProperty(name, value) {
        this.props.set(name, value);
      },
      getPropertyValue(name) {
        return this.props.get(name) ?? '';
      }
    };
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

  querySelector(selector) {
    if (selector === '.chat-message__body') {
      return this.children.find(child => child.className === 'chat-message__body') ?? null;
    }
    if (selector === '.chat-message__avatar') {
      return this.children.find(child => child.className === 'chat-message__avatar') ?? null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-agent-slug]') {
      return this.children.filter(child => child.dataset?.agentSlug);
    }
    return [];
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map([
      ['#chat-form', new FakeElement('form')],
      ['#chat-input', new FakeElement('input')],
      ['#chat-messages', new FakeElement('ul')],
      ['#chat-error', new FakeElement('p')],
      ['#chat-send', new FakeElement('button')],
      ['#chat-view', new FakeElement('section')],
      ['#agent-picker', new FakeElement('div')]
    ]);
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    if (selector === '#agent-picker') {
      const host = this.elements.get('#agent-picker');
      return host ? [host] : [];
    }
    return [];
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

test('a confirm that reports centralNodeUpdated:false shows an ephemeral warning without failing the save', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: skincareRecord(),
    path: '2026/2026-08-02-hyaluronica-skincare.md',
    confirmImpl: async () => ({ ok: true, centralNodeUpdated: false })
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Hyaluronica, log tonight\'s routine');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className === 'record-proposal');
  const confirmButton = proposal.children.find(child => child.className === 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.match(proposal.children[0]?.textContent ?? '', /Saved/);
  assert.equal(
    root.querySelector('#chat-error').textContent,
    'Logged, but Central Node didn\u2019t update — try Refresh.'
  );
});

test('a confirm that reports centralNodeUpdated:true does not show the Central Node warning', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: skincareRecord(),
    path: '2026/2026-08-02-hyaluronica-skincare.md',
    confirmImpl: async () => ({ ok: true, centralNodeUpdated: true })
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Hyaluronica, log tonight\'s routine');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className === 'record-proposal');
  const confirmButton = proposal.children.find(child => child.className === 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(root.querySelector('#chat-error').textContent, '');
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

function messageBubbles(root) {
  return root.querySelector('#chat-messages').children.filter(child => child.className?.startsWith('chat-message'));
}

function bubbleText(bubble) {
  const body = bubble.children.find(child => child.className === 'chat-message__body');
  if (!body) return bubble.textContent ?? '';
  if (body.children.length) return body.children.map(node => node.textContent).join('');
  return body.textContent ?? '';
}

test('a paragraph break in streamed text starts a new bubble instead of one growing wall of text', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'First point.' };
      yield { type: 'text', delta: '\n\nSecond point.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('brisket, log lunch');

  const bubbles = messageBubbles(root);
  // index 0 is the user's own message; the assistant's two paragraphs follow as separate bubbles
  assert.equal(bubbles.length, 3, 'expected the user bubble plus two separate assistant bubbles');
  assert.equal(bubbleText(bubbles[1]), 'First point.');
  assert.equal(bubbleText(bubbles[2]), 'Second point.');
});

test('a search event ends the current bubble so text before and after it does not merge', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Let me check that.' };
      yield { type: 'search', query: 'McChicken nutrition' };
      yield { type: 'text', delta: 'Found it, 452 kcal.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('brisket, log a mcchicken for lunch');

  const bubbles = messageBubbles(root);
  assert.equal(bubbles.length, 4, 'user bubble, pre-search text, the search note, and post-search text');
  assert.equal(bubbleText(bubbles[1]), 'Let me check that.');
  assert.equal(bubbleText(bubbles[2]), '🔍 Searched the web: McChicken nutrition');
  assert.equal(bubbleText(bubbles[3]), 'Found it, 452 kcal.');
});

test('a second message within the memory window carries the prior turn as history and stays with the same agent', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-01T18:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logging that now, buddy.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi, now: () => clock });

  await controller.send('Brisket, log 2 eggs for breakfast');
  clock += 60_000; // one minute later, still well inside the 20-minute window
  await controller.send('actually make that 3 eggs');

  assert.equal(sendCalls.length, 2);
  assert.deepEqual(sendCalls[0].history, []);
  assert.equal(sendCalls[0].priorAgentSlug, undefined);
  assert.deepEqual(sendCalls[1].history, [
    { role: 'user', content: 'Brisket, log 2 eggs for breakfast' },
    { role: 'assistant', content: 'Logging that now, buddy.' }
  ]);
  assert.equal(sendCalls[1].priorAgentSlug, 'brisket');
});

test('memory expires after the window so a stale conversation does not stick to the wrong agent', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-01T18:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logged.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi, now: () => clock });

  await controller.send('Brisket, log 2 eggs for breakfast');
  clock += 21 * 60_000; // just past the 20-minute memory window
  await controller.send('what should I have for lunch');

  assert.deepEqual(sendCalls[1].history, []);
  assert.equal(sendCalls[1].priorAgentSlug, undefined);
});

test('bold markdown in streamed text renders as a strong element, not literal asterisks', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'That is **452 calories**, buddy.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('brisket, log a mcchicken for lunch');

  const bubbles = messageBubbles(root);
  const assistantBubble = bubbles[1];
  const body = assistantBubble.children.find(node => node.className === 'chat-message__body');
  const bold = body?.children.find(node => node.tagName === 'strong');
  assert.ok(bold, 'expected a strong element for the bolded segment');
  assert.equal(bold.textContent, '452 calories');
  assert.doesNotMatch(bubbleText(assistantBubble), /\*\*/);
});

test('a default agent hint is used as priorAgentSlug before any agent has spoken this session', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Walk me through it.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi, getDefaultAgentSlug: () => 'hammond' });

  await controller.send('how is this month looking');

  assert.equal(sendCalls[0].priorAgentSlug, 'hammond');
});

test('a real recent agent reply still wins over the default hint', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-01T18:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logging that now, buddy.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root, chatApi, now: () => clock, getDefaultAgentSlug: () => 'hammond'
  });

  await controller.send('Brisket, log 2 eggs for breakfast');
  clock += 60_000;
  await controller.send('actually make that 3 eggs');

  assert.equal(sendCalls[1].priorAgentSlug, 'brisket', 'the real conversation with Brisket must win over the Hammond default hint');
});

test('the default hint returns once the memory window lapses, instead of staying stuck or falling to undefined', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-01T18:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logged.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root, chatApi, now: () => clock, getDefaultAgentSlug: () => 'hammond'
  });

  await controller.send('Brisket, log 2 eggs for breakfast');
  clock += 21 * 60_000;
  await controller.send('how is my week looking');

  assert.equal(sendCalls[1].priorAgentSlug, 'hammond');
});

test('omitting the default hint entirely preserves today\'s existing behaviour (undefined when nothing is sticky)', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'router' };
      yield { type: 'text', delta: 'Got it.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('what should I eat');

  assert.equal(sendCalls[0].priorAgentSlug, undefined);
});

test('shows On it… immediately and clears it when real text arrives', async () => {
  const root = new FakeDocument();
  let resolveGate;
  const gate = new Promise(resolve => {
    resolveGate = resolve;
  });
  const chatApi = {
    async *send() {
      await gate;
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'text', delta: 'Here is the plan.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  const pending = controller.send('build today\'s session');
  await flushMicrotasks();

  const during = messageBubbles(root);
  assert.equal(during.length, 2);
  assert.equal(bubbleText(during[1]), 'On it…');

  resolveGate();
  await pending;

  const after = messageBubbles(root);
  assert.equal(after.length, 2);
  assert.equal(bubbleText(after[1]), 'Here is the plan.');
  assert.equal(after.every(bubble => bubbleText(bubble) !== 'On it…'), true);
});

test('applies the agent accent colour when the stream names the agent', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'text', delta: 'Ready.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root,
    chatApi,
    agentColour: (_config, slug) => (slug === 'chadwick' ? '#2E7BD6' : '#000'),
    getAgentsConfig: () => ({ agents: [] })
  });

  await controller.send('hey chadwick');

  assert.equal(root.querySelector('#chat-view').style.getPropertyValue('--agent-accent'), '#2E7BD6');
});

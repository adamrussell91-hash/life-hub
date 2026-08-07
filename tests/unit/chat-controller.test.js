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
      ['#chat-new', new FakeElement('button')],
      ['#chat-view', new FakeElement('section')],
      ['#agent-picker', new FakeElement('div')],
      ['#chat-agent-hero', new FakeElement('div')]
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

test('confirm shows Saving… while the request is in flight then restores on failure', async () => {
  const root = new FakeDocument();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const chatApi = fakeChatApi({
    record: skincareRecord(),
    path: '2026/2026-08-02-hyaluronica-skincare.md',
    confirmImpl: async () => {
      await gate;
      throw Object.assign(new Error('fail'), { code: 'request_failed' });
    }
  });
  const controller = createChatController({ root, chatApi });
  await controller.send('Hyaluronica, log tonight\'s routine');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className === 'record-proposal');
  const confirmButton = proposal.children.find(child => child.className === 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(confirmButton.disabled, true);
  assert.equal(confirmButton.textContent, 'Saving…');

  release();
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(confirmButton.disabled, false);
  assert.equal(confirmButton.textContent, 'Confirm');
});

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

test('a diary confirm that reports dayoneSent:false shows a Day One warning without failing the save', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: {
      type: 'diary',
      date: '2026-08-07',
      mood: 'low',
      mood_score: 4,
      energy: 'low',
      dayone_sent: false
    },
    path: 'data/mind/2026/08/2026-08-07-diary.md',
    notes: 'Felt flat today.',
    confirmImpl: async () => ({ ok: true, centralNodeUpdated: true, dayoneSent: false, dayoneReason: 'resend_500' })
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Penelope, diary time');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className === 'record-proposal');
  const confirmButton = proposal.children.find(child => child.className === 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.match(proposal.children[0]?.textContent ?? '', /Saved/);
  assert.match(root.querySelector('#chat-error').textContent, /Day One email didn.t send/i);
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

const STATUS_COPY = ['On it…', 'Looking that up…', 'Researching…'];

function statusBubbles(root) {
  return messageBubbles(root).filter(bubble => bubble.className?.includes('chat-message--status'));
}

test('a search followed by a saved-library note keeps a sticky Researching… status until real text arrives', async () => {
  const root = new FakeDocument();
  let resolveGate;
  const gate = new Promise(resolve => {
    resolveGate = resolve;
  });
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'search', query: 'protein bar nutrition' };
      yield { type: 'food_library_saved', name: 'Quest Bar' };
      await gate;
      yield { type: 'text', delta: 'Logged it, 190 kcal.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  const pending = controller.send('log a quest bar');
  await flushMicrotasks();

  const duringStatus = statusBubbles(root);
  assert.equal(duringStatus.length, 1, 'exactly one sticky status bubble should exist while waiting');
  assert.equal(bubbleText(duringStatus[0]), 'Researching…');
  assert.match(duringStatus[0].className, /chat-message--status/);

  const list = root.querySelector('#chat-messages');
  assert.equal(
    list.children[list.children.length - 1],
    duringStatus[0],
    'the sticky status bubble should sit below the search chip and library confirmation, not above them'
  );

  resolveGate();
  await pending;

  const after = messageBubbles(root);
  assert.equal(statusBubbles(root).length, 0, 'the status bubble should be gone once real text arrives');
  assert.equal(
    after.every(bubble => !STATUS_COPY.includes(bubbleText(bubble))),
    true,
    'no leftover status copy should remain in any bubble'
  );
});

test('food_library_saved followed by text leaves no status copy behind', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'food_library_saved', name: 'Quest Bar' };
      yield { type: 'text', delta: 'Logged it, 190 kcal.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('log a quest bar');

  const after = messageBubbles(root);
  assert.equal(statusBubbles(root).length, 0);
  assert.equal(
    after.every(bubble => !STATUS_COPY.includes(bubbleText(bubble))),
    true,
    'no leftover status copy should remain in any bubble'
  );
});

test('the sticky status bubble carries the status class while waiting and loses it once real text lands', async () => {
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
  assert.match(during[1].className, /chat-message--status/, 'the waiting bubble should carry the status class');

  resolveGate();
  await pending;

  const after = messageBubbles(root);
  for (const bubble of after) {
    assert.doesNotMatch(bubble.className ?? '', /chat-message--status/, 'no bubble should keep the status class once real text has arrived');
  }
});

test('the status bubble rotates On it… → Looking that up… → Researching… across a full research turn, then clears on text', async () => {
  const root = new FakeDocument();
  const seenStatuses = [];
  let resolveSearch;
  let resolveSave;
  let resolveText;
  const searchGate = new Promise(resolve => {
    resolveSearch = resolve;
  });
  const saveGate = new Promise(resolve => {
    resolveSave = resolve;
  });
  const textGate = new Promise(resolve => {
    resolveText = resolve;
  });
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      await searchGate;
      yield { type: 'search', query: 'protein bar nutrition' };
      await saveGate;
      yield { type: 'food_library_saved', name: 'Quest Bar' };
      await textGate;
      yield { type: 'text', delta: 'Logged it, 190 kcal.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  const pending = controller.send('log a quest bar');

  await flushMicrotasks();
  seenStatuses.push(bubbleText(statusBubbles(root)[0]));

  resolveSearch();
  await flushMicrotasks();
  seenStatuses.push(bubbleText(statusBubbles(root)[0]));

  resolveSave();
  await flushMicrotasks();
  seenStatuses.push(bubbleText(statusBubbles(root)[0]));

  resolveText();
  await pending;

  assert.deepEqual(seenStatuses, ['On it…', 'Looking that up…', 'Researching…']);
  assert.equal(statusBubbles(root).length, 0, 'status bubble should be cleared once the real answer streams in');
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

function unreadCalls() {
  const calls = [];
  return { calls, onUnreadChange: unread => calls.push(unread) };
}

test('a completed turn with real text marks chat unread when the chat is not visible', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logged it.' };
      yield { type: 'done' };
    }
  };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({
    root, chatApi, isChatVisible: () => false, onUnreadChange
  });

  await controller.send('log a snack');

  assert.deepEqual(calls, [true]);
});

test('a completed turn does not mark chat unread while the chat is visible', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logged it.' };
      yield { type: 'done' };
    }
  };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({
    root, chatApi, isChatVisible: () => true, onUnreadChange
  });

  await controller.send('log a snack');

  assert.deepEqual(calls, []);
});

test('a record_proposal ending the turn marks chat unread when not visible', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield {
        type: 'record_proposal',
        path: '2026/2026-08-02-chadwick-workout.md',
        record: { type: 'workout', date: '2026-08-02' }
      };
    }
  };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({
    root, chatApi, isChatVisible: () => false, onUnreadChange
  });

  await controller.send('log my workout');

  assert.deepEqual(calls, [true]);
});

test('a record_rejected event marks chat unread when not visible', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'record_rejected', errors: ['bad date'] };
    }
  };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({
    root, chatApi, isChatVisible: () => false, onUnreadChange
  });

  await controller.send('log my workout');

  assert.deepEqual(calls, [true]);
});

test('a stream error marks chat unread when not visible', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'error' };
    }
  };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({
    root, chatApi, isChatVisible: () => false, onUnreadChange
  });

  await controller.send('log a snack');

  assert.deepEqual(calls, [true]);
});

test('a thrown/aborted send marks chat unread when not visible', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      throw new Error('network down');
    }
  };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({
    root, chatApi, isChatVisible: () => false, onUnreadChange
  });

  await controller.send('log a snack');

  assert.deepEqual(calls, [true]);
});

test('a search-only turn marks unread once empty-turn recovery lands', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'search', query: 'quest bar' };
    }
  };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({
    root, chatApi, isChatVisible: () => false, onUnreadChange
  });

  await controller.send('log a quest bar');

  assert.deepEqual(calls, [true]);
});

const EMPTY_TURN_RECOVERY = 'That reply got cut off before it finished (usually a timeout while looking things up). Send the same message again and I’ll continue.';

test('empty stream after On it shows a durable recovery message', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('build a workout');
  assert.ok(
    messageBubbles(root).some(b => bubbleText(b).includes(EMPTY_TURN_RECOVERY)),
    'expected empty-turn recovery copy'
  );
  assert.ok(
    messageBubbles(root).every(b => bubbleText(b) !== 'On it…'),
    'On it bubble must not linger'
  );
});

test('search-only turn without text or proposal shows recovery message', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'search', query: 'bacon egg roll' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('bacon and egg roll');
  assert.ok(messageBubbles(root).some(b => bubbleText(b).includes(EMPTY_TURN_RECOVERY)));
});

test('status events update the working bubble without counting as a finished turn', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'status', text: 'Loading your logs…' };
      yield { type: 'status', text: 'Thinking…' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('lasagna');
  assert.ok(messageBubbles(root).some(b => bubbleText(b).includes(EMPTY_TURN_RECOVERY)));
  assert.ok(messageBubbles(root).every(b => bubbleText(b) !== 'Loading your logs…'));
  assert.ok(messageBubbles(root).every(b => bubbleText(b) !== 'Thinking…'));
});

test('text reply does not show empty-turn recovery', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Shoot, buddy — that roll is about 520 kcal.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('bacon egg roll');
  assert.ok(messageBubbles(root).every(b => !bubbleText(b).includes(EMPTY_TURN_RECOVERY)));
});

test('clearUnread notifies listeners that chat is read, independent of any send', () => {
  const root = new FakeDocument();
  const chatApi = { async *send() {} };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({ root, chatApi, onUnreadChange });

  controller.clearUnread();

  assert.deepEqual(calls, [false]);
});

test('nudge when exercise library saved but no record_proposal in the turn', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'exercise_library_saved', name: 'Bar Press' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('build chest');

  const bubbles = messageBubbles(root);
  assert.ok(
    bubbles.some(bubble => /lock it onto Fitness/i.test(bubbleText(bubble)) && /Confirm card/i.test(bubbleText(bubble))),
    'expected a nudge bubble mentioning locking onto Fitness for a Confirm card'
  );
});

test('no nudge when exercise_library_saved then record_proposal', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'exercise_library_saved', name: 'Bar Press' };
      yield {
        type: 'record_proposal',
        path: '2026/2026-08-02-chadwick-workout.md',
        record: { type: 'workout', date: '2026-08-02' }
      };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('build chest');

  const bubbles = messageBubbles(root);
  assert.ok(
    bubbles.every(bubble => !/lock it onto Fitness/i.test(bubbleText(bubble))),
    'no nudge should appear once a record_proposal arrived'
  );
});

test('no nudge when exercise library saved but the agent is not Chadwick', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'exercise_library_saved', name: 'Bar Press' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('build chest');

  const bubbles = messageBubbles(root);
  assert.ok(
    bubbles.every(bubble => !/lock it onto Fitness/i.test(bubbleText(bubble))),
    'nudge should be Chadwick-specific when the slug is known'
  );
});

test('omitting isChatVisible/onUnreadChange entirely preserves existing behaviour (no crash, no-op)', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logged it.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await assert.doesNotReject(controller.send('log a snack'));
  assert.doesNotThrow(() => controller.clearUnread());
});

test('API history carries up to 30 prior messages inside the memory window', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-01T18:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'vera' };
      yield { type: 'text', delta: `Reply ${sendCalls.length}` };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi, now: () => clock });

  for (let i = 0; i < 20; i += 1) {
    await controller.send(`turn ${i}`);
    clock += 1_000;
  }

  const last = sendCalls.at(-1);
  assert.equal(last.history.length, 30, 'caps at 30 messages (15 user + 15 assistant before this turn)');
  assert.equal(last.history[0].content, 'turn 4');
  assert.equal(last.history.at(-1).content, 'Reply 19');
});

test('New chat clears the thread and history but keeps the pinned agent', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'penelope' };
      yield { type: 'text', delta: 'Tell me more.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root,
    chatApi,
    getDefaultAgentSlug: () => 'hammond',
    agentColour: () => '#C85A64',
    getAgentsConfig: () => ({})
  });

  controller.selectAgent('penelope');
  await controller.send('I had a rough morning');
  assert.ok(messageBubbles(root).length >= 2);

  controller.startNewChat();

  assert.equal(messageBubbles(root).length, 0);
  assert.equal(controller.getSelectedAgentSlug(), 'penelope');
  assert.equal(
    root.querySelector('#chat-view').style.getPropertyValue('--agent-accent'),
    '#C85A64'
  );

  await controller.send('starting fresh');
  assert.deepEqual(sendCalls[1].history, []);
  assert.equal(sendCalls[1].priorAgentSlug, 'penelope');
});

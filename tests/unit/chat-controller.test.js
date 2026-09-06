import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatController } from '../../apps/life/js/app/chat-controller.js';
import { agentColour } from '../../apps/life/js/app/agent-colour.js';
import { isAgentStatusLine, isGenericStatusCopy } from '../../apps/life/js/app/agent-protocols.js';

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
    this.attributes = new Map();
    this.offsetTop = 0;
    this.offsetHeight = 0;
    this.clientHeight = 0;
    this.scrollHeight = 0;
    this.scrollTop = 0;
    this.style = {
      height: '0px',
      props: new Map(),
      setProperty(name, value) {
        this.props.set(name, value);
      },
      getPropertyValue(name) {
        return this.props.get(name) ?? '';
      }
    };
    this.classList = {
      add: (...names) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        for (const name of names) set.add(name);
        this.className = [...set].join(' ');
      },
      remove: (...names) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        for (const name of names) set.delete(name);
        this.className = [...set].join(' ');
      },
      toggle: (name, force) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        const shouldAdd = force ?? !set.has(name);
        if (shouldAdd) set.add(name);
        else set.delete(name);
        this.className = [...set].join(' ');
        return shouldAdd;
      },
      contains: (name) => (this.className || '').split(/\s+/).includes(name)
    };
  }

  get isConnected() {
    return this.parent != null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
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
    if (selector === '.confirm-card__actions') {
      return this.children.find(child => child.className === 'confirm-card__actions') ?? null;
    }
    if (selector === '.confirm-card__receipt') {
      const actions = this.children.find(child => child.className === 'confirm-card__actions');
      return actions?.children?.find(child => child.className === 'confirm-card__receipt')
        ?? this.children.find(child => child.className === 'confirm-card__receipt')
        ?? null;
    }
    if (selector?.startsWith?.('[') && selector.endsWith(']')) {
      const attr = selector.slice(1, -1);
      return this.children.find(child => child.attributes?.has(attr)) ?? null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-agent-slug]') {
      return this.children.filter(child => child.dataset?.agentSlug);
    }
    if (selector === 'button, input, textarea, select') {
      const out = [];
      const walk = (node) => {
        if (/^(button|input|textarea|select)$/i.test(node.tagName)) out.push(node);
        for (const child of node.children ?? []) walk(child);
      };
      walk(this);
      return out;
    }
    if (selector?.startsWith?.('[') && selector.endsWith(']')) {
      const attr = selector.slice(1, -1);
      return this.children.filter(child => child.attributes?.has(attr));
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
      ['#agent-protocol-pills', new FakeElement('div')],
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

function findProposalCard(list, token = 'record-proposal') {
  return list.children.find(child => child.className.includes(token));
}

function findProposalButton(proposal, token) {
  const actions = proposal.children.find(child => child.className === 'confirm-card__actions');
  return actions?.children.find(child => child.className.includes(token)) ?? null;
}

function proposalHasConfirmButton(item) {
  if (item.className.includes('record-proposal__confirm')) return true;
  const actions = item.children?.find(child => child.className === 'confirm-card__actions');
  return actions?.children?.some(child => child.className.includes('record-proposal__confirm')) ?? false;
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

function workoutRecord() {
  return {
    schema_version: 1,
    id: 'workout-1',
    type: 'workout',
    date: '2026-08-05',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    source: 'chat',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'completed',
    exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }]
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
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
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
  const proposal = findProposalCard(list);
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

  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
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
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.match(
    proposal.querySelector('.confirm-card__receipt')?.textContent
      ?? nodeText(proposal),
    /Saved/
  );
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
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
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
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.match(
    proposal.querySelector('.confirm-card__receipt')?.textContent
      ?? nodeText(proposal),
    /Saved/
  );
  assert.match(root.querySelector('#chat-error').textContent, /Day One email didn.t send/i);
});

test('confirming a completed workout with a reported PB appends an in-voice Chadwick hype line', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: workoutRecord(),
    path: 'data/fitness/2026/08/2026-08-05-workout-completed.md',
    confirmImpl: async () => ({
      ok: true,
      centralNodeUpdated: true,
      personalBests: [{ name: 'Chest Press', best_weight_kg: 32, previous_best_weight_kg: 30 }]
    })
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Chadwick, log today\'s session');

  const list = root.querySelector('#chat-messages');
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  const hype = list.children.find(child =>
    child.className.includes('chat-message--assistant')
    && (child.querySelector?.('.chat-message__body')?.textContent ?? '').includes('Chest Press')
  );
  assert.ok(hype, 'expected an appended hype line naming the exercise that hit a PB');
  const body = hype.querySelector('.chat-message__body').textContent;
  assert.match(body, /PB/i);
  assert.match(body, /32/);
  assert.match(body, /\+2/, 'should call out the specific kg beaten, not a generic line');
});

test('confirming a completed workout with no PB does not append a hype line', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: workoutRecord(),
    path: 'data/fitness/2026/08/2026-08-05-workout-completed.md',
    confirmImpl: async () => ({ ok: true, centralNodeUpdated: true, personalBests: [] })
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Chadwick, log today\'s session');

  const list = root.querySelector('#chat-messages');
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
  const bubbleCountBefore = list.children.length;
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(list.children.length, bubbleCountBefore, 'no extra bubble should be appended when there is no PB');
});

test('a non-workout confirm never appends a PB hype line even if personalBests is somehow present', async () => {
  const root = new FakeDocument();
  const chatApi = fakeChatApi({
    record: skincareRecord(),
    path: '2026/2026-08-02-hyaluronica-skincare.md',
    confirmImpl: async () => ({ ok: true, personalBests: [{ name: 'Chest Press', best_weight_kg: 32, previous_best_weight_kg: 30 }] })
  });
  const controller = createChatController({ root, chatApi });

  await controller.send('Hyaluronica, log tonight\'s routine');

  const list = root.querySelector('#chat-messages');
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  const hype = list.children.find(child =>
    child.className.includes('chat-message--assistant')
    && (child.querySelector?.('.chat-message__body')?.textContent ?? '').includes('Chest Press')
  );
  assert.equal(hype, undefined);
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
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');

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

function nodeText(node) {
  if (node.children?.length) return node.children.map(nodeText).join('');
  return node.textContent ?? '';
}

function bubbleText(bubble) {
  const body = bubble.children.find(child => child.className === 'chat-message__body');
  return nodeText(body ?? bubble);
}

test('a markdown heading in streamed text starts a new bubble instead of one growing wall of text', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Here is the picture.\n# Claim\nProtein is the lever.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('brisket, what should I eat');

  const bubbles = messageBubbles(root);
  assert.equal(bubbles.length, 3, 'expected the user bubble plus two separate assistant bubbles');
  assert.equal(bubbleText(bubbles[1]), 'Here is the picture.');
  assert.match(bubbleText(bubbles[2]), /Claim/);
  assert.match(bubbleText(bubbles[2]), /Protein is the lever/);
});

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
  assert.match(bubbles[2].className, /chat-message--structured/);
  assert.match(nodeText(bubbles[2]), /Searched the web/);
  assert.match(nodeText(bubbles[2]), /McChicken nutrition/);
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
  clock += 60_000; // one minute later, still well inside the 45-minute window
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
  clock += 46 * 60_000; // just past the 45-minute memory window
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
  clock += 46 * 60_000;
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

test('shows an in-character wait line immediately and clears it when real text arrives', async () => {
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
  await controller.selectAgent('chadwick');
  const pending = controller.send('build today\'s session');
  await flushMicrotasks();

  const during = messageBubbles(root);
  assert.equal(during.length, 2);
  assert.equal(isAgentStatusLine('chadwick', bubbleText(during[1])), true);
  assert.equal(isGenericStatusCopy(bubbleText(during[1])), false);

  resolveGate();
  await pending;

  const after = messageBubbles(root);
  assert.equal(after.length, 2);
  assert.equal(bubbleText(after[1]), 'Here is the plan.');
  assert.equal(after.every(bubble => !isAgentStatusLine('chadwick', bubbleText(bubble))), true);
});

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
  await controller.selectAgent('brisket');
  const pending = controller.send('log a quest bar');
  await flushMicrotasks();

  const duringStatus = statusBubbles(root);
  assert.equal(duringStatus.length, 1, 'exactly one sticky status bubble should exist while waiting');
  assert.equal(isAgentStatusLine('brisket', bubbleText(duringStatus[0])), true);
  assert.equal(isGenericStatusCopy(bubbleText(duringStatus[0])), false);
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
    after.every(bubble => !isGenericStatusCopy(bubbleText(bubble))),
    true,
    'no leftover generic status copy should remain in any bubble'
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
    after.every(bubble => !isGenericStatusCopy(bubbleText(bubble))),
    true,
    'no leftover generic status copy should remain in any bubble'
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

test('the status bubble rotates Brisket wait lines across a full research turn, then clears on text', async () => {
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
  await controller.selectAgent('brisket');
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

  assert.equal(seenStatuses.length, 3);
  assert.ok(seenStatuses.every(line => isAgentStatusLine('brisket', line)));
  assert.ok(seenStatuses.every(line => !isGenericStatusCopy(line)));
  assert.notEqual(seenStatuses[0], seenStatuses[1], 'search should rotate off the opening wait line');
  assert.notEqual(seenStatuses[1], seenStatuses[2], 'library save should rotate off the search wait line');
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
    agentColour: (_config, slug) => (slug === 'chadwick' ? '#D9683A' : '#000'),
    getAgentsConfig: () => ({ agents: [] })
  });

  await controller.send('hey chadwick');

  assert.equal(root.querySelector('#chat-view').style.getPropertyValue('--agent-accent'), '#D9683A');
});

function findChoiceCard(root) {
  const list = root.querySelector('#chat-messages');
  const item = list.children.find(child => String(child.className).includes('chat-message--structured'));
  return item?.children?.[0] ?? null;
}

function findChoiceOption(card, id) {
  const walk = (node) => {
    if (node?.dataset?.choiceId === id) return node;
    for (const child of node?.children ?? []) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  return walk(card);
}

function findChoiceConfirm(card) {
  const walk = (node) => {
    if (String(node?.className || '').includes('btn--primary')) return node;
    for (const child of node?.children ?? []) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  return walk(card);
}

test('confirming a second-opinion choice pins that agent for the next send', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      if (sendCalls.length === 1) {
        yield { type: 'agent', slug: 'hammond' };
        yield {
          type: 'choice',
          title: 'Ask for a second look?',
          hint: 'Another agent can append to “AOTFW sources”.',
          confirmLabel: 'Ask',
          choices: [
            { id: 'sara', label: 'Ask Sara about AOTFW sources' },
            { id: 'chadwick', label: 'Ask Chadwick about AOTFW sources' },
            { id: 'clare', label: 'Ask Clare about AOTFW sources' },
            { id: 'ann', label: 'Ask Ann about AOTFW sources' }
          ]
        };
        yield { type: 'done' };
        return;
      }
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'text', delta: 'Looking at the block.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root,
    chatApi,
    getDefaultAgentSlug: () => 'hammond'
  });

  await controller.send('Log the AOTFW decision');
  assert.equal(sendCalls[0].priorAgentSlug, 'hammond');

  const card = findChoiceCard(root);
  assert.ok(card, 'a second-opinion choice card should have been appended');
  findChoiceOption(card, 'chadwick').dispatchEvent(new Event('click'));
  findChoiceConfirm(card).dispatchEvent(new Event('click'));
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].priorAgentSlug, 'chadwick');
  assert.equal(controller.getSelectedAgentSlug(), 'chadwick');
});

test('selectAgent updates accent immediately from roster even without agentsConfig', () => {
  const root = new FakeDocument();
  const controller = createChatController({
    root,
    chatApi: { async *send() { yield { type: 'done' }; } },
    agentColour,
    getAgentsConfig: () => null
  });

  controller.selectAgent('hyaluronica');
  assert.equal(
    root.querySelector('#chat-view').style.getPropertyValue('--agent-accent'),
    '#C7AEEA'
  );
  controller.selectAgent('brisket');
  assert.equal(
    root.querySelector('#chat-view').style.getPropertyValue('--agent-accent'),
    '#EEB046'
  );
});

function protocolButtons(root) {
  const host = root.querySelector('#agent-protocol-pills');
  return host?.children?.[1]?.children ?? [];
}

test('selecting an agent reveals that character’s protocol pills', async () => {
  const root = new FakeDocument();
  const controller = createChatController({
    root,
    chatApi: { async *send() { yield { type: 'done' }; } }
  });
  await controller.selectAgent('brisket');
  const labels = protocolButtons(root).map(button => (
    button.children.find(child => child.className === 'agent-protocol-pills__label')?.textContent
    ?? button.textContent
  ));
  assert.deepEqual(labels, [
    'Log a meal',
    'Flare-up eating',
    'Weekend / eating out',
    'Plan the rest of today',
    'Why I ate that'
  ]);
  assert.equal(root.querySelector('#agent-protocol-pills').hidden, false);
});

test('tapping a protocol pill steers the next turn without a canned assistant blurb', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Shoot, buddy — let’s walk that flare like we mean it.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.selectAgent('brisket');
  await controller.selectProtocol('flare-up');

  assert.equal(sendCalls[0].message, 'Flare-up eating');
  assert.equal(sendCalls[0].protocolId, 'flare-up');
  assert.equal(controller.getSelectedProtocolId(), 'flare-up');
  assert.equal(
    messageBubbles(root).some(bubble => /Active flare-up protocol|hog-tying|polyphenol/i.test(bubbleText(bubble))),
    false,
    'pill tap must not inject the mock description'
  );
  assert.ok(messageBubbles(root).some(bubble => /walk that flare/i.test(bubbleText(bubble))));
});

test('a typed message plus a selected protocol sends both', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, protocolId: options.protocolId });
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'text', delta: 'Let’s build it, bro.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.selectAgent('chadwick');
  root.querySelector('#chat-input').value = 'keep it to 30 minutes';
  await controller.selectProtocol('next-session');

  assert.equal(sendCalls[0].message, 'keep it to 30 minutes');
  assert.equal(sendCalls[0].protocolId, 'next-session');
  assert.equal(root.querySelector('#chat-input').value, '');
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
    messageBubbles(root).every(b => !isGenericStatusCopy(bubbleText(b))),
    'generic wait copy must not linger'
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

test('partial text without a done event shows cut-off recovery (dropped stream / 60s kill)', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Mostly from that skim milk — nic' };
      // Stream dies — no done event (Netlify sync kill / dropped SSE).
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('large skinny latte');
  assert.ok(messageBubbles(root).some(b => bubbleText(b).includes(EMPTY_TURN_RECOVERY)));
});

test('turn_incomplete error shows cut-off recovery even after partial text', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'vera' };
      yield { type: 'text', delta: 'When you pic' };
      yield { type: 'error', code: 'turn_incomplete' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('keep going');
  assert.ok(messageBubbles(root).some(b => bubbleText(b).includes(EMPTY_TURN_RECOVERY)));
});

test('clearUnread notifies listeners that chat is read, independent of any send', () => {
  const root = new FakeDocument();
  const chatApi = { async *send() {} };
  const { calls, onUnreadChange } = unreadCalls();
  const controller = createChatController({ root, chatApi, onUnreadChange });

  controller.clearUnread();

  assert.deepEqual(calls, [false]);
});

test('nudge when Chadwick dumps a numbered plan with no record_proposal', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield {
        type: 'text',
        delta: [
          "Here's the plan:",
          '1. Bar Press — Set 1: 10 reps x 30kg (cable: constant force)',
          '2. Bar Row — Set 1: 10 reps x 27kg (cable: constant force)',
          '3. Bar Squat — Set 1: 10 reps x 25kg (cable: none)',
          '4. Seated Curl — Set 1: 12 reps x 8kg (cable: constant force)'
        ].join('\n')
      };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('build a full body session');

  const bubbles = messageBubbles(root);
  assert.ok(
    bubbles.some(bubble => /lock it onto Fitness/i.test(bubbleText(bubble)) && /Confirm card/i.test(bubbleText(bubble))),
    'expected a nudge when Chadwick listed a plan in chat only'
  );

  const planBody = bubbles
    .map(bubble => bubble.children.find(child => child.className === 'chat-message__body'))
    .find(body => findNestedClass(body, 'chat-workout'));
  assert.ok(planBody, 'expected the dumped plan to render as a structured workout');
  const exercises = findNestedClass(planBody, 'chat-workout__exercises');
  assert.equal(exercises.children.length, 4);
  assert.equal(findNestedClass(exercises.children[0], 'chat-workout__name').textContent, 'Bar Press');
  assert.equal(findNestedClass(exercises.children[0], 'chat-workout__set-load').textContent, '10 × 30 kg');
});

test('nudge when Brisket claims in the books without a Confirm card', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: "It's in the books, buddy." };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('log lunch');
  assert.ok(
    messageBubbles(root).some(b => /stayed in chat only/i.test(bubbleText(b)) && /Confirm card/i.test(bubbleText(b))),
    'expected a missing-log nudge when Brisket claimed a save without proposing'
  );
});

function findNestedClass(node, name) {
  const classes = String(node?.className ?? '').split(/\s+/);
  if (classes.includes(name)) return node;
  for (const child of node?.children ?? []) {
    const found = findNestedClass(child, name);
    if (found) return found;
  }
  return null;
}

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

test('a long Chadwick plan is sent in history with the numbered list still intact', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const plan = [
    `${'Bro. '.repeat(300)}Here's the full session:`,
    '1. Bar Press — 10x30kg',
    '2. Bar Row — 10x27kg',
    '3. Bar Squat — 10x25kg',
    '10. One Grip Russian Twist — 20x6kg'
  ].join('\n');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'text', delta: sendCalls.length === 1 ? plan : 'Locked.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('option b');
  await controller.send('ok lets put it into action');

  const historyText = sendCalls[1].history.map(entry => entry.content).join('\n');
  assert.match(historyText, /One Grip Russian Twist/);
  assert.match(historyText, /Bar Press/);
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
    agentColour: () => '#8F373E',
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
    '#8F373E'
  );

  await controller.send('starting fresh');
  assert.deepEqual(sendCalls[1].history, []);
  assert.equal(sendCalls[1].priorAgentSlug, 'penelope');
});

test('Hammond Central Node audit starts a triage auditSession on send', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Session triage first. What is weighing on you?' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit');

  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].auditSession, {
    kind: 'cn_audit',
    phase: 'triage',
    intakeCount: 0
  });
});

test('after a successful triage turn the next send advances auditSession to intake', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: sendCalls.length === 1 ? 'Triage done. Concerns?' : 'Noted.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit');
  await controller.send('work stress');

  assert.equal(sendCalls.length, 2);
  assert.deepEqual(sendCalls[0].auditSession, {
    kind: 'cn_audit',
    phase: 'triage',
    intakeCount: 0
  });
  assert.deepEqual(sendCalls[1].auditSession, {
    kind: 'cn_audit',
    phase: 'intake',
    intakeCount: 1
  });
});

test('selecting another agent clears auditSession so later sends omit it', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: sendCalls.length === 1 ? 'hammond' : 'brisket' };
      yield { type: 'text', delta: 'Ok.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit');
  controller.selectAgent('brisket');
  await controller.send('log lunch');

  assert.ok(sendCalls[0].auditSession);
  assert.equal(sendCalls[1].auditSession, undefined);
});

test('stream naming a non-Hammond agent clears auditSession for the next send', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      if (sendCalls.length === 1) {
        yield { type: 'agent', slug: 'hammond' };
        yield { type: 'text', delta: 'Triage first.' };
      } else if (sendCalls.length === 2) {
        yield { type: 'agent', slug: 'brisket' };
        yield { type: 'text', delta: 'Logging lunch instead.' };
      } else {
        yield { type: 'agent', slug: 'brisket' };
        yield { type: 'text', delta: 'Done.' };
      }
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit');
  await controller.send('actually log lunch');
  await controller.send('and a snack');

  assert.ok(sendCalls[0].auditSession);
  assert.equal(sendCalls[2].auditSession, undefined);
});

test('cancel audit clears auditSession so the cancel send omits it', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Understood.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit');
  await controller.send('cancel audit');
  await controller.send('what is the protein target?');

  assert.ok(sendCalls[0].auditSession);
  assert.equal(sendCalls[1].auditSession, undefined, 'cancel turn itself must not attach auditSession');
  assert.equal(sendCalls[2].auditSession, undefined);
});

test('non-trigger Hammond messages without a session do not attach auditSession', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Target stays 180g.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root,
    chatApi,
    getDefaultAgentSlug: () => 'hammond'
  });

  await controller.send('what is the protein target?');

  assert.equal(sendCalls[0].auditSession, undefined);
});

test('startNewChat clears auditSession so the next send omits it', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Ok.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root,
    chatApi,
    getDefaultAgentSlug: () => 'hammond'
  });

  await controller.send('Hammond, Central Node audit');
  controller.startNewChat();
  await controller.send('what is the protein target?');

  assert.ok(sendCalls[0].auditSession);
  assert.equal(sendCalls[1].auditSession, undefined);
});

test('skip intake advances the next send toward stale_drift', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Moving on.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit');
  await controller.send('skip intake');
  await controller.send('continue');

  assert.deepEqual(sendCalls[1].auditSession, {
    kind: 'cn_audit',
    phase: 'intake',
    intakeCount: 1
  });
  assert.deepEqual(sendCalls[2].auditSession, {
    kind: 'cn_audit',
    phase: 'stale_drift',
    intakeCount: 2
  });
});

test('empty-turn recovery does not advance the audit phase', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      if (sendCalls.length === 1) {
        yield { type: 'done' };
        return;
      }
      yield { type: 'text', delta: 'Retry landed.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit');
  await controller.send('still waiting');

  assert.deepEqual(sendCalls[0].auditSession, {
    kind: 'cn_audit',
    phase: 'triage',
    intakeCount: 0
  });
  assert.deepEqual(sendCalls[1].auditSession, {
    kind: 'cn_audit',
    phase: 'triage',
    intakeCount: 0
  });
});

test('lock phase does not end the audit until governance_log_appended fires', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let turn = 0;
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      turn += 1;
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: `phase turn ${turn}` };
      // Walk triage → intake(skip) → stale_drift → open_loops → lock, then
      // two lock turns: first without the tool SSE, second with it.
      if (turn === 6) {
        yield { type: 'governance_log_appended', entryType: 'Closed Loop Review' };
      }
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('Hammond, Central Node audit'); // [0] triage → intake
  await controller.send('skip intake'); // [1] intake → stale_drift
  await controller.send('drift notes'); // [2] stale_drift → open_loops
  await controller.send('open loops'); // [3] open_loops → lock
  await controller.send('lock without tool'); // [4] lock, no SSE → stays lock
  assert.deepEqual(sendCalls[4].auditSession, {
    kind: 'cn_audit',
    phase: 'lock',
    intakeCount: 2
  });

  await controller.send('lock with tool'); // [5] still lock session on the wire
  assert.deepEqual(sendCalls[5].auditSession, {
    kind: 'cn_audit',
    phase: 'lock',
    intakeCount: 2
  });

  await controller.send('after lock'); // [6] previous turn appended → session cleared
  assert.equal(sendCalls[6].auditSession, undefined);
});

test('cn_patch_proposal Confirm posts kind cn_patch with the patch candidate', async () => {
  const root = new FakeDocument();
  const patch = {
    section: 'constraints',
    op: 'delete_lines',
    payload: { match: 'Steroid taper', summary: 'Remove taper constraint' }
  };
  const confirmCalls = [];
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'cn_patch_proposal', patch };
      yield { type: 'done' };
    },
    async confirm(payload) {
      confirmCalls.push(payload);
      return { path: 'central-node.md', summary: patch.payload.summary };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('Hammond, clear the taper flag');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className.includes('cn-patch-proposal'));
  assert.ok(proposal, 'expected a CN patch proposal card');
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(confirmCalls.length, 1);
  assert.equal(confirmCalls[0].kind, 'cn_patch');
  assert.equal(confirmCalls[0].slug, 'hammond');
  assert.deepEqual(confirmCalls[0].candidate, patch);
  assert.match(
    proposal.querySelector('.confirm-card__receipt')?.textContent
      ?? nodeText(proposal),
    /Central Node updated: Remove taper constraint/
  );
});

test('cn_patch_proposal Confirm includes the pending id when the propose SSE carried one', async () => {
  const root = new FakeDocument();
  const patch = {
    section: 'long_term_trends',
    op: 'condense',
    payload: { summary: 'Condense Trends' }
  };
  const confirmCalls = [];
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'cn_patch_proposal', patch, id: 'cnp_abc123' };
      yield { type: 'done' };
    },
    async confirm(payload) {
      confirmCalls.push(payload);
      return { path: 'central-node.md', summary: patch.payload.summary };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('Hammond, run the weekly review');

  const list = root.querySelector('#chat-messages');
  const proposal = findProposalCard(list);
  const confirmButton = findProposalButton(proposal, 'record-proposal__confirm');
  confirmButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(confirmCalls.length, 1);
  assert.equal(confirmCalls[0].id, 'cnp_abc123');
  assert.deepEqual(confirmCalls[0].candidate, patch);
});

test('cn_patch_proposal Discard also dismisses the server-side queue entry when an id is present', async () => {
  const root = new FakeDocument();
  const patch = {
    section: 'long_term_trends',
    op: 'condense',
    payload: { summary: 'Condense Trends' }
  };
  const confirmCalls = [];
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'cn_patch_proposal', patch, id: 'cnp_abc123' };
      yield { type: 'done' };
    },
    async confirm(payload) {
      confirmCalls.push(payload);
      return { ok: true };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('Hammond, run the weekly review');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className.includes('cn-patch-proposal'));
  const discardButton = findProposalButton(proposal, 'record-proposal__discard');
  discardButton.dispatchEvent(new Event('click'));
  await flushMicrotasks();

  assert.equal(list.children.includes(proposal), false);
  assert.equal(confirmCalls.length, 1);
  assert.equal(confirmCalls[0].kind, 'cn_patch_dismiss');
  assert.equal(confirmCalls[0].id, 'cnp_abc123');
});

test('cn_patch_proposal Discard removes the card without confirming', async () => {
  const root = new FakeDocument();
  const patch = {
    section: 'constraints',
    op: 'delete_lines',
    payload: { match: 'Steroid taper', summary: 'Remove taper constraint' }
  };
  const confirmCalls = [];
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'cn_patch_proposal', patch };
      yield { type: 'done' };
    },
    async confirm(payload) {
      confirmCalls.push(payload);
      return { path: 'central-node.md', summary: patch.payload.summary };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('Hammond, clear the taper flag');

  const list = root.querySelector('#chat-messages');
  const proposal = list.children.find(child => child.className.includes('cn-patch-proposal'));
  const discardButton = findProposalButton(proposal, 'record-proposal__discard');
  discardButton.dispatchEvent(new Event('click'));

  assert.equal(confirmCalls.length, 0);
  assert.equal(list.children.includes(proposal), false);
});

test('record_saved appends the summary without a Confirm card and notifies onRecordWritten', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'vera' };
      yield {
        type: 'record_saved',
        summary: 'Logged a mind session (Weekend permission).',
        record: { type: 'mind_session' }
      };
      yield { type: 'done' };
    }
  };
  const written = [];
  const controller = createChatController({
    root, chatApi, onRecordWritten: event => written.push(event)
  });
  await controller.send('that is enough for today');

  const list = root.querySelector('#chat-messages');
  const summary = 'Logged a mind session (Weekend permission).';
  const hasSummary = list.children.some(item =>
    (item.querySelector?.('.chat-message__body')?.textContent ?? '') === summary
  );
  assert.ok(hasSummary, 'expected the record_saved summary in a message body');

  const hasConfirm = list.children.some(item => proposalHasConfirmButton(item));
  assert.equal(hasConfirm, false, 'auto-saved sessions must not show a Confirm card');
  assert.equal(written.length, 1);
  assert.equal(written[0].type, 'record_saved');
  assert.equal(written[0].summary, summary);
});

test('record_saved summary is included in chat history for the next turn', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-26T07:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'vera' };
      if (sendCalls.length === 1) {
        yield {
          type: 'record_saved',
          summary: 'Logged a mind session (Weekend permission).',
          record: { type: 'mind_session' }
        };
      } else {
        yield { type: 'text', delta: 'It is saved.' };
      }
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi, now: () => clock });

  await controller.send('close the session');
  clock += 60_000;
  await controller.send('did it log?');

  assert.deepEqual(sendCalls[1].history, [
    { role: 'user', content: 'close the session' },
    { role: 'assistant', content: 'Logged a mind session (Weekend permission).' }
  ]);
});

test('central_node_patched appends a success chat line without using the error banner', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'central_node_patched', summary: 'Direct Brisket to hold surplus', risk: 'auto' };
      yield { type: 'done' };
    },
    async confirm() {
      throw new Error('confirm should not be called');
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('Hammond, nudge Brisket');

  assert.equal(root.querySelector('#chat-error').textContent, '');
  const list = root.querySelector('#chat-messages');
  const success = list.children.find(child =>
    child.className.includes('chat-message--assistant')
    && (child.querySelector?.('.chat-message__body')?.textContent
      ?? child.children.find(node => node.className === 'chat-message__body')?.textContent
      ?? '') === 'Central Node updated: Direct Brisket to hold surplus'
  );
  assert.ok(success, 'expected an assistant success line for the auto CN patch');
});

const VERA_FLUSH = "That's enough for today — record the session if there is one.";

function veraChatApi(sendCalls, { onSend } = {}) {
  return {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      if (onSend) await onSend(message, options);
      yield { type: 'agent', slug: 'vera' };
      yield { type: 'text', delta: 'What came up today?' };
      yield { type: 'done' };
    }
  };
}

test('New Chat after a Vera reply sends a hidden flush then clears the thread', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const controller = createChatController({
    root,
    chatApi: veraChatApi(sendCalls),
    getDefaultAgentSlug: () => 'hammond'
  });

  controller.selectAgent('vera');
  await controller.send('I am tired');
  assert.equal(sendCalls.length, 1);

  await controller.startNewChat();

  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].message, VERA_FLUSH);
  assert.deepEqual(sendCalls[1].history, [
    { role: 'user', content: 'I am tired' },
    { role: 'assistant', content: 'What came up today?' }
  ]);
  assert.equal(sendCalls[1].priorAgentSlug, 'vera');
  assert.equal(messageBubbles(root).length, 0);
  assert.equal(
    messageBubbles(root).some(bubble => bubbleText(bubble).includes(VERA_FLUSH)),
    false
  );
  assert.equal(controller.getSelectedAgentSlug(), 'vera');
});

test('New Chat does not flush Penelope threads', async () => {
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
  const controller = createChatController({ root, chatApi });
  controller.selectAgent('penelope');
  await controller.send('rough morning');
  controller.startNewChat();
  assert.equal(sendCalls.length, 1);
  assert.equal(messageBubbles(root).length, 0);
});

test('New Chat skips flush after mind_session record_saved this thread', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'vera' };
      yield {
        type: 'record_saved',
        summary: 'Logged a mind session.',
        record: { type: 'mind_session' }
      };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  controller.selectAgent('vera');
  await controller.send('that is enough');
  await controller.startNewChat();
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].message, 'that is enough');
});

test('New Chat skips flush when Vera was pinned but never replied', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const controller = createChatController({
    root,
    chatApi: veraChatApi(sendCalls)
  });
  controller.selectAgent('vera');
  await controller.startNewChat();
  assert.equal(sendCalls.length, 0);
});

test('switching from Vera to Penelope flushes then pins Penelope', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const controller = createChatController({
    root,
    chatApi: veraChatApi(sendCalls),
    getDefaultAgentSlug: () => 'hammond'
  });
  controller.selectAgent('vera');
  await controller.send('I am tired');
  await controller.selectAgent('penelope');
  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].message, VERA_FLUSH);
  assert.equal(controller.getSelectedAgentSlug(), 'penelope');
});

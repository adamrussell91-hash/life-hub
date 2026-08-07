import test from 'node:test';
import assert from 'node:assert/strict';
import { appendMessage, appendRecordProposal, renderInlineMarkdown } from '../../js/app/render-chat.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.textContent = '';
    this.hidden = false;
    this.children = [];
    this.parent = null;
    this.scrollTop = 0;
    this.scrollHeight = 0;
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
}

class FakeDocument {
  constructor() {
    this.elements = new Map([['#chat-messages', new FakeElement('ul')]]);
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  querySelectorAll() {
    return [];
  }
}

test('renderInlineMarkdown renders **bold** segments as strong elements and the rest as plain spans', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Now **452 calories**, buddy.');

  assert.equal(bubble.children.length, 3);
  assert.equal(bubble.children[0].tagName, 'span');
  assert.equal(bubble.children[0].textContent, 'Now ');
  assert.equal(bubble.children[1].tagName, 'strong');
  assert.equal(bubble.children[1].textContent, '452 calories');
  assert.equal(bubble.children[2].tagName, 'span');
  assert.equal(bubble.children[2].textContent, ', buddy.');
});

test('renderInlineMarkdown re-renders cleanly on repeated calls (streaming updates)', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Now **45');
  renderInlineMarkdown(root, bubble, 'Now **452 calories**.');

  assert.equal(bubble.children.length, 3);
  assert.equal(bubble.children[1].tagName, 'strong');
  assert.equal(bubble.children[1].textContent, '452 calories');
  assert.equal(bubble.children[2].textContent, '.');
});

test('renderInlineMarkdown treats plain text with no markers as a single span', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Just plain text here.');

  assert.equal(bubble.children.length, 1);
  assert.equal(bubble.children[0].tagName, 'span');
  assert.equal(bubble.children[0].textContent, 'Just plain text here.');
});

test('appendMessage still sets plain textContent for simple system-style bubbles', () => {
  const root = new FakeDocument();
  const item = appendMessage(root, { role: 'assistant', text: '🔍 Searched the web: pizza' });
  const body = item.children.find(child => child.className === 'chat-message__body');
  assert.equal(body.textContent, '🔍 Searched the web: pizza');
  assert.equal(item.className, 'chat-message chat-message--assistant');
});

test('renderInlineMarkdown groups consecutive "- " lines into a single bulleted list', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'Notes:\n- First point\n- Second point with **bold**', { multiline: true });

  assert.equal(container.children.length, 2);
  const [paragraph, list] = container.children;
  assert.equal(paragraph.tagName, 'p');
  assert.equal(paragraph.children[0].textContent, 'Notes:');
  assert.equal(list.tagName, 'ul');
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].tagName, 'li');
  assert.equal(list.children[0].children[0].textContent, 'First point');
  assert.equal(list.children[1].children[0].textContent, 'Second point with ');
  assert.equal(list.children[1].children[1].tagName, 'strong');
  assert.equal(list.children[1].children[1].textContent, 'bold');
});

test('renderInlineMarkdown starts a fresh list when bullet lines are interrupted by a paragraph', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n- Two\nInterruption.\n- Three', { multiline: true });

  assert.equal(container.children.length, 3);
  assert.equal(container.children[0].tagName, 'ul');
  assert.equal(container.children[0].children.length, 2);
  assert.equal(container.children[1].tagName, 'p');
  assert.equal(container.children[1].children[0].textContent, 'Interruption.');
  assert.equal(container.children[2].tagName, 'ul');
  assert.equal(container.children[2].children.length, 1);
});

test('renderInlineMarkdown skips blank lines between paragraphs', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'First.\n\nSecond.', { multiline: true });

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].children[0].textContent, 'First.');
  assert.equal(container.children[1].children[0].textContent, 'Second.');
});

test('renderInlineMarkdown re-renders cleanly when switching from multi-line to single-line output', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n- Two', { multiline: true });
  renderInlineMarkdown(root, container, 'Plain text.');

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'span');
  assert.equal(container.children[0].textContent, 'Plain text.');
});

test('renderInlineMarkdown without { multiline: true } renders embedded newlines as flat text, matching the original single-pass behaviour exactly', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'Here are the options:\n- Option A\n- Option B');

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'span');
  assert.equal(container.children[0].textContent, 'Here are the options:\n- Option A\n- Option B');
});

test('appendRecordProposal adds a read-only exercises summary with cable types', () => {
  const root = new FakeDocument();
  const { card } = appendRecordProposal(root, {
    path: 'data/fitness/2026/07/2026-07-30-test.md',
    record: {
      type: 'workout',
      date: '2026-07-30',
      title: 'Chest and Curls',
      session_kind: 'strength',
      status: 'completed',
      exercises: [{
        name: 'Chest Press',
        bench_angle_deg: 0,
        sets: [
          { reps: 10, weight_kg: 32, cable_type: 'concentric' },
          { reps: 8, weight_kg: 34, cable_type: 'concentric' }
        ]
      }, {
        name: 'Bicep Curl',
        sets: [{ reps: 12, weight_kg: 12, cable_type: 'constant_force' }]
      }]
    },
    notes: 'Good session.'
  });

  const summary = card.children.find(child => child.className === 'record-proposal__exercises');
  assert.ok(summary);
  assert.equal(summary.tagName, 'ul');
  assert.equal(summary.children.length, 2);
  assert.equal(summary.children[0].children[0].tagName, 'strong');
  assert.match(summary.children[0].children[0].textContent, /Chest Press @ 0°/);
  assert.match(summary.children[0].children[1].textContent, /Set 1: 32 kg × 10 reps · cable: concentric/);
  assert.match(summary.children[1].children[0].textContent, /Bicep Curl/);
  assert.match(summary.children[1].children[1].textContent, /cable: constant force/);
});

test('renderInlineMarkdown keeps bullet lines in one list even when a blank line separates them', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n\n- Two', { multiline: true });

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'ul');
  assert.equal(container.children[0].children.length, 2);
  assert.equal(container.children[0].children[0].children[0].textContent, 'One');
  assert.equal(container.children[0].children[1].children[0].textContent, 'Two');
});

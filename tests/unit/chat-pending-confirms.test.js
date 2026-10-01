/**
 * Red-capable loop for Adam's missing Confirm cards:
 * live pending actions must paint into a sticky tray above the composer and
 * survive clearing the scrollable message thread (New chat / scroll-away).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureChatPendingConfirmsTray,
  mountPendingActionCards,
  pendingConfirmPublicFields,
  selectLivePendingActions
} from '../../apps/life/js/app/chat-pending-confirms.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.textContent = '';
    this.hidden = false;
    this.children = [];
    this.parent = null;
    this.attributes = new Map();
    this._html = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
      node.parent = this;
    }
  }

  prepend(...nodes) {
    for (const node of [...nodes].reverse()) {
      this.children.unshift(node);
      node.parent = this;
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    this.children = nodes;
    for (const node of nodes) node.parent = this;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      const walk = (node) => {
        if (node.id === id) return node;
        for (const child of node.children ?? []) {
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    }
    const pendingMatch = selector.match(/^\[data-pending-id="(.+)"\]$/);
    if (pendingMatch) {
      const want = pendingMatch[1].replace(/\\"/g, '"');
      const walk = (node) => {
        if (node.dataset?.pendingId === want || node.getAttribute?.('data-pending-id') === want) {
          return node;
        }
        for (const child of node.children ?? []) {
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const walk = (node) => {
        const classes = (node.className ?? '').split(/\s+/);
        if (classes.includes(cls)) return node;
        for (const child of node.children ?? []) {
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    if (selector === '[data-pending-id]' || selector.startsWith('[data-pending-id')) {
      const walk = (node) => {
        if (node.dataset?.pendingId || node.getAttribute?.('data-pending-id')) out.push(node);
        for (const child of node.children ?? []) walk(child);
      };
      walk(this);
      return out;
    }
    if (selector === '.record-proposal__confirm' || selector.startsWith('.')) {
      const cls = selector.slice(1);
      const walk = (node) => {
        const classes = (node.className ?? '').split(/\s+/);
        if (classes.includes(cls)) out.push(node);
        for (const child of node.children ?? []) walk(child);
      };
      walk(this);
    }
    return out;
  }

  remove() {
    if (!this.parent?.children) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  insertBefore(node, ref) {
    const idx = this.children.indexOf(ref);
    if (idx < 0) {
      this.append(node);
      return node;
    }
    this.children.splice(idx, 0, node);
    node.parent = this;
    return node;
  }
}

function buildChatRoot() {
  const view = new FakeElement('section');
  view.id = 'chat-view';
  view.className = 'chat-view';
  const messages = new FakeElement('ul');
  messages.id = 'chat-messages';
  messages.className = 'chat-messages';
  const form = new FakeElement('form');
  form.id = 'chat-form';
  form.className = 'chat-form';
  view.append(messages, form);

  const root = {
    elements: new Map([
      ['#chat-view', view],
      ['#chat-messages', messages],
      ['#chat-form', form]
    ]),
    querySelector(sel) {
      return this.elements.get(sel) ?? view.querySelector(sel);
    },
    querySelectorAll(sel) {
      return view.querySelectorAll(sel);
    },
    createElement(tag) {
      return new FakeElement(tag);
    }
  };
  return { root, view, messages, form };
}

test('selectLivePendingActions drops consumed/dismissed and keeps pending/executing', () => {
  const live = selectLivePendingActions([
    { id: 'a', status: 'pending', slug: 'clare', createdAt: '2026-09-01', proposal: { intent: 'A' } },
    { id: 'b', status: 'consumed', slug: 'clare', createdAt: '2026-09-01', proposal: { intent: 'B' } },
    { id: 'c', status: 'dismissed', slug: 'clare', createdAt: '2026-09-01', proposal: { intent: 'C' } },
    { id: 'd', status: 'executing', slug: 'clare', createdAt: '2026-09-01', proposal: { intent: 'D' } },
    { id: 'e', slug: 'clare', createdAt: '2026-09-01', proposal: { intent: 'E' } }
  ]);
  assert.deepEqual(live.map((row) => row.id), ['a', 'd', 'e']);
});

test('pendingConfirmPublicFields strips write content bodies (no secret dump to client)', () => {
  const pub = pendingConfirmPublicFields({
    id: 'act_1',
    slug: 'clare',
    createdAt: '2026-09-01',
    calendarGhostId: 'cg_1',
    proposal: {
      intent: 'Move Lisa review',
      agent: 'clare',
      surfaces: ['confirm_card', 'calendar'],
      writes: [
        {
          path: 'data/os/calendar-ghost-confirm/cg_1.md',
          mode: 'create',
          diff: 'Reschedule Lisa',
          content: 'SECRET_PAYLOAD_DO_NOT_SEND'
        }
      ]
    }
  });
  assert.equal(pub.id, 'act_1');
  assert.equal(pub.proposal.intent, 'Move Lisa review');
  assert.equal(pub.proposal.writes[0].diff, 'Reschedule Lisa');
  assert.equal(pub.proposal.writes[0].content, undefined);
  assert.equal(JSON.stringify(pub).includes('SECRET'), false);
});

test('sticky pending tray keeps Confirm cards after message list is cleared (Adam symptom)', () => {
  const { root, messages } = buildChatRoot();
  const tray = ensureChatPendingConfirmsTray(root);
  assert.ok(tray, 'tray mounts above the composer');
  assert.equal(tray.id, 'chat-pending-confirms');

  const pending = [
    {
      id: 'act_lisa',
      slug: 'clare',
      createdAt: '2026-10-01',
      proposal: {
        intent: "Review Lisa Khatchadourian's cover letter — 12:00–12:30pm today",
        writes: [{ path: 'tasks:task:1', mode: 'overwrite', diff: 'Lisa cover letter' }]
      }
    },
    {
      id: 'act_genevieve',
      slug: 'clare',
      createdAt: '2026-10-01',
      proposal: {
        intent: 'Genevieve Quoyle accreditation review — reschedule to 2:30–4:10pm',
        writes: [{ path: 'tasks:task:2', mode: 'overwrite', diff: 'Genevieve review' }]
      }
    }
  ];

  const mounted = mountPendingActionCards(root, pending, {
    appendActionProposal(r, { proposal }) {
      const list = r.querySelector('#chat-pending-confirms-list') || r.querySelector('#chat-messages');
      const card = r.createElement('li');
      card.className = 'record-proposal action-proposal confirm-card';
      card.dataset.pendingId = '';
      const confirm = r.createElement('button');
      confirm.className = 'btn btn--primary record-proposal__confirm';
      confirm.textContent = 'Confirm';
      card.append(confirm);
      const summary = r.createElement('p');
      summary.className = 'action-proposal__summary';
      summary.textContent = proposal.intent;
      card.append(summary);
      list.append(card);
      return { card, confirm, discard: r.createElement('button'), acceptedPaths: () => [] };
    },
    bindActionProposal(ui, proposal, id) {
      ui.card.dataset.pendingId = id;
      ui.card.dataset.intent = proposal.intent;
    }
  });

  assert.equal(mounted.length, 2);
  const confirmsBefore = tray.querySelectorAll('.record-proposal__confirm');
  assert.equal(confirmsBefore.length, 2, 'Confirm buttons must be in the sticky tray');
  assert.match(tray.textContent + mounted.map((m) => m.card.dataset.intent).join('\n'), /Lisa Khatchadourian/);

  // New chat / thread reset clears the scrollable transcript — cards must stay.
  messages.replaceChildren();
  assert.equal(messages.children.length, 0);
  const confirmsAfter = tray.querySelectorAll('.record-proposal__confirm');
  assert.equal(confirmsAfter.length, 2, 'Confirm cards must survive clearing #chat-messages');
  assert.equal(tray.hidden, false);
});

test('mountPendingActionCards dedupes by pending id so SSE + hydrate do not twin', () => {
  const { root } = buildChatRoot();
  ensureChatPendingConfirmsTray(root);
  let appendCount = 0;
  const opts = {
    appendActionProposal(r) {
      appendCount += 1;
      const list = r.querySelector('#chat-pending-confirms-list');
      const card = r.createElement('li');
      card.className = 'record-proposal action-proposal confirm-card';
      list.append(card);
      return { card, confirm: r.createElement('button'), discard: r.createElement('button') };
    },
    bindActionProposal() {}
  };
  mountPendingActionCards(root, [{ id: 'act_1', slug: 'clare', proposal: { intent: 'One' } }], opts);
  mountPendingActionCards(root, [{ id: 'act_1', slug: 'clare', proposal: { intent: 'One again' } }], opts);
  assert.equal(appendCount, 1);
});

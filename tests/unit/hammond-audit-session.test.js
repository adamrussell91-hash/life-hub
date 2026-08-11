import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_SESSION_KEY,
  loadStoredAuditSession,
  removeStoredAuditSession,
  saveStoredAuditSession
} from '../../js/app/hammond-audit-session-storage.js';
import { createChatController } from '../../js/app/chat-controller.js';

class FakeStorage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.style = { setProperty() {}, getPropertyValue() { return ''; } };
    this.classList = { add() {}, remove() {} };
    this.attributes = {};
    this.value = '';
    this.disabled = false;
    this.textContent = '';
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  remove() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
  }

  createElement(tag) { return new FakeElement(tag); }

  querySelector(selector) {
    if (!this.elements.has(selector)) {
      this.elements.set(selector, new FakeElement('div'));
    }
    return this.elements.get(selector);
  }

  querySelectorAll() { return []; }
}

test('audit session storage round-trips a non-lock session', () => {
  const storage = new FakeStorage();
  saveStoredAuditSession(storage, { kind: 'cn_audit', phase: 'intake', intakeCount: 2 });
  assert.deepEqual(loadStoredAuditSession(storage), {
    kind: 'cn_audit',
    phase: 'intake',
    intakeCount: 2
  });
  removeStoredAuditSession(storage);
  assert.equal(loadStoredAuditSession(storage), null);
});

test('corrupt stored JSON degrades to null', () => {
  const storage = new FakeStorage({ [AUDIT_SESSION_KEY]: '{not-json' });
  assert.equal(loadStoredAuditSession(storage), null);
});

test('createChatController resumes a non-lock stored session', async () => {
  const storage = new FakeStorage();
  saveStoredAuditSession(storage, { kind: 'cn_audit', phase: 'stale_drift', intakeCount: 2 });
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Resumed.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root: new FakeDocument(), chatApi, storage });
  await controller.send('Hammond, continue the audit');
  assert.deepEqual(sendCalls[0].auditSession, {
    kind: 'cn_audit',
    phase: 'stale_drift',
    intakeCount: 2
  });
});

test('a lock-phase stored session does not resume', async () => {
  const storage = new FakeStorage();
  saveStoredAuditSession(storage, { kind: 'cn_audit', phase: 'lock', intakeCount: 2 });
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Fresh.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root: new FakeDocument(), chatApi, storage });
  await controller.send('Hammond, hello');
  assert.equal(sendCalls[0].auditSession, undefined);
  assert.equal(loadStoredAuditSession(storage), null);
});

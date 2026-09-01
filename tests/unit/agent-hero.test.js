import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_AVATARS, avatarForSlug } from '../../apps/life/js/app/agent-avatars.js';
import { renderAgentHero } from '../../apps/life/js/app/render-agent-picker.js';

class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.src = '';
    this.alt = '';
    this._listeners = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(type, fn) { this._listeners[type] = fn; }
  querySelector() { return null; }
}

test('every agent has a confirmed accent colour on the client roster', () => {
  for (const agent of AGENT_AVATARS) {
    assert.match(agent.colour, /^#[0-9A-Fa-f]{6}$/);
  }
  assert.equal(avatarForSlug('hyaluronica').colour, '#C7AEEA');
  assert.equal(avatarForSlug('brisket').colour, '#EEB046');
});

test('renderAgentHero stays hidden while full profiles are disabled', () => {
  const host = new FakeEl('div');
  const root = {
    createElement: tag => new FakeEl(tag),
    querySelector: sel => (sel === '#chat-agent-hero' ? host : null)
  };

  renderAgentHero(root, 'chadwick');
  assert.equal(host.attributes.hidden, '');
  assert.equal(host.children.length, 0);

  renderAgentHero(root, null);
  assert.equal(host.attributes.hidden, '');
  assert.equal(host.children.length, 0);
});

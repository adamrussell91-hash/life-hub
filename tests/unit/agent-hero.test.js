import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_AVATARS, avatarForSlug } from '../../js/app/agent-avatars.js';
import { renderAgentHero } from '../../js/app/render-agent-picker.js';

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
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  querySelector(sel) {
    if (sel === '.chat-agent-hero__img') return this.children.find(c => c.className === 'chat-agent-hero__img') ?? null;
    if (sel === '.chat-agent-hero__name') return this.children.find(c => c.className === 'chat-agent-hero__name') ?? null;
    return null;
  }
}

test('every agent has a full-body portrait path', () => {
  for (const agent of AGENT_AVATARS) {
    assert.match(agent.fullSrc, new RegExp(`assets/agents/full/${agent.slug}\\.png`));
  }
  assert.equal(avatarForSlug('brisket').fullSrc, 'assets/agents/full/brisket.png');
});

test('renderAgentHero shows the full portrait for a known agent and hides when cleared', () => {
  const host = new FakeEl('div');
  const root = {
    createElement: tag => new FakeEl(tag),
    querySelector: sel => (sel === '#chat-agent-hero' ? host : null)
  };

  renderAgentHero(root, 'chadwick');
  assert.equal(host.attributes.hidden, undefined);
  assert.equal(host.children[0].src, 'assets/agents/full/chadwick.png');
  assert.equal(host.children[1].textContent, 'Chadwick Flexington');

  renderAgentHero(root, null);
  assert.equal(host.attributes.hidden, '');
  assert.equal(host.children.length, 0);
});

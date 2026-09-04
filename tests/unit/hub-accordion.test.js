import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  bindHubAccordion,
  openHubAccordion,
  toggleHubAccordion
} from '../../apps/life/js/shell/hub-accordion.js';
import { hubSwitcherHtml } from '../../packages/hub-switcher.js';

function classList(initial = []) {
  const set = new Set(initial);
  return {
    contains: name => set.has(name),
    add: name => set.add(name),
    remove: name => set.delete(name),
    toggle(name, force) {
      if (force === true) set.add(name);
      else if (force === false) set.delete(name);
      else if (set.has(name)) set.delete(name);
      else set.add(name);
    }
  };
}

function accordionRoot() {
  const toggles = {
    life: { setAttribute() {}, dataset: { hubToggle: 'life' } },
    teaching: { setAttribute() {}, dataset: { hubToggle: 'teaching' } }
  };
  const rows = {
    life: { classList: classList(['hub-row', 'is-open']), querySelector: sel => (sel === '.hub-toggle' ? toggles.life : null) },
    teaching: { classList: classList(['hub-row']), querySelector: sel => (sel === '.hub-toggle' ? toggles.teaching : null) }
  };
  const panels = {
    life: { classList: classList(['hub-panel', 'is-open']) },
    teaching: { classList: classList(['hub-panel']) }
  };
  return {
    querySelector(selector) {
      const hub = /data-hub="(\w+)"/.exec(selector)?.[1];
      const panel = /data-hub-panel="(\w+)"/.exec(selector)?.[1];
      if (hub) return rows[hub];
      if (panel) return panels[panel];
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.hub-row.is-open') {
        return Object.values(rows).filter(row => row.classList.contains('is-open'));
      }
      if (selector === '.hub-panel.is-open') {
        return Object.values(panels).filter(panel => panel.classList.contains('is-open'));
      }
      return [];
    }
  };
}

test('hub accordion CSS uses the 0fr to 1fr height trick with an explicit column', async () => {
  const css = await readFile(new URL('../../packages/design-kit/rail.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /grid-template-rows:\s*0fr/);
  assert.match(css, /\.hub-panel\.is-open\s*\{[^}]*grid-template-rows:\s*1fr/s);
  assert.match(css, /transition:\s*grid-template-rows\s+0\.28s\s+cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/);
  assert.match(css, /transform:\s*rotate\(180deg\)/);
  assert.match(css, /\.hub-stack\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.doesNotMatch(css, /\.hub-panel-inner\s*\{[^}]*transition:\s*padding/s);
});

test('rail section labels reset native button chrome so they stay on-dark', async () => {
  const css = await readFile(new URL('../../packages/design-kit/rail.css', import.meta.url), 'utf8');
  assert.match(css, /\.hub-rail__section\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.hub-rail__section\s*\{[^}]*border:\s*0/s);
  assert.match(css, /\.hub-rail__section\s*\{[^}]*appearance:\s*none/s);
  assert.match(css, /\.hub-rail__section\s*\{[^}]*color:\s*var\(--on-dark-muted\)/s);
});

test('Life rail puts domains inside the Life accordion, not a flat Domains list', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-hub-accordion/);
  assert.match(html, /data-hub="life"/);
  assert.match(html, /data-hub-toggle="life"/);
  assert.match(html, /data-hub-panel="life"/);
  assert.match(html, /class="hub-nav-item"[^>]+data-section="nutrition"/);
  assert.match(html, /data-hub-toggle="teaching"/);
  assert.match(html, /href="\/teaching\/"/);
  assert.doesNotMatch(html, /<p class="nav-label">Domains<\/p>/);
});

test('opening one hub panel closes the others', () => {
  const root = accordionRoot();
  assert.equal(root.querySelector('.hub-row[data-hub="life"]').classList.contains('is-open'), true);
  const opened = toggleHubAccordion(root, 'teaching');
  assert.equal(opened, true);
  assert.equal(root.querySelector('.hub-row[data-hub="life"]').classList.contains('is-open'), false);
  assert.equal(root.querySelector('.hub-panel[data-hub-panel="life"]').classList.contains('is-open'), false);
  assert.equal(root.querySelector('.hub-row[data-hub="teaching"]').classList.contains('is-open'), true);
  assert.equal(root.querySelector('.hub-panel[data-hub-panel="teaching"]').classList.contains('is-open'), true);
});

test('toggling the open hub closes it without opening another', () => {
  const root = accordionRoot();
  const opened = toggleHubAccordion(root, 'life');
  assert.equal(opened, false);
  assert.equal(root.querySelector('.hub-row[data-hub="life"]').classList.contains('is-open'), false);
});

test('openHubAccordion is a no-op when that hub is already open', () => {
  const root = accordionRoot();
  openHubAccordion(root, 'life');
  assert.equal(root.querySelector('.hub-row[data-hub="life"]').classList.contains('is-open'), true);
});

test('bindHubAccordion ignores label clicks and only toggles from the chevron', () => {
  const calls = [];
  const root = {
    dataset: {},
    contains: () => true,
    addEventListener(type, listener) {
      if (type === 'click') calls.push(listener);
    }
  };
  bindHubAccordion(root);
  bindHubAccordion(root);
  assert.equal(calls.length, 1);
  const listener = calls[0];
  const event = {
    target: { closest: () => null },
    preventDefault() { throw new Error('label must not toggle'); },
    stopPropagation() {}
  };
  listener(event);
});

test('shared hub switcher markup is an accordion, not a flat link list', () => {
  const html = hubSwitcherHtml('teaching');
  assert.match(html, /data-hub="teaching"/);
  assert.match(html, /data-hub-toggle="life"/);
  assert.match(html, /class="hub-panel"/);
  assert.match(html, /data-hub-preview="tasks"/);
  assert.match(html, /class="hub-stack"/);
  assert.match(html, /aria-current="page"/);
});

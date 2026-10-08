import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createGarageHomeView } from '../../apps/life/js/app/render-garage-home.js';
import { createGarageHomeMock } from '../../scripts/garage-home-demo.mjs';

const NOW = new Date('2026-10-09T08:00:00+11:00');

function setup() {
  const dom = new JSDOM('<!doctype html><body><h1 id="page-title"></h1><section id="garage-home-dashboard"></section></body>', { pretendToBeVisual: true });
  globalThis.document = dom.window.document;
  const mock = createGarageHomeMock({ now: () => NOW.getTime() });
  const calls = [];
  const call = body => {
    calls.push(body);
    const result = mock(body);
    if (result.error) throw Object.assign(new Error(result.error[1]), { code: result.error[0] });
    return Promise.resolve(result.data);
  };
  const api = {
    load: () => call(null),
    scan: () => call({ action: 'scan' }),
    mail: mail => call({ action: 'mail', mail }),
    forgetSender: from => call({ action: 'forget-sender', from }),
    savePlace: place => call({ action: 'place', place }),
    removePlace: id => call({ action: 'remove-place', id }),
    addVisit: visit => call({ action: 'visit', visit }),
    removeVisit: id => call({ action: 'remove-visit', id }),
    togglePrep: (forDate, item) => call({ action: 'prep', forDate, item }),
    toggleNeeded: (placeId, item) => call({ action: 'needed', placeId, item }),
    setAutoFile: patch => call({ action: 'autofile', patch }),
    importPack: pack => call({ action: 'import', pack })
  };
  const opened = [];
  const view = createGarageHomeView({ root: dom.window.document, api, now: () => NOW, openSection: name => opened.push(name) });
  const host = dom.window.document.querySelector('#garage-home-dashboard');
  const click = selector => {
    const node = host.querySelector(selector);
    assert.ok(node, `missing ${selector}`);
    node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  return { dom, view, host, click, settle, calls, opened };
}

test('the Driveway shows the Mailroom count, what needs you and every place', async () => {
  const { view, host } = setup();
  await view.show();
  const text = host.textContent;
  assert.match(text, /2 waiting for a tap/);
  assert.match(text, /Inspection in 11 days/);
  assert.match(text, /The Hatch is probably due a service/);
  assert.match(text, /still needed for tax time/);
  assert.equal(host.querySelectorAll('.gh-card').length, 3);
  assert.match(host.querySelector('[data-gh-tab="mailroom"]').textContent, /Mailroom\s*2/);
});

test('approving in the Mailroom files the email and moves to the next one', async () => {
  const { view, host, click, settle } = setup();
  await view.show();
  click('[data-gh-tab="mailroom"]');
  const first = host.querySelector('.gh-mail.is-on').dataset.ghMail;
  click('[data-gh-act="approve"]');
  await settle();
  assert.equal(host.querySelectorAll('.gh-mail').length, 1);
  assert.notEqual(host.querySelector('.gh-mail.is-on').dataset.ghMail, first);
  click('[data-gh-filter="filed"]');
  assert.ok([...host.querySelectorAll('.gh-mail')].some(node => node.dataset.ghMail === first));
});

test('moving with "always" adds a sender rule; ignore keeps it out', async () => {
  const { view, host, click, settle, calls } = setup();
  await view.show();
  click('[data-gh-tab="mailroom"]');
  const remember = host.querySelector('[data-gh="remember"]');
  remember.checked = true;
  remember.dispatchEvent(new host.ownerDocument.defaultView.Event('change', { bubbles: true }));
  click('[data-gh-act="move"]');
  await settle();
  const move = calls.find(c => c?.action === 'mail' && c.mail.action === 'move');
  assert.equal(move.mail.remember, true);
  click('[data-gh-act="ignore"]');
  await settle();
  assert.ok(calls.some(c => c?.mail?.action === 'ignore'));
});

test('Homes ticks inspection prep and tax-time items; investments hand off to Property', async () => {
  const { view, host, click, settle, opened } = setup();
  await view.show();
  click('[data-gh-tab="homes"]');
  assert.match(host.textContent, /Routine inspection/);
  click('[data-gh-act="prep"]');
  await settle();
  assert.equal(host.querySelector('[data-gh-act="prep"]').getAttribute('aria-checked'), 'true');
  click('[data-gh-act="needed"]');
  await settle();
  assert.equal(host.querySelector('[data-gh-act="needed"]').getAttribute('aria-checked'), 'true');
  assert.match(host.textContent, /Stovetop|maintenance request/i);
  click('[data-gh-go="property"]');
  assert.deepEqual(opened, ['property']);
});

test('Garage draws Odometer Road with a ghost estimate and opens a visit on tap', async () => {
  const { view, host, click } = setup();
  await view.show();
  click('[data-gh-tab="garage"]');
  assert.ok(host.querySelector('svg .gh-ghost'), 'estimate beyond the last reading is drawn');
  assert.ok(host.querySelectorAll('g.gh-marker').length >= 6);
  click('g.gh-marker');
  assert.ok(host.querySelector('.gh-visit-detail'));
  assert.match(host.querySelector('.gh-odo').getAttribute('aria-label'), /estimated/);
});

test('Check mail without Gmail explains how to connect instead of failing silently', async () => {
  const { view, host, click, settle } = setup();
  await view.show();
  click('[data-gh-act="scan"]');
  await settle();
  const status = host.querySelector('[data-gh="status"]');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /Gmail isn.t connected/);
});

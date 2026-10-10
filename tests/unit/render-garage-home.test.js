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

test('Garage marker tap toggles selection off; below stems mirror above spacing', async () => {
  const { view, host, click } = setup();
  await view.show();
  click('[data-gh-tab="garage"]');
  const markers = [...host.querySelectorAll('g.gh-marker')];
  assert.ok(markers.length >= 2);
  const road = host.querySelector('rect.gh-road');
  const roadTop = Number(road.getAttribute('y'));
  const roadBot = roadTop + Number(road.getAttribute('height'));
  const above = markers[0];
  const below = markers[1];
  const aboveStem = above.querySelector('line.gh-marker__stem');
  const belowStem = below.querySelector('line.gh-marker__stem');
  assert.equal(Number(aboveStem.getAttribute('y2')), roadTop);
  assert.equal(Number(belowStem.getAttribute('y1')), roadBot);
  const aboveGap = roadTop - Number(above.querySelector('circle').getAttribute('cy'));
  const belowGap = Number(below.querySelector('circle').getAttribute('cy')) - roadBot;
  assert.equal(aboveGap, belowGap);
  assert.ok(above.querySelector('.gh-marker__title-text')?.textContent.length > 0, 'full title in scroll viewport');
  click('g.gh-marker');
  assert.ok(host.querySelector('.gh-visit-detail'));
  const onId = host.querySelector('g.gh-marker.is-on')?.dataset.ghVisit;
  assert.ok(onId);
  click(`g.gh-marker[data-gh-visit="${onId}"]`);
  assert.equal(host.querySelector('.gh-visit-detail'), null);
  assert.equal(host.querySelector('g.gh-marker.is-on'), null);
});

test('Garage long marker titles scroll on focus using measured overflow', async () => {
  const { view, host, click } = setup();
  await view.show();
  click('[data-gh-tab="garage"]');
  const marker = host.querySelector('g.gh-marker');
  const viewport = marker.querySelector('.gh-marker__title');
  const text = marker.querySelector('.gh-marker__title-text');
  Object.defineProperty(viewport, 'clientWidth', { value: 100, configurable: true });
  Object.defineProperty(text, 'scrollWidth', { value: 340, configurable: true });
  marker.dispatchEvent(new host.ownerDocument.defaultView.FocusEvent('focus', { bubbles: true }));
  assert.equal(marker.classList.contains('is-reading-title'), true);
  assert.equal(marker.style.getPropertyValue('--gh-title-shift'), '-240px');
  marker.dispatchEvent(new host.ownerDocument.defaultView.FocusEvent('blur', { bubbles: true }));
  assert.equal(marker.classList.contains('is-reading-title'), false);
});

test('Garage can retire and unretire the selected car', async () => {
  const { view, host, click, settle, calls } = setup();
  await view.show();
  click('[data-gh-tab="garage"]');
  assert.match(host.querySelector('[data-gh-act="retire-car"]').textContent, /No longer ours/);
  click('[data-gh-act="retire-car"]');
  await settle();
  const saved = calls.find(c => c?.action === 'place');
  assert.equal(saved?.place?.details?.retired, true);
  assert.match(host.textContent, /no longer ours/i);
  assert.match(host.querySelector('[data-gh-act="retire-car"]').textContent, /Mark as ours again/);
  click('[data-gh-act="retire-car"]');
  await settle();
  const again = calls.filter(c => c?.action === 'place').at(-1);
  assert.equal(again?.place?.details?.retired, false);
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

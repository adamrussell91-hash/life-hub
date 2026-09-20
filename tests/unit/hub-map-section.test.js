import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sectionFromHash } from '../../apps/life/js/app/app-controller.js';

const worker = readFileSync(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8');

test('#hub-map deep-links to the Hub map section', () => {
  assert.equal(sectionFromHash('#hub-map'), 'hub-map');
});

test('every Hub map module is precached by the service worker', () => {
  for (const name of ['api', 'canvas', 'controller', 'layout', 'model', 'panel']) {
    assert.ok(worker.includes(`'js/app/hub-map-${name}.js'`), `missing hub-map-${name}.js`);
  }
});

test('Central Node has a Hub map entry and the page is not a rail item', () => {
  const html = readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="central-node-map-button"'));
  assert.equal(html.includes('data-section="hub-map"'), false);
});

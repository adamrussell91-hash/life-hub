import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createViewOnMap,
  isMappablePlace,
  mapsEmbedUrl,
  mapsSearchUrl
} from '../../packages/design-kit/js/view-on-map.js';

function el(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    hidden: false,
    href: '',
    type: '',
    src: '',
    title: '',
    target: '',
    rel: '',
    dataset: {},
    attributes: {},
    children: [],
    listeners: [],
    style: {},
    classList: {
      owner: null,
      add(...names) {
        const tokens = new Set(String(this.owner.className).split(/\s+/).filter(Boolean));
        names.forEach(name => tokens.add(name));
        this.owner.className = [...tokens].join(' ');
      }
    },
    append(...nodes) {
      this.children.push(...nodes);
      this.textContent = this.children.map(child => child.textContent).filter(Boolean).join('');
    },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'href') this.href = String(value);
      if (name === 'src') this.src = String(value);
      if (name === 'title') this.title = String(value);
    },
    getAttribute(name) { return this.attributes[name]; }
  };
  node.classList.owner = node;
  return node;
}

test('isMappablePlace accepts street addresses and rejects remote venues', () => {
  assert.equal(isMappablePlace('26 Ridge St, North Sydney NSW Australia'), true);
  assert.equal(isMappablePlace('Abbotsleigh, Wahroonga'), true);
  assert.equal(isMappablePlace('Zoom'), false);
  assert.equal(isMappablePlace('Telehealth'), false);
  assert.equal(isMappablePlace('online'), false);
  assert.equal(isMappablePlace('Walker Street Doctors', 'telehealth'), false);
  assert.equal(isMappablePlace('Walker Street Doctors', 'unknown'), false);
  assert.equal(isMappablePlace(''), false);
});

test('maps URLs encode the query and skip empty addresses', () => {
  assert.equal(
    mapsSearchUrl('26 Ridge St, North Sydney'),
    'https://www.google.com/maps/search/?api=1&query=26%20Ridge%20St%2C%20North%20Sydney'
  );
  assert.match(mapsEmbedUrl('Northern Gastroenterology'), /output=embed/);
  assert.match(mapsEmbedUrl('Northern Gastroenterology'), /Northern%20Gastroenterology/);
  assert.equal(mapsSearchUrl(''), null);
  assert.equal(mapsEmbedUrl('   '), null);
});

test('createViewOnMap builds a pill and a Maps link', () => {
  const control = createViewOnMap({
    locationName: '26 Ridge St, North Sydney NSW Australia',
    address: '26 Ridge St, North Sydney NSW Australia',
    createElement: tag => el(tag)
  });
  assert.ok(control);
  assert.match(control.el.className, /view-on-map/);
  assert.equal(control.trigger.type, 'button');
  assert.match(control.trigger.textContent, /View on Map/);
  assert.match(control.place.href, /google\.com\/maps/);
  assert.equal(control.place.target, '_blank');
  assert.equal(createViewOnMap({ address: 'Zoom', createElement: tag => el(tag) }), null);
});

test('Life medical sheet and Tasks programs import the shared control', async () => {
  const medical = await readFile(new URL('../../apps/life/js/app/render-medical.js', import.meta.url), 'utf8');
  const programs = await readFile(new URL('../../apps/tasks/src/views/programs.ts', import.meta.url), 'utf8');
  const lifeHtml = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../packages/design-kit/view-on-map.css', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../../packages/design-kit/AGENTS.md', import.meta.url), 'utf8');

  assert.match(medical, /createViewOnMap/);
  assert.match(programs, /createViewOnMap/);
  assert.match(lifeHtml, /view-on-map\.css/);
  assert.match(worker, /packages\/design-kit\/js\/view-on-map\.js/);
  assert.match(worker, /packages\/design-kit\/js\/morphing-dialog\.js/);
  assert.match(css, /\.view-on-map__trigger\b/);
  assert.match(agents, /createViewOnMap/);
});

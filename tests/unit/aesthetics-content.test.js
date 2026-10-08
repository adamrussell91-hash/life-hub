import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { createAesthetics } from '../../apps/life/js/app/aesthetics/render-aesthetics.js';
import { FRAGRANCES } from '../../apps/life/js/app/aesthetics/fragrance-library.js';

test('recommendations use exact source names, perfumers and recorded note tiers', () => {
  assert.ok(FRAGRANCES.some(f => f.name === 'Asad Zanzibar Limited Edition'));
  assert.equal(FRAGRANCES.find(f => f.name === 'Milk Orchid').perfumer, 'Emma / Perfumerism x Commodity');
  assert.deepEqual(FRAGRANCES.find(f => f.name === 'Syzygy').notes, ['Bergamot', 'Oud', 'Musk', 'Ambroxan']);
  assert.deepEqual(FRAGRANCES.find(f => f.name === 'Verge').notes, [], 'no invented pyramid when Notion only records a review');
});

function render(saved = {}) {
  const window = new Window();
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, JSON.stringify(value));
  window.document.write(readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8'));
  createAesthetics(window.document, { storage: window.localStorage, matchMedia: () => ({ matches: true }) }).render({ date: '2026-10-08' });
  return window.document;
}

test('the full source name preserves previously logged wear and compliments', () => {
  const doc = render({
    'life-aesthetics-wear': { '2026-10-08': 'Asad Zanzibar' },
    'life-aesthetics-compliments': { 'Asad Zanzibar': 2, 'Asad Zanzibar Limited Edition': 1 }
  });
  assert.equal(doc.querySelector('#aes-today-worn').textContent, 'Logged: Asad Zanzibar Limited Edition today');
  const point = doc.querySelector('#aes-map [aria-label="Asad Zanzibar Limited Edition, Owned"]');
  point.dispatchEvent(new doc.defaultView.MouseEvent('click'));
  assert.match(doc.querySelector('#aes-mapcard').textContent, /3 compliments/);
});

test('Scent exposes every full tracker record, including zero values and page-only notes', () => {
  const doc = render();
  assert.equal(doc.querySelectorAll('#aes-library [data-fragrance-id]').length, 52);
  const versace = [...doc.querySelectorAll('#aes-library details')].find(el => el.querySelector('summary')?.textContent.includes('Versace Pour Homme'));
  assert.equal(versace.querySelector('[data-source-field="Price (AUD)"]').textContent, '$0.00');
  assert.equal(versace.querySelector('[data-source-field="Compliments"]').textContent, '0');
  const text = doc.querySelector('#aes-library').textContent;
  assert.match(text, /Maybe I was wrong about the longevity/);
  assert.match(text, /I LOVE the dry down on this/);
  assert.match(text, /detectable freshness, definitely cypress like green sap/);
  assert.match(text, /Asad Zanzibar Limited Edition/);
});

test('Dress exposes all seven summary sections and the complete transcript with source links', () => {
  const doc = render();
  assert.equal(doc.querySelectorAll('#aes-style-notes [data-style-section]').length, 7);
  const text = doc.querySelector('#aes-style-notes').textContent;
  assert.match(text, /Collar \+ tie \+ lapel proportions/);
  assert.match(text, /Build to at least five pieces/);
  assert.match(text, /Olive khaki with white feels clean/);
  assert.match(text, /shirt's collar should be proportionate to the size of your face/);
  assert.match(text, /Intentional pieces will help make your outfit look intentional and dynamic instead of uninspired and boring/);
  assert.ok(doc.querySelector('#aes-style-notes a[href*="392f794f8476802ea9f9d06c30e34694"]'));
});

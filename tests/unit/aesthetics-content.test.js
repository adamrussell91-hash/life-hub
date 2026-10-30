import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { createAesthetics } from '../../apps/life/js/app/aesthetics/render-aesthetics.js';
import { fragrancePhotoUrl } from '../../apps/life/js/app/aesthetics/fragrance-photos.js';
import { FRAGRANCES, REFERENCE_FRAGRANCES, setFragranceSource } from '../../apps/life/js/app/aesthetics/fragrance-library.js';

// The real library is private; tests run on a small synthetic fixture.
setFragranceSource(JSON.parse(readFileSync(new URL('../fixtures/aesthetics/fragrance-source.json', import.meta.url), 'utf8')));

// No bundled bottle photo yet.
const NO_PHOTO = new Set(['Tea Soirée']);

test('recommendations use exact source names, perfumers and recorded note tiers', () => {
  assert.ok(FRAGRANCES.some(f => f.name === 'Asad Zanzibar Limited Edition'));
  assert.equal(FRAGRANCES.find(f => f.name === 'Milk Orchid').perfumer, 'Fixture Perfumer');
  assert.deepEqual(FRAGRANCES.find(f => f.name === 'Syzygy').notes, ['Bergamot', 'Raspberry', 'Oud', 'Norlimbanol', 'Musk', 'Ambroxan']);
  assert.deepEqual(FRAGRANCES.find(f => f.name === 'Verge').notes, [], 'no invented pyramid when Notion only records a review');
});

function render(saved = {}, weather = null) {
  const window = new Window();
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, JSON.stringify(value));
  window.document.write(readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8'));
  createAesthetics(window.document, {
    storage: window.localStorage,
    matchMedia: () => ({ matches: true }),
    weatherApi: async () => ({ weather, status: weather ? 'ok' : 'unavailable' })
  }).render({ date: '2026-10-08' });
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
  assert.equal(doc.querySelectorAll('#aes-library [data-fragrance-id]').length, FRAGRANCES.length);
  const versace = [...doc.querySelectorAll('#aes-library details')].find(el => el.querySelector('summary')?.textContent.includes('Versace Pour Homme'));
  assert.equal(versace.querySelector('[data-source-field="Price (AUD)"]').textContent, '$0.00');
  assert.equal(versace.querySelector('[data-source-field="Compliments"]').textContent, '0');
  const text = doc.querySelector('#aes-library').textContent;
  assert.match(text, /Follow up: the drydown is the best part/);
  assert.match(text, /no pyramid recorded for this one/);
  assert.match(text, /Synthetic page note: cypress and vetiver/);
  assert.match(text, /Asad Zanzibar Limited Edition/);
});

test('Dress exposes every summary section and the complete transcript with source links', () => {
  const doc = render();
  assert.equal(doc.querySelectorAll('#aes-style-notes [data-style-section]').length, 2);
  const text = doc.querySelector('#aes-style-notes').textContent;
  assert.match(text, /Colour pairings/);
  assert.match(text, /Build every outfit to at least five pieces/);
  assert.match(text, /Camel with cream reads relaxed/);
  assert.match(text, /Add a fifth piece and the outfit looks finished/);
  assert.ok(doc.querySelector('#aes-style-notes a[href*="notes.example/style#pairings"]'));
});


test('photos appear in the shelf, full records, selected scent and Today without losing interactions', () => {
  const doc = render();
  assert.equal(doc.querySelectorAll('#aes-shelf img').length, FRAGRANCES.filter(f => f.status === 'Owned' && !NO_PHOTO.has(f.name)).length);
  assert.equal(doc.querySelectorAll('#aes-library summary img').length, FRAGRANCES.filter(f => !NO_PHOTO.has(f.name)).length);
  assert.match(doc.querySelector('#aes-mapcard img').src, /criminal-elements-neon\.webp$/);
  assert.equal(doc.querySelectorAll('#aes-today-bottle img').length, 1);
  doc.querySelector('#aes-reroll').click();
  assert.equal(doc.querySelectorAll('#aes-today-bottle .aes-photo').length, 1);
  doc.querySelector('#aes-today-bottle').click();
  assert.match(doc.querySelector('#aes-today-worn').textContent, /Logged:/);
  assert.ok(doc.querySelector('#aes-dress-flat foreignObject img'));
});

test('the oracle shows reference photos and removes them for free-form notes', () => {
  const doc = render();
  assert.match(doc.querySelector('#aes-verdict img').src, /tom-ford-tobacco-vanille\.webp$/);
  const ask = doc.querySelector('#aes-ask');
  ask.value = 'vanilla, cardamom, incense';
  ask.dispatchEvent(new doc.defaultView.Event('input'));
  assert.equal(doc.querySelector('#aes-verdict img'), null);
  assert.ok(doc.querySelector('#aes-verdict .aes-dial'));
});

test('Scent ships an animated layering wheel with partners and spray order', async () => {
  const doc = render();
  await Promise.resolve();
  assert.ok(doc.querySelector('#aes-wheel .aes-wheel__svg'));
  assert.equal(doc.querySelectorAll('#aes-wheel .aes-wheel__dot').length, FRAGRANCES.filter(f => f.status === 'Owned').length);
  assert.match(doc.querySelector('#aes-combo').textContent, /spray .+ first/i);
  assert.match(doc.querySelector('#aes-combo').textContent, /Shelf favourites/);
  const partner = doc.querySelector('#aes-combo .hub-pills__btn');
  partner?.dispatchEvent(new doc.defaultView.MouseEvent('click'));
  assert.ok(doc.querySelector('#aes-wheel .aes-wheel__arc'));
});

test('Today surfaces a weather-informed pick when Sydney weather is available', async () => {
  const heat = { band: 'humid-heat', tempC: 31, humidity: 80, precipMm: 0, weatherCode: 1, rain: false, label: '31° · muggy heat' };
  const doc = render({}, heat);
  await new Promise(r => setTimeout(r, 0));
  assert.match(doc.querySelector('#aes-today-weather').textContent, /muggy heat/);
  assert.ok(['fresh', 'floral'].includes(
    [...doc.querySelectorAll('#aes-library details')].length
      ? FRAGRANCES.find(f => f.name === doc.querySelector('#aes-today-name').textContent)?.family
      : null
  ));
});

test('missing and failed photos keep a reserved frame with no broken image', () => {
  const doc = render();
  const tea = [...doc.querySelectorAll('#aes-library details')].find(el => el.querySelector('summary')?.textContent.includes('Tea Soirée'));
  assert.ok(tea.querySelector('summary .aes-photo--fallback'));
  assert.equal(tea.querySelector('summary img'), null);
  const frame = doc.querySelector('#aes-mapcard .aes-photo');
  frame.querySelector('img').dispatchEvent(new doc.defaultView.Event('error'));
  assert.equal(frame.querySelector('img'), null);
  assert.ok(frame.classList.contains('aes-photo--fallback'));
});


test('every collection and reference photo resolves to a compact bundled WebP except the photo-less bottles', () => {
  for (const name of [...FRAGRANCES.map(f => f.name), ...Object.keys(REFERENCE_FRAGRANCES)]) {
    const url = fragrancePhotoUrl(name);
    if (NO_PHOTO.has(name)) { assert.equal(url, null); continue; }
    assert.ok(url, name);
    const bytes = readFileSync(new URL(url));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', name);
    assert.ok(bytes.length < 100_000, name);
  }
  assert.equal(fragrancePhotoUrl('vanilla, cardamom'), null);
  assert.equal(fragrancePhotoUrl('constructor'), null);
});

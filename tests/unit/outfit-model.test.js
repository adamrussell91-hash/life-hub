import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { LOOKS, SNAP_SAMPLES } from '../../apps/life/js/app/aesthetics/dress-looks.js';
import { dressForWeather, pairingFor, readGarmentPhoto, SLOTS, styleAround } from '../../apps/life/js/app/aesthetics/outfit-model.js';
import {
  classifyForecast,
  classifyWeather,
  lookScentAffinity,
  planScentDay,
  scentForLook,
  scentPolish
} from '../../apps/life/js/app/aesthetics/aesthetics-model.js';
import { FRAGRANCES } from '../../apps/life/js/app/aesthetics/fragrance-library.js';
import { createAesthetics } from '../../apps/life/js/app/aesthetics/render-aesthetics.js';

const bottleNamed = name => FRAGRANCES.find(f => f.name === name);
const lookNamed = vibe => LOOKS.find(l => l.vibe === vibe);
const HOT = classifyForecast({
  current: { temperature_2m: 26, relative_humidity_2m: 72, precipitation: 0, weather_code: 1 },
  daily: { temperature_2m_max: [32], temperature_2m_min: [22], precipitation_probability_max: [10], weather_code: [1] }
});

test('burgundy pants and a burgundy knit get different outfits', () => {
  const pants = styleAround({ colour: 'burgundy', slot: 'bottom', garment: 'trousers' });
  const knit = styleAround({ colour: 'burgundy', slot: 'top', garment: 'knit' });
  assert.equal(pants.length, 3);
  for (const o of pants) {
    assert.deepEqual(o.look.bottom, ['burgundy', 'trousers'], 'the piece stays in its slot');
    assert.notEqual(o.look.top[0], 'burgundy', 'no burgundy top on burgundy pants');
  }
  for (const o of knit) assert.deepEqual(o.look.top, ['burgundy', 'knit']);
  assert.equal(knit[0].kind, 'exact', 'the notes already style a burgundy knit');
  assert.equal(pants[0].kind, 'moved', 'burgundy pants borrow a burgundy look and swap the colours');
  assert.equal(pants[0].look.top[0], 'cream', 'burgundy with cream → classic, the cream moves up');
  assert.match(pants[0].reason, /pants/);
  assert.notDeepEqual(pants.map(o => o.look.vibe + o.look.top[0]), knit.map(o => o.look.vibe + o.look.top[0]));
});

test('every slot styles every sample, and outfits keep top and pants apart', () => {
  for (const { key } of SLOTS) {
    for (const s of SNAP_SAMPLES) {
      const options = styleAround({ colour: s.colour, slot: key });
      assert.ok(options.length >= 1, `${s.colour} as ${key}`);
      for (const o of options) {
        assert.equal(o.look[key][0], s.colour);
        assert.ok(o.reason.length > 10);
      }
    }
  }
  for (const s of SNAP_SAMPLES) assert.ok(SLOTS.some(x => x.key === s.slot), `${s.label} names its slot`);
  assert.deepEqual(styleAround({ colour: 'burgundy', slot: 'nonsense' }), []);
});

test('pairing rules come from the style notes', () => {
  assert.equal(pairingFor(lookNamed('classic'), 'burgundy').vibe, 'classic');
  assert.equal(pairingFor(lookNamed('powerful'), 'burgundy').vibe, 'powerful');
  assert.equal(pairingFor(lookNamed('striking')).vibe, 'striking');
});

test('outfits are cut for the weather without changing colour', () => {
  const expensive = lookNamed('expensive');
  const { look, note } = dressForWeather(expensive, HOT);
  assert.deepEqual(SLOTS.map(s => look[s.key][0]), SLOTS.map(s => expensive[s.key][0]));
  assert.equal(look.outer[1], 'linen overshirt');
  assert.equal(look.shoes[1], 'loafers', 'no chelsea boots at 32°');
  assert.match(note, /High 32°/);
  const wet = classifyWeather({ tempC: 13, humidity: 80, precipMm: 3, weatherCode: 61 });
  assert.equal(dressForWeather(lookNamed('effortless'), wet).look.texture, 'leather', 'no suede in the rain');
  const mild = classifyWeather({ tempC: 19, humidity: 50 });
  assert.equal(dressForWeather(expensive, mild).look, expensive);
});

test('the forecast high sets the day and the low sets the evening', () => {
  assert.equal(HOT.band, 'humid-heat');
  assert.equal(HOT.highC, 32);
  assert.equal(HOT.night.band, 'warm-humid');
  assert.equal(HOT.night.tempC, 22);
  assert.match(HOT.label, /^High 32°/);
  const showers = classifyForecast({ current: { temperature_2m: 18, relative_humidity_2m: 60 }, daily: { temperature_2m_max: [20], temperature_2m_min: [14], precipitation_probability_max: [80] } });
  assert.equal(showers.rain, true);
  assert.match(showers.label, /80% rain/);
  assert.equal(classifyForecast({ current: { temperature_2m: 29.4, relative_humidity_2m: 72 } }).band, 'humid-heat', 'current-only still works');
});

test('an expensive outfit on a hot day gets an expensive fresh scent', () => {
  assert.ok(scentPolish(bottleNamed('Liaisons Dangereuses')) > scentPolish(bottleNamed('Irish Creme')));
  const pick = scentForLook(lookNamed('expensive'), { date: '2026-01-15', weather: HOT });
  assert.equal(pick.fragrance.family, 'fresh');
  assert.ok(scentPolish(pick.fragrance) >= 2, `${pick.fragrance.name} reads polished`);
  assert.match(pick.reason, /expensive fresh scent/);
  const relaxed = scentForLook(lookNamed('effortless'), { date: '2026-01-15', weather: HOT });
  assert.notEqual(relaxed.fragrance.name, pick.fragrance.name, 'a relaxed outfit does not get the same bottle');
  const winter = scentForLook(lookNamed('expensive'), { date: '2026-07-10', weather: classifyWeather({ tempC: 11, humidity: 60 }) });
  assert.notEqual(winter.fragrance.family, 'fresh', 'cool days go deeper');
});

test('warm outfit colours lean to warm bottles, cool colours to fresh ones', () => {
  const warm = lookNamed('luxury');
  const cool = lookNamed('refined');
  const asad = bottleNamed('Asad');
  const aether = bottleNamed('Aether');
  assert.ok(lookScentAffinity(asad, warm) - lookScentAffinity(aether, warm) > lookScentAffinity(asad, cool) - lookScentAffinity(aether, cool));
});

test('Today follows the outfit: the plan explains the pairing', () => {
  const plan = planScentDay({ date: '2026-01-15', events: [], weather: HOT, look: lookNamed('expensive') });
  assert.equal(plan.day.name, scentForLook(lookNamed('expensive'), { date: '2026-01-15', weather: HOT }).fragrance.name);
  assert.ok(plan.notes.some(n => n.title === 'Dressed expensive'));
  assert.match(plan.lookLine, /expensive/);
});

function render(saved = {}) {
  const window = new Window();
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, JSON.stringify(value));
  window.document.write(readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8'));
  const aes = createAesthetics(window.document, {
    storage: window.localStorage,
    matchMedia: () => ({ matches: true }),
    weatherApi: async () => ({ weather: HOT, status: 'ok' })
  });
  aes.render({ date: '2026-01-15' });
  return window.document;
}
const click = (doc, node) => node.dispatchEvent(new doc.defaultView.MouseEvent('click'));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('Snap: picking "Pants" restyles a burgundy piece around the pants', async () => {
  const doc = render();
  await settle();
  const sample = [...doc.querySelectorAll('#aes-snap-samples button')].find(b => b.textContent.includes('Burgundy knit'));
  click(doc, sample);
  const pressed = () => doc.querySelector('#aes-snap-slots [aria-pressed="true"]').textContent;
  assert.equal(pressed(), 'Top');
  assert.match(doc.querySelector('#aes-snapres').textContent, /burgundy knit/);
  const pants = [...doc.querySelectorAll('#aes-snap-slots button')].find(b => b.textContent === 'Pants');
  click(doc, pants);
  assert.equal(pressed(), 'Pants');
  const text = doc.querySelector('#aes-snapres').textContent;
  assert.match(text, /burgundy trousers/);
  assert.doesNotMatch(text, /burgundy knit/);
  assert.match(doc.querySelector('#aes-dress-flat svg').getAttribute('aria-label'), /burgundy linen trousers/, 'cut for the 32° high');
  assert.equal(doc.querySelector('#aes-snap-colour').value, 'burgundy');
  assert.match(doc.querySelector('#aes-dress-weather').textContent, /High 32°/);
});

test('"Wear this today" makes Today’s scent follow the outfit', async () => {
  const doc = render();
  await settle();
  const vibe = [...doc.querySelectorAll('#aes-vibes button')].find(b => b.textContent === 'expensive');
  click(doc, vibe);
  const dressScent = doc.querySelector('#aes-dress-scent b').textContent;
  assert.match(doc.querySelector('#aes-dress-scent-why').textContent, /expensive fresh scent/);
  click(doc, doc.querySelector('#aes-wear-look'));
  assert.equal(doc.querySelector('#aes-wear-look').getAttribute('aria-pressed'), 'true');
  assert.equal(doc.querySelector('#aes-today-name').textContent, dressScent);
  assert.match(doc.querySelector('#aes-today-outfit').textContent, /^Dressed expensive/);
  assert.equal(doc.querySelector('#aes-today-outfit-go').textContent, 'Change outfit');
  assert.match(doc.querySelector('#aes-ribbon-notes').textContent, /Dressed expensive/);
  const saved = JSON.parse(doc.defaultView.localStorage.getItem('life-aesthetics-outfit'));
  assert.equal(saved['2026-01-15'].vibe, 'expensive');
});

/** A flat-lay frame: `inside(x, y)` paints olive cloth on a white background. */
function frame(width, height, inside, noise = false) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rgb = inside(x, y) ? [108, 109, 59] : noise ? [(x * 97 + y * 31) % 256, (x * 13 + y * 177) % 256, (x * y) % 256] : [246, 246, 244];
      data.set([...rgb, 255], i);
    }
  }
  return data;
}
const pantsShape = (x, y) => y >= 4 && y < 76 && ((y < 30 && x >= 12 && x < 48) || (x >= 12 && x < 28) || (x >= 32 && x < 48));
const teeShape = (x, y) => (y >= 10 && y < 70 && x >= 22 && x < 58) || (y >= 10 && y < 30 && x >= 6 && x < 74);
const shoesFromAbove = (x, y) => y >= 8 && y < 52 && ((x >= 6 && x < 20) || (x >= 24 && x < 38));

test('a photo of pants reads as pants, a tee as a top', () => {
  const pants = readGarmentPhoto(frame(60, 80, pantsShape), 60, 80);
  assert.equal(pants.slot, 'bottom');
  assert.ok(pants.pixels.length > 0);
  for (let i = 0; i < pants.pixels.length; i += 4) assert.deepEqual([...pants.pixels.subarray(i, i + 3)], [108, 109, 59], 'only cloth, never the gap between the legs');
  assert.equal(readGarmentPhoto(frame(80, 80, teeShape), 80, 80).slot, 'top');
  assert.equal(readGarmentPhoto(frame(44, 60, shoesFromAbove), 44, 60).slot, 'top', 'two shoes side by side are not legs: no waist');
  assert.equal(readGarmentPhoto(frame(80, 30, (x, y) => y >= 8 && y < 24 && x >= 4 && x < 76), 80, 30).slot, 'shoes');
});

test('a busy background is not guessed at', () => {
  assert.deepEqual(readGarmentPhoto(frame(60, 80, pantsShape, true), 60, 80), { slot: null, pixels: null });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAGRANCES, REFERENCE_FRAGRANCES } from '../../apps/life/js/app/aesthetics/fragrance-library.js';
import { GARMENT_COLOURS, LOOKS, SNAP_SAMPLES } from '../../apps/life/js/app/aesthetics/dress-looks.js';
import {
  classifyWeather,
  comboScore,
  combosFor,
  dayAnchors,
  dominantColour,
  familyWheelDistance,
  formatHour,
  judgeNotes,
  layerOrder,
  lookForScent,
  lookRules,
  looksForColour,
  mapInsight,
  nearestGarmentColour,
  placeOnMap,
  placeOnWheel,
  planScentDay,
  rankScents,
  resolveQuery,
  sydneySeason,
  topCombos,
  weatherAffinity
} from '../../apps/life/js/app/aesthetics/aesthetics-model.js';

const SAMPLE_DAY = [
  { time: '08:30', title: 'Period 1', type: 'scheduled_lesson' },
  { time: '16:30', title: 'Gym', type: 'workout' },
  { time: '19:00', title: 'Dinner with Corey', type: 'event' }
];

test('fragrance library mirrors the Notion tracker', () => {
  assert.equal(FRAGRANCES.length, 52);
  const count = s => FRAGRANCES.filter(f => f.status === s).length;
  assert.deepEqual([count('Owned'), count('Sampling'), count('Wishlist'), count('Retired')], [12, 10, 28, 2]);
  assert.equal(new Set(FRAGRANCES.map(f => f.name)).size, 52, 'names are unique');
  for (const f of FRAGRANCES) {
    assert.deepEqual(f.notes, ['Top Notes', 'Heart Notes', 'Base Notes'].flatMap(key => f.source.properties[key] ?? []), `${f.name} keeps recorded notes without inventing unset tiers`);
    assert.equal(f.tiers.reduce((a, b) => a + b, 0), f.notes.length, `${f.name} tiers add up to its notes`);
    assert.ok(['fresh', 'floral', 'gourmand', 'amber', 'woody'].includes(f.family), f.name);
  }
});

test('Sydney seasons run by month', () => {
  assert.equal(sydneySeason('2026-10-08'), 'Sp');
  assert.equal(sydneySeason('2026-01-15'), 'Su');
  assert.equal(sydneySeason('2026-04-01'), 'Au');
  assert.equal(sydneySeason('2026-07-20'), 'Wi');
});

test('formatHour reads like a clock', () => {
  assert.equal(formatHour(7.5), '7:30am');
  assert.equal(formatHour(12), '12pm');
  assert.equal(formatHour(18.5), '6:30pm');
});

test('a spring school day gets Neon, and dinner gets the evening scent', () => {
  const plan = planScentDay({ date: '2026-10-08', events: SAMPLE_DAY });
  assert.equal(plan.day.name, 'Neon');
  assert.equal(plan.night.name, 'Liaisons Dangereuses');
  assert.equal(plan.swapAt, 18.5);
  assert.equal(plan.sprayAt, 7.5);
  assert.match(plan.notes[1].title, /Gone by 2:30pm/);
  assert.match(plan.line, /worn off before gym/);
  assert.match(plan.notes[2].title, /change for Dinner with Corey/);
  assert.match(plan.notes[0].body, /bergamot and aldehydes opening.*vanilla and ISO E Super/);
});

test('no evening plans means no change of scent', () => {
  const plan = planScentDay({ date: '2026-10-08', events: [] });
  assert.equal(plan.night, null);
  assert.equal(plan.notes.at(-1).title, 'Free evening');
});

test('"Not feeling it" steps through other day scents, never the evening one', () => {
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const plan = planScentDay({ date: '2026-10-08', events: SAMPLE_DAY, index: i });
    assert.notEqual(plan.day.name, plan.night.name);
    seen.add(plan.day.name);
  }
  assert.ok(seen.size >= 4);
});

test('day ranking prefers in-season daytime bottles and rotates off yesterday', () => {
  const rank = rankScents({ season: 'Sp', time: 'D' });
  assert.ok(rank.slice(0, 5).every(f => f.seasons.includes('Sp') && f.time.includes('D')));
  const rotated = rankScents({ season: 'Sp', time: 'D', lastWorn: 'Neon' });
  assert.notEqual(rotated[0].name, 'Neon');
});

test('anchors classify gym and evening events', () => {
  const anchors = dayAnchors(SAMPLE_DAY);
  assert.deepEqual(anchors.map(a => a.kind), ['day', 'gym', 'evening']);
  assert.equal(dayAnchors([{ title: 'All day thing' }]).length, 0);
  const busy = dayAnchors([
    { time: '08:40', title: 'Year 9 English', type: 'scheduled_lesson' },
    { time: '09:45', title: 'Year 11 English', type: 'scheduled_lesson' },
    { time: '12:30', title: 'Lunch', type: 'meal' },
    { time: '19:00', title: 'Dinner with Corey', type: 'event' }
  ]);
  assert.deepEqual(busy.map(a => a.title), ['Teaching', 'Dinner with Corey']);
  const many = dayAnchors(Array.from({ length: 9 }, (_, i) => ({ time: `${String(10 + i).padStart(2, "0")}:00`, title: i === 8 ? 'Drinks' : `Meeting ${i}`, type: 'professional_meeting' })));
  assert.equal(many.length, 5);
  assert.ok(many.some(a => a.kind === 'evening'), 'the evening plan survives the cap');
});

test('every look passes its own outfit rules and pairs with an owned bottle', () => {
  const owned = new Set(FRAGRANCES.filter(f => f.status === 'Owned').map(f => f.name));
  for (const look of LOOKS) {
    for (const rule of lookRules(look)) assert.ok(rule.ok, `${look.vibe}: ${rule.label}`);
    assert.ok(owned.has(look.scent), `${look.vibe} pairs with ${look.scent}`);
    for (const [colour] of [look.outer, look.top, look.bottom, look.shoes, look.accent]) assert.ok(GARMENT_COLOURS[colour], colour);
  }
  for (const f of FRAGRANCES.filter(x => x.status === 'Owned' && x.time.includes('D'))) {
    assert.equal(lookForScent(f.name).scent, f.name, `${f.name} has a look`);
  }
  for (const s of SNAP_SAMPLES) assert.ok(GARMENT_COLOURS[s.colour]);
});

test('Would I like it? reads Adam’s loves and hates', () => {
  const tv = judgeNotes(REFERENCE_FRAGRANCES['Tom Ford Tobacco Vanille']);
  assert.ok(tv.score >= 8, `Tobacco Vanille scored ${tv.score}`);
  const oud = judgeNotes(['Oud', 'Leather', 'Incense']);
  assert.ok(oud.score <= 3);
  assert.ok(oud.flags.includes('Oud'));
  assert.equal(resolveQuery('baccarat rouge 540').name, 'Baccarat Rouge 540');
  assert.equal(resolveQuery('Neon').name, 'Neon');
  assert.deepEqual(resolveQuery('vanilla, cardamom').notes, ['vanilla', 'cardamom']);
  assert.equal(resolveQuery('something unknown'), null);
});

test('the scent map puts gourmands sweet-warm and vetivers dry', () => {
  const at = n => placeOnMap(FRAGRANCES.find(f => f.name === n));
  assert.ok(at('Khamrah').x > 1 && at('Khamrah').y > 1);
  assert.ok(at('Encre Noire').y < -2);
  assert.ok(at('Gullal').x < 0 && at('Gullal').y < 0);
  const text = mapInsight();
  assert.match(text, /Encre Noire and Gullal/);
  assert.match(text, /sweet tooth: 9 of 12/);
});

test('snap: colour sampling names the garment and finds looks', () => {
  assert.equal(nearestGarmentColour([110, 32, 48]), 'burgundy');
  assert.equal(nearestGarmentColour([245, 244, 238]), 'white');
  const px = new Uint8ClampedArray([110, 32, 48, 255, 112, 30, 50, 255, 250, 250, 250, 255]);
  const rgb = dominantColour(px);
  assert.equal(nearestGarmentColour(rgb), 'burgundy');
  assert.equal(looksForColour('burgundy').exact, true);
  assert.equal(looksForColour('burgundy').looks.length, 2);
  assert.equal(looksForColour('tan').exact, true);
});

test('weather bands prefer fresh in muggy heat and dense bases in the cold', () => {
  const heat = classifyWeather({ tempC: 31, humidity: 78, precipMm: 0, weatherCode: 1 });
  assert.equal(heat.band, 'humid-heat');
  const cold = classifyWeather({ tempC: 9, humidity: 60, precipMm: 1.2, weatherCode: 61 });
  assert.equal(cold.band, 'wet-cool');
  const neon = FRAGRANCES.find(f => f.name === 'Neon');
  const khamrah = FRAGRANCES.find(f => f.name === 'Khamrah');
  assert.ok(weatherAffinity(neon, heat) > weatherAffinity(khamrah, heat));
  assert.ok(weatherAffinity(khamrah, cold) > weatherAffinity(neon, cold));
  const hotRank = rankScents({ season: 'Su', time: 'D', weather: heat });
  assert.ok(hotRank.slice(0, 4).every(f => f.family === 'fresh' || f.family === 'floral'));
  const hotPlan = planScentDay({ date: '2026-01-15', events: [], weather: heat });
  assert.ok(['fresh', 'floral'].includes(hotPlan.day.family));
  assert.match(hotPlan.weatherLine, /muggy heat|airy|heat/i);
  assert.ok(hotPlan.notes.some(n => /Sydney/.test(n.title)));
});

test('combo wheel scores adjacent families and orders denser bottles first', () => {
  assert.equal(familyWheelDistance('fresh', 'woody'), 1);
  assert.equal(familyWheelDistance('fresh', 'floral'), 1);
  assert.equal(familyWheelDistance('fresh', 'amber'), 2);
  const neon = FRAGRANCES.find(f => f.name === 'Neon');
  const liaisons = FRAGRANCES.find(f => f.name === 'Liaisons Dangereuses');
  const irish = FRAGRANCES.find(f => f.name === 'Irish Creme');
  const asad = FRAGRANCES.find(f => f.name === 'Asad');
  assert.ok(comboScore(neon, liaisons) > comboScore(neon, irish), 'adjacent floral beats distant gourmand for Neon');
  const [base, accent] = layerOrder(irish, neon);
  assert.equal(base.name, 'Irish Creme');
  assert.equal(accent.name, 'Neon');
  const picks = combosFor(neon, { limit: 3 });
  assert.equal(picks.length, 3);
  assert.ok(picks.every(p => p.partner.name !== 'Neon'));
  assert.ok(picks[0].score >= picks.at(-1).score);
  assert.match(picks[0].why, /spray .+ first/i);
  const tops = topCombos({ limit: 4 });
  assert.ok(tops.length >= 3);
  assert.ok(placeOnWheel(asad).radius > 0.4);
  assert.ok(Number.isFinite(placeOnWheel(neon).angle));
});

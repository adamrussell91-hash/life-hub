import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendNoteChip,
  buildProductList,
  currentRoutineKey,
  slugifySkincareTitle,
  toSkincareConfirmPayload
} from '../../js/app/skincare-routines-data.js';
import { buildSkincareModel } from '../../js/app/skincare-model.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

test('currentRoutineKey is am before noon Sydney', () => {
  assert.equal(currentRoutineKey(new Date('2026-08-05T01:00:00Z')), 'am');
  assert.equal(currentRoutineKey(new Date('2026-08-05T03:00:00Z')), 'pm');
});

test('buildProductList includes chosen toner and extras', () => {
  const products = buildProductList('am', {
    choiceSelections: { toner: 'Dr Ceuracle Vegan Kombucha Tea Essence' },
    extras: ['Sheet mask']
  });
  assert.equal(products[0], 'Dr Ceuracle Vegan Kombucha Tea Essence');
  assert.ok(products.includes('Azclear Azelaic Acid 20%'));
  assert.ok(products.includes('Sheet mask'));
});

test('buildProductList filters active products and one-offs by enabled products', () => {
  const products = buildProductList('am', {
    activeProducts: ['Catalog serum', 'Catalog moisturiser', 'Catalog serum'],
    oneOffs: ['One-off treatment', 'Hidden treatment'],
    enabledProducts: ['Catalog moisturiser', 'One-off treatment']
  });
  assert.deepEqual(products, [
    'Anua Rice 70 + Ceramide Glow Milky Toner',
    'Catalog moisturiser',
    'One-off treatment'
  ]);
});

test('appendNoteChip dedupes case-insensitively', () => {
  assert.equal(appendNoteChip('', 'Redness'), 'Redness');
  assert.equal(appendNoteChip('Redness', 'Tightness'), 'Redness, Tightness');
  assert.equal(appendNoteChip('Redness', 'redness'), 'Redness');
});

test('toSkincareConfirmPayload builds am overwrite candidate', () => {
  const { candidate, slug, overwrite } = toSkincareConfirmPayload({
    date: '2026-08-05',
    routine: 'am',
    products: ['Toner'],
    notes: 'Dryness',
    slug: 'am'
  });
  assert.equal(overwrite, true);
  assert.equal(slug, 'am');
  assert.equal(candidate.fields.routine, 'am');
  assert.equal(candidate.fields.completed, true);
  assert.equal(candidate.notes, 'Dryness');
});

test('procedure payload prefixes notes and slugifies title', () => {
  const { candidate, slug } = toSkincareConfirmPayload({
    date: '2026-08-05',
    routine: 'pm',
    products: ['Laser'],
    notes: 'Mild redness',
    procedureTitle: 'Contour Clinics Laser'
  });
  assert.equal(slug, 'contour-clinics-laser');
  assert.match(candidate.notes, /^Procedure: Contour Clinics Laser/);
  assert.equal(slugifySkincareTitle('Contour Clinics Laser'), 'contour-clinics-laser');
});

test('buildSkincareModel marks am/pm logged and lists procedures', () => {
  const model = buildSkincareModel({
    date: '2026-08-05',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'am',
    events: [
      { record: { type: 'skincare', date: '2026-08-05', routine: 'am', products: ['x'] }, body: '', path: 'a' },
      { record: { type: 'skincare', date: '2026-08-05', routine: 'pm', products: ['Laser'] }, body: 'Procedure: Laser. Mild', path: 'b' }
    ]
  });
  assert.equal(model.amLogged, true);
  assert.equal(model.pmLogged, false);
  assert.equal(model.procedures.length, 1);
  assert.equal(model.currentRoutine, 'am');
});

test('buildSkincareModel overlays catalog products and excludes retired products', () => {
  const catalog = {
    schema_version: 1,
    am: {
      products: ['Catalog serum', 'Retired serum'],
      retired: ['Retired serum'],
      extras: []
    },
    pm: {
      products: ['Catalog cleanser'],
      retired: [],
      extras: []
    }
  };
  const model = buildSkincareModel({
    date: '2026-08-05',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'am',
    catalog,
    events: []
  });
  assert.deepEqual(model.routines.am.products, ['Catalog serum']);
  assert.deepEqual(model.routines.pm.products, ['Catalog cleanser']);
  assert.deepEqual(SKINCARE_ROUTINES.am.products, [
    'Azclear Azelaic Acid 20%',
    'Korres Greek Yoghurt Probiotic Gel Cream',
    'La Roche Posay Anthelios SPF 50+',
    'Dr Jart+ Cicapair Colour Corrector',
    'Maybelline Green and Peach Correctors with BareMinerals Concealer',
    'Kosas Cloud Set Translucent Loose Setting and Blurring Powder'
  ]);
});

test('buildSkincareModel preserves default products without a catalog', () => {
  const model = buildSkincareModel({
    date: '2026-08-05',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'am',
    catalog: null,
    events: []
  });
  assert.deepEqual(model.routines.am.products, SKINCARE_ROUTINES.am.products);
  assert.deepEqual(model.routines.pm.products, SKINCARE_ROUTINES.pm.products);
});

test('amStreak and pmStreak count consecutive routine days independently', () => {
  const model = buildSkincareModel({
    date: '2026-08-05',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'pm',
    events: [
      { record: { type: 'skincare', date: '2026-08-05', routine: 'am', products: [] }, body: '', path: 'am-05' },
      { record: { type: 'skincare', date: '2026-08-05', routine: 'pm', products: [] }, body: '', path: 'pm-05' },
      { record: { type: 'skincare', date: '2026-08-04', routine: 'am', products: [] }, body: '', path: 'am-04' },
      { record: { type: 'skincare', date: '2026-08-04', routine: 'pm', products: [] }, body: '', path: 'pm-04' },
      { record: { type: 'skincare', date: '2026-08-03', routine: 'am', products: [] }, body: '', path: 'am-03' },
      { record: { type: 'skincare', date: '2026-08-02', routine: 'am', products: ['Laser'] }, body: 'Procedure: Laser', path: 'procedure-02' }
    ]
  });
  assert.equal(model.amStreak, 3);
  assert.equal(model.pmStreak, 2);
});

test('monthHeatmap encodes miss/am/pm/both over 30 days ending at date', () => {
  const model = buildSkincareModel({
    date: '2026-08-05',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'pm',
    events: [
      { record: { type: 'skincare', date: '2026-08-05', routine: 'am', products: [] }, body: '', path: 'am-05' },
      { record: { type: 'skincare', date: '2026-08-05', routine: 'pm', products: [] }, body: '', path: 'pm-05' },
      { record: { type: 'skincare', date: '2026-08-04', routine: 'am', products: [] }, body: '', path: 'am-04' },
      { record: { type: 'skincare', date: '2026-08-03', routine: 'pm', products: [] }, body: '', path: 'pm-03' }
    ]
  });
  assert.equal(model.monthHeatmap.length, 30);
  assert.equal(model.monthHeatmap[0].date, '2026-07-07');
  assert.equal(model.monthHeatmap.at(-1).date, '2026-08-05');
  assert.equal(model.monthHeatmap.find(day => day.date === '2026-08-05').state, 'both');
  assert.equal(model.monthHeatmap.find(day => day.date === '2026-08-05').isToday, true);
  assert.equal(model.monthHeatmap.find(day => day.date === '2026-08-04').state, 'am');
  assert.equal(model.monthHeatmap.find(day => day.date === '2026-08-04').isToday, false);
  assert.equal(model.monthHeatmap.find(day => day.date === '2026-08-03').state, 'pm');
  assert.equal(model.monthHeatmap.find(day => day.date === '2026-08-02').state, 'miss');
});

test('procedures do not set am/pm heatmap hits', () => {
  const model = buildSkincareModel({
    date: '2026-08-05',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'pm',
    events: [
      { record: { type: 'skincare', date: '2026-08-01', routine: 'pm', products: ['Laser'] }, body: 'Procedure: Laser', path: 'procedure-01' }
    ]
  });
  assert.equal(model.monthHeatmap.find(day => day.date === '2026-08-01').state, 'miss');
});

test('buildSkincareModel builds a 7-day weekDots strip flagging any skincare log', () => {
  const model = buildSkincareModel({
    date: '2026-08-05',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'pm',
    events: [
      { record: { type: 'skincare', date: '2026-08-01', routine: 'am', products: [] }, body: '', path: 'a' },
      { record: { type: 'skincare', date: '2026-08-03', routine: 'pm', products: ['Laser'] }, body: 'Procedure: Laser', path: 'b' },
      { record: { type: 'skincare', date: '2026-08-05', routine: 'pm', products: [] }, body: '', path: 'c' },
      { record: { type: 'fitness', date: '2026-08-02', status: 'completed' }, body: '', path: 'd' }
    ]
  });
  assert.equal(model.weekDots.length, 7);
  assert.deepEqual(model.weekDots.map(day => day.date), [
    '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02',
    '2026-08-03', '2026-08-04', '2026-08-05'
  ]);
  assert.equal(model.weekDots.find(day => day.date === '2026-08-01').logged, true);
  assert.equal(model.weekDots.find(day => day.date === '2026-08-03').logged, true);
  assert.equal(model.weekDots.find(day => day.date === '2026-08-02').logged, false);
  assert.equal(model.weekDots.find(day => day.date === '2026-07-30').logged, false);
  assert.equal(model.weekDots.find(day => day.date === '2026-08-05').isToday, true);
  assert.equal(model.weekDots.find(day => day.date === '2026-08-01').isToday, false);
});

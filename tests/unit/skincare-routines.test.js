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

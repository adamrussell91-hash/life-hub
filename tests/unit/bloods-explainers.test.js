import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryNote, explainerFor } from '../../js/app/bloods-explainers.js';

test('explainerFor returns seeded copy for CRP and related markers', () => {
  const crp = explainerFor('crp');
  assert.match(crp.what, /inflammation/i);
  assert.match(crp.high, /flare|infection|inflammation/i);
  assert.ok(crp.related.includes('esr'));
});

test('explainerFor unknown keys still return generic non-diagnostic copy', () => {
  const other = explainerFor('mystery_marker');
  assert.ok(other.what);
  assert.match(other.disclaimer, /not medical advice/i);
});

test('categoryNote explains why Iron Studies are grouped', () => {
  assert.match(categoryNote('Iron Studies'), /together/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINCARE_ROUTINES } from '../../apps/life/js/app/skincare-routines-data.js';
import { loadSkincareDefaults, skincareRoutinesFromYaml } from '../../netlify/functions/_shared/skincare-defaults.mjs';
import { SYNTHETIC_SKINCARE_YAML } from '../fixtures/skincare-routines.mjs';

test('the public routine template ships no products', () => {
  assert.deepEqual(SKINCARE_ROUTINES.am.products, []);
  assert.deepEqual(SKINCARE_ROUTINES.pm.products, []);
  assert.ok(SKINCARE_ROUTINES.note_chips.includes('Redness'));
});

test('cold-start defaults come from the private config/skincare-routines.yml', async () => {
  const tree = [{ type: 'blob', path: 'config/skincare-routines.yml', sha: 's1' }];
  const readBlob = async () => ({ encoding: 'base64', content: Buffer.from(SYNTHETIC_SKINCARE_YAML).toString('base64') });
  const defaults = await loadSkincareDefaults({ tree, readBlob });
  assert.equal(defaults.am.products[0], 'Example Azelaic Gel 10%');
  assert.equal(defaults.pm.label, 'Evening routine');
});

test('missing, unreadable or broken private routine falls back to the empty template', async () => {
  assert.equal(await loadSkincareDefaults({ tree: [] }), SKINCARE_ROUTINES);
  const tree = [{ type: 'blob', path: 'config/skincare-routines.yml', sha: 's1' }];
  assert.equal(await loadSkincareDefaults({ tree, readBlob: async () => { throw new Error('offline'); } }), SKINCARE_ROUTINES);
  assert.equal(skincareRoutinesFromYaml('am: [broken'), SKINCARE_ROUTINES);
});

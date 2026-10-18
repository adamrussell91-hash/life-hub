import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePageId } from '../../netlify/functions/_shared/notion-import-run.mjs';
import { config as planConfig } from '../../netlify/functions/notion-import-plan.mjs';
import { config as applyConfig } from '../../netlify/functions/notion-import-apply.mjs';
import { config as readConfig } from '../../netlify/functions/notion-import.mjs';

const DASHED = '0123abcd-4567-89ef-0123-456789abcdef';
const BARE = DASHED.replace(/-/g, '');

test('normalizePageId dashes 32-hex ids in every form', () => {
  assert.equal(normalizePageId(BARE), DASHED);
  assert.equal(normalizePageId(DASHED), DASHED);
  assert.equal(normalizePageId(BARE.toUpperCase()), DASHED);
  assert.equal(normalizePageId(`https://www.notion.so/Made-up-Face-dead-${BARE}?v=1`), DASHED);
});

test('normalizePageId leaves non-hex ids alone', () => {
  assert.equal(normalizePageId('u1'), 'u1');
  assert.equal(normalizePageId('nope'), 'nope');
});

test('function configs declare paths and background mode', () => {
  assert.equal(planConfig.path, '/api/notion-import/plan');
  assert.equal(planConfig.background, true);
  assert.equal(applyConfig.path, '/api/notion-import/apply');
  assert.equal(applyConfig.background, true);
  assert.deepEqual(readConfig.path, ['/api/notion-import/search', '/api/notion-import/jobs/:id']);
  assert.notEqual(readConfig.background, true);
});

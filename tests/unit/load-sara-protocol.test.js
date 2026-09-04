import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSaraProtocol } from '../../netlify/functions/_shared/load-sara-protocol.mjs';

test('loads the checked-in Sara protocol markdown', () => {
  const text = loadSaraProtocol();
  assert.match(text, /Operating Manual|Weekly health scan|Boundaries/i);
  assert.match(text, /Before advising or logging|Central Node after body log/i);
  assert.match(text, /Life Hub Medical Overview is the medical record/);
  assert.doesNotMatch(text, /You do not maintain Medical Records/);
  assert.match(text, /confirm/i);
  assert.match(text, /no search-use cap/);
  assert.match(text, /refine and search again/);
  assert.match(text, /search_medical_records/);
  assert.match(text, /brief_medical_appointment/);
  assert.match(text, /Medical Overview is live and readable/);
  assert.doesNotMatch(text, /lives at the Notion link/i);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadSaraProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});

test('central node constraints point full medical history at Life Hub', () => {
  const text = readFileSync(new URL('../../central-node.md', import.meta.url), 'utf8');
  assert.match(text, /Full medical history lives in Life Hub Medical Overview/);
  assert.doesNotMatch(text, /2d0f794f847680cfbd95ef30837b5b66/);
});


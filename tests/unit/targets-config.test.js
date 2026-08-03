import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { TARGETS_CONFIG } from '../../netlify/functions/_shared/targets-config.mjs';

test('the server target-set mirror matches config/targets.yml exactly', () => {
  const configured = load(readFileSync(new URL('../../config/targets.yml', import.meta.url), 'utf8'));
  assert.deepEqual(TARGETS_CONFIG, configured);
});

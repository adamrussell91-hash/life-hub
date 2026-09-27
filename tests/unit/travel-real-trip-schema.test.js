import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateTrip } from '../../netlify/functions/_shared/travel-schema.mjs';

const dataDir = process.env.LIFE_HUB_DATA_DIR;

test('Adam trip files in LIFE_HUB_DATA_DIR validate (skip when unset)', { skip: !dataDir }, () => {
  const tripsDir = join(dataDir, 'data/travel/trips');
  assert.ok(existsSync(tripsDir), `missing ${tripsDir}`);
  const files = readdirSync(tripsDir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length > 0, 'expected at least one trip file');
  for (const name of files) {
    const trip = JSON.parse(readFileSync(join(tripsDir, name), 'utf8'));
    assert.doesNotThrow(() => validateTrip(trip), `validate ${name}`);
  }
});

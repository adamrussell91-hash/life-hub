import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCentralNodeSeed } from '../../netlify/functions/_shared/load-central-node-seed.mjs';

test('loads the checked-in central-node.md seed', () => {
  const text = loadCentralNodeSeed();
  assert.match(text, /Today's Status/);
  assert.match(text, /Recent Agent Actions/);
  assert.match(text, /Writing Rules/);
  assert.match(text, /## 👤 About Me/);
  assert.match(text, /About Me\*\* is standing context/);
});

test('seed Agent Directory lists live Clare and Ann, not Clementine', () => {
  const text = loadCentralNodeSeed();
  const directorySection = text.slice(text.indexOf('## 🤖 Agent Directory'), text.indexOf('## 👤 About Me'));
  assert.match(directorySection, /Clare DeMind \(Tasks Agent\)/);
  assert.match(directorySection, /Ann O'Tation \(Teaching Agent\)/);
  assert.doesNotMatch(directorySection, /Clementine/);
});

test('seed central node contains no Notion references or Notion URLs', () => {
  const text = loadCentralNodeSeed();
  assert.doesNotMatch(text, /notion/i);
  assert.doesNotMatch(text, /app\.notion\.com/i);
});

test('seed About Me states the standing rules and does not name the invisible birth family', () => {
  const text = loadCentralNodeSeed();
  const about = text.slice(text.indexOf('## 👤 About Me'), text.indexOf('## 🔴 Current Constraints'));
  assert.match(about, /Corey comes first every time/);
  assert.match(about, /Gifted Education Teacher at St Aloysius' College/);
  assert.match(about, /St Pius X High School/);
  assert.match(about, /Do not recommend leaving or quitting a job unless he is explicitly talking about that/);
  assert.match(about, /Korea honeymoon: 23 December 2026 to 10 January 2027/);
  assert.match(about, /1 December 2026/);
  assert.match(about, /background hum/);
  assert.doesNotMatch(about, /\bShane\b|\bMichelle\b|\bKimberly\b/);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadCentralNodeSeed({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractConstraints } from '../../netlify/functions/_shared/constraints.mjs';

const sample = `# Purpose
Intro text.
---
## 🔴 Current Constraints & Priorities
### Medical Status
- Line one
- Line two
---
## ⚡ Today's Status (Friday 19 June 2026)
Should not appear.
`;

test('extracts only the Constraints & Priorities section', () => {
  const result = extractConstraints(sample);
  assert.match(result, /Medical Status/);
  assert.match(result, /Line two/);
  assert.doesNotMatch(result, /Today's Status/);
});

test('returns an empty string when the heading is missing', () => {
  assert.equal(extractConstraints('# Purpose\nNo constraints here.'), '');
});

test('rejects non-string input', () => {
  assert.throws(() => extractConstraints(null), TypeError);
});

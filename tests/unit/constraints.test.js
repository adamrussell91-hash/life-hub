import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  extractTodaysStatus
} from '../../netlify/functions/_shared/constraints.mjs';

const sample = `# Purpose
Intro text.
---
## 🔴 Current Constraints & Priorities
### Medical Status
- Line one
- Line two
---
## ⚡ Today's Status (Friday 19 June 2026)
**Health:** Flare-up confirmed today.
---
## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: 31 Jul session completed. Set Day Type to 45 to 60 min Workout.
---
## 📝 Recent Agent Actions
**30 Jul:** Chadwick: Chest and Curls session completed and logged.
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

test('extractTodaysStatus matches the heading even though its date suffix changes daily', () => {
  const result = extractTodaysStatus(sample);
  assert.match(result, /Flare-up confirmed today/);
  assert.doesNotMatch(result, /Cross-Agent Coordination/);
});

test('extractCrossAgentCoordination extracts the directives section', () => {
  const result = extractCrossAgentCoordination(sample);
  assert.match(result, /Chadwick→Brisket/);
  assert.doesNotMatch(result, /Recent Agent Actions/);
});

test('extractRecentAgentActions extracts the rolling action log', () => {
  const result = extractRecentAgentActions(sample);
  assert.match(result, /Chest and Curls session completed/);
});

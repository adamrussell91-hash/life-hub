import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FITNESS_RESEARCH_PATH,
  FITNESS_RESEARCH_FRESH_DAYS,
  parseFitnessResearch,
  validateFitnessResearchEntry,
  upsertFitnessResearch,
  fitnessResearchAge,
  fitnessResearchIsDue,
  formatFitnessResearchForPrompt,
  saveFitnessResearchSchema
} from '../../netlify/functions/_shared/fitness-research.mjs';

test('fitness research uses a fourteen day freshness window', () => {
  const entry = {
    area: 'Biceps',
    goal: 'Tom Holland Spider-Man arms',
    researched_on: '2026-09-02'
  };
  assert.equal(FITNESS_RESEARCH_FRESH_DAYS, 14);
  assert.equal(fitnessResearchAge(entry, '2026-09-16'), 14);
  assert.equal(fitnessResearchIsDue(entry, '2026-09-15'), false);
  assert.equal(fitnessResearchIsDue(entry, '2026-09-16'), true);
});

test('validates, stores, and refreshes a distilled finding by area and goal', () => {
  const entry = validateFitnessResearchEntry({
    area: ' Biceps ',
    goal: 'Tom Holland Spider-Man arms',
    finding: 'Use controlled curls across distinct shoulder positions.',
    source_title: 'Hypertrophy review',
    source_url: 'https://example.com/review',
    researched_on: '2026-09-16',
    confidence: 'moderate',
    aeke_translation: 'Use a valid AEKE curl without changing its fixed attachment.'
  }, '2026-09-16');
  assert.equal(entry.area, 'Biceps');
  const first = upsertFitnessResearch([], entry, '2026-09-16T10:00:00+10:00');
  const second = upsertFitnessResearch(first, {
    ...entry,
    finding: 'Updated finding'
  }, '2026-09-17T10:00:00+10:00');
  assert.equal(second.length, 1);
  assert.equal(second[0].finding, 'Updated finding');
});

test('prompt exposes current date, age, due state, evidence, and AEKE translation', () => {
  const text = formatFitnessResearchForPrompt([{
    area: 'Biceps',
    goal: 'Tom Holland Spider-Man arms',
    finding: 'Controlled direct curl work.',
    source_title: 'Review',
    source_url: 'https://example.com',
    researched_on: '2026-09-01',
    aeke_translation: 'AEKE curl, fixed attachment'
  }], '2026-09-16');
  assert.match(text, /15 days ago/);
  assert.match(text, /RESEARCH DUE/);
  assert.match(text, /AEKE translation/);
});

test('empty research memory explicitly makes the requested focus due', () => {
  assert.match(formatFitnessResearchForPrompt([], '2026-09-16'), /No stored fitness research/);
  assert.match(formatFitnessResearchForPrompt([], '2026-09-16'), /2026-09-16/);
});

test('schema and storage path are stable', () => {
  assert.equal(FITNESS_RESEARCH_PATH, 'data/fitness-research.json');
  assert.equal(saveFitnessResearchSchema().name, 'save_fitness_research');
  assert.deepEqual(parseFitnessResearch('{'), []);
});

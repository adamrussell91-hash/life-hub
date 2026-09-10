import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NUTRITION_CHALLENGES_PATH,
  emptyNutritionChallenges,
  parseNutritionChallenges,
  serializeNutritionChallenges,
  validateUpsertNutritionChallengeInput,
  validateMarkNutritionChallengeDayInput,
  upsertNutritionChallenge,
  markNutritionChallengeDay,
  formatNutritionChallengesForPrompt,
  buildChallengeCnLine,
  activeChallengesForDate,
  tallyChallenge,
  upsertNutritionChallengeSchema,
  markNutritionChallengeDaySchema,
  listNutritionChallengesSchema
} from '../../apps/life/js/core/nutrition-challenges.js';
import { syncChallengeToCentralNode } from '../../apps/life/js/core/nutrition-challenge-cn.js';

const SEED_CN = `# Purpose
x
---
## ⚡ Today's Status (Sunday 30 August 2026)
**Flags:** Quiet.
---
## 📅 This Week (24 – 30 August 2026)
**Key Events:**
- Something else
---
## 📝 Recent Agent Actions
- Old line
`;

test('path is data/nutrition/challenges.json', () => {
  assert.equal(NUTRITION_CHALLENGES_PATH, 'data/nutrition/challenges.json');
});

test('schemas expose expected tool names', () => {
  assert.equal(upsertNutritionChallengeSchema().name, 'upsert_nutrition_challenge');
  assert.equal(markNutritionChallengeDaySchema().name, 'mark_nutrition_challenge_day');
  assert.equal(listNutritionChallengesSchema().name, 'list_nutrition_challenges');
});

test('validate upsert rejects inverted or overlong ranges', () => {
  assert.equal(validateUpsertNutritionChallengeInput({
    title: 'No sugar',
    start: '2026-08-30',
    end: '2026-08-24'
  }), null);
  assert.equal(validateUpsertNutritionChallengeInput({
    title: 'No sugar',
    start: '2026-08-01',
    end: '2026-09-15'
  }), null);
  const ok = validateUpsertNutritionChallengeInput({
    title: 'No refined sugar',
    start: '2026-08-24',
    end: '2026-08-30',
    rule: 'No refined sugar or UPFs'
  });
  assert.equal(ok.id, 'no-refined-sugar-2026-08-24');
  assert.equal(ok.title, 'No refined sugar');
});

test('upsert creates pending day cells and mark updates the scoreboard', () => {
  const draft = validateUpsertNutritionChallengeInput({
    title: 'No refined sugar',
    start: '2026-08-24',
    end: '2026-08-30'
  });
  const created = upsertNutritionChallenge(emptyNutritionChallenges(), draft);
  assert.equal(created.created, true);
  assert.equal(tallyChallenge(created.challenge).pending, 7);
  assert.equal(created.challenge.days['2026-08-24'].result, 'pending');

  const marked = markNutritionChallengeDay(
    { challenges: created.challenges },
    validateMarkNutritionChallengeDayInput({
      id: created.challenge.id,
      date: '2026-08-24',
      result: 'clean'
    })
  );
  assert.equal(marked.challenge.days['2026-08-24'].result, 'clean');
  assert.equal(tallyChallenge(marked.challenge).clean, 1);

  const missed = markNutritionChallengeDay(
    { challenges: marked.challenges },
    validateMarkNutritionChallengeDayInput({
      id: created.challenge.id,
      date: '2026-08-25',
      result: 'miss',
      note: 'sauce sugar'
    })
  );
  assert.equal(missed.challenge.days['2026-08-25'].result, 'miss');
  assert.equal(missed.challenge.days['2026-08-25'].note, 'sauce sugar');
  assert.deepEqual(tallyChallenge(missed.challenge), {
    clean: 1, miss: 1, pending: 5, total: 7
  });
});

test('serialize round-trips and prompt format includes scoreboard', () => {
  const draft = validateUpsertNutritionChallengeInput({
    title: 'No refined sugar',
    start: '2026-08-24',
    end: '2026-08-30'
  });
  const { challenges, challenge } = upsertNutritionChallenge(emptyNutritionChallenges(), draft);
  const text = serializeNutritionChallenges({ challenges });
  const parsed = parseNutritionChallenges(text);
  assert.equal(parsed.challenges[0].id, challenge.id);

  const prompt = formatNutritionChallengesForPrompt({ challenges }, { today: '2026-08-25' });
  assert.match(prompt, /No refined sugar/);
  assert.match(prompt, /0 clean \/ 0 miss \/ 7 pending/);
});

test('activeChallengesForDate filters by window and status', () => {
  const draft = validateUpsertNutritionChallengeInput({
    title: 'No refined sugar',
    start: '2026-08-24',
    end: '2026-08-30'
  });
  const { challenges } = upsertNutritionChallenge(emptyNutritionChallenges(), draft);
  assert.equal(activeChallengesForDate({ challenges }, '2026-08-26').length, 1);
  assert.equal(activeChallengesForDate({ challenges }, '2026-08-20').length, 0);
});

test('syncChallengeToCentralNode writes This Week scoreboard, Flags, and Recent Actions', () => {
  const draft = validateUpsertNutritionChallengeInput({
    title: 'No refined sugar',
    start: '2026-08-24',
    end: '2026-08-30'
  });
  const { challenge } = upsertNutritionChallenge(emptyNutritionChallenges(), draft);
  const next = syncChallengeToCentralNode(SEED_CN, challenge, {
    actionLine: '- Brisket: opened no-refined-sugar challenge tracker.'
  });
  assert.match(next, /Nutrition challenge \(no-refined-sugar-2026-08-24\)/);
  assert.match(next, /Tracker on Nutrition/);
  assert.match(next, /Nutrition challenge active — No refined sugar/);
  assert.match(next, /opened no-refined-sugar challenge tracker/);
  assert.match(next, /Something else/);

  const line = buildChallengeCnLine(challenge);
  assert.match(line, /0 clean \/ 0 miss \/ 7 pending/);

  const remarked = markNutritionChallengeDay(
    { challenges: [challenge] },
    { id: challenge.id, date: '2026-08-24', result: 'clean' }
  );
  const updated = syncChallengeToCentralNode(next, remarked.challenge, { updateFlags: false });
  assert.match(updated, /1 clean \/ 0 miss \/ 6 pending/);
  assert.equal(
    (updated.match(/Nutrition challenge \(no-refined-sugar-2026-08-24\)/g) || []).length,
    1
  );
});

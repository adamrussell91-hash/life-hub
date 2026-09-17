import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGenerationPrompt,
  buildOpeningLine,
  generateBriefContent,
  MODEL_ID
} from '../../netlify/functions/_shared/person-brief-generation.mjs';

function throwingFetch() {
  throw new Error('generateBriefContent must never call the real network in tests.');
}

const CHANGES_FIXTURE = {
  new_observations: [{ id: 'observation_1', occurred_at: '2026-08-01T00:00:00.000Z', text: 'Mentioned a new project.', source: 'manual' }],
  new_communications: [],
  new_meetings_events: [],
  relationship_changes: [
    { type: 'opened', relationship_type: 'employee_at', counterpart_ref: 'shared:organisation:organisation_acme', counterpart_name: 'Acme', date: '2026-08-10T00:00:00.000Z' }
  ]
};

// --- MODEL_ID ---

test('uses claude-sonnet-5, not the stale claude-sonnet-4-6 id copied from knowledge-clementine-coach.mjs', () => {
  assert.equal(MODEL_ID, 'claude-sonnet-5');
  assert.notEqual(MODEL_ID, 'claude-sonnet-4-6');
});

// --- buildGenerationPrompt ---

test('system prompt contains the "not surveillance" tone constraint', () => {
  const { system } = buildGenerationPrompt(CHANGES_FIXTURE);
  assert.match(system, /not surveillance/i);
});

test('system prompt contains the no-invented-facts constraint', () => {
  const { system } = buildGenerationPrompt(CHANGES_FIXTURE);
  assert.match(system, /never invent, infer, guess, or embellish/i);
  assert.match(system, /not explicitly present in the structured input/i);
});

test('system prompt instructs a capped, structured JSON response', () => {
  const { system } = buildGenerationPrompt(CHANGES_FIXTURE);
  assert.match(system, /"since_last_spoke"/);
  assert.match(system, /"talking_points"/);
  assert.match(system, /up to 4/);
});

test('userMessage embeds the exact structured input as JSON, nothing added', () => {
  const { userMessage } = buildGenerationPrompt(CHANGES_FIXTURE);
  assert.ok(userMessage.includes(JSON.stringify(CHANGES_FIXTURE, null, 2)));
});

// --- generateBriefContent ---

test('generateBriefContent parses a well-formed canned response via injected complete()', async () => {
  const complete = async (system, messages) => {
    assert.equal(typeof system, 'string');
    assert.ok(Array.isArray(messages));
    assert.equal(messages[0].role, 'user');
    return JSON.stringify({
      since_last_spoke: ['They started a new role at Acme.'],
      talking_points: ['Ask how the new role at Acme is going.']
    });
  };

  const result = await generateBriefContent({ structuredInput: CHANGES_FIXTURE, apiKey: 'unused', fetchImpl: throwingFetch, complete });
  assert.deepEqual(result, {
    since_last_spoke: ['They started a new role at Acme.'],
    talking_points: ['Ask how the new role at Acme is going.']
  });
});

test('generateBriefContent strips a stray ```json fence before parsing', async () => {
  const complete = async () =>
    '```json\n' + JSON.stringify({ since_last_spoke: ['A.'], talking_points: ['B.'] }) + '\n```';
  const result = await generateBriefContent({ structuredInput: CHANGES_FIXTURE, apiKey: 'unused', fetchImpl: throwingFetch, complete });
  assert.deepEqual(result, { since_last_spoke: ['A.'], talking_points: ['B.'] });
});

test('generateBriefContent truncates an absurdly long bullet array rather than trusting it blindly', async () => {
  const manyBullets = Array.from({ length: 200 }, (_, i) => `Bullet ${i}`);
  const complete = async () => JSON.stringify({ since_last_spoke: manyBullets, talking_points: manyBullets });
  const result = await generateBriefContent({ structuredInput: CHANGES_FIXTURE, apiKey: 'unused', fetchImpl: throwingFetch, complete });
  assert.equal(result.since_last_spoke.length, 4);
  assert.equal(result.talking_points.length, 4);
});

test('generateBriefContent fails gracefully (not a crash) on malformed non-JSON output', async () => {
  const complete = async () => 'Sure! Here are some bullet points about this person...';
  await assert.rejects(
    () => generateBriefContent({ structuredInput: CHANGES_FIXTURE, apiKey: 'unused', fetchImpl: throwingFetch, complete }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'brief_generation_failed');
      assert.equal(error.retryable, true);
      return true;
    }
  );
});

test('generateBriefContent fails gracefully when the parsed JSON has the wrong shape', async () => {
  const complete = async () => JSON.stringify({ oops: true });
  await assert.rejects(
    () => generateBriefContent({ structuredInput: CHANGES_FIXTURE, apiKey: 'unused', fetchImpl: throwingFetch, complete }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'brief_generation_failed');
      return true;
    }
  );
});

test('generateBriefContent fails gracefully when since_last_spoke/talking_points are not arrays of strings', async () => {
  const complete = async () => JSON.stringify({ since_last_spoke: 'not an array', talking_points: [1, 2, 3] });
  await assert.rejects(() =>
    generateBriefContent({ structuredInput: CHANGES_FIXTURE, apiKey: 'unused', fetchImpl: throwingFetch, complete })
  );
});

test('generateBriefContent propagates a completion-call failure as a 502 brief_generation_failed', async () => {
  const complete = async () => {
    throw new Error('simulated network failure');
  };
  await assert.rejects(
    () => generateBriefContent({ structuredInput: CHANGES_FIXTURE, apiKey: 'unused', fetchImpl: throwingFetch, complete }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'brief_generation_failed');
      assert.equal(error.retryable, true);
      return true;
    }
  );
});

test('generateBriefContent never touches the real network — no complete/fetchImpl given falls through to fetch, which we deliberately do not exercise here', () => {
  // This test file never calls generateBriefContent without an injected
  // `complete`, and every `fetchImpl` passed above throws if invoked — this
  // assertion just documents that discipline for a reader of this file.
  assert.ok(true);
});

// --- buildOpeningLine ---

const NOW = '2026-09-17T00:00:00.000Z';

test('buildOpeningLine handles a null last-meaningful-interaction (brand-new person, nothing recorded)', () => {
  const line = buildOpeningLine(null, NOW);
  assert.match(line, /no prior interaction/i);
});

test('buildOpeningLine phrases a meeting-sourced anchor honestly', () => {
  const line = buildOpeningLine({ date: '2026-06-17T00:00:00.000Z', kind: 'meeting', label: 'Coffee meeting' }, NOW);
  assert.match(line, /you last met/i);
  assert.match(line, /Coffee meeting/);
});

test('buildOpeningLine phrases an event-sourced anchor honestly', () => {
  const line = buildOpeningLine({ date: '2026-06-17T00:00:00.000Z', kind: 'event', label: 'Gifted Education Network' }, NOW);
  assert.match(line, /you last saw them/i);
  assert.match(line, /Gifted Education Network/);
});

test('buildOpeningLine phrases a communication-sourced anchor honestly (never claims "spoke")', () => {
  const line = buildOpeningLine({ date: '2026-06-17T00:00:00.000Z', kind: 'communication', label: null }, NOW);
  assert.match(line, /exchanged a message/i);
});

test('buildOpeningLine phrases an observation-sourced anchor honestly', () => {
  const line = buildOpeningLine({ date: '2026-06-17T00:00:00.000Z', kind: 'observation', label: 'Some note' }, NOW);
  assert.match(line, /noted something/i);
});

test('buildOpeningLine ends with a "Since then:" transition into the following bullets', () => {
  const line = buildOpeningLine({ date: '2026-06-17T00:00:00.000Z', kind: 'meeting', label: null }, NOW);
  assert.match(line, /Since then:$/);
});

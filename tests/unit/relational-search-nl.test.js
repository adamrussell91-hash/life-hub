import assert from 'node:assert/strict';
import test from 'node:test';
import { getRelationshipDeclaration } from '../../netlify/functions/_shared/relationship-registry.mjs';
import {
  MODEL_ID,
  planRelationalQuery,
  resolveOrganisationByName
} from '../../netlify/functions/_shared/relational-search-nl.mjs';
import {
  buildIdentityIndexRecord,
  IDENTITY_SCHEMA_VERSION,
  generateOrganisationId
} from '../../netlify/functions/_shared/identity-schema.mjs';
import { organisationIndexKey, organisationKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { memoryStore } from '../support/people-fixtures.mjs';

function throwingFetch() {
  throw new Error('planRelationalQuery must never call the real network in tests.');
}

const REAL_ALLOWED_ROLES = getRelationshipDeclaration('professional_relationship').allowed_roles;

async function makeIndexedOrganisation(store, { display_name }) {
  const id = generateOrganisationId();
  const timestamp = '2026-01-01T00:00:00.000Z';
  const record = {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'organisation',
    display_name,
    legal_name: null,
    aliases: [],
    lifecycle_status: 'active',
    retention_reason: null,
    retention_review_at: null,
    created_at: timestamp,
    updated_at: timestamp
  };
  await store.setJSON(organisationKey(id), record);
  await store.setJSON(
    organisationIndexKey(id),
    buildIdentityIndexRecord({
      id,
      kind: 'organisation',
      displayLabel: display_name,
      sortName: null,
      lifecycleStatus: 'active',
      isSelf: false,
      updatedAt: timestamp
    })
  );
  return { id, ref: `shared:organisation:${id}` };
}

// --- MODEL_ID ---

test('uses claude-sonnet-5', () => {
  assert.equal(MODEL_ID, 'claude-sonnet-5');
});

// --- planRelationalQuery: well-formed parsing ---

test('planRelationalQuery parses a well-formed model response into the filter shape', async () => {
  const complete = async (system, messages) => {
    assert.equal(typeof system, 'string');
    assert.match(system, /organisation_name/);
    // The real, current allowed_roles enum must be embedded, never hardcoded.
    for (const role of REAL_ALLOWED_ROLES) {
      assert.ok(system.includes(role), `expected system prompt to include role "${role}"`);
    }
    assert.equal(messages[0].role, 'user');
    assert.match(messages[0].content, /gifted education/);
    return JSON.stringify({
      organisation_name: 'UNSW',
      role: 'academic_contact',
      text: 'gifted education',
      unsupported: false,
      unsupported_reason: null
    });
  };
  const resolveOrganisationByName = async (store, name) => {
    assert.equal(name, 'UNSW');
    return { ref: 'shared:organisation:organisation_test', display_label: 'UNSW' };
  };

  const plan = await planRelationalQuery({
    question: 'Who do I know at UNSW connected to gifted education?',
    apiKey: 'unused',
    fetchImpl: throwingFetch,
    complete,
    store: {},
    resolveOrganisationByName
  });

  assert.deepEqual(plan, {
    organisation_ref: 'shared:organisation:organisation_test',
    organisation_name: 'UNSW',
    organisation_matched: true,
    role: 'academic_contact',
    text: 'gifted education',
    unsupported: false,
    unsupported_reason: ''
  });
});

test('planRelationalQuery strips a stray ```json fence before parsing', async () => {
  const complete = async () =>
    '```json\n' +
    JSON.stringify({ organisation_name: null, role: null, text: 'mentoring', unsupported: false, unsupported_reason: null }) +
    '\n```';
  const plan = await planRelationalQuery({
    question: 'Anyone I mentor?',
    apiKey: 'unused',
    fetchImpl: throwingFetch,
    complete,
    store: {}
  });
  assert.equal(plan.text, 'mentoring');
  assert.equal(plan.organisation_ref, '');
  assert.equal(plan.organisation_matched, false);
});

// --- Organisation-name resolution ---

test('planRelationalQuery resolves a matched organisation name to its ref via the injected resolver', async () => {
  const complete = async () =>
    JSON.stringify({ organisation_name: 'Acme', role: null, text: null, unsupported: false, unsupported_reason: null });
  const resolveOrganisationByName = async (store, name) => {
    assert.equal(name, 'Acme');
    return { ref: 'shared:organisation:organisation_acme', display_label: 'Acme Corp' };
  };
  const plan = await planRelationalQuery({
    question: 'Who do I know at Acme?',
    apiKey: 'unused',
    fetchImpl: throwingFetch,
    complete,
    store: {},
    resolveOrganisationByName
  });
  assert.equal(plan.organisation_ref, 'shared:organisation:organisation_acme');
  // Transparency: the RESOLVED display label is surfaced, not just the raw model guess.
  assert.equal(plan.organisation_name, 'Acme Corp');
  assert.equal(plan.organisation_matched, true);
});

test('planRelationalQuery leaves organisation_ref empty on a no-match, rather than fabricating one', async () => {
  const complete = async () =>
    JSON.stringify({
      organisation_name: 'A Company That Does Not Exist',
      role: null,
      text: null,
      unsupported: false,
      unsupported_reason: null
    });
  const resolveOrganisationByName = async () => null;
  const plan = await planRelationalQuery({
    question: 'Who do I know at A Company That Does Not Exist?',
    apiKey: 'unused',
    fetchImpl: throwingFetch,
    complete,
    store: {},
    resolveOrganisationByName
  });
  assert.equal(plan.organisation_ref, '');
  assert.equal(plan.organisation_matched, false);
  // The raw (unresolved) name is still surfaced for transparency about what was searched.
  assert.equal(plan.organisation_name, 'A Company That Does Not Exist');
});

test('resolveOrganisationByName reuses entity-search.mjs\'s real searchIdentityKind mechanism — match case', async () => {
  const store = memoryStore();
  const org = await makeIndexedOrganisation(store, { display_name: 'UNSW' });
  const result = await resolveOrganisationByName(store, 'UNSW');
  assert.ok(result);
  assert.equal(result.ref, org.ref);
  assert.equal(result.display_label, 'UNSW');
});

test('resolveOrganisationByName returns null on a genuine no-match, not a fabricated ref', async () => {
  const store = memoryStore();
  await makeIndexedOrganisation(store, { display_name: 'UNSW' });
  const result = await resolveOrganisationByName(store, 'Definitely Not A Real Org');
  assert.equal(result, null);
});

test('resolveOrganisationByName returns null for an empty/blank name without touching the store', async () => {
  const result = await resolveOrganisationByName(memoryStore(), '   ');
  assert.equal(result, null);
});

// --- Role closed-vocabulary enforcement (against the REAL registry enum) ---

test('a model-hallucinated role value is dropped, not passed through, against the real registry enum', async () => {
  const hallucinated = 'best_friend_forever';
  assert.ok(!REAL_ALLOWED_ROLES.includes(hallucinated), 'test fixture must actually be outside the real enum');

  const complete = async () =>
    JSON.stringify({ organisation_name: null, role: hallucinated, text: null, unsupported: false, unsupported_reason: null });
  const plan = await planRelationalQuery({
    question: 'Who is my best friend forever?',
    apiKey: 'unused',
    fetchImpl: throwingFetch,
    complete,
    store: {}
  });
  // Dropped, never surfaced to the caller and never handed to runRelationalSearch.
  assert.equal(plan.role, '');
});

test('a real registry role value passes through unchanged', async () => {
  const complete = async () =>
    JSON.stringify({ organisation_name: null, role: 'mentor', text: null, unsupported: false, unsupported_reason: null });
  const plan = await planRelationalQuery({
    question: 'Who do I mentor?',
    apiKey: 'unused',
    fetchImpl: throwingFetch,
    complete,
    store: {}
  });
  assert.equal(plan.role, 'mentor');
  assert.ok(REAL_ALLOWED_ROLES.includes('mentor'));
});

// --- Unsupported (multi-hop / out-of-scope) questions ---

test('an honestly-unsupported question is surfaced as such, not forced into a bad-fit filter', async () => {
  const complete = async () =>
    JSON.stringify({
      organisation_name: null,
      role: null,
      text: null,
      unsupported: true,
      unsupported_reason: 'This needs multi-hop reasoning across the network, which these filters cannot express.'
    });
  const plan = await planRelationalQuery({
    question: 'Who should introduce me to someone at UNSW?',
    apiKey: 'unused',
    fetchImpl: throwingFetch,
    complete,
    store: {}
  });
  assert.equal(plan.unsupported, true);
  assert.match(plan.unsupported_reason, /multi-hop/);
});

// --- Malformed / missing-input handling ---

test('planRelationalQuery fails gracefully (not a crash) on malformed non-JSON output', async () => {
  const complete = async () => 'Sure! Here is a filter for you...';
  await assert.rejects(
    () => planRelationalQuery({ question: 'Who do I know at UNSW?', apiKey: 'unused', fetchImpl: throwingFetch, complete, store: {} }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'relational_search_nl_plan_failed');
      assert.equal(error.retryable, true);
      return true;
    }
  );
});

test('planRelationalQuery fails gracefully when the parsed JSON has the wrong shape', async () => {
  const complete = async () => JSON.stringify(['not', 'an', 'object']);
  await assert.rejects(() =>
    planRelationalQuery({ question: 'Who do I know at UNSW?', apiKey: 'unused', fetchImpl: throwingFetch, complete, store: {} })
  );
});

test('planRelationalQuery propagates a completion-call failure as a 502', async () => {
  const complete = async () => {
    throw new Error('simulated network failure');
  };
  await assert.rejects(
    () => planRelationalQuery({ question: 'Who do I know at UNSW?', apiKey: 'unused', fetchImpl: throwingFetch, complete, store: {} }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'relational_search_nl_plan_failed');
      return true;
    }
  );
});

test('planRelationalQuery rejects an empty question with a 400 before ever calling complete()', async () => {
  const complete = async () => {
    throw new Error('must not be called for an empty question');
  };
  await assert.rejects(
    () => planRelationalQuery({ question: '   ', apiKey: 'unused', fetchImpl: throwingFetch, complete, store: {} }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, 'missing_question');
      return true;
    }
  );
});

test('planRelationalQuery never touches the real network — every complete()/fetchImpl above is injected or throws', () => {
  // Documented discipline (mirrors person-brief-generation.test.js): this
  // file never calls planRelationalQuery without an injected `complete`,
  // and every `fetchImpl` passed above throws if invoked.
  assert.ok(true);
});

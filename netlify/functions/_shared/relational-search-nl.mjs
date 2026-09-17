import { getRelationshipDeclaration } from './relationship-registry.mjs';
import { listOrganisationIndexKeys, organisationKey } from './universal-link-blobs.mjs';
import { parseOrganisationRecord } from './identity-schema.mjs';
import { searchIdentityKind } from '../entity-search.mjs';

// Natural-language relational search (Phase 5) — Layer 2 on top of
// `_shared/relational-search.mjs`'s Layer 1 structured filters
// (`{organisation_ref, role, text}`), deferred from Phase 3's Feature 3.3
// per BUILD-PLAN.md and now scoped now that Phase 4's real data shapes are
// known. See SOURCE-BRIEF.md section 45's own example: "Who do I know at
// UNSW connected to gifted education?"
//
// `planRelationalQuery` translates a free-text question into that SAME
// filter shape — nothing more. It never attempts open-ended graph
// traversal or multi-step reasoning beyond what Layer 1's three filters
// already express: if a question genuinely needs something Layer 1
// can't express (a multi-hop query, ranking, "who should I introduce to
// whom"), the model is instructed to say so honestly (`unsupported: true`
// + a short reason) rather than forcing a bad-fit filter.
//
// Follows the ONLY existing precedent for a direct Anthropic call in this
// codebase, `_shared/person-brief-generation.mjs` (model `claude-sonnet-5`,
// `deps.complete`/`deps.fetchImpl` injection for testability, JSON-
// structured output parsed and validated server-side, a real system
// prompt with explicit "don't invent facts" discipline) — NOT
// `knowledge-clementine-coach.mjs`'s older pattern.
//
// Closed-vocabulary enforcement for `role`: the system prompt is given the
// REAL, current `allowed_roles` enum (via `getRelationshipDeclaration`,
// never hardcoded) and told never to invent a value outside it — but the
// model's word is never trusted blindly either: any `role` the model
// returns that isn't actually in that enum is silently DROPPED here
// (never passed through to `runRelationalSearch`, which would itself
// reject it with `invalid_role` — dropping it server-side turns a
// would-be 400 into a still-useful query over the caller's other filters).
//
// Organisation resolution: the model cannot know a real `organisation_ref`
// (an opaque id it was never shown), so it is asked for a plain
// organisation NAME instead. That name is then resolved to a ref by
// reusing `entity-search.mjs`'s own `searchIdentityKind` — the exact same
// indexed-candidate-then-authoritative-re-validation search the "Search by
// name" picker already runs — rather than inventing a second, parallel
// name-resolution path. If the name doesn't resolve to a real,
// currently-visible organisation, that is a clean "no match" (the
// organisation filter is simply left unset), not a fabricated ref — this
// is where invention of an organisation gets caught, symmetric to the
// closed-vocabulary check for `role`.

const MODEL_ID = 'claude-sonnet-5';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function planningFailure(detail) {
  return Object.assign(new Error(`Relational search query planning failed: ${detail}`), {
    status: 502,
    code: 'relational_search_nl_plan_failed',
    retryable: true
  });
}

function buildPlanningPrompt(question, allowedRoles) {
  const system = `You are translating a person's free-text question about their own professional network into a STRUCTURED search filter for a private relational search tool. You do not answer the question yourself — you only produce the filter.

The tool supports exactly three optional filters, ANDed together:
- "organisation_name": a plain organisation name mentioned or implied by the question (e.g. "UNSW"), or null if none. You will never be given real organisation ids — a plain name is resolved to one separately, after you respond.
- "role": a professional-relationship role. You MUST choose EXACTLY one value from this closed list, or null: ${JSON.stringify(allowedRoles)}. NEVER invent, guess, or return a role value that is not in this exact list — if the question implies a role concept that isn't in the list, leave "role" null and instead put the concept in "text".
- "text": a short free-text phrase (a topic, keyword, or label) drawn from the question, matched against relationship labels and free-text notes about a person — or null if none.

Rules you must follow exactly:
1. Never fabricate or invent an organisation or role that was not actually mentioned or implied by the question.
2. If the question genuinely cannot be reasonably expressed with these three filters — for example, it needs multi-hop reasoning across the network ("who should introduce me to X"), ranking, or scoring — set "unsupported" to true and "unsupported_reason" to a short, honest, one-sentence explanation. Do not force a bad-fit filter just to produce something.
3. Otherwise set "unsupported" to false and "unsupported_reason" to null.
4. Respond with ONLY a single JSON object, no other text, no commentary, no markdown code fences, in exactly this shape:
   { "organisation_name": "..."|null, "role": "..."|null, "text": "..."|null, "unsupported": true|false, "unsupported_reason": "..."|null }`;
  const userMessage = `Question: ${question}`;
  return { system, userMessage };
}

async function completeWithAnthropic(system, messages, apiKey, fetchImpl) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 500,
      system,
      messages
    })
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = await response.json();
  return payload.content?.find((block) => block.type === 'text')?.text ?? '';
}

// Same defensive stray-```json-fence stripping as person-brief-generation.mjs.
function extractJsonText(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolves a free-text organisation name to `{ ref, display_label }` (or
 * `null` on no match), by reusing `entity-search.mjs`'s own
 * `searchIdentityKind` against the organisation index — the SAME
 * candidate selection + authoritative re-validation the "Search by name"
 * picker already runs. On multiple matches, prefers an exact-prefix match
 * (rank 0) over a token match (rank 1), then alphabetically — the same
 * tie-break `entity-search.mjs`'s own route applies across its combined
 * results.
 */
export async function resolveOrganisationByName(store, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return null;
  const results = await searchIdentityKind(
    store,
    'organisation',
    listOrganisationIndexKeys,
    organisationKey,
    parseOrganisationRecord,
    trimmed,
    false
  );
  if (!results.length) return null;
  const [best] = [...results].sort((a, b) => a.rank - b.rank || a.display_label.localeCompare(b.display_label));
  return { ref: best.ref, display_label: best.display_label };
}

/**
 * `planRelationalQuery({ question, apiKey, fetchImpl, complete, store })` —
 * calls the model (or, in tests, `deps.complete`) to translate `question`
 * into `{ organisation_ref, organisation_name, organisation_matched, role,
 * text, unsupported, unsupported_reason }`. Throws a `{status: 400}` error
 * for a missing/empty question, or a `{status: 502, code:
 * 'relational_search_nl_plan_failed', retryable: true}` error when the
 * completion call fails or its output isn't the expected JSON shape —
 * never returns garbage to the caller.
 */
export async function planRelationalQuery({
  question,
  apiKey,
  fetchImpl,
  complete,
  store,
  getRelationshipDeclaration: getDeclaration,
  resolveOrganisationByName: resolveOrg
}) {
  const trimmedQuestion = typeof question === 'string' ? question.trim() : '';
  if (!trimmedQuestion) {
    throw validationError('missing_question', 'question is required.');
  }

  const declaration = (getDeclaration ?? getRelationshipDeclaration)('professional_relationship');
  const allowedRoles = declaration?.allowed_roles ?? [];

  const { system, userMessage } = buildPlanningPrompt(trimmedQuestion, allowedRoles);
  const doComplete = complete ?? ((sys, messages) => completeWithAnthropic(sys, messages, apiKey, fetchImpl ?? fetch));

  let raw;
  try {
    raw = await doComplete(system, [{ role: 'user', content: userMessage }]);
  } catch (error) {
    throw planningFailure(error instanceof Error ? error.message : String(error));
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJsonText(raw));
  } catch {
    throw planningFailure('model response was not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw planningFailure('model response was not a JSON object');
  }

  const organisationName = normalizeOptionalString(parsed.organisation_name);
  let role = normalizeOptionalString(parsed.role);
  const text = normalizeOptionalString(parsed.text);
  const unsupported = parsed.unsupported === true;
  const unsupportedReason = normalizeOptionalString(parsed.unsupported_reason);

  // Closed-vocabulary enforcement: a hallucinated role is DROPPED, not
  // passed through — see module doc above.
  if (role && !allowedRoles.includes(role)) {
    role = '';
  }

  let organisationRef = '';
  let resolvedOrganisationName = '';
  if (organisationName) {
    const resolve = resolveOrg ?? ((s, name) => resolveOrganisationByName(s, name));
    const match = await resolve(store, organisationName);
    if (match) {
      organisationRef = match.ref;
      resolvedOrganisationName = match.display_label;
    }
  }

  return {
    organisation_ref: organisationRef,
    organisation_name: organisationName ? resolvedOrganisationName || organisationName : '',
    organisation_matched: Boolean(organisationRef),
    role,
    text,
    unsupported,
    unsupported_reason: unsupported ? unsupportedReason : ''
  };
}

export { MODEL_ID };

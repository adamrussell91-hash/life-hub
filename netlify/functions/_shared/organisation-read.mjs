import { parseEntityRef } from './entity-ref.mjs';
import { isValidOrganisationId } from './identity-schema.mjs';
import {
  ORGANISATION_READ_SCHEMA_VERSION,
  emptyOrganisationRead,
  mergeOrganisationReadPreservingAdam,
  parseOrganisationRead,
  projectOrganisationRead,
  validateOrganisationRef,
  wordCount
} from './organisation-read-schema.mjs';
import {
  defaultGetProfessionalStore,
  getJSON,
  setJSON
} from './professional-blobs.mjs';

// Ann's organisation read: context assembly, store, and run_now.
// Never overwrites author:adam threads (BUILD-PLAN Phase 5).

export const ORGANISATION_READ_PREFIX = 'organisation-reads/records/';

export const ANN_ORGANISATION_READ_INSTRUCTIONS = `You are Ann O'Tation writing a private Organisation Read for Adam.

You receive six context blocks. Use each as follows:
1. STRUCTURE — the derived reporting graph (units, positions, edges). Describe how the organisation is run; do not invent units or heads that are absent.
2. MEMBERSHIPS — Adam's memberships in this organisation (unit + role). "Your lines" must reflect these memberships only.
3. WARMTH_BY_UNIT — warmth bands of people known in each unit. Use for culture and drift signals, not as proven hierarchy.
4. OBSERVATIONS — Adam's notes about the organisation. Treat as Adam's words, not Ann's inventions.
5. MEETINGS — meetings whose attendees include people at this organisation. Required source material for any "real power" claim.
6. OPEN_OPPORTUNITIES — open opportunities tied to this organisation.

Interpretation rules:
- "real_power" needs a meeting or note source. Never claim where real power sits without citing a meeting or observation source.
- Digests and inferences are not authoritative user truth. Prefer explicit memberships and sourced meetings.
- If a thread is listed under ADAM_PROTECTED, Adam edited it; keep it and do not contradict it.
- Summary must be at most 90 words.
- Each thread is one or two sentences with a source label when a source exists.
- Respond with JSON only: { "summary": "...", "threads": [{ "key": "real_power"|"your_lines"|"gaps"|"culture"|"drifting", "text": "...", "sources": [{ "ref"|"url", "excerpt" }] }] }.`;

export function organisationReadKey(organisationId) {
  if (!isValidOrganisationId(organisationId)) {
    throw Object.assign(new Error('Invalid organisation id.'), {
      status: 400,
      code: 'invalid_organisation_id'
    });
  }
  return `${ORGANISATION_READ_PREFIX}${organisationId}`;
}

/**
 * Pure context builder. Callers supply the six inputs (Availability).
 * Returns a structured context plus Delivery-ready request string pieces.
 */
export function assembleOrganisationReadContext({
  organisationRef,
  structure = null,
  memberships = [],
  warmthByUnit = {},
  observations = [],
  meetings = [],
  openOpportunities = [],
  adamProtectedKeys = []
} = {}) {
  const ref = validateOrganisationRef(organisationRef);
  const context = {
    organisation_ref: ref,
    structure: structure ?? { nodes: [], edges: [], member_count: 0 },
    memberships: Array.isArray(memberships) ? memberships : [],
    warmth_by_unit: warmthByUnit && typeof warmthByUnit === 'object' ? warmthByUnit : {},
    observations: Array.isArray(observations) ? observations : [],
    meetings: Array.isArray(meetings) ? meetings : [],
    open_opportunities: Array.isArray(openOpportunities) ? openOpportunities : [],
    adam_protected_keys: Array.isArray(adamProtectedKeys) ? adamProtectedKeys : []
  };
  return context;
}

/** Six named inputs present (Availability check helper). */
export function listContextInputKeys(context) {
  return [
    'structure',
    'memberships',
    'warmth_by_unit',
    'observations',
    'meetings',
    'open_opportunities'
  ].filter((key) => context && Object.prototype.hasOwnProperty.call(context, key));
}

/**
 * Final request string sent on Ann's path (Delivery boundary).
 * Includes STRUCTURE block and membership lines.
 */
export function buildOrganisationReadRequestString(context) {
  const instructions = ANN_ORGANISATION_READ_INSTRUCTIONS;
  const structureBlock = [
    '## STRUCTURE',
    JSON.stringify(context.structure ?? {}, null, 2)
  ].join('\n');
  const membershipsBlock = [
    '## MEMBERSHIPS',
    ...(context.memberships ?? []).map((m, i) => {
      const unit = m.unit_name || m.unit_ref || 'unit';
      const role = m.role || 'member';
      return `${i + 1}. ${role} in ${unit}` + (m.person_ref ? ` (${m.person_ref})` : '');
    })
  ].join('\n');
  const warmthBlock = ['## WARMTH_BY_UNIT', JSON.stringify(context.warmth_by_unit ?? {}, null, 2)].join(
    '\n'
  );
  const observationsBlock = [
    '## OBSERVATIONS',
    JSON.stringify(context.observations ?? [], null, 2)
  ].join('\n');
  const meetingsBlock = ['## MEETINGS', JSON.stringify(context.meetings ?? [], null, 2)].join('\n');
  const opportunitiesBlock = [
    '## OPEN_OPPORTUNITIES',
    JSON.stringify(context.open_opportunities ?? [], null, 2)
  ].join('\n');
  const protectedBlock = [
    '## ADAM_PROTECTED',
    JSON.stringify(context.adam_protected_keys ?? [])
  ].join('\n');

  const userMessage = [
    `Organisation: ${context.organisation_ref}`,
    '',
    structureBlock,
    '',
    membershipsBlock,
    '',
    warmthBlock,
    '',
    observationsBlock,
    '',
    meetingsBlock,
    '',
    opportunitiesBlock,
    '',
    protectedBlock
  ].join('\n');

  return {
    instructions,
    userMessage,
    /** Concatenated final request string for Delivery assertions. */
    finalRequest: `${instructions}\n\n${userMessage}`
  };
}

/**
 * Deterministic real_power derivation for fixtures / offline runs.
 * Requires a meeting (or observation) source — never invents without one.
 */
export function deriveRealPowerThread(context) {
  for (const meeting of context.meetings ?? []) {
    const decisionMaker =
      typeof meeting.decision_maker === 'string' ? meeting.decision_maker.trim() : '';
    const role =
      typeof meeting.decision_maker_role === 'string'
        ? meeting.decision_maker_role.trim().toLowerCase()
        : '';
    if (!decisionMaker) continue;
    if (role === 'principal' || role === 'rector') continue;
    const topic = typeof meeting.topic === 'string' && meeting.topic.trim() ? meeting.topic.trim() : 'key matters';
    const ref = meeting.ref || meeting.id || null;
    return {
      key: 'real_power',
      text: `Real power on ${topic} sits with ${decisionMaker}, not the principal.`,
      sources: [{ ref, url: null, excerpt: meeting.excerpt ?? null }],
      author: 'ann'
    };
  }
  for (const obs of context.observations ?? []) {
    const decisionMaker =
      typeof obs.decision_maker === 'string' ? obs.decision_maker.trim() : '';
    if (!decisionMaker) continue;
    return {
      key: 'real_power',
      text: `Notes suggest real power involves ${decisionMaker}.`,
      sources: [{ ref: obs.ref || null, url: null, excerpt: obs.excerpt || obs.text || null }],
      author: 'ann'
    };
  }
  return null;
}

export function deriveThreadsFromContext(context) {
  const threads = [];
  const realPower = deriveRealPowerThread(context);
  if (realPower) threads.push(realPower);

  if ((context.memberships ?? []).length) {
    const lines = context.memberships
      .map((m) => m.role || m.unit_name || m.unit_ref)
      .filter(Boolean)
      .join('; ');
    threads.push({
      key: 'your_lines',
      text: `Your lines run through ${lines}.`,
      sources: context.memberships
        .map((m) => ({ ref: m.link_id || m.unit_ref || null, url: null, excerpt: null }))
        .filter((s) => s.ref),
      author: 'ann'
    });
  }

  if ((context.open_opportunities ?? []).length) {
    threads.push({
      key: 'gaps',
      text: `There are ${context.open_opportunities.length} open opportunities worth watching.`,
      sources: context.open_opportunities.map((o) => ({
        ref: o.id ? `professional:opportunity:${o.id}` : null,
        url: o.url ?? null,
        excerpt: o.title ?? null
      })),
      author: 'ann'
    });
  }

  return threads;
}

export function buildSummaryFromContext(context) {
  const name = parseEntityRef(context.organisation_ref)?.id || 'this organisation';
  const memberCount = context.structure?.member_count ?? context.memberships?.length ?? 0;
  const membershipLabels = (context.memberships ?? [])
    .map((m) => m.unit_name || m.role)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  let summary = `Read of ${name}: ${memberCount} people known`;
  if (membershipLabels) summary += `; your memberships include ${membershipLabels}`;
  summary += '.';
  // Keep under 90 words.
  const words = summary.split(/\s+/);
  if (words.length > 90) summary = words.slice(0, 90).join(' ');
  return summary;
}

export function createOrganisationReadStore(deps = {}) {
  const store = deps.store;
  if (!store) {
    throw new Error('createOrganisationReadStore requires a professional store.');
  }
  const now = deps.now ?? (() => new Date().toISOString());

  async function loadRead(organisationRefOrId) {
    let organisationId = organisationRefOrId;
    const parsed = parseEntityRef(organisationRefOrId);
    if (parsed?.kind === 'organisation') organisationId = parsed.id;
    if (!isValidOrganisationId(organisationId)) {
      throw Object.assign(new Error('Invalid organisation id.'), {
        status: 400,
        code: 'invalid_organisation_id'
      });
    }
    const raw = await getJSON(store, organisationReadKey(organisationId));
    const record = parseOrganisationRead(raw);
    if (!record) {
      return projectOrganisationRead(
        emptyOrganisationRead(
          parsed
            ? organisationRefOrId
            : `shared:organisation:${organisationId}`
        )
      );
    }
    return projectOrganisationRead(record);
  }

  async function saveRead(record) {
    const parsed = parseOrganisationRead({
      schema_version: ORGANISATION_READ_SCHEMA_VERSION,
      organisation_ref: record.organisation_ref,
      summary: record.summary,
      threads: record.threads,
      generated_at: record.generated_at,
      updated_at: record.updated_at ?? record.generated_at,
      status: record.status ?? 'ready',
      error: record.error ?? null
    });
    if (!parsed) {
      throw Object.assign(new Error('Invalid OrganisationRead payload.'), {
        status: 400,
        code: 'invalid_organisation_read'
      });
    }
    const orgId = parseEntityRef(parsed.organisation_ref).id;
    await setJSON(store, organisationReadKey(orgId), parsed);
    return projectOrganisationRead(parsed);
  }

  /**
   * Run Ann's read now. Uses injected `complete` when provided; otherwise
   * deterministic deriveThreadsFromContext (fixture / offline path).
   */
  async function runNow({
    organisationRef,
    contextInputs,
    complete = null
  }) {
    const ref = validateOrganisationRef(organisationRef);
    const existing = await loadRead(ref);
    const adamProtectedKeys = (existing.threads ?? [])
      .filter((t) => t.author === 'adam')
      .map((t) => t.key);

    const context = assembleOrganisationReadContext({
      organisationRef: ref,
      ...contextInputs,
      adamProtectedKeys
    });
    const request = buildOrganisationReadRequestString(context);

    let generated;
    const timestamp = now();
    try {
      if (typeof complete === 'function') {
        const raw = await complete({
          instructions: request.instructions,
          userMessage: request.userMessage,
          finalRequest: request.finalRequest,
          context
        });
        const summary =
          typeof raw?.summary === 'string' && wordCount(raw.summary) <= 90
            ? raw.summary
            : buildSummaryFromContext(context);
        generated = {
          schema_version: ORGANISATION_READ_SCHEMA_VERSION,
          organisation_ref: ref,
          summary,
          threads: Array.isArray(raw?.threads) ? raw.threads : deriveThreadsFromContext(context),
          generated_at: timestamp,
          updated_at: timestamp,
          status: 'ready',
          error: null
        };
      } else {
        generated = {
          schema_version: ORGANISATION_READ_SCHEMA_VERSION,
          organisation_ref: ref,
          summary: buildSummaryFromContext(context),
          threads: deriveThreadsFromContext(context),
          generated_at: timestamp,
          updated_at: timestamp,
          status: 'ready',
          error: null
        };
      }
    } catch (error) {
      const failed = {
        schema_version: ORGANISATION_READ_SCHEMA_VERSION,
        organisation_ref: ref,
        summary: existing.summary || '',
        threads: existing.threads || [],
        generated_at: existing.generated_at || timestamp,
        updated_at: timestamp,
        status: 'error',
        error: error?.message || 'Organisation read failed.'
      };
      await saveRead(failed);
      throw Object.assign(new Error(failed.error), {
        status: 502,
        code: 'organisation_read_failed',
        retryable: true,
        read: projectOrganisationRead(failed)
      });
    }

    const merged = mergeOrganisationReadPreservingAdam(
      {
        threads: existing.threads,
        organisation_ref: ref
      },
      generated
    );
    const saved = await saveRead(merged);
    return {
      read: saved,
      context,
      request,
      created: !existing.generated_at
    };
  }

  return { loadRead, saveRead, runNow };
}

export async function defaultCreateOrganisationReadStore(deps = {}) {
  const store = deps.store ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)());
  return createOrganisationReadStore({ ...deps, store });
}

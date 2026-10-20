import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { listBlobKeys, mapBounded } from './_shared/blobs-list.mjs';
import { formatEntityRef, parseEntityRef } from './_shared/entity-ref.mjs';
import { assembleEntityOverview } from './_shared/entity-overview.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { listGithubOrganisationCandidates } from './_shared/github-professional-data.mjs';
import { displayLabelFor, parseOrganisationRecord } from './_shared/identity-schema.mjs';
import { defaultGetUniversalLinkStore, getJSON, ORGANISATION_PREFIX } from './_shared/universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';
import {
  buildReviewRows,
  completeLinkedInParse,
  LINKEDIN_TEXT_CAP,
  normaliseParsedProfile
} from './_shared/linkedin-profile.mjs';

export const config = { path: '/api/people/linkedin-parse' };

const ROLE_TYPES = new Set(['employee_at', 'member_of', 'studied_at']);

/** Every active Organisation (Blobs first, then the GitHub import) with its aliases. */
async function defaultLoadOrganisations({ store, env, fetchImpl }) {
  const keys = await listBlobKeys(store, ORGANISATION_PREFIX);
  const native = (await mapBounded(keys, 16, async (key) => parseOrganisationRecord(await getJSON(store, key)))).filter(Boolean);
  const seen = new Set(native.map((r) => r.id));
  const imported = await listGithubOrganisationCandidates({ env, fetchImpl }).catch(() => []);
  return [...native, ...imported.filter((r) => !seen.has(r.id))]
    .filter((r) => r.lifecycle_status === 'active')
    .map((r) => ({
      ref: formatEntityRef({ namespace: 'shared', kind: 'organisation', id: r.id }),
      display_label: displayLabelFor(r),
      aliases: Array.isArray(r.aliases) ? r.aliases : []
    }));
}

/** The person's roles and education, as the profile shows them. */
async function defaultLoadExistingRoles(personRef, { store, env, resolveEntity, createRepository }) {
  const overview = await assembleEntityOverview(personRef, { store, env, resolveEntity, createRepository });
  return [...(overview.current_relationships ?? []), ...(overview.historical_relationships ?? [])]
    .filter((e) => ROLE_TYPES.has(e.link.relationship_type) && e.endpoint?.kind === 'organisation')
    .map((e) => ({
      linkId: e.link.id,
      type: e.link.relationship_type,
      orgRef: e.endpoint.ref,
      orgName: e.endpoint.display_label,
      title: e.link.role ?? null,
      from: e.link.valid_from ?? null,
      to: e.link.valid_to ?? null
    }));
}

/**
 * Read a pasted LinkedIn profile into review rows. Body: `{ text, person_ref? }`.
 * Nothing is saved here, and the pasted text is never stored or logged.
 */
export function createPeopleLinkedInParseHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const text = typeof parsed.value.text === 'string' ? parsed.value.text.trim() : '';
      if (!text) {
        return withCors(errorResponse(400, 'missing_text', 'Paste the profile text first.', false), request, env);
      }
      if (text.length > LINKEDIN_TEXT_CAP) {
        return withCors(
          errorResponse(413, 'paste_too_long', 'That’s longer than a profile. Paste just the profile page.', false),
          request,
          env
        );
      }
      const personRefInput = parsed.value.person_ref ?? null;
      if (personRefInput !== null && parseEntityRef(String(personRefInput))?.kind !== 'person') {
        return withCors(errorResponse(400, 'invalid_person_ref', 'person_ref must be a person.', false), request, env);
      }
      if (!env.ANTHROPIC_API_KEY && !deps.complete) {
        return withCors(errorResponse(503, 'linkedin_parse_unconfigured', 'Paste reading is not set up.', false), request, env);
      }

      let profile;
      try {
        const complete = deps.complete ?? ((args) => completeLinkedInParse({ ...args, fetchImpl: deps.fetchImpl ?? fetch }));
        profile = normaliseParsedProfile(await complete({ env, text }));
      } catch (error) {
        // Never echo or log the paste; the message stays generic.
        console.warn('LinkedIn paste could not be read', error?.code ?? 'error');
        return withCors(
          errorResponse(502, 'linkedin_parse_failed', 'Couldn’t read that paste. Try again or type it in.', true),
          request,
          env
        );
      }

      try {
        const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
        const createRepository = deps.createRepository ?? createUniversalLinkRepository;
        const [organisations, existing] = await Promise.all([
          (deps.loadOrganisations ?? defaultLoadOrganisations)({ store, env, fetchImpl: deps.fetchImpl }),
          personRefInput
            ? (deps.loadExistingRoles ?? defaultLoadExistingRoles)(personRefInput, { store, env, resolveEntity, createRepository })
            : null
        ]);
        const rows = buildReviewRows(profile, { organisations, existing });
        return withCors(
          okResponse(200, { name: profile.name, headline: profile.headline, about: profile.about, rows }),
          request,
          env
        );
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(errorResponse(status, code, message, status === 503), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
    }
  );
}

export default createPeopleLinkedInParseHandler();

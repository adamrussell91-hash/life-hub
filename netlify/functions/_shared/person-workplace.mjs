/**
 * A person's workplace and job title — one source of truth.
 *
 * The job title ("Head of Department Learning Enrichment") is the `role` on
 * the person's current `employee_at` / `member_of` link to an organisation.
 * The profile form, the inline "Job title" editor and the org chart all
 * write it through `setPersonWorkplace`, and the org chart is kept in step
 * (org-structure.mjs `syncHolderFromProfile`).
 *
 * Imported (GitHub professional-data) links are read-only and in memory.
 * A native link for the same person + organisation supersedes the imported
 * one everywhere (`withoutSupersededImports`) — that is how an imported
 * title becomes editable without mutating the import.
 */
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { getGithubPerson, listGithubRelationshipEntries } from './github-professional-data.mjs';
import { createIdentityRepository } from './identity-repository.mjs';
import { parsePersonRecord } from './identity-schema.mjs';
import { getJSON, personKey } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';

export const WORKPLACE_TYPES = new Set(['employee_at', 'member_of']);

function isImported(link) {
  return Boolean(link?.import_source);
}

function pairKey(link) {
  return `${link.source_ref}→${link.target_ref}`;
}

/**
 * Drop imported workplace links whose person + organisation pair also has a
 * native workplace link (current or ended). Works on any list of
 * `{ link, ... }` entries; everything else passes through untouched.
 */
export function withoutSupersededImports(entries) {
  const nativePairs = new Set();
  for (const entry of entries ?? []) {
    const link = entry?.link;
    if (link && WORKPLACE_TYPES.has(link.relationship_type) && !isImported(link)) {
      nativePairs.add(pairKey(link));
    }
  }
  if (!nativePairs.size) return entries ?? [];
  return (entries ?? []).filter((entry) => {
    const link = entry?.link;
    if (!link || !isImported(link) || !WORKPLACE_TYPES.has(link.relationship_type)) return true;
    return !nativePairs.has(pairKey(link));
  });
}

function cleanTitle(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 160) : null;
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

/**
 * Current workplace links for one person, native + imported, with the
 * supersede rule applied. Each entry: `{ link, organisation_ref, imported }`.
 */
export async function listPersonWorkplaces(personRef, deps) {
  const { repo, accessContext, github } = deps;
  const person = parseEntityRef(personRef);
  const native = (await repo.listOutgoing(personRef, accessContext)).map((e) => ({ link: e.link }));
  const imported = (await listGithubRelationshipEntries('person', person.id, github))
    .filter((e) => e.direction === 'outgoing')
    .map((e) => ({ link: e.link }));
  return withoutSupersededImports([...native, ...imported])
    .filter((e) => WORKPLACE_TYPES.has(e.link.relationship_type))
    .map((e) => ({ link: e.link, organisation_ref: e.link.target_ref, imported: isImported(e.link) }));
}

/**
 * Current people at an organisation (native + imported, supersede applied):
 * `[{ person_ref, display_name, job_title, link_id, relationship_type }]`.
 */
export async function listOrganisationWorkplaces(organisationRef, deps) {
  const { repo, accessContext, github, resolveEntity } = deps;
  const org = parseEntityRef(organisationRef);
  const native = (await repo.listIncoming(organisationRef, accessContext)).map((e) => ({
    link: e.link,
    endpoint: e.endpoint
  }));
  const imported = (await listGithubRelationshipEntries('organisation', org.id, github))
    .filter((e) => e.direction === 'incoming')
    .map((e) => ({ link: e.link, otherRef: e.otherRef }));
  const merged = withoutSupersededImports([...native, ...imported]).filter(
    (e) => WORKPLACE_TYPES.has(e.link.relationship_type) && e.link.status === 'current'
  );
  const out = [];
  const seen = new Set();
  for (const entry of merged) {
    const personRef = entry.link.source_ref;
    if (seen.has(personRef)) continue;
    let name = entry.endpoint?.display_label ?? null;
    if (!name) {
      try {
        name = (await resolveEntity(personRef, accessContext, github))?.display_label ?? null;
      } catch {
        continue; // hidden or missing person — never listed
      }
    }
    seen.add(personRef);
    out.push({
      person_ref: personRef,
      display_name: name,
      job_title: cleanTitle(entry.link.role),
      link_id: entry.link.id,
      relationship_type: entry.link.relationship_type
    });
  }
  return out;
}

export function createPersonWorkplaceService(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createPersonWorkplaceService requires a store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const github = { env: deps.env, fetchImpl: deps.fetchImpl };
  const resolveEntity = deps.resolveEntity
    ? deps.resolveEntity
    : (ref, ctx, options = {}) => defaultResolveEntity(ref, ctx, { ...github, ...options });
  const repo = (deps.createRepository ?? createUniversalLinkRepository)({ store, resolveEntity, now });
  const accessContext = createAccessContext({ workflow: 'life' });
  const ctx = { repo, accessContext, github, resolveEntity };

  // People imported from Notion live only in GitHub until first edited.
  // Adopt them (same id) before writing, exactly like a profile edit does,
  // so every People surface reads their native links from then on.
  async function adoptIfImported(personId) {
    if (parsePersonRecord(await getJSON(store, personKey(personId)))) return;
    const imported = await getGithubPerson(personId, github);
    if (!imported) return;
    const identity = (deps.createIdentityRepository ?? createIdentityRepository)({ store, now });
    try {
      await identity.adoptImportedIdentity({ kind: 'person', record: imported });
    } catch (error) {
      // A concurrent adopt already wrote the record — that's the goal.
      if (!parsePersonRecord(await getJSON(store, personKey(personId)))) throw error;
    }
  }

  /** End a workplace link. An imported one is ended by a native copy that supersedes it. */
  async function endWorkplace(entry, at) {
    if (!entry.imported) return repo.endLink(entry.link.id, at, accessContext);
    const { link } = await repo.createLink(
      {
        source_ref: entry.link.source_ref,
        target_ref: entry.link.target_ref,
        relationship_type: entry.link.relationship_type,
        role: entry.link.role ?? null,
        valid_from: entry.link.valid_from ?? null
      },
      accessContext
    );
    return link.status === 'current' ? repo.endLink(link.id, at, accessContext) : link;
  }

  /**
   * Set a person's job title at an organisation.
   *
   * - `organisation_ref` null → only ends `replace_organisation_ref`.
   * - `replace_organisation_ref` (moving jobs) → ends the workplace there
   *   and releases them from that organisation's chart.
   * - Otherwise other workplaces are left alone (someone can be on a
   *   board as well as employed somewhere).
   * - `relationship_type` defaults to the existing link's type, else
   *   `employee_at` — or `member_of` when they already work elsewhere.
   */
  async function setPersonWorkplace(input, options = {}) {
    const personRef = typeof input?.person_ref === 'string' ? input.person_ref : '';
    const person = parseEntityRef(personRef);
    if (!person || person.kind !== 'person') throw validationError('invalid_person_ref', 'person_ref must be a person.');
    const organisationRef = input.organisation_ref ?? null;
    if (organisationRef !== null) {
      const org = parseEntityRef(organisationRef);
      if (!org || org.kind !== 'organisation') {
        throw validationError('invalid_organisation_ref', 'organisation_ref must be an organisation.');
      }
    }
    const replaceRef = input.replace_organisation_ref ?? null;
    const title = cleanTitle(input.job_title);
    const at = now();

    await adoptIfImported(person.id);
    const current = (await listPersonWorkplaces(personRef, ctx)).filter((e) => e.link.status === 'current');

    let released = null;
    if (replaceRef && replaceRef !== organisationRef) {
      for (const entry of current.filter((e) => e.organisation_ref === replaceRef)) {
        await endWorkplace(entry, at);
      }
      released = replaceRef;
    }

    let workplace = null;
    if (organisationRef) {
      const here = current.find((e) => e.organisation_ref === organisationRef);
      if (here && !here.imported) {
        workplace = cleanTitle(here.link.role) === title
          ? here.link
          : (await repo.changeRole(here.link.id, title, at, accessContext)).created;
      } else {
        const elsewhere = current.some(
          (e) => e.organisation_ref !== organisationRef && e.organisation_ref !== replaceRef
        );
        const type =
          (WORKPLACE_TYPES.has(input.relationship_type) && input.relationship_type) ||
          here?.link.relationship_type ||
          (elsewhere ? 'member_of' : 'employee_at');
        ({ link: workplace } = await repo.createLink(
          {
            source_ref: personRef,
            target_ref: organisationRef,
            relationship_type: type,
            role: title,
            // Taking over an imported link keeps its start date.
            valid_from: here?.link.valid_from ?? at
          },
          accessContext
        ));
      }
    }

    if (options.orgStructure && options.syncChart !== false) {
      if (released) {
        await options.orgStructure.releaseHolder(parseEntityRef(released).id, personRef);
      }
      if (organisationRef && title) {
        await options.orgStructure.syncHolderFromProfile(parseEntityRef(organisationRef).id, personRef, title);
      }
    }

    return { workplace, released_organisation_ref: released };
  }

  return {
    setPersonWorkplace,
    listPersonWorkplaces: (personRef) => listPersonWorkplaces(personRef, ctx),
    listOrganisationWorkplaces: (organisationRef) => listOrganisationWorkplaces(organisationRef, ctx)
  };
}

export function personRefFor(id) {
  return formatEntityRef({ namespace: 'shared', kind: 'person', id });
}

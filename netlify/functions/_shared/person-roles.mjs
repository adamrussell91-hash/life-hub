/**
 * A person's roles and education — every one a Universal Link to an
 * Organisation: `employee_at` / `member_of` (roles) and `studied_at`
 * (education). The role or qualification is the link's `role`, and the
 * dates are `valid_from` / `valid_to`.
 *
 * Imported (GitHub professional-data) links are read-only. Editing or ending
 * one writes a native copy, which supersedes the import everywhere
 * (`withoutSupersededImports`), exactly as the workplace editor does.
 * Removing is native-only: an imported role is ended instead.
 */
import { createAccessContext } from './entity-access.mjs';
import { parseEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { getGithubPerson, listGithubRelationshipEntries } from './github-professional-data.mjs';
import { createIdentityRepository } from './identity-repository.mjs';
import { parsePersonRecord } from './identity-schema.mjs';
import { getJSON, personKey } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { WORKPLACE_TYPES, withoutSupersededImports } from './person-workplace.mjs';

export const ROLE_TYPES = new Set(['employee_at', 'member_of', 'studied_at']);

function cleanTitle(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 160) : null;
}

function error(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function isIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function optionalIso(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (!isIso(value)) throw error(400, `invalid_${field}`, `${field} must be an ISO timestamp.`);
  return value;
}

function personRefOf(input) {
  const person = parseEntityRef(typeof input?.person_ref === 'string' ? input.person_ref : '');
  if (!person || person.kind !== 'person') throw error(400, 'invalid_person_ref', 'person_ref must be a person.');
  return { ref: input.person_ref, id: person.id };
}

export function createPersonRolesService(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createPersonRolesService requires a store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const github = { env: deps.env, fetchImpl: deps.fetchImpl };
  const resolveEntity = deps.resolveEntity
    ? deps.resolveEntity
    : (ref, ctx, options = {}) => defaultResolveEntity(ref, ctx, { ...github, ...options });
  const repo = (deps.createRepository ?? createUniversalLinkRepository)({ store, resolveEntity, now });
  const accessContext = createAccessContext({ workflow: 'life' });
  const adminContext = createAccessContext({ workflow: 'administration' });
  const orgStructure = deps.orgStructure ?? null;

  async function adoptIfImported(personId) {
    if (parsePersonRecord(await getJSON(store, personKey(personId)))) return;
    const imported = await getGithubPerson(personId, github);
    if (!imported) return;
    const identity = (deps.createIdentityRepository ?? createIdentityRepository)({ store, now });
    try {
      await identity.adoptImportedIdentity({ kind: 'person', record: imported });
    } catch (err) {
      if (!parsePersonRecord(await getJSON(store, personKey(personId)))) throw err;
    }
  }

  /** Every role and education link, native + imported, supersede applied. */
  async function listRoles(personRef) {
    const person = parseEntityRef(personRef);
    const native = (await repo.listOutgoing(personRef, accessContext)).map((e) => ({ link: e.link }));
    const imported = (await listGithubRelationshipEntries('person', person.id, github))
      .filter((e) => e.direction === 'outgoing')
      .map((e) => ({ link: e.link }));
    return withoutSupersededImports([...native, ...imported])
      .filter((e) => ROLE_TYPES.has(e.link.relationship_type))
      .map((e) => ({ link: e.link, imported: Boolean(e.link.import_source) }));
  }

  async function findRole(personRef, linkId) {
    const entry = (await listRoles(personRef)).find((e) => e.link.id === linkId);
    if (!entry) throw error(404, 'role_not_found', 'That role is not on this person.');
    return entry;
  }

  // The org chart follows the profile: a current titled workplace keeps
  // their box; ending or removing one releases it. The chart is secondary,
  // so a chart failure never undoes the role write.
  async function syncChart(link, { release = false } = {}) {
    if (!orgStructure || !WORKPLACE_TYPES.has(link.relationship_type)) return true;
    const org = parseEntityRef(link.target_ref);
    try {
      if (release || link.status !== 'current') await orgStructure.releaseHolder(org.id, link.source_ref);
      else if (cleanTitle(link.role)) await orgStructure.syncHolderFromProfile(org.id, link.source_ref, cleanTitle(link.role));
      return true;
    } catch {
      return false;
    }
  }

  async function createPeriod({ personRef, organisationRef, type, title, from, to }) {
    const { link } = await repo.createLink(
      { source_ref: personRef, target_ref: organisationRef, relationship_type: type, role: title, valid_from: from },
      accessContext
    );
    if (to && link.status === 'current') return repo.endLink(link.id, to, accessContext);
    return link;
  }

  async function add(input) {
    const person = personRefOf(input);
    const org = parseEntityRef(typeof input.organisation_ref === 'string' ? input.organisation_ref : '');
    if (!org || org.kind !== 'organisation') {
      throw error(400, 'invalid_organisation_ref', 'organisation_ref must be an organisation.');
    }
    const type = input.relationship_type;
    if (!ROLE_TYPES.has(type)) throw error(400, 'invalid_relationship_type', 'relationship_type must be employee_at, member_of or studied_at.');
    const from = optionalIso(input.valid_from, 'valid_from');
    const to = optionalIso(input.valid_to, 'valid_to');
    await adoptIfImported(person.id);
    const link = await createPeriod({
      personRef: person.ref,
      organisationRef: input.organisation_ref,
      type,
      title: cleanTitle(input.role),
      from,
      to
    });
    return { link, chart_synced: await syncChart(link) };
  }

  async function edit(input) {
    const person = personRefOf(input);
    const entry = await findRole(person.ref, input.link_id);
    const old = entry.link;
    const title = input.role === undefined ? cleanTitle(old.role) : cleanTitle(input.role);
    const from = input.valid_from === undefined ? old.valid_from ?? null : optionalIso(input.valid_from, 'valid_from');
    const to = input.valid_to === undefined ? old.valid_to ?? null : optionalIso(input.valid_to, 'valid_to');
    await adoptIfImported(person.id);

    if (!entry.imported && from === (old.valid_from ?? null) && title === cleanTitle(old.role)) {
      if (to === (old.valid_to ?? null)) return { link: old, chart_synced: true };
      if (old.status === 'current' && to) {
        const link = await repo.endLink(old.id, to, accessContext);
        return { link, chart_synced: await syncChart(link) };
      }
      throw error(409, 'end_date_locked', "This role's end date can't be changed. Remove it and add it again.");
    }

    // A new start date or title is a new period: write the replacement,
    // then hide the old native record (an imported one is superseded).
    const link = await createPeriod({
      personRef: person.ref,
      organisationRef: old.target_ref,
      type: old.relationship_type,
      title,
      from,
      to
    });
    if (!entry.imported && link.id !== old.id) {
      await repo.suppressLink(old.id, 'operator_requested', adminContext);
    }
    return { link, chart_synced: await syncChart(link) };
  }

  async function end(input) {
    const person = personRefOf(input);
    const entry = await findRole(person.ref, input.link_id);
    const at = optionalIso(input.valid_to, 'valid_to') ?? now();
    if (entry.link.status !== 'current') throw error(409, 'role_not_current', 'That role has already ended.');
    await adoptIfImported(person.id);
    let link;
    if (entry.imported) {
      link = await createPeriod({
        personRef: person.ref,
        organisationRef: entry.link.target_ref,
        type: entry.link.relationship_type,
        title: cleanTitle(entry.link.role),
        from: entry.link.valid_from ?? null,
        to: at
      });
    } else {
      link = await repo.endLink(entry.link.id, at, accessContext);
    }
    return { link, chart_synced: await syncChart(link, { release: true }) };
  }

  async function remove(input) {
    const person = personRefOf(input);
    const entry = await findRole(person.ref, input.link_id);
    if (entry.imported) {
      throw error(400, 'imported_role', 'This role came from the Notion import. End it instead.');
    }
    const link = await repo.suppressLink(entry.link.id, 'operator_requested', adminContext);
    return { link, chart_synced: await syncChart(entry.link, { release: true }) };
  }

  return { listRoles, add, edit, end, remove };
}

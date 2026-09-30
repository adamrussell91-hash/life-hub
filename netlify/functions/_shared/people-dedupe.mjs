import { createAccessContext } from './entity-access.mjs';
import { mapBounded } from './blobs-list.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { parsePersonRecord } from './identity-schema.mjs';
import { cleanIdentityDisplayName, identityNameKey } from './identity-display-name.mjs';
import {
  PERSON_PREFIX,
  getJSON,
  listAuthoritativePersonKeys,
  personKey
} from './universal-link-blobs.mjs';
import {
  isImportedStudentPerson,
  listGithubImportedStudentPeople,
  listGithubPersonCandidates
} from './github-professional-data.mjs';
import {
  listLedgerItemKeysForPerson,
  listLinkProposalKeysForPerson,
  listObservationIndexKeysForAboutRef,
  listRememberFactKeysForPerson
} from './professional-blobs.mjs';

// Duplicate Person cleanup for the Blob store.
//
// The Notion import (GitHub, read-only) is the canonical record for every
// imported colleague and student. Blob Person records that carry the same
// name under a different id are copies: search used to hand them out, and
// the meeting picker and People hid them by name. This module finds them,
// moves their Universal Links onto the record they copy, and deletes them.
//
// Three kinds of finding:
//   copy      — a Blob person whose name (or an alias) matches exactly one
//               imported person. Its links move to the imported record.
//   combined  — a Blob person named for several students at once
//               ("Hector and Hugo Standen", "A, B, C"). Each link is copied
//               to every named student, then the record goes. If any name
//               has no record of its own, nothing happens and the row says
//               which name is missing.
//   twin      — Blob-only people sharing a name. The one with the most links
//               stays; the others go only if they have no links at all.
//
// A copy is never deleted when it holds history that is keyed by its own
// ref and cannot be moved by relinking (promises, remembered facts, link
// proposals, observations) or links only the Teaching workflow can see.
// Those rows come back as `kept` with the reason, for Adam to handle.

const BATCH = 10;
const MERGE_REASON = 'person_merged';

function nameKeysFor(record) {
  return [record.display_name, ...(record.aliases ?? [])]
    .map((name) => identityNameKey(name))
    .filter(Boolean);
}

/** Index imported people by name and alias. A key two people share is ambiguous and never matches. */
export function indexImportedPeople(imported) {
  const byKey = new Map();
  for (const record of imported) {
    for (const key of new Set(nameKeysFor(record))) {
      const list = byKey.get(key) ?? [];
      list.push(record);
      byKey.set(key, list);
    }
  }
  return {
    match(name) {
      const hits = byKey.get(identityNameKey(name)) ?? [];
      return hits.length === 1 ? hits[0] : null;
    },
    ambiguous(name) {
      return (byKey.get(identityNameKey(name)) ?? []).length > 1;
    }
  };
}

/**
 * "Hector and Hugo Standen" → ["Hector Standen", "Hugo Standen"];
 * "Joseph Histon, Thierry King" → both. Returns null for a single name.
 */
export function splitCombinedName(raw) {
  const text = cleanIdentityDisplayName(raw).replace(/<br\s*\/?>/gi, ',');
  const parts = text
    .split(/\s*(?:,|&|\+|\/|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts.at(-1).split(/\s+/);
  const surname = last.length > 1 ? last.slice(1).join(' ') : null;
  return parts.map((part) => (part.split(/\s+/).length === 1 && surname ? `${part} ${surname}` : part));
}

function refFor(id) {
  return formatEntityRef({ namespace: 'shared', kind: 'person', id });
}

function summary(record) {
  return { ref: refFor(record.id), id: record.id, name: record.display_name };
}

/**
 * Pure planning over already-loaded records.
 *
 * @param {{ blobPeople: object[], imported: object[], weightOf: (id: string) => { links: number, blocked: string | null } }} input
 */
export function planPeopleDedupe({ blobPeople, imported, weightOf }) {
  const importedIds = new Set(imported.map((record) => record.id));
  const index = indexImportedPeople(imported);
  const actions = [];
  const unresolved = [];
  const blobOnly = new Map();

  for (const record of blobPeople) {
    if (record.is_self || importedIds.has(record.id)) continue;
    if (!['active', 'inactive', 'archived'].includes(record.lifecycle_status)) continue;
    const weight = weightOf(record.id);

    const target = index.match(record.display_name) ?? (record.aliases ?? []).map((a) => index.match(a)).find(Boolean);
    if (target) {
      actions.push({
        kind: 'copy',
        remove: summary(record),
        into: [summary(target)],
        student: isImportedStudentPerson(target),
        links: weight.links,
        blocked: weight.blocked
      });
      continue;
    }

    const parts = splitCombinedName(record.display_name);
    if (parts) {
      const targets = parts.map((name) => ({ name, record: index.match(name) }));
      const missing = targets.filter((t) => !t.record).map((t) => t.name);
      if (missing.length) {
        unresolved.push({ kind: 'combined', remove: summary(record), names: parts, missing, links: weight.links });
      } else {
        actions.push({
          kind: 'combined',
          remove: summary(record),
          into: targets.map((t) => summary(t.record)),
          student: targets.every((t) => isImportedStudentPerson(t.record)),
          links: weight.links,
          blocked: weight.blocked
        });
      }
      continue;
    }

    const key = identityNameKey(record.display_name);
    if (!key) continue;
    const group = blobOnly.get(key) ?? [];
    group.push({ record, weight });
    blobOnly.set(key, group);
  }

  for (const group of blobOnly.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort(
      (a, b) => b.weight.links - a.weight.links || String(a.record.created_at).localeCompare(String(b.record.created_at))
    );
    const [keep, ...rest] = ordered;
    for (const { record, weight } of rest) {
      // Two people with a name and their own links may really be two people.
      const blocked = weight.links > 0 ? 'has_own_links' : weight.blocked;
      actions.push({
        kind: 'twin',
        remove: summary(record),
        into: [summary(keep.record)],
        student: false,
        links: weight.links,
        blocked
      });
    }
  }

  const byName = (a, b) => a.remove.name.localeCompare(b.remove.name, undefined, { sensitivity: 'base' });
  actions.sort(byName);
  unresolved.sort(byName);
  return {
    ready: actions.filter((a) => !a.blocked),
    kept: actions.filter((a) => a.blocked),
    unresolved
  };
}

async function loadBlobPeople(store) {
  const ids = [
    ...new Set(
      (await listAuthoritativePersonKeys(store))
        .map((key) => (key.startsWith(PERSON_PREFIX) ? key.slice(PERSON_PREFIX.length) : null))
        .filter(Boolean)
    )
  ];
  return (await mapBounded(ids, BATCH, async (id) => parsePersonRecord(await getJSON(store, personKey(id))))).filter(Boolean);
}

async function weigh({ id, linkRepo, professionalStore }) {
  const ref = refFor(id);
  // The Teaching context sees operator and teaching_protected links alike.
  const { outgoing, incoming } = await linkRepo.listForEntity(ref, createAccessContext({ workflow: 'teaching' }), {
    includeArchived: true
  });
  const links = [...outgoing, ...incoming];
  if (links.some((entry) => entry.link?.visibility === 'teaching_protected')) {
    return { links: links.length, blocked: 'has_teaching_links' };
  }
  if (professionalStore) {
    const [ledger, facts, proposals, observations] = await Promise.all([
      listLedgerItemKeysForPerson(professionalStore, ref),
      listRememberFactKeysForPerson(professionalStore, ref),
      listLinkProposalKeysForPerson(professionalStore, ref),
      listObservationIndexKeysForAboutRef(professionalStore, ref)
    ]);
    if (ledger.length) return { links: links.length, blocked: 'has_promises' };
    if (facts.length) return { links: links.length, blocked: 'has_remembered_facts' };
    if (proposals.length) return { links: links.length, blocked: 'has_link_proposals' };
    if (observations.length) return { links: links.length, blocked: 'has_observations' };
  }
  return { links: links.length, blocked: null };
}

/** Load everything and plan. Read-only. */
export async function buildPeopleDedupePlan({ store, professionalStore, linkRepo, env, fetchImpl }) {
  const github = { env, fetchImpl };
  const [blobPeople, colleagues, students] = await Promise.all([
    loadBlobPeople(store),
    listGithubPersonCandidates(github),
    listGithubImportedStudentPeople(github)
  ]);
  const imported = [...colleagues, ...students];
  // Which records are findings does not depend on their weight, so only
  // those pay for the link and history scans.
  const light = planPeopleDedupe({ blobPeople, imported, weightOf: () => ({ links: 0, blocked: null }) });
  const candidateIds = new Set(
    [...light.ready, ...light.kept, ...light.unresolved].flatMap((row) => [row.remove.id, ...(row.into ?? []).map((p) => p.id)])
  );
  const candidates = blobPeople.filter((record) => candidateIds.has(record.id));
  const weights = new Map(
    await mapBounded(candidates, BATCH, async (record) => [
      record.id,
      await weigh({ id: record.id, linkRepo, professionalStore })
    ])
  );
  return planPeopleDedupe({
    blobPeople,
    imported,
    weightOf: (id) => weights.get(id) ?? { links: 0, blocked: null }
  });
}

function movedInput(link, fromRef, toRef) {
  return {
    source_ref: link.source_ref === fromRef ? toRef : link.source_ref,
    target_ref: link.target_ref === fromRef ? toRef : link.target_ref,
    relationship_type: link.relationship_type,
    role: link.role,
    context_key: link.context_key,
    context_ref: link.context_ref,
    valid_from: link.valid_from,
    occurred_at: link.occurred_at,
    metadata: link.metadata,
    visibility: link.visibility
  };
}

async function moveLinks({ action, linkRepo }) {
  const admin = createAccessContext({ workflow: 'administration' });
  const fromRef = action.remove.ref;
  const { outgoing, incoming } = await linkRepo.listForEntity(fromRef, admin, { includeArchived: true });
  let moved = 0;
  for (const { link } of [...outgoing, ...incoming]) {
    if (!link || link.status === 'deleted') continue;
    // A suppressed link was hidden on purpose: it goes with the copy, unmoved.
    for (const target of link.status === 'suppressed' ? [] : action.into) {
      const input = movedInput(link, fromRef, target.ref);
      if (input.source_ref === input.target_ref) continue;
      const { link: created } = await linkRepo.createLink(input, admin);
      if (link.status === 'ended' && created.status === 'current' && link.valid_to) {
        await linkRepo.endLink(created.id, link.valid_to, admin);
      }
      moved += 1;
    }
    await linkRepo.deleteLink(link.id, MERGE_REASON, admin);
  }
  return moved;
}

async function deletePerson({ id, identityRepo }) {
  const ref = { kind: 'person', id };
  const record = await identityRepo.loadEntity(ref);
  const status = record?.lifecycle_status;
  if (status !== 'deidentified' && status !== 'retained') {
    await identityRepo.transitionLifecycle({ ref, toStatus: 'deidentified' });
  }
  await identityRepo.transitionLifecycle({ ref, toStatus: 'deleted' });
}

/**
 * Re-plans on the server and applies only the ready rows whose remove id the
 * caller confirmed (`confirm_ids`, from the preview they saw). Anything that
 * changed since the preview is skipped, never guessed at.
 */
export const APPLY_BATCH = 25;

export async function applyPeopleDedupe({ confirmIds, identityRepo, buildPlan = buildPeopleDedupePlan, limit = APPLY_BATCH, ...planDeps }) {
  const plan = await buildPlan(planDeps);
  const confirmed = new Set(Array.isArray(confirmIds) ? confirmIds : []);
  const todo = plan.ready.filter((action) => confirmed.has(action.remove.id));
  const done = [];
  const failed = [];
  // Bounded per call so one request stays inside the function time limit;
  // the caller sends `remaining` back until it is empty.
  for (const action of todo.slice(0, limit)) {
    try {
      const moved = await moveLinks({ action, linkRepo: planDeps.linkRepo });
      await deletePerson({ id: action.remove.id, identityRepo });
      done.push({ ...action, moved });
    } catch (error) {
      failed.push({ ...action, error: typeof error?.code === 'string' ? error.code : 'merge_failed' });
    }
  }
  return {
    done,
    failed,
    skipped: [...confirmed].filter((id) => !plan.ready.some((a) => a.remove.id === id)),
    remaining: todo.slice(limit).map((action) => action.remove.id)
  };
}

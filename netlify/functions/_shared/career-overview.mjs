import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { createApplicationRepository } from './application-repository.mjs';
import { createEventRepository } from './event-repository.mjs';
import { createCareerRepository } from './career-repository.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { parsePersonRecord } from './identity-schema.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  listPersonIndexKeys,
  personKey
} from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { defaultGetProfessionalStore, getJSON as getProfessionalJSON, CAREER_SCAN_STATE_KEY } from './professional-blobs.mjs';
import { getGithubActiveSelfPerson, listGithubRelationshipEntries } from './github-professional-data.mjs';

function sectionOk(items) {
  return { status: 'ok', items };
}

function sectionUnavailable(reason) {
  return { status: 'unavailable', reason, items: [] };
}

function applicationSummary(record) {
  return {
    ref: formatEntityRef({ namespace: 'professional', kind: 'application', id: record.id }),
    id: record.id,
    position_title: record.position_title,
    pipeline_status: record.pipeline_status,
    closing_date: record.closing_date ?? null,
    updated_at: record.updated_at
  };
}

function eventSummary(record) {
  return {
    ref: formatEntityRef({ namespace: 'professional', kind: 'event', id: record.id }),
    id: record.id,
    title: record.title,
    event_type: record.event_type,
    start: record.start,
    end: record.end,
    occurrence_state: record.occurrence_state
  };
}

function endpointSummary(endpoint) {
  return {
    ref: endpoint.ref,
    kind: endpoint.kind,
    display_label: endpoint.display_label,
    supporting_label: endpoint.supporting_label ?? null,
    href: endpoint.href ?? null,
    lifecycle_status: endpoint.lifecycle_status ?? null
  };
}

// Exported so other callers needing "the active self Person" (e.g.
// `person-brief.mjs`'s Mutual Connections section, Phase 3 Feature 3.1)
// reuse this exact lookup rather than re-deriving their own — see that
// module for why. Blob-backed identities win over the GitHub-canonical
// Professional import: a later native self Person must not be shadowed
// by the imported workspace-owner row.
export async function findActiveSelfPerson(universalStore, options = {}) {
  if (universalStore) {
    const keys = await listPersonIndexKeys(universalStore);
    for (const key of keys) {
      const id = key.slice('entities/index/person/'.length);
      const record = parsePersonRecord(await getJSON(universalStore, personKey(id)));
      if (record?.is_self === true && record.lifecycle_status === 'active') {
        return record;
      }
    }
  }
  return getGithubActiveSelfPerson(options);
}

/**
 * Assembles Career Hub overview sections. Items are lightweight summaries /
 * endpoint projections — never copies of authoritative Application, Event,
 * Person, or Organisation records.
 */
export async function assembleCareerOverview(deps = {}) {
  const professionalStore = deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)());
  const universalStore = deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)());
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createApplicationRepo = deps.createApplicationRepository ?? createApplicationRepository;
  const createEventRepo = deps.createEventRepository ?? createEventRepository;
  const createCareerRepo = deps.createCareerRepository ?? createCareerRepository;
  const createLinkRepo = deps.createUniversalLinkRepository ?? createUniversalLinkRepository;
  const now = deps.now ?? (() => new Date().toISOString());
  const github = { env: deps.env, fetchImpl: deps.fetchImpl };

  const deferred = ['publication', 'presentation'];
  const accessContext = createAccessContext({ workflow: 'life' });

  let applications;
  try {
    const appRepo = createApplicationRepo({
      store: professionalStore,
      resolveEntity,
      getUniversalLinkStore: async () => universalStore,
      createUniversalLinkRepository: createLinkRepo,
      now
    });
    const listed = await appRepo.listApplications();
    applications = sectionOk(listed.map(applicationSummary));
  } catch (error) {
    applications = sectionUnavailable(
      typeof error?.message === 'string' ? error.message : 'applications_unavailable'
    );
  }

  let employment;
  let selfRef = null;
  try {
    const self = await findActiveSelfPerson(universalStore, github);
    if (!self) {
      employment = sectionOk([]);
    } else {
      selfRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: self.id });
      const linkRepo = createLinkRepo({
        store: universalStore,
        resolveEntity,
        now
      });
      const { outgoing } = await linkRepo.listForEntity(selfRef, accessContext);
      const items = [];
      // Career river needs the full employee_at period history (BUILD-PLAN §3.3
      // Roles). Filtering to status=current left only Aloysius and collapsed
      // multi-role employers (e.g. St Pius X) to one band because seen keyed
      // on org ref. Dedupe by link id so concurrent/stacked roles survive.
      const seen = new Set();
      for (const entry of outgoing) {
        if (entry.link.relationship_type !== 'employee_at') continue;
        if (entry.link.status !== 'current' && entry.link.status !== 'ended') continue;
        const key = entry.link.id || `${entry.endpoint.ref}|${entry.link.role ?? ''}|${entry.link.valid_from ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          ...endpointSummary(entry.endpoint),
          role: entry.link.role ?? null,
          valid_from: entry.link.valid_from ?? null,
          valid_to: entry.link.valid_to ?? null,
          link_status: entry.link.status
        });
      }
      const githubRows = await listGithubRelationshipEntries('person', self.id, github);
      for (const row of githubRows) {
        if (row.link.relationship_type !== 'employee_at') continue;
        if (row.link.status !== 'current' && row.link.status !== 'ended') continue;
        const key = row.link.id || `${row.otherRef}|${row.link.role ?? ''}|${row.link.valid_from ?? ''}`;
        if (seen.has(key)) continue;
        try {
          const endpoint = await resolveEntity(row.otherRef, accessContext, github);
          seen.add(key);
          items.push({
            ...endpointSummary(endpoint),
            role: row.link.role ?? null,
            valid_from: row.link.valid_from ?? null,
            valid_to: row.link.valid_to ?? null,
            link_status: row.link.status
          });
        } catch (error) {
          if (error?.code === 'endpoint_not_found') continue;
          throw error;
        }
      }
      items.sort((a, b) => {
        const aFrom = a.valid_from || '9999-12-31';
        const bFrom = b.valid_from || '9999-12-31';
        return aFrom.localeCompare(bFrom) || String(a.role ?? '').localeCompare(String(b.role ?? ''));
      });
      employment = sectionOk(items);
    }
  } catch (error) {
    employment = sectionUnavailable(
      typeof error?.message === 'string' ? error.message : 'employment_unavailable'
    );
  }

  let professional_development;
  try {
    const eventRepo = createEventRepo({
      store: professionalStore,
      resolveEntity,
      getUniversalLinkStore: async () => universalStore,
      createUniversalLinkRepository: createLinkRepo,
      now
    });
    const events = await eventRepo.listEvents();
    professional_development = sectionOk(
      events
        .filter((event) => event.event_type === 'professional_development')
        .map(eventSummary)
    );
  } catch (error) {
    professional_development = sectionUnavailable(
      typeof error?.message === 'string' ? error.message : 'professional_development_unavailable'
    );
  }

  let people;
  let organisations;
  try {
    const linkRepo = createLinkRepo({
      store: universalStore,
      resolveEntity,
      now
    });
    const peopleSeen = new Set();
    const orgSeen = new Set();
    const peopleItems = [];
    const orgItems = [];

    const appRefs = (applications.status === 'ok' ? applications.items : []).map((item) => item.ref);
    for (const appRef of appRefs) {
      const { outgoing } = await linkRepo.listForEntity(appRef, accessContext);
      for (const entry of outgoing) {
        const type = entry.link.relationship_type;
        if (type === 'applies_to' && entry.endpoint.kind === 'organisation') {
          if (!orgSeen.has(entry.endpoint.ref)) {
            orgSeen.add(entry.endpoint.ref);
            orgItems.push(endpointSummary(entry.endpoint));
          }
        }
        if (
          (type === 'application_contact' || type === 'referee') &&
          entry.endpoint.kind === 'person'
        ) {
          if (!peopleSeen.has(entry.endpoint.ref)) {
            peopleSeen.add(entry.endpoint.ref);
            peopleItems.push(endpointSummary(entry.endpoint));
          }
        }
      }
    }

    if (selfRef) {
      const { outgoing, incoming } = await linkRepo.listForEntity(selfRef, accessContext);
      for (const entry of [...outgoing, ...incoming]) {
        if (entry.endpoint.kind === 'organisation' && !orgSeen.has(entry.endpoint.ref)) {
          orgSeen.add(entry.endpoint.ref);
          orgItems.push(endpointSummary(entry.endpoint));
        }
        if (entry.endpoint.kind === 'person' && !peopleSeen.has(entry.endpoint.ref)) {
          peopleSeen.add(entry.endpoint.ref);
          peopleItems.push(endpointSummary(entry.endpoint));
        }
      }
    }

    people = sectionOk(peopleItems);
    organisations = sectionOk(orgItems);
  } catch (error) {
    const reason = typeof error?.message === 'string' ? error.message : 'linked_entities_unavailable';
    people = sectionUnavailable(reason);
    organisations = sectionUnavailable(reason);
  }

  let achievements = [];
  let futures = [];
  let stones = [];
  let supports_future = [];
  let answers_criterion = [];
  let stone_for = [];
  let stone_actions = [];
  let scan = { pending_count: 0, last_run_at: null };
  try {
    const careerRepo = createCareerRepo({
      store: professionalStore,
      now
    });
    achievements = await careerRepo.listAchievements();
    futures = await careerRepo.listFutures();
    stones = await careerRepo.listSteppingStones();
    const scanState = (await getProfessionalJSON(professionalStore, CAREER_SCAN_STATE_KEY)) ?? {};
    scan = {
      pending_count: 0,
      last_run_at: scanState.last_run_at ?? null
    };
    try {
      const { listScanProposals } = await import('./career-scan-service.mjs');
      const pending = await listScanProposals(professionalStore, { status: 'pending' });
      scan.pending_count = pending.length;
    } catch {
      /* scan store optional */
    }

    const linkRepo = createLinkRepo({
      store: universalStore,
      resolveEntity,
      now
    });
    for (const achievement of achievements) {
      const ref = formatEntityRef({
        namespace: 'professional',
        kind: 'achievement',
        id: achievement.id
      });
      try {
        const { outgoing } = await linkRepo.listForEntity(ref, accessContext);
        for (const entry of outgoing) {
          if (entry.link.relationship_type === 'supports_future') {
            supports_future.push({
              source_id: achievement.id,
              target_id: entry.endpoint.ref?.split(':').pop(),
              future_id: entry.endpoint.ref?.split(':').pop(),
              criterion_ids: entry.link.metadata?.criterion_ids ?? [],
              strength: entry.link.metadata?.strength ?? null,
              updated_at: entry.link.updated_at ?? null,
              created_at: entry.link.created_at ?? null
            });
          }
          if (entry.link.relationship_type === 'answers_criterion') {
            answers_criterion.push({
              source_id: achievement.id,
              target_id: entry.endpoint.ref?.split(':').pop(),
              application_id: entry.endpoint.ref?.split(':').pop(),
              criterion_id: entry.link.metadata?.criterion_id ?? null,
              strength: entry.link.metadata?.strength ?? null
            });
          }
        }
      } catch {
        // Link store gaps must not blank the overview.
      }
    }
    for (const stone of stones) {
      const ref = formatEntityRef({
        namespace: 'professional',
        kind: 'stepping_stone',
        id: stone.id
      });
      try {
        const { outgoing, incoming } = await linkRepo.listForEntity(ref, accessContext);
        for (const entry of outgoing) {
          if (entry.link.relationship_type === 'stone_for') {
            stone_for.push({
              source_id: stone.id,
              stone_id: stone.id,
              target_id: entry.endpoint.ref?.split(':').pop(),
              future_id: entry.endpoint.ref?.split(':').pop()
            });
          }
        }
        for (const entry of incoming) {
          if (entry.link.relationship_type === 'stone_action') {
            stone_actions.push({
              target_id: stone.id,
              stone_id: stone.id,
              endpoint: endpointSummary(entry.endpoint)
            });
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    achievements = [];
    futures = [];
    stones = [];
  }

  const applicationRecords =
    applications.status === 'ok'
      ? // listApplications already projected — overview keeps summaries for legacy sections
        []
      : [];

  return {
    applications,
    employment,
    professional_development,
    people,
    organisations,
    deferred,
    // River / Skills / Futures / Mirror feed (buildCareerModel)
    achievements,
    futures,
    stones,
    supports_future,
    answers_criterion,
    stone_for,
    stone_actions,
    scan,
    application_records: applicationRecords,
    employment_items: employment.status === 'ok' ? employment.items : []
  };
}

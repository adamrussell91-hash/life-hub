import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { createApplicationRepository } from './application-repository.mjs';
import { createEventRepository } from './event-repository.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { parsePersonRecord } from './identity-schema.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  listPersonIndexKeys,
  personKey
} from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { defaultGetProfessionalStore } from './professional-blobs.mjs';

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
// module for why.
export async function findActiveSelfPerson(universalStore) {
  const keys = await listPersonIndexKeys(universalStore);
  for (const key of keys) {
    const id = key.slice('entities/index/person/'.length);
    const record = parsePersonRecord(await getJSON(universalStore, personKey(id)));
    if (record?.is_self === true && record.lifecycle_status === 'active') {
      return record;
    }
  }
  return null;
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
  const createLinkRepo = deps.createUniversalLinkRepository ?? createUniversalLinkRepository;
  const now = deps.now ?? (() => new Date().toISOString());

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
    const self = await findActiveSelfPerson(universalStore);
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
      const seen = new Set();
      for (const entry of outgoing) {
        if (entry.link.relationship_type !== 'employee_at') continue;
        if (entry.link.status !== 'current') continue;
        if (seen.has(entry.endpoint.ref)) continue;
        seen.add(entry.endpoint.ref);
        items.push({
          ...endpointSummary(entry.endpoint),
          role: entry.link.role ?? null,
          valid_from: entry.link.valid_from ?? null,
          valid_to: entry.link.valid_to ?? null
        });
      }
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

  return {
    applications,
    employment,
    professional_development,
    people,
    organisations,
    deferred
  };
}

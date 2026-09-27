import { okResponse, errorResponse } from './_shared/http.mjs';
import { findActiveSelfPerson } from './_shared/career-overview.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { createCommunicationRepository } from './_shared/communication-repository.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { createThreadRepository } from './_shared/thread-repository.mjs';
import { createLedgerItemRepository } from './_shared/ledger-repository.mjs';
import { createApplicationRepository } from './_shared/application-repository.mjs';
import { createLinkProposalRepository } from './_shared/link-proposal-repository.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';
import { loadAllPeopleWithRelationships } from './_shared/people-collection.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import {
  defaultGetTasksStore,
  listJSON as listTasksJSON,
  PROJECT_PREFIX,
  TASK_PREFIX
} from './_shared/tasks-blobs.mjs';
import { runTieInference } from './_shared/tie-inference/run.mjs';
import { TIE_NIGHTLY_CALL_CAP } from './_shared/tie-inference/constants.mjs';

/**
 * Nightly tie inference — new/grown pairs only, capped Claude calls.
 * Schedule off the hour (UTC ≈ Sydney afternoon).
 */
export const config = {
  schedule: '20 3 * * *'
};

export function createTiesInferTickScheduledHandler(deps = {}) {
  return async function tiesInferTickScheduledHandler() {
    const env = deps.env ?? process.env;
    try {
      const professionalStore =
        deps.professionalStore ??
        (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));
      const universalStore =
        deps.universalStore ??
        (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env));

      const peopleWithRelationships =
        deps.peopleWithRelationships ??
        (await loadAllPeopleWithRelationships({
          store: universalStore,
          env,
          fetchImpl: deps.fetchImpl ?? fetch
        }));

      const self =
        deps.selfPerson ??
        (await findActiveSelfPerson(universalStore, { env, fetchImpl: deps.fetchImpl ?? fetch }));
      const selfRef = self
        ? formatEntityRef({ namespace: 'shared', kind: 'person', id: self.id })
        : null;
      if (!selfRef) {
        return okResponse(202, {
          candidates: 0,
          classified: 0,
          proposed: 0,
          updated: 0,
          skipped: 0,
          error: 'no_self_person'
        });
      }

      const accessContext =
        deps.accessContext ?? createAccessContext({ workflow: 'professional', allowedEntityKinds: [] });
      const linkRepo =
        deps.linkRepo ??
        createUniversalLinkRepository({
          store: universalStore,
          env,
          fetchImpl: deps.fetchImpl ?? fetch
        });
      const proposalRepo =
        deps.proposalRepo ?? createLinkProposalRepository({ store: professionalStore });

      let tasks = deps.tasks;
      let projects = deps.projects;
      if (!tasks || !projects) {
        try {
          const tasksStore = await (deps.getTasksStore ?? defaultGetTasksStore)(env);
          tasks = (await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => [])).map((t) => ({
            id: t.id,
            ref: t.ref ?? (t.id ? `tasks:task:${t.id}` : null),
            title: t.title ?? t.name ?? '',
            body: t.notes ?? t.body ?? t.description ?? ''
          }));
          projects = (await listTasksJSON(tasksStore, PROJECT_PREFIX).catch(() => [])).map((p) => ({
            id: p.id,
            ref: p.ref ?? (p.id ? `tasks:project:${p.id}` : null),
            title: p.title ?? p.name ?? '',
            body: p.notes ?? p.body ?? p.description ?? '',
            kind: 'project'
          }));
        } catch {
          tasks = [];
          projects = [];
        }
      }

      const result = await runTieInference({
        ...deps,
        apply: true,
        nightly: true,
        limit: deps.limit ?? TIE_NIGHTLY_CALL_CAP,
        selfRef,
        peopleWithRelationships,
        professionalStore,
        proposalRepo,
        linkRepo,
        accessContext,
        env,
        fetchImpl: deps.fetchImpl ?? fetch,
        complete: deps.complete,
        apiKey: deps.apiKey,
        tasks,
        projects,
        communicationRepo:
          deps.communicationRepo ??
          createCommunicationRepository({
            store: professionalStore,
            env,
            getUniversalLinkStore: async () => universalStore
          }),
        meetingRepo: deps.meetingRepo ?? createMeetingRepository({ store: professionalStore, env }),
        eventRepo: deps.eventRepo ?? createEventRepository({ store: professionalStore, env }),
        threadRepo: deps.threadRepo ?? createThreadRepository({ store: professionalStore }),
        ledgerRepo: deps.ledgerRepo ?? createLedgerItemRepository({ store: professionalStore }),
        applicationRepo:
          deps.applicationRepo ?? createApplicationRepository({ store: professionalStore, env })
      });

      return okResponse(202, {
        candidates: result.candidates,
        classified: result.classified,
        proposed: result.proposed,
        updated: result.updated,
        skipped: result.skipped,
        no_tie: result.no_tie,
        errors: result.errors,
        adapters_skipped: result.adapters_skipped
      });
    } catch (error) {
      return errorResponse(
        500,
        'ties_infer_failed',
        typeof error?.message === 'string' ? error.message : 'Tie inference failed.',
        true
      );
    }
  };
}

export default createTiesInferTickScheduledHandler();

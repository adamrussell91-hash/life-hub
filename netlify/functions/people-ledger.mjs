import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createLedgerItemRepository } from './_shared/ledger-repository.mjs';
import { parseDueRangeQuery } from './_shared/ledger-schema.mjs';
import {
  assemblePersonLedger,
  extractLedgerCandidatesFromText
} from './_shared/person-ledger.mjs';
import { createObservationRepository } from './_shared/observation-repository.mjs';
import { assemblePersonBrief } from './_shared/person-brief.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import {
  defaultGetTasksStore,
  listJSON as listTasksJSON,
  TASK_PREFIX
} from './_shared/tasks-blobs.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/people/ledger' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

export function createPeopleLedgerHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { store: universalStore, env } = context;
      const professionalStore =
        deps.professionalStore ??
        (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env).catch(() => null));
      if (!professionalStore) {
        return withCors(
          errorResponse(503, 'professional_blobs_unbound', 'Professional content store is not bound.', true),
          request,
          env
        );
      }

      const url = new URL(request.url);
      const ledgerRepo =
        deps.ledgerRepo ??
        createLedgerItemRepository({
          store: professionalStore,
          now: deps.now,
          generateId: deps.generateId
        });

      try {
        if (request.method === 'GET') {
          if (url.searchParams.has('due_from')) {
            const { from, to } = parseDueRangeQuery(url.searchParams);
            const items = await ledgerRepo.listDueBetween(from, to);
            return withCors(okResponse(200, { items }), request, env);
          }
          if (url.searchParams.has('source_refs')) {
            const refs = url.searchParams.get('source_refs').split(',').map((ref) => ref.trim()).filter(Boolean);
            if (!refs.length || refs.length > 20 || refs.some((ref) => !parseEntityRef(ref))) {
              return withCors(errorResponse(400, 'invalid_source_refs', 'source_refs must be 1–20 entity refs.', false), request, env);
            }
            const items = await ledgerRepo.listForSources(refs);
            return withCors(okResponse(200, { items }), request, env);
          }
          const personRef = url.searchParams.get('person_ref');
          if (!personRef || !parseEntityRef(personRef)) {
            return withCors(
              errorResponse(400, 'missing_person_ref', 'person_ref query param required.', false),
              request,
              env
            );
          }

          const parsed = parseEntityRef(personRef);
          const personId = parsed.id;
          const brief =
            deps.brief ??
            (await assemblePersonBrief(personId, {
              store: universalStore,
              env,
              now: deps.now,
              resolveEntity: deps.resolveEntity,
              createRepository: deps.createRepository,
              fetchImpl: deps.fetchImpl
            }).catch(() => null));

          const storedItems = await ledgerRepo.listForPerson(personRef, { status: 'open' });
          const tasksStore =
            deps.tasksStore ?? (await (deps.getTasksStore ?? defaultGetTasksStore)(env).catch(() => null));
          const allTasks = tasksStore
            ? await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => [])
            : [];

          const person = {
            ref: personRef,
            display_name: brief?.header?.person?.display_name ?? personId,
            aliases: []
          };

          const ledger = assemblePersonLedger({
            person,
            linkedTasks: (brief?.open_loops ?? []).map((loop) => ({
              ref: loop.ref,
              label: loop.label,
              href: loop.href,
              status: loop.status ?? 'open'
            })),
            waitingOnTasks: allTasks.map((t) => ({
              id: t.id,
              ref: t.ref ?? (t.id ? `tasks:task:${t.id}` : null),
              title: t.title ?? '',
              waiting_on: t.waiting_on ?? null,
              status: t.status ?? 'open'
            })),
            storedItems
          });

          return withCors(okResponse(200, ledger), request, env);
        }

        if (request.method === 'POST') {
          const body = await readJsonObject(request);
          const action = body?.action ?? url.searchParams.get('action');

          if (action === 'clare_scan') {
            const personRef = body?.person_ref;
            if (!personRef || !parseEntityRef(personRef)) {
              return withCors(
                errorResponse(400, 'missing_person_ref', 'person_ref required.', false),
                request,
                env
              );
            }

            const observationRepo =
              deps.observationRepo ??
              createObservationRepository({ store: professionalStore, now: deps.now });
            const observations = await observationRepo
              .listObservationsForAboutRef(personRef)
              .catch(() => []);

            const tasksStore =
              deps.tasksStore ?? (await (deps.getTasksStore ?? defaultGetTasksStore)(env).catch(() => null));
            const allTasks = tasksStore
              ? await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => [])
              : [];

            const personName = body?.display_name ?? '';
            const relatedTasks = allTasks.filter((t) => {
              const hay = `${t.title ?? ''} ${t.notes ?? ''} ${t.body ?? ''}`.toLowerCase();
              return personName && hay.includes(String(personName).toLowerCase());
            });

            const texts = [
              ...observations.map((o) => ({
                text: o.text,
                ref: `professional:observation:${o.id}`,
                kind: 'observation'
              })),
              ...relatedTasks.map((t) => ({
                text: `${t.title ?? ''}. ${t.notes ?? t.body ?? ''}`,
                ref: t.ref ?? `tasks:task:${t.id}`,
                kind: 'task'
              }))
            ];

            const candidates = extractLedgerCandidatesFromText({
              person_ref: personRef,
              texts
            });

            const created = [];
            for (const candidate of candidates) {
              const result = await ledgerRepo.createItem(candidate);
              if (result.created) created.push(result.item);
            }

            return withCors(
              okResponse(200, {
                created,
                count: created.length,
                reading: false,
                note: created.length
                  ? `Clare found ${created.length} item${created.length === 1 ? '' : 's'}.`
                  : 'Clare found nothing new to add.'
              }),
              request,
              env
            );
          }

          if (action === 'create') {
            const result = await ledgerRepo.createItem({ ...body, author: body.author ?? 'adam' });
            return withCors(okResponse(200, result), request, env);
          }

          if (action === 'patch') {
            const id = body?.id;
            if (!id) {
              return withCors(errorResponse(400, 'missing_id', 'id required.', false), request, env);
            }
            const item = await ledgerRepo.patchItem(id, body);
            return withCors(okResponse(200, { item }), request, env);
          }

          if (action === 'to_task') {
            // Creates via Clare create-task path in a follow-up; for now mark
            // the item with a placeholder and return instructions. Full wire
            // uses clare-work create_task + contact link.
            return withCors(
              errorResponse(
                501,
                'not_implemented',
                'Ledger → task conversion ships with Clare create-task confirm path.',
                false
              ),
              request,
              env
            );
          }

          if (action === 'to_comms') {
            return withCors(
              errorResponse(
                503,
                'needs_communications',
                'Needs Communications — task → comms conversion waits for that build.',
                false
              ),
              request,
              env
            );
          }

          return withCors(
            errorResponse(400, 'invalid_action', 'Unknown ledger action.', false),
            request,
            env
          );
        }

        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
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

export default createPeopleLedgerHandler();

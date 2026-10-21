import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { loadAllPeopleWithRelationships } from './_shared/people-collection.mjs';
import { assemblePeopleDirectory } from './_shared/people-directory.mjs';

export const config = { path: '/api/people/directory' };

// The assembled directory is a full scan of every person plus their
// relationships, so repeat loads reuse it for a few seconds. Per warm function
// instance only: writes made elsewhere show up within the TTL, and a client
// that just changed something asks for `?fresh=1` to skip it.
export const DIRECTORY_CACHE_TTL_MS = 20_000;

// Every finished scan is also kept as one Blob, so a session's first open can
// paint it in a fraction of a second (`?snapshot=1`, no scan) while a real
// scan runs beside it. Derived and overwritten whole; never a source of truth.
export const DIRECTORY_SNAPSHOT_KEY = 'people-directory/snapshot.json';

async function readSnapshot(store) {
  const saved = await store.get(DIRECTORY_SNAPSHOT_KEY, { type: 'json' });
  if (!saved?.directory || typeof saved.as_of !== 'string') return null;
  return { ...saved.directory, as_of: saved.as_of };
}

async function writeSnapshot(store, directory, asOf) {
  try {
    await store.setJSON(DIRECTORY_SNAPSHOT_KEY, { as_of: asOf.toISOString(), directory });
  } catch (error) {
    // A stale snapshot is only a slower first paint; never fail the scan.
    console.warn('People directory snapshot write failed', error);
  }
}

export function createPeopleDirectoryHandler(deps = {}) {
  let cached = null; // { at, data }
  let inflight = null; // { promise }
  const ttl = deps.cacheTtlMs ?? DIRECTORY_CACHE_TTL_MS;
  const loadPeople = deps.loadAllPeopleWithRelationships ?? loadAllPeopleWithRelationships;
  const assemble = deps.assemblePeopleDirectory ?? assemblePeopleDirectory;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }
      try {
        const nowValue = now();
        const params = new URL(request.url).searchParams;
        if (params.has('snapshot')) {
          return withCors(okResponse(200, await readSnapshot(store)), request, env);
        }
        const fresh = params.has('fresh');
        let data;
        if (!fresh && cached && nowValue.getTime() - cached.at < ttl) {
          data = cached.data;
        } else {
          // Concurrent requests share one scan.
          if (fresh || !inflight) {
            const promise = (async () => {
              const peopleWithRelationships = await loadPeople({
                store,
                now: nowValue,
                resolveEntity: deps.resolveEntity,
                createRepository: deps.createRepository,
                env,
                fetchImpl: deps.fetchImpl,
                includeStudents: true
              });
              const directory = assemble(peopleWithRelationships, { now: nowValue, includeStudents: true });
              await writeSnapshot(store, directory, nowValue);
              return directory;
            })();
            inflight = promise;
            promise.then(
              (result) => {
                cached = { at: nowValue.getTime(), data: result };
                if (inflight === promise) inflight = null;
              },
              () => {
                if (inflight === promise) inflight = null;
              }
            );
          }
          data = await inflight;
        }
        return withCors(okResponse(200, data), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message =
          typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(
          errorResponse(status, code, message, Boolean(error?.retryable) || status === 503),
          request,
          env
        );
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

export default createPeopleDirectoryHandler();

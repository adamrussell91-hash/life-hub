import { methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { projectRelationshipRegistry } from './_shared/relationship-registry.mjs';

// Read-only projection of the relationship registry (implementation
// programme, "Relationship registry": "Expose a read only projection
// through GET /api/relationship-registry. Do not expose internal repair or
// storage fields."). File and route follow the existing flat, one-segment
// convention (e.g. `curriculum.mjs` -> `/api/curriculum`,
// `goals.mjs` -> `/api/goals`) rather than a nested `_shared`-style path —
// `relationship-registry.mjs` here is a top-level API handler, distinct
// from `_shared/relationship-registry.mjs`, which owns the declarations.
export const config = { path: '/api/relationship-registry' };

// This route needs the existing authenticated operator session and CORS
// behaviour, but no domain content store — `createSessionOriginHandler`
// gives exactly that (see `_shared/operator-gate.mjs`).
export function createRelationshipRegistryHandler(deps = {}) {
  return createSessionOriginHandler((request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    // `projectRelationshipRegistry()` already excludes `duplicate_fields`
    // and every other internal/storage field — see
    // `_shared/relationship-registry.mjs`.
    return withCors(okResponse(200, { relationships: projectRelationshipRegistry() }), request, env);
  }, deps);
}

export default createRelationshipRegistryHandler();

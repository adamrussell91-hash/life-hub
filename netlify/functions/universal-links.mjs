import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';

export const config = { path: '/api/universal-links' };

// Exactly one of these may be present on a GET request (implementation
// programme: "Reject ambiguous GET requests containing more than one
// selector. Reject GET requests with no selector.").
const SELECTORS = ['source_ref', 'target_ref', 'entity_ref', 'id'];

// Request-body fields that must never expand access, whether or not the
// caller intended them to. `createAccessContext` never reads request
// bodies at all (it only takes a server-literal `workflow`), so nothing
// here could actually reach access derivation — this is a defence-in-depth
// reject, matching "Ignore or reject request body fields named actor,
// workflow, allowed_visibility, or allowed_entity_kinds."
const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];

function assertNoAccessFields(value) {
  for (const key of FORBIDDEN_ACCESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw Object.assign(new Error(`Field "${key}" is not accepted in this request.`), {
        status: 400,
        code: 'access_field_not_accepted'
      });
    }
  }
}

// Maps a thrown repository/registry/schema error to a structured JSON
// response. Every error thrown anywhere in this programme's shared modules
// already carries a safe `status`/`code`/`message` — none of them ever
// interpolate a resolved endpoint's display label — so reusing `.message`
// here does not risk disclosing one. `operation_id`/`link_id` are safe
// identifiers (implementation programme: "Include only safe identifiers
// such as operation_id and link_id").
function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  const data = (error?.operation_id || error?.link_id)
    ? { operation_id: error.operation_id ?? null, link_id: error.link_id ?? null }
    : undefined;
  return errorResponse(status, code, message, retryable, {}, data);
}

function readSelector(url) {
  const present = SELECTORS.filter(name => url.searchParams.has(name));
  if (present.length === 0) {
    throw Object.assign(new Error('A selector query parameter is required.'), {
      status: 400,
      code: 'missing_selector'
    });
  }
  if (present.length > 1) {
    throw Object.assign(new Error('Only one selector query parameter is allowed.'), {
      status: 400,
      code: 'ambiguous_selector'
    });
  }
  const [selector] = present;
  return { selector, value: url.searchParams.get(selector) };
}

export function createUniversalLinksHandler(deps = {}) {
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;
  const now = deps.repositoryNow;
  const generateOperationId = deps.generateOperationId;

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const repo = createRepository({
      store,
      resolveEntity,
      ...(now ? { now } : {}),
      ...(generateOperationId ? { generateOperationId } : {})
    });
    const url = new URL(request.url);

    try {
      if (request.method === 'GET') {
        const { selector, value } = readSelector(url);
        // GET/POST/end are ordinary shared-infrastructure operations, not
        // scoped to one specific hub's own workflow (no hub-specific
        // Universal Links UI exists yet — apps/professional is Slice 4) —
        // `life` is the umbrella root workflow. Every current workflow
        // grants identical `operator`-only visibility (entity-access.mjs),
        // so this choice has no behavioural effect today; it is recorded
        // in the PR body as a deliberate default, not left implicit.
        const accessContext = createAccessContext({ workflow: 'life' });

        if (selector === 'id') {
          const link = await repo.getLink(value, accessContext);
          return withCors(okResponse(200, { link }), request, env);
        }
        if (selector === 'source_ref') {
          const links = await repo.listOutgoing(value, accessContext);
          return withCors(okResponse(200, { links }), request, env);
        }
        if (selector === 'target_ref') {
          const links = await repo.listIncoming(value, accessContext);
          return withCors(okResponse(200, { links }), request, env);
        }
        const result = await repo.listForEntity(value, accessContext);
        return withCors(okResponse(200, result), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);
        const accessContext = createAccessContext({ workflow: 'life' });
        const { link, created } = await repo.createLink(parsed.value, accessContext);
        return withCors(okResponse(created ? 201 : 200, { link, created }), request, env);
      }

      if (request.method === 'PATCH') {
        const id = url.searchParams.get('id') ?? '';
        const action = url.searchParams.get('action') ?? '';
        if (!id) {
          return withCors(errorResponse(400, 'missing_id', 'id query param required.', false), request, env);
        }
        if (action !== 'end' && action !== 'suppress') {
          return withCors(
            errorResponse(400, 'invalid_action', 'action must be "end" or "suppress".', false),
            request,
            env
          );
        }
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);

        if (action === 'end') {
          const accessContext = createAccessContext({ workflow: 'life' });
          const link = await repo.endLink(id, parsed.value.valid_to, accessContext);
          return withCors(okResponse(200, { link }), request, env);
        }

        // `suppress` requires the administration workflow — the server
        // derives this from the action itself (part of the verified
        // route), never from anything the client supplied.
        const accessContext = createAccessContext({ workflow: 'administration' });
        const link = await repo.suppressLink(id, parsed.value.reason, accessContext);
        return withCors(okResponse(200, { link }), request, env);
      }

      // DELETE is not exposed over HTTP in Slice 2 (implementation
      // programme: "Do not expose DELETE over HTTP in Slice 2 ... Return
      // the repository standard method not allowed response for HTTP
      // DELETE"). The canonical `deleteLink` method still exists on the
      // repository for controlled lifecycle testing and future
      // administration.
      return withCors(methodNotAllowed('GET, POST, PATCH, OPTIONS'), request, env);
    } catch (error) {
      return withCors(toErrorResponse(error), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
  });
}

export default createUniversalLinksHandler();

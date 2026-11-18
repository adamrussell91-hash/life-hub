// What a person said in recorded meetings, for the "Said in meetings" tab on their page.
// GET /api/people-said?person_ref=shared:person:… → { entries }, newest first.
// Entries are written by the meeting write-up (see _shared/meeting-recordings-store.mjs).

import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { listPeopleSaid } from './_shared/meeting-recordings-store.mjs';
import { isPersonRef } from './_shared/meeting-writeup.mjs';

export const config = { path: '/api/people-said' };

export async function handlePeopleSaid(request, { store }) {
  if (request.method !== 'GET') return methodNotAllowed('GET, OPTIONS');
  const personRef = new URL(request.url).searchParams.get('person_ref') ?? '';
  if (!isPersonRef(personRef)) return errorResponse(400, 'invalid_person_ref', 'Unknown person.', false);
  return okResponse(200, { entries: await listPeopleSaid(store, personRef) });
}

export function createPeopleSaidHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => withCors(await handlePeopleSaid(request, { store: context.store }), request, context.env),
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createPeopleSaidHandler();

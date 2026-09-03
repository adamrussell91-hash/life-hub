import { createTeachingRecordGetHandler } from './_shared/teaching-record-get.mjs';
import { subjectKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/subjects/:id' };

export function createSubjectHandler(deps = {}) {
  return createTeachingRecordGetHandler({
    keyFor: subjectKey,
    notFound: 'Subject not found'
  }, deps);
}

export default createSubjectHandler();

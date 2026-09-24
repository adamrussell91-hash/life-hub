import { createAlmanacHandler, loadProfessionalEventsFromBlobs, loadTeachingLessonsFromBlobs } from './almanac.mjs';

export const config = { path: '/api/almanac/done' };

export default createAlmanacHandler({
  loadLessons: loadTeachingLessonsFromBlobs,
  loadProfessionalEvents: loadProfessionalEventsFromBlobs
});

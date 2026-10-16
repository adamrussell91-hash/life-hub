import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';
import { pickPrecision, pickProgramDates, withCatalogueDates } from './_shared/catalogue-dates.mjs';

export const config = { path: '/api/programs' };

function asStringArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

export function createProgramsHandler(deps = {}) {
  return createTasksCollectionHandler({
    prefix: 'programs/',
    indexKey: 'programs/_index',
    listKey: 'programs',
    idPrefix: 'prog',
    notFound: 'Program not found',
    onRead: record => withCatalogueDates(record),
    create(body, id, timestamp) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return { error: { code: 'validation_error', message: 'name is required' } };
      }
      const picked = pickProgramDates(body);
      const dated = picked.starts_on && picked.ends_on && picked.ends_on >= picked.starts_on;
      return {
        record: {
          schema_version: 1,
          id,
          name,
          types: asStringArray(body.types),
          subjects: asStringArray(body.subjects),
          month: typeof body.month === 'string' ? body.month : null,
          age_groups: asStringArray(body.age_groups),
          competition_level: typeof body.competition_level === 'string' ? body.competition_level : null,
          competition_length: typeof body.competition_length === 'string' ? body.competition_length : null,
          location: typeof body.location === 'string' ? body.location : '',
          organiser: typeof body.organiser === 'string' ? body.organiser : '',
          cost: typeof body.cost === 'string' ? body.cost : '',
          cost_basis: typeof body.cost_basis === 'string' ? body.cost_basis : null,
          description: typeof body.description === 'string' ? body.description : '',
          registration_link: typeof body.registration_link === 'string' ? body.registration_link : null,
          registration_window: typeof body.registration_window === 'string' ? body.registration_window : '',
          starts_on: dated ? picked.starts_on : null,
          ends_on: dated ? picked.ends_on : null,
          dates_precision: pickPrecision(body.dates_precision, Boolean(dated)),
          due_on: picked.due_on,
          due_precision: pickPrecision(body.due_precision, Boolean(picked.due_on)),
          entries_close_on: picked.entries_close_on,
          entries_close_precision: pickPrecision(body.entries_close_precision, Boolean(picked.entries_close_on)),
          dates_source_url: picked.dates_source_url,
          dates_checked_on: picked.dates_checked_on,
          not_available_nsw: body.not_available_nsw === true,
          not_available_reason: typeof body.not_available_reason === 'string' ? body.not_available_reason : '',
          created_at: timestamp,
          updated_at: timestamp
        }
      };
    }
  }, deps);
}

export default createProgramsHandler();

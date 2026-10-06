import { buildMedicalModel, buildMedicalPayload, DEFAULT_MEDICAL_DENSITY } from './medical-model.js';

const SHOW_MINOR_KEY = 'life-hub-medical-show-minor';

function readShowMinor() {
  try {
    return globalThis.localStorage?.getItem?.(SHOW_MINOR_KEY) === '1';
  } catch {
    return false;
  }
}

function writeShowMinor(value) {
  try {
    globalThis.localStorage?.setItem?.(SHOW_MINOR_KEY, value ? '1' : '0');
  } catch { /* ignore */ }
}

function loggedMedicalEvent(visit, payload, result = {}) {
  const built = payload ?? buildMedicalPayload(visit ?? {}, { notes: visit?.notes });
  const record = {
    schema_version: 1,
    type: 'medical',
    id: result.record?.id ?? visit?.id,
    date: built.candidate.date,
    time: built.candidate.time || visit?.time || '00:00',
    ...built.candidate.fields,
    ...(result.record ?? {})
  };
  if (!record.id) record.id = result.path || `medical-${record.date}`;
  return {
    record,
    path: result.path ?? null,
    body: result.notes ?? built.candidate.notes ?? '',
    sha: result.sha,
    legacy: false
  };
}

export function createMedicalController({
  chatApi,
  tasksApi,
  getDate,
  onRecordWritten,
  onError,
  isOnline = () => globalThis.navigator?.onLine !== false
} = {}) {
  let query = '';
  let recordType = '';
  let provider = '';
  let density = DEFAULT_MEDICAL_DENSITY;
  let selectedId = null;
  let expandedYears = [];
  let mode = 'read';
  let draft = null;
  let showMinor = readShowMinor();

  const OFFLINE_MESSAGE = 'You are offline, so nothing was saved. Try again when you are back online.';

  function fail(reason) {
    const message = typeof reason === 'string'
      ? reason
      : `Could not save: ${reason?.message ?? 'unknown error'}`;
    onError?.(message);
  }

  function today() {
    return getDate?.() ?? null;
  }

  return {
    filters() {
      return { query, recordType, provider, density, selectedId, showMinor };
    },
    view() {
      return { mode, draft };
    },
    model(events) {
      const date = today();
      const model = buildMedicalModel({
        events,
        query,
        recordType,
        provider,
        density,
        selectedId,
        expandedYears,
        today: date,
        showMinor
      });
      return { ...model, mode, draft };
    },
    hooks(paint) {
      async function persistVisit(visit) {
        if (!chatApi || !visit || visit.virtual) return;
        if (!isOnline()) return fail(OFFLINE_MESSAGE);
        const payload = buildMedicalPayload(visit, { notes: visit.notes });
        try {
          const result = await chatApi.confirm({
            candidate: payload.candidate,
            slug: payload.slug,
            overwrite: true
          });
          if (result?.ok === false) {
            paint();
            return result;
          }
          const event = loggedMedicalEvent(visit, payload, result);
          mode = 'read';
          draft = null;
          selectedId = event.record.id;
          onRecordWritten?.(event);
          paint();
          return result;
        } catch (error) {
          fail(error);
          paint();
        }
      }

      return {
        onSelect: id => {
          selectedId = id;
          mode = 'read';
          draft = null;
          paint();
        },
        onSearch: value => { query = value; paint(); },
        onTypeChange: value => { recordType = value; paint(); },
        onProviderChange: value => { provider = value; paint(); },
        onDensityChange: value => {
          density = value;
          if (value !== 'years') expandedYears = [];
          paint();
        },
        onToggleYear: year => {
          const key = String(year);
          expandedYears = expandedYears.includes(key)
            ? expandedYears.filter(item => item !== key)
            : [...expandedYears, key];
          paint();
        },
        onShowMinor: value => {
          showMinor = Boolean(value);
          writeShowMinor(showMinor);
          paint();
        },
        onToday: () => {
          const marker = globalThis.document?.querySelector?.('.medical-today');
          marker?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        },
        onJumpUpcoming: () => {
          globalThis.document?.querySelector?.('.medical-upcoming')
            ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        },
        onOpenEpisode: id => {
          const band = globalThis.document?.querySelector?.(`[data-episode-id="${id}"]`);
          if (band) {
            band.open = true;
            band.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
          }
        },
        onAdd: () => {
          selectedId = null;
          mode = 'write';
          draft = { date: today(), record_type: 'Appointment', lane: 'appointment', title: '' };
          paint();
        },
        onEdit: visit => {
          mode = 'write';
          draft = { ...visit };
          paint();
        },
        onCancel: () => {
          mode = 'read';
          draft = null;
          paint();
        },
        onClose: () => {
          selectedId = null;
          mode = 'read';
          draft = null;
          paint();
        },
        onWeightChange: (visit, weight) => persistVisit({ ...visit, weight }),
        // Booking confirms the appointment where it is; it must never re-date it to today.
        onMarkBooked: visit => persistVisit({ ...visit, status: 'booked', date_precision: 'day' }),
        onMarkDone: visit => persistVisit({ ...visit, status: 'done' }),
        onDelete: async visit => {
          if (!visit || visit.virtual) return;
          if (!visit.path) return fail('This visit has no file to delete.');
          if (!chatApi) return;
          if (!isOnline()) return fail(OFFLINE_MESSAGE);
          try {
            const result = await chatApi.confirm({
              kind: 'delete_log',
              slug: 'sara',
              path: visit.path,
              id: visit.id
            });
            if (result?.ok === false) {
              paint();
              return result;
            }
            selectedId = null;
            mode = 'read';
            draft = null;
            onRecordWritten?.({
              deleted: true,
              path: visit.path,
              record: { id: visit.id, type: 'medical' },
              ...(result && typeof result === 'object' ? result : {})
            });
            paint();
            return result;
          } catch (error) {
            fail(error);
            paint();
          }
        },
        onAddToTasks: async visit => {
          if (!visit || visit.task_id || visit.virtual) return;
          if (!tasksApi?.createTask) return;
          if (!isOnline()) return fail(OFFLINE_MESSAGE);
          try {
            const created = await tasksApi.createTask({
              title: visit.title,
              domain: 'health'
            });
            const taskId = created?.task?.id ?? created?.id ?? created?.task_id;
            if (!taskId || !chatApi) {
              paint();
              return;
            }
            return persistVisit({ ...visit, task_id: taskId });
          } catch (error) {
            fail(error);
            paint();
          }
        },
        onSave: fields => {
          if (!chatApi) return;
          const recordType = fields.record_type || 'Appointment';
          // The lane follows the type: keep an existing one only while the type is unchanged, otherwise
          // let it be derived (a "Lab Work" visit was being filed in the appointment lane).
          const keepLane = draft?.lane && (!draft.record_type || draft.record_type === recordType);
          draft = {
            ...draft,
            ...fields,
            date: fields.date || draft?.date || today(),
            record_type: recordType,
            lane: keepLane ? draft.lane : undefined
          };
          return persistVisit(draft);
        }
      };
    }
  };
}

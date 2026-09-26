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

export function createMedicalController({
  chatApi,
  tasksApi,
  getDate,
  onRecordWritten,
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
        onWeightChange: async (visit, weight) => {
          if (!chatApi || !visit || visit.virtual) return;
          if (!isOnline()) return;
          const payload = buildMedicalPayload({ ...visit, weight }, { notes: visit.notes });
          try {
            const result = await chatApi.confirm({
              candidate: payload.candidate,
              slug: payload.slug,
              overwrite: true
            });
            if (result?.ok === false) return result;
            selectedId = result?.record?.id ?? visit.id;
            onRecordWritten?.(result);
            paint();
            return result;
          } catch {
            paint();
          }
        },
        onMarkBooked: async visit => {
          if (!chatApi || !visit || visit.virtual) return;
          if (!isOnline()) return;
          const date = today();
          const payload = buildMedicalPayload({
            ...visit,
            status: 'booked',
            date: date || visit.date,
            date_precision: 'day'
          }, { notes: visit.notes });
          try {
            const result = await chatApi.confirm({
              candidate: payload.candidate,
              slug: payload.slug,
              overwrite: true
            });
            if (result?.ok === false) return result;
            selectedId = result?.record?.id ?? visit.id;
            onRecordWritten?.(result);
            paint();
            return result;
          } catch {
            paint();
          }
        },
        onMarkDone: async visit => {
          if (!chatApi || !visit || visit.virtual) return;
          if (!isOnline()) return;
          const payload = buildMedicalPayload({
            ...visit,
            status: 'done'
          }, { notes: visit.notes });
          try {
            const result = await chatApi.confirm({
              candidate: payload.candidate,
              slug: payload.slug,
              overwrite: true
            });
            if (result?.ok === false) return result;
            selectedId = result?.record?.id ?? visit.id;
            onRecordWritten?.(result);
            paint();
            return result;
          } catch {
            paint();
          }
        },
        onAddToTasks: async visit => {
          if (!visit || visit.task_id || visit.virtual) return;
          if (!tasksApi?.createTask) return;
          if (!isOnline()) return;
          try {
            const created = await tasksApi.createTask({
              title: visit.title,
              domain: 'health'
            });
            const taskId = created?.task?.id ?? created?.id ?? created?.task_id;
            if (!taskId) {
              paint();
              return;
            }
            if (!chatApi) {
              paint();
              return;
            }
            const payload = buildMedicalPayload({
              ...visit,
              task_id: taskId
            }, { notes: visit.notes });
            const result = await chatApi.confirm({
              candidate: payload.candidate,
              slug: payload.slug,
              overwrite: true
            });
            if (result?.ok === false) return result;
            selectedId = result?.record?.id ?? visit.id;
            onRecordWritten?.(result);
            paint();
            return result;
          } catch {
            paint();
          }
        },
        onSave: async fields => {
          if (!chatApi) return;
          if (!isOnline()) return;
          draft = {
            ...draft,
            ...fields,
            date: fields.date || draft?.date || today(),
            record_type: fields.record_type || 'Appointment',
            lane: draft?.lane || 'appointment'
          };
          const payload = buildMedicalPayload(draft, { notes: fields.notes });
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
            mode = 'read';
            draft = null;
            selectedId = result?.record?.id ?? selectedId;
            onRecordWritten?.(result);
            paint();
            return result;
          } catch {
            paint();
          }
        }
      };
    }
  };
}

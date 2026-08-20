import { buildMedicalModel, buildMedicalPayload, DEFAULT_MEDICAL_DENSITY } from './medical-model.js';

export function createMedicalController({
  chatApi,
  getDate,
  onRecordWritten,
  isOnline = () => globalThis.navigator?.onLine !== false
} = {}) {
  let query = '';
  let recordType = '';
  let provider = '';
  let density = DEFAULT_MEDICAL_DENSITY;
  let selectedId = null;
  let mode = 'read';
  let draft = null;

  function today() {
    return getDate?.() ?? null;
  }

  return {
    filters() {
      return { query, recordType, provider, density, selectedId };
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
        today: date
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
        onDensityChange: value => { density = value; paint(); },
        onToday: () => {
          const marker = globalThis.document?.querySelector?.('.medical-today');
          marker?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
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

import {
  buildCompositionPayload,
  buildMeasurementsPayload,
  buildWeightPayload
} from './body-model.js';

export function createBodyController({
  root,
  chatApi,
  onRecordWritten,
  getDate,
  isOnline = () => globalThis.navigator?.onLine !== false
}) {
  if (!root || !chatApi) throw new TypeError('Body controller dependencies are unavailable');

  function setStatus(message) {
    const statusEl = root.querySelector('#body-status');
    if (statusEl) statusEl.textContent = message;
  }

  async function save(payload) {
    if (!isOnline()) {
      setStatus('Connect to log body metrics.');
      return;
    }
    setStatus('Saving…');
    try {
      const result = await chatApi.confirm({
        candidate: payload.candidate,
        slug: payload.slug,
        overwrite: true
      });
      setStatus('Logged');
      onRecordWritten?.(result);
      return result;
    } catch {
      setStatus('Couldn’t save — try again.');
    }
  }

  return {
    setStatus,
    onLogWeight: weightKg => {
      const date = getDate?.();
      if (!date) return;
      return void save(buildWeightPayload(date, weightKg));
    },
    onLogComposition: fields => {
      const date = getDate?.();
      if (!date) return;
      return void save(buildCompositionPayload(date, fields));
    },
    onLogMeasurements: fields => {
      const date = getDate?.();
      if (!date) return;
      return void save(buildMeasurementsPayload(date, fields));
    }
  };
}

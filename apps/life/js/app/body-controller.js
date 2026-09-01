import {
  buildCompositionPayload,
  buildWeightPayload
} from './body-model.js';
import { clearEphemeralMessage, showEphemeralMessage } from './ephemeral-message.js';

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
    if (!statusEl) return;
    if (message === 'Saving…') {
      // Cancel any in-flight ephemeral dismiss so it can't wipe "Saving…" mid-request.
      clearEphemeralMessage(statusEl);
      statusEl.textContent = message;
      statusEl.hidden = false;
      return;
    }
    showEphemeralMessage(statusEl, message);
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
    }
  };
}

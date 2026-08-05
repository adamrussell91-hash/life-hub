import { clearEphemeralMessage, showEphemeralMessage } from './ephemeral-message.js';

export function createSkincareController({
  root,
  chatApi,
  onRecordWritten,
  isOnline = () => globalThis.navigator?.onLine !== false
}) {
  if (!root || !chatApi) throw new TypeError('Skincare controller dependencies are unavailable');

  function setStatus(message) {
    const statusEl = root.querySelector('#skincare-status');
    if (!statusEl) return;
    // Keep "Saving…" sticky until the next status replaces it.
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
      setStatus('Connect to log skincare.');
      return;
    }
    setStatus('Saving…');
    try {
      const result = await chatApi.confirm({
        candidate: payload.candidate,
        slug: payload.slug,
        overwrite: true
      });
      setStatus('Logged ✨');
      onRecordWritten?.(result);
      return result;
    } catch {
      setStatus('Couldn’t save — try again.');
    }
  }

  return {
    setStatus,
    onLogRoutine: ({ payload }) => void save(payload),
    onLogProcedure: ({ payload }) => void save(payload),
    save
  };
}

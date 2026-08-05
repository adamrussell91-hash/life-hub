export function createSkincareController({
  root,
  chatApi,
  onRecordWritten,
  isOnline = () => globalThis.navigator?.onLine !== false
}) {
  if (!root || !chatApi) throw new TypeError('Skincare controller dependencies are unavailable');

  let statusEl = null;

  function setStatus(message) {
    statusEl = statusEl || root.querySelector('#skincare-status');
    if (statusEl) statusEl.textContent = message;
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

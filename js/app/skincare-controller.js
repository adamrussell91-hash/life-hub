import { clearEphemeralMessage, showEphemeralMessage } from './ephemeral-message.js';
import { findProductByName } from './skincare-product-library.js';

export function createSkincareController({
  root,
  chatApi,
  skincareApi,
  onRecordWritten,
  onShelfChanged,
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

  async function removeFromRoutine({ routine, productId }) {
    if (!isOnline()) {
      setStatus('Connect to update routine.');
      return;
    }
    setStatus('Saving…');
    try {
      const membership = await skincareApi.removeFromRoutine({ routine, productId });
      setStatus('Removed from routine');
      onShelfChanged?.({ membership });
      return membership;
    } catch {
      setStatus('Couldn’t update routine — try again.');
    }
  }

  async function addFromLibrary({ routine, productIds }) {
    if (!isOnline()) {
      setStatus('Connect to update routine.');
      return;
    }
    setStatus('Saving…');
    try {
      let membership = null;
      for (const productId of productIds ?? []) {
        membership = await skincareApi.addToRoutine({ routine, productId });
      }
      setStatus('Added to routine');
      onShelfChanged?.({ membership });
      return membership;
    } catch {
      setStatus('Couldn’t update routine — try again.');
    }
  }

  async function createProduct({ routine, name, keep }) {
    if (!keep) return { oneOff: true, name };
    if (!isOnline()) {
      setStatus('Connect to update routine.');
      return;
    }
    setStatus('Saving…');
    try {
      const library = await skincareApi.saveLibraryEntry({ name });
      const product = findProductByName(library, name);
      if (!product?.id) {
        setStatus('Couldn’t update routine — try again.');
        return;
      }
      const membership = await skincareApi.addToRoutine({
        routine,
        productId: product.id
      });
      setStatus('Added to routine');
      onShelfChanged?.({ library, membership });
      return { library, membership };
    } catch {
      setStatus('Couldn’t update routine — try again.');
    }
  }

  return {
    setStatus,
    onLogRoutine: ({ payload }) => void save(payload),
    onLogProcedure: ({ payload }) => void save(payload),
    onRemoveFromRoutine: removeFromRoutine,
    onAddFromLibrary: addFromLibrary,
    onCreateProduct: createProduct,
    save
  };
}

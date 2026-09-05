/** Voice note + quick paste capture controls. */

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function addClass(el, name) {
  if (el.classList?.add) el.classList.add(name);
  else el.className = `${el.className || ''} ${name}`.trim();
}

export function createVoiceNote(options = {}) {
  const doc = ownerDoc(options.root);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-capture');
  let recording = false;
  const status = doc.createElement('p');
  addClass(status, 'hub-capture__status');
  status.textContent = options.idleLabel ?? 'Voice ready';
  const btn = doc.createElement('button');
  btn.type = 'button';
  addClass(btn, 'btn');
  addClass(btn, 'btn--secondary');
  btn.textContent = options.startLabel ?? 'Voice';
  btn.addEventListener('click', () => {
    recording = !recording;
    btn.textContent = recording ? (options.stopLabel ?? 'Stop') : (options.startLabel ?? 'Voice');
    status.textContent = recording ? (options.recordingLabel ?? 'Recording') : (options.idleLabel ?? 'Voice ready');
    if (recording) options.onStart?.();
    else options.onStop?.();
  });
  el.append(btn, status);
  return {
    el,
    button: btn,
    isRecording: () => recording
  };
}

export function createQuickPaste(options = {}) {
  const doc = ownerDoc(options.root);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-capture');
  const btn = doc.createElement('button');
  btn.type = 'button';
  addClass(btn, 'btn');
  addClass(btn, 'btn--ghost');
  btn.textContent = options.label ?? 'Paste';
  btn.addEventListener('click', async () => {
    const clipboard = options.clipboard ?? ownerDoc(options.root)?.defaultView?.navigator?.clipboard
      ?? globalThis.navigator?.clipboard;
    const text = clipboard?.readText ? await clipboard.readText() : '';
    if (text) options.onPaste?.(text);
  });
  el.append(btn);
  return { el, button: btn };
}

export function mountCaptures(scope = document) {
  const nodes = scope.querySelectorAll?.('[data-hub-capture]:not([data-hub-capture-ready])') ?? [];
  return [...nodes].map((el) => {
    el.setAttribute('data-hub-capture-ready', '1');
    addClass(el, 'hub-capture');
    return { el };
  });
}

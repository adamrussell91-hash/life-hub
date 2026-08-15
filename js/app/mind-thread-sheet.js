const AGENT_LABEL = {
  vera: 'Vera',
  penelope: 'Penelope'
};

function sheetOf(root) {
  return root?.querySelector?.('#mind-thread-sheet') ?? null;
}

function bindOnce(root, sheet) {
  if (sheet.dataset.bound) return;
  sheet.dataset.bound = '1';
  const close = () => closeMindThreadSheet(root);
  sheet.querySelector('[data-role="close"]')?.addEventListener('click', close);
  sheet.querySelector('[data-role="scrim"]')?.addEventListener('click', close);
  const target = globalThis.document ?? root;
  target.addEventListener?.('keydown', event => {
    if (event.key === 'Escape' && !sheet.hidden) close();
  });
  sheet.querySelector('[data-role="continue"]')?.addEventListener('click', () => {
    const slug = sheet._continueAgent;
    if (slug) sheet._onContinue?.(slug);
  });
}

export function openMindThreadSheet(root, { title, rows, continueAgent, onContinue, onClose } = {}) {
  const sheet = sheetOf(root);
  if (!sheet) return;
  sheet.hidden = false;
  sheet._onContinue = onContinue;
  sheet._onClose = onClose;
  sheet._continueAgent = continueAgent ?? null;

  const titleEl = sheet.querySelector('[data-role="title"]');
  if (titleEl) titleEl.textContent = title ?? '';

  const host = sheet.querySelector('[data-role="rows"]');
  if (host) {
    const nodes = (rows ?? []).map(row => {
      const item = root.createElement('article');
      item.textContent = [row.date, row.title, row.excerpt].filter(Boolean).join(' ');
      return item;
    });
    host.replaceChildren(...nodes);
  }

  const continueBtn = sheet.querySelector('[data-role="continue"]');
  if (continueBtn) {
    if (!continueAgent) {
      continueBtn.hidden = true;
    } else {
      continueBtn.hidden = false;
      continueBtn.textContent = `Continue with ${AGENT_LABEL[continueAgent] ?? continueAgent}`;
    }
  }

  bindOnce(root, sheet);
}

export function closeMindThreadSheet(root) {
  const sheet = sheetOf(root);
  if (!sheet) return;
  sheet.hidden = true;
  sheet._onClose?.();
}

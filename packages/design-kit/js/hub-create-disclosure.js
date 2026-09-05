/** Pill that expands into a create-action grid. */

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function addClass(el, name) {
  if (el.classList?.add) el.classList.add(name);
  else el.className = `${el.className || ''} ${name}`.trim();
}

/**
 * @param {{
 *   root?: ParentNode & { createElement: typeof document.createElement },
 *   triggerLabel?: string,
 *   items?: Array<{ id: string, label: string, onSelect?: () => void }>
 * }} [options]
 */
export function createCreateDisclosure(options = {}) {
  const doc = ownerDoc(options.root);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-create');
  const trigger = options.trigger ?? doc.createElement('button');
  trigger.type = 'button';
  addClass(trigger, 'btn');
  addClass(trigger, 'btn--primary');
  trigger.textContent = options.triggerLabel ?? 'Create';
  trigger.setAttribute('aria-expanded', 'false');

  const panel = doc.createElement('div');
  addClass(panel, 'hub-create__panel');
  panel.hidden = true;

  for (const item of options.items ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'btn');
    addClass(btn, 'btn--secondary');
    addClass(btn, 'hub-create__item');
    btn.dataset.create = item.id;
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      item.onSelect?.();
      close();
    });
    panel.append(btn);
  }

  const open = () => {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  if (!options.trigger) el.append(trigger);
  el.append(panel);
  return { el, trigger, panel, open, close, isOpen: () => !panel.hidden };
}

export function mountCreateDisclosures(scope = document) {
  const nodes = scope.querySelectorAll?.('[data-hub-create]:not([data-hub-create-ready])') ?? [];
  const mounted = [];
  for (const node of nodes) {
    node.setAttribute('data-hub-create-ready', '1');
    addClass(node, 'hub-create');
    mounted.push({ el: node });
  }
  return mounted;
}

/** Stay-in-place edit, editable chips, and tag lists. */

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function addClass(el, name) {
  if (el.classList?.add) el.classList.add(name);
  else el.className = `${el.className || ''} ${name}`.trim();
}

function textOf(value, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

/**
 * @param {HTMLElement} el
 * @param {{ onCommit?: (value: string) => void }} [options]
 */
export function enhanceInlineEdit(el, options = {}) {
  if (!el || el.dataset?.hubInlineReady === '1') return el;
  el.dataset.hubInlineReady = '1';
  addClass(el, 'hub-inline-edit');
  const doc = ownerDoc(el);
  const start = () => {
    if (el.querySelector?.('input')) return;
    const current = textOf(el.textContent);
    const input = doc.createElement('input');
    addClass(input, 'hub-inline-edit__input');
    input.value = current;
    input.setAttribute('aria-label', el.getAttribute('aria-label') || 'Edit');
    const commit = () => {
      const next = textOf(input.value, current);
      el.textContent = next;
      options.onCommit?.(next);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault?.();
        commit();
      }
      if (event.key === 'Escape') {
        el.textContent = current;
      }
    });
    input.addEventListener('blur', commit);
    el.replaceChildren?.(input);
    if (!el.replaceChildren) {
      el.textContent = '';
      el.append(input);
    }
    input.focus?.();
    input.select?.();
  };
  el.addEventListener('click', start);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault?.();
      start();
    }
  });
  if (!el.getAttribute?.('tabindex')) el.setAttribute?.('tabindex', '0');
  return el;
}

export function createEditableChip(options = {}) {
  const doc = ownerDoc(options.root);
  const el = doc.createElement('span');
  addClass(el, 'hub-chip-edit');
  el.textContent = textOf(options.label, 'Chip');
  enhanceInlineEdit(el, { onCommit: options.onCommit });
  if (options.onRemove) {
    const remove = doc.createElement('button');
    remove.type = 'button';
    addClass(remove, 'hub-icon-btn');
    remove.setAttribute('aria-label', 'Remove');
    remove.textContent = '×';
    remove.addEventListener('click', (event) => {
      event.stopPropagation?.();
      options.onRemove();
    });
    el.append(remove);
  }
  return { el };
}

export function createTagList(options = {}) {
  const doc = ownerDoc(options.root);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-tag-list');
  let tags = [...(options.tags ?? [])];

  const paint = () => {
    el.replaceChildren?.();
    if (!el.replaceChildren) el.textContent = '';
    for (const tag of tags) {
      const chip = doc.createElement('span');
      addClass(chip, 'hub-tag');
      chip.textContent = tag;
      const remove = doc.createElement('button');
      remove.type = 'button';
      addClass(remove, 'hub-icon-btn');
      remove.setAttribute('aria-label', `Remove ${tag}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        tags = tags.filter((item) => item !== tag);
        paint();
        options.onChange?.([...tags]);
      });
      chip.append(remove);
      el.append(chip);
    }
    const add = doc.createElement('button');
    add.type = 'button';
    addClass(add, 'btn');
    addClass(add, 'btn--ghost');
    add.textContent = options.addLabel ?? 'Add tag';
    add.addEventListener('click', () => {
      enhanceInlineEdit(add, {
        onCommit: (value) => {
          if (value && value !== (options.addLabel ?? 'Add tag') && !tags.includes(value)) {
            tags.push(value);
            options.onChange?.([...tags]);
          }
          paint();
        }
      });
      add.click();
    });
    el.append(add);
  };

  paint();
  return {
    el,
    get tags() { return [...tags]; },
    setTags(next) { tags = [...next]; paint(); }
  };
}

export function mountInlineEdits(scope = document) {
  const nodes = scope.querySelectorAll?.('[data-hub-inline-edit]:not([data-hub-inline-ready])') ?? [];
  return [...nodes].map((el) => enhanceInlineEdit(el));
}

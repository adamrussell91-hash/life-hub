/** Contextual AI bar + agent select. Tokens only. */

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function addClass(el, name) {
  if (el.classList?.add) el.classList.add(name);
  else el.className = `${el.className || ''} ${name}`.trim();
}

function textOf(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

/**
 * @param {{
 *   root?: ParentNode & { createElement: typeof document.createElement },
 *   placeholder?: string,
 *   tools?: Array<{ id: string, label: string }>,
 *   submitLabel?: string,
 *   onSubmit?: (value: string) => void,
 *   onTool?: (id: string) => void
 * }} [options]
 */
export function createContextualAiBar(options = {}) {
  const doc = ownerDoc(options.root);
  const el = options.wrap ?? doc.createElement('form');
  addClass(el, 'hub-ai-bar');
  el.setAttribute('data-hub-ai-bar', '');

  const field = doc.createElement('div');
  addClass(field, 'hub-ai-bar__field');
  const input = doc.createElement('input');
  addClass(input, 'hub-ai-bar__input');
  input.type = 'text';
  input.placeholder = options.placeholder ?? 'Ask…';
  input.setAttribute('aria-label', options.placeholder ?? 'Ask');
  field.append(input);

  const tools = doc.createElement('div');
  addClass(tools, 'hub-ai-bar__tools');
  for (const tool of options.tools ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'hub-icon-btn');
    btn.dataset.tool = tool.id;
    btn.setAttribute('aria-label', tool.label);
    btn.textContent = tool.label;
    btn.addEventListener('click', () => {
      addClass(el, 'is-open');
      input.focus?.();
      options.onTool?.(tool.id);
    });
    tools.append(btn);
  }

  const ask = doc.createElement('button');
  ask.type = 'button';
  addClass(ask, 'btn');
  addClass(ask, 'btn--ghost');
  ask.textContent = options.askLabel ?? 'Ask';
  ask.addEventListener('click', () => {
    addClass(el, 'is-open');
    input.focus?.();
  });
  tools.append(ask);

  const submit = doc.createElement('button');
  submit.type = 'submit';
  addClass(submit, 'btn');
  addClass(submit, 'btn--primary');
  submit.textContent = options.submitLabel ?? 'Send';

  el.append(tools, field, submit);
  el.addEventListener('submit', (event) => {
    event.preventDefault?.();
    const value = String(input.value ?? '').trim();
    if (value) options.onSubmit?.(value);
  });

  return {
    el,
    input,
    open: () => addClass(el, 'is-open'),
    isOpen: () => el.classList?.contains?.('is-open') || String(el.className).includes('is-open')
  };
}

export function mountContextualAiBars(scope = document) {
  const nodes = scope.querySelectorAll?.('[data-hub-ai-bar]:not([data-hub-ai-ready])') ?? [];
  const mounted = [];
  for (const node of nodes) {
    node.setAttribute('data-hub-ai-ready', '1');
    const tools = [...(node.querySelectorAll?.('[data-ai-tool]') ?? [])].map((btn) => ({
      id: btn.getAttribute('data-ai-tool') || btn.id,
      label: btn.getAttribute('aria-label') || btn.textContent
    }));
    if (!node.querySelector?.('.hub-ai-bar__input')) {
      const api = createContextualAiBar({
        root: ownerDoc(scope),
        wrap: node,
        tools,
        placeholder: node.getAttribute('data-placeholder')
      });
      mounted.push(api);
    } else {
      addClass(node, 'hub-ai-bar');
      mounted.push({ el: node });
    }
  }
  return mounted;
}

/**
 * @param {{
 *   root?: ParentNode & { createElement: typeof document.createElement },
 *   agents?: Array<{ id: string, label: string }>,
 *   value?: string,
 *   onChange?: (id: string) => void
 * }} [options]
 */
export function createSelectAiAgent(options = {}) {
  const doc = ownerDoc(options.root);
  const el = options.wrap ?? doc.createElement('div');
  addClass(el, 'hub-ai-agent');
  el.setAttribute('role', 'listbox');
  el.setAttribute('aria-label', options.label ?? 'Choose who to talk to');
  let value = options.value ?? options.agents?.[0]?.id ?? '';

  const paint = () => {
    for (const btn of el.querySelectorAll?.('[data-agent]') ?? []) {
      const active = btn.dataset.agent === value;
      btn.classList?.toggle?.('is-active', active);
      btn.setAttribute?.('aria-selected', active ? 'true' : 'false');
    }
  };

  for (const agent of options.agents ?? []) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'hub-ai-agent__btn');
    btn.dataset.agent = agent.id;
    btn.setAttribute('role', 'option');
    btn.textContent = textOf(agent.label, agent.id);
    btn.addEventListener('click', () => {
      value = agent.id;
      paint();
      options.onChange?.(agent.id);
    });
    el.append(btn);
  }
  paint();
  return {
    el,
    get value() { return value; },
    setValue(id) { value = id; paint(); }
  };
}

export function mountSelectAiAgents(scope = document) {
  const hosts = scope.querySelectorAll?.('[data-hub-ai-agent]:not([data-hub-ai-agent-ready])') ?? [];
  const mounted = [];
  for (const host of hosts) {
    host.setAttribute('data-hub-ai-agent-ready', '1');
    addClass(host, 'hub-ai-agent');
    mounted.push({ el: host });
  }
  return mounted;
}

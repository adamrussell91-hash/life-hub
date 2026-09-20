import {
  CENTRAL_ID,
  HUB_LABELS,
  KIND_LABELS,
  NODE_STATUSES,
  STATUS_LABELS,
  childIndex,
  parentIndex
} from './hub-map-model.js';

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(doc, label, className, onClick) {
  const node = el(doc, 'button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function field(doc, label, control) {
  const wrap = el(doc, 'label', 'hub-map-panel__field');
  wrap.append(el(doc, 'span', 'hub-map-panel__label', label), control);
  return wrap;
}

function group(doc, title) {
  const section = el(doc, 'section', 'hub-map-panel__group');
  section.append(el(doc, 'h4', 'hub-map-panel__heading', title));
  return section;
}

function addForm(doc, { placeholder, label, focusKey, onAdd, extra }) {
  const form = el(doc, 'form', 'hub-map-panel__add');
  const input = el(doc, 'input', 'hub-map-panel__input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', label);
  input.setAttribute('data-focus', focusKey);
  form.append(input);
  if (extra) form.append(extra);
  const submit = el(doc, 'button', 'btn btn--secondary', 'Add');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim();
    if (value) onAdd(value);
  });
  return form;
}

function pickerButton(doc, node, onSelect, suffix = '') {
  return button(doc, `${node.name}${suffix}`, 'hub-map-panel__jump', () => onSelect(node.id));
}

/**
 * Renders the edit panel for one node into `host`. Re-rendered after every change,
 * so inputs commit on `change`/submit and the focused add-box is restored.
 */
export function renderHubMapPanel(host, { map, nodeId, handlers }) {
  const doc = host.ownerDocument;
  const node = map?.nodes.find(entry => entry.id === nodeId) ?? null;
  const focused = doc.activeElement?.getAttribute?.('data-focus') ?? null;
  host.replaceChildren();
  host.hidden = !node;
  if (!node) return;

  const byId = new Map(map.nodes.map(entry => [entry.id, entry]));
  const parents = parentIndex(map);
  const kids = childIndex(map);

  const header = el(doc, 'div', 'hub-map-panel__header');
  const titles = el(doc, 'div');
  titles.append(
    el(doc, 'p', 'hub-map-panel__eyebrow', `${HUB_LABELS[node.hub]} · ${KIND_LABELS[node.kind]}`),
    el(doc, 'h3', 'hub-map-panel__title', node.name)
  );
  header.append(titles, button(doc, '×', 'hub-map-panel__close', handlers.onClose));
  header.lastChild.setAttribute('aria-label', 'Close panel');
  host.append(header);

  const name = el(doc, 'input', 'hub-map-panel__input');
  name.type = 'text';
  name.value = node.name;
  name.addEventListener('change', () => {
    if (name.value.trim()) handlers.onChange({ name: name.value });
    else name.value = node.name;
  });
  const route = el(doc, 'input', 'hub-map-panel__input');
  route.type = 'text';
  route.value = node.route;
  route.addEventListener('change', () => handlers.onChange({ route: route.value }));
  const status = el(doc, 'select', 'hub-map-panel__input');
  for (const value of NODE_STATUSES) {
    const option = el(doc, 'option', '', STATUS_LABELS[value]);
    option.value = value;
    status.append(option);
  }
  status.value = node.status;
  status.addEventListener('change', () => handlers.onChange({ status: status.value }));
  const basics = group(doc, 'Page');
  basics.append(field(doc, 'Name', name), field(doc, 'Built out?', status), field(doc, 'Route', route));
  host.append(basics);

  const features = group(doc, 'UI/UX features');
  const featureList = el(doc, 'ul', 'hub-map-panel__list');
  node.features.forEach((text, index) => {
    const item = el(doc, 'li', 'hub-map-panel__item');
    item.append(
      el(doc, 'span', '', text),
      button(doc, '×', 'hub-map-panel__remove', () => handlers.onChange({ features: node.features.filter((_, i) => i !== index) }))
    );
    item.lastChild.setAttribute('aria-label', `Remove ${text}`);
    featureList.append(item);
  });
  features.append(featureList, addForm(doc, {
    placeholder: 'Add a feature',
    label: 'New feature',
    focusKey: 'add-feature',
    onAdd: value => handlers.onChange({ features: [...node.features, value] })
  }));
  host.append(features);

  const plans = group(doc, 'Build plans');
  const planList = el(doc, 'ul', 'hub-map-panel__list');
  node.plans.forEach((plan, index) => {
    const item = el(doc, 'li', 'hub-map-panel__item');
    const check = el(doc, 'input');
    check.type = 'checkbox';
    check.checked = plan.done;
    check.addEventListener('change', () => handlers.onChange({
      plans: node.plans.map((entry, i) => (i === index ? { ...entry, done: check.checked } : entry))
    }));
    const label = el(doc, 'label', 'hub-map-panel__check');
    label.append(check, el(doc, 'span', plan.done ? 'is-done' : '', plan.text));
    item.append(
      label,
      button(doc, '×', 'hub-map-panel__remove', () => handlers.onChange({ plans: node.plans.filter((_, i) => i !== index) }))
    );
    item.lastChild.setAttribute('aria-label', `Remove ${plan.text}`);
    planList.append(item);
  });
  plans.append(planList, addForm(doc, {
    placeholder: 'Add a plan',
    label: 'New plan',
    focusKey: 'add-plan',
    onAdd: value => handlers.onChange({ plans: [...node.plans, { text: value, done: false }] })
  }));
  host.append(plans);

  const notes = el(doc, 'textarea', 'hub-map-panel__input hub-map-panel__notes');
  notes.value = node.notes;
  notes.rows = 3;
  notes.addEventListener('change', () => handlers.onChange({ notes: notes.value }));
  const notesGroup = group(doc, 'Notes');
  notesGroup.append(notes);
  host.append(notesGroup);

  const connections = group(doc, 'Connections');
  const parent = byId.get(parents.get(node.id));
  if (parent) {
    const row = el(doc, 'p', 'hub-map-panel__row', 'Part of ');
    row.append(pickerButton(doc, parent, handlers.onSelect));
    connections.append(row);
  }
  const children = (kids.get(node.id) ?? []).map(id => byId.get(id));
  if (children.length) {
    const row = el(doc, 'div', 'hub-map-panel__row', 'Contains ');
    for (const child of children) row.append(pickerButton(doc, child, handlers.onSelect));
    connections.append(row);
  }
  const outgoing = map.edges.filter(edge => edge.type === 'link' && edge.from === node.id);
  const incoming = map.edges.filter(edge => edge.type === 'link' && edge.to === node.id);
  const outList = el(doc, 'ul', 'hub-map-panel__list');
  for (const edge of outgoing) {
    const target = byId.get(edge.to);
    const item = el(doc, 'li', 'hub-map-panel__item');
    item.append(
      pickerButton(doc, target, handlers.onSelect, edge.label ? ` (${edge.label})` : ''),
      button(doc, '×', 'hub-map-panel__remove', () => handlers.onRemoveLink(edge.from, edge.to))
    );
    item.lastChild.setAttribute('aria-label', `Remove link to ${target.name}`);
    outList.append(item);
  }
  connections.append(el(doc, 'p', 'hub-map-panel__sub', 'Links to'), outList);
  if (incoming.length) {
    const inRow = el(doc, 'div', 'hub-map-panel__row', 'Linked from ');
    for (const edge of incoming) {
      const source = byId.get(edge.from);
      inRow.append(pickerButton(doc, source, handlers.onSelect, edge.label ? ` (${edge.label})` : ''));
    }
    connections.append(inRow);
  }

  const linked = new Set(outgoing.map(edge => edge.to));
  const picker = el(doc, 'select', 'hub-map-panel__input');
  picker.setAttribute('aria-label', 'Link to another page');
  picker.append(Object.assign(el(doc, 'option', '', 'Link to…'), { value: '' }));
  for (const hub of ['life', 'teaching', 'knowledge', 'tasks', 'professional']) {
    const options = map.nodes.filter(entry =>
      entry.hub === hub && entry.id !== node.id && entry.id !== CENTRAL_ID && !linked.has(entry.id));
    if (!options.length) continue;
    const optgroup = el(doc, 'optgroup');
    optgroup.label = HUB_LABELS[hub];
    for (const entry of options) optgroup.append(Object.assign(el(doc, 'option', '', entry.name), { value: entry.id }));
    picker.append(optgroup);
  }
  picker.addEventListener('change', () => {
    if (picker.value) handlers.onAddLink(picker.value);
  });
  connections.append(picker);

  if (node.id !== CENTRAL_ID) {
    const kind = el(doc, 'select', 'hub-map-panel__input');
    kind.setAttribute('aria-label', 'New page kind');
    for (const [value, label] of [['page', 'Page'], ['section', 'Section'], ['page-type', 'Page type']]) {
      kind.append(Object.assign(el(doc, 'option', '', label), { value }));
    }
    connections.append(addForm(doc, {
      placeholder: 'Add a sub-page',
      label: 'New child name',
      focusKey: 'add-child',
      extra: kind,
      onAdd: value => handlers.onAddChild(value, kind.value)
    }));
  }
  host.append(connections);

  if (node.kind !== 'hub') {
    const danger = el(doc, 'div', 'hub-map-panel__danger');
    const ask = button(doc, 'Remove this page', 'btn btn--ghost', () => {
      const count = descendantCount(kids, node.id);
      danger.replaceChildren(
        el(doc, 'p', 'hub-map-panel__confirm', count
          ? `Remove ${node.name} and ${count} page${count === 1 ? '' : 's'} inside it?`
          : `Remove ${node.name}?`),
        button(doc, 'Remove', 'btn btn--decisive', handlers.onRemove),
        button(doc, 'Cancel', 'btn btn--ghost', () => renderHubMapPanel(host, { map, nodeId, handlers }))
      );
    });
    danger.append(ask);
    host.append(danger);
  }

  if (focused) host.querySelector(`[data-focus="${focused}"]`)?.focus?.();
}

function descendantCount(kids, id) {
  let total = 0;
  for (const child of kids.get(id) ?? []) total += 1 + descendantCount(kids, child);
  return total;
}

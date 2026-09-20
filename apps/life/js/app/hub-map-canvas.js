import {
  CENTRAL_ID,
  HUB_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  childIndex,
  nearestVisible,
  parentIndex
} from './hub-map-model.js';
import { layoutMap, linkPath, structurePath } from './hub-map-layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_SCALE = 0.25;
const MAX_SCALE = 1.6;

function clamp(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function edgePath(doc, d, className, title) {
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  if (title) {
    const label = doc.createElementNS(SVG_NS, 'title');
    label.textContent = title;
    path.append(label);
  }
  return path;
}

function buildCard(doc, node, position, { selected, dim, expandable, expanded, onSelect, onToggle }) {
  const card = el(doc, 'article', [
    'hub-map-card',
    `hub-map-card--${node.kind}`,
    selected ? 'is-selected' : '',
    dim ? 'is-dim' : ''
  ].filter(Boolean).join(' '));
  card.setAttribute('data-node-id', node.id);
  card.style.left = `${position.x}px`;
  card.style.top = `${position.y}px`;
  card.style.width = `${position.w}px`;
  card.style.height = `${position.h}px`;

  const main = el(doc, 'button', 'hub-map-card__main');
  main.type = 'button';
  main.setAttribute('aria-label', `${node.name}, ${STATUS_LABELS[node.status]}. Edit`);
  const eyebrow = node.kind === 'hub'
    ? HUB_LABELS[node.hub]
    : `${HUB_LABELS[node.hub]} · ${KIND_LABELS[node.kind]}`;
  const meta = el(doc, 'span', 'hub-map-card__meta');
  meta.append(el(doc, 'span', `hub-map-status hub-map-status--${node.status}`, STATUS_LABELS[node.status]));
  if (node.features.length) {
    meta.append(el(doc, 'span', 'hub-map-card__count', `${node.features.length} feature${node.features.length === 1 ? '' : 's'}`));
  }
  if (node.plans.length) {
    const done = node.plans.filter(plan => plan.done).length;
    meta.append(el(doc, 'span', 'hub-map-card__count', `${done}/${node.plans.length} plans`));
  }
  main.append(
    el(doc, 'span', 'hub-map-card__eyebrow', eyebrow),
    el(doc, 'span', 'hub-map-card__title', node.name),
    meta
  );
  main.addEventListener('click', () => onSelect(node.id));
  card.append(main);

  if (expandable) {
    const toggle = el(doc, 'button', 'hub-map-card__toggle', expanded ? '‹' : '›');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${node.name}`);
    toggle.addEventListener('click', () => onToggle(node.id));
    card.append(toggle);
  }
  return card;
}

export function createHubMapCanvas({ canvas, world, edges, nodes, zoomLabel, onSelect, onToggle }) {
  const doc = canvas.ownerDocument;
  const listeners = [];
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let layout = null;
  let fitted = false;
  let drag = null;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push([target, type, handler, options]);
  }

  function applyTransform() {
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  function canvasWidth() {
    return canvas.clientWidth || canvas.getBoundingClientRect?.().width || 0;
  }

  function fit() {
    const width = canvasWidth();
    const padding = 16;
    scale = layout && width > 0 ? clamp((width - padding * 2) / layout.width) : 1;
    if (scale > 1) scale = 1;
    tx = padding;
    ty = padding;
    applyTransform();
  }

  function zoomAround(px, py, factor) {
    const next = clamp(scale * factor);
    tx = px - (px - tx) * (next / scale);
    ty = py - (py - ty) * (next / scale);
    scale = next;
    applyTransform();
  }

  function zoomBy(factor) {
    const rect = canvas.getBoundingClientRect();
    zoomAround(rect.width / 2, rect.height / 2, factor);
  }

  function render({ map, visible, expanded, selectedId = null, filter = 'all' }) {
    layout = layoutMap(map, visible);
    world.style.width = `${layout.width}px`;
    world.style.height = `${layout.height}px`;
    edges.setAttribute('width', String(layout.width));
    edges.setAttribute('height', String(layout.height));
    edges.replaceChildren();
    nodes.replaceChildren();

    const kids = childIndex(map);
    const parents = parentIndex(map);
    const names = new Map(map.nodes.map(node => [node.id, node.name]));

    for (const node of map.nodes) {
      if (!visible.has(node.id)) continue;
      const dim = filter !== 'all' && node.kind !== 'hub' && node.status !== filter;
      nodes.append(buildCard(doc, node, layout.positions.get(node.id), {
        selected: node.id === selectedId,
        dim,
        expandable: (kids.get(node.id) ?? []).length > 0,
        expanded: expanded.has(node.id),
        onSelect,
        onToggle
      }));
    }

    for (const edge of map.edges) {
      if (edge.type !== 'structure' || !visible.has(edge.from) || !visible.has(edge.to)) continue;
      edges.append(edgePath(
        doc,
        structurePath(layout.positions.get(edge.from), layout.positions.get(edge.to)),
        'hub-map-edge hub-map-edge--structure'
      ));
    }

    const drawn = new Set();
    for (const edge of map.edges) {
      if (edge.type !== 'link') continue;
      const from = nearestVisible(parents, edge.from, visible);
      const to = nearestVisible(parents, edge.to, visible);
      if (!from || !to || from === to || from === CENTRAL_ID || to === CENTRAL_ID) continue;
      const key = `${from}>${to}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const title = `${names.get(edge.from)} → ${names.get(edge.to)}${edge.label ? ` (${edge.label})` : ''}`;
      edges.append(edgePath(
        doc,
        linkPath(layout.positions.get(from), layout.positions.get(to)),
        'hub-map-edge hub-map-edge--link',
        title
      ));
    }

    if (fitted) applyTransform();
    else {
      fitted = true;
      fit();
    }
  }

  listen(canvas, 'pointerdown', event => {
    if (event.target?.closest?.('.hub-map-card, .hub-map__zoom')) return;
    drag = { x: event.clientX, y: event.clientY, tx, ty };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add('is-panning');
  });
  listen(canvas, 'pointermove', event => {
    if (!drag) return;
    tx = drag.tx + (event.clientX - drag.x);
    ty = drag.ty + (event.clientY - drag.y);
    applyTransform();
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('is-panning');
  };
  listen(canvas, 'pointerup', endDrag);
  listen(canvas, 'pointercancel', endDrag);
  listen(canvas, 'wheel', event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = canvas.getBoundingClientRect();
      zoomAround(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.1 : 1 / 1.1);
    } else {
      tx -= event.deltaX;
      ty -= event.deltaY;
      applyTransform();
    }
  }, { passive: false });

  return {
    render,
    fit,
    zoomBy,
    destroy() {
      for (const [target, type, handler, options] of listeners) target.removeEventListener(type, handler, options);
      listeners.length = 0;
    }
  };
}

import {
  addLink,
  addNode,
  ancestorsOf,
  defaultExpanded,
  parentIndex,
  removeLink,
  removeNode,
  statusCounts,
  updateNode,
  validateMap,
  visibleIds
} from './hub-map-model.js';
import { createHubMapCanvas } from './hub-map-canvas.js';
import { renderHubMapPanel } from './hub-map-panel.js';

const FILTER_LABELS = {
  all: 'All',
  unreviewed: 'Unreviewed',
  'not-started': 'Not started',
  partial: 'Partial',
  built: 'Built'
};

export function createHubMapController({
  root,
  api,
  debounceMs = 600,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  const dashboard = root.querySelector('#hub-map-dashboard');
  const canvasEl = dashboard?.querySelector('#hub-map-canvas');
  if (!dashboard || !canvasEl || !api) {
    return { open: async () => {}, importText: () => {} };
  }

  const $ = selector => dashboard.querySelector(selector);
  const panelEl = $('#hub-map-panel');
  const stageEl = $('#hub-map-stage');
  const stateEl = $('#hub-map-save-state');
  const errorEl = $('#hub-map-error');
  const fileEl = $('#hub-map-file');

  const state = {
    map: null,
    sha: null,
    expanded: new Set(),
    selectedId: null,
    filter: 'all',
    dirty: false,
    saving: false
  };
  let timer = null;

  const canvas = createHubMapCanvas({
    canvas: canvasEl,
    world: $('#hub-map-world'),
    edges: $('#hub-map-edges'),
    nodes: $('#hub-map-nodes'),
    zoomLabel: $('#hub-map-zoom-label'),
    onSelect: id => select(id),
    onToggle: id => {
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderAll();
    }
  });

  const handlers = {
    onClose: () => select(null),
    onSelect: id => select(id, { reveal: true }),
    onChange: patch => commit(updateNode(state.map, state.selectedId, patch)),
    onAddLink: to => commit(addLink(state.map, state.selectedId, to)),
    onRemoveLink: (from, to) => commit(removeLink(state.map, from, to)),
    onAddChild: (name, kind) => {
      const parentId = state.selectedId;
      const result = addNode(state.map, { parentId, name, kind });
      if (!result) return commit(null);
      state.expanded.add(parentId);
      state.selectedId = result.id;
      return commit(result.map);
    },
    onRemove: () => {
      const next = removeNode(state.map, state.selectedId);
      if (next) state.selectedId = null;
      commit(next);
    }
  };

  function setSaveState(text) {
    if (stateEl) stateEl.textContent = text;
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.replaceChildren();
  }

  function showError(message, actionLabel, action) {
    if (!errorEl) return;
    errorEl.replaceChildren(root.createTextNode(message));
    if (actionLabel) {
      const retry = root.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn--secondary';
      retry.textContent = actionLabel;
      retry.addEventListener('click', action);
      errorEl.append(' ', retry);
    }
    errorEl.hidden = false;
  }

  function renderToolbar() {
    const counts = statusCounts(state.map);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    for (const chip of dashboard.querySelectorAll('[data-hub-map-filter]')) {
      const key = chip.getAttribute('data-hub-map-filter');
      const active = key === state.filter;
      chip.textContent = `${FILTER_LABELS[key]} ${key === 'all' ? total : counts[key]}`;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
  }

  function renderAll() {
    if (!state.map) return;
    canvas.render({
      map: state.map,
      visible: visibleIds(state.map, state.expanded),
      expanded: state.expanded,
      selectedId: state.selectedId,
      filter: state.filter
    });
    renderHubMapPanel(panelEl, { map: state.map, nodeId: state.selectedId, handlers });
    stageEl?.classList.toggle('has-panel', Boolean(state.selectedId));
    renderToolbar();
  }

  function select(id, { reveal = false } = {}) {
    if (reveal && id) {
      for (const ancestor of ancestorsOf(parentIndex(state.map), id)) state.expanded.add(ancestor);
    }
    state.selectedId = id;
    renderAll();
  }

  function commit(next) {
    if (!next) {
      showError('That change was not valid, so it was not applied.');
      return;
    }
    clearError();
    state.map = next;
    state.dirty = true;
    renderAll();
    setSaveState('Unsaved changes');
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void flush();
    }, debounceMs);
  }

  async function flush() {
    if (state.saving || !state.dirty || !state.map) return;
    state.saving = true;
    const snapshot = state.map;
    let failed = false;
    setSaveState('Saving…');
    try {
      const saved = await api.save(snapshot, state.sha);
      state.sha = saved.sha;
      if (state.map === snapshot) state.dirty = false;
      clearError();
      setSaveState(state.dirty ? 'Unsaved changes' : 'Saved');
    } catch (error) {
      failed = true;
      setSaveState('Not saved');
      if (error?.code === 'write_conflict') {
        showError('The hub map was changed somewhere else. Reload to continue; your unsaved edits here will be discarded.', 'Reload map', () => void load());
      } else {
        showError('Could not save the hub map. Your edits are still on screen.', 'Try again', () => void flush());
      }
    } finally {
      state.saving = false;
    }
    if (!failed && state.dirty) void flush();
  }

  async function load() {
    setSaveState('Loading…');
    clearError();
    try {
      const loaded = await api.load();
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      state.map = loaded.map;
      state.sha = loaded.sha;
      state.dirty = false;
      state.expanded = defaultExpanded(loaded.map);
      state.selectedId = null;
      renderAll();
      setSaveState(loaded.seeded ? 'Starter map. Your first edit saves it.' : 'Saved');
    } catch {
      setSaveState('');
      showError('Could not load the hub map.', 'Retry', () => void load());
    }
  }

  function importText(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      showError('That file is not valid JSON.');
      return;
    }
    const result = validateMap(raw);
    if (!result.ok) {
      showError(`That file is not a valid hub map: ${result.errors[0]}.`);
      return;
    }
    state.expanded = defaultExpanded(result.map);
    state.selectedId = null;
    commit(result.map);
  }

  function exportMap() {
    if (!state.map) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.map, null, 2)], { type: 'application/json' }));
    const link = root.createElement('a');
    link.href = url;
    link.download = 'hub-map.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  for (const chip of dashboard.querySelectorAll('[data-hub-map-filter]')) {
    chip.addEventListener('click', () => {
      state.filter = chip.getAttribute('data-hub-map-filter');
      renderAll();
    });
  }
  $('[data-hub-map="fit"]')?.addEventListener('click', () => canvas.fit());
  $('[data-hub-map="zoom-in"]')?.addEventListener('click', () => canvas.zoomBy(1.2));
  $('[data-hub-map="zoom-out"]')?.addEventListener('click', () => canvas.zoomBy(1 / 1.2));
  $('[data-hub-map="export"]')?.addEventListener('click', exportMap);
  $('[data-hub-map="import"]')?.addEventListener('click', () => fileEl?.click());
  fileEl?.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    fileEl.value = '';
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      showError('Could not read that file.');
      return;
    }
    importText(text);
  });

  return {
    async open() {
      if (state.map) renderAll();
      else await load();
    },
    importText
  };
}

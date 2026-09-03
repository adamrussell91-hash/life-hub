import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { buildUniverseModel } from '@/domain/universe';
import { renderGraphFamilyPills } from '@/views/stretch-pills';
import { renderTaskEditor } from '@/views/task-editor';
import {
  applyUniverseViewState,
  bindUniverseView,
  readUniverseDark,
  shouldExitUniverseFullscreen,
  universeExitHtml,
  universeViewToolsHtml,
  universeWrapClass,
  writeUniverseDark
} from '@/views/universe-chrome';
import { bindUniverseKey, universeKeyHtml } from '@/views/universe-key';
import {
  UNIVERSE_BUILD,
  mountUniverseView,
  resolveSearchHits,
  type UniverseMount
} from '@/views/universe-canvas';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { createHubSearch, createHubToolbar } from '@/views/hub-kit';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function orbitSpeedLabel(speed: number): string {
  return speed === 0 ? 'Paused' : `${speed.toFixed(2)}×`;
}

function showPreview(
  preview: HTMLElement,
  task: Task | null,
  projects: Project[],
  title: string,
  excerpt: string
): void {
  preview.hidden = false;
  preview.replaceChildren(
    el('p', 'graph-preview__eyebrow', task ? 'task' : 'body'),
    el('h3', 'graph-preview__title', title)
  );
  if (task) {
    preview.append(
      el(
        'p',
        'graph-preview__meta',
        [task.domain, task.priority, task.due_date ? `due ${formatDisplayDate(task.due_date)}` : null]
          .filter(Boolean)
          .join(' · ')
      )
    );
    if (excerpt) preview.append(el('p', 'graph-preview__meta', excerpt));
    const edit = el('button', 'btn btn--ghost', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => {
      renderTaskEditor(preview, task, projects, () => {
        location.hash = '#/board';
      });
    });
    preview.append(edit);
    return;
  }
  if (excerpt) preview.append(el('p', 'graph-preview__meta', excerpt));
}

let lastUniverseCleanup: (() => void) | null = null;

/** Knowledge Hub Universe engine over Tasks domains, projects, and tags. */
export async function renderUniverseView(canvas: HTMLElement): Promise<void> {
  lastUniverseCleanup?.();
  lastUniverseCleanup = null;
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading universe…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  const model = buildUniverseModel(tasks, projects);

  let dark = readUniverseDark(typeof localStorage === 'undefined' ? null : localStorage);
  let fullscreen = false;
  const clock = { speed: 0.5 };

  canvas.replaceChildren();
  canvas.append(renderGraphFamilyPills('universe'));

  const wrap = el('div', universeWrapClass(dark, fullscreen));
  const toolbar = createHubToolbar('graph-toolbar');
  const search = createHubSearch({
    placeholder: 'Search tasks, projects, domains…',
    ariaLabel: 'Filter universe'
  });
  const filters = createCollapsibleFilters({
    id: 'universe',
    ariaLabel: 'Filters',
    className: 'hub-filters--inline'
  });
  filters.panel.append(search.el);
  toolbar.append(filters.root);

  const speed = el('label', 'graph-speed');
  speed.append(el('span', 'graph-speed__label', 'Orbit speed'));
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.05';
  slider.value = String(clock.speed);
  slider.setAttribute('aria-label', 'Orbit speed');
  const readout = document.createElement('output');
  readout.className = 'graph-speed__value';
  readout.textContent = orbitSpeedLabel(clock.speed);
  slider.addEventListener('input', () => {
    clock.speed = Number(slider.value);
    readout.textContent = orbitSpeedLabel(clock.speed);
  });
  speed.append(slider, readout);
  toolbar.append(speed);
  toolbar.insertAdjacentHTML('beforeend', universeViewToolsHtml(dark, fullscreen));

  const meta = el('p', 'graph-toolbar__meta', `Universe v${UNIVERSE_BUILD}`);
  toolbar.append(meta);
  wrap.append(toolbar);

  const stage = el('div', 'universe-stage');
  wrap.append(stage);
  wrap.insertAdjacentHTML('beforeend', universeKeyHtml(false));
  wrap.insertAdjacentHTML('beforeend', universeExitHtml(fullscreen));
  canvas.append(wrap);
  bindUniverseKey(wrap, () => undefined);

  const preview = el('aside', 'graph-preview');
  preview.hidden = true;
  wrap.append(preview);

  const writeMeta = (query: string) => {
    const searching = query.trim();
    let text = `Universe v${UNIVERSE_BUILD}`;
    if (!model.planets.length) text = 'No domains yet · Universe still has a sun';
    if (searching) {
      const hits = resolveSearchHits(model, query).size;
      text += hits
        ? ` · search “${searching}” · ${hits} match${hits === 1 ? '' : 'es'}`
        : ` · search “${searching}” · no matches`;
    }
    meta.textContent = text;
  };

  const applyChrome = () => {
    applyUniverseViewState(wrap, document.body, dark, fullscreen);
  };
  applyChrome();

  let mount: UniverseMount | null = mountUniverseView(stage, model, {
    search: '',
    onNoteSelect: (note) => {
      if (!note) {
        preview.hidden = true;
        preview.replaceChildren();
        return;
      }
      const task = tasks.find((item) => item.id === note.pageId) ?? null;
      showPreview(preview, task, projects, note.title, note.excerpt);
    },
    clock
  });

  bindUniverseView(wrap, {
    getDark: () => dark,
    getFullscreen: () => fullscreen,
    setDark: (on) => {
      dark = on;
      writeUniverseDark(on, typeof localStorage === 'undefined' ? null : localStorage);
      applyChrome();
    },
    setFullscreen: (on) => {
      fullscreen = on;
      applyChrome();
    }
  });

  const onKeydown = (event: KeyboardEvent) => {
    if (!shouldExitUniverseFullscreen(event.key, fullscreen)) return;
    event.preventDefault();
    event.stopPropagation();
    fullscreen = false;
    applyChrome();
  };
  document.addEventListener('keydown', onKeydown, true);

  search.input.addEventListener('input', () => {
    mount?.setSearch(search.input.value);
    writeMeta(search.input.value);
  });
  writeMeta('');

  const list = el('ul', 'viz-alt');
  list.setAttribute('aria-label', 'Universe bodies');
  for (const body of model.bodies) {
    if (body.kind === 'sun') continue;
    const item = el('li');
    const btn = el('button', 'btn btn--ghost', `${body.kind === 'page' ? 'task' : body.kind}: ${body.label}`);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (!body.pageId) {
        preview.hidden = true;
        return;
      }
      const task = tasks.find((item) => item.id === body.pageId) ?? null;
      showPreview(preview, task, projects, body.label, body.excerpt ?? '');
    });
    item.append(btn);
    list.append(item);
  }
  canvas.append(list);

  const cleanup = () => {
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('hashchange', cleanup);
    document.body.classList.remove('is-universe-fullscreen');
    mount?.();
    mount = null;
    if (lastUniverseCleanup === cleanup) lastUniverseCleanup = null;
  };
  lastUniverseCleanup = cleanup;
  window.addEventListener('hashchange', cleanup);
}

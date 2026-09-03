import {
  TASK_PROPERTY_LIST_KEYS,
  validateTaskPropertyConfig,
  type PropertyOption,
  type TaskPropertyConfig,
  type TaskPropertyListKey
} from '@/schemas/task-properties';
import { uniquePropertyId } from '@/domain/property-ids';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';
import { loadTaskProperties, saveTaskProperties } from '@/services/task-properties';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { createHubField, createHubToolbar, el } from '@/views/hub-kit';

const SECTION_META: Record<
  TaskPropertyListKey,
  { title: string; lede: string; color?: boolean }
> = {
  domains: {
    title: 'Domains',
    lede: 'Life and work areas. Colour the universe and drive Today’s adaptive focus.',
    color: true
  },
  priorities: {
    title: 'Urgency / priority',
    lede: 'How soon a task needs attention — urgent down to low.'
  },
  statuses: {
    title: 'Statuses',
    lede: 'Where a task sits on the board: open, in progress, done, deferred, or dead.'
  },
  kinds: {
    title: 'Kinds',
    lede: 'What the row is — a standalone task, or a step under one.'
  },
  buckets: {
    title: 'Buckets',
    lede: 'Active work versus someday / maybe.'
  },
  sources: {
    title: 'Sources',
    lede: 'How the item entered the hub — typed, excursion, or Clare.'
  },
  tags: {
    title: 'Tag vocabulary',
    lede: 'Extra labels for filtering. Separate from domain.'
  }
};

function cloneConfig(config: TaskPropertyConfig): TaskPropertyConfig {
  return structuredClone(config);
}

function lockedIdsFrom(config: TaskPropertyConfig): Record<TaskPropertyListKey, Set<string>> {
  return Object.fromEntries(
    TASK_PROPERTY_LIST_KEYS.map((key) => [key, new Set(config[key].map((entry) => entry.id))])
  ) as Record<TaskPropertyListKey, Set<string>>;
}

function moveOption(list: PropertyOption[], index: number, delta: number): PropertyOption[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  if (!item) return next;
  next.splice(target, 0, item);
  return next;
}

function usedIds(list: PropertyOption[], skipIndex?: number): string[] {
  return list.filter((_, index) => index !== skipIndex).map((entry) => entry.id);
}

export async function renderPropertiesView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let draft: TaskPropertyConfig;
  try {
    draft = cloneConfig(await loadTaskProperties(true));
  } catch (err) {
    renderLoadError(canvas, err, () => void renderPropertiesView(canvas), 'Could not load properties');
    return;
  }

  let lockedIds = lockedIdsFrom(draft);
  const statusHost = el('div', 'property-status');
  const sectionsHost = el('div', 'property-sections');

  const renderOptionRow = (
    section: TaskPropertyListKey,
    option: PropertyOption,
    index: number
  ): HTMLElement => {
    const meta = SECTION_META[section];
    const row = el('article', `task-row property-row${meta.color ? ' property-row--colour' : ''}`);

    const name = createHubField({
      ariaLabel: `${meta.title} name`,
      value: option.label,
      placeholder: 'Name'
    });
    name.input.addEventListener('input', () => {
      const current = draft[section][index];
      if (!current) return;
      const label = name.input.value;
      const id = lockedIds[section].has(current.id)
        ? current.id
        : uniquePropertyId(label, usedIds(draft[section], index));
      draft[section][index] = { ...current, label, id };
    });
    row.append(name.el);

    if (meta.color) {
      const color = createHubField({
        type: 'color',
        ariaLabel: `${meta.title} colour`,
        value: option.color ?? '#244f7c',
        className: 'property-swatch'
      });
      color.input.addEventListener('input', () => {
        const current = draft[section][index];
        if (!current) return;
        draft[section][index] = { ...current, color: color.input.value };
      });
      row.append(color.el);
    }

    const actions = el('div', 'property-row__actions');
    const up = el('button', 'btn btn--ghost property-row__move', '↑');
    up.type = 'button';
    up.title = 'Move up';
    up.setAttribute('aria-label', `Move ${option.label} up`);
    up.disabled = index === 0;
    up.addEventListener('click', () => {
      draft[section] = moveOption(draft[section], index, -1);
      paintSections();
    });

    const down = el('button', 'btn btn--ghost property-row__move', '↓');
    down.type = 'button';
    down.title = 'Move down';
    down.setAttribute('aria-label', `Move ${option.label} down`);
    down.disabled = index === draft[section].length - 1;
    down.addEventListener('click', () => {
      draft[section] = moveOption(draft[section], index, 1);
      paintSections();
    });

    const remove = el('button', 'btn btn--ghost', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (draft[section].length <= 1 && section !== 'tags') return;
      draft[section] = draft[section].filter((_, rowIndex) => rowIndex !== index);
      paintSections();
    });

    actions.append(up, down, remove);
    row.append(actions);
    return row;
  };

  const paintSections = () => {
    sectionsHost.replaceChildren();
    for (const section of TASK_PROPERTY_LIST_KEYS) {
      const block = el('section', 'property-section');
      const meta = SECTION_META[section];
      block.append(el('h2', 'section-title', meta.title));
      block.append(el('p', 'property-section__lede', meta.lede));

      const stack = el('div', 'task-stack property-stack');
      if (!draft[section].length) {
        stack.append(el('p', 'empty-state', 'No entries yet.'));
      } else {
        const head = el(
          'div',
          `property-list__head${meta.color ? ' property-list__head--colour' : ''}`
        );
        head.append(el('span', 'hub-field__label', 'Name'));
        if (meta.color) head.append(el('span', 'hub-field__label', 'Colour'));
        const actionsHead = el('span', 'hub-field__label', 'Actions');
        actionsHead.classList.add('property-list__head-actions');
        head.append(actionsHead);
        stack.append(head);
        for (let index = 0; index < draft[section].length; index++) {
          stack.append(renderOptionRow(section, draft[section][index]!, index));
        }
      }

      const add = el('button', 'btn btn--secondary', 'Add');
      add.type = 'button';
      add.addEventListener('click', () => {
        const label = section === 'tags' ? 'new tag' : 'new item';
        const id = uniquePropertyId(label, usedIds(draft[section]));
        draft[section] = [
          ...draft[section],
          { id, label, ...(meta.color ? { color: '#244f7c' } : {}) }
        ];
        statusHost.replaceChildren();
        paintSections();
      });

      block.append(stack, add);
      sectionsHost.append(block);
    }
  };

  canvas.replaceChildren();
  const toolbar = createHubToolbar('property-toolbar');
  const save = el('button', 'btn btn--primary', 'Save properties');
  save.type = 'button';
  const reset = el('button', 'btn btn--ghost', 'Reset to defaults');
  reset.type = 'button';

  save.addEventListener('click', () => {
    statusHost.replaceChildren();
    save.disabled = true;
    try {
      const parsed = validateTaskPropertyConfig(draft);
      void saveTaskProperties(parsed)
        .then((saved) => {
          draft = cloneConfig(saved);
          lockedIds = lockedIdsFrom(draft);
          paintSections();
          statusHost.append(el('p', 'empty-state', 'Saved.'));
        })
        .catch((err) => {
          statusHost.append(el('p', 'empty-state', errorMessage(err)));
        })
        .finally(() => {
          save.disabled = false;
        });
    } catch (err) {
      statusHost.append(el('p', 'empty-state', errorMessage(err)));
      save.disabled = false;
    }
  });

  reset.addEventListener('click', () => {
    draft = cloneConfig(DEFAULT_TASK_PROPERTY_CONFIG);
    lockedIds = lockedIdsFrom(draft);
    paintSections();
    statusHost.replaceChildren();
    statusHost.append(el('p', 'empty-state', 'Draft reset — click Save to persist.'));
  });

  toolbar.append(save, reset);
  canvas.append(toolbar, statusHost, sectionsHost);
  paintSections();
}

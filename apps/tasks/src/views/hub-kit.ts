import type { TaskDomain, TaskPriority } from '@/schemas/task';
import {
  createHubFilter,
  type HubFilterControl,
  type HubFilterOption
} from '../../design-kit/js/hub-filter-menu.js';
import { getTaskPropertiesSync, taskPropertyIds } from '@/services/task-properties';
import type { TaskPropertyListKey } from '@/schemas/task-properties';

export { createHubFilter };
export type { HubFilterControl, HubFilterOption };

/** @deprecated Use taskDomains() — values come from Tools → Properties. */
export function taskDomains(): string[] {
  return taskPropertyIds('domains');
}

/** @deprecated Use taskPriorities() — values come from Tools → Properties. */
export function taskPriorities(): string[] {
  return taskPropertyIds('priorities');
}

export const TASK_DOMAINS = taskDomains();
export const TASK_PRIORITIES = taskPriorities();

/** Kit filter button for lesson-engine / page editors (not a native select). */
export function createEditorFilter(options: {
  key: string;
  value: string;
  options: HubFilterOption[];
  className?: string;
  ariaLabel?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
}): HubFilterControl {
  const filter = createHubFilter({
    key: options.key,
    label: options.ariaLabel ?? options.key,
    value: options.value,
    defaultValue: options.defaultValue ?? '',
    options: options.options,
    onChange: options.onChange
  });
  if (options.className) {
    for (const name of options.className.split(/\s+/).filter(Boolean)) {
      filter.el.classList.add(name);
    }
  }
  return filter;
}

function classifierOptions(key: TaskPropertyListKey): HubFilterOption[] {
  const config = getTaskPropertiesSync();
  return config[key].map((entry) => ({ value: entry.id, label: entry.label }));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function optionList(
  values: readonly string[],
  all?: { value: string; label: string }
): HubFilterOption[] {
  const options = values.map((value) => ({ value, label: value }));
  return all ? [all, ...options] : options;
}

export function domainFilterOptions(includeAll = true): HubFilterOption[] {
  const options = classifierOptions('domains');
  return includeAll ? [{ value: 'all', label: 'All domains' }, ...options] : options;
}

export function priorityFilterOptions(includeAll = true): HubFilterOption[] {
  const options = classifierOptions('priorities');
  return includeAll ? [{ value: 'all', label: 'All priorities' }, ...options] : options;
}

export function statusFilterOptions(includeAll = false): HubFilterOption[] {
  const options = classifierOptions('statuses');
  return includeAll ? [{ value: 'all', label: 'All statuses' }, ...options] : options;
}

export function kindFilterOptions(): HubFilterOption[] {
  return classifierOptions('kinds');
}

export function bucketFilterOptions(): HubFilterOption[] {
  return classifierOptions('buckets');
}

export function sourceFilterOptions(): HubFilterOption[] {
  return classifierOptions('sources');
}

export function tagVocabularyOptions(): HubFilterOption[] {
  return classifierOptions('tags');
}

export type HubSearchOptions = {
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  value?: string;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  min?: string;
  step?: string;
  className?: string;
  inputClass?: string;
  onInput?: (value: string, input: HTMLInputElement) => void;
  onChange?: (value: string, input: HTMLInputElement) => void;
};

/** Kit search snippet: `label.hub-search` + `input.hub-search__input`. */
export function createHubSearch(options: HubSearchOptions = {}): {
  el: HTMLLabelElement;
  input: HTMLInputElement;
} {
  const extra = options.className ? ` ${options.className}` : '';
  const wrap = el('label', `hub-search${extra}`);
  const hidden = el('span', 'visually-hidden', options.label ?? options.ariaLabel ?? 'Search');
  const input = el('input', options.inputClass ?? 'hub-search__input') as HTMLInputElement;
  input.type = options.type ?? 'search';
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.value != null) input.value = options.value;
  input.setAttribute('aria-label', options.ariaLabel ?? options.label ?? 'Search');
  if (options.required) input.required = true;
  if (options.readOnly) input.readOnly = true;
  if (options.min != null) input.min = options.min;
  if (options.step != null) input.step = options.step;
  if (options.onInput) {
    input.addEventListener('input', () => options.onInput?.(input.value, input));
  }
  if (options.onChange) {
    input.addEventListener('change', () => options.onChange?.(input.value, input));
  }
  wrap.append(hidden, input);
  return { el: wrap, input };
}

/** Text / date / number field using the same kit chrome as search. */
export function createHubField(options: HubSearchOptions & { ariaLabel: string }): {
  el: HTMLLabelElement;
  input: HTMLInputElement;
} {
  return createHubSearch({ ...options, type: options.type ?? 'text' });
}

export function createHubTextarea(options: {
  ariaLabel: string;
  value?: string;
  rows?: number;
  className?: string;
  placeholder?: string;
}): { el: HTMLLabelElement; input: HTMLTextAreaElement } {
  const wrap = el('label', 'hub-search hub-search--multiline');
  const hidden = el('span', 'visually-hidden', options.ariaLabel);
  const notes = document.createElement('textarea');
  notes.className = ['hub-search__input', options.className].filter(Boolean).join(' ');
  notes.value = options.value ?? '';
  notes.rows = options.rows ?? 3;
  notes.setAttribute('aria-label', options.ariaLabel);
  if (options.placeholder) notes.placeholder = options.placeholder;
  wrap.append(hidden, notes);
  return { el: wrap, input: notes };
}

export function createHubToolbar(...classNames: string[]): HTMLElement {
  return el('div', ['hub-toolbar', ...classNames].filter(Boolean).join(' '));
}

export function createHubPills<T extends string>(options: {
  label: string;
  role?: 'tablist' | 'group';
  items: Array<{ id: T; label: string; extraClass?: string }>;
  value: T | readonly T[];
  onSelect: (id: T) => void;
}): HTMLElement {
  const pills = el('div', 'hub-pills');
  pills.setAttribute('role', options.role ?? 'group');
  pills.setAttribute('aria-label', options.label);
  const selected = new Set(
    typeof options.value === 'string' ? [options.value] : [...options.value]
  );
  const isTablist = options.role === 'tablist';
  for (const item of options.items) {
    const pressed = selected.has(item.id);
    const extra = item.extraClass ? ` ${item.extraClass}` : '';
    const btn = el('button', `hub-pills__btn${pressed ? ' is-active' : ''}${extra}`, item.label);
    btn.type = 'button';
    if (isTablist) {
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', pressed ? 'true' : 'false');
    } else {
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }
    btn.addEventListener('click', () => options.onSelect(item.id));
    pills.append(btn);
  }
  return pills;
}

export function labeledField(
  label: string,
  control: HTMLElement,
  className = 'hub-field'
): HTMLElement {
  const wrap = el('div', className);
  wrap.append(el('span', `${className}__label`, label), control);
  return wrap;
}

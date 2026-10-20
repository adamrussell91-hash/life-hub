import {
  createHubFilter,
  type HubFilterControl,
  type HubFilterOption
} from '../../design-kit/js/hub-filter-menu.js';

export type { HubFilterControl, HubFilterOption };

/**
 * A closed choice in a block editor: the kit filter pill, never a native
 * select (UI failure register I5). Teaching, Tasks and Professional share
 * these editors, so every hub shows the same control.
 */
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
  for (const name of (options.className ?? '').split(/\s+/).filter(Boolean)) {
    filter.el.classList.add(name);
  }
  return filter;
}

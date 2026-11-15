import { ICONS, button, el, icon } from '@/journal/story/dom';

export type StoryView = 'story' | 'photos' | 'keepsakes' | 'map';

export interface RibbonDay {
  /** Element id of the day section in the story. */
  id: string;
  number: number;
  /** Spoken label, e.g. "Day 3, Friday 5 March". */
  label: string;
  state: 'past' | 'today' | 'future';
}

export interface RibbonGroup {
  label: string;
  days: RibbonDay[];
}

export interface RibbonOptions {
  groups: RibbonGroup[];
  view: StoryView;
  /** Only these views are drawn. A view that is not built yet is never offered. */
  views: StoryView[];
  onDay: (id: string) => void;
  onView: (view: StoryView) => void;
  onOptions: () => void;
}

export interface RibbonHandle {
  el: HTMLElement;
  setCurrentDay(id: string | null): void;
  setView(view: StoryView): void;
}

const VIEW_META: Record<StoryView, { label: string; paths: string | string[] }> = {
  story: { label: 'Story', paths: ICONS.story },
  photos: { label: 'All photos', paths: ICONS.grid },
  keepsakes: { label: 'Keepsakes', paths: ICONS.keepsake },
  map: { label: 'Map', paths: ICONS.map },
};

/** Sticky strip under the cover: one button per day, and the view switch. */
export function renderRibbon(options: RibbonOptions): RibbonHandle {
  const bar = el('nav', 'story-ribbon');
  bar.setAttribute('aria-label', 'Days of the trip');
  bar.setAttribute('data-story-ribbon', '');

  const days = el('div', 'story-ribbon__days');
  const dayButtons = new Map<string, HTMLButtonElement>();
  options.groups.forEach((group, index) => {
    if (index > 0) {
      const link = el('span', 'story-ribbon__link');
      link.setAttribute('aria-hidden', 'true');
      days.append(link);
    }
    days.append(el('span', 'story-ribbon__leg', group.label));
    for (const day of group.days) {
      const btn = button(`story-ribbon__day num story-ribbon__day--${day.state}`, String(day.number));
      btn.setAttribute('aria-label', day.label);
      btn.setAttribute('data-story-day', day.id);
      btn.disabled = day.state === 'future';
      btn.addEventListener('click', () => options.onDay(day.id));
      dayButtons.set(day.id, btn);
      days.append(btn);
    }
  });

  const switcher = el('div', 'story-ribbon__views');
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'View');
  const viewButtons = new Map<StoryView, HTMLButtonElement>();
  for (const view of options.views) {
    const meta = VIEW_META[view];
    const btn = button('story-ribbon__view');
    btn.setAttribute('aria-label', meta.label);
    btn.setAttribute('data-story-view', view);
    btn.append(icon(meta.paths));
    btn.addEventListener('click', () => options.onView(view));
    viewButtons.set(view, btn);
    switcher.append(btn);
  }

  const more = button('story-ribbon__more');
  more.setAttribute('aria-label', 'Journal options');
  more.append(icon(ICONS.more));
  more.addEventListener('click', options.onOptions);

  bar.append(days);
  if (options.views.length > 1) bar.append(switcher);
  bar.append(more);

  let current: string | null = null;
  function setCurrentDay(id: string | null): void {
    if (id === current) return;
    current = id;
    for (const [dayId, btn] of dayButtons) {
      if (dayId === id) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    }
    const on = id ? dayButtons.get(id) : undefined;
    if (on && typeof days.scrollTo === 'function') {
      days.scrollTo({ left: on.offsetLeft - days.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' });
    }
  }

  function setView(view: StoryView): void {
    for (const [key, btn] of viewButtons) btn.setAttribute('aria-pressed', key === view ? 'true' : 'false');
  }
  setView(options.view);

  return { el: bar, setCurrentDay, setView };
}

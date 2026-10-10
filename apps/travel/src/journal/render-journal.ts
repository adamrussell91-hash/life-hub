import type { JournalFixture, JournalLeg, JournalTransition } from '@/journal/types';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { getPattern } from '@/journal/patterns/registry';
import { shouldShowDayMapPreview } from '@/journal/layout';
import { openChapterJump } from '@/journal/chapter-jump';
import { renderToolbar } from '@/journal/render-toolbar';
import { renderMomentArticle } from '@/journal/render-moment';

const LAST_VIEW_KEY = (tripId: string) => `lifehub.travel.journal.lastView.${tripId}`;

export interface RenderJournalOptions {
  fixture: JournalFixture;
  momentId?: string;
  patternOff?: boolean;
  onChapterJump?: (id: string) => void;
}

function transitionModeLabel(mode: JournalTransition['mode']): string {
  const map: Record<JournalTransition['mode'], string> = {
    flight: '✈',
    train: '🚆',
    car: '🚗',
    ferry: '⛴',
    other: '→',
  };
  return map[mode] ?? '→';
}

function renderTransition(trn: JournalTransition): HTMLElement {
  const block = document.createElement('div');
  block.className = 'journal-transition';
  block.setAttribute('data-journal-transition', trn.id);
  block.id = trn.id;

  const date = document.createElement('p');
  date.className = 'journal-transition__date num';
  if (trn.local_date) date.textContent = formatDisplayDate(trn.local_date);

  const mode = document.createElement('span');
  mode.className = 'journal-transition__mode';
  mode.setAttribute('aria-hidden', 'true');
  mode.textContent = transitionModeLabel(trn.mode);

  const route = document.createElement('p');
  route.className = 'journal-transition__route';
  const dep = trn.departure_label ?? 'Departure';
  const arr = trn.arrival_label ?? 'Arrival';
  route.textContent = `${dep} → ${arr}`;

  const details = document.createElement('button');
  details.type = 'button';
  details.className = 'btn btn--ghost journal-transition__details';
  details.textContent = 'View journey details';
  details.disabled = true;
  details.title = 'Coming in Phase 3';

  block.append(date, mode, route, details);
  return block;
}

function renderLegPattern(leg: JournalLeg, patternOff: boolean): HTMLElement | null {
  if (patternOff) return null;
  const pattern = getPattern(leg.pattern_id);
  if (!pattern) return null;
  const layer = document.createElement('div');
  layer.className = 'journal-leg__pattern';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--journal-pattern-url', `url("${pattern.href}")`);
  return layer;
}

function scrollToChapter(id: string, onChapterJump?: (id: string) => void): void {
  const target = document.getElementById(id);
  if (!target) return;
  const heading =
    target.querySelector<HTMLElement>('h2, h3, .journal-leg__title, .journal-day__date') ??
    target;
  heading.tabIndex = -1;
  target.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
  onChapterJump?.(id);
}

function persistLastView(tripId: string, momentId: string): void {
  try {
    localStorage.setItem(LAST_VIEW_KEY(tripId), momentId);
  } catch {
    /* ignore quota */
  }
}

export function renderJournal(
  canvas: HTMLElement,
  opts: RenderJournalOptions,
): { destroy(): void } {
  canvas.replaceChildren();
  const cleanups: Array<() => void> = [];

  const root = document.createElement('div');
  root.className = 'journal';
  if (opts.patternOff) root.classList.add('journal--pattern-off');

  let chapterOverlay: { destroy(): void } | null = null;

  const toolbar = renderToolbar({
    title: opts.fixture.title,
    onChapter: () => {
      chapterOverlay?.destroy();
      chapterOverlay = openChapterJump({
        fixture: opts.fixture,
        anchor: root,
        onSelect: (id) => {
          scrollToChapter(id, opts.onChapterJump);
        },
        onClose: () => {
          chapterOverlay = null;
        },
      });
      cleanups.push(() => chapterOverlay?.destroy());
    },
    onAddMoment: () => {
      /* Phase 1 stub — not a nav slot */
    },
  });

  const timeline = document.createElement('div');
  timeline.className = 'journal__timeline';
  timeline.setAttribute('data-journal-timeline', '');

  const story = document.createElement('div');
  story.className = 'journal__story';

  const legs = [...opts.fixture.legs].sort((a, b) => a.order - b.order);

  for (const leg of legs) {
    const legSection = document.createElement('section');
    legSection.className = 'journal-leg';
    legSection.setAttribute('data-journal-leg', leg.id);
    legSection.id = leg.id;

    const pattern = renderLegPattern(leg, Boolean(opts.patternOff));
    if (pattern) legSection.append(pattern);

    const title = document.createElement('h2');
    title.className = 'journal-leg__title';
    title.textContent = leg.destination;
    legSection.append(title);

    const days = opts.fixture.days
      .filter((d) => d.leg_id === leg.id)
      .sort((a, b) => a.local_date.localeCompare(b.local_date));

    for (const day of days) {
      const daySection = document.createElement('section');
      daySection.className = 'journal-day';
      daySection.setAttribute('data-journal-day', day.id);
      daySection.id = day.id;

      const dayHeading = document.createElement('h3');
      dayHeading.className = 'journal-day__date num';
      dayHeading.textContent = formatDisplayDate(day.local_date);
      daySection.append(dayHeading);

      const moments = opts.fixture.moments
        .filter((m) => m.leg_id === leg.id && m.local_date === day.local_date)
        .sort((a, b) => a.display_order - b.display_order);

      if (day.empty_marker && moments.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'journal-day__empty';
        empty.textContent = 'No moments this day yet.';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn btn--secondary journal-day__add';
        add.textContent = 'Add moment';
        add.disabled = true;
        add.title = 'Coming in Phase 3';
        daySection.append(empty, add);
      }

      const showMap = shouldShowDayMapPreview(moments);
      let mapShown = false;
      for (let i = 0; i < moments.length; i++) {
        const moment = moments[i]!;
        daySection.append(renderMomentArticle(opts.fixture, moment));

        const prev = moments[i - 1];
        if (prev?.coordinates && moment.coordinates) {
          const conn = document.createElement('div');
          conn.className = 'journal-connection';
          conn.setAttribute('data-journal-connection', '');
          conn.setAttribute('aria-hidden', 'true');
          daySection.append(conn);
        }

        if (showMap && !mapShown && moment.coordinates) {
          mapShown = true;
          const mapBtn = document.createElement('button');
          mapBtn.type = 'button';
          mapBtn.className = 'journal-day__map-preview';
          mapBtn.textContent = 'Open photo stops for this day';
          mapBtn.disabled = true;
          mapBtn.title = 'Coming in Phase 3';
          daySection.append(mapBtn);
        }
      }

      legSection.append(daySection);
    }

    story.append(legSection);

    const trn = opts.fixture.transitions.find((t) => t.from_leg_id === leg.id);
    if (trn) story.append(renderTransition(trn));
  }

  timeline.append(story);
  root.append(toolbar, timeline);
  canvas.append(root);

  const scrollId =
    opts.momentId ??
    (() => {
      try {
        return localStorage.getItem(LAST_VIEW_KEY(opts.fixture.trip_id)) ?? undefined;
      } catch {
        return undefined;
      }
    })();

  if (scrollId && document.getElementById(scrollId)) {
    requestAnimationFrame(() => scrollToChapter(scrollId));
    if (opts.fixture.moments.some((m) => m.id === scrollId)) {
      persistLastView(opts.fixture.trip_id, scrollId);
    }
  } else if (opts.fixture.moments[0]) {
    persistLastView(opts.fixture.trip_id, opts.fixture.moments[0].id);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
      if (!visible?.target.id) return;
      if (visible.target.hasAttribute('data-journal-moment')) {
        persistLastView(opts.fixture.trip_id, visible.target.id);
      }
    },
    { root: null, threshold: 0.4 },
  );
  for (const el of root.querySelectorAll('[data-journal-moment]')) {
    observer.observe(el);
  }
  cleanups.push(() => observer.disconnect());

  return {
    destroy() {
      for (const fn of cleanups) fn();
      chapterOverlay?.destroy();
      canvas.replaceChildren();
    },
  };
}

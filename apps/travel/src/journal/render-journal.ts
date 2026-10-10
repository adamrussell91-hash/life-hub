import type { JournalFixture, JournalLeg } from '@/journal/types';
import type { Trip } from '@/types';
import { renderJournalTransition, transitionForFromLeg } from '@/journal/transitions';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { prefersReducedMotion } from '../../design-kit/js/hub-motion.js';
import { getPattern } from '@/journal/patterns/registry';
import { shouldShowDayMapPreview } from '@/journal/layout';
import { openChapterJump } from '@/journal/chapter-jump';
import { journalImportChecksums } from '@/journal/import-review';
import { isJournalStoryEmpty, resolveCaptureContext } from '@/journal/capture-context';
import { openCaptureSheet } from '@/journal/capture-sheet';
import { openImportSheet } from '@/journal/import-sheet';
import { renderToolbar } from '@/journal/render-toolbar';
import type { JournalDocument } from '@/api/journal';
import { renderMomentArticle } from '@/journal/render-moment';
import { createDayMapPreview } from '@/journal/map-preview';
import { getActiveJournalDayMap } from '@/journal/map-expanded';
import { openTrashView } from '@/journal/trash-view';

const LAST_VIEW_KEY = (tripId: string) => `lifehub.travel.journal.lastView.${tripId}`;

export interface RenderJournalOptions {
  fixture: JournalFixture;
  momentId?: string;
  patternOff?: boolean;
  journalVersion?: string;
  /** Trip title when journal.title is still empty (live API journal). */
  displayTitle?: string;
  /** Trip itinerary for transition ticket links (optional in fixture preview). */
  trip?: Trip;
  onChapterJump?: (id: string) => void;
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

function scrollBehaviorFor(root: ParentNode): ScrollBehavior {
  return prefersReducedMotion(root) ? 'auto' : 'smooth';
}

function chapterEl(journalRoot: HTMLElement, id: string): HTMLElement | null {
  return (
    journalRoot.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? document.getElementById(id)
  );
}

function resolveEntranceTarget(journalRoot: HTMLElement, focusId?: string): HTMLElement | null {
  if (focusId) {
    const hinted = chapterEl(journalRoot, focusId);
    if (hinted) return hinted;
  }
  const view = journalRoot.ownerDocument?.defaultView;
  const viewH = view?.innerHeight ?? 800;
  const selectors = ['[data-journal-moment]', '[data-journal-day]', '[data-journal-leg]'];
  let best: HTMLElement | null = null;
  let bestTop = Infinity;
  let bestRank = 3;
  for (let rank = 0; rank < selectors.length; rank += 1) {
    const sel = selectors[rank]!;
    for (const el of journalRoot.querySelectorAll<HTMLElement>(sel)) {
      const { top, bottom } = el.getBoundingClientRect();
      if (bottom <= 0 || top >= viewH) continue;
      if (top < bestTop - 0.5 || (Math.abs(top - bestTop) < 0.5 && rank < bestRank)) {
        bestTop = top;
        bestRank = rank;
        best = el;
      }
    }
  }
  return (
    best ??
    journalRoot.querySelector<HTMLElement>(
      '[data-journal-moment], [data-journal-day], [data-journal-leg]',
    )
  );
}

function playJournalEntrance(journalRoot: HTMLElement, focusId?: string): void {
  if (prefersReducedMotion(journalRoot)) return;
  const target = resolveEntranceTarget(journalRoot, focusId);
  if (!target) return;
  target.classList.add('hub-reveal');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => target.classList.add('is-in'));
  });
}

function scrollToChapter(
  id: string,
  journalRoot: HTMLElement,
  onChapterJump?: (id: string) => void,
): void {
  const target = chapterEl(journalRoot, id);
  if (!target) return;
  const heading =
    target.querySelector<HTMLElement>('h2, h3, .journal-leg__title, .journal-day__date') ??
    target;
  heading.tabIndex = -1;
  target.scrollIntoView({ block: 'start', behavior: scrollBehaviorFor(journalRoot) });
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
  let importOverlay: { destroy(): void } | null = null;
  let captureOverlay: { destroy(): void } | null = null;
  let dayMapOverlay: { destroy(): void } | null = null;
  let trashOverlay: { destroy(): void } | null = null;

  let liveFixture: JournalFixture = opts.fixture;
  let liveVersion = opts.journalVersion ?? 'fixture';
  let liveTrip = opts.trip;
  const journalDoc = () => liveFixture as JournalDocument;
  const legsById = () => new Map(liveFixture.legs.map((leg) => [leg.id, leg]));
  const toolbarTitle = () =>
    opts.displayTitle?.trim() || liveFixture.title.trim() || 'Your trip';

  function onJournalSaved(envelope: { journal: JournalDocument; version: string }): void {
    liveFixture = envelope.journal;
    liveVersion = envelope.version;
    rebuildStory();
  }

  function momentCtx(): import('@/journal/render-moment').RenderMomentContext {
    return {
      fixture: liveFixture,
      journal: journalDoc(),
      tripId: liveFixture.trip_id,
      version: liveVersion,
      anchor: root,
      onJournalSaved,
    };
  }

  function openImport(initialFiles?: File[]): void {
    importOverlay?.destroy();
    const { knownChecksums, deletedChecksums } = journalImportChecksums(liveFixture);
    importOverlay = openImportSheet({
      fixture: liveFixture,
      knownChecksums,
      deletedChecksums,
      journalVersion: opts.journalVersion,
      anchor: root,
      initialFiles,
      onClose: () => {
        importOverlay = null;
      },
    });
    cleanups.push(() => importOverlay?.destroy());
  }

  function openCapture(dayId?: string): void {
    const ctx = resolveCaptureContext(liveFixture, dayId);
    if (!ctx) return;
    captureOverlay?.destroy();
    captureOverlay = openCaptureSheet({
      tripId: liveFixture.trip_id,
      legId: ctx.legId,
      localDate: ctx.localDate,
      journal: journalDoc(),
      tripTitle: toolbarTitle(),
      version: liveVersion,
      anchor: root,
      onImportPhotos: (files) => openImport(files),
      onClose: () => {
        captureOverlay = null;
      },
      onSaved: () => {
        captureOverlay = null;
      },
    });
    cleanups.push(() => captureOverlay?.destroy());
  }

  const toolbar = renderToolbar({
    title: toolbarTitle(),
    onAddMoment: () => openCapture(),
    onImportPhotos: () => {
      openImport();
    },
    onTrash: () => {
      trashOverlay?.destroy();
      trashOverlay = openTrashView({
        tripId: liveFixture.trip_id,
        journal: journalDoc(),
        version: liveVersion,
        anchor: root,
        onSaved: onJournalSaved,
        onClose: () => {
          trashOverlay = null;
        },
      });
      cleanups.push(() => trashOverlay?.destroy());
    },
    onChapter: () => {
      chapterOverlay?.destroy();
      chapterOverlay = openChapterJump({
        fixture: liveFixture,
        anchor: root,
        onSelect: (id) => {
          scrollToChapter(id, root, opts.onChapterJump);
        },
        onClose: () => {
          chapterOverlay = null;
        },
      });
      cleanups.push(() => chapterOverlay?.destroy());
    },
  });

  const timeline = document.createElement('div');
  timeline.className = 'journal__timeline';
  timeline.setAttribute('data-journal-timeline', '');

  const story = document.createElement('div');
  story.className = 'journal__story';

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
      if (!visible?.target.id) return;
      if (visible.target.hasAttribute('data-journal-moment')) {
        persistLastView(liveFixture.trip_id, visible.target.id);
      }
    },
    { root: null, threshold: 0.4 },
  );

  function rebuildStory(): void {
    story.replaceChildren();
    paintStoryInto(story);
    for (const el of story.querySelectorAll('[data-journal-moment]')) {
      observer.observe(el);
    }
  }

  function paintStoryInto(host: HTMLElement): void {
    const storyEmpty = isJournalStoryEmpty(liveFixture);

    if (storyEmpty) {
    const empty = document.createElement('div');
    empty.className = 'journal-empty';
    empty.setAttribute('data-journal-empty', '');

    const lead = document.createElement('p');
    lead.className = 'journal-empty__lead';
    lead.textContent = 'Your story starts here — add photos or capture a moment.';

    const actions = document.createElement('div');
    actions.className = 'journal-empty__actions';

    const photosBtn = document.createElement('button');
    photosBtn.type = 'button';
    photosBtn.className = 'btn btn--secondary journal-empty__photos';
    photosBtn.textContent = 'Add photos';
    photosBtn.addEventListener('click', () => openImport());

    const momentBtn = document.createElement('button');
    momentBtn.type = 'button';
    momentBtn.className = 'btn btn--primary journal-empty__moment';
    momentBtn.textContent = 'Add moment';
    momentBtn.addEventListener('click', () => openCapture());

    actions.append(photosBtn, momentBtn);
    empty.append(lead, actions);
      host.append(empty);
      return;
    }

    const legs = [...liveFixture.legs]
      .filter((l) => l.lifecycle === 'live')
      .sort((a, b) => a.order - b.order);

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

    const days = liveFixture.days
      .filter((d) => d.leg_id === leg.id && d.lifecycle === 'live')
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

      const moments = liveFixture.moments
        .filter(
          (m) =>
            m.lifecycle === 'live' &&
            m.leg_id === leg.id &&
            m.local_date === day.local_date,
        )
        .sort((a, b) => a.display_order - b.display_order);

      if (day.empty_marker && moments.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'journal-day__empty';
        empty.textContent = 'No moments this day yet.';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn btn--secondary journal-day__add';
        add.textContent = 'Add moment';
        add.setAttribute('aria-label', 'Add moment');
        add.addEventListener('click', () => openCapture(day.id));
        daySection.append(empty, add);
      }

      for (let i = 0; i < moments.length; i++) {
        const moment = moments[i]!;
        daySection.append(renderMomentArticle(liveFixture, moment, momentCtx()));

        const prev = moments[i - 1];
        if (prev?.coordinates && moment.coordinates) {
          const conn = document.createElement('div');
          conn.className = 'journal-connection';
          conn.setAttribute('data-journal-connection', '');
          conn.setAttribute('aria-hidden', 'true');
          daySection.append(conn);
        }
      }

      if (shouldShowDayMapPreview(moments)) {
        daySection.append(
          createDayMapPreview({
            moments,
            dayId: day.id,
            localDate: day.local_date,
            anchor: root,
            onOpen: (handle) => {
              dayMapOverlay?.destroy();
              dayMapOverlay = handle;
            },
            onClose: () => {
              dayMapOverlay = null;
            },
          }),
        );
      }

      legSection.append(daySection);
    }

      host.append(legSection);

      const trn = transitionForFromLeg(liveFixture, leg.id);
      if (trn) {
        host.append(
          renderJournalTransition({
            trn,
            tripId: liveFixture.trip_id,
            ctx: { legsById: legsById(), trip: liveTrip },
            journal: journalDoc(),
            version: liveVersion,
            anchor: root,
            onJournalSaved: (envelope) => {
              liveFixture = envelope.journal;
              liveVersion = envelope.version;
              rebuildStory();
            },
          }),
        );
      }
    }
  }

  paintStoryInto(story);

  timeline.append(story);
  root.append(toolbar, timeline);
  canvas.append(root);

  cleanups.push(() => {
    dayMapOverlay?.destroy();
    getActiveJournalDayMap()?.destroy();
  });

  const scrollId =
    opts.momentId ??
    (() => {
      try {
        return localStorage.getItem(LAST_VIEW_KEY(liveFixture.trip_id)) ?? undefined;
      } catch {
        return undefined;
      }
    })();

  if (scrollId && chapterEl(root, scrollId)) {
    requestAnimationFrame(() => {
      scrollToChapter(scrollId, root);
      playJournalEntrance(root, scrollId);
    });
    if (liveFixture.moments.some((m) => m.id === scrollId)) {
      persistLastView(liveFixture.trip_id, scrollId);
    }
  } else {
    if (liveFixture.moments[0]) {
      persistLastView(liveFixture.trip_id, liveFixture.moments[0].id);
    }
    requestAnimationFrame(() => playJournalEntrance(root));
  }

  for (const el of root.querySelectorAll('[data-journal-moment]')) {
    observer.observe(el);
  }
  cleanups.push(() => observer.disconnect());

  return {
    destroy() {
      for (const fn of cleanups) fn();
      chapterOverlay?.destroy();
      importOverlay?.destroy();
      captureOverlay?.destroy();
      canvas.replaceChildren();
    },
  };
}

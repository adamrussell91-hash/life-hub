import type { JournalDay, JournalFixture, JournalLeg, JournalMedia, JournalMoment } from '@/journal/types';
import type { Trip } from '@/types';
import type { JournalDocument, JournalEnvelope } from '@/api/journal';
import { tripRoute } from '@/app/router';
import { prefersReducedMotion } from '../../design-kit/js/hub-motion.js';
import { getPattern } from '@/journal/patterns/registry';
import { shouldShowDayMapPreview } from '@/journal/layout';
import { journalImportChecksums } from '@/journal/import-review';
import { isJournalStoryEmpty, resolveCaptureContext } from '@/journal/capture-context';
import { openCaptureSheet } from '@/journal/capture-sheet';
import { openImportSheet } from '@/journal/import-sheet';
import { mountJournalOfflineStatus } from '@/journal/offline-status';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { onJournalSynced } from '@/journal/journal-outbox';
import { isFixtureVersion, persistJournalPatch } from '@/journal/journal-sheet-save';
import { createDayMapPreview } from '@/journal/map-preview';
import { getActiveJournalDayMap } from '@/journal/map-expanded';
import { openTrashView } from '@/journal/trash-view';
import { openJournalSearch } from '@/journal/search-sheet';
import { openJournalShareSheet } from '@/journal/share-sheet';
import { runMomentAction, type MomentActionContext } from '@/journal/moment-actions';
import { transitionForFromLeg } from '@/journal/transitions';
import {
  filterMomentsForPerspectiveDisplay,
  journalHasPartnerMoments,
  readPartnerPerspectiveVisible,
  writePartnerPerspectiveVisible,
} from '@/journal/partner-perspective';
import { downloadJournalExportBundle, stripJournalForExport } from '@/journal/export-bundle';
import { openJournalPrintEdition } from '@/journal/print-edition';
import {
  JOURNAL_MOMENT_PAGE_SIZE,
  attachMomentPrefetchObserver,
  computeInitialMomentWindow,
  expandMomentWindowEarlier,
  expandMomentWindowLater,
  orderedLiveMoments,
  visibleMomentIdSet,
  type MomentWindow,
} from '@/journal/media-loading';
import { isAudioMedia } from '@/journal/transcripts';
import {
  clock12,
  coverEyebrow,
  dayNumber,
  longDate,
  shortDateRange,
  tripPhase,
} from '@/journal/trip-days';
import { sunsetLocal } from '@/lib/sun';
import { stitchLabel } from '@/lib/distance';
import { openPhotoViewer, tripPhotos, type TripPhoto } from '@/journal/photo-viewer';
import { renderPhotosView } from '@/journal/photos-view';
import { renderCover } from '@/journal/story/cover';
import { renderRibbon, type RibbonGroup, type RibbonHandle, type StoryView } from '@/journal/story/ribbon';
import { renderChapterOpener } from '@/journal/story/chapter-opener';
import { renderDayHeader } from '@/journal/story/day-header';
import { renderMomentCard } from '@/journal/story/moment-card';
import { renderJourneyBand } from '@/journal/story/journey-band';
import { openMomentActionSheet } from '@/journal/story/action-sheet';
import { openJournalOptionsSheet, type JournalOption } from '@/journal/story/options-sheet';
import { mountDock, type DockHandle } from '@/journal/story/dock';
import { ICONS, button, el } from '@/journal/story/dom';

const LAST_VIEW_KEY = (tripId: string) => `lifehub.travel.journal.lastView.${tripId}`;
/** Views that are built. Keepsakes joins when it ships; nothing is offered before it works. */
const STORY_VIEWS: StoryView[] = ['story', 'photos'];
export const COVER_PREF_KEY = 'cover_media_id';

export interface RenderJournalOptions {
  fixture: JournalFixture;
  momentId?: string;
  patternOff?: boolean;
  journalVersion?: string;
  /** Trip title when journal.title is still empty (live API journal). */
  displayTitle?: string;
  /** Trip itinerary: dates, cities and tickets (optional in fixture preview). */
  trip?: Trip;
  onChapterJump?: (id: string) => void;
  /** "Refresh" in the options sheet. Omitted where there is nothing to reload. */
  onRefresh?: () => void;
  /** Today's date for tests. Defaults to the phone's date in each city's time zone. */
  today?: string;
}

function scrollBehaviorFor(root: ParentNode): ScrollBehavior {
  return prefersReducedMotion(root) ? 'auto' : 'smooth';
}

function chapterEl(journalRoot: HTMLElement, id: string): HTMLElement | null {
  return journalRoot.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? document.getElementById(id);
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
    for (const node of journalRoot.querySelectorAll<HTMLElement>(sel)) {
      const { top, bottom } = node.getBoundingClientRect();
      if (bottom <= 0 || top >= viewH) continue;
      if (top < bestTop - 0.5 || (Math.abs(top - bestTop) < 0.5 && rank < bestRank)) {
        bestTop = top;
        bestRank = rank;
        best = node;
      }
    }
  }
  return (
    best ??
    journalRoot.querySelector<HTMLElement>('[data-journal-moment], [data-journal-day], [data-journal-leg]')
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

function scrollToChapter(id: string, journalRoot: HTMLElement, onChapterJump?: (id: string) => void): void {
  const target = chapterEl(journalRoot, id);
  if (!target) return;
  const heading =
    target.querySelector<HTMLElement>('h2, h3') ?? target;
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

/** The date right now in a time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(),
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export interface JournalViewHandle {
  destroy(): void;
  /** Merge server journal without remounting sheets or resetting scroll. */
  reconcile(envelope: JournalEnvelope): void;
}

export function renderJournal(canvas: HTMLElement, opts: RenderJournalOptions): JournalViewHandle {
  canvas.replaceChildren();
  const cleanups: Array<() => void> = [];

  const root = el('div', 'journal story');
  if (opts.patternOff) root.classList.add('journal--pattern-off');

  const overlays: Record<string, { destroy(): void } | null> = {};
  const swap = (key: string, next: { destroy(): void } | null): void => {
    overlays[key]?.destroy();
    overlays[key] = next;
  };

  let liveFixture: JournalFixture = opts.fixture;
  let liveVersion = opts.journalVersion ?? 'fixture';
  const liveTrip = opts.trip;
  let view: StoryView = 'story';
  const journalDoc = () => liveFixture as JournalDocument;
  const legsById = () => new Map(liveFixture.legs.map((leg) => [leg.id, leg]));
  const title = () => opts.displayTitle?.trim() || liveFixture.title.trim() || 'Your trip';
  const canSave = () => !isFixtureVersion(liveVersion);

  function onJournalSaved(envelope: { journal: JournalDocument; version: string }): void {
    liveFixture = envelope.journal;
    liveVersion = envelope.version;
    rebuild(true);
  }

  function actionContext(): MomentActionContext {
    return {
      fixture: liveFixture,
      journal: journalDoc(),
      tripId: liveFixture.trip_id,
      version: liveVersion,
      anchor: root,
      trip: liveTrip,
      onJournalSaved,
    };
  }

  // ---- Trip facts ----------------------------------------------------------

  const liveLegs = (): JournalLeg[] =>
    [...liveFixture.legs].filter((l) => l.lifecycle === 'live').sort((a, b) => a.order - b.order);
  const legDays = (leg: JournalLeg): JournalDay[] =>
    liveFixture.days
      .filter((d) => d.leg_id === leg.id && d.lifecycle === 'live')
      .sort((a, b) => a.local_date.localeCompare(b.local_date));
  const cityOf = (leg: JournalLeg) => liveTrip?.cities.find((c) => c.id === leg.city_id);
  const tripStart = (): string => {
    if (liveTrip?.start_date) return liveTrip.start_date;
    const dates = liveFixture.days.filter((d) => d.lifecycle === 'live').map((d) => d.local_date).sort();
    return dates[0] ?? '';
  };
  const dayNo = (localDate: string): number => (tripStart() ? dayNumber(tripStart(), localDate) : 0);
  const todayFor = (leg: JournalLeg): string => opts.today ?? todayIn(leg.timezone || 'UTC');

  // ---- Sheets that add to the journal -------------------------------------

  function openImport(initialFiles?: File[]): void {
    const { knownChecksums, deletedChecksums } = journalImportChecksums(liveFixture);
    swap(
      'import',
      openImportSheet({
        fixture: liveFixture,
        knownChecksums,
        deletedChecksums,
        journal: journalDoc(),
        version: liveVersion,
        tripTitle: title(),
        anchor: root,
        initialFiles,
        onSaved: onJournalSaved,
        onClose: () => {
          overlays.import = null;
        },
      }),
    );
  }

  function openCapture(dayId?: string): void {
    const ctx = resolveCaptureContext(liveFixture, dayId);
    if (!ctx) return;
    swap(
      'capture',
      openCaptureSheet({
        tripId: liveFixture.trip_id,
        legId: ctx.legId,
        localDate: ctx.localDate,
        journal: journalDoc(),
        tripTitle: title(),
        version: liveVersion,
        anchor: root,
        onImportPhotos: (files) => openImport(files),
        onClose: () => {
          overlays.capture = null;
        },
        onSaved: (envelope) => {
          overlays.capture = null;
          onJournalSaved(envelope);
        },
      }),
    );
  }

  function openSearch(): void {
    swap(
      'search',
      openJournalSearch({
        journal: journalDoc(),
        anchor: root,
        onSelect: (id) => {
          setView('story');
          scrollToChapter(id, root, opts.onChapterJump);
        },
        onClose: () => {
          overlays.search = null;
        },
      }),
    );
  }

  // ---- Partner's lines, pagination ----------------------------------------

  let showPartnerPerspective = readPartnerPerspectiveVisible(liveFixture.trip_id);
  const orderedMomentsForView = (): JournalMoment[] =>
    filterMomentsForPerspectiveDisplay(orderedLiveMoments(liveFixture), showPartnerPerspective);

  let detachPrefetch: (() => void) | null = null;
  let momentWindow: MomentWindow = { start: 0, end: 0 };
  let orderedMoments = orderedMomentsForView();
  let visibleMomentIds = new Set<string>();
  let photos: TripPhoto[] = [];
  let photoIndex = new Map<string, number>();

  function indexPhotos(): void {
    photos = tripPhotos(liveFixture, orderedMoments, (m) => dayNo(m.local_date));
    photoIndex = new Map(photos.map((p, i) => [`${p.moment.id}|${p.media.id}`, i]));
  }

  function applyMomentWindow(focusMomentId?: string): void {
    orderedMoments = orderedMomentsForView();
    const focusIndex = focusMomentId !== undefined ? orderedMoments.findIndex((m) => m.id === focusMomentId) : -1;
    momentWindow = computeInitialMomentWindow(orderedMoments.length, focusIndex >= 0 ? focusIndex : undefined);
    visibleMomentIds = visibleMomentIdSet(orderedMoments, momentWindow);
    indexPhotos();
  }

  function refreshMomentWindow(): void {
    orderedMoments = orderedMomentsForView();
    momentWindow = {
      start: Math.min(momentWindow.start, orderedMoments.length),
      end: Math.min(Math.max(momentWindow.end, momentWindow.start), orderedMoments.length),
    };
    if (momentWindow.end === momentWindow.start && orderedMoments.length > 0) {
      momentWindow.end = Math.min(orderedMoments.length, JOURNAL_MOMENT_PAGE_SIZE);
    }
    visibleMomentIds = visibleMomentIdSet(orderedMoments, momentWindow);
    indexPhotos();
  }

  applyMomentWindow(opts.momentId);

  // ---- Options sheet -------------------------------------------------------

  function openOptions(): void {
    const items: JournalOption[] = [{ label: 'Search journal', paths: ICONS.search, onSelect: openSearch }];
    if (journalHasPartnerMoments(journalDoc())) {
      items.push({
        label: showPartnerPerspective ? 'Hide Partner’s lines' : 'Show Partner’s lines',
        paths: ICONS.people,
        onSelect: () => {
          showPartnerPerspective = !showPartnerPerspective;
          writePartnerPerspectiveVisible(liveFixture.trip_id, showPartnerPerspective);
          rebuild(true);
        },
      });
    }
    items.push(
      {
        label: 'Print',
        paths: ICONS.print,
        onSelect: () =>
          openJournalPrintEdition(stripJournalForExport(journalDoc()), {
            tripId: liveFixture.trip_id,
            title: title(),
            showPartnerPerspective,
          }),
      },
      {
        label: 'Export',
        hint: 'A copy of the whole journal to keep',
        paths: ICONS.export,
        onSelect: () => void downloadJournalExportBundle(stripJournalForExport(journalDoc())),
      },
      {
        label: 'Share',
        paths: ICONS.share,
        onSelect: () =>
          swap(
            'share',
            openJournalShareSheet({
              tripId: liveFixture.trip_id,
              journal: journalDoc(),
              anchor: root,
              onClose: () => {
                overlays.share = null;
              },
            }),
          ),
      },
      {
        label: 'Trash',
        paths: ICONS.trash,
        onSelect: () =>
          swap(
            'trash',
            openTrashView({
              tripId: liveFixture.trip_id,
              journal: journalDoc(),
              version: liveVersion,
              anchor: root,
              onSaved: onJournalSaved,
              onClose: () => {
                overlays.trash = null;
              },
            }),
          ),
      },
    );
    if (opts.onRefresh) items.push({ label: 'Refresh', paths: ICONS.refresh, onSelect: opts.onRefresh });
    swap('options', openJournalOptionsSheet({ anchor: root, title: title(), items, onClose: () => (overlays.options = null) }));
  }

  // ---- Cover ---------------------------------------------------------------

  function coverPhoto(): JournalMedia | undefined {
    const preferred = journalDoc().preferences?.[COVER_PREF_KEY];
    if (typeof preferred === 'string') {
      const media = liveFixture.media.find((m) => m.id === preferred && m.lifecycle === 'live' && !isAudioMedia(m));
      if (media) return media;
    }
    return photos[0]?.media;
  }

  function useAsCover(media: JournalMedia): void {
    if (!canSave()) return;
    const next: JournalDocument = {
      ...journalDoc(),
      revision: journalDoc().revision + 1,
      preferences: { ...(journalDoc().preferences ?? {}), [COVER_PREF_KEY]: media.id },
    };
    void persistJournalPatch(liveFixture.trip_id, liveVersion, next).then(onJournalSaved, () => undefined);
  }

  function buildCover(): HTMLElement {
    const legs = liveLegs();
    const journaledDays = new Set(orderedMoments.map((m) => `${m.leg_id}|${m.local_date}`)).size;
    let eyebrow = 'Journal';
    let dates = '';
    if (liveTrip?.start_date && liveTrip.end_date) {
      const zone = legs[0]?.timezone || liveTrip.home_tz || 'UTC';
      eyebrow = coverEyebrow(tripPhase(liveTrip.start_date, liveTrip.end_date, opts.today ?? todayIn(zone)));
      dates = `${shortDateRange(liveTrip.start_date, liveTrip.end_date)} ${liveTrip.end_date.slice(0, 4)}`;
    }
    const photo = coverPhoto();
    return renderCover({
      title: title(),
      dates,
      eyebrow,
      stats: [
        journaledDays ? plural(journaledDays, 'day') : '',
        legs.length ? plural(legs.length, 'city', 'cities') : '',
        photos.length ? plural(photos.length, 'photo') : '',
      ],
      photo: photo ? { tripId: liveFixture.trip_id, media: photo } : undefined,
      accent: legs[0] ? cityOf(legs[0])?.accent.color : undefined,
      backHref: tripRoute(liveFixture.trip_id),
      onSearch: openSearch,
      onOptions: openOptions,
    });
  }

  // ---- Ribbon --------------------------------------------------------------

  function ribbonGroups(): RibbonGroup[] {
    const withMoments = new Set(orderedMoments.map((m) => `${m.leg_id}|${m.local_date}`));
    return liveLegs()
      .map((leg) => {
        const today = todayFor(leg);
        return {
          label: leg.destination,
          days: legDays(leg).map((day) => {
            const n = dayNo(day.local_date);
            const state: 'past' | 'today' | 'future' =
              day.local_date === today
                ? 'today'
                : day.local_date > today && !withMoments.has(`${leg.id}|${day.local_date}`)
                  ? 'future'
                  : 'past';
            return { id: day.id, number: n, label: `Day ${n}, ${longDate(day.local_date)}`, state };
          }),
        };
      })
      .filter((group) => group.days.length > 0);
  }

  let ribbon: RibbonHandle;
  const ribbonHost = el('div', 'story-ribbon-host');
  function buildRibbon(): void {
    ribbon = renderRibbon({
      groups: ribbonGroups(),
      view,
      views: STORY_VIEWS,
      onDay: (id) => {
        if (view !== 'story') setView('story');
        scrollToChapter(id, root, opts.onChapterJump);
      },
      onView: setView,
      onOptions: openOptions,
    });
    ribbonHost.replaceChildren(ribbon.el);
  }

  // ---- Story ---------------------------------------------------------------

  const coverHost = el('div', 'story-cover-host');
  const timeline = el('div', 'journal__timeline');
  timeline.setAttribute('data-journal-timeline', '');
  const story = el('div', 'journal__story');
  timeline.append(story);

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

  function paginationButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = button('btn btn--secondary journal__page-btn', label);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function paintEmpty(host: HTMLElement): void {
    const empty = el('div', 'journal-empty story-empty-journal');
    empty.setAttribute('data-journal-empty', '');
    empty.append(el('p', 'journal-empty__lead', 'Your story starts here. Add photos or write a moment.'));
    const actions = el('div', 'journal-empty__actions');
    const photosBtn = button('btn btn--primary journal-empty__photos', 'Add photos');
    photosBtn.addEventListener('click', () => openImport());
    const momentBtn = button('btn btn--secondary journal-empty__moment', 'Add moment');
    momentBtn.addEventListener('click', () => openCapture());
    actions.append(photosBtn, momentBtn);
    empty.append(actions);
    host.append(empty);
  }

  function paintStory(host: HTMLElement): void {
    if (isJournalStoryEmpty(liveFixture)) {
      paintEmpty(host);
      return;
    }

    const hiddenBefore = momentWindow.start;
    const hiddenAfter = orderedMoments.length - momentWindow.end;
    if (hiddenBefore > 0) {
      const wrap = el('div', 'journal__page-actions journal__page-actions--earlier');
      wrap.append(
        paginationButton(`Load earlier (${Math.min(hiddenBefore, JOURNAL_MOMENT_PAGE_SIZE)} more)`, () => {
          const anchor = host.querySelector<HTMLElement>('[data-journal-moment]');
          const anchorTop = anchor?.getBoundingClientRect().top ?? 0;
          const anchorId = anchor?.id;
          momentWindow = expandMomentWindowEarlier(momentWindow);
          visibleMomentIds = visibleMomentIdSet(orderedMoments, momentWindow);
          rebuild();
          requestAnimationFrame(() => {
            if (!anchorId) return;
            const node = document.getElementById(anchorId);
            if (!node) return;
            host.ownerDocument?.defaultView?.scrollBy(0, node.getBoundingClientRect().top - anchorTop);
          });
        }),
      );
      host.append(wrap);
    }

    const firstVisibleId = orderedMoments[momentWindow.start]?.id;

    liveLegs().forEach((leg, legIndex) => {
      const legSection = el('section', 'journal-leg story-leg');
      legSection.setAttribute('data-journal-leg', leg.id);
      legSection.id = leg.id;

      const days = legDays(leg);
      const legMoments = orderedMoments.filter((m) => m.leg_id === leg.id);
      const pattern = opts.patternOff ? null : getPattern(leg.pattern_id);
      const range = leg.start_date ? shortDateRange(leg.start_date, leg.end_date ?? leg.start_date) : '';
      legSection.append(
        renderChapterOpener({
          number: legIndex + 1,
          name: leg.destination,
          dateRange: range,
          counts: [
            days.length ? plural(days.length, 'day') : '',
            legMoments.length ? plural(legMoments.length, 'moment') : '',
          ]
            .filter(Boolean)
            .join(' · '),
          patternHref: pattern?.href ?? null,
          accentSoft: cityOf(leg)?.accent.soft,
        }),
      );

      const today = todayFor(leg);
      const city = cityOf(leg);

      for (const day of days) {
        const daySection = el('section', 'journal-day story-day-section');
        daySection.setAttribute('data-journal-day', day.id);
        daySection.id = day.id;

        const moments = legMoments.filter((m) => m.local_date === day.local_date);
        const sunset = city?.center
          ? sunsetLocal(city.center.lat, city.center.lon, day.local_date, leg.timezone || city.tz)
          : null;
        daySection.append(
          renderDayHeader({
            number: dayNo(day.local_date),
            date: longDate(day.local_date),
            isToday: day.local_date === today,
            facts: [moments.length ? plural(moments.length, 'moment') : '', sunset ? `sunset ${clock12(sunset)}` : ''],
          }),
        );

        if (shouldShowDayMapPreview(moments)) {
          daySection.append(
            createDayMapPreview({
              moments,
              dayId: day.id,
              localDate: day.local_date,
              anchor: root,
              onOpen: (handle) => swap('dayMap', handle),
              onClose: () => {
                overlays.dayMap = null;
              },
            }),
          );
        }

        if (moments.length === 0) {
          const empty = el('div', 'story-day-empty');
          empty.append(el('p', 'journal-day__empty', 'Nothing from this day yet.'));
          const add = button('btn btn--secondary journal-day__add', 'Add moment');
          add.addEventListener('click', () => openCapture(day.id));
          empty.append(add);
          daySection.append(empty);
        }

        let previous: JournalMoment | undefined;
        for (const moment of moments) {
          if (!visibleMomentIds.has(moment.id)) continue;
          if (previous) {
            const label = stitchLabel(previous, moment);
            if (label) {
              const stitch = el('p', 'story-stitch num', label);
              stitch.setAttribute('data-journal-connection', '');
              daySection.append(stitch);
            }
          }
          daySection.append(
            renderMomentCard({
              fixture: liveFixture,
              moment,
              tripId: liveFixture.trip_id,
              photoIndexOf: (mediaId) => photoIndex.get(`${moment.id}|${mediaId}`) ?? -1,
              eager: moment.id === firstVisibleId,
              onActions: (m) =>
                swap(
                  'actions',
                  openMomentActionSheet({
                    fixture: liveFixture,
                    moment: m,
                    anchor: root,
                    onAction: (action) => swap('momentSheet', runMomentAction(action, m, actionContext())),
                    onClose: () => {
                      overlays.actions = null;
                    },
                  }),
                ),
              onMeal: (m) => swap('momentSheet', runMomentAction('edit', m, actionContext())),
            }),
          );
          previous = moment;
        }

        legSection.append(daySection);
      }

      host.append(legSection);

      const trn = transitionForFromLeg(liveFixture, leg.id);
      if (trn) {
        host.append(
          renderJourneyBand({
            trn,
            tripId: liveFixture.trip_id,
            ctx: { legsById: legsById(), trip: liveTrip },
            journal: canSave() ? journalDoc() : undefined,
            version: canSave() ? liveVersion : undefined,
            anchor: root,
            onJournalSaved,
          }),
        );
      }
    });

    if (hiddenAfter > 0) {
      const wrap = el('div', 'journal__page-actions journal__page-actions--later');
      wrap.append(
        paginationButton(`Load more (${Math.min(hiddenAfter, JOURNAL_MOMENT_PAGE_SIZE)} more)`, () => {
          momentWindow = expandMomentWindowLater(momentWindow, orderedMoments.length);
          visibleMomentIds = visibleMomentIdSet(orderedMoments, momentWindow);
          rebuild();
        }),
      );
      host.append(wrap);
    }
  }

  function paintView(): void {
    story.replaceChildren();
    root.setAttribute('data-story-showing', view);
    if (view === 'photos') {
      const legs = legsById();
      story.append(
        renderPhotosView({
          tripId: liveFixture.trip_id,
          photos,
          groupOf: (photo) => ({
            label: [photo.dayNumber > 0 ? `Day ${photo.dayNumber}` : '', legs.get(photo.moment.leg_id)?.destination ?? '']
              .filter(Boolean)
              .join(' · '),
            detail: longDate(photo.moment.local_date),
          }),
        }),
      );
      return;
    }
    paintStory(story);
    detachPrefetch?.();
    detachPrefetch = attachMomentPrefetchObserver(root, liveFixture.trip_id, liveFixture, orderedMoments);
    for (const node of story.querySelectorAll('[data-journal-moment]')) observer.observe(node);
  }

  /** Repaint after a change. Keeps the view the reader chose. */
  function rebuild(resetWindow = false, focusMomentId?: string): void {
    if (resetWindow) applyMomentWindow(focusMomentId);
    else refreshMomentWindow();
    coverHost.replaceChildren(buildCover());
    buildRibbon();
    paintView();
    syncCurrentDay();
  }

  function setView(next: StoryView): void {
    if (next === view) return;
    view = next;
    ribbon.setView(view);
    paintView();
    // Start the new view at its top, unless the cover is still on screen.
    const win = root.ownerDocument?.defaultView;
    const viewTop = coverHost.getBoundingClientRect().bottom + (win?.scrollY ?? 0);
    if (win && win.scrollY > viewTop) win.scrollTo({ top: viewTop, behavior: 'auto' });
    syncCurrentDay();
  }

  // ---- Which day is on screen ---------------------------------------------

  let dayFrame = 0;
  function syncCurrentDay(): void {
    if (view !== 'story') {
      ribbon.setCurrentDay(null);
      return;
    }
    let current: string | null = null;
    for (const node of story.querySelectorAll<HTMLElement>('[data-journal-day]')) {
      if (node.getBoundingClientRect().top < 220) current = node.id;
    }
    ribbon.setCurrentDay(current);
  }
  const onScroll = (): void => {
    if (dayFrame) return;
    dayFrame = requestAnimationFrame(() => {
      dayFrame = 0;
      syncCurrentDay();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => {
    window.removeEventListener('scroll', onScroll);
    if (dayFrame) cancelAnimationFrame(dayFrame);
  });

  // ---- Photos open the viewer ---------------------------------------------

  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-photo-index]');
    if (!target || !root.contains(target)) return;
    const index = Number(target.getAttribute('data-photo-index'));
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) return;
    swap(
      'viewer',
      openPhotoViewer({
        photos,
        index,
        tripId: liveFixture.trip_id,
        anchor: root,
        from: target,
        journal: journalDoc(),
        onUseAsCover: canSave() ? useAsCover : undefined,
        onClose: () => {
          overlays.viewer = null;
        },
      }),
    );
  });

  // ---- Mount ---------------------------------------------------------------

  coverHost.append(buildCover());
  buildRibbon();
  paintView();

  const dock: DockHandle = mountDock({ onPhotos: () => openImport(), onMoment: () => openCapture() });
  root.append(coverHost, ribbonHost, timeline, dock.el);
  cleanups.push(() => dock.destroy());
  cleanups.push(mountJournalOfflineStatus(root));
  // Background sync finished (queued save or a media upload): adopt the
  // server copy unless a newer local edit is still on its way.
  cleanups.push(
    onJournalSynced(({ tripId, envelope, saveStillPending }) => {
      if (tripId !== liveFixture.trip_id || saveStillPending) return;
      if (envelope.journal.revision < liveFixture.revision) return;
      reconcile(envelope);
    }),
  );
  canvas.append(root);

  cleanups.push(() => {
    getActiveJournalDayMap()?.destroy();
  });

  const storedId = (() => {
    try {
      return localStorage.getItem(LAST_VIEW_KEY(liveFixture.trip_id)) ?? undefined;
    } catch {
      return undefined;
    }
  })();
  // A link to a moment always goes there. A remembered place is only worth
  // jumping to when it is past the start; otherwise open on the cover.
  const scrollId = opts.momentId ?? (storedId && storedId !== orderedMoments[0]?.id ? storedId : undefined);

  if (scrollId && chapterEl(root, scrollId)) {
    requestAnimationFrame(() => {
      scrollToChapter(scrollId, root);
      playJournalEntrance(root, scrollId);
    });
    if (liveFixture.moments.some((m) => m.id === scrollId)) persistLastView(liveFixture.trip_id, scrollId);
  } else {
    requestAnimationFrame(() => playJournalEntrance(root));
  }
  requestAnimationFrame(syncCurrentDay);

  cleanups.push(() => {
    observer.disconnect();
    detachPrefetch?.();
  });

  function reconcile(envelope: JournalEnvelope): void {
    const win = root.ownerDocument?.defaultView;
    const anchor = resolveEntranceTarget(root);
    const anchorTop = anchor?.getBoundingClientRect().top;
    liveFixture = envelope.journal;
    liveVersion = envelope.version;
    rebuild(false);
    if (anchor && anchorTop !== undefined && win) {
      requestAnimationFrame(() => {
        const delta = anchor.getBoundingClientRect().top - anchorTop;
        if (Math.abs(delta) > 0.5) win.scrollBy(0, delta);
      });
    }
  }

  return {
    reconcile,
    destroy() {
      for (const fn of cleanups) fn();
      for (const key of Object.keys(overlays)) {
        overlays[key]?.destroy();
        overlays[key] = null;
      }
      // Sheets opened from inside another sheet are not tracked here.
      closeAllJournalOverlays();
      canvas.replaceChildren();
    },
  };
}

import type { JournalDay, JournalFixture, JournalLeg, JournalMedia, JournalMoment } from '@/journal/types';
import type { Trip } from '@/types';
import type { JournalDocument, JournalEnvelope } from '@/api/journal';
import { tripRoute } from '@/app/router';
import { prefersReducedMotion } from '../../design-kit/js/hub-motion.js';
import { getPattern } from '@/journal/patterns/registry';
import { shouldShowDayMapPreview } from '@/journal/layout';
import { journalImportChecksums, loadImportProposal } from '@/journal/import-review';
import {
  fileImport,
  filedSummary,
  ImportSpaceError,
  keepInterruptedImport,
  readPhotos,
  undoImport,
  type ReadPhoto,
} from '@/journal/import-run';
import { mountImportStrip, STRIP_HIDE_AFTER_MS, type ImportStripHandle } from '@/journal/story/import-strip';
import { openUndatedSheet, type UndatedDayChoice } from '@/journal/undated-sheet';
import { applyPlaceNames, lookUpPlaces, momentsNeedingPlace, type PlaceLookup } from '@/journal/place-lookup';
import { askNoticing, getNoticingHistory, tickOffTask } from '@/api/travel';
import { openNoticeCards, type FillNoticePhoto } from '@/journal/noticing/cards';
import { renderKeptBand } from '@/journal/noticing/kept-band';
import {
  cardsToOffer,
  dismissCard,
  keepCard,
  keptForDay,
  markSeen,
  readNoticingState,
  recordAsked,
  recordTry,
  shouldAsk,
  unkeepCard,
  waitsForAnswer,
  type AskKind,
  type NoticeCard,
} from '@/journal/noticing/model';
import { renderNoticePill } from '@/journal/noticing/pill';
import { countingCards, noticingDay, tripDayFacts, type NoticingHistory } from '@/journal/noticing/rules';

/** The server only looks through a day's photos when there are at least this many. */
const PHOTOS_FOR_A_LOOK = 6;
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
import { renderKeepsakeBoard } from '@/journal/keepsakes/board';
import { drawKeepsake, ticketDate } from '@/journal/keepsakes/draw';
import { openKeepSheet } from '@/journal/keepsakes/keep-sheet';
import { openKeepsakeSheet } from '@/journal/keepsakes/keepsake-sheet';
import {
  countKept,
  hideBookingKeepsake,
  keepsakesForDay,
  listKeepsakes,
  removeKeepsake,
  type BookingKeepsake,
  type Keepsake,
} from '@/journal/keepsakes/model';
import { renderStoryKeep } from '@/journal/keepsakes/story-keep';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';
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
  configureJournalImage,
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
const STORY_VIEWS: StoryView[] = ['story', 'photos', 'keepsakes'];
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
  /** Names a spot from its coordinates. Defaults to the server lookup on a saved journal; off in previews. */
  lookupPlace?: PlaceLookup;
  /** Other trips, for the noticing cards. Defaults to the server's on a saved journal; none in previews. */
  loadNoticingHistory?: () => Promise<NoticingHistory | null>;
  /** Asks the server what one trip day fulfilled or showed. Defaults to the server on a saved journal. */
  askNoticing?: (kind: AskKind, day: string) => Promise<NoticeCard[]>;
  /** Marks a Someday item done in Tasks. Defaults to the Tasks API. */
  tickWish?: (taskId: string) => Promise<unknown>;
  /** The hour of the day in the trip's current city, for tests. */
  localHour?: number;
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
      onKeep: (moment) => openKeep(moment),
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

  // ---- Photos file themselves --------------------------------------------------

  const strip: ImportStripHandle = mountImportStrip();
  /** Moments filed a moment ago: they settle into the page once. */
  let justFiled = new Set<string>();
  let importing = false;

  const photoPicker = el('input');
  photoPicker.type = 'file';
  photoPicker.accept = 'image/jpeg,image/png';
  photoPicker.multiple = true;
  photoPicker.hidden = true;
  photoPicker.tabIndex = -1;
  photoPicker.setAttribute('aria-hidden', 'true');
  photoPicker.setAttribute('data-journal-photo-picker', '');
  photoPicker.addEventListener('change', () => {
    const files = photoPicker.files ? [...photoPicker.files] : [];
    photoPicker.value = '';
    if (files.length) void runImport(files);
  });

  /** The round button: straight to the phone's photo picker, inside the tap. */
  function pickPhotos(): void {
    if (importing) {
      strip.message({ text: 'Still filing the last photos', autoHideMs: 3000 });
      return;
    }
    photoPicker.click();
  }

  /** The first moment just filed. While set, repaints keep it on screen (a background sync repaints right after the save). */
  let filedFocus: string | undefined;
  let filedTimer: ReturnType<typeof setTimeout> | undefined;

  function showFiledFocus(): void {
    if (!filedFocus) return;
    // Straight there: the new moments settling in is the motion. A smooth scroll would be cut short by the next repaint.
    chapterEl(root, filedFocus)?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  function showFiled(momentIds: string[]): void {
    justFiled = new Set(momentIds);
    filedFocus = momentIds[0];
    view = 'story';
    rebuild(true, filedFocus);
    showFiledFocus();
    if (filedTimer) clearTimeout(filedTimer);
    filedTimer = setTimeout(() => {
      justFiled = new Set();
      filedFocus = undefined;
    }, 2500);
  }

  function undatedDays(): UndatedDayChoice[] {
    const legs = legsById();
    const days = liveFixture.days
      .filter((d) => d.lifecycle === 'live' && legs.get(d.leg_id)?.lifecycle === 'live')
      .sort((a, b) => b.local_date.localeCompare(a.local_date));
    const today = resolveCaptureContext(liveFixture);
    const choices: UndatedDayChoice[] = [];
    const add = (legId: string, localDate: string, prefix: string): void => {
      if (choices.some((c) => c.legId === legId && c.localDate === localDate)) return;
      const n = dayNo(localDate);
      choices.push({
        legId,
        localDate,
        label: [prefix, n > 0 ? `Day ${n}` : '', longDate(localDate)].filter(Boolean).join(' · '),
        hint: legs.get(legId)?.destination,
      });
    };
    // Today first while the trip is on; then the days, latest first.
    const todayDate = today ? (opts.today ?? todayIn(legs.get(today.legId)?.timezone || 'UTC')) : '';
    if (today && today.localDate === todayDate) add(today.legId, today.localDate, 'Today');
    for (const day of days) add(day.leg_id, day.local_date, '');
    return choices;
  }

  function offerUndated(undated: ReadPhoto[], prior: { text: string; notes: string[]; undo?: () => void }): void {
    const n = undated.length;
    strip.message({
      text: prior.text,
      notes: [...prior.notes, n === 1 ? '1 photo has no date' : `${n} photos have no date`],
      actions: [
        ...(prior.undo ? [{ label: 'Undo', onSelect: prior.undo }] : []),
        {
          label: 'Choose a day',
          onSelect: () =>
            swap(
              'undated',
              openUndatedSheet({
                anchor: root,
                files: undated.map((item) => item.file),
                days: undatedDays(),
                onChoose: (day) => void commitImport(undated, { alreadyHere: 0, inTrash: 0, unreadable: 0 }, [], day),
                onClose: () => {
                  overlays.undated = null;
                },
              }),
            ),
        },
      ],
    });
  }

  /** Undo for what was just added: it goes to Trash, where it can be restored. */
  function undoMoments(momentIds: string[], done = 'Taken back. It is in Trash.'): void {
    strip.hide();
    void persistJournalPatch(liveFixture.trip_id, liveVersion, undoImport(journalDoc(), momentIds)).then(
      (saved) => {
        onJournalSaved(saved);
        strip.message({ text: done, autoHideMs: 5000 });
      },
      () => strip.message({ text: 'Could not undo. Try again from the moment’s menu.', tone: 'problem' }),
    );
  }

  async function commitImport(
    ready: ReadPhoto[],
    skipped: { alreadyHere: number; inTrash: number; unreadable: number },
    undated: ReadPhoto[],
    day?: { legId: string; localDate: string },
  ): Promise<void> {
    importing = true;
    strip.reading(ready.length, ready.length);
    try {
      const filed = await fileImport({
        tripId: liveFixture.trip_id,
        journal: journalDoc(),
        version: liveVersion,
        tripTitle: title(),
        items: ready,
        day,
      });
      liveFixture = filed.envelope.journal;
      liveVersion = filed.envelope.version;
      showFiled(filed.momentIds);
      void namePlaces(filed.momentIds);
      const summary = filedSummary({ photos: filed.mediaIds.length, moments: filed.momentIds.length, ...skipped });
      const undo = (): void => undoMoments(filed.momentIds, 'Taken back. The photos are in Trash.');
      const notes = filed.envelope.queued ? [...summary.notes, 'saved on this phone until you are back online'] : summary.notes;
      if (undated.length) {
        offerUndated(undated, { text: summary.headline, notes, undo });
      } else {
        const actions = [{ label: 'Undo', onSelect: undo }];
        if (skipped.inTrash) actions.push({ label: 'Open Trash', onSelect: openTrash });
        strip.message({ text: summary.headline, notes, actions, autoHideMs: STRIP_HIDE_AFTER_MS });
      }
    } catch (error) {
      const full = error instanceof ImportSpaceError;
      if (!full) await keepInterruptedImport(liveFixture.trip_id, journalDoc(), ready).catch(() => undefined);
      strip.message({
        text: full ? 'This phone is out of space for these photos' : 'Could not save. Your photos are safe on this phone.',
        notes: full ? ['Nothing was filed. Free some space and try again.'] : [],
        tone: 'problem',
        actions: [{ label: 'Try again', onSelect: () => void commitImport(ready, skipped, undated, day) }],
      });
    } finally {
      importing = false;
    }
  }

  async function runImport(files: File[]): Promise<void> {
    if (importing) return;
    importing = true;
    strip.reading(0, files.length);
    const { knownChecksums, deletedChecksums } = journalImportChecksums(liveFixture);
    let read;
    try {
      read = await readPhotos(files, {
        knownChecksums,
        deletedChecksums,
        onProgress: (done, total) => strip.reading(done, total),
      });
    } finally {
      importing = false;
    }
    const skipped = { alreadyHere: read.alreadyHere, inTrash: read.inTrash, unreadable: read.unreadable };
    if (read.ready.length) {
      await commitImport(read.ready, skipped, read.undated);
      return;
    }
    const summary = filedSummary({ photos: 0, moments: 0, ...skipped });
    if (read.undated.length) {
      offerUndated(read.undated, { text: 'These photos need a day', notes: summary.notes });
      return;
    }
    const actions = skipped.inTrash ? [{ label: 'Open Trash', onSelect: openTrash }] : [];
    strip.message({ text: summary.headline, notes: summary.notes, actions, autoHideMs: STRIP_HIDE_AFTER_MS });
  }

  // ---- The journal notices things ---------------------------------------------------

  /** Other trips, once loaded. Until then only cards about this trip are made. */
  let noticingHistory: NoticingHistory | null = null;
  const noticeHost = el('div', 'story-notice-host');

  const fillNoticePhoto: FillNoticePhoto = (img, photo) => {
    const own = photo.tripId === liveFixture.trip_id ? mediaById.get(photo.mediaId) : undefined;
    configureJournalImage(img, {
      tripId: photo.tripId,
      // A photo from another trip is always one the server already holds.
      media: own ?? { id: photo.mediaId, lifecycle: 'live', upload_state: 'backed_up' },
      layout: 'pair',
      eager: true,
    });
  };

  /** The time zone the trip is in now: that of the latest moment the owner journaled. */
  function noticingZone(): string {
    const latest = orderedLiveMoments(liveFixture).filter((m) => m.author !== 'partner').at(-1);
    return (latest && legsById().get(latest.leg_id)?.timezone) || liveTrip?.home_tz || 'UTC';
  }
  const noticingToday = (): string => opts.today ?? todayIn(noticingZone());

  /** Today's unseen cards, best first. Nothing before the trip, and nothing new once it is over. */
  function noticesToOffer(): NoticeCard[] {
    if (!liveTrip) return [];
    const state = readNoticingState(journalDoc());
    const day = noticingDay(journalDoc(), liveTrip, noticingToday());
    // Cards the server already made wait until they are dealt with, even after the trip.
    if (!day) return cardsToOffer([], state);
    const cards = countingCards({ journal: journalDoc(), trip: liveTrip, history: noticingHistory, day });
    return cardsToOffer(cards, state);
  }

  // Once a trip day, in the evening or the morning after, the server is asked what the day fulfilled.
  const askServer: ((kind: AskKind, day: string) => Promise<NoticeCard[]>) | null =
    opts.askNoticing ??
    (liveTrip && !isFixtureVersion(liveVersion)
      ? (kind, day) => askNoticing(liveFixture.trip_id, kind, day).then((r) => r.cards)
      : null);
  let asking = false;

  function localHour(): number {
    if (opts.localHour !== undefined) return opts.localHour;
    try {
      const hour = new Intl.DateTimeFormat('en-GB', { timeZone: noticingZone(), hour: '2-digit', hour12: false }).format(new Date());
      return Number(hour) % 24;
    } catch {
      return new Date().getHours();
    }
  }

  async function askAboutToday(kind: AskKind): Promise<void> {
    if (!askServer || !liveTrip || asking) return;
    const today = noticingToday();
    const day = noticingDay(journalDoc(), liveTrip, today);
    if (!day) return;
    // Wait for the day to be mostly lived: from 5 pm, or once the next day has begun.
    if (day === today && localHour() < 17) return;
    if (!shouldAsk(readNoticingState(journalDoc()), kind, day)) return;
    // A look through the photos needs a day's worth of them, already backed up.
    if (kind === 'photos') {
      const facts = tripDayFacts(journalDoc(), liveTrip).find((d) => d.date === day);
      const backedUp = (facts?.photos ?? []).filter((p) => mediaById.get(p.mediaId)?.upload_state === 'backed_up').length;
      if (backedUp < PHOTOS_FOR_A_LOOK) return;
    }
    asking = true;
    try {
      const cards = await askServer(kind, day);
      saveNoticing((j) => recordAsked(j, kind, day, cards), true);
    } catch {
      saveNoticing((j) => recordTry(j, kind, day), true);
    } finally {
      asking = false;
    }
  }

  function paintNoticePill(): void {
    const pill = renderNoticePill(noticesToOffer().length, openNotices);
    noticeHost.replaceChildren(...(pill ? [pill] : []));
  }

  /**
   * Save a change to what was seen, kept or marked not right, and repaint without moving the reader.
   * `quiet` is for the journal's own bookkeeping: a failure there is not the reader's problem.
   */
  function saveNoticing(change: (journal: JournalDocument) => JournalDocument, quiet = false): void {
    // One at a time: each save starts from the journal as the save before it left it,
    // so two pieces of bookkeeping landing together cannot undo each other.
    noticingSaves = noticingSaves.then(async () => {
      const next = change(journalDoc());
      if (next === journalDoc()) {
        paintNoticePill();
        return;
      }
      try {
        const saved = await persistJournalPatch(liveFixture.trip_id, liveVersion, next);
        liveFixture = saved.journal;
        liveVersion = saved.version;
        // While words are being typed or cards are open, take the copy and leave the page be.
        if (editingWords || overlays.notices) repaintOwed = true;
        else repaintInPlace();
      } catch {
        if (quiet) return;
        strip.message({
          text: 'Could not save what you kept',
          notes: ['Check your connection'],
          tone: 'problem',
          actions: [{ label: 'Try again', onSelect: () => (strip.hide(), saveNoticing(change)) }],
        });
      }
    });
  }
  let noticingSaves: Promise<void> = Promise.resolve();

  function openNotices(): void {
    const cards = noticesToOffer();
    if (!cards.length) return;
    // What was kept or marked not right is applied in one save when the cards close,
    // to the journal as it is then: a sync may have landed while they were open.
    const changes: Array<(journal: JournalDocument) => JournalDocument> = [];
    swap(
      'notices',
      openNoticeCards({
        anchor: root,
        cards,
        fillPhoto: fillNoticePhoto,
        onKeep: (card) => changes.push((j) => keepCard(j, card)),
        onNotRight: (card) => changes.push((j) => dismissCard(j, card.key)),
        onTick: (card) => (opts.tickWish ?? tickOffTask)(card.wish!.taskId).then(() => undefined),
        onClose: (seenKeys) => {
          overlays.notices = null;
          if (repaintOwed && !editingWords) {
            repaintOwed = false;
            repaintInPlace();
          }
          // A wish waits until it is ticked off or turned down: looking at it does not use it up.
          const waiting = new Set(cards.filter(waitsForAnswer).map((c) => c.key));
          const looked = seenKeys.filter((key) => !waiting.has(key));
          saveNoticing((j) => markSeen(changes.reduce((acc, change) => change(acc), j), looked));
        },
      }),
    );
  }

  function keptBands(cards: NoticeCard[]): HTMLElement[] {
    return cards.map((card) =>
      renderKeptBand({ card, fillPhoto: fillNoticePhoto, onRemove: (c) => saveNoticing((j) => unkeepCard(j, c.key)) }),
    );
  }

  const loadNoticingHistory =
    opts.loadNoticingHistory ??
    (liveTrip && !isFixtureVersion(liveVersion)
      ? () => getNoticingHistory(liveFixture.trip_id).then((r) => r.history, () => null)
      : null);
  if (loadNoticingHistory) {
    void loadNoticingHistory().then(
      (history) => {
        if (!history) return;
        noticingHistory = history;
        paintNoticePill();
      },
      () => undefined,
    );
  }
  void askAboutToday('wishes').then(() => askAboutToday('photos'));

  // ---- Words edited in place ------------------------------------------------------

  /** True while a moment's words are being typed. Repaints wait, so the field is not pulled from under the keyboard. */
  let editingWords = false;
  let repaintOwed = false;
  function setEditingWords(editing: boolean): void {
    editingWords = editing;
    root.classList.toggle('story--editing-words', editing);
    if (!editing && repaintOwed) {
      repaintOwed = false;
      repaintInPlace();
    }
  }

  async function saveWords(moment: JournalMoment, text: string): Promise<void> {
    const journal = journalDoc();
    const next: JournalDocument = {
      ...journal,
      revision: journal.revision + 1,
      moments: journal.moments.map((m) => (m.id === moment.id ? { ...m, text: text || undefined } : m)),
    };
    const saved = await persistJournalPatch(liveFixture.trip_id, liveVersion, next);
    liveFixture = saved.journal;
    liveVersion = saved.version;
    repaintOwed = true; // painted when the field closes
  }

  // ---- Places name themselves ---------------------------------------------------

  let namingPlaces = false;
  /**
   * Give moments that have a location and no name a street or neighbourhood,
   * in the background. `ids` limits it to moments just filed; otherwise a few
   * older ones are caught up on each visit.
   */
  async function namePlaces(ids?: string[]): Promise<void> {
    if (namingPlaces || (!canSave() && !opts.lookupPlace)) return;
    const waiting = momentsNeedingPlace(journalDoc(), ids);
    if (!waiting.length) return;
    namingPlaces = true;
    try {
      const names = await lookUpPlaces(ids ? waiting : waiting.slice(0, 5), opts.lookupPlace);
      // The journal may have moved on while the names were fetched: apply to what is there now.
      const next = applyPlaceNames(journalDoc(), names);
      if (next === journalDoc()) return;
      const saved = await persistJournalPatch(liveFixture.trip_id, liveVersion, next);
      reconcile(saved);
    } catch {
      /* Left as they are; tried again on a later visit. */
    } finally {
      namingPlaces = false;
    }
  }
  void namePlaces();

  // An import that was cut short last time is still on the phone: offer to finish it.
  if (!isFixtureVersion(liveVersion)) {
    void loadImportProposal(liveFixture.trip_id).then(
      (restored) => {
        if (!restored || importing) return;
        strip.message({
          text: 'An import was interrupted',
          notes: ['The photos are still on this phone'],
          actions: [{ label: 'Finish', onSelect: () => (strip.hide(), openImport()) }],
        });
      },
      () => undefined,
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
        onImportPhotos: (files) => void runImport(files),
        onClose: () => {
          overlays.capture = null;
        },
        onSaved: (envelope, momentId) => {
          overlays.capture = null;
          liveFixture = envelope.journal;
          liveVersion = envelope.version;
          showFiled([momentId]);
          void namePlaces([momentId]);
          strip.message({
            text: 'Moment added',
            notes: envelope.queued ? ['saved on this phone until you are back online'] : [],
            actions: [{ label: 'Undo', onSelect: () => undoMoments([momentId]) }],
            autoHideMs: STRIP_HIDE_AFTER_MS,
          });
        },
        onLateLocation: (momentId, coordinates) => {
          const journal = journalDoc();
          const moment = journal.moments.find((m) => m.id === momentId && m.lifecycle === 'live');
          if (!moment || moment.coordinates) return;
          const next: JournalDocument = {
            ...journal,
            revision: journal.revision + 1,
            moments: journal.moments.map((m) => (m.id === momentId ? { ...m, coordinates, location_source: 'device' as const } : m)),
          };
          void persistJournalPatch(liveFixture.trip_id, liveVersion, next).then(
            (saved) => {
              reconcile(saved);
              void namePlaces([momentId]);
            },
            () => undefined,
          );
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
  let keepsakes: Keepsake[] = [];
  let mediaById = new Map<string, JournalMedia>();

  function indexPhotos(): void {
    photos = tripPhotos(liveFixture, orderedMoments, (m) => dayNo(m.local_date));
    photoIndex = new Map(photos.map((p, i) => [`${p.moment.id}|${p.media.id}`, i]));
    keepsakes = listKeepsakes(journalDoc(), liveTrip);
    mediaById = new Map(liveFixture.media.map((m) => [m.id, m]));
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

  function openTrash(): void {
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
    );
  }

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
        onSelect: openTrash,
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
        countKept(keepsakes) ? plural(countKept(keepsakes), 'keepsake') : '',
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

  // ---- Keepsakes -----------------------------------------------------------

  const draw = (k: Keepsake): HTMLElement =>
    drawKeepsake(k, {
      tripId: liveFixture.trip_id,
      mediaById,
      stampInk: k.type === 'stamp' ? liveTrip?.cities.find((c) => c.id === legsById().get(k.legId)?.city_id)?.accent.color : undefined,
    });

  function openKeep(moment?: JournalMoment): void {
    const ctx = moment ? { legId: moment.leg_id, localDate: moment.local_date } : resolveCaptureContext(liveFixture);
    if (!ctx) return;
    const firstPhotoId = moment?.media_ids.find((id) => {
      const media = mediaById.get(id);
      return media && media.lifecycle === 'live' && !isAudioMedia(media);
    });
    swap(
      'keep',
      openKeepSheet({
        anchor: root,
        tripId: liveFixture.trip_id,
        journal: journalDoc(),
        version: liveVersion,
        legId: ctx.legId,
        localDate: ctx.localDate,
        timeZone: legsById().get(ctx.legId)?.timezone,
        tripTitle: title(),
        moment,
        momentPhoto: firstPhotoId ? mediaById.get(firstPhotoId) : undefined,
        onSaved: onJournalSaved,
        onClose: () => {
          overlays.keep = null;
        },
      }),
    );
  }

  /** Where a keepsake lives in the story: its moment, its day, or its city. */
  function keepsakeHome(k: Keepsake): string {
    if (k.type === 'photo' && k.momentId) return k.momentId;
    const date = k.type === 'photo' ? k.localDate : k.date;
    const day = liveFixture.days.find((d) => d.lifecycle === 'live' && d.leg_id === k.legId && d.local_date === date);
    return day?.id ?? k.legId;
  }

  function keepsakeMeta(k: Keepsake): string {
    if (k.type === 'stamp') return k.date ? `Arrived ${ticketDate(k.date)}` : '';
    if (k.type === 'booking') {
      const n = dayNo(k.date);
      return [n > 0 ? `Day ${n}` : '', longDate(k.date), clock12(k.departTime)].filter(Boolean).join(' · ');
    }
    const n = k.localDate ? dayNo(k.localDate) : 0;
    return [n > 0 ? `Day ${n}` : '', k.localDate ? longDate(k.localDate) : '', clock12(k.localTime), k.placeName ?? '']
      .filter(Boolean)
      .join(' · ');
  }

  function removeKept(k: Keepsake): void {
    if (k.type === 'stamp') return;
    const next =
      k.type === 'booking'
        ? hideBookingKeepsake(journalDoc(), k.itemId, `${k.carrier} ${k.number}`)
        : removeKeepsake(journalDoc(), k.id);
    void persistJournalPatch(liveFixture.trip_id, liveVersion, next).then(
      (saved) => {
        onJournalSaved(saved);
        showHubToast('Removed. It is in Trash if you want it back.');
      },
      () => showHubToast('Could not remove it. Try again.', { tone: 'danger' }),
    );
  }

  function openKeepsake(k: Keepsake, _from: HTMLElement): void {
    const home = keepsakeHome(k);
    swap(
      'keepsake',
      openKeepsakeSheet({
        anchor: root,
        keepsake: k,
        drawn: draw(k),
        meta: keepsakeMeta(k),
        onGoToDay: home
          ? () => {
              setView('story');
              scrollToChapter(home, root, opts.onChapterJump);
            }
          : undefined,
        onRemove: k.type === 'stamp' ? undefined : () => removeKept(k),
        onClose: () => {
          overlays.keepsake = null;
        },
      }),
    );
  }

  let keepTilt = 0;
  const KEEP_TILTS = [-3, 2.5, -2, 3.5];
  function storyKeep(k: Keepsake): HTMLElement {
    const meta =
      k.type === 'booking'
        ? 'Kept automatically from your booking'
        : k.type === 'photo'
          ? [clock12(k.localTime), k.placeName ?? ''].filter(Boolean).join(' · ')
          : '';
    return renderStoryKeep({
      keepsake: k,
      drawn: draw(k),
      meta,
      tilt: k.type === 'booking' ? undefined : KEEP_TILTS[keepTilt++ % KEEP_TILTS.length],
      onOpen: openKeepsake,
    });
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
    photosBtn.addEventListener('click', pickPhotos);
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
    const noticing = readNoticingState(journalDoc());

    liveLegs().forEach((leg, legIndex) => {
      const legSection = el('section', 'journal-leg story-leg');
      legSection.setAttribute('data-journal-leg', leg.id);
      legSection.id = leg.id;

      const days = legDays(leg);
      const legMoments = orderedMoments.filter((m) => m.leg_id === leg.id);
      const pattern = opts.patternOff ? null : getPattern(leg.pattern_id);
      const legStamp = keepsakes.find((k) => k.type === 'stamp' && k.legId === leg.id);
      const legBookings = keepsakes.filter((k): k is BookingKeepsake => k.type === 'booking' && k.legId === leg.id);
      const range = leg.start_date ? shortDateRange(leg.start_date, leg.end_date ?? leg.start_date) : '';
      legSection.append(
        renderChapterOpener({
          number: legIndex + 1,
          name: leg.destination,
          dateRange: range,
          counts: [
            days.length ? plural(days.length, 'day') : '',
            legMoments.length ? plural(legMoments.length, 'moment') : '',
            countKept(keepsakes, leg.id) ? plural(countKept(keepsakes, leg.id), 'keepsake') : '',
          ]
            .filter(Boolean)
            .join(' · '),
          patternHref: pattern?.href ?? null,
          accentSoft: cityOf(leg)?.accent.soft,
          stamp: legStamp ? draw(legStamp) : undefined,
        }),
      );
      for (const ticket of legBookings.filter((k) => k.side === 'arrive')) legSection.append(storyKeep(ticket));

      const today = todayFor(leg);
      const city = cityOf(leg);

      for (const day of days) {
        const daySection = el('section', 'journal-day story-day-section');
        daySection.setAttribute('data-journal-day', day.id);
        daySection.id = day.id;

        const moments = legMoments.filter((m) => m.local_date === day.local_date);
        const dayKeeps = keepsakesForDay(keepsakes, leg.id, day.local_date);
        // Keepsakes with no moment sit in time order; the rest follow their moment.
        const loose = dayKeeps.filter((k) => !k.momentId);
        const dayOnScreen = moments.length === 0 || moments.some((m) => visibleMomentIds.has(m.id));
        const sunset = city?.center
          ? sunsetLocal(city.center.lat, city.center.lon, day.local_date, leg.timezone || city.tz)
          : null;
        daySection.append(
          renderDayHeader({
            number: dayNo(day.local_date),
            date: longDate(day.local_date),
            isToday: day.local_date === today,
            facts: [
              moments.length ? plural(moments.length, 'moment') : '',
              dayKeeps.length ? plural(dayKeeps.length, 'keepsake') : '',
              sunset ? `sunset ${clock12(sunset)}` : '',
            ],
          }),
        );

        const keptToday = keptForDay(noticing, day.local_date);
        const momentIdsToday = new Set(moments.map((m) => m.id));
        daySection.append(...keptBands(keptToday.filter((c) => !c.momentId || !momentIdsToday.has(c.momentId))));

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

        if (moments.length === 0 && dayKeeps.length === 0) {
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
          while (loose.length && loose[0]!.localTime && moment.local_time && loose[0]!.localTime < moment.local_time) {
            daySection.append(storyKeep(loose.shift()!));
            previous = undefined;
          }
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
              isNew: justFiled.has(moment.id),
              onSaveWords: saveWords,
              onEditingWords: setEditingWords,
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
          daySection.append(...keptBands(keptToday.filter((c) => c.momentId === moment.id)));
          const linked = dayKeeps.filter((k) => k.momentId === moment.id);
          for (const k of linked) daySection.append(storyKeep(k));
          if (linked.length) previous = undefined;
        }
        if (dayOnScreen) for (const k of loose) daySection.append(storyKeep(k));

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
      const departing = legBookings.filter((k) => k.side === 'depart');
      if (departing.length) {
        const wrap = el('div', 'story-keep-group');
        for (const ticket of departing) wrap.append(storyKeep(ticket));
        host.append(wrap);
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
    if (view === 'keepsakes') {
      story.append(
        renderKeepsakeBoard({
          keepsakes,
          cities: liveLegs().map((leg) => ({
            id: leg.id,
            name: leg.destination,
            arrived: leg.start_date ? `Arrived ${ticketDate(leg.start_date)}` : '',
          })),
          draw,
          onOpen: openKeepsake,
          onKeep: () => openKeep(),
        }),
      );
      return;
    }
    keepTilt = 0;
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
    paintNoticePill();
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

  const dock: DockHandle = mountDock({ onPhotos: pickPhotos, onMoment: () => openCapture(), onKeepsake: () => openKeep() });
  paintNoticePill();
  root.append(coverHost, noticeHost, ribbonHost, timeline, strip.el, dock.el, photoPicker);
  cleanups.push(() => {
    strip.destroy();
    if (filedTimer) clearTimeout(filedTimer);
  });
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

  /** Repaint with what is in hand, keeping the reader where they are. */
  function repaintInPlace(): void {
    const win = root.ownerDocument?.defaultView;
    const anchor = resolveEntranceTarget(root);
    const anchorId = anchor?.id;
    const anchorTop = anchor?.getBoundingClientRect().top;
    rebuild(false);
    if (!anchorId || anchorTop === undefined || !win) return;
    const after = chapterEl(root, anchorId);
    if (!after) return;
    const delta = after.getBoundingClientRect().top - anchorTop;
    if (Math.abs(delta) > 0.5) win.scrollBy(0, delta);
  }

  function reconcile(envelope: JournalEnvelope): void {
    if (editingWords) {
      // Take the newer copy, but leave the page alone until the field closes.
      liveFixture = envelope.journal;
      liveVersion = envelope.version;
      repaintOwed = true;
      return;
    }
    if (filedFocus) {
      liveFixture = envelope.journal;
      liveVersion = envelope.version;
      rebuild(true, filedFocus);
      showFiledFocus();
      return;
    }
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

import type { JournalDocument } from '@/api/journal';
import type { JournalFixture, JournalMedia, JournalMoment } from '@/journal/types';
import { photoLayout, reflectionLikelyOverflows } from '@/journal/layout';
import { configureJournalImage } from '@/journal/media-loading';
import { buildMomentMenuItems, type MomentMenuAction } from '@/journal/moment-menu';
import { openEditMomentSheet } from '@/journal/edit-moment-sheet';
import { openMergeSheet } from '@/journal/merge-sheet';
import { openMoveSheet } from '@/journal/move-sheet';
import { openReorderSheet } from '@/journal/reorder-sheet';
import { openSplitSheet } from '@/journal/split-sheet';
import { openDeleteConfirmSheet } from '@/journal/delete-confirm-sheet';
import { openPhotoAnnotationSheet } from '@/journal/annotation-sheet';
import {
  getMediaPhotoAnnotations,
  momentHasPhotoAnnotations,
  regionSvgAttrs,
} from '@/journal/annotations';

function mediaById(fixture: JournalFixture): Map<string, JournalMedia> {
  return new Map(fixture.media.map((m) => [m.id, m]));
}

export interface RenderMomentContext {
  fixture: JournalFixture;
  journal: JournalDocument;
  tripId: string;
  version: string;
  anchor: HTMLElement;
  onJournalSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
}

function renderEllipsisMenu(
  article: HTMLElement,
  moment: JournalMoment,
  ctx: RenderMomentContext,
): void {
  const wrap = document.createElement('div');
  wrap.className = 'journal-moment__menu-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'journal-moment__menu-btn';
  btn.setAttribute('aria-label', 'Moment actions');
  btn.setAttribute('aria-haspopup', 'menu');
  btn.textContent = '⋯';
  const menu = document.createElement('div');
  menu.className = 'journal-moment__menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  let sheetOverlay: { destroy(): void } | null = null;

  const closeMenu = (): void => {
    menu.hidden = true;
  };

  const onDocClick = (ev: MouseEvent) => {
    if (!wrap.contains(ev.target as Node)) closeMenu();
  };

  for (const item of buildMomentMenuItems(ctx.fixture, moment)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journal-moment__menu-item';
    button.setAttribute('role', 'menuitem');
    button.disabled = item.disabled;
    button.title = item.title;
    button.textContent = item.label;
    if (item.disabled && item.title) {
      button.setAttribute('aria-description', item.title);
    }
    button.addEventListener('click', () => {
      closeMenu();
      if (button.disabled) return;
      handleMenuAction(item.action, moment, ctx, (handle) => {
        sheetOverlay = handle;
      });
    });
    menu.append(button);
  }

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const opening = menu.hidden;
    menu.hidden = !opening;
    if (opening) document.addEventListener('click', onDocClick, { once: true });
  });

  article.addEventListener('journal-moment-destroy', () => {
    document.removeEventListener('click', onDocClick);
    sheetOverlay?.destroy();
  });

  wrap.append(btn, menu);
  article.append(wrap);
}

function sheetBase(ctx: RenderMomentContext, moment: JournalMoment) {
  return {
    tripId: ctx.tripId,
    journal: ctx.journal,
    version: ctx.version,
    moment,
    anchor: ctx.anchor,
    onSaved: (envelope: { journal: JournalDocument; version: string }) =>
      ctx.onJournalSaved?.(envelope),
  };
}

function handleMenuAction(
  action: MomentMenuAction,
  moment: JournalMoment,
  ctx: RenderMomentContext,
  setSheetOverlay: (handle: { destroy(): void }) => void,
): void {
  const base = sheetBase(ctx, moment);
  switch (action) {
    case 'edit':
      setSheetOverlay(openEditMomentSheet(base));
      break;
    case 'annotate': {
      const firstId = moment.media_ids[0];
      const media = firstId ? ctx.fixture.media.find((m) => m.id === firstId) : undefined;
      if (!media) break;
      setSheetOverlay(
        openPhotoAnnotationSheet({
          tripId: ctx.tripId,
          journal: ctx.journal,
          version: ctx.version,
          media,
          anchor: ctx.anchor,
          onSaved: (envelope) => ctx.onJournalSaved?.(envelope),
        }),
      );
      break;
    }
    case 'reorder':
      setSheetOverlay(openReorderSheet(base));
      break;
    case 'split':
      setSheetOverlay(openSplitSheet(base));
      break;
    case 'merge':
      setSheetOverlay(openMergeSheet(base));
      break;
    case 'move':
      setSheetOverlay(openMoveSheet(base));
      break;
    case 'delete':
      setSheetOverlay(
        openDeleteConfirmSheet({
          ...base,
          target: { kind: 'moment', id: moment.id },
          moment,
          onClose: () => {},
        }),
      );
      break;
    default:
      break;
  }
}

function mountAnnotationOverlay(
  wrap: HTMLElement,
  mediaId: string,
  journal: JournalDocument,
  visible: boolean,
): void {
  const doc = getMediaPhotoAnnotations(journal, mediaId);
  if (!doc || doc.regions.length === 0) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('journal-moment__annotation-svg');
  svg.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (!visible) svg.setAttribute('hidden', '');
  for (const region of doc.regions) {
    const attrs = regionSvgAttrs(region);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', attrs.x);
    rect.setAttribute('y', attrs.y);
    rect.setAttribute('width', attrs.width);
    rect.setAttribute('height', attrs.height);
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = region.note.trim() || 'Photo note';
    rect.append(title);
    svg.append(rect);
  }
  wrap.append(svg);
}

function renderPhotoGrid(
  host: HTMLElement,
  moment: JournalMoment,
  mediaMap: Map<string, JournalMedia>,
  tripId: string,
  mediaEager: boolean,
  journal?: JournalDocument,
): void {
  const ids = moment.media_ids;
  if (ids.length === 0) return;
  const layout = photoLayout(ids.length);
  const grid = document.createElement('div');
  grid.className = `journal-moment__photos journal-moment__photos--${layout}`;

  const resolved = ids
    .map((id) => mediaMap.get(id))
    .filter((m): m is JournalMedia => Boolean(m));

  let annotationsVisible = false;
  const syncAnnotationVisibility = (): void => {
    grid.classList.toggle('journal-moment__photos--annotations-visible', annotationsVisible);
    for (const svg of grid.querySelectorAll('.journal-moment__annotation-svg')) {
      if (annotationsVisible) svg.removeAttribute('hidden');
      else svg.setAttribute('hidden', '');
      svg.setAttribute('aria-hidden', annotationsVisible ? 'false' : 'true');
    }
  };

  const addImg = (m: JournalMedia, layoutSlot: typeof layout, className?: string): void => {
    const frame = document.createElement('div');
    frame.className = 'journal-moment__photo-frame';
    const img = document.createElement('img');
    if (className) img.className = className;
    configureJournalImage(img, { tripId, media: m, layout: layoutSlot, eager: mediaEager });
    frame.append(img);
    if (journal) mountAnnotationOverlay(frame, m.id, journal, annotationsVisible);
    grid.append(frame);
  };

  if (layout === 'single') {
    addImg(resolved[0]!, 'single');
  } else if (layout === 'pair') {
    for (const m of resolved.slice(0, 2)) {
      addImg(m, 'pair');
    }
  } else {
    const lead = resolved[0];
    if (lead) {
      addImg(lead, layout, 'journal-moment__photo-lead');
    }
    const pair = document.createElement('div');
    pair.className = 'journal-moment__photo-pair';
    grid.append(pair);
    for (const m of resolved.slice(1, 3)) {
      const frame = document.createElement('div');
      frame.className = 'journal-moment__photo-frame';
      const img = document.createElement('img');
      configureJournalImage(img, { tripId, media: m, layout: 'pair', eager: mediaEager });
      frame.append(img);
      if (journal) mountAnnotationOverlay(frame, m.id, journal, annotationsVisible);
      pair.append(frame);
    }
    if (layout === 'lead-pair-more' && ids.length > 3) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn--ghost journal-moment__view-all';
      more.textContent = `View all ${ids.length}`;
      more.disabled = true;
      more.title = 'Coming in Phase 3';
      grid.append(more);
    }
  }

  if (journal && momentHasPhotoAnnotations(journal, ids)) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn--ghost journal-moment__annotation-toggle';
    toggle.textContent = 'Show photo notes';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      annotationsVisible = !annotationsVisible;
      toggle.setAttribute('aria-pressed', annotationsVisible ? 'true' : 'false');
      toggle.textContent = annotationsVisible ? 'Hide photo notes' : 'Show photo notes';
      syncAnnotationVisibility();
    });
    grid.before(toggle);
  }

  host.append(grid);
}

function renderMetadata(host: HTMLElement, moment: JournalMoment): void {
  if (!moment.local_time && !moment.place?.name) return;
  const meta = document.createElement('div');
  meta.className = 'journal-moment__meta';
  if (moment.local_time) {
    const t = document.createElement('span');
    t.className = 'journal-moment__time num';
    t.textContent = moment.local_time;
    meta.append(t);
  }
  if (moment.place?.name) {
    if (moment.local_time) meta.append(document.createTextNode(' · '));
    const place = document.createElement('span');
    place.className = 'journal-moment__place';
    place.textContent = moment.place.name;
    meta.append(place);
  }
  host.append(meta);
}

function renderReflection(host: HTMLElement, text: string): void {
  const block = document.createElement('div');
  block.className = 'journal-moment__reflection';
  const p = document.createElement('p');
  p.textContent = text;
  block.append(p);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'journal-moment__read-more';
  btn.textContent = 'Read more';
  btn.hidden = true;

  const syncReadMore = (): void => {
    if (!reflectionLikelyOverflows(text, 6)) {
      block.classList.remove('journal-moment__reflection--clamped');
      btn.hidden = true;
      return;
    }
    block.classList.add('journal-moment__reflection--clamped');
    const overflows =
      p.scrollHeight > p.clientHeight + 1 || text.split('\n').length > 6;
    btn.hidden = !overflows;
    if (!overflows) block.classList.remove('journal-moment__reflection--clamped');
  };

  btn.addEventListener('click', () => {
    block.classList.remove('journal-moment__reflection--clamped');
    btn.hidden = true;
  });

  block.append(btn);
  host.append(block);
  requestAnimationFrame(syncReadMore);
}

function renderAudioStub(host: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'journal-moment__audio';
  row.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = 'Voice note — Coming in Phase 3';
  row.append(label);
  host.append(row);
}

export interface RenderMomentOptions {
  /** First visible moment in the paginated window — eager-load lead photos. */
  mediaEager?: boolean;
}

export function renderMomentArticle(
  fixture: JournalFixture,
  moment: JournalMoment,
  ctx?: RenderMomentContext,
  options?: RenderMomentOptions,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'journal-moment';
  article.id = moment.id;
  article.setAttribute('data-journal-moment', moment.id);

  const mediaMap = mediaById(fixture);
  const textOnly = moment.media_ids.length === 0;

  if (textOnly) {
    renderMetadata(article, moment);
    if (moment.text) renderReflection(article, moment.text);
  } else {
    renderPhotoGrid(
      article,
      moment,
      mediaMap,
      ctx?.tripId ?? fixture.trip_id,
      Boolean(options?.mediaEager),
      ctx?.journal,
    );
    renderMetadata(article, moment);
    if (moment.text) renderReflection(article, moment.text);
    renderAudioStub(article);
  }

  if (ctx) renderEllipsisMenu(article, moment, ctx);
  return article;
}

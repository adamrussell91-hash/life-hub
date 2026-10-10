import type { JournalDocument } from '@/api/journal';
import type { JournalFixture, JournalMedia, JournalMoment } from '@/journal/types';
import { photoLayout, reflectionLikelyOverflows } from '@/journal/layout';
import { buildMomentMenuItems, type MomentMenuAction } from '@/journal/moment-menu';
import { openEditMomentSheet } from '@/journal/edit-moment-sheet';

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

  let editOverlay: { destroy(): void } | null = null;

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
        editOverlay = handle;
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
    editOverlay?.destroy();
  });

  wrap.append(btn, menu);
  article.append(wrap);
}

function handleMenuAction(
  action: MomentMenuAction,
  moment: JournalMoment,
  ctx: RenderMomentContext,
  setEditOverlay: (handle: { destroy(): void }) => void,
): void {
  if (action === 'edit') {
    setEditOverlay(
      openEditMomentSheet({
        tripId: ctx.tripId,
        journal: ctx.journal,
        version: ctx.version,
        moment,
        anchor: ctx.anchor,
        onSaved: (envelope) => ctx.onJournalSaved?.(envelope),
      }),
    );
  }
}

function renderPhotoGrid(
  host: HTMLElement,
  moment: JournalMoment,
  mediaMap: Map<string, JournalMedia>,
): void {
  const ids = moment.media_ids;
  if (ids.length === 0) return;
  const layout = photoLayout(ids.length);
  const grid = document.createElement('div');
  grid.className = `journal-moment__photos journal-moment__photos--${layout}`;

  const resolved = ids
    .map((id) => mediaMap.get(id))
    .filter((m): m is JournalMedia => Boolean(m));

  if (layout === 'single') {
    const img = document.createElement('img');
    img.src = resolved[0]!.url;
    img.alt = '';
    img.width = resolved[0]!.width;
    img.height = resolved[0]!.height;
    img.loading = 'lazy';
    img.decoding = 'async';
    grid.append(img);
  } else if (layout === 'pair') {
    for (const m of resolved.slice(0, 2)) {
      const img = document.createElement('img');
      img.src = m.url;
      img.alt = '';
      img.loading = 'lazy';
      grid.append(img);
    }
  } else {
    const lead = resolved[0];
    if (lead) {
      const img = document.createElement('img');
      img.className = 'journal-moment__photo-lead';
      img.src = lead.url;
      img.alt = '';
      img.loading = 'lazy';
      grid.append(img);
    }
    const pair = document.createElement('div');
    pair.className = 'journal-moment__photo-pair';
    for (const m of resolved.slice(1, 3)) {
      const img = document.createElement('img');
      img.src = m.url;
      img.alt = '';
      img.loading = 'lazy';
      pair.append(img);
    }
    grid.append(pair);
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

export function renderMomentArticle(
  fixture: JournalFixture,
  moment: JournalMoment,
  ctx?: RenderMomentContext,
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
    renderPhotoGrid(article, moment, mediaMap);
    renderMetadata(article, moment);
    if (moment.text) renderReflection(article, moment.text);
    renderAudioStub(article);
  }

  if (ctx) renderEllipsisMenu(article, moment, ctx);
  return article;
}

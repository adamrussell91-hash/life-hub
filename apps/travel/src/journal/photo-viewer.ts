import type { JournalDocument } from '@/api/journal';
import type { JournalFixture, JournalMedia, JournalMoment } from '@/journal/types';
import { getMediaPhotoAnnotations, regionSvgAttrs } from '@/journal/annotations';
import { configureJournalImage } from '@/journal/media-loading';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import { momentMedia } from '@/journal/story/moment-card';
import { ICONS, button, el, icon } from '@/journal/story/dom';
import { clock12 } from '@/journal/trip-days';
import { prefersReducedMotion } from '../../design-kit/js/hub-motion.js';

export interface TripPhoto {
  media: JournalMedia;
  moment: JournalMoment;
  /** Day of the trip, or 0 when it cannot be numbered. */
  dayNumber: number;
}

/** Every live photo of the trip in story order, with the moment it belongs to. */
export function tripPhotos(
  fixture: JournalFixture,
  orderedMoments: JournalMoment[],
  dayNumberOf: (moment: JournalMoment) => number,
): TripPhoto[] {
  const out: TripPhoto[] = [];
  for (const moment of orderedMoments) {
    const dayNumber = dayNumberOf(moment);
    for (const media of momentMedia(fixture, moment).photos) out.push({ media, moment, dayNumber });
  }
  return out;
}

export function photoCaptionMeta(photo: TripPhoto): string {
  return [
    photo.dayNumber > 0 ? `Day ${photo.dayNumber}` : '',
    clock12(photo.moment.local_time),
    photo.moment.place?.name?.trim() ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface PhotoViewerOptions {
  photos: TripPhoto[];
  index: number;
  tripId: string;
  anchor: HTMLElement;
  /** The photo that was tapped, so the viewer can grow out of it. */
  from?: HTMLElement | null;
  /** For photo notes. Omitted in read-only previews. */
  journal?: JournalDocument;
  onUseAsCover?: (media: JournalMedia) => void;
  onClose?: () => void;
}

export interface PhotoViewerHandle {
  destroy(): void;
  index(): number;
}

const MAX_ZOOM = 4;
const CLOSE_DRAG_PX = 90;

function notesOverlay(journal: JournalDocument | undefined, mediaId: string): SVGSVGElement | null {
  if (!journal) return null;
  const doc = getMediaPhotoAnnotations(journal, mediaId);
  if (!doc || doc.regions.length === 0) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'story-viewer__notes journal-moment__annotation-svg');
  svg.setAttribute('hidden', '');
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
  return svg;
}

/**
 * Full-screen photo viewer. Shows the whole photo, swipes through every photo
 * of the trip, and closes on drag down, the close button, Escape or Back.
 */
export function openPhotoViewer(options: PhotoViewerOptions): PhotoViewerHandle {
  const { photos } = options;
  const reduce = prefersReducedMotion(options.anchor);
  const root = el('div', 'story-viewer');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Photo');

  const track = el('div', 'story-viewer__track');
  const frames: HTMLElement[] = [];
  photos.forEach((photo, i) => {
    const slide = el('div', 'story-viewer__slide');
    const frame = el('div', 'story-viewer__frame');
    const img = el('img');
    // Only the photo that was opened loads straight away; the rest load as they come near.
    configureJournalImage(img, {
      tripId: options.tripId,
      media: photo.media,
      layout: 'single',
      eager: i === options.index,
    });
    img.draggable = false;
    frame.append(img);
    const notes = notesOverlay(options.journal, photo.media.id);
    if (notes) frame.append(notes);
    slide.append(frame);
    track.append(slide);
    frames.push(frame);
  });

  const top = el('div', 'story-viewer__top');
  const closeBtn = button('story-chip story-chip--icon');
  closeBtn.setAttribute('aria-label', 'Close photo');
  closeBtn.append(icon(ICONS.close));
  const count = el('span', 'story-viewer__count num');
  count.setAttribute('aria-live', 'polite');
  const tools = el('div', 'story-viewer__tools');
  const notesBtn = button('story-chip', 'Notes');
  notesBtn.setAttribute('aria-pressed', 'false');
  notesBtn.hidden = true;
  const coverBtn = button('story-chip', 'Use as cover');
  coverBtn.hidden = !options.onUseAsCover;
  tools.append(notesBtn, coverBtn);
  top.append(closeBtn, count, tools);

  const prev = button('story-viewer__nav story-viewer__nav--prev');
  prev.setAttribute('aria-label', 'Previous photo');
  prev.append(icon(ICONS.back));
  const next = button('story-viewer__nav story-viewer__nav--next');
  next.setAttribute('aria-label', 'Next photo');
  next.append(icon(ICONS.next));

  const caption = el('div', 'story-viewer__caption');
  const captionMeta = el('p', 'story-viewer__meta num');
  const captionText = el('p', 'story-viewer__text');
  caption.append(captionMeta, captionText);

  root.append(track, top, prev, next, caption);

  let current = Math.max(0, Math.min(photos.length - 1, options.index));
  let notesOn = false;
  let overlay: JournalOverlayHandle | null = null;
  let closed = false;

  // ---- Zoom: pinch or double tap, then drag to look around ----------------
  let scale = 1;
  let panX = 0;
  let panY = 0;
  function applyZoom(): void {
    const frame = frames[current];
    if (!frame) return;
    frame.style.transform = scale > 1 ? `translate(${panX}px, ${panY}px) scale(${scale})` : '';
    track.classList.toggle('is-zoomed', scale > 1);
  }
  function resetZoom(): void {
    scale = 1;
    panX = 0;
    panY = 0;
    for (const frame of frames) frame.style.transform = '';
    track.classList.remove('is-zoomed');
  }

  function sync(): void {
    const photo = photos[current];
    if (!photo) return;
    count.textContent = `${current + 1} of ${photos.length}`;
    captionMeta.textContent = photoCaptionMeta(photo);
    captionText.textContent = photo.moment.text?.trim() ?? '';
    captionText.hidden = !captionText.textContent;
    prev.disabled = current === 0;
    next.disabled = current === photos.length - 1;
    const notes = frames[current]?.querySelector('.story-viewer__notes');
    notesBtn.hidden = !notes;
    for (const svg of root.querySelectorAll('.story-viewer__notes')) {
      if (notesOn) svg.removeAttribute('hidden');
      else svg.setAttribute('hidden', '');
    }
  }

  function goTo(index: number, smooth: boolean): void {
    const target = Math.max(0, Math.min(photos.length - 1, index));
    resetZoom();
    current = target;
    const left = target * track.clientWidth;
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    } else {
      track.scrollLeft = left;
    }
    sync();
  }

  track.addEventListener(
    'scroll',
    () => {
      if (track.clientWidth <= 0 || scale > 1) return;
      const at = Math.round(track.scrollLeft / track.clientWidth);
      if (at !== current && at >= 0 && at < photos.length) {
        current = at;
        sync();
      }
    },
    { passive: true },
  );

  function close(): void {
    if (closed) return;
    closed = true;
    overlay?.release();
    options.onClose?.();
  }

  closeBtn.addEventListener('click', close);
  prev.addEventListener('click', () => goTo(current - 1, true));
  next.addEventListener('click', () => goTo(current + 1, true));
  notesBtn.addEventListener('click', () => {
    notesOn = !notesOn;
    notesBtn.setAttribute('aria-pressed', notesOn ? 'true' : 'false');
    sync();
  });
  coverBtn.addEventListener('click', () => {
    const photo = photos[current];
    if (photo) options.onUseAsCover?.(photo.media);
    close();
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') goTo(current + 1, true);
    if (ev.key === 'ArrowLeft') goTo(current - 1, true);
  });

  // ---- Touch: tap hides the chrome, drag down closes, pinch zooms ----------
  const pointers = new Map<number, { x: number; y: number }>();
  let startX = 0;
  let startY = 0;
  let dragY = 0;
  let moved = false;
  let pinchStart = 0;
  let pinchScale = 1;
  let lastTap = 0;

  const spread = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  track.addEventListener('pointerdown', (ev) => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      startX = ev.clientX;
      startY = ev.clientY;
      dragY = 0;
      moved = false;
    } else if (pointers.size === 2) {
      pinchStart = spread();
      pinchScale = scale;
    }
  });

  track.addEventListener('pointermove', (ev) => {
    const last = pointers.get(ev.pointerId);
    if (!last) return;
    const dx = ev.clientX - last.x;
    const dy = ev.clientY - last.y;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) moved = true;

    if (pointers.size === 2 && pinchStart > 0) {
      scale = Math.max(1, Math.min(MAX_ZOOM, pinchScale * (spread() / pinchStart)));
      if (scale === 1) {
        panX = 0;
        panY = 0;
      }
      applyZoom();
      return;
    }
    if (scale > 1) {
      panX += dx;
      panY += dy;
      applyZoom();
      return;
    }
    const totalY = ev.clientY - startY;
    const totalX = ev.clientX - startX;
    if (totalY > 10 && Math.abs(totalY) > Math.abs(totalX) * 1.2) {
      dragY = totalY;
      if (!reduce) {
        root.style.transition = 'none';
        root.style.transform = `translateY(${dragY}px) scale(${Math.max(0.84, 1 - dragY / 1400)})`;
        root.style.opacity = String(Math.max(0.35, 1 - dragY / 500));
      }
    }
  });

  const endPointer = (ev: PointerEvent): void => {
    if (!pointers.delete(ev.pointerId)) return;
    if (pointers.size > 0) return;
    pinchStart = 0;
    if (!moved && dragY === 0) {
      const now = Date.now();
      if (now - lastTap < 300) {
        // Double tap: zoom in on the photo, or back out.
        lastTap = 0;
        if (scale > 1) resetZoom();
        else {
          scale = 2.5;
          applyZoom();
        }
        root.classList.remove('is-bare');
        return;
      }
      lastTap = now;
      if (scale === 1) root.classList.toggle('is-bare');
      return;
    }
    if (scale > 1) return;
    if (dragY > CLOSE_DRAG_PX) {
      close();
      return;
    }
    if (dragY > 0) {
      root.style.transition = '';
      root.style.transform = '';
      root.style.opacity = '';
      dragY = 0;
    }
  };
  track.addEventListener('pointerup', endPointer);
  track.addEventListener('pointercancel', endPointer);

  overlay = presentJournalOverlay(root, {
    anchor: options.anchor,
    dismiss: close,
    initialFocus: closeBtn,
  });

  // Start on the photo that was tapped, growing out of it.
  goTo(current, false);
  const from = options.from;
  const frame = frames[current];
  if (from && frame && !reduce && typeof frame.animate === 'function') {
    const a = from.getBoundingClientRect();
    const b = frame.getBoundingClientRect();
    if (a.width > 0 && b.width > 0) {
      const grow = Math.max(a.width / b.width, a.height / b.height);
      frame.animate(
        [
          {
            transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${grow})`,
          },
          { transform: 'none' },
        ],
        { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
  }

  return { destroy: close, index: () => current };
}

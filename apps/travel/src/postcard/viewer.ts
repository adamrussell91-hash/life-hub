/**
 * The opened view: one postcard at a time on a dark ground, with Older and Newer, a row
 * of small cards to jump between them, and (for the owner) Remove.
 */
import { travelAudioUrl, travelPhotoUrl } from '@/api/travel';
import { setApiImageSrc } from '@/api/config';
import { presentJournalOverlay } from '@/journal/overlay-host';
import { renderPostcard, type PostcardHandle, type PostcardMedia } from '@/postcard/card';
import { placeLine, postcardFacts, type PostcardTrip, type PostcardView } from '@/postcard/model';
import { markSeen, readSeen } from '@/postcard/seen';

export interface PostcardViewerOptions {
  trip: PostcardTrip;
  /** Oldest first, as `listPostcards` returns them. */
  cards: PostcardView[];
  /** Open at this postcard. Without it: the oldest unopened one, or the newest. */
  startId?: string;
  /** The public link's token, so photos and clips load for followers. */
  shareToken?: string | null;
  /** Remember what has been opened and mark the rest. Off for the owner and for previews. */
  trackSeen?: boolean;
  /** Where a card's photo and clip come from. Defaults to the API; a preview passes local files. */
  mediaFor?: (card: PostcardView) => PostcardMedia;
  /** Owner only: take a postcard back. Reject with a message to show. */
  onRemove?: (card: PostcardView) => Promise<void>;
  /** Heading for screen readers. */
  label?: string;
  onClose?: () => void;
}

export interface PostcardViewerHandle {
  close(): void;
}

/** Where the view opens: the asked-for card, else the oldest unopened, else the newest. */
export function startIndex(cards: PostcardView[], seen: Set<string> | null, startId?: string): number {
  if (startId) {
    const asked = cards.findIndex((card) => card.id === startId);
    if (asked >= 0) return asked;
  }
  if (seen) {
    const unopened = cards.findIndex((card) => !seen.has(card.id));
    if (unopened >= 0) return unopened;
  }
  return Math.max(0, cards.length - 1);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

export function openPostcardViewer(options: PostcardViewerOptions): PostcardViewerHandle {
  const { trip, cards } = options;
  const track = Boolean(options.trackSeen);
  const mediaFor =
    options.mediaFor ??
    ((card: PostcardView): PostcardMedia => ({
      photoUrl: travelPhotoUrl(card.photoId, options.shareToken),
      audioUrl: card.audioId ? travelAudioUrl(card.audioId, options.shareToken) : undefined
    }));

  let index = startIndex(cards, track ? readSeen(trip.id) : null, options.startId);
  let current: PostcardHandle | null = null;
  let closed = false;

  const back = el('div', 'sheet-back postcard-viewer');
  const panel = el('div', 'postcard-viewer__panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', options.label ?? 'Postcards');

  const bar = el('div', 'postcard-viewer__bar');
  const closeBtn = button('postcard-viewer__close', 'Close');
  const count = el('span', 'postcard-viewer__count num');
  bar.append(closeBtn, count);

  const stage = el('div', 'postcard-viewer__stage');
  const caption = el('p', 'postcard-viewer__caption');
  const captionPlace = el('b', '');
  const captionWhen = el('span', '');
  caption.append(captionPlace, captionWhen);

  const actions = el('div', 'postcard-viewer__actions');
  const older = button('postcard-viewer__nav', 'Older');
  const turnBtn = button('postcard-viewer__turn', 'Turn over');
  const newer = button('postcard-viewer__nav', 'Newer');
  actions.append(older, turnBtn, newer);

  const strip = el('div', 'postcard-viewer__strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'All postcards, oldest first');

  const confirm = el('div', 'postcard-viewer__confirm');
  confirm.hidden = true;
  const removeBtn = button('postcard-viewer__remove', 'Remove postcard');
  removeBtn.hidden = !options.onRemove;

  panel.append(bar, stage, caption, actions, strip, removeBtn, confirm);
  back.append(panel);

  function paintStrip(): void {
    const seen = track ? readSeen(trip.id) : null;
    strip.replaceChildren();
    strip.hidden = cards.length < 2;
    cards.forEach((card, i) => {
      const thumb = button('postcard-thumb', '');
      thumb.classList.toggle('is-current', i === index);
      thumb.classList.toggle('is-new', Boolean(seen) && !seen!.has(card.id) && i !== index);
      thumb.dataset.orient = card.orientation ?? 'portrait';
      thumb.setAttribute('aria-label', `Postcard ${i + 1} of ${cards.length}, ${placeLine(trip, card)}`);
      if (i === index) thumb.setAttribute('aria-current', 'true');
      const img = el('img', 'postcard-thumb__photo');
      img.alt = '';
      img.loading = 'lazy';
      setApiImageSrc(img, mediaFor(card).photoUrl);
      thumb.append(img);
      thumb.addEventListener('click', () => show(i));
      strip.append(thumb);
    });
  }

  function show(next: number): void {
    index = Math.min(cards.length - 1, Math.max(0, next));
    const card = cards[index];
    current?.destroy();
    current = null;
    stage.replaceChildren();
    confirm.hidden = true;
    if (!card) return;
    const facts = postcardFacts(trip, card);
    current = renderPostcard({
      card,
      facts,
      media: mediaFor(card),
      onBackShown: () => {
        if (!track) return;
        markSeen(trip.id, card.id);
        paintStrip();
      },
      onTurn: (isBack) => {
        turnBtn.textContent = isBack ? 'Turn back to the photo' : 'Turn over';
      }
    });
    stage.append(current.el);
    turnBtn.textContent = 'Turn over';
    count.textContent = `${index + 1} of ${cards.length}`;
    captionPlace.textContent = placeLine(trip, card);
    captionWhen.textContent = facts.caption;
    older.disabled = index === 0;
    newer.disabled = index === cards.length - 1;
    older.hidden = newer.hidden = cards.length < 2;
    paintStrip();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    current?.destroy();
    panel.removeEventListener('keydown', onKey);
    overlay.release();
    options.onClose?.();
  }

  function onKey(event: KeyboardEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('input, textarea, select')) return;
    if (event.key === 'ArrowLeft' && index > 0) show(index - 1);
    if (event.key === 'ArrowRight' && index < cards.length - 1) show(index + 1);
  }

  // A sideways swipe on the card moves through them; the buttons do the same job.
  let swipeFrom: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (event) => {
    swipeFrom = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', (event) => {
    if (!swipeFrom) return;
    const dx = event.clientX - swipeFrom.x;
    const dy = event.clientY - swipeFrom.y;
    swipeFrom = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Older cards sit to the left, as in the row underneath.
    if (dx > 0 && index > 0) show(index - 1);
    if (dx < 0 && index < cards.length - 1) show(index + 1);
  });
  stage.addEventListener('pointercancel', () => {
    swipeFrom = null;
  });

  closeBtn.addEventListener('click', close);
  older.addEventListener('click', () => show(index - 1));
  newer.addEventListener('click', () => show(index + 1));
  turnBtn.addEventListener('click', () => current?.turn());
  panel.addEventListener('keydown', onKey);

  removeBtn.addEventListener('click', () => {
    const card = cards[index];
    if (!card || !options.onRemove) return;
    current?.stopAudio();
    confirm.replaceChildren();
    const question = el(
      'p',
      'postcard-viewer__confirm-text',
      'Remove this postcard? Its photo and voice are deleted for everyone on the link.'
    );
    const problem = el('p', 'postcard-viewer__confirm-error');
    problem.setAttribute('role', 'alert');
    problem.hidden = true;
    const row = el('div', 'postcard-viewer__confirm-row');
    const yes = button('btn btn--danger', 'Remove');
    const no = button('btn ghost', 'Keep');
    row.append(yes, no);
    confirm.append(question, problem, row);
    confirm.hidden = false;
    no.focus({ preventScroll: true });
    no.addEventListener('click', () => {
      confirm.hidden = true;
      removeBtn.focus({ preventScroll: true });
    });
    yes.addEventListener('click', () => {
      yes.disabled = true;
      no.disabled = true;
      yes.textContent = 'Removing…';
      problem.hidden = true;
      options.onRemove!(card).then(close, (error: unknown) => {
        yes.disabled = false;
        no.disabled = false;
        yes.textContent = 'Remove';
        problem.textContent = error instanceof Error && error.message ? error.message : 'Could not remove it. Try again.';
        problem.hidden = false;
      });
    });
  });

  const overlay = presentJournalOverlay(back, {
    anchor: document.body,
    dismiss: close,
    initialFocus: closeBtn
  });
  show(index);

  return { close };
}

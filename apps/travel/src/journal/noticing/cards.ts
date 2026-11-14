import { SOURCE_LINE, type NoticeCard, type NoticePhoto } from '@/journal/noticing/model';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import { button, el, icon, ICONS } from '@/journal/story/dom';

export type FillNoticePhoto = (img: HTMLImageElement, photo: NoticePhoto) => void;

export interface NoticeCardsOptions {
  anchor: HTMLElement;
  cards: NoticeCard[];
  fillPhoto: FillNoticePhoto;
  /** "Keep in the story". */
  onKeep: (card: NoticeCard) => void;
  /** "Not right": remove it for good. */
  onNotRight: (card: NoticeCard) => void;
  /** Told which cards were looked at, once, when the cards close. */
  onClose: (seenKeys: string[]) => void;
}

/** The parts every card shows: where it is from, the one thing, the evidence, and what it rests on. */
export function renderNoticeFace(card: NoticeCard, fillPhoto: FillNoticePhoto, headingTag: 'h2' | 'h3' = 'h2'): HTMLElement {
  const face = el('div', `notice-face notice-face--${card.source}`);
  face.append(el('p', 'notice-face__source', SOURCE_LINE[card.source]), el(headingTag, 'notice-face__headline', card.headline));
  if (card.photos?.length) {
    const photos = el('div', `notice-face__photos notice-face__photos--${Math.min(card.photos.length, 3)}`);
    for (const photo of card.photos.slice(0, 3)) {
      const frame = el('span', 'notice-face__photo');
      const img = el('img');
      fillPhoto(img, photo);
      frame.append(img);
      photos.append(frame);
    }
    face.append(photos);
  }
  if (card.stats?.length) {
    const stats = el('dl', 'notice-face__stats');
    for (const stat of card.stats) {
      const row = el('div', 'notice-face__stat');
      row.append(el('dt', 'notice-face__stat-value num', stat.value), el('dd', 'notice-face__stat-label', stat.label));
      stats.append(row);
    }
    face.append(stats);
  }
  if (card.body) face.append(el('p', 'notice-face__body num', card.body));
  face.append(el('p', 'notice-face__basis num', card.basis));
  return face;
}

/**
 * The day's noticings, full screen, one at a time. Tap the right side or
 * press the right arrow to move on. Back, Escape and Close all leave.
 */
export function openNoticeCards(options: NoticeCardsOptions): { destroy(): void } {
  const deck = [...options.cards];
  const seen = new Set<string>();
  const kept = new Set<string>();
  let index = 0;
  let closed = false;
  let overlay: JournalOverlayHandle | null = null;

  const back = el('div', 'sheet-back notice-back');
  const dialog = el('div', 'notice');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Noticed today');

  const top = el('div', 'notice__top');
  const marks = el('div', 'notice__marks');
  marks.setAttribute('aria-hidden', 'true');
  const count = el('p', 'notice__count num');
  const closeBtn = button('notice__close');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.append(icon(ICONS.close));
  top.append(marks, count, closeBtn);

  const stage = el('div', 'notice__stage');
  const prevZone = button('notice__zone notice__zone--prev');
  prevZone.setAttribute('aria-label', 'Previous');
  const nextZone = button('notice__zone notice__zone--next');
  nextZone.setAttribute('aria-label', 'Next');

  const actions = el('div', 'notice__actions');
  const keepBtn = button('notice__action notice__action--keep', 'Keep in the story');
  const wrongBtn = button('notice__action notice__action--wrong', 'Not right');
  actions.append(wrongBtn, keepBtn);

  dialog.append(top, stage, prevZone, nextZone, actions);
  back.append(dialog);

  function close(): void {
    if (closed) return;
    closed = true;
    dialog.ownerDocument.removeEventListener('keydown', onKey, true);
    overlay?.release();
    options.onClose([...seen]);
  }

  function paint(): void {
    const card = deck[index];
    if (!card) {
      close();
      return;
    }
    seen.add(card.key);
    dialog.className = `notice notice--${card.source}`;
    stage.replaceChildren(renderNoticeFace(card, options.fillPhoto));
    marks.replaceChildren(
      ...deck.map((_, i) => el('span', `notice__mark${i < index ? ' is-done' : i === index ? ' is-on' : ''}`)),
    );
    count.textContent = `${index + 1} of ${deck.length}`;
    prevZone.disabled = index === 0;
    const isKept = kept.has(card.key);
    keepBtn.textContent = isKept ? 'Kept in the story' : 'Keep in the story';
    keepBtn.disabled = isKept;
    wrongBtn.hidden = isKept;
  }

  function go(step: number): void {
    const next = index + step;
    if (next < 0) return;
    if (next >= deck.length) {
      close();
      return;
    }
    index = next;
    paint();
  }

  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'ArrowRight') go(1);
    else if (ev.key === 'ArrowLeft') go(-1);
    else return;
    ev.preventDefault();
  }

  closeBtn.addEventListener('click', close);
  nextZone.addEventListener('click', () => go(1));
  prevZone.addEventListener('click', () => go(-1));
  keepBtn.addEventListener('click', () => {
    const card = deck[index];
    if (!card || kept.has(card.key)) return;
    kept.add(card.key);
    options.onKeep(card);
    paint();
  });
  wrongBtn.addEventListener('click', () => {
    const card = deck[index];
    if (!card) return;
    options.onNotRight(card);
    deck.splice(index, 1);
    if (index >= deck.length) index = deck.length - 1;
    if (deck.length === 0) close();
    else paint();
  });
  dialog.ownerDocument.addEventListener('keydown', onKey, true);

  overlay = presentJournalOverlay(back, { anchor: options.anchor, dismiss: close, initialFocus: closeBtn });
  paint();
  return { destroy: close };
}

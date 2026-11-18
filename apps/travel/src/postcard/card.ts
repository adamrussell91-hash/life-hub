/**
 * The postcard itself: a photo on the front, and on the back the address, a stamp, a
 * postmark, the words in handwriting and a play button. One renderer for the composer's
 * preview, the owner's view and the public link.
 *
 * It is sized in em from its own width (see postcard.css), so it scales as one object.
 */
import { setApiAudioSrc, setApiImageSrc } from '@/api/config';
import type { PostcardFacts, PostcardView } from '@/postcard/model';
import { postmarkSvg, stampHtml } from '@/postcard/stamp';

export interface PostcardMedia {
  photoUrl: string;
  audioUrl?: string;
}

export interface RenderPostcardOptions {
  card: PostcardView;
  facts: PostcardFacts;
  media: PostcardMedia;
  /** Turn over by itself after a moment. Never with reduced motion. Default true. */
  autoTurn?: boolean;
  /** Defaults to the reader's own setting. */
  reducedMotion?: boolean;
  /** The back has been shown for the first time. */
  onBackShown?: () => void;
  onTurn?: (isBack: boolean) => void;
}

export interface PostcardHandle {
  el: HTMLElement;
  /** Turn to the back, the front, or the other side when no side is given. */
  turn(toBack?: boolean): void;
  isBack(): boolean;
  stopAudio(): void;
  destroy(): void;
}

/** How long the front shows, how long the turn takes, how long the words take to write on. */
export const FRONT_MS = 2400;
export const TURN_MS = 900;
export const WRITE_MS = 2600;
/** Handwriting sizes to try, in the card's own em, largest first. */
export const TEXT_SIZES = [2, 1.9, 1.8, 1.7, 1.6, 1.5];

const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.500v13l11-6.500z" fill="currentColor"/></svg>';
const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.500" height="12" rx="1" fill="currentColor"/><rect x="13.500" y="6" width="3.500" height="12" rx="1" fill="currentColor"/></svg>';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The largest size at which the words fit, or the smallest when none do. */
export function pickTextSize(fits: (size: number) => boolean, sizes: readonly number[] = TEXT_SIZES): number {
  for (const size of sizes) if (fits(size)) return size;
  return sizes[sizes.length - 1]!;
}

/** "0:28" */
export function formatClipClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function addressLines(className: string, lines: string[]): HTMLElement {
  const p = el('p', className);
  for (const line of lines) p.append(el('span', '', line));
  return p;
}

/** A narrow landscape card has room for two address lines: the first two, then the rest. */
function shortAddress(lines: string[]): string[] {
  return [lines.slice(0, 2).join(', '), lines.slice(2).join(', ')].filter(Boolean);
}

export function renderPostcard(options: RenderPostcardOptions): PostcardHandle {
  const { card, facts, media } = options;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  const autoTurn = (options.autoTurn ?? true) && !reduced;

  const root = el('div', 'postcard');
  // A photo from before postcards does not say its shape: read it off the image.
  root.dataset.orient = card.orientation ?? 'portrait';
  root.style.setProperty('--city', facts.accent.color);
  root.style.setProperty('--city-soft', facts.accent.soft);
  root.style.setProperty('--city-ink', facts.accent.ink);

  const inner = el('div', 'postcard__inner');
  const front = el('div', 'postcard__face postcard__front');
  const photo = el('img', 'postcard__photo');
  photo.alt = `Photo from ${card.title}`;
  photo.decoding = 'async';
  if (!card.orientation) {
    photo.addEventListener('load', () => {
      if (photo.naturalWidth && photo.naturalHeight) {
        root.dataset.orient = photo.naturalWidth >= photo.naturalHeight ? 'landscape' : 'portrait';
      }
    });
  }
  setApiImageSrc(photo, media.photoUrl);
  front.append(photo);

  const back = el('div', 'postcard__face postcard__back');
  back.inert = true;

  const top = el('div', 'postcard__top');
  const addr = el('div', 'postcard__addr');
  addr.append(
    el('p', 'postcard__label', 'Sent from'),
    addressLines('postcard__lines postcard__lines--full', card.address),
    addressLines('postcard__lines postcard__lines--short', shortAddress(card.address))
  );
  const post = el('div', 'postcard__post');
  // Built from escaped facts only (stamp.ts); the words and the address never go through innerHTML.
  post.innerHTML = stampHtml(facts) + postmarkSvg(facts);
  top.append(addr, post);

  const msg = el('div', 'postcard__msg');
  const text = el('p', 'postcard__text');
  const words: HTMLElement[] = [];
  (card.text ?? '').split(/\s+/).filter(Boolean).forEach((word, index) => {
    if (index > 0) text.append(' ');
    const span = el('span', 'postcard__word', word);
    words.push(span);
    text.append(span);
  });
  msg.append(text);

  back.append(top, msg);

  // ----- voice -----
  let audio: HTMLAudioElement | null = null;
  let stopAudio = (): void => undefined;
  if (media.audioUrl) {
    const row = el('div', 'postcard__play');
    const toggle = el('button', 'postcard__play-btn');
    toggle.type = 'button';
    const bar = el('progress', 'postcard__bar');
    bar.max = 1;
    bar.value = 0;
    bar.setAttribute('aria-label', 'Voice message progress');
    const time = el('span', 'postcard__time num', formatClipClock(card.audioS ?? 0));
    const clip = el('audio', 'postcard__audio');
    clip.preload = 'none';
    audio = clip;
    const failed = el('p', 'postcard__audio-error');
    failed.setAttribute('role', 'alert');
    failed.hidden = true;
    const retry = el('button', 'postcard__retry', 'Try again');
    retry.type = 'button';
    failed.append("Couldn't play the voice. ", retry);

    const length = (): number =>
      Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : card.audioS ?? 0;
    const paint = (playing: boolean): void => {
      toggle.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      toggle.setAttribute('aria-label', playing ? 'Pause the voice message' : 'Play the voice message');
    };
    const play = (): void => {
      failed.hidden = true;
      if (!clip.getAttribute('src')) setApiAudioSrc(clip, media.audioUrl!);
      void clip.play().catch(() => {
        paint(false);
        failed.hidden = false;
      });
    };
    paint(false);
    toggle.addEventListener('click', () => {
      if (clip.paused) play();
      else clip.pause();
    });
    retry.addEventListener('click', () => {
      clip.removeAttribute('src');
      clip.load();
      play();
    });
    clip.addEventListener('play', () => paint(true));
    clip.addEventListener('pause', () => paint(false));
    clip.addEventListener('timeupdate', () => {
      const total = length();
      bar.value = total > 0 ? Math.min(1, clip.currentTime / total) : 0;
      time.textContent = `${formatClipClock(clip.currentTime)} / ${formatClipClock(total)}`;
    });
    clip.addEventListener('ended', () => {
      bar.value = 0;
      time.textContent = formatClipClock(length());
      paint(false);
    });
    clip.addEventListener('error', () => {
      if (!clip.getAttribute('src')) return;
      paint(false);
      failed.hidden = false;
    });
    stopAudio = () => {
      if (clip.paused && clip.currentTime === 0) return;
      clip.pause();
      try {
        clip.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
      bar.value = 0;
      time.textContent = formatClipClock(length());
    };
    row.append(toggle, bar, time, clip);
    back.append(row, failed);
  }

  inner.append(front, back);
  root.append(inner);

  // ----- turning over and writing on -----
  let isBack = false;
  let shown = false;
  let written = false;
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  let raf = 0;

  const showWords = (count: number): void => {
    // One class is the only thing that shows or hides a word.
    words.forEach((word, index) => word.classList.toggle('is-on', index < count));
  };

  function writeOn(): void {
    if (written) return;
    written = true;
    if (reduced || words.length === 0 || typeof requestAnimationFrame !== 'function') {
      showWords(words.length);
      return;
    }
    const start = performance.now();
    const step = (): void => {
      const elapsed = Math.max(0, performance.now() - start);
      const progress = Math.min(1, elapsed / WRITE_MS);
      showWords(Math.round(progress * words.length));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function turn(toBack: boolean = !isBack): void {
    clearTimeout(autoTimer);
    if (toBack === isBack) return;
    isBack = toBack;
    root.classList.toggle('is-back', isBack);
    back.inert = !isBack;
    front.inert = isBack;
    if (isBack) {
      if (!shown) {
        shown = true;
        options.onBackShown?.();
      }
      if (reduced) writeOn();
      else if (!written) writeTimer = setTimeout(writeOn, TURN_MS);
    } else {
      stopAudio();
    }
    options.onTurn?.(isBack);
  }

  root.addEventListener('click', (event) => {
    if ((event.target as Element).closest('button, progress, audio, a')) return;
    turn();
  });
  if (autoTurn) autoTimer = setTimeout(() => turn(true), FRONT_MS);

  // ----- fitting the words -----
  function fit(): void {
    if (!msg.clientHeight) return;
    const size = pickTextSize((candidate) => {
      text.style.setProperty('--postcard-text', `${candidate}em`);
      return msg.scrollHeight <= msg.clientHeight + 1;
    });
    text.style.setProperty('--postcard-text', `${size}em`);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  observer?.observe(root);
  void document.fonts?.ready?.then(() => fit()).catch(() => undefined);

  return {
    el: root,
    turn,
    isBack: () => isBack,
    stopAudio,
    destroy() {
      clearTimeout(autoTimer);
      clearTimeout(writeTimer);
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      observer?.disconnect();
      audio?.pause();
    }
  };
}

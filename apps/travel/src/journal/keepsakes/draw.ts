import type { BookingKeepsake, Keepsake, PhotoKeepsake, StampKeepsake } from '@/journal/keepsakes/model';
import { configureJournalImage } from '@/journal/media-loading';
import { el } from '@/journal/story/dom';
import { clock12 } from '@/journal/trip-days';
import type { JournalMedia } from '@/journal/types';

export interface DrawKeepsakeOptions {
  tripId: string;
  mediaById: Map<string, JournalMedia>;
  /** Ink colour for an arrival stamp, usually the city's accent. */
  stampInk?: string;
  eager?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03-05" as "5 Mar 2027": short enough for a ticket or a stamp. */
export function ticketDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return '';
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : '';
}

/** What a keepsake is, in words: the button label and the line beside it. */
export function keepsakeLabel(k: Keepsake): string {
  if (k.type === 'stamp') return `Arrival stamp, ${k.city}`;
  if (k.type === 'booking') return `${k.carrier} ${k.number}, ${k.fromName} to ${k.toName}`;
  return k.title;
}

function field(label: string, value: string): HTMLElement {
  const wrap = el('span', 'keepsake__field');
  wrap.append(el('span', 'keepsake__k', label), el('b', undefined, value));
  return wrap;
}

function drawBooking(k: BookingKeepsake): HTMLElement {
  const root = el('span', `keepsake keepsake--ticket keepsake--${k.mode}`);
  const inner = el('span', 'keepsake__in');
  const main = el('span', 'keepsake__main');
  main.append(
    el('span', 'keepsake__k', `${k.carrier} · ${k.number}`),
    el('span', 'keepsake__route', `${k.fromName} to ${k.toName}`),
  );
  const facts = el('span', 'keepsake__facts');
  facts.append(field('Date', ticketDate(k.date)));
  const departs = clock12(k.departTime);
  if (departs) facts.append(field('Departs', departs));
  main.append(facts);
  const stub = el('span', 'keepsake__stub');
  const codes = el('span', 'keepsake__codes');
  codes.append(el('b', undefined, k.fromCode), el('b', undefined, k.toCode));
  stub.append(codes, el('span', 'keepsake__bars'));
  inner.append(main, stub);
  root.append(inner);
  return root;
}

function drawStamp(k: StampKeepsake, ink?: string): HTMLElement {
  const root = el('span', 'keepsake keepsake--stamp');
  if (ink) root.style.setProperty('--keepsake-ink', ink);
  if (k.country) root.append(el('span', 'keepsake__country', k.country));
  root.append(el('span', 'keepsake__city', k.city));
  const date = ticketDate(k.date);
  if (date) root.append(el('span', 'keepsake__date', date));
  return root;
}

function drawPhoto(k: PhotoKeepsake, options: DrawKeepsakeOptions): HTMLElement {
  const media = k.mediaId ? options.mediaById.get(k.mediaId) : undefined;
  if (!media || media.lifecycle !== 'live') {
    // Kept in words only: a paper tag carrying its name.
    const tag = el('span', 'keepsake keepsake--tag');
    tag.append(el('span', 'keepsake__in', k.title));
    return tag;
  }
  const root = el('span', `keepsake keepsake--photo is-${k.kind}`);
  const inner = el('span', 'keepsake__in');
  const img = el('img');
  configureJournalImage(img, { tripId: options.tripId, media, layout: 'pair', eager: Boolean(options.eager) });
  inner.append(img);
  root.append(inner);
  return root;
}

/**
 * A keepsake as an object: a photo cut to its shape, a drawn ticket, or an ink stamp.
 * Sized in em, so one font-size on the parent scales the whole thing. It is a picture:
 * the same facts are always written out beside it in ordinary text.
 */
export function drawKeepsake(k: Keepsake, options: DrawKeepsakeOptions): HTMLElement {
  const node =
    k.type === 'booking' ? drawBooking(k) : k.type === 'stamp' ? drawStamp(k, options.stampInk) : drawPhoto(k, options);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-keepsake-type', k.type);
  return node;
}

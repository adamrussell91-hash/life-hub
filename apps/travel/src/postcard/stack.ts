/**
 * The block at the top of the public link: the newest postcard with the others fanned
 * behind it, and how many this browser has not opened. One button that opens the view.
 */
import { travelPhotoUrl } from '@/api/travel';
import { setApiImageSrc } from '@/api/config';
import { postcardFacts, type PostcardTrip, type PostcardView } from '@/postcard/model';
import { unseenPostcards } from '@/postcard/seen';

export interface PostcardStackOptions {
  trip: PostcardTrip;
  /** Oldest first. */
  cards: PostcardView[];
  shareToken?: string | null;
  onOpen: () => void;
}

export interface StackLines {
  heading: string;
  latest: string;
  detail: string;
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The three lines beside the stack. `unseen` is how many this browser has not opened. */
export function stackLines(trip: PostcardTrip, cards: PostcardView[], unseen: number): StackLines {
  const newest = cards[cards.length - 1];
  if (!newest) return { heading: '', latest: '', detail: '' };
  const facts = postcardFacts(trip, newest);
  const first = newest.address[0] ?? newest.title;
  const place = facts.cityName && first.toLowerCase() !== facts.cityName.toLowerCase() ? `${first}, ${facts.cityName}` : first;
  return {
    heading: unseen > 0 ? `${unseen} new ${unseen === 1 ? 'postcard' : 'postcards'}` : plural(cards.length, 'postcard'),
    latest: `Latest: ${place}`,
    detail: newest.audioId && newest.audioS
      ? `${facts.localTime} · ${plural(newest.audioS, 'second')} of voice`
      : facts.localTime
  };
}

/** Draws the stack into `host`, or empties it when the trip has no postcards. */
export function renderPostcardStack(host: HTMLElement, options: PostcardStackOptions): void {
  const { trip, cards } = options;
  host.replaceChildren();
  if (cards.length === 0) return;

  const lines = stackLines(trip, cards, unseenPostcards(trip.id, cards).length);
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'postcard-stack';

  const fan = document.createElement('span');
  fan.className = 'postcard-stack__fan';
  // Up to three, the newest on top (last in the DOM).
  for (const card of cards.slice(-3)) {
    const sheet = document.createElement('span');
    sheet.className = 'postcard-stack__card';
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    setApiImageSrc(img, travelPhotoUrl(card.photoId, options.shareToken));
    sheet.append(img);
    fan.append(sheet);
  }

  const words = document.createElement('span');
  words.className = 'postcard-stack__words';
  const heading = document.createElement('b');
  heading.textContent = lines.heading;
  const latest = document.createElement('span');
  latest.textContent = lines.latest;
  const detail = document.createElement('span');
  detail.textContent = lines.detail;
  const cta = document.createElement('em');
  cta.textContent = cards.length === 1 ? 'Open it' : 'Open them';
  words.append(heading, latest, detail, cta);

  open.append(fan, words);
  open.addEventListener('click', options.onOpen);
  host.append(open);
}

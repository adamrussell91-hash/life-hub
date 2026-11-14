import type { JournalFixture, JournalMedia, JournalMoment } from '@/journal/types';
import { openInlineWords } from '@/journal/inline-words';
import { reflectionLikelyOverflows } from '@/journal/layout';
import { journalAudioSrc } from '@/journal/media-loading';
import { resolveMomentAuthor } from '@/journal/partner-perspective';
import { isAudioMedia } from '@/journal/transcripts';
import { clock12 } from '@/journal/trip-days';
import { ICONS, button, el, icon } from '@/journal/story/dom';
import { renderPhotoRow } from '@/journal/story/photo-row';
import { renderSoundPlayer } from '@/journal/story/sound-player';

export interface MomentCardOptions {
  fixture: JournalFixture;
  moment: JournalMoment;
  tripId: string;
  /** Position of a photo in the trip-wide list the viewer swipes through. */
  photoIndexOf: (mediaId: string) => number;
  /** First moment on screen: load its lead photo straight away. */
  eager?: boolean;
  /** Filed a moment ago: settles into the page once. */
  isNew?: boolean;
  /** Opens the action sheet. Omitted in read-only previews. */
  onActions?: (moment: JournalMoment, trigger: HTMLElement) => void;
  /** Opens the meal for a moment that has one. */
  onMeal?: (moment: JournalMoment) => void;
  /** Saves new words for the moment. When given, the words are edited by tapping them. */
  onSaveWords?: (moment: JournalMoment, text: string) => Promise<void>;
  /** Told while the words are being edited. */
  onEditingWords?: (editing: boolean) => void;
}

/** Live photos and sound clips attached to a moment, in order. */
export function momentMedia(
  fixture: JournalFixture,
  moment: JournalMoment,
): { photos: JournalMedia[]; sounds: JournalMedia[] } {
  const byId = new Map(fixture.media.map((m) => [m.id, m]));
  const live = moment.media_ids
    .map((id) => byId.get(id))
    .filter((m): m is JournalMedia => Boolean(m) && m!.lifecycle === 'live');
  return {
    photos: live.filter((m) => !isAudioMedia(m)),
    sounds: live.filter((m) => isAudioMedia(m)),
  };
}

function renderWords(text: string): HTMLElement {
  const block = el('div', 'story-moment__words journal-moment__reflection');
  const p = el('p', undefined, text);
  const more = button('story-moment__read-more journal-moment__read-more', 'Read more');
  more.hidden = true;
  block.append(p, more);

  if (reflectionLikelyOverflows(text, 6)) {
    block.classList.add('journal-moment__reflection--clamped');
    requestAnimationFrame(() => {
      const overflows = p.scrollHeight > p.clientHeight + 1 || text.split('\n').length > 6;
      more.hidden = !overflows;
      if (!overflows) block.classList.remove('journal-moment__reflection--clamped');
    });
  }
  more.addEventListener('click', () => {
    block.classList.remove('journal-moment__reflection--clamped');
    more.hidden = true;
  });
  return block;
}

/** One moment: photos, then time and place, then the words and any sound. */
export function renderMomentCard(options: MomentCardOptions): HTMLElement {
  const { fixture, moment, tripId } = options;
  const article = el('article', 'story-moment journal-moment');
  article.id = moment.id;
  if (options.isNew) article.classList.add('story-moment--new');
  article.setAttribute('data-journal-moment', moment.id);

  const partner = resolveMomentAuthor(moment) === 'partner';
  if (partner) article.classList.add('journal-moment--partner');

  const { photos, sounds } = momentMedia(fixture, moment);
  const placeName = moment.place?.name?.trim() ?? '';

  const row = renderPhotoRow({
    tripId,
    photos,
    indexOf: options.photoIndexOf,
    eager: Boolean(options.eager),
    label: placeName,
  });
  if (row) article.append(row);
  else if (moment.text?.trim()) article.classList.add('story-moment--words');

  const body = el('div', 'story-moment__body');

  if (partner) {
    body.append(el('p', 'story-moment__partner', 'Partner’s perspective — not your words'));
  }

  const meta = el('div', 'story-moment__meta');
  const time = clock12(moment.local_time);
  if (time) meta.append(el('span', 'story-moment__time num', time));
  if (placeName) {
    const place = el('span', 'story-moment__place');
    place.append(icon(ICONS.pin), document.createTextNode(placeName));
    meta.append(place);
  }
  if (options.onActions) {
    const more = button('story-moment__more');
    more.setAttribute('aria-label', 'Moment actions');
    more.setAttribute('aria-haspopup', 'dialog');
    more.append(icon(ICONS.more));
    more.addEventListener('click', () => options.onActions?.(moment, more));
    meta.append(more);
  }

  const words = moment.text?.trim() ? renderWords(moment.text) : null;

  // A moment that is only words reads better with the words first.
  if (!row && words) body.append(words, meta);
  else {
    body.append(meta);
    if (words) body.append(words);
  }

  const saveWords = options.onSaveWords;
  if (saveWords) {
    const edit = (host: HTMLElement): void => {
      openInlineWords({
        host,
        text: moment.text ?? '',
        onSave: (text) => saveWords(moment, text),
        onEditingChange: options.onEditingWords,
      });
    };
    if (words) {
      // Tap the words to edit them. A real button follows for keyboards and screen readers.
      const paragraph = words.querySelector('p')!;
      paragraph.classList.add('story-moment__words-text--editable');
      paragraph.addEventListener('click', () => {
        if (window.getSelection()?.toString()) return; // selecting text is not a tap
        edit(words);
      });
      const editBtn = button('story-moment__edit-words', 'Edit words');
      editBtn.addEventListener('click', () => edit(words));
      words.append(editBtn);
    } else {
      const add = button('story-moment__add-line', 'Add a line');
      add.addEventListener('click', () => edit(add));
      body.append(add);
    }
  }

  if (moment.meal) {
    const meal = button('story-moment__meal');
    meal.append(icon(ICONS.meal), document.createTextNode('Meal'));
    meal.setAttribute('aria-label', 'Open the meal for this moment');
    meal.disabled = !options.onMeal;
    meal.addEventListener('click', () => options.onMeal?.(moment));
    meta.after(meal);
  }

  article.append(body);
  for (const sound of sounds) {
    article.append(renderSoundPlayer({ src: journalAudioSrc(tripId, sound), durationS: sound.duration_s }));
  }
  return article;
}

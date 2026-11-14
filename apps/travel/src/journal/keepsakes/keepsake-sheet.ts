import { keepsakeLabel } from '@/journal/keepsakes/draw';
import type { Keepsake } from '@/journal/keepsakes/model';
import { el, ICONS } from '@/journal/story/dom';
import { openStorySheet, sheetRow, type StorySheetHandle } from '@/journal/story/sheet';

export interface KeepsakeSheetOptions {
  anchor: HTMLElement;
  keepsake: Keepsake;
  /** The keepsake drawn, to show large. */
  drawn: HTMLElement;
  /** "Day 3 · Friday 5 March · 10:30 am · Santa Apolónia": whatever is known. */
  meta: string;
  onGoToDay?: () => void;
  /** Omitted for stamps, and when the journal cannot be saved to. */
  onRemove?: () => void;
  onClose?: () => void;
}

/** One keepsake, large, with where and when it is from. */
export function openKeepsakeSheet(options: KeepsakeSheetOptions): StorySheetHandle {
  const { keepsake } = options;
  const sheet = openStorySheet({ anchor: options.anchor, label: 'Keepsake', onClose: options.onClose });

  const view = el('div', 'keep-view');
  const object = el('div', `keep-view__object keep-view__object--${keepsake.type}`);
  object.append(options.drawn);
  view.append(object, el('p', 'keep-view__title', keepsakeLabel(keepsake)));
  if (options.meta) view.append(el('p', 'keep-view__meta num', options.meta));
  if (keepsake.type === 'booking') view.append(el('p', 'keep-view__meta', 'Kept automatically from your booking'));
  if (keepsake.type === 'photo' && keepsake.note) view.append(el('p', 'keep-view__note', keepsake.note));
  sheet.body.append(view);

  if (options.onGoToDay) {
    sheet.body.append(
      sheetRow({
        label: 'Go to that day',
        paths: ICONS.next,
        onSelect: () => {
          sheet.close();
          options.onGoToDay?.();
        },
      }),
    );
  }
  if (options.onRemove) {
    const booking = keepsake.type === 'booking';
    sheet.body.append(
      sheetRow({
        label: booking ? 'Remove from keepsakes' : 'Remove',
        hint: booking ? 'It stays on your itinerary. Trash brings it back.' : 'Moves it to Trash.',
        paths: ICONS.trash,
        danger: true,
        onSelect: () => {
          sheet.close();
          options.onRemove?.();
        },
      }),
    );
  }
  return sheet;
}

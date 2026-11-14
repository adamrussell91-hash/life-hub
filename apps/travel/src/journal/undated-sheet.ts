import { el, ICONS } from '@/journal/story/dom';
import { openStorySheet, sheetRow, type StorySheetHandle } from '@/journal/story/sheet';

export interface UndatedDayChoice {
  legId: string;
  localDate: string;
  /** "Today · Day 3 · Friday 5 March". */
  label: string;
  /** The city. */
  hint?: string;
}

export interface UndatedSheetOptions {
  anchor: HTMLElement;
  files: File[];
  days: UndatedDayChoice[];
  onChoose: (day: UndatedDayChoice) => void;
  onClose?: () => void;
}

/** Photos with no date inside them (screenshots, saved images): the traveller says which day. */
export function openUndatedSheet(options: UndatedSheetOptions): StorySheetHandle {
  const n = options.files.length;
  const urls: string[] = [];
  const sheet = openStorySheet({
    anchor: options.anchor,
    label: 'Choose a day',
    title: n === 1 ? '1 photo has no date' : `${n} photos have no date`,
    subtitle: n === 1 ? 'Which day is it from?' : 'Which day are they from?',
    onClose: () => {
      for (const url of urls) URL.revokeObjectURL(url);
      options.onClose?.();
    },
  });

  const thumbs = el('div', 'undated-thumbs');
  for (const file of options.files.slice(0, 8)) {
    const img = el('img', 'undated-thumbs__img');
    img.alt = '';
    const url = URL.createObjectURL(file);
    urls.push(url);
    img.src = url;
    thumbs.append(img);
  }
  if (n > 8) thumbs.append(el('span', 'undated-thumbs__more num', `+${n - 8}`));
  sheet.body.append(thumbs);

  for (const day of options.days) {
    sheet.body.append(
      sheetRow({
        label: day.label,
        hint: day.hint,
        paths: ICONS.next,
        onSelect: () => {
          sheet.close();
          options.onChoose(day);
        },
      }),
    );
  }
  return sheet;
}

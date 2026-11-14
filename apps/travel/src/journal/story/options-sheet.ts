import { openStorySheet, sheetRow, type StorySheetHandle } from '@/journal/story/sheet';

export interface JournalOption {
  label: string;
  hint?: string;
  paths?: string | string[];
  onSelect: () => void;
}

export interface JournalOptionsSheetOptions {
  anchor: HTMLElement;
  title: string;
  items: JournalOption[];
  onClose?: () => void;
}

/** Search, print, export, share, trash and the rest: the journal-wide actions. */
export function openJournalOptionsSheet(options: JournalOptionsSheetOptions): StorySheetHandle {
  const sheet = openStorySheet({
    anchor: options.anchor,
    label: 'Journal options',
    title: options.title,
    subtitle: 'Journal',
    onClose: options.onClose,
  });
  for (const item of options.items) {
    sheet.body.append(
      sheetRow({
        label: item.label,
        hint: item.hint,
        paths: item.paths,
        onSelect: () => {
          sheet.close();
          item.onSelect();
        },
      }),
    );
  }
  return sheet;
}

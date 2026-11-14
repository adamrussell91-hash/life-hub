import type { JournalFixture, JournalMoment } from '@/journal/types';
import { buildMomentMenuItems, type MomentMenuAction } from '@/journal/moment-menu';
import { clock12, longDate } from '@/journal/trip-days';
import { ICONS } from '@/journal/story/dom';
import { openStorySheet, sheetRow, type StorySheetHandle } from '@/journal/story/sheet';

const ACTION_ICON: Record<MomentMenuAction, string | string[]> = {
  edit: ICONS.edit,
  annotate: ICONS.annotate,
  souvenir: ICONS.keepsake,
  reorder: ICONS.reorder,
  split: ICONS.split,
  merge: ICONS.merge,
  move: ICONS.move,
  delete: ICONS.trash,
};

export interface MomentActionSheetOptions {
  fixture: JournalFixture;
  moment: JournalMoment;
  anchor: HTMLElement;
  onAction: (action: MomentMenuAction) => void;
  onClose?: () => void;
}

/**
 * Everything that can be done to a moment, as a bottom sheet. The same
 * actions as the old popover, with the reason shown under any that are off.
 */
export function openMomentActionSheet(options: MomentActionSheetOptions): StorySheetHandle {
  const { moment } = options;
  const heading = [clock12(moment.local_time), moment.place?.name?.trim()].filter(Boolean).join(' · ');
  const sheet = openStorySheet({
    anchor: options.anchor,
    label: 'Moment actions',
    title: heading || 'This moment',
    subtitle: longDate(moment.local_date),
    onClose: options.onClose,
  });

  for (const item of buildMomentMenuItems(options.fixture, moment)) {
    if (item.action === 'delete') {
      const rule = document.createElement('hr');
      rule.className = 'story-sheet__rule';
      sheet.body.append(rule);
    }
    sheet.body.append(
      sheetRow({
        label: item.label,
        // Touch has no hover tooltip, so a row that is off says why.
        hint: item.disabled ? item.title : undefined,
        paths: ACTION_ICON[item.action],
        danger: item.action === 'delete',
        disabled: item.disabled,
        onSelect: () => {
          // Close first: the next sheet must not be removed by this one closing.
          sheet.close();
          options.onAction(item.action);
        },
      }),
    );
  }
  return sheet;
}

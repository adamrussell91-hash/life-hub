import type { JournalFixture, JournalMoment } from '@/journal/types';

export type MomentMenuAction =
  | 'edit'
  | 'annotate'
  | 'souvenir'
  | 'reorder'
  | 'split'
  | 'merge'
  | 'move'
  | 'delete';

export interface MomentMenuItem {
  action: MomentMenuAction;
  label: string;
  disabled: boolean;
  title: string;
}

function dayMoments(fixture: JournalFixture, moment: JournalMoment): JournalMoment[] {
  return fixture.moments.filter(
    (m) =>
      m.lifecycle === 'live' &&
      m.leg_id === moment.leg_id &&
      m.local_date === moment.local_date,
  );
}

export function buildMomentMenuItems(
  fixture: JournalFixture,
  moment: JournalMoment,
): MomentMenuItem[] {
  const live = moment.lifecycle === 'live';
  const peers = dayMoments(fixture, moment);
  const peerCount = peers.length;
  const mediaCount = moment.media_ids.length;
  const mergeCandidates = peers.filter((m) => m.id !== moment.id).length;

  const items: MomentMenuItem[] = [
    {
      action: 'edit',
      label: 'Edit moment',
      disabled: !live,
      title: live ? 'Edit reflection, time, and place' : 'Deleted moments cannot be edited',
    },
    {
      action: 'annotate',
      label: 'Annotate photos',
      disabled: !live || mediaCount < 1,
      title: !live
        ? 'Deleted moments cannot be annotated'
        : mediaCount < 1
          ? 'Add photos to annotate'
          : 'Add region notes on photos (stored separately from originals)',
    },
    {
      action: 'souvenir',
      label: 'Add souvenir',
      disabled: !live,
      title: live
        ? 'Save a keepsake linked to this moment'
        : 'Deleted moments cannot add souvenirs',
    },
    {
      action: 'reorder',
      label: 'Reorder',
      disabled: !live || peerCount < 2,
      title: !live
        ? 'Deleted moments cannot be reordered'
        : peerCount < 2
          ? 'Need at least two moments this day'
          : 'Change the order moments appear this day',
    },
    {
      action: 'split',
      label: 'Split',
      disabled: !live || mediaCount < 2,
      title: !live
        ? 'Deleted moments cannot be split'
        : mediaCount < 2
          ? 'Need at least two photos to split'
          : 'Split photos into two moments',
    },
    {
      action: 'merge',
      label: 'Merge',
      disabled: !live || mergeCandidates < 1,
      title: !live
        ? 'Deleted moments cannot be merged'
        : mergeCandidates < 1
          ? 'No other moments this day to merge with'
          : 'Combine with another moment this day',
    },
    {
      action: 'move',
      label: 'Move',
      disabled: !live,
      title: live ? 'Move to another leg or day' : 'Deleted moments cannot be moved',
    },
    {
      action: 'delete',
      label: 'Delete',
      disabled: !live,
      title: live ? 'Delete this moment' : 'Already deleted',
    },
  ];

  return items;
}

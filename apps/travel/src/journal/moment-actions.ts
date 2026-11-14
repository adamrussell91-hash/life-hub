import type { JournalDocument } from '@/api/journal';
import type { JournalFixture, JournalMoment } from '@/journal/types';
import type { Trip } from '@/types';
import type { MomentMenuAction } from '@/journal/moment-menu';
import { openEditMomentSheet } from '@/journal/edit-moment-sheet';
import { openMergeSheet } from '@/journal/merge-sheet';
import { openMoveSheet } from '@/journal/move-sheet';
import { openReorderSheet } from '@/journal/reorder-sheet';
import { openSplitSheet } from '@/journal/split-sheet';
import { openDeleteConfirmSheet } from '@/journal/delete-confirm-sheet';
import { openPhotoAnnotationSheet } from '@/journal/annotation-sheet';

export interface MomentActionContext {
  fixture: JournalFixture;
  journal: JournalDocument;
  tripId: string;
  version: string;
  anchor: HTMLElement;
  trip?: Trip;
  onJournalSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  /** Opens "Keep as a keepsake" for a moment. */
  onKeep?: (moment: JournalMoment) => void;
}

/** Opens the sheet for one action on a moment. Returns its handle, or null when there is nothing to open. */
export function runMomentAction(
  action: MomentMenuAction,
  moment: JournalMoment,
  ctx: MomentActionContext,
): { destroy(): void } | null {
  const onSaved = (envelope: { journal: JournalDocument; version: string }): void => ctx.onJournalSaved?.(envelope);
  const base = {
    tripId: ctx.tripId,
    journal: ctx.journal,
    version: ctx.version,
    moment,
    anchor: ctx.anchor,
    onSaved,
  };
  switch (action) {
    case 'edit':
      return openEditMomentSheet({ ...base, trip: ctx.trip });
    case 'annotate': {
      const firstId = moment.media_ids[0];
      const media = firstId ? ctx.fixture.media.find((m) => m.id === firstId) : undefined;
      if (!media) return null;
      return openPhotoAnnotationSheet({
        tripId: ctx.tripId,
        journal: ctx.journal,
        version: ctx.version,
        media,
        anchor: ctx.anchor,
        onSaved,
      });
    }
    case 'souvenir':
      ctx.onKeep?.(moment);
      return null;
    case 'reorder':
      return openReorderSheet(base);
    case 'split':
      return openSplitSheet(base);
    case 'merge':
      return openMergeSheet(base);
    case 'move':
      return openMoveSheet(base);
    case 'delete':
      return openDeleteConfirmSheet({
        ...base,
        target: { kind: 'moment', id: moment.id },
        moment,
        onClose: () => {},
      });
    default:
      return null;
  }
}

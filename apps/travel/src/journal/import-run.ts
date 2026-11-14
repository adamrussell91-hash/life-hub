/**
 * Bringing photos in with no screen in the way: read each photo once, group
 * them into moments, and save. The status strip and the "Choose a day" sheet
 * sit on top of this; nothing here touches the page.
 */
import type { JournalDocument } from '@/api/journal';
import { bootstrapJournalForFirstMoment, resolveCaptureContext } from '@/journal/capture-context';
import { applySoftDelete } from '@/journal/delete-flow';
import { inspectFile } from '@/journal/exif-worker';
import { proposeGroups, type InspectedPhoto, type ProposedMoment } from '@/journal/import-group';
import { applyGroupLayout, createImportFile, saveImportProposal, transitionImportFile } from '@/journal/import-review';
import { dropQueuedJournalMedia, flushJournalOutbox, queueJournalMedia } from '@/journal/journal-outbox';
import { isFixtureVersion, persistJournalPatch, type PersistedJournal } from '@/journal/journal-sheet-save';
import { rememberLocalJournalMedia } from '@/journal/media-loading';
import { buildJournalMediaRow, makeMediaId, normalizeMediaContentType } from '@/journal/media-upload';
import { makeMomentId } from '@/journal/moment-operations';
import type { JournalMedia, JournalMoment } from '@/journal/types';

/** The phone has no room left to hold the photos until they upload. */
export class ImportSpaceError extends Error {
  constructor() {
    super('This phone is out of space for these photos');
    this.name = 'ImportSpaceError';
  }
}

/** How many photos are read at once. More than this and a phone starts to stall. */
export const IMPORT_READ_CONCURRENCY = 3;

export interface ReadPhoto {
  file: File;
  photo: InspectedPhoto;
}

export interface ReadPhotosResult {
  /** Photos with a capture time: these file themselves. */
  ready: ReadPhoto[];
  /** No capture time inside the photo (screenshots, saved images). The traveller chooses a day. */
  undated: ReadPhoto[];
  /** Already in the journal, or chosen twice in this batch. */
  alreadyHere: number;
  /** In the journal's Trash: restoring is the traveller's call. */
  inTrash: number;
  /** Could not be read at all. */
  unreadable: number;
}

export interface ReadPhotosOptions {
  knownChecksums: Iterable<string>;
  deletedChecksums: Iterable<string>;
  onProgress?: (done: number, total: number) => void;
  /** Replaced in tests. */
  inspect?: (file: File) => Promise<InspectedPhoto>;
  concurrency?: number;
}

/** Read every chosen photo once: its checksum, capture time, place and size. */
export async function readPhotos(files: File[], options: ReadPhotosOptions): Promise<ReadPhotosResult> {
  const inspect = options.inspect ?? inspectFile;
  const known = new Set(options.knownChecksums);
  const deleted = new Set(options.deletedChecksums);
  const result: ReadPhotosResult = { ready: [], undated: [], alreadyHere: 0, inTrash: 0, unreadable: 0 };
  const read: Array<ReadPhoto | null> = new Array(files.length).fill(null);

  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const index = next++;
      const file = files[index]!;
      try {
        read[index] = { file, photo: await inspect(file) };
      } catch {
        read[index] = null;
      }
      done += 1;
      options.onProgress?.(done, files.length);
    }
  };
  const lanes = Math.max(1, Math.min(options.concurrency ?? IMPORT_READ_CONCURRENCY, files.length));
  await Promise.all(Array.from({ length: lanes }, worker));

  // Sorted out in the order the photos were chosen, so the counts never depend on read timing.
  for (const item of read) {
    if (!item) {
      result.unreadable += 1;
      continue;
    }
    const { checksum } = item.photo;
    if (deleted.has(checksum)) {
      result.inTrash += 1;
      continue;
    }
    if (known.has(checksum)) {
      result.alreadyHere += 1;
      continue;
    }
    known.add(checksum);
    if (item.photo.needs_date || !item.photo.capture_wall_time) result.undated.push(item);
    else result.ready.push(item);
  }
  return result;
}

export interface FileImportOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  tripTitle?: string;
  items: ReadPhoto[];
  /** File everything as one moment on this day (photos with no date of their own). */
  day?: { legId: string; localDate: string };
}

export interface FiledImport {
  envelope: PersistedJournal;
  /** New moments in story order. */
  momentIds: string[];
  mediaIds: string[];
}

function groupsFor(options: FileImportOptions): ProposedMoment[] {
  const photos = options.items.map((item) => item.photo);
  if (options.day) {
    const located = photos.find((p) => p.coordinates);
    return [
      {
        checksums: photos.map((p) => p.checksum),
        duplicate_checksums: [],
        leg_id: options.day.legId,
        local_date: options.day.localDate,
        local_time: null,
        coordinates: located?.coordinates,
        unlocated: !located,
      },
    ];
  }
  return proposeGroups(photos, { legs: options.journal.legs.filter((leg) => leg.lifecycle === 'live') });
}

/**
 * Add photos to the journal as moments. Bytes go into the phone's outbox
 * first, then one save adds the moments; uploads carry on in the background.
 * Throws when the phone is out of space or the save fails, leaving nothing half-filed.
 */
export async function fileImport(options: FileImportOptions): Promise<FiledImport> {
  const live = !isFixtureVersion(options.version);
  const byChecksum = new Map(options.items.map((item) => [item.photo.checksum, item]));
  const fallback = resolveCaptureContext(options.journal);
  let journal = options.journal;
  const queued: string[] = [];
  const previews: Array<[string, Blob]> = [];
  const momentIds: string[] = [];

  try {
    for (const group of groupsFor(options)) {
      const legId = group.leg_id ?? fallback?.legId;
      const localDate = group.local_date ?? fallback?.localDate;
      if (!legId || !localDate) continue;
      const members = [...new Set(group.checksums)].map((c) => byChecksum.get(c)).filter((m): m is ReadPhoto => Boolean(m));
      if (!members.length) continue;
      journal = bootstrapJournalForFirstMoment(journal, legId, localDate, options.tripTitle?.trim() || 'Trip');

      const media: JournalMedia[] = [];
      for (const { file, photo } of members) {
        const mediaId = makeMediaId();
        const contentType = normalizeMediaContentType(file, photo.mime || 'image/jpeg');
        media.push(
          await buildJournalMediaRow(mediaId, file, contentType, {
            checksum: photo.checksum,
            width: photo.width,
            height: photo.height,
          }),
        );
        if (live) {
          queued.push(mediaId);
          try {
            await queueJournalMedia(
              { tripId: options.tripId, mediaId, blob: file, contentType, checksum: photo.checksum },
              { flush: false },
            );
          } catch {
            throw new ImportSpaceError();
          }
        }
        previews.push([mediaId, file]);
      }

      const peers = journal.moments.filter((m) => m.leg_id === legId && m.local_date === localDate);
      const moment: JournalMoment = {
        id: makeMomentId(),
        leg_id: legId,
        local_date: localDate,
        local_time: group.local_time ?? undefined,
        coordinates: group.coordinates,
        location_source: group.coordinates ? 'exif' : undefined,
        media_ids: media.map((m) => m.id),
        display_order: peers.reduce((max, m) => Math.max(max, m.display_order), 0) + 1,
        lifecycle: 'live',
      };
      momentIds.push(moment.id);
      journal = { ...journal, media: [...journal.media, ...media], moments: [...journal.moments, moment] };
    }
    if (!momentIds.length) throw new Error('Nothing to file');

    journal = { ...journal, revision: journal.revision + 1 };
    const envelope = await persistJournalPatch(options.tripId, options.version, journal);
    for (const [id, blob] of previews) rememberLocalJournalMedia(id, blob);
    if (live) void flushJournalOutbox();
    return { envelope, momentIds, mediaIds: previews.map(([id]) => id) };
  } catch (error) {
    await dropQueuedJournalMedia(queued);
    throw error;
  }
}

/** Take back an import: its moments and photos go to Trash, where they can be restored. */
export function undoImport(journal: JournalDocument, momentIds: string[]): JournalDocument {
  let next = journal;
  for (const id of momentIds) next = applySoftDelete(next, { kind: 'moment', id });
  return next;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "Filed 12 photos into 4 moments", and what was left out and why. */
export function filedSummary(counts: {
  photos: number;
  moments: number;
  alreadyHere?: number;
  inTrash?: number;
  unreadable?: number;
}): { headline: string; notes: string[] } {
  const headline =
    counts.photos > 0
      ? `Filed ${plural(counts.photos, 'photo')} into ${plural(counts.moments, 'moment')}`
      : 'Nothing new to file';
  const notes: string[] = [];
  if (counts.alreadyHere) notes.push(counts.alreadyHere === 1 ? '1 was already here' : `${counts.alreadyHere} were already here`);
  if (counts.inTrash) notes.push(counts.inTrash === 1 ? '1 is in Trash' : `${counts.inTrash} are in Trash`);
  if (counts.unreadable) notes.push(`${plural(counts.unreadable, 'file')} could not be read`);
  return { headline, notes };
}

/**
 * Keep photos that could not be saved on the phone, the way an interrupted
 * import is kept, so the import sheet can finish the job later.
 */
export async function keepInterruptedImport(tripId: string, journal: JournalDocument, items: ReadPhoto[]): Promise<void> {
  const groups = proposeGroups(
    items.map((item) => item.photo),
    { legs: journal.legs.filter((leg) => leg.lifecycle === 'live') },
  );
  let files = items.map(({ file, photo }) => {
    let entry = createImportFile(tripId, photo.checksum, file.name);
    entry = transitionImportFile(entry, { type: 'start_inspect' });
    entry = { ...entry, inspected: photo };
    return transitionImportFile(entry, { type: 'inspected' });
  });
  files = applyGroupLayout(files, groups);
  await saveImportProposal(
    { tripId, updatedAt: new Date().toISOString(), groups, files },
    new Map(items.map(({ file, photo }) => [photo.checksum, file as Blob])),
  );
}

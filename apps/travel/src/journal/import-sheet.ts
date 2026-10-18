import type { JournalFixture } from '@/journal/types';
import { inspectFile } from '@/journal/exif-worker';
import { proposeGroups, type InspectedPhoto, type ProposedMoment } from '@/journal/import-group';
import {
  applyGroupLayout,
  clearImportProposal,
  createImportFile,
  deriveBatchSummary,
  duplicateSkipReason,
  importFileNeedsBlob,
  loadImportProposal,
  mergeMomentGroups,
  saveImportProposal,
  splitMomentGroup,
  stableOperationId,
  transitionImportFile,
  type ImportFileEntry,
} from '@/journal/import-review';
import type { JournalDocument } from '@/api/journal';
import type { JournalMedia, JournalMoment } from '@/journal/types';
import {
  bootstrapJournalForFirstMoment,
  resolveCaptureContext,
} from '@/journal/capture-context';
import { persistJournalPatch, type PersistedJournal } from '@/journal/journal-sheet-save';
import { buildJournalMediaRow, makeMediaId, normalizeMediaContentType } from '@/journal/media-upload';
import { dropQueuedJournalMedia, queueJournalMedia } from '@/journal/journal-outbox';
import { rememberLocalJournalMedia } from '@/journal/media-loading';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import { makeMomentId } from '@/journal/moment-operations';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

export interface OpenImportSheetOptions {
  fixture: JournalFixture;
  knownChecksums?: string[];
  deletedChecksums?: string[];
  /** Current journal and version (not the copy from page load). */
  journal: JournalDocument;
  version: string;
  tripTitle?: string;
  anchor: HTMLElement;
  onClose?: () => void;
  onSaved?: (envelope: PersistedJournal) => void;
  /** Pre-selected files (e.g. from capture sheet multi-photo handoff). */
  initialFiles?: File[];
}

export function openImportSheet(options: OpenImportSheetOptions): { destroy(): void } {
  const tripId = options.fixture.trip_id;
  const known = new Set(options.knownChecksums ?? []);
  const deleted = new Set(options.deletedChecksums ?? []);
  const blobs = new Map<string, Blob>();
  let files: ImportFileEntry[] = [];
  let groups: ProposedMoment[] = [];
  let destroyed = false;
  let committing = false;
  let overlay: JournalOverlayHandle | null = null;
  attachVisualViewportInset();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-import-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Import photos');

  const title = document.createElement('h3');
  title.textContent = 'Import photos';

  const header = document.createElement('div');
  header.className = 'journal-import__header';

  const counts = document.createElement('p');
  counts.className = 'journal-import__counts';

  const disclosure = document.createElement('details');
  disclosure.className = 'journal-import__disclosure';
  const disclosureSummary = document.createElement('summary');
  disclosureSummary.textContent = 'Duplicates and missing dates';
  const disclosureBody = document.createElement('div');
  disclosureBody.className = 'journal-import__disclosure-body';
  disclosure.append(disclosureSummary, disclosureBody);

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;

  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  const groupList = document.createElement('div');
  groupList.className = 'journal-import__groups';

  const progress = document.createElement('p');
  progress.className = 'journal-import__progress';
  progress.hidden = true;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png';
  fileInput.multiple = true;
  fileInput.hidden = true;

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'btn btn--secondary';
  pickBtn.textContent = 'Choose photos';

  const missingBanner = document.createElement('div');
  missingBanner.className = 'journal-import__missing-blobs';
  missingBanner.hidden = true;
  const missingText = document.createElement('p');
  missingText.className = 'journal-import__missing-blobs-text';
  const reselectBtn = document.createElement('button');
  reselectBtn.type = 'button';
  reselectBtn.className = 'btn btn--secondary';
  reselectBtn.textContent = 'Choose photos again';
  missingBanner.append(missingText, reselectBtn);

  let reselectMode = false;

  const actions = document.createElement('div');
  actions.className = 'addform__actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Add photos';

  function refreshMissingBlobBanner(): void {
    const missing = files.filter((f) => importFileNeedsBlob(f, blobs));
    missingBanner.hidden = missing.length === 0;
    if (missing.length) {
      missingText.textContent = `${missing.length} photo${missing.length === 1 ? '' : 's'} must be selected again before upload can continue.`;
    }
  }

  function refreshHeader(): void {
    const momentCount = groups.length;
    counts.textContent = `${files.length} photo${files.length === 1 ? '' : 's'} · ${momentCount} proposed moment${momentCount === 1 ? '' : 's'}`;

    const dupLines: string[] = [];
    const dateLines: string[] = [];
    for (const f of files) {
      if (f.skipReason) dupLines.push(`${f.name}: ${f.skipReason}`);
    }
    for (const g of groups) {
      if (g.needs_date) dateLines.push(`Moment (${g.checksums.length} photos): needs capture date`);
      if (g.duplicate_checksums.length) {
        dupLines.push(`${g.duplicate_checksums.length} duplicate in batch`);
      }
    }
    disclosureBody.replaceChildren();
    if (!dupLines.length && !dateLines.length) {
      disclosure.hidden = true;
    } else {
      disclosure.hidden = false;
      for (const line of [...dupLines, ...dateLines]) {
        const p = document.createElement('p');
        p.textContent = line;
        disclosureBody.append(p);
      }
    }

    const summary = deriveBatchSummary(files);
    saveBtn.disabled =
      committing ||
      summary.inspecting > 0 ||
      importableFiles().length === 0 ||
      files.some((f) => importFileNeedsBlob(f, blobs));
    const count = importableFiles().length;
    saveBtn.textContent = committing
      ? 'Adding…'
      : count === 0
        ? 'Add photos'
        : count === 1
          ? 'Add 1 photo'
          : `Add ${count} photos`;
    if (summary.inspecting > 0) {
      progress.hidden = false;
      progress.textContent = 'Reading photo dates and places…';
    } else {
      progress.hidden = true;
    }
    refreshMissingBlobBanner();
  }

  function renderGroups(): void {
    groupList.replaceChildren();
    groups.forEach((g, gi) => {
      const card = document.createElement('div');
      card.className = 'journal-import__group';
      const label = document.createElement('p');
      const when = g.local_date
        ? `${g.local_date}${g.local_time ? ` ${g.local_time}` : ''}`
        : 'Needs date';
      label.textContent = `Moment ${gi + 1} · ${g.checksums.length} photo${g.checksums.length === 1 ? '' : 's'} · ${when}`;
      const row = document.createElement('div');
      row.className = 'journal-import__group-actions';
      const split = document.createElement('button');
      split.type = 'button';
      split.className = 'btn btn--ghost';
      split.textContent = 'Split group';
      split.disabled = g.checksums.length < 2;
      split.addEventListener('click', () => {
        groups = splitMomentGroup(groups, gi);
        files = applyGroupLayout(files, groups);
        void persist();
        renderGroups();
        refreshHeader();
      });
      const merge = document.createElement('button');
      merge.type = 'button';
      merge.className = 'btn btn--ghost';
      merge.textContent = 'Merge with next';
      merge.disabled = gi >= groups.length - 1;
      merge.addEventListener('click', () => {
        groups = mergeMomentGroups(groups, gi, gi + 1);
        files = applyGroupLayout(files, groups);
        void persist();
        renderGroups();
        refreshHeader();
      });
      row.append(split, merge);
      card.append(label, row);
      groupList.append(card);
    });
    refreshHeader();
  }

  async function persist(): Promise<void> {
    await saveImportProposal(
      { tripId, updatedAt: new Date().toISOString(), groups, files },
      blobs
    );
  }

  async function reselectBlobs(selected: File[]): Promise<void> {
    for (const file of selected) {
      const photo = await inspectFile(file);
      const idx = files.findIndex((f) => f.checksum === photo.checksum);
      if (idx < 0) continue;
      blobs.set(photo.checksum, file);
      const entry = files[idx]!;
      files[idx] = {
        ...entry,
        name: file.name,
        inspected: photo,
      };
    }
    await persist();
    renderGroups();
  }

  async function inspectBatch(selected: File[]): Promise<void> {
    files = [];
    refreshHeader();

    const inspected: InspectedPhoto[] = [];
    for (const file of selected) {
      let entry = createImportFile(tripId, `sel_${file.name}_${file.size}`, file.name);
      entry = transitionImportFile(entry, { type: 'start_inspect' });
      files.push(entry);
      refreshHeader();

      const photo = await inspectFile(file);
      blobs.set(photo.checksum, file);
      const skip = duplicateSkipReason(photo.checksum, known, deleted);
      entry = {
        ...entry,
        checksum: photo.checksum,
        inspected: photo,
        operationId: stableOperationId(tripId, photo.checksum),
      };
      if (skip) {
        entry = transitionImportFile(entry, { type: 'duplicate_skip', reason: skip });
        known.add(photo.checksum);
      } else {
        entry = transitionImportFile(entry, { type: 'inspected' });
        inspected.push(photo);
      }
      files[files.length - 1] = entry;
      refreshHeader();
    }

    groups = proposeGroups(inspected, {
      legs: options.fixture.legs,
      known_checksums: [...known],
    });
    files = applyGroupLayout(files, groups);
    await persist();
    renderGroups();
  }

  function importableFiles(): ImportFileEntry[] {
    return files.filter((f) => !f.skipReason && f.inspected && f.state !== 'inspecting');
  }

  /**
   * Add the reviewed groups to the journal: photo bytes go into the device
   * outbox first, then one save adds the moments and media rows. Uploading
   * carries on in the background (and after a reload) until each photo is
   * verified on the server.
   */
  async function commitImport(): Promise<void> {
    if (committing) return;
    if (files.some((f) => importFileNeedsBlob(f, blobs))) return;
    committing = true;
    status.hidden = true;
    refreshHeader();

    const fallback = resolveCaptureContext(options.journal);
    let journal = options.journal;
    const queued: string[] = [];
    const previews: [string, Blob][] = [];
    try {
      for (const [gi, group] of groups.entries()) {
        const groupFiles = importableFiles().filter((f) => f.groupIndex === gi);
        if (!groupFiles.length) continue;
        const legId = group.leg_id ?? fallback?.legId;
        const localDate = group.local_date ?? fallback?.localDate;
        if (!legId || !localDate) continue;
        journal = bootstrapJournalForFirstMoment(
          journal,
          legId,
          localDate,
          options.tripTitle?.trim() || 'Trip',
        );
        const media: JournalMedia[] = [];
        for (const f of groupFiles) {
          const blob = blobs.get(f.checksum)!;
          const mediaId = f.mediaId ?? makeMediaId();
          const contentType = normalizeMediaContentType(blob, f.inspected?.mime || 'image/jpeg');
          const row = await buildJournalMediaRow(mediaId, blob, contentType);
          media.push(row);
          await queueJournalMedia({ tripId, mediaId, blob, contentType });
          queued.push(mediaId);
          previews.push([mediaId, blob]);
        }
        const peers = journal.moments.filter(
          (m) => m.leg_id === legId && m.local_date === localDate,
        );
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
        journal = {
          ...journal,
          media: [...journal.media, ...media],
          moments: [...journal.moments, moment],
        };
      }
      journal = { ...journal, revision: journal.revision + 1 };
      const envelope = await persistJournalPatch(tripId, options.version, journal);
      for (const [id, blob] of previews) rememberLocalJournalMedia(id, blob);
      await clearImportProposal(tripId);
      options.onSaved?.(envelope);
      destroy();
      showHubToast(
        envelope.queued
          ? 'Saved on this phone. Photos will upload when you are back online.'
          : `Added ${previews.length} photo${previews.length === 1 ? '' : 's'}. Uploading in the background…`,
      );
    } catch {
      await dropQueuedJournalMedia(queued);
      committing = false;
      status.hidden = false;
      status.textContent = 'Could not add the photos. Nothing was lost — try again.';
      refreshHeader();
    }
  }

  pickBtn.addEventListener('click', () => {
    reselectMode = false;
    fileInput.click();
  });
  reselectBtn.addEventListener('click', () => {
    reselectMode = true;
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const list = fileInput.files ? [...fileInput.files] : [];
    if (!list.length) return;
    if (reselectMode) void reselectBlobs(list);
    else void inspectBatch(list);
    reselectMode = false;
    fileInput.value = '';
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void commitImport();
  });

  cancelBtn.addEventListener('click', () => destroy());

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    overlay?.release();
    options.onClose?.();
  }

  const status = document.createElement('p');
  status.className = 'journal-sheet__status';
  status.setAttribute('role', 'alert');
  status.hidden = true;

  scroll.append(missingBanner, pickBtn, groupList, progress, status, fileInput);
  form.append(scroll, actions);
  actions.append(cancelBtn, saveBtn);
  header.append(counts, disclosure);
  sheet.append(title, header, form);
  back.append(sheet);
  overlay = presentJournalOverlay(back, {
    anchor: options.anchor,
    // Never drop a half-finished import on a stray tap; it is also kept on
    // the device and offered again next time.
    dismiss: () => {
      if (!committing) destroy();
    },
    initialFocus: saveBtn,
  });

  void (async () => {
    if (options.initialFiles?.length) {
      await inspectBatch(options.initialFiles);
      return;
    }
    const restored = await loadImportProposal(tripId);
    if (!restored || destroyed) return;
    files = restored.snapshot.files;
    groups = restored.snapshot.groups;
    for (const [c, b] of restored.blobs) blobs.set(c, b);
    renderGroups();
  })();

  return { destroy };
}

export async function dismissImportProposal(tripId: string): Promise<void> {
  await clearImportProposal(tripId);
}

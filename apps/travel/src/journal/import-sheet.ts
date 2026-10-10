import type { JournalFixture } from '@/journal/types';
import { inspectFile } from '@/journal/exif-worker';
import { proposeGroups, type InspectedPhoto, type ProposedMoment } from '@/journal/import-group';
import {
  applyGroupLayout,
  clearImportProposal,
  createImportFile,
  deriveBatchOutcome,
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
import { UploadQueue } from '@/journal/upload-queue';
import {
  uploadJournalMediaWithProgress,
  verifyJournalMedia,
  type JournalMediaSignInput,
} from '@/api/journal-media';

export interface OpenImportSheetOptions {
  fixture: JournalFixture;
  knownChecksums?: string[];
  deletedChecksums?: string[];
  journalVersion?: string;
  anchor: HTMLElement;
  onClose?: () => void;
  onUploadComplete?: (summary: { complete: number; failed: number }) => void;
}

function makeMediaId(): string {
  return `med_${Math.random().toString(36).slice(2, 10)}`;
}

export function openImportSheet(options: OpenImportSheetOptions): { destroy(): void } {
  const tripId = options.fixture.trip_id;
  const known = new Set(options.knownChecksums ?? []);
  const deleted = new Set(options.deletedChecksums ?? []);
  const blobs = new Map<string, Blob>();
  let files: ImportFileEntry[] = [];
  let groups: ProposedMoment[] = [];
  let destroyed = false;

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
  form.className = 'addform__form';
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
  saveBtn.textContent = 'Upload';

  function refreshMissingBlobBanner(): void {
    const missing = files.filter((f) => importFileNeedsBlob(f, blobs));
    missingBanner.hidden = missing.length === 0;
    if (missing.length) {
      missingText.textContent = `${missing.length} photo${missing.length === 1 ? '' : 's'} must be selected again before upload can continue.`;
    }
  }

  function refreshHeader(): void {
    const uploadable = files.filter((f) => !f.skipReason && f.state !== 'complete');
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
    const outcome = deriveBatchOutcome(summary);
    saveBtn.disabled =
      !files.length ||
      summary.inspecting > 0 ||
      summary.uploading > 0 ||
      (outcome !== 'in_progress' && summary.proposed === 0 && summary.partial === 0 && summary.failed === 0);
    if (summary.uploading > 0 || summary.partial > 0) {
      progress.hidden = false;
      progress.textContent = `Uploading… ${summary.complete}/${uploadable.length} complete`;
    } else if (outcome === 'partial') {
      progress.hidden = false;
      progress.textContent = `${summary.complete} saved, ${summary.failed} failed — retry failed`;
      saveBtn.textContent = 'Retry failed';
    } else if (outcome === 'all_complete') {
      progress.hidden = false;
      progress.textContent = 'All uploads complete';
      saveBtn.textContent = 'Done';
    } else {
      progress.hidden = true;
      saveBtn.textContent = 'Upload';
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

  async function runUpload(): Promise<void> {
    const queue = new UploadQueue({
      concurrency: 2,
      upload: async (task) => {
        const signInput: JournalMediaSignInput = {
          trip_id: task.tripId,
          media_id: task.mediaId,
          content_type: task.contentType,
          byte_size: task.byteSize,
          checksum: task.checksum,
          purpose: 'original',
        };
        const idx = files.findIndex((f) => f.operationId === task.operationId);
        if (idx >= 0) {
          files[idx] = transitionImportFile(files[idx]!, { type: 'start_upload' });
          refreshHeader();
        }
        await uploadJournalMediaWithProgress(signInput, task.file, () => {
          refreshHeader();
        });
        if (idx >= 0) {
          files[idx] = transitionImportFile(files[idx]!, { type: 'upload_put_done' });
        }
        if (options.journalVersion) {
          try {
            await verifyJournalMedia({
              ...signInput,
              if_version: options.journalVersion,
              action: 'verify',
            });
            if (idx >= 0) {
              files[idx] = transitionImportFile(files[idx]!, { type: 'upload_verified' });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Verify failed';
            if (idx >= 0) {
              files[idx] = transitionImportFile(files[idx]!, {
                type: 'upload_verify_failed',
                message,
              });
            }
            throw err;
          }
        } else if (idx >= 0) {
          files[idx] = transitionImportFile(files[idx]!, { type: 'upload_verified' });
        }
        queue.markComplete(task.operationId);
        await persist();
        refreshHeader();
      },
    });

    const tasks = files
      .filter(
        (f) =>
          !f.skipReason &&
          (f.state === 'proposed' || f.state === 'failed' || f.state === 'partially_complete')
      )
      .map((f) => {
        const blob = blobs.get(f.checksum);
        if (!blob) throw new Error(`Missing blob for ${f.name}`);
        return {
          operationId: f.operationId,
          checksum: f.checksum,
          file: blob,
          tripId,
          mediaId: makeMediaId(),
          contentType: f.inspected?.mime ?? blob.type ?? 'image/jpeg',
          byteSize: blob.size,
        };
      });

    saveBtn.disabled = true;
    const results = await queue.enqueue(tasks);
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const r = results.get(f.operationId);
      if (!r || f.skipReason) continue;
      if (!r.ok && f.state === 'uploading') {
        files[i] = transitionImportFile(f, {
          type: 'upload_failed',
          message: r.error ?? 'Upload failed',
        });
      }
    }
    await persist();
    refreshHeader();
    const summary = deriveBatchSummary(files);
    options.onUploadComplete?.({ complete: summary.complete, failed: summary.failed });
    saveBtn.disabled = false;
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
    const outcome = deriveBatchOutcome(deriveBatchSummary(files));
    if (outcome === 'all_complete') {
      destroy();
      return;
    }
    void runUpload();
  });

  cancelBtn.addEventListener('click', () => destroy());

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    back.remove();
    options.onClose?.();
  }

  back.addEventListener('click', (ev) => {
    if (ev.target === back) destroy();
  });

  scroll.append(missingBanner, pickBtn, groupList, progress, fileInput);
  form.append(scroll, actions);
  actions.append(cancelBtn, saveBtn);
  header.append(counts, disclosure);
  sheet.append(title, header, form);
  back.append(sheet);
  options.anchor.append(back);

  void (async () => {
    const restored = await loadImportProposal(tripId);
    if (!restored || destroyed) return;
    files = restored.snapshot.files;
    groups = restored.snapshot.groups;
    for (const [c, b] of restored.blobs) blobs.set(c, b);
    renderGroups();
  })();

  saveBtn.focus();
  return { destroy };
}

export async function dismissImportProposal(tripId: string): Promise<void> {
  await clearImportProposal(tripId);
}

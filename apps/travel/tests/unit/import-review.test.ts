import { describe, expect, it, vi } from 'vitest';
import {
  applyGroupLayout,
  createImportFile,
  deriveBatchOutcome,
  deriveBatchSummary,
  importFileNeedsBlob,
  journalImportChecksums,
  mergeMomentGroups,
  splitMomentGroup,
  stableOperationId,
  transitionImportFile,
  type ImportFileEntry,
} from '@/journal/import-review';
import type { ProposedMoment } from '@/journal/import-group';
import { UploadQueue } from '@/journal/upload-queue';

function file(partial: Partial<ImportFileEntry> & { checksum: string }): ImportFileEntry {
  return {
    localId: partial.localId ?? `loc_${partial.checksum.slice(0, 6)}`,
    name: partial.name ?? 'photo.jpg',
    state: partial.state ?? 'selected',
    operationId: partial.operationId ?? stableOperationId('trp_test', partial.checksum),
    groupIndex: partial.groupIndex ?? 0,
    ...partial,
  };
}

describe('journalImportChecksums', () => {
  const checksum = 'a'.repeat(64);

  it('splits live vs deleted media checksums', () => {
    const ctx = journalImportChecksums({
      id: 'jrn_test',
      schema_version: 1,
      trip_id: 'trp_test',
      title: 't',
      revision: 1,
      lifecycle: 'live',
      legs: [],
      days: [],
      moments: [],
      transitions: [],
      media: [
        { id: 'med_1', url: '/x', width: 1, height: 1, lifecycle: 'live', checksum },
        {
          id: 'med_2',
          url: '/y',
          width: 1,
          height: 1,
          lifecycle: 'deleted',
          checksum: 'b'.repeat(64),
        },
      ],
    });
    expect(ctx.knownChecksums).toEqual([checksum]);
    expect(ctx.deletedChecksums).toEqual(['b'.repeat(64)]);
  });
});

describe('importFileNeedsBlob', () => {
  it('flags non-terminal files without blobs', () => {
    const entry = file({ checksum: 'c'.repeat(64), state: 'proposed' });
    expect(importFileNeedsBlob(entry, new Map())).toBe(true);
    expect(importFileNeedsBlob(entry, new Map([[entry.checksum, new Blob()]]))).toBe(false);
    expect(importFileNeedsBlob(file({ checksum: 'd'.repeat(64), state: 'complete' }), new Map())).toBe(
      false
    );
  });
});

describe('stableOperationId', () => {
  it('is stable for the same trip and checksum', () => {
    const a = stableOperationId('trp_x', 'a'.repeat(64));
    const b = stableOperationId('trp_x', 'a'.repeat(64));
    expect(a).toBe(b);
    expect(a).toMatch(/^op_imp_/);
  });
});

describe('transitionImportFile', () => {
  it('walks selected → inspecting → proposed → uploading → complete', () => {
    let f = createImportFile('trp_test', 'a'.repeat(64), 'a.jpg');
    f = transitionImportFile(f, { type: 'start_inspect' });
    expect(f.state).toBe('inspecting');
    f = transitionImportFile(f, { type: 'inspected' });
    expect(f.state).toBe('proposed');
    f = transitionImportFile(f, { type: 'start_upload' });
    expect(f.state).toBe('uploading');
    f = transitionImportFile(f, { type: 'upload_verified' });
    expect(f.state).toBe('complete');
  });

  it('marks duplicates as complete on skip without upload', () => {
    let f = createImportFile('trp_test', 'b'.repeat(64), 'dup.jpg');
    f = transitionImportFile(f, { type: 'start_inspect' });
    f = transitionImportFile(f, {
      type: 'duplicate_skip',
      reason: 'Already on this journal',
    });
    expect(f.state).toBe('complete');
    expect(f.skipReason).toContain('Already');
  });

  it('uses partially_complete when verify fails after upload', () => {
    let f = file({ checksum: 'c'.repeat(64), state: 'uploading' });
    f = transitionImportFile(f, { type: 'upload_put_done' });
    expect(f.state).toBe('partially_complete');
    f = transitionImportFile(f, { type: 'upload_verify_failed', message: 'checksum mismatch' });
    expect(f.state).toBe('partially_complete');
    expect(f.error).toBe('checksum mismatch');
    f = transitionImportFile(f, { type: 'retry_upload' });
    expect(f.state).toBe('uploading');
    expect(f.operationId).toBe(stableOperationId('trp_test', 'c'.repeat(64)));
  });
});

describe('deriveBatchSummary', () => {
  it('does not collapse partial success into all-failed or all-saved', () => {
    const files = [
      file({ checksum: '1'.repeat(64), state: 'complete' }),
      file({ checksum: '2'.repeat(64), state: 'complete' }),
      file({ checksum: '3'.repeat(64), state: 'failed', error: 'network' }),
    ];
    const summary = deriveBatchSummary(files);
    expect(summary.complete).toBe(2);
    expect(summary.failed).toBe(1);
    expect(deriveBatchOutcome(summary)).toBe('partial');
    expect(deriveBatchOutcome({ ...summary, failed: 0, complete: 3 })).toBe('all_complete');
    expect(deriveBatchOutcome({ ...summary, complete: 0, failed: 3 })).toBe('all_failed');
  });
});

describe('splitMomentGroup / mergeMomentGroups', () => {
  const moment = (checksums: string[]): ProposedMoment => ({
    checksums,
    duplicate_checksums: [],
    leg_id: 'leg_1',
    local_date: '2026-04-06',
    local_time: '10:00',
    unlocated: false,
  });

  it('splits one photo out of a group', () => {
    const groups = [moment(['aa', 'bb', 'cc'])];
    const next = splitMomentGroup(groups, 0);
    expect(next).toHaveLength(2);
    expect(next[0]!.checksums).toEqual(['aa']);
    expect(next[1]!.checksums).toEqual(['bb', 'cc']);
  });

  it('merges adjacent groups', () => {
    const groups = [moment(['aa']), moment(['bb'])];
    const merged = mergeMomentGroups(groups, 0, 1);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.checksums).toEqual(['aa', 'bb']);
  });
});

describe('applyGroupLayout', () => {
  it('assigns groupIndex from proposed moments', () => {
    const groups: ProposedMoment[] = [
      { checksums: ['a'], duplicate_checksums: [], leg_id: null, local_date: null, local_time: null, unlocated: true },
      { checksums: ['b', 'c'], duplicate_checksums: [], leg_id: null, local_date: null, local_time: null, unlocated: true },
    ];
    const files = [
      file({ checksum: 'a', groupIndex: 99 }),
      file({ checksum: 'b', groupIndex: 99 }),
      file({ checksum: 'c', groupIndex: 99 }),
    ];
    const laid = applyGroupLayout(files, groups);
    expect(laid.find((f) => f.checksum === 'a')!.groupIndex).toBe(0);
    expect(laid.find((f) => f.checksum === 'b')!.groupIndex).toBe(1);
    expect(laid.find((f) => f.checksum === 'c')!.groupIndex).toBe(1);
  });
});

describe('UploadQueue idempotent retry', () => {
  it('runs each stable operation id once even when enqueued twice', async () => {
    const upload = vi.fn(async () => undefined);
    const queue = new UploadQueue({ concurrency: 2, upload });
    const op = stableOperationId('trp_test', 'd'.repeat(64));
    const task = {
      operationId: op,
      checksum: 'd'.repeat(64),
      file: new Blob(['x']),
      tripId: 'trp_test',
      mediaId: 'med_1',
      contentType: 'image/jpeg',
      byteSize: 1,
    };
    await queue.enqueue([task, task]);
    expect(upload).toHaveBeenCalledTimes(1);
    const results = await queue.enqueue([task]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(results.get(op)?.ok).toBe(true);
  });

  it('limits concurrency to 2', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const upload = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
    });
    const queue = new UploadQueue({ concurrency: 2, upload });
    const mk = (n: number) => ({
      operationId: `op_${n}`,
      checksum: `${n}`.repeat(64),
      file: new Blob([String(n)]),
      tripId: 'trp_test',
      mediaId: `med_${n}`,
      contentType: 'image/jpeg',
      byteSize: 1,
    });
    await queue.enqueue([mk(1), mk(2), mk(3), mk(4)]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(upload).toHaveBeenCalledTimes(4);
  });
});

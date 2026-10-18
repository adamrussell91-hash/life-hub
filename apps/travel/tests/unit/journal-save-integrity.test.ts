import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import * as journalApi from '@/api/journal';
import { ApiClientError } from '@/api/client';
import type { JournalMoment } from '@/journal/types';
import { threeWayMergeJournal } from '@/journal/conflict-resolve';
import { ensureMomentDays } from '@/journal/capture-context';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import {
  __setJournalOpsStoreForTests,
  listJournalOps,
  type JournalQueuedOp,
} from '@/journal/offline-queue';
import { flushJournalOutbox, queueJournalSave } from '@/journal/journal-outbox';

function moment(over: Partial<JournalMoment> & { id: string }): JournalMoment {
  return {
    leg_id: 'leg_1',
    local_date: '2026-03-01',
    media_ids: [],
    display_order: 1,
    lifecycle: 'live',
    ...over,
  };
}

function journal(moments: JournalMoment[], over: Partial<JournalDocument> = {}): JournalDocument {
  return {
    id: 'jrn_test',
    schema_version: 1,
    trip_id: 'trp_test',
    title: 'Test',
    revision: 2,
    lifecycle: 'live',
    leg_ids: ['leg_1'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_1',
        trip_id: 'trp_test',
        pattern_id: 'pat_1',
        destination: 'Istanbul',
        timezone: 'Europe/Istanbul',
        order: 0,
        lifecycle: 'live',
      },
    ],
    days: [{ id: 'day_1', leg_id: 'leg_1', local_date: '2026-03-01', lifecycle: 'live' }],
    moments,
    media: [],
    transitions: [],
    ...over,
  };
}

function memoryStore() {
  const map = new Map<string, JournalQueuedOp>();
  return {
    put: async (op: JournalQueuedOp) => void map.set(op.id, structuredClone(op)),
    get: async (id: string) => structuredClone(map.get(id)),
    getAll: async () => [...map.values()].map((op) => structuredClone(op)),
    delete: async (id: string) => void map.delete(id),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  __setJournalOpsStoreForTests(null);
});

describe('threeWayMergeJournal', () => {
  it('keeps a moment added elsewhere when this device adds its own (no silent overwrite)', () => {
    const base = journal([]);
    const server = journal([moment({ id: 'mom_a', text: 'From the other device' })]);
    const local = journal([moment({ id: 'mom_b', text: 'From this phone' })]);
    const { merged, plans } = threeWayMergeJournal(base, server, local);
    expect(merged.moments.map((m) => m.id).sort()).toEqual(['mom_a', 'mom_b']);
    expect(plans).toEqual([]);
  });

  it('takes each side’s edit to different fields of the same moment without asking', () => {
    const base = journal([moment({ id: 'mom_a', text: 'Old', local_time: '09:00' })]);
    const server = journal([moment({ id: 'mom_a', text: 'Old', local_time: '10:30' })]);
    const local = journal([moment({ id: 'mom_a', text: 'New words', local_time: '09:00' })]);
    const { merged, plans } = threeWayMergeJournal(base, server, local);
    expect(merged.moments[0]).toMatchObject({ text: 'New words', local_time: '10:30' });
    expect(plans).toEqual([]);
  });

  it('offers a real clash (both changed the same field) for resolution', () => {
    const base = journal([moment({ id: 'mom_a', text: 'Old' })]);
    const server = journal([moment({ id: 'mom_a', text: 'Server words' })]);
    const local = journal([moment({ id: 'mom_a', text: 'Phone words' })]);
    const { plans } = threeWayMergeJournal(base, server, local);
    expect(plans.map((p) => p.fields)).toEqual([['text']]);
  });

  it('keeps a deletion made elsewhere instead of resurrecting the moment', () => {
    const base = journal([moment({ id: 'mom_a' }), moment({ id: 'mom_b' })]);
    const server = journal([
      moment({ id: 'mom_a', lifecycle: 'deleted', deleted_at: '2026-03-02T00:00:00Z' }),
      moment({ id: 'mom_b' }),
    ]);
    const local = journal([moment({ id: 'mom_a' }), moment({ id: 'mom_b', text: 'edited' })]);
    const { merged } = threeWayMergeJournal(base, server, local);
    expect(merged.moments.find((m) => m.id === 'mom_a')?.lifecycle).toBe('deleted');
    expect(merged.moments.find((m) => m.id === 'mom_b')?.text).toBe('edited');
  });

  it('keeps Trash rows that the local copy never changed', () => {
    const trashed = moment({ id: 'mom_t', lifecycle: 'deleted' });
    const base = journal([trashed]);
    const server = journal([trashed]);
    const local = journal([trashed, moment({ id: 'mom_new' })]);
    const { merged } = threeWayMergeJournal(base, server, local);
    expect(merged.moments.map((m) => m.id).sort()).toEqual(['mom_new', 'mom_t']);
  });
});

describe('ensureMomentDays', () => {
  it('adds a day row so a moment saved on a new date is shown', () => {
    const doc = journal([moment({ id: 'mom_a', local_date: '2026-03-05' })]);
    const next = ensureMomentDays(doc);
    expect(next.days.some((d) => d.local_date === '2026-03-05' && d.lifecycle === 'live')).toBe(true);
  });

  it('clears the "no moments yet" marker once a day has a moment', () => {
    const doc = journal([moment({ id: 'mom_a' })], {
      days: [
        { id: 'day_1', leg_id: 'leg_1', local_date: '2026-03-01', lifecycle: 'live', empty_marker: true },
      ],
    });
    expect(ensureMomentDays(doc).days[0]!.empty_marker).toBe(false);
  });
});

describe('persistJournalPatch offline', () => {
  it('keeps the edit on the device when there is no signal, then sends it later', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    const local = journal([moment({ id: 'mom_a', text: 'Written on the train' })]);
    const save = vi
      .spyOn(journalApi, 'saveJournal')
      .mockRejectedValueOnce(new ApiClientError({ code: 'network_error', message: 'offline' }))
      .mockResolvedValueOnce({ journal: local, version: 'sha_after' });

    const result = await persistJournalPatch('trp_test', 'sha_before', local);
    expect(result.queued).toBe(true);
    expect(result.journal.moments[0]!.text).toBe('Written on the train');
    expect((await listJournalOps()).map((op) => op.id)).toEqual(['a-save:trp_test']);

    await flushJournalOutbox();
    expect(save).toHaveBeenLastCalledWith(
      'trp_test',
      'sha_before',
      expect.objectContaining({ moments: [expect.objectContaining({ text: 'Written on the train' })] }),
    );
    expect(await listJournalOps()).toEqual([]);
  });

  it('chains several offline edits on the first unsynced server version', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    await queueJournalSave('trp_test', 'sha_v1', journal([moment({ id: 'mom_a' })]));
    await queueJournalSave('trp_test', 'sha_v1_local', journal([moment({ id: 'mom_a' }), moment({ id: 'mom_b' })]));
    const [op] = await listJournalOps();
    const payload = op!.payload as { version: string; journal: JournalDocument };
    expect(payload.version).toBe('sha_v1');
    expect(payload.journal.moments).toHaveLength(2);
  });
});

describe('journal outbox media', () => {
  it('keeps photo bytes on the device until the upload is verified, then drops them', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    const mediaUpload = await import('@/journal/media-upload');
    const backup = vi
      .spyOn(mediaUpload, 'backUpJournalMedia')
      .mockRejectedValueOnce(new ApiClientError({ code: 'network_error', message: 'offline' }))
      .mockResolvedValueOnce({ journal: journal([]), version: 'sha_verified' });
    const { queueJournalMedia } = await import('@/journal/journal-outbox');
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });

    await queueJournalMedia({ tripId: 'trp_test', mediaId: 'med_photo1', blob, contentType: 'image/jpeg' });
    await flushJournalOutbox();
    expect(backup).toHaveBeenCalledTimes(1);
    expect((await listJournalOps()).map((op) => op.id)).toEqual(['b-media:med_photo1']);

    await flushJournalOutbox();
    expect(backup).toHaveBeenCalledTimes(2);
    expect(await listJournalOps()).toEqual([]);
  });
});

describe('journal outbox ordering', () => {
  it('never uploads or drops photo bytes while the moment that uses them is still waiting to save', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    const mediaUpload = await import('@/journal/media-upload');
    const backup = vi.spyOn(mediaUpload, 'backUpJournalMedia');
    vi.spyOn(journalApi, 'saveJournal').mockRejectedValue(
      new ApiClientError({ code: 'network_error', message: 'offline' }),
    );
    const { queueJournalMedia } = await import('@/journal/journal-outbox');

    await queueJournalSave('trp_test', 'sha_v1', journal([moment({ id: 'mom_a' })]));
    await queueJournalMedia({
      tripId: 'trp_test',
      mediaId: 'med_waiting',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });
    await flushJournalOutbox();

    expect(backup).not.toHaveBeenCalled();
    expect((await listJournalOps()).map((op) => op.id)).toEqual([
      'a-save:trp_test',
      'b-media:med_waiting',
    ]);
  });
});

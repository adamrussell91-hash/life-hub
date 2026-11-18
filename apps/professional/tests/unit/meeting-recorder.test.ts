import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RecorderSession,
  canUndoTap,
  capNotes,
  createMemoryStore,
  createSilenceDetector,
  formatClock,
  joinLocalParts,
  limitState,
  meterHeight,
  partProgress,
  pickRecorderMime,
  recoveryFor,
  retryDelayMs,
  rmsOfBytes,
  shouldClearDevice,
  tapCounts,
  type LocalPart,
  type LocalSession
} from '@/lib/meeting-recorder';
import type { MeetingRecording } from '@/api/meeting-recordings';

const MEETING = 'meeting_00000000-0000-4000-8000-0000000000aa';
const REC = 'rec_test_1';

function part(index: number, extra: Partial<LocalPart> = {}): LocalPart {
  return { meeting_id: MEETING, recording_id: REC, index, bytes: 100, end_ms: (index + 1) * 60_000, saved_at: '2026-11-19T05:00:00.000Z', uploaded: false, mime: 'audio/webm', ...extra };
}

function session(extra: Partial<LocalSession> = {}): LocalSession {
  return {
    meeting_id: MEETING, recording_id: REC, kind: 'meeting', started_at: '2026-11-19T04:31:00.000Z', mime: 'audio/webm',
    elapsed_ms: 180_000, taps: [{ who: 'me', at_ms: 1000 }], flags: [], notes: ['Essay first or viva first?'], private: false,
    next_index: 3, segment_starts: [0], stopped: false, finalized: false, updated_at: '', ...extra
  };
}

function recording(extra: Partial<MeetingRecording> = {}): MeetingRecording {
  return {
    id: REC, meeting_id: MEETING, kind: 'meeting', status: 'recording', private: false, consent_confirmed_at: '', started_at: '2026-11-19T04:31:00.000Z',
    stopped_at: null, duration_ms: 0, parts_expected: null, parts_received: [], taps: [], flags: [], notes: [], attendees: [], room: false,
    attempts: 0, error: null, claimed_until: null, transcript_key: null, audio_deleted_at: null, writeup_status: 'none', ...extra
  };
}

describe('silence detector', () => {
  it('raises the alarm after 15 s under the threshold and drops it when sound comes back', () => {
    const detector = createSilenceDetector({ threshold: 0.01, holdMs: 15_000 });
    expect(detector.feed(0.001, 0)).toEqual({ silentMs: 0, alarm: false });
    expect(detector.feed(0.001, 14_999).alarm).toBe(false);
    expect(detector.feed(0.001, 15_000)).toEqual({ silentMs: 15_000, alarm: true });
    expect(detector.feed(0.2, 16_000)).toEqual({ silentMs: 0, alarm: false });
    expect(detector.feed(0.001, 17_000).silentMs).toBe(0);
  });

  it('"It’s just quiet" hides the alarm until the next silence after some sound', () => {
    const detector = createSilenceDetector({ threshold: 0.01, holdMs: 1000 });
    detector.feed(0, 0);
    expect(detector.feed(0, 2000).alarm).toBe(true);
    detector.acknowledge();
    expect(detector.feed(0, 5000).alarm).toBe(false);
    detector.feed(0.5, 6000);
    detector.feed(0, 7000);
    expect(detector.feed(0, 8000).alarm).toBe(true);
  });

  it('reads levels from a byte waveform', () => {
    expect(rmsOfBytes(new Uint8Array(64).fill(128))).toBe(0);
    expect(rmsOfBytes(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 1)))).toBeGreaterThan(0.9);
    expect(meterHeight(0)).toBe(2);
    expect(meterHeight(1)).toBe(18);
  });
});

describe('clocks, limits, taps and notes', () => {
  it('formats time and the 3 hour limit', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(limitState(2 * 3600_000 + 49 * 60_000)).toBe('ok');
    expect(limitState(2 * 3600_000 + 50 * 60_000)).toBe('warn');
    expect(limitState(3 * 3600_000)).toBe('stop');
  });

  it('counts taps and allows Undo for 10 s', () => {
    const taps = [{ who: 'me', at_ms: 1000 }, { who: 'shared:person:p1', at_ms: 5000 }, { who: 'me', at_ms: 9000 }];
    expect(tapCounts(taps)).toEqual({ me: 2, 'shared:person:p1': 1 });
    expect(canUndoTap(taps, 19_000)).toBe(true);
    expect(canUndoTap(taps, 19_001)).toBe(false);
    expect(canUndoTap([], 0)).toBe(false);
  });

  it('caps notes at 80 lines of 300 chars', () => {
    const lines = capNotes(['  a  b ', '', 'x'.repeat(400), ...Array.from({ length: 100 }, (_, i) => `line ${i}`)]);
    expect(lines[0]).toBe('a b');
    expect(lines[1]).toHaveLength(300);
    expect(lines).toHaveLength(80);
  });

  it('picks webm opus first, then mp4 for Safari', () => {
    expect(pickRecorderMime((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickRecorderMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecorderMime(null)).toBeUndefined();
  });

  it('backs off retries up to a minute', () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(20)).toBe(60_000);
  });
});

describe('part bookkeeping', () => {
  it('counts a part uploaded if this device or Life Hub says so', () => {
    const progress = partProgress([part(0, { uploaded: true }), part(1), part(2)], [1]);
    expect(progress).toEqual({ saved: 3, uploaded: 2, pending: [2], savedMs: 180_000, uploadedMs: 120_000 });
  });

  it('only clears the device once Life Hub has deleted its audio', () => {
    expect(shouldClearDevice(recording({ status: 'done', audio_deleted_at: null }))).toBe(false);
    expect(shouldClearDevice(recording({ status: 'done', audio_deleted_at: '2026-11-19T06:02:00.000Z' }))).toBe(true);
    expect(shouldClearDevice(null)).toBe(false);
  });
});

describe('crash recovery listing', () => {
  it('offers the parts a closed tab left behind, and carrying on', () => {
    const found = recoveryFor(MEETING, session(), [part(0, { uploaded: true }), part(1), part(2)], recording({ parts_received: [0] }));
    expect(found).toMatchObject({ recordingId: REC, interrupted: true, notUploaded: [1, 2], savedMs: 180_000, uploadedMs: 60_000, canContinue: true });
  });

  it('says nothing once Life Hub has everything and was told it stopped', () => {
    expect(recoveryFor(MEETING, session({ stopped: true, finalized: true }), [part(0, { uploaded: true })], recording({ status: 'uploaded', parts_received: [0] }))).toBeNull();
  });

  it('still offers an upload when the stop was sent but parts never arrived', () => {
    const found = recoveryFor(MEETING, session({ stopped: true, finalized: false }), [part(0), part(1)], recording({ status: 'recording', parts_received: [0], stopped_at: 'x' }));
    expect(found).toMatchObject({ interrupted: false, notUploaded: [1], canContinue: false });
  });

  it('ignores another recording, a deleted one, or another meeting', () => {
    expect(recoveryFor(MEETING, session(), [part(1)], recording({ id: 'rec_other' }))).toBeNull();
    expect(recoveryFor(MEETING, session(), [part(1)], recording({ audio_deleted_at: 'x' }))).toBeNull();
    expect(recoveryFor('meeting_other', session(), [part(1)], null)).toBeNull();
  });
});

describe('recorder upload queue (no mic)', () => {
  afterEach(() => vi.useRealTimers());

  async function seeded(): Promise<ReturnType<typeof createMemoryStore>> {
    const store = createMemoryStore();
    for (const index of [0, 1, 2]) await store.putPart(part(index), new Blob([`p${index}`]));
    await store.putSession(session({ stopped: true }));
    return store;
  }

  it('uploads what the device holds in order, then tells Life Hub with the taps and notes', async () => {
    const store = await seeded();
    const uploaded: number[] = [];
    const stop = vi.fn(async () => ({ recording: recording({ status: 'uploaded', parts_received: [0, 1, 2] }), missing: [] }));
    const rec = new RecorderSession(MEETING, {
      store,
      api: { uploadPart: vi.fn(async ({ index }) => { uploaded.push(index); return { index, bytes: 2, parts_received: [...uploaded] }; }), stop }
    });
    await rec.adopt((await store.getSession(MEETING))!, recording());
    await rec.uploadRest(['Moderation date']);
    expect(uploaded).toEqual([0, 1, 2]);
    expect(stop).toHaveBeenCalledWith(expect.objectContaining({ recording_id: REC, parts_expected: 3, taps: [{ who: 'me', at_ms: 1000 }] }));
    expect(rec.snapshot()).toMatchObject({ pendingUploads: 0, finalized: true });
    expect((await store.listParts(MEETING)).every((p) => p.uploaded)).toBe(true);
  });

  it('keeps a part that fails and retries it; never drops it', async () => {
    vi.useFakeTimers();
    const store = await seeded();
    let fail = true;
    const rec = new RecorderSession(MEETING, {
      store,
      api: {
        uploadPart: vi.fn(async ({ index }) => {
          if (index === 1 && fail) throw new Error('offline');
          return { index, bytes: 2, parts_received: [] };
        }),
        stop: vi.fn(async () => ({ recording: recording({ status: 'uploaded' }), missing: [] }))
      }
    });
    await rec.adopt((await store.getSession(MEETING))!, recording());
    void rec.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(rec.snapshot()).toMatchObject({ pendingUploads: 2, uploadStalled: true, lastUploadError: 'offline' });
    fail = false;
    await vi.advanceTimersByTimeAsync(2500);
    expect(rec.snapshot().pendingUploads).toBe(0);
  });

  it('sends again the parts Life Hub reports missing after stop', async () => {
    const store = await seeded();
    for (const index of [0, 1, 2]) await store.markUploaded(REC, index);
    const sent: number[] = [];
    const stop = vi.fn()
      .mockResolvedValueOnce({ recording: recording({ stopped_at: 'x', parts_received: [0, 2] }), missing: [1] })
      .mockResolvedValue({ recording: recording({ status: 'uploaded', parts_received: [0, 1, 2] }), missing: [] });
    const rec = new RecorderSession(MEETING, {
      store,
      api: { uploadPart: vi.fn(async ({ index }) => { sent.push(index); return { index, bytes: 2, parts_received: [0, 1, 2] }; }), stop }
    });
    await rec.adopt((await store.getSession(MEETING))!, recording({ parts_received: [0, 1, 2] }));
    await rec.uploadRest();
    await vi.waitFor(() => expect(rec.snapshot().finalized).toBe(true));
    expect(sent).toEqual([1]);
  });

  it('joins the device parts into one file for "save a copy"', async () => {
    const store = await seeded();
    const joined = await joinLocalParts(store, MEETING, REC);
    expect(joined?.missing).toEqual([]);
    expect(await joined!.blob.text()).toBe('p0p1p2');
    await store.clear(MEETING, REC);
    expect(await store.listParts(MEETING)).toEqual([]);
    expect(await store.getSession(MEETING)).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import * as journalMediaApi from '@/api/journal-media';
import { emptyJournalDocument } from '@/api/journal';
import { JOURNAL_RELAY_MAX_BYTES, backUpJournalMedia, sha256Hex } from '@/journal/media-upload';
import * as mediaUpload from '@/journal/media-upload';
import {
  __setJournalOpsStoreForTests,
  listJournalOps,
  type JournalQueuedOp,
} from '@/journal/offline-queue';
import { flushJournalOutbox, queueJournalMedia } from '@/journal/journal-outbox';

const API = 'https://api.adam-russell.com';

function onLiveSite(): void {
  vi.stubGlobal('location', { hostname: 'life-hub.adam-russell.com' });
}

function stored(state: 'pending' | 'backed_up' = 'backed_up'): Response {
  const journal: JournalDocument = emptyJournalDocument('trp_up');
  return new Response(
    JSON.stringify({ ok: true, data: { upload_state: state, journal, version: 'sha_after', key: 'k' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** IndexedDB keeps a queued Blob as a Blob; structuredClone under happy-dom does not, so copy shallowly. */
function memoryStore() {
  const map = new Map<string, JournalQueuedOp>();
  const copy = (op: JournalQueuedOp | undefined) =>
    op && { ...op, ack: { ...op.ack }, payload: { ...(op.payload as object) } };
  return {
    put: async (op: JournalQueuedOp) => void map.set(op.id, copy(op)!),
    get: async (id: string) => copy(map.get(id)),
    getAll: async () => [...map.values()].map((op) => copy(op)!),
    delete: async (id: string) => void map.delete(id),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  __setJournalOpsStoreForTests(null);
});

describe('backing up journal media', () => {
  // The page used to PUT straight to the bucket, which depends on the bucket's
  // CORS rules. A file the API can carry now goes to the API, which stores it.
  it('sends a voice note to the API with its checksum, signed in', async () => {
    onLiveSite();
    const fetchMock = vi.fn(async () => stored());
    vi.stubGlobal('fetch', fetchMock);
    const sign = vi.spyOn(journalMediaApi, 'signJournalMedia');
    const blob = new Blob(['voice-note'], { type: 'audio/mp4' });

    const envelope = await backUpJournalMedia({ tripId: 'trp_up', mediaId: 'med_voice', blob, contentType: 'audio/mp4' });

    expect(envelope?.version).toBe('sha_after');
    expect(sign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`${API}/api/travel-journal-media-upload`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      trip: 'trp_up',
      id: 'med_voice',
      purpose: 'original',
      checksum: await sha256Hex(blob),
    });
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('content-type')).toBe('audio/mp4');
    expect(init.body).toBe(blob);
  });

  it('uses a signed upload for an original too big for the API', async () => {
    const fetchMock = vi.fn(async () => stored());
    vi.stubGlobal('fetch', fetchMock);
    const sign = vi
      .spyOn(journalMediaApi, 'signJournalMedia')
      .mockResolvedValue({ upload_url: 'https://bucket.example/put', headers: {}, key: 'k', expires_in: 300 });
    const put = vi.spyOn(journalMediaApi, 'uploadJournalMediaToSignedUrl').mockResolvedValue();
    const verify = vi.spyOn(journalMediaApi, 'verifyJournalMedia').mockResolvedValue({
      upload_state: 'backed_up',
      journal: emptyJournalDocument('trp_up'),
      version: 'sha_signed',
      key: 'k',
    });
    const big = new Blob([new Uint8Array(JOURNAL_RELAY_MAX_BYTES + 1)], { type: 'audio/mp4' });

    const envelope = await backUpJournalMedia({ tripId: 'trp_up', mediaId: 'med_big', blob: big, contentType: 'audio/mp4' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sign).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(envelope?.version).toBe('sha_signed');
  });

  it('falls back to a signed upload when the API says the file is too big, without retrying', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: { code: 'too_large', message: 'Too big', retryable: false } }), {
          status: 413,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(journalMediaApi, 'signJournalMedia').mockResolvedValue({
      upload_url: 'https://bucket.example/put',
      headers: {},
      key: 'k',
      expires_in: 300,
    });
    const put = vi.spyOn(journalMediaApi, 'uploadJournalMediaToSignedUrl').mockResolvedValue();
    vi.spyOn(journalMediaApi, 'verifyJournalMedia').mockResolvedValue({
      upload_state: 'backed_up',
      journal: emptyJournalDocument('trp_up'),
      version: 'sha_signed',
      key: 'k',
    });

    await backUpJournalMedia({
      tripId: 'trp_up',
      mediaId: 'med_edge',
      blob: new Blob(['x'], { type: 'audio/mp4' }),
      contentType: 'audio/mp4',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('does not send parts an earlier attempt already stored', async () => {
    onLiveSite();
    const fetchMock = vi.fn(async () => stored());
    vi.stubGlobal('fetch', fetchMock);
    const parts: string[] = [];

    // Every copy is up: only the original is left, and nothing decodes the photo again.
    await backUpJournalMedia(
      {
        tripId: 'trp_up',
        mediaId: 'med_photo_resume',
        blob: new Blob(['heic'], { type: 'image/heic' }),
        contentType: 'image/heic',
        stored: ['w320', 'w960', 'w1600'],
      },
      { onStored: (part) => void parts.push(part) },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL((fetchMock.mock.calls[0] as unknown as [string])[0]).searchParams.get('purpose')).toBe('original');
    expect(parts).toEqual(['original']);

    fetchMock.mockClear();
    const nothing = await backUpJournalMedia({
      tripId: 'trp_up',
      mediaId: 'med_voice_done',
      blob: new Blob(['v'], { type: 'audio/mp4' }),
      contentType: 'audio/mp4',
      stored: ['original'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nothing).toBeNull();
  });
});

describe('the outbox remembers what is already stored', () => {
  it('keeps the parts a failed attempt stored, so the next attempt skips them', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    const seen: (string[] | undefined)[] = [];
    vi.spyOn(mediaUpload, 'backUpJournalMedia').mockImplementation(async (job, hooks) => {
      seen.push(job.stored ? [...job.stored] : undefined);
      if (seen.length === 1) {
        await hooks?.onStored?.('w320');
        throw new TypeError('Load failed');
      }
      return { journal: emptyJournalDocument('trp_up'), version: 'sha_done' };
    });

    await queueJournalMedia({
      tripId: 'trp_up',
      mediaId: 'med_resume',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });
    await flushJournalOutbox();
    const [op] = await listJournalOps();
    expect((op!.payload as { stored?: string[] }).stored).toEqual(['w320']);

    await flushJournalOutbox();
    expect(seen).toEqual([undefined, ['w320']]);
    expect(await listJournalOps()).toEqual([]);
  });
});

describe('photos waiting to upload after a reload', () => {
  // The preview URLs live in memory; the bytes wait in the outbox. A reload
  // used to leave every photo not yet backed up as a broken image.
  it('show again from the bytes kept in the outbox', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    const { restoreQueuedMediaPreviews } = await import('@/journal/journal-outbox');
    const { localJournalMediaUrl } = await import('@/journal/media-loading');
    vi.spyOn(mediaUpload, 'backUpJournalMedia').mockRejectedValue(new TypeError('Load failed'));
    await queueJournalMedia(
      {
        tripId: 'trp_up',
        mediaId: 'med_after_reload',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        contentType: 'image/jpeg',
      },
      { flush: false },
    );
    expect(localJournalMediaUrl('med_after_reload')).toBeUndefined();

    await restoreQueuedMediaPreviews();

    expect(localJournalMediaUrl('med_after_reload')).toMatch(/^blob:/);
  });
});

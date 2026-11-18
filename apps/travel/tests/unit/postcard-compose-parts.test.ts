import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPostcard,
  composerReducer,
  hasContent,
  initialComposerState,
  postBlocker,
  type ComposerEvent,
  type ComposerState
} from '@/postcard/composer-state';
import { idbDraftStore, memoryDraftStore } from '@/postcard/draft';
import { PhotoUnreadableError, addressForPhoto, preparePostcardPhoto } from '@/postcard/photo-place';
import { VoiceClipError, pickClipMime, startVoiceClip, type VoiceClip } from '@/postcard/voice-clip';

const FALLBACK = ['Belém Tower', 'Lisbon', 'Portugal'];
const run = (events: ComposerEvent[], from: ComposerState = initialComposerState(FALLBACK)): ComposerState =>
  events.reduce(composerReducer, from);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('composer state', () => {
  it('starts with the stop as the address and cannot post without a photo', () => {
    const state = initialComposerState(FALLBACK);
    expect(state.address).toEqual(['Belém Tower', 'Lisbon', 'Portugal', '']);
    expect(postBlocker(state)).toBe('Choose a photo to post.');
    expect(hasContent(state)).toBe(false);
  });

  it('can post with a photo and nothing else', () => {
    const state = run([{ type: 'photo_reading' }, { type: 'photo_ready', name: 'a.jpg', orientation: 'portrait' }]);
    expect(postBlocker(state)).toBeNull();
    expect(buildPostcard(state, 'tph_p1', FALLBACK)).toEqual({
      photo_id: 'tph_p1',
      orientation: 'portrait',
      address: ['Belém Tower', 'Lisbon', 'Portugal']
    });
  });

  it('a looked-up address fills the lines, but never over what the owner typed', () => {
    const looked = run([{ type: 'address_resolved', lines: ['Rua do Exemplo', 'Alfama', '1100-000 Lisboa', 'Portugal'] }]);
    expect(looked.address[0]).toBe('Rua do Exemplo');
    const typed = run([
      { type: 'address_edited', index: 0, value: 'By the river' },
      { type: 'address_resolved', lines: ['Rua do Exemplo'] }
    ]);
    expect(typed.address[0]).toBe('By the river');
    expect(typed.addressTouched).toBe(true);
  });

  it('with every address line blank, the stop and city are used', () => {
    const blank = run([
      { type: 'photo_ready', name: 'a.jpg', orientation: 'landscape' },
      { type: 'address_edited', index: 0, value: ' ' },
      { type: 'address_edited', index: 1, value: '' },
      { type: 'address_edited', index: 2, value: '' }
    ]);
    expect(buildPostcard(blank, 'tph_p1', FALLBACK).address).toEqual(FALLBACK);
  });

  it('holds Post while recording and until the clip has reached the server, and says why', () => {
    const photo: ComposerEvent = { type: 'photo_ready', name: 'a.jpg', orientation: 'portrait' };
    expect(postBlocker(run([photo, { type: 'record_started' }]))).toBe('Stop the recording first.');
    const stopped = run([photo, { type: 'record_started' }, { type: 'record_ended', seconds: 21.4 }, { type: 'audio_uploading' }]);
    expect(postBlocker(stopped)).toBe('Sending the recording…');
    expect(postBlocker(run([{ type: 'audio_failed' }], stopped))).toBe("The recording didn't send. Try again, or remove it.");
    const sent = run([{ type: 'audio_uploaded', audioId: 'tau_a1' }], stopped);
    expect(postBlocker(sent)).toBeNull();
    expect(buildPostcard(sent, 'tph_p1', FALLBACK)).toMatchObject({ audio_id: 'tau_a1', audio_s: 21 });
  });

  it('never holds Post for the transcript', () => {
    const waiting = run([
      { type: 'photo_ready', name: 'a.jpg', orientation: 'portrait' },
      { type: 'record_started' },
      { type: 'record_ended', seconds: 5 },
      { type: 'audio_uploaded', audioId: 'tau_a1' },
      { type: 'transcript_working' }
    ]);
    expect(postBlocker(waiting)).toBeNull();
    expect(postBlocker(run([{ type: 'transcript_failed' }], waiting))).toBeNull();
  });

  it('the transcript fills an empty box; typed words win', () => {
    expect(run([{ type: 'transcript_done', text: 'All good here.' }]).text).toBe('All good here.');
    const typed = run([{ type: 'text_edited', value: 'My own words' }, { type: 'transcript_done', text: 'All good here.' }]);
    expect(typed.text).toBe('My own words');
    const cleared = run([{ type: 'text_edited', value: 'x' }, { type: 'text_edited', value: '' }, { type: 'transcript_done', text: 'All good here.' }]);
    expect(cleared.text).toBe('All good here.');
  });

  it('cuts words to 600 characters, tidies them when posting, and keeps a clip between 1 and 30 seconds', () => {
    const long = run([{ type: 'text_edited', value: 'é'.repeat(700) }]);
    expect(Array.from(long.text)).toHaveLength(600);
    const state = run([
      { type: 'photo_ready', name: 'a.jpg', orientation: 'portrait' },
      { type: 'text_edited', value: '  Made it \n to the   market. ' },
      { type: 'record_started' },
      { type: 'record_ended', seconds: 0.2 },
      { type: 'audio_uploaded', audioId: 'tau_a1' }
    ]);
    expect(buildPostcard(state, 'tph_p1', FALLBACK)).toMatchObject({ text: 'Made it to the market.', audio_s: 1 });
  });

  it('a new take forgets the old clip; an empty take says so', () => {
    const second = run([
      { type: 'record_started' },
      { type: 'record_ended', seconds: 5 },
      { type: 'audio_uploaded', audioId: 'tau_a1' },
      { type: 'record_started' }
    ]);
    expect(second.audioId).toBeNull();
    expect(second.clipSeconds).toBeNull();
    expect(run([{ type: 'record_started' }, { type: 'record_ended', seconds: null }]).micError).toBe('Nothing was recorded. Try again.');
  });

  it('a failed post keeps everything and says why', () => {
    const failed = run([
      { type: 'photo_ready', name: 'a.jpg', orientation: 'portrait' },
      { type: 'text_edited', value: 'Hello' },
      { type: 'post_started' },
      { type: 'post_failed', message: "Couldn't reach the server. Check your signal and try again." }
    ]);
    expect(failed).toMatchObject({ posting: false, text: 'Hello', photoName: 'a.jpg', error: "Couldn't reach the server. Check your signal and try again." });
  });
});

describe('drafts', () => {
  const draft = { tripId: 'trp_1', itemId: 'itm_1', photo: null, photoName: '', orientation: null, clip: null, clipSeconds: 0, audioId: null, text: 'Hello', address: ['A'], addressTouched: false, updatedAt: '2027-03-04T00:00:00.000Z' };

  it('keeps one draft per stop', async () => {
    const store = memoryDraftStore();
    expect(await store.save(draft)).toBe(true);
    expect((await store.load('trp_1', 'itm_1'))?.text).toBe('Hello');
    expect(await store.load('trp_1', 'itm_2')).toBeNull();
    await store.clear('trp_1', 'itm_1');
    expect(store.size()).toBe(0);
  });

  it('fails soft when the browser has no database', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const store = idbDraftStore();
    expect(await store.load('trp_1', 'itm_1')).toBeNull();
    expect(await store.save(draft)).toBe(false);
    await expect(store.clear('trp_1', 'itm_1')).resolves.toBeUndefined();
  });
});

describe('the photo', () => {
  const file = new File([new Uint8Array(10)], 'IMG_0412.jpeg', { type: 'image/jpeg' });
  const image = (width: number, height: number) => ({ width, height, source: { close: vi.fn() } as unknown as ImageBitmap });

  it('makes the uploaded copy a JPEG, notes the shape and keeps the location on the phone', async () => {
    const encode = vi.fn(async () => new Blob([new Uint8Array(4)], { type: 'image/jpeg' }));
    const prepared = await preparePostcardPhoto(file, {
      decode: async () => image(3024, 4032),
      encode,
      readCoordinates: async () => ({ lat: 38.7, lon: -9.1 })
    });
    expect(prepared.orientation).toBe('portrait');
    expect(prepared.file.name).toBe('IMG_0412.jpg');
    expect(prepared.file.type).toBe('image/jpeg');
    expect(prepared.file.size).toBe(4);
    expect(prepared.coordinates).toEqual({ lat: 38.7, lon: -9.1 });
    expect(encode).toHaveBeenCalledWith(expect.anything(), 1600);
  });

  it('calls wider-than-tall and square photos landscape', async () => {
    const encode = async () => new Blob(['x'], { type: 'image/jpeg' });
    const none = async () => undefined;
    expect((await preparePostcardPhoto(file, { decode: async () => image(4032, 3024), encode, readCoordinates: none })).orientation).toBe('landscape');
    expect((await preparePostcardPhoto(file, { decode: async () => image(2000, 2000), encode, readCoordinates: none })).orientation).toBe('landscape');
  });

  it('refuses a file the browser cannot decode, rather than sending it as it is', async () => {
    const attempt = preparePostcardPhoto(file, {
      decode: async () => {
        throw new Error('not an image');
      },
      readCoordinates: async () => undefined
    });
    await expect(attempt).rejects.toBeInstanceOf(PhotoUnreadableError);
    await expect(attempt).rejects.toThrow("That photo can't be read. Try a different one.");
  });

  it('turns the location into address lines, and falls back to the stop when it cannot', async () => {
    const lookup = vi.fn(async () => ({ street: 'Rua do Exemplo', district: 'Alfama', postcode: '1100-000', city: 'Lisboa', country: 'Portugal' }));
    expect(await addressForPhoto({ lat: 38.7, lon: -9.1 }, FALLBACK, lookup)).toEqual(['Rua do Exemplo', 'Alfama', '1100-000 Lisboa', 'Portugal']);
    expect(lookup).toHaveBeenCalledWith(38.7, -9.1);
    expect(await addressForPhoto(undefined, FALLBACK, lookup)).toEqual(FALLBACK);
    expect(await addressForPhoto({ lat: 1, lon: 2 }, FALLBACK, async () => null)).toEqual(FALLBACK);
    expect(
      await addressForPhoto({ lat: 1, lon: 2 }, FALLBACK, async () => {
        throw new Error('offline');
      })
    ).toEqual(FALLBACK);
  });
});

describe('the voice clip', () => {
  class FakeRecorder extends EventTarget {
    static supported = ['audio/webm;codecs=opus', 'audio/webm'];
    static isTypeSupported(mime: string): boolean {
      return FakeRecorder.supported.includes(mime);
    }
    static last: FakeRecorder | null = null;
    state = 'inactive';
    mimeType: string;
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      super();
      this.mimeType = options?.mimeType ?? '';
      FakeRecorder.last = this;
    }
    start(): void {
      this.state = 'recording';
    }
    stop(): void {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      const data = new Event('dataavailable') as Event & { data: Blob };
      data.data = new Blob([new Uint8Array(8)], { type: this.mimeType });
      this.dispatchEvent(data);
      this.dispatchEvent(new Event('stop'));
    }
  }
  const stopTrack = vi.fn();
  const useFakeMic = (allowed = true): void => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => {
          if (!allowed) throw new Error('NotAllowedError');
          return { getTracks: () => [{ stop: stopTrack }] };
        }
      }
    });
  };

  it('asks for audio/mp4 first, then what the browser can make', () => {
    expect(pickClipMime((mime) => mime === 'audio/mp4' || mime === 'audio/webm')).toBe('audio/mp4');
    expect(pickClipMime((mime) => mime === 'audio/webm')).toBe('audio/webm');
    expect(pickClipMime(() => false)).toBeUndefined();
  });

  it('ends on Stop with the clip and its length, and lets the microphone go', async () => {
    useFakeMic();
    let clock = 1_000;
    const ended = vi.fn<(clip: VoiceClip | null) => void>();
    const recording = await startVoiceClip({ onEnd: ended, now: () => clock });
    clock += 7_300;
    recording.stop();
    recording.stop();
    expect(ended).toHaveBeenCalledTimes(1);
    const clip = ended.mock.calls[0]![0]!;
    expect(clip.seconds).toBeCloseTo(7.3);
    expect(clip.blob.size).toBe(8);
    expect(clip.blob.type).toBe('audio/webm;codecs=opus');
    expect(stopTrack).toHaveBeenCalled();
  });

  it('ends by itself at 30 seconds', async () => {
    vi.useFakeTimers();
    useFakeMic();
    let clock = 0;
    const ended = vi.fn<(clip: VoiceClip | null) => void>();
    const ticks: number[] = [];
    await startVoiceClip({ onEnd: ended, onTick: (s) => ticks.push(s), now: () => clock });
    clock = 12_000;
    vi.advanceTimersByTime(250);
    expect(ended).not.toHaveBeenCalled();
    clock = 31_000;
    vi.advanceTimersByTime(250);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended.mock.calls[0]![0]!.seconds).toBe(30);
    expect(ticks).toEqual([12, 30]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('says so when the microphone is refused or missing', async () => {
    useFakeMic(false);
    await expect(startVoiceClip({ onEnd: () => undefined })).rejects.toThrow(
      'Microphone access was not allowed. You can still post the photo and type the words.'
    );
    vi.stubGlobal('MediaRecorder', undefined);
    await expect(startVoiceClip({ onEnd: () => undefined })).rejects.toBeInstanceOf(VoiceClipError);
  });
});

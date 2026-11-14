import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmbientRecorderError, startAmbientRecording } from '@/journal/ambient-recorder';

class FakeRecorder extends EventTarget {
  static last: FakeRecorder | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/mp4';
  constructor(public stream: MediaStream) {
    super();
    FakeRecorder.last = this;
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    const data = new Event('dataavailable') as Event & { data: Blob };
    data.data = new Blob([new Uint8Array(2048)], { type: 'audio/mp4' });
    this.dispatchEvent(data);
    this.dispatchEvent(new Event('stop'));
  }
}

function fakeStream() {
  const stopTrack = vi.fn();
  return { stream: { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream, stopTrack };
}

function stubMedia(getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>) {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(getUserMedia) },
    configurable: true
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
});

describe('startAmbientRecording', () => {
  it('records the room as it is and hands back the clip on stop', async () => {
    const { stream, stopTrack } = fakeStream();
    stubMedia(async () => stream);
    let t = 1_000;
    const rec = await startAmbientRecording({ now: () => t });
    const constraints = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(constraints.audio).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    expect(FakeRecorder.last?.state).toBe('recording');
    t = 43_000;
    const clip = await rec.stop();
    expect(clip?.blob.type).toBe('audio/mp4');
    expect(clip?.blob.size).toBe(2048);
    expect(clip?.seconds).toBe(42);
    expect(stopTrack).toHaveBeenCalled();
    expect(await rec.stop()).toEqual(clip);
  });

  it('falls back to a plain microphone when the ambient settings are refused', async () => {
    const { stream } = fakeStream();
    stubMedia(async (c) => {
      if (typeof c.audio === 'object') throw new Error('OverconstrainedError');
      return stream;
    });
    const rec = await startAmbientRecording();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({ audio: true });
    await rec.stop();
  });

  it('says plainly when the microphone is refused', async () => {
    stubMedia(async () => {
      throw new Error('NotAllowedError');
    });
    const err = await startAmbientRecording().catch((e) => e);
    expect(err).toBeInstanceOf(AmbientRecorderError);
    expect(err.message).toBe('Microphone access was not allowed.');
  });

  it('says plainly when the browser cannot record', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const err = await startAmbientRecording().catch((e) => e);
    expect(err).toBeInstanceOf(AmbientRecorderError);
    expect(err.message).toBe('Sound recording is not available in this browser.');
  });
});

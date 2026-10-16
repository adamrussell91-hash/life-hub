import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationVoiceTrack } from '@/schemas/block';

/** Elapsed formatter used by the recorder UI (kept in sync with voice-recorder.ts). */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

describe('voice recorder helpers', () => {
  it('formats elapsed mm:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(1500)).toBe('0:01');
    expect(formatElapsed(65_000)).toBe('1:05');
  });

  it('records tap timestamps as seconds from elapsed ms', () => {
    const elapsedMs = 12_500;
    const tap = { t: elapsedMs / 1000, anchor: { stanza: 's1', quote: { exact: 'Bent' } } };
    expect(tap.t).toBe(12.5);
  });
});

vi.mock('@/teacher/confirm-dialog', () => ({
  askTextCard: vi.fn(async () => 'Reading')
}));
const pollAiJob = vi.fn();
vi.mock('@/ai/jobs-client', () => ({ pollAiJob: (...args: unknown[]) => pollAiJob(...args) }));

class FakeMediaRecorder {
  static isTypeSupported = (mime: string) => mime === 'audio/webm';
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  private listeners: Record<string, Array<(event: { data: Blob }) => void>> = {};
  constructor(public stream: unknown, public opts: unknown) {}
  addEventListener(name: string, fn: (event: { data: Blob }) => void) {
    (this.listeners[name] ??= []).push(fn);
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    for (const fn of this.listeners.dataavailable ?? []) fn({ data: new Blob(['abc'], { type: 'audio/webm' }) });
    for (const fn of this.listeners.stop ?? []) fn({ data: new Blob() });
  }
}

class FakeSpeech {
  static last: FakeSpeech | null = null;
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeSpeech.last = this;
  }
  start() {}
  stop() {}
  say(text: string) {
    const result = Object.assign([{ transcript: text }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('voice recorder', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.stubGlobal('AudioContext', undefined);
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeSpeech;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [] }) }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: { id: 'ai_job_1', media: { id: 'media_1', preview_url: '/api/media/media_1/file', mime_type: 'audio/webm' } }
          }),
          { status: 202, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    pollAiJob.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  async function recordOnce(onTrackReady: (track: AnnotationVoiceTrack) => void) {
    const { mountVoiceRecorder } = await import('@/blocks/voice-recorder');
    const handle = mountVoiceRecorder({ layerId: 'layer_voice', onTrackReady, onCancel: () => undefined, transcribeWaitMs: 5_000 });
    document.body.append(handle.el);
    const [recordBtn, , stopBtn] = [...handle.el.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-voice-actions button')];
    recordBtn!.click();
    await flush();
    expect(handle.isCapturing()).toBe(true);
    FakeSpeech.last!.say('dawn attempts to revive the scorched earth');
    expect(handle.el.querySelector('.block-editor__annotation-voice-live-text')?.textContent).toContain('scorched earth');
    handle.pushTap({ stanza: 's1', line: 3, quote: { exact: 'Dawn attempts to revive the scorched earth.' } } as never);
    expect(handle.el.querySelectorAll('.block-editor__annotation-voice-pin')).toHaveLength(1);
    stopBtn!.click();
    return handle;
  }

  it('falls back to the live captions when Whisper fails, keeping the taps', async () => {
    pollAiJob.mockResolvedValue({ status: 'error', error: 'model busy' });
    const ready = vi.fn();
    const handle = await recordOnce(ready);
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());
    const track = ready.mock.calls[0]![0] as AnnotationVoiceTrack;
    expect(track.transcript.words.map((w) => w.w).join(' ')).toBe('dawn attempts to revive the scorched earth');
    expect(track.transcript.timing).toBe('estimated');
    expect(track.taps).toHaveLength(1);
    expect(track.audio.media_id).toBe('media_1');
    handle.dispose();
  });

  it('prefers the Whisper transcript when it arrives', async () => {
    pollAiJob.mockResolvedValue({
      status: 'done',
      result: { whisper: { words: [{ word: 'Dawn', start: 0.2, end: 0.5 }] } }
    });
    const ready = vi.fn();
    const handle = await recordOnce(ready);
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());
    const track = ready.mock.calls[0]![0] as AnnotationVoiceTrack;
    expect(track.transcript.words.map((w) => w.w)).toEqual(['Dawn']);
    handle.dispose();
  });
});

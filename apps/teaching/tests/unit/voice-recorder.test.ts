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

describe('voice recorder never loses a recording', () => {
  beforeEach(async () => {
    const { memoryBackend, setVoiceDraftBackendForTests } = await import('@/blocks/voice-draft-store');
    setVoiceDraftBackendForTests(memoryBackend());
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.stubGlobal('AudioContext', undefined);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [] }) }
    });
    pollAiJob.mockReset();
    pollAiJob.mockResolvedValue({ status: 'error', error: 'busy' });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { setVoiceDraftBackendForTests } = await import('@/blocks/voice-draft-store');
    setVoiceDraftBackendForTests(null);
    document.body.replaceChildren();
  });

  const okJob = () =>
    new Response(
      JSON.stringify({ ok: true, data: { id: 'ai_job_1', media: { id: 'media_1', mime_type: 'audio/webm' } } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  async function mount(onTrackReady = vi.fn()) {
    const { mountVoiceRecorder } = await import('@/blocks/voice-recorder');
    const handle = mountVoiceRecorder({ layerId: 'layer_voice', onTrackReady, onCancel: () => undefined, transcribeWaitMs: 50 });
    document.body.append(handle.el);
    return { handle, onTrackReady };
  }

  it('keeps the audio when the upload fails, then retries it', async () => {
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (fail) throw new TypeError('Load failed');
      return okJob();
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { handle, onTrackReady } = await mount();
    const [recordBtn, , stopBtn] = [...handle.el.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-voice-actions button')];
    recordBtn!.click();
    await flush();
    stopBtn!.click();
    await vi.waitFor(() => expect(handle.el.querySelector<HTMLElement>('.block-editor__annotation-voice-rescue')!.hidden).toBe(false), { timeout: 10_000 });
    vi.useRealTimers();
    expect(handle.el.textContent).toContain('kept on this device');
    expect(onTrackReady).not.toHaveBeenCalled();

    const { listVoiceDrafts } = await import('@/blocks/voice-draft-store');
    const drafts = await listVoiceDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.last_error).toBe('Load failed');

    fail = false;
    handle.el.querySelector<HTMLButtonElement>('.block-editor__annotation-voice-rescue .btn--primary')!.click();
    await vi.waitFor(() => expect(onTrackReady).toHaveBeenCalled());
    await vi.waitFor(async () => expect(await listVoiceDrafts()).toHaveLength(0));
    handle.dispose();
  });

  it('offers an unsaved recording back after a refresh, and uploads it', async () => {
    const { voiceDraftBackend } = await import('@/blocks/voice-draft-store');
    const backend = voiceDraftBackend();
    await backend.putMeta({
      id: 'voice_lost', title: 'Think aloud', kind: 'think_aloud', layer_id: 'layer_voice', mime: 'audio/mp4',
      started_at: '2026-10-16T09:00:00.000Z', updated_at: '2026-10-16T09:25:00.000Z', duration_s: 1549,
      taps: [{ t: 13, anchor: { stanza: 's1', quote: { exact: 'THE REMEDY OF BUTTERFLIES' } } as never }],
      live_words: [{ w: 'nothing', start: 1, end: 1.4 }]
    });
    await backend.putChunk('voice_lost', 0, new Uint8Array([1, 2, 3]).buffer);
    vi.stubGlobal('fetch', vi.fn(async () => okJob()));
    const { handle, onTrackReady } = await mount();
    await vi.waitFor(() => expect(handle.el.querySelector('[data-draft-id="voice_lost"]')).toBeTruthy());
    expect(handle.el.querySelector('[data-draft-id="voice_lost"]')!.textContent).toContain('Think aloud · 25:49 · 1 pin');
    handle.el.querySelector<HTMLButtonElement>('[data-draft-id="voice_lost"] .btn--primary')!.click();
    await vi.waitFor(() => expect(onTrackReady).toHaveBeenCalled());
    const track = onTrackReady.mock.calls[0]![0] as AnnotationVoiceTrack;
    expect(track.id).toBe('voice_lost');
    expect(track.taps).toHaveLength(1);
    expect(track.transcript.words.map((w) => w.w)).toEqual(['nothing']);
    handle.dispose();
  });
});

describe('uploadVoiceRecording', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends long recordings in 4 MB parts, then joins them', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url).replace(/^.*\/api/, '/api'));
      return new Response(JSON.stringify({ ok: true, data: { id: 'job', media: { id: 'm' } } }), { status: 200 });
    }));
    const { uploadVoiceRecording, VOICE_PART_BYTES } = await import('@/blocks/voice-recorder');
    const blob = new Blob([new Uint8Array(VOICE_PART_BYTES * 2 + 10)], { type: 'audio/mp4' });
    const progress: string[] = [];
    await uploadVoiceRecording({ blob, mime: 'audio/mp4', title: 'T', trackId: 'voice_x', duration_s: 1500, onProgress: (a, b) => progress.push(`${a}/${b}`) });
    expect(calls).toEqual(['/api/annotation/voice/part', '/api/annotation/voice/part', '/api/annotation/voice/part', '/api/annotation/voice/transcribe']);
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
  });
});

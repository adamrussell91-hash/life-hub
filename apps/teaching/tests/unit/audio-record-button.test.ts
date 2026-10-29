import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioRecordButton } from '@/blocks/audio-record-button';

class FakeRecorder extends EventTarget {
  static isTypeSupported = (mime: string) => mime === 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    const data = Object.assign(new Event('dataavailable'), { data: new Blob(['abc'], { type: 'audio/webm' }) });
    this.dispatchEvent(data);
    this.dispatchEvent(new Event('stop'));
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function withMic(getUserMedia: () => Promise<MediaStream>) {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('audio block Record', () => {
  it('records, stops, and hands the take to the upload as an audio/webm file', async () => {
    withMic(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream);
    const files: File[] = [];
    const handle = createAudioRecordButton({
      upload: async (file) => {
        files.push(file);
      },
      uploaded: () => true,
      fileTitle: () => 'Lesson Explainer'
    });
    document.body.append(handle.el);
    const button = handle.el.querySelector('button')!;

    button.click();
    await flush();
    expect(button.textContent).toContain('Stop');
    expect(handle.el.classList.contains('is-recording')).toBe(true);

    button.click();
    await flush();
    expect(files).toHaveLength(1);
    expect(files[0]!.type).toBe('audio/webm');
    expect(files[0]!.name).toBe('Lesson Explainer.webm');
    expect(button.textContent).toBe('Record');
    expect(handle.el.querySelector<HTMLAnchorElement>('a')!.hidden).toBe(true);
  });

  it('keeps the take to download when the upload does not land', async () => {
    withMic(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:take' }));
    const handle = createAudioRecordButton({ upload: async () => undefined, uploaded: () => false });
    document.body.append(handle.el);
    const button = handle.el.querySelector('button')!;
    button.click();
    await flush();
    button.click();
    await flush();
    const rescue = handle.el.querySelector<HTMLAnchorElement>('a')!;
    expect(rescue.hidden).toBe(false);
    expect(rescue.download).toMatch(/\.webm$/);
  });

  it('says so when the microphone is blocked', async () => {
    withMic(async () => {
      throw new Error('denied');
    });
    const handle = createAudioRecordButton({ upload: async () => undefined, uploaded: () => false });
    handle.el.querySelector('button')!.click();
    await flush();
    expect(handle.el.textContent).toContain('Allow the microphone');
  });
});

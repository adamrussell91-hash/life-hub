import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/api/client';
import { FILE_MAX_BYTES, FILE_PART_BYTES, fileProblem, mountRecordingUpload, planFileParts, sendFileParts, sizeLabel } from '@/views/meeting-recording-upload';
import { createRecordingModel } from '@/views/meeting-recording-strip';

describe('planFileParts', () => {
  it('cuts a file into ranges that cover every byte once', () => {
    expect(planFileParts(10, 4)).toEqual([[0, 4], [4, 8], [8, 10]]);
    expect(planFileParts(8, 4)).toEqual([[0, 4], [4, 8]]);
    expect(planFileParts(0, 4)).toEqual([]);
  });
  it('keeps parts under the server limit by default', () => {
    const ranges = planFileParts(FILE_PART_BYTES * 2 + 1);
    expect(ranges).toHaveLength(3);
    expect(ranges.every(([a, b]) => b - a <= 4.5 * 1024 * 1024)).toBe(true);
  });
});

describe('fileProblem', () => {
  it('takes common audio files', () => {
    expect(fileProblem({ name: 'Memo 12.m4a', type: 'audio/x-m4a', size: 100 })).toBeNull();
    expect(fileProblem({ name: 'call.mp4', type: 'video/mp4', size: 100 })).toBeNull();
    expect(fileProblem({ name: 'talk.opus', type: '', size: 100 })).toBeNull();
  });
  it('says plainly what is wrong', () => {
    expect(fileProblem({ name: 'notes.pdf', type: 'application/pdf', size: 100 })).toMatch(/audio file/);
    expect(fileProblem({ name: 'a.mp3', type: 'audio/mpeg', size: 0 })).toMatch(/empty/);
    expect(fileProblem({ name: 'a.wav', type: 'audio/wav', size: FILE_MAX_BYTES + 1 })).toMatch(/over/);
  });
});

describe('sizeLabel', () => {
  it('shows megabytes', () => {
    expect(sizeLabel(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(sizeLabel(42 * 1024 * 1024)).toBe('42 MB');
  });
});

describe('sendFileParts', () => {
  const file = new Blob([new Uint8Array(10)]);
  const noWait = async () => {};

  it('sends each part in order with its own bytes', async () => {
    const sizes: Array<[number, number]> = [];
    await sendFileParts({ file, received: new Set(), partBytes: 4, wait: noWait, upload: async (i, blob) => { sizes.push([i, blob.size]); } });
    expect(sizes).toEqual([[0, 4], [1, 4], [2, 2]]);
  });

  it('retries a part that fails for a moment', async () => {
    let calls = 0;
    const received = new Set<number>();
    await sendFileParts({
      file, received, partBytes: 4, wait: noWait,
      upload: async (i) => {
        calls += 1;
        if (i === 1 && calls === 2) throw new ApiClientError({ code: 'network_error', message: 'offline' });
      }
    });
    expect([...received].sort()).toEqual([0, 1, 2]);
    expect(calls).toBe(4);
  });

  it('stops after a few failures and carries on later from the gap', async () => {
    const received = new Set<number>();
    let down = true;
    const upload = async (i: number) => {
      if (down && i === 1) throw new ApiClientError({ code: 'network_error', message: 'offline' });
    };
    await expect(sendFileParts({ file, received, partBytes: 4, wait: noWait, upload })).rejects.toThrow('offline');
    expect([...received]).toEqual([0]);
    down = false;
    const sent: number[] = [];
    await sendFileParts({ file, received, partBytes: 4, wait: noWait, upload: async (i) => { sent.push(i); } });
    expect(sent).toEqual([1, 2]);
  });

  it('does not retry a refusal', async () => {
    let calls = 0;
    const upload = async () => {
      calls += 1;
      throw new ApiClientError({ code: 'part_too_large', message: 'too large' }, 413);
    };
    await expect(sendFileParts({ file, received: new Set(), partBytes: 4, wait: noWait, upload })).rejects.toThrow('too large');
    expect(calls).toBe(1);
  });

  it('reports progress in bytes', async () => {
    const seen: number[] = [];
    await sendFileParts({ file, received: new Set(), partBytes: 4, wait: noWait, upload: async () => {}, onProgress: (sent) => seen.push(sent) });
    expect(seen).toEqual([0, 4, 8, 10]);
  });
});

describe('mountRecordingUpload', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });
  const mount = (recording: unknown) => {
    const model = createRecordingModel('meeting_1', async () => ({ recording, mac: { last_seen_at: null, version: null } }) as never);
    model.set({ recording, mac: { last_seen_at: null, version: null } } as never);
    const handle = mountRecordingUpload({ meetingId: 'meeting_1', kind: 'meeting', people: () => [], room: false, notes: () => [], model });
    document.body.append(handle.el);
    return { handle, model };
  };

  it('offers an upload when the meeting has no recording', () => {
    const { handle } = mount(null);
    expect(handle.el.hidden).toBe(false);
    expect(handle.el.querySelector('[data-part="rec-upload-open"]')).not.toBeNull();
  });

  it('stays out of the way once there is a recording', () => {
    const { handle } = mount({ id: 'rec_1', status: 'done' });
    expect(handle.el.hidden).toBe(true);
  });

  it('keeps Upload locked until a file is chosen and the consent box is ticked', () => {
    const { handle } = mount(null);
    handle.el.querySelector<HTMLButtonElement>('[data-part="rec-upload-open"]')!.click();
    const go = () => handle.el.querySelector<HTMLButtonElement>('[data-part="rec-upload-go"]')!;
    expect(go().disabled).toBe(true);
    const tick = handle.el.querySelector<HTMLInputElement>('[data-part="rec-upload-tick"]')!;
    tick.checked = true;
    tick.dispatchEvent(new Event('change'));
    expect(go().disabled).toBe(true);
    const input = handle.el.querySelector<HTMLInputElement>('[data-part="rec-upload-file"]')!;
    const memo = new File([new Uint8Array(20)], 'memo.m4a', { type: 'audio/x-m4a' });
    Object.defineProperty(input, 'files', { value: [memo] });
    input.dispatchEvent(new Event('change'));
    expect(go().disabled).toBe(false);
    expect(handle.el.textContent).toContain('memo.m4a');
  });

  it('does not hold up leaving the page when nothing is uploading', () => {
    mount(null);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    vi.restoreAllMocks();
  });
});

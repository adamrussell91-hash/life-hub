import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/api/client';
import { redraftEditor, type RedraftApi, type RedraftLoad } from '@/student/redraft-editor';

const TEXT = 'Before words. Middle words. After words.';
const load = (over: Partial<RedraftLoad> = {}): RedraftLoad => ({
  scope: { part: 'answers', field: 'q1', start: 14, end: 27 }, text: { answers: { q1: TEXT } }, prompts: { q1: 'How?' }, working: {}, ...over
});
const api = (l: RedraftLoad): RedraftApi => ({ load: vi.fn().mockResolvedValue(l), save: vi.fn().mockResolvedValue({}), send: vi.fn().mockResolvedValue({}) });
const settle = () => new Promise<void>((r) => { queueMicrotask(() => queueMicrotask(r)); });

describe('redraft editor', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('a section shows the words around it locked, and only the section editable', async () => {
    const box = redraftEditor(api(load()), () => undefined);
    await settle();
    expect([...box.querySelectorAll('.pg-redraft__locked')].map((n) => n.textContent)).toEqual(['Before words. ', ' After words.']);
    const areas = box.querySelectorAll('textarea');
    expect(areas.length).toBe(1);
    expect(areas[0]!.value).toBe('Middle words.');
  });

  it('a section at the very start leaves no empty locked line', async () => {
    const box = redraftEditor(api(load({ scope: { part: 'answers', field: 'q1', start: 0, end: 13 } })), () => undefined);
    await settle();
    expect([...box.querySelectorAll('.pg-redraft__locked')].map((n) => n.textContent)).toEqual([' Middle words. After words.']);
  });

  it('the whole piece gives a box per field under its prompt, resuming saved words', async () => {
    const box = redraftEditor(api(load({ scope: 'whole', working: { answers: { q1: 'Saved.' } } })), () => undefined);
    await settle();
    expect(box.querySelector('textarea')!.value).toBe('Saved.');
    expect(box.textContent).toContain('How?');
  });

  it('saves as they stop typing, flushes on send, then calls back', async () => {
    const a = api(load());
    const sent = vi.fn();
    const box = redraftEditor(a, sent);
    await settle();
    const area = box.querySelector('textarea')!;
    area.value = 'New words.';
    area.dispatchEvent(new Event('input'));
    box.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    await vi.waitFor(() => expect(sent).toHaveBeenCalled());
    expect(a.save).toHaveBeenCalledWith('answers', 'q1', 'New words.');
    expect(a.send).toHaveBeenCalled();
  });

  it('keeps the words and shows a retry when sending fails', async () => {
    const a = api(load());
    a.send = vi.fn().mockRejectedValue(new ApiClientError({ code: 'empty', message: 'Write something before you send it.' }));
    const box = redraftEditor(a, () => undefined);
    await settle();
    box.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    await vi.waitFor(() => expect(box.querySelector('.pg-redraft__status')!.textContent).toContain('Write something'));
    expect(box.querySelector('textarea')!.value).toBe('Middle words.');
    expect(box.querySelector<HTMLButtonElement>('[data-action="send"]')!.disabled).toBe(false);
  });

  it('a save that fails is tried again before the next send, so the words are not lost', async () => {
    const a = api(load());
    a.save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    const sent = vi.fn();
    const box = redraftEditor(a, sent);
    await settle();
    const area = box.querySelector('textarea')!;
    area.value = 'New words.';
    area.dispatchEvent(new Event('input'));
    const send = box.querySelector<HTMLButtonElement>('[data-action="send"]')!;
    send.click();
    await vi.waitFor(() => expect(send.disabled).toBe(false));
    expect(a.send).not.toHaveBeenCalled();
    send.click();
    await vi.waitFor(() => expect(sent).toHaveBeenCalled());
    expect(a.save).toHaveBeenCalledTimes(2);
    expect(a.send).toHaveBeenCalledTimes(1);
  });

  it('sending waits for a save already on its way', async () => {
    const a = api(load());
    let finishSave: (v: unknown) => void = () => undefined;
    a.save = vi.fn().mockImplementation(() => new Promise((r) => { finishSave = r; }));
    const box = redraftEditor(a, () => undefined);
    await settle();
    const area = box.querySelector('textarea')!;
    area.value = 'New words.';
    area.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(800);
    expect(a.save).toHaveBeenCalledTimes(1);
    box.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    await settle();
    expect(a.send).not.toHaveBeenCalled();
    finishSave({});
    await vi.waitFor(() => expect(a.send).toHaveBeenCalled());
    expect(a.save).toHaveBeenCalledTimes(1);
  });
});

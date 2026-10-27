import { describe, expect, it, vi } from 'vitest';
import { renderDone } from '@/blocks/done';

const block = { id: 'b1', type: 'block', block_type: 'done', variant: 'small', visibility: 'student_teacher', content: { label: 'I’ve finished this' } } as never;

describe('Done block', () => {
  it('on a known device shows one button with the initials', async () => {
    const call = vi.fn().mockResolvedValue({ need: null, initials: 'AR' });
    const host = renderDone(block, 'student', { lessonId: 'l1', classId: 'class1', profileCall: call });
    await vi.waitFor(() => expect(host.textContent).toContain('Done as AR'));
    host.querySelector('button')!.click();
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith('done', { lesson_id: 'l1' }));
    await vi.waitFor(() => expect(host.textContent).toContain('Marked done'));
  });
  it('on a new device asks for initials, claims them, then records done', async () => {
    const call = vi.fn().mockResolvedValueOnce({ need: 'initials' }).mockResolvedValue({ need: null, initials: 'AR' });
    const host = renderDone(block, 'student', { lessonId: 'l1', classId: 'class1', profileCall: call });
    await vi.waitFor(() => expect(host.querySelector('input')).toBeTruthy());
    (host.querySelector('input') as HTMLInputElement).value = 'ar';
    host.querySelector('button')!.click();
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith('claim', { initials: 'ar' }));
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith('done', { lesson_id: 'l1' }));
  });
  it('shows the server message when the initials are refused', async () => {
    const refused = Object.assign(new Error('XQ isn’t in this class. Check with your teacher.'), { name: 'ApiClientError', code: 'not_in_class' });
    const call = vi.fn().mockResolvedValueOnce({ need: 'initials' }).mockRejectedValueOnce(refused);
    const host = renderDone(block, 'student', { lessonId: 'l1', classId: 'class1', profileCall: call });
    await vi.waitFor(() => expect(host.querySelector('input')).toBeTruthy());
    host.querySelector('button')!.click();
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')!.textContent).not.toBe(''));
    expect(call).not.toHaveBeenCalledWith('done', expect.anything());
  });
  it('a lesson already done shows as done', async () => {
    const call = vi.fn().mockResolvedValue({ need: null, initials: 'AR', map: { lessons: [{ id: 'l1', done: true }] } });
    const host = renderDone(block, 'student', { lessonId: 'l1', classId: 'class1', profileCall: call });
    await vi.waitFor(() => expect(host.textContent).toContain('Marked done'));
  });
  it('outside a class there is nothing to tap', () => {
    expect(renderDone(block, 'student', { lessonId: 'l1' }).hidden).toBe(true);
  });
  it('teacher preview shows the button disabled', () => {
    const host = renderDone(block, 'teacher', {});
    expect(host.querySelector('button')!.disabled).toBe(true);
  });
});

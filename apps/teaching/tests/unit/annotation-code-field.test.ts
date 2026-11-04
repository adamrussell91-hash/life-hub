// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mountAnnotationCodeField } from '@/blocks/annotation-code-field';
import type { AnnotationCodeRef } from '@/schemas/block';

vi.mock('@/blocks/feedback-codes', async (original) => ({
  ...(await original<typeof import('@/blocks/feedback-codes')>()),
  loadFeedbackCodes: () =>
    Promise.resolve([{ id: 'code_ev', code: 'EV', label: 'Evidence', descriptor: 'Add evidence.', colour: 'blue' }])
}));

describe('annotation code field', () => {
  it('saves Strength ticked straight after typing a code', async () => {
    const saved: Array<AnnotationCodeRef | undefined> = [];
    const field = mountAnnotationCodeField(undefined, (next) => saved.push(next));
    await Promise.resolve();
    await Promise.resolve();
    const input = field.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = 'EV';
    input.dispatchEvent(new Event('input'));
    expect(saved.at(-1)?.positive).toBe(false);
    const box = field.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(saved.at(-1)?.positive).toBe(true);
  });

  it('asks for a code when Strength is ticked with none typed', () => {
    const saved: unknown[] = [];
    const field = mountAnnotationCodeField(undefined, (next) => saved.push(next));
    const box = field.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(saved).toEqual([]);
    expect(field.textContent).toContain('Type a code');
  });
});

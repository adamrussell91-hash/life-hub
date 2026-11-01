import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(async (path: string) => {
    if (path === '/api/skills-continuum') {
      return { continuum: { strands: [{ strand: 'arguing', name: 'Arguing', sub_strands: [{ id: 'thesis', name: 'Building a thesis' }] }] } };
    }
    return {
      codes: [
        { id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'This is a summary, not a claim.' },
        { id: 'e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Add a quote.', skill: 'arguing.thesis', ladder: ['One.', 'Two.', 'Three.', 'Four.', 'Five.'] }
      ]
    };
  }),
  put: vi.fn(async (_path: string, body: { codes: unknown[] }) => body)
}));
vi.mock('@/api/client', () => ({ apiGet: api.get, apiPut: api.put, apiPost: vi.fn(), ApiClientError: class extends Error {} }));

import { mountFeedbackCodesEditor } from '@/blocks/feedback-codes-editor';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('feedback codes editor: skills and ladders', () => {
  it('flags descriptor wording, links a skill, and saves a five-line ladder', async () => {
    const root = mountFeedbackCodesEditor();
    document.body.append(root);
    await settle();
    (root.querySelectorAll<HTMLButtonElement>('.fc-editor__head')[0]!).click();
    const flags = [...root.querySelectorAll<HTMLElement>('.nst-flag')].filter((f) => !f.hidden).map((f) => f.textContent);
    expect(flags[0]).toContain('Try wording this as something to do');
    expect(root.querySelector('.fc-ladder')).toBeNull();

    const skill = root.querySelector<HTMLSelectElement>('.fc-editor__skill')!;
    expect([...skill.options].map((o) => o.value)).toEqual(['', 'arguing.thesis']);
    skill.value = 'arguing.thesis';
    skill.dispatchEvent(new Event('change'));
    const rows = [...root.querySelectorAll<HTMLElement>('.fc-ladder__row')];
    expect(rows.map((r) => r.querySelector('label')!.textContent)).toEqual(['Building to Capable', 'Capable', 'Skilled', 'Accomplished', 'Excellent']);
    const first = rows[0]!.querySelector('input')!;
    first.value = 'Write one sentence that answers the question.';
    first.dispatchEvent(new Event('input'));
    expect(root.querySelector('.fc-ladder__hint')!.textContent).toBe('Fill all five lines to keep the ladder.');
    rows.slice(1).forEach((row, i) => {
      const box = row.querySelector('input')!;
      box.value = `Step ${i + 2}: add one more detail.`;
      box.dispatchEvent(new Event('input'));
    });
    expect(root.querySelector('.fc-ladder__hint')!.textContent).toBe('');

    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save codes')!.click();
    await settle();
    const sent = api.put.mock.lastCall![1].codes as Array<{ id: string; skill?: string; ladder?: string[] }>;
    expect(sent[0]).toMatchObject({ id: 'ts', skill: 'arguing.thesis' });
    expect(sent[0]!.ladder).toHaveLength(5);
    expect(sent[1]!.ladder).toEqual(['One.', 'Two.', 'Three.', 'Four.', 'Five.']);
    root.remove();
  });
});

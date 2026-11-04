import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountOrganiserCard } from '@/organiser/lesson-card';
import { organiserApi } from '@/organiser/api';
import type { TeacherOrganiser } from '@/organiser/types';

vi.mock('@/app/curriculum-state', () => ({ getCurriculum: () => Promise.resolve(null) }));
vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/organiser/week-row', () => ({ renderWeekRow: () => document.createElement('div') }));

const sheet = {
  organiser: {
    sections: [
      {
        id: 'sec_vocab',
        role: 'vocab',
        kind: 'table',
        name: 'Vocabulary',
        columns: [{ id: 'c0', label: 'Word' }, { id: 'c1', label: 'Meaning' }],
        lines: [
          { id: 'mine', cells: ['Lantern', 'A portable light'], lesson_id: 'lesson_here' },
          { id: 'other', cells: ['Harbour', 'A sheltered port'], lesson_id: 'lesson_other' },
          { id: 'free', cells: ['Meadow', 'A grassy field'], lesson_id: null }
        ]
      }
    ]
  },
  status: { mine: 'released', other: 'released', free: 'waiting' }
} as unknown as TeacherOrganiser;

describe('lesson organiser card ticks', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.spyOn(organiserApi, 'get').mockResolvedValue(sheet);
    vi.spyOn(organiserApi, 'estimateSuggest').mockResolvedValue({ estimate: { cost_aud: 0 } } as never);
  });

  it('ticks only the lesson\'s own lines; a line in another lesson stays unticked and locked', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountOrganiserCard(host, { lesson: { id: 'lesson_here', unit_id: 'unit_a' } });
    await vi.waitFor(() => expect(host.querySelector('input[data-line="mine"]')).not.toBeNull());
    const box = (id: string) => host.querySelector<HTMLInputElement>(`input[data-line="${id}"]`)!;

    expect(box('mine').checked).toBe(true);
    expect(box('mine').disabled).toBe(false);

    expect(box('other').checked).toBe(false);
    expect(box('other').disabled).toBe(true);
    expect(box('other').closest('.ko-pick')!.classList.contains('is-elsewhere')).toBe(true);

    expect(box('free').checked).toBe(false);
    expect(box('free').disabled).toBe(false);
  });
});

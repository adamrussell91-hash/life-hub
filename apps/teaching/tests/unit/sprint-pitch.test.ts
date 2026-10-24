// apps/teaching/tests/unit/sprint-pitch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { openPitchView } from '@/sprint/pitch-view';
import type { SprintSummary, SprintTeacherApi } from '@/sprint/api';
import type { Lesson } from '@/schemas/lesson';

const summary = { groups: [{ id: 'g1', name: 'Kestrel', students: [{ id: 'a' }, { id: 'b' }] }, { id: 'g2', name: 'Heron', students: [{ id: 'c' }, { id: 'd' }] }], class_parts: {}, ended: {}, lock: null, extend: {}, running: null, spotlight: null } as unknown as SprintSummary;
const board = (status: 'open' | 'closed' | 'released' | null) => ({ group: { id: 'g1', name: 'Kestrel' }, pitch: { kind: 'link', link: 'https://example.com/deck', by: 'Ann Bell' }, round: status ? { status, entries: [{ student_id: 'c' }] } : null });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('pitch view', () => {
  it('runs the first group, shows its pitch and the 2-minute timer', async () => {
    const api = { run: vi.fn(async () => summary), board: vi.fn(async () => board(null)), round: vi.fn(async () => summary), fileUrl: vi.fn() } as unknown as SprintTeacherApi;
    const close = openPitchView({ api, getLesson: () => ({ sprint: { criteria: [] } }) as unknown as Lesson, summary, onClose: vi.fn() });
    await flush();
    expect(api.run).toHaveBeenCalledWith('g1');
    const view = document.querySelector('.spitch')!;
    expect(view.querySelector('.spitch__who')?.textContent).toContain('Group Kestrel');
    expect(view.querySelector('.spitch__timer')?.textContent).toBe('2:00');
    expect(view.querySelector('a.spitch__link')?.getAttribute('href')).toBe('https://example.com/deck');
    close();
    expect(document.querySelector('.spitch')).toBeNull();
  });

  it('opens feedback and counts it against the class outside the group', async () => {
    const api = { run: vi.fn(async () => summary), board: vi.fn(async () => board('open')), round: vi.fn(async () => summary), fileUrl: vi.fn() } as unknown as SprintTeacherApi;
    const close = openPitchView({ api, getLesson: () => ({ sprint: { criteria: [] } }) as unknown as Lesson, summary, onClose: vi.fn() });
    await flush();
    document.querySelector<HTMLButtonElement>('[data-round="open"]')!.click();
    await flush();
    expect(api.round).toHaveBeenCalledWith('g1', 'open');
    expect(document.querySelector('.spitch__count')?.textContent).toBe('Feedback open · 1 of 2 in');
    close();
  });
});

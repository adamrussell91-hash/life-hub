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
          { id: 'free', cells: ['Meadow', 'A grassy field'], lesson_id: null },
          { id: 'word', cells: ['Estuary', 'Where a river meets the sea'], lesson_id: null },
          { id: 'piece', cells: ['Tide', 'The sea rising and falling'], lesson_id: 'lesson_other', piece_id: 'kp_tide' }
        ]
      }
    ]
  },
  status: { mine: 'released', other: 'released', free: 'waiting', word: 'waiting', piece: 'released' }
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
    [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Show all'))!.click();

    expect(box('mine').checked).toBe(true);
    expect(box('mine').disabled).toBe(false);

    expect(box('other').checked).toBe(false);
    expect(box('other').disabled).toBe(true);
    expect(box('other').closest('.ko-pick')!.classList.contains('is-elsewhere')).toBe(true);

    expect(box('free').checked).toBe(false);
    expect(box('free').disabled).toBe(false);
  });

  const onCard = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('input[data-line]')].map((b) => b.dataset.line);
  const mount = async (text: string, pieces: string[] = []) => {
    const host = document.createElement('div');
    document.body.append(host);
    const card = mountOrganiserCard(host, { lesson: { id: 'lesson_here', unit_id: 'unit_a' }, relevance: () => ({ pieces, text }) });
    await vi.waitFor(() => expect(host.querySelector('input[data-line="mine"]')).not.toBeNull());
    return { host, card };
  };

  it('shows the lesson\'s own ticks and leaves the rest of the sheet behind Show all', async () => {
    const { host } = await mount('Nothing on the sheet appears here.');
    expect(onCard(host)).toEqual(['mine']);
    const all = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Show all 5 lines')!;
    all.click();
    expect(onCard(host)).toEqual(['mine', 'other', 'free', 'word', 'piece']);
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Show this lesson’s lines')!.click();
    expect(onCard(host)).toEqual(['mine']);
  });

  it('adds an unclaimed line whose word is in the lesson, whole words only', async () => {
    const { host } = await mount('We walk the estuary at dawn, past the meadows.');
    expect(onCard(host)).toEqual(['mine', 'word']);
  });

  it('adds a line whose piece the lesson picked, greyed if another lesson holds it', async () => {
    const { host } = await mount('', ['kp_tide']);
    expect(onCard(host)).toEqual(['mine', 'piece']);
    expect(host.querySelector<HTMLInputElement>('input[data-line="piece"]')!.disabled).toBe(true);
  });

  it('leaves a word another lesson holds off the card', async () => {
    const { host } = await mount('A harbour in the lesson.');
    expect(onCard(host)).toEqual(['mine']);
  });

  it('keeps a line in place when it is unticked, so a slip can be undone', async () => {
    const next = { ...sheet, organiser: { sections: sheet.organiser.sections.map((s) => ({ ...s, lines: s.lines.map((l) => (l.id === 'mine' ? { ...l, lesson_id: undefined } : l)) })) } } as TeacherOrganiser;
    vi.spyOn(organiserApi, 'change').mockResolvedValue(next);
    const { host } = await mount('');
    const box = host.querySelector<HTMLInputElement>('input[data-line="mine"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(organiserApi.change).toHaveBeenCalled());
    await vi.waitFor(() => expect(host.querySelector<HTMLInputElement>('input[data-line="mine"]')!.checked).toBe(false));
    expect(onCard(host)).toEqual(['mine']);
  });

  it('refresh picks up a piece picked after the card loaded', async () => {
    const pieces: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const card = mountOrganiserCard(host, { lesson: { id: 'lesson_here', unit_id: 'unit_a' }, relevance: () => ({ pieces, text: '' }) });
    await vi.waitFor(() => expect(host.querySelector('input[data-line="mine"]')).not.toBeNull());
    pieces.push('kp_tide');
    card.refresh();
    expect(onCard(host)).toEqual(['mine', 'piece']);
  });
});

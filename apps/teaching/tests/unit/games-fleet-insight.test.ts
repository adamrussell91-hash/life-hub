import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/games/core/schema';
import { ApiClientError } from '@/api/client';
import type { FleetInsight } from '@/games/kinds/fleet-week/control-api';
import { fleetControlApi } from '@/games/kinds/fleet-week/control-api';
import { fleetInsightPanel, heatStep, renderFleetInsight } from '@/games/kinds/fleet-week/insight';
import { mountGameEditor } from '@/games/editor';
import { newGame } from '@/games/seed';
import type { Lesson } from '@/schemas/lesson';

// Invented people and content only.
const GAME = {
  id: 'g_fleet', title: 'Poetry fleet', kind: 'fleet_week', solo: false, live: false,
  columns: ['Form', 'Voice', 'Image', 'Sound', 'Theme'], rows: ['Poem A', 'Poem B', 'Poem C', 'Poem D', 'Poem E'], squares: [], recall: [], settings: {}
} as unknown as Game;

const LABEL = (sq: number) => `${'ABCDE'[Math.floor(sq / 5)]}${(sq % 5) + 1}`;
const rate = (answered: number, right: number) => ({ answered, right, accuracy: answered ? Math.round((right / answered) * 100) / 100 : null });

function makeInsight(over: Partial<FleetInsight> = {}): FleetInsight {
  const grid = Array.from({ length: 25 }, (_, square) => {
    const answered = square % 6 === 5 ? 0 : 4;
    const right = answered ? square % 5 : 0;
    return {
      square, label: LABEL(square), row: `Poem ${'ABCDE'[Math.floor(square / 5)]}`, column: ['Form', 'Voice', 'Image', 'Sound', 'Theme'][square % 5]!,
      ...rate(answered, Math.min(right, answered)), first: rate(answered ? 3 : 0, Math.min(right, 3)), returning: rate(answered ? 1 : 0, right >= 4 ? 1 : 0)
    };
  });
  return {
    campaign_id: 'camp1', game_id: 'g_fleet', rounds: 3, grid,
    calibration: [
      { student_id: 's1', name: 'Pip Marlow', sure_right: 3, sure_total: 4, unsure_right: 1, unsure_total: 3, calibration: 0.75 },
      { student_id: 's2', name: 'Juno Castell', sure_right: 0, sure_total: 0, unsure_right: 2, unsure_total: 5, calibration: null }
    ],
    confident_errors: [{ name: 'Rafe Okonjo', square: 7, label: 'B3', row: 'Poem B', column: 'Image', prompt: 'What does the gull stand for?', answer: 'the weather', round: 2 }],
    hardest: [{ square: 0, label: 'A1', row: 'Poem A', column: 'Form', answered: 4, right: 0, accuracy: 0 }],
    ...over
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => document.body.replaceChildren());

describe('Fleet week insight', () => {
  it('steps accuracy into five shades, zero when nobody answered', () => {
    expect(heatStep(null, 0)).toBe(0);
    expect(heatStep(0, 3)).toBe(1);
    expect(heatStep(0.39, 3)).toBe(2);
    expect(heatStep(0.5, 3)).toBe(3);
    expect(heatStep(1, 3)).toBe(5);
  });

  it('renders 25 heat-map cells with numbers, so it reads without colour', () => {
    const box = renderFleetInsight(makeInsight(), GAME);
    document.body.append(box);
    const cells = [...box.querySelectorAll<HTMLElement>('.fwi-heat__cell')];
    expect(cells).toHaveLength(25);
    // A1: 0 of 4 right, the hardest (outlined, and said in words).
    expect(cells[0]!.textContent).toContain('0%');
    expect(cells[0]!.textContent).toContain('0/4');
    expect(cells[0]!.classList.contains('is-hard')).toBe(true);
    expect(cells[0]!.textContent).toContain('one of the hardest');
    // A4: 3 of 4.
    expect(cells[3]!.textContent).toContain('75%');
    expect(cells[3]!.className).toContain('fwi-heat__cell--4');
    // A6 doesn't exist; B1 (square 5) was never answered.
    expect(cells[5]!.textContent).toBe('—');
    expect(cells[5]!.className).toContain('fwi-heat__cell--0');
    // Row and column topics as headers.
    expect(box.querySelector('.fwi-heat thead')!.textContent).toContain('Image');
    expect(box.querySelector('.fwi-heat tbody')!.textContent).toContain('Poem C');
  });

  it('shows first try against returning, and a calibration row per student', () => {
    const box = renderFleetInsight(makeInsight(), GAME);
    const split = box.querySelector('.fwi-split')!;
    expect(split.querySelector('caption')!.textContent).toBe('First try against returning, per square');
    expect(split.querySelectorAll('tbody tr').length).toBe(21);
    expect(split.querySelector('tbody tr')!.textContent).toContain('A1');
    const cal = [...box.querySelectorAll('.fwi-cal tbody tr')].map((r) => [...r.children].map((c) => c.textContent));
    expect(cal).toEqual([
      ['Pip Marlow', '3 of 4', '1 of 3', '75%'],
      ['Juno Castell', '—', '2 of 5', 'No Sure shots']
    ]);
  });

  it('lists confident errors for the teacher', () => {
    const box = renderFleetInsight(makeInsight(), GAME);
    const errors = box.querySelector('.fwi-errors')!;
    expect(errors.textContent).toContain('Confident errors (1) · teacher only');
    expect(errors.textContent).toContain('Rafe Okonjo · B3 (Poem B · Image) · round 2');
    expect(errors.textContent).toContain('Answered: the weather');
  });

  it('says so when nothing has been answered yet', () => {
    const empty = makeInsight({ grid: makeInsight().grid.map((g) => ({ ...g, answered: 0, right: 0, accuracy: null })) });
    expect(renderFleetInsight(empty, GAME).textContent).toContain('No shots answered yet');
  });

  it('the panel loads campaign_insight for the class', async () => {
    const call = vi.fn(async () => makeInsight());
    const api = fleetControlApi(call as never);
    const panel = fleetInsightPanel({ game: GAME, classId: 'c_10x', api });
    document.body.append(panel);
    expect(panel.textContent).toContain('Loading the insight');
    await flush();
    expect(call).toHaveBeenCalledWith('campaign_insight', { game_id: 'g_fleet', class_id: 'c_10x' });
    expect(panel.querySelectorAll('.fwi-heat__cell')).toHaveLength(25);
  });

  it('the panel explains a class with no campaign', async () => {
    const api = fleetControlApi((async () => {
      throw new ApiClientError({ code: 'no_campaign', message: 'No Fleet week is running for this class.' } as never);
    }) as never);
    const panel = fleetInsightPanel({ game: GAME, classId: 'c_10x', api });
    await flush();
    expect(panel.textContent).toContain('No Fleet week campaign is open for this class.');
    expect(fleetInsightPanel({ game: GAME, classId: null, api }).textContent).toContain('Pick a class');
  });

  it('the editor’s Results tab shows the insight for a Fleet week game', async () => {
    const fleetGame = newGame('fleet_week', 'g_fw');
    let lesson = { id: 'lesson_fw', type: 'lesson', title: 'Fleet lesson', unit_id: 'unit_fw', pedagogical_mode: 'game', blocks: [], game: { games: [fleetGame] } } as unknown as Lesson;
    const call = vi.fn(async (action: string) => (action === 'campaign_insight' ? makeInsight() : {}));
    const host = document.createElement('div');
    document.body.append(host);
    const editor = mountGameEditor({
      getLesson: () => lesson,
      emitLesson: (next) => {
        lesson = next;
      },
      classes: [{ id: 'class_fw', name: '10X' }],
      api: {
        results: vi.fn(async () => ({ version: 'v1', class_id: 'class_fw', games: [{ game_id: 'g_fw', title: 'Fleet', kind: 'fleet_week' as const, plays: 4, items: [], students: [] }] })),
        pushToMarkbook: vi.fn(async () => ({ column_id: 'c1', count: 1 })),
        sources: vi.fn(async () => ({ unit_id: null, terms: [], questions: [], quotes: [] })),
        fleet: fleetControlApi(call as never)
      }
    });
    host.append(editor.root);
    editor.tabs.set('results');
    await flush();
    await flush();
    await flush();
    expect(call).toHaveBeenCalledWith('campaign_insight', { game_id: 'g_fw', class_id: 'class_fw' });
    const panel = host.querySelector('.gm-result .fwi-panel')!;
    expect(panel.querySelector('.fwi-panel__title')!.textContent).toBe('Fleet week insight');
    expect(panel.querySelectorAll('.fwi-heat__cell')).toHaveLength(25);
    editor.dispose();
  });
});

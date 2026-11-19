import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicGame } from '@/games/core/schema';
import type { FleetCampaignClient, FleetView } from '@/games/kinds/fleet-week/campaign-api';
import { openFleetCampaign, type FleetCampaign } from '@/games/kinds/fleet-week/campaign';
import { mountGameArcade } from '@/games/arcade';
import type { GameClient } from '@/games/api';
import type { PublishedLesson } from '@/schemas/published-lesson';

// Invented content only.
const game = { id: 'g_fleet', title: 'Harbour Lights fleet', kind: 'fleet_week', solo: false, live: false, count: 25, settings: {}, items: [] } as unknown as PublicGame;

const baseView = (over: Partial<FleetView> = {}): FleetView => ({
  campaign: 'c1',
  phase: 'placement',
  round: 0,
  rounds: 5,
  closes_at: null,
  labels: { columns: ['Mara', 'Tobin', 'Quill', 'Ines', 'Wren'], rows: ['Pride', 'Loss', 'Trust', 'Power', 'Home'] },
  me: { sign: 'Captain Heron', ships: ['s0', 's3'], placed: false },
  team: { signs: { a1: 'Ensign Moss' }, fleet: [{ id: 's1', squares: [20, 21] }], chart: {} },
  rival: { signs: ['Admiral Fern', 'Bosun Reed'], chart: {}, sunk: [] },
  shots: { left: 0, returning: [] },
  owed: [],
  match_over: false,
  score: { us: 0, them: 0 },
  ...over
});

const fakeClient = (first: FleetView, over: Partial<FleetCampaignClient> = {}): FleetCampaignClient => ({
  state: vi.fn(async () => first),
  place: vi.fn(async () => baseView({ me: { ...first.me, placed: true } })),
  commit: vi.fn(async (_g: string, square: number, sure: boolean) => ({ square, sure, question: { id: 'q1', kind: 'short_answer', prompt: 'Who keeps the lighthouse key?' }, deadline: Date.now() + 60_000 })),
  answer: vi.fn(async () => ({ ok: true as const })),
  report: vi.fn(async () => ({ ok: true as const })),
  recall: vi.fn(async () => ({ ok: true as const })),
  ...over
});

const flush = () => new Promise((r) => setTimeout(r, 0));
let open: FleetCampaign | null = null;
function start(client: FleetCampaignClient) {
  open = openFleetCampaign(document.body, { lessonId: 'lesson_fw', classId: 'class_fw', game, client, pollMs: 60_000 });
  return document.body.querySelector<HTMLElement>('.fw')!;
}
const cell = (root: HTMLElement, sq: number) => root.querySelector<HTMLButtonElement>(`button.fw-cell[data-square="${sq}"]`)!;
const byText = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!;

afterEach(() => {
  open?.close();
  open = null;
  sessionStorage.clear();
  document.body.replaceChildren();
});

describe('fleet week phone', () => {
  it('places my ships and sends them with fleet_place', async () => {
    const client = fakeClient(baseView());
    const root = start(client);
    await flush();
    expect(root.textContent).toContain('Hide your ships');
    expect(root.textContent).toContain('Pride');
    // Teammate's ship shows.
    expect(root.querySelector('[data-square="20"]')?.classList.contains('fw-ship--mate')).toBe(true);
    // s0 (three) across from A1, then s3 (one) at E5.
    cell(root, 0).click();
    cell(root, 24).click();
    const confirm = byText(root, 'Confirm placement');
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await flush();
    expect(client.place).toHaveBeenCalledWith('g_fleet', [
      { id: 's0', squares: [0, 1, 2] },
      { id: 's3', squares: [24] }
    ]);
    expect(root.textContent).toContain('Your ships are at sea');
  });

  it('shows a server placement problem inline', async () => {
    const err = Object.assign(new Error('Keep a square of sea between your ships and your partner’s.'), { code: 'bad_place' });
    const client = fakeClient(baseView(), { place: vi.fn(async () => Promise.reject(err)) });
    const root = start(client);
    await flush();
    cell(root, 10).click();
    cell(root, 4).click();
    byText(root, 'Confirm placement').click();
    await flush();
    expect(root.querySelector('.fw-error')?.textContent).toContain('Keep a square of sea');
  });

  it('commits a square only after Sure or Unsure, then sends the answer with its writing log', async () => {
    const client = fakeClient(baseView({ phase: 'firing', round: 1, me: { sign: 'Captain Heron', ships: ['s0', 's3'], placed: true }, shots: { left: 4, returning: [] }, rival: { signs: [], chart: { 3: 'miss' }, sunk: [] } }));
    const root = start(client);
    await flush();
    expect(root.textContent).toContain('4 shells left');
    expect(cell(root, 3).disabled).toBe(true);
    cell(root, 7).click();
    expect(client.commit).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain('lighthouse');
    byText(root, 'Sure').click();
    await flush();
    expect(client.commit).toHaveBeenCalledWith('g_fleet', 7, true);
    expect(root.textContent).toContain('Who keeps the lighthouse key?');
    expect(root.querySelector('.fw-clock')?.textContent).toMatch(/left/);
    const box = root.querySelector<HTMLTextAreaElement>('textarea')!;
    box.value = 'The keeper';
    box.dispatchEvent(new Event('input'));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(client.answer).toHaveBeenCalledTimes(1);
    const [gameId, text, log] = (client.answer as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(gameId).toBe('g_fleet');
    expect(text).toBe('The keeper');
    expect(log).toBeTruthy();
    expect(log.pastes).toBe(0);
    expect(root.textContent).toContain('Answer sent');
    expect(root.textContent).not.toMatch(/correct|wrong|right!/i);
  });

  it('resumes an open shot from the view after a reload', async () => {
    const shot = { square: 12, sure: false, question: { id: 'q2', kind: 'short_answer', prompt: 'Name the harbour town.' }, deadline: Date.now() + 30_000 };
    const client = fakeClient(baseView({ phase: 'firing', round: 2, shots: { left: 3, open: shot, returning: [] } }));
    const root = start(client);
    await flush();
    expect(root.textContent).toContain('Name the harbour town.');
    expect(client.commit).not.toHaveBeenCalled();
  });

  it('a damage report shows the question and the partner’s answer, then files the line', async () => {
    const owed = { hit: 'h_x', square: 6, due: 3, question: { id: 'q3', kind: 'short_answer', prompt: 'What does the lamp stand for?' }, answer: 'Hope for the sailors', by: 'Ensign Moss' };
    const client = fakeClient(baseView({ phase: 'firing', round: 2, shots: { left: 4, returning: [] }, owed: [owed] }));
    const root = start(client);
    await flush();
    expect(root.textContent).toContain('Damage report');
    expect(root.textContent).toContain('What does the lamp stand for?');
    expect(root.querySelector('.fw-partner-answer')?.textContent).toBe('Hope for the sailors');
    expect(root.textContent).toContain('Why is that right?');
    const box = root.querySelector<HTMLTextAreaElement>('textarea')!;
    box.value = 'The lamp guides them home';
    box.dispatchEvent(new Event('input'));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(client.report).toHaveBeenCalledWith('g_fleet', 'h_x', 'The lamp guides them home', expect.objectContaining({ pastes: 0 }));
  });

  it('waits for the teacher when there is no campaign', async () => {
    const err = Object.assign(new Error('Your teacher hasn’t started this game yet.'), { code: 'no_campaign' });
    const root = start(fakeClient(baseView(), { state: vi.fn(async () => Promise.reject(err)) }));
    await flush();
    expect(root.textContent).toContain('Waiting for your teacher to start the campaign');
  });
});

describe('arcade: fleet week card', () => {
  it('offers Open Fleet week and opens the campaign phone', async () => {
    const lesson = { lesson_id: 'lesson_fw', title: 'Fleet', blocks: [], published_at: '2026-11-19T09:00:00.000Z', schema_version: 1, pedagogical_mode: 'game', game: { version: 'v1', games: [game] } } as unknown as PublishedLesson;
    const gc: GameClient = { load: vi.fn(async () => ({ identity: { need: null, initials: 'AB' }, games: [], closed: false, results: {} })), claim: vi.fn(), start: vi.fn(), send: vi.fn(), finish: vi.fn() };
    const fleetClient = fakeClient(baseView());
    const host = document.createElement('div');
    document.body.append(host);
    const arcade = mountGameArcade(host, { lesson, classId: 'class_fw', client: gc, fleetClient, renderHero: () => undefined });
    await flush();
    const b = host.querySelector<HTMLButtonElement>('[data-game-id="g_fleet"] button')!;
    expect(b.textContent).toBe('Open Fleet week');
    b.click();
    await flush();
    expect(fleetClient.state).toHaveBeenCalledWith('g_fleet');
    expect(document.body.querySelector('.fw')).toBeTruthy();
    arcade.dispose();
    expect(document.body.querySelector('.fw')).toBeNull();
  });
});

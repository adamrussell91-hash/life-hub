import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/organiser/print', () => ({ printOrganiser: vi.fn() }));
import { TOAST_MS, createFleetSignals, fleetHref, fleetTarget, resetFleetSignals, type FleetSignal, type FleetSignalSource } from '@/games/kinds/fleet-week/signals';
import { openFleetCampaign, viewSignals } from '@/games/kinds/fleet-week/campaign';
import type { FleetView } from '@/games/kinds/fleet-week/campaign-api';
import { renderNowStrip, resetNowStrip } from '@/student/now-strip';
import { mountGameArcade } from '@/games/arcade';
import type { GameClient } from '@/games/api';
import type { PublicGame } from '@/games/core/schema';
import type { PublishedLesson } from '@/schemas/published-lesson';

// Invented content only.
const ev = (kind: FleetSignal['kind'], round: number | 'final' = 1, game = 'g_fleet'): FleetSignal => ({
  id: `0123456789abcdef:${kind}:${round}`,
  kind,
  line: { round_open: 'Four shells ready.', report_ready: 'Dawn report is in.', hit: "You've been hit.", report_owed: 'Your partner hit something. Confirm it.', reveal: 'The fog is lifting.' }[kind],
  game_id: game,
  lesson_id: 'lesson_fw'
});
const source = (events: FleetSignal[]): FleetSignalSource & { load: ReturnType<typeof vi.fn>; seen: ReturnType<typeof vi.fn> } => ({
  load: vi.fn(async () => ({ events })),
  seen: vi.fn(async () => ({ ok: true }))
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const reduceMotion = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  resetFleetSignals();
  resetNowStrip();
  reduceMotion(false);
});
afterEach(() => {
  resetFleetSignals();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('fleet week signals', () => {
  it('the anchor counts what is waiting and glows', async () => {
    const s = createFleetSignals({ source: source([ev('report_ready'), ev('report_owed')]), open: vi.fn() });
    const badge = s.badge();
    document.body.append(badge);
    expect(badge.disabled).toBe(true);
    await flush();
    expect(badge.querySelector('svg')).toBeTruthy();
    expect(badge.querySelector('.fws-anchor__count')?.textContent).toBe('2');
    expect(badge.classList.contains('fws-anchor--waiting')).toBe(true);
    expect(badge.getAttribute('aria-label')).toBe('Fleet week: 2 waiting');
    s.dispose();
  });

  it('a toast slides in once per event, with the label and the line', async () => {
    const src = source([ev('report_ready')]);
    const s = createFleetSignals({ source: src, open: vi.fn() });
    await flush();
    const toasts = () => document.querySelectorAll('.fws-toast');
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].textContent).toContain('Fleet week');
    expect(toasts()[0].textContent).toContain('Dawn report is in.');
    // Focus reads again; the same event doesn't toast twice.
    toasts()[0].querySelector<HTMLButtonElement>('.fws-toast__close')!.click();
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(src.load).toHaveBeenCalledTimes(2);
    expect(toasts()).toHaveLength(0);
    // Nor on the next page load on this device.
    const again = createFleetSignals({ source: source([ev('report_ready')]), open: vi.fn() });
    await flush();
    expect(toasts()).toHaveLength(0);
    s.dispose();
    again.dispose();
  });

  it('tapping the toast opens the game and sends the seen id', async () => {
    const src = source([ev('report_owed', 2)]);
    const open = vi.fn();
    const s = createFleetSignals({ source: src, open });
    const badge = s.badge();
    document.body.append(badge);
    await flush();
    document.querySelector<HTMLButtonElement>('.fws-toast__go')!.click();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ kind: 'report_owed', game_id: 'g_fleet' }), expect.any(Promise));
    expect(src.seen).toHaveBeenCalledWith(['0123456789abcdef:report_owed:2']);
    expect(badge.querySelector('.fws-anchor__count')?.hasAttribute('hidden')).toBe(true);
    expect(document.querySelector('.fws-toast')).toBeNull();
    s.dispose();
  });

  it('a toast that hides by itself counts as seen and clears the count', async () => {
    vi.useFakeTimers();
    const src = source([ev('report_ready', 3)]);
    const s = createFleetSignals({ source: src, open: vi.fn() });
    const badge = s.badge();
    document.body.append(badge);
    await vi.advanceTimersByTimeAsync(0);
    expect(badge.querySelector('.fws-anchor__count')?.textContent).toBe('1');
    await vi.advanceTimersByTimeAsync(TOAST_MS + 10);
    expect(document.querySelector('.fws-toast')).toBeNull();
    expect(src.seen).toHaveBeenCalledWith(['0123456789abcdef:report_ready:3']);
    expect(badge.querySelector('.fws-anchor__count')?.hasAttribute('hidden')).toBe(true);
    s.dispose();
  });

  it('never polls: reads on load and on focus only', async () => {
    vi.useFakeTimers();
    const src = source([]);
    const s = createFleetSignals({ source: src, open: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(src.load).toHaveBeenCalledTimes(1);
    s.dispose();
    window.dispatchEvent(new Event('focus'));
    expect(src.load).toHaveBeenCalledTimes(1);
  });

  it('a round opening sends a ship across the page; a hit flashes and smokes the anchor', async () => {
    const s = createFleetSignals({ source: source([ev('hit', 2), ev('round_open', 3)]), open: vi.fn() });
    const badge = s.badge();
    document.body.append(badge);
    await flush();
    expect(badge.classList.contains('fws-anchor--hit')).toBe(true);
    expect(badge.querySelector('.fws-smoke')).toBeTruthy();
    // The second toast waits for the first.
    expect(document.querySelectorAll('.fws-toast')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('.fws-toast__close')!.click();
    expect(document.querySelector('.fws-toast')?.textContent).toContain('Four shells ready.');
    expect(document.querySelector('.fws-ship')).toBeTruthy();
    s.dispose();
  });

  it('reduced motion: the toast fades in, with no ship, flash or smoke', async () => {
    reduceMotion(true);
    const s = createFleetSignals({ source: source([ev('round_open', 1), ev('hit', 1)]), open: vi.fn() });
    const badge = s.badge();
    document.body.append(badge);
    await flush();
    const toast = document.querySelector('.fws-toast')!;
    expect(toast.classList.contains('fws-toast--calm')).toBe(true);
    expect(document.querySelector('.fws-ship')).toBeNull();
    toast.querySelector<HTMLButtonElement>('.fws-toast__close')!.click();
    expect(document.querySelector('.fws-toast')?.textContent).toContain("You've been hit.");
    expect(badge.classList.contains('fws-anchor--hit')).toBe(false);
    expect(document.querySelector('.fws-smoke')).toBeNull();
    s.dispose();
  });

  it('a tap from another page goes to the game lesson, and the arcade reads it back', () => {
    const href = fleetHref('class_fw', ev('report_owed', 2));
    expect(href).toBe('/s/classes/class_fw/lessons/lesson_fw?fleet=g_fleet&go=report_owed');
    expect(fleetTarget(href.split('?')[1])).toEqual({ game: 'g_fleet', go: 'report_owed' });
    expect(fleetTarget('?fleet=../x')).toBeNull();
  });
});

describe('signals on the now strip', () => {
  it('puts the anchor on the strip, and shows an anchor-only strip when nothing else is due', async () => {
    const s = createFleetSignals({ source: source([ev('reveal', 'final')]), open: vi.fn() });
    const strip = renderNowStrip(undefined, { classId: 'class_fw', pointer: false, fleet: s })!;
    document.body.append(strip);
    await flush();
    expect(strip.classList.contains('ns-strip--fleet')).toBe(true);
    const badge = strip.querySelector<HTMLButtonElement>('.fws-anchor')!;
    expect(badge.hidden).toBe(false);
    expect(badge.querySelector('.fws-anchor__count')?.textContent).toBe('1');
    expect(strip.classList.contains('ns-strip--quiet')).toBe(false);
    expect(renderNowStrip(undefined, { classId: 'class_fw', pointer: false })).toBeNull();
    // Once seen, the anchor-only strip hides by class (no :has() needed).
    badge.click();
    expect(strip.classList.contains('ns-strip--quiet')).toBe(true);
    s.dispose();
  });

  it('marks the strip row when the anchor shows beside a to-do', async () => {
    const s = createFleetSignals({ source: source([ev('reveal', 'final')]), open: vi.fn() });
    const todo = { countdowns: [], announcements: [], practice: null, waiting: [], more: 0, boxes: [{ key: 'now', items: [{ id: 'l1', title: 'Harbour Lights chapter four', kind: 'lesson', done: false, reason: '' }] }] } as never;
    const strip = renderNowStrip(todo, { classId: 'class_fw', pointer: false, fleet: s })!;
    document.body.append(strip);
    const inner = strip.querySelector('.ns-strip__in')!;
    expect(inner.classList.contains('ns-strip__in--anchor')).toBe(false);
    await flush();
    expect(inner.classList.contains('ns-strip__in--anchor')).toBe(true);
    s.dispose();
  });
});

describe('signals on the arcade card', () => {
  const game = { id: 'g_fleet', title: 'Harbour Lights fleet', kind: 'fleet_week', solo: false, live: false, count: 25, settings: {}, items: [] } as unknown as PublicGame;
  const lesson = { lesson_id: 'lesson_fw', title: 'Fleet', blocks: [], published_at: '2026-11-19T09:00:00.000Z', schema_version: 1, pedagogical_mode: 'game', game: { version: 'v1', games: [game] } } as unknown as PublishedLesson;
  const gc = (): GameClient => ({ load: vi.fn(async () => ({ identity: { need: null, initials: 'AB' }, games: [], closed: false, results: {} })), claim: vi.fn(), start: vi.fn(), send: vi.fn(), finish: vi.fn() });
  const view = { campaign: 'c1', phase: 'firing', round: 2, rounds: 5, closes_at: null, labels: { columns: [], rows: [] }, me: { sign: 'Captain Heron', ships: [], placed: true }, team: { signs: {}, fleet: [], chart: {} }, rival: { signs: [], chart: {}, sunk: [] }, shots: { left: 4, returning: [] }, owed: [], match_over: false, score: { us: 0, them: 0 } } as unknown as FleetView;

  it('reads the lesson signals, badges the card and opens the game from the toast', async () => {
    const fleetClient = {
      state: vi.fn(async () => view), place: vi.fn(), commit: vi.fn(), answer: vi.fn(), report: vi.fn(), recall: vi.fn(),
      signals: vi.fn(async () => ({ events: [ev('round_open', 2)] })),
      signalsSeen: vi.fn(async () => ({ ok: true as const }))
    };
    const host = document.createElement('div');
    document.body.append(host);
    const arcade = mountGameArcade(host, { lesson, classId: 'class_fw', client: gc(), fleetClient, renderHero: () => undefined });
    await flush();
    await flush();
    expect(fleetClient.signals).toHaveBeenCalledWith();
    const badge = host.querySelector<HTMLButtonElement>('[data-game-id="g_fleet"] .fws-anchor')!;
    expect(badge.querySelector('.fws-anchor__count')?.textContent).toBe('1');
    document.querySelector<HTMLButtonElement>('.fws-toast__go')!.click();
    await flush();
    expect(fleetClient.signalsSeen).toHaveBeenCalledWith(['0123456789abcdef:round_open:2']);
    expect(fleetClient.state).toHaveBeenCalledWith('g_fleet');
    expect(document.querySelector('.fw')).toBeTruthy();
    arcade.dispose();
  });
});

describe('signals inside the game, from the poll', () => {
  it('a view change asks the lesson signals for the server ids, toasts them and sends them seen', async () => {
    const game = { id: 'g_fleet', title: 'Harbour Lights fleet', kind: 'fleet_week', solo: false, live: false, count: 25, settings: {}, items: [] } as unknown as PublicGame;
    const first = { campaign: 'c1', phase: 'firing', round: 1, rounds: 5, closes_at: null, labels: { columns: [], rows: [] }, me: { sign: 'Captain Heron', ships: [], placed: true }, team: { signs: {}, fleet: [], chart: {} }, rival: { signs: [], chart: {}, sunk: [] }, shots: { left: 0, returning: [] }, owed: [], match_over: false, score: { us: 0, them: 0 } } as unknown as FleetView;
    const next = { ...first, round: 2, shots: { left: 4, returning: [] }, owed: [{ hit: 'h1', square: 7, due: 3, question: null, answer: 'x', by: 'Ensign Moss' }] } as unknown as FleetView;
    const server = ev('report_owed', 1);
    const client = {
      state: vi.fn().mockResolvedValueOnce(first).mockResolvedValue(next),
      place: vi.fn(), commit: vi.fn(), answer: vi.fn(), report: vi.fn(), recall: vi.fn(),
      signals: vi.fn(async () => ({ events: [server, ev('reveal', 'final', 'g_other')] })),
      signalsSeen: vi.fn(async () => ({ ok: true as const }))
    };
    const camp = openFleetCampaign(document.body, { lessonId: 'lesson_fw', classId: 'class_fw', game, client, pollMs: 60_000 });
    await flush();
    expect(client.signals).not.toHaveBeenCalled();
    await camp.refresh();
    await flush();
    expect(client.signals).toHaveBeenCalledWith('g_fleet');
    const toasts = [...document.querySelectorAll('.fws-toast')];
    expect(toasts).toHaveLength(1);
    expect(toasts[0].getAttribute('data-signal')).toBe(server.id);
    toasts[0].querySelector<HTMLButtonElement>('.fws-toast__close')!.click();
    expect(client.signalsSeen).toHaveBeenCalledWith([server.id]);
    camp.close();
  });

  const base = { campaign: 'c1', phase: 'firing', round: 1, rounds: 5, closes_at: null, labels: { columns: [], rows: [] }, me: { sign: 'Captain Heron', ships: [], placed: true }, team: { signs: {}, fleet: [], chart: {} }, rival: { signs: [], chart: {}, sunk: [] }, shots: { left: 0, returning: [] }, owed: [], match_over: false, score: { us: 0, them: 0 } } as unknown as FleetView;
  const ids = { gameId: 'g_fleet', lessonId: 'lesson_fw' };

  it('derives round_open, report_ready, hit and report_owed from view changes', () => {
    expect(viewSignals(null, base, ids)).toEqual([]);
    const next = {
      ...base,
      round: 2,
      shots: { left: 4, returning: [] },
      report: { round: 1, lines: [{ side: 'them', by: 'Bosun Reed', square: 3, sure: false, outcome: 'hit', damage: 2 }], pings: [] },
      owed: [{ hit: 'h1', square: 7, due: 2, question: null, answer: 'x', by: 'Ensign Moss' }]
    } as unknown as FleetView;
    expect(viewSignals(base, next, ids).map((e) => e.id)).toEqual(['c1:hit:1', 'c1:report_ready:1', 'c1:report_owed:1', 'c1:round_open:2']);
    expect(viewSignals(next, next, ids)).toEqual([]);
    const revealed = { ...next, phase: 'reveal', reveal: { names: {}, fleets: { us: [], them: [] }, standings: null, calibration: { right: 0, total: 0 } } } as unknown as FleetView;
    expect(viewSignals(next, revealed, ids).map((e) => e.line)).toEqual(['The fog is lifting.']);
  });
});

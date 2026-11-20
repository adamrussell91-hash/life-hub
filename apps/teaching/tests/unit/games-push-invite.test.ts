import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Arcade, GameClient } from '@/games/api';

// Push invite: the class page toast (student/game-invite.ts) and the arcade's one-tap join.
// Invented content only.

const apiGet = vi.fn();
const navigate = vi.fn();
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), apiGet: (...a: unknown[]) => apiGet(...a) }));
vi.mock('@/app/router', async (orig) => ({ ...(await orig<typeof import('@/app/router')>()), navigate: (...a: unknown[]) => navigate(...a) }));

const { mountGameArcade } = await import('@/games/arcade');
const { GAME_INVITE_EVENT, inviteHref, syncGameInviteWatch, stopGameInviteWatch } = await import('@/student/game-invite');

const INVITE = { room: 'gr0123456789abcdef0123', code: '482913', lesson_id: 'lesson_gm', game_id: 'g_cross', title: 'Technique crossword', sent_at: 1000 };
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const pub = (over: Record<string, unknown> = {}) => ({ id: 'g', title: '', kind: 'crossword', solo: true, live: true, count: 6, settings: {}, items: [], ...over });
const lesson = {
  lesson_id: 'lesson_gm',
  title: 'Harbour Lights games',
  blocks: [],
  published_at: '2026-11-09T09:00:00.000Z',
  schema_version: 1,
  pedagogical_mode: 'game',
  game: { version: 'v1', games: [pub({ id: 'g_cross', title: 'Technique crossword' })] }
} as unknown as PublishedLesson;
const arcade = (over: Partial<Arcade> = {}): Arcade => ({ identity: { need: null, initials: 'AB' }, games: [], closed: false, results: {}, ...over });
const client = (first: Arcade, claimed?: Arcade): GameClient & { join: ReturnType<typeof vi.fn> } => ({
  load: vi.fn(async () => first),
  claim: vi.fn(async () => claimed ?? first),
  start: vi.fn(),
  send: vi.fn(),
  finish: vi.fn(),
  // Never answers: the phone stays on "joining", no socket opens in the test.
  join: vi.fn(() => new Promise(() => undefined))
});
function mount(c: GameClient) {
  const host = document.createElement('div');
  document.body.append(host);
  return { host, handle: mountGameArcade(host, { lesson, classId: 'class_gm', client: c, renderHero: () => undefined }) };
}

beforeEach(() => {
  localStorage.clear();
  apiGet.mockReset();
  navigate.mockReset();
  history.replaceState(null, '', '/');
});
afterEach(() => {
  stopGameInviteWatch();
  document.body.replaceChildren();
});

describe('push invite: the arcade joins in one tap', () => {
  it('?join=…&game=… opens that game and joins with the code, then drops game from the link', async () => {
    history.replaceState(null, '', '/s/classes/class_gm/lessons/lesson_gm?join=482913&game=g_cross');
    const c = client(arcade());
    const { handle } = mount(c);
    await flush();
    expect(c.join).toHaveBeenCalledWith('g_cross', '482913');
    expect(location.search).toBe('?join=482913');
    handle.dispose();
  });

  it('waits for initials first, then joins', async () => {
    history.replaceState(null, '', '/s/classes/class_gm/lessons/lesson_gm?join=482913&game=g_cross');
    const c = client(arcade({ identity: { need: 'initials', initials: null } }), arcade());
    const { host, handle } = mount(c);
    await flush();
    expect(c.join).not.toHaveBeenCalled();
    host.querySelector<HTMLInputElement>('.gm-gate input')!.value = 'ab';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(c.join).toHaveBeenCalledWith('g_cross', '482913');
    handle.dispose();
  });

  it('Join on the toast while already on the lesson opens the game here', async () => {
    const c = client(arcade());
    const { handle } = mount(c);
    await flush();
    expect(c.join).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent(GAME_INVITE_EVENT, { detail: { game_id: 'g_cross', code: '482913' } }));
    await flush();
    expect(c.join).toHaveBeenCalledWith('g_cross', '482913');
    handle.dispose();
    // Gone with the arcade.
    window.dispatchEvent(new CustomEvent(GAME_INVITE_EVENT, { detail: { game_id: 'g_cross', code: '111111' } }));
    expect(c.join).toHaveBeenCalledTimes(1);
  });

  it('a plain ?join= (QR) still waits for Join live game', async () => {
    history.replaceState(null, '', '/s/classes/class_gm/lessons/lesson_gm?join=482913');
    const c = client(arcade());
    const { handle } = mount(c);
    await flush();
    expect(c.join).not.toHaveBeenCalled();
    handle.dispose();
  });
});

describe('push invite: the class page toast', () => {
  it('a pushed invite shows a toast; Join opens the game lesson with the code in', async () => {
    apiGet.mockResolvedValue({ invite: INVITE });
    history.replaceState(null, '', '/s/classes/class_gm');
    syncGameInviteWatch('class_gm');
    await flush();
    expect(apiGet).toHaveBeenCalledWith('/api/published/game-invite/class_gm');
    const toast = document.querySelector('.gi-toast')!;
    expect(toast.textContent).toContain('Technique crossword');
    toast.querySelector<HTMLButtonElement>('.gi-toast__join')!.click();
    expect(navigate).toHaveBeenCalledWith('/s/classes/class_gm/lessons/lesson_gm?join=482913&game=g_cross');
    expect(document.querySelector('.gi-toast')).toBeNull();
    // Answered: the same push doesn't come back.
    syncGameInviteWatch('class_gm');
    await flush();
    expect(document.querySelector('.gi-toast')).toBeNull();
    // Pushed again (new sent_at): it does.
    apiGet.mockResolvedValue({ invite: { ...INVITE, sent_at: 2000 } });
    syncGameInviteWatch('class_gm');
    await flush();
    expect(document.querySelector('.gi-toast')).toBeTruthy();
  });

  it('Not now hides it for this push; no invite hides it too', async () => {
    apiGet.mockResolvedValue({ invite: INVITE });
    syncGameInviteWatch('class_gm');
    await flush();
    document.querySelector<HTMLButtonElement>('.gi-toast__close')!.click();
    expect(document.querySelector('.gi-toast')).toBeNull();
    syncGameInviteWatch('class_gm');
    await flush();
    expect(document.querySelector('.gi-toast')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('on the invite\'s own lesson, Join tells the arcade instead of reloading the page', async () => {
    apiGet.mockResolvedValue({ invite: INVITE });
    history.replaceState(null, '', '/s/classes/class_gm/lessons/lesson_gm');
    const heard = vi.fn();
    window.addEventListener(GAME_INVITE_EVENT, heard);
    syncGameInviteWatch('class_gm');
    await flush();
    document.querySelector<HTMLButtonElement>('.gi-toast__join')!.click();
    expect(navigate).not.toHaveBeenCalled();
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ game_id: 'g_cross', code: '482913' });
    window.removeEventListener(GAME_INVITE_EVENT, heard);
  });

  it('pages without a class use the class this browser last opened; teacher pages watch nothing', async () => {
    apiGet.mockResolvedValue({ invite: null });
    syncGameInviteWatch(null);
    await flush();
    expect(apiGet).not.toHaveBeenCalled();
    syncGameInviteWatch('class_gm');
    await flush();
    syncGameInviteWatch(false);
    apiGet.mockClear();
    syncGameInviteWatch(null);
    await flush();
    expect(apiGet).toHaveBeenCalledWith('/api/published/game-invite/class_gm');
  });

  it('builds the lesson link with the code and the game', () => {
    expect(inviteHref('class 1', INVITE)).toBe('/s/classes/class%201/lessons/lesson_gm?join=482913&game=g_cross');
  });
});

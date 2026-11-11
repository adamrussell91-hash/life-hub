import { el } from '@/quiz/dom';
import { GameLessonSchema, type Game } from '@/games/core/schema';
import { splitGame } from '@/games/core/model';
import { seededRandom } from '@/games/generators/random';
import { createFakeRoom, fakeTicket, FakeSocket, FAKE_WS_BASE } from '@/games/live/fake-room';
import { openLiveBoard } from '@/games/live/board';
import { openLivePhone } from '@/games/live/phone';
import { gameTeacherApi, type Arcade, type LiveJoin, type LiveOpen } from '@/games/api';
import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import '@/games/kinds';
import { FIND_A_WORD } from '../../scripts/mock-grid-games';

/**
 * Dev walk for live games, without the Worker (games/live/fake-room.ts).
 *   /games.html?view=live-board&game=g_who          the board (it hosts the fake room)
 *   /games.html?view=live-phone&game=g_who&seat=AB   a phone (open several tabs, one per seat)
 * Code 482913. Use "Simulate class" on the board for invented classmates.
 * Everything is invented (the novella "The Lantern House", as in the mockups).
 *
 * With `&real=1` both sides use the real path instead: the mock API's open / join (the Netlify
 * module) and the local game-rooms Worker (`cd workers/game-rooms && npm run dev`, port 8788), on
 * the seeded lesson_game_harbour and its class (roster AB, CD, EF). Each phone tab gets its own
 * device token per seat, so several phones can share one browser.
 *   /games.html?view=live-board&real=1&game=g_cross
 *   /games.html?view=live-phone&real=1&game=g_cross&seat=CD[&code=123456]
 */
const REAL_LESSON = 'lesson_game_harbour';
const REAL_CLASS = 'class_2026_09eng';

const CODE = '482913';
const tagless = { pieces: [], outcomes: [], skills: [], tech: [] };
const term = (id: string, word: string, text: string) => ({ id, shape: 'term', term: word, accept: [], clues: [{ kind: 'definition', text }], banned: [], decoys: [], ...tagless });
const group = (id: string, label: string, tiles: string[], difficulty: number, why: string) => ({ id, shape: 'group', label, tiles, difficulty, why, ...tagless });

const LESSON = GameLessonSchema.parse({
  games: [
    {
      id: 'g_cross', kind: 'crossword', title: 'Technique crossword',
      items: [
        term('t1', 'Simile', 'A comparison using like or as'),
        term('t2', 'Pathetic fallacy', 'Weather that mirrors a mood'),
        term('t3', 'Alliteration', 'Repeated first sounds'),
        term('t4', 'Sibilance', 'Repeated s sounds'),
        term('t5', 'Hyperbole', 'Deliberate exaggeration'),
        term('t6', 'Oxymoron', 'Two opposites side by side')
      ]
    },
    FIND_A_WORD,
    {
      id: 'g_wall', kind: 'connections', title: 'Week 5 terms wall',
      walls: [{
        id: 'w1', title: 'Wall one',
        groups: [
          group('grp1', 'Sound devices', ['Sibilance', 'Assonance', 'Onomatopoeia', 'Alliteration'], 1, 'Each one works on how the words sound.'),
          group('grp2', 'Gothic settings', ['Crypt', 'Turret', 'Moor', 'Labyrinth'], 2, 'Enclosed or isolated places that trap a character.'),
          group('grp3', 'Kinds of narrator', ['Intrusive', 'Unreliable', 'Omniscient', 'Naive'], 3, 'Who tells the story and how far to trust them.'),
          group('grp4', '___ irony', ['Dramatic', 'Situational', 'Verbal', 'Cosmic'], 4, 'Cosmic and Omniscient both sound god-like.')
        ]
      }]
    },
    {
      id: 'g_who', kind: 'who_said_it', title: 'Who said it? The Lantern House',
      cast: [{ id: 'c_mira', name: 'Mira Vale' }, { id: 'c_hask', name: 'Doctor Hask' }, { id: 'c_tobin', name: 'Old Tobin' }, { id: 'c_agnes', name: 'Sister Agnes' }],
      items: [
        { id: 'q1', shape: 'quote', text: 'I count the stairs each night so that the dark cannot count me.', speaker: 'c_mira', source: 'Chapter 1', ...tagless },
        { id: 'q2', shape: 'quote', text: 'Fear is a fever, Miss Vale. I have bled it out of stronger patients than you.', speaker: 'c_hask', source: 'Chapter 3', ...tagless },
        { id: 'q3', shape: 'quote', text: 'Honestly, the house is just old. There’s a perfectly scientific reason for every noise.', speaker: 'fake', why_fake: 'Wrong voice: “honestly” and “perfectly scientific” are breezy and modern, and the novella never explains the house away.', ...tagless },
        { id: 'q4', shape: 'quote', text: 'That ice won’t hold till spring.', speaker: 'c_tobin', source: 'Chapter 5', ...tagless },
        { id: 'q5', shape: 'quote', text: 'Keep one candle in the window, child. He will look for it.', speaker: 'c_agnes', source: 'Chapter 6', ...tagless }
      ]
    }
  ]
});

export function mountLivePreview(mount: HTMLElement, view: string): void {
  const params = new URLSearchParams(location.search);
  if (params.get('real') === '1') {
    void mountReal(mount, view, params);
    return;
  }
  const gameId = params.get('game') ?? 'g_who';
  const draft = LESSON.games.find((g: Game) => g.id === gameId) ?? LESSON.games[3];
  // Seeded, so every tab gets the same tile ids and grids.
  const split = splitGame(draft, seededRandom(7));
  const room = `room_dev_${draft.id}`;
  const exp = Date.now() + 3 * 60 * 60 * 1000;

  const nav = el('nav', 'gm-preview');
  nav.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center';
  nav.append(el('b', '', 'Live dev:'));
  for (const g of LESSON.games) {
    const a = el('a', '', g.title);
    a.href = `?view=${view}&game=${g.id}${view === 'live-phone' ? `&seat=${params.get('seat') ?? 'AB'}` : ''}`;
    nav.append(a);
  }
  mount.append(nav);

  if (view === 'live-board') {
    const fake = createFakeRoom({ room, code: CODE, game: split.public, keys: split.keys });
    const sim = el('button', 'gl-btn', 'Simulate class');
    sim.type = 'button';
    sim.addEventListener('click', () => fake.simulate(14));
    const open: LiveOpen = {
      room,
      code: CODE,
      teacher_ticket: fakeTicket({ room, role: 'teacher', owner: 'teacher', exp }),
      board_ticket: fakeTicket({ room, role: 'board', owner: 'board', exp }),
      ws_base: FAKE_WS_BASE,
      game_id: draft.id,
      join_url: `${location.origin}/games.html?view=live-phone&game=${draft.id}&seat=QR`,
      game: split.public
    };
    const start = el('button', 'btn btn--primary', 'Open the board');
    start.type = 'button';
    const go = () => openLiveBoard({ open, game: split.public, connect: { WebSocketImpl: FakeSocket, fetchImpl: () => Promise.reject(new Error('dev')) }, extraControls: [sim] });
    start.addEventListener('click', go);
    const help = el('p', 'gm-note', 'The board hosts the fake room in this tab. Open phones in other tabs (links below), then Start. Closing the board keeps the room; reopen it here.');
    const phones = el('p', 'gm-note');
    ['AB', 'CD', 'EF'].forEach((s) => {
      const a = el('a', '', `Phone ${s}`);
      a.href = `?view=live-phone&game=${draft.id}&seat=${s}`;
      a.target = '_blank';
      a.style.marginRight = '12px';
      phones.append(a);
    });
    mount.append(start, help, phones);
    go();
    return;
  }

  const seat = (params.get('seat') ?? 'AB').toUpperCase().slice(0, 4);
  const join = async (_game: string, code: string): Promise<LiveJoin> => {
    await new Promise((r) => setTimeout(r, 250));
    if (code !== CODE) throw new Error('That code isn’t running. Check the board.');
    const owner = `dev_${seat}`;
    return { room, ticket: fakeTicket({ room, role: 'student', owner, initials: seat, exp }), ws_base: FAKE_WS_BASE, initials: seat, game_id: draft.id, game: split.public };
  };
  const again = el('button', 'btn btn--primary', `Join as ${seat}`);
  again.type = 'button';
  const go = () => openLivePhone({ game: split.public, join, code: params.get('code') ?? undefined, connect: { WebSocketImpl: FakeSocket, fetchImpl: () => Promise.reject(new Error('dev')) } });
  again.addEventListener('click', go);
  mount.append(again, el('p', 'gm-note', `Code ${CODE}. The board tab must be open (it hosts the fake room).`));
  go();
}

/** The real path: mock API (Netlify module) + local Worker. */
async function mountReal(mount: HTMLElement, view: string, params: URLSearchParams): Promise<void> {
  const gameId = params.get('game') ?? 'g_who';
  const note = el('p', 'gm-note', 'Real room: the local game-rooms Worker on :8788 must be running.');
  mount.append(note);
  if (view === 'live-board') {
    const open = el('button', 'btn btn--primary', 'Open live game');
    open.type = 'button';
    const go = async () => {
      try {
        const reply = await gameTeacherApi(REAL_LESSON).open!(gameId, REAL_CLASS);
        note.textContent = `Room ${reply.room} · code ${reply.code}. Phones: ?view=live-phone&real=1&game=${gameId}&seat=AB&code=${reply.code}`;
        if (!reply.game) throw new Error('The room came back without its game.');
        openLiveBoard({ open: reply, game: reply.game });
      } catch (e) {
        note.textContent = e instanceof Error ? e.message : 'The room didn’t open.';
      }
    };
    open.addEventListener('click', () => void go());
    mount.append(open);
    return;
  }
  const seat = (params.get('seat') ?? 'AB').toUpperCase().slice(0, 4);
  const endpoint = `/api/published/game/${REAL_LESSON}`;
  const token = deviceToken(`class:${REAL_CLASS}:dev-${seat}`);
  const call = <T>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(endpoint, { action, class_id: REAL_CLASS, ...(token ? { class_token: token } : {}), ...extra });
  try {
    const arcade = await call<Arcade>('claim', { initials: seat });
    const game = arcade.games.find((g) => g.id === gameId);
    if (!game) throw new Error(`No game ${gameId} in the seeded lesson.`);
    const go = () => openLivePhone({ game, join: (id, code) => call<LiveJoin>('join', { game_id: id, code }), code: params.get('code') ?? undefined });
    const again = el('button', 'btn btn--primary', `Join as ${seat}`);
    again.type = 'button';
    again.addEventListener('click', go);
    mount.append(again);
    go();
  } catch (e) {
    note.textContent = e instanceof Error ? e.message : 'Couldn’t claim the seat.';
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitGame } from '@/games/core/model';
import { seededRandom } from '@/games/generators/random';
import { ROOM_LIMITS } from '@/games/core/room-protocol';
import { createFakeRoom, fakeRoomStoreKey, fakeTicket, FakeSocket, type FakeRoom } from '@/games/live/fake-room';
import { jeopardyGame } from './games-jeopardy-fixture';

// The dev fake room lives in the board's tab. The dev server reloads that tab on every
// rules edit, so a walk in progress fell back to the lobby with no error: the room must
// pick its game up again after a reload. Invented content only.

const split = splitGame(jeopardyGame({ final: true }), seededRandom(7));
const ROOM = 'room_dev_resume';
const exp = Date.now() + 3_600_000;
const opts = { room: ROOM, code: '482913', game: split.public, keys: split.keys, teams: 2 };
const url = (role: 'teacher' | 'student', owner: string, initials?: string) =>
  `fake://game-rooms/rooms/${ROOM}/ws?ticket=${fakeTicket({ room: ROOM, role, owner, exp, ...(initials ? { initials } : {}) })}`;

let rooms: FakeRoom[] = [];
const open = (o: Parameters<typeof createFakeRoom>[0] = opts) => {
  const r = createFakeRoom(o);
  rooms.push(r);
  return r;
};

beforeEach(() => {
  // The in-page bus (no BroadcastChannel), so fake timers drive every message.
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  rooms.forEach((r) => r.stop());
  rooms = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function startedRoom() {
  const room = open();
  room.simulate(4);
  const phone = new FakeSocket(url('student', 'dev_AB', 'AB'));
  const teacher = new FakeSocket(url('teacher', 'teacher'));
  vi.advanceTimersByTime(2500);
  teacher.send(JSON.stringify({ t: 'control', rid: 'r1', op: { op: 'start' } }));
  vi.advanceTimersByTime(ROOM_LIMITS.countdownMs + 50);
  return { room, phone, teacher };
}

describe('dev fake room: a reload keeps the game', () => {
  it('picks a game in progress up again instead of falling back to the lobby', () => {
    const { room } = startedRoom();
    expect(room.phase()).toBe('playing');
    expect(sessionStorage.getItem(fakeRoomStoreKey(opts))).toContain('"phase":"playing"');
    room.stop(); // the tab reloads

    const again = open();
    expect(again.phase()).toBe('playing');
    const seats = again.seats();
    expect(seats.map((s) => s.initials).sort()).toEqual(['AB', 'AK', 'BL', 'CM', 'DN']);
    // The simulated class plays on; the phone from before the reload is offline until it reconnects.
    expect(seats.filter((s) => s.connected).map((s) => s.initials).sort()).toEqual(['AK', 'BL', 'CM', 'DN']);
  });

  it('closes a phone still talking to the old room, so it reconnects to this one', () => {
    const { room, phone } = startedRoom();
    room.stop();
    open();
    const closed = vi.fn();
    phone.onclose = closed;
    phone.send(JSON.stringify({ t: 'ping', rid: 'p1', sent: Date.now() }));
    vi.advanceTimersByTime(10);
    expect(closed).toHaveBeenCalled();
    const back = new FakeSocket(url('student', 'dev_AB', 'AB'));
    vi.advanceTimersByTime(10);
    expect(back.readyState).toBe(1);
    expect(rooms[1].seats().find((s) => s.initials === 'AB')?.connected).toBe(true);
  });

  it('starts fresh when asked, or when the saved game had ended', () => {
    const { room, teacher } = startedRoom();
    room.stop();
    expect(open({ ...opts, resume: false }).phase()).toBe('lobby');

    rooms.forEach((r) => r.stop());
    rooms = [];
    sessionStorage.clear();
    const { room: r2, teacher: t2 } = startedRoom();
    void teacher;
    t2.send(JSON.stringify({ t: 'control', rid: 'e1', op: { op: 'end' } }));
    vi.advanceTimersByTime(10);
    expect(r2.phase()).toBe('ended');
    r2.stop();
    expect(open().phase()).toBe('lobby');
  });
});

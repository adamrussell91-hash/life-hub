import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventResult, SoloEvent } from '@/games/api';
import type { Game, PublicGame } from '@/games/core/schema';
import { setCalm } from '@/games/motion/motion';
import { playerFor, printFor, type PlayerContext } from '@/games/solo/registry';
import { earForText, quotePoints } from '@/games/kinds/who-said-it/player';
import { castLooks, portraitSvg } from '@/games/kinds/who-said-it/portraits';
import '@/games/kinds';

// Invented content only: a made-up novella, "The Salt Road".
const CAST = [
  { id: 'c_ida', name: 'Ida Marsh' },
  { id: 'c_fenn', name: 'Old Fenn' },
  { id: 'c_rook', name: 'Captain Rook', emblem: 'R' }
];
const QUOTES = [
  { id: 'q1', text: 'The road remembers every cart.', speaker: 'c_ida', source: 'Chapter 1' },
  { id: 'q2', text: 'Honestly, it is just a road.', speaker: 'fake', why_fake: 'Too breezy and modern for anyone in the book.' },
  { id: 'q3', text: 'Salt keeps, and so do I.', speaker: 'c_fenn', source: 'Chapter 4' }
];

function publicGame(): PublicGame {
  return { id: 'g_who', title: 'Who said it on the Salt Road', kind: 'who_said_it', solo: true, live: true, count: 3, settings: { seconds: 20 }, cast: CAST, items: QUOTES.map((q) => ({ id: q.id, shape: 'quote' as const, text: q.text })) };
}

function serverEmit() {
  return vi.fn(async (e: SoloEvent): Promise<EventResult> => {
    const q = QUOTES.find((x) => x.id === e.item)!;
    const said = (e.response as { speaker: string }).speaker;
    return { item: q.id, correct: said === q.speaker, reveal: { speaker: q.speaker, ...(q.source ? { source: q.source } : {}), ...(q.why_fake ? { why_fake: q.why_fake } : {}) } };
  });
}

function setup() {
  const host = document.createElement('div');
  const dock = document.createElement('div');
  document.body.append(host, dock);
  const emit = serverEmit();
  const ctx: PlayerContext = {
    game: publicGame(),
    playId: 'play_1',
    emit,
    finish: vi.fn(),
    setActions: vi.fn((b: HTMLElement[]) => dock.replaceChildren(...b)),
    setStatus: vi.fn(),
    toast: vi.fn(),
    elapsedMs: () => 0,
    calm: () => true,
    sfx: { tick: vi.fn(), lock: vi.fn(), right: vi.fn(), wrong: vi.fn(), reveal: vi.fn(), fanfare: vi.fn(), whoosh: vi.fn(), click: vi.fn(), ding: vi.fn(), buzz: vi.fn(), coin: vi.fn() } as unknown as PlayerContext['sfx']
  };
  const player = playerFor('who_said_it')!.mount(host, ctx);
  const card = (id: string) => host.querySelector<HTMLButtonElement>(`.ws-pc[data-pick="${id}"]`)!;
  const dockButton = (text: string) => [...dock.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  const key = (k: string) => player.onKey!(new KeyboardEvent('keydown', { key: k }));
  return { host, dock, ctx, emit, player, card, dockButton, key };
}

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => setCalm(true));
afterEach(() => document.body.replaceChildren());

describe('Who said it player', () => {
  it('shows the quote and the cast as a hand of drawn cards', () => {
    const { host, dockButton } = setup();
    expect(host.querySelector('.ws-quote')!.textContent).toContain('The road remembers every cart.');
    const cards = host.querySelectorAll('.ws-pc');
    expect(cards).toHaveLength(3);
    expect(cards[0].querySelector('.ws-cameo svg')).not.toBeNull();
    expect(cards[2].querySelector('.ws-emblem')!.textContent).toBe('R');
    expect(host.querySelector('img')).toBeNull();
    expect(dockButton('Lock in').disabled).toBe(true);
    expect(dockButton('Nobody: it’s fake')).toBeTruthy();
  });

  it('picks a speaker, locks in, and shows the source', async () => {
    const { host, emit, card, dockButton, ctx } = setup();
    card('c_ida').click();
    expect(card('c_ida').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.ws-pick')!.textContent).toContain('Ida Marsh');
    dockButton('Lock in').click();
    await flush();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ item: 'q1', move: 'answer', response: { speaker: 'c_ida' } }), { now: true });
    const result = host.querySelector('.ws-result')!;
    expect(result.textContent).toContain('Right');
    expect(result.querySelector('.ws-big')!.textContent).toBe('+200');
    expect(result.querySelector('.ws-note')!.textContent).toContain('Ida Marsh · Chapter 1');
    expect(ctx.toast).toHaveBeenCalledWith('+200 points', 'good');
  });

  it('catches a fake for double points, flags a false alarm, and ends with the ear for the text', async () => {
    const { host, key, dockButton, ctx } = setup();
    // Quote 1: a real line called fake (a false alarm), from the keyboard.
    expect(key('f')).toBe(true);
    expect(key('Enter')).toBe(true);
    await flush();
    expect(host.querySelector('.ws-result')!.textContent).toContain('False alarm: it’s real');
    expect(host.querySelector('.ws-big')!.textContent).toBe('+0');
    expect(key('Enter')).toBe(true);
    // Quote 2: the fake, caught. Number key 4 is "fake" with three in the cast.
    expect(host.querySelector('.ws-quote')!.textContent).toContain('just a road');
    expect(key('4')).toBe(true);
    expect(key('Enter')).toBe(true);
    await flush();
    const result = host.querySelector('.ws-result')!;
    expect(result.textContent).toContain('Fake caught');
    expect(result.querySelector('.ws-big')!.textContent).toBe('+400');
    expect(result.querySelector('.ws-note--fake')!.textContent).toContain('Too breezy and modern');
    expect(ctx.toast).toHaveBeenLastCalledWith('+400 points: double for catching a fake', 'good');
    dockButton('Next quote').click();
    // Quote 3: the wrong character.
    expect(key('1')).toBe(true);
    dockButton('Lock in').click();
    await flush();
    expect(host.querySelector('.ws-result')!.textContent).toContain('Not this time');
    expect(host.querySelector('.ws-you')!.textContent).toBe('You said Ida Marsh.');
    expect(ctx.toast).toHaveBeenLastCalledWith('It was Old Fenn', 'bad');
    dockButton('See my summary').click();
    const summary = host.querySelector('.ws-summary')!;
    const rows = Object.fromEntries([...summary.querySelectorAll('.ws-break > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]));
    expect(rows['Quotes right']).toBe('1 of 3');
    expect(rows['Fakes caught']).toBe('1 of 1');
    expect(rows['Real quotes called fake']).toBe('1 of 2');
    expect(rows['Ear for the text']).toBe('+50');
    expect(summary.querySelector('.ws-big')!.textContent).toBe('400');
    dockButton('Finish').click();
    expect(ctx.finish).toHaveBeenCalledTimes(1);
  });

  it('a fake trusted as real says so', async () => {
    const { host, key, card, dockButton } = setup();
    card('c_ida').click();
    dockButton('Lock in').click();
    await flush();
    key('Enter');
    card('c_rook').click();
    dockButton('Lock in').click();
    await flush();
    expect(host.querySelector('.ws-result')!.textContent).toContain('It’s a fake');
    expect(host.querySelector('.ws-result .ws-who')!.textContent).toBe('Nobody said it');
  });

  it('scores speed and doubles a caught fake', () => {
    expect(quotePoints(false, false, 0, 20)).toBe(0);
    expect(quotePoints(true, false, 0, 20)).toBe(200);
    expect(quotePoints(true, false, 10_000, 20)).toBe(150);
    expect(quotePoints(true, false, 60_000, 20)).toBe(100);
    expect(quotePoints(true, true, 10_000, 20)).toBe(300);
  });

  it('works out the ear for the text', () => {
    expect(earForText([{ pick: 'fake', speaker: 'fake' }, { pick: 'c_a', speaker: 'c_a' }, { pick: 'fake', speaker: 'c_b' }])).toEqual({ fakes: 1, caught: 1, real: 2, alarms: 1, ear: 50 });
    expect(earForText([{ pick: 'c_a', speaker: 'fake' }]).ear).toBe(0);
  });
});

describe('Who said it portraits', () => {
  it('gives every member of a cast of eight their own headpiece and prop, the same every time', () => {
    const cast = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Gus', 'Hal'].map((name, i) => ({ id: `c${i}`, name }));
    const a = castLooks(cast);
    const b = castLooks(cast);
    expect([...a.values()]).toEqual([...b.values()]);
    expect(new Set([...a.values()].map((l) => l.hat)).size).toBe(8);
    expect(new Set([...a.values()].map((l) => l.prop)).size).toBe(8);
    for (const look of a.values()) expect(portraitSvg(look)).toMatch(/^<svg viewBox="0 0 100 124"/);
    expect(portraitSvg('fake')).toContain('?');
  });
});

describe('Who said it print', () => {
  const full = {
    id: 'g_who',
    title: 'Who said it on the Salt Road',
    kind: 'who_said_it',
    cast: CAST,
    items: QUOTES.map((q) => ({ ...q, shape: 'quote', accept: [], pieces: [], outcomes: [], skills: [], tech: [] })),
    settings: { seconds: 20 }
  } as unknown as Game;

  it('lists the quotes with a tick box per character and Fake; answers only on the key page', () => {
    const out = printFor('who_said_it')!(full, { answers: true });
    const head = [...out.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(head).toEqual(['#', 'Quote', 'Ida Marsh', 'Old Fenn', 'Captain Rook', 'Fake']);
    expect(out.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(out.querySelectorAll('tbody tr')[0].querySelectorAll('td span')).toHaveLength(4);
    const key = out.querySelector('.gm-print-key')!;
    expect(key.textContent).toContain('Ida Marsh · Chapter 1');
    expect(key.textContent).toContain('Too breezy and modern');
    key.remove();
    expect(out.textContent).not.toContain('Chapter 1');
    expect(out.textContent).not.toContain('Too breezy');
  });

  it('leaves the key out for students', () => {
    const out = printFor('who_said_it')!(full, { answers: false });
    expect(out.querySelector('.gm-print-key')).toBeNull();
  });
});

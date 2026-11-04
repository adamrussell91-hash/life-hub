// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLiveClock, createLiveSwarm, liveControls, liveMoveLabel, liveSignature, setLiveClock, shapeOf } from '@/quiz/live-show';
import type { LiveQuiz } from '@/quiz/live-stage';

const round = (over: Partial<LiveQuiz> = {}): LiveQuiz => ({ session: 's1', code: '123456', phase: 'question', index: 0, total: 3, joined: 4, seconds: 30, answered: 1, ends_in: 20000, shapes: [{ id: 'aaaaaaaa' }], ...over });
const moves = () => ({ move: vi.fn(), back: vi.fn(), end: vi.fn(), act: vi.fn() });

afterEach(() => vi.useRealTimers());

describe('the shapes', () => {
  it('gives a badge the same shape on every screen', () => {
    expect(shapeOf('1a2b3c4d')).toEqual(shapeOf('1a2b3c4d'));
  });

  it('adds only new arrivals, keeps them placed, and clears for the next question', () => {
    const swarm = createLiveSwarm();
    swarm.update(round());
    const first = swarm.root.firstElementChild as HTMLElement;
    const place = first.style.left;
    swarm.update(round({ shapes: [{ id: 'aaaaaaaa' }, { id: 'bbbbbbbb' }] }));
    expect(swarm.root.children).toHaveLength(2);
    expect(swarm.root.firstElementChild).toBe(first);
    expect(first.style.left).toBe(place);
    swarm.update(round({ index: 1, shapes: [] }));
    expect(swarm.root.children).toHaveLength(0);
  });

  it('marks right and wrong once revealed', () => {
    const swarm = createLiveSwarm();
    swarm.update(round({ phase: 'reveal', shapes: [{ id: 'aaaaaaaa', right: true }, { id: 'bbbbbbbb', right: false }] }));
    expect([...swarm.root.children].map((n) => (n as HTMLElement).dataset.result)).toEqual(['right', 'wrong']);
  });
});

describe('the clock', () => {
  it('counts down, warns near the end, and says when time is up', () => {
    vi.useFakeTimers();
    const clock = createLiveClock();
    clock.set(12000);
    expect(clock.root.textContent).toContain('0:12');
    vi.advanceTimersByTime(3000);
    expect(clock.root.textContent).toContain('0:09');
    expect(clock.root.dataset.state).toBe('low');
    vi.advanceTimersByTime(10000);
    expect(clock.root.textContent).toContain('Time’s up');
  });

  it('ignores small differences between polls but takes added time', () => {
    vi.useFakeTimers();
    const clock = createLiveClock();
    clock.set(20000);
    vi.advanceTimersByTime(5000);
    clock.set(15800);
    expect(clock.root.textContent).toContain('0:15');
    clock.set(30000);
    expect(clock.root.textContent).toContain('0:30');
  });

  it('stays hidden with no timer and stops once everyone is in', () => {
    const clock = createLiveClock();
    setLiveClock(clock, round({ ends_in: null }));
    expect(clock.root.hidden).toBe(true);
    setLiveClock(clock, round({ answered: 4 }));
    expect(clock.root.textContent).toContain('All in');
  });
});

describe('the big button', () => {
  it('says what happens next', () => {
    expect(liveMoveLabel(round({ phase: 'lobby' }))).toBe('Start first question');
    expect(liveMoveLabel(round())).toBe('Reveal answer');
    expect(liveMoveLabel(round({ phase: 'reveal' }))).toBe('Next question');
    expect(liveMoveLabel(round({ phase: 'reveal', index: 2 }))).toBe('Finish quiz');
  });

  it('moves once on a double tap', () => {
    const m = moves();
    const go = liveControls(round(), m).querySelector<HTMLButtonElement>('.qz-live-moves__go')!;
    go.click();
    go.click();
    expect(m.move).toHaveBeenCalledTimes(1);
  });

  it('asks to be pressed when everyone is in or time is up', () => {
    const go = (l: LiveQuiz) => liveControls(l, moves()).querySelector<HTMLElement>('.qz-live-moves__go')!;
    expect(go(round()).dataset.ready).toBeUndefined();
    expect(go(round({ answered: 4 })).dataset.ready).toBe('true');
    expect(go(round({ ends_in: 0 })).dataset.ready).toBe('true');
  });

  it('offers the time choices before the first question and more time during one', () => {
    const m = moves();
    const lobby = liveControls(round({ phase: 'lobby', ends_in: null }), m);
    lobby.querySelectorAll<HTMLButtonElement>('.qz-live-times__chip')[3]!.click();
    expect(m.act).toHaveBeenCalledWith('live_time', { seconds: 45 });
    expect(liveControls(round(), m).textContent).toContain('+15 seconds');
    expect(liveControls(round({ ends_in: null }), m).textContent).not.toContain('+15 seconds');
  });
});

it('the clock ticking down never counts as a change to repaint', () => {
  expect(liveSignature(round({ ends_in: 20000 }))).toBe(liveSignature(round({ ends_in: 17500 })));
  expect(liveSignature(round({ ends_in: 2000 }))).not.toBe(liveSignature(round({ ends_in: 0 })));
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import type { PublicQuestion } from '@/quiz/core';
import type { PublishedLesson } from '@/schemas/published-lesson';
import type { PublicRotation, PublicStation } from '@/rotation/schema';
import type { PublicStationLock, RotationClient, RotationStatus } from '@/rotation/api';
import { mountStationCard } from '@/rotation/station-card';
import { mountRushRound } from '@/rotation/rush-round';
import { mountRotationPlayer } from '@/rotation/player';
import { rotationLesson, rotationLockStation } from '../../../../tests/unit/helpers/rotation-fixture.mjs';

// Invented reef lesson (tests/unit/helpers/rotation-fixture.mjs): station s4 has locks k1 (rush), k2 (AI), k3 (rush).

type Draft = { id: string; kind: string; options?: unknown[]; correct?: unknown; answer?: unknown };
const publicQ = (q: Draft): PublicQuestion => { const { correct: _c, answer: _a, ...rest } = q; return rest as unknown as PublicQuestion; };
const lockStation = rotationLockStation();
const rushItems = (lockId: string) => (lockStation.locks.find((l: { id: string }) => l.id === lockId)!.check as { items: Draft[] }).items.map(publicQ);

const lesson = rotationLesson({ class_id: 'class1' }, { locks: true });
const section = lesson.blocks.find((b: { content?: { rotation_station?: string } }) => b.content?.rotation_station === 's4')!;
const allS4 = section.content.blocks as Block[];
const tagOf = (b: Block) => (b.settings as Record<string, unknown>).rotation_lock;
/** The snapshot keeps untagged blocks and the first lock's; later locks' blocks stay on the server. */
const snapshotBlocks = allS4.filter((b) => !tagOf(b) || tagOf(b) === 'k1');
const serverBlocks = (lockId: string) => allS4.filter((b) => tagOf(b) === lockId);

const station: PublicStation = {
  id: 's4', title: 'Rescue plan', kind: 'concepts', strand: 'science', outcomes: [], minutes: 12, seats: 6,
  piece: 'Cool water first, then the algae and the fish come back.', x: 50, y: 70,
  locks: lockStation.locks.map((l: { id: string; title: string; check: { kind: 'rush' | 'ai' } }) => ({ id: l.id, title: l.title, kind: l.check.kind }))
} as PublicStation;

const rotation: PublicRotation = {
  dial: 'standard', fade_dial: true, path: 'free_all', evidence: 'board', link_words: ['causes'],
  stations: [
    { id: 's1', title: 'Reef words', kind: 'facts', outcomes: [], minutes: 8, seats: 6, piece: 'Bleaching: coral loses the algae that feed it.', token: 'H' } as PublicStation,
    station
  ],
  finale: { build_prompt: 'Write it.', formats: ['Brief'], debrief: [] },
  behind_fallback: 'none',
  pretest_count: 0
};

const k1Open = (over: Partial<PublicStationLock> = {}): PublicStationLock => ({
  id: 'k1', title: 'Which parts matter?', kind: 'rush', state: 'open',
  check: { kind: 'rush', items: rushItems('k1'), streak: 3, seconds: 90 },
  rush: { streak: 0, best: 0, answered: 0, started_at: null, ends_at: null, next_item_id: 's4r1' },
  ...over
});
const k1Passed = (): PublicStationLock => ({ id: 'k1', title: 'Which parts matter?', kind: 'rush', state: 'passed', check: { kind: 'rush', items: rushItems('k1'), streak: 3, seconds: 90 }, reward: { title: 'The key parts', text: 'Coral, the algae inside it, and the fish that graze.' } });
const k2Locked: PublicStationLock = { id: 'k2', title: 'Explain the chain', kind: 'ai', state: 'locked' };
const k2Open: PublicStationLock = { id: 'k2', title: 'Explain the chain', kind: 'ai', state: 'open', check: { kind: 'ai', prompt: 'Why does warm water drive the fish away?' }, ai: { checks_left: 6, last: null }, blocks: serverBlocks('k2') };
const k3Locked: PublicStationLock = { id: 'k3', title: 'Order the rescue', kind: 'rush', state: 'locked' };

function status(chain: PublicStationLock[], over: Partial<RotationStatus> = {}): RotationStatus {
  return {
    identity: { need: null, initials: 'AB' },
    pretest: { items: [], results: {} },
    levels: { s1: { level: 'core', source: 'default' }, s4: { level: 'core', source: 'default' } },
    locks: {}, station_locks: { s4: chain }, kit: [], gates: {}, seats: {}, recommend: null, route_open: true, pieces_left: 1, fallback_on: false, called: null,
    work: { current: 's4', opened: ['s4'], done: [], collected: [], hints: {}, level_overrides: {}, hand_up_at: null, finale: {}, exits: {}, results: {}, recall: {} },
    board: { pos: {}, links: [] },
    ...over
  };
}

const client = (reply: Partial<Record<keyof RotationClient, (...a: unknown[]) => Promise<RotationStatus>>> = {}): RotationClient => new Proxy({} as RotationClient, {
  get: (_t, name: string) => reply[name as keyof RotationClient] ?? (() => Promise.reject(new Error(`unexpected ${name}`)))
});

function card(st: RotationStatus) {
  const c = mountStationCard({ station, number: 2, rotation, blocks: snapshotBlocks, lessonId: 'rot1', unitId: 'unit1', pageBlocks: lesson.blocks as Block[], client: client(), run: async (go) => go(), onBack: () => {} });
  document.body.append(c.root);
  c.update(st);
  return c;
}

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('station lock chain', () => {
  it('shows a locked lock as its title and a padlock only', () => {
    const c = card(status([k1Open(), k2Locked, k3Locked]));
    const locks = [...c.root.querySelectorAll<HTMLElement>('.rot-lk')];
    expect(locks.map((l) => l.dataset.state)).toEqual(['open', 'locked', 'locked']);
    const k2 = locks[1]!;
    expect(k2.textContent).toContain('Explain the chain');
    expect(k2.querySelector('svg')).not.toBeNull();
    expect(k2.querySelector('.rot-blocks, textarea, .rot-rush, .rot-kit-card')).toBeNull();
    expect(c.root.textContent).not.toContain('LOCKED-K2');
    expect(c.root.textContent).not.toContain('LOCKED-K3');
  });

  it('shows the open lock’s blocks, then its check', () => {
    const c = card(status([k1Open(), k2Locked, k3Locked]));
    const k1 = c.root.querySelector<HTMLElement>('.rot-lk[data-lock="k1"]')!;
    const blocks = k1.querySelector('.rot-blocks')!;
    const check = k1.querySelector('.rot-lk__check')!;
    expect(blocks.textContent).toContain('Read the reef diagram');
    expect(check.querySelector('.rot-rush')).not.toBeNull();
    expect(check.textContent).toContain('What lives inside healthy coral?');
    expect(check.textContent).toContain('Starts when you answer');
    expect(blocks.compareDocumentPosition(check) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Tagged blocks don't also appear in the plain steps.
    expect((c.root.textContent!.match(/Read the reef diagram/g) ?? []).length).toBe(1);
  });

  it('folds a passed lock to a row with its reward card, and opens the next one with its blocks and AI check', () => {
    const c = card(status([k1Passed(), k2Open, k3Locked], { kit: [{ station: 's4', lock: 'k1', title: 'The key parts', text: 'Coral, the algae inside it, and the fish that graze.', at: '2026-11-14T00:00:00.000Z' }] }));
    const k1 = c.root.querySelector<HTMLElement>('.rot-lk[data-lock="k1"]')!;
    expect(k1.dataset.state).toBe('passed');
    expect(k1.querySelector('details > summary')!.textContent).toContain('Which parts matter?');
    expect(k1.querySelector('.rot-kit-card')!.textContent).toContain('Coral, the algae inside it');
    expect(k1.querySelector('.rot-rush')).toBeNull();
    const k2 = c.root.querySelector<HTMLElement>('.rot-lk[data-lock="k2"]')!;
    expect(k2.textContent).toContain('LOCKED-K2 Read the temperature chart');
    expect(k2.querySelector('textarea')).not.toBeNull();
    expect(k2.textContent).toContain('6 checks left');
    // The station's Viva Kit in the side panel, full text.
    expect(c.root.querySelector('aside')!.textContent).toContain('Coral, the algae inside it, and the fish that graze.');
  });

  it('animates the reward only when a lock opens on this page', () => {
    const c = card(status([k1Open(), k2Locked, k3Locked]));
    c.update(status([k1Passed(), k2Open, k3Locked]));
    expect(c.root.querySelector('.rot-lk[data-lock="k1"] .rot-kit-card--new')).not.toBeNull();
    const fresh = card(status([k1Passed(), k2Open, k3Locked]));
    expect(fresh.root.querySelector('.rot-kit-card--new')).toBeNull();
  });

  it('shows the teacher state when an AI check is flagged', () => {
    const c = card(status([k1Passed(), { ...k2Open, flagged: true, ai: { checks_left: 0, last: { text: 'x', at: '2026-11-14T00:00:00.000Z', outcome: 'not_yet', fix: 'Add the fish.' } } }, k3Locked]));
    const k2 = c.root.querySelector<HTMLElement>('.rot-lk[data-lock="k2"]')!;
    expect(k2.textContent).toContain('Your teacher will check this one with you');
    expect(k2.querySelector<HTMLButtonElement>('.rot-lk__ai button')!.disabled).toBe(true);
  });

  it('keeps the question and the student’s place on a poll with nothing new', () => {
    const c = card(status([k1Open(), k2Locked, k3Locked]));
    const q = c.root.querySelector('.rot-rush__q')!.firstElementChild;
    c.update(status([k1Open(), k2Locked, k3Locked]));
    expect(c.root.querySelector('.rot-rush__q')!.firstElementChild).toBe(q);
  });

  it('replaces the collect card with a full-width Station complete panel', () => {
    const passedAll: PublicStationLock[] = [k1Passed(), { ...k2Open, state: 'passed', reward: { title: 'The chain', text: 'Warm water, then bleaching.' } }, { ...k3Locked, state: 'passed', reward: { title: 'Rescue order', text: 'Cool the water first.' } }];
    const kit = [{ station: 's4', lock: 'k2', title: 'The chain', text: 'Warm water, then bleaching.', at: '2026-11-14T00:00:00.000Z' }];
    const c = card(status(passedAll, { kit, work: { ...status([]).work!, collected: ['s4'], done: ['s4'] } }));
    const panel = c.root.querySelector<HTMLElement>('.rot-complete')!;
    expect(panel.textContent).toContain('Station complete');
    expect(panel.textContent).toContain('Warm water, then bleaching.');
    expect(panel.textContent).toContain('Back to the map');
    expect(c.root.querySelector('.rot-collect')).toBeNull();
  });
});

describe('rush round', () => {
  it('fills a pip for each right answer and moves to the server’s next question', async () => {
    const lock = k1Open();
    const reply = { item_id: 's4r1', right: true, streak: 1, need: 3, passed: false, timed_out: false, next_item_id: 's4r2', ends_at: new Date(Date.now() + 90_000).toISOString() };
    const submit = vi.fn(async () => status([k1Open()], { rush: reply }));
    const round = mountRushRound({ lessonId: 'rot1', stationId: 's4', lock, submit, reset: async () => null });
    document.body.append(round.root);
    expect(round.root.querySelectorAll('.rot-rush__pips i').length).toBe(3);
    expect(round.root.querySelectorAll('.rot-rush__pips i.on').length).toBe(0);
    round.root.querySelector<HTMLButtonElement>('.qz-choice')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(round.root.querySelectorAll('.rot-rush__pips i.on').length).toBe(1));
    expect(round.root.dataset.flash).toBe('right');
    expect(round.root.textContent).toContain('What colour is bleached coral?');
    expect(round.root.textContent).not.toContain('Starts when you answer');
    round.dispose();
  });

  it('a wrong answer empties the streak and never shows the answer', async () => {
    const lock = k1Open({ rush: { streak: 2, best: 2, answered: 2, started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 60_000).toISOString(), next_item_id: 's4r3' } });
    const reply = { item_id: 's4r3', right: false, streak: 0, need: 3, passed: false, timed_out: false, next_item_id: 's4r4', ends_at: lock.rush!.ends_at };
    const round = mountRushRound({ lessonId: 'rot1', stationId: 's4', lock, submit: async () => status([lock], { rush: reply }), reset: async () => null });
    expect(round.root.querySelectorAll('.rot-rush__pips i.on').length).toBe(2);
    round.root.querySelector<HTMLButtonElement>('.qz-toggle')!.click();
    await vi.waitFor(() => expect(round.root.dataset.flash).toBe('wrong'));
    expect(round.root.querySelectorAll('.rot-rush__pips i.on').length).toBe(0);
    expect(round.root.querySelector('[data-state="right"]')).toBeNull();
    expect(round.root.textContent).toContain('Bleached coral is always dead.');
    round.dispose();
  });

  it('a timed-out reply starts the round again with a full bar', async () => {
    const lock = k1Open({ rush: { streak: 1, best: 1, answered: 1, started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 5_000).toISOString(), next_item_id: 's4r2' } });
    const reply = { item_id: 's4r2', right: null, streak: 0, need: 3, passed: false, timed_out: true, next_item_id: 's4r2', ends_at: null };
    const round = mountRushRound({ lessonId: 'rot1', stationId: 's4', lock, submit: async () => status([lock], { rush: reply }), reset: async () => null });
    round.root.querySelector<HTMLButtonElement>('.qz-choice')!.click();
    await vi.waitFor(() => expect(round.root.textContent).toContain('Time ran out'));
    expect(round.root.textContent).toContain('Starts when you answer');
    expect(round.root.querySelectorAll('.rot-rush__pips i.on').length).toBe(0);
    round.dispose();
  });
});

describe('map', () => {
  it('shows a collected station filled, with a big tick and its piece', async () => {
    const published = { lesson_id: 'rot1', title: 'Reef rescue', unit_id: 'unit1', blocks: [], published_at: '2026-11-14T00:00:00.000Z', schema_version: 1, pedagogical_mode: 'station_rotation', rotation } as unknown as PublishedLesson;
    const st = status([k1Open(), k2Locked, k3Locked], { work: { ...status([]).work!, current: null, collected: ['s1'], done: ['s1'] }, kit: [{ station: 's4', lock: 'k1', title: 'The key parts', text: 'Coral, algae and fish.', at: '2026-11-14T00:00:00.000Z' }] });
    const host = document.createElement('div');
    document.body.append(host);
    const player = mountRotationPlayer(host, { lesson: published, classId: 'class1', client: client({ status: async () => st }), renderHero: () => {}, pollMs: 60_000 });
    await vi.waitFor(() => expect(host.querySelector('.rot-node[data-station="s1"]')).not.toBeNull());
    const node = host.querySelector<HTMLElement>('.rot-node[data-station="s1"]')!;
    expect(node.dataset.state).toBe('done');
    expect(node.querySelector('.rot-node__tick')).not.toBeNull();
    expect(node.textContent).toContain('Bleaching: coral loses the algae that feed it.');
    expect(node.querySelector('.rot-seats')).toBeNull();
    expect(host.querySelector('.rot-legend')!.textContent).toContain('Collected');
    expect(host.querySelector('.rot-kit')!.textContent).toContain('Coral, algae and fish.');
    player.dispose();
  });
});

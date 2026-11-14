import { describe, expect, it } from 'vitest';
import { LessonSchema, PublishableLessonSchema } from '@/schemas/lesson';
import { RotationSettingsSchema, StationLockSchema, StationSchema } from '@/rotation/schema';
import { applyPreset, blocksForLock, cardOrder, findStationSection, forLevel, lockOf, locksOf, presetOf, roleOf, rotationIssues, sectionBlocks } from '@/rotation/model';
import { newStation, seedRotation, withRotationSections } from '@/rotation/seed';
import { rotationLesson } from '../../../../tests/unit/helpers/rotation-fixture.mjs';

let n = 0;
const newId = () => `id${++n}`;
const lesson = (over: Record<string, unknown> = {}) => LessonSchema.parse(rotationLesson(over));

describe('rotation settings', () => {
  it('fills the defaults', () => {
    const r = RotationSettingsSchema.parse({});
    expect(r.dial).toBe('standard');
    expect(r.fade_dial).toBe(true);
    expect(r.path).toBe('free_all');
    expect(r.evidence).toBe('board');
    expect(r.link_words).toEqual(['causes', 'makes worse', 'is evidence for', 'slows recovery of']);
    expect(r.behind_fallback).toBe('choose_n_minus_1');
    expect(r.finale.formats.length).toBeGreaterThan(0);
  });

  it('refuses one link word and more than six', () => {
    expect(RotationSettingsSchema.safeParse({ link_words: ['causes'] }).success).toBe(false);
    expect(RotationSettingsSchema.safeParse({ link_words: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false);
  });

  it('parses the invented fixture lesson', () => {
    expect(() => lesson()).not.toThrow();
  });
});

describe('rotationIssues', () => {
  it('passes the complete fixture', () => {
    expect(rotationIssues(lesson())).toEqual([]);
    expect(PublishableLessonSchema.safeParse(lesson()).success).toBe(true);
  });

  it('keeps quiz questions in a rotation (no stray-quiz rule)', () => {
    const issues = PublishableLessonSchema.safeParse(lesson());
    expect(issues.success).toBe(true);
  });

  it('needs a class, two stations and three pretest questions a station', () => {
    const l = lesson();
    l.rotation!.class_id = '';
    l.rotation!.stations = l.rotation!.stations.filter((s) => s.id !== 's2' && s.id !== 's3');
    l.rotation!.pretest = l.rotation!.pretest.filter((p) => p.station === 's1').slice(0, 2);
    const issues = rotationIssues(l).join('|');
    expect(issues).toMatch(/class/);
    expect(issues).toMatch(/at least 2 stations/);
    expect(issues).toMatch(/exactly 3 pretest/);
  });

  it('allows at most one teacher station and eight stations', () => {
    const l = lesson();
    l.rotation!.stations.push({ ...l.rotation!.stations[3]!, id: 't2' });
    expect(rotationIssues(l).join('|')).toMatch(/one teacher station/);
    const m = lesson();
    for (let i = 0; i < 6; i++) m.rotation!.stations.push({ ...m.rotation!.stations[0]!, id: `x${i}` });
    expect(rotationIssues(m).join('|')).toMatch(/at most 8/);
  });

  it('needs a section, a goal and an exit check on every station', () => {
    const l = lesson();
    l.blocks = l.blocks.filter((b) => b.id !== 'sec1');
    expect(rotationIssues(l).join('|')).toMatch(/Reef words has no content/);
    const m = lesson();
    const sec = findStationSection(m.blocks, 's2')!;
    if (sec.block_type === 'section') sec.content.blocks = sec.content.blocks.filter((b) => roleOf(b as never) !== 'exit' && roleOf(b as never) !== 'goal');
    const issues = rotationIssues(m).join('|');
    expect(issues).toMatch(/The food web needs a goal/);
    expect(issues).toMatch(/The food web needs an exit check/);
  });

  it('checks written gates', () => {
    const l = lesson();
    const g = l.rotation!.stations.find((s) => s.id === 's3')!.written_gate!;
    g.passage = '';
    g.idea = '';
    g.pass_at = 5;
    const issues = rotationIssues(l).join('|');
    expect(issues).toMatch(/needs a passage/);
    expect(issues).toMatch(/idea each point/);
    expect(issues).toMatch(/more marks than it has/);
  });

  it('refuses two gates and after-gate steps with no gate', () => {
    const l = lesson();
    l.rotation!.stations.find((s) => s.id === 's2')!.written_gate = l.rotation!.stations.find((s) => s.id === 's3')!.written_gate;
    expect(rotationIssues(l).join('|')).toMatch(/more than one gate/);
    const m = lesson();
    delete m.rotation!.stations.find((s) => s.id === 's3')!.written_gate;
    expect(rotationIssues(m).join('|')).toMatch(/steps after a gate, but no gate/);
  });

  it('checks choose_n, must-do and unlock loops', () => {
    expect(rotationIssues(lesson({ path: 'choose_n', choose_n: 3 })).join('|')).toMatch(/smaller than the number/);
    expect(rotationIssues(lesson({ path: 'choose_n', choose_n: 2 }))).toEqual([]);
    expect(rotationIssues(lesson({ path: 'must_may' })).join('|')).toMatch(/must-do/);
    const l = lesson({ path: 'unlocks' });
    l.rotation!.stations[0]!.unlock_after = ['s2'];
    l.rotation!.stations[1]!.unlock_after = ['s1'];
    expect(rotationIssues(l).join('|')).toMatch(/loop/);
  });

  it('needs a lock question when stations carry letters', () => {
    const l = lesson();
    delete l.rotation!.finale.lock;
    expect(rotationIssues(l).join('|')).toMatch(/lock question/);
  });
});

describe('card order and levels', () => {
  it('plays blocks by role, keeping section order within a role', () => {
    const blocks = sectionBlocks(findStationSection(lesson().blocks, 's2'));
    expect(cardOrder(blocks).map((b) => b.id)).toEqual(['s2recall', 's2goal', 's2step', 's2gate', 's2after', 's2done', 's2exit']);
  });

  it('shows untagged blocks at every level and tagged ones at theirs', () => {
    const blocks = sectionBlocks(findStationSection(lesson().blocks, 's1'));
    const ids = (level: 'support' | 'core' | 'extend') => forLevel(blocks, level).filter((b) => roleOf(b) === 'step').map((b) => b.id);
    expect(ids('support')).toEqual(['s1sup']);
    expect(ids('core')).toEqual(['s1core']);
    expect(ids('extend')).toEqual(['s1ext']);
  });
});

describe('seeding and presets', () => {
  it('seeds two stations with three pretest questions each and a section each', () => {
    const r = seedRotation('c1', newId);
    expect(r.stations).toHaveLength(2);
    expect(r.pretest.filter((p) => p.station === r.stations[0]!.id)).toHaveLength(3);
    const blocks = withRotationSections([], r, newId);
    expect(blocks.filter((b) => b.block_type === 'section')).toHaveLength(3);
    const roles = sectionBlocks(findStationSection(blocks, r.stations[0]!.id)).map(roleOf);
    expect(roles).toEqual(['goal', 'step', 'done', 'exit']);
    expect(withRotationSections(blocks, r, newId)).toBe(blocks);
  });

  it('numbers new stations past the teacher station', () => {
    const r = seedRotation('c1', newId);
    const t = newStation({ ...r }, 'teacher');
    expect(t.title).toBe('Teacher station');
    expect(newStation({ ...r, stations: [...r.stations, t] }).title).toBe('Station 3');
  });

  it('presets only set path, dial and evidence', () => {
    const r = seedRotation('c1', newId);
    const p = applyPreset(r, 'carousel');
    expect(p.path).toBe('fixed');
    expect(p.stations).toBe(r.stations);
    expect(presetOf(p)).toBe('carousel');
    expect(presetOf({ ...p, evidence: 'board' })).toBeNull();
  });
});

describe('station locks', () => {
  const locked = () => LessonSchema.parse(rotationLesson({}, { locks: true }));
  const s4 = (l: ReturnType<typeof locked>) => l.rotation!.stations.find((s) => s.id === 's4')!;

  it('parses the fixture with a three-lock station and passes the publish checks', () => {
    const l = locked();
    expect(locksOf(s4(l)).map((k) => k.check.kind)).toEqual(['rush', 'ai', 'rush']);
    expect(rotationIssues(l)).toEqual([]);
  });

  it('keeps a plain station plain, and caps a chain at six', () => {
    expect(locksOf(StationSchema.parse({ id: 'x' }))).toEqual([]);
    const lock = { id: 'k', title: 'T', check: { kind: 'ai' }, reward: { title: 'R', text: 'Text' } };
    expect(StationSchema.safeParse({ id: 'x', locks: Array.from({ length: 6 }, (_, i) => ({ ...lock, id: `k${i}` })) }).success).toBe(true);
    expect(StationSchema.safeParse({ id: 'x', locks: Array.from({ length: 7 }, (_, i) => ({ ...lock, id: `k${i}` })) }).success).toBe(false);
    const rush = StationLockSchema.parse({ id: 'k', check: { kind: 'rush' } });
    expect(rush.check.kind === 'rush' && [rush.check.streak, rush.check.seconds]).toEqual([6, 90]);
    expect(StationLockSchema.safeParse({ id: 'k', check: { kind: 'rush', streak: 2 } }).success).toBe(false);
    expect(StationLockSchema.safeParse({ id: 'k', check: { kind: 'rush', seconds: 301 } }).success).toBe(false);
  });

  it('reads which lock a block belongs to', () => {
    const blocks = sectionBlocks(findStationSection(locked().blocks, 's4'));
    expect(lockOf(blocks.find((b) => b.id === 's4goal')!)).toBeUndefined();
    expect(lockOf(blocks.find((b) => b.id === 's4k2a')!)).toBe('k2');
    expect(blocksForLock(blocks, 'k3').map((b) => b.id)).toEqual(['s4k3a', 's4k3q', 's4exit']);
  });

  it('names unfinished locks in the teacher’s words', () => {
    const l = locked();
    const [k1, k2, k3] = s4(l).locks!;
    if (k1!.check.kind === 'rush') k1!.check.items = k1!.check.items.slice(0, 2);
    if (k2!.check.kind === 'ai') { k2!.check.model_answer = ''; k2!.check.criteria = []; }
    k3!.reward = { title: 'Rescue order', text: '' };
    k3!.title = '';
    const issues = rotationIssues(l).join('|');
    expect(issues).toMatch(/needs at least 3 finished rush questions \(it has 2\)/);
    expect(issues).toMatch(/needs a model answer/);
    expect(issues).toMatch(/at least one thing the AI check looks for/);
    expect(issues).toMatch(/Viva Kit card/);
    expect(issues).toMatch(/Lock 3 at Rescue plan needs a title/);
  });

  it('refuses rush questions a rush can’t mark, and blocks tagged with a missing lock', () => {
    const l = locked();
    const k1 = s4(l).locks![0]!;
    if (k1.check.kind === 'rush') k1.check.items.push({ id: 'm1', kind: 'matching', prompt: 'Match them', marks: 1, pairs: [{ id: 'p1', left: 'a', right: 'b' }, { id: 'p2', left: 'c', right: 'd' }] } as never);
    const sec = findStationSection(l.blocks, 's4')!;
    const blocks = sectionBlocks(sec);
    (blocks[1]!.settings as Record<string, unknown>).rotation_lock = 'gone';
    const issues = rotationIssues(l).join('|');
    expect(issues).toMatch(/isn’t a kind a rush can mark/);
    expect(issues).toMatch(/lock that is no longer there/);
  });
});

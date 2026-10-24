// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildCoverageMap } from '@/network/coverage-map/model';
import { buildFlow, hangSides, linkProblem } from '@/network/flow';
import { lessonClassDates, lessonRouteRole, unitFlowPeers } from '@/teacher/network-context';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Unit } from '@/schemas';

/* Invented names only: this repository is public. */
const lesson = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, status: 'draft', ...extra });

function setup() {
  const unit = {
    id: 'u1',
    title: 'Coastlines',
    subject_id: 's1',
    // Saved order is a muddle: placeholders first, the real lessons at the end.
    lesson_ids: ['p1', 'p2', 'a', 'b', 'c', 'side', 'd'],
    blocks: [{
      id: 'map',
      block_type: 'curriculum_lines',
      content: {
        version: 2,
        station_order: ['a', 'b', 'c', 'd', 'p1', 'p2'],
        hidden_lessons: ['p1', 'p2', 'side'],
        rail_stops: [{ id: 'r1', line_id: 'read', after_lesson_id: 'b', kind: 'extension', lesson_id: 'side' }],
        gates: [], nudges: {}, terminus: { label: 'Essay' }
      }
    }]
  } as unknown as Unit;
  const curriculum = {
    units: [unit],
    lessons: [lesson('p1', 'Lesson 9'), lesson('p2', 'Lesson 10'), lesson('a', 'Harbour poems'), lesson('b', 'Tide quiz'), lesson('c', 'Salt and stone'), lesson('side', 'Lighthouse talk'), lesson('d', 'Wrap up')],
    classes: [{ id: 'k1', code: '12ABC', display_name: '12ABC', status: 'active', active_unit_ids: ['u1'] }],
    scheduled_lessons: [
      { id: 's1', class_id: 'k1', lesson_id: 'a', unit_id: 'u1', date: '2026-10-12', delivery_status: 'planned' },
      { id: 's2', class_id: 'k1', lesson_id: 'c', unit_id: 'u1', date: '2026-10-14', delivery_status: 'planned' }
    ]
  } as unknown as CurriculumResponse;
  return { unit, curriculum };
}

describe('Lesson Before and after follows the unit map', () => {
  it('orders lessons as the map does and leaves out lessons off the map', () => {
    const { unit, curriculum } = setup();
    expect(unitFlowPeers(curriculum, unit, 'a').map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps a hidden extension lesson, after the lesson its stop follows', () => {
    const { unit, curriculum } = setup();
    const peers = unitFlowPeers(curriculum, unit, 'side');
    expect(peers.map((p) => p.id)).toEqual(['a', 'b', 'side', 'c', 'd']);
    // Every other lesson can be linked before or after it.
    const f = buildFlow(peers, { title: (id) => id });
    for (const p of peers.filter((x) => x.id !== 'side')) {
      expect(linkProblem(peers, 'side', [...(f.next.get('side') ?? []), p.id])?.kind).not.toBe('too_deep');
    }
  });

  it('reads the route from the map stop when the lesson has none', () => {
    const { unit } = setup();
    expect(lessonRouteRole(unit, { id: 'side' })).toBe('extension');
    expect(lessonRouteRole(unit, { id: 'side', route_role: 'optional' })).toBe('optional');
    expect(lessonRouteRole(unit, { id: 'side', route_role: 'core' })).toBe('core');
    expect(lessonRouteRole(unit, { id: 'a' })).toBeUndefined();
  });

  it('gives each class this lesson’s date', () => {
    const { unit, curriculum } = setup();
    expect(lessonClassDates(curriculum, unit, 'c')).toEqual([{ id: 'k1', name: '12ABC', date: '2026-10-14' }]);
    expect(lessonClassDates(curriculum, unit, 'b')).toEqual([{ id: 'k1', name: '12ABC' }]);
  });
});

describe('Optional route role', () => {
  it('puts an optional lesson in the option lane', () => {
    const map = buildCoverageMap({
      content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' } },
      lines: [],
      lessons: [{ id: 'a', title: 'Harbour poems' }, { id: 'b', title: 'Extra practice', role: 'optional' }, { id: 'c', title: 'Wrap up' }]
    });
    expect(map.rows.find((r) => r.id === 'b')?.lane).toBe('option');
  });

  it('lets a lesson set to core beat an old extension stop on the map', () => {
    const content = { version: 2 as const, rail_stops: [{ id: 'r1', line_id: 'read', after_lesson_id: 'a', kind: 'extension' as const, lesson_id: 'b' }], gates: [], nudges: {}, terminus: { label: 'Essay' } };
    const lessons = [{ id: 'a', title: 'Harbour poems' }, { id: 'b', title: 'Extra practice' }, { id: 'c', title: 'Wrap up' }];
    expect(buildCoverageMap({ content, lines: [], lessons }).rows.find((r) => r.id === 'b')?.lane).toBe('extension');
    const core = lessons.map((l) => (l.id === 'b' ? { ...l, role: 'core' as const } : l));
    expect(buildCoverageMap({ content, lines: [], lessons: core }).rows.find((r) => r.id === 'b')?.lane).toBe('core');
  });
});

describe('Before and after panel', () => {
  it('offers Optional and dates the lesson for a class', async () => {
    const { mountLessonFlow } = await import('@/network/lesson-flow');
    const host = document.createElement('div');
    const selfPatches: unknown[] = [];
    const dated: string[] = [];
    mountLessonFlow(host, {
      lessonId: 'b',
      peers: [{ id: 'a', title: 'Harbour poems' }, { id: 'b', title: 'Tide quiz' }, { id: 'c', title: 'Salt and stone' }],
      after: undefined,
      onSelf: (patch) => selfPatches.push(patch),
      onPeer: async () => {},
      classes: [{ id: 'k1', name: '12ABC' }],
      onDate: async (classId, date) => {
        dated.push(`${classId} ${date}`);
        return [{ id: 'b', title: 'Tide quiz' }, { id: 'a', title: 'Harbour poems' }, { id: 'c', title: 'Salt and stone' }];
      }
    });
    const optional = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Optional')!;
    optional.click();
    expect(selfPatches).toContainEqual({ route_role: 'optional' });
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Core')!.click();
    expect(selfPatches).toContainEqual({ route_role: 'core' });
    const input = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    // Typing the year fires change at each digit; a half-typed year is not saved.
    input.value = '0002-10-28';
    input.dispatchEvent(new Event('change'));
    expect(input.disabled).toBe(false);
    input.value = '2026-10-28';
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(dated).toEqual(['k1 2026-10-28']);
    expect(host.textContent).toContain('Nothing: the unit can start here');
  });

  it('puts the lesson straight after the one picked as Before, with no choice made', async () => {
    const { mountLessonFlow } = await import('@/network/lesson-flow');
    const host = document.createElement('div');
    const selfPatches: unknown[] = [];
    const peerPatches: Array<[string, string[]]> = [];
    mountLessonFlow(host, {
      lessonId: 'c',
      peers: [{ id: 'a', title: 'Harbour poems' }, { id: 'b', title: 'Tide quiz' }, { id: 'c', title: 'Salt and stone' }, { id: 'd', title: 'Wrap up' }],
      after: undefined,
      onSelf: (patch) => selfPatches.push(patch),
      onPeer: async (id, next) => { peerPatches.push([id, next]); }
    });
    const before = host.querySelector<HTMLSelectElement>('select[aria-label="Add a lesson before…"]')!;
    expect([...before.options].filter((o) => o.disabled).map((o) => o.value)).toEqual(['d']);
    before.value = 'a';
    before.dispatchEvent(new Event('change'));
    expect(peerPatches).toEqual([['b', ['d']], ['a', ['c']]]);
    expect(selfPatches).toContainEqual({ after_lesson_ids: ['b'] });
    const afterPick = host.querySelector<HTMLSelectElement>('select[aria-label="Change the next lesson…"]')!;
    afterPick.value = 'd';
    afterPick.dispatchEvent(new Event('change'));
    expect(selfPatches.at(-1)).toEqual({ after_lesson_ids: ['d'] });
  });
});

describe('A lesson nothing leads into', () => {
  it('slots in on the line, so the unit never splits in two', () => {
    const f = buildFlow([
      { id: 'a' }, { id: 'b' }, { id: 'poet', after: ['poem'] }, { id: 'pretest', after: ['poem'] }, { id: 'poem' }, { id: 'review' }, { id: 'next' }
    ]);
    expect(f.seq.every((item) => 'row' in item)).toBe(true);
    expect(f.order).toEqual(['a', 'b', 'poet', 'pretest', 'poem', 'review', 'next']);
    expect(linkProblem([{ id: 'a' }, { id: 'b' }, { id: 'poet', after: ['poem'] }, { id: 'pretest', after: ['poem'] }, { id: 'poem' }], 'a', ['pretest'])).toBeUndefined();
  });
});

describe('Side lessons branch off the core lesson the teacher picks', () => {
  // The order puts the side lessons in the wrong places; the picked core lesson wins.
  const lessons = [
    { id: 'intro', title: 'Harbour poems' },
    { id: 'finn', title: 'Salt and stone' },
    { id: 'pre', title: 'Tide quiz', quiz: true },
    { id: 'sea', title: 'Sea shanties', role: 'extension' as const, branchFrom: 'finn' },
    { id: 'gull', title: 'Gull drawings', role: 'optional' as const, branchFrom: 'finn' },
    { id: 'help', title: 'Rhyme help', role: 'support' as const, branchFrom: 'pre' },
    { id: 'wrap', title: 'Wrap up' }
  ];
  const content = { version: 2 as const, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' } };

  it('hangs each side lesson straight under its core lesson on the map', () => {
    const map = buildCoverageMap({ content, lines: [], lessons });
    expect(map.rows.map((r) => r.id)).toEqual(['intro', 'finn', 'sea', 'gull', 'pre', 'help', 'wrap', '__terminus']);
  });

  it('puts a side lesson in its core lesson’s week', () => {
    const bands = new Map([['intro', 'Wk 1'], ['finn', 'Wk 2'], ['pre', 'Wk 3'], ['help', 'Wk 4'], ['wrap', 'Wk 4']]);
    const map = buildCoverageMap({ content, lines: [], lessons, bands });
    expect(map.rows.find((r) => r.id === 'help')?.band).toBe('Wk 3');
  });

  it('with no pick, hangs off the core lesson before it', () => {
    const { order, anchor } = hangSides(['a', 'b', 'x', 'c'], (id) => id === 'x', () => undefined);
    expect(order).toEqual(['a', 'b', 'x', 'c']);
    expect(anchor.get('x')).toBe('b');
  });

  it('the card asks what a side lesson branches off and saves the pick', async () => {
    const { mountLessonFlow } = await import('@/network/lesson-flow');
    const host = document.createElement('div');
    const patches: unknown[] = [];
    mountLessonFlow(host, {
      lessonId: 'help',
      peers: lessons.map(({ id, title, role, branchFrom }) => ({ id, title, ...(role ? { role } : {}), ...(branchFrom ? { branchFrom } : {}) })),
      after: undefined,
      role: 'support',
      branchFrom: 'pre',
      onSelf: (patch) => patches.push(patch),
      onPeer: async () => {}
    });
    expect(host.textContent).toContain('Branches off');
    expect(host.textContent).toContain('Rejoins at');
    expect(host.querySelector('select[aria-label="Add a lesson before…"]')).toBeNull();
    const pick = host.querySelector<HTMLSelectElement>('select[aria-label="Change…"]')!;
    // Only core lessons can be branched off.
    expect([...pick.options].map((o) => o.value).filter(Boolean)).toEqual(['intro', 'finn', 'wrap']);
    pick.value = 'finn';
    pick.dispatchEvent(new Event('change'));
    expect(patches).toContainEqual({ branch_from: 'finn' });
    expect(host.querySelector('.lesson-flow__chip')?.textContent).toBe('Salt and stone');
  });

  it('a core lesson lists the side lessons off it and skips them in Before and after', async () => {
    const { mountLessonFlow } = await import('@/network/lesson-flow');
    const host = document.createElement('div');
    mountLessonFlow(host, {
      lessonId: 'finn',
      peers: lessons.map(({ id, title, role, branchFrom }) => ({ id, title, ...(role ? { role } : {}), ...(branchFrom ? { branchFrom } : {}) })),
      after: undefined,
      onSelf: () => {},
      onPeer: async () => {}
    });
    const rows = [...host.querySelectorAll('.lesson-flow__row')].map((r) => r.textContent ?? '');
    expect(rows.find((t) => t.startsWith('After'))).toContain('Tide quiz');
    expect(rows.find((t) => t.startsWith('Branches'))).toContain('Sea shanties');
    expect(rows.find((t) => t.startsWith('Branches'))).toContain('Gull drawings');
  });
});

describe('Lessons before the unit starts', () => {
  it('band as Pre and week 1 starts at the first unit lesson', async () => {
    const { unitSchedule } = await import('@/teacher/network-context');
    const unit = { id: 'u1', lesson_ids: ['a', 'b', 'c'] } as unknown as Unit;
    const curriculum = {
      lessons: [lesson('a', 'Course outline', { pre_unit: true }), lesson('b', 'Harbour poems'), lesson('c', 'Tide quiz')],
      scheduled_lessons: [
        { id: 's1', class_id: 'k1', lesson_id: 'a', unit_id: 'u1', date: '2026-10-05', delivery_status: 'planned' },
        { id: 's2', class_id: 'k1', lesson_id: 'b', unit_id: 'u1', date: '2026-10-12', delivery_status: 'planned' },
        { id: 's3', class_id: 'k1', lesson_id: 'c', unit_id: 'u1', date: '2026-10-19', delivery_status: 'planned' }
      ]
    } as unknown as CurriculumResponse;
    expect([...unitSchedule(curriculum, unit)!.bands]).toEqual([['a', 'Pre'], ['b', 'Wk 1'], ['c', 'Wk 2']]);
  });

  it('the card ticks a lesson as before the unit starts', async () => {
    const { mountLessonFlow } = await import('@/network/lesson-flow');
    const host = document.createElement('div');
    const patches: unknown[] = [];
    mountLessonFlow(host, { lessonId: 'a', peers: [{ id: 'a', title: 'Course outline' }], after: undefined, onSelf: (p) => patches.push(p), onPeer: async () => {} });
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.parentElement?.textContent).toBe('Before the unit starts');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(patches).toEqual([{ pre_unit: true }, { pre_unit: null }]);
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildCoverageMap } from '@/network/coverage-map/model';
import { buildFlow, linkProblem } from '@/network/flow';
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
  it('keeps an optional lesson on the core line of the map', () => {
    const map = buildCoverageMap({
      content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' } },
      lines: [],
      lessons: [{ id: 'a', title: 'Harbour poems' }, { id: 'b', title: 'Extra practice', role: 'optional' }, { id: 'c', title: 'Wrap up' }]
    });
    expect(map.rows.find((r) => r.id === 'b')?.lane).toBe('core');
  });

  it('keeps a lesson on an old extension stop on the core line of the map', () => {
    const content = { version: 2 as const, rail_stops: [{ id: 'r1', line_id: 'read', after_lesson_id: 'a', kind: 'extension' as const, lesson_id: 'b' }], gates: [], nudges: {}, terminus: { label: 'Essay' } };
    const lessons = [{ id: 'a', title: 'Harbour poems' }, { id: 'b', title: 'Extra practice' }, { id: 'c', title: 'Wrap up' }];
    expect(buildCoverageMap({ content, lines: [], lessons }).rows.find((r) => r.id === 'b')?.lane).toBe('core');
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

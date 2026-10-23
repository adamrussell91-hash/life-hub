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
      kind: undefined,
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
    const input = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    input.value = '2026-10-28';
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(dated).toEqual(['k1 2026-10-28']);
    expect(host.textContent).toContain('Nothing: the unit can start here');
  });
});

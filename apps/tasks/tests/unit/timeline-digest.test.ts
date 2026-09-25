import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClareProposalJudge, localStubClareJudge } from '@/ai/clare-proposal-judge';
import { buildClareDumpDigest } from '@/domain/clare-digest';
import {
  buildStoredTimelineDigest,
  ghostsFromMutations,
  HAMMOND_REBALANCE_INSTRUCTIONS,
  proposeTimelineRebalance,
  type TimelineDigest
} from '@/domain/timeline-digest';
import { createTasksStore, type KvAdapter } from '@/services/store';
import * as keys from '@/storage/keys';

function memoryKv(): KvAdapter {
  const map = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (map.has(key) ? map.get(key) : null) as T | null;
    },
    async setJSON(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    }
  };
}

function digestWith(timeline: TimelineDigest | null, protocol: 'timeline_rebalance' | 'morning-sweep' = 'timeline_rebalance') {
  return buildClareDumpDigest({
    text: 'Rebalance the visible timeline.',
    items: [],
    frameworks: [],
    tasks: [],
    projects: [],
    calibrations: [],
    preferredDomain: 'teaching',
    protocolId: protocol,
    timeline
  });
}

const overloaded = (): TimelineDigest => ({
  window: { start: '2026-10-01', end: '2027-02-01' },
  today: '2026-10-01',
  learning_term_rhythm: true,
  tasks: [
    { id: 'big-a', title: 'Mark essays', due_date: '2026-10-20', estimated_minutes: 180, status: 'open', dependencies: [], critical: false, hard_due: false, project_id: null },
    { id: 'big-b', title: 'Write reports', due_date: '2026-10-20', estimated_minutes: 180, status: 'open', dependencies: [], critical: false, hard_due: false, project_id: null },
    { id: 'hard', title: 'Parent meeting', due_date: '2026-10-21', estimated_minutes: 30, status: 'open', dependencies: [], critical: false, hard_due: true, project_id: null },
    { id: 'trip', title: 'Pack', due_date: '2026-12-20', estimated_minutes: 60, status: 'open', dependencies: [], critical: false, hard_due: false, project_id: null },
    { id: 'shadow-9b', title: '9B marking', due_date: '2026-10-20', estimated_minutes: 90, status: 'open', dependencies: [], critical: false, hard_due: false, project_id: null }
  ],
  shadows: [
    { id: 'shadow-9b', class_label: '9B', collected_on: '2026-10-13', return_by: '2026-10-20', scripts: 28, scripts_marked: 0, minutes_remaining: 90 }
  ],
  walls: [{ id: 'wall:trip', label: 'Overseas trip', starts_on: '2026-12-12', ends_on: '2027-01-06' }],
  weeks: [
    { monday: '2026-10-19', committed_minutes: 480, capacity_minutes: 200, rhythm_factor: 1, over: true, wall: false },
    { monday: '2026-10-26', committed_minutes: 0, capacity_minutes: 400, rhythm_factor: 1, over: false, wall: false },
    { monday: '2026-12-14', committed_minutes: 60, capacity_minutes: 0, rhythm_factor: 1, over: false, wall: true }
  ],
  drag: { task_id: 'big-a', days: 4, from_due: '2026-10-16' },
  omitted: null
});

describe('timeline digest availability', () => {
  it('keeps walls, shadows, capacity, rhythm and the triggering drag', () => {
    const digest = buildStoredTimelineDigest({
      today: '2026-10-01',
      window: { start: '2026-10-01', end: '2026-11-01' },
      drag: { task_id: 't-drag', days: 3 },
      terms: [
        { term: 1, starts_on: '2026-01-28', ends_on: '2026-04-10' },
        { term: 4, starts_on: '2026-10-12', ends_on: '2026-12-16' }
      ],
      samples: [
        { termKey: '2025-T1', weekIndex: 1, minutes: 40 },
        { termKey: '2025-T2', weekIndex: 1, minutes: 40 },
        { termKey: '2025-T1', weekIndex: 2, minutes: 80 },
        { termKey: '2025-T2', weekIndex: 2, minutes: 80 }
      ],
      tasks: [
        {
          id: 'shadow-9b',
          title: '9B marking',
          status: 'open',
          due_date: '2026-10-20',
          estimated_duration: 120,
          priority: 'medium',
          marking: {
            class_label: '9B',
            scripts: 28,
            minutes_per_script: 4,
            collected_on: '2026-10-13',
            return_by: '2026-10-20',
            scripts_marked: 10
          }
        },
        {
          id: 't-drag',
          title: 'Book bus',
          status: 'open',
          due_date: '2026-10-08',
          estimated_duration: 30,
          priority: 'urgent',
          depends_on: []
        }
      ],
      projects: [
        {
          id: 'p-trip',
          title: 'Overseas trip',
          status: 'open',
          due_date: null,
          estimated_duration: null,
          life_wall: { starts_on: '2026-12-12', ends_on: '2027-01-06', label: 'Overseas trip' }
        }
      ]
    });

    expect(digest.walls.map((wall) => wall.label)).toContain('Overseas trip');
    expect(digest.shadows).toEqual([
      expect.objectContaining({ id: 'shadow-9b', class_label: '9B', minutes_remaining: 72 })
    ]);
    expect(digest.weeks.some((week) => week.capacity_minutes > 0)).toBe(true);
    expect(digest.weeks.every((week) => typeof week.rhythm_factor === 'number')).toBe(true);
    expect(digest.learning_term_rhythm).toBe(false);
    expect(digest.weeks.some((week) => week.rhythm_factor !== 1)).toBe(true);
    expect(digest.drag).toEqual({ task_id: 't-drag', days: 3, from_due: '2026-10-08' });
    expect(digest.tasks.find((task) => task.id === 't-drag')?.hard_due).toBe(true);
    expect(digest.omitted).toBeNull();
  });

  it('delivers that digest to Hammond through the dump path', async () => {
    const store = createTasksStore(memoryKv(), keys);
    await store.createTask({
      title: 'Overseas trip',
      domain: 'life',
      life_wall: { starts_on: '2026-12-12', ends_on: '2027-01-06', label: 'Overseas trip' }
    });
    await store.createTask({
      title: '9B marking',
      domain: 'teaching',
      due_date: '2026-10-20',
      estimated_duration: 120,
      marking: {
        class_label: '9B',
        scripts: 28,
        minutes_per_script: 4,
        collected_on: '2026-10-13',
        return_by: '2026-10-20',
        scripts_marked: 0
      }
    });
    let seen: unknown = null;
    await store.processDumpWithClare({
      text: 'Rebalance the visible timeline.',
      protocol_id: 'timeline_rebalance',
      agent_slug: 'hammond',
      timeline_drag: { task_id: 'book-bus', days: 2 },
      judge: async (digest) => {
        seen = digest;
        return { ok: true, voice: 'Hammond suggests 0 changes. Clear.', items: [], mutations: [], model: 'test' };
      }
    });
    const timeline = (seen as { timeline: TimelineDigest; protocol_id: string }).timeline;
    expect((seen as { protocol_id: string }).protocol_id).toBe('timeline_rebalance');
    expect(timeline.walls.some((wall) => wall.label === 'Overseas trip')).toBe(true);
    expect(timeline.shadows.some((shadow) => shadow.class_label === '9B')).toBe(true);
    expect(timeline.weeks.some((week) => week.capacity_minutes > 0)).toBe(true);
    expect(timeline.weeks.every((week) => typeof week.rhythm_factor === 'number')).toBe(true);
    expect(timeline.drag).toMatchObject({ task_id: 'book-bus', days: 2 });
  });
});

describe('Hammond model request', () => {
  const digest = digestWith(overloaded());

  async function capture(slug: 'hammond' | 'clare', protocol: 'timeline_rebalance' | 'morning-sweep' = 'timeline_rebalance') {
    let body: { system?: string; messages?: Array<{ content?: string }> } = {};
    const judge = createClareProposalJudge({
      apiKey: 'test-key',
      agentSlug: slug,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: '{"voice":"Holding the wall and the week.","items":[],"mutations":[]}' }] })
        );
      }
    });
    await judge(protocol === digest.protocol_id ? digest : digestWith(overloaded(), protocol));
    return body;
  }

  it('delivers walls, shadows, capacity, rhythm and the drag on Hammond’s final request', async () => {
    const body = await capture('hammond');
    expect(body.system).toContain('General Hammond');
    const user = JSON.parse(body.messages?.[0]?.content ?? '{}') as { timeline: TimelineDigest };
    expect(user.timeline.walls[0]?.label).toBe('Overseas trip');
    expect(user.timeline.shadows[0]?.class_label).toBe('9B');
    expect(user.timeline.weeks[0]?.capacity_minutes).toBe(200);
    expect(user.timeline.weeks[0]?.rhythm_factor).toBe(1);
    expect(user.timeline.drag?.task_id).toBe('big-a');
  });

  it('tells Hammond what walls, shadows, capacity and hard due dates mean', async () => {
    expect(HAMMOND_REBALANCE_INSTRUCTIONS).toContain('Never move a wall');
    expect(HAMMOND_REBALANCE_INSTRUCTIONS).toContain('shadows are marking work that is already real');
    expect(HAMMOND_REBALANCE_INSTRUCTIONS).toContain('capacity_minutes');
    expect(HAMMOND_REBALANCE_INSTRUCTIONS).toContain('Hard due date');
    const body = await capture('hammond');
    expect(body.system).toContain('Never move a wall');
    expect(body.system).toContain('shadows are marking work that is already real');
    expect(body.system).toContain('Stay at or under that capacity');
    expect(body.system).toContain('Hard due date');
  });

  it('does not give Clare Hammond’s rebalance instructions', async () => {
    const clare = await capture('clare');
    expect(clare.system).toContain('Clare DeMind');
    expect(clare.system).not.toContain('Never move a wall');
    const other = await capture('hammond', 'morning-sweep');
    expect(other.system).not.toContain('Never move a wall');
  });
});

describe('timeline rebalance behaviour', () => {
  it('moves flexible work off the wall and the over-capacity week', () => {
    const proposal = proposeTimelineRebalance(overloaded());
    const dues = new Map(proposal.mutations.map((mutation) => [mutation.kind === 'task_update' ? mutation.task_id : '', mutation.kind === 'task_update' ? mutation.patch.due_date : null]));
    expect(dues.has('shadow-9b')).toBe(false);
    expect(dues.has('hard')).toBe(false);
    expect(dues.has('big-a') || dues.has('big-b')).toBe(true);
    const trip = dues.get('trip');
    expect(typeof trip).toBe('string');
    expect(String(trip) <= '2027-01-06' && String(trip) >= '2026-12-12').toBe(false);
    for (const due of dues.values()) {
      if (typeof due !== 'string') continue;
      expect(due >= '2026-12-12' && due <= '2027-01-06').toBe(false);
    }
    const stillOnWeek = ['big-a', 'big-b', 'hard'].filter((id) => {
      const moved = dues.get(id);
      const due = typeof moved === 'string' ? moved : overloaded().tasks.find((task) => task.id === id)?.due_date;
      return due != null && due >= '2026-10-19' && due <= '2026-10-25';
    });
    const minutes = stillOnWeek.reduce((sum, id) => sum + (overloaded().tasks.find((task) => task.id === id)?.estimated_minutes ?? 0), 0);
    expect(minutes).toBeLessThanOrEqual(200);
  });

  it('leaves a clear week alone', () => {
    const calm = overloaded();
    calm.walls = [];
    calm.tasks = calm.tasks.filter((task) => task.id === 'hard');
    calm.shadows = [];
    calm.weeks = [{ monday: '2026-10-19', committed_minutes: 30, capacity_minutes: 200, rhythm_factor: 1, over: false, wall: false }];
    expect(proposeTimelineRebalance(calm).mutations).toEqual([]);
  });

  it('returns the visual fixture for the seeded timeline and ghosts from those mutations', async () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), '../../docs/proposals/timeline-reference/fixture.json'), 'utf8')
    ) as { hammond_proposal: { changes: Array<{ id: string; due: string }> } };
    const seed = buildStoredTimelineDigest({
      today: '2026-09-22',
      tasks: [
        { id: 'h3', title: 'Draft procedures', status: 'in_progress', due_date: '2026-10-23', estimated_duration: 240, priority: 'medium' },
        { id: 'u3', title: 'Coaching sessions', status: 'open', due_date: '2026-10-23', estimated_duration: 240, priority: 'medium' },
        { id: 'x4', title: 'HALT advisory prep', status: 'open', due_date: '2026-10-22', estimated_duration: 90, priority: 'medium' }
      ]
    });
    const judgment = await localStubClareJudge('hammond')(digestWith(seed));
    const ghosts = ghostsFromMutations(judgment.mutations);
    expect(ghosts.map((ghost) => ({ id: ghost.id, due: ghost.due }))).toEqual(fixture.hammond_proposal.changes.map((change) => ({ id: change.id, due: change.due })));
    const clare = await localStubClareJudge('clare')(digestWith(seed));
    expect(clare.mutations).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { canonicalizeGanttHash, parseHashRoute } from '@/shell/shell';
import {
  buildTimelineRows,
  criticalChains,
  goalProjectCount,
  goalSpan,
  isTimelineExpanded,
  timelineTaskSpan,
  undatedCount,
  type TlModel
} from '@/domain/timeline-rows';

const model: TlModel = {
  dreams: [{ id: 'd1', title: 'Publish', target: '2027-03-01', origin: '2025-11-01' }],
  goals: [
    { id: 'g1', title: 'Gifted programs', dream: null },
    { id: 'g2', title: 'Leadership', dream: 'd1' }
  ],
  projects: [
    { id: 'p1', title: 'Tournament', goal: 'g1', domain: 'teaching', start: '2026-09-01', end: '2026-10-03', baselineEnd: null, shade: false, colour: '#376fb7' },
    { id: 'p2', title: 'UN Voice', goal: 'g1', domain: 'teaching', start: '2026-09-14', end: '2026-11-06', baselineEnd: null, shade: true, colour: '#376fb7' },
    { id: 'p3', title: 'Seating', goal: null, domain: 'teaching', start: '2026-09-14', end: '2026-10-14', baselineEnd: null, shade: false, colour: '#376fb7' }
  ],
  milestones: [{ id: 'm1', project: 'p1', title: 'Finals', due: '2026-10-03', deps: ['t6'] }],
  tasks: [
    { id: 't3', title: 'Permission notes', project: 'p1', parent: null, domain: 'teaching', due: '2026-09-24', est: 90, status: 'in_progress', blocked: false, blockedSince: null, deps: [] },
    { id: 't3a', title: 'Risk form', project: 'p1', parent: 't3', domain: 'teaching', due: '2026-09-26', est: 30, status: 'open', blocked: false, blockedSince: null, deps: ['t3'] },
    { id: 't3b', title: 'Medical forms', project: 'p1', parent: 't3', domain: 'teaching', due: null, est: null, status: 'open', blocked: false, blockedSince: null, deps: [] },
    { id: 't4', title: 'Get bus quote', project: 'p1', parent: null, domain: 'teaching', due: '2026-09-23', est: 15, status: 'open', blocked: false, blockedSince: null, deps: [] },
    { id: 't5', title: 'Book bus', project: 'p1', parent: null, domain: 'teaching', due: '2026-09-25', est: 30, status: 'open', blocked: true, blockedSince: '2026-09-18', deps: ['t4'] },
    { id: 't6', title: 'Excursion form', project: 'p1', parent: null, domain: 'teaching', due: '2026-09-29', est: 60, status: 'open', blocked: false, blockedSince: null, deps: ['t5'] },
    { id: 's1', title: 'Email Simone', project: 'p3', parent: null, domain: 'teaching', due: null, est: 5, status: 'open', blocked: false, blockedSince: null, deps: [] }
  ]
};

const today = '2026-09-22';

describe('timeline rows', () => {
  it('nests dream, goal, project, task, milestone and step', () => {
    const rows = buildTimelineRows(model, { zoom: 3, expanded: new Map(), today });
    const order = rows.map((row) => `${row.kind}:${row.ref}`);
    expect(order).toContain('goal:g1');
    expect(order.indexOf('dream:d1')).toBeLessThan(order.indexOf('goal:g2'));
    expect(order.indexOf('project:p1')).toBeGreaterThan(order.indexOf('goal:g1'));
    expect(order.indexOf('task:t4')).toBeGreaterThan(order.indexOf('project:p1'));
    expect(order.indexOf('milestone:m1')).toBeGreaterThan(order.indexOf('task:t6'));
    expect(order.indexOf('step:t3a')).toBeGreaterThan(order.indexOf('task:t3'));
  });

  it('spans a goal across its projects and counts undated children', () => {
    expect(goalSpan('g1', model.projects)).toEqual({ start: '2026-09-01', end: '2026-11-06' });
    expect(goalProjectCount('g1', model.projects)).toBe(2);
    expect(undatedCount('p1', model.tasks)).toBe(1);
    expect(undatedCount('p3', model.tasks)).toBe(1);
  });

  it('hides tasks at year zoom unless the project was opened, and shows steps at week', () => {
    const year = buildTimelineRows(model, { zoom: 0, expanded: new Map(), today });
    expect(year.some((row) => row.kind === 'task')).toBe(false);
    const month = buildTimelineRows(model, { zoom: 2, expanded: new Map(), today });
    expect(month.some((row) => row.ref === 't3')).toBe(true);
    expect(month.some((row) => row.ref === 't3a')).toBe(false);
    const week = buildTimelineRows(model, { zoom: 3, expanded: new Map(), today });
    expect(week.some((row) => row.kind === 'step' && row.ref === 't3a')).toBe(true);
    expect(isTimelineExpanded('p1', 'project', 2, new Map(), model.tasks, today)).toBe(true);
  });

  it('keeps an explicit collapse', () => {
    const expanded = new Map<string, boolean>([['p1', false]]);
    const rows = buildTimelineRows(model, { zoom: 2, expanded, today });
    expect(rows.some((row) => row.ref === 't3')).toBe(false);
  });

  it('sizes a bar back from the due date', () => {
    expect(timelineTaskSpan({ due: '2026-09-24', est: 90 })).toEqual({ start: '2026-09-24', end: '2026-09-24' });
    expect(timelineTaskSpan({ due: '2026-10-16', est: 180 })).toEqual({ start: '2026-10-15', end: '2026-10-16' });
    expect(timelineTaskSpan({ due: null, est: 30 })).toBeNull();
  });

  it('picks the longest chain in a project', () => {
    const chain = criticalChains([[['t4', 't5'], ['t5', 't6'], ['t6', 'm1'], ['t1', 't2']]]);
    expect([...chain.edges]).toEqual(['t6>m1', 't5>t6', 't4>t5']);
  });

  it('redirects #/gantt to #/timeline with the same query', () => {
    expect(canonicalizeGanttHash('#/gantt?project=p-tom')).toBe('#/timeline?project=p-tom');
    expect(canonicalizeGanttHash('#/board')).toBeNull();
    window.location.hash = '#/gantt?project=p1';
    expect(parseHashRoute()).toBe('timeline');
  });
});

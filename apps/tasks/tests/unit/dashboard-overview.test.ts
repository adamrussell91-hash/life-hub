import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { projectLifecycleMix } from '@/domain/projects-pulse';
import {
  chipUrgencyClass,
  dashboardFocusStats,
  dashboardHeatDays,
  dashboardNextAction,
  dashboardTimeline,
  loadToneFor,
  sourceChipClass,
  upcomingExcursionDates,
  weeklyCompletionTrend
} from '@/domain/dashboard-overview';
import { applyLinkAttachments } from '@/views/attachment-chips';
import { renderDashboardOverview } from '@/views/dashboard-overview';
import { renderProjectPortfolioChart } from '@/views/project-portfolio-chart';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  };
}

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    arc_summary: '',
    type: 'standard',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    parent_goal_id: null,
    tags: [],
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial
  };
}

const now = new Date('2026-08-27T12:00:00.000Z');

describe('upcomingExcursionDates', () => {
  it('returns future excursion key dates sorted by due date', () => {
    const projects = [
      project({
        id: 'ex1',
        title: 'Ethics Olympiad',
        type: 'excursion',
        key_dates: {
          permission_note_due: '2026-09-01',
          staff_notification_due: '2026-09-05',
          risk_assessment_due: null,
          payment_due: null
        },
        current_end_date: '2026-10-15'
      })
    ];
    const items = upcomingExcursionDates(projects, now);
    expect(items.map((item) => item.label)).toEqual([
      'Permission note',
      'Staff notification',
      'Event'
    ]);
    expect(items[0]?.daysOut).toBeGreaterThan(0);
  });

  it('skips archived excursions and past dates', () => {
    const projects = [
      project({
        id: 'ex_old',
        title: 'Past trip',
        type: 'excursion',
        status: 'archived_dead',
        key_dates: { permission_note_due: '2026-09-01' }
      }),
      project({
        id: 'ex_past',
        title: 'Late note',
        type: 'excursion',
        key_dates: { permission_note_due: '2026-08-01' }
      })
    ];
    expect(upcomingExcursionDates(projects, now)).toEqual([]);
  });
});

describe('dashboard focus model', () => {
  it('counts today, overdue, needs-attention, and live projects', () => {
    const stats = dashboardFocusStats(
      [
        task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' }),
        task({ id: 't2', title: 'Late report', due_date: '2026-08-20', domain: 'teaching' })
      ],
      [
        project({
          id: 'p1',
          title: 'MindWorks',
          status: 'active',
          current_end_date: '2026-08-20',
          baseline_end_date: '2026-08-10'
        }),
        project({ id: 'p2', title: 'Quiet', status: 'active' })
      ],
      now
    );
    // Today tile matches Timeline TODAY: due-today + overdue (disjoint).
    expect(stats.today).toBe(2);
    expect(stats.overdue).toBe(1);
    expect(stats.needsAttention).toBeGreaterThanOrEqual(1);
    expect(stats.activeProjects).toBe(2);
  });

  it('does not claim 0 today when Timeline TODAY only has overdue work', () => {
    // Adam screenshot: 0 Today's tasks + 1 Overdue while TODAY lists the overdue task.
    const overdueOnly = task({
      id: 'steam',
      title: 'Plan Year 5/6 Pathfinders STEAM extension course',
      due_date: '2026-08-20',
      domain: 'teaching',
      status: 'in_progress'
    });
    const stats = dashboardFocusStats([overdueOnly], [], now);
    const todayRows = dashboardTimeline([overdueOnly], [], now).filter(
      (item) => item.bucket === 'today' && item.source === 'task'
    );
    expect(todayRows).toHaveLength(1);
    expect(stats.overdue).toBe(1);
    expect(stats.today).toBe(todayRows.length);
  });

  it('merges tasks, projects, and excursions onto one chronological rail', () => {
    const items = dashboardTimeline(
      [task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' })],
      [
        project({ id: 'p1', title: 'MindWorks', current_end_date: '2026-09-02' }),
        project({
          id: 'ex1',
          title: 'Ethics Olympiad',
          type: 'excursion',
          key_dates: { permission_note_due: '2026-09-01' }
        })
      ],
      now
    );
    expect(items.map((item) => item.source)).toEqual(['task', 'excursion', 'project']);
    expect(items[0]?.bucket).toBe('today');
    expect(items[1]?.bucket).toBe('this_week');
    expect(items[2]?.bucket).toBe('this_week');
  });

  it('builds a 7-day heat row and weekly completion trend', () => {
    const days = dashboardHeatDays(
      [task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27' })],
      [],
      now
    );
    expect(days).toHaveLength(7);
    expect(days[0]?.isToday).toBe(true);
    expect(days[0]?.count).toBe(1);

    const trend = weeklyCompletionTrend(
      [
        task({
          id: 'done1',
          title: 'Done this week',
          status: 'done',
          completed_at: '2026-08-26T00:00:00.000Z'
        }),
        task({
          id: 'done2',
          title: 'Done last week',
          status: 'done',
          completed_at: '2026-08-18T00:00:00.000Z'
        })
      ],
      now
    );
    expect(trend.thisWeek).toBe(1);
    expect(trend.lastWeek).toBe(1);
    expect(trend.delta).toBe(0);
    expect(trend.daily).toHaveLength(14);
  });

  it('picks the most urgent next action and colors chips by urgency', () => {
    const overdue = task({ id: 'late', title: 'Late report', due_date: '2026-08-20' });
    const action = dashboardNextAction([overdue], [], now);
    expect(action?.kind).toBe('start');
    expect(action?.title).toBe('Late report');
    expect(chipUrgencyClass('danger')).toContain('chip--urgency-danger');
    expect(sourceChipClass('excursion')).toContain('chip--source-excursion');
    expect(loadToneFor(1)).toBe('ok');
    expect(loadToneFor(3)).toBe('hot');
    expect(loadToneFor(5)).toBe('over');
  });
});

describe('renderProjectPortfolioChart', () => {
  it('renders a mood-mix donut with running load in the centre', () => {
    const mix = projectLifecycleMix(
      [
        project({ id: 'p1', title: 'Live', status: 'active' }),
        project({ id: 'p2', title: 'Planning', status: 'active', milestones: [] })
      ],
      [],
      new Set(),
      now
    );
    const chart = renderProjectPortfolioChart(mix, { running: 1, compact: true, href: '#/projects' });
    expect(chart.querySelector('.projects-mix__pie')).not.toBeNull();
    expect(chart.querySelector('a[href="#/projects"]')).not.toBeNull();
    expect(chart.textContent).toContain('What’s the mix?');
    expect(chart.textContent).toContain('running');
    expect(chart.querySelector('.projects-mix__legend-row')).not.toBeNull();
  });

  it('tones the centre by load and treats a click as a filter action', () => {
    const onActivate = vi.fn();
    const chart = renderProjectPortfolioChart([], {
      running: 5,
      compact: true,
      onActivate,
      active: true
    });
    const btn = chart.querySelector<HTMLButtonElement>('.metric-ring-wrap--action');
    expect(btn?.dataset.tone).toBe('over');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    btn?.click();
    expect(onActivate).toHaveBeenCalledOnce();
  });
});

describe('renderDashboardOverview', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(max-width: 720px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one week card with strip and agenda, and no due-soon pills', () => {
    const host = document.createElement('div');
    renderDashboardOverview(host, {
      now,
      tasks: [task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' })],
      projects: [
        project({ id: 'p1', title: 'MindWorks', status: 'active', current_end_date: '2026-09-02' }),
        project({
          id: 'ex1',
          title: 'Ethics Olympiad',
          type: 'excursion',
          key_dates: { permission_note_due: '2026-09-01' }
        })
      ]
    });

    expect(host.querySelector('.dashboard-focus')?.textContent).toContain('Overdue');
    expect(host.querySelector('.dashboard-focus')?.textContent).toContain('Today');
    expect(host.querySelector('.dashboard-focus__value')?.textContent).toBeTruthy();
    expect(host.querySelector('[aria-label="This week"]')?.textContent).toContain('Mark essays');
    expect(host.querySelector('[aria-label="Agenda"]')).toBeNull();
    expect(host.querySelector('.dashboard-rail')).toBeNull();
    expect(host.querySelectorAll('.dashboard-heat__cell')).toHaveLength(7);
    expect(host.querySelector('[aria-label="Today"]')).toBeNull();
    expect(host.querySelector('[aria-label="Excursions"]')).toBeNull();
    expect(host.querySelector('[aria-label="Projects"] .project-pulse-chart')).not.toBeNull();
    expect(host.querySelector('.projects-mix__pie')).not.toBeNull();
    expect(host.querySelector('.dashboard-trend-chart')).toBeNull();
    expect(host.querySelector('.due-soon-strip')).toBeNull();
    expect(host.querySelector('.dashboard-heat__peek')).toBeNull();
    expect(host.querySelector('.dashboard-row__grip')).not.toBeNull();
    expect(host.querySelector('.dashboard-row .task-check')).not.toBeNull();
    expect(host.querySelector('.chip--source-task')).not.toBeNull();
    expect(host.querySelector('.chip--urgency-warning')?.textContent).toBe('Today');
    expect(host.querySelector('.dashboard-next')?.textContent).toContain('Mark essays');
    expect(host.querySelector('[aria-label="This week"] a')?.getAttribute('href')).toContain(
      '#/week?date='
    );
    expect(host.querySelector('.dashboard-timeline')?.textContent).toContain('Mark essays');
    expect(host.querySelector('.hub-chip--attach')).toBeNull();
    // One week card only — not a separate timeline/agenda card beside the strip.
    expect(host.querySelectorAll('.dashboard-overview__tile--week')).toHaveLength(1);
    expect(host.querySelector('.dashboard-overview__tile--timeline')).toBeNull();
  });

  it('shows project and event pills on the dashboard row and next action', () => {
    const host = document.createElement('div');
    const mindworks = project({ id: 'p1', title: 'MindWorks', status: 'active' });
    const heat = project({
      id: 'ex1',
      title: 'Ethics Olympiad',
      type: 'excursion',
      status: 'active'
    });
    renderDashboardOverview(host, {
      now,
      tasks: [
        task({
          id: 't1',
          title: 'Mark essays',
          due_date: '2026-08-27',
          parent_project_id: 'p1',
          contexts: [{ kind: 'place', value: 'Staff room' }]
        }),
        task({
          id: 't2',
          title: 'Print heat packs',
          due_date: '2026-08-28',
          parent_project_id: 'ex1'
        })
      ],
      projects: [mindworks, heat]
    });

    const today = host.querySelector('#timeline-today .dashboard-row');
    const pill = today?.querySelector<HTMLAnchorElement>('[data-attach="project"]');
    expect(pill?.querySelector('.hub-chip__name')?.textContent).toBe('MindWorks');
    expect(today?.querySelector('[data-attach="place"] .hub-chip__name')?.textContent).toBe('Staff room');
    expect(pill?.tagName).toBe('A');
    expect(pill?.getAttribute('href')).toBe('#/project/p1');
    expect(pill?.closest('.dashboard-row__body')).toBeNull();
    const nextPill = host.querySelector<HTMLAnchorElement>('.dashboard-next [data-attach="project"]');
    expect(nextPill?.querySelector('.hub-chip__name')?.textContent).toBe('MindWorks');
    expect(nextPill?.tagName).toBe('A');
    expect(nextPill?.getAttribute('href')).toBe('#/project/p1');

    const cell = [...host.querySelectorAll('.dashboard-heat__cell')].find((node) =>
      node.textContent?.includes('28')
    );
    cell?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const later = host.querySelector('.dashboard-row');
    const excursion = later?.querySelector<HTMLAnchorElement>('[data-attach="excursion"]');
    expect(excursion?.querySelector('.hub-chip__name')?.textContent).toBe('Ethics Olympiad');
    expect(excursion?.tagName).toBe('A');
    expect(excursion?.getAttribute('href')).toBe('#/project/ex1');
    expect(excursion?.closest('.dashboard-row__body')).toBeNull();
  });

  it('places a linked event pill outside the dashboard row link', () => {
    const host = document.createElement('div');
    document.body.append(host);
    renderDashboardOverview(host, {
      now,
      tasks: [task({ id: 't1', title: 'Reply to florist', due_date: '2026-08-27' })],
      projects: []
    });
    const row = host.querySelector<HTMLElement>('.dashboard-row');
    expect(row?.querySelector('.hub-chip--attach')).toBeNull();
    applyLinkAttachments(row!, [{ kind: 'event', label: 'Parent evening', href: '#/calendar' }]);
    const eventPill = row?.querySelector('[data-attach="event"]');
    expect(eventPill?.tagName).toBe('A');
    expect(eventPill?.getAttribute('href')).toBe('#/calendar');
    expect(eventPill?.closest('.dashboard-row__body')).toBeNull();
    expect(eventPill?.closest('.dashboard-row__attach')).not.toBeNull();
    host.remove();
  });

  it('makes every focus tile and the next-action card activate on click', () => {
    const onFilterRunning = vi.fn();
    const host = document.createElement('div');
    const open = task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' });
    renderDashboardOverview(host, {
      now,
      tasks: [open, task({ id: 't2', title: 'Late', due_date: '2026-08-20', domain: 'teaching' })],
      projects: [project({ id: 'p1', title: 'MindWorks', status: 'active' })],
      onFilterRunning
    });

    const tiles = [...host.querySelectorAll<HTMLElement>('.dashboard-focus__tile')];
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.tagName === 'A' || tile.tagName === 'BUTTON').toBe(true);
    }

    const today = tiles.find((tile) => tile.getAttribute('aria-label')?.includes('Today'));
    const overdue = tiles.find((tile) => tile.getAttribute('aria-label')?.includes('Overdue'));
    const attention = tiles.find((tile) => tile.getAttribute('aria-label')?.includes('Attention'));
    const projects = tiles.find((tile) => tile.getAttribute('aria-label')?.includes('Projects'));
    expect(today?.tagName).toBe('A');
    expect((today as HTMLAnchorElement).href).toContain('#/day');
    expect(attention?.tagName).toBe('A');
    expect((attention as HTMLAnchorElement).href).toContain('#/projects');
    expect(overdue?.tagName).toBe('BUTTON');
    expect(projects?.tagName).toBe('BUTTON');

    host.dataset.open = 'false';
    const panel = host.querySelector<HTMLElement>('.dashboard-overview__panel');
    if (panel) panel.hidden = true;
    overdue?.click();
    expect(host.dataset.open).toBe('true');
    expect(host.querySelector<HTMLElement>('.dashboard-overview__panel')?.hidden).toBe(false);
    expect(sessionStorage.getItem('tasks-hub:dashboard-overview-open')).toBe('true');

    projects?.click();
    expect(onFilterRunning).toHaveBeenCalledOnce();

    const next = host.querySelector<HTMLElement>('.dashboard-next');
    expect(next?.getAttribute('role')).toBe('link');
    const hashBefore = window.location.hash;
    next?.click();
    expect(window.location.hash).toContain('#/task/');
    window.location.hash = hashBefore;
  });

  it('wires start, complete, reschedule, and running-filter actions', () => {
    const onStartTask = vi.fn();
    const onCompleteTask = vi.fn();
    const onRescheduleTask = vi.fn();
    const onFilterRunning = vi.fn();
    const host = document.createElement('div');
    const open = task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' });
    renderDashboardOverview(host, {
      now,
      tasks: [open],
      projects: [project({ id: 'p1', title: 'MindWorks' })],
      onStartTask,
      onCompleteTask,
      onRescheduleTask,
      onFilterRunning
    });

    host.querySelector<HTMLButtonElement>('.dashboard-next .btn')?.click();
    expect(onStartTask).toHaveBeenCalledWith(open);

    const box = host.querySelector<HTMLInputElement>('.dashboard-row .task-check input');
    expect(box).not.toBeNull();
    box!.checked = true;
    box!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onCompleteTask).toHaveBeenCalledWith(open);

    host.querySelector<HTMLButtonElement>('.metric-ring-wrap--action')?.click();
    expect(onFilterRunning).toHaveBeenCalledOnce();

    const cell = host.querySelector<HTMLButtonElement>('.dashboard-heat__cell');
    expect(cell).not.toBeNull();
    const transfer = {
      data: { 'application/x-tasks-hub-task': open.id, 'text/plain': open.id } as Record<string, string>,
      getData(type: string) {
        return this.data[type] ?? '';
      },
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      effectAllowed: 'move'
    };
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    cell!.dispatchEvent(drop);
    expect(onRescheduleTask).toHaveBeenCalledWith(open, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('selects a week-strip day in place instead of jumping to week view', () => {
    const host = document.createElement('div');
    const hashBefore = window.location.hash;
    renderDashboardOverview(host, {
      now,
      tasks: [task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' })],
      projects: [
        project({ id: 'p1', title: 'MindWorks', status: 'active', current_end_date: '2026-09-02' })
      ]
    });

    const later = host.querySelector<HTMLButtonElement>('.dashboard-heat__cell[aria-label*="02/09/26"]');
    expect(later).not.toBeNull();
    later!.click();
    expect(window.location.hash).toBe(hashBefore);
    expect(sessionStorage.getItem('tasks-hub:dashboard-selected-day')).toBe('2026-09-02');
    expect(host.querySelector('.dashboard-heat__cell[data-selected="true"]')?.getAttribute('aria-label')).toContain(
      '02/09/26'
    );
    expect(host.querySelector('.dashboard-timeline')?.textContent).toContain('MindWorks');
    expect(host.querySelector('[aria-label="This week"] .dashboard-timeline')?.textContent).toContain('MindWorks');
  });

  it('lists the selected day agenda under the week strip', () => {
    const host = document.createElement('div');
    renderDashboardOverview(host, {
      now,
      tasks: [
        task({ id: 'a', title: 'Alpha', due_date: '2026-08-27' }),
        task({ id: 'b', title: 'Bravo', due_date: '2026-08-27' }),
        task({ id: 'c', title: 'Charlie', due_date: '2026-08-27' }),
        task({ id: 'd', title: 'Delta', due_date: '2026-08-27' })
      ],
      projects: []
    });
    const agenda = host.querySelector('[aria-label="This week"] .dashboard-timeline')?.textContent ?? '';
    expect(agenda).toContain('Alpha');
    expect(agenda).toContain('Bravo');
    expect(agenda).toContain('Charlie');
    expect(agenda).toContain('Delta');
    expect(host.querySelector('.dashboard-heat__peek')).toBeNull();
  });

  it('keeps week-strip day numbers aligned with a count slot on every cell', () => {
    const host = document.createElement('div');
    renderDashboardOverview(host, {
      now,
      tasks: [task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' })],
      projects: []
    });
    const cells = [...host.querySelectorAll('.dashboard-heat__cell')];
    expect(cells).toHaveLength(7);
    for (const cell of cells) {
      expect(cell.querySelector('.dashboard-heat__count')).not.toBeNull();
      expect(cell.querySelectorAll('.dashboard-heat__weekday, .dashboard-heat__day, .dashboard-heat__count')).toHaveLength(3);
    }
    expect(host.querySelectorAll('.dashboard-heat__count--empty').length).toBeGreaterThan(0);
  });

  it('makes Next up match the first Today agenda task, not a later list item', () => {
    const host = document.createElement('div');
    const email = task({
      id: 'email',
      title: 'Email all teachers',
      due_date: '2026-08-27',
      domain: 'teaching',
      priority: 'high',
      due_time: '08:00',
      estimated_duration: 30
    });
    const lunch = task({
      id: 'lunch',
      title: 'Block lunch tomorrow',
      due_date: '2026-08-27',
      domain: 'life',
      priority: 'medium',
      due_time: '12:00',
      estimated_duration: 45
    });
    const mark = task({
      id: 'mark',
      title: 'Mark Year 11 papers',
      due_date: '2026-08-27',
      domain: 'teaching',
      priority: 'medium',
      due_time: '14:00',
      estimated_duration: 90
    });
    // Insertion order puts Mark first in the raw array; plate order must still prefer Email.
    renderDashboardOverview(host, {
      now,
      tasks: [mark, lunch, email],
      projects: []
    });

    expect(dashboardNextAction([mark, lunch, email], [], now)?.title).toBe('Email all teachers');
    expect(host.querySelector('.dashboard-next')?.textContent).toContain('Email all teachers');
    expect(host.querySelector('.dashboard-next__time')?.textContent).toContain('8 AM');
    const todayTitles = [...host.querySelectorAll('#timeline-today .dashboard-row__title')].map(
      (node) => node.textContent
    );
    expect(todayTitles[0]).toBe('Email all teachers');
    expect(todayTitles).toContain('Block lunch tomorrow');
    expect(todayTitles).toContain('Mark Year 11 papers');
    expect(
      [...host.querySelectorAll('#timeline-today .dashboard-row__time')].map((node) => node.textContent)
    ).toEqual(expect.arrayContaining(['8 AM – 8:30 AM', '12 PM – 12:45 PM', '2 PM – 3:30 PM']));
  });

  it('collapses and expands the overview panel on mobile', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(max-width: 720px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);

    const host = document.createElement('div');
    renderDashboardOverview(host, {
      now,
      tasks: [task({ id: 't1', title: 'Mark essays' })],
      projects: [project({ id: 'p1', title: 'MindWorks' })]
    });

    const panel = host.querySelector<HTMLElement>('.dashboard-overview__panel');
    const peek = host.querySelector<HTMLElement>('.dashboard-overview__peek');
    expect(host.dataset.open).toBe('true');
    expect(panel?.hidden).toBe(false);
    expect(peek?.hidden).toBe(true);

    host.querySelector<HTMLButtonElement>('.dashboard-overview__toggle')?.click();
    expect(host.dataset.open).toBe('false');
    expect(panel?.hidden).toBe(true);
    expect(sessionStorage.getItem('tasks-hub:dashboard-overview-open')).toBe('false');
    expect(host.querySelector('.dashboard-focus')).not.toBeNull();
  });

  it('parks the focus counts in the page-header status slot when given one', () => {
    const host = document.createElement('div');
    const statusHost = document.createElement('div');
    statusHost.className = 'page-header__status';
    renderDashboardOverview(host, {
      now,
      tasks: [task({ id: 't1', title: 'Mark essays', due_date: '2026-08-20' })],
      projects: [],
      statusHost
    });
    expect(host.querySelector('.dashboard-focus')).toBeNull();
    expect(statusHost.querySelector('.dashboard-focus')?.textContent).toContain('Overdue');
    expect(statusHost.querySelector('.dashboard-focus__tile--danger')?.textContent).toContain('1');
  });
});

describe('dashboard overview tile height (L2)', () => {
  it('does not stretch This week / Projects with min-height 100%', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '../../src/styles/views.css'), 'utf8');
    const tileBlock = css.match(/\.dashboard-overview__tile\s*\{[^}]+\}/);
    expect(tileBlock?.[0]).toBeTruthy();
    expect(tileBlock?.[0]).not.toMatch(/min-height:\s*100%/);
    expect(tileBlock?.[0]).toMatch(/height:\s*max-content/);
    expect(tileBlock?.[0]).toMatch(/align-self:\s*start/);
    expect(css).toMatch(
      /\.dashboard-overview__grid--week\s*\{[^}]*align-items:\s*start/
    );
  });
});

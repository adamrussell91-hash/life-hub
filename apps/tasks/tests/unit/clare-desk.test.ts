import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';
import {
  briefingToMarkdown,
  buildAppointmentPrep,
  buildBodyDoubleToolkit,
  buildCommsFollowup,
  buildContextSwitchToolkit,
  buildDopamineMenuToolkit,
  buildInterestFilterToolkit,
  buildMorningSweep,
  buildOpenLoopsToolkit,
  buildShatterToolkit,
  buildTimeMapToolkit,
  buildTomorrowSetup,
  buildWeeklyReset,
  findHighStakesTasks
} from '@/domain/clare-desk';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

const now = new Date(2026, 7, 25, 9, 0, 0);

describe('clare desk briefings', () => {
  it('flags stale high-stakes work from the seed', () => {
    const stakes = findHighStakesTasks(seed.tasks, now);
    expect(stakes.map((t) => t.title)).toContain('Lock MindWorks term brief');
    expect(stakes.every((t) => t.priority === 'high' || t.priority === 'urgent')).toBe(true);
  });

  it('leads the morning sweep with the stuck deadline and ends with dump away', () => {
    const briefing = buildMorningSweep(seed.tasks, now);
    expect(briefing.lead).toMatch(/one thing before we start/i);
    expect(briefing.lead).toMatch(/has not moved/i);
    expect(briefing.closer).toBe('That is your day. Dump away.');
    const words = [briefing.lead, briefing.closer, ...briefing.sections.flatMap((s) => s.lines)]
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
    expect(words.length).toBeLessThan(300);
  });

  it('tomorrow setup asks what to carry forward', () => {
    const briefing = buildTomorrowSetup(seed.tasks, now);
    expect(briefing.closer).toMatch(/reschedule|carry forward|close/i);
    expect(briefing.sections.length).toBeGreaterThan(0);
  });

  it('weekly reset names overdue decisions', () => {
    const briefing = buildWeeklyReset(seed.tasks, now);
    expect(briefing.sections.some((s) => /decide|week/i.test(s.heading))).toBe(true);
  });

  it('flattens a briefing into markdown for a chat bubble', () => {
    const briefing = buildMorningSweep(seed.tasks, now);
    const markdown = briefingToMarkdown(briefing);
    expect(markdown).toContain(briefing.lead);
    expect(markdown).toContain(briefing.closer);
    if (briefing.sections[0]) {
      expect(markdown).toContain(`**${briefing.sections[0].heading}**`);
      expect(markdown).toMatch(/^- /m);
    }
  });
});

describe('clare desk appointment + comms sprints', () => {
  it('appointment-prep surfaces a near-term appointment', () => {
    const tasks = [
      ...seed.tasks,
      {
        ...seed.tasks[0],
        id: 'appt-1',
        title: 'GP appointment — bloods review',
        due_date: '2026-08-25',
        tags: ['appointment'],
        status: 'open',
        priority: 'high'
      }
    ];
    const briefing = buildAppointmentPrep(tasks as typeof seed.tasks, now);
    expect(briefing.protocol_id).toBe('appointment-prep');
    expect(briefing.lead).toMatch(/GP appointment/i);
  });

  it('comms-followup lists overdue follow-ups and flags 7+ day staleness', () => {
    const tasks = [
      ...seed.tasks,
      {
        ...seed.tasks[0],
        id: 'fu-1',
        title: 'Follow up with venue',
        due_date: '2026-08-10',
        tags: ['follow-up', 'comms'],
        status: 'open',
        priority: 'medium',
        updated_at: '2026-08-10T00:00:00.000Z'
      }
    ];
    const briefing = buildCommsFollowup(tasks as typeof seed.tasks, now);
    expect(briefing.protocol_id).toBe('comms-followup');
    expect(briefing.lead).toMatch(/follow-up/i);
    expect(briefing.sections.some((s) => /7\+/i.test(s.heading) || s.lines.some((l) => /venue/i.test(l)))).toBe(true);
  });
});

describe('clare ADHD toolkits', () => {
  it('enriches the three existing toolkit ids', () => {
    expect(buildShatterToolkit({ title: 'Write report' }).body).toMatch(/staring|cannot start|Trigger/i);
    expect(buildTimeMapToolkit({ title: 'Marking pile' }, 20).body).toMatch(/Budget/i);
    expect(
      buildOpenLoopsToolkit([
        { title: 'Email Sam', kind: 'communication' as const, due_date: null, priority: 'high' as const }
      ]).body
    ).toMatch(/open loops/i);
  });

  it('builds the four net-new toolkit ids', () => {
    expect(buildDopamineMenuToolkit().title).toMatch(/dopamine/i);
    expect(buildBodyDoubleToolkit({ title: 'Slide deck' }).steps.length).toBeGreaterThanOrEqual(3);
    expect(buildContextSwitchToolkit({ title: 'Lesson plan' }, 'Email').body).toMatch(/palate-cleanser/i);
    expect(buildInterestFilterToolkit({ title: 'Filing' }, 'trains').steps[0]).toMatch(/Stage 1/i);
  });
});

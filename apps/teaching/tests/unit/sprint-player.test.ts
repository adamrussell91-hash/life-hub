// apps/teaching/tests/unit/sprint-player.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountSprintPlayer } from '@/sprint/player';
import type { SprintClient, SprintStatus } from '@/sprint/api';
import { newSprintSettings, newSprintBlocks } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';
import type { PublishedLesson } from '@/schemas/published-lesson';

let n = 0;
const id = () => `b${++n}`;
const settings = { ...newSprintSettings('class1'), criteria: [{ id: 'c1', text: 'Uses sources' }], phases: newSprintSettings('class1').phases.map((p, i) => ({ ...p, due_date: `2030-11-0${i + 1}` })) };
const lesson = { lesson_id: 'sp1', title: 'Pompeii', unit_id: 'u1', blocks: newSprintBlocks(id), published_at: 'x', schema_version: 1, pedagogical_mode: 'design_sprint', sprint: publicSprint(settings) } as unknown as PublishedLesson;
const row = (key: string, open: boolean) => ({ key, open, due_date: '2030-11-01', due_time: '15:00', state: 'none', late: false, frozen: false, closed: false, count_in: 0 });
const status = (over: Partial<SprintStatus> = {}): SprintStatus => ({
  identity: { need: null, initials: 'AB' },
  group: { id: 'g1', name: 'Kestrel', size: 2, mates: ['CD'] },
  phases: ['understand', 'sketch', 'decide', 'prototype', 'test'].map((k, i) => row(k, i === 0)) as SprintStatus['phases'],
  lock: null, mine: {}, notes: [], question: null, gallery: null, heat: null, chosen: null, awaiting: null, parts: [], pitch: null, spotlight: null, round: null, received: null,
  ...over
});
const client = (s: SprintStatus): SprintClient => ({
  status: vi.fn(async () => s), claim: vi.fn(async () => s), open: vi.fn(async () => s), save: vi.fn(async () => s), submit: vi.fn(async () => s),
  parts: vi.fn(async () => s), claimPart: vi.fn(async () => s), pitch: vi.fn(async () => s), feedback: vi.fn(async () => s),
  upload: vi.fn(), fileUrl: vi.fn(async () => 'blob:x')
}) as unknown as SprintClient;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('sprint player', () => {
  it('asks for initials first', async () => {
    const host = document.createElement('div');
    mountSprintPlayer(host, { lesson, classId: 'class1', client: client(status({ identity: { need: 'initials', initials: null }, group: null })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('input[aria-label="Your initials"]')).not.toBeNull();
  });

  it('shows the group, the stepper, the intention and the Understand form', async () => {
    const host = document.createElement('div');
    const c = client(status());
    mountSprintPlayer(host, { lesson, classId: 'class1', client: c, renderHero: () => {} });
    await flush();
    expect(host.querySelector('.sprint-group')?.textContent).toContain('Kestrel');
    expect([...host.querySelectorAll('.sprint-step')].map((s) => s.textContent)).toHaveLength(5);
    expect(host.querySelector('.sprint-step--now')?.textContent).toContain('Understand');
    expect(host.querySelector('.sprint-intent')?.textContent).toMatch(/^We will think by/);
    expect(c.open).toHaveBeenCalledWith('understand');
  });

  it('shows the lock screen while the class lock runs', async () => {
    const host = document.createElement('div');
    mountSprintPlayer(host, { lesson, classId: 'class1', client: client(status({ lock: { until: '2030-11-01T05:00:00.000Z' } })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.sprint-lock h2')?.textContent).toBe('Your class work is in');
    expect(host.querySelector('.sprint-form')).toBeNull();
  });

  it('shows the spotlight banner with no name', async () => {
    const host = document.createElement('div');
    mountSprintPlayer(host, { lesson, classId: 'class1', client: client(status({ spotlight: { text: 'How might we make ash talk?', label: 'One idea from the class' } })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.sprint-spotlight')?.textContent).toContain('How might we make ash talk?');
  });
});

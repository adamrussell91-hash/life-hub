import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Observation, ObservationSummary } from '@/observation/types';

vi.mock('@/observation/api', () => ({
  listObservations: vi.fn(async () => []),
  getObservation: vi.fn(),
  saveObservation: vi.fn(async (record: Observation) => record)
}));

import { openObservationStart, shortDay } from '@/observation/start-panel';
import { newObservation } from '@/observation/model';
import { getObservation, listObservations, saveObservation } from '@/observation/api';

const PEOPLE = [
  { ref: 'shared:person:jo', name: 'Jo Teacher' },
  { ref: 'shared:person:lee', name: 'Lee Colleague' }
];
const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000050';

function summary(over: Partial<ObservationSummary> = {}): ObservationSummary {
  return {
    id: 'obs_open0001', kind: 'nesa_proficient', status: 'open', person_ref: 'shared:person:jo', teacher_name: 'Jo Teacher',
    planned_on: '2026-11-16', meetings: { planning: 'meeting_plan' }, updated_at: '2026-11-16T00:00:00.000Z', ...over
  };
}

function open(onLinked = vi.fn(async () => {})) {
  const handle = openObservationStart(document, {
    about: PEOPLE, meetingId: MEETING_ID, meetingDate: '2026-11-18', supervisorName: 'Sam Supervisor', onLinked,
    now: () => new Date('2026-11-18T01:00:00.000Z')
  });
  const q = <T extends HTMLElement>(sel: string) => handle.el.querySelector<T>(sel)!;
  return { handle, onLinked, q, go: () => q<HTMLButtonElement>('[data-part="obs-start-go"]') };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('classroom observation start panel', () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it('defaults to the first person, shows the shelf with only Proficient live, and waits for a phase', () => {
    const { q, go } = open();
    expect(q<HTMLSelectElement>('[data-part="obs-who"]').value).toBe('shared:person:jo');
    const kinds = [...document.querySelectorAll<HTMLButtonElement>('.obs-start__kind')];
    expect(kinds.map((k) => k.disabled)).toEqual([false, true, true, true]);
    expect(kinds[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(kinds.slice(1).every((k) => k.textContent!.includes('Later'))).toBe(true);
    expect([...document.querySelectorAll('[data-phase]')].map((n) => n.textContent)).toEqual([
      expect.stringContaining('Planning'), expect.stringContaining('Observing'), expect.stringContaining('Reflecting')
    ]);
    expect(go().disabled).toBe(true);
  });

  it('Planning with no open observation makes a new one dated to the meeting', async () => {
    const { q, go, onLinked } = open();
    q<HTMLButtonElement>('[data-phase="planning"]').click();
    expect(go().disabled).toBe(true);
    await flush();
    expect(listObservations).toHaveBeenCalledWith({ person_ref: 'shared:person:jo', open: true });
    expect(go().disabled).toBe(false);
    go().click();
    await flush();
    const saved = vi.mocked(saveObservation).mock.calls[0]![0];
    expect(saved).toMatchObject({
      status: 'open', planned_on: '2026-11-18', meetings: { planning: MEETING_ID },
      teacher: { person_ref: 'shared:person:jo', name: 'Jo Teacher' }, supervisor: { name: 'Sam Supervisor' }
    });
    expect(onLinked).toHaveBeenCalledWith({ id: saved.id, phase: 'planning' });
    expect(document.querySelector('.obs-start')).toBeNull();
  });

  it('Observing offers the person’s open observations and links the chosen one', async () => {
    vi.mocked(listObservations).mockResolvedValueOnce([summary()]);
    const existing = newObservation({
      teacher: { person_ref: 'shared:person:jo', name: 'Jo Teacher' }, supervisorName: 'Sam Supervisor',
      plannedOn: '2026-11-16', meetingId: 'meeting_plan', phase: 'planning', now: '2026-11-16T00:00:00.000Z'
    });
    vi.mocked(getObservation).mockResolvedValueOnce({ ...existing, id: 'obs_open0001' });
    const { q, go, onLinked } = open();
    q<HTMLButtonElement>('[data-phase="observing"]').click();
    await flush();
    const choices = [...document.querySelectorAll<HTMLButtonElement>('[data-observation]')];
    expect(choices.map((c) => c.dataset.observation)).toEqual(['obs_open0001', 'new']);
    expect(choices[0]!.textContent).toContain('Open observation · Jo Teacher · started 16 Nov');
    expect(choices[0]!.getAttribute('aria-pressed')).toBe('true');
    go().click();
    await flush();
    expect(getObservation).toHaveBeenCalledWith('obs_open0001');
    const saved = vi.mocked(saveObservation).mock.calls[0]![0];
    expect(saved.id).toBe('obs_open0001');
    expect(saved.meetings).toEqual({ planning: 'meeting_plan', observing: MEETING_ID });
    expect(onLinked).toHaveBeenCalledWith({ id: 'obs_open0001', phase: 'observing' });
  });

  it('Observing can still start a new one when an open one exists', async () => {
    vi.mocked(listObservations).mockResolvedValueOnce([summary()]);
    const { q, go, onLinked } = open();
    q<HTMLButtonElement>('[data-phase="observing"]').click();
    await flush();
    q<HTMLButtonElement>('[data-observation="new"]').click();
    go().click();
    await flush();
    expect(getObservation).not.toHaveBeenCalled();
    const saved = vi.mocked(saveObservation).mock.calls[0]![0];
    expect(saved.id).not.toBe('obs_open0001');
    expect(saved.meetings).toEqual({ observing: MEETING_ID });
    expect(onLinked).toHaveBeenCalledWith({ id: saved.id, phase: 'observing' });
  });

  it('changing who is observed looks again for that person', async () => {
    const { q } = open();
    q<HTMLButtonElement>('[data-phase="reflecting"]').click();
    await flush();
    const who = q<HTMLSelectElement>('[data-part="obs-who"]');
    who.value = 'shared:person:lee';
    who.dispatchEvent(new Event('change'));
    await flush();
    expect(listObservations).toHaveBeenLastCalledWith({ person_ref: 'shared:person:lee', open: true });
    expect(q('[data-part="obs-choices"]').textContent).toContain('No open observation for Lee Colleague');
  });

  it('a failed save keeps the panel open and does not link', async () => {
    vi.mocked(saveObservation).mockRejectedValueOnce(new Error('Server down.'));
    const { q, go, onLinked } = open();
    q<HTMLButtonElement>('[data-phase="planning"]').click();
    await flush();
    go().click();
    await flush();
    expect(onLinked).not.toHaveBeenCalled();
    expect(document.querySelector('.obs-start')).not.toBeNull();
    expect(q('.guide-panel__error').textContent).toContain('didn’t save');
    expect(go().disabled).toBe(false);
  });

  it('Escape and the close button close it', () => {
    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.obs-start')).toBeNull();
    const { q } = open();
    q<HTMLButtonElement>('[data-part="obs-start-close"]').click();
    expect(document.querySelector('.obs-start')).toBeNull();
  });

  it('shortDay prints day and short month', () => {
    expect(shortDay('2026-11-16')).toBe('16 Nov');
  });
});

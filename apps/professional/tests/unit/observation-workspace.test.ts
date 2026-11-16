import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Observation } from '@/observation/types';

// Invented people only.
const api = vi.hoisted(() => ({
  getObservation: vi.fn(),
  listObservations: vi.fn(),
  saveObservation: vi.fn(),
  deleteObservation: vi.fn()
}));
const meetings = vi.hoisted(() => ({ getMeeting: vi.fn() }));
vi.mock('@/observation/api', () => api);
vi.mock('@/api/meetings', () => meetings);

import { openObservationReport } from '@/observation/export';
import { addDescriptor, addLookFor, logEntry, newObservation, startClock } from '@/observation/model';
import { NESA } from '@/observation/ui';
import { mountObservationWorkspace } from '@/observation/workspace';

const MEETING_PLAN = 'meeting_00000000-0000-4000-8000-000000000001';
const MEETING_OBS = 'meeting_00000000-0000-4000-8000-000000000002';
const T0 = Date.parse('2026-11-18T01:00:00.000Z');
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

function base(codes: string[] = []): Observation {
  let o = newObservation({
    teacher: { person_ref: 'shared:person:p_sam', name: 'Sam Okafor', school: 'Riverbend High' },
    supervisorName: 'Jo Supervisor', plannedOn: '2026-11-16', meetingId: MEETING_PLAN, phase: 'planning', now: T0
  });
  for (const c of codes) {
    const r = addDescriptor(o, c);
    if (!r.ok) throw new Error(r.reason);
    o = r.observation;
  }
  return o;
}

/** Two descriptors with look-fors: 3.5.2 (Q W) and 5.2.2 (A S). */
function planned(): Observation {
  let o = base(['3.5.2', '5.2.2']);
  o = addLookFor(o, '3.5.2', 'Instructions chunked');
  o = addLookFor(o, '3.5.2', 'Checks before release');
  o = addLookFor(o, '5.2.2', 'Specific to criteria');
  o = addLookFor(o, '5.2.2', 'Student acts on it');
  return { ...o, meetings: { ...o.meetings, observing: MEETING_OBS } };
}

let host: HTMLElement;
let ws: { destroy(): void } | null = null;
const lastSaved = async (): Promise<Observation> => {
  await flush();
  return api.saveObservation.mock.calls.at(-1)![0] as Observation;
};

async function mount(obs: Observation, phase: 'planning' | 'observing' | 'reflecting', meetingId = MEETING_PLAN) {
  api.getObservation.mockResolvedValue(obs);
  ws = mountObservationWorkspace(host, {
    document, observationId: obs.id, phase, meetingId, meetingDate: '2026-11-16',
    openMeeting: vi.fn(), makeLinkedMeeting: vi.fn(async () => MEETING_OBS), onUnlink: vi.fn(async () => {})
  });
  await flush();
  return host.querySelector('.obs') as HTMLElement;
}

const key = (k: string, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  api.saveObservation.mockImplementation(async (o: Observation) => ({ ...o, updated_at: '2026-11-18T02:00:00.000Z' }));
  api.listObservations.mockResolvedValue([]);
  meetings.getMeeting.mockResolvedValue({ meeting: { scheduled_start: '2026-11-18T23:00:00.000Z', time_zone: 'Australia/Sydney' } });
});

afterEach(() => {
  ws?.destroy();
  ws = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('observation workspace', () => {
  it('loads the record and shows this meeting’s phase with the series strip', async () => {
    const root = await mount(planned(), 'planning');
    expect(root.querySelector('[data-part="obs-planning"]')).not.toBeNull();
    expect(root.querySelector('[data-part="obs-observing"]')).toBeNull();
    const now = root.querySelector('.obs-series__step.is-now') as HTMLElement;
    expect(now.dataset.phase).toBe('planning');
    expect(now.textContent).toContain('This meeting');
    expect(meetings.getMeeting).toHaveBeenCalledWith(MEETING_OBS);
    expect(root.querySelector('[data-phase="observing"]')!.textContent).toContain('Thu 19 Nov');
    // Reflecting is not booked: it offers a date and Make linked meeting.
    expect(root.querySelector('[data-phase="reflecting"] [data-part="obs-make-meeting"]')).not.toBeNull();
    expect(root.querySelector('[data-part="obs-window"]')!.textContent).toMatch(/within two weeks: day \d+ of 14/);
  });

  it('shows an error with Retry when the record will not load', async () => {
    api.getObservation.mockRejectedValueOnce(new Error('down'));
    const obs = planned();
    ws = mountObservationWorkspace(host, {
      document, observationId: obs.id, phase: 'reflecting', meetingId: MEETING_PLAN, meetingDate: '2026-11-26',
      openMeeting: vi.fn(), makeLinkedMeeting: vi.fn(), onUnlink: vi.fn()
    });
    await flush();
    expect(host.querySelector('[data-part="obs-load-error"]')).not.toBeNull();
    api.getObservation.mockResolvedValueOnce(obs);
    (host.querySelector('[data-part="obs-load-retry"]') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('[data-part="obs-reflecting"]')).not.toBeNull();
  });

  it('books a later phase as a linked meeting and saves the link', async () => {
    const root = await mount(planned(), 'planning');
    const step = root.querySelector('[data-phase="reflecting"]') as HTMLElement;
    const date = step.querySelector('input[type="date"]') as HTMLInputElement;
    date.value = '2026-11-26';
    date.dispatchEvent(new Event('input'));
    (step.querySelector('[data-part="obs-make-meeting"]') as HTMLButtonElement).click();
    await flush();
    expect((await lastSaved()).meetings.reflecting).toBe(MEETING_OBS);
  });
});

describe('planning', () => {
  it('toggles descriptors; past 4 they become extras, and a seventh is refused', async () => {
    const root = await mount(base(), 'planning');
    for (const code of ['1.5.2', '3.5.2', '5.2.2', '4.2.2']) (root.querySelector(`.obs-opt[data-code="${code}"]`) as HTMLButtonElement).click();
    expect(root.querySelectorAll('.obs-opt[aria-pressed="true"]')).toHaveLength(4);
    expect(root.querySelectorAll('.obs-dcard')).toHaveLength(4);
    for (const code of ['2.2.2', '6.3.2']) (root.querySelector(`.obs-opt[data-code="${code}"]`) as HTMLButtonElement).click();
    expect(root.querySelectorAll('.obs-opt.is-extra')).toHaveLength(2);
    expect(root.querySelectorAll('.obs-dcard.is-extra')).toHaveLength(2);
    (root.querySelector('.obs-opt[data-code="5.1.2"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-part="obs-refuse"]')!.textContent).toMatch(/4 agreed and 2 extra/);
    expect((await lastSaved()).descriptors.map((d) => `${d.code}${d.extra ? '*' : ''}`)).toEqual(['1.5.2', '3.5.2', '5.2.2', '4.2.2', '2.2.2*', '6.3.2*']);
    // Click again to take them off.
    for (const code of ['2.2.2', '6.3.2', '4.2.2']) (root.querySelector(`.obs-opt[data-code="${code}"]`) as HTMLButtonElement).click();
    expect((await lastSaved()).descriptors).toHaveLength(3);
    // The template's questions are the labels.
    expect(root.textContent).toContain(NESA.p1.descriptors.why);
    expect(root.textContent).toContain(NESA.p1.strategies.syllabus);
    expect(root.querySelector('.obs-opt.is-dim')).toBeNull();
  });

  it('adds a guide look-for in one click, opens it to edit, and steps through the Proficient points', async () => {
    const root = await mount(base(['4.5.2']), 'planning');
    const card = root.querySelector('.obs-dcard[data-code="4.5.2"]') as HTMLElement;
    const chips = () => [...card.querySelectorAll('[data-part="obs-suggest-look"]')].map((b) => b.textContent);
    expect(chips()).toEqual(['+ Teaches and models safe ICT use', '+ Students apply ICT ethics in new contexts', '+ Strategies for safe, ethical ICT']);
    (card.querySelector('[data-part="obs-suggest-look"]') as HTMLButtonElement).click();
    expect((await lastSaved()).descriptors[0].look_fors.map((l) => l.label)).toEqual(['Teaches and models safe ICT use']);
    expect(card.querySelector('.obs-look__edit')).not.toBeNull();
    expect(chips()).toHaveLength(2);
    // One Proficient point at a time.
    const text = () => card.querySelector('[data-part="obs-proficient-text"]')!.textContent;
    const first = text();
    (card.querySelector('[data-part="obs-proficient-next"]') as HTMLButtonElement).click();
    expect(text()).not.toBe(first);
    const shown = text();
    (card.querySelector('[data-part="obs-proficient-add"]') as HTMLButtonElement).click();
    expect((await lastSaved()).descriptors[0].practice).toBe(`${shown}.`);
  });

  it('adds a look-for with Enter and gives it its row key', async () => {
    const root = await mount(base(['3.5.2', '5.2.2']), 'planning');
    const add = root.querySelector('.obs-dcard[data-code="5.2.2"] [data-part="obs-look-add"]') as HTMLInputElement;
    add.value = 'Reaches most students';
    key('Enter', add);
    const chip = root.querySelector('.obs-dcard[data-code="5.2.2"] .obs-look') as HTMLElement;
    expect(chip.querySelector('kbd')!.textContent).toBe('A');
    expect(chip.textContent).toContain('Reaches most students');
    expect((await lastSaved()).descriptors[1]!.look_fors).toEqual([expect.objectContaining({ label: 'Reaches most students', key: 'A' })]);
  });

  it('fills an empty NESA number from the teacher’s earlier observation', async () => {
    const earlier = { ...base(), id: 'obs_earlier-0001', teacher: { ...base().teacher, nesa_number: '1234567', email: 'sam@example.edu' } };
    api.listObservations.mockResolvedValue([{ id: 'obs_earlier-0001' }]);
    api.getObservation.mockImplementation(async (id: string) => (id === 'obs_earlier-0001' ? earlier : current));
    const current = base();
    ws = mountObservationWorkspace(host, {
      document, observationId: current.id, phase: 'planning', meetingId: MEETING_PLAN, meetingDate: '2026-11-16',
      openMeeting: vi.fn(), makeLinkedMeeting: vi.fn(), onUnlink: vi.fn()
    });
    await flush(8);
    expect((host.querySelector('input[name="teacher-nesa_number"]') as HTMLInputElement).value).toBe('1234567');
    expect((host.querySelector('input[name="teacher-school"]') as HTMLInputElement).value).toBe('Riverbend High');
  });
});

describe('observing', () => {
  it('logs from the keyboard with the right descriptor, look-for and kind', async () => {
    const obs = startClock(planned(), T0);
    const root = await mount(obs, 'observing', MEETING_OBS);
    key('2');
    expect(root.querySelector('.obs-key--d[data-code="5.2.2"]')!.getAttribute('aria-pressed')).toBe('true');
    key('s');
    key('>');
    key('Enter');
    const note = root.querySelector('[data-part="obs-note"]') as HTMLInputElement;
    expect(document.activeElement).toBe(note);
    note.value = 'Two rewrote their first line';
    key('Enter', note);
    const line = (await lastSaved()).log.at(-1)!;
    const lf = obs.descriptors[1]!.look_fors[1]!;
    expect(line).toMatchObject({ descriptor: '5.2.2', look_for: lf.id, kind: 'next', text: 'Two rewrote their first line' });
    // Look-for clears, kind stays.
    expect(root.querySelector('.obs-key--look[aria-pressed="true"]')).toBeNull();
    expect(root.querySelector('.obs-key--kind[data-kind="next"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-part="obs-log"] .obs-entry')!.textContent).toContain('Two rewrote');
  });

  it('ignores quick keys while typing in another field', async () => {
    const root = await mount(planned(), 'observing', MEETING_OBS);
    const other = document.createElement('textarea');
    document.body.append(other);
    other.focus();
    key('1', other);
    key('+', other);
    expect(root.querySelector('.obs-key--d[aria-pressed="true"]')).toBeNull();
    // Keys stop once the workspace is gone.
    ws!.destroy();
    ws = null;
    expect(() => key('1')).not.toThrow();
  });

  it('shows the suggestion until a decision is clicked, then stores it', async () => {
    let obs = planned();
    obs = logEntry(obs, { descriptor: '3.5.2', kind: 'strength', text: 'Two-step instructions' }, T0);
    const root = await mount(obs, 'observing', MEETING_OBS);
    const tallyRow = root.querySelector('[data-part="obs-tally"] [data-code="3.5.2"]') as HTMLElement;
    expect(tallyRow.querySelector('[data-decision="observed"]')!.classList.contains('is-suggested')).toBe(true);
    (tallyRow.querySelector('[data-decision="partial"]') as HTMLButtonElement).click();
    expect((await lastSaved()).write_up['3.5.2']!.decision).toBe('partial');
    // The write-up table's control follows.
    const tableBtn = root.querySelector('[data-part="obs-writeup"] [data-code="3.5.2"] [data-decision="partial"]')!;
    expect(tableBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('fills the write-up from Planning before anything is logged', async () => {
    let obs = planned();
    obs = { ...obs, descriptors: obs.descriptors.map((d) => d.code === '3.5.2' ? { ...d, demonstrate: 'Chunk the instructions', planned_impact: 'Everyone starts quickly' } : d) };
    const root = await mount(obs, 'observing', MEETING_OBS);
    const cell = (code: string, k: string) => (root.querySelector(`tr[data-code="${code}"] textarea[data-cell="${k}"]`) as HTMLTextAreaElement).value;
    expect(cell('3.5.2', 'practice')).toBe('Planned: Chunk the instructions.\nLook-fors: Instructions chunked; Checks before release.');
    expect(cell('3.5.2', 'strengths')).toBe('Planned impact: Everyone starts quickly.');
    expect(cell('5.2.2', 'practice')).toBe('Look-fors: Specific to criteria; Student acts on it.');
  });

  it('sets the lesson start by hand and retimes the log', async () => {
    const now = Date.now();
    const start = new Date(now - 30 * 60_000);
    start.setSeconds(0, 0);
    const lineAt = start.getTime() + 12 * 60_000 + 30_000;
    const obs = logEntry(planned(), { descriptor: '3.5.2', kind: 'strength', text: 'Chunked instructions' }, lineAt);
    const root = await mount(obs, 'observing', MEETING_OBS);
    const input = root.querySelector('[data-part="obs-start-time"]') as HTMLInputElement;
    input.value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    (root.querySelector('[data-part="obs-start-set"]') as HTMLButtonElement).click();
    const saved = await lastSaved();
    expect(saved.clock.started_at).toBe(start.toISOString());
    expect(saved.log[0].clock).toBe('12:30');
    expect(root.querySelector('[data-part="obs-clock"]')!.textContent).toContain('Lesson running');
    expect(root.textContent).toContain('12:30');
    expect((root.querySelector('tr[data-code="3.5.2"] textarea[data-cell="practice"]') as HTMLTextAreaElement).value).toContain('12:30 Chunked instructions');
  });

  it('edits a whole log line and adds a missed one', async () => {
    let obs = startClock(planned(), T0);
    obs = logEntry(obs, { descriptor: '3.5.2', kind: 'strength', text: 'Chunked instructions' }, T0 + 60_000);
    const root = await mount(obs, 'observing', MEETING_OBS);
    (root.querySelector('[data-part="obs-log-edit"]') as HTMLButtonElement).click();
    const form = root.querySelector('[data-part="obs-log"] [data-part="obs-lineform"]') as HTMLElement;
    const field = (f: Element, k: string) => f.querySelector(`[data-field="${k}"]`) as HTMLInputElement & HTMLSelectElement;
    field(form, 'clock').value = '4:00';
    field(form, 'descriptor').value = '5.2.2';
    field(form, 'descriptor').dispatchEvent(new Event('change'));
    field(form, 'kind').value = 'next';
    field(form, 'text').value = 'Name the criterion';
    (form.querySelector('[data-part="obs-line-save"]') as HTMLButtonElement).click();
    let saved = await lastSaved();
    expect(saved.log[0]).toMatchObject({ clock: '04:00', descriptor: '5.2.2', kind: 'next', text: 'Name the criterion' });
    expect(root.querySelector('[data-part="obs-log"]')!.textContent).toContain('04:00');

    (root.querySelector('[data-part="obs-log-add"]') as HTMLButtonElement).click();
    const add = root.querySelector('.obs-log__addhost [data-part="obs-lineform"]') as HTMLElement;
    field(add, 'clock').value = '02:15';
    field(add, 'kind').value = 'transition';
    field(add, 'kind').dispatchEvent(new Event('change'));
    field(add, 'text').value = 'Into pairs';
    (add.querySelector('[data-part="obs-line-save"]') as HTMLButtonElement).click();
    saved = await lastSaved();
    expect(saved.log.map((l) => `${l.clock} ${l.text}`)).toEqual(['02:15 Into pairs', '04:00 Name the criterion']);
    expect(root.querySelector('.obs-log__addhost')!.childElementCount).toBe(0);
  });

  it('keeps extras off the report table, lists them apart, and lets a next step stop counting as partial', async () => {
    let obs = planned();
    const r = addDescriptor(obs, '6.3.2', { extra: true });
    if (!r.ok) throw new Error(r.reason);
    obs = startClock(r.observation, T0);
    obs = logEntry(obs, { descriptor: '6.3.2', kind: 'strength', text: 'Acted on mentor feedback' }, T0 + 60_000);
    obs = logEntry(obs, { descriptor: '3.5.2', kind: 'next', text: 'Pause for questions' }, T0 + 90_000);
    const root = await mount(obs, 'observing', MEETING_OBS);
    expect(root.querySelector('[data-part="obs-writeup"] tr[data-code="6.3.2"]')).toBeNull();
    const extra = root.querySelector('[data-part="obs-extras"] [data-code="6.3.2"]') as HTMLElement;
    expect((extra.querySelector('textarea[data-cell="practice"]') as HTMLTextAreaElement).value).toContain('Acted on mentor feedback');
    const suggested = () => root.querySelector('[data-part="obs-tally"] [data-code="3.5.2"] .is-suggested')?.getAttribute('data-decision');
    expect(suggested()).toBe('partial');
    const box = root.querySelector('[data-part="obs-counts-partial"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect((await lastSaved()).log.find((l) => l.kind === 'next')!.counts_partial).toBe(false);
    expect(suggested()).toBeUndefined();
  });

  it('says what Gather did, or why there was nothing', async () => {
    const root = await mount(planned(), 'observing', MEETING_OBS);
    const gather = root.querySelector('[data-part="obs-gather"]') as HTMLButtonElement;
    const msg = () => root.querySelector('[data-part="obs-gather-msg"]')!.textContent;
    gather.click();
    await flush();
    expect(msg()).toMatch(/^Nothing to gather yet/);
    const obs = logEntry(planned(), { descriptor: '3.5.2', kind: 'strength', text: 'Chunked' }, T0);
    ws?.destroy();
    host.replaceChildren();
    const r2 = await mount({ ...obs, write_up: {} }, 'observing', MEETING_OBS);
    (r2.querySelector('[data-part="obs-gather"]') as HTMLButtonElement).click();
    await flush();
    expect(r2.querySelector('[data-part="obs-gather-msg"]')!.textContent).toBe('Already up to date.');
  });

  it('gathers paragraphs from both meetings’ Notes that name a descriptor, reading them fresh', async () => {
    const obs = planned();
    const notesOf: Record<string, unknown[]> = {
      [MEETING_PLAN]: [{ block_type: 'rich_text', content: { html: '<p>3.5.2 - short steps on the board</p><p>General chat</p>' } }],
      [MEETING_OBS]: [{ block_type: 'rich_text', content: { html: '<p>Clear routine at the door.</p><p>3.5.2 and 5.2.2: checked each pair understood.</p>' } }]
    };
    meetings.getMeeting.mockImplementation(async (id: string) => ({ meeting: { scheduled_start: '2026-11-18T23:00:00.000Z', time_zone: 'Australia/Sydney', blocks: notesOf[id] ?? [] } }));
    const root = await mount(obs, 'observing', MEETING_OBS);
    const cell = (code: string) => (root.querySelector(`tr[data-code="${code}"] textarea[data-cell="practice"]`) as HTMLTextAreaElement).value;
    expect(cell('3.5.2')).toContain('From Planning notes: 3.5.2 - short steps on the board');
    expect(cell('3.5.2')).toContain('3.5.2 and 5.2.2: checked each pair understood.');
    expect(cell('5.2.2')).toContain('3.5.2 and 5.2.2: checked each pair understood.');
    expect(cell('3.5.2')).not.toContain('Clear routine');
    // Notes typed since the page opened come in when Gather is pressed.
    notesOf[MEETING_OBS] = [{ block_type: 'rich_text', content: { html: '<p>5.2.2 named the criterion out loud</p>' } }];
    (root.querySelector('[data-part="obs-gather"]') as HTMLButtonElement).click();
    await flush();
    expect(cell('5.2.2')).toContain('5.2.2 named the criterion out loud');
    expect(meetings.getMeeting).toHaveBeenCalledWith(MEETING_OBS, { fresh: true });
  });

  it('gathers from the log into cells Adam has not edited', async () => {
    let obs = planned();
    obs = logEntry(obs, { descriptor: '3.5.2', kind: 'strength', text: 'Chunked instructions' }, T0);
    obs = logEntry(obs, { descriptor: '5.2.2', kind: 'strength', text: 'Named the criterion' }, T0);
    obs = { ...obs, write_up: { '3.5.2': { practice: 'My own words', strengths: '', decision: null, comments: '', edited: ['practice'] } } };
    const root = await mount(obs, 'observing', MEETING_OBS);
    (root.querySelector('[data-part="obs-gather"]') as HTMLButtonElement).click();
    const cell = (code: string, k: string) => (root.querySelector(`[data-part="obs-writeup"] tr[data-code="${code}"] textarea[data-cell="${k}"]`) as HTMLTextAreaElement).value;
    expect(cell('3.5.2', 'practice')).toBe('My own words');
    expect(cell('3.5.2', 'strengths')).toBe('Chunked instructions.');
    expect(cell('5.2.2', 'practice')).toContain('Named the criterion');
    // Editing a cell marks it edited.
    const ta = root.querySelector('tr[data-code="5.2.2"] textarea[data-cell="strengths"]') as HTMLTextAreaElement;
    ta.value = 'Specific feedback';
    ta.dispatchEvent(new Event('input'));
    (root.querySelector('[data-part="obs-gather"]') as HTMLButtonElement).click();
    expect((await lastSaved()).write_up['5.2.2']).toMatchObject({ strengths: 'Specific feedback', edited: ['strengths'] });
  });
});

describe('reflecting', () => {
  it('drafts feedback by decision and lets Adam mark the observation done', async () => {
    let obs = planned();
    obs = logEntry(obs, { descriptor: '5.2.2', kind: 'next', text: 'Reach more of the class' }, T0);
    obs = {
      ...obs,
      write_up: {
        '3.5.2': { practice: '', strengths: 'Instructions were chunked.', decision: 'observed', comments: '', edited: [] },
        '5.2.2': { practice: '', strengths: 'Feedback was specific.\nNext step: Reach more of the class.', decision: 'partial', comments: '', edited: [] }
      }
    };
    const root = await mount(obs, 'reflecting');
    const feedback = (code: string) => (root.querySelector(`.obs-refl[data-code="${code}"] textarea[data-cell="feedback"]`) as HTMLTextAreaElement).value;
    expect(feedback('3.5.2')).toBe('Instructions were chunked.');
    expect(feedback('5.2.2')).toBe('Feedback was specific.\n\nTo develop: Reach more of the class.');
    expect(root.querySelector('.obs-refl[data-code="5.2.2"] [data-part="obs-decision-pill"]')!.textContent).toBe('Partially observed');
    (root.querySelector('[data-part="obs-mark-done"]') as HTMLButtonElement).click();
    expect((await lastSaved()).status).toBe('done');
    expect(root.querySelector('[data-part="obs-done"]')).not.toBeNull();
    (root.querySelector('[data-part="obs-reopen"]') as HTMLButtonElement).click();
    expect((await lastSaved()).status).toBe('open');
  });
});

describe('export', () => {
  it('lays out four pages with every template heading and question once', () => {
    const report = openObservationReport(document, planned());
    const overlay = document.querySelector('[data-part="obs-report"]') as HTMLElement;
    expect(overlay.querySelectorAll('.obs-page')).toHaveLength(4);
    const text = overlay.textContent ?? '';
    const once = (s: string) => text.split(s).length - 1;
    const questions = [
      NESA.intro, NESA.phases.planning.about, NESA.phases.observing.about, NESA.phases.reflecting.about,
      NESA.p1.descriptors.which, NESA.p1.descriptors.why, NESA.p1.descriptors.practice,
      NESA.p1.strategies.demonstrate, NESA.p1.strategies.allStudents, NESA.p1.strategies.lesson, NESA.p1.strategies.syllabus,
      NESA.p1.impact.planned, NESA.p1.impact.howKnow, NESA.p1.impact.measure,
      ...NESA.p2.practiceQs, NESA.p2.strengthsQ, NESA.p2.decisionQ,
      ...NESA.p3.teacherQs, NESA.p3.feedbackShown, NESA.p3.feedbackAdvice,
      NESA.p3.teacherSig, NESA.p3.supervisorSig, NESA.teacherDetails, NESA.supervisorDetails
    ];
    for (const q of questions) expect(once(q), q).toBe(1);
    const heads = [...overlay.querySelectorAll('.obs-r-head')].map((n) => n.textContent);
    expect(heads).toEqual([
      'Standard Descriptors', 'Teaching and learning strategies', 'Impact of practice',
      'Standard Descriptor', 'Teaching practice', 'Observation Strengths', 'Record of decision against the Standard Descriptor',
      'Standard Descriptor', 'Teacher’s reflection', 'Accreditation Supervisor’s feedback'
    ]);
    expect(overlay.querySelectorAll('.obs-page--landscape')).toHaveLength(3);
    report.close();
    expect(document.querySelector('[data-part="obs-report"]')).toBeNull();
  });
});

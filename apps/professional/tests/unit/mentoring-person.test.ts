import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mentorship } from '@/api/mentorships';
import type { DirectoryPersonRow } from '@/api/people-directory';
import type { MeetingRecord } from '@/domain/types';

vi.mock('@/api/people-directory', () => ({
  fetchPeopleDirectory: vi.fn(),
  fetchPeopleDirectorySnapshot: vi.fn(),
  peekPeopleDirectory: vi.fn(),
  fetchPersonLedger: vi.fn()
}));
vi.mock('@/api/meetings', () => ({ listMeetings: vi.fn() }));
vi.mock('@/api/universal-links', () => ({ listUniversalLinksForEntities: vi.fn() }));
vi.mock('@/api/network-ecology', () => ({ fetchSelfPerson: vi.fn() }));
vi.mock('@/api/person-tasks', () => ({ loadPersonTasks: vi.fn(), addPersonTask: vi.fn(), setPersonTaskDone: vi.fn() }));
vi.mock('@/api/mentorships', () => ({
  listMentorships: vi.fn(),
  getMentorshipForPerson: vi.fn(),
  createMentorship: vi.fn(),
  updateMentorship: vi.fn(),
  loadMentorshipShare: vi.fn(),
  publishMentorshipShare: vi.fn(),
  stopMentorshipShare: vi.fn()
}));
vi.mock('@/api/organisations-directory', () => ({
  fetchCrestImage: vi.fn(async () => null),
  fetchCrestRefs: vi.fn(async () => ({ refs: [] })),
  fetchOrgCrestUrl: vi.fn(async () => ({ url: null }))
}));
vi.mock('@/guides/share-sheet', () => ({ sheetUrl: (token: string) => `https://class.example/s/sheets/${token}` }));

interface StubPage {
  blocks: unknown[];
  editable: boolean;
  save: (blocks: unknown[]) => Promise<void>;
}
const pages: StubPage[] = [];
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn(
    (host: HTMLElement, options: { blocks: unknown[]; editable?: boolean; onSave: (blocks: unknown[]) => Promise<void> }) => {
      const page: StubPage = { blocks: options.blocks, editable: options.editable !== false, save: options.onSave };
      pages.push(page);
      host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
      return { flush: async () => {}, current: () => page.blocks, append: () => {}, dispose: () => {} };
    }
  )
}));

import {
  createMentorship,
  getMentorshipForPerson,
  loadMentorshipShare,
  publishMentorshipShare,
  updateMentorship
} from '@/api/mentorships';
import { listMeetings } from '@/api/meetings';
import { fetchSelfPerson } from '@/api/network-ecology';
import { fetchPeopleDirectory, fetchPeopleDirectorySnapshot, fetchPersonLedger, peekPeopleDirectory } from '@/api/people-directory';
import { addPersonTask, loadPersonTasks, setPersonTaskDone } from '@/api/person-tasks';
import { listUniversalLinksForEntities } from '@/api/universal-links';
import { localDay, mentoringLeftOffLine, orderSessions, renderMentoringPersonView } from '@/views/mentoring-person';

const NOW = new Date('2026-10-28T09:00:00.000Z');
const ID = 'person_00000000-0000-4000-8000-0000000000a1';
const REF = `shared:person:${ID}`;
const ORG = 'shared:organisation:organisation_00000000-0000-4000-8000-0000000000d1';

function row(extra: Partial<DirectoryPersonRow> = {}): DirectoryPersonRow {
  return {
    id: ID,
    ref: REF,
    display_name: 'Sam Lee',
    initials: 'SL',
    role_line: '',
    relationship_roles: [{ role: 'mentee', label: 'Accreditation', current: true }],
    job_title: 'English teacher',
    organisation: { ref: ORG, display_name: 'Tallowwood College', monogram: 'TC', logo_key: null, current: true },
    organisations: [{ ref: ORG, display_name: 'Tallowwood College', monogram: 'TC', logo_key: null, current: true }],
    warmth: 50,
    warmth_band: 'warm',
    relationship_state: 'steady',
    relationship_reasons: [],
    open_item_count: 0,
    you_owe_count: 0,
    they_owe_count: 0,
    next_label: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

function meeting(id: string, start: string, title: string): MeetingRecord {
  return {
    schema_version: 1,
    id,
    title,
    scheduled_start: start,
    scheduled_end: start,
    time_zone: 'Australia/Sydney',
    location_text: null,
    agenda: null,
    notes: null,
    state: 'scheduled',
    occurrence_history: [],
    created_at: start,
    updated_at: start
  } as MeetingRecord;
}

function record(extra: Partial<Mentorship> = {}): Mentorship {
  return {
    schema_version: 1,
    id: 'mentorship_1',
    person_ref: REF,
    kind: 'accreditation',
    label: null,
    organisation_ref: ORG,
    focus: 'Proficient accreditation',
    status: 'active',
    started_on: '2026-02-03',
    completed_on: null,
    outcome: null,
    blocks: [{ id: 'b1' }],
    shared_blocks: [{ id: 's1' }],
    created_at: '2026-02-03T00:00:00.000Z',
    updated_at: '2026-02-03T00:00:00.000Z',
    ...extra
  };
}

function link(target: string, label = ''): { link: never; endpoint: { ref: string; kind: string; display_label: string }; direction: 'incoming' } {
  return { link: { id: `l_${target}` } as never, endpoint: { ref: target, kind: 'x', display_label: label }, direction: 'incoming' };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function render(): Promise<HTMLElement> {
  const canvas = document.createElement('main');
  document.body.append(canvas);
  await renderMentoringPersonView(canvas, ID, { now: () => NOW });
  await settle();
  return canvas;
}

function menuItem(canvas: HTMLElement, label: string): HTMLButtonElement {
  canvas.querySelector<HTMLButtonElement>('[data-part="mentoring-menu"] button')!.click();
  return [...canvas.querySelectorAll<HTMLButtonElement>('[data-part="mentoring-menu"] [role="menuitem"]')].find(
    (item) => item.textContent === label
  )!;
}

describe('mentoring person helpers', () => {
  it('orders sessions with what is booked first, then the latest past one', () => {
    const sessions = [
      { meetingId: 'old', title: '', start: '2026-08-01T00:00:00.000Z' },
      { meetingId: 'recent', title: '', start: '2026-10-20T00:00:00.000Z' },
      { meetingId: 'soon', title: '', start: '2026-11-04T00:00:00.000Z' },
      { meetingId: 'later', title: '', start: '2026-12-01T00:00:00.000Z' }
    ];
    expect(orderSessions(sessions, NOW).map((entry) => entry.meetingId)).toEqual(['soon', 'later', 'recent', 'old']);
  });

  it('says what a publish left off only when something was', () => {
    expect(mentoringLeftOffLine(null)).toBe('');
    expect(mentoringLeftOffLine({ blocks: 0, promise_lines: 0, minutes_sections: 0, voice_unpublished: 0 })).toBe('');
    expect(mentoringLeftOffLine({ blocks: 2, promise_lines: 0, minutes_sections: 0, voice_unpublished: 1 })).toBe(
      'Left off the page: 2 blocks that take answers, 1 voice note you haven’t published.'
    );
  });

  it('reads today as a local calendar day', () => {
    expect(localDay(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05');
  });
});

describe('renderMentoringPersonView', () => {
  beforeEach(() => {
    pages.length = 0;
    vi.mocked(peekPeopleDirectory).mockReturnValue(null);
    vi.mocked(fetchPeopleDirectorySnapshot).mockResolvedValue(null);
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({
      people: [row()],
      organisations: [{ ref: ORG, id: null, display_name: 'Tallowwood College', logo_key: null, monogram: 'TC', current: true }],
      counts: { people: 1, organisations: 1 }
    });
    vi.mocked(listMeetings).mockResolvedValue({
      meetings: [meeting('m_past', '2026-10-20T00:00:00.000Z', 'Observation debrief'), meeting('m_next', '2026-11-04T00:00:00.000Z', 'Evidence check-in')]
    });
    vi.mocked(listUniversalLinksForEntities).mockResolvedValue({
      results: {
        [REF]: {
          outgoing: [],
          incoming: [link('professional:meeting:m_past'), link('professional:meeting:m_next'), link('tasks:task:t1', 'Book observation')]
        }
      }
    });
    vi.mocked(getMentorshipForPerson).mockResolvedValue({ mentorship: record() });
    vi.mocked(updateMentorship).mockImplementation(async (_id, fields) => ({ mentorship: record(fields) }));
    vi.mocked(loadMentorshipShare).mockResolvedValue({ share: null });
    vi.mocked(fetchPersonLedger).mockResolvedValue({
      you_owe: [{ id: 'y1', text: 'Send the template' }],
      they_owe: [{ id: 't1', text: 'Draft the annotation' }],
      you_owe_count: 1,
      they_owe_count: 1,
      open_item_count: 2
    });
    vi.mocked(loadPersonTasks).mockResolvedValue([
      { id: 't1', title: 'Book observation', done: false, due: '2026-11-24', href: '/tasks/#/task/t1' },
      { id: 't0', title: 'Old task', done: true, due: null, href: '/tasks/#/task/t0' }
    ]);
    vi.mocked(fetchSelfPerson).mockResolvedValue({ self: null, workplaces: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it('shows the badge, the counts, sessions, tasks and open items for one person', async () => {
    const canvas = await render();

    const hero = canvas.querySelector<HTMLElement>('.mentoring-hero')!;
    expect(hero.querySelector('[data-badge="crest"]')?.textContent).toContain('Accreditation mentor');
    expect(hero.textContent).toContain('Active since 03/02/26');
    expect(hero.textContent).toContain('Proficient accreditation');
    expect(hero.querySelector('[data-part="set-type"]')).toBeNull();

    const tiles = [...canvas.querySelectorAll('.mentoring-tile')].map((tile) => tile.textContent);
    expect(tiles[0]).toBe('Sessions2');
    expect(tiles[1]).toContain('20/10/26');
    expect(tiles[2]).toContain('04/11/26');
    expect(tiles[3]).toBe('You owe1They owe 1');

    const sessions = [...canvas.querySelectorAll('[data-part="sessions"] .mentoring-row__title')].map((node) => node.textContent);
    expect(sessions).toEqual(['Evidence check-in', 'Observation debrief']);
    expect(canvas.querySelector('[data-part="sessions"] a[href="#/meeting/m_next"]')).not.toBeNull();

    const tasks = canvas.querySelector<HTMLElement>('[data-part="tasks"]')!;
    expect(tasks.textContent).toContain('1 open');
    expect(tasks.textContent).toContain('Due 24/11/26');
    expect(tasks.textContent).toContain('1 done');

    const items = canvas.querySelector<HTMLElement>('[data-part="open-items"]')!;
    expect(items.textContent).toContain('Send the template');
    expect(items.textContent).toContain('They owe');

    // Private notes and the shared page are two separate block pages.
    expect(pages.map((page) => page.blocks)).toEqual([[{ id: 'b1' }], [{ id: 's1' }]]);
    expect(pages.every((page) => page.editable)).toBe(true);
  });

  it('writes nothing on opening someone with no mentorship, and makes the record on the first save', async () => {
    vi.mocked(getMentorshipForPerson).mockResolvedValue({ mentorship: null });
    vi.mocked(createMentorship).mockResolvedValue({ mentorship: record({ blocks: [], shared_blocks: [], focus: null, started_on: null }) });
    const canvas = await render();

    expect(createMentorship).not.toHaveBeenCalled();
    expect(loadMentorshipShare).not.toHaveBeenCalled();
    expect(canvas.querySelector('[data-part="set-type"]')?.textContent).toBe('Set how you mentor Sam');
    // The relationship label reads as accreditation until a type is saved.
    expect(canvas.querySelector('.mentoring-hero [data-badge="crest"]')).not.toBeNull();

    await pages[0]!.save([{ id: 'note' }]);
    expect(createMentorship).toHaveBeenCalledWith({ person_ref: REF, kind: 'accreditation', label: null, organisation_ref: ORG });
    expect(updateMentorship).toHaveBeenCalledWith('mentorship_1', { blocks: [{ id: 'note' }] });
  });

  it('saves notes and shared blocks one after the other, each to its own field', async () => {
    const order: string[] = [];
    vi.mocked(updateMentorship).mockImplementation(async (_id, fields) => {
      order.push(`start ${Object.keys(fields)[0]}`);
      await settle();
      order.push(`end ${Object.keys(fields)[0]}`);
      return { mentorship: record(fields) };
    });
    await render();
    await Promise.all([pages[0]!.save([{ id: 'n' }]), pages[1]!.save([{ id: 's' }])]);
    expect(order).toEqual(['start blocks', 'end blocks', 'start shared_blocks', 'end shared_blocks']);
  });

  it('makes the read-only link from the shared blocks, then marks later edits as unsent', async () => {
    vi.mocked(publishMentorshipShare).mockResolvedValue({
      share: { token: 'a'.repeat(48), created_at: '2026-10-28T09:00:00.000Z', updated_at: '2026-10-28T09:00:00.000Z' },
      left_off: { blocks: 1, promise_lines: 0, minutes_sections: 0, voice_unpublished: 0 }
    });
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-part="share-create"]')!.click();
    await settle();
    await settle();

    expect(publishMentorshipShare).toHaveBeenCalledWith('mentorship_1');
    const share = canvas.querySelector<HTMLElement>('.mentoring-share')!;
    expect(share.querySelector('code')?.textContent).toBe(`https://class.example/s/sheets/${'a'.repeat(48)}`);
    expect(share.querySelector('[data-part="share-status"]')?.textContent).toBe('Link is on · updated 28/10/26');
    expect(share.textContent).toContain('Left off the page: 1 block that takes answers.');

    await pages[1]!.save([{ id: 's1' }, { id: 's2' }]);
    expect(canvas.querySelector('[data-part="share-status"]')?.textContent).toBe('You have changes they can’t see yet');
  });

  it('asks for a block before making a link to an empty page', async () => {
    vi.mocked(getMentorshipForPerson).mockResolvedValue({ mentorship: record({ shared_blocks: [] }) });
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-part="share-create"]')!.click();
    await settle();
    expect(publishMentorshipShare).not.toHaveBeenCalled();
    expect(canvas.querySelector('.mentoring-share__status')?.textContent).toBe('Add a block above first, then make the link.');
  });

  it('changes the mentoring type from the details dialog', async () => {
    const canvas = await render();
    menuItem(canvas, 'Edit details').click();
    const dialog = document.querySelector<HTMLElement>('.mentoring-dialog')!;
    expect(dialog.querySelector('h2')?.textContent).toBe('How are you mentoring Sam?');
    const crestField = dialog.querySelector('select')!.closest('label')!;
    expect(crestField.hidden).toBe(false);

    dialog.querySelector<HTMLInputElement>('input[value="halt_lead"]')!.click();
    expect(crestField.hidden).toBe(true);
    dialog.querySelector<HTMLButtonElement>('[data-part="details-save"]')!.click();
    await settle();

    expect(updateMentorship).toHaveBeenCalledWith('mentorship_1', {
      kind: 'halt_lead',
      label: null,
      organisation_ref: null,
      focus: 'Proficient accreditation',
      started_on: '2026-02-03'
    });
    expect(document.querySelector('.mentoring-dialog')).toBeNull();
    expect(canvas.querySelector('.mentoring-hero [data-badge="halt"]')?.getAttribute('aria-label')).toBe('NSW HALT: Lead');
  });

  it('completes a mentorship by changing its status only, and the page turns read-only', async () => {
    const canvas = await render();
    menuItem(canvas, 'Complete mentoring').click();
    const dialog = document.querySelector<HTMLElement>('.mentoring-dialog')!;
    expect(dialog.textContent).toContain('Everything is kept');
    dialog.querySelector<HTMLInputElement>('input[type="date"]')!.value = '2026-11-12';
    dialog.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'Proficient achieved';

    const done = record({ status: 'completed', completed_on: '2026-11-12', outcome: 'Proficient achieved' });
    vi.mocked(getMentorshipForPerson).mockResolvedValue({ mentorship: done });
    pages.length = 0;
    dialog.querySelector<HTMLButtonElement>('[data-part="complete-confirm"]')!.click();
    await vi.waitFor(() => expect(canvas.querySelector('.mentoring-hero--completed')).not.toBeNull());
    await settle();

    expect(updateMentorship).toHaveBeenCalledTimes(1);
    expect(updateMentorship).toHaveBeenCalledWith('mentorship_1', {
      status: 'completed',
      completed_on: '2026-11-12',
      outcome: 'Proficient achieved'
    });
    const hero = canvas.querySelector<HTMLElement>('.mentoring-hero')!;
    expect(hero.textContent).toContain('Completed 12/11/26');
    expect(hero.textContent).toContain('Proficient achieved');
    expect(hero.textContent).not.toContain('Book a session');
    // The notes and shared blocks are still there, and no longer editable.
    expect(pages.map((page) => page.blocks)).toEqual([[{ id: 'b1' }], [{ id: 's1' }]]);
    expect(pages.some((page) => page.editable)).toBe(false);
    expect(canvas.querySelector('[data-part="task-add"]')).toBeNull();

    // Reopening clears the finish and nothing else.
    vi.mocked(getMentorshipForPerson).mockResolvedValue({ mentorship: record() });
    menuItem(canvas, 'Reopen mentoring').click();
    await vi.waitFor(() => expect(canvas.querySelector('.mentoring-hero--completed')).toBeNull());
    expect(updateMentorship).toHaveBeenLastCalledWith('mentorship_1', { status: 'active', completed_on: null, outcome: null });
  });

  it('adds a task for the person and ticks one off', async () => {
    vi.mocked(addPersonTask).mockResolvedValue({ id: 't2', title: 'Share the rubric', done: false, due: null, href: '/tasks/#/task/t2' });
    vi.mocked(setPersonTaskDone).mockResolvedValue();
    const canvas = await render();
    const box = () => canvas.querySelector<HTMLElement>('[data-part="tasks"]')!;

    box().querySelector<HTMLButtonElement>('[data-part="task-add"]')!.click();
    const form = box().querySelector('form')!;
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(form.querySelector('.hub-field__error')?.textContent).toBe('Say what the task is.');
    expect(addPersonTask).not.toHaveBeenCalled();

    form.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'Share the rubric';
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle();
    expect(addPersonTask).toHaveBeenCalledWith(REF, { title: 'Share the rubric', due: null });
    expect(box().textContent).toContain('2 open');

    box().querySelector<HTMLButtonElement>('[data-task-id="t1"] [data-part="task-tick"]')!.click();
    await settle();
    expect(setPersonTaskDone).toHaveBeenCalledWith('t1');
    expect(box().textContent).toContain('1 open');
    expect(box().textContent).toContain('2 done');
  });

  it('keeps the page up when tasks or open items fail to load', async () => {
    vi.mocked(fetchPersonLedger).mockRejectedValue(new Error('down'));
    vi.mocked(loadPersonTasks).mockRejectedValue(new Error('down'));
    const canvas = await render();
    expect(canvas.querySelector('.mentoring-hero')).not.toBeNull();
    expect(canvas.querySelector('[data-part="tasks"]')?.textContent).toContain('Tasks could not load');
    expect(canvas.querySelector('[data-part="open-items"]')?.textContent).toContain('Open items could not load');
  });

  it('says so when the person is not in People', async () => {
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({ people: [], organisations: [], counts: { people: 0, organisations: 0 } });
    const canvas = await render();
    expect(canvas.textContent).toContain('This person isn’t in People.');
    expect(canvas.querySelector('a[href="#/mentoring"]')).not.toBeNull();
  });
});

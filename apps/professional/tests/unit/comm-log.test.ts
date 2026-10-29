import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commLogBody,
  followUpDue,
  liveMentions,
  occurredAt,
  saveSummary,
  subjectFrom,
  summaryFrom
} from '@/lib/comm-log';
import { matchPeople, renderCommLog } from '@/views/comm-log';
import type { DirectoryPersonRow } from '@/api/people-directory';

const PARENT = 'shared:person:person_00000000-0000-4000-8000-000000000001';
const STUDENT = 'shared:person:person_00000000-0000-4000-8000-000000000002';
const COMM_ID = 'communication_00000000-0000-4000-8000-000000000010';

function row(ref: string, name: string, extra: Partial<DirectoryPersonRow> = {}): DirectoryPersonRow {
  return {
    id: ref.split(':')[2]!,
    ref,
    display_name: name,
    initials: name.split(' ').map((p) => p[0]).join(''),
    role_line: 'Colleague',
    relationship_roles: [],
    organisation: null,
    organisations: [],
    warmth: 0,
    warmth_band: 'warm',
    relationship_state: 'active',
    relationship_reasons: [],
    open_item_count: 0,
    you_owe_count: 0,
    they_owe_count: 0,
    next_label: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...extra
  };
}

describe('comm-log helpers', () => {
  // Thursday 29 Oct 2026, 3:21 pm local.
  const now = new Date(2026, 9, 29, 15, 21);

  it('takes the subject from the first line, without bullets or @', () => {
    expect(subjectFrom('- Rang about @Theo Example making the semi-finals\n- Mum supportive')).toBe(
      'Rang about Theo Example making the semi-finals'
    );
    expect(subjectFrom('')).toBe('');
    expect(subjectFrom(`- ${'word '.repeat(30)}`).endsWith('…')).toBe(true);
  });

  it('stores notes as one bullet per line', () => {
    expect(summaryFrom('- one\n\n• two\nthree')).toBe('- one\n- two\n- three');
    expect(summaryFrom('- spoke to @Theo Example, cc a@b.com')).toBe('- spoke to Theo Example, cc a@b.com');
  });

  it('works out when it happened', () => {
    expect(occurredAt('now', now).getTime()).toBe(now.getTime());
    const earlier = occurredAt('earlier', now, '09:05');
    expect([earlier.getDate(), earlier.getHours(), earlier.getMinutes()]).toEqual([29, 9, 5]);
    const yesterday = occurredAt('yesterday', now, '16:00');
    expect([yesterday.getDate(), yesterday.getHours()]).toEqual([28, 16]);
    expect(occurredAt('pick', now, '2026-10-27T16:10').getDate()).toBe(27);
  });

  it('picks follow-up dates', () => {
    expect(followUpDue('none', now)).toBeNull();
    expect(followUpDue('tomorrow', now)).toBe('2026-10-30');
    expect(followUpDue('friday', now)).toBe('2026-10-30');
    expect(followUpDue('friday', new Date(2026, 9, 30))).toBe('2026-11-06');
    expect(followUpDue('next_week', now)).toBe('2026-11-02');
    expect(followUpDue('pick', now, '2026-12-01')).toBe('2026-12-01');
  });

  it('keeps only mentions still in the notes', () => {
    const mentions = [
      { ref: STUDENT, name: 'Theo Example' },
      { ref: 'shared:person:x', name: 'Gone Person' },
      { ref: STUDENT, name: 'Theo Example' }
    ];
    expect(liveMentions('about @Theo Example', mentions)).toEqual([{ ref: STUDENT, name: 'Theo Example' }]);
  });

  it('builds the communication: verb → direction and channel, recipient and about links', () => {
    const body = commLogBody({
      verbKey: 'they_called',
      personRef: PARENT,
      at: now,
      notes: '- Rang about @Theo Example',
      subject: '',
      aboutRefs: [STUDENT, PARENT, STUDENT]
    });
    expect(body).toMatchObject({
      direction: 'inbound',
      channel: 'phone',
      subject: 'Rang about Theo Example',
      summary: '- Rang about Theo Example',
      links: [
        { relationship_type: 'recipient', target_ref: PARENT },
        { relationship_type: 'about_person', target_ref: STUDENT }
      ]
    });
    expect(body.links).toHaveLength(2);
  });

  it('says what Save will do', () => {
    expect(saveSummary({ verbKey: 'i_called', todoCount: 0, followUpDue: null })).toBe('Saves the call.');
    expect(saveSummary({ verbKey: 'we_met', todoCount: 2, followUpDue: '2026-10-30' })).toBe(
      'Saves the meeting, 2 to-dos and a follow-up on Fri 30 Oct.'
    );
  });

  it('matches people by the start of each name word', () => {
    const rows = [row(PARENT, 'Dana Example'), row(STUDENT, 'Theo Example', { person_type: 'student' })];
    expect(matchPeople(rows, 'ex').map((r) => r.display_name)).toEqual(['Dana Example', 'Theo Example']);
    expect(matchPeople(rows, 'th ex').map((r) => r.display_name)).toEqual(['Theo Example']);
    expect(matchPeople(rows, 'xa')).toEqual([]);
  });
});

describe('renderCommLog', () => {
  const originalFetch = globalThis.fetch;
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];

  beforeEach(() => {
    posts.length = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') posts.push({ url, body: JSON.parse(String(init.body ?? '{}')) });
      if (url.includes('/api/people/directory')) {
        return Response.json({
          ok: true,
          data: {
            people: [row(PARENT, 'Dana Example', { role_line: 'Parent of Theo Example' })],
            students: [row(STUDENT, 'Theo Example', { person_type: 'student' })],
            organisations: [],
            counts: { people: 1, organisations: 0 }
          }
        });
      }
      if (url.includes('/api/entities/overview')) {
        return Response.json({ ok: true, data: { linked_records: { communications: [] } } });
      }
      if (url.includes('/api/people/ledger')) {
        return Response.json({ ok: true, data: { item: { id: 'l1' }, created: true } });
      }
      return Response.json({
        ok: true,
        data: { communication: { id: COMM_ID }, links: [], created: true }
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('picks a person, ticks a line, follows up and saves the call with to-dos', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    const navigate = vi.fn();
    await renderCommLog(canvas, { now: () => new Date(2026, 9, 29, 15, 21), navigate });

    const who = canvas.querySelector<HTMLInputElement>('input[aria-label="Who was it with?"]')!;
    who.value = 'dana';
    who.dispatchEvent(new Event('input'));
    const result = [...canvas.querySelectorAll<HTMLButtonElement>('.comm-log__result')].find((b) =>
      b.textContent?.includes('Dana Example')
    )!;
    result.click();

    expect(canvas.querySelector('.comm-log__sentence')?.textContent).toContain('I called Dana Example just now');

    canvas.querySelector<HTMLButtonElement>('[data-verb="they_called"]')!.click();
    const notes = canvas.querySelector<HTMLTextAreaElement>('textarea[aria-label="What was said"]')!;
    notes.value = '- Theo made the semi-finals\n- Book prep sessions';
    notes.dispatchEvent(new Event('input'));
    expect(canvas.querySelector('.comm-log__subject-value')?.textContent).toBe('Theo made the semi-finals');

    const todo = [...canvas.querySelectorAll<HTMLButtonElement>('.comm-log__todo')].find((b) =>
      b.textContent?.includes('Book prep sessions')
    )!;
    todo.click();
    canvas.querySelector<HTMLButtonElement>('[data-follow="friday"]')!.click();
    expect(canvas.querySelector('.comm-log__sum')?.textContent).toContain(
      'Saves the call, 1 to-do and a follow-up on Fri 30 Oct.'
    );

    canvas.querySelector<HTMLButtonElement>('.comm-log__save')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`#/communication/${COMM_ID}`));

    const comm = posts.find((p) => p.url.includes('/api/communications'))!;
    expect(comm.body).toMatchObject({ direction: 'inbound', channel: 'phone', subject: 'Theo made the semi-finals' });
    const ledger = posts.filter((p) => p.url.includes('/api/people/ledger')).map((p) => p.body);
    expect(ledger).toEqual([
      expect.objectContaining({ person_ref: PARENT, text: 'Book prep sessions', due: '2026-10-30', direction: 'you_owe' }),
      expect.objectContaining({ text: 'Follow up with Dana', due: '2026-10-30' })
    ]);
    canvas.remove();
  });

  it('offers to add someone who is not in People yet', async () => {
    const canvas = document.createElement('div');
    await renderCommLog(canvas);
    const who = canvas.querySelector<HTMLInputElement>('input[aria-label="Who was it with?"]')!;
    who.value = 'Jo Newname';
    who.dispatchEvent(new Event('input'));
    expect(canvas.textContent).toContain('No one called “Jo Newname” in People yet.');
    const add = canvas.querySelector<HTMLButtonElement>('.comm-log__result--add')!;
    expect(add.textContent).toBe('＋ Add Jo Newname');
    add.click();
    expect(canvas.querySelector('.comm-log__add-title')?.textContent).toBe('＋ Add Jo Newname');
  });
});

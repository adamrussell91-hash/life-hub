import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderPeoplePage } from '@/views/people';
import { parseRoute, personRoute, peopleRoute } from '@/app/router';
import { clearScheduleReadCache } from '@/api/schedule-read-cache';

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('people redesign Phase 1 routes', () => {
  it('parses #/people and #/people/<id>', () => {
    expect(parseRoute('#/people')).toEqual({ name: 'people', id: null });
    expect(parseRoute(`#/people/${PERSON_ID}`)).toEqual({ name: 'people', id: PERSON_ID });
  });

  it('builds canonical people routes', () => {
    expect(personRoute(PERSON_ID)).toBe(`#/people/${PERSON_ID}`);
    expect(peopleRoute(null)).toBe('#/people');
    expect(peopleRoute(PERSON_ID, '?sort=az')).toBe(`#/people/${PERSON_ID}?sort=az`);
  });
});

describe('renderPeoplePage (W2 real entry)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/people/directory')) {
          return jsonResponse({
            people: [
              {
                id: PERSON_ID,
                ref: `shared:person:${PERSON_ID}`,
                display_name: 'Isla Emberly',
                initials: 'HM',
                role_line: 'Mentee',
                relationship_roles: [{ role: 'mentee', label: 'Mentee', current: true }],
                organisation: {
                  ref: 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002',
                  display_name: 'Tallowwood College',
                  monogram: 'SAC',
                  logo_key: null,
                  current: true
                },
                organisations: [],
                warmth: 62,
                warmth_band: 'warm',
                relationship_state: 'active',
                relationship_reasons: ['Recent contact'],
                open_item_count: 0,
                you_owe_count: 0,
                they_owe_count: 0,
                next_label: null,
                created_at: '2026-09-01T00:00:00.000Z',
                updated_at: '2026-09-20T00:00:00.000Z'
              }
            ],
            organisations: [],
            counts: { people: 1, organisations: 1 }
          });
        }
        if (url.includes('/api/entities/overview')) {
          return jsonResponse({
            entity: {
              schema_version: 1,
              id: PERSON_ID,
              kind: 'person',
              display_name: 'Isla Emberly',
              sort_name: null,
              aliases: [],
              lifecycle_status: 'active',
              is_self: false,
              retention_reason: null,
              retention_review_at: null,
              created_at: '2026-09-01T00:00:00.000Z',
              updated_at: '2026-09-20T00:00:00.000Z',
              ref: `shared:person:${PERSON_ID}`
            },
            current_relationships: [],
            historical_relationships: [],
            linked_records: { tasks: [], communications: [], meetings: [], events: [], applications: [] },
            timeline: []
          });
        }
        if (url.includes('/api/people/brief')) {
          return jsonResponse({
            header: {
              person: { ref: `shared:person:${PERSON_ID}`, display_name: 'Isla Emberly', href: null },
              role: null,
              organisation: null,
              next_interaction: null
            },
            who_they_are: '',
            open_loops: [
              { ref: 'tasks:task:t1', label: 'Set up mentoring meeting', href: null, status: 'open' }
            ],
            current_shared_work: [],
            mutual_connections: []
          });
        }
        if (url.includes('/api/people/link-proposals')) {
          return jsonResponse({ proposals: [], count: 0 });
        }
        if (url.includes('/api/people/ledger')) {
          return jsonResponse({
            you_owe: [
              {
                id: 'derived:tasks:task:t1',
                text: 'Set up mentoring meeting',
                source_label: 'task',
                derived: true,
                status: 'open'
              }
            ],
            they_owe: [],
            you_owe_count: 1,
            they_owe_count: 0,
            open_item_count: 1
          });
        }
        if (url.includes('/api/people/remember')) {
          return jsonResponse({ facts: [], count: 0 });
        }
        if (url.includes('/api/people/today')) {
          return jsonResponse({
            day_key: '2026-09-28',
            slots: [
              {
                id: 'free:785',
                kind: 'free',
                title: 'Free',
                start_minutes: 785,
                end_minutes: 860,
                start_label: '1:05pm',
                people: [],
                suggested: true,
                suggestion_note: 'You usually meet Henry after lunch'
              }
            ],
            suggestion: {
              slot_id: 'free:785',
              note: 'You usually meet Henry after lunch',
              person_ref: `shared:person:${PERSON_ID}`
            }
          });
        }
        if (url.includes('/api/people/self')) {
          return jsonResponse({
            self: { ref: 'shared:person:person_self', display_name: 'Adam Russell' }
          });
        }
        if (url.includes('/api/people/ask')) {
          return jsonResponse({
            mode: 'ask',
            answer: "I don't know enough about who knows that yet.",
            people: [],
            filter: null,
            source: 'test'
          });
        }
        return jsonResponse({});
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders one People h1 and directory rows as real links', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderPeoplePage(canvas, { selectedId: PERSON_ID });
    const titles = canvas.querySelectorAll('h1');
    expect(titles).toHaveLength(1);
    expect(titles[0]?.textContent).toBe('People');
    const row = canvas.querySelector(`a.people-page__row[href="#/people/${PERSON_ID}"]`);
    expect(row).toBeTruthy();
    // Full record disclosure starts collapsed (V1)
    const full = canvas.querySelector('details.people-pane__full') as HTMLDetailsElement | null;
    expect(full).toBeTruthy();
    expect(full?.open).toBe(false);
  });

  it('shows an editable profile while the directory and optional services are still pending', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const releases: Array<() => void> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/people/directory') || /\/api\/people\/(brief|ledger|remember|link-proposals|today)/.test(url)) {
        await new Promise<void>(resolve => releases.push(resolve));
      }
      return original(input, init);
    });
    const canvas = document.createElement('div');
    document.body.append(canvas);
    const loading = renderPeoplePage(canvas, {selectedId: PERSON_ID});
    try {
      await vi.waitFor(() => expect(canvas.querySelector('.people-pane__name')?.textContent).toBe('Isla Emberly'), {timeout:300});
      canvas.querySelector<HTMLButtonElement>('.people-pane__edit')!.click();
      expect(canvas.querySelector<HTMLFormElement>('form[aria-label="Edit person"]')?.hidden).toBe(false);
      expect(canvas.querySelector('[data-section="ledger"] .people-pane__loading')).toBeTruthy();
    } finally {
      vi.mocked(fetch).mockImplementation(original);
      releases.forEach(release => release());
      await loading;
    }
  });
  it('revalidates the organisation directory on return', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    let updated = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (updated && String(input).includes('/api/people/directory?fresh=1')) {
        const body = await response.json();
        body.data.people[0].organisation = {ref:'shared:organisation:new_org',display_name:'New workplace',monogram:'NW',logo_key:null,current:true};
        body.data.people[0].organisations = [body.data.people[0].organisation];
        return jsonResponse(body.data);
      }
      return response;
    });
    await renderPeoplePage(document.createElement('div'));
    updated = true;
    const canvas = document.createElement('div');
    await renderPeoplePage(canvas);
    expect(canvas.textContent).toContain('New workplace');
  });

  describe('first open of a session', () => {
    const SNAPSHOT_AT = '2026-10-20T03:14:00.000Z';

    function withSnapshot(fresh: (original: () => Promise<Response>) => Promise<Response>) {
      clearScheduleReadCache();
      const original = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/people/directory?snapshot=1')) {
          const body = await (await original(input, init)).json();
          body.data.people[0].display_name = 'Saved Copy';
          return jsonResponse({ ...body.data, as_of: SNAPSHOT_AT });
        }
        if (url.includes('/api/people/directory?fresh=1')) return fresh(() => original(input, init));
        return original(input, init);
      });
    }

    it('paints the saved copy with an as-of note, then swaps in the fresh scan', async () => {
      let release!: () => void;
      withSnapshot(async (load) => {
        await new Promise<void>((resolve) => { release = resolve; });
        return load();
      });
      const canvas = document.createElement('div');
      const loading = renderPeoplePage(canvas);
      try {
        await vi.waitFor(() => expect(canvas.textContent).toContain('Saved Copy'));
        expect(canvas.querySelector('.people-page__count')?.textContent).toMatch(/Updating… \(as of .+\)/);
        release();
        await loading;
        expect(canvas.textContent).toContain('Isla Emberly');
        expect(canvas.textContent).not.toContain('Saved Copy');
        expect(canvas.querySelector('.people-page__count')?.textContent).toBe('1 person · 1 organisation');
      } finally { release?.(); await loading; }
    });

    it('keeps the saved copy when the fresh scan fails', async () => {
      let fail!: () => void;
      withSnapshot(async () => {
        await new Promise<void>((resolve) => { fail = resolve; });
        return new Response(JSON.stringify({ ok: false, error: { code: 'internal_error', message: 'Scan failed', retryable: true } }), { status: 500 });
      });
      const canvas = document.createElement('div');
      const loading = renderPeoplePage(canvas);
      try {
        await vi.waitFor(() => expect(canvas.textContent).toContain('Saved Copy'));
        fail();
        await loading;
        expect(canvas.textContent).toContain('Saved Copy');
        expect(canvas.querySelector('.people-page__count')?.textContent).toMatch(/Couldn't refresh, showing .+/);
      } finally { fail?.(); await loading; }
    });

    it('ignores a saved copy that arrives after the fresh scan', async () => {
      clearScheduleReadCache();
      const original = vi.mocked(fetch).getMockImplementation()!;
      let releaseSnapshot!: () => void;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input).includes('/api/people/directory?snapshot=1')) {
          await new Promise<void>((resolve) => { releaseSnapshot = resolve; });
          return jsonResponse({ people: [], organisations: [], counts: { people: 0, organisations: 0 }, as_of: SNAPSHOT_AT });
        }
        return original(input, init);
      });
      const canvas = document.createElement('div');
      await renderPeoplePage(canvas);
      releaseSnapshot();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(canvas.textContent).toContain('Isla Emberly');
      expect(canvas.querySelector('.people-page__count')?.textContent).toBe('1 person · 1 organisation');
    });
  });

  it('renders the ledger independently and keeps an open edit form when Remember finishes', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('/api/people/remember')) await new Promise<void>(resolve => {release=resolve;});
      return original(input, init);
    });
    const canvas = document.createElement('div');
    const loading = renderPeoplePage(canvas, {selectedId:PERSON_ID});
    try {
      await vi.waitFor(() => expect(canvas.querySelector('[data-section="ledger"]')?.textContent).toContain('Set up mentoring meeting'));
      canvas.querySelector<HTMLButtonElement>('.people-pane__edit')!.click();
      const form = canvas.querySelector<HTMLFormElement>('form[aria-label="Edit person"]')!;
      form.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value = 'Unsaved name';
      release();
      await loading;
      expect(canvas.querySelector('form[aria-label="Edit person"]')).toBe(form);
      expect(form.hidden).toBe(false);
      expect(form.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value).toBe('Unsaved name');
    } finally { release?.(); await loading; }
  });

  it('a successful profile save updates its directory row and organisation group', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    let saved = false;
    const org = {ref:'shared:organisation:new_org',display_name:'New workplace',monogram:'NW',logo_key:null,current:true};
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url=String(input);
      if (init?.method === 'PATCH' && url.includes('/api/entities?')) saved=true;
      const response = await original(input, init);
      if (!saved) return response;
      const body = await response.json();
      if (url.includes('/api/people/directory')) {
        body.data.people[0].display_name='Henry Updated';
        body.data.people[0].organisation=org;
        body.data.people[0].organisations=[org];
      }
      if (url.includes('/api/entities/overview')) {
        body.data.entity.display_name='Henry Updated';
        body.data.current_relationships=[{link:{id:'workplace',relationship_type:'employee_at',status:'current',role:'Teacher',valid_to:null},endpoint:{ref:org.ref,kind:'organisation',display_label:org.display_name},direction:'outgoing'}];
      }
      return jsonResponse(body.data);
    });
    const canvas = document.createElement('div');
    await renderPeoplePage(canvas,{selectedId:PERSON_ID});
    canvas.querySelector<HTMLButtonElement>('.people-pane__edit')!.click();
    const form=canvas.querySelector<HTMLFormElement>('form[aria-label="Edit person"]')!;
    form.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value='Henry Updated';
    form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
    await vi.waitFor(() => {
      expect(canvas.querySelector('.people-page__row-name')?.textContent).toBe('Henry Updated');
      expect(canvas.textContent).toContain('New workplace');
    });
  });

  it('shows late link proposals without replacing an open editor', async () => {
    const original=vi.mocked(fetch).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('/api/people/link-proposals')) {
        await new Promise<void>(resolve => {release=resolve;});
        return jsonResponse({proposals:[{id:'proposal1',chip_label:'New connection',reason:'Linked meeting',status:'pending',person_ref:`shared:person:${PERSON_ID}`}],count:1});
      }
      return original(input,init);
    });
    const canvas=document.createElement('div');
    const loading=renderPeoplePage(canvas,{selectedId:PERSON_ID});
    try {
      await vi.waitFor(() => expect(canvas.querySelector('.people-pane__edit')).toBeTruthy());
      canvas.querySelector<HTMLButtonElement>('.people-pane__edit')!.click();
      const form=canvas.querySelector<HTMLFormElement>('form[aria-label="Edit person"]')!;
      form.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value='Unsaved name';
      release();
      await loading;
      expect(canvas.querySelector('.people-pane__chip--proposal')?.textContent).toContain('New connection');
      expect(canvas.querySelector('form[aria-label="Edit person"]')).toBe(form);
      expect(form.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value).toBe('Unsaved name');
    } finally { release?.(); await loading; }
  });

  it('merging a selected duplicate removes the deleted profile from the pane', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const action = {kind:'twin',remove:{id:PERSON_ID,ref:`shared:person:${PERSON_ID}`,name:'Isla Emberly'},into:[{id:'survivor',ref:'shared:person:survivor',name:'Isla Emberly'}],student:false,links:1,blocked:null};
    let merged=false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url=String(input);
      if (url.includes('/api/entities/admin')) {
        if (JSON.parse(String(init?.body)).action === 'plan_people_dedupe') return jsonResponse({ready:[action],kept:[],unresolved:[]});
        merged=true;
        return jsonResponse({done:[action],failed:[],skipped:[],remaining:[]});
      }
      if (merged && url.includes('/api/people/directory')) return jsonResponse({people:[],organisations:[],counts:{people:0,organisations:0}});
      return original(input,init);
    });
    const canvas=document.createElement('div');
    await renderPeoplePage(canvas,{selectedId:PERSON_ID});
    [...canvas.querySelectorAll('button')].find(button => button.textContent === 'Duplicates')!.click();
    await vi.waitFor(() => expect([...canvas.querySelectorAll('button')].some(button => button.textContent === 'Merge selected')).toBe(true));
    [...canvas.querySelectorAll('button')].find(button => button.textContent === 'Merge selected')!.click();
    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-section="header"] .people-pane__name')).toBeNull();
      expect(canvas.textContent).toContain('Select someone from the directory.');
    });
  });

  it('typing in search filters in place without a hashchange repaint', async () => {
    vi.useFakeTimers();
    try {
      const canvas = document.createElement('div');
      document.body.append(canvas);
      await renderPeoplePage(canvas, {});
      const onHash = vi.fn();
      window.addEventListener('hashchange', onHash);
      const search = canvas.querySelector<HTMLInputElement>('input.people-page__search')!;
      search.value = 'Hen';
      search.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(400);
      await Promise.resolve();
      expect(onHash).not.toHaveBeenCalled();
      expect(location.hash).toContain('q=Hen');
      expect(canvas.querySelector('input.people-page__search')).toBe(search);
      window.removeEventListener('hashchange', onHash);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Edit opens the full person form (identity + organisation/job title/how you know them/notes/LinkedIn)', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderPeoplePage(canvas, { selectedId: PERSON_ID });
    const edit = canvas.querySelector<HTMLButtonElement>('button.people-pane__edit, [aria-label="Edit Isla Emberly"]');
    expect(edit).toBeTruthy();
    const form = canvas.querySelector<HTMLFormElement>('form[aria-label="Edit person"]');
    expect(form).toBeTruthy();
    expect(form?.hidden).toBe(true);
    edit!.click();
    expect(form?.hidden).toBe(false);
    expect(form?.querySelector('input[aria-label="Name"]')).toBeTruthy();
    expect(form?.querySelector('select[aria-label="How you know them"]')).toBeTruthy();
    expect(form?.querySelector('input[aria-label="Job title"]')).toBeTruthy();
    expect(form?.querySelector('textarea[aria-label="Notes"]')).toBeTruthy();
    expect(form?.querySelector('input[aria-label="Workplace (not in Life Hub)"]')).toBeTruthy();
    expect(form?.querySelector('input[aria-label="Organisation"]')).toBeTruthy();
    expect(form?.querySelector('input[aria-label="LinkedIn"]')).toBeTruthy();
  });

  it('Remember empty offers Run now; Today strip mounts (Phases 5–7)', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderPeoplePage(canvas, { selectedId: PERSON_ID });
    const remember = canvas.querySelector('[data-section="remember"] .people-pane__section-body');
    expect(remember?.textContent).toMatch(/Ann hasn't found anything yet/);
    expect(remember?.querySelector('button.people-pane__run-ann')?.textContent).toBe('Run now');
    const today = canvas.querySelector('.people-page__today');
    expect(today).toBeTruthy();
    expect(today?.textContent).toMatch(/You usually meet Henry after lunch|Today/);
  });
});

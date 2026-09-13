import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderApplicationDetailView,
  renderApplicationNewView,
  renderApplicationsView
} from '@/views/applications';
import { renderCareerView } from '@/views/career';
import { parseRoute, railHighlightFor, applicationRoute } from '@/app/router';

const VALID_APPLICATION_ID = 'application_00000000-0000-4000-8000-000000000010';
const ORG_REF = 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002';
const PERSON_REF = 'shared:person:person_00000000-0000-4000-8000-000000000001';

function sampleApplication(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: VALID_APPLICATION_ID,
    position_title: 'Classroom Teacher',
    advertisement: {
      title: 'Teacher ad',
      url: null,
      source: 'Seek',
      summary: null,
      captured_at: null
    },
    closing_date: '2026-10-01',
    pipeline_status: 'drafting',
    documents: [],
    selection_criteria: [],
    interview_rounds: [],
    outcome: { status: 'none', date: null, offer_details: null, reason: null },
    reflection: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...overrides
  };
}

describe('application and career routes', () => {
  it('parses list, compose, detail, and career routes', () => {
    expect(parseRoute('#/applications')).toEqual({ name: 'applications' });
    expect(parseRoute('#/application/new')).toEqual({ name: 'application-new' });
    expect(parseRoute(`#/application/${VALID_APPLICATION_ID}`)).toEqual({
      name: 'application',
      id: VALID_APPLICATION_ID
    });
    expect(parseRoute('#/career')).toEqual({ name: 'career' });
    expect(parseRoute('#/application/not-valid').name).toBe('not-found');
    expect(railHighlightFor({ name: 'application-new' })).toBe('applications');
    expect(railHighlightFor({ name: 'career' })).toBe('career');
    expect(railHighlightFor({ name: 'application', id: VALID_APPLICATION_ID })).toBe('applications');
    expect(applicationRoute(VALID_APPLICATION_ID)).toBe(`#/application/${VALID_APPLICATION_ID}`);
  });
});

describe('renderApplicationsView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          applications: [
            sampleApplication({
              organisation: {
                ref: ORG_REF,
                display_label: 'Example University'
              }
            }),
            sampleApplication({
              id: 'application_00000000-0000-4000-8000-000000000011',
              position_title: 'Head of Stage',
              pipeline_status: 'submitted',
              closing_date: null,
              organisation: {
                ref: ORG_REF,
                display_label: 'Example University'
              }
            })
          ]
        }
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders pipeline groups by default and list mode', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const canvas = document.createElement('div');
    await renderApplicationsView(canvas);
    expect(canvas.textContent).toMatch(/Classroom Teacher/);
    expect(canvas.textContent).toMatch(/Head of Stage/);
    expect(canvas.textContent).toMatch(/Example University/);
    expect(canvas.querySelector('.applications__pipeline')).toBeTruthy();
    expect(canvas.querySelector('a.btn--primary')?.getAttribute('href')).toBe('#/application/new');

    const listBtn = [...canvas.querySelectorAll('button')].find((btn) => btn.textContent === 'List');
    expect(listBtn).toBeTruthy();
    listBtn!.click();
    expect(canvas.querySelector('.applications__pipeline')).toBeNull();
    expect(canvas.querySelector('.applications__list')).toBeTruthy();
    expect(canvas.textContent).toMatch(/drafting|submitted/i);
  });

  it('stacks at 390px without fixed wide tables', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const canvas = document.createElement('div');
    canvas.style.width = '390px';
    await renderApplicationsView(canvas);
    expect(canvas.querySelector('table')).toBeNull();
    expect(canvas.querySelector('.applications__pipeline')).toBeTruthy();
    expect(canvas.textContent).toMatch(/Classroom Teacher/);
  });
});

describe('renderApplicationNewView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (href.includes('/api/entities/search')) {
        return Response.json({
          ok: true,
          data: {
            groups: {
              person: [
                {
                  ref: PERSON_REF,
                  kind: 'person',
                  display_label: 'Seth',
                  supporting_label: null,
                  href: null,
                  lifecycle_status: 'active',
                  visibility: 'operator'
                }
              ],
              organisation: [
                {
                  ref: ORG_REF,
                  kind: 'organisation',
                  display_label: 'Example School',
                  supporting_label: null,
                  href: null,
                  lifecycle_status: 'active',
                  visibility: 'operator'
                }
              ],
              task: []
            }
          }
        });
      }
      if (href.includes('/api/applications') && init?.method === 'POST') {
        return Response.json({
          ok: true,
          data: {
            application: sampleApplication(),
            links: [],
            created: true
          }
        });
      }
      return Response.json({ ok: true, data: { applications: [] } });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders create form controls', async () => {
    const canvas = document.createElement('div');
    await renderApplicationNewView(canvas);
    expect(canvas.querySelector('form.application-form')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Position title"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Organisation"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Application contact"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Referee"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Referee role"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Related knowledge page"]')).toBeTruthy();
  });

  it('submits position, advertisement, closing date, and links', async () => {
    vi.useFakeTimers();
    const canvas = document.createElement('div');
    await renderApplicationNewView(canvas);

    const title = canvas.querySelector('[aria-label="Position title"]') as HTMLInputElement;
    title.value = 'Classroom Teacher';
    const closing = canvas.querySelector('[aria-label="Closing date"]') as HTMLInputElement;
    closing.value = '2026-10-01';
    const adSource = canvas.querySelector('[aria-label="Advertisement source"]') as HTMLInputElement;
    adSource.value = 'Seek';

    async function pickFrom(input: HTMLInputElement, query: string): Promise<void> {
      input.focus();
      input.value = `@${query}`;
      input.selectionStart = input.value.length;
      input.selectionEnd = input.value.length;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
      const openPicker = [...canvas.querySelectorAll('.entity-picker')].find(
        (node) => !(node as HTMLElement).hidden
      ) as HTMLElement | undefined;
      expect(openPicker).toBeTruthy();
      const option = openPicker!.querySelector('.entity-picker__option') as HTMLButtonElement | null;
      expect(option).toBeTruthy();
      option!.click();
    }

    await pickFrom(canvas.querySelector('[aria-label="Organisation"]') as HTMLInputElement, 'Example');
    await pickFrom(
      canvas.querySelector('[aria-label="Application contact"]') as HTMLInputElement,
      'Seth'
    );
    const role = canvas.querySelector('[aria-label="Referee role"]') as HTMLSelectElement;
    role.value = 'academic';
    await pickFrom(canvas.querySelector('[aria-label="Referee"]') as HTMLInputElement, 'Seth');

    vi.useRealTimers();

    const form = canvas.querySelector('form.application-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(
          (call) => String(call[0]).includes('/api/applications') && call[1]?.method === 'POST'
        )
      ).toBe(true);
    });

    const createCall = vi
      .mocked(fetch)
      .mock.calls.find(
        (call) => String(call[0]).includes('/api/applications') && call[1]?.method === 'POST'
      );
    const body = JSON.parse(String(createCall?.[1]?.body));
    expect(body).toMatchObject({
      position_title: 'Classroom Teacher',
      closing_date: '2026-10-01',
      advertisement: expect.objectContaining({ source: 'Seek' })
    });
    expect(body.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target_ref: ORG_REF, relationship_type: 'applies_to' }),
        expect.objectContaining({
          target_ref: PERSON_REF,
          relationship_type: 'application_contact'
        }),
        expect.objectContaining({
          target_ref: PERSON_REF,
          relationship_type: 'referee',
          role: 'academic'
        })
      ])
    );
  });
});

describe('renderApplicationDetailView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('/api/universal-links')) {
        return Response.json({
          ok: true,
          data: {
            outgoing: [
              {
                link: {
                  id: 'ul_applies',
                  relationship_type: 'applies_to',
                  status: 'current',
                  source_ref: `professional:application:${VALID_APPLICATION_ID}`,
                  target_ref: ORG_REF
                },
                endpoint: {
                  ref: ORG_REF,
                  kind: 'organisation',
                  display_label: 'Example School'
                }
              }
            ],
            incoming: []
          }
        });
      }
      return Response.json({
        ok: true,
        data: {
          application: sampleApplication({
            application_action_operation: null
          })
        }
      });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('exposes allowed pipeline transitions and application_action task panel', async () => {
    const canvas = document.createElement('div');
    await renderApplicationDetailView(canvas, VALID_APPLICATION_ID);
    expect(canvas.textContent).toMatch(/Classroom Teacher|Pipeline · drafting/);
    expect(canvas.querySelector('[data-pipeline-transition="ready"]')).toBeTruthy();
    expect(canvas.querySelector('[data-pipeline-transition="withdrawn"]')).toBeTruthy();
    expect(canvas.querySelector('[data-pipeline-transition="submitted"]')).toBeNull();
    expect(canvas.textContent).toMatch(/Application action Task/);
    expect(canvas.querySelector('[data-task-link-submit="application_action"]')).toBeTruthy();
  });
});

describe('renderCareerView', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders unavailable sections honestly with reason', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          applications: {
            status: 'unavailable',
            reason: 'applications_store_offline',
            items: []
          },
          employment: { status: 'ok', items: [] },
          professional_development: { status: 'ok', items: [] },
          people: { status: 'unavailable', reason: 'linked_entities_unavailable', items: [] },
          organisations: { status: 'ok', items: [] },
          deferred: ['publication', 'presentation']
        }
      })
    );
    const canvas = document.createElement('div');
    await renderCareerView(canvas);
    expect(canvas.textContent).toMatch(/Unavailable · applications_store_offline/);
    expect(canvas.textContent).toMatch(/Unavailable · linked_entities_unavailable/);
    expect(canvas.textContent).toMatch(/Publication|Presentation|deferred/i);
  });

  it('links application items to Professional routes', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          applications: {
            status: 'ok',
            items: [
              {
                id: VALID_APPLICATION_ID,
                position_title: 'Classroom Teacher',
                pipeline_status: 'drafting',
                href: `/professional/#/application/${VALID_APPLICATION_ID}`
              }
            ]
          },
          employment: { status: 'ok', items: [] },
          professional_development: { status: 'ok', items: [] },
          people: { status: 'ok', items: [] },
          organisations: { status: 'ok', items: [] },
          deferred: ['publication', 'presentation']
        }
      })
    );
    const canvas = document.createElement('div');
    await renderCareerView(canvas);
    const link = [...canvas.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Classroom Teacher')
    );
    expect(link?.getAttribute('href')).toBe(`#/application/${VALID_APPLICATION_ID}`);
  });
});



describe('application detail editing controls', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('edits documents criteria and interviews through detail controls', async () => {
    const application = sampleApplication({
      documents: [
        {
          id: 'adoc_00000000-0000-4000-8000-000000000001',
          document_type: 'resume',
          label: 'CV',
          url: 'https://example.com/cv.pdf',
          storage_ref: null,
          version: '1',
          status: 'draft'
        }
      ],
      selection_criteria: [
        {
          id: 'acrit_00000000-0000-4000-8000-000000000001',
          criterion: 'Teaching excellence',
          response: 'Draft',
          order: 1,
          completed: false
        }
      ],
      interview_rounds: []
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (href.includes('/api/universal-links')) {
        if (init?.method === 'POST' || init?.method === 'PATCH') {
          return Response.json({ ok: true, data: { link: { id: 'ul_1', status: 'current' }, created: true } });
        }
        return Response.json({ ok: true, data: { outgoing: [], incoming: [] } });
      }
      if (href.includes('/api/applications') && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}'));
        return Response.json({
          ok: true,
          data: { application: { ...application, ...body, updated_at: '2026-09-02T10:00:00.000Z' } }
        });
      }
      if (href.includes('/api/applications')) {
        return Response.json({ ok: true, data: { application } });
      }
      return Response.json({ ok: true, data: {} });
    });

    const canvas = document.createElement('div');
    await renderApplicationDetailView(canvas, VALID_APPLICATION_ID);
    // Relationship editor loads after paint.
    await vi.waitFor(() => {
      expect(canvas.querySelector('[aria-label="Outgoing relationships"]')).toBeTruthy();
    });

    expect(canvas.textContent).toMatch(/Documents/);
    expect(canvas.querySelector('[aria-label="Document URL"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Selection criterion"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Interview date and time"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Interview time zone"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Organisation"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Application contact"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Referee"]')).toBeTruthy();
  });
});

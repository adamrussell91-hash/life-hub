import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderCommunicationNewView,
  renderCommunicationsView
} from '@/views/communications';
import { parseRoute, railHighlightFor, communicationRoute } from '@/app/router';

const VALID_COMMUNICATION_ID = 'communication_00000000-0000-4000-8000-000000000010';

describe('communication routes', () => {
  it('parses list, compose, and detail routes', () => {
    expect(parseRoute('#/communications')).toEqual({ name: 'communications' });
    expect(parseRoute('#/communication/new')).toEqual({ name: 'communication-new' });
    expect(parseRoute(`#/communication/${VALID_COMMUNICATION_ID}`)).toEqual({
      name: 'communication',
      id: VALID_COMMUNICATION_ID
    });
    expect(parseRoute('#/communication/not-valid').name).toBe('not-found');
    expect(railHighlightFor({ name: 'communication-new' })).toBe('communications');
    expect(communicationRoute(VALID_COMMUNICATION_ID)).toBe(
      `#/communication/${VALID_COMMUNICATION_ID}`
    );
  });
});

describe('renderCommunicationsView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          communications: [
            {
              schema_version: 1,
              id: VALID_COMMUNICATION_ID,
              direction: 'outbound',
              channel: 'email',
              occurred_at: '2026-09-01T10:00:00.000Z',
              subject: 'Proposal',
              summary: 'Hi',
              status: 'completed',
              created_at: '2026-09-01T10:00:00.000Z',
              updated_at: '2026-09-01T10:00:00.000Z'
            }
          ]
        }
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('lists communications and exposes Compose', async () => {
    const canvas = document.createElement('div');
    await renderCommunicationsView(canvas);
    expect(canvas.textContent).toMatch(/Proposal/);
    expect(canvas.querySelector('a.btn--primary')?.getAttribute('href')).toBe('#/communication/new');
    expect(fetch).toHaveBeenCalled();
  });
});

describe('renderCommunicationNewView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('/api/entities/search')) {
        return Response.json({
          ok: true,
          data: {
            groups: {
              person: [
                {
                  ref: 'shared:person:person_00000000-0000-4000-8000-000000000001',
                  kind: 'person',
                  display_label: 'Seth Example',
                  supporting_label: null,
                  href: null,
                  lifecycle_status: 'active',
                  visibility: 'operator'
                }
              ],
              organisation: [],
              task: []
            }
          }
        });
      }
      return Response.json({
        ok: true,
        data: {
          communication: {
            schema_version: 1,
            id: VALID_COMMUNICATION_ID,
            direction: 'outbound',
            channel: 'email',
            occurred_at: '2026-09-01T10:00:00.000Z',
            subject: 'Hello',
            summary: '',
            status: 'completed',
            created_at: '2026-09-01T10:00:00.000Z',
            updated_at: '2026-09-01T10:00:00.000Z'
          },
          links: [],
          created: true
        }
      });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders compose fields and recipient picker affordance', async () => {
    const canvas = document.createElement('div');
    await renderCommunicationNewView(canvas);
    expect(canvas.querySelector('select[name="direction"]')).toBeTruthy();
    expect(canvas.querySelector('select[name="channel"]')).toBeTruthy();
    expect(canvas.querySelector('input[name="occurred_at"]')).toBeTruthy();
    expect(canvas.querySelector('input[aria-label="Recipient"]')).toBeTruthy();
    expect(canvas.textContent).toMatch(/Save/);
  });
});

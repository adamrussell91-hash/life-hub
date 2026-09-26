/**
 * People Home (Phase 2 signals dashboard) was replaced by the Phase 1
 * directory+pane page (`people.ts` / `people-page.test.ts`).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderPeopleHomeView } from '@/views/people';
import { personRoute } from '@/app/router';

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('renderPeopleHomeView (compat alias → people redesign)', () => {
  it('mounts the redesign page with a single People heading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/people/directory')) {
          return jsonResponse({
            people: [],
            organisations: [],
            counts: { people: 0, organisations: 0 }
          });
        }
        return jsonResponse({});
      })
    );
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas, { selectedId: null });
    expect(canvas.querySelectorAll('h1')).toHaveLength(1);
    expect(canvas.querySelector('h1')?.textContent).toBe('People');
    expect(personRoute(PERSON_ID)).toBe(`#/people/${PERSON_ID}`);
    vi.unstubAllGlobals();
  });
});

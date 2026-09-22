import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';

const SETH_REF = 'shared:person:person_00000000-0000-4000-8000-000000000001';

describe('mock PATCH /api/entities', () => {
  it('updates a created person name so a later overview shows the new name', async () => {
    const api = createMockApi();
    await api.handle('POST', '/api/auth', { passphrase: 'professional-hub-local' });

    const patched = await api.handle('PATCH', `/api/entities?ref=${encodeURIComponent(SETH_REF)}&action=update`, {
      display_name: 'Seth Updated',
      sort_name: 'Updated, Seth',
      aliases: ['Sethy']
    });

    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      ok: true,
      data: {
        ref: SETH_REF,
        display_name: 'Seth Updated',
        sort_name: 'Updated, Seth',
        aliases: ['Sethy']
      }
    });

    const overview = await api.handle(
      'GET',
      `/api/entities/overview?ref=${encodeURIComponent(SETH_REF)}`
    );
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({
      ok: true,
      data: { entity: { display_name: 'Seth Updated' } }
    });
  });
});

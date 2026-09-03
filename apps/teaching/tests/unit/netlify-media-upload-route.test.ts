// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeStore } = vi.hoisted(() => {
  class FakeStore {
    private readonly data = new Map<string, { value: unknown; metadata?: Record<string, unknown> }>();

    reset(): void {
      this.data.clear();
    }

    async get(key: string, opts?: { type?: string }): Promise<unknown> {
      const entry = this.data.get(key);
      if (!entry) return null;
      if (opts?.type === 'json') return entry.value;
      return entry.value;
    }

    async setJSON(key: string, value: unknown): Promise<void> {
      this.data.set(key, { value });
    }

    async set(
      key: string,
      value: unknown,
      opts?: { metadata?: Record<string, unknown> }
    ): Promise<void> {
      this.data.set(key, { value, metadata: opts?.metadata });
    }

    async getWithMetadata(
      key: string
    ): Promise<{ data: unknown; metadata: Record<string, unknown> | null } | null> {
      const entry = this.data.get(key);
      if (!entry) return null;
      return { data: entry.value, metadata: entry.metadata ?? null };
    }
  }

  return { fakeStore: new FakeStore() };
});

vi.mock('../../netlify/functions/_shared/blobs.mts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../netlify/functions/_shared/blobs.mts')>();
  return { ...actual, getContentStore: () => fakeStore };
});

const { createSessionToken } = await import('../../netlify/functions/_shared/auth-security.mts');
const mediaItemHandler = (await import('../../netlify/functions/media-item.mts')).default;
const mediaUploadHandler = (await import('../../netlify/functions/media-upload.mts')).default;

const SESSION_SECRET = 's'.repeat(32);
const FUNCTION_ORIGIN = 'https://api.example.netlify.app';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

beforeEach(() => {
  fakeStore.reset();
  process.env.TEACHING_HUB_PASSPHRASE_HASH = 'scrypt$v1$16384$8$1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  process.env.SESSION_SECRET = SESSION_SECRET;
  delete process.env.SITE_ORIGIN;
});

afterEach(() => {
  delete process.env.TEACHING_HUB_PASSPHRASE_HASH;
  delete process.env.SESSION_SECRET;
  delete process.env.SITE_ORIGIN;
});

function sessionCookieHeader(): string {
  const issued = createSessionToken({ now: Date.now() }, SESSION_SECRET);
  return `teaching_hub_session=${issued.token}`;
}

function pngForm(): FormData {
  const form = new FormData();
  form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'cover.png');
  form.append('title', 'Cover');
  return form;
}

function uploadRequest(): Request {
  return new Request(`${FUNCTION_ORIGIN}/api/media/upload`, {
    method: 'POST',
    headers: { cookie: sessionCookieHeader() },
    body: pngForm()
  });
}

describe('Netlify media upload routing', () => {
  it('POST /api/media/:id with id=upload stores bytes (Netlify :id swallows /upload)', async () => {
    const response = await mediaItemHandler(uploadRequest(), { params: { id: 'upload' } });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { ok: boolean; data?: { provider?: string; title?: string } };
    expect(body.ok).toBe(true);
    expect(body.data?.provider).toBe('direct');
    expect(body.data?.title).toBe('Cover');
  });

  it('POST /api/media/:id still rejects ordinary ids', async () => {
    const response = await mediaItemHandler(uploadRequest(), { params: { id: 'media_1' } });
    expect(response.status).toBe(405);
  });

  it('POST /api/media/upload handler still stores bytes when routed directly', async () => {
    const response = await mediaUploadHandler(uploadRequest());
    expect(response.status).toBe(201);
  });
});

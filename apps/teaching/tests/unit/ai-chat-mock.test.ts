// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockApi, loadSeedFile } from '../../scripts/mock-api';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const seed = loadSeedFile(path.resolve(root, '../../fixtures/seed.json'));
const PASSPHRASE = 'teaching-hub-local';

describe('mock /api/ai/chat', () => {
  it('requires auth and streams a fixture proposal', async () => {
    const api = createMockApi({ seed, passphrase: PASSPHRASE });
    const unauth = await api.request('POST', '/api/ai/chat', {
      body: {
        lesson_id: 'x',
        agent: 'ann',
        scope: 'block',
        selected_block_id: 'y',
        message: 'hi'
      }
    });
    expect(unauth.status).toBe(401);

    const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    expect(auth.status).toBe(200);
    const cookie = auth.headers.get('set-cookie');
    expect(cookie).toBeTruthy();

    const curriculum = await api.request('GET', '/api/curriculum', { cookie });
    expect(curriculum.status).toBe(200);
    const data = (await curriculum.json()) as {
      ok: boolean;
      data: { lessons: Array<{ id: string }> };
    };
    const lessonId = data.data.lessons[0]?.id;
    expect(lessonId).toBeTruthy();

    const lessonRes = await api.request('GET', `/api/lessons/${lessonId}`, { cookie });
    expect(lessonRes.status).toBe(200);
    const lessonBody = (await lessonRes.json()) as {
      ok: boolean;
      data: { blocks: Array<{ id: string }> };
    };
    const blockId = lessonBody.data.blocks[0]?.id;
    expect(blockId).toBeTruthy();

    const stream = await api.request('POST', '/api/ai/chat', {
      cookie,
      body: {
        lesson_id: lessonId,
        agent: 'ann',
        scope: 'block',
        selected_block_id: blockId,
        message: 'build a 10 point mind map on cheese types'
      }
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const text = await stream.text();
    expect(text).toContain('"type":"proposal"');
    const proposalEvent = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
      .find((event) => event.type === 'proposal') as {
      proposal: {
        kind: string;
        blocks: Array<{ block_type: string; content: { nodes: unknown[] } }>;
      };
    };
    expect(proposalEvent.proposal.kind).toBe('insert_blocks');
    expect(proposalEvent.proposal.blocks[0]?.block_type).toBe('mind_map');
    expect(proposalEvent.proposal.blocks[0]?.content.nodes).toHaveLength(10);
    expect(text).toContain('"type":"done"');
  });

  it('streams a proposal when selected_block_id is omitted', async () => {
    const api = createMockApi({ seed, passphrase: PASSPHRASE });
    const unauth = await api.request('POST', '/api/ai/chat', {
      body: {
        lesson_id: 'x',
        agent: 'ann',
        message: 'Build a heading'
      }
    });
    expect(unauth.status).toBe(401);

    const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    expect(auth.status).toBe(200);
    const cookie = auth.headers.get('set-cookie');
    expect(cookie).toBeTruthy();

    const curriculum = await api.request('GET', '/api/curriculum', { cookie });
    expect(curriculum.status).toBe(200);
    const data = (await curriculum.json()) as {
      ok: boolean;
      data: { lessons: Array<{ id: string }> };
    };
    const lessonId = data.data.lessons[0]?.id;
    expect(lessonId).toBeTruthy();

    const stream = await api.request('POST', '/api/ai/chat', {
      cookie,
      body: {
        lesson_id: lessonId,
        agent: 'ann',
        message: 'Build a heading'
      }
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const text = await stream.text();
    expect(text).toMatch(/"type":"(proposal|done)"/);
  });

  it('treats an unsaved block id as a hint and still answers', async () => {
    const api = createMockApi({ seed, passphrase: PASSPHRASE });
    const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    const cookie = auth.headers.get('set-cookie');

    const curriculum = await api.request('GET', '/api/curriculum', { cookie });
    const data = (await curriculum.json()) as {
      data: { lessons: Array<{ id: string }> };
    };
    const lessonId = data.data.lessons[0]?.id;
    expect(lessonId).toBeTruthy();

    const stream = await api.request('POST', '/api/ai/chat', {
      cookie,
      body: {
        lesson_id: lessonId,
        agent: 'ann',
        scope: 'block',
        selected_block_id: 'block_added_but_not_saved_yet',
        message: 'Put three facts about Shakespeare in this box'
      }
    });

    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const text = await stream.text();
    expect(text).not.toContain('selected_block_id not found');
    expect(text).toMatch(/"type":"(proposal|done)"/);
  });

  it('reports anthropic readiness on GET /api/ai/chat', async () => {
    const api = createMockApi({ seed, passphrase: PASSPHRASE });
    const unauth = await api.request('GET', '/api/ai/chat');
    expect(unauth.status).toBe(401);

    const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    const cookie = auth.headers.get('set-cookie');
    const status = await api.request('GET', '/api/ai/chat', { cookie });
    expect(status.status).toBe(200);
    const body = (await status.json()) as {
      ok: boolean;
      data: { anthropic_configured: boolean; model: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.anthropic_configured).toBe(true);
    expect(body.data.model).toBe('claude-sonnet-4-6');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cloneBlockWithNewIds,
  createBlock,
  createWhiteboardWithStarter
} from '@/blocks/create-block';
import { hasDrawing, toScene } from '../../../../packages/whiteboard/excalidraw-board';
import { mountHubWhiteboard } from '../../../../packages/whiteboard/hub-whiteboard';
import {
  WHITEBOARD_STARTERS,
  WHITEBOARD_STARTER_IDS,
  isWhiteboardStarterId,
  whiteboardStarterScene
} from '../../../../packages/whiteboard/starters.mjs';
import { BlockSchema, WhiteboardStarterIdSchema } from '@/schemas/block';

describe('whiteboard block', () => {
  it('creates a valid whiteboard with its own document id', () => {
    const block = createBlock('whiteboard', 'wb1');
    expect(BlockSchema.parse(block)).toMatchObject({
      block_type: 'whiteboard',
      content: {
        document_id: 'whiteboard_wb1',
        height_px: 640
      }
    });
  });

  it('duplicates into a new document and keeps the source only as a seed', () => {
    const source = createBlock('whiteboard', 'wb1');
    let n = 0;
    const clone = cloneBlockWithNewIds(source, () => `copy_${++n}`);

    expect(clone).toMatchObject({
      id: 'copy_1',
      block_type: 'whiteboard',
      content: {
        document_id: 'whiteboard_copy_1',
        seed_document_id: 'whiteboard_wb1'
      }
    });
    expect(clone.content).not.toHaveProperty('published_snapshot');
  });

  it('reads an Excalidraw scene and keeps only the background from app state', () => {
    const scene = toScene({
      format: 'excalidraw',
      version: 1,
      elements: [{ id: 'a', type: 'rectangle' }],
      appState: { viewBackgroundColor: '#fffbe6', zoom: { value: 3 } },
      files: {}
    });
    expect(scene.elements).toHaveLength(1);
    expect(scene.appState).toEqual({ viewBackgroundColor: '#fffbe6' });
    expect(hasDrawing(scene)).toBe(true);
  });

  it('treats old BlockSuite snapshots and missing data as an empty board', () => {
    expect(toScene({ type: 'page', blocks: {} }).elements).toEqual([]);
    expect(toScene(null).elements).toEqual([]);
    expect(toScene([1, 2]).elements).toEqual([]);
  });

  it('does not count deleted shapes as a drawing', () => {
    const scene = toScene({
      format: 'excalidraw',
      elements: [{ id: 'a', isDeleted: true }],
      appState: {},
      files: {}
    });
    expect(hasDrawing(scene)).toBe(false);
  });
});

describe('whiteboard 3 Cs starters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the schema enum and the layout list in step', () => {
    expect(WhiteboardStarterIdSchema.options).toEqual(WHITEBOARD_STARTER_IDS);
    expect(WHITEBOARD_STARTERS.map((starter) => starter.label)).toEqual([
      'Sort into groups',
      'Venn: compare and contrast',
      'Same / Different / So what'
    ]);
    expect(isWhiteboardStarterId('venn')).toBe(true);
    expect(isWhiteboardStarterId('blank')).toBe(false);
    expect(whiteboardStarterScene('blank')).toBeNull();
    expect(whiteboardStarterScene(undefined)).toBeNull();
  });

  it('leaves a default whiteboard blank, with no starter', () => {
    const block = createBlock('whiteboard', 'wb1');
    expect(block.content).not.toHaveProperty('starter');
    // Created a moment apart, so compare everything but the timestamps.
    const { created_at: _a, updated_at: _b, ...plain } = block;
    const { created_at: _c, updated_at: _d, ...made } = createWhiteboardWithStarter('wb1');
    expect(made).toEqual(plain);
  });

  it.each(WHITEBOARD_STARTER_IDS)('builds a valid %s whiteboard block', (starter) => {
    const block = createWhiteboardWithStarter('wb_s', starter);
    expect(BlockSchema.parse(block)).toMatchObject({
      block_type: 'whiteboard',
      content: { document_id: 'whiteboard_wb_s', starter }
    });
  });

  it.each(WHITEBOARD_STARTER_IDS)('draws %s as complete Excalidraw elements', (starter) => {
    const scene = whiteboardStarterScene(starter);
    expect(toScene(scene)).toEqual(scene);
    expect(hasDrawing(toScene(scene))).toBe(true);

    const ids = scene.elements.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const element of scene.elements) {
      expect(['rectangle', 'ellipse', 'text']).toContain(element.type);
      for (const key of ['x', 'y', 'width', 'height', 'seed', 'version', 'versionNonce']) {
        expect(Number.isFinite(element[key] as number)).toBe(true);
      }
      expect(element.width as number).toBeGreaterThan(0);
      expect(element.isDeleted).toBe(false);
      expect(element.groupIds).toEqual([]);
      if (element.type === 'text') {
        expect(element.text).toBeTruthy();
        expect(element.originalText).toBe(element.text);
        expect(element.containerId).toBeNull();
      }
    }
  });

  it('labels the Venn A, Both and B and the other layouts by column', () => {
    const labels = (starter: string) =>
      whiteboardStarterScene(starter)!.elements
        .filter((element) => element.type === 'text')
        .map((element) => element.text);
    expect(labels('venn')).toEqual(expect.arrayContaining(['A', 'Both', 'B']));
    expect(whiteboardStarterScene('venn')!.elements.filter((e) => e.type === 'ellipse')).toHaveLength(2);
    expect(labels('same_different')).toEqual(expect.arrayContaining(['Same', 'Different', 'So what?']));
    expect(whiteboardStarterScene('sort_groups')!.elements.filter((e) => e.type === 'rectangle')).toHaveLength(3);
  });

  it('keeps the starter on a copy so an unopened layout survives duplication', () => {
    const source = createWhiteboardWithStarter('wb1', 'sort_groups');
    const clone = cloneBlockWithNewIds(source, () => 'copy_1');
    expect(clone.content).toMatchObject({
      document_id: 'whiteboard_copy_1',
      seed_document_id: 'whiteboard_wb1',
      starter: 'sort_groups'
    });
  });

  it('writes the starter into a board with no document once, then drops it', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') {
        return new Response(JSON.stringify({ ok: false, error: { code: 'not_found' } }), { status: 404 });
      }
      return new Response(JSON.stringify({ ok: true, data: { id: 'x', snapshot: {}, schema_version: 1, updated_at: '' } }));
    }));
    const block = createWhiteboardWithStarter('wb9', 'venn');
    const onBlockChange = vi.fn();
    const host = document.createElement('div');
    await mountHubWhiteboard(host, block, {
      getBaseUrl: () => 'https://api.example.test',
      readOnly: false,
      onBlockChange
    });

    const puts = calls.filter((call) => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe('https://api.example.test/api/whiteboards/whiteboard_wb9');
    expect(puts[0].body).toEqual({ snapshot: whiteboardStarterScene('venn') });
    expect(onBlockChange).toHaveBeenCalledTimes(1);
    expect(onBlockChange.mock.calls[0][0].content).not.toHaveProperty('starter');
  });

  it('does not overwrite a board that already has a document', async () => {
    const saved = { format: 'excalidraw', version: 1, elements: [{ id: 'mine' }], appState: {}, files: {} };
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      methods.push(init.method ?? 'GET');
      return new Response(JSON.stringify({
        ok: true,
        data: { id: 'whiteboard_wb9', snapshot: saved, schema_version: 1, updated_at: '' }
      }));
    }));
    const onBlockChange = vi.fn();
    await mountHubWhiteboard(document.createElement('div'), createWhiteboardWithStarter('wb9', 'venn'), {
      getBaseUrl: () => 'https://api.example.test',
      readOnly: false,
      onBlockChange
    });
    expect(methods).toEqual(['GET']);
    expect(onBlockChange.mock.calls[0][0].content).not.toHaveProperty('starter');
  });

  it('offers the layouts on an empty board and none on a blank published one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: { code: 'not_found' } }), { status: 404 })
    ));
    const host = document.createElement('div');
    await mountHubWhiteboard(host, createBlock('whiteboard', 'wb3') as never, {
      getBaseUrl: () => 'https://api.example.test',
      readOnly: false
    });
    const choices = [...host.querySelectorAll<HTMLButtonElement>('[data-starter]')];
    expect(choices.map((choice) => choice.dataset.starter)).toEqual(WHITEBOARD_STARTER_IDS);

    const published = document.createElement('div');
    await mountHubWhiteboard(published, createBlock('whiteboard', 'wb4') as never, {
      getBaseUrl: () => 'https://api.example.test',
      readOnly: true,
      published: true
    });
    expect(published.querySelector('[data-starter]')).toBeNull();
  });
});

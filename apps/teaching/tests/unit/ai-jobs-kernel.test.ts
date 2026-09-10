import { describe, expect, it } from 'vitest';
import {
  applyKernelOutcome,
  classifyKernelResponse,
  isStaleWorkingJob,
  type AiJob
} from '@/ai/jobs';
import { createBlock } from '@/blocks/create-block';
import { emptySearchPack, type SearchPack } from '@/ai/search-pack';

const EMPTY_SEARCH_PACK = emptySearchPack(
  'Build a lesson',
  '2026-08-16T00:00:00.000Z'
);

const AVAILABLE_SEARCH_PACK: SearchPack = {
  ...EMPTY_SEARCH_PACK,
  available: true
};

const workingJob: AiJob = {
  id: 'job_1',
  lesson_id: 'lesson_1',
  agent: 'clementine',
  status: 'working',
  snapshot_at: '2026-08-15T01:00:00.000Z',
  message: 'Build a lesson on Othello',
  created_at: '2026-08-15T01:00:00.000Z'
};

describe('classifyKernelResponse', () => {
  it('treats HTTP 404 as a missing kernel', () => {
    expect(
      classifyKernelResponse({ secret: 's', status: 404, searchPack: EMPTY_SEARCH_PACK })
    ).toEqual({ kind: 'missing' });
  });

  it('treats HTTP 500 as a kernel failure', () => {
    expect(
      classifyKernelResponse({ secret: 's', status: 500, searchPack: EMPTY_SEARCH_PACK })
    ).toMatchObject({
      kind: 'failed'
    });
  });

  it('treats invalid JSON as a kernel failure', () => {
    expect(
      classifyKernelResponse({
        secret: 's',
        status: 200,
        invalidJson: true,
        searchPack: EMPTY_SEARCH_PACK
      })
    ).toMatchObject({ kind: 'failed' });
  });

  it('treats an unset secret as a missing kernel', () => {
    expect(classifyKernelResponse({ searchPack: EMPTY_SEARCH_PACK })).toEqual({ kind: 'missing' });
  });

  it('accepts insert_blocks with a media-free 10-node mind map when search is unavailable', () => {
    const mindMap = createBlock('mind_map', 'map_1');
    if (mindMap.block_type !== 'mind_map') throw new Error('expected mind map');
    mindMap.content = {
      title: 'Othello',
      nodes: Array.from({ length: 10 }, (_, index) => ({
        id: `node_${index}`,
        label: `Idea ${index + 1}`,
        parent_id: index === 0 ? null : 'node_0'
      })),
      edges: []
    };

    const outcome = classifyKernelResponse({
      secret: 's',
      status: 200,
      searchPack: EMPTY_SEARCH_PACK,
      payload: {
        proposal: {
          kind: 'insert_blocks',
          position: 'below',
          blocks: [mindMap]
        }
      }
    });

    expect(outcome).toMatchObject({
      kind: 'ok',
      proposal: { kind: 'insert_blocks', blocks: [{ block_type: 'mind_map' }] }
    });
  });

  it('accepts replace_block proposals', () => {
    const block = createBlock('heading', 'incoming_id');
    const outcome = classifyKernelResponse({
      secret: 's',
      status: 200,
      searchPack: EMPTY_SEARCH_PACK,
      payload: { kind: 'replace_block', block_id: 'heading_1', block }
    });

    expect(outcome).toMatchObject({
      kind: 'ok',
      proposal: { kind: 'replace_block', block_id: 'heading_1', block: { id: 'heading_1' } }
    });
  });

  it('accepts review_only proposals', () => {
    expect(
      classifyKernelResponse({
        secret: 's',
        status: 200,
        searchPack: EMPTY_SEARCH_PACK,
        payload: { kind: 'review_only', summary: 'The lesson is ready.' }
      })
    ).toEqual({
      kind: 'ok',
      proposal: { kind: 'review_only', summary: 'The lesson is ready.' }
    });
  });

  it('accepts a bare replace_lesson payload for backward compatibility', () => {
    const block = createBlock('heading', 'heading_1');
    expect(
      classifyKernelResponse({
        secret: 's',
        status: 200,
        searchPack: EMPTY_SEARCH_PACK,
        payload: { title: 'Othello', blocks: [block] }
      })
    ).toMatchObject({
      kind: 'ok',
      proposal: { kind: 'replace_lesson', title: 'Othello' }
    });
  });

  it('rejects media invented outside the search pack', () => {
    const image = createBlock('image', 'image_1');
    if (image.block_type !== 'image') throw new Error('expected image');
    image.content = {
      url: 'https://invented.example/image.jpg',
      alt_text: 'Invented image'
    };

    expect(
      classifyKernelResponse({
        secret: 's',
        status: 200,
        searchPack: AVAILABLE_SEARCH_PACK,
        payload: { kind: 'replace_lesson', blocks: [image] }
      })
    ).toEqual({ kind: 'failed', error: 'Kernel returned an invalid proposal' });
  });

  it('rejects a caption-only diagram that cannot publish', () => {
    const diagram = createBlock('diagram', 'diagram_1');
    if (diagram.block_type !== 'diagram') throw new Error('expected diagram');
    diagram.content = {
      source: 'image',
      image_url: '',
      image_alt: '',
      caption: 'Spacing vs massed practice'
    };

    expect(
      classifyKernelResponse({
        secret: 's',
        status: 200,
        searchPack: AVAILABLE_SEARCH_PACK,
        payload: { kind: 'insert_blocks', position: 'below', blocks: [diagram] }
      })
    ).toEqual({ kind: 'failed', error: 'Kernel returned an invalid proposal' });
  });
});

describe('applyKernelOutcome', () => {
  it('uses the fixture proposal only when the kernel is missing', () => {
    const next = applyKernelOutcome(workingJob, { kind: 'missing' });
    expect(next.status).toBe('done');
    expect(next.proposal?.kind).toBe('replace_lesson');
  });

  it('does not mint a fixture proposal on kernel failure', () => {
    const next = applyKernelOutcome(workingJob, {
      kind: 'failed',
      error: 'Kernel returned HTTP 500'
    });
    expect(next.status).toBe('error');
    expect(next.error).toBe('Kernel returned HTTP 500');
    expect(next.proposal).toBeUndefined();
  });
});

describe('isStaleWorkingJob', () => {
  it('marks working jobs older than 10 minutes as stale', () => {
    const now = Date.parse('2026-08-15T01:11:00.000Z');
    expect(isStaleWorkingJob(workingJob, now)).toBe(true);
    expect(
      isStaleWorkingJob({ ...workingJob, created_at: '2026-08-15T01:05:00.000Z' }, now)
    ).toBe(false);
  });
});

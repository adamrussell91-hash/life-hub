import assert from 'node:assert/strict';
import test from 'node:test';
import { findTurnAudioKey, podcastKernelPath } from '../../netlify/functions/_shared/knowledge-podcast.mjs';

test('podcastKernelPath maps SPA leftovers onto the research Worker', () => {
  assert.deepEqual(podcastKernelPath('/api/knowledge/podcast'), { kernel: '/podcast/index', method: 'GET' });
  assert.deepEqual(podcastKernelPath('/api/knowledge/podcast/start'), { kernel: '/podcast/start', method: 'POST' });
  assert.deepEqual(podcastKernelPath('/api/knowledge/podcast/series/start'), { kernel: '/podcast/series/start', method: 'POST' });
  assert.deepEqual(podcastKernelPath('/api/knowledge/podcast/series/s1/next'), { kernel: '/podcast/series/s1/next', method: 'POST' });
  assert.deepEqual(podcastKernelPath('/api/knowledge/podcast/ep-1/audio/t1'), {
    audio: { episodeId: 'ep-1', turnId: 't1' },
    method: 'GET'
  });
  assert.equal(findTurnAudioKey({ turns: [{ id: 't1' }] }, 't1'), null);
  assert.equal(findTurnAudioKey({ turns: [{ id: 't1', audioKey: 'podcast/audio/ep-1/t1' }] }, 't1'), 'podcast/audio/ep-1/t1');
});

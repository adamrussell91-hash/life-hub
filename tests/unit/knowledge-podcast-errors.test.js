import test from 'node:test';
import assert from 'node:assert/strict';
import { podcastFailureMessage } from '../../netlify/functions/_shared/knowledge-podcast.mjs';

test('podcast errors keep the kernel detail so the page can say why', () => {
  assert.equal(podcastFailureMessage({ error: 'Podcast start failed' }), 'Podcast start failed');
  assert.equal(
    podcastFailureMessage({ error: 'Podcast start failed', detail: 'ZodError: Invalid enum value. Expected \'recap\', received \'broadcast\'' }),
    'Podcast start failed: ZodError: Invalid enum value. Expected \'recap\', received \'broadcast\''
  );
  assert.equal(podcastFailureMessage({ error: 'x', detail: 'y'.repeat(500) }).length, 'x: '.length + 238);
  assert.equal(podcastFailureMessage(undefined), 'Podcast failed');
});

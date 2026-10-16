import { expect, test } from '@playwright/test';

test('voice drafts survive in real IndexedDB and come back in order', async ({ page }) => {
  await page.goto('/annotation-technique.html');
  const result = await page.evaluate(async () => {
    const mod = await import('/src/blocks/voice-draft-store.ts');
    const writer = mod.createDraftWriter({
      id: 'voice_e2e', title: 'Take', kind: 'reading', layer_id: 'l', mime: 'audio/webm',
      started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      duration_s: 0, taps: [], live_words: []
    });
    writer.push(new Blob([new Uint8Array([1, 2])]));
    await writer.flush();
    writer.push(new Blob([new Uint8Array([3])]));
    writer.update({ duration_s: 12, finished: true });
    await writer.flush();
    // A fresh backend, as after a page reload.
    const fresh = mod.indexedDbBackend();
    const drafts = await mod.listVoiceDrafts(fresh);
    const audio = await mod.voiceDraftAudio('voice_e2e', 'audio/webm', fresh);
    const bytes = [...new Uint8Array(await audio.arrayBuffer())];
    await fresh.remove('voice_e2e');
    const after = await mod.listVoiceDrafts(fresh);
    return { count: drafts.length, duration: drafts[0]?.duration_s, bytes, after: after.length, failed: writer.failed };
  });
  expect(result).toEqual({ count: 1, duration: 12, bytes: [1, 2, 3], after: 0, failed: false });
});

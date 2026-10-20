import { describe, expect, it, vi } from 'vitest';
import type { MountVoiceRecorderOptions } from '@/blocks/voice-recorder';
import type { AnnotationBlock, AnnotationVoiceTrack } from '@/schemas/block';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';

const mounted: MountVoiceRecorderOptions[] = [];

vi.mock('@/blocks/voice-recorder', () => ({
  mountVoiceRecorder: (options: MountVoiceRecorderOptions) => {
    mounted.push(options);
    return {
      el: document.createElement('aside'),
      pushTap: () => undefined,
      isCapturing: () => false,
      dispose: () => undefined
    };
  }
}));

const { createAnnotationEditor } = await import('@/blocks/editors');

function recorded(id: string): AnnotationVoiceTrack {
  return {
    id,
    layer_id: 'layer_voice',
    kind: 'think_aloud',
    title: 'ignored',
    audio: { media_id: `media_${id}`, url: `/api/media/media_${id}/file`, duration_s: 9, mime: 'audio/webm' },
    transcript: { words: [{ w: 'Hello', start: 0, end: 1 }], timing: 'word' },
    clips: [],
    status: 'draft'
  };
}

describe('voice notes in the editor', () => {
  it('records a note on each line chosen in the Voice layer, as many as wanted', () => {
    const block: AnnotationBlock = {
      ...dulceAnnotationFixture,
      content: {
        ...dulceAnnotationFixture.content,
        layers: [
          ...dulceAnnotationFixture.content.layers,
          { id: 'layer_voice', name: 'Voice', kind: 'voice', colour: 'navy' }
        ]
      }
    };
    const changes: AnnotationBlock[] = [];
    const editor = createAnnotationEditor(block, (next) => changes.push(next as AnnotationBlock));
    document.body.append(editor);
    editor.querySelector<HTMLButtonElement>('.block-editor__annotation-mode [data-value="annotate"]')?.click();
    [...editor.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-active-layer-btn')]
      .find((btn) => btn.textContent?.startsWith('Voice'))!
      .click();

    const emptyLines = () =>
      [...editor.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-line-gutter')].filter(
        (btn) => !btn.classList.contains('has-note')
      );

    emptyLines()[0]!.click();
    expect(mounted).toHaveLength(1);
    expect(mounted[0]!.pinnedTo?.anchor.granularity).toBe('line');
    mounted[0]!.onTrackReady(recorded('one'));

    emptyLines()[1]!.click();
    expect(mounted).toHaveLength(2);
    mounted[1]!.onTrackReady(recorded('two'));

    const tracks = changes.at(-1)?.content.voice_tracks ?? [];
    expect(tracks.map((track) => track.status)).toEqual(['published', 'published']);
    expect(tracks.map((track) => track.clips[0]?.anchor?.line)).toEqual([
      mounted[0]!.pinnedTo!.anchor.line,
      mounted[1]!.pinnedTo!.anchor.line
    ]);
    expect(tracks[0]!.clips[0]).toMatchObject({ start_s: 0, end_s: 9, approved: true });
    // No new written note was made for those lines.
    expect(changes.at(-1)?.content.annotations).toHaveLength(dulceAnnotationFixture.content.annotations.length);
    editor.remove();
  });
});

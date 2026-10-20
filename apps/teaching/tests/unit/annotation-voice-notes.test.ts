import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAnnotationBlock } from '@/blocks/render';
import { createAnnotationEditor } from '@/blocks/editors';
import { formatVoiceTime } from '@/blocks/voice-note-player';
import { pinnedVoiceTrack } from '@/blocks/voice-playback';
import type { AnnotationAnchor, AnnotationBlock, AnnotationVoiceTrack } from '@/schemas/block';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';

function lineAnchor(line: string, exact: string): AnnotationAnchor {
  return { granularity: 'line', stanza: 'stanza_1', line, quote: { exact } };
}

function track(id: string, anchor: AnnotationAnchor, duration: number): AnnotationVoiceTrack {
  return pinnedVoiceTrack(
    {
      id,
      layer_id: 'layer_voice',
      kind: 'think_aloud',
      title: `Note ${id}`,
      audio: { media_id: `media_${id}`, url: `https://api.example.test/api/media/${id}/file`, duration_s: duration, mime: 'audio/webm' },
      transcript: { words: [{ w: 'Listen', start: 0, end: 0.5 }, { w: 'here', start: 0.5, end: 1 }], timing: 'estimated' },
      clips: [],
      status: 'draft'
    },
    anchor
  );
}

function withVoice(): AnnotationBlock {
  return {
    ...dulceAnnotationFixture,
    content: {
      ...dulceAnnotationFixture.content,
      layers: [
        ...dulceAnnotationFixture.content.layers,
        { id: 'layer_voice', name: 'Voice', kind: 'voice', colour: 'navy' }
      ],
      voice_tracks: [
        track('one', lineAnchor('line_1', 'Bent double, like old beggars under sacks,'), 79.7),
        track('two', lineAnchor('line_3', 'Till on the haunting flares we turned our backs'), 12)
      ]
    }
  };
}

describe('voice notes in the annotation view', () => {
  let play: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    play = vi.fn(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as () => Promise<void>);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('puts a pill with the length at the end of its line, not a player in the poem', () => {
    const el = renderAnnotationBlock(withVoice(), 'teacher');
    document.body.append(el);
    const marks = el.querySelectorAll<HTMLButtonElement>('.block-annotation__voice-mark');
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.closest('.block-annotation__line-text')).toBeTruthy();
    }
    expect(marks[0]!.textContent).toContain('1:20');
    expect(marks[1]!.textContent).toContain('0:12');
    expect(el.querySelector('.block-annotation__line-margin .block-annotation__voice-mark')).toBeNull();
    expect(el.querySelector('.block-annotation__poem details')).toBeNull();
  });

  it('lists every note under the poem with its length, scrub bar and transcript', () => {
    const el = renderAnnotationBlock(withVoice(), 'teacher');
    const rows = el.querySelectorAll('.block-annotation__voice-note');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector('[data-voice-time]')?.textContent).toBe('1:20');
    expect(rows[0]!.querySelector('input[type="range"]')).toBeTruthy();
    expect(rows[0]!.querySelector('details')?.textContent).toContain('Listen here');
    expect(rows[0]!.textContent).toContain('Bent double');
  });

  it('folds the list shut under a count, and keeps it open across repaints', () => {
    const el = renderAnnotationBlock(withVoice(), 'teacher');
    document.body.append(el);
    const fold = () => el.querySelector<HTMLDetailsElement>('details.block-annotation__voice-notes')!;
    expect(fold().open).toBe(false);
    expect(fold().querySelector('summary')?.textContent).toBe('Voice notes · 2');
    fold().open = true;
    fold().dispatchEvent(new Event('toggle'));
    const chip = [...el.querySelectorAll<HTMLButtonElement>('.block-annotation__chip')].find((btn) =>
      btn.textContent?.includes('Voice')
    )!;
    chip.click();
    chip.click();
    expect(fold().open).toBe(true);
  });

  it('folds the parts of a cut take under the whole recording', () => {
    const block = withVoice();
    const [first] = block.content.voice_tracks!;
    const cut = {
      ...first!,
      clips: [
        { ...first!.clips[0]!, id: 'clip_a', start_s: 0, end_s: 40 },
        {
          ...first!.clips[0]!,
          id: 'clip_b',
          start_s: 40,
          end_s: 79.7,
          anchor: lineAnchor('line_2', 'Knock-kneed')
        }
      ]
    };
    block.content.voice_tracks = [cut];
    const el = renderAnnotationBlock(block, 'teacher');
    const list = el.querySelector('.block-annotation__voice-note-list')!;
    const top = [...list.children];
    expect(top).toHaveLength(2);
    expect(top[0]!.textContent).toContain('Whole recording · 2 parts');
    const parts = top[1]!.querySelector<HTMLDetailsElement>('details.block-annotation__voice-note-parts')!;
    expect(parts.open).toBe(false);
    expect(parts.querySelectorAll('.block-annotation__voice-note')).toHaveLength(2);
    expect(el.querySelector('summary.block-annotation__voice-notes-title')?.textContent).toBe('Voice notes · 1');
  });

  it('starts playing inside the click, at the note, and shows it is playing', () => {
    const el = renderAnnotationBlock(withVoice(), 'teacher');
    document.body.append(el);
    const mark = el.querySelector<HTMLButtonElement>('.block-annotation__voice-mark')!;
    mark.click();
    expect(play).toHaveBeenCalledTimes(1);
    const audio = el.querySelector('audio')!;
    expect(audio.src).toBe('https://api.example.test/api/media/one/file');
    expect(mark.classList.contains('is-current')).toBe(true);
  });

  it('hides marks and list when the Voice layer is ticked off', () => {
    const el = renderAnnotationBlock(withVoice(), 'teacher');
    document.body.append(el);
    const chip = [...el.querySelectorAll<HTMLButtonElement>('.block-annotation__chip')].find((btn) =>
      btn.textContent?.includes('Voice')
    )!;
    expect(chip).toBeTruthy();
    chip.click();
    expect(el.querySelector('.block-annotation__voice-mark')).toBeNull();
    expect(el.querySelector('.block-annotation__voice-notes')).toBeNull();
    chip.click();
    expect(el.querySelectorAll('.block-annotation__voice-mark')).toHaveLength(2);
  });
});

describe('pinned voice notes', () => {
  it('make the whole take one approved, published clip on the selection', () => {
    const anchor = lineAnchor('line_2', 'Knock-kneed');
    const out = track('three', anchor, 30);
    expect(out.status).toBe('published');
    expect(out.clips).toEqual([
      expect.objectContaining({ start_s: 0, end_s: 30, approved: true, anchor, transcript_text: 'Listen here' })
    ]);
  });

  it('formats times as m:ss', () => {
    expect(formatVoiceTime(79.7)).toBe('1:20');
    expect(formatVoiceTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatVoiceTime(5)).toBe('0:05');
  });

  it('editor offers Voice as a layer to annotate in, alongside the others', () => {
    const block = withVoice();
    const editor = createAnnotationEditor(block, () => undefined);
    document.body.append(editor);
    editor.querySelector<HTMLButtonElement>('.block-editor__annotation-mode [data-value="annotate"]')?.click();
    const picks = [...editor.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-active-layer-btn')].map(
      (btn) => btn.textContent
    );
    expect(picks).toContain('Voice (2)');
    editor.remove();
  });
});

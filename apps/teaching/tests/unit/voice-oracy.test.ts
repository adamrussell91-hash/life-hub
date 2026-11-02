import { describe, expect, it } from 'vitest';
import { applyVoicePick, reciteParts, reciteRounds, voicePick, VOICE_PICKS } from '@/blocks/voice-oracy';
import { clampRecite } from '@/blocks/voice-recite';
import { speakingSeconds } from '@/blocks/voice-student';
import { BlockSchema, type Block } from '@/schemas/block';
import { publishBlockIssues } from '@/schemas/publish-block-issues';

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;
const voice = (content: Record<string, unknown>) =>
  BlockSchema.parse({ schema_version: 1, created_at: '2026-11-02T00:00:00.000Z', updated_at: '2026-11-02T00:00:00.000Z', id: 'v1', type: 'block', block_type: 'audio', variant: 'medium', visibility: 'student_teacher', content: { url: '', ...content } }) as VoiceBlock;
const empty = () => voice({ mode: 'respond', prompt: 'Topic' }).content;

describe('oracy picks', () => {
  it('maps every pill to its stored mode and oracy, and back', () => {
    const expected: Record<string, [string, string | undefined]> = {
      listen: ['listen', undefined],
      respond: ['respond', undefined],
      viva: ['viva', undefined],
      speech: ['viva', 'speech'],
      debate: ['viva', 'debate'],
      presentation: ['viva', 'presentation'],
      recite: ['respond', 'recite']
    };
    for (const pick of VOICE_PICKS) {
      const next = applyVoicePick(empty(), pick.id);
      expect([next.mode, next.oracy]).toEqual(expected[pick.id]);
      expect(voicePick(next)).toBe(pick.id);
    }
  });

  it('fills empty fields with starter content and default times', () => {
    const debate = applyVoicePick(empty(), 'debate');
    expect(debate.scaffold?.map((p) => p.label)).toEqual(['Our case', 'First reason', 'Second reason', 'What they will say', 'Close']);
    expect(debate.stems?.length).toBe(4);
    expect(debate.time_limit_s).toBe(180);
    expect(applyVoicePick(empty(), 'presentation').time_limit_s).toBe(300);
    expect(applyVoicePick(empty(), 'recite').time_limit_s).toBeUndefined();
  });

  it('keeps the teacher’s own work when switching type', () => {
    const own = { ...empty(), scaffold: [{ label: 'My point', weight: 2 }], stems: ['My stem'], time_limit_s: 60 };
    const next = applyVoicePick(own, 'speech');
    expect(next.scaffold).toEqual(own.scaffold);
    expect(next.stems).toEqual(['My stem']);
    expect(next.time_limit_s).toBe(60);
    expect(applyVoicePick({ ...empty(), student_chooses_time: true }, 'speech').time_limit_s).toBeUndefined();
  });

  it('swaps a previous type’s untouched starter, and keeps it stored when leaving oracy', () => {
    const speech = applyVoicePick(empty(), 'speech');
    const debate = applyVoicePick(speech, 'debate');
    expect(debate.scaffold?.[0]?.label).toBe('Our case');
    const viva = applyVoicePick(debate, 'viva');
    expect(viva.oracy).toBeUndefined();
    expect(viva.scaffold?.[0]?.label).toBe('Our case');
  });

  it('leaves old Voice blocks untouched', () => {
    const old = voice({ mode: 'viva', prompt: 'Q', scaffold: [{ label: 'Concept', weight: 1 }] });
    expect(old.content.oracy).toBeUndefined();
    expect(voicePick(old.content)).toBe('viva');
    expect(speakingSeconds(old, { points: [] })).toBe(90);
  });
});

describe('recite', () => {
  it('splits parts on blank lines and keeps line breaks inside a part', () => {
    expect(reciteParts('a\nb\n\n \nc\r\n\r\nd')).toEqual(['a\nb', 'c', 'd']);
    expect(reciteParts('one part\nonly')).toEqual(['one part\nonly']);
    expect(reciteParts('  \n ')).toEqual([]);
    expect(reciteParts(undefined)).toEqual([]);
  });

  it('builds up the parts in the practice order', () => {
    expect(reciteRounds(0)).toEqual([]);
    expect(reciteRounds(1)).toEqual([[0]]);
    expect(reciteRounds(2)).toEqual([[0], [1], [0, 1]]);
    expect(reciteRounds(4)).toEqual([[0], [1], [0, 1], [2], [0, 1, 2], [3], [0, 1, 2, 3]]);
  });

  it('clamps a saved position when the text gets shorter', () => {
    expect(clampRecite({ round: 6, step: 2 }, 3)).toEqual({ round: 2, step: 0 });
    expect(clampRecite({ round: 1, step: 1 }, 3)).toEqual({ round: 1, step: 1 });
    expect(clampRecite({ round: 2, step: 2, ready: true }, 3)).toEqual({ round: 2, step: 2, ready: true });
    expect(clampRecite(undefined, 0)).toEqual({ round: 0, step: 0 });
  });

  it('stops a no-limit recording at the five minutes the server keeps', () => {
    expect(speakingSeconds(voice({ mode: 'respond', oracy: 'recite', recite_text: 'x' }), { points: [] })).toBe(300);
    expect(speakingSeconds(voice({ mode: 'respond', oracy: 'recite', recite_text: 'x', time_limit_s: 60 }), { points: [] })).toBe(60);
    expect(speakingSeconds(voice({ mode: 'respond', prompt: 'Q' }), { points: [] })).toBeNull();
  });

  it('needs a text to publish, and no question', () => {
    const issue = (content: Record<string, unknown>) => publishBlockIssues([voice(content)]);
    expect(issue({ mode: 'respond', oracy: 'recite', recite_text: '  ' })).toMatch(/need a text/);
    expect(issue({ mode: 'respond', oracy: 'recite', recite_text: 'Line one' })).toBeNull();
    expect(issue({ mode: 'viva', oracy: 'speech' })).toMatch(/question/);
  });
});

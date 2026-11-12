import { describe, it, expect } from 'vitest';
import { parseAnnotationSource } from '@/blocks/annotation-text';
import { retextRecording, matchWords } from '@/blocks/explainer/retext';
import { anchorFromWords, tokenise, wordsOfAnchor } from '@/blocks/explainer/words';
import type { ExplainerRecording } from '@/schemas/block';

const OLD = 'The tide keeps returning to the harbour.\n\nThe repeated word again pulls the reader back.';
const words = (src: string) => tokenise(parseAnnotationSource(src, 'prose'));

/** A recording with a highlight on "pulls the reader" and a pointer resting on "harbour". */
function recordingOn(src: string): ExplainerRecording {
  const text = parseAnnotationSource(src, 'prose');
  const w = tokenise(text);
  const at = (word: string) => w.findIndex((x) => x.w === word);
  return {
    status: 'draft',
    clips: [],
    duration_s: 10,
    events: [
      { id: 'm1', t: 1, kind: 'mark', style: 'highlight', anchor: anchorFromWords(text, at('pulls'), at('reader'), w)! },
      { id: 'p1', t: 2, kind: 'pointer', pane: 'text', samples: [[0, at('harbour')]] }
    ]
  } as ExplainerRecording;
}

function shown(rec: ExplainerRecording, src: string) {
  const text = parseAnnotationSource(src, 'prose');
  const w = tokenise(text);
  const mark = rec.events.find((e) => e.id === 'm1')!;
  const range = mark.kind === 'mark' ? wordsOfAnchor(text, mark.anchor, w) : null;
  const ptr = rec.events.find((e) => e.id === 'p1')!;
  return {
    mark: range ? w.slice(range[0], range[1] + 1).map((x) => x.w).join(' ') : null,
    pointer: ptr.kind === 'pointer' ? w[ptr.samples[0]![1]]!.w : null
  };
}

describe('editing the explainer text after recording', () => {
  const cases: Array<[string, string]> = [
    ['a typo fixed in the marked paragraph', 'The tide keeps returning to the harbour.\n\nThe repeated word agian pulls the reader back.'],
    ['a paragraph added above', 'A new opening line comes first.\n\n' + OLD],
    ['a word removed before the mark', 'The tide returning to the harbour.\n\nThe repeated word again pulls the reader back.'],
    ['paragraphs merged', 'The tide keeps returning to the harbour. The repeated word again pulls the reader back.']
  ];
  for (const [what, next] of cases) {
    it(`keeps marks and the pointer on their words: ${what}`, () => {
      const rec = retextRecording(recordingOn(OLD), parseAnnotationSource(OLD, 'prose'), parseAnnotationSource(next, 'prose'));
      expect(shown(rec, next)).toEqual({ mark: 'pulls the reader', pointer: 'harbour' });
    });
  }

  it('matches unchanged words and drops removed ones', () => {
    const map = matchWords(words('a b c d'), words('a x c d'));
    expect(map).toEqual([0, -1, 2, 3]);
  });
});

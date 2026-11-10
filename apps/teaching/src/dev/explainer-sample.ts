/**
 * An invented explainer for the dev preview and the tests: a short model
 * answer, a notes tray and a 40-second recording in two clips.
 */
import { parseAnnotationSource } from '@/blocks/annotation-text';
import { anchorFromWords, tokenise } from '@/blocks/explainer/words';
import { BlockSchema, type AnnotationAnchor, type ExplainerBlock, type ExplainerEvent } from '@/schemas/block';

export const SAMPLE_TEXT = [
  'The writer presents memory as a tide that keeps returning. In the opening image the harbour fills with light, and the repeated word again pulls the reader back to the shore.',
  'My notes listed seven techniques, but a strong answer picks two and explains their effect. Here the tide image and the repetition do the work together.'
].join('\n\n');

const SPOKEN =
  'Let me show you how I get from a page of notes to a one minute answer. First I find the big idea, memory as a tide. Then I keep only the evidence that proves it. Watch what happens to the rest of my list.';

/** Word indices of a phrase in the text. */
export function phrase(words: ReturnType<typeof tokenise>, text: string, from = 0): [number, number] {
  const want = text.split(/\s+/);
  for (let i = from; i + want.length <= words.length; i += 1) {
    if (want.every((w, j) => words[i + j]!.w === w)) return [i, i + want.length - 1];
  }
  throw new Error(`phrase not found: ${text}`);
}

export function sampleExplainer(options: { status?: 'draft' | 'published'; urls?: [string, string] } = {}): ExplainerBlock {
  const text = parseAnnotationSource(SAMPLE_TEXT, 'prose');
  const words = tokenise(text);
  const at = (p: string): AnnotationAnchor => {
    const [a, b] = phrase(words, p);
    return anchorFromWords(text, a, b, words)!;
  };
  const [harbour] = phrase(words, 'harbour');
  const [light] = phrase(words, 'light');
  const [again] = phrase(words, 'again');
  const events: ExplainerEvent[] = [
    { id: 'ev_hl', t: 2, kind: 'mark', style: 'highlight', colour: 'sand', anchor: at('memory as a tide') },
    { id: 'ev_ptr', t: 5, kind: 'pointer', pane: 'text', samples: [[0, harbour], [0.6, light], [1.4, again], [2.2, again]] },
    { id: 'ev_note', t: 8, kind: 'note', anchor: at('repeated word again'), html: '<p>Repetition: the pull of the past</p>', tray_id: 'tray_rep' },
    { id: 'ev_ul', t: 12, kind: 'mark', style: 'underline', colour: 'wave', anchor: at('harbour fills with light') },
    { id: 'ev_p1', t: 15, kind: 'pause', prompt: 'Which two techniques would you keep?' },
    { id: 'ev_strike', t: 20, kind: 'mark', style: 'strike', colour: 'coral', anchor: at('seven techniques') },
    { id: 'ev_erase', t: 24, kind: 'erase', target: 'ev_ul' },
    { id: 'ev_box', t: 28, kind: 'mark', style: 'box', colour: 'navy', anchor: at('two') },
    { id: 'ev_br', t: 31, kind: 'mark', style: 'bracket', colour: 'marine', anchor: at('Here the tide image and the repetition do the work together') },
    { id: 'ev_p2', t: 35, kind: 'pause', prompt: 'Now say your own answer in one minute.' }
  ];
  const spoken = SPOKEN.split(' ');
  const step = 40 / spoken.length;
  const block = {
    id: 'explainer_demo',
    type: 'block',
    block_type: 'explainer',
    variant: 'large',
    visibility: 'student_teacher',
    content: {
      title: 'From notes to a one-minute answer',
      layout: 'text',
      text,
      tray: [
        { id: 'tray_rep', html: '<p>Repetition: the pull of the past</p>' },
        { id: 'tray_unused', html: '<p>Sibilance, maybe</p>' }
      ],
      recording: {
        status: options.status ?? 'published',
        clips: [
          { url: options.urls?.[0] ?? '/sample/explainer-1.webm', mime: 'audio/webm', start_s: 0, duration_s: 22 },
          { url: options.urls?.[1] ?? '/sample/explainer-2.webm', mime: 'audio/webm', start_s: 22, duration_s: 18 }
        ],
        duration_s: 40,
        transcript: { timing: 'word', words: spoken.map((w, i) => ({ w, start: i * step, end: i * step + step * 0.8 })) },
        events
      }
    },
    created_at: '2026-11-10T00:00:00.000Z',
    updated_at: '2026-11-10T00:00:00.000Z',
    schema_version: 1
  };
  return BlockSchema.parse(block) as ExplainerBlock;
}

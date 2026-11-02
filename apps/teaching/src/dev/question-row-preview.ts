import { createQuizQuestionEditor } from '@/blocks/quiz-question';
import { setLessonPicks, setUnitDeep } from '@/deep/context';
import type { Block } from '@/schemas/block';
import '../styles/app.css';

/**
 * Question row preview: "What does this check?" on an auto-marked and a written
 * question. Invented unit only. Open the dev server at /question-row.html.
 */

const deep = [
  { id: 'du_demo01', claim: 'Writers choose a form to make the reader feel what the writer felt.', why: '', dot_points: ['texts:U1', 'texts:R2'], concept_bullets: ['CX1'], shared_piece_ids: [], steps: [{ step: '2a', fill: 'Explain it in one text.' }],
    pieces: [
      { id: 'kp_demo01', text: 'Form can act out an experience', tier: 'essential', dot_point: 'texts:U1' },
      { id: 'kp_demo02', text: 'A short line stops the reader on one image', tier: 'essential', dot_point: 'texts:U1' },
      { id: 'kp_demo03', text: 'Repetition builds a pattern', tier: 'strong' }
    ] }
];
setUnitDeep(deep as never);
setLessonPicks({ focus_pieces: ['kp_demo02'], focus_skills: [] });

const block = (id: string, question: Record<string, unknown>): Block => ({ id, block_type: 'quiz_question', content: { question }, settings: {} }) as unknown as Block;
const auto = block('q_auto', { id: 'q_auto', kind: 'short_answer', prompt: 'What does a short line make the reader do?', marks: 1, accepted: ['stop'] });
const written = block('q_written', { id: 'q_written', kind: 'extended_response', prompt: 'How does the form shape our understanding of belonging?', marks: 8 });

const mount = document.getElementById('mount')!;
for (const b of [auto, written]) mount.append(createQuizQuestionEditor(b as never, (next) => console.log('changed', next), () => [auto, written]));

import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import '../styles/app.css';

/**
 * Faded example preview: a short-sentence block and a whole-passage block, as a student sees them.
 * ?view=student (default) | teacher. ?reset clears saved work. Invented content only.
 */

const params = new URLSearchParams(location.search);
if (params.has('reset')) localStorage.clear();
const view = params.get('view') === 'teacher' ? 'teacher' : 'student';

const block = (id: string, content: unknown): Block =>
  ({ id, type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher', layout: {}, print: {}, settings: {}, schema_version: 1, content }) as unknown as Block;

const short = block('prev_faded_short', {
  prompt: 'One small joining word can change what a sentence tells you. Watch the thinking on the first example, then do more of it yourself on each new one.',
  part_labels: ['Word', 'Where', 'What it tells the reader'],
  steps: [
    { id: 'pf1', extract: 'Eat your dinner or go hungry.', answers: ['or', 'It joins “eat your dinner” and “go hungry”.', 'It sets up a choice: pick one path, and the other happens if you refuse.'], blanks: [],
      question: { prompt: 'Why does the word “or” make this a choice?', choices: ['Only one of the two things will happen, depending on what you do.', 'Both things will happen to you at the same time.', 'The first thing makes the second thing happen.'], correct: 0 } },
    { id: 'pf2', extract: 'Eat your dinner and go hungry.', answers: ['and', 'It joins “eat your dinner” and “go hungry”.', 'There is no choice: both things happen, so eating does not stop the hunger.'], blanks: [2] },
    { id: 'pf3', extract: 'Wear a coat or be cold.', answers: ['or', 'It joins “wear a coat” and “be cold”.', 'It sets up a choice: the coat is the way to avoid being cold.'], blanks: [1, 2] },
    { id: 'pf4', extract: 'We lock the door and the thieves still come.', answers: ['and', 'It joins “we lock the door” and “the thieves still come”.', 'Both things happen: locking the door does not stop the thieves.'], blanks: [0, 1, 2] }
  ],
  criteria: {
    Word: ['Names the single joining word, copied exactly'],
    Where: ['Says which two parts the word joins, using quoted words'],
    'What it tells the reader': ['Says whether the word sets up a choice or says both things happen', 'Says what the first part does, or does not do, to the second']
  }
});

const long = block('prev_faded_long', {
  prompt: 'Find the word that turns the paragraph, and say what it does.',
  part_labels: ['Word', 'What it does'],
  steps: [
    { id: 'pl1', extract: 'The storm came in off the bay by noon, and the boats were already tied. We had boarded the windows and filled the bath with water. Still the roof lifted at the corner, and the rain found every gap we had missed. By evening the kitchen floor was a shallow lake, and we sat on the stairs and listened.',
      answers: ['Still', 'It turns the paragraph: after all the careful preparation, the storm gets in anyway, so the work did not keep them safe.'], blanks: [1] }
  ],
  criteria: { 'What it does': ['Says what came before the word and what comes after', 'Says what the turn means for the people in the paragraph'] }
});

const mount = document.getElementById('mount')!;
for (const b of [short, long]) {
  const card = document.createElement('div');
  card.className = 'lesson-block-card';
  card.style.cssText = 'background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 24px;';
  card.append(renderBlock(b, view));
  mount.append(card);
}

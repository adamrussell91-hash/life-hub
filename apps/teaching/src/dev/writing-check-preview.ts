import '../styles/app.css';
import type { PublicQuestion, WritingLog } from '@/quiz/core';
import { summariseWriting } from '@/quiz/core';
import { el } from '@/quiz/dom';
import { mountQuestionPlayer } from '@/quiz/player';
import { writingPanel } from '@/quiz/writing-replay';

/**
 * Dev preview: the student's written answer box with the writing check on,
 * and the teacher's view of the log it made. ?check=block stops paste.
 * Invented data only.
 */
const mount = document.getElementById('mount') as HTMLElement;
const check = new URLSearchParams(location.search).get('check') === 'block' ? 'block' : 'flag';
const question = { id: 'q1', kind: 'extended_response', prompt: 'How does the ending change the way we read the opening?', marks: 4, has_hint: false } as unknown as PublicQuestion;

let log: WritingLog | null = null;
let text = '';
const teacher = el('div');
const paintTeacher = (): void => {
  teacher.replaceChildren(el('h2', '', 'Teacher sees'));
  if (log) teacher.append(writingPanel(summariseWriting(log, text, check), JSON.parse(JSON.stringify(log)) as WritingLog, text));
};

mount.append(
  el('h2', '', `Student (${check})`),
  mountQuestionPlayer({
    question,
    number: 1,
    writing: { check, log, onLog: (next) => (log = next) },
    onChange: (r) => {
      text = 'text' in r ? r.text : '';
      paintTeacher();
    }
  }),
  teacher
);
const refresh = el('button', 'btn btn--ghost', 'Refresh teacher view');
refresh.addEventListener('click', paintTeacher);
mount.append(refresh);

import type { Lesson } from '@/schemas/lesson';
import type { AssessmentColumn } from '@/markbook/schema';
import { httpMarkbookApi, type MarkbookApi } from '@/markbook/api';
import { navigate } from '@/app/router';
import { button, el } from '@/quiz/dom';
import { bars, findings as findingsChart, levelBars } from './charts';
import { biggestShift, changeLabel, findingEnds, formatShift, levelHeadline, predictionWord, setEvidence, setHeadline } from './model';
import { findingRows } from './steps-pairs';
import { LAB_EXPLAIN_BLOCK_ID, type PublicLab } from './schema';
import type { LabAfter, LabAfterStudent, LabBoard } from './api';

/**
 * After class: the teacher's page for a finished lab. What the class found,
 * how many predictions held, the level-of-language comparison (Pairs design
 * it) and each explanation with a Mark link.
 *
 * The explanations are marked like any handed-in question, which needs one
 * markbook assessment column linked to the lesson's `lab_explain` block.
 * `ensureLabColumn` makes it once: the board calls it when the teacher starts
 * a round, so students can hand in at the Explain step, and again here.
 */

export type LabMarkbook = Pick<MarkbookApi, 'load' | 'saveColumn'>;

/** A markbook column id: 12 lower-case letters and digits. */
function columnId(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (const b of crypto.getRandomValues(new Uint8Array(12))) out += letters[b % letters.length];
  return out;
}

/** The assessment column a lab's explanations are handed in to and marked in. */
export function labColumn(lesson: Pick<Lesson, 'id' | 'title'>, id: string, date: string = new Date().toISOString().slice(0, 10)): AssessmentColumn {
  return {
    id,
    kind: 'assessment',
    title: `${lesson.title || 'Lab'}: Explanation`.slice(0, 120),
    date,
    weight: 0,
    criteria: [{ id: 'labexplain', label: 'Explanation', max: 4, outcomes: [], concepts: [] }],
    piece: { lesson_id: lesson.id, block_id: LAB_EXPLAIN_BLOCK_ID }
  };
}

const ensuring = new Map<string, Promise<string>>();

/**
 * The id of the class's column for this lab's explanations, made if it is
 * missing. Safe to call as often as needed: a column already linked to the
 * block is kept, and two calls at once share one answer.
 */
export function ensureLabColumn(lesson: Pick<Lesson, 'id' | 'title' | 'lab'>, markbook: LabMarkbook = httpMarkbookApi): Promise<string> {
  const classId = lesson.lab?.class_id ?? '';
  if (!classId) return Promise.reject(new Error('Choose the class this lab is for.'));
  const key = `${classId}:${lesson.id}`;
  const running = ensuring.get(key);
  if (running) return running;
  const work = (async () => {
    const view = await markbook.load(classId);
    const had = view.markbook.columns.find((c) => c.kind === 'assessment' && c.piece?.lesson_id === lesson.id && c.piece.block_id === LAB_EXPLAIN_BLOCK_ID);
    if (had) return had.id;
    const column = labColumn(lesson, columnId());
    await markbook.saveColumn(classId, column);
    return column.id;
  })().finally(() => ensuring.delete(key));
  ensuring.set(key, work);
  return work;
}

const muted = (text: string): HTMLElement => el('p', 'lab-muted', text);
const points = (n: number): string => `${n} ${n === 1 ? 'point' : 'points'}`;

/** What the class found, in a sentence or two. */
export function classFinding(lab: PublicLab, board: Pick<LabBoard, 'results' | 'findings'>): string {
  if (lab.level !== 'pairs') {
    if (!board.results || board.results.readers === 0) return 'No readings came in, so there is no finding yet.';
    const options = lab.options ?? [];
    return `${setHeadline({ options, judge: lab.judge, result: board.results })} ${setEvidence({ options, judge: lab.judge, result: board.results })}`;
  }
  const trials = board.findings?.trials ?? [];
  if (!trials.length) return 'Every pair kept the original, so there are no trials to compare.';
  const top = biggestShift(trials)!;
  const moved = trials.filter((t) => t.verdict !== 0 && !t.thin).length;
  return `${changeLabel(top.desc)} moved readers most: ${formatShift(top.shift)}. ${moved} of ${trials.length} ${trials.length === 1 ? 'trial' : 'trials'} shifted the rating by ${points(board.findings!.threshold)} or more.`;
}

/** How many predictions held. A result too close to call holds nobody's. */
export function predictionsHeld(lab: PublicLab, board: Pick<LabBoard, 'results' | 'findings'>): string {
  if (lab.level === 'pairs') {
    const trials = board.findings?.trials ?? [];
    if (!trials.length) return 'No pair ran a trial.';
    return `${trials.filter((t) => t.held).length} of ${trials.length} ${trials.length === 1 ? 'pair' : 'pairs'} predicted their result.`;
  }
  const r = board.results;
  if (!r) return 'No predictions to count yet.';
  const made = r.predictions.reduce((a, b) => a + b, 0);
  if (!made) return 'Nobody locked in a prediction.';
  if (!r.win) return `Too close to call, so none of the ${made} predictions counts as held.`;
  const held = r.predictions[r.top] ?? 0;
  return `${held} held, ${made - held} overturned.`;
}

/** A link that moves inside the app, and opens a new tab when asked to. */
function link(text: string, path: string, className: string): HTMLAnchorElement {
  const a = el('a', className, text);
  a.setAttribute('href', path);
  a.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(path);
  });
  return a;
}

/** Where one student's explanation is marked. */
export const markPath = (classId: string, column: string, studentId: string): string =>
  `/mark/${encodeURIComponent(classId)}/${encodeURIComponent(column)}?student=${encodeURIComponent(studentId)}`;

/** What a student (or, for Pairs design it, their pair) predicted, and whether it held. */
function predicted(lab: PublicLab, board: LabBoard, s: LabAfterStudent): string {
  if (s.pred === null) return 'No prediction';
  if (lab.level === 'pairs') {
    const trial = board.findings?.trials.find((t) => t.number === s.pair);
    return `Predicted ${predictionWord(s.pred, lab.trait)}${trial?.held ? ', held' : ''}`;
  }
  const held = board.results?.win === true && board.results.top === s.pred;
  return `Predicted ${(lab.options?.[s.pred] ?? '').toLowerCase()}${held ? ', held' : ''}`;
}

/** Pairs design it: the pair's change and what it did. */
function trialLine(board: LabBoard, s: LabAfterStudent): string | null {
  if (s.pair === null) return null;
  const trial = board.findings?.trials.find((t) => t.number === s.pair);
  return trial ? `Pair ${s.pair}: ${trial.desc.join(', ')}, shift ${formatShift(trial.shift)}` : `Pair ${s.pair}: kept the original`;
}

export type AfterClassInput = {
  lab: PublicLab;
  board: LabBoard;
  /** Null while the list is loading. */
  after: LabAfter | null;
  /** The markbook column the explanations are marked in. Null until it is known. */
  columnId: string | null;
  /** Why the column could not be made, when it could not. */
  columnProblem?: string;
  onAgain(): void;
  /** Past rounds, from blocks/past-rounds. */
  rounds: HTMLElement;
};

/** The explanations, one row per student who took part: initials, their prediction, the start of the answer and Mark. */
export function explanationList(o: Pick<AfterClassInput, 'lab' | 'board' | 'after' | 'columnId' | 'columnProblem'>): HTMLElement {
  const card = el('section', 'lab-card lab-after');
  card.setAttribute('aria-label', 'Explanations to mark');
  card.append(el('h2', '', 'Explanations to mark'));
  if (o.columnProblem) {
    const problem = el('p', 'lab-err', o.columnProblem);
    problem.setAttribute('role', 'alert');
    card.append(problem);
  }
  if (!o.after) {
    card.append(muted('Loading the explanations…'));
    return card;
  }
  const students = o.after.students;
  const handed = students.filter((s) => s.handed_in_at).length;
  if (!students.length) {
    card.append(muted('Nobody joined this round.'));
    return card;
  }
  card.append(muted(`${handed} of ${students.length} handed in.${o.lab.notes_on ? ' Each opens with the student’s lab notes beside it.' : ''}`));
  const list = el('ul', 'lab-after__list');
  // Handed-in answers first, then by initials.
  for (const s of [...students].sort((a, b) => Number(!!b.handed_in_at) - Number(!!a.handed_in_at))) {
    const row = el('li', 'lab-after__row');
    row.dataset.student = s.student_id;
    const who = el('div', 'lab-after__who');
    who.append(el('strong', '', s.initials || 'A student'), el('span', 'lab-muted', predicted(o.lab, o.board, s)));
    const trial = o.lab.level === 'pairs' ? trialLine(o.board, s) : null;
    if (trial) who.append(el('span', 'lab-muted', trial));
    if (o.lab.notes_on) who.append(el('span', 'lab-muted', `${s.notes} lab ${s.notes === 1 ? 'note' : 'notes'}`));
    const words = s.handed_in_at ? el('p', 'lab-after__words', s.explanation || 'Handed in with nothing written.') : el('p', 'lab-after__words lab-muted', 'Not handed in yet.');
    row.append(who, words);
    if (s.handed_in_at && o.columnId && o.after.class_id) {
      const mark = link('Mark', markPath(o.after.class_id, o.columnId, s.student_id), 'btn btn--secondary lab-after__mark');
      mark.setAttribute('aria-label', `Mark ${s.initials || 'this student'}’s explanation`);
      row.append(mark);
    }
    list.append(row);
  }
  card.append(list);
  return card;
}

/** The After class page: what the lab found, then the explanations to mark. */
export function afterClass(o: AfterClassInput): HTMLElement[] {
  const { lab, board } = o;
  const found = el('section', 'lab-card lab-after');
  found.setAttribute('aria-label', 'What the lab found');
  const rows = el('dl', 'lab-rows');
  const row = (label: string, ...children: Array<HTMLElement | null>): void => {
    const r = el('div', 'lab-row');
    const dd = el('dd');
    dd.append(...children.filter((c): c is HTMLElement => c !== null));
    r.append(el('dt', '', label), dd);
    rows.append(r);
  };
  if (lab.level === 'pairs' && lab.claim) row('Claim tested', el('p', '', lab.claim));
  const chart = lab.level === 'pairs'
    ? board.findings?.trials.length ? findingsChart({ rows: findingRows(board.findings.trials), ends: findingEnds(lab.trait) }) : null
    : board.results && board.results.readers > 0 ? bars({ labels: lab.options ?? [], values: board.results.values, top: board.results.win ? board.results.top : -1, scaleMax: lab.judge === 'rate' ? 10 : 0 }) : null;
  row('Class finding', el('p', '', classFinding(lab, board)), chart);
  row('Predictions', el('p', '', predictionsHeld(lab, board)));
  if (lab.level === 'pairs' && board.levels?.length) row('Level of language', el('p', '', `${levelHeadline(board.levels)}.`), levelBars(board.levels));
  row('Lab notes', el('p', '', lab.notes_on ? 'Kept at every step. Open an explanation to read that student’s notes beside it.' : 'Off for this lab.'));
  if (board.debrief) row('My debrief notes', el('p', '', board.debrief));
  const again = button('Run it again', 'secondary', o.onAgain);
  again.dataset.act = 'again';
  const foot = el('div', 'lab-board__start');
  foot.append(again, o.rounds);
  found.append(
    el('h2', '', 'What the lab found'),
    rows,
    muted('Run it again starts a fresh round on the same lab. This round stays in Past rounds.'),
    foot
  );
  return [found, explanationList(o)];
}

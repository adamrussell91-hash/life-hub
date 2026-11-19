import { el } from '@/quiz/dom';
import { changeLabel, formatShift, predictionWord } from './model';
import { notesList } from './notes';
import { LAB_EXPLAIN_BLOCK_ID } from './schema';
import { labTeacherApi, type LabStudentRecord } from './api';
import './lab.css';

/**
 * Beside a lab's Explain answer in marking: the student's lab notes, what
 * they predicted and, for Pairs design it, their pair's trial. It shows when
 * the lab kept notes or the student's pair ran a trial, and stays empty for
 * every other piece of work.
 */

/** True for the one block a lab's explanation is handed in through. */
export const isLabExplain = (piece: { block_id: string } | undefined | null): boolean => piece?.block_id === LAB_EXPLAIN_BLOCK_ID;

const line = (label: string, text: string): HTMLElement => {
  const p = el('p');
  p.append(el('span', 'lab-muted', `${label} `), text);
  return p;
};

/** The panel's contents for one student's record. Empty when lab notes are off and the student's pair has no trial. */
export function labRecordNodes(data: LabStudentRecord): HTMLElement[] {
  const lab = data.lab;
  if (!lab) return [];
  const notes = lab.notes_on ? notesList(data.record?.notes ?? {}, lab.steps, 'Lab notes') : null;
  const trial = data.trial ?? null;
  if (!notes && !trial) return [];
  const nodes: HTMLElement[] = [el('h3', 'mk-side__title', 'From the lab')];
  // The prediction: the student's own, or their pair's for Pairs design it.
  if (lab.level === 'pairs') {
    const pred = data.pair?.record?.pred;
    if (pred === -1 || pred === 0 || pred === 1) nodes.push(line('Their pair predicted:', `${predictionWord(pred, lab.trait)}.`));
  } else {
    const pred = data.record?.pred;
    const option = typeof pred === 'number' ? lab.options[pred] : undefined;
    if (option) nodes.push(line('Predicted:', `${option}${data.record?.reason ? `, because ${data.record.reason}` : ''}`));
  }
  if (trial) {
    const feature = trial.feature !== null ? lab.features[trial.feature] : undefined;
    nodes.push(line('Their trial:', `${changeLabel(trial.desc)}. Shift ${formatShift(trial.shift)} from ${trial.n} ${trial.n === 1 ? 'reader' : 'readers'}${trial.pred !== null ? (trial.held ? ', as predicted' : ', against their prediction') : ''}.`));
    if (feature) nodes.push(line('Named:', `${feature.name} (${feature.level} level)`));
  } else if (lab.level === 'pairs' && data.pair) {
    nodes.push(line('Their trial:', data.pair.change.length ? `${changeLabel(data.pair.change)}. The readings are still to come.` : 'Their pair kept the original.'));
  }
  if (notes) nodes.push(notes);
  return nodes;
}

/**
 * The marking view's lab panel for one piece. It starts empty and fills once
 * the student's record is back; a record that can't be read leaves it empty.
 */
export function labRecordAside(lessonId: string, studentId: string, load: (lessonId: string, studentId: string) => Promise<LabStudentRecord> = (l, s) => labTeacherApi(l).student(s)): HTMLElement {
  const box = el('div', 'lab-record');
  void load(lessonId, studentId).then(
    (data) => box.replaceChildren(...labRecordNodes(data)),
    () => undefined
  );
  return box;
}

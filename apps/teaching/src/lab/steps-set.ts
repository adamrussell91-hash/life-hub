import type { Block } from '@/schemas/block';
import { renderBlock } from '@/blocks/render';
import { button, el } from '@/quiz/dom';
import { bars } from './charts';
import { explainQuestion, setEvidence, setHeadline } from './model';
import { noteBox, notedLine, notesPanel } from './notes';
import { LAB_EXPLAIN_BLOCK_ID, type LabLevel, type LabStep, type PublicLab } from './schema';
import type { LabStepContext, LabStepView } from './player';

/**
 * The two supplied levels' screens: Question, Predict, Test, Result and
 * Explain. "You supply it" runs all five; "Students write it" shares
 * Question, Predict, Result and Explain, and Task 3 adds its Make and its
 * pick-one Test here.
 */

const WAIT = 'Waiting for your teacher.';
const wait = (): HTMLElement => el('p', 'lab__note', WAIT);
const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
const muted = (text: string): HTMLElement => el('p', 'lab-muted', text);
const options = (lab: PublicLab): string[] => lab.options ?? [];

/** "Same" and "Changed": what stays plain and what is lilac. */
export function factsBlock(lab: PublicLab): HTMLElement {
  const box = el('div', 'lab-facts');
  if (lab.same) {
    const same = el('p');
    same.append(el('span', 'lab-facts__label', 'Same'), el('span', '', lab.same));
    box.append(same);
  }
  const changed = el('p');
  changed.append(el('span', 'lab-facts__label', 'Changed'));
  for (const option of options(lab)) changed.append(el('span', 'lab-chip lab-chip--small', option));
  box.append(changed);
  return box;
}

/** The question students predict the answer to. */
export function predictQuestion(lab: PublicLab): string {
  return lab.judge === 'pick' ? 'Which one will readers choose most?' : 'Which version will score highest?';
}

const question: LabStepView = (ctx) => {
  const { lab } = ctx;
  const nodes: HTMLElement[] = [el('h2', '', lab.question), factsBlock(lab)];
  if (lab.why) {
    const why = el('p');
    why.append(el('span', 'lab-muted', 'Why we are testing it: '), lab.why);
    nodes.push(why);
  }
  nodes.push(muted(
    lab.level === 'students' ? 'You will write one version for each option. Readers choose between them.'
      : lab.judge === 'pick' ? 'You will read every version and choose one.'
        : 'You will read one version and rate it.'
  ));
  const note = noteBox('Question', ctx.notes);
  nodes.push(...(note ? [note] : [wait()]));
  return nodes;
};

const predict: LabStepView = (ctx) => {
  const { lab, me, draft } = ctx;
  if (me.pred !== null) {
    const nodes: HTMLElement[] = [el('h2', '', `Locked in: ${lower(options(lab)[me.pred] ?? '')}`)];
    if (me.reason) nodes.push(el('p', '', `Because ${me.reason}`));
    const said = notedLine('Predict', ctx.notes);
    if (said) nodes.push(said);
    nodes.push(wait());
    return nodes;
  }
  const chosen = typeof draft.pred === 'number' ? draft.pred : null;
  const chips = el('div', 'lab-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Your prediction');
  const lock = button('Lock it in', 'primary', () => {
    if (typeof draft.pred !== 'number') return;
    lock.disabled = true;
    void ctx.act(() => ctx.client.predict(draft.pred as number, String(draft.reason ?? '')));
  });
  lock.disabled = chosen === null;
  options(lab).forEach((option, i) => {
    const chip = el('button', `lab-chip${chosen === i ? ' is-on' : ''}`, option);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(chosen === i));
    chip.addEventListener('click', () => {
      draft.pred = i;
      for (const other of chips.querySelectorAll('button')) {
        other.classList.toggle('is-on', other === chip);
        other.setAttribute('aria-pressed', String(other === chip));
      }
      lock.disabled = false;
    });
    chips.append(chip);
  });
  const reason = el('textarea', 'lab-reason');
  reason.rows = 2;
  reason.maxLength = 300;
  reason.placeholder = 'Because…';
  reason.setAttribute('aria-label', 'Why you predict this');
  reason.value = String(draft.reason ?? '');
  reason.addEventListener('input', () => { draft.reason = reason.value; });
  return [el('h2', '', predictQuestion(lab)), muted(`Readers will answer: ${lab.judge_question}`), chips, reason, lock];
};

const test: LabStepView = (ctx) => {
  const { lab, status, draft } = ctx;
  const reading = status.reading;
  if (!reading) return [el('h2', '', lab.judge_question), wait()];
  if (!reading.item) return [el('h2', '', lab.judge === 'pick' ? 'Choice sent' : 'Rating sent'), wait()];
  const item = reading.item;
  if (item.kind === 'text') {
    const piece = el('div', 'lab-piece', item.text);
    const range = el('input');
    range.type = 'range';
    range.min = '0';
    range.max = '10';
    range.step = '1';
    range.value = String(typeof draft.rating === 'number' ? draft.rating : 5);
    range.setAttribute('aria-label', `${lab.judge_question} From 0, ${lab.ends?.[0] ?? 'low'}, to 10, ${lab.ends?.[1] ?? 'high'}.`);
    range.addEventListener('input', () => { draft.rating = Number(range.value); });
    const ends = el('div', 'lab-ends');
    ends.append(el('span', '', lab.ends?.[0] ?? ''), el('span', '', lab.ends?.[1] ?? ''));
    const scale = el('div', 'lab-scale');
    scale.append(range, ends);
    const send = button('Send', 'primary', () => {
      send.disabled = true;
      void ctx.act(() => ctx.client.rate(reading.index, Number(range.value)));
    });
    const nodes: HTMLElement[] = [el('h2', '', lab.judge_question), piece, scale];
    if (reading.total > 1) nodes.push(muted(`Text ${reading.index + 1} of ${reading.total}.`));
    nodes.push(send);
    return nodes;
  }
  // Every version, in a dealt order, with the option names hidden.
  const nodes: HTMLElement[] = [el('h2', '', lab.judge_question)];
  item.pieces.forEach((text, position) => {
    const piece = el('button', 'lab-piece');
    piece.type = 'button';
    piece.append(el('small', '', 'ABCDE'[position] ?? ''), text);
    piece.addEventListener('click', () => {
      for (const other of nodes) if (other instanceof HTMLButtonElement) other.disabled = true;
      piece.classList.add('is-on');
      void ctx.act(() => ctx.client.pick(reading.index, position));
    });
    nodes.push(piece);
  });
  nodes.push(muted('Tap one.'));
  return nodes;
};

const result: LabStepView = (ctx) => {
  const { lab, me, status } = ctx;
  const results = status.results;
  if (!results) return [el('h2', '', 'The result is on its way'), wait()];
  const labels = options(lab);
  const nodes: HTMLElement[] = [
    el('h2', '', setHeadline({ options: labels, judge: lab.judge, result: results, mine: me.pred })),
    bars({ labels, values: results.values, top: results.win ? results.top : -1, scaleMax: lab.judge === 'rate' ? 10 : 0 }),
    muted(lab.judge === 'pick'
      ? `${results.values.reduce((a, b) => a + b, 0)} choices from ${results.readers} ${results.readers === 1 ? 'reader' : 'readers'}.`
      : `Average out of 10, from ${results.readers} ${results.readers === 1 ? 'reader' : 'readers'}.`),
    muted(results.win ? `Ahead by ${results.lead}. That counts as a win.` : `Ahead by ${results.lead}. A win needs ${lab.threshold} or more.`)
  ];
  const read = me.read?.[0];
  if (read) {
    const mine = el('p');
    const name = lower(labels[read.version] ?? '');
    if (read.value === null) mine.append(el('strong', '', 'You chose'), ` the ${name} version.`);
    else mine.append(el('strong', '', 'You read'), ` the ${name} version and gave it ${read.value}.`);
    nodes.push(mine);
  }
  const note = noteBox('Result', ctx.notes);
  if (note) nodes.push(note);
  return nodes;
};

/** The Explain answer: the lesson's seeded written-question block, drawn by the normal block renderer so it saves and hands in like any other. */
export function explainBlock(ctx: Pick<LabStepContext, 'lesson' | 'classId'>): HTMLElement | null {
  const block = ctx.lesson.blocks.find((b) => b.id === LAB_EXPLAIN_BLOCK_ID) as Block | undefined;
  if (!block) return null;
  const box = el('div', 'lab-explain');
  box.append(renderBlock(block, 'student', { lessonId: ctx.lesson.lesson_id, classId: ctx.classId, pageBlocks: ctx.lesson.blocks }));
  return box;
}

const explain: LabStepView = (ctx) => {
  const { lab, me, status, round } = ctx;
  const labels = options(lab);
  const handed = me.done.Explain === true;
  const nodes: HTMLElement[] = [el('h2', '', handed ? 'Handed in' : explainQuestion({ level: lab.level, judge: lab.judge, options: labels, prompt: lab.explain_prompt, result: status.results }))];
  if (status.results) nodes.push(muted(setEvidence({ options: labels, judge: lab.judge, result: status.results })));
  if (lab.why && !handed) {
    const why = el('p');
    why.append(el('span', 'lab-muted', 'Why we tested it: '), lab.why);
    nodes.push(why);
  }
  const panel = notesPanel(ctx.notes, round.steps);
  if (panel) nodes.push(panel);
  const block = explainBlock(ctx);
  if (!block) return [...nodes, el('p', 'lab__note', 'This lab was published before its answer box was added. Ask your teacher to publish it again.')];
  nodes.push(block);
  const send = button(handed ? 'Hand in again' : 'Hand in', handed ? 'secondary' : 'primary', () => {
    send.disabled = true;
    // The writing is saved as it is typed; a hand-in that can't go through yet still counts the step as done.
    void ctx.handIn().catch(() => false).then(() => ctx.act(() => ctx.client.explain()));
  });
  nodes.push(send);
  if (handed) nodes.push(muted('Your explanation is with your teacher. You can change it and hand it in again.'));
  return nodes;
};

/** Called once by the player: puts the supplied levels' steps in its registry. */
export function registerSetSteps(register: (level: LabLevel, step: LabStep, view: LabStepView) => void): void {
  for (const level of ['supplied', 'students'] as const) {
    register(level, 'Question', question);
    register(level, 'Predict', predict);
    register(level, 'Result', result);
    register(level, 'Explain', explain);
  }
  register('supplied', 'Test', test);
}

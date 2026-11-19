import type { Block } from '@/schemas/block';
import { renderBlock } from '@/blocks/render';
import { button, el } from '@/quiz/dom';
import { bars } from './charts';
import { explainQuestion, setEvidence, setHeadline } from './model';
import { noteAllows, noteBox, notedLine, notesPanel } from './notes';
import { LAB_EXPLAIN_BLOCK_ID, type LabLevel, type LabStep, type PublicLab } from './schema';
import type { LabStepContext, LabStepView } from './player';

/**
 * The two supplied levels' screens: Question, Predict, Test, Result and
 * Explain. "You supply it" runs all five; "Students write it" shares them
 * and adds Make, where each student writes one version per option.
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

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const count = (n: number, one: string, many: string): string => `${NUMBER_WORDS[n] ?? String(n)} ${n === 1 ? one : many}`;

/** Students write it: one box per option, one at a time. Each version saves as the student moves on. */
const make: LabStepView = (ctx) => {
  const { lab, me, draft } = ctx;
  const labels = options(lab);
  const written = me.writing ?? [];
  const firstEmpty = labels.findIndex((_, i) => !(written[i] ?? '').trim());
  const at = typeof draft.at === 'number' ? draft.at : firstEmpty;
  if (at < 0 || at >= labels.length) {
    const nodes: HTMLElement[] = [el('h2', '', `${count(labels.length, 'version', 'versions')} written`)];
    const said = notedLine('Make', ctx.notes);
    if (said) nodes.push(said);
    const change = button('Change a version', 'secondary', () => {
      draft.at = 0;
      ctx.repaint();
    });
    nodes.push(wait(), change);
    return nodes;
  }
  const texts = (draft.texts ??= [...written]) as string[];
  const last = at === labels.length - 1;
  const heading = el('h2');
  heading.append(lab.task ? `${lab.task} ` : '', 'Lean on ', el('span', 'lab-var', lower(labels[at]!)), '.');
  const box = el('textarea', 'lab-reason lab-prose');
  box.rows = 5;
  box.maxLength = 2000;
  box.setAttribute('aria-label', `Your ${lower(labels[at]!)} version`);
  box.value = texts[at] ?? '';
  box.addEventListener('input', () => { texts[at] = box.value; });
  const nodes: HTMLElement[] = [heading];
  if (lab.same) nodes.push(muted(`Keep the same: ${lab.same}`));
  nodes.push(box, muted(`Version ${at + 1} of ${labels.length}.`));
  const note = last ? noteBox('Make', ctx.notes) : null;
  if (note) nodes.push(note);
  const go = button(last ? 'Finish' : `Next: ${lower(labels[at + 1]!)}`, 'primary', () => {
    const text = box.value.trim();
    if (!text) return void box.focus();
    if (last && !noteAllows('Make', ctx.notes)) return;
    go.disabled = true;
    // The next box opens once this one is saved; a save that fails leaves the student here with their words.
    void ctx.act(async () => {
      const next = await ctx.client.write(at, text);
      draft.at = at + 1;
      return next;
    });
  });
  nodes.push(go);
  if (at > 0) {
    nodes.push(button(`Back to ${lower(labels[at - 1]!)}`, 'secondary', () => {
      draft.at = at - 1;
      ctx.repaint();
    }));
  }
  return nodes;
};

const test: LabStepView = (ctx) => {
  const { lab, status, draft } = ctx;
  const reading = status.reading;
  const writers = lab.level === 'students';
  if (!reading) return [el('h2', '', lab.judge_question), ...(writers && status.round?.step_name === 'Test' ? [muted('There is no writing to read yet.')] : []), wait()];
  if (!reading.item) {
    const nodes: HTMLElement[] = [el('h2', '', writers ? `${count(reading.total, 'writer', 'writers')} read` : lab.judge === 'pick' ? 'Choice sent' : 'Rating sent')];
    const note = noteBox('Test', ctx.notes);
    nodes.push(...(note ? [note] : [wait()]));
    return nodes;
  }
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
  nodes.push(muted(writers ? `Writer ${reading.index + 1} of ${reading.total}. Tap one.` : 'Tap one.'));
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
  const own = me.own;
  if (own && own.readers > 0) {
    // How the student's own writing went: every version, with the one readers chose most first.
    const best = own.chosen.indexOf(Math.max(...own.chosen));
    const mine = el('p');
    mine.append(el('strong', '', 'Your writing: '), `${own.chosen[best]} of your ${own.readers} ${own.readers === 1 ? 'reader' : 'readers'} chose your ${lower(labels[best] ?? '')} version.`);
    nodes.push(mine);
    const rest = own.chosen.map((n, i) => ({ n, i })).filter((x) => x.i !== best).map((x) => `${labels[x.i]} ${x.n}`);
    if (rest.length) nodes.push(muted(`Your other versions: ${rest.join(', ')}.`));
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
    register(level, 'Test', test);
  }
  register('students', 'Make', make);
}

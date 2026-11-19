import { button, el } from '@/quiz/dom';
import { designBench, markedPoem, pane, poem } from './bench';
import { findings as findingsChart, reading, type FindingRow } from './charts';
import { applyEdits, biggestShift, changeLabel, describeEdits, explainQuestion, formatShift, markEdits, predictionWord, tokenise, type Edit, type PairPrediction } from './model';
import { noteAllows, noteBox, notedLine } from './notes';
import type { LabLevel, LabStep } from './schema';
import type { LabStepContext, LabStepView } from './player';
import type { LabFindings, LabOpenTrial } from './api';
import { count, explainAnswer, ratingScale } from './steps-set';

/**
 * Pairs design it, on a student's device: Question, Design (the bench),
 * Predict, Test, Result and Explain. The version, its place on the bench and
 * the prediction belong to the pair; ratings and lab notes are each
 * student's own. Name it is Task 5's.
 */

const wait = (): HTMLElement => el('p', 'lab__note', 'Waiting for your teacher.');
const muted = (text: string): HTMLElement => el('p', 'lab-muted', text);
const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const controlOf = (ctx: LabStepContext) => tokenise(ctx.status.control ?? '');
const labelled = (label: string, text: string): HTMLElement => {
  const line = el('p');
  line.append(el('span', 'lab-muted', `${label} `), text);
  return line;
};

/** The findings chart's rows from a list of trials. A row is pale when its shift is under the threshold or it had under four readers. */
export function findingRows(trials: Array<Pick<LabOpenTrial, 'desc' | 'shift' | 'n' | 'verdict' | 'thin'> & { mine?: boolean }>): FindingRow[] {
  return trials.map((t) => ({ label: changeLabel(t.desc), shift: t.shift, n: t.n, pale: t.verdict === 0 || t.thin, thin: t.thin, mine: t.mine === true }));
}
/** What a bar to the left of the centre line and a bar to the right mean. */
export const FINDING_ENDS: [string, string] = ['Rated lower', 'Rated higher'];

const question: LabStepView = (ctx) => {
  const { lab } = ctx;
  const nodes: HTMLElement[] = [el('h2', '', lab.question)];
  if (lab.claim) nodes.push(labelled('Claim to test:', lab.claim));
  if (lab.why) nodes.push(labelled('Why we are testing it:', lab.why));
  nodes.push(pane(null, [poem(applyEdits(controlOf(ctx), {}).lines)]));
  const note = noteBox('Question', ctx.notes);
  nodes.push(...(note ? [note] : [wait()]));
  return nodes;
};

/** The words for a student whose pair has no version of its own. */
const reader = (heading: string, line: string): HTMLElement[] => [el('h2', '', heading), muted(line), wait()];

const design: LabStepView = (ctx) => {
  const { status, draft } = ctx;
  const pair = status.pair;
  if (!pair) return reader('You are a reader in this lab', 'The pairs are each changing one thing in the text. You will read their versions next.');
  const tokens = controlOf(ctx);
  if (pair.ready) {
    const nodes: HTMLElement[] = [el('h2', '', 'On the bench'), pane(null, [markedPoem(markEdits(tokens, pair.edit))], true), labelled('Your change:', `${describeEdits(tokens, pair.edit).join('; ')}.`)];
    const said = notedLine('Design', ctx.notes);
    if (said) nodes.push(said);
    nodes.push(wait());
    const back = button('Take it off the bench', 'secondary', () => {
      back.disabled = true;
      void ctx.act(() => ctx.client.ready(false));
    });
    back.dataset.act = 'unready';
    nodes.push(back);
    return nodes;
  }
  // What the pair sees is its own last tap straight away; the saved edit takes over once the save is back.
  const edit = (draft.edit as Edit | undefined) ?? pair.edit;
  const sel = typeof draft.sel === 'number' ? draft.sel : -1;
  const save = (next: Edit): void => {
    draft.edit = next;
    delete draft.rep;
    ctx.repaint();
    void ctx.act(() => ctx.client.bench(next)).then(() => {
      if (draft.edit === next) delete draft.edit;
    });
  };
  return [
    el('h2', '', 'Change one thing'),
    ...designBench({
      tokens, edit, sel,
      replacement: typeof draft.rep === 'string' ? draft.rep : undefined,
      onSelect: (index) => {
        draft.sel = sel === index ? -1 : index;
        delete draft.rep;
        ctx.repaint();
      },
      onReplacement: (text) => { draft.rep = text; },
      onEdit: (next) => {
        if (Object.keys(next).length === 0) draft.sel = -1;
        save(next);
      },
      onReady: () => {
        if (!noteAllows('Design', ctx.notes)) return;
        // The edit goes with it, so what is on the bench is what the pair is looking at.
        void ctx.act(async () => {
          await ctx.client.bench(edit);
          return ctx.client.ready(true);
        });
      },
      note: noteBox('Design', ctx.notes)
    })
  ];
};

const PREDICTIONS: PairPrediction[] = [-1, 0, 1];

const predict: LabStepView = (ctx) => {
  const { lab, status, draft } = ctx;
  const pair = status.pair;
  if (!pair || !pair.trial) {
    return reader('You are a reader this round', pair ? 'Your pair kept the original, so the prediction is for the other pairs to make. You will read their versions next.' : 'The pairs are predicting what their changes will do. You will read their versions next.');
  }
  if (pair.pred !== null) {
    const nodes: HTMLElement[] = [el('h2', '', `Locked in: ${predictionWord(pair.pred)}`)];
    const said = notedLine('Predict', ctx.notes);
    if (said) nodes.push(said);
    nodes.push(wait());
    return nodes;
  }
  const desc = describeEdits(controlOf(ctx), pair.edit);
  const chosen = typeof draft.pred === 'number' ? draft.pred : null;
  const chips = el('div', 'lab-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Your pair’s prediction');
  const lock = button('Lock it in', 'primary', () => {
    if (typeof draft.pred !== 'number' || !noteAllows('Predict', ctx.notes)) return;
    lock.disabled = true;
    void ctx.act(() => ctx.client.pairPredict(draft.pred as PairPrediction));
  });
  lock.disabled = chosen === null;
  for (const value of PREDICTIONS) {
    const chip = el('button', `lab-chip${chosen === value ? ' is-on' : ''}`, upper(predictionWord(value)));
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(chosen === value));
    chip.addEventListener('click', () => {
      draft.pred = value;
      for (const other of chips.querySelectorAll('button')) {
        other.classList.toggle('is-on', other === chip);
        other.setAttribute('aria-pressed', String(other === chip));
      }
      lock.disabled = false;
    });
    chips.append(chip);
  }
  const nodes: HTMLElement[] = [el('h2', '', `If we ${desc.join(', ')}, readers will rate it…`), muted(`Readers answer: ${lab.judge_question}`), chips];
  const note = noteBox('Predict', ctx.notes);
  if (note) nodes.push(note);
  nodes.push(lock, muted('One prediction for your pair. Whoever locks it in, locks it for both of you.'));
  return nodes;
};

const test: LabStepView = (ctx) => {
  const { lab, status, draft } = ctx;
  const item = status.reading;
  if (!item) return [el('h2', '', lab.judge_question), wait()];
  if (!item.item) {
    const nodes: HTMLElement[] = [el('h2', '', `${count(item.total, 'version', 'versions')} rated`)];
    const note = noteBox('Test', ctx.notes);
    nodes.push(...(note ? [note] : [wait()]));
    return nodes;
  }
  if (item.item.kind !== 'lines') return null;
  const { scale, range } = ratingScale(lab, draft);
  const send = button('Send', 'primary', () => {
    send.disabled = true;
    delete draft.rating;
    void ctx.act(() => ctx.client.rate(item.index, Number(range.value)));
  });
  return [
    el('h2', '', lab.judge_question),
    pane(null, [poem(item.item.lines)]),
    scale,
    muted(`Version ${item.index + 1} of ${item.total}. Some are changed and some are the original.`),
    send
  ];
};

/** "Your change moved the rating lower. As you predicted." */
export function resultHeadline(mine: NonNullable<LabFindings['mine']>): string {
  const first = mine.verdict === 0 ? 'Your change made no clear difference.' : `Your change moved the rating ${predictionWord(mine.verdict)}.`;
  if (mine.pred === null) return first;
  return `${first} ${mine.held ? 'As you predicted.' : `You predicted ${predictionWord(mine.pred)}.`}`;
}

const result: LabStepView = (ctx) => {
  const found = ctx.status.findings;
  if (!found) return [el('h2', '', 'The result is on its way'), wait()];
  const nodes: HTMLElement[] = [];
  const points = `${found.threshold} ${found.threshold === 1 ? 'point' : 'points'}`;
  if (found.mine) {
    const mine = found.mine;
    const shift = el('p');
    shift.append(el('strong', '', `Shift ${formatShift(mine.shift)}.`), ' ', el('span', 'lab-muted', `A shift of ${points} or more counts as a change.`));
    nodes.push(
      el('h2', '', resultHeadline(mine)),
      reading({ values: found.control.ratings, name: 'Control', control: true }),
      reading({ values: mine.ratings, name: 'Your version' }),
      shift
    );
    if (mine.thin) nodes.push(muted(`${count(mine.n, 'reader', 'readers')} had your version, so read this as a first hint.`));
  } else {
    // A pair that kept the original has no trial of its own: it sees what the class found.
    nodes.push(el('h2', '', 'What the class found'), reading({ values: found.control.ratings, name: 'Control', control: true }));
    if (found.trials.length) nodes.push(findingsChart({ rows: findingRows(found.trials), ends: FINDING_ENDS }), muted(`Each row is one pair’s change. A shift of ${points} or more counts as a change.`));
    else nodes.push(muted('Every pair kept the original this round.'));
  }
  const note = noteBox('Result', ctx.notes);
  if (note) nodes.push(note);
  return nodes;
};

const explain: LabStepView = (ctx) => {
  const { lab, me, status } = ctx;
  const handed = me.done.Explain === true;
  const nodes: HTMLElement[] = [el('h2', '', handed ? 'Handed in' : explainQuestion({ level: 'pairs', judge: lab.judge, prompt: lab.explain_prompt }))];
  if (lab.claim) nodes.push(labelled('Claim:', lab.claim));
  const found = status.findings;
  if (found) {
    // The key numbers: this pair's shift and the biggest shift in the class.
    const top = biggestShift(found.trials);
    const facts = [
      ...(found.mine ? [`Your trial: ${found.mine.desc.join(', ')}, shift ${formatShift(found.mine.shift)}.`] : []),
      ...(top ? [`Biggest shift in the class: ${top.desc.join(', ')}, ${formatShift(top.shift)}.`] : [])
    ];
    if (facts.length) nodes.push(muted(facts.join(' ')));
  }
  if (lab.why && !handed) nodes.push(labelled('Why we tested it:', lab.why));
  return [...nodes, ...explainAnswer(ctx)];
};

/** Called once by the player: puts this level's steps in its registry. Name it stays out until Task 5 builds it. */
export function registerPairsSteps(register: (level: LabLevel, step: LabStep, view: LabStepView) => void): void {
  register('pairs', 'Question', question);
  register('pairs', 'Design', design);
  register('pairs', 'Predict', predict);
  register('pairs', 'Test', test);
  register('pairs', 'Result', result);
  register('pairs', 'Explain', explain);
}

import { button, el } from '@/quiz/dom';
import { markedPoem, pane, poem } from './bench';
import { bars, findings as findingsChart, levelBars, meter, reading } from './charts';
import { applyEdits, biggestShift, explainQuestion, findingEnds, levelHeadline, markEdits, predictionStem, predictionWord, tokenise } from './model';
import { findingRows } from './steps-pairs';
import type { LabStep, PublicLab } from './schema';
import type { LabBoardContext, LabBoardView } from './board';

/**
 * Pairs design it, on the teacher's board: the control at Question and
 * Design, the pairs' predictions, progress while readers rate, and the
 * findings chart, where a row opens that pair's marked version beside its
 * dots and the control's. At Name it the trials are regrouped by level of
 * language.
 */

const muted = (text: string): HTMLElement => el('p', 'lab-muted', text);
const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const labelled = (label: string, text: string): HTMLElement => {
  const line = el('p');
  line.append(el('span', 'lab-muted', `${label} `), text);
  return line;
};
const control = (ctx: LabBoardContext) => tokenise(ctx.settings.control ?? '');
const controlPoem = (ctx: LabBoardContext): HTMLElement => poem(applyEdits(control(ctx), {}).lines);
const pairCounts = (ctx: LabBoardContext) => ctx.board.pairs ?? { total: ctx.settings.pairs?.length ?? 0, changed: 0, ready: 0, predicted: 0 };
const pairsWord = (n: number): string => `${n} ${n === 1 ? 'pair' : 'pairs'}`;

const question: LabBoardView = (ctx) => {
  const { lab, board } = ctx;
  const inner: HTMLElement[] = [el('h2', '', lab.question)];
  if (lab.claim) inner.push(labelled('Claim to test:', lab.claim));
  if (lab.why) inner.push(labelled('Why we are testing it:', lab.why));
  inner.push(controlPoem(ctx));
  return { inner, status: `${board.counts.here} ${board.counts.here === 1 ? 'student' : 'students'} here, in ${pairsWord(pairCounts(ctx).total)}` };
};

const design: LabBoardView = (ctx) => {
  const pairs = pairCounts(ctx);
  return {
    inner: [
      el('h2', '', 'Change one thing in the text'),
      el('p', '', 'A line break, a word, or a cut. One change per pair.'),
      controlPoem(ctx),
      meter(pairs.ready, pairs.total)
    ],
    status: `${pairs.ready} of ${pairsWord(pairs.total)} on the bench`
  };
};

const predict: LabBoardView = (ctx) => {
  const { board } = ctx;
  const round = board.round!;
  const pairs = pairCounts(ctx);
  const shown = round.revealed && board.predictions;
  const inner = shown
    ? [el('h2', '', 'What the pairs predict'), bars({ labels: [-1, 0, 1].map((v) => upper(predictionWord(v, ctx.lab.trait))), values: board.predictions!, top: board.predictions!.indexOf(Math.max(...board.predictions!)) })]
    : [el('h2', '', upper(predictionStem(ctx.lab.trait))), muted('Each pair predicts what its own change will do. Predictions stay hidden until you reveal them.'), meter(pairs.predicted, pairs.changed)];
  const toggle = button(round.revealed ? 'Hide predictions' : 'Reveal predictions', 'secondary', () => void ctx.run(ctx.api.reveal(round.session, !round.revealed)));
  toggle.dataset.act = 'reveal';
  return { inner, status: `${pairs.predicted} of ${pairsWord(pairs.changed)} locked in`, extra: [toggle] };
};

const test: LabBoardView = ({ lab, board }) => ({
  inner: [
    el('h2', '', 'Readers are rating'),
    el('p', '', lab.judge_question),
    muted('Each reader gets up to six versions with the changes unmarked. Some are the original.'),
    meter(board.counts.done, board.counts.here)
  ],
  status: `${board.counts.done} of ${board.counts.here} readers finished`
});

/** The findings chart, and under it the open row: that pair's version with its change marked, beside its dots and the control's. */
function findingsBlock(ctx: LabBoardContext): HTMLElement[] {
  const found = ctx.board.findings;
  if (!found) return [];
  if (found.trials.length === 0) return [muted('Every pair kept the original, so there are no trials to compare.')];
  const open = typeof ctx.open.row === 'number' ? ctx.open.row : -1;
  const nodes: HTMLElement[] = [
    findingsChart({
      rows: findingRows(found.trials), ends: findingEnds(ctx.lab.trait), open,
      onOpen: (index) => {
        ctx.open.row = open === index ? -1 : index;
        ctx.repaint();
      }
    })
  ];
  const trial = found.trials[open];
  if (trial) {
    const detail = el('div', 'lab-bench lab-find-detail');
    detail.append(
      pane(`Pair ${trial.number}: ${trial.desc.join(', ')}`, [markedPoem(markEdits(control(ctx), trial.edit))]),
      pane(null, [reading({ values: found.control.ratings, name: 'Control', control: true }), reading({ values: trial.ratings, name: 'This version' })])
    );
    nodes.push(detail);
  }
  return nodes;
}

const result: LabBoardView = (ctx) => {
  const found = ctx.board.findings;
  if (!found) return { inner: [el('h2', '', 'The readings are on their way')], status: '' };
  const top = biggestShift(found.trials);
  return {
    inner: [el('h2', '', top ? `Biggest shift: ${top.desc.join(', ')}` : 'What the class found'), ...findingsBlock(ctx)],
    status: `Control average ${found.control.mean.toFixed(1)} from ${found.control.n} ${found.control.n === 1 ? 'rating' : 'ratings'}. Tap a row to see its readings.`
  };
};

/** The level comparison: every named trial regrouped as Form, Sentence or Word, with the level that moved readers most as the headline. */
export function levelBlock(ctx: Pick<LabBoardContext, 'board'>): HTMLElement[] {
  const groups = ctx.board.levels ?? [];
  if (!groups.length) return [];
  return [el('h2', '', levelHeadline(groups)), muted('Average shift for each level of language, from the pairs’ trials. A trial with fewer than four readers is left out.'), levelBars(groups)];
}

const nameIt: LabBoardView = (ctx) => {
  const pairs = pairCounts(ctx);
  const inner = levelBlock(ctx);
  return {
    inner: inner.length ? inner : [el('h2', '', 'Name what you changed'), muted('Each pair picks the feature it changed from the list.')],
    status: `${pairs.named ?? 0} of ${pairsWord(pairs.changed)} named`
  };
};

const explain: LabBoardView = (ctx) => {
  const { lab, board } = ctx;
  const inner: HTMLElement[] = [el('h2', '', explainQuestion({ level: 'pairs', judge: lab.judge, prompt: lab.explain_prompt }))];
  if (lab.claim) inner.push(labelled('Claim:', lab.claim));
  inner.push(...findingsBlock(ctx));
  if (board.debrief) inner.push(muted(`Your notes: ${board.debrief}`));
  return { inner, status: `${board.explained ?? 0} of ${board.counts.here} handed in` };
};

/** Called once by the board: puts this level's stages in its registry. */
export function registerPairsBoard(register: (level: PublicLab['level'], step: LabStep, view: LabBoardView) => void): void {
  register('pairs', 'Question', question);
  register('pairs', 'Design', design);
  register('pairs', 'Predict', predict);
  register('pairs', 'Test', test);
  register('pairs', 'Result', result);
  register('pairs', 'Name it', nameIt);
  register('pairs', 'Explain', explain);
}

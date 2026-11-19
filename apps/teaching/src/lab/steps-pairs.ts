import { button, el } from '@/quiz/dom';
import { designBench, markedPoem, pane, poem } from './bench';
import { findings as findingsChart, reading, type FindingRow } from './charts';
import { applyEdits, biggestShift, changeLabel, changeVerdict, describeEdits, explainQuestion, findingEnds, formatShift, markEdits, predictionStem, predictionWord, tokenise, type Edit, type PairPrediction } from './model';
import { noteAllows, noteBox, noteOrWait, noteText } from './notes';
import type { LabLevel, LabStep } from './schema';
import type { LabStepContext, LabStepView } from './player';
import type { LabFindings, LabOpenTrial } from './api';
import { count, explainAnswer, ratingScale } from './steps-set';

/**
 * Pairs design it, on a student's device: Question, Design (the bench),
 * Predict, Test, Result and Explain. The version, its place on the bench and
 * the prediction belong to the pair; ratings and lab notes are each
 * student's own.
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

const question: LabStepView = (ctx) => {
  const { lab } = ctx;
  const nodes: HTMLElement[] = [el('h2', '', lab.question)];
  if (lab.claim) nodes.push(labelled('Claim to test:', lab.claim));
  if (lab.why) nodes.push(labelled('Why we are testing it:', lab.why));
  nodes.push(pane(null, [poem(applyEdits(controlOf(ctx), {}).lines)]));
  nodes.push(...noteOrWait('Question', ctx.notes, wait()));
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
    // A partner put it on the bench: this student's own Design note is still theirs to write.
    nodes.push(...noteOrWait('Design', ctx.notes, wait()));
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
          return ctx.client.ready(true, noteText('Design', ctx.notes));
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
    return [el('h2', '', `Locked in: ${predictionWord(pair.pred, lab.trait)}`), ...noteOrWait('Predict', ctx.notes, wait())];
  }
  const desc = describeEdits(controlOf(ctx), pair.edit);
  const chosen = typeof draft.pred === 'number' ? draft.pred : null;
  const chips = el('div', 'lab-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Your pair’s prediction');
  const lock = button('Lock it in', 'primary', () => {
    if (typeof draft.pred !== 'number' || !noteAllows('Predict', ctx.notes)) return;
    lock.disabled = true;
    void ctx.act(() => ctx.client.pairPredict(draft.pred as PairPrediction, noteText('Predict', ctx.notes)));
  });
  lock.disabled = chosen === null;
  for (const value of PREDICTIONS) {
    const chip = el('button', `lab-chip${chosen === value ? ' is-on' : ''}`, upper(predictionWord(value, lab.trait)));
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
  const nodes: HTMLElement[] = [el('h2', '', `If we ${desc.join(', ')}, ${predictionStem(lab.trait)}`), muted(`Readers answer: ${lab.judge_question}`), chips];
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
    return [el('h2', '', `${count(item.total, 'version', 'versions')} rated`), ...noteOrWait('Test', ctx.notes, wait())];
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

/** "Your change made the speaker sound less hesitant. As you predicted." With no trait: "Your change moved the rating lower." */
export function resultHeadline(mine: NonNullable<LabFindings['mine']>, trait?: string): string {
  const first = changeVerdict(mine.verdict, trait);
  if (mine.pred === null) return first;
  return `${first} ${mine.held ? 'As you predicted.' : `You predicted ${predictionWord(mine.pred, trait)}.`}`;
}

const result: LabStepView = (ctx) => {
  const { lab } = ctx;
  const found = ctx.status.findings;
  if (!found) return [el('h2', '', 'The result is on its way'), wait()];
  const nodes: HTMLElement[] = [];
  const points = `${found.threshold} ${found.threshold === 1 ? 'point' : 'points'}`;
  if (found.mine) {
    const mine = found.mine;
    const shift = el('p');
    shift.append(el('strong', '', `Shift ${formatShift(mine.shift)}.`), ' ', el('span', 'lab-muted', `A shift of ${points} or more counts as a change.`));
    nodes.push(
      el('h2', '', resultHeadline(mine, lab.trait)),
      reading({ values: found.control.ratings, name: 'Control', control: true }),
      reading({ values: mine.ratings, name: 'Your version' }),
      shift
    );
    if (mine.thin) nodes.push(muted(`${count(mine.n, 'reader', 'readers')} had your version, so read this as a first hint.`));
  } else {
    // A pair that kept the original has no trial of its own: it sees what the class found.
    nodes.push(el('h2', '', 'What the class found'), reading({ values: found.control.ratings, name: 'Control', control: true }));
    if (found.trials.length) nodes.push(findingsChart({ rows: findingRows(found.trials), ends: findingEnds(lab.trait) }), muted(`Each row is one pair’s change. A shift of ${points} or more counts as a change.`));
    else nodes.push(muted('Every pair kept the original this round.'));
  }
  nodes.push(...noteOrWait('Result', ctx.notes, null));
  return nodes;
};

/** Name it: the pair picks the feature it changed from the lab's list, and each student notes what it does. */
const nameIt: LabStepView = (ctx) => {
  const { lab, status, draft } = ctx;
  const pair = status.pair;
  const features = lab.features ?? [];
  if (!pair || !pair.trial) {
    return reader('You are a reader this round', pair ? 'Your pair kept the original, so the other pairs are naming what they changed.' : 'The pairs are naming the feature they changed.');
  }
  const named = pair.feature !== null ? features[pair.feature] : undefined;
  if (named) return [el('h2', '', named.name), muted(`${named.level} level`), ...noteOrWait('Name it', ctx.notes, wait())];
  const chosen = typeof draft.feature === 'number' ? draft.feature : null;
  const chips = el('div', 'lab-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'The feature your pair changed');
  const done = button('Done', 'primary', () => {
    if (typeof draft.feature !== 'number' || !noteAllows('Name it', ctx.notes)) return;
    done.disabled = true;
    void ctx.act(() => ctx.client.feature(draft.feature as number, noteText('Name it', ctx.notes)));
  });
  done.dataset.act = 'named';
  done.disabled = chosen === null;
  features.forEach((feature, i) => {
    const chip = el('button', `lab-chip lab-chip--plain${chosen === i ? ' is-on' : ''}`, feature.name);
    chip.type = 'button';
    chip.dataset.feature = String(i);
    chip.setAttribute('aria-pressed', String(chosen === i));
    chip.addEventListener('click', () => {
      draft.feature = i;
      for (const other of chips.querySelectorAll('button')) {
        other.classList.toggle('is-on', other === chip);
        other.setAttribute('aria-pressed', String(other === chip));
      }
      done.disabled = false;
    });
    chips.append(chip);
  });
  const nodes: HTMLElement[] = [el('h2', '', 'Name what you changed'), labelled('Your change:', `${describeEdits(controlOf(ctx), pair.edit).join('; ')}.`), chips];
  const note = noteBox('Name it', ctx.notes);
  if (note) nodes.push(note);
  nodes.push(done, muted('One feature for your pair. Whoever presses Done, names it for both of you.'));
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

/** Called once by the player: puts this level's steps in its registry. */
export function registerPairsSteps(register: (level: LabLevel, step: LabStep, view: LabStepView) => void): void {
  register('pairs', 'Question', question);
  register('pairs', 'Design', design);
  register('pairs', 'Predict', predict);
  register('pairs', 'Test', test);
  register('pairs', 'Result', result);
  register('pairs', 'Name it', nameIt);
  register('pairs', 'Explain', explain);
}

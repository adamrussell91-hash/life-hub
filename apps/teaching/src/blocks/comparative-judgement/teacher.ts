import { ApiClientError } from '@/api/client';
import { button, el, errorText, readJSON, writeJSON } from '@/quiz/dom';
import { isNotPublished } from '@/blocks/peer-feedback-ui';
import {
  classLabel,
  teacherApi,
  type ClassOption,
  type DisplayReply,
  type ProgressRow,
  type Results,
  type TeacherApi,
  type TeacherStatus
} from './api';
import {
  LEVEL_TEXT,
  THIRD_LABEL,
  alertBox,
  answerCard,
  criterionOf,
  markFrom,
  pairForm,
  pairRow,
  pct,
  poll,
  two,
  waitPanel,
  type CjBlock
} from './shared';

/**
 * The teacher's panel (D16–D20): pick a class, start and run the round, judge
 * blind, and read the results: the reliability signal, the order with names,
 * what made winners win, judges to check, predictions, reflections and marks.
 */
export type TeacherMountOptions = { lessonId: string; display?: boolean; api?: TeacherApi };

const classKey = (lessonId: string, blockId: string) => `cj-class:${lessonId}:${blockId}`;

export function mountTeacher(block: CjBlock, opts: TeacherMountOptions): HTMLElement {
  const api = opts.api ?? teacherApi(opts.lessonId, block.id);
  const root = el('div', `cj-run cj-teacher${opts.display ? ' cj-teacher--display' : ''}`);
  const picker = el('div', 'cj-class');
  const body = el('div', 'cj-teacher__body');
  const alert = alertBox();
  root.append(picker, alert, body);
  body.append(el('p', 'pf-note block-secondary', 'Loading…'));

  let classId = readJSON<string>(classKey(opts.lessonId, block.id)) ?? '';
  let classes: ClassOption[] = [];
  const showError = (error: unknown) => {
    alert.textContent = errorText(error);
    alert.hidden = false;
  };

  function notLive(): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--quiet');
    box.append(
      el('p', 'pf-panel__title block-subtitle', 'Not live yet'),
      el('p', 'pf-panel__text block-body', 'Publish this lesson and block, then Start judging appears here.')
    );
    return box;
  }

  function paintPicker(onPick: () => void): void {
    picker.replaceChildren();
    if (classes.length <= 1) return;
    const id = `cj-class-${block.id}`;
    const label = el('label', 'cj-class__label block-secondary', 'Class');
    label.htmlFor = id;
    const select = el('select', 'bs-select cj-class__select');
    select.id = id;
    if (!classId) select.append(Object.assign(el('option', undefined, 'Choose a class'), { value: '' }));
    for (const c of classes) {
      const o = el('option', undefined, classLabel(c));
      o.value = c.id;
      o.selected = c.id === classId;
      select.append(o);
    }
    select.addEventListener('change', () => {
      classId = select.value;
      writeJSON(classKey(opts.lessonId, block.id), classId || null);
      onPick();
    });
    picker.append(label, select);
  }

  async function start(): Promise<void> {
    try {
      classes = (await api.classes()).classes ?? [];
    } catch (error) {
      body.replaceChildren(isNotPublished(error) ? notLive() : el('p', 'pf-alert', errorText(error)));
      return;
    }
    if (!classes.length) {
      body.replaceChildren(waitPanel('No class teaches this lesson yet.', 'Add the lesson to a class’s timetable, then judging can start.'));
      return;
    }
    if (!classes.some((c) => c.id === classId)) classId = classes.length === 1 ? classes[0]!.id : '';
    const onPick = () => {
      alert.hidden = true;
      if (!classId) return void body.replaceChildren(waitPanel('Choose a class to begin.'));
      if (opts.display) mountDisplay();
      else mountRun();
    };
    paintPicker(onPick);
    onPick();
  }

  /* ── Display: only the two talk prompts (D17) ─────────────────────── */

  function mountDisplay(): void {
    const forClass = classId;
    const view = el('div', 'cj-display');
    const stage = el('div', 'cj-display__stage');
    const actions = el('div', 'cj-display__actions');
    const load = async (): Promise<DisplayReply | null> => {
      try {
        const reply = await api.display(forClass);
        alert.hidden = true;
        return reply;
      } catch (error) {
        if (isNotPublished(error)) body.replaceChildren(notLive());
        else showError(error);
        return null;
      }
    };
    const talk = button('Talk about this pair', 'primary', async () => {
      const r = await load();
      if (!r) return;
      if (!r.contested) return void stage.replaceChildren(waitPanel('Judge a few more pairs first.', 'A pair to talk about appears once answers have been compared.'));
      stage.replaceChildren(el('p', 'cj-criterion block-subtitle', criterionOf(block.content)), pairRow(answerCard('left', r.contested.left.text), answerCard('right', r.contested.right.text)));
    });
    const strong = button('Strong answers', 'secondary', async () => {
      const r = await load();
      if (!r) return;
      if (!r.exemplars.length) return void stage.replaceChildren(waitPanel('Judge a few more pairs first.', 'Strong answers appear once answers have been compared.'));
      const list = el('div', 'cj-exemplars');
      r.exemplars.slice(0, 3).forEach((x) => {
        const card = el('article', 'cj-card cj-card--exemplar');
        card.append(el('div', 'cj-card__text block-body', x.text));
        list.append(card);
      });
      stage.replaceChildren(list);
    });
    actions.append(talk, strong);
    view.append(actions, stage);
    body.replaceChildren(view);
  }

  /* ── Teacher run ──────────────────────────────────────────────────── */

  function mountRun(): void {
    const forClass = classId;
    const view = el('div', 'cj-teacher__run');
    const controls = el('div', 'cj-controls');
    const progress = el('div', 'cj-progress-panel');
    const judgeBox = el('details', 'cj-fold cj-fold--judge');
    const resultsBox = el('details', 'cj-fold cj-fold--results');
    view.append(controls, progress, judgeBox, resultsBox);
    body.replaceChildren(view);

    let status: TeacherStatus | null = null;
    let painted = '';
    let progressOpen = false;
    let busy = false;

    const live = () => root.isConnected && classId === forClass && body.contains(view);

    async function act(action: 'start' | 'refresh' | 'close' | 'open', pressed: HTMLButtonElement): Promise<void> {
      busy = true;
      const label = pressed.textContent;
      pressed.disabled = true;
      pressed.textContent = 'Working…';
      try {
        status = await api.act(forClass, action);
        alert.hidden = true;
        paint(true);
      } catch (error) {
        // Someone started it on another screen: show that round.
        if (action === 'start' && error instanceof ApiClientError && error.code === 'started') {
          status = await api.status(forClass).catch(() => status);
          paint(true);
        } else showError(error);
      } finally {
        busy = false;
        if (pressed.isConnected) {
          pressed.disabled = false;
          pressed.textContent = label;
        }
      }
    }

    async function refresh(): Promise<void> {
      if (!live() || busy) return;
      try {
        status = await api.status(forClass);
        paint(false);
      } catch (error) {
        if (!status && isNotPublished(error)) {
          view.replaceChildren(notLive());
          return;
        }
        if (!status) showError(error);
      }
    }

    function paint(force: boolean): void {
      if (!status || !live()) return;
      const sig = JSON.stringify(status);
      if (sig === painted && !force) return;
      painted = sig;
      const round = status.round;
      controls.replaceChildren();
      if (!round) {
        const panel = el('div', 'pf-panel pf-panel--start');
        const text = el('div');
        text.append(
          el('p', 'pf-panel__title block-subtitle', 'Ready when the class has answered'),
          el('p', 'pf-panel__text block-body', 'Start judging takes a snapshot of the class’s answers to the chosen question. Answers handed in later join when you press Refresh pool.')
        );
        panel.append(text, button('Start judging', 'primary', function () { void act('start', this); }));
        controls.append(panel);
        progress.replaceChildren();
        judgeBox.hidden = true;
        resultsBox.hidden = true;
        return;
      }
      judgeBox.hidden = false;
      resultsBox.hidden = false;
      const bar = el('div', 'cj-controls__bar');
      const facts = el('p', 'cj-controls__facts block-body');
      const answers = round.pool_size - round.anchors;
      facts.append(
        el('span', `pf-chip${round.open ? ' pf-chip--done' : ''}`, round.open ? 'Open' : 'Closed'),
        document.createTextNode(` ${answers} ${answers === 1 ? 'answer' : 'answers'}${round.anchors ? ` + ${round.anchors} ${round.anchors === 1 ? 'anchor' : 'anchors'}` : ''} in the pool`)
      );
      const buttons = el('div', 'pf-actions');
      buttons.append(
        button('Refresh pool', 'secondary', function () { void act('refresh', this); }),
        round.open ? button('Close judging', 'secondary', function () { void act('close', this); }) : button('Open judging', 'primary', function () { void act('open', this); })
      );
      bar.append(facts, buttons);
      controls.append(bar);
      progress.replaceChildren(progressTable(status.progress));
    }

    function progressTable(rows: ProgressRow[]): HTMLElement {
      const wrap = el('details', 'cj-fold');
      wrap.open = progressOpen;
      wrap.addEventListener('toggle', () => (progressOpen = wrap.open));
      const judged = rows.reduce((n, r) => n + r.judged, 0);
      const finished = rows.filter((r) => r.judged >= r.target && r.target > 0).length;
      wrap.append(el('summary', 'cj-fold__summary', `Progress · ${finished} of ${rows.length} finished · ${judged} judgements`));
      if (!rows.length) {
        wrap.append(el('p', 'pf-note block-secondary', 'No students yet.'));
        return wrap;
      }
      const scroll = el('div', 'cj-table-scroll');
      const table = el('table', 'cj-table');
      const head = el('tr');
      for (const h of ['Student', 'Judged', 'Practice', 'Predicted', 'Reflected']) head.append(el('th', undefined, h));
      table.append(el('thead'), el('tbody'));
      table.tHead!.append(head);
      for (const r of rows) {
        const tr = el('tr');
        const who = el('td');
        who.append(el('span', 'cj-who', r.name || r.initials));
        if (!r.has_answer) who.append(el('span', 'pf-chip', 'No answer'));
        const meter = el('td');
        const m = el('meter', 'cj-meter');
        m.min = 0;
        m.max = Math.max(1, r.target);
        m.value = Math.min(r.judged, r.target);
        meter.append(m, el('span', 'cj-meter__text', ` ${r.judged} / ${r.target}`));
        tr.append(who, meter, tick(r.calibrated), tick(r.predicted), tick(r.reflected));
        table.tBodies[0]!.append(tr);
      }
      scroll.append(table);
      wrap.append(scroll);
      return wrap;
    }

    /* Judge a pair, blind (D16). */
    judgeBox.append(el('summary', 'cj-fold__summary', 'Judge a pair'));
    const judgeArea = el('div', 'cj-fold__body');
    judgeBox.append(judgeArea);
    let judged = 0;
    async function nextPair(): Promise<void> {
      judgeArea.replaceChildren(waitPanel('Finding a pair…'));
      try {
        const reply = await api.next(forClass);
        if (!reply.pair) return void judgeArea.replaceChildren(waitPanel('Every pair you could judge is done.', 'Refresh the pool to add answers handed in since.'));
        judgeArea.replaceChildren(
          el('p', 'pf-field__hint block-secondary', `Names stay hidden while you judge. Your choices count ${block.content.teacher_weight}× a student’s.${judged ? ` You’ve judged ${judged} this session.` : ''}`),
          pairForm({
            pair: reply.pair,
            criterion: criterionOf(block.content),
            chips: block.content.chips.filter((c) => c.trim()),
            onPick: async (j) => {
              try {
                await api.judge(forClass, j);
                judged += 1;
                alert.hidden = true;
                void nextPair();
              } catch (error) {
                showError(error);
              }
            }
          })
        );
      } catch (error) {
        judgeArea.replaceChildren();
        showError(error);
      }
    }
    judgeBox.addEventListener('toggle', () => {
      if (judgeBox.open && !judgeArea.querySelector('.cj-judge')) void nextPair();
    });

    /* Results. */
    resultsBox.append(el('summary', 'cj-fold__summary', 'Results'));
    const resultsArea = el('div', 'cj-fold__body');
    resultsBox.append(resultsArea);
    async function loadResults(pressed?: HTMLButtonElement): Promise<void> {
      if (pressed) pressed.disabled = true;
      if (!resultsArea.firstChild) resultsArea.append(waitPanel('Working out the order…'));
      try {
        const r = await api.results(forClass);
        alert.hidden = true;
        resultsArea.replaceChildren(resultsView(r, loadResults));
      } catch (error) {
        showError(error);
      } finally {
        if (pressed?.isConnected) pressed.disabled = false;
      }
    }
    resultsBox.addEventListener('toggle', () => {
      if (resultsBox.open) void loadResults();
    });

    function resultsView(r: Results, reload: (b?: HTMLButtonElement) => Promise<void>): HTMLElement {
      const box = el('div', 'cj-results');
      const top = el('div', 'cj-results__top');
      top.append(reliabilityCard(r), button('Refresh results', 'ghost', function () { void reload(this); }));
      box.append(top);
      box.append(section('The order', rankedList(r)));
      box.append(section('What made winners win', chipTable(r)));
      box.append(section('Judges to check', judgesList(r)));
      if (r.predictions.length) box.append(section('Predictions', predictionTable(r)));
      if (r.reflections.length) box.append(section('Reflections', reflectionList(r)));
      box.append(section('Marks', marksPanel(r)));
      return box;
    }

    function marksPanel(r: Results): HTMLElement {
      const wrap = el('div', 'cj-marks');
      if (!r.marks) {
        wrap.append(el('p', 'pf-note block-secondary', 'Add at least two anchors with different marks in the block’s settings, and the scale turns into marks here.'));
        return wrap;
      }
      const count = Object.keys(r.marks.by_student ?? {}).length;
      wrap.append(el('p', 'block-body', `Marks run from the anchors: each answer’s place on the scale gives a mark out of ${r.marks.out_of}. ${count} ${count === 1 ? 'student has' : 'students have'} a mark.`));
      if (r.reliability.level !== 'marks') wrap.append(el('p', 'pf-field__hint block-secondary', 'The order is still settling, so treat these marks as a draft.'));
      const id = `cj-title-${block.id}`;
      const field = el('div', 'pf-field');
      const label = el('label', 'pf-field__label', 'Markbook column title');
      label.htmlFor = id;
      const input = el('input', 'cj-input');
      input.id = id;
      input.maxLength = 120;
      input.value = (block.content.title?.trim() || 'Comparative judgement').slice(0, 120);
      field.append(label, input);
      const done = el('p', 'pf-note block-secondary');
      done.setAttribute('role', 'status');
      const push = button('Push to Markbook', 'primary', async function () {
        if (!input.value.trim()) return input.focus();
        this.disabled = true;
        try {
          const reply = await api.pushMarks(forClass, input.value.trim());
          done.textContent = `Sent ${reply.count} ${reply.count === 1 ? 'mark' : 'marks'} to the Markbook.`;
        } catch (error) {
          showError(error);
        } finally {
          this.disabled = false;
        }
      });
      const row = el('div', 'cj-marks__push');
      row.append(field, push);
      wrap.append(row, done);
      return wrap;
    }

    poll(view, refresh);
  }

  void start();
  return root;
}

function tick(yes: boolean): HTMLTableCellElement {
  const td = el('td', `cj-tick${yes ? ' is-yes' : ''}`, yes ? '✓' : '·');
  td.setAttribute('aria-label', yes ? 'Yes' : 'Not yet');
  return td;
}

function section(title: string, content: HTMLElement): HTMLElement {
  const s = el('section', 'cj-section');
  s.append(el('h4', 'cj-section__title block-subtitle', title), content);
  return s;
}

export function reliabilityCard(r: Results): HTMLElement {
  const rel = r.reliability;
  const words = LEVEL_TEXT[rel.level];
  const card = el('div', `cj-signal cj-signal--${rel.level}`);
  card.append(
    el('p', 'cj-signal__title block-subtitle', words.title),
    el('p', 'cj-signal__body block-body', words.body)
  );
  const facts = el('p', 'cj-signal__facts block-secondary');
  const parts = [`Reliability ${two(rel.value)}`, `${rel.per_item.toFixed(1)} comparisons per answer`];
  if (rel.more_to_12 > 0) parts.push(`about ${rel.more_to_12} more ${rel.more_to_12 === 1 ? 'judgement' : 'judgements'} to reach 12 per answer`);
  facts.textContent = parts.join(' · ');
  const detail = el('p', 'cj-signal__detail block-secondary', `Scale ${two(rel.ssr)} · judge split ${rel.split_half === null ? 'needs 4 judges' : two(rel.split_half)}`);
  card.append(facts, detail);
  return card;
}

export function rankedList(r: Results): HTMLElement {
  const list = el('ol', 'cj-rank');
  const items = [...r.items].sort((a, b) => a.rank - b.rank);
  if (!items.length) {
    const empty = el('div');
    empty.append(el('p', 'pf-note block-secondary', 'No answers in the pool yet.'));
    return empty;
  }
  const thetas = items.map((i) => i.theta);
  const lo = Math.min(...thetas);
  const hi = Math.max(...thetas);
  const span = hi - lo || 1;
  for (const item of items) {
    const li = el('li', `cj-rank__row${item.kind === 'anchor' ? ' is-anchor' : ''}`);
    const head = el('div', 'cj-rank__head');
    head.append(el('span', 'cj-rank__n', String(item.rank)));
    const name = item.kind === 'anchor'
      ? item.anchor_mark !== null && item.anchor_mark !== undefined ? `Anchor (mark ${item.anchor_mark})` : 'Anchor'
      : item.name || item.initials || 'Student';
    head.append(el('span', 'cj-rank__name', name));
    if (r.marks && item.kind === 'student') head.append(el('span', 'cj-rank__mark', `${markFrom(r.marks, item.theta)} / ${r.marks.out_of}`));
    head.append(el('span', 'cj-rank__wins block-secondary', `${item.wins} of ${item.comparisons} won`));
    const bar = el('span', 'cj-rank__bar');
    bar.style.setProperty('--cj-at', `${Math.round(((item.theta - lo) / span) * 100)}%`);
    bar.setAttribute('aria-hidden', 'true');
    const text = el('details', 'cj-rank__text');
    text.append(el('summary', 'block-secondary', 'Read answer'), el('div', 'cj-card__text block-body', item.text));
    li.append(head, bar, text);
    list.append(li);
  }
  return list;
}

export function chipTable(r: Results): HTMLElement {
  if (!r.chips.length) {
    const p = el('p', 'pf-note block-secondary', 'Add chips in the block’s settings to see which features winners share.');
    return p;
  }
  const scroll = el('div', 'cj-table-scroll');
  const table = el('table', 'cj-table cj-table--chips');
  const head = el('tr');
  for (const h of ['Chip', 'On winners', 'On losers', '']) head.append(el('th', undefined, h));
  table.append(el('thead'), el('tbody'));
  table.tHead!.append(head);
  for (const c of [...r.chips].sort((a, b) => b.diff - a.diff)) {
    const tr = el('tr');
    const gap = el('td', 'cj-chipgap');
    const bar = el('span', `cj-chipgap__bar${c.diff < 0 ? ' is-neg' : ''}`);
    bar.style.setProperty('--cj-w', `${Math.min(100, Math.abs(c.diff) * 100)}%`);
    gap.append(bar);
    tr.append(el('td', undefined, c.label), el('td', 'cj-num', pct(c.winner_rate)), el('td', 'cj-num', pct(c.loser_rate)), gap);
    table.tBodies[0]!.append(tr);
  }
  scroll.append(table);
  const wrap = el('div');
  wrap.append(scroll, el('p', 'pf-field__hint block-secondary', 'How often each chip was ticked under the answer that won, and under the one that lost. A big gap means the class sees that feature as what makes an answer stronger.'));
  return wrap;
}

export function judgesList(r: Results): HTMLElement {
  const flagged = r.judges.filter((j) => j.flagged);
  const wrap = el('div');
  if (!flagged.length) {
    wrap.append(el('p', 'pf-note block-secondary', r.judges.length < 3 ? 'This shows once at least three judges have judged three pairs each.' : 'Every judge’s choices agree well with the class’s order.'));
    return wrap;
  }
  const list = el('ul', 'cj-judges');
  for (const j of flagged) {
    const li = el('li', 'cj-judges__row');
    li.append(el('span', 'cj-who', j.name), el('span', 'block-secondary', ` · ${j.judged} judged · fit ${j.infit === null ? '–' : j.infit.toFixed(2)}${j.weight < 1 ? ' · counted at half weight' : ''}`));
    list.append(li);
  }
  wrap.append(list, el('p', 'pf-field__hint block-secondary', 'These judges’ choices often went against the class’s order. A quick chat about the criterion usually helps.'));
  return wrap;
}

function predictionTable(r: Results): HTMLElement {
  const scroll = el('div', 'cj-table-scroll');
  const table = el('table', 'cj-table');
  const head = el('tr');
  for (const h of ['Student', 'Predicted', 'Actual']) head.append(el('th', undefined, h));
  table.append(el('thead'), el('tbody'));
  table.tHead!.append(head);
  for (const p of r.predictions) {
    const tr = el('tr');
    tr.dataset.match = String(p.predicted === p.actual);
    tr.append(el('td', undefined, p.name), el('td', undefined, THIRD_LABEL[p.predicted] ?? p.predicted), el('td', undefined, `${THIRD_LABEL[p.actual] ?? p.actual}${p.predicted === p.actual ? ' ✓' : ''}`));
    table.tBodies[0]!.append(tr);
  }
  scroll.append(table);
  return scroll;
}

function reflectionList(r: Results): HTMLElement {
  const list = el('ul', 'cj-reflections');
  for (const x of r.reflections) {
    const li = el('li');
    li.append(el('span', 'cj-who', `${x.name}: `), el('span', 'block-body', x.text));
    list.append(li);
  }
  return list;
}

// apps/teaching/src/tutorial/board.ts
import type { Block } from '@/schemas/block';
import { visitBlocks } from '@/blocks/walk-blocks';
import { button, el, errorText } from '@/quiz/dom';
import { splitAtTeacher, tutorialParts } from './model';
import type { GroupSummary, LiveBoard, TutorialSummary, TutorialTeacherApi } from './api';
import './tutorial.css';

export type TutorialBoardOptions = {
  getLesson: () => { blocks: Block[] };
  api: TutorialTeacherApi;
  /** After a student moves group, with the fresh summary and the move, so the editor can patch its lesson's groups. */
  onMoved?: (summary: TutorialSummary, move: { studentId: string; groupId: string }) => void;
};
export type TutorialBoardHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };

type FadedStep = Extract<Block, { block_type: 'faded_example' }>;

const POLL_MS = 4000;
const SUMMARY_MS = 15000;
/** With the live board open, every third board poll also refreshes the cards. */
const SUMMARY_EVERY = 3;
const STATUS_TEXT: Record<GroupSummary['status'], string> = {
  not_started: 'Not started',
  working: 'Working on their own',
  waiting: 'Waiting for you',
  seen: 'Seen',
  done: 'Exit check done'
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Tue 21 Oct", in the teacher's own time zone. */
const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const stageText = (stage: string) => stage.replace(/_/g, ' ');

/** Faded steps the students write in: Common first, then the group's tab before With teacher. */
function fadedColumns(blocks: Block[], groupId: string): { steps: FadedStep[]; talking: string[] } {
  const parts = tutorialParts(blocks);
  const tab = parts.tabs.get(groupId);
  const { before, withTeacher } = splitAtTeacher((tab?.content.blocks as Block[] | undefined) ?? []);
  const steps: FadedStep[] = [];
  const take = (list: Block[]) =>
    visitBlocks(list, (b) => {
      if (b.block_type === 'faded_example' && b.content.blanks.length > 0) steps.push(b);
    });
  take(parts.common);
  take(before);
  return { steps, talking: withTeacher?.content.talking_points ?? [] };
}

/**
 * The teacher's tutorial board above the canvas: a card per group, and the
 * live board for the group being sat with. One timer keeps it fresh while the
 * board is mounted and the page is visible: the cards every 15 seconds, or,
 * with the live board open, the board every 4 seconds and the cards on every
 * third of those. Student names show here only; anything put up to students
 * goes through the server, nameless.
 */
export function mountTutorialBoard(options: TutorialBoardOptions): TutorialBoardHandle {
  const root = el('section', 'tut-board');
  const head = el('header', 'tut-board__head');
  const count = el('p', 'tut-board__count');
  head.append(el('h2', 'tut-board__title', 'Tutorial groups'), count);
  const strip = el('div', 'tut-board__strip');
  const live = el('div', 'tut-board__live');
  const error = el('p', 'tut-board__error');
  error.setAttribute('role', 'alert');
  const note = el('p', 'tut-board__note');
  note.setAttribute('role', 'status');
  root.append(head, strip, error, note, live);

  let summary: TutorialSummary | null = null;
  let open: string | null = null;
  let timer = 0;
  let ticks = 0;
  let seq = 0;
  let disposed = false;
  /**
   * Actions in flight. While any is out, polls don't repaint: a poll could
   * otherwise redraw the board with live buttons under a pending action.
   */
  let busy = 0;
  /** An action's error stays until an action succeeds; a poll's error until a poll succeeds. */
  let actionError = '';
  let pollError = '';
  /**
   * Who is here, per group, kept across polls. A student is ticked once, the
   * first time they're seen waiting (or already unlocked); after that only the
   * teacher's tick or untick changes it.
   */
  const here = new Map<string, { ticked: Set<string>; decided: Set<string> }>();
  const replies = new Map<string, string>();

  const showError = () => {
    if (!disposed) error.textContent = actionError || pollError;
  };
  const failAction = (e: unknown) => {
    actionError = errorText(e, 'That didn’t work. Try again.');
    showError();
  };
  const failPoll = (e: unknown) => {
    pollError = errorText(e, 'Couldn’t check for new answers. Trying again.');
    showError();
  };
  const actionOk = () => {
    actionError = '';
    note.textContent = '';
    showError();
  };
  const pollOk = () => {
    pollError = '';
    showError();
  };
  const useSummary = (next: TutorialSummary) => {
    if (disposed) return;
    summary = next;
    paintStrip();
  };
  const visible = () => document.visibilityState === 'visible';

  /** The one timer. Nothing runs after dispose or while the page is hidden. */
  function schedule(): void {
    window.clearTimeout(timer);
    if (disposed || !visible()) return;
    timer = window.setTimeout(() => void tick(), open ? POLL_MS : SUMMARY_MS);
  }
  async function tick(): Promise<void> {
    if (disposed || !visible()) return;
    // The action repaints when it lands; look again on the next tick.
    if (busy > 0) return schedule();
    if (open) {
      ticks += 1;
      if (ticks % SUMMARY_EVERY === 0) await pollSummary();
      await paintLive(true);
    } else await pollSummary();
    schedule();
  }
  async function pollSummary(): Promise<void> {
    try {
      const next = await options.api.summary();
      if (disposed || busy > 0) return;
      pollOk();
      useSummary(next);
    } catch (e) {
      if (!disposed) failPoll(e);
    }
  }
  const onVisibility = () => {
    if (disposed) return;
    if (!visible()) return void window.clearTimeout(timer);
    void (async () => {
      window.clearTimeout(timer);
      await pollSummary();
      if (open) await paintLive(true);
      schedule();
    })();
  };
  document.addEventListener('visibilitychange', onVisibility);

  /** Disables the controls while their request is out, so a second press can't send it twice. */
  async function locked(controls: HTMLButtonElement[], run: () => Promise<void>): Promise<void> {
    for (const c of controls) c.disabled = true;
    busy += 1;
    try {
      await run();
    } finally {
      busy -= 1;
      for (const c of controls) c.disabled = false;
    }
  }
  /** Runs a teacher action that answers with the summary, then repaints. */
  const act = (controls: HTMLButtonElement[], run: () => Promise<TutorialSummary>, after?: (s: TutorialSummary) => void) =>
    locked(controls, async () => {
      try {
        const next = await run();
        if (disposed) return;
        actionOk();
        after?.(next);
        useSummary(next);
        await paintLive();
        schedule();
      } catch (e) {
        if (!disposed) failAction(e);
      }
    });

  function paintStrip(): void {
    if (!summary || disposed) return;
    count.textContent = `${summary.seen} of ${summary.total} ${summary.total === 1 ? 'group' : 'groups'} seen`;
    strip.replaceChildren(
      ...summary.groups.map((g) => {
        const card = el('article', `tut-card tut-card--${g.status}${open === g.id ? ' tut-card--open' : ''}`);
        card.append(el('h3', 'tut-card__name', g.name), el('p', 'tut-card__meta', `${g.students.length} ${g.students.length === 1 ? 'student' : 'students'}`));
        const dots = el('p', 'tut-card__dots');
        for (const s of g.students) {
          const dot = el('span', `tut-dot tut-dot--${s.stage}`, s.initials);
          dot.title = `${s.name}: ${stageText(s.stage)}`;
          dots.append(dot);
        }
        const status = g.status === 'seen' && g.seen_at ? `Seen ${dateText(g.seen_at)}` : STATUS_TEXT[g.status];
        card.append(dots, el('p', 'tut-card__status', status));
        if (g.handups) card.append(el('p', 'tut-card__hand', g.open ? `✋ ${g.open}` : `✋ ${g.handups} answered`));
        // Students who were away when the teacher sat with the group open their exit check later, one at a time.
        if (g.seen_at) {
          const away = g.students.filter((s) => !s.unlocked);
          if (away.length) {
            const list = el('div', 'tut-card__away');
            for (const s of away) {
              const b = button(`Unlock ${s.initials}`, 'ghost', () => void act([b], () => options.api.unlock(g.id, s.id)));
              b.classList.add('tut-card__unlock');
              b.setAttribute('aria-label', `Unlock the exit check for ${s.name}`);
              list.append(b);
            }
            card.append(list);
          }
        }
        const sit = button(open === g.id ? 'Open below' : g.sitting ? 'Back to group' : 'Sit with group', 'secondary', () =>
          void locked([sit], async () => {
            try {
              if (!g.sitting) {
                const next = await options.api.sit(g.id);
                if (disposed) return;
                summary = next;
              }
              actionOk();
              open = g.id;
              paintStrip();
              await paintLive();
              schedule();
            } catch (e) {
              if (!disposed) failAction(e);
            }
          })
        );
        sit.classList.add('tut-card__sit');
        card.append(sit);
        return card;
      })
    );
  }

  function ticksFor(board: LiveBoard): Set<string> {
    let entry = here.get(board.group.id);
    if (!entry) {
      entry = { ticked: new Set(), decided: new Set() };
      here.set(board.group.id, entry);
    }
    for (const s of board.students) {
      if (entry.decided.has(s.id)) continue;
      if (s.stage === 'waiting' || board.done_students.includes(s.id)) {
        entry.ticked.add(s.id);
        entry.decided.add(s.id);
      }
    }
    return entry.ticked;
  }

  /** Fetches and draws the live board. Timing is schedule()'s job. A poll's paint gives way to an action in flight. */
  async function paintLive(fromPoll = false): Promise<void> {
    if (disposed || (fromPoll && busy > 0)) return;
    const mine = ++seq;
    if (!open) return void live.replaceChildren();
    // Don't repaint under the teacher's typing; the next tick looks again.
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && focused.type === 'text' && live.contains(focused)) return;
    let board: LiveBoard;
    try {
      board = await options.api.board(open);
    } catch (e) {
      if (mine === seq && !disposed) failPoll(e);
      return;
    }
    if (disposed || mine !== seq || open !== board.group.id || (fromPoll && busy > 0)) return;
    pollOk();
    const group = board.group;
    const seenAt = summary?.groups.find((g) => g.id === group.id)?.seen_at ?? null;
    const others = (summary?.groups ?? []).filter((g) => g.id !== group.id);
    const { steps, talking } = fadedColumns(options.getLesson().blocks, group.id);
    const ticked = ticksFor(board);
    const nameOf = new Map(board.students.map((s) => [s.id, s]));

    const box = el('section', 'tut-live');
    box.append(el('h3', 'tut-live__title', `With ${group.name}`));
    if (group.why) box.append(el('p', 'tut-live__why', group.why));
    if (talking.length) {
      const points = el('ul', 'tut-live__points');
      for (const p of talking) points.append(el('li', '', p));
      box.append(el('h4', 'tut-live__head', 'Talking points'), points);
    }
    if (board.shown) {
      const shown = el('div', 'tut-live__shown');
      shown.append(el('p', 'tut-live__shown-label', 'Up for the group now'), el('p', 'tut-live__shown-text', board.shown.text));
      box.append(shown);
    }

    const rows = el('div', 'tut-live__rows');
    const headRow = el('div', 'tut-live__cols');
    headRow.setAttribute('aria-hidden', 'true');
    headRow.append(el('span', 'tut-live__here-head', 'Here'), el('span', 'tut-live__who', ''));
    for (const st of steps) for (const i of st.content.blanks) headRow.append(el('span', 'tut-live__col', st.content.parts[i]?.label ?? ''));
    rows.append(headRow);

    for (const s of board.students) {
      const row = el('div', 'tut-live__row');
      const tick = el('input');
      tick.type = 'checkbox';
      tick.checked = ticked.has(s.id);
      tick.setAttribute('aria-label', `${s.name} is here`);
      tick.addEventListener('change', () => {
        here.get(group.id)?.decided.add(s.id);
        if (tick.checked) ticked.add(s.id);
        else ticked.delete(s.id);
      });
      const who = el('div', 'tut-live__who');
      who.append(el('strong', 'tut-live__initials', s.initials), el('span', 'tut-live__name', s.name), el('span', 'tut-live__stage', stageText(s.stage)));
      row.append(tick, who);
      for (const st of steps) {
        const answer = s.answers[st.id];
        for (const index of st.content.blanks) {
          const cell = el('div', `tut-live__cell${answer?.rating === 'wrong' ? ' tut-live__cell--wrong' : ''}`);
          // Read out on a desktop (the column heads are hidden from screen readers), shown on a phone.
          cell.append(el('span', 'tut-live__label tk-visually-hidden', st.content.parts[index]?.label ?? ''));
          const text = answer?.parts[String(index)];
          if (text) {
            cell.append(el('p', 'tut-live__answer', text));
            const show = button('Show to group', 'ghost', () => void act([show], () => options.api.show(group.id, s.id, st.id, String(index))));
            show.classList.add('tut-live__show');
            cell.append(show);
          } else cell.append(el('p', 'tut-live__none', '…'));
          row.append(cell);
        }
      }
      const tools = el('div', 'tut-live__tools');
      if (seenAt && !board.done_students.includes(s.id)) {
        const unlock = button('Unlock', 'ghost', () => void act([unlock], () => options.api.unlock(group.id, s.id)));
        unlock.classList.add('tut-live__unlock');
        unlock.setAttribute('aria-label', `Unlock the exit check for ${s.name}`);
        tools.append(unlock);
      }
      if (others.length) {
        const move = el('div', 'tut-live__move');
        const pills = el('div', 'hub-pills hub-pills--loose');
        pills.setAttribute('role', 'group');
        pills.setAttribute('aria-label', `Move ${s.name} to`);
        const all: HTMLButtonElement[] = [];
        for (const g of others) {
          const pill = el('button', 'hub-pills__btn', g.name);
          pill.type = 'button';
          pill.addEventListener('click', () =>
            void act(all, () => options.api.move(s.id, g.id), (next) => {
              note.textContent = `Moved ${s.initials} to ${g.name}.`;
              options.onMoved?.(next, { studentId: s.id, groupId: g.id });
            })
          );
          all.push(pill);
          pills.append(pill);
        }
        move.append(el('span', 'tut-live__move-label', 'Move to'), pills);
        tools.append(move);
      }
      row.append(tools);
      rows.append(row);
    }
    box.append(rows);

    if (board.handups.length) {
      const hands = el('ul', 'tut-live__hands');
      for (const h of board.handups) {
        const item = el('li', `tut-live__hand tut-live__hand--${h.status}`);
        const from = h.student_id ? nameOf.get(h.student_id) : undefined;
        item.append(el('p', 'tut-live__hand-from', `✋ ${from ? from.name : 'A student'}${h.label ? ` · ${h.label}` : ''}`));
        if (h.text) item.append(el('p', 'tut-live__hand-text', h.text));
        if (h.status === 'answered') {
          item.append(el('p', 'tut-live__hand-reply', h.reply ? `Answered: ${h.reply}` : 'Answered'));
        } else {
          const reply = el('input', 'qz-input tut-live__reply');
          reply.type = 'text';
          reply.maxLength = 600;
          reply.placeholder = 'Reply (optional)';
          reply.setAttribute('aria-label', 'Reply (optional)');
          reply.value = replies.get(h.id) ?? '';
          reply.addEventListener('input', () => replies.set(h.id, reply.value));
          const answered = button('Answered', 'secondary', () => {
            replies.set(h.id, reply.value);
            // The typed reply is kept until the server has it.
            void act([answered], () => options.api.reply(h.id, reply.value.trim()), () => replies.delete(h.id));
          });
          answered.classList.add('tut-live__answered');
          item.append(reply, answered);
        }
        hands.append(item);
      }
      box.append(el('h4', 'tut-live__head', 'Hand-ups'), hands);
    }

    const actions = el('div', 'tut-live__actions');
    if (board.shown) {
      const down = button('Take it down', 'secondary', () => void act([down], () => options.api.hide(group.id)));
      actions.append(down);
    }
    const done = button('Done with this group', 'primary', () => {
      const students = board.students.filter((s) => ticked.has(s.id)).map((s) => s.id);
      void act([done], () => options.api.done(group.id, students), () => {
        here.delete(group.id);
        open = null;
      });
    });
    done.classList.add('tut-live__done');
    actions.append(done);
    box.append(actions);
    live.replaceChildren(box);
  }

  return {
    root,
    async refresh() {
      window.clearTimeout(timer);
      try {
        const next = await options.api.summary();
        if (disposed) return;
        actionError = '';
        pollOk();
        useSummary(next);
      } catch (e) {
        if (!disposed) failAction(e);
      }
      schedule();
    },
    dispose() {
      disposed = true;
      seq += 1;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

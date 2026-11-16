import { getMeeting, linkMeetingTask, updateMeeting } from '@/api/meetings';
import { loadSheetState } from '@/api/meeting-sheets';
import { createLedgerItem, patchLedger } from '@/api/ledger';
import { createTask } from '@/api/universal-links';
import { setPersonTaskDone } from '@/api/person-tasks';
import type { MeetingRecord, NotesFollowUp } from '@/domain/types';

/**
 * After a meeting, ask once whether its notes need sending. Yes makes a task and
 * a you-owe promise per person; publishing the share sheet ticks them off.
 */

export interface FollowUpPerson {
  ref: string;
  name: string;
}

/** The bar shows on a completed meeting nobody has answered for, unless its sheet is already out. */
export function shouldAskFollowUp(record: Pick<MeetingRecord, 'state' | 'notes_follow_up'>, sheetShared: boolean): boolean {
  return record.state === 'completed' && !record.notes_follow_up && !sheetShared;
}

export function followUpQuestion(names: string[]): string {
  if (!names.length) return 'Send your notes from this meeting?';
  const shown = names.slice(0, 3).join(', ').replace(/, ([^,]*)$/, names.length <= 3 ? ' and $1' : ', $1');
  return `Send your notes to ${shown}${names.length > 3 ? ` +${names.length - 3}` : ''}?`;
}

export function followUpTaskTitle(meetingTitle: string): string {
  const title = meetingTitle.trim() || 'meeting';
  return `Send notes: ${title}`.slice(0, 200);
}

/** The day after `now`, as a local YYYY-MM-DD. */
export function dueTomorrow(now: Date): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

export interface FollowUpDeps {
  createTask: typeof createTask;
  linkMeetingTask: typeof linkMeetingTask;
  createLedgerItem: typeof createLedgerItem;
  patchLedger: typeof patchLedger;
  updateMeeting: typeof updateMeeting;
  getMeeting: typeof getMeeting;
  setTaskDone: (taskId: string) => Promise<void>;
  now: () => Date;
}

const defaultDeps: FollowUpDeps = {
  createTask,
  linkMeetingTask,
  createLedgerItem,
  patchLedger,
  updateMeeting,
  getMeeting,
  setTaskDone: setPersonTaskDone,
  now: () => new Date()
};

/**
 * Yes: the task first (a failure here saves nothing, so Yes can be pressed again),
 * then a promise per person. Once the task exists the answer is saved whatever
 * else fails, so a second press can't make a second task.
 */
export async function saveFollowUpYes(
  meeting: Pick<MeetingRecord, 'id' | 'title'>,
  people: FollowUpPerson[],
  deps: FollowUpDeps = defaultDeps
): Promise<NotesFollowUp> {
  const now = deps.now();
  const task = await deps.createTask({ title: followUpTaskTitle(meeting.title), due_date: dueTomorrow(now) });
  try {
    await deps.linkMeetingTask(meeting.id, { relationship_type: 'follow_up', task_id: task.id });
  } catch {
    // The task stands on its own; the meeting link is a nicety.
  }
  const ledgerIds: string[] = [];
  for (const person of people) {
    try {
      const { item } = await deps.createLedgerItem({
        person_ref: person.ref,
        direction: 'you_owe',
        text: 'Send meeting notes',
        comm_ref: `professional:meeting:${meeting.id}`,
        due: dueTomorrow(now)
      });
      ledgerIds.push(item.id);
      await deps.patchLedger(item.id, { task_ref: `tasks:task:${task.id}` }).catch(() => undefined);
    } catch {
      // One missing promise is not worth losing the task over.
    }
  }
  const answer: NotesFollowUp = { answer: 'yes', answered_at: now.toISOString(), task_id: task.id, ledger_ids: ledgerIds, sent_at: null };
  const { meeting: saved } = await deps.updateMeeting(meeting.id, { notes_follow_up: answer });
  return saved.notes_follow_up ?? answer;
}

export async function saveFollowUpNo(meetingId: string, deps: FollowUpDeps = defaultDeps): Promise<NotesFollowUp> {
  const answer: NotesFollowUp = { answer: 'no', answered_at: deps.now().toISOString() };
  const { meeting } = await deps.updateMeeting(meetingId, { notes_follow_up: answer });
  return meeting.notes_follow_up ?? answer;
}

/**
 * The sheet went out: tick the task and promises, then note when. Every step is
 * best-effort; the share has already worked. Returns the new answer, or null when
 * there was nothing to tick.
 */
export async function markNotesSent(meetingId: string, deps: FollowUpDeps = defaultDeps): Promise<NotesFollowUp | null> {
  const { meeting } = await deps.getMeeting(meetingId);
  const current = meeting.notes_follow_up;
  if (!current || current.answer !== 'yes' || current.sent_at) return null;
  if (current.task_id) await deps.setTaskDone(current.task_id).catch(() => undefined);
  for (const ledgerId of current.ledger_ids ?? []) {
    await deps.patchLedger(ledgerId, { status: 'done' }).catch(() => undefined);
  }
  const next: NotesFollowUp = { ...current, sent_at: deps.now().toISOString() };
  try {
    const { meeting: saved } = await deps.updateMeeting(meetingId, { notes_follow_up: next });
    return saved.notes_follow_up ?? next;
  } catch {
    return next;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface NotesFollowUpBar {
  el: HTMLElement;
  /** Re-read the meeting and repaint, e.g. after it is completed or its sheet panel closes. */
  refresh(record?: MeetingRecord): Promise<void>;
}

/**
 * The bar under the meeting's header. Hidden until the meeting is completed and
 * unanswered; after Yes it stays as a nudge with the share sheet until the sheet is published.
 */
export function mountNotesFollowUp(input: {
  record: MeetingRecord;
  people: () => FollowUpPerson[];
  openShare: () => void;
}): NotesFollowUpBar {
  const bar = el('section', 'notes-follow-up');
  bar.dataset.part = 'notes-follow-up';
  bar.setAttribute('aria-live', 'polite');
  bar.hidden = true;
  let record = input.record;
  let paintToken = 0;

  function shareButton(): HTMLButtonElement {
    const share = el('button', 'btn btn--secondary', 'Share sheet');
    share.type = 'button';
    share.dataset.part = 'notes-follow-up-share';
    share.addEventListener('click', () => input.openShare());
    return share;
  }

  function paintAsk(): void {
    const people = input.people();
    const question = el('p', 'notes-follow-up__text', followUpQuestion(people.map((p) => p.name)));
    const status = el('p', 'notes-follow-up__error');
    status.hidden = true;
    const yes = el('button', 'btn btn--primary', 'Yes, remind me');
    yes.type = 'button';
    yes.dataset.part = 'notes-follow-up-yes';
    const no = el('button', 'btn btn--ghost', 'Not this one');
    no.type = 'button';
    no.dataset.part = 'notes-follow-up-no';
    const run = async (work: () => Promise<NotesFollowUp>) => {
      yes.disabled = true;
      no.disabled = true;
      status.hidden = true;
      try {
        const answer = await work();
        record = { ...record, notes_follow_up: answer };
        paint(false);
      } catch {
        status.hidden = false;
        status.textContent = 'Couldn’t save that. Try again.';
        yes.disabled = false;
        no.disabled = false;
      }
    };
    yes.addEventListener('click', () => void run(() => saveFollowUpYes(record, input.people())));
    no.addEventListener('click', () => void run(() => saveFollowUpNo(record.id)));
    const actions = el('div', 'notes-follow-up__actions');
    actions.append(yes, no);
    bar.replaceChildren(question, actions, status);
    bar.hidden = false;
  }

  function paintSet(): void {
    const text = el('p', 'notes-follow-up__text', 'Notes to send: publishing the share sheet ticks off the task and promises.');
    const actions = el('div', 'notes-follow-up__actions');
    actions.append(shareButton());
    bar.replaceChildren(text, actions);
    bar.hidden = false;
  }

  async function paint(checkShare: boolean): Promise<void> {
    const token = ++paintToken;
    const answer = record.notes_follow_up;
    if (answer?.answer === 'yes' && !answer.sent_at) return paintSet();
    if (answer || record.state !== 'completed') {
      bar.hidden = true;
      bar.replaceChildren();
      return;
    }
    let shared = false;
    if (checkShare) {
      try {
        shared = Boolean((await loadSheetState(record.id)).share);
      } catch {
        shared = false;
      }
    }
    if (token !== paintToken) return;
    if (!shouldAskFollowUp(record, shared)) {
      bar.hidden = true;
      return;
    }
    paintAsk();
  }

  void paint(true);

  return {
    el: bar,
    async refresh(next?: MeetingRecord) {
      if (next) record = next;
      else {
        try {
          record = (await getMeeting(record.id)).meeting;
        } catch {
          return;
        }
      }
      await paint(true);
    }
  };
}

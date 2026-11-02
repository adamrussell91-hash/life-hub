import type { ToMarkTask } from './to-mark-view';

/**
 * Turns the queue's tasks into the flow's items, one piece of work each. Short
 * quiz answers to one question stack on one screen; a written answer is one
 * student's work, so it gets its own, like handed-in writing and a viva take.
 */

export type FlowKind = 'voice' | 'quiz' | 'writing' | 'sprint' | 'handup' | 'ask';
export const FLOW_LABEL: Record<FlowKind, string> = { voice: 'Viva', quiz: 'Quiz', writing: 'Writing', sprint: 'Sprint', handup: 'Hand-up', ask: 'Question' };

export type QuizResponse = { text?: string; gaps?: Record<string, string> } | null;
export type QuizAnswer = {
  attempt_id: string;
  student_id: string;
  initials: string;
  name: string;
  submitted_at: string;
  response: QuizResponse;
  awarded: number | null;
  by: 'auto' | 'ai' | 'teacher' | null;
  ai_ready?: boolean;
  ai?: { marks: number | null; suggested?: number; reason: string; feedback?: string; tags?: { code_id: string; quote: string; why?: string }[] };
  comment?: string;
};
export type QuizQuestion = { id: string; kind: string; marks: number; prompt: string; quote?: string; guide?: string; model_answer?: string; answers: QuizAnswer[] };
export type QuizLoad = { lesson_id: string; title: string; questions: QuizQuestion[] };

export type FlowRow = { student_id?: string; initials: string; id?: string; ai_read?: boolean; has_transcript?: boolean; source?: 'lecture' | 'tutorial'; text?: string; scene_label?: string };

export type FlowItem = {
  key: string;
  kind: FlowKind;
  who: string;
  count: number;
  task: ToMarkTask;
  group: string;
  row?: FlowRow;
  question?: QuizQuestion;
  answer?: QuizAnswer;
};

const STACKED = new Set(['short_answer', 'fill_gap']);
export const isStacked = (kind: string): boolean => STACKED.has(kind);

const short = (text: string, max = 60): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function quizItems(task: ToMarkTask, load: QuizLoad | undefined): FlowItem[] {
  const out: FlowItem[] = [];
  for (const question of load?.questions ?? []) {
    const group = `${task.title} · ${short(question.prompt) || 'Question'}`;
    if (isStacked(question.kind)) {
      out.push({ key: `quiz:${task.class_id}:${task.lesson_id}:${question.id}`, kind: 'quiz', who: String(question.answers.length), count: question.answers.length, task, group, question });
    } else {
      for (const answer of question.answers) {
        out.push({ key: `answer:${answer.attempt_id}:${question.id}`, kind: 'quiz', who: answer.initials, count: 1, task, group, question, answer });
      }
    }
  }
  return out;
}

export function flowItems(tasks: readonly ToMarkTask[], quizzes: ReadonlyMap<string, QuizLoad>): FlowItem[] {
  const out: FlowItem[] = [];
  for (const task of tasks.filter((t) => t.waiting > 0)) {
    const kind = task.kind ?? 'piece';
    const base = { task, group: task.title };
    if (kind === 'quiz') out.push(...quizItems(task, quizzes.get(`${task.class_id}:${task.lesson_id}`)));
    else if (kind === 'ask') out.push({ ...base, key: `ask:${task.class_id}:${task.lesson_id}`, kind: 'ask', who: String(task.waiting), count: task.waiting });
    else {
      const flowKind: FlowKind = kind === 'piece' ? 'writing' : kind;
      for (const row of (task.rows ?? []) as FlowRow[]) {
        out.push({ ...base, key: `${kind}:${task.class_id}:${task.lesson_id}:${task.block_id ?? task.column_id ?? ''}:${row.id ?? row.student_id}`, kind: flowKind, who: row.initials, count: 1, row });
      }
    }
  }
  return out;
}

/** What "AI read them" would read: quizzes with answers it hasn't seen, tagged viva questions with takes it hasn't. */
export function aiReadCount(tasks: readonly ToMarkTask[], quizzes: ReadonlyMap<string, QuizLoad>): number {
  let n = 0;
  for (const load of quizzes.values()) for (const q of load.questions) n += q.answers.filter((a) => a.ai_ready).length;
  for (const t of tasks) n += t.ai_ready ?? 0;
  return n;
}

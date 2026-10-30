import type { EvidenceItem } from '@/quiz/evidence';
import type { AssessmentMark, Column, Markbook } from './schema';

/** What the markbook endpoint's `load` returns, and the shapes the views draw. */

/** A lesson marked done: by the student ('tick', 'quiz') or by the teacher, with what the student did kept as `was`. */
export type DoneRecord = { at: string; via: string; partial?: boolean; was?: DoneRecord };

export type RosterStudent = { id: string; name: string; initials: string; removed?: true };

export type QuizRow = { id: string; awarded: number | null; max: number; confidence: 1 | 2 | 3 | null; outcomes: string[]; codes?: string[]; items?: EvidenceItem[]; set?: string; /** Left blank by the student. */ unanswered?: true };
export type PracticeScore = { score: number; max: number; pending: number };
export type QuizScore = { attempt_id: string; submitted_at: string; score: number; max: number; pending: number; rows: QuizRow[]; practice?: Record<string, PracticeScore> };
/** A quiz's group set, as the markbook sees it. */
export type QuizSet = { id: string; group_id: string; name: string; students: string[]; questions: number };
export type QuizQuestionMeta = { id: string; prompt: string; marks: number; outcomes: string[] };
export type QuizColumn = {
  kind: 'quiz';
  /** `quiz:{lessonId}` */
  id: string;
  lesson_id: string;
  title: string;
  /** The quiz's unit, where a follow-up lesson goes. */
  unit_id?: string;
  date: string;
  hidden: boolean;
  /** The quiz asked students how sure they were. */
  confidence: boolean;
  /** The quiz had a timer. */
  timed?: boolean;
  closed?: boolean;
  questions: QuizQuestionMeta[];
  scores: Record<string, QuizScore>;
  /** Students who opened the quiz but haven't handed in. */
  started?: string[];
  /** Their open go as it stands, from what their page saved, for those with an answer saved. */
  saved?: Record<string, QuizSaved>;
  /** Tutorial exit checks: each student's group name. */
  groups?: Record<string, string>;
  /** Group sets in this quiz (practice for saved markbook groups). */
  sets?: QuizSet[];
};

/** A go not handed in yet, marked as far as its saved answers go. */
export type QuizSaved = {
  started_at: string;
  saved_at: string | null;
  answered: number;
  total: number;
  score: number;
  max: number;
  pending: number;
  rows: Array<{ id: string; awarded: number | null; max: number; unanswered?: true }>;
};

/** A block students wrote in, with what the teacher needs to read it. */
export type WorkBlock = { id: string; block_type: string; title: string; prompts: Record<string, string> };
/** One student's writing: block id, then the part the page keeps, then field. */
export type StudentWork = { at: string; blocks: Record<string, Record<string, Record<string, string>>> };
/** A lesson's written work, saved as students typed it. Not stored: built on every load. */
export type WorkColumn = {
  kind: 'work';
  /** `work:{lessonId}` */
  id: string;
  lesson_id: string;
  title: string;
  date: string;
  blocks: WorkBlock[];
  students: Record<string, StudentWork>;
};

export type MarkbookView = {
  markbook: Markbook;
  students: RosterStudent[];
  quizzes: QuizColumn[];
  /** Written work by lesson. Missing from an older server. */
  work?: WorkColumn[];
  /** Lessons each student marked done, by student id then lesson id. */
  done?: Record<string, Record<string, DoneRecord>>;
};
export type AnyColumn = Column | QuizColumn | WorkColumn;
export type OutcomeLabel = { id: string; code: string; title: string; group: string };

export type MarkbookActions = {
  setMark: (columnId: string, studentId: string, mark: unknown | null) => void;
  openAssessment: (columnId: string, studentId: string) => void;
  openQuiz: (lessonId: string, studentId: string) => void;
  openWork: (lessonId: string, studentId: string) => void;
  editColumn: (columnId: string) => void;
  hideQuiz: (lessonId: string, hidden: boolean) => void;
  openHeatmap: (lessonId: string) => void;
  openStudent: (studentId: string) => void;
};

export type { AssessmentMark };

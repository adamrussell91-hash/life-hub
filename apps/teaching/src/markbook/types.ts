import type { EvidenceItem } from '@/quiz/evidence';
import type { AssessmentMark, Column, Markbook } from './schema';

/** What the markbook endpoint's `load` returns, and the shapes the views draw. */

export type RosterStudent = { id: string; name: string; initials: string; removed?: true };

export type QuizRow = { id: string; awarded: number | null; max: number; confidence: 1 | 2 | 3 | null; outcomes: string[]; codes?: string[]; items?: EvidenceItem[]; set?: string; /** Left blank by the student. */ unanswered?: true };
export type PracticeScore = { score: number; max: number; pending: number };
export type QuizScore = {
  attempt_id: string;
  submitted_at: string;
  score: number;
  max: number;
  pending: number;
  rows: QuizRow[];
  practice?: Record<string, PracticeScore>;
  /** Written answers whose typing stood out (pasting, text appearing at once). */
  writing_flags?: number;
};
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
  /** Tutorial exit checks: each student's group name. */
  groups?: Record<string, string>;
  /** Group sets in this quiz (practice for saved markbook groups). */
  sets?: QuizSet[];
};

export type MarkbookView = {
  markbook: Markbook;
  students: RosterStudent[];
  quizzes: QuizColumn[];
  /** Lessons each student marked done, by student id then lesson id. */
  done?: Record<string, Record<string, { at: string; via: string }>>;
};
export type AnyColumn = Column | QuizColumn;
export type OutcomeLabel = { id: string; code: string; title: string; group: string };

export type MarkbookActions = {
  setMark: (columnId: string, studentId: string, mark: unknown | null) => void;
  openAssessment: (columnId: string, studentId: string) => void;
  openQuiz: (lessonId: string, studentId: string) => void;
  editColumn: (columnId: string) => void;
  hideQuiz: (lessonId: string, hidden: boolean) => void;
  openHeatmap: (lessonId: string) => void;
  openStudent: (studentId: string) => void;
};

export type { AssessmentMark };

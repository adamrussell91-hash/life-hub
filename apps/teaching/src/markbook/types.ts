import type { EvidenceItem } from '@/quiz/evidence';
import type { AssessmentMark, Column, Markbook } from './schema';

/** What the markbook endpoint's `load` returns, and the shapes the views draw. */

export type RosterStudent = { id: string; name: string; initials: string; removed?: true };

export type QuizRow = { id: string; awarded: number | null; max: number; confidence: 1 | 2 | 3 | null; outcomes: string[]; codes?: string[]; items?: EvidenceItem[] };
export type QuizScore = { attempt_id: string; submitted_at: string; score: number; max: number; pending: number; rows: QuizRow[] };
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
  closed?: boolean;
  questions: QuizQuestionMeta[];
  scores: Record<string, QuizScore>;
  /** Students who opened the quiz but haven't handed in. */
  started?: string[];
  /** Tutorial exit checks: each student's group name. */
  groups?: Record<string, string>;
};

export type MarkbookView = { markbook: Markbook; students: RosterStudent[]; quizzes: QuizColumn[] };
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

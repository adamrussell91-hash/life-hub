import { createEmptyCard, fsrs, type Card } from "ts-fsrs";
import type { FsrsCard, QuizItemStatus, QuizRating } from "./schema";
import { deriveStatus } from "./status";

const scheduler = fsrs();

export type Reviewable = {
  fsrs: FsrsCard;
  last_rating?: QuizRating;
  status: QuizItemStatus;
};

export function applyRating<T extends Reviewable>(item: T, rating: QuizRating, now: Date = new Date()): T {
  const { card } = scheduler.next(toCard(item.fsrs), now, rating);
  const fsrsCard = fromCard(card);
  return {
    ...item,
    fsrs: fsrsCard,
    last_rating: rating,
    status: deriveStatus(fsrsCard, rating, now),
  };
}

function toCard(card: FsrsCard): Card {
  const empty = createEmptyCard(new Date(card.due));
  return {
    ...empty,
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

function fromCard(card: Card): FsrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    learning_steps: card.learning_steps,
    last_review: card.last_review?.toISOString(),
  };
}

import { newFsrsCard, type PageReview } from "./schema";

export type { PageReview };

export const PAGE_REVIEW_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const DUE_PAGE_CAP = 8;

export type PageReviewSource = {
  id: string;
  title: string;
  area?: "university" | "notes";
  tags?: string[];
  updated_at?: string;
  created_at?: string;
};

export function seedPageReview(page: PageReviewSource, now: Date = new Date()): PageReview {
  const updated = page.updated_at || page.created_at || now.toISOString();
  const firstDue = new Date(Date.parse(updated) + PAGE_REVIEW_GRACE_MS);
  return {
    page_id: page.id,
    title: page.title,
    area: page.area ?? "notes",
    tags: page.tags ?? [],
    updated_at: updated,
    fsrs: { ...newFsrsCard(firstDue), due: firstDue.toISOString() },
    status: "untested",
  };
}

export function isPageReviewDue(review: PageReview, page: PageReviewSource, now: Date = new Date()) {
  const updated = page.updated_at || page.created_at;
  if (updated && review.fsrs.last_review && Date.parse(updated) > Date.parse(review.fsrs.last_review)) {
    return true;
  }
  return Date.parse(review.fsrs.due) <= now.getTime();
}

export function duePageReviews(
  pages: PageReviewSource[],
  reviews: PageReview[],
  now: Date = new Date(),
  cap = DUE_PAGE_CAP,
): PageReview[] {
  const byId = new Map(reviews.map(review => [review.page_id, review]));
  const due: PageReview[] = [];
  for (const page of pages) {
    const existing = byId.get(page.id);
    const review = existing
      ? {
          ...existing,
          title: page.title,
          area: page.area ?? existing.area,
          tags: page.tags ?? existing.tags,
          updated_at: page.updated_at || page.created_at || existing.updated_at,
        }
      : seedPageReview(page, now);
    if (isPageReviewDue(review, page, now)) due.push(review);
  }
  return due.sort((a, b) => Date.parse(a.fsrs.due) - Date.parse(b.fsrs.due)).slice(0, cap);
}

export function upsertPageReview(reviews: PageReview[], next: PageReview): PageReview[] {
  return [...reviews.filter(review => review.page_id !== next.page_id), next];
}

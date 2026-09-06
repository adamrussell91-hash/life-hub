import { describe, expect, it } from "vitest";
import { applyRating } from "./review";
import {
  DUE_PAGE_CAP,
  PAGE_REVIEW_GRACE_MS,
  duePageReviews,
  seedPageReview,
  upsertPageReview,
} from "./pageReview";
import { newFsrsCard } from "./schema";

const now = new Date("2026-09-06T00:00:00.000Z");

function page(overrides: { id: string; title?: string; updated_at: string; tags?: string[] }) {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    area: "notes" as const,
    tags: overrides.tags ?? ["memory"],
    updated_at: overrides.updated_at,
  };
}

describe("seedPageReview", () => {
  it("makes the first due date one grace period after the note was updated", () => {
    const review = seedPageReview(page({ id: "p1", updated_at: "2026-08-01T00:00:00.000Z" }), now);
    expect(Date.parse(review.fsrs.due)).toBe(Date.parse("2026-08-01T00:00:00.000Z") + PAGE_REVIEW_GRACE_MS);
    expect(review.status).toBe("untested");
    expect(review.page_id).toBe("p1");
  });
});

describe("duePageReviews", () => {
  it("includes unreviewed notes older than the grace period", () => {
    const stale = page({ id: "old", title: "Old note", updated_at: "2026-08-01T00:00:00.000Z" });
    const due = duePageReviews([stale], [], now);
    expect(due.map(item => item.page_id)).toEqual(["old"]);
    expect(due[0]?.title).toBe("Old note");
  });

  it("skips unreviewed notes still inside the grace period", () => {
    const fresh = page({ id: "new", updated_at: "2026-09-05T00:00:00.000Z" });
    expect(duePageReviews([fresh], [], now)).toEqual([]);
  });

  it("includes a reviewed note whose FSRS due date has passed", () => {
    const note = page({ id: "p", updated_at: "2026-08-01T00:00:00.000Z" });
    const review = {
      ...seedPageReview(note, now),
      fsrs: { ...newFsrsCard(new Date("2026-09-01T00:00:00.000Z")), reps: 2, due: "2026-09-01T00:00:00.000Z" },
      status: "decaying" as const,
      last_rating: 3 as const,
    };
    expect(duePageReviews([note], [review], now).map(item => item.page_id)).toEqual(["p"]);
  });

  it("skips a reviewed note that is not due yet", () => {
    const note = page({ id: "p", updated_at: "2026-08-01T00:00:00.000Z" });
    const review = {
      ...seedPageReview(note, now),
      fsrs: { ...newFsrsCard(new Date("2026-10-01T00:00:00.000Z")), reps: 2, due: "2026-10-01T00:00:00.000Z" },
      status: "verified" as const,
      last_rating: 4 as const,
    };
    expect(duePageReviews([note], [review], now)).toEqual([]);
  });

  it("brings a reviewed note back due when the body changed after last review", () => {
    const note = page({ id: "p", updated_at: "2026-09-05T00:00:00.000Z" });
    const review = {
      ...seedPageReview(note, now),
      fsrs: {
        ...newFsrsCard(new Date("2026-10-01T00:00:00.000Z")),
        reps: 2,
        due: "2026-10-01T00:00:00.000Z",
        last_review: "2026-09-01T00:00:00.000Z",
      },
      status: "verified" as const,
      last_rating: 4 as const,
    };
    expect(duePageReviews([note], [review], now).map(item => item.page_id)).toEqual(["p"]);
  });

  it("caps the list at the oldest due notes", () => {
    const pages = Array.from({ length: DUE_PAGE_CAP + 3 }, (_, index) =>
      page({
        id: `p${index}`,
        updated_at: new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 86400000).toISOString(),
      }),
    );
    const due = duePageReviews(pages, [], now);
    expect(due).toHaveLength(DUE_PAGE_CAP);
    expect(due[0]?.page_id).toBe("p0");
    expect(due.at(-1)?.page_id).toBe(`p${DUE_PAGE_CAP - 1}`);
  });
});

describe("rate + upsert", () => {
  it("uses the existing FSRS scheduler and replaces the page row", () => {
    const note = page({ id: "p", updated_at: "2026-08-01T00:00:00.000Z" });
    const seeded = seedPageReview(note, now);
    const rated = applyRating(seeded, 4, now);
    expect(Date.parse(rated.fsrs.due)).toBeGreaterThan(now.getTime());
    expect(rated.last_rating).toBe(4);
    expect(rated.fsrs.reps).toBeGreaterThanOrEqual(1);
    expect(upsertPageReview([seeded], rated)).toEqual([rated]);
  });
});

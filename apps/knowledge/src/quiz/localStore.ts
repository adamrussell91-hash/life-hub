import { mergeItemFile } from "./store";
import type { DumpSnapshot, PageReview, QuizEdge, QuizItem, QuizScheduleEntry } from "./schema";

const KEY = "knowledge-hub-quiz";

export type LocalQuiz = {
  schedule: QuizScheduleEntry[];
  itemsByPage: Record<string, QuizItem[]>;
  edges: QuizEdge[];
  dumps: DumpSnapshot[];
  page_reviews: PageReview[];
};

export function loadLocalQuiz(): LocalQuiz {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { schedule: [], itemsByPage: {}, edges: [], dumps: [], page_reviews: [] };
    const parsed = JSON.parse(raw) as LocalQuiz;
    return {
      schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [],
      itemsByPage: parsed.itemsByPage && typeof parsed.itemsByPage === "object" ? parsed.itemsByPage : {},
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      dumps: Array.isArray(parsed.dumps) ? parsed.dumps : [],
      page_reviews: Array.isArray(parsed.page_reviews) ? parsed.page_reviews : [],
    };
  } catch {
    return { schedule: [], itemsByPage: {}, edges: [], dumps: [], page_reviews: [] };
  }
}

export function persistLocalQuiz(
  schedule: QuizScheduleEntry[],
  items: QuizItem[],
  extras?: { edges?: QuizEdge[]; dumps?: DumpSnapshot[]; page_reviews?: PageReview[] },
) {
  const current = loadLocalQuiz();
  const itemsByPage = { ...current.itemsByPage };
  const grouped = new Map<string, QuizItem[]>();
  for (const item of items) {
    const list = grouped.get(item.page_id) ?? [];
    list.push(item);
    grouped.set(item.page_id, list);
  }
  for (const [pageId, incoming] of grouped) {
    itemsByPage[pageId] = mergeItemFile(itemsByPage[pageId] ?? [], incoming);
  }
  localStorage.setItem(
    KEY,
    JSON.stringify({
      schedule,
      itemsByPage,
      edges: extras?.edges ?? current.edges,
      dumps: extras?.dumps ?? current.dumps,
      page_reviews: extras?.page_reviews ?? current.page_reviews,
    }),
  );
}

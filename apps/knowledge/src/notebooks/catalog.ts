import { originLabelsForKind, pageMatchesOriginFilter } from "../archive/originFilter";
import type { Origin } from "../domain/page";
import notesPlace from "../origin/notesPlace.json";

const COVERS: Record<string, string> = {
  "Cognitive Psychology": "./notebooks/cognitive-psychology.jpg",
  "Gifted Education": "./notebooks/gifted-education.jpg",
  "Leadership and Innovation": "./notebooks/leadership-and-innovation.jpg",
  Literacy: "./notebooks/literacy.jpg",
  Mathematics: "./notebooks/mathematics.jpg",
  Numeracy: "./notebooks/numeracy.jpg",
  "Pedagogy and Planning": "./notebooks/pedagogy-and-planning.jpg",
  Philosophy: "./notebooks/philosophy.jpg",
  "Social and Political Thought": "./notebooks/social-and-political-thought.jpg",
  Wellbeing: "./notebooks/wellbeing.jpg",
};

export type NotebookCover = {
  label: string;
  slug: string;
  image?: string;
};

export type NotebookCard = NotebookCover & { count: number };

export type NotebookNote = {
  id: string;
  title: string;
  excerpt: string;
};

type OriginPage = {
  id?: string;
  title?: string;
  excerpt?: string;
  origins?: Origin[];
  source_notion_id?: string;
  source_notion_url?: string;
};

export function notebookSlug(label: string) {
  return label
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function notebookCatalog(): NotebookCover[] {
  return Object.keys(notesPlace.notebook).map(label => ({
    label,
    slug: notebookSlug(label),
    ...(COVERS[label] ? { image: COVERS[label] } : {}),
  }));
}

export function notebookCards(entries: OriginPage[]): NotebookCard[] {
  const counts = new Map(originLabelsForKind(entries, "notebook").map(item => [item.label, item.count]));
  const catalog = notebookCatalog();
  const known = new Set(catalog.map(item => item.label));
  const extras = [...counts.entries()]
    .filter(([label]) => !known.has(label))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, slug: notebookSlug(label), count }));
  return [...catalog.map(item => ({ ...item, count: counts.get(item.label) ?? 0 })), ...extras];
}

export function notesForNotebook<T extends OriginPage>(entries: T[], label: string): T[] {
  return entries.filter(entry => pageMatchesOriginFilter(entry, { kind: "notebook", label }));
}

// Constellation of book ideas: nodes sized by the notes behind them, edges for
// shared research, citations, and ideas that look like the same book.
// Laid out once, deterministically, before first paint (no settling animation).
import { insights, knowledgeRefs, sharedNotes } from "./model";
import type { StudioBook, StudioData } from "./schema";

export type GraphNode = { book: StudioBook; x: number; y: number; r: number };
export type GraphEdge = { a: number; b: number; weight: number; kind: "share" | "cite" | "twin" };
export type GraphLayout = { width: number; height: number; nodes: GraphNode[]; edges: GraphEdge[] };

const AREAS = ["series", "gifted", "science", "systems", "teachers", "history", "new"];

export function constellationLayout(data: StudioData, width = 820, height = 470): GraphLayout {
  const books = data.books;
  const nodes = books.map((book, i) => {
    const angle = (AREAS.indexOf(book.area) / AREAS.length) * Math.PI * 2 + i * 0.37;
    const material = knowledgeRefs(book, data).length || (book.history ? 4 : 1);
    return { book, x: width / 2 + Math.cos(angle) * 230, y: height / 2 + Math.sin(angle) * 150, r: 9 + Math.sqrt(material) * 3.1, vx: 0, vy: 0 };
  });
  const edges: GraphEdge[] = [];
  for (let i = 0; i < books.length; i += 1) {
    for (let j = i + 1; j < books.length; j += 1) {
      const n = sharedNotes(books[i], books[j], data).length;
      if (n >= 3) edges.push({ a: i, b: j, weight: n, kind: "share" });
    }
  }
  books.forEach((book, i) =>
    (book.cites_books ?? []).forEach(id => {
      const j = books.findIndex(b => b.id === id);
      if (j >= 0) edges.push({ a: i, b: j, weight: 2, kind: "cite" });
    }),
  );
  for (const item of insights({ ...data, decisions: {} })) {
    const [kind, blank, host] = item.id.split(":");
    if (kind !== "merge") continue;
    const a = books.findIndex(b => b.id === blank);
    const b = books.findIndex(x => x.id === host);
    if (a >= 0 && b >= 0) edges.push({ a, b, weight: 6, kind: "twin" });
  }

  for (let step = 0; step < 500; step += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const p = nodes[i];
        const q = nodes[j];
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = 5200 / (d * d);
        dx /= d;
        dy /= d;
        p.vx -= dx * f;
        p.vy -= dy * f;
        q.vx += dx * f;
        q.vy += dy * f;
      }
    }
    for (const e of edges) {
      const p = nodes[e.a];
      const q = nodes[e.b];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const rest = e.kind === "twin" ? 70 : Math.max(70, 200 - e.weight * 9);
      const f = (d - rest) * 0.004 * Math.min(e.weight, 8);
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
      q.vx -= (dx / d) * f;
      q.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += (width / 2 - n.x) * 0.004;
      n.vy += (height / 2 - n.y) * 0.006;
      n.x = Math.max(80, Math.min(width - 80, n.x + n.vx * 0.5));
      n.y = Math.max(40, Math.min(height - 56, n.y + n.vy * 0.5));
      n.vx *= 0.6;
      n.vy *= 0.6;
    }
  }
  return { width, height, nodes: nodes.map(({ book, x, y, r }) => ({ book, x, y, r })), edges };
}

import { loadAlignment } from '@/alignment/api';
import type { Alignment } from '@/alignment/schema';
import { STOP_LABEL, spacingPlan, type SpacingLesson, type SpacingRow } from './spacing';
import './conditions.css';

/**
 * Under the unit map, for teachers: dot points taught in one burst and never
 * returned to, each with the later lessons to bring it back in. Each lesson
 * link opens that lesson, where its Conditions panel lists the revisit and
 * can ask the agent for retrieval questions.
 */

export type SpacingPanelOptions = {
  lessons: ReadonlyArray<{ id: string; title: string; href?: string; dot_points?: readonly string[]; assessment?: boolean }>;
  /** Lesson id → first class date and time (`YYYY-MM-DDTHH:MM`). */
  dates?: ReadonlyMap<string, string>;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The unit's lessons as the spacing plan reads them. */
export function spacingLessons(options: SpacingPanelOptions): SpacingLesson[] {
  return options.lessons.map((l) => {
    const date = options.dates?.get(l.id);
    return { id: l.id, title: l.title, ...(l.dot_points ? { dot_points: l.dot_points } : {}), ...(date ? { date } : {}), ...(l.assessment ? { assessment: true } : {}) };
  });
}

/** `human:U2` → `U2 Short words`, when the alignment knows it. */
export function dotPointWords(doc: Alignment | null, ref: string): string {
  const [area, id] = ref.split(':');
  const point = doc?.focus_areas.find((a) => a.id === area)?.points.find((p) => p.id === id);
  return point ? `${point.id} ${point.short}` : (id ?? ref);
}

export function mountSpacingPanel(host: HTMLElement, options: SpacingPanelOptions): void {
  const plan = spacingPlan(spacingLessons(options)).filter((row) => !row.spaced);
  if (!plan.length) return;
  const root = el('section', 'lc-spacing');
  root.setAttribute('aria-label', 'Spacing');
  host.append(root);
  const hrefs = new Map(options.lessons.map((l) => [l.id, l.href] as const));
  const draw = (doc: Alignment | null) => root.replaceChildren(...view(plan, doc, hrefs));
  draw(null);
  void loadAlignment().then(draw).catch(() => { /* Refs stand in for the words. */ });
}

function view(plan: SpacingRow[], doc: Alignment | null, hrefs: ReadonlyMap<string, string | undefined>): HTMLElement[] {
  const head = el('h4', 'lc__subtitle', 'Spacing: taught once');
  const intro = el('p', 'lc__intro', 'Dot points taught in one burst with no return. Retrieval at growing gaps keeps them: bring each back in the lessons below.');
  const list = el('ul', 'lc__list');
  for (const row of plan) {
    const item = el('li', 'lc__row lc__row--revisit');
    const first = row.taughtIn[0]!;
    const body = el('div', 'lc__body');
    body.append(el('strong', 'lc__label', dotPointWords(doc, row.ref)), el('span', 'lc__detail', `Taught in “${first.title}” (${first.date}).`));
    const stops = el('div', 'lc-spacing__stops');
    if (!row.stops.length) stops.append(el('span', 'lc__note', 'No dated lesson after it yet.'));
    for (const stop of row.stops) {
      const href = hrefs.get(stop.lessonId);
      const text = `${STOP_LABEL[stop.why]}: ${stop.title} (+${stop.gap}d)`;
      if (href) {
        const a = el('a', 'lc-spacing__stop', text);
        a.href = href;
        stops.append(a);
      } else stops.append(el('span', 'lc-spacing__stop', text));
    }
    body.append(stops);
    item.append(el('span', 'lc__state', 'Taught once'), body, el('span'));
    list.append(item);
  }
  return [head, intro, list];
}

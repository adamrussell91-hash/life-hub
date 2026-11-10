/**
 * The explainer's text pane: words as spans (data-w), one SVG ink layer and a
 * margin of notes. paint(state) redraws from word rectangles, so the marks
 * follow the words when the text rewraps.
 */
import { bandPath, boxPath, bracketPath, stackLabels, strikePath, underlinePath, type InkRect } from '@/blocks/annotation-ink';
import type { AnnotationTextModel } from '@/blocks/annotation-anchor';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import type { ExplainerState } from './fold';
import { tokenise, wordsOfAnchor, type Word } from './words';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Below this pane width the notes list under the text instead of in the margin. */
export const NOTES_MARGIN_MIN_WIDTH = 560;

export type TextPane = {
  el: HTMLElement;
  words: Word[];
  paint: (state: ExplainerState, opts?: { selection?: [number, number] | null }) => void;
  /** The word under a viewport point, or null. */
  wordAtPoint: (x: number, y: number) => number | null;
  /** The mark or note drawn over a word, newest first, for the eraser. */
  itemOnWord: (word: number) => string | null;
  dispose: () => void;
};

function rel(r: DOMRect, base: DOMRect): InkRect {
  return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
}

/** Word rectangles joined into one rectangle per visual line. */
function lineRects(spans: HTMLElement[], base: DOMRect): InkRect[] {
  const out: InkRect[] = [];
  for (const span of spans) {
    for (const raw of Array.from(span.getClientRects())) {
      if (raw.width < 1 && raw.height < 1) continue;
      const r = rel(raw, base);
      const last = out[out.length - 1];
      if (last && Math.abs(last.y - r.y) < Math.max(4, r.h / 2)) {
        const right = Math.max(last.x + last.w, r.x + r.w);
        last.x = Math.min(last.x, r.x);
        last.w = right - last.x;
        last.h = Math.max(last.h, r.h);
      } else out.push({ ...r });
    }
  }
  return out;
}

export function createTextPane(text: AnnotationTextModel | undefined): TextPane {
  const words = tokenise(text);
  const root = document.createElement('div');
  root.className = 'block-explainer__text';
  const body = document.createElement('div');
  body.className = `block-explainer__lines block-explainer__lines--${text?.kind ?? 'prose'}`;
  const spans: HTMLElement[] = [];
  let wi = 0;
  for (const stanza of text?.stanzas ?? []) {
    const st = document.createElement('div');
    st.className = 'block-explainer__stanza';
    for (const line of stanza.lines) {
      const p = document.createElement('p');
      p.className = 'block-explainer__line';
      if (line.indent) p.style.paddingInlineStart = `${line.indent * 1.5}em`;
      let at = 0;
      while (wi < words.length && words[wi]!.line === line.id && words[wi]!.stanza === stanza.id) {
        const w = words[wi]!;
        if (w.start > at) p.append(line.text.slice(at, w.start));
        const span = document.createElement('span');
        span.className = 'block-explainer__word';
        span.dataset.w = String(w.i);
        span.textContent = line.text.slice(w.start, w.end);
        spans.push(span);
        p.append(span);
        at = w.end;
        wi += 1;
      }
      if (at < line.text.length) p.append(line.text.slice(at));
      if (!line.text) p.append(' ');
      st.append(p);
    }
    body.append(st);
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'block-explainer__ink');
  svg.setAttribute('aria-hidden', 'true');
  const notes = document.createElement('div');
  notes.className = 'block-explainer__notes';
  const pointer = document.createElement('span');
  pointer.className = 'block-explainer__pointer';
  pointer.hidden = true;
  pointer.setAttribute('aria-hidden', 'true');
  root.append(body, svg, notes, pointer);

  let last: { state: ExplainerState; selection: [number, number] | null } | null = null;
  /** Word → ids drawn over it (marks and notes), newest last. */
  let onWord = new Map<number, string[]>();

  const rangeCache = new Map<string, [number, number] | null>();
  const rangeOf = (key: string, anchor: Parameters<typeof wordsOfAnchor>[1]) => {
    if (!text) return null;
    const k = `${key}:${anchor.stanza}:${anchor.line ?? ''}:${anchor.start ?? ''}:${anchor.end ?? ''}:${anchor.quote.exact}`;
    if (!rangeCache.has(k)) rangeCache.set(k, wordsOfAnchor(text, anchor, words));
    return rangeCache.get(k) ?? null;
  };
  const spansOf = (range: [number, number]) => spans.slice(range[0], range[1] + 1);

  function paint(state: ExplainerState, opts: { selection?: [number, number] | null } = {}): void {
    last = { state, selection: opts.selection ?? null };
    // Notes: margin cards beside their words when there is room, else a list below.
    // Set the layout before measuring, because it moves the words.
    const wide = root.getBoundingClientRect().width >= NOTES_MARGIN_MIN_WIDTH;
    root.classList.toggle('is-wide', wide);
    const base = root.getBoundingClientRect();
    svg.replaceChildren();
    notes.replaceChildren();
    onWord = new Map();
    svg.setAttribute('width', String(base.width));
    svg.setAttribute('height', String(base.height));
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, base.width)} ${Math.max(1, base.height)}`);
    const bodyLeft = body.getBoundingClientRect().left - base.left;
    const note = (id: string, range: [number, number]) => {
      for (let i = range[0]; i <= range[1]; i += 1) onWord.set(i, [...(onWord.get(i) ?? []), id]);
    };
    const add = (d: string, cls: string, colour: string | undefined, id: string, band = false) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `${cls} block-annotation__ink--${colour ?? 'wave'}`);
      path.dataset.id = id;
      if (band) svg.prepend(path);
      else svg.append(path);
    };

    for (const m of state.marks) {
      const range = rangeOf(m.id, m.anchor);
      if (!range) continue;
      note(m.id, range);
      const rects = lineRects(spansOf(range), base);
      if (rects.length === 0) continue;
      if (m.style === 'bracket') {
        const top = rects[0]!.y + 1;
        const bottom = rects[rects.length - 1]!.y + rects[rects.length - 1]!.h - 1;
        add(bracketPath(top, bottom, Math.max(2, bodyLeft - 10)), 'block-explainer__stroke', m.colour, m.id);
        continue;
      }
      for (const r of rects) {
        if (m.style === 'highlight') add(bandPath(r), 'block-explainer__band', m.colour ?? 'sand', m.id, true);
        else if (m.style === 'underline') add(underlinePath(r), 'block-explainer__stroke', m.colour, m.id);
        else if (m.style === 'box') add(boxPath(r), 'block-explainer__stroke', m.colour, m.id);
        else add(strikePath(r), 'block-explainer__stroke block-explainer__stroke--strike', m.colour ?? 'coral', m.id);
      }
    }

    if (last.selection) {
      const rects = lineRects(spansOf([Math.min(...last.selection), Math.max(...last.selection)]), base);
      for (const r of rects) add(bandPath(r), 'block-explainer__selection', 'mist', 'selection', true);
    }

    const cards: Array<{ card: HTMLElement; y: number; id: string }> = [];
    const ordered = [...state.notes].sort((a, b) => {
      const ra = rangeOf(a.id, a.anchor)?.[0] ?? 0;
      const rb = rangeOf(b.id, b.anchor)?.[0] ?? 0;
      return ra - rb;
    });
    for (const n of ordered) {
      const range = rangeOf(n.id, n.anchor);
      if (!range) continue;
      note(n.id, range);
      const rects = lineRects(spansOf(range), base);
      const card = document.createElement('div');
      card.className = 'block-explainer__note';
      card.dataset.id = n.id;
      card.innerHTML = sanitizeRichTextHtml(n.html);
      notes.append(card);
      const r = rects[0];
      if (r) {
        cards.push({ card, y: r.y, id: n.id });
        add(underlinePath(r), 'block-explainer__stroke block-explainer__stroke--note', 'navy', n.id);
      }
    }
    if (wide && cards.length > 0) {
      const tops = stackLabels(cards.map((c) => ({ y: c.y, h: c.card.offsetHeight || 40 })));
      let lowest = 0;
      cards.forEach((c, i) => {
        c.card.style.top = `${tops[i]}px`;
        lowest = Math.max(lowest, tops[i]! + (c.card.offsetHeight || 40));
      });
      const need = Math.ceil(lowest - body.offsetHeight);
      root.style.paddingBottom = need > 0 ? `${need + 8}px` : '';
    } else {
      root.style.paddingBottom = '';
      cards.forEach((c) => (c.card.style.top = ''));
    }

    const p = state.pointer;
    const span = p && p.pane === 'text' ? spans[p.word] : undefined;
    if (span) {
      const r = rel(span.getBoundingClientRect(), base);
      pointer.hidden = false;
      pointer.style.left = `${r.x + r.w / 2}px`;
      pointer.style.top = `${r.y + r.h / 2}px`;
    } else pointer.hidden = true;
  }

  function wordAtPoint(x: number, y: number): number | null {
    const hit = document.elementFromPoint?.(x, y);
    const span = hit instanceof HTMLElement ? hit.closest<HTMLElement>('[data-w]') : null;
    if (span && root.contains(span)) return Number(span.dataset.w);
    // Between words: the nearest word on the same visual line.
    let best: number | null = null;
    let bestD = Infinity;
    for (const s of spans) {
      const r = s.getBoundingClientRect();
      if (y < r.top - 2 || y > r.bottom + 2) continue;
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < bestD) {
        bestD = d;
        best = Number(s.dataset.w);
      }
    }
    return bestD < 40 ? best : null;
  }

  const itemOnWord = (word: number) => {
    const ids = onWord.get(word);
    return ids && ids.length ? ids[ids.length - 1]! : null;
  };

  // Anchors are words, not pixels: a new width rewraps the text, so repaint.
  let width = -1;
  const ro =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          const w = Math.round(root.getBoundingClientRect().width);
          if (w === width) return;
          width = w;
          if (last) paint(last.state, { selection: last.selection });
        })
      : null;
  ro?.observe(root);

  return { el: root, words, paint, wordAtPoint, itemOnWord, dispose: () => ro?.disconnect() };
}

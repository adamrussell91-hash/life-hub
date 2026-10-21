import { apiGet, apiPost } from '@/api/client';
import type { DiscernQualifier } from '@/schemas/discern';
import {
  DISCERN_SHAPES, DISCERN_STEP_NAMES, characterMoments, classifyTail, discernOptions, type DiscernShape
} from './discern';
import { renderTailGraph, type TailLine } from './discern-graph';
import { askConfirmCard } from '@/teacher/confirm-dialog';

/**
 * Teacher side of Discern: every student's tail on one graph, anonymous.
 * Group by shape or by initial answer; pick a step to read that step's labels.
 */

export type DiscernTail = {
  initial: string;
  dots: number[];
  labels: string[];
  character?: { dots: number[]; labels: string[] };
};

export type DiscernSpread = { lesson_id: string; block_id: string; tails: DiscernTail[] };

const GROUP_COLOURS = ['var(--wave)', 'var(--high-sea-ink)', 'var(--success)', 'var(--pastel-lilac-ink)', 'var(--danger)'];

export function fetchDiscernSpread(lessonId: string, blockId: string): Promise<DiscernSpread> {
  return apiGet<DiscernSpread>(`/api/lessons/${encodeURIComponent(lessonId)}/discern?block_id=${encodeURIComponent(blockId)}`);
}

export function resetDiscernSpread(lessonId: string, blockId: string): Promise<DiscernSpread> {
  return apiPost<DiscernSpread>(`/api/lessons/${encodeURIComponent(lessonId)}/discern`, { action: 'reset', block_id: blockId });
}

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};
const btn = (text: string, className: string, onClick: () => void) => {
  const b = node('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

/** Tails with all five dots count for shapes; four-dot tails still show on the graph. */
const complete = (t: DiscernTail) => t.dots.length >= 5 && t.dots.slice(0, 5).every((d) => d > 0);

export function mountDiscernSpread(
  host: HTMLElement,
  options: { lessonId: string; blockId: string; discern: DiscernQualifier; fetch?: typeof fetchDiscernSpread; reset?: typeof resetDiscernSpread }
): void {
  const load = options.fetch ?? fetchDiscernSpread;
  const clear = options.reset ?? resetDiscernSpread;
  let tails: DiscernTail[] = [];
  let groupBy: 'shape' | 'initial' = 'shape';
  let highlight: string | null = null;
  let step = 1;

  host.replaceChildren(node('p', 'discern-caption', 'Loading the class spread…'));
  load(options.lessonId, options.blockId)
    .then((data) => { tails = data.tails ?? []; draw(); })
    .catch(() => host.replaceChildren(node('p', 'discern-caption', 'The class spread could not load. Try again in a moment.')));

  function keyOf(t: DiscernTail, opts: string[]): string {
    if (groupBy === 'shape') return complete(t) ? classifyTail(t.dots) : 'open';
    const at = opts.indexOf(t.initial);
    return at < 0 ? 'other' : `p${at}`;
  }

  function draw(): void {
    host.replaceChildren();
    const opts = discernOptions(options.discern);
    const canGroup = opts.length > 1;
    if (!canGroup) groupBy = 'shape';
    const head = node('div', 'discern-spread__head');
    head.append(node('h4', undefined, `Class spread · ${tails.length} ${tails.length === 1 ? 'tail' : 'tails'} in`));
    const tools = node('div', 'discern-actions');
    tools.append(
      btn('Refresh', 'btn btn--ghost', () => mountDiscernSpread(host, options)),
      btn('Clear for a new class', 'btn btn--ghost', async () => {
        const ok = await askConfirmCard({
          title: 'Clear every tail for this block?',
          supporting: 'Students keep the graphs in their books. This cannot be undone from here.',
          confirmLabel: 'Clear tails'
        });
        if (!ok) return;
        clear(options.lessonId, options.blockId).then((data) => { tails = data.tails ?? []; draw(); }).catch(() => undefined);
      })
    );
    head.append(tools);
    host.append(head, node('p', 'discern-caption', 'Anonymous: dots, initial answers and dot labels. No names.'));
    if (!tails.length) {
      host.append(node('p', 'discern-caption', 'No tails yet. They arrive as students draw their tail.'));
      return;
    }

    const segs = node('div', 'discern-segs');
    const byShape = btn('By shape', 'discern-seg', () => { groupBy = 'shape'; highlight = null; draw(); });
    const byInitial = btn('By initial answer', 'discern-seg', () => { groupBy = 'initial'; highlight = null; draw(); });
    byShape.setAttribute('aria-pressed', String(groupBy === 'shape'));
    byInitial.setAttribute('aria-pressed', String(groupBy === 'initial'));
    if (!canGroup) { byInitial.disabled = true; byInitial.title = 'Written initial answers can’t be grouped'; }
    segs.append(byShape, byInitial);
    host.append(segs);

    const colourFor = (key: string) => key.startsWith('p') ? GROUP_COLOURS[Number(key.slice(1)) % GROUP_COLOURS.length] : undefined;
    const lines: TailLine[] = tails.map((t) => {
      const key = keyOf(t, opts);
      return { values: t.dots.slice(0, 5), key, colour: groupBy === 'initial' ? colourFor(key) : undefined };
    });
    host.append(renderTailGraph({ columns: DISCERN_STEP_NAMES, lines, highlight }));

    const legend = node('div', 'discern-legend');
    const counts = new Map<string, number>();
    lines.forEach((l) => counts.set(l.key, (counts.get(l.key) ?? 0) + 1));
    const entries: Array<[string, string]> = groupBy === 'shape'
      ? [...(Object.keys(DISCERN_SHAPES) as DiscernShape[]).map((k) => [k, DISCERN_SHAPES[k].name] as [string, string]), ['open', 'Not confirmed yet']]
      : [...opts.map((o, i) => [`p${i}`, o] as [string, string]), ['other', 'Other']];
    for (const [key, name] of entries) {
      const n = counts.get(key);
      if (!n) continue;
      const chip = btn('', 'discern-position', () => { highlight = highlight === key ? null : key; draw(); });
      chip.setAttribute('aria-pressed', String(highlight === key));
      if (groupBy === 'shape' && key !== 'open') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 32 15');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('discern-shape-icon');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', DISCERN_SHAPES[key as DiscernShape].icon);
        svg.append(p);
        chip.append(svg);
      } else if (groupBy === 'initial') {
        const swatch = node('span', 'discern-swatch');
        swatch.style.background = colourFor(key) ?? 'var(--shallow)';
        chip.append(swatch);
      }
      chip.append(document.createTextNode(`${name} `), node('b', undefined, String(n)));
      legend.append(chip);
    }
    host.append(legend);

    host.append(groupBy === 'shape' ? insights() : initialTable(opts));
    host.append(labelReader(lines));
    const moments = characterMoments(options.discern);
    if (moments.length) host.append(characterSpread(moments));
  }

  function insights(): HTMLElement {
    const drops = [0, 0, 0, 0, 0];
    tails.forEach((t) => { for (let i = 1; i < 5; i++) if (t.dots[i] && t.dots[i - 1] && t.dots[i]! < t.dots[i - 1]!) drops[i]!++; });
    const most = Math.max(...drops);
    const biggest = drops.indexOf(most);
    const flat = tails.filter((t) => complete(t) && classifyTail(t.dots) === 'flat').length;
    const uneasy = tails.filter((t) => t.dots[4] && t.dots[4] <= 2).length;
    const wrap = node('div', 'discern-insights');
    const tile = (big: string, text: string) => {
      const t = node('div', 'discern-insight');
      t.append(node('strong', undefined, big), document.createTextNode(text));
      return t;
    };
    wrap.append(
      most ? tile(DISCERN_STEP_NAMES[biggest]!, ` shook the most students (${most} dropped there).`) : tile('No drops', ' yet.'),
      tile(String(flat), ' barely moved. Worth a harder case against next lesson.'),
      tile(String(uneasy), ' finished uneasy. Good students to ask: what is the unease pointing at?')
    );
    return wrap;
  }

  function initialTable(opts: string[]): HTMLElement {
    const wrap = node('div', 'discern-table-wrap');
    const table = node('table', 'discern-table');
    const head = node('tr');
    for (const h of ['Initial answer', 'Students', 'Shaken by Against', 'Finished uneasy', 'Most common shape']) head.append(node('th', undefined, h));
    table.append(node('thead'), node('tbody'));
    table.tHead!.append(head);
    opts.forEach((o, i) => {
      const group = tails.filter((t) => t.initial === o);
      if (!group.length) return;
      const shapes = new Map<DiscernShape, number>();
      group.filter(complete).forEach((t) => { const s = classifyTail(t.dots); shapes.set(s, (shapes.get(s) ?? 0) + 1); });
      const top = [...shapes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const row = node('tr');
      const name = node('td');
      const swatch = node('span', 'discern-swatch');
      swatch.style.background = GROUP_COLOURS[i % GROUP_COLOURS.length]!;
      name.append(swatch, document.createTextNode(` ${o}`));
      row.append(
        name,
        node('td', undefined, String(group.length)),
        node('td', undefined, `${group.filter((t) => t.dots[1] && t.dots[0] && t.dots[1] < t.dots[0]).length} of ${group.length}`),
        node('td', undefined, String(group.filter((t) => t.dots[4] && t.dots[4] <= 2).length)),
        node('td', undefined, top ? DISCERN_SHAPES[top].name : '·')
      );
      table.tBodies[0]!.append(row);
    });
    wrap.append(table);
    return wrap;
  }

  /** What students wrote at one step, for the tails currently picked out. */
  function labelReader(lines: TailLine[]): HTMLElement {
    const wrap = node('section', 'discern-labels');
    wrap.append(node('h5', undefined, highlight ? 'What these students wrote' : 'What students wrote'));
    const segs = node('div', 'discern-segs');
    DISCERN_STEP_NAMES.forEach((name, i) => {
      const b = btn(name, 'discern-seg', () => { step = i; draw(); });
      b.setAttribute('aria-pressed', String(step === i));
      segs.append(b);
    });
    const list = node('ul', 'discern-labels__list');
    const picked = tails.filter((_, i) => !highlight || lines[i]!.key === highlight);
    const texts = picked.map((t) => (step === 0 && t.initial ? `${t.initial}: ${t.labels[0] ?? ''}` : t.labels[step] ?? '').trim()).filter(Boolean);
    const counts = new Map<string, number>();
    for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
    for (const [text, n] of [...counts].sort((x, y) => y[1] - x[1])) list.append(node('li', undefined, n > 1 ? `${text} ×${n}` : text));
    wrap.append(segs, texts.length ? list : node('p', 'discern-caption', 'Nothing written at this step yet.'));
    return wrap;
  }

  function characterSpread(moments: string[]): HTMLElement {
    const who = options.discern.who.trim() || 'The character';
    const wrap = node('section', 'discern-labels');
    const with_ = tails.filter((t) => t.character?.dots?.some((d) => d > 0));
    wrap.append(node('h5', undefined, `${who}’s own tail · ${with_.length} in`));
    if (!with_.length) {
      wrap.append(node('p', 'discern-caption', 'No character tails yet.'));
      return wrap;
    }
    wrap.append(renderTailGraph({ columns: moments, lines: with_.map((t) => ({ values: t.character!.dots.slice(0, moments.length), key: 'c' })) }));
    const avg = moments.map((_, m) => {
      const vals = with_.map((t) => t.character!.dots[m] ?? 0).filter((d) => d > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    const lo = avg.indexOf(Math.min(...avg.filter((a) => a > 0)));
    const hi = avg.indexOf(Math.max(...avg));
    if (lo >= 0 && hi >= 0) {
      wrap.append(node('p', 'discern-caption', `The class reads ${who} as most settled at “${moments[hi]}” and least settled at “${moments[lo]}”.`));
    }
    return wrap;
  }
}

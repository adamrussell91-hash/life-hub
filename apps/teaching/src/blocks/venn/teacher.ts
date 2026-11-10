import { button, el, isNotPublished } from '@/blocks/peer-feedback-ui';
import { fetchThinking, resetThinking, type ThinkingResponse } from '@/blocks/thinking-client';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import type { VennBlock } from './index';
import { cleanState, depthCounts, fillFrame, pointComplete, regionsFor, textCount, type VennState } from './model';
import { depthTally, drawDiagram, legend, readOnlyColumns, regionCounts, regionTag } from './diagram';

/** How often the Display view looks for new Venns. */
export const DISPLAY_REFRESH_MS = 8000;

type Entry = { at: string; initials: string; state: VennState };

/** Canvas preview (no lesson yet): the empty Venn, the points to sort and the frame. */
export function renderPreview(block: VennBlock): HTMLElement {
  const { content } = block;
  const count = textCount(content.texts);
  const labels = content.texts.map((t) => t.label);
  const box = el('div', 'venn-preview');
  box.append(drawDiagram({ count, labels }), legend(count, labels));
  const preload = content.preload.filter((p) => p.text.trim());
  if (preload.length) {
    const list = el('ul', 'venn-preview__preload');
    for (const p of preload) list.append(el('li', '', p.text));
    box.append(el('p', 'pf-field__label', `Points to sort · ${preload.length}`), list);
  }
  if (content.synthesis_frame.trim()) {
    box.append(el('p', 'pf-field__label', 'Synthesis frame'), el('p', 'venn-frame', fillFrame(content.synthesis_frame, labels)));
  }
  box.append(el('p', 'pf-note block-secondary', 'Students build their Venn in the published lesson.'));
  return box;
}

export function mountTeacher(block: VennBlock, lessonId: string, display: boolean): HTMLElement {
  const { content } = block;
  const count = textCount(content.texts);
  const labels = content.texts.map((t) => t.label);
  const root = el('div', `venn-teacher${display ? ' venn-teacher--display' : ''}`);
  let entries: Entry[] = [];
  let spotlight: number | null = display ? 0 : null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  root.append(el('p', 'block-secondary', 'Loading the class’s Venns…'));

  function load(): void {
    fetchThinking<unknown>(lessonId, block.id)
      .then((set) => {
        entries = toEntries(set.responses ?? []);
        draw();
      })
      .catch((error) => {
        root.replaceChildren(el('p', 'block-secondary', isNotPublished(error)
          ? 'Publish this lesson and students’ Venns arrive here.'
          : 'The class’s Venns could not load. Try Refresh in a moment.'), button('Refresh', 'ghost', load));
      })
      .finally(() => {
        if (display) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            if (root.isConnected) load();
          }, DISPLAY_REFRESH_MS);
        }
      });
  }

  function toEntries(responses: Array<ThinkingResponse<unknown>>): Entry[] {
    return [...responses]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((r) => ({ at: r.at, initials: r.initials, state: cleanState(r.data, count) }));
  }

  function draw(): void {
    const head = el('div', 'venn-teacher__head');
    head.append(el('h4', 'block-subtitle', `Class Venns · ${entries.length} in`));
    const tools = el('div', 'pf-actions');
    tools.append(button('Refresh', 'ghost', load));
    if (!display) {
      tools.append(button('Clear responses', 'ghost', async () => {
        const ok = await askConfirmCard({
          title: 'Clear every Venn for this block?',
          supporting: 'Students keep their Venn on their own device. This cannot be undone from here.',
          confirmLabel: 'Clear responses'
        });
        if (!ok) return;
        resetThinking<unknown>(lessonId, block.id)
          .then((set) => {
            entries = toEntries(set.responses ?? []);
            spotlight = display ? 0 : null;
            draw();
          })
          .catch(() => undefined);
      }));
    }
    head.append(tools);
    const parts: HTMLElement[] = [head];
    if (!entries.length) {
      parts.push(el('p', 'block-secondary', 'No Venns yet. They arrive as students build them.'));
      root.replaceChildren(...parts);
      return;
    }
    parts.push(summary());
    if (spotlight !== null) {
      spotlight = Math.min(Math.max(0, spotlight), entries.length - 1);
      parts.push(spotlightView(spotlight));
    }
    if (!display) parts.push(list());
    root.replaceChildren(...parts);
  }

  function summary(): HTMLElement {
    const all = entries.flatMap((e) => e.state.points);
    const placed = all.filter((p) => p.text.trim() && p.region);
    const done = placed.filter(pointComplete).length;
    const box = el('div', 'venn-summary');
    box.append(depthTally(all), el('p', 'block-secondary', `${done} of ${placed.length} placed points complete across the class.`));
    return box;
  }

  function counts(state: VennState): string {
    const byR = regionCounts(state.points, count);
    return regionsFor(count).map((r) => `${regionTag(r)} ${byR.get(r) ?? 0}`).join(' · ');
  }

  function list(): HTMLElement {
    const wrap = el('ol', 'venn-list');
    entries.forEach((entry, i) => {
      const { state } = entry;
      const placed = state.points.filter((p) => p.text.trim() && p.region);
      const { deep, surface } = depthCounts(state.points);
      const row = el('li', 'venn-row');
      const top = el('div', 'venn-row__top');
      top.append(
        el('b', 'venn-row__who', entry.initials || '—'),
        el('span', 'venn-row__counts', counts(state)),
        el('span', 'venn-row__depth', `Deep ${deep} · Surface ${surface}`),
        el('span', 'venn-row__done', `${placed.filter(pointComplete).length} of ${placed.length} complete`)
      );
      const large = button('Show large', 'ghost', () => {
        spotlight = i;
        draw();
        root.querySelector<HTMLElement>('.venn-spotlight')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });
      large.setAttribute('aria-label', `Show Student ${i + 1}’s Venn large, without initials`);
      top.append(large);
      row.append(top);
      if (state.synthesis?.trim()) row.append(el('p', 'venn-row__synthesis', state.synthesis));
      const more = el('details', 'venn-row__more');
      more.append(el('summary', '', 'See the full Venn'));
      more.addEventListener('toggle', () => {
        if (more.open && more.childElementCount === 1) more.append(fullVenn(state));
      });
      row.append(more);
      wrap.append(row);
    });
    return wrap;
  }

  function fullVenn(state: VennState, size: 'normal' | 'large' = 'normal'): HTMLElement {
    const box = el('div', 'venn-full');
    box.append(drawDiagram({ count, labels, counts: regionCounts(state.points, count), size }), legend(count, labels), depthTally(state.points));
    if (state.synthesis?.trim()) {
      const q = el('blockquote', 'venn-full__synthesis');
      q.textContent = state.synthesis;
      box.append(q);
    }
    box.append(readOnlyColumns(state.points, count, labels));
    return box;
  }

  /** One Venn, large and anonymous, for the class to read. */
  function spotlightView(i: number): HTMLElement {
    const box = el('section', 'venn-spotlight');
    box.setAttribute('aria-label', `Student ${i + 1} of ${entries.length}`);
    const nav = el('div', 'venn-spotlight__nav');
    const prev = button('←', 'ghost', () => {
      spotlight = Math.max(0, i - 1);
      draw();
    });
    prev.className = 'cl-arrow';
    prev.setAttribute('aria-label', 'Previous Venn');
    prev.disabled = i === 0;
    const next = button('→', 'ghost', () => {
      spotlight = Math.min(entries.length - 1, i + 1);
      draw();
    });
    next.className = 'cl-arrow';
    next.setAttribute('aria-label', 'Next Venn');
    next.disabled = i >= entries.length - 1;
    nav.append(prev, el('span', 'venn-spotlight__who', `Student ${i + 1} of ${entries.length}`), next);
    if (!display) {
      nav.append(button('Close', 'ghost', () => {
        spotlight = null;
        draw();
      }));
    }
    box.append(nav, fullVenn(entries[i]!.state, 'large'));
    return box;
  }

  load();
  return root;
}

/**
 * Tidy up after Stop: every event at its time, as `mm:ss · label · words`.
 * Drag or nudge a time, edit a note or pause prompt, delete an event, or
 * re-record from a point.
 */
import type { ExplainerEvent, ExplainerRecording } from '@/schemas/block';
import { sortEvents } from './fold';
import { formatClock } from './player';
import { TOOL_LABEL } from './recorder';
import { anchorWords } from './words';

export const NUDGE_S = 0.5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
/** A note's words for the edit box, one blank line between paragraphs. */
const htmlText = (html: string) => {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks = Array.from(body.querySelectorAll('p, li, h1, h2, h3, h4, blockquote'));
  if (blocks.length === 0) return (body.textContent ?? '').trim();
  return blocks.map((b) => (b.textContent ?? '').trim()).filter(Boolean).join('\n\n');
};
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The row label for an event. */
export function eventLabel(ev: ExplainerEvent, all: readonly ExplainerEvent[] = []): string {
  switch (ev.kind) {
    case 'mark':
      return `${TOOL_LABEL[ev.style]} · ${anchorWords(ev.anchor)}`;
    case 'note':
      return `Note · ${anchorWords(ev.anchor)}`;
    case 'erase': {
      const target = all.find((x) => x.id === ev.target);
      return `Erase · ${target && target.kind !== 'erase' ? eventLabel(target) : 'a mark'}`;
    }
    case 'pointer':
      return `${ev.pane === 'board' ? 'Board pointer' : 'Pointer'} · ${ev.samples.length} ${ev.samples.length === 1 ? 'spot' : 'moves'}`;
    case 'pause':
      return 'Pause point';
    case 'board': {
      const gone = ev.elements.filter((e) => e.isDeleted).length;
      const kept = ev.elements.length - gone;
      const parts = [kept ? `${kept} ${kept === 1 ? 'shape' : 'shapes'} drawn or moved` : '', gone ? `${gone} removed` : ''].filter(Boolean);
      return `Board · ${parts.join(', ') || 'change'}`;
    }
    case 'stroke':
      return 'Pen stroke';
    case 'send':
      return `Sent to board · ${anchorWords(ev.anchor)}`;
  }
}

/** Move an event to a new time and keep the list in time order. */
export function moveEvent(rec: ExplainerRecording, id: string, t: number): ExplainerRecording {
  let at = round2(Math.max(0, Math.min(rec.duration_s, t)));
  // An erase has to come after what it rubs out, or that mark would never go.
  const ev = rec.events.find((e) => e.id === id);
  if (ev?.kind === 'erase') {
    const target = rec.events.find((e) => e.id === ev.target);
    if (target) at = Math.max(at, target.t);
  }
  for (const e of rec.events) if (e.kind === 'erase' && e.target === id) at = Math.min(at, e.t);
  return { ...rec, events: sortEvents(rec.events.map((ev) => (ev.id === id ? { ...ev, t: at } : ev))) };
}

/** Delete an event, and any erase that pointed at it. */
export function deleteEvent(rec: ExplainerRecording, id: string): ExplainerRecording {
  return { ...rec, events: rec.events.filter((ev) => ev.id !== id && !(ev.kind === 'erase' && ev.target === id)) };
}

export function createTimeline(
  rec: ExplainerRecording,
  hooks: { onChange: (rec: ExplainerRecording) => void; onSeek: (t: number) => void; onRerecord: (t: number) => void }
): HTMLElement {
  const root = el('div', 'block-explainer__timeline');
  root.append(el('h4', 'block-explainer__timeline-title', 'Timeline'));
  if (rec.events.length === 0) {
    root.append(el('p', 'block-explainer__hint', 'Nothing was marked in this recording.'));
  }
  const list = el('ol', 'block-explainer__events');
  for (const ev of rec.events) {
    const row = el('li', `block-explainer__event block-explainer__event--${ev.kind}`);
    row.dataset.id = ev.id;
    const time = btn(formatClock(ev.t), 'btn--ghost block-explainer__event-time', () => hooks.onSeek(ev.t));
    time.title = 'Play from here';
    const label = el('span', 'block-explainer__event-label', eventLabel(ev, rec.events));
    const slide = el('input', 'block-explainer__event-slide');
    slide.type = 'range';
    slide.min = '0';
    slide.max = String(rec.duration_s);
    slide.step = '0.1';
    slide.value = String(ev.t);
    slide.setAttribute('aria-label', `Time of ${eventLabel(ev, rec.events)}`);
    slide.addEventListener('input', () => (time.textContent = formatClock(Number(slide.value))));
    slide.addEventListener('change', () => hooks.onChange(moveEvent(rec, ev.id, Number(slide.value))));
    const earlier = btn(`−${NUDGE_S}s`, 'btn--ghost block-explainer__nudge', () => hooks.onChange(moveEvent(rec, ev.id, ev.t - NUDGE_S)));
    earlier.setAttribute('aria-label', 'Earlier');
    const later = btn(`+${NUDGE_S}s`, 'btn--ghost block-explainer__nudge', () => hooks.onChange(moveEvent(rec, ev.id, ev.t + NUDGE_S)));
    later.setAttribute('aria-label', 'Later');
    const del = btn('Delete', 'btn--ghost block-explainer__event-delete', () => hooks.onChange(deleteEvent(rec, ev.id)));
    const again = btn('Re-record from here', 'btn--ghost block-explainer__rerecord', () => hooks.onRerecord(ev.t));
    const top = el('div', 'block-explainer__event-row');
    top.append(time, label);
    const controls = el('div', 'block-explainer__event-controls');
    controls.append(earlier, slide, later, del, again);
    row.append(top);
    if (ev.kind === 'note') {
      const input = el('textarea', 'block-explainer__event-note');
      input.rows = 2;
      input.value = htmlText(ev.html);
      input.setAttribute('aria-label', 'Note text');
      input.addEventListener('change', () => {
        // Unchanged words keep the note's own formatting; an edit keeps its paragraphs.
        if (input.value.trim() === htmlText(ev.html).trim()) return;
        const html = input.value
          .trim()
          .split(/\n\s*\n/)
          .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>`)
          .join('');
        hooks.onChange({ ...rec, events: rec.events.map((x) => (x.id === ev.id ? { ...ev, html } : x)) });
      });
      row.append(input);
    }
    if (ev.kind === 'pause') {
      const input = el('input', 'block-explainer__event-prompt');
      input.type = 'text';
      input.value = ev.prompt;
      input.placeholder = 'What should students think about here?';
      input.setAttribute('aria-label', 'Pause prompt');
      input.addEventListener('change', () =>
        hooks.onChange({ ...rec, events: rec.events.map((x) => (x.id === ev.id ? { ...ev, prompt: input.value.trim() } : x)) })
      );
      row.append(input);
    }
    row.append(controls);
    list.append(row);
  }
  root.append(list);
  return root;
}

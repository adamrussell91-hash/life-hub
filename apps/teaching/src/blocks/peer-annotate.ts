import { loadLiteraryElements, type LiteraryTechnique } from '@/blocks/literary-elements';
import { renderElementCard } from '@/blocks/technique-card';
import { button, el, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import './peer-annotate.css';

/**
 * Annotate mode of the peer feedback block: feedback as notes on the text.
 *
 * A reviewer taps a sentence (or drags to pick exact words), presses one of
 * the teacher's feedback buttons, answers the button's question if it has one
 * ("Should be: metaphor") and can add a comment. The writer gets their piece
 * back with one layer per reviewer, called only Reviewer 1 and Reviewer 2.
 * Resources come from the teacher's button bank when the writer reads them.
 */

export type CodeColour = 'blue' | 'sage' | 'peach' | 'gold' | 'lilac';
export type Resource =
  | { kind: 'technique' }
  | { kind: 'link' | 'video'; url: string; title?: string; start?: number };
export type Code = { id: string; label: string; colour: CodeColour; ask?: string; resource?: Resource };
export type Note = { start: number; end: number; quote: string; code_id?: string; code_label?: string; answer?: string; comment?: string };
export type NoteStatus = 'ok' | 'held' | 'released' | 'removed';
export type TeacherNote = Note & { i: number; flagged: boolean; status: NoteStatus };
export type TeacherLayer = { reviewer: string; sent: boolean; notes: TeacherNote[] };
export type Piece = { text: string; sent: boolean };

export const MAX_NOTES = 20;
const MAX_ANSWER = 80;
const MAX_COMMENT = 300;
/** Reviewer 1 and Reviewer 2. Kept apart from the button colours. */
const LAYER_COLOURS = ['var(--wave)', 'var(--success)'];

/* ── Text: paragraphs, sentences and marked runs ──────────────────── */

export type Sentence = { start: number; end: number; para: number };

/** Each line is a paragraph; sentences end at . ! or ? (plus any closing quote). */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let para = 0;
  for (const line of text.matchAll(/[^\n]+/g)) {
    if (!line[0].trim()) continue;
    const base = line.index ?? 0;
    for (const m of line[0].matchAll(/[^.!?]*[.!?]+["'”’)\]]*|[^.!?]+$/g)) {
      const raw = m[0];
      const lead = raw.length - raw.trimStart().length;
      const body = raw.trim();
      if (!body) continue;
      const start = base + (m.index ?? 0) + lead;
      out.push({ start, end: start + body.length, para });
    }
    para++;
  }
  return out;
}

export type Mark = { start: number; end: number; layer: number; colour: string };

/**
 * The writing as tappable sentences, cut into runs wherever a mark starts or
 * ends. Each run knows its character range, so a tap or a drag maps straight
 * back to offsets in the original text.
 */
export function paper(text: string, marks: Mark[], selected: { start: number; end: number } | null): HTMLElement {
  const box = el('div', 'pa-paper');
  const list = sentences(text);
  let p: HTMLElement | null = null;
  let lastPara = -1;
  list.forEach((s, index) => {
    if (s.para !== lastPara) {
      p = el('p', 'pa-paper__para');
      box.append(p);
      lastPara = s.para;
    } else {
      p!.append(' ');
    }
    const cuts = new Set([s.start, s.end]);
    for (const m of marks) {
      if (m.start > s.start && m.start < s.end) cuts.add(m.start);
      if (m.end > s.start && m.end < s.end) cuts.add(m.end);
    }
    if (selected) {
      if (selected.start > s.start && selected.start < s.end) cuts.add(selected.start);
      if (selected.end > s.start && selected.end < s.end) cuts.add(selected.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const sentence = el('span', 'pa-sentence');
    sentence.dataset.index = String(index);
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i]!, points[i + 1]!];
      const run = el('span', 'pa-run', text.slice(a, b));
      run.dataset.start = String(a);
      run.dataset.end = String(b);
      const over = marks.filter((m) => m.start < b && m.end > a);
      if (over.length) {
        run.classList.add('pa-run--mark');
        run.style.setProperty('--pa-mark', over[0]!.colour);
        if (new Set(over.map((m) => m.layer)).size > 1) {
          run.classList.add('pa-run--both');
          run.style.setProperty('--pa-mark-2', over.find((m) => m.layer !== over[0]!.layer)!.colour);
        }
      }
      if (selected && selected.start < b && selected.end > a) run.classList.add('pa-run--selected');
      sentence.append(run);
    }
    p!.append(sentence);
  });
  if (!list.length) box.append(el('p', 'pa-paper__para', text));
  return box;
}

/** Character offset of a point in the paper, or null when it isn't inside a run. */
function offsetOf(node: Node, offset: number): number | null {
  const run = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest<HTMLElement>('.pa-run');
  if (!run) return null;
  const start = Number(run.dataset.start);
  return node.nodeType === Node.TEXT_NODE ? start + offset : offset === 0 ? start : Number(run.dataset.end);
}

function trimRange(text: string, start: number, end: number): { start: number; end: number } | null {
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return end > start ? { start, end } : null;
}

const codeInk = (colour: CodeColour) => `var(--pastel-${colour}-ink)`;

function colourDot(colour: string): HTMLElement {
  const dot = el('span', 'pa-dot');
  dot.style.setProperty('--pa-dot', colour);
  return dot;
}

function quoteText(quote: string): string {
  return `“${quote.length > 120 ? `${quote.slice(0, 117)}…` : quote}”`;
}

function noteTitle(note: Note): string {
  const label = note.code_label ?? 'Comment';
  return note.answer ? `${label}: ${note.answer}` : label;
}

/* ── Giving feedback ──────────────────────────────────────────────── */

type Draft = { start: number; end: number; code_id?: string; answer?: string; comment?: string };

export type GiveOptions = {
  pieces: Piece[];
  codes: Code[];
  /** Device storage key for one piece's unsent notes. */
  draftKey: (piece: number) => string;
  onSend: (piece: number, notes: Draft[], pressed: HTMLButtonElement) => Promise<boolean>;
  onError: (message: string) => void;
};

export function giveView(opts: GiveOptions): HTMLElement {
  const piece = opts.pieces.findIndex((p) => !p.sent);
  const text = opts.pieces[piece]?.text ?? '';
  const byId = new Map(opts.codes.map((c) => [c.id, c]));
  const root = el('div', 'pa-give');

  let notes = (readJSON<Draft[]>(opts.draftKey(piece)) ?? []).filter(
    (n) => n.end <= text.length && n.start < n.end && (!n.code_id || byId.has(n.code_id))
  );
  let selected: { start: number; end: number } | null = null;
  let chosen: Code | null = null;
  let answer = '';
  let comment = '';

  const save = () => {
    if (!writeJSON(opts.draftKey(piece), notes)) opts.onError('This browser isn’t saving drafts. Keep this page open until you send.');
  };

  const head = el('div', 'pa-give__head');
  head.append(el('p', 'pa-give__title', 'Someone’s answer'));
  if (opts.pieces.length > 1) head.append(el('p', 'pa-give__count', `Piece ${piece + 1} of ${opts.pieces.length}`));
  const hint = el('p', 'pa-hint', 'Tap a sentence (tap the next one to add it), or drag to pick exact words. Then choose what to say about it.');
  const paperHost = el('div', 'pa-paper-host');
  const tray = el('div', 'pa-tray');
  const list = el('ul', 'pa-notes');
  const sendRow = el('div', 'pf-actions');
  root.append(head, hint, paperHost, tray, list, sendRow);

  const marks = (): Mark[] =>
    notes.map((n) => {
      const code = n.code_id ? byId.get(n.code_id) : undefined;
      return { start: n.start, end: n.end, layer: 0, colour: code ? codeInk(code.colour) : 'var(--muted)' };
    });

  function paint(): void {
    paperHost.replaceChildren(paper(text, marks(), selected));
    paintTray();
    paintList();
    paintSend();
  }

  function select(range: { start: number; end: number } | null): void {
    selected = range;
    chosen = null;
    answer = '';
    comment = '';
    paint();
    if (selected) tray.querySelector<HTMLButtonElement>('.pa-code')?.focus({ preventScroll: true });
  }

  // Tap: one sentence, or grow the selection to the next/previous sentence.
  paperHost.addEventListener('click', (event) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && paperHost.contains(sel.anchorNode)) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('.pa-sentence');
    if (!target) return;
    const all = sentences(text);
    const index = Number(target.dataset.index);
    const s = all[index];
    if (!s) return;
    if (selected && s.start >= selected.start && s.end <= selected.end) return select(null);
    if (selected) {
      const first = all.findIndex((x) => x.end > selected!.start);
      const last = all.findIndex((x) => x.end >= selected!.end);
      if (index === first - 1 || index === last + 1) {
        return select({ start: Math.min(s.start, selected.start), end: Math.max(s.end, selected.end) });
      }
    }
    select({ start: s.start, end: s.end });
  });

  // Drag: exact words.
  const pickDrag = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!paperHost.contains(range.startContainer) || !paperHost.contains(range.endContainer)) return;
    const a = offsetOf(range.startContainer, range.startOffset);
    const b = offsetOf(range.endContainer, range.endOffset);
    if (a === null || b === null) return;
    const trimmed = trimRange(text, Math.min(a, b), Math.max(a, b));
    if (!trimmed) return;
    sel.removeAllRanges();
    select(trimmed);
  };
  paperHost.addEventListener('mouseup', () => window.setTimeout(pickDrag, 0));
  paperHost.addEventListener('touchend', () => window.setTimeout(pickDrag, 350));

  function paintTray(): void {
    tray.hidden = !selected;
    tray.replaceChildren();
    if (!selected) return;
    if (notes.length >= MAX_NOTES) {
      tray.append(el('p', 'pa-hint', `That’s ${MAX_NOTES} notes, the most for one piece. Send it when you’re ready.`));
      return;
    }
    tray.append(el('p', 'pa-quote', quoteText(text.slice(selected.start, selected.end))));
    const codes = el('div', 'pa-codes');
    codes.setAttribute('role', 'group');
    codes.setAttribute('aria-label', 'Feedback buttons');
    for (const code of opts.codes) {
      const b = button(code.label, 'ghost', () => {
        chosen = chosen?.id === code.id ? null : code;
        answer = '';
        paintTray();
        tray.querySelector<HTMLInputElement>(chosen?.ask ? '.pa-ask' : '.pa-code[aria-pressed="true"]')?.focus();
      });
      b.className = 'pa-code';
      b.dataset.colour = code.colour;
      b.setAttribute('aria-pressed', String(chosen?.id === code.id));
      b.prepend(colourDot(codeInk(code.colour)));
      codes.append(b);
    }
    tray.append(codes);

    const add = button('Add note', 'primary', () => {
      if (!selected) return;
      const draft: Draft = { start: selected.start, end: selected.end };
      if (chosen) draft.code_id = chosen.id;
      if (chosen?.ask) draft.answer = answer.trim();
      if (comment.trim()) draft.comment = comment.trim();
      notes = [...notes, draft].sort((x, y) => x.start - y.start);
      save();
      select(null);
    });
    const ready = () => {
      add.disabled = chosen ? !!chosen.ask && !answer.trim() : !comment.trim();
    };

    if (chosen?.ask) {
      const ask = input(chosen.ask, MAX_ANSWER, 'pa-ask');
      ask.input.value = answer;
      ask.input.addEventListener('input', () => {
        answer = ask.input.value;
        ready();
      });
      ask.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !add.disabled) add.click();
      });
      tray.append(ask.wrap);
    }
    const note = input(chosen ? 'Anything to add? (optional)' : 'Or write a comment', MAX_COMMENT, 'pa-comment');
    note.input.value = comment;
    note.input.addEventListener('input', () => {
      comment = note.input.value;
      ready();
    });
    tray.append(note.wrap);
    const row = el('div', 'pf-actions');
    row.append(button('Cancel', 'ghost', () => select(null)), add);
    tray.append(row);
    ready();
  }

  function paintList(): void {
    list.replaceChildren();
    list.hidden = notes.length === 0;
    notes.forEach((n, i) => {
      const code = n.code_id ? byId.get(n.code_id) : undefined;
      const item = el('li', 'pa-note');
      const main = el('div', 'pa-note__main');
      const title = el('p', 'pa-note__title');
      title.append(colourDot(code ? codeInk(code.colour) : 'var(--muted)'), noteTitle({ ...n, quote: '', code_label: code?.label }));
      main.append(title, el('p', 'pa-note__quote', quoteText(text.slice(n.start, n.end))));
      if (n.comment) main.append(el('p', 'pa-note__comment', n.comment));
      const remove = button('Remove', 'ghost', () => {
        notes = notes.filter((_, j) => j !== i);
        save();
        paint();
      });
      remove.setAttribute('aria-label', `Remove note ${i + 1}`);
      item.append(main, remove);
      list.append(item);
    });
  }

  function paintSend(): void {
    const last = piece === opts.pieces.length - 1;
    const send = button(last ? 'Send feedback' : `Send, then piece ${piece + 2}`, 'primary', async function () {
      if (!notes.length) return;
      if (await opts.onSend(piece, notes, this)) writeJSON(opts.draftKey(piece), null);
    });
    send.disabled = notes.length === 0;
    sendRow.replaceChildren(el('p', 'pa-hint pa-send-hint', notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}. You can’t change them after sending.` : 'Add at least one note.'), send);
  }

  paint();
  return root;
}

let inputSeq = 0;
function input(label: string, max: number, className: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const id = `pa-input-${++inputSeq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const box = el('input', `pa-input ${className}`);
  box.id = id;
  box.type = 'text';
  box.maxLength = max;
  box.autocomplete = 'off';
  wrap.append(lab, box);
  return { wrap, input: box };
}

/* ── Getting it back ──────────────────────────────────────────────── */

export type ReceivedLayer = { notes: Note[] };

export function receivedView(text: string, layers: ReceivedLayer[], codes: Code[]): HTMLElement {
  const root = el('div', 'pa-get');
  const byId = new Map(codes.map((c) => [c.id, c]));
  const on = layers.map(() => true);
  let open: number | null = null;

  const toggles = el('div', 'pa-layers');
  toggles.setAttribute('role', 'group');
  toggles.setAttribute('aria-label', 'Show feedback from');
  const summary = el('p', 'pa-summary');
  const paperHost = el('div', 'pa-paper-host pa-paper-host--read');
  const cards = el('div', 'pa-cards');
  cards.setAttribute('aria-live', 'polite');
  const hint = el('p', 'pa-hint', 'Tap a highlighted part to read the note.');
  root.append(toggles, summary, paperHost, hint, cards);

  const live = () => layers.flatMap((layer, i) => (on[i] ? layer.notes.map((note) => ({ note, layer: i })) : []));

  function paint(): void {
    toggles.replaceChildren(
      ...layers.map((_, i) => {
        const b = button(`Reviewer ${i + 1}`, 'ghost', () => {
          on[i] = !on[i];
          open = null;
          paint();
        });
        b.className = 'pa-layer';
        b.setAttribute('aria-pressed', String(on[i]));
        b.prepend(colourDot(LAYER_COLOURS[i] ?? 'var(--orca)'));
        return b;
      })
    );
    const counts = new Map<string, number>();
    for (const { note } of live()) counts.set(note.code_label ?? 'Comment', (counts.get(note.code_label ?? 'Comment') ?? 0) + 1);
    summary.textContent = layers.length === 0 ? '' : [...counts].map(([label, n]) => `${n} × ${label}`).join(' · ') || 'Both layers are hidden.';
    const marks = live().map(({ note, layer }) => ({ start: note.start, end: note.end, layer, colour: LAYER_COLOURS[layer] ?? 'var(--orca)' }));
    paperHost.replaceChildren(paper(text, marks, null));
    paperHost.querySelectorAll<HTMLElement>('.pa-run--mark').forEach((run) => {
      run.tabIndex = 0;
      run.setAttribute('role', 'button');
      run.setAttribute('aria-label', `Read the note on “${run.textContent ?? ''}”`);
      if (open !== null && Number(run.dataset.start) <= open && Number(run.dataset.end) > open) run.classList.add('pa-run--open');
    });
    paintCards();
  }

  function paintCards(): void {
    cards.replaceChildren();
    hint.hidden = open !== null || live().length === 0;
    if (open === null) return;
    const here = live().filter(({ note }) => note.start <= open! && note.end > open!);
    for (const { note, layer } of here) cards.append(noteCard(note, layer, byId.get(note.code_id ?? '')));
  }

  const choose = (run: HTMLElement | null) => {
    if (!run) return;
    open = Number(run.dataset.start);
    paint();
    cards.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };
  paperHost.addEventListener('click', (e) => choose((e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark')));
  paperHost.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    choose((e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark'));
  });

  paint();
  return root;
}

function noteCard(note: Note, layer: number, code: Code | undefined): HTMLElement {
  const card = el('article', 'pa-card');
  card.style.setProperty('--pa-mark', LAYER_COLOURS[layer] ?? 'var(--orca)');
  const head = el('p', 'pa-card__head');
  head.append(colourDot(LAYER_COLOURS[layer] ?? 'var(--orca)'), `Reviewer ${layer + 1}`);
  card.append(head, el('p', 'pa-card__title', noteTitle(note)), el('p', 'pa-card__quote', quoteText(note.quote)));
  if (note.comment) card.append(el('p', 'pa-card__comment', note.comment));
  const resource = code?.resource ? resourceView(code.resource, note) : null;
  if (resource) card.append(resource);
  return card;
}

/** YouTube takes ?t=, most other players a #t= fragment. */
export function videoAt(url: string, start?: number): string {
  if (!start) return url;
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) {
      u.searchParams.set('t', String(start));
      return u.href;
    }
    u.hash = `t=${start}`;
    return u.href;
  } catch {
    return url;
  }
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Matches "metaphor", "a metaphor", "Metaphors" or a technique id against the table. */
export function matchTechnique(techniques: LiteraryTechnique[], answer: string): LiteraryTechnique | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/^(an?|the)\s+/, '').replace(/[^a-z]/g, '');
  const want = norm(answer);
  if (!want) return undefined;
  return (
    techniques.find((t) => norm(t.name) === want || norm(t.id) === want) ??
    techniques.find((t) => norm(t.name) === want.replace(/s$/, '') || `${norm(t.name)}s` === want)
  );
}

function resourceView(resource: Resource, note: Note): HTMLElement | null {
  if (resource.kind === 'technique') {
    if (!note.answer) return null;
    const host = el('div', 'pa-technique');
    void loadLiteraryElements().then((table) => {
      const technique = matchTechnique(table.techniques, note.answer!);
      if (technique) host.append(renderElementCard(technique, table, { compact: true }));
      else host.remove();
    });
    return host;
  }
  const link = el('a', 'pa-res');
  link.href = resource.kind === 'video' ? videoAt(resource.url, resource.start) : resource.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  let host = '';
  try {
    host = new URL(resource.url).hostname.replace(/^www\./, '');
  } catch {
    /* cleaned on the server; shown as given */
  }
  const words = el('span', 'pa-res__words');
  words.append(el('span', 'pa-res__title', resource.title || host || 'Open'));
  const meta = [resource.kind === 'video' ? 'Video' : 'Link', resource.kind === 'video' && resource.start ? `from ${clock(resource.start)}` : '', 'from your teacher']
    .filter(Boolean)
    .join(' · ');
  words.append(el('span', 'pa-res__meta', meta));
  link.append(el('span', 'pa-res__icon', resource.kind === 'video' ? '▶' : '↗'), words);
  return link;
}

/* ── Teacher: every layer, by symbol ──────────────────────────────── */

export type TeacherAnnotateOptions = {
  text: string;
  layers: TeacherLayer[];
  codes: Code[];
  /** Only this reviewer's layer, when the teacher is focused on one student. */
  only?: string | null;
  who: (symbol: string) => HTMLElement;
  onRelease: (reviewer: string, note: number, pressed: HTMLButtonElement) => void;
  onRemove: (reviewer: string, note: number, pressed: HTMLButtonElement) => void;
};

export function teacherLayers(opts: TeacherAnnotateOptions): HTMLElement {
  const wrap = el('div', 'pa-teacher');
  const byId = new Map(opts.codes.map((c) => [c.id, c]));
  const shown = opts.layers.map((layer, i) => ({ layer, i })).filter(({ layer }) => !opts.only || layer.reviewer === opts.only);
  const marks = shown.flatMap(({ layer, i }) =>
    layer.notes
      .filter((n) => n.status !== 'removed')
      .map((n) => ({ start: n.start, end: n.end, layer: i, colour: LAYER_COLOURS[i] ?? 'var(--orca)' }))
  );
  wrap.append(paper(opts.text, marks, null));

  for (const { layer, i } of shown) {
    const section = el('section', 'pa-tlayer');
    section.style.setProperty('--pa-mark', LAYER_COLOURS[i] ?? 'var(--orca)');
    const head = el('p', 'pa-tlayer__head');
    head.append(colourDot(LAYER_COLOURS[i] ?? 'var(--orca)'), `Reviewer ${i + 1}: `, opts.who(layer.reviewer));
    head.append(el('span', `pf-chip ${layer.sent ? 'pf-chip--done' : ''}`, layer.sent ? `${layer.notes.length} note${layer.notes.length === 1 ? '' : 's'}` : 'Still annotating'));
    section.append(head);
    const list = el('ul', 'pa-notes');
    for (const n of layer.notes) {
      const code = n.code_id ? byId.get(n.code_id) : undefined;
      const item = el('li', 'pa-note');
      item.dataset.status = n.status;
      const main = el('div', 'pa-note__main');
      const title = el('p', 'pa-note__title');
      title.append(colourDot(code ? codeInk(code.colour) : 'var(--muted)'), noteTitle(n));
      if (n.status === 'held') title.append(el('span', 'pf-chip pf-chip--flag', 'Held: flagged words'));
      if (n.status === 'released') title.append(el('span', 'pf-chip', 'Released'));
      if (n.status === 'removed') title.append(el('span', 'pf-chip', 'Removed'));
      main.append(title, el('p', 'pa-note__quote', quoteText(n.quote)));
      if (n.comment) main.append(el('p', 'pa-note__comment', n.comment));
      const actions = el('div', 'pa-note__actions');
      if (n.status === 'held') {
        actions.append(button('Release', 'secondary', function () {
          opts.onRelease(layer.reviewer, n.i, this);
        }));
      }
      if (n.status !== 'removed') {
        actions.append(button('Remove', 'ghost', function () {
          opts.onRemove(layer.reviewer, n.i, this);
        }));
      }
      item.append(main, actions);
      list.append(item);
    }
    if (layer.notes.length) section.append(list);
    wrap.append(section);
  }
  return wrap;
}

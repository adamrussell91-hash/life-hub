/**
 * The full transcript, for checking exact words: voices with "Who is this?" pickers,
 * Find, and "Change who" on a single line. A side drawer on desktop, full screen on a
 * phone. Opening it pushes one history entry so Back closes it (R7); Escape closes it
 * unless you're typing in Find (I8).
 */
import type { MeetingTranscript, MeetingWriteup, TranscriptLine, Who } from '@/api/meeting-recordings';
import { formatClock } from '@/lib/meeting-recorder';
import { avatar, button, el, personFor, type RecPerson } from '@/views/meeting-recording-strip';

export type DrawerOptions = {
  transcript: MeetingTranscript;
  people: RecPerson[];
  /** Index into `transcript.lines` to open at. */
  atLine?: number | null;
  /** Saves a voice or line name; resolves with what the server now holds. */
  onSpeakers: (change: { voices?: Record<string, Who>; lines?: Record<string, Who> }) => Promise<{ transcript: MeetingTranscript; writeup: MeetingWriteup | null }>;
  onClose?: () => void;
};

export type DrawerHandle = { close(): void; openAt(line: number): void; update(transcript: MeetingTranscript): void };

let openDrawer: DrawerHandle | null = null;

/** Who a line is credited to: its own fix, else its voice. */
export function lineWho(transcript: MeetingTranscript, line: TranscriptLine): Who {
  if (line.who_override !== null && line.who_override !== undefined) return line.who_override;
  return transcript.voices.find((voice) => voice.key === line.speaker)?.who ?? null;
}

/** Lines containing every word of the query (case-insensitive), with their ids. */
export function findLines(transcript: MeetingTranscript, query: string): number[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return transcript.lines
    .map((line, index) => ({ index, text: line.text.toLowerCase() }))
    .filter((entry) => words.every((word) => entry.text.includes(word)))
    .map((entry) => entry.index);
}

/** Runs of consecutive lines from the same person; with a Find filter, matching lines run together only if adjacent. */
export function groupLines(transcript: MeetingTranscript, shown: Set<number> | null): Array<{ who: Who; lines: number[] }> {
  const groups: Array<{ who: Who; lines: number[]; speaker: string }> = [];
  let previous = -2;
  transcript.lines.forEach((line, index) => {
    if (shown && !shown.has(index)) return;
    const who = lineWho(transcript, line);
    const last = groups[groups.length - 1];
    const same = last && previous === index - 1 && (who ? last.who === who : !last.who && last.speaker === line.speaker);
    if (same) last.lines.push(index);
    else groups.push({ who, lines: [index], speaker: line.speaker });
    previous = index;
  });
  return groups.map(({ who, lines }) => ({ who, lines }));
}

function highlight(text: string, query: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    frag.append(text);
    return frag;
  }
  const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  for (const piece of text.split(pattern)) {
    if (!piece) continue;
    if (words.includes(piece.toLowerCase())) frag.append(el('mark', undefined, piece));
    else frag.append(piece);
  }
  return frag;
}

export function openTranscriptDrawer(options: DrawerOptions): DrawerHandle {
  openDrawer?.close();
  let transcript = options.transcript;
  let query = '';
  let hit: number | null = options.atLine ?? null;
  let fixOpen: number | null = null;
  let busy = false;
  let status = '';
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const scrim = el('div', 'rec-drawer-scrim');
  const drawer = el('aside', 'rec-drawer');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'Full transcript');
  drawer.dataset.part = 'transcript-drawer';

  const head = el('div', 'rec-drawer__head');
  const titleRow = el('div', 'rec-drawer__title-row');
  const close = button('Close', 'btn btn--secondary btn--sm', 'drawer-close');
  titleRow.append(el('h3', undefined, 'Full transcript'), close);
  const find = el('input', 'rec-drawer__find') as HTMLInputElement;
  find.type = 'search';
  find.placeholder = 'Find what was said…';
  find.setAttribute('aria-label', 'Find what was said');
  find.dataset.part = 'drawer-find';
  const statusLine = el('p', 'rec-drawer__status');
  statusLine.setAttribute('role', 'status');
  head.append(titleRow, el('p', 'muted', 'For checking exact words. Names fixed here flow back into the summary and profiles.'), find, statusLine);

  const body = el('div', 'rec-drawer__body');
  const voicesHost = el('div', 'rec-drawer__voices');
  const linesHost = el('div', 'rec-drawer__lines');
  body.append(sectionHead('Voices'), voicesHost, sectionHead('Lines'), linesHost);
  drawer.append(head, body);

  function sectionHead(text: string): HTMLElement {
    return el('p', 'rec-sect', text);
  }

  function voiceNumber(key: string): number {
    return transcript.voices.findIndex((voice) => voice.key === key) + 1;
  }

  function whoOptions(select: HTMLSelectElement, selected: Who): void {
    const blank = el('option', undefined, 'Who is this?');
    blank.value = '';
    select.append(blank);
    for (const person of options.people) {
      const option = el('option', undefined, person.who === 'me' ? 'Me' : person.name);
      option.value = person.who;
      option.selected = person.who === selected;
      select.append(option);
    }
  }

  function paintVoices(): void {
    voicesHost.replaceChildren();
    const total = transcript.voices.reduce((sum, voice) => sum + Math.max(0, voice.talk_ms), 0) || 1;
    for (const voice of transcript.voices) {
      const person = personFor(options.people, voice.who);
      const row = el('div', `rec-voice${person ? '' : ' is-unnamed'}`);
      row.dataset.voice = voice.key;
      const info = el('div', 'rec-voice__info');
      const name = el('div', 'rec-voice__name', person ? person.name : `Unnamed voice ${voiceNumber(voice.key)}`);
      const source = voice.source === 'taps' ? 'from your taps' : voice.source === 'picked' ? 'you picked' : voice.source === 'check' ? 'from the check' : '';
      if (source && person) name.append(el('small', undefined, ` ${source}`));
      const select = el('select', 'rec-select rec-voice__pick') as HTMLSelectElement;
      select.setAttribute('aria-label', `Who is ${person ? person.name : `unnamed voice ${voiceNumber(voice.key)}`}?`);
      whoOptions(select, voice.who);
      select.disabled = busy;
      select.addEventListener('change', () => void save({ voices: { [voice.key]: select.value || null } }));
      info.append(name, select);
      row.append(avatar(person), info, el('span', 'rec-voice__share', `${Math.round((Math.max(0, voice.talk_ms) / total) * 100)}%`));
      voicesHost.append(row);
    }
  }

  /** One paragraph per run of lines from the same person (display only; each line keeps its own id). */
  function paintLines(): void {
    linesHost.replaceChildren();
    const shown = query.trim() ? new Set(findLines(transcript, query)) : null;
    if (shown && !shown.size) {
      linesHost.append(el('p', 'muted rec-drawer__empty', `No lines contain “${query.trim()}”.`));
      return;
    }
    const groups = groupLines(transcript, shown);
    for (const group of groups) {
      const person = personFor(options.people, group.who);
      const first = transcript.lines[group.lines[0]!]!;
      const row = el('div', `rec-line${group.lines.includes(hit ?? -1) ? ' is-hit' : ''}`);
      const main = el('div', 'rec-line__main');
      const name = el('div', 'rec-line__who', person ? person.name : `Unnamed voice ${voiceNumber(first.speaker)}`);
      name.style.setProperty('--c', person?.colour ?? '#7b8494');
      const text = el('div', 'rec-line__text');
      main.append(name, text);
      for (const index of group.lines) {
        const line = transcript.lines[index]!;
        const who = lineWho(transcript, line);
        const seg = el('span', `rec-line__seg${hit === index ? ' is-hit' : ''}`);
        seg.id = `rec-line-${index}`;
        seg.dataset.line = String(index);
        seg.append(highlight(line.text, query));
        if (line.moved) seg.append(' ', el('span', 'rec-tag is-plum', 'moved'));
        if (line.unsure) seg.append(' ', el('span', 'rec-tag is-amber', 'check'));
        if (line.who_override !== null && line.who_override !== undefined) seg.append(' ', el('span', 'rec-tag is-ok', 'you fixed'));
        const fix = button('Change who', 'rec-link rec-line__fix', 'line-fix');
        fix.setAttribute('aria-expanded', String(fixOpen === index));
        fix.setAttribute('aria-label', `Change who said: ${line.text.slice(0, 60)}`);
        fix.addEventListener('click', () => {
          fixOpen = fixOpen === index ? null : index;
          paintLines();
        });
        seg.append(' ', fix, ' ');
        text.append(seg);
        if (fixOpen === index) {
          const menu = el('div', 'rec-fixmenu');
          for (const option of options.people) {
            const pick = button(option.short, `rec-fixmenu__btn${option.who === who ? ' is-on' : ''}`, 'line-fix-to');
            pick.dataset.who = option.who;
            pick.disabled = busy;
            pick.addEventListener('click', () => {
              fixOpen = null;
              void save({ lines: { [String(index)]: option.who } });
            });
            menu.append(pick);
          }
          text.append(menu);
        }
      }
      row.append(el('span', 'rec-line__time', formatClock(first.start_ms)), main);
      linesHost.append(row);
    }
  }

  async function save(change: { voices?: Record<string, Who>; lines?: Record<string, Who> }): Promise<void> {
    busy = true;
    status = 'Saving…';
    paint();
    try {
      const out = await options.onSpeakers(change);
      transcript = out.transcript;
      status = 'Saved. The summary and profiles use the new names.';
    } catch (err) {
      status = err instanceof Error ? `Not saved: ${err.message}` : 'Not saved. Try again.';
    } finally {
      busy = false;
      paint();
    }
  }

  function paint(): void {
    statusLine.textContent = status;
    statusLine.hidden = !status;
    paintVoices();
    paintLines();
  }

  function scrollToHit(): void {
    if (hit === null) return;
    const row = linesHost.querySelector<HTMLElement>(`#rec-line-${hit}`)?.closest<HTMLElement>('.rec-line') ?? null;
    row?.scrollIntoView?.({ block: 'center' });
  }

  find.addEventListener('input', () => {
    query = find.value;
    hit = null;
    paintLines();
  });

  let closed = false;
  let pushed = false;
  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
      if (target === find && find.value) {
        find.value = '';
        query = '';
        paintLines();
      } else target.blur();
      return;
    }
    handle.close();
  }
  function onPop(): void {
    pushed = false;
    handle.close();
  }

  const handle: DrawerHandle = {
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      document.documentElement.classList.remove('rec-drawer-open');
      scrim.remove();
      drawer.remove();
      if (openDrawer === handle) openDrawer = null;
      // Programmatic close pops its own history entry.
      if (pushed) {
        pushed = false;
        history.back();
      }
      returnFocus?.focus?.();
      options.onClose?.();
    },
    openAt(line: number) {
      hit = line;
      query = '';
      find.value = '';
      paintLines();
      scrollToHit();
    },
    update(next: MeetingTranscript) {
      transcript = next;
      paint();
    }
  };

  close.addEventListener('click', () => handle.close());
  scrim.addEventListener('click', () => handle.close());
  document.addEventListener('keydown', onKey);
  try {
    history.pushState({ ...(history.state ?? {}), recDrawer: true }, '');
    pushed = true;
    window.addEventListener('popstate', onPop);
  } catch {
    pushed = false;
  }
  document.documentElement.classList.add('rec-drawer-open');
  document.body.append(scrim, drawer);
  paint();
  openDrawer = handle;
  requestAnimationFrame(() => {
    drawer.classList.add('is-open');
    scrollToHit();
    close.focus();
  });
  return handle;
}

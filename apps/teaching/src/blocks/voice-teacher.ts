import type { Block } from '@/schemas/block';
import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { button, el, errorText, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { paper, type Mark } from '@/blocks/peer-annotate';
import {
  GROUP_LABELS,
  codeForKey,
  codeText,
  descriptorFor,
  loadFeedbackCodes,
  resolveTyped,
  type FeedbackCode,
  type FeedbackCodeGroup
} from '@/blocks/feedback-codes';
import {
  DEFAULT_REACTION_S,
  buildPaper,
  fillerSuggestions,
  findQuoteWords,
  pointIndexAt,
  tapTarget,
  transcriptWords,
  wordAt,
  type Paper
} from '@/blocks/voice-marking';
import { audioUrl, type VoiceTag, type WhisperTranscript } from '@/blocks/voice-client';
import { clock } from '@/blocks/voice-pacing';
import { summaryList, tagChip, tagColour } from '@/blocks/voice-feedback-view';
import type { VoiceWord } from '@/blocks/voice-transcript';
import { mountVoiceDeep, type VoiceAiRead } from '@/blocks/voice-deep';

/**
 * The teacher side of a Voice block: the submissions inbox and the one-tap
 * marking screen. While the recording plays, a number key drops a speaking
 * code on the word being spoken; typed letters (AR, TS …) drop a composition
 * code; Shift makes either a strength. Letters are kept for codes, so every
 * other control uses Space, Enter, Backspace, arrows and Escape.
 */

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;
type Status = 'new' | 'marked' | 'returned';
type Row = {
  id: string;
  initials: string;
  class_id?: string | null;
  student_id?: string | null;
  device_hash: string;
  submitted_at: string;
  duration_s: number;
  status: Status;
  transcript_status: 'pending' | 'done' | 'error';
  audio_deleted: boolean;
  audio_delete_after: string;
  tag_count: number;
};
type MarkTag = VoiceTag & { source: 'tap' | 'suggested'; confirmed: boolean };
type Submission = Omit<Row, 'tag_count'> & {
  /** The classes this lesson belongs to, with their lists. */
  classes?: Array<{ id: string; title: string; students: Array<{ id: string; initials: string; name: string }> }>;
  prompt: string;
  points: Array<{ label: string; t: number }>;
  transcript: WhisperTranscript | null;
  transcript_error?: string;
  tags: MarkTag[];
  comment: string;
  audio_url: string | null;
  fillers_suggested?: boolean;
  returned_at?: string;
};

const STATUS_LABEL: Record<Status, string> = { new: 'New', marked: 'Marked', returned: 'Returned' };
const FILTERS: Array<{ value: Status | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'marked', label: 'Marked' },
  { value: 'returned', label: 'Returned' }
];
const SPEEDS = [1, 1.25, 1.5, 2];
const REACTIONS = [0, 0.5, 1, 1.5, 2];
const REACTION_KEY = 'voice:reaction';
const SAVE_DELAY_MS = 1200;
const POLL_MS = 8000;
const MAX_POLLS = 40;

const base = (lessonId: string, blockId: string) => `/api/voice/${encodeURIComponent(lessonId)}/${encodeURIComponent(blockId)}`;

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400_000));
}

function shortWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

let tagSeq = 0;
const newTagId = () => `t_${Date.now().toString(36)}${(++tagSeq).toString(36)}`;

/** Focus is somewhere typing belongs, so marking keys stay out of the way. */
function typingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  return Boolean(node?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

/** One take on its own, for the To mark flow: no inbox, and its Return lives on the flow's bar. */
export type VoiceTake = { el: HTMLElement; finish: () => Promise<void>; close: () => void };

export function mountVoiceTake(block: VoiceBlock, lessonId: string, takeId: string, onGone: () => void): VoiceTake {
  let finish: () => Promise<void> = async () => undefined;
  const take = { id: takeId, onGone, ready: (fn: () => Promise<void>) => { finish = fn; }, close: () => undefined as void };
  const root = mountVoiceTeacher(block, lessonId, take);
  return { el: root, finish: () => finish(), close: () => take.close() };
}

export function mountVoiceTeacher(
  block: VoiceBlock,
  lessonId: string,
  take?: { id: string; onGone: () => void; ready: (finish: () => Promise<void>) => void; close: () => void }
): HTMLElement {
  const root = el('div', 'voice-teacher');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const body = el('div', 'voice-teacher__body');
  root.append(body, alert);

  let rows: Row[] = [];
  let filter: Status | 'all' = 'all';
  let polls = 0;
  let pollTimer = 0;
  let closeMarking: (() => void) | null = null;

  const showError = (error: unknown) => {
    alert.textContent = errorText(error);
    alert.hidden = false;
  };

  /* ── Inbox ───────────────────────────────────────────────────────── */

  async function loadInbox(): Promise<void> {
    window.clearTimeout(pollTimer);
    try {
      const data = await apiGet<{ submissions: Row[] }>(base(lessonId, block.id));
      rows = data.submissions;
      alert.hidden = true;
    } catch (error) {
      showError(error);
    }
    if (!closeMarking) paintInbox();
    if (rows.some((r) => r.transcript_status === 'pending') && polls < MAX_POLLS) {
      polls += 1;
      pollTimer = window.setTimeout(() => void loadInbox(), POLL_MS);
    }
  }

  function paintInbox(): void {
    const view = el('section', 'voice-inbox');
    const head = el('div', 'voice-inbox__head');
    const counts = { new: 0, marked: 0, returned: 0 };
    rows.forEach((r) => (counts[r.status] += 1));
    head.append(
      el('p', 'voice-inbox__title', rows.length ? `${rows.length} submission${rows.length === 1 ? '' : 's'}` : 'No submissions yet'),
      el('span', 'block-secondary', rows.length ? `${counts.new} new · ${counts.marked} marked · ${counts.returned} returned` : 'Students record on the published lesson.')
    );
    const tools = el('div', 'pf-actions');
    const nextUnmarked = rows.find((r) => r.status === 'new' && r.transcript_status === 'done');
    const next = button('Next unmarked', 'primary', () => nextUnmarked && void openMarking(nextUnmarked.id));
    next.disabled = !nextUnmarked;
    tools.append(next, button('Refresh', 'ghost', () => void loadInbox()));
    head.append(tools);
    view.append(head);

    if (rows.length) {
      const group = el('div', 'pa-mode');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Show');
      for (const f of FILTERS) {
        const b = button(f.label, 'ghost', () => {
          filter = f.value;
          paintInbox();
        });
        b.className = 'pa-mode__option';
        b.setAttribute('aria-pressed', String(filter === f.value));
        group.append(b);
      }
      view.append(group);
    }

    const list = el('ul', 'voice-inbox__rows');
    for (const r of rows.filter((x) => filter === 'all' || x.status === filter)) {
      const item = el('li', 'voice-inbox__row');
      const open = button('', 'ghost', () => void openMarking(r.id));
      open.className = 'voice-inbox__open';
      const who = el('span', 'voice-inbox__who', r.initials);
      const meta = el('span', 'voice-inbox__meta block-secondary', `${clock(r.duration_s)} · ${shortWhen(r.submitted_at)} · #${r.device_hash}`);
      const status = el('span', `voice-pill voice-pill--${r.status}`, STATUS_LABEL[r.status]);
      const extra = el('span', 'voice-inbox__extra block-secondary');
      if (r.transcript_status === 'pending') extra.textContent = 'Transcribing…';
      else if (r.transcript_status === 'error') extra.textContent = 'Transcript failed';
      else if (r.tag_count) extra.textContent = `${r.tag_count} tag${r.tag_count === 1 ? '' : 's'}`;
      const audio = el('span', 'voice-pill voice-pill--quiet', r.audio_deleted ? 'Audio removed' : `Audio deletes in ${daysLeft(r.audio_delete_after)} d`);
      open.append(who, meta, extra, status, audio);
      item.append(open);
      list.append(item);
    }
    view.append(list);
    body.replaceChildren(view);
  }

  /* ── Marking ─────────────────────────────────────────────────────── */

  async function openMarking(id: string): Promise<void> {
    window.clearTimeout(pollTimer);
    body.replaceChildren(el('p', 'block-secondary', 'Opening…'));
    try {
      const [record, codes] = await Promise.all([apiGet<Submission>(`${base(lessonId, block.id)}/${encodeURIComponent(id)}`), loadFeedbackCodes()]);
      closeMarking = markingScreen(record, codes);
      if (take) take.close = () => backToInbox();
    } catch (error) {
      showError(error);
      if (!take) paintInbox();
    }
  }

  function backToInbox(): void {
    closeMarking?.();
    closeMarking = null;
    polls = 0;
    if (take) return;
    void loadInbox();
  }

  function markingScreen(record: Submission, library: FeedbackCode[]): () => void {
    const groups: FeedbackCodeGroup[] = block.content.code_groups ?? ['composition', 'viva', 'speaking'];
    const codes = library.filter((c) => !c.hidden && groups.includes(c.group));
    const byId = new Map(library.map((c) => [c.id, c]));
    const { words, timing } = transcriptWords(record.transcript, record.duration_s);
    const sheet: Paper = buildPaper(words, record.points);
    let tags: MarkTag[] = [...record.tags].sort((a, b) => a.t - b.t);
    let comment = record.comment ?? '';
    let selected: string | null = null;
    let typed = '';
    let typedPositive = false;
    let reviewing = -1;
    let reaction = readJSON<number>(REACTION_KEY) ?? DEFAULT_REACTION_S;
    let saveTimer = 0;
    let saving: Promise<void> = Promise.resolve();
    let status = record.status;
    const aiRead = (record as Submission & { ai_read?: VoiceAiRead }).ai_read ?? null;
    const deepPanel = mountVoiceDeep(block, lessonId, record.class_id && record.student_id ? { classId: record.class_id, studentId: record.student_id } : null, { ai: aiRead });

    const screen = el('section', 'voice-mark');
    const top = el('div', 'voice-mark__top');
    if (!take) top.append(button('← Submissions', 'ghost', () => void flush().then(backToInbox)));
    top.append(
      el('p', 'voice-mark__who', `${record.initials} · ${clock(record.duration_s)} · ${shortWhen(record.submitted_at)}`)
    );
    const saveState = el('span', 'voice-mark__save block-secondary');
    saveState.setAttribute('role', 'status');
    top.append(saveState);
    screen.append(top);

    // Whose take this is. A device that claimed its initials in the class page is matched already.
    const people = (record.classes ?? []).flatMap((c) => c.students.map((st) => ({ classId: c.id, classTitle: c.title, ...st })));
    if (people.length) {
      const matched = people.find((p) => p.classId === record.class_id && p.id === record.student_id) ?? null;
      const guess = matched ?? (people.filter((p) => p.initials === record.initials).length === 1 ? people.find((p) => p.initials === record.initials)! : null);
      const picker = el('select', 'pa-input voice-mark__student');
      picker.id = `voice-student-${record.id}`;
      picker.append(Object.assign(el('option'), { value: '', textContent: 'Pick a student' }));
      for (const p of people) picker.append(Object.assign(el('option'), { value: `${p.classId}|${p.id}`, textContent: `${p.name} (${p.classTitle})` }));
      if (guess) picker.value = `${guess.classId}|${guess.id}`;
      picker.addEventListener('change', () => {
        const [class_id, student_id] = picker.value.split('|');
        if (class_id && student_id) void flush({ class_id, student_id });
        deepPanel?.setWho(class_id && student_id ? { classId: class_id, studentId: student_id } : null);
      });
      const label = el('label', 'pf-field__label', 'This is');
      label.htmlFor = picker.id;
      const where = el('div', 'pf-field voice-mark__who-field');
      where.append(label, picker);
      if (matched && record.student_id) where.append(el('p', 'block-secondary', 'Matched from the student’s class claim.'));
      screen.append(where);
      // A confident guess is saved with the first change, so a returned take reaches the right student.
      if (!matched && guess) {
        void flush({ class_id: guess.classId, student_id: guess.id });
        deepPanel?.setWho({ classId: guess.classId, studentId: guess.id });
      }
    }

    // Player
    const audio = el('audio');
    audio.preload = 'auto';
    if (record.audio_url) audio.src = audioUrl(record.audio_url);
    const player = el('div', 'voice-player');
    const play = button('Play', 'primary', () => toggle());
    play.classList.add('voice-player__play');
    const back = button('−5 s', 'ghost', () => seek(audio.currentTime - 5));
    const fwd = button('+5 s', 'ghost', () => seek(audio.currentTime + 5));
    const time = el('span', 'voice-player__time');
    const scrub = el('input', 'voice-player__scrub');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.step = '0.1';
    scrub.max = String(record.duration_s);
    scrub.setAttribute('aria-label', 'Position in the recording');
    scrub.addEventListener('input', () => seek(Number(scrub.value)));
    const speeds = el('div', 'pa-mode voice-player__speeds');
    speeds.setAttribute('role', 'group');
    speeds.setAttribute('aria-label', 'Speed');
    const paintSpeeds = () =>
      speeds.replaceChildren(
        ...SPEEDS.map((s) => {
          const b = button(`${s}×`, 'ghost', () => {
            audio.playbackRate = s;
            paintSpeeds();
          });
          b.className = 'pa-mode__option';
          b.setAttribute('aria-pressed', String(audio.playbackRate === s));
          return b;
        })
      );
    paintSpeeds();
    player.append(play, back, fwd, time, scrub, speeds);
    if (!record.audio_url) {
      player.replaceChildren(el('p', 'voice-feedback__gone block-secondary', 'Audio removed after 4 weeks. The transcript and your tags are kept.'));
    }
    audio.hidden = true;

    // Code strip
    const strip = el('div', 'voice-strip');
    strip.setAttribute('aria-label', 'Feedback codes');
    const typing = el('span', 'voice-strip__typing');
    typing.setAttribute('aria-live', 'polite');
    const groupOrder: FeedbackCodeGroup[] = ['speaking', 'composition', 'viva'];
    for (const g of groupOrder) {
      const inGroup = codes.filter((c) => c.group === g);
      if (!inGroup.length) continue;
      const row = el('div', 'voice-strip__group');
      row.append(el('span', 'voice-strip__label', GROUP_LABELS[g]));
      for (const code of inGroup) {
        const b = button('', 'ghost', () => undefined);
        b.className = 'voice-strip__code';
        b.title = `${code.descriptor || code.label} Shift-click for a strength.`;
        b.addEventListener('click', (e) => {
          addTag(code, e.shiftKey);
          b.blur();
        });
        b.style.setProperty('--fc-ink', `var(--pastel-${code.colour}-ink)`);
        if (code.key) b.append(el('kbd', 'voice-strip__key', code.key));
        b.append(el('span', 'voice-strip__letters', code.code));
        if (code.label) b.append(el('span', 'voice-strip__name', code.label));
        row.append(b);
      }
      strip.append(row);
    }
    const reactionRow = el('div', 'voice-strip__group voice-strip__reaction');
    reactionRow.append(el('span', 'voice-strip__label', 'Tag lands'));
    const paintReaction = () =>
      reactionRow.replaceChildren(
        el('span', 'voice-strip__label', 'Tag lands'),
        ...REACTIONS.map((r) => {
          const b = button(r ? `${r} s early` : 'on the press', 'ghost', () => {
            reaction = r;
            writeJSON(REACTION_KEY, r);
            paintReaction();
          });
          b.className = 'pa-mode__option';
          b.setAttribute('aria-pressed', String(reaction === r));
          return b;
        })
      );
    paintReaction();
    strip.append(typing);
    // Player and codes stick together, so the codes stay in reach while the transcript scrolls.
    const dock = el('div', 'voice-mark__dock');
    dock.append(player, strip);
    if (deepPanel) dock.append(deepPanel.el);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => screen.style.setProperty('--voice-dock-h', `${dock.offsetHeight}px`)).observe(dock);
    }
    const keysHelp = el(
      'p',
      'voice-strip__help block-secondary',
      'Number keys tag speaking · type letters + Space for other codes · Shift = strength · Space plays/pauses · ←/→ 5 s · Enter adds a note · Backspace undoes · Esc clears'
    );
    screen.append(audio, dock, reactionRow, keysHelp);

    // Transcript + notes
    const work = el('div', 'voice-mark__work');
    const left = el('div', 'voice-mark__transcript');
    const paperHost = el('div', 'pa-paper-host pa-paper-host--read voice-mark__paper');
    const review = el('div', 'voice-review');
    left.append(review, paperHost);
    const notes = el('div', 'voice-mark__notes');
    work.append(left, notes);
    screen.append(work);

    if (!words.length) {
      const why =
        record.transcript_status === 'pending'
          ? 'The transcript is on its way. You can listen now; tagging opens when it arrives.'
          : record.transcript_error || 'There is no transcript for this recording.';
      left.replaceChildren(el('p', 'block-secondary', why));
      if (record.transcript_status === 'error' && record.audio_url) {
        left.append(
          button('Try transcription again', 'secondary', async () => {
            await apiPost(`${base(lessonId, block.id)}/${encodeURIComponent(record.id)}/retranscribe`, {});
            backToInbox();
          })
        );
      }
    } else if (timing !== 'word') {
      left.prepend(el('p', 'block-secondary voice-mark__timing', 'Word timings are approximate for this recording, so tags land on the nearest phrase.'));
    }

    // Summary + comment + actions
    const summary = el('section', 'voice-mark__summary');
    const commentBox = el('textarea', 'pf-field__input voice-mark__comment');
    commentBox.rows = 3;
    commentBox.maxLength = 4000;
    commentBox.placeholder = 'Overall comment (optional)';
    commentBox.setAttribute('aria-label', 'Overall comment');
    commentBox.value = comment;
    commentBox.addEventListener('input', () => {
      comment = commentBox.value;
      queueSave();
    });
    const actions = el('div', 'pf-actions');
    const send = button(status === 'returned' ? 'Update the student’s feedback' : 'Return to student', 'primary', async function () {
      this.disabled = true;
      try {
        await flush();
        await apiPost(`${base(lessonId, block.id)}/${encodeURIComponent(record.id)}/return`, {});
        status = 'returned';
        saveState.textContent = 'Returned. The student can read it now.';
        this.textContent = 'Update the student’s feedback';
      } catch (error) {
        showError(error);
      } finally {
        this.disabled = false;
      }
    });
    const remove = button('Delete submission', 'ghost', async () => {
      const ok = await askConfirmCard({
        title: `Delete ${record.initials}’s submission?`,
        supporting: 'The audio, transcript and your tags go. The student can then send a new take.',
        confirmLabel: 'Delete'
      });
      if (!ok) return;
      try {
        await apiDelete(`${base(lessonId, block.id)}/${encodeURIComponent(record.id)}`);
        backToInbox();
        take?.onGone();
      } catch (error) {
        showError(error);
      }
    });
    if (take) {
      actions.append(remove);
      take.ready(async () => {
        await flush();
        await apiPost(`${base(lessonId, block.id)}/${encodeURIComponent(record.id)}/return`, {});
      });
    } else actions.append(send, remove);
    screen.append(summary, commentBox, actions);
    body.replaceChildren(screen);

    /* playback */
    function seek(t: number): void {
      audio.currentTime = Math.max(0, Math.min(record.duration_s, t));
      paintTime();
    }
    function toggle(): void {
      if (!record.audio_url) return;
      if (audio.paused) void audio.play();
      else audio.pause();
    }
    function paintTime(): void {
      time.textContent = `${clock(audio.currentTime)} / ${clock(record.duration_s)}`;
      if (document.activeElement !== scrub) scrub.value = String(audio.currentTime);
      const now = wordAt(words, audio.currentTime);
      paperHost.querySelectorAll('.voice-word--now').forEach((n) => n.classList.remove('voice-word--now'));
      if (!audio.paused && now >= 0) {
        const at = sheet.ranges[now]!.start;
        paperHost.querySelector<HTMLElement>(`.pa-run[data-start="${at}"]`)?.classList.add('voice-word--now');
      }
    }
    audio.addEventListener('timeupdate', paintTime);
    audio.addEventListener('play', () => (play.textContent = 'Pause'));
    audio.addEventListener('pause', () => (play.textContent = 'Play'));

    /* tags */
    const confirmed = () => tags.filter((t) => t.confirmed);
    const suggestions = () => tags.filter((t) => t.source === 'suggested' && !t.confirmed);

    function addTag(code: FeedbackCode, positive: boolean): void {
      if (!words.length) return;
      const target = tapTarget(words, audio.currentTime, reaction);
      const tag: MarkTag = {
        id: newTagId(),
        code_id: code.id,
        code: code.code,
        label: code.label,
        positive,
        t: Math.round(target.t * 10) / 10,
        w: [target.word, target.word],
        source: 'tap',
        confirmed: true
      };
      tags = [...tags, tag].sort((a, b) => a.t - b.t);
      selected = tag.id;
      flashTyping(`${codeText(code, positive)} at ${clock(tag.t)}`);
      paintAll();
      queueSave();
    }

    function removeTag(id: string, quiet = false): void {
      if (!id) return;
      tags = tags.filter((t) => t.id !== id);
      if (selected === id) selected = null;
      if (!quiet) {
        paintAll();
        queueSave();
      }
    }

    function patchTag(id: string, patch: Partial<MarkTag>): void {
      tags = tags.map((t) => (t.id === id ? { ...t, ...patch } : t));
      paintAll();
      queueSave();
    }

    function lastTapped(): MarkTag | undefined {
      return [...tags].filter((t) => t.source === 'tap').pop();
    }

    function flashTyping(text: string): void {
      typing.textContent = text;
      typing.dataset.state = 'flash';
    }

    function paintTyping(): void {
      if (!typed) return;
      const result = resolveTyped(typed, codes);
      typing.dataset.state = 'typing';
      typing.textContent =
        result.kind === 'partial' ? `${typed}${typedPositive ? '+' : ''} … ${result.matches.map((c) => c.code).join(' / ')} (Space to choose ${typed})` : `${typed}`;
    }

    function handleLetter(letter: string, shift: boolean): void {
      typed += letter;
      typedPositive ||= shift;
      const result = resolveTyped(typed, codes);
      if (result.kind === 'match') {
        addTag(result.code, typedPositive);
        typed = '';
        typedPositive = false;
      } else if (result.kind === 'none') {
        flashTyping(`No code “${typed}”`);
        typed = '';
        typedPositive = false;
      } else {
        paintTyping();
      }
    }

    function onKey(e: KeyboardEvent): void {
      if (!screen.isConnected) return;
      // A held key repeats; one press is one tag. Arrows may repeat to scrub.
      if (e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (typingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = (e.target as HTMLElement | null)?.closest?.('button');
      if (onButton && e.key === 'Enter') return;
      // Space would also press the focused button on key-up; let go of it first.
      if (onButton && e.key === ' ') (onButton as HTMLButtonElement).blur();
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code)?.[2];
      if (digit) {
        const code = codeForKey(digit, codes);
        if (code) {
          e.preventDefault();
          addTag(code, e.shiftKey);
        }
        return;
      }
      if (/^Key[A-Z]$/.test(e.code)) {
        e.preventDefault();
        handleLetter(e.code.slice(3), e.shiftKey);
        return;
      }
      if (reviewing >= 0 && (e.key === 'Enter' || e.key === 'Backspace')) {
        e.preventDefault();
        decideSuggestion(e.key === 'Enter');
        return;
      }
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (typed) {
            const result = resolveTyped(typed, codes, true);
            if (result.kind === 'match') addTag(result.code, typedPositive);
            else flashTyping(`No code “${typed}”`);
            typed = '';
            typedPositive = false;
          } else toggle();
          break;
        case 'Escape':
          typed = '';
          typedPositive = false;
          typing.textContent = '';
          break;
        case 'Backspace':
          e.preventDefault();
          if (typed) {
            typed = typed.slice(0, -1);
            if (typed) paintTyping();
            else typing.textContent = '';
          } else {
            const last = lastTapped();
            if (last) {
              removeTag(last.id);
              flashTyping(`Removed ${last.code}${last.positive ? '+' : ''}`);
            }
          }
          break;
        case 'Enter': {
          const target = tags.find((t) => t.id === selected) ?? lastTapped();
          if (target) {
            e.preventDefault();
            selected = target.id;
            paintAll();
            notes.querySelector<HTMLInputElement>(`[data-tag="${target.id}"] .voice-note__input`)?.focus();
          }
          break;
        }
        case 'ArrowLeft':
          e.preventDefault();
          seek(audio.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(audio.currentTime + 5);
          break;
      }
    }
    document.addEventListener('keydown', onKey);

    /* suggested fillers */
    function decideSuggestion(keep: boolean): void {
      const pending = suggestions();
      const current = pending[0];
      if (!current) {
        reviewing = -1;
        paintAll();
        return;
      }
      if (keep) patchTag(current.id, { confirmed: true });
      else removeTag(current.id);
      const next = suggestions()[0];
      if (next) {
        selected = next.id;
        seek(Math.max(0, next.t - 1.5));
      } else reviewing = -1;
      paintAll();
    }

    function paintReview(): void {
      const pending = suggestions();
      if (!pending.length) {
        review.replaceChildren();
        return;
      }
      if (reviewing < 0) {
        review.replaceChildren(
          el('span', '', `${pending.length} suggested filler${pending.length === 1 ? '' : 's'} (dashed).`),
          button('Review them', 'secondary', () => {
            reviewing = 0;
            selected = pending[0]!.id;
            seek(Math.max(0, pending[0]!.t - 1.5));
            paintAll();
          }),
          button('Keep all', 'ghost', () => {
            tags = tags.map((t) => (t.source === 'suggested' ? { ...t, confirmed: true } : t));
            paintAll();
            queueSave();
          }),
          button('Drop all', 'ghost', () => {
            tags = tags.filter((t) => !(t.source === 'suggested' && !t.confirmed));
            paintAll();
            queueSave();
          })
        );
      } else {
        const current = pending[0]!;
        const quote = words
          .slice(current.w[0], current.w[1] + 1)
          .map((w) => w.w)
          .join(' ');
        review.replaceChildren(
          el('span', '', `“${quote}” at ${clock(current.t)}: a filler? ${pending.length} left.`),
          button('Keep (Enter)', 'primary', () => decideSuggestion(true)),
          button('Drop (Backspace)', 'ghost', () => decideSuggestion(false)),
          button('Stop', 'ghost', () => {
            reviewing = -1;
            paintAll();
          })
        );
      }
    }

    /* painting */
    function paintPaper(): void {
      if (!words.length) return;
      const span = (tag: MarkTag) => ({
        start: sheet.ranges[tag.w[0]]?.start ?? 0,
        end: sheet.ranges[Math.min(tag.w[1], sheet.ranges.length - 1)]?.end ?? 0
      });
      const marks: Mark[] = tags.map((tag, i) => ({ ...span(tag), layer: i, colour: tagColour(tag, byId) }));
      // Where the AI heard a check met, under the teacher's tags.
      const heard: Mark[] = (aiRead?.checks ?? []).flatMap((c, i) => {
        const at = c.quote ? findQuoteWords(words, c.quote) : null;
        if (!at) return [];
        return [{ start: sheet.ranges[at[0]]!.start, end: sheet.ranges[at[1]]!.end, layer: tags.length + i, colour: 'var(--pastel-lilac-ink)' }];
      });
      const sheetEl = paper(sheet.text, [...marks, ...heard], null);
      for (const h of heard) {
        sheetEl.querySelectorAll<HTMLElement>('.pa-run--mark').forEach((run) => {
          if (Number(run.dataset.start) >= h.start && Number(run.dataset.end) <= h.end) run.classList.add('voice-run--heard');
        });
      }
      tags.forEach((tag, i) => {
        if (tag.source === 'suggested' && !tag.confirmed) {
          sheetEl.querySelectorAll<HTMLElement>('.pa-run--mark').forEach((run) => {
            if (Number(run.dataset.start) >= marks[i]!.start && Number(run.dataset.end) <= marks[i]!.end) run.classList.add('voice-run--suggested');
          });
        }
        if (tag.id === selected) {
          sheetEl.querySelectorAll<HTMLElement>('.pa-run--mark').forEach((run) => {
            if (Number(run.dataset.start) >= marks[i]!.start && Number(run.dataset.end) <= marks[i]!.end) run.classList.add('pa-run--open');
          });
        }
      });
      paperHost.replaceChildren(sheetEl);
    }

    function wordIndexFromRun(run: HTMLElement): number {
      const start = Number(run.dataset.start);
      const i = sheet.ranges.findIndex((r) => r.end > start);
      return i === -1 ? sheet.ranges.length - 1 : i;
    }

    paperHost.addEventListener('click', (e) => {
      const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run');
      if (!run) return;
      const index = wordIndexFromRun(run);
      const hit = tags.filter((t) => t.w[0] <= index && t.w[1] >= index);
      if (hit.length) selected = hit[hit.length - 1]!.id;
      if (words[index]) seek(words[index]!.start);
      paintAll();
    });

    function noteRow(tag: MarkTag): HTMLElement {
      const row = el('li', 'voice-note');
      row.dataset.tag = tag.id;
      if (tag.id === selected) row.classList.add('voice-note--selected');
      if (tag.source === 'suggested' && !tag.confirmed) row.classList.add('voice-note--suggested');
      const head = el('div', 'voice-note__head');
      const jump = button(clock(tag.t), 'ghost', () => {
        selected = tag.id;
        seek(Math.max(0, tag.t - 1));
        paintAll();
      });
      jump.className = 'voice-note__time';
      const quote = words
        .slice(tag.w[0], tag.w[1] + 1)
        .map((w) => w.w)
        .join(' ');
      head.append(tagChip(tag, byId), jump, el('span', 'voice-note__quote', `“${quote}”`));
      const del = button('✕', 'ghost', () => removeTag(tag.id));
      del.className = 'voice-note__delete';
      del.setAttribute('aria-label', `Remove ${tag.code} at ${clock(tag.t)}`);
      head.append(del);
      row.append(head);
      if (tag.id !== selected) {
        if (tag.note) row.append(el('p', 'voice-note__text', tag.note));
        row.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          selected = tag.id;
          paintAll();
        });
        return row;
      }
      const code = byId.get(tag.code_id);
      if (code) row.append(el('p', 'voice-note__descriptor block-secondary', descriptorFor(code, tag.positive)));
      const note = el('input', 'pa-input voice-note__input');
      note.type = 'text';
      note.maxLength = 400;
      note.placeholder = 'Add a note (optional), then Enter';
      note.value = tag.note ?? '';
      note.addEventListener('input', () => {
        tags = tags.map((t) => (t.id === tag.id ? { ...t, note: note.value } : t));
        queueSave();
      });
      note.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          note.blur();
          selected = null;
          paintAll();
        }
      });
      const nudge = el('div', 'voice-note__nudge');
      const last = words.length - 1;
      const move = (dStart: number, dEnd: number) => {
        const start = Math.max(0, Math.min(last, tag.w[0] + dStart));
        const end = Math.max(start, Math.min(last, tag.w[1] + dEnd));
        patchTag(tag.id, { w: [start, end] });
      };
      nudge.append(
        button('◀ word', 'ghost', () => move(-1, -1)),
        button('word ▶', 'ghost', () => move(1, 1)),
        button('Longer', 'ghost', () => move(0, 1)),
        button('Shorter', 'ghost', () => move(0, -1)),
        button(tag.positive ? 'Make it a correction' : 'Make it a strength', 'ghost', () => patchTag(tag.id, { positive: !tag.positive }))
      );
      row.append(note, nudge);
      return row;
    }

    function paintNotes(): void {
      const list = el('ol', 'voice-notes');
      list.setAttribute('aria-label', 'Tags in order');
      tags.forEach((tag) => list.append(noteRow(tag)));
      notes.replaceChildren(
        el('p', 'voice-mark__notes-title', tags.length ? `${confirmed().length} tag${confirmed().length === 1 ? '' : 's'}` : 'No tags yet'),
        ...(tags.length ? [list] : [el('p', 'block-secondary', 'Play the recording and press a code as you hear it.')])
      );
    }

    function paintSummary(): void {
      const children: HTMLElement[] = [el('p', 'voice-mark__summary-title', 'What the student will see at the top')];
      if (confirmed().length) children.push(summaryList(confirmed(), library, words));
      const facts: string[] = [];
      const limit = block.content.time_limit_s;
      facts.push(limit ? `${Math.round(record.duration_s)} s of ${limit} s` : `${Math.round(record.duration_s)} s`);
      if (record.points.length) {
        const used = new Set(confirmed().map((t) => pointIndexAt(record.points, t.t)));
        facts.push(`${record.points.length} point${record.points.length === 1 ? '' : 's'} reached${used.size ? ` · tags in point${used.size === 1 ? '' : 's'} ${[...used].sort().map((i) => i + 1).join(', ')}` : ''}`);
      }
      children.push(el('p', 'block-secondary', facts.join(' · ')));
      summary.replaceChildren(...children);
    }

    function paintAll(): void {
      paintReview();
      paintPaper();
      paintNotes();
      paintSummary();
      paintTime();
    }

    /* saving */
    function queueSave(): void {
      saveState.textContent = 'Unsaved…';
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    }

    function flush(extra: Record<string, unknown> = {}): Promise<void> {
      window.clearTimeout(saveTimer);
      saving = saving.then(async () => {
        try {
          const saved = await apiPut<Submission>(`${base(lessonId, block.id)}/${encodeURIComponent(record.id)}`, { tags, comment, ...extra });
          status = saved.status;
          saveState.textContent = status === 'returned' ? 'Saved. The student sees changes as you save.' : 'Saved';
        } catch (error) {
          saveState.textContent = 'Not saved';
          showError(error);
        }
      });
      return saving;
    }

    // First open with a transcript: pre-mark likely fillers for the teacher to keep or drop.
    const filler = library.find((c) => c.code === 'FW' && !c.hidden);
    if (words.length && filler && !record.fillers_suggested) {
      const taken = new Set(tags.filter((t) => t.code_id === filler.id).map((t) => t.w[0]));
      const suggested = fillerSuggestions(words)
        .filter((f) => !taken.has(f.w[0]))
        .map<MarkTag>((f) => ({
          id: newTagId(),
          code_id: filler.id,
          code: filler.code,
          label: filler.label,
          positive: false,
          t: Math.round(words[f.w[0]]!.start * 10) / 10,
          w: f.w,
          source: 'suggested',
          confirmed: false
        }));
      tags = [...tags, ...suggested].sort((a, b) => a.t - b.t);
      void flush({ fillers_suggested: true });
    }

    paintAll();
    return () => {
      document.removeEventListener('keydown', onKey);
      audio.pause();
      audio.removeAttribute('src');
    };
  }

  if (take) void openMarking(take.id);
  else void loadInbox();
  return root;
}

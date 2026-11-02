import { button, el } from '@/blocks/peer-feedback-ui';
import { paper, type Mark } from '@/blocks/peer-annotate';
import {
  STRENGTH_COLOUR,
  codeInk,
  codeText,
  descriptorFor,
  focusStep,
  summariseByCriterion,
  type FeedbackCode
} from '@/blocks/feedback-codes';
import { alignTagWords, buildPaper, commonestFiller, transcriptWords, wordAt } from '@/blocks/voice-marking';
import { audioUrl, type MineState, type VoiceTag } from '@/blocks/voice-client';
import { clock } from '@/blocks/voice-pacing';
import type { VoiceWord } from '@/blocks/voice-transcript';

/**
 * What a student reads once the teacher returns their Voice submission: what
 * the teacher had while marking, minus the controls. One focus, the summary,
 * the comment, the recording, then the transcript beside every tag in order.
 */

type Returned = Extract<MineState, { submitted: true }>;

const PLAY_LEAD_S = 2;

export function tagColour(tag: Pick<VoiceTag, 'positive' | 'code_id'>, byId: Map<string, FeedbackCode>): string {
  return codeInk(tag.positive ? STRENGTH_COLOUR : (byId.get(tag.code_id)?.colour ?? 'blue'));
}

export function tagChip(tag: Pick<VoiceTag, 'positive' | 'code' | 'code_id'>, byId: Map<string, FeedbackCode>): HTMLElement {
  const code = byId.get(tag.code_id);
  const chip = el('span', 'fc-chip', code ? codeText(code, tag.positive) : `${tag.code}${tag.positive ? '+' : ''}`);
  chip.style.setProperty('--fc-ink', tagColour(tag, byId));
  if (tag.positive) chip.classList.add('fc-chip--strength');
  return chip;
}

/**
 * The summary doubles as the key: each heading is a rubric criterion (or
 * Speaking), and each code it holds is spelled out, "AR Analysis – relevance
 * ×2", with what it asks for underneath, so nobody has to know the shorthand.
 * Only codes this recording got.
 */
export function summaryList(tags: readonly VoiceTag[], codes: readonly FeedbackCode[], words: readonly VoiceWord[]): HTMLElement {
  const list = el('dl', 'voice-summary');
  const fillerIds = new Set(codes.filter((c) => c.code === 'FW').map((c) => c.id));
  const filler = commonestFiller(words, tags.filter((t) => fillerIds.has(t.code_id) && !t.positive).map((t) => t.w));
  let strengths = false;
  for (const line of summariseByCriterion(tags, codes)) {
    const items = el('dd', 'voice-summary__items');
    for (const item of line.items) {
      strengths ||= item.positive;
      const row = el('div', 'voice-summary__item');
      const line = el('span', 'voice-summary__line');
      const chip = el('span', 'fc-chip', item.text);
      chip.style.setProperty('--fc-ink', codeInk(item.positive ? STRENGTH_COLOUR : item.code.colour));
      if (item.positive) chip.classList.add('fc-chip--strength');
      let label = item.code.label;
      if (item.positive) label += ' (strength)';
      if (filler && fillerIds.has(item.code.id) && !item.positive) label += ` (mostly “${filler}”)`;
      line.append(chip, el('span', 'voice-summary__label', label));
      if (item.count > 1) line.append(el('span', 'voice-summary__count', `×${item.count}`));
      row.append(line);
      const meaning = descriptorFor(item.code, item.positive);
      if (meaning) row.append(el('span', 'voice-summary__meaning', meaning));
      items.append(row);
    }
    list.append(el('dt', 'voice-summary__heading', line.heading), items);
  }
  if (strengths) list.append(el('p', 'voice-summary__foot block-secondary', 'A + after a code marks a strength.'));
  return list;
}

/** One line on what to work on next: the code chip, then one step. Nothing for all-strength work. */
export function focusBox(
  tags: ReadonlyArray<{ code_id: string; positive: boolean }>,
  codes: readonly FeedbackCode[],
  rungs?: Record<string, string | null | undefined>
): HTMLElement | null {
  const focus = focusStep(tags, codes, rungs);
  if (!focus) return null;
  const box = el('section', 'voice-focus');
  const chip = el('span', 'fc-chip', codeText(focus.code, false));
  chip.style.setProperty('--fc-ink', codeInk(focus.code.colour));
  const line = el('p', 'voice-focus__line');
  line.append(chip, el('span', undefined, focus.line));
  box.append(el('h3', 'voice-focus__title', 'What to focus on next'), line);
  return box;
}

export function renderVoiceFeedback(state: Returned, options: { title?: string; focus?: boolean } = {}): HTMLElement {
  const root = el('div', 'voice-feedback');
  const codes = state.codes ?? [];
  const byId = new Map(codes.map((c) => [c.id, c]));
  const points = state.points ?? [];
  const { words } = transcriptWords(state.transcript, state.duration_s);
  const tags = alignTagWords(state.tags ?? [], words);
  const sheet = buildPaper(words, points);

  root.append(el('p', 'voice-feedback__title', options.title ?? 'Feedback from your teacher'));
  const focus = options.focus === false ? null : focusBox(tags, codes);
  if (focus) root.append(focus);
  if (tags.length) root.append(summaryList(tags, codes, words));
  if (state.comment?.trim()) root.append(el('p', 'voice-feedback__comment', state.comment));

  let player: HTMLAudioElement | null = null;
  if (state.audio_url) {
    player = el('audio', 'voice-take__audio voice-feedback__audio');
    player.controls = true;
    player.preload = 'metadata';
    player.src = audioUrl(state.audio_url);
    root.append(player);
  } else {
    root.append(el('p', 'voice-feedback__gone block-secondary', 'Audio removed after 4 weeks. Transcript and feedback kept.'));
  }

  const span = (tag: VoiceTag) => ({
    start: sheet.ranges[tag.w[0]]?.start ?? 0,
    end: sheet.ranges[Math.min(tag.w[1], sheet.ranges.length - 1)]?.end ?? 0
  });
  const marks: Mark[] = tags.map((tag, i) => ({ ...span(tag), layer: i, colour: tagColour(tag, byId) }));
  const paperHost = el('div', 'pa-paper-host pa-paper-host--read voice-mark__paper');
  const notes = el('ol', 'voice-notes');
  notes.setAttribute('aria-label', 'Tags in order');
  let selected: string | null = null;

  const listen = (t: number): void => {
    if (!player) return;
    player.currentTime = Math.max(0, t);
    void player.play();
  };

  function noteRow(tag: VoiceTag): HTMLElement {
    const code = byId.get(tag.code_id);
    const row = el('li', 'voice-note');
    row.dataset.tag = tag.id;
    if (tag.id === selected) row.classList.add('voice-note--selected');
    const head = el('div', 'voice-note__head');
    head.append(tagChip(tag, byId));
    if (player) {
      const jump = button(clock(tag.t), 'ghost', () => listen(tag.t - PLAY_LEAD_S));
      jump.className = 'voice-note__time';
      jump.setAttribute('aria-label', `Listen from ${clock(Math.max(0, tag.t - PLAY_LEAD_S))}`);
      head.append(jump);
    } else {
      head.append(el('span', 'voice-note__time', clock(tag.t)));
    }
    const quote = words
      .slice(tag.w[0], tag.w[1] + 1)
      .map((w) => w.w)
      .join(' ');
    if (quote) head.append(el('span', 'voice-note__quote', `“${quote}”`));
    row.append(head);
    if (code) row.append(el('p', 'voice-note__descriptor block-secondary', descriptorFor(code, tag.positive)));
    if (tag.note) row.append(el('p', 'voice-note__text', tag.note));
    if (code?.resource) {
      const link = el('a', 'voice-note__link', 'See how →');
      link.href = code.resource.url;
      link.target = '_blank';
      link.rel = 'noopener';
      row.append(link);
    }
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      selected = tag.id;
      paint();
    });
    return row;
  }

  function paint(): void {
    const sheetEl = paper(sheet.text, marks, null);
    tags.forEach((tag, i) => {
      if (tag.id !== selected) return;
      sheetEl.querySelectorAll<HTMLElement>('.pa-run--mark').forEach((run) => {
        if (Number(run.dataset.start) >= marks[i]!.start && Number(run.dataset.end) <= marks[i]!.end) run.classList.add('pa-run--open');
      });
    });
    paperHost.replaceChildren(sheetEl);
    notes.replaceChildren(...tags.map(noteRow));
  }

  paperHost.addEventListener('click', (e) => {
    const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run');
    if (!run) return;
    const at = Number(run.dataset.start);
    const index = sheet.ranges.findIndex((r) => r.end > at);
    const hit = tags.filter((t) => t.w[0] <= index && t.w[1] >= index).at(-1);
    if (hit) {
      selected = hit.id;
      paint();
      notes.querySelector<HTMLElement>(`[data-tag="${hit.id}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
    if (player && words[index]) player.currentTime = words[index]!.start;
  });

  if (player) {
    const audio = player;
    audio.addEventListener('timeupdate', () => {
      paperHost.querySelectorAll('.voice-word--now').forEach((n) => n.classList.remove('voice-word--now'));
      const now = audio.paused ? -1 : wordAt(words, audio.currentTime);
      if (now >= 0) paperHost.querySelector<HTMLElement>(`.pa-run[data-start="${sheet.ranges[now]!.start}"]`)?.classList.add('voice-word--now');
    });
  }

  const work = el('div', 'voice-feedback__work');
  if (words.length) work.append(paperHost);
  else if (player) work.append(el('p', 'block-secondary', 'Play the recording to hear it.'));
  if (tags.length) {
    const side = el('div', 'voice-feedback__notes');
    side.append(el('p', 'voice-mark__notes-title', `${tags.length} tag${tags.length === 1 ? '' : 's'}`), notes);
    work.append(side);
  }
  root.append(work);
  paint();
  return root;
}

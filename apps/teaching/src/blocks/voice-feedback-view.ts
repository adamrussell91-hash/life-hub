import { button, el } from '@/blocks/peer-feedback-ui';
import { paper, type Mark } from '@/blocks/peer-annotate';
import {
  STRENGTH_COLOUR,
  codeInk,
  codeText,
  descriptorFor,
  summariseByCriterion,
  summaryLineText,
  type FeedbackCode
} from '@/blocks/feedback-codes';
import { buildPaper, commonestFiller, pointIndexAt, transcriptWords } from '@/blocks/voice-marking';
import { audioUrl, type MineState, type VoiceTag } from '@/blocks/voice-client';
import { clock } from '@/blocks/voice-pacing';
import type { VoiceWord } from '@/blocks/voice-transcript';

/**
 * What a student reads once the teacher returns their Voice submission. Built
 * from the peer feedback "notes on the text" view so it looks and works the
 * same: a summary, the transcript with coloured marks, and a card per mark.
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

/** "Criterion 1 · Ideas — TS+ · AR ×2", plus a speaking line naming the commonest filler. */
export function summaryList(tags: readonly VoiceTag[], codes: readonly FeedbackCode[], words: readonly VoiceWord[]): HTMLElement {
  const list = el('dl', 'voice-summary');
  for (const line of summariseByCriterion(tags, codes)) {
    let text = summaryLineText(line);
    if (line.heading === 'Speaking') {
      const fillerIds = new Set(codes.filter((c) => c.code === 'FW').map((c) => c.id));
      const filler = commonestFiller(words, tags.filter((t) => fillerIds.has(t.code_id) && !t.positive).map((t) => t.w));
      if (filler) text += ` (mostly “${filler}”)`;
    }
    list.append(el('dt', 'voice-summary__heading', line.heading), el('dd', 'voice-summary__items', text));
  }
  return list;
}

export function renderVoiceFeedback(state: Returned): HTMLElement {
  const root = el('div', 'pa-get voice-feedback');
  const codes = state.codes ?? [];
  const byId = new Map(codes.map((c) => [c.id, c]));
  const tags = state.tags ?? [];
  const points = state.points ?? [];
  const { words } = transcriptWords(state.transcript, state.duration_s);
  const sheet = buildPaper(words, points);

  root.append(el('p', 'voice-feedback__title', 'Feedback from your teacher'));
  if (tags.length) root.append(summaryList(tags, codes, words));
  if (state.comment?.trim()) root.append(el('p', 'voice-feedback__comment', state.comment));

  let player: HTMLAudioElement | null = null;
  if (state.audio_url) {
    player = el('audio', 'voice-take__audio');
    player.controls = true;
    player.preload = 'metadata';
    player.src = audioUrl(state.audio_url);
    root.append(player);
  } else {
    root.append(el('p', 'voice-feedback__gone block-secondary', 'Audio removed after 4 weeks. Transcript and feedback kept.'));
  }

  if (!words.length) {
    root.append(el('p', 'block-secondary', 'The transcript isn’t available for this recording.'));
    return root;
  }

  const span = (tag: VoiceTag) => ({
    start: sheet.ranges[tag.w[0]]?.start ?? 0,
    end: sheet.ranges[Math.min(tag.w[1], sheet.ranges.length - 1)]?.end ?? 0
  });
  const marks: Mark[] = tags.map((tag, i) => ({ ...span(tag), layer: i, colour: tagColour(tag, byId) }));
  const paperHost = el('div', 'pa-paper-host pa-paper-host--read voice-feedback__paper');
  const hint = el('p', 'pa-hint', 'Tap a highlighted part to read the note.');
  const cards = el('div', 'pa-cards');
  cards.setAttribute('aria-live', 'polite');
  root.append(paperHost, hint, cards);
  let open: number | null = null;

  function card(tag: VoiceTag): HTMLElement {
    const code = byId.get(tag.code_id);
    const box = el('article', 'pa-card voice-card');
    box.style.setProperty('--pa-mark', tagColour(tag, byId));
    const head = el('p', 'pa-card__head');
    head.append(tagChip(tag, byId), code?.label ?? tag.label ?? 'Comment');
    const point = pointIndexAt(points, tag.t);
    if (point >= 0) head.append(el('span', 'block-secondary', ` · point ${point + 1}`));
    const quote = words
      .slice(tag.w[0], tag.w[1] + 1)
      .map((w) => w.w)
      .join(' ');
    box.append(head, el('p', 'pa-card__quote', `“${quote.length > 120 ? `${quote.slice(0, 117)}…` : quote}”`));
    if (code) box.append(el('p', 'pa-card__comment', descriptorFor(code, tag.positive)));
    if (tag.note) box.append(el('p', 'voice-card__note', tag.note));
    if (player) {
      const audio = player;
      box.append(
        button(`Play from ${clock(Math.max(0, tag.t - PLAY_LEAD_S))}`, 'ghost', () => {
          audio.currentTime = Math.max(0, tag.t - PLAY_LEAD_S);
          void audio.play();
        })
      );
    }
    return box;
  }

  function paint(): void {
    paperHost.replaceChildren(paper(sheet.text, marks, null));
    paperHost.querySelectorAll<HTMLElement>('.pa-run--mark').forEach((run) => {
      run.tabIndex = 0;
      run.setAttribute('role', 'button');
      run.setAttribute('aria-label', `Read the note on “${run.textContent ?? ''}”`);
      if (open !== null && Number(run.dataset.start) <= open && Number(run.dataset.end) > open) run.classList.add('pa-run--open');
    });
    cards.replaceChildren();
    hint.hidden = open !== null || tags.length === 0;
    if (open === null) return;
    tags.forEach((tag, i) => {
      if (marks[i]!.start <= open! && marks[i]!.end > open!) cards.append(card(tag));
    });
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

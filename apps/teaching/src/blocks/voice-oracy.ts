import type { Block } from '@/schemas/block';

/**
 * Oracy types on the Voice block. Stored `mode` stays listen, respond or viva,
 * so submitting, marking and returned work run as they do for any take; the
 * `oracy` field adds starter content and the student's Debate and Recite extras.
 */

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;
type Content = VoiceBlock['content'];
export type OracyType = NonNullable<Content['oracy']>;
export type VoicePickId = 'listen' | 'respond' | 'viva' | OracyType;
type Starter = { labels?: string[]; stems?: string[]; seconds?: number };

export const VOICE_PICKS: Array<{ id: VoicePickId; label: string; hint: string; mode: NonNullable<Content['mode']>; oracy?: OracyType }> = [
  { id: 'listen', label: 'Listen', hint: 'Students play a clip you upload or record.', mode: 'listen' },
  { id: 'respond', label: 'Respond', hint: 'Students record a spoken answer and send you their best take.', mode: 'respond' },
  { id: 'viva', label: 'Viva', hint: 'Students prep dot points; the timer walks them through each point while they record.', mode: 'viva' },
  { id: 'speech', label: 'Speech', hint: 'Students plan a speech, try the techniques you list and send their best take.', mode: 'viva', oracy: 'speech' },
  { id: 'debate', label: 'Debate', hint: 'Students argue one side and record a single speech.', mode: 'viva', oracy: 'debate' },
  { id: 'presentation', label: 'Presentation', hint: 'Students present from their own slides. Each dot point is a slide heading.', mode: 'viva', oracy: 'presentation' },
  { id: 'recite', label: 'Recite', hint: 'Students memorise a text part by part, then record it from memory.', mode: 'respond', oracy: 'recite' }
];

export const ORACY_LABELS: Record<OracyType, string> = { speech: 'Speech', debate: 'Debate', presentation: 'Presentation', recite: 'Recite' };
export const SIDE_LABELS: Record<NonNullable<Content['side']>, string> = { proposing: 'Proposing', opposing: 'Opposing' };

const STARTERS: Record<OracyType, Starter> = {
  speech: { labels: ['Hook', 'Main message', 'Reason 1', 'Reason 2', 'Call to action'], stems: ['Rhetorical opener', 'Rule of three', 'Repetition', 'Pause'], seconds: 180 },
  debate: { labels: ['Our case', 'First reason', 'Second reason', 'What they will say', 'Close'], stems: ['I believe that…', 'Firstly… secondly…', 'Moreover…', 'Our opponents may argue…'], seconds: 180 },
  presentation: { labels: ['Slide 1', 'Slide 2', 'Slide 3', 'Slide 4'], seconds: 300 },
  recite: {}
};

export function voicePick(content: Content): VoicePickId {
  return content.oracy ?? content.mode ?? 'listen';
}

const sameList = (a: string[], b: string[] | undefined) => Boolean(b) && a.length === b!.length && a.every((value, i) => value === b![i]);
/** Empty, or still exactly what the previous type filled in. */
const untouched = (values: string[], previous: string[] | undefined) => values.length === 0 || sameList(values, previous);

/** The content after choosing a pill. Starter content fills empty fields only; a teacher's own work stays. */
export function applyVoicePick(content: Content, id: VoicePickId): Content {
  const pick = VOICE_PICKS.find((p) => p.id === id)!;
  const before = content.oracy ? STARTERS[content.oracy] : {};
  const next: Content = { ...content, mode: pick.mode };
  if (pick.oracy) next.oracy = pick.oracy;
  else delete next.oracy;
  if (!pick.oracy) return next;

  const starter = STARTERS[pick.oracy];
  const labels = (content.scaffold ?? []).map((p) => p.label);
  if (starter.labels && untouched(labels, before.labels)) next.scaffold = starter.labels.map((label) => ({ label, weight: 1 }));
  if (starter.stems && untouched(content.stems ?? [], before.stems)) next.stems = [...starter.stems];
  const timeIsDefault = !content.student_chooses_time && (content.time_limit_s === undefined || content.time_limit_s === before.seconds);
  if (timeIsDefault) {
    if (starter.seconds) next.time_limit_s = starter.seconds;
    else delete next.time_limit_s;
  }
  return next;
}

/** Blank lines separate the parts. Line breaks inside a part are kept. */
export function reciteParts(text: string | undefined): string[] {
  return (text ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((part) => part.replace(/^\s*\n|\s+$/g, ''))
    .filter((part) => part.trim().length > 0);
}

/**
 * The practice order: each new part alone, then everything so far together
 * (A, B, A and B, C, A to C). Each round lists the part indexes it covers.
 */
export function reciteRounds(partCount: number): number[][] {
  const rounds: number[][] = [];
  for (let i = 0; i < partCount; i += 1) {
    rounds.push([i]);
    if (i > 0) rounds.push(Array.from({ length: i + 1 }, (_, n) => n));
  }
  return rounds;
}

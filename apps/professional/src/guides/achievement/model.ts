// The Achievement guide: Siegle and McCoach's Achievement Orientation Model, read in a meeting.
// Three attitudes (goal valuation, self-efficacy, environmental perceptions) interact to drive
// self-regulation, which turns ability into achievement. Digs follow Wigfield and Eccles (value),
// Bandura via Usher and Pajares (sources of self-efficacy) and Zimmerman (phases of SRL).
// Approved mockup and research map: docs/mockups/achievement-guide/achievement.html
// Wording is ours, written to be read aloud to a teenager: about the task, never about who they are.
import type { GuideRun, Tap } from '../types';

export const ACHIEVEMENT_ID = 'achievement_aom';
export const ACHIEVEMENT_NAME = 'Achievement';
export const ACHIEVEMENT_LINE = 'What stands between them and the result. 3 to 8 minutes.';

export type AreaId = 'value' | 'efficacy' | 'env' | 'reg';
export const AREA_IDS: AreaId[] = ['value', 'efficacy', 'env', 'reg'];
export const ATTITUDES: AreaId[] = ['value', 'efficacy', 'env'];

export interface Dig { id: string; name: string; example: string; theory: string; moves: string[] }
export interface Area {
  id: AreaId;
  short: string;
  theory: string;
  colour: string;
  ink: string;
  ask: string;
  alt: string;
  hint: string;
  solid: string[];
  shaky: string[];
  digAsk: string;
  digHint: string;
  digs: Dig[];
  base: string[];
  their: string;
}
export interface Move { id: string; area: AreaId | null; text: string; source: string }
export type ProfileId = AreaId | 'flowing' | 'low';
export interface Profile { id: ProfileId; name: string; line: string }

export const AREAS: Area[] = [
  {
    id: 'value', short: 'Worth it', theory: 'Goal valuation', colour: '#c98a24', ink: '#855610',
    ask: 'What would doing well at this get you that you actually care about?',
    alt: 'If this subject disappeared tomorrow, what would you miss?',
    hint: 'Listen for a reason that is theirs: they like it, it’s useful, or they’d be annoyed to be bad at it.',
    solid: ['I need it for what I want to do.', 'I actually like arguing a point.', 'I want to be good at this.'],
    shaky: ['What’s the point?', 'I’ll never use this.', 'It’s just for marks.'],
    digAsk: 'What kind of worth is missing?',
    digHint: 'Four kinds of value (Eccles and Wigfield). Pick any that fit.',
    digs: [
      { id: 'intrinsic', name: 'Enjoyment', example: 'It’s boring.', theory: 'Intrinsic value', moves: ['m_choice'] },
      { id: 'utility', name: 'Usefulness', example: 'I’ll never use it.', theory: 'Utility value', moves: ['m_utility'] },
      { id: 'attainment', name: 'Doesn’t care about being good at it', example: 'Whatever, I don’t mind if I’m bad at it.', theory: 'Attainment value', moves: ['m_identity'] },
      { id: 'cost', name: 'Cost', example: 'It takes too much, or what if I try and still fail?', theory: 'Cost', moves: ['m_cost'] }
    ],
    base: ['m_utility', 'm_choice'],
    their: 'Doing well at this matters to me.'
  },
  {
    id: 'efficacy', short: 'Can I', theory: 'Self-efficacy', colour: '#b04f67', ink: '#8e3550',
    ask: 'If you put the work in, how sure are you that you’d do well at this?',
    alt: 'What’s the hardest part of this for you?',
    hint: 'Listen for belief about this task, not about being smart in general.',
    solid: ['If I plan it, I can do it.', 'I usually do fine on these.'],
    shaky: ['I’m just not good at this subject.', 'I always lose marks on this.', 'Everyone else gets it straight away.'],
    digAsk: 'Where does the doubt come from?',
    digHint: 'The four sources of self-efficacy (Bandura). Pick any that fit.',
    digs: [
      { id: 'mastery', name: 'Results so far', example: 'I always lose marks. It never used to be this hard.', theory: 'Mastery experience', moves: ['m_win', 'm_growth'] },
      { id: 'vicarious', name: 'Comparing with others', example: 'Everyone else gets it.', theory: 'Vicarious experience', moves: ['m_peer'] },
      { id: 'persuasion', name: 'What they’ve been told', example: 'My last teacher said I’m no good at it.', theory: 'Social persuasion', moves: ['m_feedback'] },
      { id: 'affect', name: 'Nerves', example: 'My mind goes blank in the exam.', theory: 'Physiological and emotional states', moves: ['m_nerves'] }
    ],
    base: ['m_win', 'm_growth'],
    their: 'If I work at it, I can do well at this.'
  },
  {
    id: 'env', short: 'Backed', theory: 'Environmental perceptions', colour: '#5a8a48', ink: '#3e6331',
    ask: 'Who’s in your corner on this? And does the class feel too easy, too hard or about right?',
    alt: 'Who would you go to if you got stuck on this?',
    hint: 'Listen for whether they think the people and the setting will let them do well.',
    solid: ['Sir explains it if I ask.', 'My friends take it seriously too.'],
    shaky: ['The teacher doesn’t like me.', 'It’s not cool to try.', 'It’s too slow, I already know this.'],
    digAsk: 'What isn’t backing them?',
    digHint: 'The parts of the setting the model names. Pick any that fit.',
    digs: [
      { id: 'teacher', name: 'A teacher', example: 'She doesn’t like me.', theory: 'Teacher relationship', moves: ['m_teacher'] },
      { id: 'peers', name: 'Friends and class', example: 'It’s not cool to try.', theory: 'Peer climate', moves: ['m_private'] },
      { id: 'home', name: 'Home', example: 'They only ask about the mark.', theory: 'Family messages', moves: ['m_home'] },
      { id: 'fit', name: 'The fit', example: 'Too slow, I already know this. Or: way over my head.', theory: 'Challenge and pace', moves: ['m_fit'] }
    ],
    base: ['m_teacher', 'm_fit'],
    their: 'The people around me help me do well at this.'
  },
  {
    id: 'reg', short: 'Run it', theory: 'Self-regulation', colour: '#2f5d8a', ink: '#244a70',
    ask: 'Walk me through the last big task. When did you start, and what did you do when you got stuck?',
    alt: 'What did you do with the feedback on your last piece of work?',
    hint: 'Listen for a plan, a way of checking progress, and what they do after a mark comes back.',
    solid: ['I break it up over the week.', 'I check it against the criteria.'],
    shaky: ['The night before.', 'I just read over my notes.', 'I don’t really look at feedback.'],
    digAsk: 'Where does it break down?',
    digHint: 'The three phases of self-regulated learning (Zimmerman). Pick any that fit.',
    digs: [
      { id: 'before', name: 'Before: planning and starting', example: 'I leave it to the last minute.', theory: 'Forethought', moves: ['m_steps'] },
      { id: 'during', name: 'During: focus and strategies', example: 'I just reread it and hope.', theory: 'Performance', moves: ['m_retrieval', 'm_strategy'] },
      { id: 'after', name: 'After: using feedback', example: 'I look at the mark and move on.', theory: 'Self-reflection', moves: ['m_after'] }
    ],
    base: ['m_steps', 'm_after'],
    their: 'I plan this work and keep on top of it.'
  }
];

export const AREA: Record<AreaId, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, Area>;
export const question = (a: Area) => `${a.short}?`;

const move = (id: string, area: AreaId | null, text: string, source: string): [string, Move] => [id, { id, area, text, source }];
export const MOVES: Record<string, Move> = Object.fromEntries([
  move('m_utility', 'value', 'Ask them to write two or three sentences on how this could matter in their own life. Let them find the link rather than hearing yours.', 'Utility value · Hulleman and Harackiewicz 2009, where it helped students who expected to do poorly'),
  move('m_choice', 'value', 'Give a real choice inside the task: the text, the angle or the format, tied to something they are already into.', 'Intrinsic value · Wigfield and Eccles 2000'),
  move('m_identity', 'value', 'Give them a turn where being good at it shows: going first, modelling an answer, or helping a classmate.', 'Attainment value · Wigfield and Eccles 2000 · the move is our idea'),
  move('m_cost', 'value', 'Name the cost out loud, then shrink the first step until it is cheap to start.', 'Cost · Wigfield and Eccles 2000'),
  move('m_win', 'efficacy', 'Set one step they can succeed at this week, then point to it at the next meeting.', 'Mastery experience is the strongest source · Usher and Pajares 2008'),
  move('m_growth', 'efficacy', 'Put an early piece beside a recent one so they can see their own growth.', 'Making mastery visible · Usher and Pajares 2008'),
  move('m_peer', 'efficacy', 'Compare them with their own past work, not with others. Show a model who struggled and got there.', 'Vicarious experience · Usher and Pajares 2008'),
  move('m_feedback', 'efficacy', 'Give feedback that names the skill they used, so the praise is believable and repeatable.', 'Social persuasion · Usher and Pajares 2008'),
  move('m_nerves', 'efficacy', 'Name the nerves and rehearse it at low stakes. If it is more than nerves, open Check-in.', 'Physiological and emotional states · Usher and Pajares 2008'),
  move('m_teacher', 'env', 'Find one honest positive to say this week, and ask what helps them learn in that class.', 'Teacher relationships and engagement · Roorda et al. 2011'),
  move('m_private', 'env', 'Keep their stretch work low profile, or put them with peers who value it.', 'Social cost of achieving · Cross, Coleman and Terhaar-Yonkers 1991'),
  move('m_home', 'env', 'Agree one message for home about effort and strategy, not marks.', 'Environmental perceptions · Siegle, McCoach and Roberts 2017'),
  move('m_fit', 'env', 'Too easy: skip what they already know and extend or accelerate. Too hard: scaffold the next step.', 'Acceleration · Steenbergen-Hu, Makel and Olszewski-Kubilius 2016'),
  move('m_steps', 'reg', 'Break the task into dated steps together, and have them write one plan as “When…, I will…”.', 'Implementation intentions · Gollwitzer and Sheeran 2006; Duckworth et al. 2011'),
  move('m_retrieval', 'reg', 'Swap rereading for self-testing: cover what they need to know and recall it, a little each day over several days.', 'Practice testing and spaced practice · Dunlosky et al. 2013'),
  move('m_strategy', 'reg', 'Teach one strategy explicitly, and have them tick off the steps as they use it.', 'Performance phase · Zimmerman 2002'),
  move('m_after', 'reg', 'When the next mark comes back, ask what caused it and what they will change. Steer to strategy, not ability.', 'Self-reflection phase · Zimmerman 2002; Cleary, Callan and Zimmerman 2012'),
  move('m_low', null, 'Spend this meeting on the relationship and one small win. Do not try to fix four things at once.', 'Our rule of thumb · relationships (Roorda et al. 2011) and mastery (Usher and Pajares 2008)'),
  move('m_raise', null, 'Nothing is pinching, so raise the challenge: extension, acceleration or a real audience.', 'Acceleration · Steenbergen-Hu et al. 2016')
]);

export const PROFILES: Record<ProfileId, Profile> = {
  value: { id: 'value', name: 'Not seeing the point', line: 'The worth is not there for them yet, so effort has nothing to pull on.' },
  efficacy: { id: 'efficacy', name: 'Doubting they can', line: 'They may want it, but do not believe their effort will pay off here.' },
  env: { id: 'env', name: 'Not feeling backed', line: 'They do not trust the people or the setting to let them do well.' },
  reg: { id: 'reg', name: 'Willing, not yet organised', line: 'The reasons and the belief are there. The how is missing.' },
  flowing: { id: 'flowing', name: 'All flowing', line: 'Nothing is pinching. If results still lag, look at challenge and the task itself.' },
  low: { id: 'low', name: 'Low on every front', line: 'Start with the relationship and one small win, not all four at once.' }
};
export const PROFILE_IDS = Object.keys(PROFILES) as ProfileId[];

export const TAP_LABELS = ['Missing', 'Patchy', 'Mostly', 'Solid'];
export const TAP_POINTS = [1, 4, 7, 9];
export const CITE =
  'Achievement Orientation Model after Siegle and McCoach (2005) and Siegle, McCoach and Roberts (2017) · value types after Wigfield and Eccles (2000) · sources of self-efficacy after Bandura, reviewed by Usher and Pajares (2008) · phases after Zimmerman (2002). Your read, not a test score.';

export type Mode = 'quick' | 'full' | 'one';
export type Again = '2w' | '4w' | '6w' | 'none';
export type Values = Partial<Record<AreaId, number>>;

export interface AchievementState {
  context: string;
  mode: Mode;
  one: AreaId;
  theirOn: boolean;
  taps: Partial<Record<AreaId, Tap>>;
  quotes: Partial<Record<AreaId, string>>;
  digs: Record<AreaId, string[]>;
  forceDig: Partial<Record<AreaId, boolean>>;
  checks: { want?: 'yes' | 'no'; hold?: 'yes' | 'no' };
  /** The student's own rating, 1 to 5. */
  their: Partial<Record<AreaId, number>>;
  /** Your read, 0 to 10, once you move a slider; until then the suggestion stands. */
  values: Values;
  touched: Partial<Record<AreaId, boolean>>;
  profile: ProfileId | null;
  chosen: string[];
  next: string;
  again: Again;
  againDate: string | null;
}

export function emptyState(context = ''): AchievementState {
  return {
    context, mode: 'quick', one: 'value', theirOn: false, taps: {}, quotes: {},
    digs: { value: [], efficacy: [], env: [], reg: [] }, forceDig: {}, checks: {}, their: {},
    values: {}, touched: {}, profile: null, chosen: [], next: '', again: '4w', againDate: null
  };
}

export const askedAreas = (s: AchievementState): AreaId[] => (s.mode === 'one' ? [s.one] : AREA_IDS);
export const weakTap = (s: AchievementState, k: AreaId) => s.taps[k] != null && s.taps[k]! <= 1;
export function digOn(s: AchievementState, k: AreaId): boolean {
  if (s.mode === 'one') return true;
  if (s.mode === 'full') return weakTap(s, k) || !!s.forceDig[k];
  return !!s.forceDig[k];
}
/** Can't, or won't? Low belief can hide behind "it's pointless" (Covington's self-worth theory). */
export function checkOn(s: AchievementState): boolean {
  const asked = askedAreas(s);
  const both = asked.includes('value') && asked.includes('efficacy') && weakTap(s, 'value') && weakTap(s, 'efficacy');
  return both || (digOn(s, 'value') && s.digs.value.includes('cost'));
}

export type Step = 'context' | `gate:${AreaId}` | `dig:${AreaId}` | 'check' | 'their' | 'read' | 'plan';
export function path(s: AchievementState): Step[] {
  const out: Step[] = ['context'];
  for (const k of askedAreas(s)) {
    out.push(`gate:${k}`);
    if (digOn(s, k)) out.push(`dig:${k}`);
    if (k === 'efficacy' && checkOn(s)) out.push('check');
    if (k === 'value' && s.mode === 'one' && checkOn(s)) out.push('check');
  }
  if (s.theirOn) out.push('their');
  out.push('read', 'plan');
  return out;
}

export function suggested(s: AchievementState): Values {
  const v: Values = {};
  for (const k of askedAreas(s)) {
    const tap = s.taps[k];
    if (tap == null) continue;
    v[k] = TAP_POINTS[tap]!;
  }
  if (v.value != null && s.checks.want === 'yes') v.value = Math.min(10, v.value + 3);
  return v;
}

/** Your read: the suggestion for anything you have not moved. */
export function currentValues(s: AchievementState): Values {
  const sug = suggested(s);
  const out: Values = {};
  for (const k of askedAreas(s)) {
    const v = s.touched[k] && s.values[k] != null ? s.values[k] : sug[k];
    if (v != null) out[k] = v;
  }
  return out;
}

/** The weakest attitude below positive names the read; then self-regulation; else all flowing. */
export function profileFor(v: Values): ProfileId {
  const att = ATTITUDES.filter((k) => v[k] != null);
  const all = [...att, ...(v.reg != null ? (['reg'] as AreaId[]) : [])];
  if (!all.length) return 'low';
  if (all.length === 4 && all.every((k) => v[k]! < 5)) return 'low';
  const weak = att.filter((k) => v[k]! < 6).sort((a, b) => v[a]! - v[b]! || ATTITUDES.indexOf(a) - ATTITUDES.indexOf(b));
  if (weak.length) return weak[0]!;
  if (v.reg != null && v.reg < 6) return 'reg';
  return 'flowing';
}

export const leadArea = (p: ProfileId): AreaId | null => (p === 'flowing' || p === 'low' ? null : p);

export function movesFor(s: AchievementState, k: AreaId): string[] {
  const a = AREA[k];
  const fromDigs = (s.digs[k] ?? []).flatMap((d) => a.digs.find((x) => x.id === d)?.moves ?? []);
  return [...new Set([...fromDigs, ...a.base])];
}

export function leadMoves(s: AchievementState, p: ProfileId): string[] {
  const lead = leadArea(p);
  if (lead) return movesFor(s, lead);
  return p === 'low' ? ['m_low'] : ['m_raise'];
}

/** In Rubenstein et al. (2012), plans aimed at belief or self-management moved grades least. */
export const pairingAdvised = (p: ProfileId) => p === 'efficacy' || p === 'reg';

/** 1..5 onto 0..10. */
export const theirScaled = (r: number) => Math.round((r - 1) * 2.5);
export function mismatches(v: Values, their: Partial<Record<AreaId, number>>): AreaId[] {
  return AREA_IDS.filter((k) => v[k] != null && their[k] != null && Math.abs(theirScaled(their[k]!) - v[k]!) >= 3);
}

export function againDate(again: Again, from: Date): string | null {
  const weeks = again === '2w' ? 2 : again === '4w' ? 4 : again === '6w' ? 6 : 0;
  if (!weeks) return null;
  const d = new Date(from.getTime() + weeks * 7 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/* ---- Storage: an ordinary guide run, inside the server's shape limits ----
   checks (at most 12 short answers): d_<area> dig picks, want, hold, t_<area> their rating,
   q which areas the quotes came from in order (and "next" for their next step), again.
   quotes (at most 5): one per area they spoke to, then their next step.  */
const MAX_TEXT = 300;
export function toRun(s: AchievementState, base: Pick<GuideRun, 'id' | 'person_ref' | 'person_name' | 'created_at' | 'updated_at'>): GuideRun {
  const values = currentValues(s);
  const intValues: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) intValues[k] = Math.max(0, Math.min(10, Math.round(v!)));
  const profile = s.profile ?? profileFor(values);
  const checks: Record<string, string> = {};
  for (const k of AREA_IDS) if (digOn(s, k) && s.digs[k].length) checks[`d_${k}`] = s.digs[k].join(',');
  if (checkOn(s) && s.checks.want) checks.want = s.checks.want;
  if (checkOn(s) && s.checks.hold) checks.hold = s.checks.hold;
  if (s.theirOn) for (const k of AREA_IDS) if (s.their[k] != null) checks[`t_${k}`] = String(s.their[k]);
  const quotes: string[] = [];
  const from: string[] = [];
  for (const k of askedAreas(s)) {
    const text = (s.quotes[k] ?? '').trim().slice(0, MAX_TEXT);
    if (text) { quotes.push(text); from.push(k); }
  }
  const next = s.next.trim().slice(0, MAX_TEXT);
  if (next) { quotes.push(next); from.push('next'); }
  if (from.length) checks.q = from.join(',');
  if (s.againDate) checks.again = s.againDate;
  const taps: Record<string, Tap> = {};
  for (const k of askedAreas(s)) if (s.taps[k] != null) taps[k] = s.taps[k]!;
  return {
    ...base,
    guide: ACHIEVEMENT_ID,
    context: s.context.trim(),
    taps,
    quotes,
    checks,
    values: intValues,
    profile,
    moves: s.chosen.map((id) => MOVES[id]?.text).filter((t): t is string => !!t).slice(0, 5)
  };
}

export interface SavedView {
  values: Values;
  profile: ProfileId;
  quotes: Array<{ area: AreaId; text: string }>;
  next: string | null;
  againDate: string | null;
  their: Partial<Record<AreaId, number>>;
  digs: Partial<Record<AreaId, string[]>>;
  moveIds: string[];
}

/** What a saved run says, for the card and for editing. */
export function readRun(run: GuideRun): SavedView {
  const values: Values = {};
  for (const k of AREA_IDS) if (typeof run.values[k] === 'number') values[k] = run.values[k];
  const order = (run.checks.q ?? '').split(',').filter(Boolean);
  const quotes: Array<{ area: AreaId; text: string }> = [];
  let next: string | null = null;
  order.forEach((tag, i) => {
    const text = run.quotes[i];
    if (!text) return;
    if (tag === 'next') next = text;
    else if ((AREA_IDS as string[]).includes(tag)) quotes.push({ area: tag as AreaId, text });
  });
  const their: Partial<Record<AreaId, number>> = {};
  const digs: Partial<Record<AreaId, string[]>> = {};
  for (const k of AREA_IDS) {
    const t = Number(run.checks[`t_${k}`]);
    if (t >= 1 && t <= 5) their[k] = t;
    if (run.checks[`d_${k}`]) digs[k] = run.checks[`d_${k}`]!.split(',').filter(Boolean);
  }
  const profile = (PROFILE_IDS as string[]).includes(run.profile) ? (run.profile as ProfileId) : profileFor(values);
  const moveIds = run.moves.map((text) => Object.values(MOVES).find((m) => m.text === text)?.id).filter((id): id is string => !!id);
  return { values, profile, quotes, next, againDate: run.checks.again ?? null, their, digs, moveIds };
}

/** Reopen a saved run for editing: answers, read and plan as they were. */
export function stateFromRun(run: GuideRun): AchievementState {
  const view = readRun(run);
  const s = emptyState(run.context);
  const asked = AREA_IDS.filter((k) => view.values[k] != null);
  if (asked.length === 1) { s.mode = 'one'; s.one = asked[0]!; } else s.mode = 'full';
  for (const k of AREA_IDS) {
    if (run.taps[k] != null) s.taps[k] = run.taps[k] as Tap;
    if (view.values[k] != null) { s.values[k] = view.values[k]; s.touched[k] = true; }
    if (view.digs[k]) { s.digs[k] = view.digs[k]!; s.forceDig[k] = true; }
  }
  for (const q of view.quotes) s.quotes[q.area] = q.text;
  if (run.checks.want === 'yes' || run.checks.want === 'no') s.checks.want = run.checks.want;
  if (run.checks.hold === 'yes' || run.checks.hold === 'no') s.checks.hold = run.checks.hold;
  s.their = view.their;
  s.theirOn = Object.keys(view.their).length > 0;
  s.profile = view.profile === profileFor(view.values) ? null : view.profile;
  s.chosen = view.moveIds;
  s.next = view.next ?? '';
  s.againDate = view.againDate;
  s.again = view.againDate ? '4w' : 'none';
  return s;
}

/** The one line a saved card says about the stream picture, so it is never only a picture. */
export function readWords(v: Values, p: ProfileId): string {
  const lead = leadArea(p);
  const parts = AREA_IDS.filter((k) => v[k] != null).map((k) => `${AREA[k].short} ${v[k]}`);
  return `${lead ? `Narrowest: ${AREA[lead].short}` : PROFILES[p].name} · ${parts.join(', ')}`;
}

// The motivation guide: Self-Determination Theory's continuum (Ryan & Deci), asked the way the
// CRAI asks ("why do you…?", a reason per type), read as a mix, named with the four gifted
// profiles of McGregor, Jung & Evans (2025). Moves follow Vansteenkiste et al. (2018) on
// internalisation and autonomy support. Our wording throughout; Adam sets the final values.
import type { GuideDefinition, GuideProbe, GuideScale, GuideProfile, Tap, Values } from './types';

const TAP_POINTS = [0, 3, 6, 9] as const;
const STEP = 3;
const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));
const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;

export const LEAN_WEIGHTS: Record<string, number> = { external: -2, introjected: -1, identified: 1, integrated: 1, intrinsic: 2 };

const PROFILES: GuideProfile[] = [
  {
    // McGregor et al.: high self-determination
    id: 'own',
    name: 'Mostly their own reasons',
    line: 'Valuing and interest are leading, with little pressure.',
    moves: [
      'Keep the choice and challenge that are already working.',
      'Give feedback on progress itself, in place of praise or prizes.',
      'Hand over a decision about the next step.'
    ]
  },
  {
    // McGregor et al.: high self-determination with high motivation
    id: 'both',
    name: 'Driven both ways',
    line: 'Real ownership, with pressure running alongside it.',
    moves: [
      'Keep the reasons about growth and what they care about.',
      'Ease off reminders and checks, and see what they keep doing on their own.',
      'Ask what they want to get better at next.'
    ]
  },
  {
    // McGregor et al.: low self-determination with control
    id: 'control',
    name: 'Leaning on control',
    line: 'Pressure is doing more of the work than ownership.',
    moves: [
      'Link the task to a goal they named themselves.',
      'Name the dull part out loud before asking for the effort.',
      'Offer a choice of how, or in what order, to do it.'
    ]
  },
  {
    // McGregor et al.: low motivation
    id: 'low',
    name: 'Low on reasons',
    line: 'Little is pulling either way yet.',
    moves: [
      'Start with one small task they can succeed at.',
      'Ask what would make it worth doing, and listen before giving reasons.',
      'Spend time on the relationship: ask what they’re into outside this.'
    ]
  }
];

const byId = (id: string) => PROFILES.find((p) => p.id === id)!;

const SCALES: GuideScale[] = [
  { id: 'amotivation', label: 'Amotivation', zone: 'apart', tone: 'slate' },
  { id: 'external', label: 'External', zone: 'controlled', tone: 'clay-1' },
  { id: 'introjected', label: 'Introjected', zone: 'controlled', tone: 'clay-2' },
  { id: 'identified', label: 'Identified', zone: 'autonomous', tone: 'teal-1' },
  { id: 'integrated', label: 'Integrated', zone: 'autonomous', tone: 'teal-2' },
  { id: 'intrinsic', label: 'Intrinsic', zone: 'autonomous', tone: 'teal-3' }
];

const PROBES: GuideProbe[] = [
  {
    id: 'alone',
    ask: 'If nobody would ever know or check, would you still do it?',
    options: [
      { id: 'no', label: 'No, probably not', leans: 'introjected' },
      { id: 'yes', label: 'Yes, I would', leans: 'identified' }
    ]
  },
  {
    id: 'feel',
    ask: 'When you skip it, does it feel guilty or tense, or more like a missed chance?',
    options: [
      { id: 'guilty', label: 'Guilty or tense', leans: 'introjected' },
      { id: 'missed', label: 'A missed chance', leans: 'identified' }
    ]
  }
];

export const motivationSdt: GuideDefinition = {
  id: 'motivation_sdt',
  name: 'Motivation',
  line: 'Where the reasons sit, from controlled to their own. About 5 minutes.',
  minutes: 5,
  emblem:
    '<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="#1b2230"/>' +
    '<line x1="11" y1="22" x2="33" y2="22" stroke="#f7f4ec" stroke-width="1.6" stroke-dasharray="1.5 2.5" stroke-linecap="round"/>' +
    '<circle cx="11.5" cy="22" r="5" fill="none" stroke="#e08a5c" stroke-width="2.4"/>' +
    '<circle cx="32.5" cy="22" r="6" fill="#3d9c8f"/>' +
    '<path d="M26 17.5 L29.5 22 L26 26.5" fill="none" stroke="#f7f4ec" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cite: 'SDT continuum after Ryan & Deci · profiles after McGregor, Jung & Evans (2025) · moves after Vansteenkiste et al. (2018). Your read, not a test score.',
  scales: SCALES,
  prompts: [
    {
      scale: 'amotivation',
      ask: 'Why do you do it at all? What’s the point of it for you?',
      hint: 'Listen for no reason at all: drifting, shrugging, giving up.',
      listenFor: ['I don’t really know why.', 'I can’t see the point.', 'I just turn up.']
    },
    {
      scale: 'external',
      ask: 'What happens if it doesn’t get done?',
      hint: 'Listen for someone else’s rules, rewards or consequences.',
      listenFor: ['Mum makes me.', 'I’d get a detention.', 'So I don’t get in trouble.']
    },
    {
      scale: 'introjected',
      ask: 'When you do get it done, what’s going through your head?',
      hint: 'Listen for pressure carried inside: guilt, shame, wanting to look good.',
      listenFor: ['I’d feel bad if I didn’t.', 'I don’t want to look lazy.', 'I’d be embarrassed in front of the class.']
    },
    {
      scale: 'identified',
      ask: 'Is it useful to you? What does it help you do?',
      hint: 'Listen for a reason they own, even when it isn’t fun.',
      listenFor: ['It helps me get better.', 'It matters for what I want to do later.', 'I can see why it’s important.']
    },
    {
      scale: 'integrated',
      ask: 'Does it fit with who you are, or who you want to be?',
      hint: 'Listen for identity and values.',
      listenFor: ['It’s part of who I am.', 'That’s just what I do.', 'It fits with what I care about.']
    },
    {
      scale: 'intrinsic',
      ask: 'Is there any part of it you’d do just because you enjoy it?',
      hint: 'Listen for interest, curiosity and enjoyment.',
      listenFor: ['I just love it.', 'I lose track of time.', 'It’s fun working it out.']
    }
  ],
  probeTitle: 'Guilt, or genuinely valued?',
  probeHint: 'You heard both. These two are the hardest to tell apart, so check before you set the mix.',
  probes: PROBES,
  profiles: PROFILES,

  suggest(taps, checks) {
    const values: Values = {};
    for (const scale of SCALES) values[scale.id] = TAP_POINTS[(taps[scale.id] ?? 0) as Tap];
    let net = 0;
    for (const probe of PROBES) {
      const pick = probe.options.find((option) => option.id === checks[probe.id]);
      if (pick) net += pick.leans === 'identified' ? 1 : -1;
    }
    values.identified = clamp(values.identified + net * STEP);
    values.introjected = clamp(values.introjected - net * STEP);
    return values;
  },

  needsCheck(taps) {
    return (taps.introjected ?? 0) >= 1 && (taps.identified ?? 0) >= 1;
  },

  profileFor(values) {
    const v = (id: string) => values[id] ?? 0;
    const autonomous = mean([v('identified'), v('integrated'), v('intrinsic')]);
    const controlled = mean([v('external'), v('introjected')]);
    if (autonomous >= 5 && controlled >= 5) return byId('both');
    if (autonomous >= 5) return byId('own');
    if (controlled >= 5) return byId('control');
    return byId('low');
  },

  lean(values) {
    let raw = 0;
    for (const [id, weight] of Object.entries(LEAN_WEIGHTS)) raw += weight * (values[id] ?? 0);
    return Math.max(0, Math.min(1, 0.5 + raw / 80));
  }
};

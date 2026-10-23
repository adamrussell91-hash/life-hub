# Meeting Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Guides shelf to Professional meetings. Its first guide walks Adam through a motivation (SDT continuum) read of a tagged student and saves a drawn result card to the meeting, the student's profile and Clare's context.

**Architecture:**
- **Guides are data.** Each guide is a typed definition in `apps/professional/src/guides/`. A runner panel walks it, and a slim continuum chart draws it.
- **Runs live on the meeting.** They sit on the meeting record as `guide_runs`, the same way `decisions` does: validated server-side, patched with `updateMeeting`.
- **The profile reads them back.** It reads runs from `listMeetings()`, and Clare gets the context and moves of each run.

**Tech Stack:** TypeScript, Vite, vitest + happy-dom (`apps/professional/tests/unit`), node:test (`tests/unit/*.test.js`), Netlify functions (`.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-23-meeting-guides-design.md`. **Approved mockup:** `docs/mockups/meeting-guides/set.html`.

---

## Changes from the spec, decided while planning

1. **The chart is a slim Professional chart, not an import of Decision Maker's.** Decision Maker's `scales` renderer uses number boxes in horizontal rows and needs Problem Solver's run shape (`PsToolRun`, nodes, slots). The approved mockup needs drag handles, controlled/autonomous zones and a lean marker. So `continuum-chart.ts` is a small new renderer that keeps Decision Maker's ideas: drawn from data, the last saves overlaid with dates, and colours as tokens. This is the "slimmed down copy" Adam asked for.
2. **Runs are stored on the meeting record** (`guide_runs`) rather than in a new store. History comes from `listMeetings()`.
3. **The check shows when introjected and identified were both tapped at least "a bit".** The answers to both probes are netted, so mixed answers leave the suggestion as it is.
4. **A run can be edited at any time**, not only until the meeting closes.
5. **Clare gets the context and moves only**, never the profile name or the values. She cannot label what she is never given.
6. **No pronouns in product copy.** The tool can't know a student's pronouns, so copy says "they" or avoids pronouns ("Where the reasons sit"). The mockup's "he" was mock data only.

Update the spec with these six points in Task 11.

## Public repo rule

`life-hub` is public. Use invented names only in tests and fixtures (`Jonah Pereira`, `Sam Lee`). The guide text is our own wording with citations.

## File structure

| File | Responsibility |
|---|---|
| `netlify/functions/_shared/meeting-schema.mjs` (modify) | Store, validate and project `guide_runs` |
| `apps/professional/scripts/mock-api.ts` (modify) | Dev mock accepts `guide_runs` |
| `apps/professional/src/domain/types.ts` (modify) | `MeetingRecord.guide_runs` |
| `apps/professional/src/api/meetings.ts` (modify) | `updateMeeting` patch type |
| `apps/professional/src/guides/types.ts` (create) | Guide and run types |
| `apps/professional/src/guides/motivation-sdt.ts` (create) | The motivation guide: scales, prompts, probes, profiles, scoring |
| `apps/professional/src/guides/registry.ts` (create) | The shelf: list and lookup |
| `apps/professional/src/guides/runs.ts` (create) | Pure run helpers: new run, placing, history, contexts, note line, Clare digest |
| `apps/professional/src/guides/continuum-chart.ts` (create) | The drawn continuum, editable or read-only |
| `apps/professional/src/guides/guide-card.ts` (create) | The result card |
| `apps/professional/src/guides/guide-panel.ts` (create) | The side panel: shelf → about → context → prompts → check → mix → save |
| `apps/professional/src/components/motivation-strip.ts` (create) | Profile strip and timeline points |
| `apps/professional/src/views/meeting-page.ts` (modify) | Guides button, Guides section, note line, Clare context |
| `apps/professional/src/views/people.ts` (modify) | Motivation section, timeline points |
| `apps/professional/src/api/clare-comms.ts` (modify) | `ClareContext.guides` |
| `netlify/functions/_shared/clare-comms.mjs` (modify) | Guides in context text, house rule |
| `apps/professional/src/styles/guides.css` (create) + `apps/professional/src/app/main.ts` (modify) | Styles ported from the mockup |

---

### Task 1: `guide_runs` on the meeting record (server + client types)

**Files:**
- Modify: `netlify/functions/_shared/meeting-schema.mjs` (constants near line 15; `STORED_KEYS` ~line 112; `parseMeetingRecord` return ~line 195; `UPDATE_KEYS` and `validateMeetingFieldUpdate` ~lines 246–275; `projectMeeting` ~line 342)
- Modify: `apps/professional/scripts/mock-api.ts` (~lines 2215 and 2247)
- Modify: `apps/professional/src/domain/types.ts:368`
- Modify: `apps/professional/src/api/meetings.ts:51-62`
- Test: `tests/unit/meeting-event-schema.test.js`

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/meeting-event-schema.test.js`:

```js
test('meeting guide_runs: validated, bounded and kept on the record', () => {
  const run = {
    id: 'guide_1', guide: 'motivation_sdt', person_ref: 'shared:person:p_jonah', person_name: 'Jonah Pereira',
    context: '  English · essays ', taps: { introjected: 3, identified: 2 }, quotes: ['I’d feel bad if I didn’t.'],
    checks: { alone: 'yes' }, values: { amotivation: 1, external: 3, introjected: 7, identified: 5, integrated: 2, intrinsic: 2 },
    profile: 'control', moves: ['Link the task to a goal they named themselves.'],
    created_at: '2026-10-27T01:00:00.000Z', updated_at: '2026-10-27T01:05:00.000Z'
  };
  const patch = validateMeetingFieldUpdate({ guide_runs: [run] });
  assert.equal(patch.guide_runs[0].context, 'English · essays');
  assert.equal(patch.guide_runs[0].values.introjected, 7);
  assert.throws(() => validateMeetingFieldUpdate({ guide_runs: [{ ...run, context: '' }] }), { code: 'invalid_guide_runs' });
  assert.throws(() => validateMeetingFieldUpdate({ guide_runs: [{ ...run, values: { external: 11 } }] }), { code: 'invalid_guide_runs' });
  assert.throws(() => validateMeetingFieldUpdate({ guide_runs: [{ ...run, taps: { external: 4 } }] }), { code: 'invalid_guide_runs' });
  assert.throws(() => validateMeetingFieldUpdate({ guide_runs: Array.from({ length: 21 }, (_, i) => ({ ...run, id: `g${i}` })) }), { code: 'invalid_guide_runs' });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `node --test tests/unit/meeting-event-schema.test.js`
Expected: FAIL with `unknown_field` for `guide_runs`.

- [ ] **Step 3: Implement.** In `meeting-schema.mjs`:

After `export const DECISIONS_MAX = 50;` add:

```js
export const GUIDE_RUNS_MAX = 20;
```

After `validateDecisions` add:

```js
const shortText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function numberMap(value, min, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 12) return null;
  const out = {};
  for (const [key, n] of Object.entries(value)) {
    if (!Number.isInteger(n) || n < min || n > max) return null;
    out[shortText(key, 40)] = n;
  }
  return out;
}

/** Guide runs (Meeting Guides): Adam's structured reads of someone in the room. Shape only; guides own meaning. */
export function validateGuideRuns(value) {
  const fail = (why) => validationError('invalid_guide_runs', `guide_runs: ${why}`);
  if (!Array.isArray(value) || value.length > GUIDE_RUNS_MAX) throw fail(`an array of at most ${GUIDE_RUNS_MAX}.`);
  return value.map((run) => {
    if (!run || typeof run !== 'object') throw fail('each run is an object.');
    const id = shortText(run.id, 80);
    const context = shortText(run.context, 120);
    const values = numberMap(run.values, 0, 10);
    const taps = numberMap(run.taps ?? {}, 0, 3);
    if (!id || !context || !values || !taps) throw fail('id, context, values (0–10) and taps (0–3) are required.');
    const checks = {};
    for (const [key, answer] of Object.entries(run.checks && typeof run.checks === 'object' ? run.checks : {})) {
      if (typeof answer === 'string') checks[shortText(key, 40)] = shortText(answer, 40);
    }
    return {
      id,
      guide: shortText(run.guide, 40),
      person_ref: shortText(run.person_ref, 200),
      person_name: shortText(run.person_name, 200),
      context,
      taps,
      quotes: (Array.isArray(run.quotes) ? run.quotes : []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 5).map((q) => shortText(q, 300)),
      checks,
      values,
      profile: shortText(run.profile, 60),
      moves: (Array.isArray(run.moves) ? run.moves : []).filter((m) => typeof m === 'string' && m.trim()).slice(0, 5).map((m) => shortText(m, 300)),
      created_at: shortText(run.created_at, 40),
      updated_at: shortText(run.updated_at, 40)
    };
  });
}
```

Add `'guide_runs'` to `STORED_KEYS` (after `'decisions'`) and to `UPDATE_KEYS`. In `parseMeetingRecord`'s returned object, after `decisions`, add:

```js
    guide_runs: Array.isArray(raw.guide_runs) ? raw.guide_runs : []
```

In `validateMeetingFieldUpdate`, after the `decisions` line, add:

```js
  if (input.guide_runs !== undefined) patch.guide_runs = validateGuideRuns(input.guide_runs);
```

In `projectMeeting`, after `decisions: record.decisions ?? []`, add `guide_runs: record.guide_runs ?? []` (mind the comma).

In `apps/professional/scripts/mock-api.ts`, add `guide_runs: [] as unknown[],` under `decisions: [] as unknown[],`. Add `'guide_runs'` to the PATCH key list `['title', 'location_text', 'agenda', 'notes', 'purpose', 'blocks', 'decisions']`.

In `apps/professional/src/domain/types.ts`, add at the top `import type { GuideRun } from '@/guides/types';`. Under `decisions?: MeetingDecision[];` add:

```ts
  guide_runs?: GuideRun[];
```

In `apps/professional/src/api/meetings.ts`, add `import type { GuideRun } from '@/guides/types';`. Add `guide_runs?: GuideRun[];` to the `updateMeeting` patch type after `decisions?: MeetingDecision[];`.

Create the types file now, because the client imports it. Its full content is in Task 2, Step 3; write that file in this step.

- [ ] **Step 4: Run the test.**

Run: `node --test tests/unit/meeting-event-schema.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit.**

```bash
git add netlify/functions/_shared/meeting-schema.mjs tests/unit/meeting-event-schema.test.js apps/professional/scripts/mock-api.ts apps/professional/src/domain/types.ts apps/professional/src/api/meetings.ts apps/professional/src/guides/types.ts
git commit -m "Professional: meetings keep guide runs (Meeting Guides)"
```

---

### Task 2: The motivation guide (definition and scoring)

**Files:**
- Create: `apps/professional/src/guides/types.ts` (if not already written in Task 1)
- Create: `apps/professional/src/guides/motivation-sdt.ts`
- Test: `apps/professional/tests/unit/guides-motivation.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { LEAN_WEIGHTS, motivationSdt } from '@/guides/motivation-sdt';

const g = motivationSdt;

describe('motivation guide', () => {
  it('has six scales in continuum order and a prompt for each', () => {
    expect(g.scales.map((s) => s.id)).toEqual(['amotivation', 'external', 'introjected', 'identified', 'integrated', 'intrinsic']);
    expect(g.prompts.map((p) => p.scale)).toEqual(g.scales.map((s) => s.id));
    for (const p of g.prompts) expect(p.listenFor.length).toBeGreaterThanOrEqual(2);
  });

  it('suggests 0, 3, 6 or 9 from the taps', () => {
    const v = g.suggest({ amotivation: 0, external: 1, introjected: 3, identified: 2, integrated: 0, intrinsic: 1 }, {});
    expect(v).toEqual({ amotivation: 0, external: 3, introjected: 9, identified: 6, integrated: 0, intrinsic: 3 });
  });

  it('checks only when introjected and identified were both heard', () => {
    expect(g.needsCheck({ introjected: 1, identified: 1 })).toBe(true);
    expect(g.needsCheck({ introjected: 3, identified: 0 })).toBe(false);
    expect(g.needsCheck({})).toBe(false);
  });

  it('nets the probe answers: agreeing answers move 3 points each, mixed answers cancel', () => {
    const taps = { introjected: 2, identified: 2 } as const;
    expect(g.suggest(taps, { alone: 'yes', feel: 'missed' })).toMatchObject({ introjected: 0, identified: 10 });
    expect(g.suggest(taps, { alone: 'no', feel: 'guilty' })).toMatchObject({ introjected: 10, identified: 0 });
    expect(g.suggest(taps, { alone: 'yes', feel: 'guilty' })).toMatchObject({ introjected: 6, identified: 6 });
  });

  it('names the profile from the autonomous and controlled means', () => {
    expect(g.profileFor({ external: 3, introjected: 7, identified: 5, integrated: 2, intrinsic: 2 }).id).toBe('control');
    expect(g.profileFor({ external: 1, introjected: 2, identified: 7, integrated: 6, intrinsic: 8 }).id).toBe('own');
    expect(g.profileFor({ external: 6, introjected: 7, identified: 7, integrated: 6, intrinsic: 6 }).id).toBe('both');
    expect(g.profileFor({ amotivation: 8, external: 1, introjected: 1, identified: 1, integrated: 0, intrinsic: 1 }).id).toBe('low');
  });

  it('leans from 0 (controlled) to 1 (autonomous), even at 0.5, amotivation left out', () => {
    expect(LEAN_WEIGHTS).toEqual({ external: -2, introjected: -1, identified: 1, integrated: 1, intrinsic: 2 });
    expect(g.lean({})).toBe(0.5);
    expect(g.lean({ amotivation: 10 })).toBe(0.5);
    expect(g.lean({ external: 10, introjected: 10 })).toBe(0.125);
    expect(g.lean({ intrinsic: 10, identified: 10, integrated: 10 })).toBe(1);
  });

  it('writes moves in can-do words and never names a type', () => {
    const words = /\b(not|never|without|rather than|amotivat|external|introject|identified|integrated|intrinsic)\b/i;
    for (const profile of g.profiles) {
      expect(profile.moves.length).toBeGreaterThanOrEqual(2);
      for (const move of profile.moves) expect(move).not.toMatch(words);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-motivation.test.ts --root apps/professional`
Expected: FAIL, cannot resolve `@/guides/motivation-sdt`.

- [ ] **Step 3: Implement.** `apps/professional/src/guides/types.ts`:

```ts
/** Meeting Guides: a guide is data; a run is one structured read of one person in one context. */
export type Tap = 0 | 1 | 2 | 3;
export type Values = Record<string, number>;

export interface GuideRun {
  id: string;
  guide: string;
  person_ref: string;
  person_name: string;
  /** Free text: "English · essays". */
  context: string;
  taps: Record<string, Tap>;
  quotes: string[];
  checks: Record<string, string>;
  /** Adam's final call per scale, 0–10. Only saved values are kept. */
  values: Values;
  profile: string;
  moves: string[];
  created_at: string;
  updated_at: string;
}

export type Zone = 'apart' | 'controlled' | 'autonomous';

export interface GuideScale {
  id: string;
  label: string;
  zone: Zone;
  /** CSS tone key: `guide-tone--<tone>`. */
  tone: string;
}

export interface GuidePrompt {
  scale: string;
  ask: string;
  hint: string;
  listenFor: string[];
}

export interface GuideProbe {
  id: string;
  ask: string;
  options: Array<{ id: string; label: string; leans: 'introjected' | 'identified' }>;
}

export interface GuideProfile {
  id: string;
  name: string;
  line: string;
  moves: string[];
}

export interface GuideDefinition {
  id: string;
  name: string;
  line: string;
  minutes: number;
  /** Static SVG markup for the emblem (a constant, never user text). */
  emblem: string;
  cite: string;
  scales: GuideScale[];
  prompts: GuidePrompt[];
  probes: GuideProbe[];
  probeTitle: string;
  probeHint: string;
  profiles: GuideProfile[];
  suggest(taps: Partial<Record<string, Tap>>, checks: Record<string, string>): Values;
  needsCheck(taps: Partial<Record<string, Tap>>): boolean;
  profileFor(values: Values): GuideProfile;
  /** 0 = fully controlled, 1 = fully autonomous. */
  lean(values: Values): number;
}
```

`apps/professional/src/guides/motivation-sdt.ts`:

```ts
// The motivation guide: Self-Determination Theory's continuum (Ryan & Deci), asked the way the
// CRAI asks ("why do you…?", a reason per type), read as a mix, named with the four gifted
// profiles of McGregor, Jung & Evans (2025). Moves follow Vansteenkiste et al. (2018) on
// internalisation and autonomy support. Our wording throughout; Adam sets the final values.
import type { GuideDefinition, GuideProfile, Tap, Values } from './types';

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
  scales: [
    { id: 'amotivation', label: 'Amotivation', zone: 'apart', tone: 'slate' },
    { id: 'external', label: 'External', zone: 'controlled', tone: 'clay-1' },
    { id: 'introjected', label: 'Introjected', zone: 'controlled', tone: 'clay-2' },
    { id: 'identified', label: 'Identified', zone: 'autonomous', tone: 'teal-1' },
    { id: 'integrated', label: 'Integrated', zone: 'autonomous', tone: 'teal-2' },
    { id: 'intrinsic', label: 'Intrinsic', zone: 'autonomous', tone: 'teal-3' }
  ],
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
  probes: [
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
  ],
  profiles: PROFILES,

  suggest(taps, checks) {
    const values: Values = {};
    for (const scale of this.scales) values[scale.id] = TAP_POINTS[(taps[scale.id] ?? 0) as Tap];
    let net = 0;
    for (const probe of this.probes) {
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
```

Check the arithmetic against the tests:
- With taps introjected 2 and identified 2 (6 and 6), "yes" plus "missed" gives net +2. Identified goes to 6 + 6 = 12, clamped to 10. Introjected goes to 6 − 6 = 0.
- For the lean with external 10 and introjected 10: raw = −30, so 0.5 − 0.375 = 0.125.
- With intrinsic, identified and integrated at 10: raw = 40, so the lean is 1.

The "own" moves avoid the deficit words the test bans ("in place of" is allowed). The banned list: not, never, without, rather than, and the type names. Re-read every move against it before you run the test.

- [ ] **Step 4: Run the test.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-motivation.test.ts --root apps/professional`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/professional/src/guides apps/professional/tests/unit/guides-motivation.test.ts
git commit -m "Professional: the motivation guide (SDT continuum, CRAI-style asks, profiles, moves)"
```

---

### Task 3: Registry and run helpers

**Files:**
- Create: `apps/professional/src/guides/registry.ts`
- Create: `apps/professional/src/guides/runs.ts`
- Test: `apps/professional/tests/unit/guides-runs.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { GUIDES, guideById } from '@/guides/registry';
import { guideDigest, historyFor, newRun, noteLine, placeRuns, recentContexts, runsFor } from '@/guides/runs';
import type { GuideRun } from '@/guides/types';
import type { MeetingRecord } from '@/domain/types';

const run = (over: Partial<GuideRun>): GuideRun => ({
  id: 'g1', guide: 'motivation_sdt', person_ref: 'shared:person:p_jonah', person_name: 'Jonah Pereira', context: 'English · essays',
  taps: {}, quotes: [], checks: {}, values: { introjected: 7 }, profile: 'control', moves: ['Offer a choice of how, or in what order, to do it.'],
  created_at: '2026-10-27T01:00:00.000Z', updated_at: '2026-10-27T01:00:00.000Z', ...over
});
const meeting = (id: string, title: string, runs: GuideRun[]) => ({ id, title, guide_runs: runs }) as unknown as MeetingRecord;

describe('guide runs', () => {
  it('the shelf starts with the motivation guide', () => {
    expect(GUIDES.map((g) => g.id)).toEqual(['motivation_sdt']);
    expect(guideById('motivation_sdt')?.name).toBe('Motivation');
    expect(guideById('nope')).toBeNull();
  });

  it('newRun starts empty for one person and context', () => {
    const r = newRun({ guide: 'motivation_sdt', personRef: 'shared:person:p_sam', personName: 'Sam Lee', context: ' Maths ', now: '2026-10-27T00:00:00.000Z', id: 'g9' });
    expect(r).toMatchObject({ id: 'g9', context: 'Maths', taps: {}, values: {}, quotes: [], created_at: '2026-10-27T00:00:00.000Z' });
  });

  it('places runs on their meetings and finds a person by ref or by name', () => {
    const placed = placeRuns([
      meeting('m1', 'Check-in', [run({ id: 'a' })]),
      meeting('m2', 'Debate catch-up', [run({ id: 'b', person_ref: 'shared:person:blob-copy', context: 'Debating', created_at: '2026-08-12T00:00:00.000Z' })]),
      meeting('m3', 'Other', [run({ id: 'c', person_ref: 'shared:person:p_sam', person_name: 'Sam Lee' })])
    ]);
    const mine = runsFor(placed, 'shared:person:p_jonah', 'Jonah Pereira');
    expect(mine.map((p) => [p.run.id, p.meetingId])).toEqual([['a', 'm1'], ['b', 'm2']]);
  });

  it('history: same guide and context, older than this run, newest first, two at most', () => {
    const placed = placeRuns([meeting('m', 'x', [
      run({ id: 'now', created_at: '2026-10-27T00:00:00.000Z' }),
      run({ id: 'aug', created_at: '2026-08-04T00:00:00.000Z', values: { introjected: 6 } }),
      run({ id: 'jun', created_at: '2026-06-01T00:00:00.000Z' }),
      run({ id: 'may', created_at: '2026-05-01T00:00:00.000Z' }),
      run({ id: 'other', context: 'maths', created_at: '2026-09-01T00:00:00.000Z' })
    ])]);
    const current = placed[0]!.run;
    expect(historyFor(placed, current).map((h) => h.at)).toEqual(['2026-08-04T00:00:00.000Z', '2026-06-01T00:00:00.000Z']);
    expect(historyFor(placed, run({ id: 'x', context: 'ENGLISH · ESSAYS', created_at: '2026-12-01T00:00:00.000Z' }))[0]!.values).toEqual({ introjected: 7 });
  });

  it('recent contexts: unique, newest first, five at most', () => {
    const placed = placeRuns([meeting('m', 'x', [
      run({ id: '1', context: 'English', created_at: '2026-10-01T00:00:00.000Z' }),
      run({ id: '2', context: 'english', created_at: '2026-09-01T00:00:00.000Z' }),
      run({ id: '3', context: 'Maths', created_at: '2026-10-05T00:00:00.000Z' })
    ])]);
    expect(recentContexts(placed)).toEqual(['Maths', 'English']);
  });

  it('note line and Clare digest carry context and moves, never the profile or values', () => {
    const r = run({});
    expect(noteLine(r)).toBe('Motivation guide · English · essays · see card');
    const digest = guideDigest([r]);
    expect(digest).toEqual([{ about: 'Jonah Pereira', guide: 'Motivation', context: 'English · essays', moves: r.moves }]);
    expect(JSON.stringify(digest)).not.toMatch(/control|introjected|7/);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-runs.test.ts --root apps/professional`
Expected: FAIL, cannot resolve `@/guides/registry`.

- [ ] **Step 3: Implement.** `apps/professional/src/guides/registry.ts`:

```ts
import { motivationSdt } from './motivation-sdt';
import type { GuideDefinition } from './types';

/** The shelf, in order. Add a guide here and it appears in every meeting. */
export const GUIDES: GuideDefinition[] = [motivationSdt];

export function guideById(id: string): GuideDefinition | null {
  return GUIDES.find((guide) => guide.id === id) ?? null;
}
```

`apps/professional/src/guides/runs.ts`:

```ts
import type { MeetingRecord } from '@/domain/types';
import { nameKey } from '@/lib/room';
import { guideById } from './registry';
import type { GuideRun, Values } from './types';

export type PlacedRun = { run: GuideRun; meetingId: string; meetingTitle: string };

const newest = (a: { run: GuideRun }, b: { run: GuideRun }) => Date.parse(b.run.created_at) - Date.parse(a.run.created_at);

export function newRun(input: { guide: string; personRef: string; personName: string; context: string; now: string; id: string }): GuideRun {
  return {
    id: input.id,
    guide: input.guide,
    person_ref: input.personRef,
    person_name: input.personName,
    context: input.context.trim(),
    taps: {},
    quotes: [],
    checks: {},
    values: {},
    profile: '',
    moves: [],
    created_at: input.now,
    updated_at: input.now
  };
}

export function sameContext(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** Every run on every meeting, newest first. */
export function placeRuns(meetings: MeetingRecord[]): PlacedRun[] {
  return meetings
    .flatMap((meeting) => (meeting.guide_runs ?? []).map((run) => ({ run, meetingId: meeting.id, meetingTitle: meeting.title })))
    .sort(newest);
}

/** Runs about one person: by ref, or by name (an imported student's Blob copy has its own ref). */
export function runsFor(placed: PlacedRun[], ref: string, name: string | null): PlacedRun[] {
  const key = name ? nameKey(name) : '';
  return placed.filter(({ run }) => run.person_ref === ref || (key !== '' && nameKey(run.person_name) === key));
}

/** Earlier runs of the same guide and context, newest first: what the card overlays. */
export function historyFor(placed: PlacedRun[], run: GuideRun, count = 2): Array<{ at: string; values: Values }> {
  const at = Date.parse(run.created_at);
  return runsFor(placed, run.person_ref, run.person_name)
    .filter(({ run: other }) => other.id !== run.id && other.guide === run.guide && sameContext(other.context, run.context) && Date.parse(other.created_at) < at)
    .slice(0, count)
    .map(({ run: other }) => ({ at: other.created_at, values: other.values }));
}

export function recentContexts(placed: PlacedRun[], count = 5): string[] {
  const out: string[] = [];
  for (const { run } of placed) {
    if (!out.some((context) => sameContext(context, run.context))) out.push(run.context);
    if (out.length === count) break;
  }
  return out;
}

export function noteLine(run: GuideRun): string {
  return `${guideById(run.guide)?.name ?? 'Guide'} guide · ${run.context} · see card`;
}

/** What Clare may see: who, which guide, the context and the moves. Never the profile or values. */
export function guideDigest(runs: GuideRun[]): Array<{ about: string; guide: string; context: string; moves: string[] }> {
  return runs.map((run) => ({ about: run.person_name, guide: guideById(run.guide)?.name ?? 'Guide', context: run.context, moves: run.moves }));
}
```

In `recentContexts` the input is already newest first. The test feeds runs out of order, so sort a copy first: replace `for (const { run } of placed)` with `for (const { run } of [...placed].sort(newest))`.

- [ ] **Step 4: Run the test.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-runs.test.ts --root apps/professional`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/professional/src/guides apps/professional/tests/unit/guides-runs.test.ts
git commit -m "Professional: guide shelf registry and run helpers (history, contexts, Clare digest)"
```

---

### Task 4: The continuum chart

**Files:**
- Create: `apps/professional/src/guides/continuum-chart.ts`
- Test: `apps/professional/tests/unit/guides-chart.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createContinuumChart } from '@/guides/continuum-chart';
import { motivationSdt as g } from '@/guides/motivation-sdt';

const values = { amotivation: 1, external: 3, introjected: 7, identified: 5, integrated: 2, intrinsic: 2 };

describe('continuum chart', () => {
  it('draws a bar per scale at its value, inside its zone', () => {
    const chart = createContinuumChart(document, { scales: g.scales, values, lean: g.lean });
    const bars = [...chart.el.querySelectorAll<HTMLElement>('.guide-chart__bar')];
    expect(bars.map((b) => b.style.height)).toEqual(['10%', '30%', '70%', '50%', '20%', '20%']);
    expect(chart.el.querySelector('[data-scale="introjected"]')?.getAttribute('data-zone')).toBe('controlled');
    expect(chart.el.querySelectorAll('[role="slider"]').length).toBe(0);
  });

  it('places the lean pin from the guide’s lean', () => {
    const chart = createContinuumChart(document, { scales: g.scales, values: {}, lean: g.lean });
    expect((chart.el.querySelector('.guide-lean__pin') as HTMLElement).style.left).toBe('50%');
  });

  it('overlays history as dashed ghosts and a dated legend', () => {
    const chart = createContinuumChart(document, {
      scales: g.scales, values, lean: g.lean,
      history: [{ at: '2026-08-04T00:00:00.000Z', values: { external: 6 } }]
    });
    expect(chart.el.querySelectorAll('.guide-chart__ghost').length).toBe(6);
    expect(chart.el.querySelector('[data-scale="external"] .guide-chart__ghost')?.getAttribute('style')).toContain('60%');
    expect(chart.el.querySelector('.guide-legend')?.textContent).toContain('4 Aug');
  });

  it('editable: sliders move with keys and pointer, and report every change', () => {
    const onChange = vi.fn();
    const chart = createContinuumChart(document, { scales: g.scales, values, suggested: values, lean: g.lean, editable: true, onChange });
    const col = chart.el.querySelector<HTMLElement>('[data-scale="identified"]')!;
    expect(col.getAttribute('role')).toBe('slider');
    col.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(chart.values().identified).toBe(6);
    expect(col.getAttribute('aria-valuenow')).toBe('6');
    col.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(chart.values().identified).toBe(10);
    col.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100, left: 0, right: 40, width: 40, x: 0, y: 0, toJSON: () => ({}) });
    col.dispatchEvent(new PointerEvent('pointerdown', { clientY: 80, bubbles: true }));
    expect(chart.values().identified).toBe(2);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ identified: 2 }));
    expect(chart.el.querySelectorAll('.guide-chart__sugg').length).toBe(6);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-chart.test.ts --root apps/professional`
Expected: FAIL, cannot resolve `@/guides/continuum-chart`.

- [ ] **Step 3: Implement.** `apps/professional/src/guides/continuum-chart.ts`:

```ts
// The continuum: one bar per scale (0–10) over its zone, a lean pin under it, earlier saves as
// dashed ghosts. Read-only on the card; editable (drag or arrow keys) when Adam sets the mix.
// Drawn from data like Decision Maker's charts; colours are `guide-tone--*` tokens in guides.css.
import type { GuideScale, Values } from './types';

export interface ContinuumOptions {
  scales: GuideScale[];
  values: Values;
  lean: (values: Values) => number;
  suggested?: Values | null;
  history?: Array<{ at: string; values: Values }>;
  editable?: boolean;
  onChange?: (values: Values) => void;
}

export interface ContinuumChart {
  el: HTMLElement;
  values(): Values;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (at: string): string => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));

export function createContinuumChart(doc: Document, options: ContinuumOptions): ContinuumChart {
  const div = (className: string, text?: string) => {
    const node = doc.createElement('div');
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const values: Values = {};
  for (const scale of options.scales) values[scale.id] = clamp(options.values[scale.id] ?? 0);
  const history = (options.history ?? []).slice(0, 2);

  const root = div('guide-chart-wrap');
  const chart = div('guide-chart');
  const zones = div('guide-chart__zones');
  const zoneNames = div('guide-chart__zone-names');
  for (const zone of ['apart', 'controlled', 'autonomous'] as const) {
    const span = options.scales.filter((s) => s.zone === zone).length;
    const z = div(`guide-chart__zone guide-chart__zone--${zone}`);
    z.style.flexGrow = String(span);
    zones.append(z);
    const name = div('guide-chart__zone-name', zone === 'apart' ? '' : zone === 'controlled' ? 'Controlled' : 'Autonomous');
    name.style.flexGrow = String(span);
    zoneNames.append(name);
  }
  const bars = div('guide-chart__bars');
  const names = div('guide-chart__names');
  const barEls = new Map<string, HTMLElement>();
  const cols = new Map<string, HTMLElement>();

  for (const scale of options.scales) {
    const col = div('guide-chart__col');
    col.dataset.scale = scale.id;
    col.dataset.zone = scale.zone;
    history.forEach((h, i) => {
      const ghost = div(`guide-chart__ghost${i ? ' guide-chart__ghost--older' : ''}`);
      ghost.style.height = `${clamp(h.values[scale.id] ?? 0) * 10}%`;
      col.append(ghost);
    });
    if (options.suggested) {
      const sugg = div('guide-chart__sugg');
      sugg.style.bottom = `${clamp(options.suggested[scale.id] ?? 0) * 10}%`;
      col.append(sugg);
    }
    const bar = div(`guide-chart__bar guide-tone--${scale.tone}`);
    if (options.editable) {
      bar.append(div('guide-chart__handle'));
      col.setAttribute('role', 'slider');
      col.tabIndex = 0;
      col.setAttribute('aria-label', scale.label);
      col.setAttribute('aria-valuemin', '0');
      col.setAttribute('aria-valuemax', '10');
      col.addEventListener('keydown', (event) => {
        const step: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
        if (event.key in step) set(scale.id, values[scale.id]! + step[event.key]!);
        else if (event.key === 'Home') set(scale.id, 0);
        else if (event.key === 'End') set(scale.id, 10);
        else return;
        event.preventDefault();
      });
      const fromPointer = (event: PointerEvent) => {
        const rect = col.getBoundingClientRect();
        if (rect.height > 0) set(scale.id, ((rect.bottom - event.clientY) / rect.height) * 10);
      };
      col.addEventListener('pointerdown', (event) => {
        col.setPointerCapture?.(event.pointerId);
        fromPointer(event);
        const move = (e: PointerEvent) => fromPointer(e);
        const up = () => {
          col.removeEventListener('pointermove', move);
          col.removeEventListener('pointerup', up);
          col.removeEventListener('pointercancel', up);
        };
        col.addEventListener('pointermove', move);
        col.addEventListener('pointerup', up);
        col.addEventListener('pointercancel', up);
      });
    }
    col.append(bar);
    bars.append(col);
    names.append(div('guide-chart__name', scale.label));
    barEls.set(scale.id, bar);
    cols.set(scale.id, col);
  }
  chart.append(zones, zoneNames, bars);

  const lean = div('guide-lean');
  const track = div('guide-lean__track');
  if (history[0]) {
    const then = div('guide-lean__pin guide-lean__pin--then');
    then.style.left = `${Math.round(options.lean(history[0].values) * 100)}%`;
    track.append(then);
  }
  const pin = div('guide-lean__pin');
  track.append(pin);
  const ends = div('guide-lean__ends');
  ends.append(div('guide-lean__end guide-lean__end--controlled', 'Controlled'), div('guide-lean__end guide-lean__end--autonomous', 'Autonomous'));
  lean.append(track, ends);

  root.append(chart, names, lean);

  if (history.length || options.suggested) {
    const legend = div('guide-legend');
    if (options.suggested) legend.append(div('guide-legend__item guide-legend__item--sugg', 'Suggested from your taps'));
    legend.append(div('guide-legend__item guide-legend__item--now', options.suggested ? 'Your call' : 'Now'));
    for (const h of history) legend.append(div('guide-legend__item guide-legend__item--then', shortDate(h.at)));
    root.append(legend);
  }

  function paint(): void {
    for (const scale of options.scales) {
      barEls.get(scale.id)!.style.height = `${values[scale.id]! * 10}%`;
      if (options.editable) cols.get(scale.id)!.setAttribute('aria-valuenow', String(values[scale.id]));
    }
    pin.style.left = `${Math.round(options.lean(values) * 100)}%`;
  }

  function set(id: string, value: number): void {
    const next = clamp(value);
    if (next === values[id]) return;
    values[id] = next;
    paint();
    options.onChange?.({ ...values });
  }

  paint();
  return { el: root, values: () => ({ ...values }) };
}
```

In the pointer test, `clientY: 80` on a 0–100 column gives (100 − 80) / 100 × 10 = 2. In the zone test, `data-zone` sits on the column, as the test expects.

- [ ] **Step 4: Run the test.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-chart.test.ts --root apps/professional`
Expected: PASS (4 tests). If happy-dom lacks `PointerEvent`, construct it as `new MouseEvent('pointerdown', …)` cast to `PointerEvent` in the test, and keep the listener as is.

- [ ] **Step 5: Commit.**

```bash
git add apps/professional/src/guides/continuum-chart.ts apps/professional/tests/unit/guides-chart.test.ts
git commit -m "Professional: continuum chart for guides (zones, lean, history ghosts, drag and keys)"
```

---

### Task 5: The result card

**Files:**
- Create: `apps/professional/src/guides/guide-card.ts`
- Test: `apps/professional/tests/unit/guides-card.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderGuideCard } from '@/guides/guide-card';
import { motivationSdt as g } from '@/guides/motivation-sdt';
import type { GuideRun } from '@/guides/types';

const run: GuideRun = {
  id: 'g1', guide: 'motivation_sdt', person_ref: 'shared:person:p_jonah', person_name: 'Jonah Pereira', context: 'English · essays',
  taps: {}, quotes: ['I’d feel bad if Mum saw it wasn’t done.'], checks: {},
  values: { amotivation: 1, external: 3, introjected: 7, identified: 5, integrated: 2, intrinsic: 2 },
  profile: 'control', moves: g.profiles.find((p) => p.id === 'control')!.moves,
  created_at: '2026-10-27T01:00:00.000Z', updated_at: '2026-10-27T01:00:00.000Z'
};

describe('guide card', () => {
  it('shows the guide, context, profile, chart, moves, words and citation', () => {
    const card = renderGuideCard(document, { guide: g, run, history: [] });
    expect(card.querySelector('.guide-card__kicker')?.textContent).toBe('Motivation guide · 27 Oct');
    expect(card.querySelector('.guide-card__title')?.textContent).toBe('English · essays');
    expect(card.querySelector('.guide-card__pname')?.textContent).toBe('Leaning on control');
    expect(card.querySelectorAll('.guide-chart__bar').length).toBe(6);
    expect([...card.querySelectorAll('.guide-card__moves li')].map((li) => li.textContent)).toEqual(run.moves);
    expect(card.querySelector('.guide-card__words blockquote')?.textContent).toBe(run.quotes[0]);
    expect(card.querySelector('.guide-card__cite')?.textContent).toContain('Your read');
    expect(card.dataset.run).toBe('g1');
  });

  it('Edit and Change call back; no buttons without handlers', () => {
    const onEdit = vi.fn();
    const onProfile = vi.fn();
    const card = renderGuideCard(document, { guide: g, run, history: [], onEdit, onProfile });
    (card.querySelector('[data-part="guide-edit"]') as HTMLButtonElement).click();
    expect(onEdit).toHaveBeenCalled();
    const select = card.querySelector('select') as HTMLSelectElement;
    select.value = 'own';
    select.dispatchEvent(new Event('change'));
    expect(onProfile).toHaveBeenCalledWith('own');
    const bare = renderGuideCard(document, { guide: g, run, history: [] });
    expect(bare.querySelector('[data-part="guide-edit"]')).toBeNull();
    expect(bare.querySelector('select')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-card.test.ts --root apps/professional`
Expected: FAIL, cannot resolve `@/guides/guide-card`.

- [ ] **Step 3: Implement.** `apps/professional/src/guides/guide-card.ts`:

```ts
import { createContinuumChart, shortDate } from './continuum-chart';
import type { GuideDefinition, GuideRun, Values } from './types';

export function emblemEl(doc: Document, guide: GuideDefinition): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'guide-emblem';
  span.innerHTML = guide.emblem; // a constant in the guide definition, never user text
  return span;
}

export function renderGuideCard(
  doc: Document,
  input: {
    guide: GuideDefinition;
    run: GuideRun;
    history: Array<{ at: string; values: Values }>;
    onEdit?: () => void;
    onProfile?: (profileId: string) => void;
  }
): HTMLElement {
  const { guide, run } = input;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const card = el('article', 'guide-card guide');
  card.dataset.run = run.id;

  const head = el('div', 'guide-card__head');
  const titles = el('div');
  titles.append(el('div', 'guide-card__kicker', `${guide.name} guide · ${shortDate(run.created_at)}`), el('div', 'guide-card__title', run.context));
  head.append(emblemEl(doc, guide), titles);
  if (input.onEdit) {
    const edit = el('button', 'btn btn--ghost guide-card__edit', 'Edit');
    edit.type = 'button';
    edit.dataset.part = 'guide-edit';
    edit.addEventListener('click', () => input.onEdit!());
    head.append(edit);
  }

  const profile = guide.profiles.find((p) => p.id === run.profile) ?? guide.profileFor(run.values);
  const profileRow = el('div', 'guide-card__profile');
  const words = el('div');
  words.append(el('div', 'guide-card__pname', profile.name), el('div', 'guide-card__pline', profile.line));
  profileRow.append(words);
  if (input.onProfile) {
    const select = el('select', 'guide-card__pick');
    select.setAttribute('aria-label', 'Change the profile');
    for (const p of guide.profiles) {
      const option = el('option', undefined, p.name);
      option.value = p.id;
      option.selected = p.id === profile.id;
      select.append(option);
    }
    select.addEventListener('change', () => input.onProfile!(select.value));
    profileRow.append(select);
  }

  const chart = createContinuumChart(doc, { scales: guide.scales, values: run.values, lean: (v) => guide.lean(v), history: input.history });

  const moves = el('section', 'guide-card__moves');
  moves.append(el('h4', undefined, 'Suggested moves'));
  const list = el('ol');
  for (const move of run.moves) list.append(el('li', undefined, move));
  moves.append(list);

  card.append(head, profileRow, chart.el, moves);
  if (run.quotes.length) {
    const said = el('section', 'guide-card__words');
    said.append(el('h4', undefined, 'In their words'));
    for (const quote of run.quotes.slice(0, 3)) said.append(el('blockquote', undefined, quote));
    card.append(said);
  }
  card.append(el('p', 'guide-card__cite', guide.cite));
  return card;
}
```

The kicker is "Motivation guide · 27 Oct": `shortDate` reads the UTC date, and 01:00Z on 27 Oct is still 27 Oct.

- [ ] **Step 4: Run the test.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-card.test.ts --root apps/professional`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/professional/src/guides/guide-card.ts apps/professional/tests/unit/guides-card.test.ts
git commit -m "Professional: guide result card (profile, continuum, moves, words, citation)"
```

---

### Task 6: The guide panel (runner)

**Files:**
- Create: `apps/professional/src/guides/guide-panel.ts`
- Test: `apps/professional/tests/unit/guides-panel.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openGuidePanel } from '@/guides/guide-panel';
import { GUIDES } from '@/guides/registry';
import type { GuideRun } from '@/guides/types';

const click = (root: ParentNode, selector: string) => (root.querySelector(selector) as HTMLElement).click();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function open(about = [{ ref: 'shared:person:p_jonah', name: 'Jonah Pereira' }]) {
  const onSave = vi.fn(async (_run: GuideRun) => {});
  const panel = openGuidePanel(document, {
    guides: GUIDES, about, onSave,
    placedRuns: async () => [],
    now: () => '2026-10-27T01:00:00.000Z', newId: () => 'guide_t1'
  });
  return { panel, onSave, root: panel.el };
}

afterEach(() => document.body.replaceChildren());

async function toPrompts(root: HTMLElement) {
  click(root, '[data-guide="motivation_sdt"]');
  await flush();
  const input = root.querySelector('input[name="context"]') as HTMLInputElement;
  input.value = 'English · essays';
  input.dispatchEvent(new Event('input'));
  click(root, '[data-part="guide-start"]');
}

describe('guide panel', () => {
  it('walks context → six prompts → check → mix, and saves only on Save', async () => {
    const { root, onSave } = open();
    await toPrompts(root);
    const taps = [0, 1, 3, 2, 0, 1];
    for (const tap of taps) {
      expect(root.querySelector('.guide-prompt__ask')).not.toBeNull();
      click(root, `[data-tap="${tap}"]`);
      click(root, '[data-part="guide-next"]');
    }
    expect(root.querySelector('.guide-check')).not.toBeNull();
    click(root, '[data-probe="alone"][data-option="yes"]');
    click(root, '[data-probe="feel"][data-option="guilty"]');
    click(root, '[data-part="guide-next"]');
    expect(root.querySelectorAll('[role="slider"]').length).toBe(6);
    expect(onSave).not.toHaveBeenCalled();
    click(root, '[data-part="guide-save"]');
    await flush();
    const run = onSave.mock.calls[0]![0];
    expect(run).toMatchObject({ id: 'guide_t1', guide: 'motivation_sdt', person_ref: 'shared:person:p_jonah', context: 'English · essays' });
    expect(run.values).toEqual({ amotivation: 0, external: 3, introjected: 9, identified: 6, integrated: 0, intrinsic: 3 });
    expect(run.checks).toEqual({ alone: 'yes', feel: 'guilty' });
    expect(run.profile).toBe('control');
    expect(run.moves.length).toBe(3);
    expect(document.body.contains(root)).toBe(false);
  });

  it('skips the check when it is not needed, and keeps a quote', async () => {
    const { root, onSave } = open();
    await toPrompts(root);
    for (let i = 0; i < 6; i++) {
      click(root, `[data-tap="${i === 1 ? 3 : 0}"]`);
      if (i === 1) {
        const quote = root.querySelector('input[name="quote"]') as HTMLInputElement;
        quote.value = 'Mum makes me.';
        quote.dispatchEvent(new Event('input'));
      }
      click(root, '[data-part="guide-next"]');
    }
    expect(root.querySelector('.guide-check')).toBeNull();
    click(root, '[data-part="guide-save"]');
    await flush();
    expect(onSave.mock.calls[0]![0].quotes).toEqual(['Mum makes me.']);
  });

  it('asks who it is about when several are in the room; explains when nobody is', async () => {
    const two = open([{ ref: 'a', name: 'Jonah Pereira' }, { ref: 'b', name: 'Sam Lee' }]);
    click(two.root, '[data-guide="motivation_sdt"]');
    await flush();
    expect(two.root.querySelectorAll('[data-about]').length).toBe(2);
    two.panel.close();
    const none = open([]);
    expect(none.root.textContent).toContain('Add them to In the room first');
    expect(none.root.querySelector('[data-guide]')?.hasAttribute('disabled')).toBe(true);
  });

  it('Start waits for a context; ✕ closes without saving', async () => {
    const { root, onSave, panel } = open();
    click(root, '[data-guide="motivation_sdt"]');
    await flush();
    expect((root.querySelector('[data-part="guide-start"]') as HTMLButtonElement).disabled).toBe(true);
    click(root, '[data-part="guide-close"]');
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.contains(panel.el)).toBe(false);
  });
});
```

Check the expected values in the first test:
- Taps amotivation 0, external 1, introjected 3, identified 2, integrated 0, intrinsic 1 give 0, 3, 9, 6, 0, 3.
- The probe answers "yes" and "guilty" net to 0, so the suggestion is unchanged.
- Profile: autonomous mean (6 + 0 + 3) / 3 = 3, controlled mean (3 + 9) / 2 = 6, so `control`.

- [ ] **Step 2: Run it to see it fail.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-panel.test.ts --root apps/professional`
Expected: FAIL, cannot resolve `@/guides/guide-panel`.

- [ ] **Step 3: Implement.** `apps/professional/src/guides/guide-panel.ts`:

```ts
// The Guides side panel: shelf → (who) → context → one card per prompt → check (when needed) →
// set the mix → Save. Adam drives; nothing is kept until Save. Full screen on a phone (guides.css).
import { createContinuumChart, type ContinuumChart } from './continuum-chart';
import { emblemEl } from './guide-card';
import { historyFor, newRun, recentContexts, runsFor, type PlacedRun } from './runs';
import type { GuideDefinition, GuideRun, Tap } from './types';

export interface GuidePanelOptions {
  guides: GuideDefinition[];
  /** People this run can be about: students in the room first (the caller decides). */
  about: Array<{ ref: string; name: string }>;
  placedRuns: () => Promise<PlacedRun[]>;
  onSave: (run: GuideRun) => Promise<void>;
  /** Editing a saved run opens straight on the mix. */
  edit?: { guide: GuideDefinition; run: GuideRun };
  now?: () => string;
  newId?: () => string;
}

const TAP_LABELS = ['Not at all', 'A bit', 'Quite a lot', 'Very much'];

export function openGuidePanel(doc: Document, options: GuidePanelOptions): { el: HTMLElement; close(): void } {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => `guide_${crypto.randomUUID()}`);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, className: string, part?: string) => {
    const b = el('button', className, label);
    b.type = 'button';
    if (part) b.dataset.part = part;
    return b;
  };

  const panel = el('aside', 'guide-panel guide');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Guides');
  const head = el('div', 'guide-panel__head');
  const closeBtn = button('✕', 'btn btn--ghost', 'guide-close');
  closeBtn.setAttribute('aria-label', 'Close guides');
  head.append(el('b', undefined, 'Guides'), closeBtn);
  const body = el('div', 'guide-panel__body');
  panel.append(head, body);
  doc.body.append(panel);

  let guide: GuideDefinition | null = null;
  let who: { ref: string; name: string } | null = null;
  let run: GuideRun | null = null;
  let placed: PlacedRun[] = [];
  let chart: ContinuumChart | null = null;
  /** Quotes typed on each prompt card, by prompt index; saved runs being edited seed from 100 up. */
  const quoteByPrompt = new Map<number, string>();

  function close(): void {
    panel.remove();
    doc.removeEventListener('keydown', onKey);
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  doc.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', close);

  function top(subtitle: string): HTMLElement {
    const row = el('div', 'guide-step__top');
    const text = el('div');
    text.append(el('div', 'guide-step__title', guide!.name), el('div', 'guide-step__who', subtitle));
    row.append(emblemEl(doc, guide!), text);
    return row;
  }

  function progress(at: number): HTMLElement {
    const total = guide!.prompts.length + 3; // context, prompts, check, mix
    const bar = el('div', 'guide-progress');
    for (let i = 0; i < total; i++) bar.append(el('i', i < at ? 'is-done' : i === at ? 'is-now' : undefined));
    return bar;
  }

  function shelf(): void {
    body.replaceChildren();
    if (!options.about.length) {
      body.append(el('p', 'guide-panel__empty', 'Add them to In the room first, then run a guide about them.'));
    } else if (options.about.length === 1) {
      body.append(el('p', 'guide-panel__about', `About ${options.about[0]!.name}`));
    }
    for (const g of options.guides) {
      const card = button('', 'guide-shelf-card');
      card.dataset.guide = g.id;
      card.disabled = !options.about.length;
      const words = el('div');
      words.append(el('b', undefined, g.name), el('span', undefined, g.line));
      card.append(emblemEl(doc, g), words);
      card.addEventListener('click', async () => {
        guide = g;
        placed = await options.placedRuns().catch(() => []);
        if (options.about.length === 1) {
          who = options.about[0]!;
          context();
        } else {
          pickWho();
        }
      });
      body.append(card);
    }
  }

  function pickWho(): void {
    body.replaceChildren(top('Who is this about?'));
    for (const person of options.about) {
      const b = button(person.name, 'guide-about');
      b.dataset.about = person.ref;
      b.addEventListener('click', () => {
        who = person;
        context();
      });
      body.append(b);
    }
  }

  function context(): void {
    body.replaceChildren(top(`About ${who!.name}`), progress(0));
    const card = el('div', 'guide-prompt');
    card.append(el('div', 'guide-prompt__ask', 'What’s this about?'), el('div', 'guide-hint', 'One area at a time. Run it again for another.'));
    const input = el('input', 'guide-input');
    input.name = 'context';
    input.placeholder = 'English · essays';
    input.setAttribute('aria-label', 'What this is about');
    card.append(input);
    const used = recentContexts(runsFor(placed, who!.ref, who!.name).filter((p) => p.run.guide === guide!.id));
    if (used.length) {
      card.append(el('div', 'guide-hint', `Used before with ${who!.name}`));
      const chips = el('div', 'guide-chips');
      for (const c of used) {
        const chip = button(c, 'guide-chip');
        chip.addEventListener('click', () => {
          input.value = c;
          input.dispatchEvent(new Event('input'));
        });
        chips.append(chip);
      }
      card.append(chips);
    }
    const start = button('Start ›', 'btn btn--primary', 'guide-start');
    start.disabled = true;
    input.addEventListener('input', () => {
      start.disabled = !input.value.trim();
    });
    start.addEventListener('click', () => {
      run = newRun({ guide: guide!.id, personRef: who!.ref, personName: who!.name, context: input.value, now: now(), id: newId() });
      prompt(0);
    });
    const nav = el('div', 'guide-nav');
    const cancel = button('Cancel', 'btn btn--ghost');
    cancel.addEventListener('click', close);
    nav.append(cancel, start);
    body.append(card, el('p', 'guide-hint', 'Ask each question in your own words, then set the mix yourself.'), nav);
    input.focus();
  }

  function prompt(index: number): void {
    const p = guide!.prompts[index]!;
    const scale = guide!.scales.find((s) => s.id === p.scale)!;
    body.replaceChildren(top(`${who!.name} · ${run!.context}`), progress(index + 1));
    const card = el('div', `guide-prompt guide-zone--${scale.zone}`);
    card.append(
      el('span', 'guide-type', `${index + 1} of ${guide!.prompts.length} · ${scale.label}`),
      el('div', 'guide-prompt__ask', `“${p.ask}”`),
      el('div', 'guide-hint', p.hint),
      el('div', 'guide-listen__h', 'Sounds like')
    );
    const list = el('ul', 'guide-listen');
    for (const line of p.listenFor) list.append(el('li', undefined, `“${line}”`));
    card.append(list);

    const taps = el('div', 'guide-taps');
    const paintTaps = () => {
      for (const b of taps.querySelectorAll<HTMLButtonElement>('[data-tap]')) {
        const on = run!.taps[p.scale] === Number(b.dataset.tap);
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      next.disabled = run!.taps[p.scale] === undefined;
    };
    TAP_LABELS.forEach((label, tap) => {
      const b = button(label, 'guide-tap');
      b.dataset.tap = String(tap);
      b.addEventListener('click', () => {
        run!.taps[p.scale] = tap as Tap;
        paintTaps();
      });
      taps.append(b);
    });

    const quote = el('input', 'guide-input guide-quote');
    quote.name = 'quote';
    quote.placeholder = '❝ In their words (optional)';
    quote.setAttribute('aria-label', 'In their words');
    quote.value = quoteByPrompt.get(index) ?? '';
    quote.addEventListener('input', () => {
      quoteByPrompt.set(index, quote.value);
      run!.quotes = [...quoteByPrompt.values()].map((q) => q.trim()).filter(Boolean);
    });

    const nav = el('div', 'guide-nav');
    const back = button('‹ Back', 'btn btn--ghost');
    back.addEventListener('click', () => (index ? prompt(index - 1) : context()));
    const next = button('Next ›', 'btn btn--primary', 'guide-next');
    next.addEventListener('click', () => {
      if (index + 1 < guide!.prompts.length) prompt(index + 1);
      else if (guide!.needsCheck(run!.taps)) check();
      else mix();
    });
    nav.append(back, next);
    body.append(card, taps, quote, nav);
    paintTaps();
  }

  function check(): void {
    body.replaceChildren(top(`${who!.name} · ${run!.context}`), progress(guide!.prompts.length + 1));
    const card = el('div', 'guide-check');
    card.append(el('span', 'guide-type guide-type--both', 'Getting the call right'), el('h4', undefined, guide!.probeTitle), el('div', 'guide-hint', guide!.probeHint));
    for (const probe of guide!.probes) {
      const block = el('div', 'guide-probe');
      block.append(el('p', undefined, `“${probe.ask}”`));
      const two = el('div', 'guide-two');
      for (const option of probe.options) {
        const b = button(option.label, `guide-tap guide-tap--${option.leans}`);
        b.dataset.probe = probe.id;
        b.dataset.option = option.id;
        b.addEventListener('click', () => {
          run!.checks[probe.id] = option.id;
          for (const sib of two.querySelectorAll<HTMLButtonElement>('button')) sib.classList.toggle('is-on', sib === b);
        });
        two.append(b);
      }
      block.append(two);
      card.append(block);
    }
    const nav = el('div', 'guide-nav');
    const skip = button('Skip', 'btn btn--ghost');
    skip.addEventListener('click', () => {
      run!.checks = {};
      mix();
    });
    const next = button('Set the mix ›', 'btn btn--primary', 'guide-next');
    next.addEventListener('click', mix);
    nav.append(skip, next);
    body.append(card, nav);
  }

  function mix(): void {
    const suggested = guide!.suggest(run!.taps, run!.checks);
    const start = options.edit ? run!.values : suggested;
    body.replaceChildren(top(`${who!.name} · ${run!.context}`), progress(guide!.prompts.length + 2));
    body.append(el('p', 'guide-hint', 'Dotted lines are suggested from your taps. Drag each bar to your call. Only what you save is kept.'));
    chart = createContinuumChart(doc, {
      scales: guide!.scales, values: start, suggested, lean: (v) => guide!.lean(v), editable: true,
      history: historyFor(placed, run!)
    });
    const nav = el('div', 'guide-nav');
    const back = button('‹ Back', 'btn btn--ghost');
    back.addEventListener('click', () => (guide!.needsCheck(run!.taps) ? check() : prompt(guide!.prompts.length - 1)));
    const save = button(options.edit ? 'Save changes' : 'Save to meeting', 'btn btn--primary', 'guide-save');
    save.addEventListener('click', async () => {
      save.disabled = true;
      const values = chart!.values();
      const profile = guide!.profileFor(values);
      const final: GuideRun = { ...run!, values, profile: profile.id, moves: profile.moves, updated_at: now() };
      try {
        await options.onSave(final);
        close();
      } catch {
        save.disabled = false;
        body.append(el('p', 'guide-panel__error', 'Could not save. Try again.'));
      }
    });
    nav.append(back, save);
    body.append(chart.el, nav);
  }

  if (options.edit) {
    guide = options.edit.guide;
    run = { ...options.edit.run, taps: { ...options.edit.run.taps }, checks: { ...options.edit.run.checks } };
    who = { ref: run.person_ref, name: run.person_name };
    run.quotes.forEach((q, i) => quoteByPrompt.set(100 + i, q));
    void options.placedRuns().catch(() => []).then((list) => {
      placed = list;
      mix();
    });
  } else {
    shelf();
  }
  return { el: panel, close };
}
```

- [ ] **Step 4: Run the test.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/guides-panel.test.ts --root apps/professional`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the Professional typecheck.**

Run: `npm --prefix apps/professional run typecheck`
Expected: no errors in `src/guides/`.

- [ ] **Step 6: Commit.**

```bash
git add apps/professional/src/guides/guide-panel.ts apps/professional/tests/unit/guides-panel.test.ts
git commit -m "Professional: Guides side panel (shelf, who, context, prompts, check, set the mix, save)"
```

---

### Task 7: Wire guides into the meeting page

**Files:**
- Modify: `apps/professional/src/views/meeting-page.ts` (imports at top; `clareContext` ~line 177; `paintDuring`/`paintAfter` ~lines 538–553; `liveStrip` ~lines 640–705)
- Test: `apps/professional/tests/unit/meeting-page.test.ts`

- [ ] **Step 1: Write the failing test.** In `meeting-page.test.ts`, add `listMeetings: vi.fn(async () => ({ meetings: [] }))` to the existing `vi.mock('@/api/meetings', …)` factory. Then add inside `describe('meeting page', …)`:

```ts
  it('Guides: the live strip opens the shelf about the people in the room, and the Guides section is on the page', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-part="guides"]')).not.toBeNull();
    expect(canvas.querySelector('[data-part="run-guide"]')).not.toBeNull();
    (canvas.querySelector('[data-part="open-guides"]') as HTMLButtonElement).click();
    const panel = document.querySelector('.guide-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    // Nobody in this fixture is a student, so everyone in the room (you excluded) can be chosen.
    expect(panel.querySelector('[data-guide="motivation_sdt"]')?.hasAttribute('disabled')).toBe(false);
  });
```

`render()` is the harness already in the file (it mounts during the meeting, because the fake clock sits inside the meeting's time). The block-page mock has no `append`; this test never saves, so it doesn't need one. Add a second test for saving that calls the exported `saveGuideRun` helper (Step 3) directly:

```ts
  it('saveGuideRun stores the run and returns the note line only the first time', async () => {
    const { saveGuideRun } = await import('@/views/meeting-page');
    const run = { id: 'g1', guide: 'motivation_sdt', person_ref: 'shared:person:ben', person_name: 'Ben C.', context: 'Treasury', taps: {}, quotes: [], checks: {}, values: {}, profile: 'low', moves: [], created_at: '', updated_at: '' };
    const first = saveGuideRun([], run);
    expect(first.runs).toEqual([run]);
    expect(first.note).toBe('Motivation guide · Treasury · see card');
    const again = saveGuideRun(first.runs, { ...run, context: 'Treasury' });
    expect(again.runs.length).toBe(1);
    expect(again.note).toBeNull();
  });
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/meeting-page.test.ts --root apps/professional`
Expected: FAIL, no `open-guides` button and no `saveGuideRun` export.

- [ ] **Step 3: Implement.** Add imports to `meeting-page.ts`:

```ts
import { listMeetings } from '@/api/meetings';
import { GUIDES, guideById } from '@/guides/registry';
import { openGuidePanel } from '@/guides/guide-panel';
import { renderGuideCard } from '@/guides/guide-card';
import { guideDigest, historyFor, noteLine, placeRuns, type PlacedRun } from '@/guides/runs';
import type { GuideRun } from '@/guides/types';
import { directoryRowFor, indexDirectory } from '@/lib/room';
```

Merge `listMeetings` into the existing `@/api/meetings` import, and `directoryRowFor`/`indexDirectory` into the existing `@/lib/room` import.

Add a top-level exported pure helper under `isOpenState`:

```ts
/** A run saved to the meeting: replace by id, else add. The note line is for the first save only. */
export function saveGuideRun(runs: GuideRun[], run: GuideRun): { runs: GuideRun[]; note: string | null } {
  const first = !runs.some((r) => r.id === run.id);
  return { runs: first ? [...runs, run] : runs.map((r) => (r.id === run.id ? run : r)), note: first ? noteLine(run) : null };
}
```

Change `clareContext`'s `extra` to:

```ts
    extra: { time_zone: record.time_zone, guides: guideDigest(record.guide_runs ?? []) }
```

Inside `renderMeetingPage`, after `const mentions = …` (~line 531), add:

```ts
  const guidesHost = el('section', 'card meeting-guides');
  guidesHost.dataset.part = 'guides';
  let placedCache: Promise<PlacedRun[]> | null = null;
  const placed = () => (placedCache ??= listMeetings().then((r) => placeRuns(r.meetings)).catch(() => placeRuns([record])));

  function aboutCandidates(): Array<{ ref: string; name: string }> {
    const { byRef, byName } = indexDirectory(directory);
    const all = attendees.map((a) => ({ ref: a.ref, name: a.name, student: directoryRowFor(a, byRef, byName)?.person_type === 'student' }));
    const students = all.filter((p) => p.student);
    return (students.length ? students : all).map(({ ref, name }) => ({ ref, name }));
  }

  async function storeGuideRun(run: GuideRun): Promise<void> {
    const { runs, note } = saveGuideRun(record.guide_runs ?? [], run);
    record = (await updateMeeting(id, { guide_runs: runs })).meeting;
    placedCache = null;
    if (note && blockPage) {
      const html = `<p><em>${note.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]!)}</em></p>`;
      blockPage.append([{ id: `guide_note_${run.id}`, block_type: 'rich_text', variant: 'medium', content: { html } }]);
    }
    await paintGuides();
  }

  function openGuides(edit?: GuideRun): void {
    const guide = edit ? guideById(edit.guide) : null;
    openGuidePanel(document, {
      guides: GUIDES,
      about: aboutCandidates(),
      placedRuns: placed,
      onSave: storeGuideRun,
      edit: edit && guide ? { guide, run: edit } : undefined
    });
  }

  async function paintGuides(): Promise<void> {
    const runs = record.guide_runs ?? [];
    const head = el('div', 'meeting-guides__head');
    const run = el('button', 'btn btn--secondary', '◐ Run a guide') as HTMLButtonElement;
    run.type = 'button';
    run.dataset.part = 'run-guide';
    run.addEventListener('click', () => openGuides());
    head.append(el('h3', undefined, 'Guides'), run);
    guidesHost.replaceChildren(head);
    if (!runs.length) {
      guidesHost.append(el('p', 'muted', 'Structured reads you run with someone in the room land here.'));
      return;
    }
    const all = await placed();
    for (const saved of runs) {
      const guide = guideById(saved.guide);
      if (!guide) continue;
      guidesHost.append(renderGuideCard(document, {
        guide,
        run: saved,
        history: historyFor(all, saved),
        onEdit: () => openGuides(saved),
        onProfile: (profileId) => {
          const profile = guide.profiles.find((p) => p.id === profileId);
          if (profile) void storeGuideRun({ ...saved, profile: profile.id, moves: profile.moves, updated_at: new Date().toISOString() });
        }
      }));
    }
  }
```

In `paintDuring`, append `guidesHost` after the notes card: `main.append(liveStrip(), notesCard(...), guidesHost, actions, mentions);`. Then call `void paintGuides();`. In `paintAfter`, insert `guidesHost` after the notes card in the same way and call `void paintGuides();`.

In `liveStrip`, before `strip.append(…)`, add:

```ts
    const guidesBtn = el('button', 'btn btn--ghost', '◐ Guides') as HTMLButtonElement;
    guidesBtn.type = 'button';
    guidesBtn.dataset.part = 'open-guides';
    guidesBtn.addEventListener('click', () => openGuides());
```

Then change the append to `strip.append(el('span', 'live-strip__rec', 'Live'), timer, photo, guidesBtn, end);`.

- [ ] **Step 4: Run the meeting page tests.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/meeting-page.test.ts --root apps/professional`
Expected: PASS, including every existing test.

- [ ] **Step 5: Commit.**

```bash
git add apps/professional/src/views/meeting-page.ts apps/professional/tests/unit/meeting-page.test.ts
git commit -m "Professional: Guides on the meeting page (strip button, Guides section, note line, Clare digest)"
```

---

### Task 8: Clare reads guides as moves

**Files:**
- Modify: `apps/professional/src/api/clare-comms.ts:3-17`
- Modify: `netlify/functions/_shared/clare-comms.mjs` (`HOUSE` lines 4–11, `contextText` lines 27–35)
- Test: `tests/unit/clare-comms.test.js`

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/clare-comms.test.js`:

```js
test('guides reach Clare as context and moves, with a house rule against labels', async () => {
  const { complete, calls } = fake({ summary: 'Next, link the essay to a goal they named.', promises: [], numbers: [] });
  const withGuides = { ...ctx, guides: [{ about: 'Alex J.', guide: 'Motivation', context: 'English · essays', moves: ['Link the task to a goal they named themselves.'] }] };
  await generateSummary(withGuides, { complete });
  assert.match(calls[0].system, /Never name a motivation type or profile/);
  const sent = JSON.parse(calls[0].content[0].text);
  assert.deepEqual(sent.guides, [{ about: 'Alex J.', guide: 'Motivation', context: 'English · essays', moves: ['Link the task to a goal they named themselves.'] }]);
});
```

`fake(reply)` and `ctx` are already defined near the top of the file; `fake` returns `{ calls, complete }`.

- [ ] **Step 2: Run it to see it fail.**

Run: `node --test tests/unit/clare-comms.test.js`
Expected: FAIL, no house rule and `guides` undefined.

- [ ] **Step 3: Implement.** In `clare-comms.mjs`, add a line to `HOUSE`, before `'Reply with one JSON object only, no prose around it.'`:

```js
  'Guides (context.guides) are Adam’s own structured read of someone in the room. Use their moves as suggested next steps for that context, in can-do wording. Never name a motivation type or profile, never describe a student as a type, and never mention scores.',
```

In `contextText`, add after `summary: ctx.summary ?? null`:

```js
    , guides: (Array.isArray(ctx.guides) ? ctx.guides : []).slice(0, 5).map((g) => ({
      about: line(g?.about, 120), guide: line(g?.guide, 60), context: line(g?.context, 120),
      moves: (Array.isArray(g?.moves) ? g.moves : []).slice(0, 5).map((m) => line(m, 300)).filter(Boolean)
    }))
```

(Put the comma after `summary: ctx.summary ?? null`, not as a leading comma.)

In `apps/professional/src/api/clare-comms.ts`, add to `ClareContext`:

```ts
  guides?: Array<{ about: string; guide: string; context: string; moves: string[] }>;
```

- [ ] **Step 4: Run the tests.**

Run: `node --test tests/unit/clare-comms.test.js`
Expected: PASS, all tests (the existing system-prompt assertions still match).

- [ ] **Step 5: Commit.**

```bash
git add netlify/functions/_shared/clare-comms.mjs apps/professional/src/api/clare-comms.ts tests/unit/clare-comms.test.js
git commit -m "Clare: guide moves in meeting context; never names a motivation type"
```

---

### Task 9: Motivation on the student's profile

**Files:**
- Create: `apps/professional/src/components/motivation-strip.ts`
- Modify: `apps/professional/src/views/people.ts` (imports; `mountPaneSkeleton` after the Remember section ~line 1380; `loadPersonSections` ~lines 807–1145)
- Test: `apps/professional/tests/unit/motivation-strip.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { guideTimelinePoints, latestPerContext, renderMotivationStrip } from '@/components/motivation-strip';
import type { PlacedRun } from '@/guides/runs';

const placed = (id: string, context: string, at: string, meetingId = 'm1'): PlacedRun => ({
  meetingId, meetingTitle: 'Check-in',
  run: { id, guide: 'motivation_sdt', person_ref: 'shared:person:p', person_name: 'Jonah Pereira', context, taps: {}, quotes: [], checks: {},
    values: { external: 3, introjected: 7, identified: 5 }, profile: 'control', moves: [], created_at: at, updated_at: at }
});

const list = [
  placed('a', 'English · essays', '2026-10-27T00:00:00.000Z', 'm9'),
  placed('b', 'english · essays', '2026-08-04T00:00:00.000Z'),
  placed('c', 'Debating', '2026-08-12T00:00:00.000Z')
];

describe('motivation strip', () => {
  it('keeps the latest run per context and counts the rest', () => {
    expect(latestPerContext(list).map((e) => [e.latest.run.id, e.count])).toEqual([['a', 2], ['c', 1]]);
  });

  it('draws a mini card per context that links to its meeting', () => {
    const host = document.createElement('div');
    renderMotivationStrip(host, list);
    const cards = host.querySelectorAll<HTMLAnchorElement>('a.guide-mini');
    expect(cards.length).toBe(2);
    expect(cards[0]!.getAttribute('href')).toBe('#/meeting/m9');
    expect(cards[0]!.textContent).toContain('27 Oct · 2 runs');
    expect(cards[0]!.querySelectorAll('.guide-mini__bar').length).toBe(6);
  });

  it('gives the timeline one point per run', () => {
    expect(guideTimelinePoints(list).map((p) => p.label)).toEqual([
      '◐ Motivation guide · English · essays', '◐ Motivation guide · english · essays', '◐ Motivation guide · Debating'
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/motivation-strip.test.ts --root apps/professional`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Implement.** `apps/professional/src/components/motivation-strip.ts`:

```ts
import { meetingRoute } from '@/app/router';
import type { TimelinePoint } from '@/domain/person-timeline';
import { shortDate } from '@/guides/continuum-chart';
import { guideById } from '@/guides/registry';
import { sameContext, type PlacedRun } from '@/guides/runs';

/** Newest run per context (input newest first or not), with how many runs that context has. */
export function latestPerContext(placed: PlacedRun[]): Array<{ latest: PlacedRun; count: number }> {
  const sorted = [...placed].sort((a, b) => Date.parse(b.run.created_at) - Date.parse(a.run.created_at));
  const out: Array<{ latest: PlacedRun; count: number }> = [];
  for (const entry of sorted) {
    const hit = out.find((o) => sameContext(o.latest.run.context, entry.run.context));
    if (hit) hit.count += 1;
    else out.push({ latest: entry, count: 1 });
  }
  return out;
}

export function renderMotivationStrip(host: HTMLElement, placed: PlacedRun[]): void {
  host.replaceChildren();
  const strip = document.createElement('div');
  strip.className = 'guide-mstrip guide';
  for (const { latest, count } of latestPerContext(placed.filter((p) => p.run.guide === 'motivation_sdt'))) {
    const guide = guideById(latest.run.guide)!;
    const card = document.createElement('a');
    card.className = 'guide-mini';
    card.href = meetingRoute(latest.meetingId);
    const title = document.createElement('b');
    title.textContent = latest.run.context;
    const when = document.createElement('div');
    when.className = 'guide-mini__when';
    when.textContent = `${shortDate(latest.run.created_at)} · ${count} run${count === 1 ? '' : 's'}`;
    const spark = document.createElement('div');
    spark.className = 'guide-mini__spark';
    for (const scale of guide.scales) {
      const bar = document.createElement('i');
      bar.className = `guide-mini__bar guide-tone--${scale.tone}`;
      bar.style.height = `${Math.max(4, (latest.run.values[scale.id] ?? 0) * 10)}%`;
      spark.append(bar);
    }
    const track = document.createElement('div');
    track.className = 'guide-lean__track guide-lean__track--mini';
    const pin = document.createElement('span');
    pin.className = 'guide-lean__pin';
    pin.style.left = `${Math.round(guide.lean(latest.run.values) * 100)}%`;
    track.append(pin);
    card.append(title, when, spark, track);
    strip.append(card);
  }
  host.append(strip);
}

export function guideTimelinePoints(placed: PlacedRun[]): TimelinePoint[] {
  return placed.map(({ run }) => ({
    id: `guide_${run.id}`,
    at: run.created_at,
    label: `◐ ${guideById(run.guide)?.name ?? 'Guide'} guide · ${run.context}`
  }));
}
```

Now wire it into `people.ts`.

Add imports:

```ts
import { listMeetings } from '@/api/meetings';
import { placeRuns, runsFor, type PlacedRun } from '@/guides/runs';
import { guideTimelinePoints, renderMotivationStrip } from '@/components/motivation-strip';
```

In `mountPaneSkeleton`, after `pane.append(remember.root);`:

```ts
    const motivation = sectionHost('people-pane__motivation', 'Motivation');
    motivation.root.setAttribute('data-section', 'motivation');
    motivation.root.hidden = true;
    pane.append(motivation.root);
```

In `loadPersonSections`:

1. Next to the other host lookups:
   ```ts
   const motivationHost = pane.querySelector('[data-section="motivation"] .people-pane__section-body') as HTMLElement | null;
   ```
2. Next to the other reads (after `rememberRead`):
   ```ts
   const guidesRead = listMeetings().then((r) => placeRuns(r.meetings)).catch(() => [] as PlacedRun[]);
   ```
3. Beside `let rememberRes …`:
   ```ts
   let allPlaced: PlacedRun[] = [];
   ```
4. Inside `paint`, replace the timeline block
   `if (timelineHost && changed === 'overview') { renderPersonTimeline(…) }`
   with the following. `model` is the person model `paint` already builds, the one the Remember block uses as `model.displayName`.
   ```ts
        const mine = runsFor(allPlaced, ref, model.displayName);
        if (motivationHost && changed === 'guides') {
          renderMotivationStrip(motivationHost, mine);
          const box = motivationHost.closest('[data-section="motivation"]') as HTMLElement | null;
          if (box) box.hidden = !mine.some((p) => p.run.guide === 'motivation_sdt');
        }

        if (timelineHost && (changed === 'overview' || changed === 'guides') && ready.has('overview')) {
          renderPersonTimeline(
            timelineHost,
            buildPersonTimeline(rolesFromOverview(overview), [...model.arcPoints, ...guideTimelinePoints(mine)]),
            (orgRef, orgName) => crestFor(orgRef, orgName)
          );
        }
   ```
5. In the `Promise.all([...])` list, add:
   ```ts
   guidesRead.then(value => { allPlaced = value; paint('guides'); }),
   ```

- [ ] **Step 4: Run the tests.**

Run: `npx --prefix apps/professional vitest run apps/professional/tests/unit/motivation-strip.test.ts apps/professional/tests/unit/people-page.test.ts --root apps/professional`
Expected: PASS. If `people-page.test.ts` mocks `@/api/meetings` without `listMeetings`, add `listMeetings: vi.fn(async () => ({ meetings: [] }))` to that mock.

- [ ] **Step 5: Commit.**

```bash
git add apps/professional/src/components/motivation-strip.ts apps/professional/src/views/people.ts apps/professional/tests/unit/motivation-strip.test.ts apps/professional/tests/unit/people-page.test.ts
git commit -m "Professional: Motivation strip and guide runs on the person's timeline"
```

---

### Task 10: Styles from the approved mockup

**Files:**
- Create: `apps/professional/src/styles/guides.css`
- Modify: `apps/professional/src/app/main.ts:28`

- [ ] **Step 1: Write the CSS.** Port the mockup's look under the `.guide` scope. Every class used in Tasks 4–9 is covered here:

```css
/* Meeting Guides. Palette: paper and ink like the Problem Solver / Decision Maker set; clay for
   controlled, teal for autonomous, slate for apart. Approved mockup: docs/mockups/meeting-guides/set.html */
.guide {
  --g-paper: #f7f4ec; --g-card: #fffdf8; --g-ink: #1b2230; --g-muted: #6b7380; --g-line: rgba(27, 34, 48, 0.12);
  --g-slate: #9aa3ad; --g-slate-tint: #eceef0;
  --g-clay-1: #b4532a; --g-clay-2: #e08a5c; --g-clay-tint: #f8e6da;
  --g-teal-1: #7cc3b8; --g-teal-2: #3d9c8f; --g-teal-3: #1f6f66; --g-teal-tint: #dcefeb;
  color: var(--g-ink);
}
.guide-tone--slate { background: var(--g-slate); }
.guide-tone--clay-1 { background: var(--g-clay-1); }
.guide-tone--clay-2 { background: var(--g-clay-2); }
.guide-tone--teal-1 { background: var(--g-teal-1); }
.guide-tone--teal-2 { background: var(--g-teal-2); }
.guide-tone--teal-3 { background: var(--g-teal-3); }
.guide-emblem { width: 44px; height: 44px; flex: none; display: inline-block; }
.guide-emblem svg { width: 100%; height: 100%; display: block; }

/* Panel */
.guide-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); z-index: 60; background: var(--g-paper);
  border-left: 1px solid var(--g-line); box-shadow: -12px 0 32px rgba(27, 34, 48, 0.12); overflow-y: auto; display: flex; flex-direction: column; }
.guide-panel__head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px 6px; }
.guide-panel__body { padding: 8px 18px 24px; display: flex; flex-direction: column; gap: 14px; flex: 1; }
.guide-panel__about, .guide-panel__empty, .guide-hint { font-size: 13px; color: var(--g-muted); margin: 0; }
.guide-panel__error { color: var(--g-clay-1); font-size: 13px; }
.guide-shelf-card { display: flex; gap: 12px; align-items: center; text-align: left; background: var(--g-card); border: 1px solid var(--g-line);
  border-radius: 16px; padding: 12px 14px; font: inherit; color: inherit; cursor: pointer; }
.guide-shelf-card b { display: block; font-size: 15px; }
.guide-shelf-card span:not(.guide-emblem) { font-size: 13px; color: var(--g-muted); }
.guide-shelf-card:disabled { opacity: .45; cursor: default; }
.guide-about { font: inherit; text-align: left; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--g-line); background: var(--g-card); }
.guide-step__top { display: flex; align-items: center; gap: 10px; }
.guide-step__title { font-weight: 700; font-size: 15px; }
.guide-step__who { font-size: 13px; color: var(--g-muted); }
.guide-progress { display: flex; gap: 4px; }
.guide-progress i { flex: 1; height: 4px; border-radius: 2px; background: var(--g-line); }
.guide-progress i.is-done { background: var(--g-ink); }
.guide-progress i.is-now { background: var(--g-clay-2); }
.guide-prompt, .guide-check { background: var(--g-card); border: 1px solid var(--g-line); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 6px; }
.guide-type { font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--g-muted); }
.guide-zone--controlled .guide-type { color: var(--g-clay-1); }
.guide-zone--autonomous .guide-type { color: var(--g-teal-3); }
.guide-prompt__ask { font-size: 20px; font-weight: 650; line-height: 1.3; margin: 4px 0; }
.guide-listen__h { font-size: 12px; font-weight: 600; color: var(--g-muted); margin-top: 8px; }
.guide-listen { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.guide-listen li { font-size: 14px; background: var(--g-slate-tint); border-radius: 10px; padding: 7px 10px; font-style: italic; }
.guide-zone--controlled .guide-listen li { background: var(--g-clay-tint); }
.guide-zone--autonomous .guide-listen li { background: var(--g-teal-tint); }
.guide-taps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.guide-tap { font: inherit; font-size: 13px; padding: 12px 4px; border-radius: 12px; border: 1px solid var(--g-line); background: var(--g-card); text-align: center; line-height: 1.2; color: inherit; cursor: pointer; }
.guide-tap.is-on { border-color: var(--g-clay-1); background: var(--g-clay-tint); font-weight: 650; }
.guide-tap--identified.is-on { border-color: var(--g-teal-3); background: var(--g-teal-tint); }
.guide-input { font: inherit; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--g-line); background: var(--g-card); width: 100%; box-sizing: border-box; }
.guide-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.guide-chip { font: inherit; font-size: 13px; border-radius: 999px; padding: 4px 10px; border: 1px solid var(--g-line); background: var(--g-card); }
.guide-check h4 { margin: 4px 0; font-size: 18px; }
.guide-probe { border-top: 1px solid var(--g-line); padding-top: 12px; margin-top: 6px; }
.guide-probe p { margin: 0 0 8px; font-weight: 600; }
.guide-two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.guide-nav { display: flex; justify-content: space-between; margin-top: auto; }

/* Chart */
.guide-chart { position: relative; padding: 10px 4px 0; }
.guide-chart__zones, .guide-chart__zone-names { position: absolute; left: 4px; right: 4px; display: flex; gap: 6px; }
.guide-chart__zones { top: 10px; bottom: 0; pointer-events: none; }
.guide-chart__zone { border-radius: 10px; flex-basis: 0; }
.guide-chart__zone--apart { background: var(--g-slate-tint); }
.guide-chart__zone--controlled { background: var(--g-clay-tint); }
.guide-chart__zone--autonomous { background: var(--g-teal-tint); }
.guide-chart__zone-names { top: 14px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; text-align: center; }
.guide-chart__zone-name { flex-basis: 0; }
.guide-chart__zone-name:nth-child(2) { color: var(--g-clay-1); }
.guide-chart__zone-name:nth-child(3) { color: var(--g-teal-3); }
.guide-chart__bars { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; height: 196px; padding-top: 28px; }
.guide-chart__col { position: relative; height: 100%; display: flex; align-items: flex-end; justify-content: center; touch-action: none; }
.guide-chart__col[role="slider"] { cursor: ns-resize; }
.guide-chart__col[role="slider"]:focus-visible { outline: 2px solid var(--g-ink); outline-offset: 2px; border-radius: 8px; }
.guide-chart__bar { width: 58%; border-radius: 8px 8px 3px 3px; position: relative; transition: height .18s ease; }
.guide-chart__ghost { position: absolute; z-index: 1; bottom: 0; width: 58%; border: 2px dashed var(--g-ink); border-radius: 8px 8px 3px 3px; opacity: .35; box-sizing: border-box; }
.guide-chart__ghost--older { opacity: .18; }
.guide-chart__sugg { position: absolute; left: 12%; right: 12%; height: 0; border-top: 2px dotted var(--g-ink); opacity: .55; }
.guide-chart__handle { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); width: 26px; height: 14px; border-radius: 7px; background: #fff; border: 2px solid var(--g-ink); }
.guide-chart__names { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; padding: 8px 4px 0; }
.guide-chart__name { font-size: 11px; font-weight: 600; text-align: center; line-height: 1.15; color: #3a4250; hyphens: auto; overflow-wrap: anywhere; }
.guide-lean { margin: 18px 4px 0; }
.guide-lean__track { position: relative; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--g-clay-1), var(--g-clay-tint) 50%, var(--g-teal-tint) 50%, var(--g-teal-3)); }
.guide-lean__track--mini { height: 6px; }
.guide-lean__pin { position: absolute; top: -6px; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid var(--g-ink); transform: translateX(-50%); box-sizing: border-box; transition: left .18s ease; }
.guide-lean__track--mini .guide-lean__pin { width: 14px; height: 14px; top: -4px; border-width: 2px; }
.guide-lean__pin--then { border: 2px dashed var(--g-ink); opacity: .45; background: transparent; }
.guide-lean__ends { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; margin-top: 6px; }
.guide-lean__end--controlled { color: var(--g-clay-1); }
.guide-lean__end--autonomous { color: var(--g-teal-3); }
.guide-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--g-muted); margin: 10px 4px 0; }
.guide-legend__item::before { content: ""; display: inline-block; width: 16px; height: 10px; border-radius: 3px; vertical-align: -1px; margin-right: 4px; }
.guide-legend__item--now::before { background: var(--g-ink); }
.guide-legend__item--then::before { border: 2px dashed var(--g-ink); opacity: .45; box-sizing: border-box; }
.guide-legend__item--sugg::before { height: 0; border-top: 2px dotted var(--g-ink); border-radius: 0; opacity: .55; }
@media (prefers-reduced-motion: reduce) { .guide-chart__bar, .guide-lean__pin { transition: none; } }

/* Card */
.meeting-guides__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.guide-card { background: var(--g-card); border: 1px solid var(--g-line); border-radius: 20px; padding: 18px; margin-top: 12px; }
.guide-card__head { display: flex; gap: 12px; align-items: center; }
.guide-card__kicker { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--g-muted); }
.guide-card__title { font-size: 18px; font-weight: 700; }
.guide-card__edit { margin-left: auto; }
.guide-card__profile { display: flex; gap: 10px; align-items: center; margin: 14px 0 2px; padding: 10px 12px; border-radius: 14px; background: var(--g-paper); }
.guide-card__pname { font-weight: 700; }
.guide-card__pline { font-size: 13px; color: var(--g-muted); }
.guide-card__pick { margin-left: auto; font: inherit; font-size: 12px; border: 1px solid var(--g-line); border-radius: 999px; padding: 3px 8px; background: var(--g-card); }
.guide-card__moves h4, .guide-card__words h4 { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--g-muted); margin: 18px 0 8px; }
.guide-card__moves ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; counter-reset: move; }
.guide-card__moves li { counter-increment: move; display: flex; gap: 10px; align-items: flex-start; line-height: 1.4; }
.guide-card__moves li::before { content: counter(move); flex: none; width: 24px; height: 24px; border-radius: 50%; background: var(--g-teal-3); color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.guide-card__words blockquote { margin: 0 0 6px; padding: 6px 10px; border-left: 3px solid var(--g-clay-2); font-style: italic; font-size: 14px; color: #3a4250; }
.guide-card__cite { font-size: 11px; color: var(--g-muted); margin: 14px 0 0; border-top: 1px solid var(--g-line); padding-top: 8px; }

/* Profile strip */
.guide-mstrip { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.guide-mini { display: block; background: var(--g-card); border: 1px solid var(--g-line); border-radius: 14px; padding: 10px 12px; color: inherit; text-decoration: none; }
.guide-mini b { font-size: 14px; }
.guide-mini__when { font-size: 12px; color: var(--g-muted); }
.guide-mini__spark { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; height: 40px; align-items: end; margin: 8px 0 6px; }
.guide-mini__bar { border-radius: 3px 3px 1px 1px; }
```

- [ ] **Step 2: Import it.** In `apps/professional/src/app/main.ts`, after `import '../styles/meeting-page.css';` add `import '../styles/guides.css';`.

- [ ] **Step 3: Build check.**

Run: `npm --prefix apps/professional run typecheck && npx --prefix apps/professional vitest run --root apps/professional`
Expected: typecheck clean; all Professional tests pass.

- [ ] **Step 4: Commit.**

```bash
git add apps/professional/src/styles/guides.css apps/professional/src/app/main.ts
git commit -m "Professional: Meeting Guides styles from the approved mockup"
```

---

### Task 11: Walk it in the browser, then the gate and PR

**Files:**
- Modify: `docs/superpowers/specs/2026-10-23-meeting-guides-design.md` (apply the six planning changes)

- [ ] **Step 1: Update the spec.** In the spec, edit sections 3.3, 5, 6 and 8 to match "Changes from the spec, decided while planning" above, then commit:

```bash
git add docs/superpowers/specs/2026-10-23-meeting-guides-design.md
git commit -m "Meeting Guides spec: decisions made while planning"
```

- [ ] **Step 2: Start Professional with the mock API.** Use the `professional-dev` launch config (port 5176). Create a meeting in the mock that has an attendee whose People type is Student (invented name), and open it.

- [ ] **Step 3: Walk at desktop width.** Click **◐ Guides**, then Motivation. Type a context, tap through the six prompts with introjected and identified both at least "a bit", answer the check, drag two bars, and save. Confirm:
  - the card appears in the Guides section;
  - the note line is in Notes;
  - **Edit** reopens on the mix;
  - **Change** swaps the profile and moves;
  - a second run in the same context shows the dashed history and dated legend;
  - the student's People profile shows the Motivation strip and the timeline entries.

  Screenshot each.

- [ ] **Step 4: Walk at 390px.** Repeat the run. The panel is full screen, there is no sideways scroll (`document.documentElement.scrollWidth === clientWidth`), the bars drag with touch emulation, and the card fits.

- [ ] **Step 5: Run the gate.**

Run: `npm run pre-pr-check`
Expected: exit 0. Fix anything it flags (secrets scan, generated files, lint) and rerun.

- [ ] **Step 6: Push and open one PR, ready (not draft), then enable auto-merge (merge commit).**

```bash
git push -u origin claude/meeting-guides
gh pr create --title "Professional: Meeting Guides, starting with a motivation (SDT) guide" --body "$(cat <<'EOF'
Guides shelf in meetings. The first guide walks a motivation read along the SDT continuum. Adam asks in his own words, taps what he hears, checks introjected against identified, sets the mix himself and saves a drawn card to the meeting. The card reaches the student's profile through In the room, and Clare's summary reads only the moves.

- Spec: docs/superpowers/specs/2026-10-23-meeting-guides-design.md
- Mockup: docs/mockups/meeting-guides/set.html
- No AI calls when running a guide.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --merge
```

---

## Cost

- **Running a guide** makes no AI calls. Clare's existing ✦ Summarise click is the only AI cost, and it was already there.
- **The build** is 11 tasks in one PR, against Decision Maker's five plans with 50 models. It is a small fraction of that build. Compare the actual against the Decision Maker PR when it lands, and don't quote an A$ figure in advance.

## Self-review notes

- **Spec coverage:**
  - Shelf and button: Tasks 6 and 7.
  - Context, prompts, check and mix: Task 6.
  - Card: Task 5.
  - Meeting card and note line: Task 7.
  - Profile strip and timeline: Task 9.
  - Clare: Tasks 3, 7 and 8.
  - Look: Task 10.
  - Tests: every task.
  - Walk: Task 11.
- **Types:** `GuideRun`, `PlacedRun`, `GuideDefinition`, `Values`, `Tap` are defined in Tasks 2–3 and used with the same names later. `historyFor(placed, run)`, `runsFor(placed, ref, name)` and `saveGuideRun(runs, run)` keep the same signatures everywhere.
- **Known fragility:** Task 7's test relies on the existing meeting page test harness (`mount`, `canvas`); copy its setup exactly. In Task 9, `model` inside `paint` must be the person model the Remember block already uses. Confirm the name before editing.

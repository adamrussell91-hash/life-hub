# Claude prompt: Life Hub personality writing samples

Paste everything below the line into Claude Code with the `life-hub` repo open. Do not run this as a Cursor Cloud Agent coding-rule install. Do not put the result in `.cursor/rules/`.

---

You are writing **approved Humanizer voice samples** for Life Hub personalities.

## Why this exists

Life Hub now has a shared Humanizer prose layer. A genuine writing sample outranks Humanizer's generic style defaults, including the dash rule. The runtime already loads:

`config/humanizer/voices/{slug}.md`

No samples are checked in yet. Your job is to examine this repo and write those files.

## Hard limits

1. Work only in `life-hub`. Do not touch `life-hub-data`.
2. Do not read private conversation history, diary bodies, mind sessions, or user data as source material.
3. Do not invent biography, memories, events, dates, numbers, or facts about Adam.
4. Do not flatten the personalities toward one polished house style.
5. Do not rewrite personality identity, protocols, tools, research hats, or chat runtime.
6. Do not install Humanizer as a Cursor rule.
7. If an approved source is only an identity brief with example phrases, distill a sample from that approved material. Label it as distilled from approved identity text, not as a found historical letter.
8. If you cannot find enough approved material for a personality, write the smallest honest sample from the identity rules that exist, and say so in `config/humanizer/voices/SOURCES.md`. Do not pad with generic assistant prose.

## Approved sources, in order

Use only these, when present:

1. `netlify/functions/_shared/agent-directory.mjs` — the `voice` string for each slug
2. `config/*-protocol.md` and `config/knowledge/*.md` — operating manuals and Knowledge identity files
3. Example phrases already written in those approved files
4. Distinctive verbal signatures already written in those files

Do not use:

- Central Node contents as if they were the personality speaking
- Private diary or mind-session prose
- Generated chat transcripts
- Your own idea of how a general or a professor “should” sound if it contradicts the file

## Output form

Create one file per personality that already has a Life Hub chat slug:

`config/humanizer/voices/{slug}.md`

Slugs: `brisket`, `chadwick`, `hyaluronica`, `penelope`, `sara`, `vera`, `hammond`, `ann`, `clementine`, `clare`

Each file must be **plain in-character prose only**:

- 2–3 paragraphs
- 180–280 words
- No YAML, no headings, no bullets, no numbered lists
- No “as an AI”, no chatbot close, no restating a fake user request
- Spoken to Adam, in that personality’s address habits (buddy / bro / babe / son / no first name / etc.)
- About a mundane in-domain moment that the identity file already licenses. Do not invent a real event. Keep it generic enough that it is a rhythm sample, not a fake memory. Example shape: how they talk when giving a small piece of advice, not a diary of something that happened.

The whole file is ingested as the writing sample. Anything you put in the file becomes calibration.

Also write `config/humanizer/voices/SOURCES.md` with, for each slug:

- source files used
- whether the sample is distilled from identity rules or copied from an existing approved prose passage
- one line on the voice features the sample is meant to protect (dashes, brevity, puns, theatrical vocabulary, etc.)

Do not create a sample for `router`.

## What “good” means

Clare must still sound like Now / Later / Trash, not like Hammond.
Hammond must still sound like mission frame and rare warmth, not like Clare.
Vera may keep em dashes if her identity uses them as breathing room.
Hyaluronica must keep no dashes if her identity forbids them.
Clementine must stay exacting and short, not a warm writing coach.
Ann must stay classroom-specific and dry.
Brisket must stay folksy and joke-heavy.
Chadwick must stay crude locker-room hype.
Penelope’s sample is **conversation voice**, not diary notes.
Sara must stay physician-plain, Australian units if units appear.

After writing, check that `loadPersonalityWritingSample('{slug}')` would return the file text, and that a `buildSystemPrompt({ slug })` for Clare and Hammond still contains each identity line and only one `# Life Hub Humanizer layer`.

# Agent Audit Playbook

How to audit a Life Hub agent personality for gaps, drift, and missed opportunity — the process used on Chadwick Flexington on 2026-08-11, generalised for the other agents.

**Use it when:** an agent "works but isn't quite there," you've migrated one from Notion, or you want to know what an agent *should* be doing that it isn't.

**Run the passes in order.** Pass 1 is cheap and finds obvious gaps. Pass 2 is where the real findings are. Pass 3 produces the insight. Skipping to Pass 3 gets you vague philosophy; stopping at Pass 1 gets you a feature checklist while missing that the agent is structurally blind.

**Rule for the whole process: verify before asserting.** Every sharp claim gets a grep or a file read behind it first. Several of the strongest Chadwick findings would have been wrong if stated from assumption — and a wrong structural claim sends the build in the wrong direction.

---

## Where everything lives

| Thing | Location |
|---|---|
| Voice / personality | `netlify/functions/_shared/agent-directory.mjs` (`voice` field per agent) |
| Operating protocol | `config/<agent>-protocol.md` |
| Roster, colours, triggers | `config/agents.yml` |
| Prompt assembly | `netlify/functions/_shared/persona.mjs` → `buildSystemPrompt()` |
| Runtime context fetch | `netlify/functions/chat.mjs` |
| Write path | `netlify/functions/chat-confirm.mjs` |
| Record schema | `js/core/validate.js` |
| Design history + non-goals | `docs/superpowers/specs/*-design.md` |
| Build history + known gotchas | `docs/IMPLEMENTATION_STATUS.md` |
| Adam's actual history data | `central-node.md` |
| Original spec | Notion — search the agent's name |

---

## Pass 1 — Parity sweep (Notion vs repo)

Find what the migration dropped.

1. Fetch the Notion page for the agent. Fetch `config/<agent>-protocol.md` and the agent's `voice` string.
2. **Read the design doc's "Non-goals" section first** (`docs/superpowers/specs/`). This separates *deliberately deferred* from *accidentally dropped* — a distinction that saves you from "finding" gaps the team already decided to skip. Chadwick's non-goals list immediately explained three apparent gaps.
3. List every concrete rule, domain heuristic, and named protocol in the Notion version. For each, grep the repo:

```bash
grep -rin "deload\|rotation\|aesthetic\|external sources" config/ netlify/ --include="*.md" --include="*.mjs"
```

Empty result = gap. Present = ported (check it wasn't thinned).

4. **Check that documented fixes actually landed.** Design docs describe intentions; code is truth. For each fix a spec claims, grep for the string it should have produced. Chadwick had a reliability spec whose fixes *had* shipped — worth knowing before re-reporting them as broken.

**Output:** a numbered gap list, each tagged *deliberately deferred* / *accidentally dropped* / *thinned*.

---

## Pass 2 — Runtime visibility trace (highest value)

> **What does this agent actually see at inference time, versus what do its rules assume it sees?**

This is where the Chadwick audit found everything that mattered. Doc comparison cannot find these.

**2a. Enumerate what reaches the prompt.** Read `buildSystemPrompt()`'s signature and the agent's block. List every injected field.

**2b. Trace each field back to its source.** Don't trust the parameter name — follow it. `digest` sounded comprehensive; tracing it to `summarizeRecentHistory` showed a **today + yesterday** window from which only `Day type` and `Workout streak` survived for workouts.

**2c. Check what each formatter actually emits.** `formatTemplatesForPrompt` sounded like it sent templates. It emits one line: title, kind, date. No exercises, no weights.

**2d. Grep for the domain data you'd expect and confirm absence:**

```bash
grep -n "composition\|measurements\|body_fat" netlify/functions/_shared/persona.mjs netlify/functions/_shared/digest.mjs
```

Empty output = the agent is blind to that data. This is how "Chadwick can't see the body he's shaping" was found.

**2e. Audit the write path.** For every field the protocol depends on, confirm something *writes* it:

```bash
grep -rn "last_performed\|times_performed" netlify/functions/chat-confirm.mjs
```

Empty = the protocol depends on data nothing maintains. **Check this for every agent** — each has a library or record set with the same failure mode (Brisket's food library, Hyaluronica's product library, Sara's body records).

**Output:** a table of *what the protocol assumes* vs *what actually arrives*, and a list of unmaintained fields.

---

## Pass 3 — Promise vs capability

For each instruction in the protocol, ask: **can the agent physically do this with what Pass 2 says it receives?**

Hunt for verbs that assume memory or perception the agent lacks — "remember," "recall," "check what you did last time," "notice the pattern," "compare to previous." Chadwick's Templates section said *"pull up the shape of that session from what you remember of it"* while receiving one line of metadata. He cannot. He confabulates.

This is the sharpest class of finding: **rules written against data that never arrives.** They read as working instructions and fail silently.

**Output:** every instruction that is currently fiction, with what it would need to become real.

---

## Pass 4 — Purpose interrogation

Now go up a level. Four questions:

**1. What is this agent actually FOR?** Not its job description — its *value*. Read `central-node.md` for evidence of what genuinely fails in this domain. Chadwick's own data showed the failure mode was never programming quality; it was showing up (*"2 consecutive skips = full motivation reset"*, all frequency milestones missed). That reframes the agent from workout generator to **adherence engine**, which changes what "better" means.

**2. Is it an open or closed loop?** *What feedback does this agent get from the outcome it exists to produce?* Chadwick programmed and logged forever without ever asking whether the body changed — he could run a year perfectly and never notice he wasn't working. **Run this test on every agent.** It's the single highest-yield question in the playbook.

**3. Is the goal measurable, and is anyone measuring it?** Often the objective is already computable from data being collected. "Tom Holland physique" turned out to be a shoulder-to-waist *ratio*, and both fields already existed in the measurements schema — the target was computable that day, and nobody had ever computed it.

**4. Where is the agent absent that it should be present?** Map the user's real-world timeline for this domain and mark where the agent exists. Chadwick was present before and after the workout and silent during it — the phone propped on the machine for 25 minutes with the most motivating character in the system mute.

When you find an architectural rule blocking something valuable, **check what problem it was actually solving.** "Never write mid-session logs" was a *data-hygiene* decision that silently became a *coaching* decision. Presence and persistence are separable. Look for this pattern — a constraint enforcing more than it was designed to.

---

## Pass 5 — Cross-agent and self-critique

- **Coupling:** what does this agent write to other agents, what does it read, and does anything silently fail? Chadwick→Brisket Day Type is mandatory and auto-fired; nothing surfaces if it doesn't.
- **Ownership gaps:** does anyone own the *outcome*, or only their slice? Life Hub has specialists and no integrator on the actual goal.
- **Missing agents:** cross-check the Notion roster against `config/agents.yml`. *(Lead: Notion has a **Sterling Blackwood** finance/cost-modelling agent with no counterpart in the repo — unverified, worth a look.)*
- **Critique your own edits.** After proposing protocol changes, re-read them for internal contradiction and arithmetic. Chadwick's own targets didn't close: 3 focuses × 3 hits = 9 exercises in a 20–30 min window is ~2 min per exercise. Also check that new instructions aren't blocked by a config cap — telling him to research meant nothing against `web_search max_uses: 2`.

---

## Output format

Produce, in this order:

1. **Parity gaps** — deferred / dropped / thinned
2. **Structural flaws** — what the agent can't see or doesn't maintain (Pass 2)
3. **Fiction** — instructions that can't execute (Pass 3)
4. **The reframe** — what this agent is really for, open vs closed loop (Pass 4)
5. **Ranked value-add moves** — highest leverage first, dependencies noted
6. **Honest flags** — tensions in your own recommendations

Then a phased implementation plan. For build mechanics — Netlify budget, `included_files`, service-worker precache, test baselines — see `docs/superpowers/plans/2026-08-11-chadwick-closed-loop.md`, which documents the constraints that apply to any agent work in this repo.

---

## Per-agent quick reference

| Agent | Slug | Domain | Record types | Owns outcome |
|---|---|---|---|---|
| Brisket Lasso | `brisket` | nutrition | `meal` | Body fat %, calorie/macro adherence |
| Chadwick Flexington | `chadwick` | fitness | `workout` | Muscle, shoulder:waist ratio |
| Hyaluronica St. Claire | `hyaluronica` | skincare | `skincare` | Skin condition |
| Penelope Rose Quillian | `penelope` | diary / Mind | `diary` | Reflection, mood record |
| Dr Sara Tonin | `sara` | body / health | `weight`, `composition`, `measurements` | Clinical trends |
| Dr Vera Lenz | `vera` | psychology | *(none — conversational)* | Insight |
| General Hammond | `hammond` | life coaching | *(none — conversational)* | Mission / the arc |

**Starting hypotheses for the next audits** (unverified — confirm with Pass 2 before acting):

- **Brisket** — most likely to have the same closed-loop gap as Chadwick. Does he see body fat trend, or only today's macros? He owns the biggest lever on the physique goal and may be blind to whether it's moving.
- **Sara** — owns the body data everyone else needs. Check she pushes it outward, not just records it.
- **Vera / Hammond** — no record types, so Pass 2's write-path audit doesn't apply; weight Pass 3 and Pass 4 instead. Hammond is the natural owner of the arc that currently has no owner.

# Brisket Lasso — Agent Audit

**Date:** 2026-08-11
**Method:** `docs/agent-audit-playbook.md`, passes 1–5, run after the Chadwick audit.
**Sources verified:** Notion `Brisket Lasso` (Agent Personalities, last edited 19 Jun 2026), `config/brisket-protocol.md`, `config/targets.yml`, `netlify/functions/_shared/{persona,digest,food-library,agent-directory}.mjs`, `netlify/functions/{chat,chat-confirm}.mjs`, `js/core/{aggregate,central-node-write,constraints,validate}.js`, `js/app/{home-model,nutrition-model,render-nutrition}.js`, `central-node.md` (seed copy).

**Headline:** the Chadwick hypothesis holds, but the failure is sharper here. Brisket is mandated to record five nutrition dimensions on every meal — sodium, calcium, polyphenol score, omega-3, macros — and can only ever see three of them come back. Two of the fields he is forbidden to leave blank are **write-only in the entire system**: nothing aggregates them, nothing shows him a day total, and his protocol contains coaching rules that fire off those totals. Meanwhile the numbers he *can't* see are already computed, in the same function, one line above the string he's handed.

---

## 1. Parity gaps (Notion → repo)

Tagged per the playbook. `config/` has no non-goals doc for Brisket, so "deferred" is inferred from platform reality (no Notion DBs in Life Hub), not from a written decision.

| # | Item | Tag | Evidence |
|---|---|---|---|
| 1 | **Numeric body-composition target** — Notion: "78 to 82 kg at 8 to 11 percent body fat", waist 75–80 cm, visual markers (ab lines, chest separation, jawline, V-waist). Repo protocol: "Body composition aim: lean athletic look." | **Thinned to nothing** | `grep -rin "78\|waist\|body fat" config/` returns Chadwick and Sara only. Brisket's goal has no number anywhere. |
| 2 | **Marley Spoon** — Notion makes it the dinner default and the dietitian's fat-control safety net; CN Long-Term Trends calls it "the most significant structural change to dinner quality since tracking began." | **Dropped** | Zero occurrences of "Marley" in `config/`, `netlify/`, `js/`. |
| 3 | **"Adam hates batch cooking. Do not suggest it."** | **Dropped** | Lives only in CN Long-Term Trends, a section Brisket is never sent. He can violate this today. |
| 4 | **Emulsifier scan as a procedure** — Notion Step 1c: scan packaged/bought foods only, against a named list (carrageenan, polysorbate 80/E433, CMC/E466, guar, xanthan, sodium stearoyl lactylate, mono- and diglycerides), whole foods exempt; plus `Emulsifier Flag` + `Emulsifier Notes` columns in the Food Library. | **Thinned + structurally dropped** | Protocol keeps a 4-item list inside the flare section. `food-library.mjs` has **no emulsifier field at all** — so a flag found once is never cached, and every re-log of the same bar re-derives it or forgets it. |
| 5 | **Forward-facing Eating Advice surface** — Notion wrote a gameplan (opening anecdote, table, forward plan, sign-off) to a persistent section. Repo Job #4 still says "advice is a gameplan for remaining meals, not a retrospective essay." | **Dropped; the replacement inverts it** | `index.html:279` has a panel labelled advice; `nutrition-model.js:94-108` fills it with **the last meal's `notes`** — a ≤140-char verdict on food already eaten. The forward plan has no home outside a chat message that scrolls away. |
| 6 | **Recipe Collection / Pantry / Dinner Planning Run** (2 options from pantry + rated history, write ratings back) | **Deferred** (no such store exists in Life Hub) | No `recipe`/`pantry` anywhere in the repo. Reasonable to defer — but nothing replaced the "what do I cook tonight" job. |
| 7 | **Notion day-page mechanics** (parent day page, Day Type property, Food Library relation, day-total roll-up properties, Meals diary heading) | **Deferred, correctly** | Explicitly disowned in the protocol's opening ("Life Hub is not Notion"). See §5 for the one piece of this that leaked into code. |
| 8 | **"Always search the web before advising"** | **Deferred, correctly** | Incompatible with `max_uses: 2` and the Netlify budget. |
| 9 | **Weekly review / 0.5–1 kg per week / pattern analysis** | **Deferred by design** | Reassigned to Hammond in the protocol. See §3 — the reassignment never landed. |
| 10 | **Calcium 1000 mg/day target and "flag meals contributing 200mg+"** | **Relocated, not lost** | 1000 mg is in `targets.yml` and reaches him inside CN Constraints. Not in his own protocol, and no running total (§2). |
| 11 | **"Foods to Heal" (Dr Nerida McDonald)** | **Unportable** | Image attachment on the Notion page. Never transcribed. Worth an OCR pass if it carries rules. |

**Documented fixes that did land** (checked per playbook Pass 1.4, do not re-report): all three items in `2026-08-05-brisket-cn-reliability-design.md` shipped — post-write force refresh (`main.js:105`), food-library tool continuation (`chat.mjs:479-504`), and `centralNodeUpdated` surfaced to chat (`chat-confirm.mjs:179`, `chat-controller.js:475`).

---

## 2. Structural flaws — what he actually sees

### What reaches the prompt

`buildSystemPrompt` gives Brisket: `digest`, `constraints`, `centralNodeLog`, `foodLibrary`, `brisketProtocol`, voice, and three brisket-specific lines. That is the whole world.

### What the protocol assumes vs what arrives

| Protocol assumes | What actually arrives | Where it breaks |
|---|---|---|
| Day totals for polyphenol ("under ~10 flag, 30+ enthusiasm") | **Nothing.** `digest.mjs:27-31` prints calories, protein, fat only. `buildNutritionStatusLine` (CN) emits kcal/P/F/Na/Ca. | `aggregate.js:27` **already sums `polyphenol_score`**, and `summarizeRecentHistory` already holds it in `nutrition` — it is thrown away when the string is built. |
| Omega-3 day read ("nudge if deficient", ALA aim 1–2.5 g) | **Nothing, anywhere.** | `omega3` is validated (`validate.js:121`), stored, and rendered on a single record. `grep -rn omega3 js/ netlify/` shows **no aggregation in the codebase.** It is a mandatory write-only field. |
| Sodium runway (weekend protocol: "name fat/sodium risk", ceiling 2000 mg) | Ceiling reaches him via Constraints; **the running total never does.** | `targets.sodium_ceiling_mg` exists; digest omits both it and `nutrition.sodium_mg`. |
| Calcium tracking (1000 mg/day, bone risk) | Same: target yes, running total no. | Same line. |
| Per-meal protein guides (bfast 30 / lunch 30 / dinner 40) | He cannot see which slots are already filled. | `home-model` returns `nutrition.meals` — per-slot protein distribution — and the digest drops it. |
| Body composition ("lean athletic look"; roster says he owns body fat %) | **Blind.** | Playbook grep 2d: `grep -n "composition\|measurements\|body_fat\|weight_kg" persona.mjs digest.mjs` → nothing. Worse: `data/body/**` files for today *are inside* the fetched window (`chat.mjs:168`) and are parsed — `getLoggingCompleteness` reports `body: true`. He is told a body record exists and never told what it says. |
| Food Library gives him verified figures | It gives him six fields. | `PROMPT_SUMMARY_FIELDS` (`food-library.mjs:8`) = calories, protein, fat, carbs, sodium, calcium. `polyphenol_score` and `omega3` are stored on the entry and **never printed** — so the same food gets re-scored from scratch on every log, inconsistently. |

### Write-path audit (playbook 2e)

- `verifiedAt` **is** maintained (`upsertFoodLibraryEntry`, `chat.mjs:485`) — the 12-month staleness rule is real, unlike Chadwick's `last_performed`.
- Latent scaling bug: `formatFoodLibraryForPrompt` does `entries.slice(0, MAX_PROMPT_ENTRIES /* 200 */)` while `upsertFoodLibraryEntry` **pushes to the end**. Past 200 entries, the *newest and most recently verified* foods are the ones dropped from the prompt. Not yet biting (library size unverified — it lives in the data repo), but it fails in the wrong direction.
- **Flags is a single-slot register.** `upsertStatusField(body, 'Flags', …)` replaces. Every meal verdict overwrites the previous one, and a skincare, weight, composition or measurements log overwrites it too (`central-node-write.js:169-192` — five record types share the field). The protocol's claim that the verdict "lands here so every other agent can see whether the meal was on track" is true only for the day's last writer. The verdicts do survive in Recent Agent Actions, which is appended.

---

## 3. Fiction — instructions that cannot execute

1. **Polyphenol day banding.** "Day totals under ~10 deserve a gentle flag, 30+ deserve enthusiasm." No polyphenol day total reaches him from any source. Every time he states one, he invents it. *(Adam can read this exact number off the Nutrition tab — `render-nutrition.js:21` — while his nutrition coach cannot.)*
2. **Omega-3 day check.** "polyphenol/omega-3 nudge if deficient" against a 1–2.5 g ALA daily aim. Nothing in the system ever counts omega-3 across a day.
3. **"Quote day totals only from Central Node / digest after a real confirm."** Correctly framed as an anti-confabulation rule — and it forbids exactly the two totals items 1 and 2 require him to state. Following one rule breaks the other.
4. **The Hammond→Brisket channel.** The protocol removes his pattern-reading ("Patterns are Hammond's job, not yours… do not fabricate a pattern to sound insightful") and hands it to a directive channel: "When one is present, treat it as live coaching context." In `central-node.md` there is **not one Hammond→Brisket line**. He was disarmed and the replacement never arrived. This is the highest-cost item in the audit: it is why he is structurally incapable of noticing anything.
5. **"Do not trawl This Week / This Month / Long-Term Trends."** A no-op — those sections are never sent to him. Harmless, but it reads as a live restriction on a capability he doesn't have, which makes the context look bigger than it is.
6. **`web_search max_uses: 2` vs the logging protocol.** The protocol's own escalation path — Food Library miss → AU source search → "if fat or sodium is still missing: **re-search** the AU retailer/brand NIP" — is two searches for *one* food. A stale library entry also costs one. Any message naming two products cannot complete the procedure, and the failure mode the protocol most wants to prevent (invented fat/sodium) is exactly what a budget exhaustion produces. Same class of finding as Chadwick's blocked research instruction.

---

## 4. The reframe

**Open or closed loop?** Open, and in a more specific way than Chadwick's.

Chadwick programmed without checking whether the body changed. Brisket **records the outcome data himself and never reads it back**. Every meal he logs carries sodium, calcium, polyphenol and omega-3; those four exist to answer questions — is bone intake adequate, is inflammation load coming down, is the flare protocol working — and the answers are computed for Adam's screen and withheld from the agent doing the coaching. He is a very good sensor wired to no display.

**What is he actually for?** The evidence in CN Long-Term Trends is unambiguous and it is not macro arithmetic:

> "Feast-or-famine cycle persists on unstructured days… protein target met Tue–Fri (structured Marley Spoon + supplements) but missed Sat–Sun when eating out… Homemade/structured meals outperform fast food on every metric. **The barrier was energy and infrastructure, not skill.**… choice architecture… modifying the food environment is more effective than relying on willpower."

The failure mode is structural, weekend-shaped, and already diagnosed. The protocol's Psychology & behaviour section is genuinely good and already says this ("Coach the setup, not just the target"). But the two facts that make it actionable — Marley Spoon is the working infrastructure, weekends are the vulnerability — are in a section he never receives. **He is the environment engineer for a person whose environment he cannot see.**

**Is the goal measurable, and is anyone measuring it?** Twice over, and no:
- Polyphenol day total: computed, displayed, never sent to him.
- Body fat % / weight: Sara logs `composition`; the record is in his fetch window and dropped before the prompt.

**Where is the goal itself contradicted?** CN Constraints (which he *does* receive) says: *"Weight: 88kg… → target ~87-88kg. **At range.**"* Notion says the target is 78–82 kg at 8–11% body fat, and Chadwick is programming toward a shoulder-to-waist ratio. So the live instruction Brisket reads every turn tells him the physique goal is **already met and should be maintained**, while the rest of the system is running a recomposition. That is not a data gap; that is two agents coaching toward different bodies.

**Where is he absent that he should be present?** The decision point. He is present when Adam *reports* a meal — i.e. after the choice is made and usually after it's eaten. The weekday failure (nothing until 5–6pm) and the weekend failure (ordering out) both happen with no agent in the room. The protocol anticipates this ("the realistic first eating window is often afternoon… anticipate this in how you open a workday conversation") but he only ever opens a conversation Adam starts.

---

## 5. Cross-agent and self-critique

- **Chadwick→Brisket Day Type is Notion mechanics fossilised in code.** `buildCrossAgentDayTypeLine` auto-writes *"Set Day Type to 30-min Workout"* into Cross-Agent on every completed workout. Brisket cannot set anything — his own protocol forbids it ("Do not invent Day Type fields that Life Hub does not expose") — and he doesn't need to: `resolveDayType` derives it from workout records automatically. The line is an instruction that is fiction by construction, generated by us, addressed to him.
- **And it has flooded the channel.** The section header says *"One-line directives only. Purge once actioned."* Nothing purges. In the seed copy, Cross-Agent carries **~15 unpurged Chadwick→Brisket Day Type lines spanning 29 Jun – 31 Jul**, plus Chadwick→Sara shoulder notes. That entire block is injected into every Brisket turn. The one channel his protocol tells him to treat as live coaching context is ~90% stale auto-generated noise addressed to him about actions he cannot take. *(Caveat: this is the repo's seed copy — the live `central-node.md` is in the data repo. Confirm against live before acting; the growth mechanism is in code either way.)*
- **Sterling Blackwood — the playbook's lead, now confirmed.** Notion has a `Sterling Blackwood` finance/cost-modelling agent that explicitly cross-talks with Brisket on food cost. He is **not** in `config/agents.yml`. Worse, `config/hammond-protocol.md:49` already tells Hammond *"Sterling owns deep finance — redirect; do not coach portfolios"* — Hammond is instructed to redirect to an agent that does not exist. That is a live dead-end today, independent of whether Sterling is ever built.
- **Ownership.** Brisket owns "body fat %" on the roster and can't see it; Sara owns the body data and, per the roster note, may not push it outward; Hammond owns the patterns and has posted nothing to Brisket. Three agents, one outcome, no one holding it.
- **Self-critique of my own recommendations.** (a) Everything in §6 phase 1 adds tokens to a prompt that already carries the full Constraints block — school bell times and biologics history included — so the polyphenol/sodium/calcium line should replace noise, not stack on it. (b) A `sodium_mg` day total is only meaningful if most meals actually carry sodium; the field is required at validation, so this should hold, but it's worth eyeballing real data first. (c) Raising `max_uses` costs Netlify budget and latency — the cheaper fix is caching emulsifier/omega-3/polyphenol on the library entry so fewer turns need search at all.

---

## 6. Ranked value-add moves

| # | Move | Why it's here | Cost | Depends on |
|---|---|---|---|---|
| 1 | **Print what's already computed.** Extend the `summarizeRecentHistory` line to include sodium/ceiling, calcium/target, polyphenol/aim, and the per-slot protein split. | Kills fictions 1 and 2 outright, restores three coaching rules, closes the Adam-can-see-it-he-can't gap. All values are already in `buildHomeModel`'s return. | ~6 lines | — |
| 2 | **Add omega-3 to the aggregate.** `aggregate.js` counts meals by level (`high/medium/low/none`) → digest line → CN Nutrition line. | The only mandatory field with zero readers anywhere. Cheapest way to make a required write meaningful. | small | 1 |
| 3 | **Feed him the body trend.** Surface the last `weight`/`composition` figure (and direction vs previous) into the digest. | Closes the loop. He owns body fat % and is blind to it. The records are already fetched and parsed. | small–med | widen window or read latest body record |
| 4 | **Resolve the goal contradiction** in CN Constraints: 88 kg "at range" vs 78–82 kg @ 8–11%. Restore the numeric target to `brisket-protocol.md`. | Adam's call, not mine — but until it's settled, moves 1–3 make him precisely well-informed about the wrong objective. | decision | — |
| 5 | **Stop generating Chadwick→Brisket Day Type lines, and purge the backlog.** Day Type is already derived in code. | Removes ~15 stale instructions from every turn and unblocks the Cross-Agent channel for real signal. | small | confirm live CN |
| 6 | **Post the first Hammond→Brisket directive** — and give Hammond a trigger for it (e.g. on his periodic audit, distil one nutrition pattern). | Makes fiction 4 real. Without it, "patterns are Hammond's job" means patterns are nobody's job. | med | 5 (channel must be readable) |
| 7 | **Cache judgment on the Food Library entry and print it.** Add `polyphenol_score` + `omega3` to `PROMPT_SUMMARY_FIELDS`; add `emulsifiers: []` / `emulsifier_flag` to the schema and the prompt line. | Consistent scoring across repeat logs, restores Notion's emulsifier memory, and reduces search pressure (see move 9). | small–med | — |
| 8 | **Restore the two dropped environment facts** to the protocol: Marley Spoon as the dinner default and fat-control anchor; "Adam hates batch cooking — never suggest it." | The protocol tells him to coach the setup; these are the setup. | 3 lines | — |
| 9 | **Fix the Food Library prompt slice** — take the *most recently verified* 200, not the first 200. | Silent future failure, wrong direction. | 1 line | — |
| 10 | **Give the forward plan a surface.** Either rename the Nutrition panel to what it is (last meal verdict) or let Brisket write a short forward gameplan that persists to it. | Job #4 currently has nowhere to land. | med | design decision |
| 11 | **Make Flags additive or per-agent**, so a skincare log doesn't erase the day's meal verdict. | Affects every agent, not just Brisket. | med | cross-agent |
| 12 | **Decide on Sterling** — build, or strip the dangling reference in `hammond-protocol.md:49`. | Live dead-end today. | small either way | Adam's call |

---

## 7. Honest flags

- **Moves 1–3 make him informed, not present.** They fix confabulation; they don't put him at the decision point. If the real failure is weekend ordering and a 5pm first meal, an agent that answers well when asked is still an agent nobody asks at 11am on a Saturday. Presence is a separate, larger piece of work — and the playbook's own lesson from Chadwick (a constraint that quietly became a coaching decision) probably applies here too, though I found no equivalent architectural block on the nutrition side.
- **Move 6 is a dependency, not a feature.** Hammond distilling patterns to Brisket only works if Hammond's own trend data is current — and CN Long-Term Trends still cites a **150 g protein target** and **90.5 kg**, against a live 120 g target and 88 kg. Feeding stale trends into Brisket's live coaching would be worse than the silence it replaces. Audit Hammond's inputs before wiring this up.
- **I could not read the live data.** `data/` and the live `central-node.md` are in the separate data repo; this checkout has `data/skincare` only. Food Library size, real sodium coverage per meal, and the current Cross-Agent backlog are all unverified against production. Every claim above is grounded in code or in the seed copy, and I've marked where that distinction matters.
- **The protocol is not the weak part.** Unlike the parity gaps suggest, `brisket-protocol.md` is a strong document — the Psychology & behaviour section, the Trommelen framing, and the estimate-hygiene rules are better than their Notion originals. Almost every finding here is a plumbing failure underneath good instructions. Resist the urge to rewrite the protocol; wire up what it already asks for.

---

## 8. Phased plan

**Phase 1 — make his own data readable (no new sources).** Moves 1, 2, 9, 7. All inside `digest.mjs`, `aggregate.js`, `central-node-write.js`, `food-library.mjs`. Unit tests: digest string contents, omega-3 tallying, library slice ordering. No UI change, no service-worker bump.

**Phase 2 — settle the objective.** Move 4, then move 8. Protocol + CN Constraints edits only; no code. Do this before phase 3, or phase 3 optimises toward an undecided target.

**Phase 3 — close the loop.** Move 3 (body trend into the digest) and move 5 (stop the Day Type generator, purge the backlog). Touches `chat.mjs` fetch window and `central-node-write.js`; check the Netlify blob-read budget noted in `2026-08-11-chadwick-closed-loop.md` before widening the window — prefer reading the latest body record over widening the whole manifest.

**Phase 4 — cross-agent.** Moves 6, 11, 12. Needs a Hammond input audit first (see flags).

**Phase 5 — presence and surface.** Move 10, plus the open question of whether Brisket should ever speak first. Brainstorm before building.

For build mechanics — Netlify budget, `included_files`, service-worker precache, test baselines — see `docs/superpowers/plans/2026-08-11-chadwick-closed-loop.md`.

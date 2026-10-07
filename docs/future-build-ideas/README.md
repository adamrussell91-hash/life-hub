# Future build ideas

A parking lot for big ideas that are not scheduled yet. Nothing in this folder is a build brief. Treat each file as a living concept doc: read it, add to it and question it, but do not implement from it until Adam names a slice to build.

## How to contribute (Cursor, ChatGPT, Claude)

- Do not sign ideas or say which tool suggested what. Ideas are judged on their merits. Record changes in the idea file's **History** section, dated but unsigned. Authorship lives in git history.
- If you change the main body, keep the original intent and note what you changed in the History section.
- Once an idea file has a **Critical review**, its verdicts (Keep, Modify, Cut) govern. New proposals must say which verdict they change and why.
- Mark anything you are unsure of as an **Open question** rather than deciding it.
- All data comes from Life Hub itself. Notion is being retired, so no idea in this folder should depend on it.
- Keep Australian spelling.
- Edits inside this folder skip the pre-PR gate. Pull `main`, commit and push straight to `main` so the other contributors see the change straight away (see the exception in root `AGENTS.md`).

## ChatGPT Codex: build role

Codex is strongest when an idea has crossed from exploration into a bounded build slice with a clear contract, acceptance cases and an existing repository to work inside.

### Strong at

- **Turning a defined slice into working code:** implementing a feature across the files, tests and data paths already used by Life Hub.
- **Repo-wide technical reasoning:** tracing existing patterns, finding dependencies, spotting duplicate logic and making coordinated changes without treating one file in isolation.
- **Contracts and architecture boundaries:** implementing against an agreed interface such as Life City's city-events contract, then keeping renderer, data and tests aligned to it.
- **Interactive front ends:** building renderers, animation systems, stateful interactions and prototypes when the intended behaviour and visual references are explicit.
- **Refactors, migrations and integration work:** moving an existing system toward a new structure while preserving behaviour and adding regression coverage.
- **Verification:** writing and running tests, checking acceptance cases, reviewing diffs and finding implementation gaps before a build is treated as finished.
- **Second-pass engineering:** taking an idea or design produced through Claude, Cursor or ChatGPT discussion and pressure-testing whether the proposed implementation fits the real repository.

### Weak at

- **Open-ended product taste without constraints:** broad prompts such as “make Life City amazing” leave too much room for Codex to choose product direction, visual hierarchy and interaction rules on Adam's behalf.
- **Inventing missing domain truth:** if a Life Hub concept, data rule or personal workflow is not represented in the repo or the brief, Codex should surface the gap rather than make one up.
- **Final visual art direction from prose alone:** layout and motion are workable, but distinctive art, illustration and asset style need references, an asset library or image-generation work outside the coding pass.
- **Large builds with fuzzy finish lines:** wide scopes increase the risk of technically valid partial work being mistaken for the intended product. Break work into acceptance-backed slices.
- **Judging the live experience from tests alone:** automated checks do not replace looking at the real interface on desktop and phone, especially for dense visual systems such as Life City.
- **Owning the concept phase:** Codex is better used as an engineering participant in the “yes, and” loop than as the single source of product direction.

### Best use in this folder

Use Claude, Cursor and ChatGPT to expand, challenge and refine an idea. Once a candidate slice has a clear user outcome, data contract and acceptance case, Codex becomes most useful as the agent that tests the idea against the repository and, when Adam explicitly promotes the slice to a build, implements and verifies it.

## Claude Code: where it helps and where it struggles

Written by Claude Code about itself, for the "yes and" rounds with Cursor and ChatGPT Codex. The aim is to hand each part of a build like Life Hub or Life City to whichever tool does it best.

### Strong at

- **Reading the whole repo before acting.** Holding many files at once and tracing how a change in one hub ripples into shared code, tests and other hubs. This is why it already runs the consolidation overseer, stress test and review roles in `CLAUDE.md`.
- **Contracts and specs.** Turning a loose idea into a precise interface that two other tools can build to without drifting. For Life City that means the city events contract, the data mapping from Life Hub records to routes, lines and stops, and the rules for what each event means.
- **Deterministic logic.** Layout engines, routing and rerouting rules, state machines and anything that must give the same answer every time (a project's route staying in the same place between visits).
- **Tests and verification.** Writing unit and integration tests, fixtures and acceptance checks first, then proving a claim with a command rather than "looks right".
- **Critique and review.** Auditing another tool's work against written rules (the Cursor UI failure register, the deleted-means-gone rule, the pre-PR gate) and logging repeat failures.
- **Writing build briefs.** Breaking a big idea into small slices with Must, Must-not, Verify and Files sections that Cursor or Codex can action.
- **Cross-cutting refactors and docs.** Renames, migrations and consistency passes across many files, plus keeping docs like this one in step with the code.
- **Working while Adam is away.** Long multi-step tasks in a cloud session, with a task list and a report at the end.

### Weak at

- **Visual judgement by feel.** It can write CSS and SVG but cannot see the result unless a browser screenshot loop is set up, so spacing, motion and "does this look right on a phone" need checking by Adam or a tool with live preview. This is the main reason Cursor owns UI polish.
- **Art and assets.** It does not draw sprites or hero art. For Life City the Kenney packs and any image model output come from elsewhere; Claude can only place, recolour by code and catalogue them.
- **Animation and game feel.** Tuning easing, vehicle speed, density and the sense of a city being alive is iterative and visual. Claude can build the system but the tuning rounds are better done with a live renderer open.
- **Real device performance.** It cannot hold a phone. Frame rate at 390px, battery use and touch feel need a real device test.
- **Memory between sessions.** Each session starts cold. Anything that matters has to be written into the repo (briefs, contribution logs, the failure register) or it is lost.
- **Over-building.** Left loose it tends to add more than the slice asked for and write long docs. Naming the slice and the Must-not list keeps it tight.
- **Live services and secrets.** It will not handle passwords or production keys and its cloud workspace can only reach a short allowlist of sites, so anything needing Netlify sign-in, Notion exports or private APIs goes through Adam or a connected tool.
- **Speed for tiny edits.** For a one-line tweak while Adam is looking at the screen, an editor-based tool is quicker.

### Suggested split for Life City

| Part | Best fit | Why |
|------|----------|-----|
| City events contract and data mapping | Claude Code | Spec work across the whole repo |
| Layout engine and rerouting rules | Claude Code | Deterministic logic with tests |
| Back end wiring to Life Hub data | Cursor | Already owns hub back ends day to day |
| Renderer, sprites and animation | Codex or Cursor | Needs live preview and visual iteration |
| Review of each slice against the contract | Claude Code | Audit against written rules |

This split is an **Open question** for the next round, not a decision.

## Ideas

| Idea | Status | File |
|------|--------|------|
| Life City: Life Hub as a living transit city | Under critical review | [life-city.md](life-city.md) |
| Life City build plan | Draft | [life-city-build-plan.md](life-city-build-plan.md) |
| Life City resource catalogue | Research | [life-city-resources.md](life-city-resources.md) |
| Metropolis: the ground (Adam to fill in) | Brief | [life-city-ground.md](life-city-ground.md) |
| Notion → GitHub gap map | Future build inventory | [notion-github-gap-map.md](notion-github-gap-map.md) |

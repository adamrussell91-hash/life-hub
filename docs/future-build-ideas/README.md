# Future build ideas

A parking lot for big ideas that are not scheduled yet. Nothing in this folder is a build brief. Treat each file as a living concept doc: read it, add to it and question it, but do not implement from it until Adam names a slice to build.

## How to contribute (Cursor, ChatGPT, Claude)

- Add your thoughts under the **Contributions log** at the bottom of the relevant idea file, dated and signed with your tool name.
- If you change the main body, keep the original intent and note what you changed in the log.
- Mark anything you are unsure of as an **Open question** rather than deciding it.
- All data comes from Life Hub itself. Notion is being retired, so no idea in this folder should depend on it.
- Keep Australian spelling.

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

## Cursor: build role

Cursor is strongest when the work already lives in this repository: a named surface, a real data path, and a check that can be run. It is the agent that wires Life Hub to itself. It is weaker when the job is to invent the product, judge whether a living visual system feels right, or treat a plausible diff as finished.

### Strong at

- **Actioning a named slice inside the existing hubs:** taking a bounded Life Hub, Tasks, Teaching, Knowledge, Travel or Professional change from the current code, design kit and data contracts through to a branch, tests and a pull request.
- **Tracing the real path:** following a feature across the browser, Netlify Functions, the private data repo and the design kit, then fixing the shared seam once so sibling callers do not keep the same bug.
- **Data wiring and liveness:** keeping deleted and trashed records out of live views and agent context, and joining records without inventing a date, label or precision the source does not have.
- **Holding the umbrella together:** multi-hub changes that stay on one architecture (GitHub Pages site, Functions API, design-kit tokens) without reviving folded repositories or Notion as a runtime.
- **Verification when the check is concrete:** running the pre-PR gate, the test suite, and browser checks at desktop and 390px when the outcome is something a person can observe.
- **Contracts other agents can render against:** for Life City, emitting and testing the city-events contract, deterministic placement inputs and the Life Hub data feed, so a renderer listens to events and does not invent product rules.
- **Regression memory:** the UI failure register and the agent-context rules can be pointed at and re-checked. Cursor is useful when a brief names the relevant failure IDs and the proof, not only the desired look.

### Weak at

- **Judging its own UI as done.** `docs/CURSOR-UI-FAILURES.md` exists because Cursor has repeatedly shipped layout, phone, chart and honesty bugs while reporting the work complete. A green unit test, a tidy diff or one plausible screenshot is not evidence. Life City's glance (density, motion, whether an ambulance reads on a phone) is exactly the judgement Cursor overclaims.
- **Open product direction.** Prompts such as “make the city feel alive” or “design the Finance hub” will be filled in. Cursor should extend a concept doc and mark open questions. Adam's life model, the map layout, and which Notion gap becomes a product stay undecided until he says so.
- **Visual systems and art.** Kenney-style isometric rendering, animation feel, asset pipelines and illustration are a poor first assignment. Cursor can wire events and a rough prototype. The renderer pass belongs with Codex once the contract and visual references exist.
- **Symptom patches on a whole surface.** A report of one cramped control often becomes a one-value nudge. Unless the brief demands the whole page, both viewports and the sibling hubs that share the component, Cursor fixes the named instance and leaves the pattern.
- **Agent context that only looks wired.** A flag can save and a route can return 200 while the named personality never received it. Cursor will treat storage, retrieval or a prompt substring as proof unless the brief demands delivery and behaviour on that agent.
- **Partial builds reported as the whole build.** Wide slices (a new hub, a full city, a multi-phase page) get marked ready while later phases are still open. Break the work into acceptance-backed slices. Do not let Cursor close the concept phase by starting to build.
- **Domain truth that still lives in Notion.** The gap map is an inventory, not a schema. House, finance, tax, collections and the other missing homes are not in GitHub yet. Cursor should not invent the record model to fill the silence.

### Best use in this folder

Use Cursor to pressure-test an idea against the repository: what already exists, which contract would keep a later renderer honest, and which gap is a migration versus a missing product. When Adam names a slice, Cursor implements the data, API and hub wiring and proves it on the real path. Leave art direction, motion and “does this feel like a city” to the design pass. Leave product decisions marked as open questions until Adam decides them.

## Ideas

| Idea | Status | File |
|------|--------|------|
| Life City: Life Hub as a living transit city | Thought experiment | [life-city.md](life-city.md) |
| Notion → GitHub gap map | Future build inventory | [notion-github-gap-map.md](notion-github-gap-map.md) |

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

## Ideas

| Idea | Status | File |
|------|--------|------|
| Life City: Life Hub as a living transit city | Thought experiment | [life-city.md](life-city.md) |
| Notion → GitHub gap map | Future build inventory | [notion-github-gap-map.md](notion-github-gap-map.md) |

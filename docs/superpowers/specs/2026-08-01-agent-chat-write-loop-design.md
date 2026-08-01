# Agent Chat and Write Loop Design

Date: 1 August 2026
Status: Approved
Phase: 4 of the Life Hub delivery roadmap

## Outcome

Life Hub gains a Chat view where Adam converses with his domain agents (Chadwick, Brisket, Dr Sara Tonin, Hyaluronica, Penelope, Vera, Hammond) in natural language. The assistant routes each message to the right persona, drafts a schema-valid record, and — after an explicit confirmation step — writes it to the private `adamrussell91-hash/life-hub` repository through the same authenticated Netlify Function boundary the read side already uses. A successful write refreshes the affected domain view immediately.

This phase builds the chat and write mechanics using the persona metadata already checked in (`config/agents.yml`) and the medical/dietary constraints already migrated into `central-node.md`. It does not attempt to reproduce Adam's full Notion-authored agent instructions verbatim — that content lives behind an MCP connection unavailable during this build. See "Deferred" below.

## Scope

This phase includes:

- an authenticated `/api/chat` Netlify Function that streams Anthropic Messages API responses (Claude) using tool use;
- deterministic routing from `config/agents.yml` `name_triggers` to a persona; an unmatched message goes to a general Life Hub router persona that can still hand off mid-conversation;
- a `log_entry` tool with a per-domain JSON schema (nutrition, fitness, mind, body, skincare) the model calls to propose a record;
- server-side schema validation of every tool call before any write is attempted;
- a mandatory confirmation step in the UI: the model's proposed record renders as a structured preview card; Adam approves or edits before it is written;
- idempotent GitHub writes via the Contents API (create-or-update by path with `sha` precondition), reusing the existing canonical path convention `data/<domain>/YYYY/MM/YYYY-MM-DD-<slug>.md`;
- a same-day-same-slug collision prompts Adam to overwrite or save under a new slug — it never silently overwrites;
- a recent-history digest (last 7 Sydney days of manifest data, already available from the existing sync module) injected into the system prompt so the agent knows today's targets, streaks, and what is already logged;
- partial-failure recovery: if the GitHub write fails after the model has replied, the chat shows the pending record with a retry action; nothing is silently dropped, and the conversation is not replayed to the model;
- immediate refresh: a successful write triggers the same manifest re-check the Home view already uses, so new data appears without a manual reload;
- a chat UI in the existing Clinical Glass shell: streaming assistant text, per-agent name/colour badges from `agents.yml`, a persistent record-preview/confirm affordance, and a visible connection/error state;
- a fixture-backed local development adapter (mocked Anthropic responses) so the suite runs without a live API key, mirroring how GitHub sync was tested against mocks;
- symbolic environment documentation for the one new secret this phase introduces.

It excludes:

- verbatim migration of Notion-authored agent instructions (deferred — needs Notion MCP access);
- Day One diary email delivery (Phase 5);
- multi-record or retroactive-edit tool calls (e.g., "log yesterday's three meals at once", editing a previously written record) — first version is single-record, same-day, forward-only;
- voice input, image/photo logging, or Marley Spoon/recipe lookups;
- production credentials and production promotion (Phase 6).

## Deferred: persona fidelity

`config/agents.yml` gives each agent a name, domain, tab, colour, and trigger words, but not the full instruction text that lives in Adam's Notion pages (tone, specific protocols like the Vyvanse-timing nutrition strategy, sprint protocols, etc.). For this phase, each persona's system prompt is assembled from:

- the agent's identity fields in `agents.yml`;
- the relevant `Constraints & Priorities` subsection of `central-node.md` (e.g. Brisket receives the Dietary and Iron Absorption Rules sections, Chadwick receives none of the medical detail unless it is training-relevant);
- the domain's `config/targets.yml` values.

This produces agents that are accurate on hard rules (calorie/protein/fat targets, banned foods, medical flags) but generic in voice compared to the Notion originals. Once Notion access is available, a follow-up phase can migrate the full instruction text without changing the routing, tool, or write mechanics built here.

## Deployment and runtime

The model is `claude-sonnet-5` (pinned by exact ID, not an auto-resolving alias, matching the precision the rest of this codebase applies to pinned dependencies such as `js-yaml`). Requests use the streaming Messages API with `tools: [log_entry]`.

One new authenticated route, following the existing function-module pattern (`_shared/http.mjs` request/response contract, session validation via `_shared/auth-security.mjs`):

- `POST /api/chat` accepts `{ message, conversationId }`, validates the session, resolves routing, streams `text/event-stream` chunks of assistant text and tool-call events back to the browser.
- `POST /api/chat/confirm` accepts `{ conversationId, record }` (the Adam-approved, possibly edited, tool-call payload), re-validates it against the domain schema server-side (never trusts client-held state alone), and performs the GitHub write.

Both routes reuse `github-client.mjs`, extended with a `writeFile({ path, content, sha, message })` method that calls `PUT /repos/{owner}/{repo}/contents/{path}`. The client passes the current blob `sha` when overwriting and omits it when creating, so GitHub itself rejects a stale-write race; a 409 maps to the existing collision-prompt UI path.

Conversation state is held server-side only for the duration of one streamed exchange (no chat history is persisted to GitHub or a database in this phase); the browser keeps the visible transcript in memory for the tab's session, matching the existing "no offline writes" posture.

## Agent routing

Routing is deterministic, not model-chosen, for the first message of a conversation: the router lower-cases the incoming message and checks it against every agent's `name_triggers` plus its `domain`/`tab` name. First match wins; ties break by list order in `agents.yml`. No match selects the general router persona, whose system prompt lists all seven agents and their domains and instructs Claude to ask a brief clarifying question or infer domain from content (e.g., "logged a 30 min workout" implies Chadwick) rather than guessing silently for anything touching the write tool.

Once a persona is selected for a conversation, it stays selected for that conversation; a new chat session re-runs routing.

## The `log_entry` tool and schema validation

One tool, `log_entry`, with a discriminated schema keyed by `domain` (`nutrition | fitness | mind | body | skincare`), mirroring the fields already parsed by `js/core/records.js` and validated by `js/core/validate.js` for each domain's Markdown frontmatter. The tool's JSON Schema is generated from the same field definitions those modules already encode, so the write path and the read path can never silently diverge on what a valid record looks like.

Server-side, every tool call is re-validated against this schema before it reaches the confirmation UI (the model's output is untrusted input, identical in posture to a network response) and again immediately before the GitHub write (defense against a client that skips the confirm step or replays a stale payload).

## Recent-history digest

Before the first model call in a conversation, the server requests the same 7-day manifest range the existing `sync-repository.js`/`repo-manifest.mjs` path already produces, summarizes it into a compact text block (today's logged domains, streaks, most recent values per domain), and includes it in the system prompt. This reuses existing modules; it does not introduce a second data-access path.

## Failure behavior

- Anthropic API failure (network, rate limit, 5xx): the stream ends with a generic error bubble and a retry action; no partial tool call is treated as confirmed.
- Schema validation failure on a model tool call: the assistant is told the validation error and asked to correct the record before it is ever shown to Adam as a confirmable card (the invalid draft is never rendered as if it were ready to save).
- GitHub write failure after confirmation: the confirmed record stays visible with its original values and a retry button; Adam is never asked to redescribe it to the model.
- Collision (path already exists with a different `sha` than expected): Adam is prompted to overwrite or choose a new slug; no silent overwrite.
- Session expiry mid-conversation: the chat shows the same sign-in gate as the rest of the app; the in-memory transcript for that tab is lost, matching existing no-offline-writes behavior.

## Interface changes

- New "Chat" route in the existing shell (already present as an inert nav item) becomes live.
- Streaming assistant message bubbles with the active agent's name/colour badge from `agents.yml`.
- A record-preview card component: shows the proposed domain, date, and fields in human-readable form with Confirm/Edit/Discard actions; editing opens inline fields matching the domain schema rather than free text, so re-submission cannot produce an invalid record.
- Visible states: `connecting`, `streaming`, `awaiting-confirmation`, `writing`, `retry`, `signed-out`.
- Existing 44px touch target and 390px no-overflow requirements apply to the new view.

## Environment contract

One new variable added to `.env.example` and Netlify:

- `ANTHROPIC_API_KEY`

Local development uses a mocked Anthropic adapter (fixture-backed streamed responses and tool calls) so `npm test` and local `npm run dev` never require a live key or make a network call, matching the existing pattern for GitHub sync. A live key is only needed for manual end-to-end verification against the real Anthropic API, which Adam runs locally with his own key in a gitignored `.env.local`; it is never committed or transmitted anywhere outside that local process and Anthropic's API.

## Verification

Unit tests cover: trigger-based routing including tie-breaking and no-match fallback; system-prompt assembly from `agents.yml`/`central-node.md`/`targets.yml`; the `log_entry` schema per domain, including boundary and invalid-value rejection; digest summarization from manifest fixtures; and `writeFile` request shaping (create vs. update, `sha` precondition, 409 mapping).

Integration tests invoke the chat and confirm function handlers with a mocked Anthropic client and mocked GitHub responses, covering: full happy-path (route → stream → tool call → confirm → write → refresh signal), schema-invalid tool call correction, GitHub write failure and retry, write collision, and session expiry mid-conversation. Tests never call a live Anthropic or GitHub endpoint.

Browser acceptance covers: sending a message and seeing a routed, badged response; confirming a proposed record and seeing the domain view refresh; editing a proposed record before confirming; and the signed-out redirect when a session expires mid-chat.

## Definition of done

Phase 4 is complete when an authenticated browser can hold a routed conversation, receive a schema-validated record proposal, confirm and persist it as a canonical Markdown file in the private repository, and recover cleanly from model, validation, write, and session failures — with no offline or unconfirmed writes possible. All unit, integration, browser, fixture, dependency, and secret checks pass, matching the bar set by Phases 1-3.

## References

- [Anthropic Messages API — streaming](https://docs.anthropic.com/en/api/messages-streaming)
- [Anthropic Messages API — tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [GitHub Contents API — create or update file](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)

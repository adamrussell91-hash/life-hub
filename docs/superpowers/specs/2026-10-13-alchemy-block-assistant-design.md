# Alchemy Lab: Anne’s block teaching assistant

Design for review, 13 October 2026. Product code has not been changed.

## Intent and agreed requirements

Support lesson and unit blocks with contextual teaching improvements informed by Knowledge Hub. Show Anne’s face and a small beaker in her existing character colour at the bottom right of each block in teacher editing surfaces, including nested blocks. Keep these controls out of student and print views.

Clicking the control requests an analysis of the selected block, its lesson where applicable, and its unit where linked. Anne searches Knowledge Hub for relevant evidence and proposes improvements to scaffolding, outcomes alignment, sequencing, clarity, or learning needs. Use existing Anne identity assets and teaching voice; the legacy Clementine connection prompt is not the new teaching assistant prompt.

A subtle suggestion badge appears beside Anne when a useful passive suggestion is available. Opening it shows a block-specific conversation, rationale, source links, and proposed content. The teacher can ask to keep, change, or exclude parts before explicitly accepting. Applying a proposal changes only its target block through the existing save path and supports undo. Never silently edit content.

Passive checks operate only while the app is open. Eligible lessons are currently being edited or scheduled within the next three days; unit checks are eligible while the unit is being edited. Only changed content may cause a new passive AI request. Batch changed blocks rather than making a request per block. Cache unit and lesson context rather than repeatedly scanning whole documents.

## Proposed implementation defaults

These numeric defaults and lifecycle rules are builder recommendations, not values already specified by the teacher.

### Activity, changes, and caching

- Start passive work only from a visible, authenticated app session. Pause new work when the document is hidden, offline, signed out, or closed. No scheduled server job, service-worker background run, or closed-app scan.
- Editing eligibility expires after five minutes without editor interaction. For due-soon lessons, process saved revisions through a bounded queue while the app is visible. Do not fetch or scan every lesson on every timer tick.
- Evaluate the next three days using the teacher’s configured timezone (Australia/Sydney here) and existing lesson schedule data.
- Use canonical content fingerprints covering block content, meaningful lesson/unit context and learning outcomes. Ignore selection, toolbar state, layout-only movement, and other irrelevant changes. Nested blocks retain stable identities.
- Cache compact context by entity ID, fingerprint and prompt/schema version. Reuse unchanged unit context; refresh when meaningful unit content changes. Retain full source content separately so a summary cannot become the only source of truth.
- During editing, wait for 30 seconds of quiet and allow at most one passive attempt every three minutes globally per teacher. Track revisions rather than letting a timer itself trigger AI.
- Initial passive assessment of an eligible saved revision is allowed once; reopening an already assessed revision is not another change. Cache both useful suggestions and successful no-suggestion results. A timed-out revision remains dirty, subject to failure cooldown and the same attempt budget.
- Include lesson and unit fingerprints in proposal provenance. Invalidate or label stale proposals when the target or relevant context changes. Never apply a stale replacement over newer edits.
- Dismissal suppresses that suggestion for the same revision. Accepted edits receive suppression to prevent an immediate suggestion loop; subsequent teacher edits can requalify the block.
- A manual click bypasses passive scheduling delays, uses the latest content snapshot, and reuses valid cached evidence. A deliberate refresh is allowed within manual limits.

### Request and cost control

- Server authority is mandatory: enforce authenticated ownership, entity access, budgets, idempotency and concurrency on the server. Browser counters alone are insufficient.
- Proposed passive caps: six provider attempts per rolling hour and 24 per local day per teacher, shared across lessons, units, tabs, devices and all passive context-preparation calls. Count attempts before provider dispatch, including failed or timed-out attempts. Passive work stops at either cap.
- Limit passive AI input to 8,000 tokens and output to 1,200 tokens per attempt. Bound prompts before dispatch with a safe tokenizer or conservative upper-bound calculation; do not rely on average characters-per-token. Reserve the maximum allocation atomically, record actual provider usage, and keep the full reservation when usage is unknown. Proposed daily token ceilings are 192,000 input and 28,800 output tokens. Request caps are not a dollar-cost promise.
- Make the passive model configurable and choose an available low-cost model at implementation, verifying structured-output support and current pricing. No silent escalation to a more expensive model. Anne’s voice is independent of model selection.
- Cached context preparation must either be deterministic or share the same passive budget. Knowledge retrieval should use a cached, bounded index and a capped candidate set; retrieve up to six short source excerpts per batch, filtered for deleted records and current access. Avoid an AI call for query generation and avoid rereading the entire Knowledge Hub on every request.
- Batch at most four changed blocks, with the latest revision replacing older queued work. Bound the queue and prioritise the open editor before due-soon lessons. Larger workloads continue on later eligible slots, not concurrent calls or an unbounded request.
- One in-flight Alchemy provider operation per teacher. Manual work takes priority over queued passive work; do not overlap an already dispatched request. Use server-side durable atomic reservations/leases with expiry, not a process-local lock or non-atomic read/write counter. If safe coordination cannot be established, fail closed for passive work.
- Request identity includes teacher, entity, target block revisions, context revisions, operation kind, and prompt version. Duplicate tabs and retried HTTP requests must share the existing attempt/result. Share scheduling leadership between tabs where possible; server enforcement remains authoritative.
- Manual requests and chat have a separate proposed ceiling of ten attempts per rolling ten minutes and 100 per day, plus bounded input/output and provider-wide limits. They do not consume the passive allowance. Budget exhaustion leaves ordinary editing available and gives a clear explanation for manual requests.
- Respect configured provider-wide request/token/spend limits and reserve headroom for interactive work. Verify account limits at implementation; do not infer the account’s tier from published examples.

### Timeouts and failures

The inspected legacy endpoint declares a 26-second function timeout but has no explicit AbortSignal on either upstream HTTP path. Do not reuse it unchanged for passive work.

- Use one total server deadline of 20 seconds for a passive attempt, including access checks, retrieval, provider response and persistence; allocate a shorter remaining deadline to upstream fetches and reserve time to return a response. Browser timeout may be 23 seconds. Verify the effective deployment limit before shipping; shorten these values if necessary.
- Propagate cancellation/deadlines through every network hop, and bound response size, JSON parsing and output validation. Browser cancellation alone does not guarantee that the provider stops processing or billing; every dispatched attempt still counts.
- No automatic provider retries within a passive attempt. On 429, honour Retry-After and applicable reset headers; on timeout or transient 5xx, use a cooldown of at least five minutes with exponential backoff and jitter, capped at one hour. Retry only on a later eligible visible-app slot, within budgets. A late success may be cached for its original revision but must not overwrite newer content.
- After three consecutive transient failures, suspend passive checks for 30 minutes. Configuration/authentication/spend-limit failures suspend until the condition is resolved; avoid repeated calls while a known permanent condition persists.
- Preserve distinctions between rate limit, timeout, upstream failure, validation failure and unconfigured service. Passive failures do not create badges or repeated toasts. Manual failures show a useful retry/cooldown message and preserve the conversation and last proposal.
- Never mark blocks as assessed after a failure or silently substitute fabricated teaching suggestions. Retrieval-only evidence may be displayed as related sources, clearly distinguished from a teaching edit proposal.

Provider reference: https://platform.claude.com/docs/en/api/rate-limits describes separate request, input-token and output-token limits and Retry-After handling. Actual account limits require configuration verification.

## Conversation and edit integrity

Reuse existing lesson/unit editor and assistant surfaces where practical. A block control opens a focused Alchemy conversation with an accessible name such as “Ask Anne about this block”. Use a subtle persistent badge rather than continuous animation; respect reduced motion. Keep accept, discard and chat controls usable on mobile.

Treat Knowledge content as evidence, never executable instructions. Cite the specific Knowledge sources supporting suggestions. Exclude deleted records using repository liveness helpers, and recheck access before exposing content. Do not invent student needs absent from the available lesson/unit context.

Proposals contain stable block identity, original content/context fingerprints and a validated replacement or bounded patch conforming to the block schema. Maintain a block-focused conversation when refining a proposal. Before acceptance, compare current fingerprints and reject stale applications with an option to regenerate. Preserve unrelated blocks, nesting, media references, IDs and metadata. Use the existing persistence and undo mechanisms; handle save failure without claiming the change was saved.

## Scope and integration

Extend the existing Teaching Alchemy client/panel and authenticated API infrastructure, reusing the Knowledge retrieval foundation where suitable. The existing lab currently returns cross-domain connection cards, uses a Clementine prompt, and does not implement this design’s passive budgets or editable block proposals. Preserve existing connection behaviour where still exposed; do not pretend those cards are teaching-edit proposals.

First implementation must verify current main, editor entry points for lessons/units and nested blocks, Anne’s assets/prompts, storage atomicity, actual deployment limits, provider configuration and existing AI limits. Respect root AGENTS.md, relevant design-kit/hub instructions and the UI failure register. Use an isolated checkout for implementation; the inspected checkout belongs to another completed task.

## Required verification before claiming completion

- Fake-clock tests: unchanged content and repeated reopen produce no additional AI attempts; dirty-block batching, three-minute spacing, idle/hidden/offline/closed-app suspension, eligibility and timezone boundaries.
- Concurrent request tests: multiple tabs/devices cannot exceed budgets or produce duplicate provider attempts; count failed attempts, context preparation, expired leases and unknown usage conservatively. Manual traffic cannot bypass provider-wide limits.
- Deadline tests: hanging retrieval/provider calls abort within the total deadline; late results remain tied to their revisions; 429 Retry-After, failure backoff, permanent suspension and circuit-breaker rules prevent retry storms.
- Boundary tests: token/payload/batch caps are enforced before dispatch; no source candidates means no unnecessary synthesis; deleted/inaccessible records never reach prompts or UI.
- Edit tests: nested-block targeting, chat refinement, schema validation, stale rejection, undo and persistence failure preserve unrelated content.
- Browser verification on lessons and units: manual request, passive badge, source link, chat refinement and acceptance, including mobile 390px docked actions and reduced-motion behaviour.
- Teaching tests/build and the mandatory root pre-PR gate must pass before any PR. Report measured call counts and timeout behaviour; do not claim savings without evidence.

## Explicit non-goals

Closed-app scanning, autonomous accepted edits, per-keystroke inference, one provider request per block, unlimited retries, silent model upgrades, or recurring automation for this chat.

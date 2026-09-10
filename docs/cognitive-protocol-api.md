# Cognitive protocol API

Contract v1. All paths require the existing umbrella session cookie and origin guard. Requests use `credentials: 'include'`. The server owns protocol, stages, evidence and transcript. The single-user umbrella identity is stable across cookie rotation; sessions are isolated by configured site owner identity, never by cookie text.

## Transport

`GET /api/knowledge/protocols` → `{ok:true,data:{catalog:ProtocolDefinition[]}}`.

`GET /api/knowledge/protocols?sessionId=<uuid>` → `{ok:true,data:{session:Session}}`.

`GET /api/knowledge/protocols?list=1` → `{ok:true,data:{sessions:Session[]}}` (most recent 50).

`POST /api/knowledge/protocols` JSON `{protocolId,mode,intake,requestId}` creates a session (202). `intake` maps catalog field IDs to strings. `requestId` is a client-generated UUID, retained across transport retries.

`POST /api/knowledge/protocols` JSON `{sessionId,revision,requestId,action,text?}` applies an action (202 or 200). The client supplies the latest revision. On 409 fetch the current snapshot before submitting a new action. Identical request IDs and payloads replay safely; reuse for a different payload is rejected.

`POST /api/knowledge/protocols/run` is the authenticated server background runner; UI must not invoke it. A run processes stages until a user checkpoint, pause, completion or visible failure. Poll the session every 1500 ms while queued/running. Back off after request failures; stop polling on disposal and terminal/checkpoint states.

Errors use `{ok:false,error:{code,message,retryable}}`. 400 validation; 401 authentication; 403 origin; 404 session missing or another owner; 409 conflict/action not allowed; 413 limit; 503 unavailable. Read-only catalog remains available when provider/storage is unconfigured.

## Public types

```ts
type ProtocolId = 'fates'|'horizon'|'refinery'|'cartographers'|'mirror'|'consilium'|'witness'|'tribunal';
type Field = {id:string;label:string;required:boolean;placeholder?:string;type:'text'|'textarea'|'select';options?:{value:string;label:string}[]};
type ProtocolDefinition = {id:ProtocolId;name:string;description:string;motif:string;defaultMode:string;modes:{id:string;label:string;description:string}[];intake:Field[];voices:{id:string;name:string;role:string}[]};
type Action = 'answer'|'confirm'|'decline'|'correct'|'uncertain'|'finish'|'reflect'|'pause'|'resume'|'cancel'|'retry';
type Turn = {id:string;role:'voice'|'user'|'controller';speaker:string;stage:string;text:string;createdAt:string;evidenceIds:string[]};
type Evidence = {id:string;kind:'knowledge'|'self-report';title:string;text:string;url?:string};
type Session = {id:string;protocolId:ProtocolId;mode:string;intake:Record<string,string>;revision:number;status:'queued'|'running'|'waiting'|'paused'|'completed'|'cancelled'|'failed';stage:string;speaker:string|null;transcript:Turn[];evidence:Evidence[];evidenceStatus:string;checkpoint:null|{kind:string;question:string};allowedActions:Action[];error:null|{code:string;message:string;retryable:boolean};createdAt:string;updatedAt:string};
```

Render `allowedActions` as authoritative. `answer`, `correct` and `reflect` require nonblank text. `confirm`, `uncertain` and `decline` are explicit user decisions. Confirmation cannot be replaced by model output. `finish` appears only when Consilium has adequate contributions and user responses; it requests the convergence map, whose reflection closes without further analysis. `correct` revises Witness' trace or restarts Mirror/framing from the correction. `pause` and `cancel` may stop a running call from publishing. `resume` restores the previous checkpoint when one existed. `retry` resumes a failed/interrupted stage without repeating committed turns. A provider call interrupted before commit may be reissued; exactly-once billing cannot be guaranteed.

No automatic archive writes. Protocols read a bounded set of matching archive-note summaries for grounding; the session itself stays separate from notes until a reviewed save flow is added.

## Modes and fields

Catalog is the source of truth. Fates: sprint/normal/long. Horizon: full/brief. Refinery: full/build/break/reforge/build-break/break-reforge (raw/draft supplied via inputType). Cartographers: full/focused/direct/interrogation (interrogation is the optional nine-pass supplied-paper flow). Mirror: quick/deep, with timescale weekly/long-arc. Consilium: standard/extended (turn count calibration, same short turn limits). Witness: standard/deep. Tribunal: quick/standard/deep. Optional supplied `sources` text is labelled self-report; a URL alone is not source content.

## Deployment and limitations

Uses the existing Anthropic server provider conventions and `ANTHROPIC_API_KEY`. R2 must be bound through `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Sessions live under a dedicated `cognitive-protocols/v1/` prefix with S3 conditional writes, separate from note/attachment objects. Before an R2 write, the whole session is AES-256-GCM encrypted using a key derived from the existing server-only `SESSION_SECRET`; the bucket cannot expose a readable transcript. No migration. Netlify Blobs 9.x lacks conditional set and is deliberately not used for concurrency. Configure `COGNITIVE_OWNER_ID` for a stable owner namespace (default single operator); authentication must remain single-user until a proper per-user identity is added. Existing Knowledge GitHub configuration is needed for evidence retrieval. No web tool is offered: unavailable web access and thin note evidence are explicitly labelled.

Limits: each intake/text value 12000 characters, request 64000 bytes, session 1000000 bytes, transcript 500 turns, at most 50 sessions listed. Provider output limits are stricter for brief voices. Stale queued/running work becomes retryable after the runner lease expires. Background invocations must reach the same API host.

## Manual live voice evaluation

Use synthetic inputs only. Verify model configuration and R2 binding before starting; do not deploy as part of local verification.

1. Fates, design a library event, sprint then normal: count 3 versus 12 alternating stops, 2 versus 4 question micro-turns per stop, each waits, preamble confirmed, no Weave before closure. Strip labels: Clotho's fragments/Greek sparks, Atropos' surgical qualification, Lachesis' numbered precision and Weave's balanced witnessing must differ.
2. Horizon, career trajectory without desired future: Alvar explicitly projects with moderate-to-low ceiling; Ketill stays within two years, Sigrid asks trade-off/drift/unclassified. No plan.
3. Refinery, unsupported thesis and an existing draft: Builder exposes Toulmin, Breaker names structural weak point without rebuilding, Reforger accounts for every weakness and never silently replaces thesis. Compare partial runs.
4. Cartographers, two synthetic supplied papers with opposing claims: direct mode does no search/Surveyor; every quotation is present in supplied evidence. Full/focused and nine-pass interrogation differ in their documented way.
5. Mirror, one observed choice and no stated aspiration: no inflated behavioural trend or invented aspiration. Deep framing waits. Long-arc Present asks what to tolerate/protect in seven days. Correction restarts from corrected framing.
6. Consilium, a competing-duty dilemma: framing waits, Virtue never first, adaptive order, 2–4 sentences per voice, signature opening only once, questions stop. All voices and user contribute before map. Reflection is final and unanalysed; no verdict.
7. Witness, a deliberate decision: trace is hypothetical self-report, correction reruns trace and waits, uncertainty lowers confidence, sound thinking is null hypothesis. Distress pauses. No pattern stage before explicit verification.
8. Tribunal, a repeated scheduling conflict: independently generated prompts see identical original input/evidence and no other voice; scaling tries down/up; convergence note never ranks. Try a null reframe.

Deterministic tests establish transitions, isolation, validation, per-voice calls and fault handling. They do not establish live voice fidelity, factual reasoning quality or clinical validity. Record actual provider samples and human judgements separately before claiming voice fidelity.
